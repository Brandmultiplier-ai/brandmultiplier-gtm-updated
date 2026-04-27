import type { Lead } from "./types";
import * as store from "./store";
import { getLinkedInCompanyProfile, getProfile, type UnipileClientOptions } from "./unipile";

type UnknownRecord = Record<string, unknown>;

export interface LeadCompanySnapshot {
  companyName: string;
  companySize: string;
  industry: string;
  companyDescription: string;
  companyLinkedInUrl: string;
}

const PROFILE_ENRICHMENT_SUCCESS_TTL_MS = 1000 * 60 * 60 * 6;
const PROFILE_ENRICHMENT_FAILURE_TTL_MS = 1000 * 60 * 60;
const profileEnrichmentCache = new Map<string, { expiresAt: number; snapshot: Partial<LeadCompanySnapshot> }>();
const COMPANY_ENRICHMENT_SUCCESS_TTL_MS = 1000 * 60 * 60 * 24;
const COMPANY_ENRICHMENT_FAILURE_TTL_MS = 1000 * 60 * 60 * 6;
const companyEnrichmentCache = new Map<string, { expiresAt: number; snapshot: Partial<LeadCompanySnapshot> }>();

const INDEPENDENT_KEYWORDS = [
  "freelance",
  "freelancer",
  "consultant",
  "solopreneur",
  "self-employed",
  "independent",
  "fractional",
];

const GENERIC_COMPANY_TERMS = new Set([
  "ai",
  "seo",
  "growth",
  "growth. seo.",
  "marketing",
  "content",
  "branding",
  "media",
  "communication",
  "communications",
  "company",
  "creative",
  "analytics",
  "copywriter",
  "lead generation",
  "paid media",
  "performance marketing",
  "strategic marketing management",
]);

const COMPANY_SUFFIXES = [
  "agency",
  "studio",
  "labs",
  "group",
  "media",
  "academy",
  "solutions",
  "solution",
  "srl",
  "spa",
  "ltd",
  "llc",
  "inc",
  "corp",
  "university",
  "school",
  "collective",
  "ventures",
  "capital",
];

const ROLE_NOISE_KEYWORDS = [
  "marketing",
  "sales",
  "growth",
  "seo",
  "communication",
  "communications",
  "creative",
  "copywriter",
  "analytics",
  "consultant",
  "freelance",
  "freelancer",
  "designer",
  "editor",
  "manager",
  "director",
  "strategist",
  "specialist",
  "ambassador",
  "projects",
  "team",
  "experience",
  "exp",
];

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" ? (value as UnknownRecord) : null;
}

function asRecordArray(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter((item): item is UnknownRecord => Boolean(item));
}

function cleanString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const cleaned = cleanString(value);
    if (cleaned) return cleaned;
  }
  return "";
}

function firstStringFromArray(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return firstString(...value);
}

