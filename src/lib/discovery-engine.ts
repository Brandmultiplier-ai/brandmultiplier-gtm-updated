/**
 * BrandMultiplier GTM — Discovery Engine
 *
 * Discovers leads from 3 signal sources via Unipile:
 * 1. keyword_search — LinkedIn people search by ICP keywords
 * 2. post_engagement — who comments/reacts on relevant posts
 * 3. recent_activity — who posts about ICP topics
 *
 * Each candidate gets heuristic ICP scoring, then saved as Lead with status "discovered".
 */

import {
  searchPeople, searchPosts, getPostComments, getPostReactions,
  getPostsByAuthor, getPostsByCompany, getProfileVisitors, linkedinRaw,
} from "./unipile";
import * as store from "./store";
import type { Agent, DiscoveryCandidate, DiscoveryRun, Lead, SignalCandidate, SignalSource } from "./types";
import { isNeverTargetProfile, normalizeLinkedInProfileRef } from "./profile-targeting";
import { getRoleTitleMatches, hasRoleTitleMatch } from "./role-filter";
import { buildSignalMetadata, getConfiguredTopics } from "./topic-signals";
import { buildLinkedInProfileUrl } from "./signal-source-url";

// ── Types ───────────────────────────────────────────────────────────────

export interface DiscoveryOptions {
  agentId: string;
  campaignId?: string;
  sources?: SignalSource[];
  maxPerSource?: number;
  dryRun?: boolean;
  onEvent?: (event: DiscoveryEvent) => void;
}

export interface DiscoveryEvent {
  type: "info" | "candidate" | "scored" | "saved" | "duplicate" | "error";
  message: string;
  candidate?: DiscoveryCandidate;
}

export interface DiscoveryResult {
  status: "completed" | "error";
  discovered: number;
  duplicates: number;
  saved: number;
  errors: number;
  candidates: DiscoveryCandidate[];
  run: DiscoveryRun;
}

// ── Helpers ─────────────────────────────────────────────────────────────

// Per-run warning collector — source functions push warnings here
let _runWarnings: string[] = [];

function warn(msg: string) {
  _runWarnings.push(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nanoid(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function normalizeKeywordText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textMentionsTrackedKeywords(text: string, keywords: string[]): boolean {
  const normalizedText = normalizeKeywordText(text);
  if (!normalizedText || keywords.length === 0) return false;

  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeKeywordText(keyword);
    if (!normalizedKeyword) return false;
    return normalizedText.includes(normalizedKeyword);
  });
}

const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  "software development & saas": ["software", "saas", "b2b software", "developer tools", "product", "engineering"],
  "marketing & advertising": ["marketing", "advertising", "growth", "performance", "content", "demand gen"],
  "e-commerce": ["e-commerce", "ecommerce", "shopify", "d2c", "retail", "marketplace"],
  "healthcare": ["healthcare", "health care", "medical", "pharma", "biotech"],
  "finance": ["finance", "fintech", "banking", "financial", "payments"],
  "it services & consulting": ["consulting", "agency", "services", "systems integrator", "it services"],
  "technology": ["technology", "tech", "ai", "software", "cloud", "data"],
  "education": ["education", "edtech", "learning", "training"],
  "media & communications": ["media", "communications", "publishing", "content", "creator"],
  "real estate": ["real estate", "proptech", "property", "construction"],
};

const COMPANY_SIZE_INDICATORS: Record<string, string[]> = {
  "1-10 employees": ["freelance", "solo", "independent", "solopreneur", "fractional", "consultant"],
  "11-50 employees": ["startup", "small team", "co-founder", "seed", "early-stage"],
  "51-200 employees": ["head of", "lead", "manager", "series a", "scaleup", "growing team"],
  "201-500 employees": ["director", "vp", "regional", "mid-market", "series b"],
  "501-1000 employees": ["enterprise", "global team", "department", "multi-market", "group"],
  "1000+ employees": ["enterprise", "global", "fortune", "corporate", "corporation", "public company"],
};

function getIndustryMatches(headline: string, selectedIndustries: string[]): string[] {
  const normalizedHeadline = normalizeKeywordText(headline);
  if (!normalizedHeadline || selectedIndustries.length === 0) return [];

  return selectedIndustries.filter((industry) => {
    const normalizedIndustry = normalizeKeywordText(industry);
    const aliases = INDUSTRY_KEYWORDS[normalizedIndustry] || [normalizedIndustry];
    return aliases.some((alias) => normalizedHeadline.includes(normalizeKeywordText(alias)));
  });
}

function getCompanySizeMatch(headline: string, selectedSizes: string[]): string | null {
  const normalizedHeadline = normalizeKeywordText(headline);
  if (!normalizedHeadline || selectedSizes.length === 0) return null;

  for (const size of selectedSizes) {
    const indicators = COMPANY_SIZE_INDICATORS[size] || [];
    if (indicators.some((indicator) => normalizedHeadline.includes(normalizeKeywordText(indicator)))) {
      return size;
    }
  }

  return null;
}

function isFirstDegree(networkDistance: string | undefined): boolean {
  const normalized = (networkDistance || "").trim().toLowerCase();
  return normalized === "distance_1" || normalized === "1st" || normalized === "first_degree";
}

// ── Heuristic ICP Scoring ───────────────────────────────────────────────

function scoreIcpFit(headline: string, location: string, agent: Agent): { icpFit: number; reasons: string[] } {
  const hl = headline.toLowerCase();
  const loc = location.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  // Job title match (0-0.4)
  const titleMatches = getRoleTitleMatches(headline, agent.icp.jobTitles);
  if (titleMatches.length > 0) {
    score += 0.4;
    reasons.push(`title match: ${titleMatches.join(", ")}`);
  }

  // Industry match (0-0.2)
  const industryMatches = getIndustryMatches(headline, agent.icp.industries);
  if (industryMatches.length > 0) {
    score += 0.2;
    reasons.push(`industry: ${industryMatches.join(", ")}`);
  }

  // Location match (0-0.2)
  const locationMatches = agent.icp.locations.filter((l) => loc.includes(l.toLowerCase()));
  if (locationMatches.length > 0) {
    score += 0.2;
    reasons.push(`location: ${locationMatches.join(", ")}`);
  }

  // Company size match (0-0.1) — check headline for size indicators
  const sizeMatch = getCompanySizeMatch(headline, agent.icp.companySizes);
  if (sizeMatch) {
    score += 0.1;
    reasons.push(`size indicator: ${sizeMatch}`);
  }

  // Engagement keyword match (0-0.1)
  const kwMatches = getConfiguredTopics(agent.signals).filter((kw) => hl.includes(kw.toLowerCase()));
  if (kwMatches.length > 0) {
    score += 0.1;
    reasons.push(`keywords: ${kwMatches.join(", ")}`);
  }

  return { icpFit: Math.min(score, 1), reasons };
}

function hasRequiredJobTitle(headline: string, jobTitles: string[]): boolean {
  return hasRoleTitleMatch(headline, jobTitles);
}

