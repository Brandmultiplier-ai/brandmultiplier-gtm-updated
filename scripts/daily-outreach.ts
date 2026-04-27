/**
 * BrandMultiplier GTM — Legacy Daily Outreach Script
 *
 * Legacy keyword-search invite runner kept for debugging and dry runs.
 * Live sends are disabled by default so pacing always goes through the
 * campaign scheduler (`scripts/run-campaign.ts` / `/api/outreach`).
 *
 * Usage:
 *   npx tsx scripts/daily-outreach.ts [--segment freelancer] [--dry-run] [--max 10]
 *
 * Requires .env.local with UNIPILE_API_KEY, UNIPILE_BASE_URL, UNIPILE_ACCOUNT_ID
 */

import { readFileSync, appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { classifyInviteResponse } from "../src/lib/unipile";

// ── Config ──────────────────────────────────────────────────────────────

const ROOT = join(new URL(".", import.meta.url).pathname, "..");
const PLAYBOOK_PATH = join(ROOT, "playbooks", "c4g.json");
const SENT_LOG = join(ROOT, "data", "sent-invites.jsonl");
const RUN_LOG = join(ROOT, "data", "outreach-runs.jsonl");
const DATA_DIR = join(ROOT, "data");

// Load env from .env.local
const envPath = join(ROOT, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^(\w+)=(.+)$/);
    if (match) process.env[match[1]] = match[2];
  }
}

const API_KEY = process.env.UNIPILE_API_KEY!;
const BASE_URL = process.env.UNIPILE_BASE_URL!;
const ACCOUNT_ID = process.env.UNIPILE_ACCOUNT_ID!;

if (!API_KEY || !BASE_URL || !ACCOUNT_ID) {
  console.error("Missing env vars. Check .env.local");
  process.exit(1);
}

// ── Parse CLI args ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const segmentFilter = args.includes("--segment")
  ? args[args.indexOf("--segment") + 1]
  : null;
const maxInvites = args.includes("--max")
  ? parseInt(args[args.indexOf("--max") + 1])
  : null;

if (!dryRun && process.env.ALLOW_LEGACY_DAILY_OUTREACH_LIVE !== "true") {
  console.error("Legacy live outreach is disabled. Use scripts/run-campaign.ts for paced sends.");
  process.exit(1);
}

// ── Types ───────────────────────────────────────────────────────────────

interface Playbook {
  tenant: string;
  icp: {
    segments: Segment[];
    antiPersonas: string[];
  };
  voice: Record<string, { tone: string; constraints: string[] }>;
  limits: {
    invitesPerDay: number;
    delayBetweenInvitesMs: number;
    maxMessageLength: number;
  };
  messageTemplates: Record<string, string[]>;
}

interface Segment {
  id: string;
  label: string;
  keywords: string;
  titleFilter: string;
  language: string;
  locations: string[];
}

interface LinkedInPerson {
  type: string;
  id: string;
  name: string;
  public_identifier: string;
  headline: string;
  location: string;
  network_distance: string;
  shared_connections_count?: number;
  followers_count?: number;
  primary_locale?: { country: string; language: string };
}

// ── API helpers ─────────────────────────────────────────────────────────

const headers = {
  "X-API-KEY": API_KEY,
  accept: "application/json",
  "content-type": "application/json",
};

