/**
 * Brain v0 — Analyzer
 *
 * Reads all leads and computes conversion patterns across dimensions:
 * segment, language, network distance, template, day of week, AI score, campaign.
 */

import * as store from "../store";
import type {
  Lead,
  Agent,
  ConversionMetrics,
  BrainPatterns,
} from "../types";
import { hashTemplate } from "./template-utils";

// ── Helpers ─────────────────────────────────────────────────────────────

function emptyMetrics(): ConversionMetrics {
  return { total: 0, sent: 0, accepted: 0, replied: 0, connectRate: 0, replyRate: 0, replyOfAccepted: 0 };
}

function finalizeMetrics(m: ConversionMetrics): ConversionMetrics {
  m.connectRate = m.sent > 0 ? Math.round((m.accepted / m.sent) * 1000) / 10 : 0;
  m.replyRate = m.sent > 0 ? Math.round((m.replied / m.sent) * 1000) / 10 : 0;
  m.replyOfAccepted = m.accepted > 0 ? Math.round((m.replied / m.accepted) * 1000) / 10 : 0;
  return m;
}

function hasSent(lead: Lead): boolean {
  return lead.events.some((e) => e.type === "invite_sent");
}

function hasAccepted(lead: Lead): boolean {
  return lead.events.some((e) => e.type === "accepted");
}

function hasReplied(lead: Lead): boolean {
  return lead.events.some((e) => e.type === "replied");
}

function addLead(bucket: Record<string, ConversionMetrics>, key: string, lead: Lead) {
  if (!bucket[key]) bucket[key] = emptyMetrics();
  const m = bucket[key];
  m.total++;
  if (hasSent(lead)) m.sent++;
  if (hasAccepted(lead)) m.accepted++;
  if (hasReplied(lead)) m.replied++;
}

function daysBetween(isoA: string, isoB: string): number {
  return (new Date(isoB).getTime() - new Date(isoA).getTime()) / 86400000;
}

function getEventTs(lead: Lead, type: string): string | null {
  const ev = lead.events.find((e) => e.type === type);
  return ev?.ts || null;
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
    : Math.round(sorted[mid] * 10) / 10;
}

function average(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
}

// ── Template detection ──────────────────────────────────────────────────

export function detectTemplateIndex(lead: Lead, agent: Agent): string {
  const templates = agent.messageTemplates[lead.language] || agent.messageTemplates["en"] || [];

  if (lead.templateHash) {
    const matchedIndex = templates.findIndex((template) => hashTemplate(template) === lead.templateHash);
    if (matchedIndex >= 0) return String(matchedIndex);
    return "unknown";
  }

  if (typeof lead.templateIndex === "number" && Number.isInteger(lead.templateIndex) && lead.templateIndex >= 0) {
    return String(lead.templateIndex);
  }

  const inviteEvent = lead.events.find((e) => e.type === "invite_sent" && e.message);
  if (!inviteEvent?.message) return "unknown";

  const msg = inviteEvent.message.replace(/^\[DRY RUN\] /, "");

  // Extract static fragments from each template (parts between {{...}})
  // Then match against the actual message
  for (let i = 0; i < templates.length; i++) {
    const fragments = templates[i].split(/\{\{[^}]+\}\}/).filter((f) => f.trim().length >= 4);
    if (fragments.length === 0) continue;
    // Check if any fragment (beyond greeting) exists in the message
    const matchCount = fragments.filter((f) => msg.includes(f.trim())).length;
    if (matchCount >= Math.max(1, fragments.length - 1)) {
      return String(i);
    }
  }
  return "unknown";
}

// ── Main analysis ───────────────────────────────────────────────────────

export async function analyzeLeads(workspaceId?: string): Promise<BrainPatterns> {
  const allLeads = await store.getAllLeads({ workspaceId });
  const leads = allLeads.filter((l) => l.status !== "skipped");
  const campaigns = await store.listCampaigns({ workspaceId });

  // Load agents for template detection
  const agentCache: Record<string, Agent | null> = {};
  for (const c of campaigns) {
    if (!agentCache[c.agentId]) {
      agentCache[c.agentId] = await store.getAgent(c.agentId);
    }
  }

  const patterns: BrainPatterns = {
    bySegment: {},
    byLanguage: {},
    byNetworkDistance: {},
    byTemplateIndex: {},
    byDayOfWeek: {},
    byAiScoreBucket: {},
    byCampaign: {},
    avgDaysToAccept: null,
    avgDaysToReply: null,
    overall: emptyMetrics(),
  };

  const daysToAccept: number[] = [];
  const daysToReply: number[] = [];

  for (const lead of leads) {
    // Overall
    patterns.overall.total++;
    if (hasSent(lead)) patterns.overall.sent++;
    if (hasAccepted(lead)) patterns.overall.accepted++;
    if (hasReplied(lead)) patterns.overall.replied++;

    // By segment
    addLead(patterns.bySegment, lead.segment || "unknown", lead);

    // By language
    addLead(patterns.byLanguage, lead.language || "unknown", lead);

    // By network distance
    addLead(patterns.byNetworkDistance, lead.networkDistance || "unknown", lead);

    // By AI score bucket
    addLead(patterns.byAiScoreBucket, String(lead.aiScore || 0), lead);

    // By campaign
    addLead(patterns.byCampaign, lead.campaignId, lead);

    // By template index
    const campaign = campaigns.find((c) => c.id === lead.campaignId);
    const agent = campaign ? agentCache[campaign.agentId] : null;
    if (agent) {
      const tplIdx = detectTemplateIndex(lead, agent);
      const templateKey = tplIdx === "unknown"
        ? "unknown"
        : `${lead.campaignId}:${lead.language}:${tplIdx}`;
      addLead(patterns.byTemplateIndex, templateKey, lead);
    }

    // By day of week
    const inviteTs = getEventTs(lead, "invite_sent");
    if (inviteTs) {
      const day = new Date(inviteTs).getDay();
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      addLead(patterns.byDayOfWeek, dayNames[day], lead);
    }

    // Timing: invite → accept
    const acceptTs = getEventTs(lead, "accepted");
    if (inviteTs && acceptTs) {
      const d = daysBetween(inviteTs, acceptTs);
      if (d >= 0) daysToAccept.push(d);
    }

    // Timing: invite → reply (or accept → reply)
    const replyTs = getEventTs(lead, "replied");
    if (inviteTs && replyTs) {
      const d = daysBetween(inviteTs, replyTs);
      if (d >= 0) daysToReply.push(d);
    }
  }

  // Finalize all metrics
  finalizeMetrics(patterns.overall);
  for (const bucket of [
    patterns.bySegment, patterns.byLanguage, patterns.byNetworkDistance,
    patterns.byTemplateIndex, patterns.byDayOfWeek, patterns.byAiScoreBucket,
    patterns.byCampaign,
  ]) {
    for (const key of Object.keys(bucket)) {
      finalizeMetrics(bucket[key]);
    }
  }

  // Timing
  patterns.avgDaysToAccept = average(daysToAccept);
  patterns.avgDaysToReply = average(daysToReply);

  return patterns;
}