function scoreIntent(source: SignalSource, context: string): { intentScore: number; reason: string } {
  const ctx = context.toLowerCase();

  switch (source) {
    case "post_engagement": {
      const isYourPost = ctx.includes("your post");
      const isCompetitor = ctx.includes("competitor");
      const isComment = ctx.includes("commented");

      if (isYourPost && isComment) return { intentScore: 5, reason: "commented on YOUR post (highest intent)" };
      if (isYourPost) return { intentScore: 4, reason: "reacted to YOUR post" };
      if (isCompetitor && isComment) return { intentScore: 4, reason: "commented on competitor content" };
      if (isCompetitor) return { intentScore: 3, reason: "reacted to competitor content" };
      if (isComment) return { intentScore: 4, reason: "actively commented on relevant post" };
      return { intentScore: 3, reason: "reacted to relevant post" };
    }
    case "profile_visitors":
      return { intentScore: 5, reason: "visited YOUR profile (highest intent)" };
    case "company_page": {
      const isComment = ctx.includes("commented");
      if (isComment) return { intentScore: 5, reason: "commented on YOUR company post" };
      return { intentScore: 4, reason: "reacted to YOUR company post" };
    }
    case "company_followers":
      return { intentScore: 3, reason: "follows your profile/company" };
    case "job_changes":
      return { intentScore: 3, reason: "recently changed job (transition = buying window)" };
    case "recent_funding":
      return { intentScore: 4, reason: "recent funding (budget available)" };
    case "top_active":
      return { intentScore: 2, reason: "highly active on ICP topics" };
    case "recent_activity":
      return { intentScore: 3, reason: "posted about ICP topic" };
    case "keyword_search":
      return { intentScore: 1, reason: "found via keyword search" };
    default:
      return { intentScore: 1, reason: "unknown source" };
  }
}

function isAntiPersona(headline: string, excludeKeywords: string[]): boolean {
  const lower = headline.toLowerCase();
  return excludeKeywords.some((kw) => lower.includes(kw.toLowerCase()));
}

// ── Signal Source: Keyword Search ───────────────────────────────────────

