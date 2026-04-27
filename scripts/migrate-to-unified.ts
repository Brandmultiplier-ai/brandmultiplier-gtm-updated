/**
 * Migration script: playbooks + sequences → unified store
 *
 * Reads:
 *   - playbooks/c4g.json       → Agent
 *   - sequences/c4g/*.json     → Campaigns (one per segment)
 *   - data/sent-invites.jsonl  → Leads with status invite_sent
 *
 * Usage: npx tsx scripts/migrate-to-unified.ts
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import * as store from "../src/lib/store";
import type { Agent, Campaign, Lead } from "../src/lib/types";

const ROOT = new URL("..", import.meta.url).pathname;

// ── Load playbook ──────────────────────────────────────────────────────

const playbookPath = join(ROOT, "playbooks", "c4g.json");
if (!existsSync(playbookPath)) {
  console.error("playbooks/c4g.json not found");
  process.exit(1);
}

const playbook = JSON.parse(readFileSync(playbookPath, "utf-8"));
console.log(`Loaded playbook: ${playbook.name}`);

// ── Create Agent ───────────────────────────────────────────────────────

const agent: Agent = {
  id: "agt_c4g_main",
  workspaceId: "ws_default",
  name: "C4G Freelancer Outreach",
  status: "active",
  createdAt: "2026-03-13T10:30:00.000Z",
  updatedAt: new Date().toISOString(),

  icp: {
    jobTitles: [
      "Founder", "Freelancer", "Consultant", "Coach",
      "Solopreneur", "Creator", "CMO", "Head of Marketing",
    ],
    locations: ["Italy", "United Kingdom", "Germany"],
    industries: [
      "Marketing & Advertising", "IT Services & Consulting",
      "E-commerce", "Software Development & SaaS",
    ],
    companySizes: ["1-10 employees", "11-50 employees"],
    excludeKeywords: playbook.icp.antiPersonas,
    matchingMode: "discovery",
  },

  signals: {
    personalProfile: "https://www.linkedin.com/in/lucavizzielli",
    companyPage: "",
    trackProfileVisitors: true,
    trackCompanyFollowers: false,
    engagementKeywords: ["AI marketing", "marketing automation", "freelance marketing", "personal brand"],
    watchProfiles: [],
    triggerEvents: {
      topActiveProfiles: true,
      recentFunding: false,
      jobChanges: true,
    },
    competitorPages: [],
  },

  voice: playbook.voice,
  limits: {
    invitesPerDay: playbook.limits.invitesPerDay,
    invitesPerWeek: playbook.limits.invitesPerWeek || 80,
    delayBetweenInvitesMs: playbook.limits.delayBetweenInvitesMs,
    maxMessageLength: playbook.limits.maxMessageLength,
  },
  messageTemplates: playbook.messageTemplates,
};

store.saveAgent(agent);
console.log(`Created agent: ${agent.id} (${agent.name})`);

// ── Create Campaigns from sequences ────────────────────────────────────

const seqDir = join(ROOT, "sequences", "c4g");
const campaigns: Campaign[] = [];

if (existsSync(seqDir)) {
  for (const file of readdirSync(seqDir).filter((f) => f.endsWith(".json"))) {
    const seq = JSON.parse(readFileSync(join(seqDir, file), "utf-8"));
    const segmentId = seq.segment;

    // Find matching segment in playbook
    const playbookSegment = playbook.icp.segments.find(
      (s: { id: string }) => s.id === segmentId
    );

    const campaign: Campaign = {
      id: `cmp_c4g_${segmentId}`,
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      name: `C4G ${playbookSegment?.label || segmentId}`,
      status: segmentId === "freelancer" ? "active" : "draft",
      segment: segmentId,
      createdAt: "2026-03-13T10:30:00.000Z",
      updatedAt: new Date().toISOString(),
      search: {
        keywords: playbookSegment?.keywords || seq.search?.keywords?.join(" ") || segmentId,
        titleFilter: playbookSegment?.titleFilter || seq.search?.roles?.join(" OR ") || "",
        language: playbookSegment?.language || "it",
        locations: playbookSegment?.locations?.length
          ? playbookSegment.locations
          : seq.search?.locations || ["Italy"],
      },
      sequence: (seq.sequence || []).map(
        (s: { step: number; type: string; delay_days: number; trigger?: string; note?: string; text?: string }) => ({
          step: s.step,
          type: s.type === "connection_request" ? "connection_request" : s.type === "message" ? "message" : "profile_visit",
          delayDays: s.delay_days,
          trigger: s.trigger || "immediate",
          content: s.note || s.text || "",
        })
      ),
    };

    store.saveCampaign(campaign);
    campaigns.push(campaign);
    console.log(`Created campaign: ${campaign.id} (${campaign.name}) — ${campaign.status}`);
  }
}

// ── Import sent invites as Leads ───────────────────────────────────────

const sentLog = join(ROOT, "data", "sent-invites.jsonl");
let importedLeads = 0;

if (existsSync(sentLog)) {
  const lines = readFileSync(sentLog, "utf-8").trim().split("\n").filter(Boolean);

  // Default to freelancer campaign
  const defaultCampaign = campaigns.find((c) => c.segment === "freelancer") || campaigns[0];

  for (const line of lines) {
    const entry = JSON.parse(line);
    const campaignId =
      campaigns.find((c) => c.segment === entry.segment)?.id || defaultCampaign?.id;

    if (!campaignId) continue;

    const lead: Lead = {
      id: "",
      workspaceId: "ws_default",
      campaignId,
      providerId: entry.providerId,
      name: entry.name || "Unknown",
      headline: entry.headline || "",
      company: "",
      location: entry.location || "",
      publicIdentifier: "",
      networkDistance: "",
      segment: entry.segment || "freelancer",
      language: "it",
      aiScore: 1,
      signal: `Matched ICP: ${entry.segment || "freelancer"}`,
      status: "invite_sent",
      currentStep: 1,
      events: [
        {
          ts: entry.ts || "2026-03-13T10:34:00.000Z",
          type: "invite_sent",
          step: 1,
          message: entry.message || "",
        },
      ],
      createdAt: entry.ts || "2026-03-13T10:34:00.000Z",
      updatedAt: entry.ts || "2026-03-13T10:34:00.000Z",
    };

    store.saveLead(lead);
    importedLeads++;
  }
  console.log(`Imported ${importedLeads} leads from sent-invites.jsonl`);
} else {
  console.log("No sent-invites.jsonl found — no leads to import");
}

// ── Summary ────────────────────────────────────────────────────────────

console.log("\n--- Migration complete ---");
console.log(`Agent:     ${agent.id}`);
console.log(`Campaigns: ${campaigns.length}`);
console.log(`Leads:     ${importedLeads}`);
console.log("\nData written to:");
console.log("  data/agents/");
console.log("  data/campaigns/");
console.log("  data/leads/");