async function api(path: string, opts?: RequestInit) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE_URL}/api/v1${path}${sep}account_id=${ACCOUNT_ID}`;
  const res = await fetch(url, { ...opts, headers: { ...headers, ...opts?.headers } });
  const body = await res.json();
  if (!res.ok && !body.status) {
    body.status = res.status;
  }
  body._httpStatus = res.status;
  return body;
}

async function searchPeople(keywords: string, titleFilter?: string): Promise<LinkedInPerson[]> {
  const body: Record<string, unknown> = {
    api: "classic",
    category: "people",
    keywords,
  };
  if (titleFilter) {
    body.advanced_keywords = { title: titleFilter };
  }
  const result = await api("/linkedin/search", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return result.items || [];
}

async function sendInvite(providerId: string, message: string) {
  return api("/users/invite", {
    method: "POST",
    body: JSON.stringify({
      provider_id: providerId,
      account_id: ACCOUNT_ID,
      message,
    }),
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────

function loadSentIds(): Set<string> {
  if (!existsSync(SENT_LOG)) return new Set();
  const lines = readFileSync(SENT_LOG, "utf-8").trim().split("\n").filter(Boolean);
  return new Set(lines.map((l) => JSON.parse(l).providerId));
}

function logSent(entry: Record<string, unknown>) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  appendFileSync(SENT_LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
}

function logRun(entry: Record<string, unknown>) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  appendFileSync(RUN_LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
}

// Italian-speaking locations for language detection
const IT_LOCATIONS = ["italy", "italia", "milan", "rome", "turin", "naples", "florence",
  "bologna", "venice", "genoa", "palermo", "catania", "bari", "verona", "padova",
  "trieste", "brescia", "parma", "modena", "reggio", "cagliari", "perugia", "livorno",
  "rimini", "bergamo", "trento", "monza", "campania", "lombardy", "lazio", "veneto",
  "toscana", "puglia", "sicilia", "sardegna", "emilia", "piemonte", "liguria", "saronno"];

function detectLanguage(person: LinkedInPerson): "it" | "en" {
  // Check location for Italian cities
  const loc = (person.location || "").toLowerCase();
  if (IT_LOCATIONS.some((it) => loc.includes(it))) return "it";

  // Check if name looks Italian (common surname endings)
  const lastName = person.name.split(" ").slice(-1)[0]?.toLowerCase() || "";
  const italianSuffixes = ["ini", "oni", "elli", "etti", "ucci", "acci", "arini", "olini", "ardi",
    "erio", "asso", "otta", "ardi", "aldi", "anti", "anzi", "ione", "ello", "ella", "ino", "ina",
    "ano", "ato", "aro", "oro", "eri", "uri", "oli", "ali"];
  const italianNames = ["dalterio", "d'alterio", "giordano", "pellicciotta", "antinucci",
    "tartarini", "nardi", "capasso", "messina", "confalonieri", "tomasone", "donadio", "galli"];
  const normalizedLast = lastName.replace(/['']/g, "");
  if (italianNames.some((n) => normalizedLast === n || person.name.toLowerCase().includes(n))) return "it";
  if (italianSuffixes.some((s) => lastName.endsWith(s))) return "it";

  return "en";
}

function isAntiPersona(headline: string, antiPersonas: string[]): boolean {
  const lower = headline.toLowerCase();
  return antiPersonas.some((ap) => lower.includes(ap.toLowerCase()));
}

/** Extract a specific detail from headline for better personalization */
function extractDetail(headline: string): string | null {
  // Extract company/product name after @ or "Founder of" or "Co-Founder"
  const atMatch = headline.match(/@\s*([A-Za-z0-9_.]+)/);
  if (atMatch) return atMatch[1];

  const founderOf = headline.match(/(?:founder|co-founder)\s+(?:of\s+)?([A-Za-z0-9]+)/i);
  if (founderOf) return founderOf[1];

  return null;
}

function personalizeFromHeadline(headline: string, lang: string): string {
  const hl = headline.toLowerCase();
  const detail = extractDetail(headline);

  if (lang === "it") {
    if (detail && (hl.includes("founder") || hl.includes("co-founder")))
      return `complimenti per ${detail}`;
    if (hl.includes("founder") || hl.includes("co-founder"))
      return `bel percorso da founder`;
    if (hl.includes("freelance") && hl.includes("ai"))
      return `vedo che unisci freelancing e AI`;
    if (hl.includes("ai") && hl.includes("marketing"))
      return `bel mix AI e marketing`;
    if (hl.includes("freelance") || hl.includes("consultant"))
      return `vedo che lavori come freelance nel marketing`;
    if (hl.includes("ai") || hl.includes("automation"))
      return `vedo che ti occupi di AI`;
    if (hl.includes("growth"))
      return `vedo che ti occupi di growth`;
    if (hl.includes("marketing"))
      return `vedo che sei nel marketing`;
    return `bel profilo`;
  }

  // EN
  if (detail && (hl.includes("founder") || hl.includes("co-founder")))
    return `congrats on building ${detail}`;
  if (hl.includes("founder") || hl.includes("co-founder"))
    return `great founder journey`;
  if (hl.includes("freelance") && hl.includes("ai"))
    return `love the AI + freelance combo`;
  if (hl.includes("ai") && hl.includes("marketing"))
    return `great mix of AI and marketing`;
  if (hl.includes("freelance") || hl.includes("consultant"))
    return `saw your freelance marketing work`;
  if (hl.includes("ai") || hl.includes("automation"))
    return `saw you work with AI`;
  if (hl.includes("growth") || hl.includes("gtm"))
    return `saw your growth background`;
  if (hl.includes("marketing"))
    return `saw your marketing background`;
  return `interesting profile`;
}

const SEGMENT_LABELS_EN: Record<string, string> = {
  "Freelancer & Consulenti": "freelancers and consultants",
  "Personal Brand & Creator": "personal brands and creators",
  "Solopreneur & Piccoli founder": "solopreneurs",
  "Marketer one-man-band": "solo marketers",
};

function buildMessage(
  templates: string[],
  firstName: string,
  personalization: string,
  segmentLabel: string,
  lang: string,
  maxLength: number
): string {
  const template = templates[Math.floor(Math.random() * templates.length)];
  const label = lang === "en" ? (SEGMENT_LABELS_EN[segmentLabel] || segmentLabel) : segmentLabel;
  let msg = template
    .replace("{{firstName}}", firstName)
    .replace("{{personalization}}", personalization)
    .replace("{{segment}}", label);

  // Truncate if over limit
  if (msg.length > maxLength) {
    msg = msg.substring(0, maxLength - 3) + "...";
  }
  return msg;
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 BrandMultiplier GTM — Daily Outreach");
  console.log(`   Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  if (segmentFilter) console.log(`   Segment: ${segmentFilter}`);

  const playbook: Playbook = JSON.parse(readFileSync(PLAYBOOK_PATH, "utf-8"));
  const sentIds = loadSentIds();
  const dailyLimit = maxInvites ?? playbook.limits.invitesPerDay;
  const runCap = dryRun ? dailyLimit : Math.min(1, dailyLimit);

  console.log(`   Daily limit: ${dailyLimit}`);
  console.log(`   Run cap: ${runCap}${dryRun ? " (preview)" : " (single live tick)"}`);
  console.log(`   Already sent: ${sentIds.size} total`);
  console.log("");

  let totalSent = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  const segments = segmentFilter
    ? playbook.icp.segments.filter((s) => s.id === segmentFilter)
    : playbook.icp.segments;

  if (segments.length === 0) {
    console.error(`Segment "${segmentFilter}" not found in playbook`);
    process.exit(1);
  }

  for (const segment of segments) {
    if (totalSent >= runCap) break;

    console.log(`── Segment: ${segment.label} (${segment.id}) ──`);

    // Search prospects
    const people = await searchPeople(segment.keywords, segment.titleFilter);
    console.log(`   Found ${people.length} prospects`);

    for (const person of people) {
      if (totalSent >= runCap) break;

      // Skip already contacted
      if (sentIds.has(person.id)) {
        continue;
      }

      // Skip anti-personas
      if (isAntiPersona(person.headline || "", playbook.icp.antiPersonas)) {
        console.log(`   ⏭ ${person.name} — anti-persona (${person.headline})`);
        totalSkipped++;
        continue;
      }

      // Skip 3rd+ degree (lower accept rate)
      if (person.network_distance === "DISTANCE_3" || person.network_distance === "OUT_OF_NETWORK") {
        console.log(`   ⏭ ${person.name} — ${person.network_distance}`);
        totalSkipped++;
        continue;
      }

      // Detect language from profile, not segment
      const lang = detectLanguage(person);
      const templates = playbook.messageTemplates[lang] || playbook.messageTemplates["en"];

      // Build personalized message
      const firstName = person.name.split(" ")[0];
      const personalization = personalizeFromHeadline(person.headline || "", lang);
      const message = buildMessage(templates, firstName, personalization, segment.label, lang, playbook.limits.maxMessageLength);

      console.log(`   → ${person.name} (${person.location})`);
      console.log(`     "${message}"`);

      if (dryRun) {
        console.log(`     [DRY RUN — not sent]`);
        totalSent++;
        continue;
      }

      // Send invite
      const result = await sendInvite(person.id, message);
      const inviteState = classifyInviteResponse(result);

      if (inviteState.isError) {
        console.log(`     ❌ Error: ${inviteState.message || "Invite failed"}`);

        if (inviteState.kind === "provider_limit" || inviteState.kind === "rate_limited") {
          totalErrors++;
          console.log("\n⚠️  Rate limited by LinkedIn. Stopping.");
          logRun({ status: "rate_limited", sent: totalSent, skipped: totalSkipped, errors: totalErrors });
          process.exit(0);
        }

        if (inviteState.kind === "already_invited") {
          totalSkipped++;
          continue;
        }

        totalErrors++;
        continue;
      }

      console.log(`     ✅ Sent!`);
      totalSent++;
      sentIds.add(person.id);

      logSent({
        providerId: person.id,
        name: person.name,
        headline: person.headline,
        location: person.location,
        segment: segment.id,
        message,
      });

      // Also save to unified store for dashboard visibility
      try {
        const storeModule = await import("../src/lib/store");
        storeModule.saveLead({
          id: "",
          workspaceId: "ws_default",
          campaignId: `cmp_c4g_${segment.id}`,
          providerId: person.id,
          name: person.name,
          headline: person.headline || "",
          company: "",
          location: person.location || "",
          publicIdentifier: person.public_identifier || "",
          networkDistance: person.network_distance || "",
          segment: segment.id,
          language: lang,
          aiScore: 1,
          signal: `Matched ICP: ${segment.label}`,
          status: "invite_sent",
          currentStep: 1,
          events: [{
            ts: new Date().toISOString(),
            type: "invite_sent" as const,
            step: 1,
            message,
          }],
          createdAt: "",
          updatedAt: "",
        });
      } catch {
        // Store not available in script context, skip
      }

    }

    console.log("");
  }

  console.log("── Summary ──");
  console.log(`   Sent: ${totalSent}`);
  console.log(`   Skipped: ${totalSkipped}`);
  console.log(`   Errors: ${totalErrors}`);

  logRun({ status: "completed", sent: totalSent, skipped: totalSkipped, errors: totalErrors });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