interface RawCandidate {
  providerId: string;
  name: string;
  headline: string;
  location: string;
  publicIdentifier: string;
  networkDistance: string;
  profilePictureUrl?: string;
  signalSource: SignalSource;
  signalContext: string;
  sourcePostId?: string;
  signalPayload?: Record<string, unknown>;
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function extractContentUrl(entity: unknown): string | undefined {
  if (!entity || typeof entity !== "object") return undefined;
  const record = entity as Record<string, unknown>;

  return pickString(
    record.url,
    record.permalink,
    record.post_url,
    record.postUrl,
    record.link,
    record.share_url,
    record.shareUrl,
    record.activity_url,
    record.activityUrl
  );
}

function profileRefLabel(value: string | undefined): string | undefined {
  const normalized = normalizeLinkedInProfileRef(value || "");
  if (normalized) return normalized;
  return pickString(value)?.replace(/^@/, "");
}

function companyRefLabel(value: string | undefined): string | undefined {
  const trimmed = pickString(value);
  if (!trimmed) return undefined;
  const match = trimmed.match(/linkedin\.com\/company\/([^/?#]+)/i);
  if (match?.[1]) return match[1];
  if (!trimmed.includes("://")) return trimmed.replace(/^@/, "");
  return undefined;
}

function buildVectorImageUrl(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const root = pickString(record.rootUrl, record.root_url);
  const artifacts = Array.isArray(record.artifacts) ? record.artifacts : [];
  if (!root || artifacts.length === 0) return undefined;

  const artifact = [...artifacts]
    .map((item) => item && typeof item === "object" ? item as Record<string, unknown> : null)
    .filter(Boolean)
    .reverse()
    .find((item) => pickString(item?.fileIdentifyingUrlPathSegment, item?.file_identifying_url_path_segment));

  const segment = artifact
    ? pickString(artifact.fileIdentifyingUrlPathSegment, artifact.file_identifying_url_path_segment)
    : undefined;

  return root && segment ? `${root}${segment}` : undefined;
}

function extractProfilePictureUrl(entity: unknown): string | undefined {
  if (!entity || typeof entity !== "object") return undefined;
  const record = entity as Record<string, unknown>;

  const direct = pickString(
    record.profile_picture_url,
    record.picture_url,
    record.avatar_url,
    record.image_url,
    record.photo_url,
    record.profilePictureUrl,
    record.pictureUrl,
    record.avatarUrl,
    record.imageUrl,
  );
  if (direct) return direct;

  const nestedKeys = [
    "profile_picture",
    "profilePicture",
    "picture",
    "photo",
    "avatar",
    "image",
    "miniProfile",
    "profile",
    "author",
    "author_details",
    "viewer",
  ];

  for (const key of nestedKeys) {
    const nested = record[key];
    if (!nested || typeof nested !== "object") continue;
    const nestedRecord = nested as Record<string, unknown>;
    const nestedDirect = pickString(
      nestedRecord.url,
      nestedRecord.secure_url,
      nestedRecord.profile_picture_url,
      nestedRecord.picture_url,
      nestedRecord.avatar_url,
      nestedRecord.image_url,
      nestedRecord.photo_url,
      nestedRecord.profilePictureUrl,
      nestedRecord.pictureUrl,
      nestedRecord.avatarUrl,
      nestedRecord.imageUrl,
    );
    if (nestedDirect) return nestedDirect;

    const vectorUrl = buildVectorImageUrl(nestedRecord.vectorImage || nestedRecord.vector_image || nestedRecord.displayImage || nestedRecord.display_image);
    if (vectorUrl) return vectorUrl;
  }

  return buildVectorImageUrl(record.vectorImage || record.vector_image || record.displayImage || record.display_image);
}

async function discoverFromKeywordSearch(
  agent: Agent,
  maxResults: number
): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = [];
  const configuredTopics = getConfiguredTopics(agent.signals);
  const fallbackTopics = [
    ...agent.icp.jobTitles,
    ...agent.icp.industries,
  ].map((value) => value.trim()).filter(Boolean);
  const keywords = configuredTopics.length > 0 ? configuredTopics : fallbackTopics;
  const titleFilter = agent.icp.jobTitles.slice(0, 5).join(" OR ");
  const locationFilter = agent.icp.locations.map((l) => l.toLowerCase());

  if (keywords.length === 0) {
    warn("keyword_search: no engagement keywords/topics or ICP title/industry fallbacks configured");
    return candidates;
  }

  // Use max 2 keyword searches to stay within rate limits
  for (const kw of keywords.slice(0, 2)) {
    const items = await searchPeople(kw, titleFilter);

    for (const person of items) {
      if (candidates.length >= maxResults) break;
      if (!person.id || !person.name) continue;
      if (person.network_distance === "DISTANCE_3" || person.network_distance === "OUT_OF_NETWORK") continue;

      // Location filter: if agent has locations, skip people not matching
      if (locationFilter.length > 0 && person.location) {
        const personLoc = (person.location || "").toLowerCase();
        if (!locationFilter.some((loc) => personLoc.includes(loc))) continue;
      }

      candidates.push({
        providerId: person.id,
        name: person.name,
        headline: person.headline || "",
        location: person.location || "",
        publicIdentifier: person.public_identifier || "",
        networkDistance: person.network_distance || "",
        profilePictureUrl: extractProfilePictureUrl(person),
        signalSource: "keyword_search",
        signalContext: `Found via search: "${kw}"`,
        signalPayload: {
          sourceQuery: kw,
          titleFilter,
          sourceEntityType: "search_query",
          engagementType: "search",
        },
      });
    }

    await sleep(3000);
  }

  return candidates;
}

// ── Signal Source: Post Engagement ──────────────────────────────────────

async function discoverFromPostEngagement(
  agent: Agent,
  maxResults: number
): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = [];
  const keywords = getConfiguredTopics(agent.signals);

  // Monitor personalProfile — who engages with YOUR posts (highest intent)
  const personalProfile = agent.signals.personalProfile;
  if (personalProfile) {
    const profileId = personalProfile.split("/in/")[1]?.replace(/\/$/, "") || personalProfile;
    try {
      const postsResult = await getPostsByAuthor(profileId);
      const posts = (postsResult?.items || []).slice(0, 2);

      for (const post of posts) {
        if (candidates.length >= maxResults) break;
        const postId = post.social_id || post.id;
        const postText = ((post.text as string) || "").slice(0, 80);

        if ((post.comment_counter as number) > 0) {
          const comments = await getPostComments(postId);
          for (const comment of (comments?.items || []).slice(0, 15)) {
            if (candidates.length >= maxResults) break;
            const author = comment.author_details || {};
            if (!author.id) continue;
            if (candidates.some((c) => c.providerId === author.id)) continue;

            candidates.push({
              providerId: author.id,
              name: comment.author || "",
              headline: author.headline || "",
              location: "",
              publicIdentifier: (author.profile_url || "").split("/in/")[1]?.replace("/", "") || "",
              networkDistance: author.network_distance || "",
              profilePictureUrl: extractProfilePictureUrl(author),
              signalSource: "post_engagement",
              signalContext: `Commented on YOUR post: "${postText}"`,
              sourcePostId: postId,
              signalPayload: {
                sourceEntityUrl: personalProfile,
                sourceEntityType: "personal_profile",
                sourceEntityLabel: "your profile",
                sourcePostUrl: extractContentUrl(post),
                sourceAuthorUrl: personalProfile,
                sourceAuthorLabel: "your profile",
                engagementType: "comment",
              },
            });
          }
          await sleep(2000);
        }

        if ((post.reaction_counter as number) > 0) {
          const reactions = await getPostReactions(postId);
          for (const reaction of (reactions?.items || []).slice(0, 15)) {
            if (candidates.length >= maxResults) break;
            const author = reaction.author || {};
            if (!author.id || candidates.some((c) => c.providerId === author.id)) continue;

            candidates.push({
              providerId: author.id,
              name: author.name || "",
              headline: author.headline || "",
              location: "",
              publicIdentifier: (author.profile_url || "").split("/in/")[1]?.replace("/", "") || "",
              networkDistance: author.network_distance || "",
              profilePictureUrl: extractProfilePictureUrl(author),
              signalSource: "post_engagement",
              signalContext: `Reacted to YOUR post: "${postText}"`,
              sourcePostId: postId,
              signalPayload: {
                sourceEntityUrl: personalProfile,
                sourceEntityType: "personal_profile",
                sourceEntityLabel: "your profile",
                sourcePostUrl: extractContentUrl(post),
                sourceAuthorUrl: personalProfile,
                sourceAuthorLabel: "your profile",
                engagementType: "reaction",
              },
            });
          }
          await sleep(2000);
        }
      }
      await sleep(3000);
    } catch (err) {
      warn(`personalProfile posts: ${err}`);
    }
  }

  // Monitor competitorPages — who engages with competitor content
  const competitorPages = agent.signals.competitorPages || [];
  for (const rawPageRef of competitorPages.slice(0, 2)) {
    const pageId = rawPageRef.split("/company/")[1]?.replace(/\/$/, "") || rawPageRef;
    try {
      const postsResult = await getPostsByCompany(pageId);
      const posts = (postsResult?.items || []).slice(0, 2);

      for (const post of posts) {
        if (candidates.length >= maxResults) break;
        const postId = post.social_id || post.id;
        const postText = ((post.text as string) || "").slice(0, 80);

        if ((post.comment_counter as number) > 0) {
          const comments = await getPostComments(postId);
          for (const comment of (comments?.items || []).slice(0, 10)) {
            if (candidates.length >= maxResults) break;
            const author = comment.author_details || {};
            if (!author.id || candidates.some((c) => c.providerId === author.id)) continue;

            candidates.push({
              providerId: author.id,
              name: comment.author || "",
              headline: author.headline || "",
              location: "",
              publicIdentifier: (author.profile_url || "").split("/in/")[1]?.replace("/", "") || "",
              networkDistance: author.network_distance || "",
              profilePictureUrl: extractProfilePictureUrl(author),
              signalSource: "post_engagement",
              signalContext: `Engaged with competitor page: "${postText}"`,
              sourcePostId: postId,
              signalPayload: {
                sourceEntityUrl: rawPageRef,
                sourceEntityType: "competitor_page",
                sourceEntityLabel: companyRefLabel(rawPageRef),
                sourcePostUrl: extractContentUrl(post),
                engagementType: "comment",
              },
            });
          }
          await sleep(2000);
        }
      }
      await sleep(3000);
    } catch (err) {
      warn(`competitorPage posts: ${err}`);
    }
  }

  // Monitor watchProfiles — get their recent posts and extract engagers
  const watchProfiles = agent.signals.watchProfiles || [];
  for (const rawProfileId of watchProfiles.slice(0, 8)) {
    const profileId = normalizeLinkedInProfileRef(rawProfileId);
    if (!profileId) continue;
    try {
      const postsResult = await getPostsByAuthor(profileId);
      const posts = (postsResult?.items || [])
        .filter((post: Record<string, unknown>) =>
          textMentionsTrackedKeywords((post.text as string) || "", keywords)
        )
        .slice(0, 4);

      for (const post of posts) {
        if (candidates.length >= maxResults) break;
        const postId = post.social_id || post.id;
        const postText = ((post.text as string) || "").slice(0, 80);

        // Get commenters on watched profile's posts
        if ((post.comment_counter as number) > 0) {
          const comments = await getPostComments(postId);
          for (const comment of (comments?.items || []).slice(0, 10)) {
            if (candidates.length >= maxResults) break;
            const author = comment.author_details || {};
            if (!author.id) continue;
            if (candidates.some((c) => c.providerId === author.id)) continue;

            candidates.push({
              providerId: author.id,
              name: comment.author || "",
              headline: author.headline || "",
              location: "",
              publicIdentifier: (author.profile_url || "").split("/in/")[1]?.replace("/", "") || "",
              networkDistance: author.network_distance || "",
              profilePictureUrl: extractProfilePictureUrl(author),
              signalSource: "post_engagement",
              signalContext: `Commented on watched profile's post: "${postText}"`,
              sourcePostId: postId,
              signalPayload: {
                sourceEntityUrl: rawProfileId,
                sourceEntityType: "watch_profile",
                sourceEntityLabel: profileRefLabel(rawProfileId),
                sourcePostUrl: extractContentUrl(post),
                sourceAuthorUrl: rawProfileId,
                sourceAuthorLabel: profileRefLabel(rawProfileId),
                engagementType: "comment",
              },
            });
          }
          await sleep(2000);
        }

        // Get reactors
        if ((post.reaction_counter as number) > 2) {
          const reactions = await getPostReactions(postId);
          for (const reaction of (reactions?.items || []).slice(0, 10)) {
            if (candidates.length >= maxResults) break;
            const author = reaction.author || {};
            if (!author.id || candidates.some((c) => c.providerId === author.id)) continue;

            candidates.push({
              providerId: author.id,
              name: author.name || "",
              headline: author.headline || "",
              location: "",
              publicIdentifier: (author.profile_url || "").split("/in/")[1]?.replace("/", "") || "",
              networkDistance: author.network_distance || "",
              profilePictureUrl: extractProfilePictureUrl(author),
              signalSource: "post_engagement",
              signalContext: `Reacted to watched profile's post: "${postText}"`,
              sourcePostId: postId,
              signalPayload: {
                sourceEntityUrl: rawProfileId,
                sourceEntityType: "watch_profile",
                sourceEntityLabel: profileRefLabel(rawProfileId),
                sourcePostUrl: extractContentUrl(post),
                sourceAuthorUrl: rawProfileId,
                sourceAuthorLabel: profileRefLabel(rawProfileId),
                engagementType: "reaction",
              },
            });
          }
          await sleep(2000);
        }
      }
      await sleep(3000);
    } catch (err) {
      warn(`watchProfile posts: ${err}`);
    }
  }

  // Search for recent posts on ICP topics (keyword-based engagement)
  for (const kw of keywords.slice(0, 2)) {
    const postResult = await searchPosts(kw);
    const posts = postResult?.items || [];

    // Take posts with engagement
    const engagedPosts = posts
      .filter((p: Record<string, unknown>) =>
        textMentionsTrackedKeywords((p.text as string) || "", keywords)
      )
      .filter((p: Record<string, unknown>) =>
        ((p.comment_counter as number) || 0) > 0 || ((p.reaction_counter as number) || 0) > 2
      )
      .slice(0, 3);

    for (const post of engagedPosts) {
      if (candidates.length >= maxResults) break;

      const postId = post.social_id || post.id;
      const postText = ((post.text as string) || "").slice(0, 100);
      const authorName = (post.author as Record<string, string>)?.name || "unknown";

      // Get commenters
      if ((post.comment_counter as number) > 0) {
        try {
          const comments = await getPostComments(postId);
          const items = comments?.items || [];

          for (const comment of items.slice(0, 10)) {
            if (candidates.length >= maxResults) break;
            const author = comment.author_details || {};
            if (!author.id) continue;

            candidates.push({
              providerId: author.id,
              name: comment.author || "",
              headline: author.headline || "",
              location: "",
              publicIdentifier: (author.profile_url || "").split("/in/")[1]?.replace("/", "") || "",
              networkDistance: author.network_distance || "",
              profilePictureUrl: extractProfilePictureUrl(author),
              signalSource: "post_engagement",
              signalContext: `Commented on ${authorName}'s post about "${postText}"`,
              sourcePostId: postId,
              signalPayload: {
                sourcePostUrl: extractContentUrl(post),
                sourceAuthorUrl: pickString(
                  (post.author as Record<string, unknown>)?.profile_url,
                  buildLinkedInProfileUrl((post.author as Record<string, unknown>)?.public_identifier as string | undefined)
                ),
                sourceAuthorLabel: authorName,
                engagementType: "comment",
              },
            });
          }
          await sleep(2000);
        } catch (err) {
          warn(`post comments: ${err}`);
        }
      }

      // Get reactors
      if ((post.reaction_counter as number) > 0) {
        try {
          const reactions = await getPostReactions(postId);
          const items = reactions?.items || [];

          for (const reaction of items.slice(0, 15)) {
            if (candidates.length >= maxResults) break;
            const author = reaction.author || {};
            if (!author.id) continue;

            // Skip if already found as commenter
            if (candidates.some((c) => c.providerId === author.id)) continue;

            candidates.push({
              providerId: author.id,
              name: author.name || "",
              headline: author.headline || "",
              location: "",
              publicIdentifier: (author.profile_url || "").split("/in/")[1]?.replace("/", "") || "",
              networkDistance: author.network_distance || "",
              profilePictureUrl: extractProfilePictureUrl(author),
              signalSource: "post_engagement",
              signalContext: `Reacted to ${authorName}'s post about "${postText}"`,
              sourcePostId: postId,
              signalPayload: {
                sourcePostUrl: extractContentUrl(post),
                sourceAuthorUrl: pickString(
                  (post.author as Record<string, unknown>)?.profile_url,
                  buildLinkedInProfileUrl((post.author as Record<string, unknown>)?.public_identifier as string | undefined)
                ),
                sourceAuthorLabel: authorName,
                engagementType: "reaction",
              },
            });
          }
          await sleep(2000);
        } catch (err) {
          warn(`post reactions: ${err}`);
        }
      }
    }

    await sleep(3000);
  }

  return candidates;
}

// ── Signal Source: Recent Activity ──────────────────────────────────────

async function discoverFromRecentActivity(
  agent: Agent,
  maxResults: number
): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = [];
  const keywords = getConfiguredTopics(agent.signals);

  for (const kw of keywords.slice(0, 2)) {
    const result = await searchPosts(kw);
    const posts = result?.items || [];

    for (const post of posts.slice(0, 10)) {
      if (candidates.length >= maxResults) break;
      if (!textMentionsTrackedKeywords((post.text as string) || "", keywords)) continue;

      const author = post.author || {};
      if (!author.id || author.is_company) continue;

      // Skip if already found
      if (candidates.some((c) => c.providerId === author.id)) continue;

      const postText = ((post.text as string) || "").slice(0, 100);

      candidates.push({
        providerId: author.id,
        name: author.name || "",
        headline: author.headline || "",
        location: "",
        publicIdentifier: author.public_identifier || "",
        networkDistance: "",
        profilePictureUrl: extractProfilePictureUrl(author),
        signalSource: "recent_activity",
        signalContext: `Posted about: "${postText}"`,
        sourcePostId: post.social_id || post.id,
        signalPayload: {
          sourcePostUrl: extractContentUrl(post),
          sourceAuthorUrl: pickString(
            (author as Record<string, unknown>)?.profile_url,
            buildLinkedInProfileUrl(author.public_identifier || "")
          ),
          sourceAuthorLabel: author.name || "",
          engagementType: "post",
        },
      });
    }

    await sleep(3000);
  }

  return candidates;
}

// ── Signal Source: Profile Visitors ──────────────────────────────────────

async function discoverFromProfileVisitors(
  _agent: Agent,
  maxResults: number
): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = [];