function formatCompanySize(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value} employees`;
  }

  const text = cleanString(value);
  if (!text) return "";
  if (/^\d+$/.test(text)) return `${text} employees`;
  return text;
}

function firstValue(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null && cleanString(value) !== "") {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return "";
}

function stripHeadlineNoise(value: string): string {
  return value
    .replace(/[✓✔✨🚀🎯🤝💥☁️📈]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompanyCandidate(candidate: string): string {
  return stripHeadlineNoise(candidate)
    .replace(/^[@\-–—•·\s]+/, "")
    .replace(/[@\-–—•·\s]+$/, "")
    .trim();
}

function looksLikeCompanyName(candidate: string): boolean {
  const normalized = normalizeCompanyCandidate(candidate);
  if (!normalized) return false;
  if (normalized.length < 2) return false;
  if (normalized.length > 60) return false;
  if (/^[(/]/.test(normalized)) return false;
  if (/[|]/.test(normalized)) return false;

  const lowered = normalized.toLowerCase();
  if (GENERIC_COMPANY_TERMS.has(lowered)) return false;
  if (/^(head|director|manager|lead|specialist|strategist|consultant|freelance|freelancer)\b/i.test(normalized)) return false;
  if (/(marketing|seo|growth|content|communication|communications|lead generation)$/i.test(normalized) && !/[.@]/.test(normalized)) {
    return false;
  }
  const hasDomain = /\b[\w.-]+\.(com|io|ai|co|net|org|app|dev)\b/i.test(normalized);
  const hasCompanySuffix = COMPANY_SUFFIXES.some((suffix) => lowered.includes(suffix));
  const noiseHits = ROLE_NOISE_KEYWORDS.filter((keyword) => lowered.includes(keyword)).length;
  const words = normalized.split(/\s+/).filter(Boolean);
  const contentWords = words.filter((word) => !["&", "and", "the", "e", "di", "de", "of", "for"].includes(word.toLowerCase()));
  const titleCaseHits = contentWords.filter((word) => /^[A-ZÀ-ÖØ-Þ]/.test(word)).length;

  if (hasDomain) return true;
  if (hasCompanySuffix && titleCaseHits >= 1) return true;
  if (noiseHits >= 2 && !hasCompanySuffix) return false;

  if (contentWords.length === 1) {
    return /^[A-ZÀ-ÖØ-Þ]/.test(contentWords[0]) && noiseHits === 0;
  }

  return titleCaseHits >= Math.ceil(contentWords.length / 2) && noiseHits === 0;
}

function findCompanyByAtSymbol(headline: string): string {
  const match = stripHeadlineNoise(headline).match(/@+\s*([^|,;()[\]]+)/i);
  const candidate = normalizeCompanyCandidate(match?.[1] || "");
  return looksLikeCompanyName(candidate) ? candidate : "";
}

function findCompanyByRoleContext(headline: string): string {
  const patterns = [
    /\b(?:at)\s+([^|,;()[\]]+)/i,
    /\b(?:founder|co-founder|owner|ceo|cto|cmo|advisor|consultant|director|head)\s+(?:at|of)\s+([^|,;()[\]]+)/i,
    /\b(?:founder|co-founder|owner)\b(?:\s*&\s*[a-z ]+)?\s+([^|,;()[\]]+)/i,
  ];

  for (const pattern of patterns) {
    const match = stripHeadlineNoise(headline).match(pattern);
    const candidate = normalizeCompanyCandidate(match?.[1] || "");
    if (looksLikeCompanyName(candidate)) return candidate;
  }

  return "";
}

function findTrailingCompanySegment(headline: string): string {
  const segments = stripHeadlineNoise(headline).split("|").map((segment) => segment.trim()).filter(Boolean);
  const trailingSegments = segments.flatMap((segment) => {
    const split = segment.split(/\s[·•\-–—]\s/).map((item) => item.trim()).filter(Boolean);
    return split.length > 1 ? split.slice(1) : [];
  });

  for (const segment of trailingSegments) {
    const candidate = normalizeCompanyCandidate(segment);
    if (looksLikeCompanyName(candidate)) return candidate;
  }

  return "";
}

export function headlineSuggestsIndependent(headline: string): boolean {
  const lowered = stripHeadlineNoise(headline).toLowerCase();
  return INDEPENDENT_KEYWORDS.some((keyword) => lowered.includes(keyword));
}

export function inferCompanyFromHeadline(headline: string): string {
  return (
    findCompanyByAtSymbol(headline)
    || findCompanyByRoleContext(headline)
    || findTrailingCompanySegment(headline)
  );
}

export function inferLeadCompanyName(lead: Pick<Lead, "company" | "headline">): string {
  const explicit = normalizeCompanyCandidate(cleanString(lead.company));
  if (looksLikeCompanyName(explicit)) return explicit;

  const inferred = inferCompanyFromHeadline(lead.headline);
  if (inferred) return inferred;

  if (headlineSuggestsIndependent(lead.headline)) return "Independent";
  return "";
}

function currentExperience(profile: UnknownRecord): UnknownRecord | null {
  const directCollections = [
    "work_experience",
    "experiences",
    "experience",
    "positions",
    "member_experience_collection",
    "professional_experience",
  ] as const;

  for (const key of directCollections) {
    const items = asRecordArray(profile[key]);
    if (items.length > 0) {
      const current = items.find((item) => {
        const end = cleanString(item.end ?? item.end_date ?? item.endDate);
        return !end || end.toLowerCase() === "present";
      });
      return current || items[0];
    }
  }

  const nestedCollections = [
    asRecord(profile.position),
    asRecord(profile.current_position),
    asRecord(profile.current_company),
    asRecord(profile.company),
  ].filter((item): item is UnknownRecord => Boolean(item));

  return nestedCollections[0] || null;
}

function currentExperienceCompanyIdentifier(experience: UnknownRecord | null): string {
  if (!experience) return "";
  return firstString(
    experience.company_id,
    experience.companyId,
    experience.organization_id,
    experience.organizationId,
  );
}

function collectCompanyCandidates(profile: UnknownRecord, experience: UnknownRecord | null) {
  return [
    asRecord(profile.company),
    asRecord(profile.current_company),
    asRecord(profile.organization),
    asRecord(profile.currentCompany),
    asRecord(profile.currentOrganization),
    asRecord(experience?.company),
    asRecord(experience?.organization),
  ].filter((item): item is UnknownRecord => Boolean(item));
}

function parseProfileCompany(profile: unknown, headline: string): Partial<LeadCompanySnapshot> {
  const record = asRecord(profile);
  if (!record) return {};

  const experience = currentExperience(record);
  const companyCandidates = collectCompanyCandidates(record, experience);

  const companyName = inferLeadCompanyName({
    company: firstString(
      ...companyCandidates.flatMap((company) => [
        company.name,
        company.company_name,
        company.localized_name,
      ]),
      experience?.company_name,
      experience?.companyName,
      record.company_name,
      record.current_company_name,
    ),
    headline: firstString(record.headline, headline),
  });

  const companySize = formatCompanySize(
    firstValue(
      ...companyCandidates.flatMap((company) => [
        company.employee_count,
        company.employees,
        company.company_size,
        company.staff_count,
      ]),
      experience?.employee_count,
      record.employee_count,
      record.company_size,
    )
  );

  const industry = firstString(
    ...companyCandidates.flatMap((company) => [
      company.industry,
      company.localized_industry_name,
      company.industry_name,
    ]),
    firstStringFromArray(experience?.industry),
    experience?.industry,
    firstStringFromArray(record.industry),
    record.industry,
  );

  const companyDescription = firstString(
    ...companyCandidates.flatMap((company) => [
      company.description,
      company.summary,
      company.tagline,
    ]),
    experience?.description,
    record.summary,
    record.biography,
    record.description,
  );

  const companyLinkedInUrl = firstString(
    ...companyCandidates.flatMap((company) => [
      company.profile_url,
      company.linkedin_url,
      company.public_url,
      company.url,
    ]),
    experience?.company_url,
    experience?.profile_url,
    record.company_url,
  );

  return {
    companyName,
    companySize,
    industry,
    companyDescription,
    companyLinkedInUrl,
  };
}

function parseCompanyProfile(profile: unknown): Partial<LeadCompanySnapshot> {
  const record = asRecord(profile);
  if (!record) return {};

  return {
    companyName: firstString(
      record.name,
      record.company_name,
      record.localized_name,
    ),
    companySize: formatCompanySize(
      firstValue(
        record.employee_count,
        record.employees,
        record.company_size,
        record.staff_count,
      )
    ),
    industry: firstString(
      firstStringFromArray(record.industry),
      record.industry_name,
      record.localized_industry_name,
      record.industry,
    ),
    companyDescription: firstString(
      record.description,
      record.summary,
      record.tagline,
      record.biography,
    ),
    companyLinkedInUrl: firstString(
      record.profile_url,
      record.linkedin_url,
      record.public_url,
      record.url,
    ),
  };
}

function compactCompanySnapshot(snapshot: Partial<LeadCompanySnapshot>): Partial<LeadCompanySnapshot> {
  const next: Partial<LeadCompanySnapshot> = {};
  if (cleanString(snapshot.companyName)) next.companyName = cleanString(snapshot.companyName);
  if (cleanString(snapshot.companySize)) next.companySize = cleanString(snapshot.companySize);
  if (cleanString(snapshot.industry)) next.industry = cleanString(snapshot.industry);
  if (cleanString(snapshot.companyDescription)) next.companyDescription = cleanString(snapshot.companyDescription);
  if (cleanString(snapshot.companyLinkedInUrl)) next.companyLinkedInUrl = cleanString(snapshot.companyLinkedInUrl);
  return next;
}

function isProviderThrottle(payload: unknown) {
  const record = asRecord(payload);
  if (!record) return false;
  const status = Number(record.status);
  const type = cleanString(record.type).toLowerCase();
  const title = cleanString(record.title).toLowerCase();
  const detail = cleanString(record.detail).toLowerCase();
  return status === 429
    || type.includes("too_many_requests")
    || title.includes("too many requests")
    || detail.includes("provider cannot accept any more requests");
}

async function loadProfileCompanySnapshot(
  lead: Lead,
  client?: UnipileClientOptions,
): Promise<Partial<LeadCompanySnapshot>> {
  const cacheKey = `${lead.providerId}:${lead.updatedAt}`;
  const cached = profileEnrichmentCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.snapshot;
  }

  try {
    const profile = await getProfile(lead.providerId, client, { linkedinSections: "*" });
    if (isProviderThrottle(profile)) {
      profileEnrichmentCache.set(cacheKey, {
        expiresAt: Date.now() + PROFILE_ENRICHMENT_FAILURE_TTL_MS,
        snapshot: {},
      });
      return {};
    }

    const record = asRecord(profile);
    const experience = record ? currentExperience(record) : null;
    const parsed = compactCompanySnapshot(parseProfileCompany(profile, lead.headline));
    const companyIdentifier = currentExperienceCompanyIdentifier(experience);
    const companySnapshot = companyIdentifier
      ? compactCompanySnapshot(await loadLinkedInCompanySnapshot(companyIdentifier, client))
      : {};
    const merged = {
      ...companySnapshot,
      ...parsed,
    };
    profileEnrichmentCache.set(cacheKey, {
      expiresAt: Date.now() + PROFILE_ENRICHMENT_SUCCESS_TTL_MS,
      snapshot: merged,
    });
    return merged;
  } catch {
    profileEnrichmentCache.set(cacheKey, {
      expiresAt: Date.now() + PROFILE_ENRICHMENT_FAILURE_TTL_MS,
      snapshot: {},
    });
    return {};
  }
}

async function loadLinkedInCompanySnapshot(
  identifier: string,
  client?: UnipileClientOptions,
): Promise<Partial<LeadCompanySnapshot>> {
  const normalizedIdentifier = cleanString(identifier);
  if (!normalizedIdentifier) return {};

  const cached = companyEnrichmentCache.get(normalizedIdentifier);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.snapshot;
  }

  try {
    const payload = await getLinkedInCompanyProfile(normalizedIdentifier, client);
    if (isProviderThrottle(payload)) {
      companyEnrichmentCache.set(normalizedIdentifier, {
        expiresAt: Date.now() + COMPANY_ENRICHMENT_FAILURE_TTL_MS,
        snapshot: {},
      });
      return {};
    }

    const parsed = parseCompanyProfile(payload);
    companyEnrichmentCache.set(normalizedIdentifier, {
      expiresAt: Date.now() + COMPANY_ENRICHMENT_SUCCESS_TTL_MS,
      snapshot: parsed,
    });
    return parsed;
  } catch {
    companyEnrichmentCache.set(normalizedIdentifier, {
      expiresAt: Date.now() + COMPANY_ENRICHMENT_FAILURE_TTL_MS,
      snapshot: {},
    });
    return {};
  }
}

export function getLeadCompanySnapshot(lead: Lead): LeadCompanySnapshot {
  return {
    companyName: inferLeadCompanyName(lead) || "Unknown",
    companySize: cleanString(lead.companySize),
    industry: cleanString(lead.industry),
    companyDescription: cleanString(lead.companyDescription),
    companyLinkedInUrl: cleanString(lead.companyLinkedInUrl),
  };
}

export async function ensureLeadCompanyData(
  lead: Lead,
  client?: UnipileClientOptions,
  options?: { persist?: boolean },
): Promise<Lead> {
  let nextLead = lead;
  let hasChanges = false;

  const inferredCompany = inferLeadCompanyName(lead);
  if (inferredCompany && inferredCompany !== cleanString(lead.company)) {
    nextLead = { ...nextLead, company: inferredCompany };
    hasChanges = true;
  }

  const hasResolvedCompany = Boolean(inferLeadCompanyName(nextLead));
  const needsProfileEnrichment = Boolean(
    lead.providerId && (
      !hasResolvedCompany
      || (!nextLead.companySize && !nextLead.industry && !nextLead.companyDescription && !nextLead.companyLinkedInUrl)
    )
  );

  if (needsProfileEnrichment && lead.providerId) {
    const parsed = await loadProfileCompanySnapshot(nextLead, client);
    const profileUpdates: Partial<Lead> = {};

    const parsedCompany = inferLeadCompanyName({
      company: parsed.companyName || "",
      headline: nextLead.headline,
    });

    if (parsedCompany && parsedCompany !== cleanString(nextLead.company)) profileUpdates.company = parsedCompany;
    if (parsed.companySize && !nextLead.companySize) profileUpdates.companySize = parsed.companySize;
    if (parsed.industry && !nextLead.industry) profileUpdates.industry = parsed.industry;
    if (parsed.companyDescription && !nextLead.companyDescription) profileUpdates.companyDescription = parsed.companyDescription;
    if (parsed.companyLinkedInUrl && !nextLead.companyLinkedInUrl) profileUpdates.companyLinkedInUrl = parsed.companyLinkedInUrl;

    if (Object.keys(profileUpdates).length > 0) {
      nextLead = { ...nextLead, ...profileUpdates };
      hasChanges = true;
    }
  }

  if (!hasChanges || options?.persist === false) return nextLead;
  return store.saveLead(nextLead);
}