  try {
    const result = await getProfileVisitors();

    // Recursively extract WvmpProfileViewCard from LinkedIn's deeply nested response
    const CARD_KEY = "com.linkedin.voyager.identity.me.WvmpProfileViewCard";

    function extractVisitors(obj: unknown, depth: number): void {
      if (depth > 20 || obj === null || obj === undefined || typeof obj !== "object") return;
      if (candidates.length >= maxResults) return;

      const record = obj as Record<string, unknown>;

      if (record[CARD_KEY]) {
        const viewCard = record[CARD_KEY] as Record<string, unknown>;
        const viewerKey = Object.keys((viewCard.viewer as Record<string, unknown>) || {})[0];
        const viewer = (viewCard.viewer as Record<string, unknown>)?.[viewerKey] as Record<string, unknown> | undefined;
        const profile = viewer?.profile as Record<string, unknown> | undefined;
        const mini = profile?.miniProfile as Record<string, string> | undefined;
        if (mini?.entityUrn) {
          const providerId = mini.entityUrn.replace("urn:li:fs_miniProfile:", "");
          const name = `${mini.firstName || ""} ${mini.lastName || ""}`.trim();
          const referrer = viewCard.referrer as string || "";
          const viewedAt = viewCard.viewedAt ? new Date(viewCard.viewedAt as number).toISOString() : "";

          candidates.push({
            providerId,
            name,
            headline: mini.occupation || "",
            location: "",
            publicIdentifier: mini.publicIdentifier || "",
            networkDistance: (profile?.distance as Record<string, string>)?.value || "",
            profilePictureUrl: extractProfilePictureUrl(mini),
            signalSource: "profile_visitors",
            signalContext: `Visited YOUR profile${referrer ? ` (via ${referrer})` : ""}${viewedAt ? ` at ${viewedAt}` : ""}`,
            signalPayload: {
              sourceEntityUrl: _agent.signals.personalProfile || undefined,
              sourceEntityType: "personal_profile",
              sourceEntityLabel: "your profile",
              referrer,
              viewedAt,
              engagementType: "visit",
            },
          });
        }
        return;
      }

      if (Array.isArray(record)) {
        for (const item of record) extractVisitors(item, depth + 1);
      } else {
        for (const val of Object.values(record)) extractVisitors(val, depth + 1);
      }
    }

    extractVisitors(result?.data, 0);
  } catch (err) {
    warn(`profile_visitors: ${err}`);
  }

  return candidates;
}

// ── Signal Source: Company Page ──────────────────────────────────────────

async function discoverFromCompanyPage(
  agent: Agent,
  maxResults: number
): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = [];
  const companyPage = agent.signals.companyPage;
  if (!companyPage) return candidates;

  // Extract company identifier from URL or use as-is
  const companyId = companyPage.split("/company/")[1]?.replace(/\/$/, "") || companyPage;

  try {
    const postsResult = await getPostsByCompany(companyId);
    const posts = (postsResult?.items || []).slice(0, 3);

    for (const post of posts) {
      if (candidates.length >= maxResults) break;
      const postId = post.social_id || post.id;
      const postText = ((post.text as string) || "").slice(0, 80);

      if ((post.comment_counter as number) > 0) {
        const comments = await getPostComments(postId);
        for (const comment of (comments?.items || []).slice(0, 15)) {
          if (candidates.length >= maxResults) break;
          const author = comment.author_details || {};
          if (!author.id || author.is_company) continue;
          if (candidates.some((c) => c.providerId === author.id)) continue;

          candidates.push({
            providerId: author.id,
            name: comment.author || "",
            headline: author.headline || "",
            location: "",
            publicIdentifier: (author.profile_url || "").split("/in/")[1]?.replace("/", "") || "",
            networkDistance: author.network_distance || "",
            profilePictureUrl: extractProfilePictureUrl(author),
            signalSource: "company_page",
            signalContext: `Commented on YOUR company post: "${postText}"`,
            sourcePostId: postId,
            signalPayload: {
              sourceEntityUrl: companyPage,
              sourceEntityType: "company_page",
              sourceEntityLabel: companyRefLabel(companyPage),
              sourcePostUrl: extractContentUrl(post),
              engagementType: "comment",
            },
          });
        }
        await sleep(2000);
      }

      if ((post.reaction_counter as number) > 0) {
        const reactions = await getPostReactions(postId);
        for (const reaction of (reactions?.items || []).slice(0, 15)) {
          if (candidates.length >= maxResults) break;
          const author = reaction.author || {};
          if (!author.id || candidates.some((c) => c.providerId === author.id)) continue;

          candidates.push({
            providerId: author.id,
            name: author.name || "",
            headline: author.headline || "",
            location: "",
            publicIdentifier: (author.profile_url || "").split("/in/")[1]?.replace("/", "") || "",
            networkDistance: author.network_distance || "",
            profilePictureUrl: extractProfilePictureUrl(author),
            signalSource: "company_page",
            signalContext: `Reacted to YOUR company post: "${postText}"`,
            sourcePostId: postId,
            signalPayload: {
              sourceEntityUrl: companyPage,
              sourceEntityType: "company_page",
              sourceEntityLabel: companyRefLabel(companyPage),
              sourcePostUrl: extractContentUrl(post),
              engagementType: "reaction",
            },
          });
        }
        await sleep(2000);
      }
    }
  } catch (err) {
    warn(`company_page: ${err}`);
  }

  return candidates;
}

// ── Signal Source: Company Followers ─────────────────────────────────────

async function discoverFromCompanyFollowers(
  agent: Agent,
  maxResults: number
): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = [];

  // If company page is configured, also get company page followers via raw endpoint
  const companyPage = agent.signals.companyPage;
  if (!companyPage) {
    warn("company_followers: skipped because no companyPage is configured");
    return candidates;
  }

  const companyId = companyPage.split("/company/")[1]?.replace(/\/$/, "") || companyPage;
  try {
    const result = await linkedinRaw(
      `https://www.linkedin.com/voyager/api/graphql?variables=(start:0,count:50,paginationToken:null,companyId:${companyId})&queryId=voyagerOrganizationDashFollowers.39c8bde04ac8386064e8a1e2cd502375`
    );
    const items = result?.data?.elements || [];
    for (const item of items) {
      if (candidates.length >= maxResults) break;
      const mini = item?.follower?.miniProfile || item?.miniProfile;
      if (!mini?.entityUrn) continue;
      const providerId = mini.entityUrn.replace("urn:li:fs_miniProfile:", "").replace("urn:li:fsd_profile:", "");
      if (candidates.some((c) => c.providerId === providerId)) continue;

      candidates.push({
        providerId,
        name: `${mini.firstName || ""} ${mini.lastName || ""}`.trim(),
        headline: mini.occupation || mini.headline || "",
        location: "",
        publicIdentifier: mini.publicIdentifier || "",
        networkDistance: "",
        profilePictureUrl: extractProfilePictureUrl(mini),
        signalSource: "company_followers",
        signalContext: `Follows YOUR company page (${companyId})`,
        signalPayload: {
          sourceEntityUrl: companyPage,
          sourceEntityType: "company_page",
          sourceEntityLabel: companyRefLabel(companyPage),
          engagementType: "follow",
        },
      });
    }
  } catch (err) {
    warn(`company_followers raw: ${err}`);
  }

  return candidates;
}

// ── Signal Source: Job Changes ───────────────────────────────────────────

async function discoverFromJobChanges(
  agent: Agent,
  maxResults: number
): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = [];
  const titleFilter = agent.icp.jobTitles.slice(0, 3).join(" OR ");
  const locationFilter = agent.icp.locations.map((l) => l.toLowerCase());

  // Search for people in ICP roles — LinkedIn shows recently changed jobs higher
  const searchTerms = titleFilter || getConfiguredTopics(agent.signals).slice(0, 2).join(" ");
  if (!searchTerms) return candidates;

  try {
    const items = await searchPeople(searchTerms);

    for (const person of items) {
      if (candidates.length >= maxResults) break;
      if (!person.id || !person.name) continue;
      if (person.network_distance === "DISTANCE_3" || person.network_distance === "OUT_OF_NETWORK") continue;

      // Location filter
      if (locationFilter.length > 0 && person.location) {
        const personLoc = (person.location || "").toLowerCase();
        if (!locationFilter.some((loc) => personLoc.includes(loc))) continue;
      }

      // Heuristic: look for job change indicators in headline
      const hl = (person.headline || "").toLowerCase();
      const isJobChange = hl.includes("new role") || hl.includes("just joined") ||
        hl.includes("excited to announce") || hl.includes("new position") ||
        hl.includes("starting") || hl.includes("happy to share") ||
        (person.is_job_seeker) || (person.open_to_work);

      if (!isJobChange) continue;

      candidates.push({
        providerId: person.id,
        name: person.name,
        headline: person.headline || "",
        location: person.location || "",
        publicIdentifier: person.public_identifier || "",
        networkDistance: person.network_distance || "",
        profilePictureUrl: extractProfilePictureUrl(person),
        signalSource: "job_changes",
        signalContext: `Recently changed job/role: "${(person.headline || "").slice(0, 80)}"`,
        signalPayload: {
          sourceQuery: searchTerms,
          sourceEntityType: "search_query",
          engagementType: "event",
        },
      });
    }
    await sleep(3000);
  } catch (err) {
    warn(`job_changes search: ${err}`);
  }

  // Also search posts mentioning job changes
  try {
    const postResult = await searchPosts("new role OR just joined OR excited to announce", "past-week");
    const posts = postResult?.items || [];

    for (const post of posts.slice(0, 15)) {
      if (candidates.length >= maxResults) break;
      const author = post.author || {};
      if (!author.id || author.is_company) continue;
      if (candidates.some((c) => c.providerId === author.id)) continue;

      const postText = ((post.text as string) || "").slice(0, 100);

      // Check if the post is about a job change
      const text = (post.text as string || "").toLowerCase();
      if (!text.includes("new role") && !text.includes("joined") && !text.includes("excited") &&
          !text.includes("new position") && !text.includes("new chapter") && !text.includes("happy to share")) continue;

      candidates.push({
        providerId: author.id,
        name: author.name || "",
        headline: author.headline || "",
        location: "",
        publicIdentifier: author.public_identifier || "",
        networkDistance: "",
        profilePictureUrl: extractProfilePictureUrl(author),
        signalSource: "job_changes",
        signalContext: `Job change post: "${postText}"`,
        sourcePostId: post.social_id || post.id,
        signalPayload: {
          sourcePostUrl: extractContentUrl(post),
          sourceAuthorUrl: pickString(
            (author as Record<string, unknown>)?.profile_url,
            buildLinkedInProfileUrl(author.public_identifier || "")
          ),
          sourceAuthorLabel: author.name || "",
          engagementType: "event",
        },
      });
    }
    await sleep(3000);
  } catch (err) {
    warn(`job_changes posts: ${err}`);
  }

  return candidates;
}

// ── Signal Source: Recent Funding ────────────────────────────────────────

async function discoverFromRecentFunding(
  agent: Agent,
  maxResults: number
): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = [];
  const locationFilter = agent.icp.locations.map((l) => l.toLowerCase());

  // Search for funding-related posts
  const fundingKeywords = ["raised funding", "seed round", "series A", "just raised", "investment round", "pre-seed"];

  for (const kw of fundingKeywords.slice(0, 2)) {
    try {
      const postResult = await searchPosts(kw, "past-week");
      const posts = postResult?.items || [];

      for (const post of posts.slice(0, 10)) {
        if (candidates.length >= maxResults) break;
        const author = post.author || {};
        if (!author.id || author.is_company) continue;
        if (candidates.some((c) => c.providerId === author.id)) continue;

        const hl = (author.headline || "").toLowerCase();
        const postText = ((post.text as string) || "").slice(0, 100);

        // Check relevance to ICP industries
        const industryMatch = agent.icp.industries.length === 0 ||
          getIndustryMatches(`${author.headline || ""} ${(post.text as string) || ""}`, agent.icp.industries).length > 0;
        if (!industryMatch) continue;

        // Location filter
        if (locationFilter.length > 0) {
          const authorLoc = (author.location || "").toLowerCase();
          const postLoc = (post.text as string || "").toLowerCase();
          const locMatch = locationFilter.some((loc) => authorLoc.includes(loc) || postLoc.includes(loc));
          if (!locMatch) continue;
        }

        candidates.push({
          providerId: author.id,
          name: author.name || "",
          headline: author.headline || "",
          location: author.location || "",
          publicIdentifier: author.public_identifier || "",
          networkDistance: "",
          profilePictureUrl: extractProfilePictureUrl(author),
          signalSource: "recent_funding",
          signalContext: `Funding post: "${postText}"`,
          sourcePostId: post.social_id || post.id,
          signalPayload: {
            sourcePostUrl: extractContentUrl(post),
            sourceAuthorUrl: pickString(
              (author as Record<string, unknown>)?.profile_url,
              buildLinkedInProfileUrl(author.public_identifier || "")
            ),
            sourceAuthorLabel: author.name || "",
            engagementType: "event",
          },
        });
      }
      await sleep(3000);
    } catch (err) {
      warn(`recent_funding: ${err}`);
    }
  }

  return candidates;
}

// ── Signal Source: Top Active Profiles ───────────────────────────────────

async function discoverFromTopActive(
  agent: Agent,
  maxResults: number
): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = [];
  const keywords = getConfiguredTopics(agent.signals);
  if (keywords.length === 0) return candidates;

  // Find people who frequently post/comment on ICP topics
  const activityCount: Record<string, { candidate: RawCandidate; count: number }> = {};

  for (const kw of keywords.slice(0, 3)) {
    try {
      const postResult = await searchPosts(kw, "past-week");
      const posts = postResult?.items || [];

      for (const post of posts.slice(0, 15)) {
        const author = post.author || {};
        if (!author.id || author.is_company) continue;

        if (!activityCount[author.id]) {
          activityCount[author.id] = {
            candidate: {
              providerId: author.id,
              name: author.name || "",
              headline: author.headline || "",
              location: "",
              publicIdentifier: author.public_identifier || "",
              networkDistance: "",
              profilePictureUrl: extractProfilePictureUrl(author),
              signalSource: "top_active",
              signalContext: "",
              signalPayload: {
                sourceQuery: kw,
                sourceAuthorUrl: pickString(
                  (author as Record<string, unknown>)?.profile_url,
                  buildLinkedInProfileUrl(author.public_identifier || "")
                ),
                sourceAuthorLabel: author.name || "",
                engagementType: "activity",
              },
            },
            count: 0,
          };
        }
        activityCount[author.id].count++;
      }
      await sleep(3000);
    } catch (err) {
      warn(`top_active: ${err}`);
    }
  }

  // Sort by activity count, take most active
  const sorted = Object.values(activityCount)
    .filter((a) => a.count >= 2) // at least 2 posts
    .sort((a, b) => b.count - a.count)
    .slice(0, maxResults);

  for (const entry of sorted) {
    entry.candidate.signalContext = `Top active: ${entry.count} posts on ICP topics in past week`;
    entry.candidate.signalPayload = {
      ...(entry.candidate.signalPayload || {}),
      activityCount: entry.count,
    };
    candidates.push(entry.candidate);
  }

  return candidates;
}

// ── Main Discovery Engine ───────────────────────────────────────────────

export async function runDiscovery(opts: DiscoveryOptions): Promise<DiscoveryResult> {
  const {
    agentId,
    campaignId,
    sources = ["keyword_search", "post_engagement", "recent_activity",
      "profile_visitors", "company_page", "company_followers",
      "job_changes", "recent_funding", "top_active"],
    maxPerSource = 20,
    dryRun = false,
    onEvent,
  } = opts;

  // Reset per-run warning collector
  _runWarnings = [];

  const events: DiscoveryEvent[] = [];
  function emit(event: DiscoveryEvent) {
    events.push(event);
    onEvent?.(event);
  }

  const runId = `dsc_${nanoid()}`;
  const startedAt = new Date().toISOString();
  const runSources: Record<string, { scanned: number; found: number }> = {};
  const errors: string[] = [];

  // Load agent
  const agent = await store.getAgent(agentId);
  if (!agent) {
    emit({ type: "error", message: `Agent ${agentId} not found` });
    const run: DiscoveryRun = {
      id: runId,
      workspaceId: store.DEFAULT_WORKSPACE_ID,
      agentId,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "error",
      sources: runSources,
      totalDiscovered: 0,
      totalDuplicates: 0,
      totalSaved: 0,
      errors: [`Agent ${agentId} not found`],
    };
    return { status: "error", discovered: 0, duplicates: 0, saved: 0, errors: 1, candidates: [], run };
  }

  // Find target campaign
  let targetCampaignId = campaignId;
  if (!targetCampaignId) {
    const campaigns = await store.listCampaigns({ workspaceId: agent.workspaceId, agentId });
    const active = campaigns.find((c) => c.status === "active");
    targetCampaignId = active?.id;
  }
  const targetCampaign = targetCampaignId ? await store.getCampaign(targetCampaignId, agent.workspaceId) : null;

  emit({
    type: "info",
    message: `Discovery: agent=${agent.name} | sources=${sources.join(",")} | dryRun=${dryRun} | campaign=${targetCampaignId || "none"}`,
  });

  // ── Collect raw candidates from all sources ──

  let allRaw: RawCandidate[] = [];

  // Map source names to discovery functions
  const sourceFns: Record<string, (agent: Agent, max: number) => Promise<RawCandidate[]>> = {
    keyword_search: discoverFromKeywordSearch,
    post_engagement: discoverFromPostEngagement,
    recent_activity: discoverFromRecentActivity,
    profile_visitors: discoverFromProfileVisitors,
    company_page: discoverFromCompanyPage,
    company_followers: discoverFromCompanyFollowers,
    job_changes: discoverFromJobChanges,
    recent_funding: discoverFromRecentFunding,
    top_active: discoverFromTopActive,
  };

  // Filter sources based on agent config — skip disabled ones
  const activeSources = sources.filter((s) => {
    if (s === "profile_visitors" && !agent.signals.trackProfileVisitors) return false;
    if (s === "company_page" && !agent.signals.companyPage) return false;
    if (s === "company_followers" && (!agent.signals.trackCompanyFollowers || !agent.signals.companyPage)) return false;
    if (s === "job_changes" && !agent.signals.triggerEvents?.jobChanges) return false;
    if (s === "recent_funding" && !agent.signals.triggerEvents?.recentFunding) return false;
    if (s === "top_active" && !agent.signals.triggerEvents?.topActiveProfiles) return false;
    return true;
  });

  for (const source of activeSources) {
    const fn = sourceFns[source];
    if (!fn) continue;
    emit({ type: "info", message: `Source: ${source}...` });
    try {
      const found = await fn(agent, maxPerSource);
      runSources[source] = { scanned: 1, found: found.length };
      allRaw.push(...found);
      emit({ type: "info", message: `${source}: ${found.length} candidates` });
    } catch (err) {
      const msg = `${source} error: ${err}`;
      errors.push(msg);
      emit({ type: "error", message: msg });
    }
  }

  // ── Dedup ──

  // Remove internal duplicates (keep first occurrence, usually higher intent source)
  const seen = new Set<string>();
  allRaw = allRaw.filter((c) => {
    if (seen.has(c.providerId)) return false;
    seen.add(c.providerId);
    return true;
  });

  // Remove already-known leads
  let duplicates = 0;
  const dedupedByStore: RawCandidate[] = [];
  for (const candidate of allRaw) {
    if (await store.isProviderIdUsed(candidate.providerId, agent.workspaceId)) {
      duplicates++;
      continue;
    }
    dedupedByStore.push(candidate);
  }
  allRaw = dedupedByStore;

  // Remove anti-persona
  allRaw = allRaw.filter((c) => {
    if (isNeverTargetProfile(agent, c)) {
      emit({ type: "info", message: `Skipped source-only profile: ${c.name}` });
      return false;
    }
    if (targetCampaign?.settings?.excludeFirstDegree && isFirstDegree(c.networkDistance)) {
      emit({ type: "info", message: `Skipped 1st-degree connection: ${c.name}` });
      return false;
    }
    if (isAntiPersona(c.headline, agent.icp.excludeKeywords)) {
      emit({ type: "info", message: `Skipped anti-persona: ${c.name}` });
      return false;
    }
    return true;
  });

  emit({ type: "info", message: `After dedup: ${allRaw.length} unique candidates (${duplicates} duplicates)` });

  // ── Score ──

  const scored: DiscoveryCandidate[] = allRaw.map((raw) => {
    const { icpFit, reasons: fitReasons } = scoreIcpFit(raw.headline, raw.location, agent);
    const { intentScore, reason: intentReason } = scoreIntent(raw.signalSource, raw.signalContext);
    const totalScore = Math.round((icpFit + intentScore / 5) * 100) / 100; // normalize to 0-2
    const signalMeta = buildSignalMetadata({
      source: raw.signalSource,
      context: raw.signalContext,
      sourcePostId: raw.sourcePostId,
      signals: agent.signals,
      signalPayload: raw.signalPayload,
    });

    const scoreReasoning = [
      `ICP fit ${(icpFit * 100).toFixed(0)}%: ${fitReasons.join("; ") || "no direct match"}`,
      `Intent ${intentScore}/5: ${intentReason}`,
    ].join(". ");

    return {
      ...raw,
      ...signalMeta,
      icpFit,
      intentScore,
      totalScore,
      scoreReasoning,
    };
  });

  // Sort by total score desc
  scored.sort((a, b) => b.totalScore - a.totalScore);
  const allScored = [...scored];

  // Apply matching mode filter
  let shortlisted = scored;
  if (agent.icp.matchingMode === "precision") {
    const filtered = allScored.filter((c) =>
      hasRequiredJobTitle(c.headline, agent.icp.jobTitles) &&
      c.icpFit >= 0.3 &&
      c.intentScore >= 2
    );
    if (filtered.length < allScored.length) {
      emit({ type: "info", message: `Precision mode: filtered ${allScored.length - filtered.length} candidates without strong title+intent fit` });
    }
    shortlisted = filtered;
  } else if (agent.icp.jobTitles.length > 0) {
    const filtered = allScored.filter((c) => hasRequiredJobTitle(c.headline, agent.icp.jobTitles));
    if (filtered.length < allScored.length) {
      emit({ type: "info", message: `Discovery shortlist: filtered ${allScored.length - filtered.length} candidates without a strong role/title match` });
    }
    shortlisted = filtered;
  }

  const shortlistedProviderIds = new Set(shortlisted.map((candidate) => candidate.providerId));

  // ── Save as leads ──

  let saved = 0;
  const campaign = targetCampaign;

  if (!dryRun) {
    for (const candidate of allScored) {
      const signalCandidate: SignalCandidate = {
        id: "",
        workspaceId: campaign?.workspaceId || agent.workspaceId,
        agentId,
        campaignId: targetCampaignId,
        providerId: candidate.providerId,
        name: candidate.name,
        headline: candidate.headline,
        location: candidate.location,
        publicIdentifier: candidate.publicIdentifier,
        networkDistance: candidate.networkDistance,
        signalSource: candidate.signalSource,
      signalContext: candidate.signalContext,
      sourcePostId: candidate.sourcePostId,
      topicKey: candidate.topicKey,
      topicLabel: candidate.topicLabel,
      signalKind: candidate.signalKind,
      signalPayload: candidate.signalPayload,
      language: detectLang(candidate.location, candidate.name),
      icpFit: candidate.icpFit,
      intentScore: candidate.intentScore,
        totalScore: candidate.totalScore,
        scoreReasoning: candidate.scoreReasoning,
        status: shortlistedProviderIds.has(candidate.providerId) ? "shortlisted" : "new",
        createdAt: "",
        updatedAt: "",
      };

      await store.saveSignalCandidate(signalCandidate);
    }
  }

  if (!dryRun && targetCampaignId) {
    const segment = campaign?.segment || "discovered";

    for (const candidate of shortlisted) {
      const lead: Lead = {
        id: "",
        workspaceId: campaign?.workspaceId || agent.workspaceId,
        campaignId: targetCampaignId,
        providerId: candidate.providerId,
        name: candidate.name,
        headline: candidate.headline,
        company: "",
        location: candidate.location,
        publicIdentifier: candidate.publicIdentifier,
        networkDistance: candidate.networkDistance,
        profilePictureUrl: candidate.profilePictureUrl,
        segment,
        language: detectLang(candidate.location, candidate.name),
        aiScore: candidate.totalScore,
        signal: JSON.stringify({
          source: candidate.signalSource,
          context: candidate.signalContext,
          topicKey: candidate.topicKey,
          topicLabel: candidate.topicLabel,
          signalKind: candidate.signalKind,
          signalPayload: candidate.signalPayload,
          icpFit: candidate.icpFit,
          intentScore: candidate.intentScore,
          reasoning: candidate.scoreReasoning,
        }),
        status: "discovered",
        currentStep: 0,
        events: [
          {
            ts: new Date().toISOString(),
            type: "discovered",
            message: `${candidate.signalSource}: ${candidate.signalContext}`,
          },
        ],
        createdAt: "",
        updatedAt: "",
      };

      const savedLead = await store.saveLead(lead);
      await store.saveSignalCandidate({
        id: "",
        workspaceId: campaign?.workspaceId || agent.workspaceId,
        agentId,
        campaignId: targetCampaignId,
        leadId: savedLead.id,
        providerId: candidate.providerId,
        name: candidate.name,
        headline: candidate.headline,
        location: candidate.location,
        publicIdentifier: candidate.publicIdentifier,
        networkDistance: candidate.networkDistance,
        signalSource: candidate.signalSource,
        signalContext: candidate.signalContext,
        sourcePostId: candidate.sourcePostId,
        topicKey: candidate.topicKey,
        topicLabel: candidate.topicLabel,
        signalKind: candidate.signalKind,
        signalPayload: candidate.signalPayload,
        language: detectLang(candidate.location, candidate.name),
        icpFit: candidate.icpFit,
        intentScore: candidate.intentScore,
        totalScore: candidate.totalScore,
        scoreReasoning: candidate.scoreReasoning,
        status: "promoted",
        createdAt: "",
        updatedAt: "",
      });
      saved++;
      emit({ type: "saved", message: `Saved: ${candidate.name} (score ${candidate.totalScore})`, candidate });
    }
  }

  // ── Log run ──

  // Merge internal warnings into errors
  const allErrors = [...errors, ..._runWarnings];
  if (_runWarnings.length > 0) {
    emit({ type: "info", message: `Warnings from sources: ${_runWarnings.length}` });
  }

  const run: DiscoveryRun = {
    id: runId,
    workspaceId: campaign?.workspaceId || agent.workspaceId,
    agentId,
    startedAt,
    completedAt: new Date().toISOString(),
    status: allErrors.length > 0 && shortlisted.length === 0 ? "error" : "completed",
    sources: runSources,
    totalDiscovered: shortlisted.length,
    totalDuplicates: duplicates,
    totalSaved: saved,
    errors: allErrors,
  };

  await store.saveDiscoveryRun(run);

  emit({ type: "info", message: `Done: ${shortlisted.length} discovered, ${saved} saved, ${duplicates} duplicates` });

  return {
    status: run.status,
    discovered: shortlisted.length,
    duplicates,
    saved,
    errors: allErrors.length,
    candidates: shortlisted,
    run,
  };
}

// ── Simple language detection ───────────────────────────────────────────

function detectLang(location: string, name: string): "it" | "en" {
  const loc = location.toLowerCase();
  const itLocs = ["italy", "italia", "milan", "rome", "turin", "naples", "florence", "bologna", "venice", "palermo"];
  if (itLocs.some((it) => loc.includes(it))) return "it";

  const lastName = name.split(" ").slice(-1)[0]?.toLowerCase() || "";
  const itSuffixes = ["ini", "oni", "elli", "etti", "ucci", "ino", "ina", "ano", "ato", "aro", "oro"];
  if (itSuffixes.some((s) => lastName.endsWith(s))) return "it";

  return "en";
}
