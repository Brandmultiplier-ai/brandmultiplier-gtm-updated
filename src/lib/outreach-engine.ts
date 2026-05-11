/**
 * BrandMultiplier GTM — Outreach Engine (v2)
 *
 * Reads from unified store (Agent → Campaign → Lead).
 * Backwards-compatible: can still run with campaignId or legacy playbook mode.
 */

import { classifyInviteResponse, searchPeople, sendInvite, getProfile } from "./unipile";
import * as store from "./store";
import type { Agent, BrainExperiment, Campaign, CampaignExecutionState, Lead } from "./types";
import { selectTemplate } from "./brain/template-selector";
import { isBrainExperimentsEnabled } from "./brain/feature-flags";
import { getActiveExperiment, updateExperiment } from "./brain/experiment-store";
import { hashTemplate } from "./brain/template-utils";
import {
  campaignMatchesMarketLocation,
  isItalyLocation,
  isKnownForeignLocation,
  leadMatchesCampaignMarket,
  marketMismatchReason,
  resolveLeadOutreachLanguage,
} from "./campaign-targeting";
import {
  consumeSeatQuota,
  getSeatScheduleStatus,
  resolveWorkspaceLinkedInClientConfig,
  getSeatWarmupState,
  markSeatProspectingRun,
  persistNormalizedSeat,
  recordSeatWarmupRateLimit,
  resolveLinkedInSeatForCampaign,
  seatDailyQuota,
  seatEffectiveQuotas,
  seatQuotaUsage,
} from "./linkedin-seats";
import { isNeverTargetProfile } from "./profile-targeting";

// ── Types ───────────────────────────────────────────────────────────────

export interface LinkedInPerson {
  type: string;
  id: string;
  name: string;
  public_identifier: string;
  headline: string;
  location: string;
  network_distance: string;
  shared_connections_count?: number;
  followers_count?: number;
}

export interface OutreachEvent {
  type: "sent" | "skipped" | "error" | "rate_limited" | "info";
  name?: string;
  location?: string;
  message?: string;
  reason?: string;
}

export interface RunOptions {
  workspaceId?: string;
  campaignId: string;
  dryRun?: boolean;
  maxInvites?: number;
  ignoreWeekendPause?: boolean;
  ignoreScheduleWindow?: boolean;
  inlineSendNewProspects?: boolean;
  onEvent?: (event: OutreachEvent) => void;
}

export interface RunResult {
  status: "completed" | "rate_limited";
  sent: number;
  skipped: number;
  errors: number;
  events: OutreachEvent[];
}

// ── Italian detection ───────────────────────────────────────────────────

const ITALIAN_SUFFIXES = [
  "ini", "oni", "elli", "etti", "ucci", "acci", "arini", "olini", "ardi",
  "erio", "asso", "otta", "aldi", "anti", "anzi", "ione", "ello", "ella",
  "ino", "ina", "ano", "ato", "aro", "oro", "eri", "uri", "oli", "ali",
  "izzi", "ezzi", "uzzi",
];

export function detectLanguage(person: LinkedInPerson): "it" | "en" {
  if (isItalyLocation(person.location)) return "it";
  if (isKnownForeignLocation(person.location)) return "en";

  const lastName = person.name.split(" ").slice(-1)[0]?.toLowerCase() || "";
  if (ITALIAN_SUFFIXES.some((s) => lastName.endsWith(s))) return "it";

  return "en";
}

// ── Personalization ─────────────────────────────────────────────────────

function extractDetail(headline: string): string | null {
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
    if (hl.includes("growth")) return `vedo che ti occupi di growth`;
    if (hl.includes("marketing")) return `vedo che sei nel marketing`;
    return `bel profilo`;
  }

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
  if (hl.includes("marketing")) return `saw your marketing background`;
  return `interesting profile`;
}

function buildMessage(
  templates: string[],
  templateIndex: number,
  firstName: string,
  personalization: string,
  segment: string,
  lang: string,
  maxLength: number
): string {
  const template = templates[templateIndex] || templates[0];
  let msg = template
    .replace("{{firstName}}", firstName)
    .replace("{{first_name}}", firstName)
    .replace("{{personalization}}", personalization)
    .replace("{{segment}}", segment);
  if (msg.length > maxLength) {
    msg = msg.substring(0, maxLength - 3) + "...";
  }
  return msg;
}

function buildMessageFromTemplate(
  template: string,
  firstName: string,
  personalization: string,
  segment: string,
  maxLength: number
): string {
  let msg = template
    .replace("{{firstName}}", firstName)
    .replace("{{first_name}}", firstName)
    .replace("{{personalization}}", personalization)
    .replace("{{segment}}", segment);
  if (msg.length > maxLength) {
    msg = msg.substring(0, maxLength - 3) + "...";
  }
  return msg;
}

function personalizeLeadTemplate(template: string, lead: Lead): string {
  const firstName = lead.name.split(" ")[0];
  return template
    .replace(/\{\{first_name\}\}/gi, firstName)
    .replace(/\{\{firstName\}\}/g, firstName)
    .replace(/\{\{name\}\}/gi, lead.name);
}

function normalizeLanguage(value: string | undefined): string {
  return value?.trim().toLowerCase() || "";
}

function languagesMatchCampaign(leadLanguage: string | undefined, campaign: Campaign): boolean {
  const normalizedLeadLanguage = normalizeLanguage(leadLanguage);
  const campaignLanguage = normalizeLanguage(campaign.search.language);

  if (!normalizedLeadLanguage || !campaignLanguage) return true;
  return normalizedLeadLanguage === campaignLanguage;
}

function leadMatchesCampaignLanguage(lead: Lead, campaign: Campaign): boolean {
  return languagesMatchCampaign(resolveLeadOutreachLanguage(lead), campaign);
}

function languageMismatchReason(leadLanguage: string | undefined, campaignLanguage: string | undefined): string {
  return `language mismatch (campaign: ${campaignLanguage || "unknown"}, lead: ${leadLanguage || "unknown"})`;
}

function leadMatchesCampaignTarget(lead: Lead, campaign: Campaign): boolean {
  return leadMatchesCampaignLanguage(lead, campaign) && leadMatchesCampaignMarket(lead, campaign);
}

function resolveInviteSource(campaign: Campaign): "campaign_step" | "template_library" {
  return campaign.settings?.inviteSource === "template_library" ? "template_library" : "campaign_step";
}

function resolveAutopilotDraftMode(campaign: Campaign): "ignore_saved_drafts" | "use_saved_drafts" {
  return campaign.settings?.autopilotDraftMode === "use_saved_drafts"
    ? "use_saved_drafts"
    : "ignore_saved_drafts";
}

function buildInviteMessageFromSource(
  lead: Lead,
  campaign: Campaign,
  agent: Agent,
  templates: string[]
): string {
  const inviteSource = resolveInviteSource(campaign);
  const stepOne = campaign.sequence.find((step) => step.step === 1);

  if (inviteSource === "campaign_step" && stepOne?.content?.trim()) {
    return personalizeLeadTemplate(stepOne.content, lead).slice(0, agent.limits.maxMessageLength);
  }

  const langTemplates = templates;
  const templateIndex = typeof lead.templateIndex === "number" &&
    lead.templateIndex >= 0 &&
    lead.templateIndex < langTemplates.length
    ? lead.templateIndex
    : 0;

  return buildMessage(
    langTemplates,
    templateIndex,
    lead.name.split(" ")[0],
    personalizeFromHeadline(lead.headline || "", campaign.search.language),
    campaign.segment,
    campaign.search.language,
    agent.limits.maxMessageLength
  );
}

function buildInvitePreviewForLead(
  lead: Lead,
  campaign: Campaign,
  agent: Agent,
  templates: string[],
  opts?: {
    allowSavedDraft?: boolean;
  }
): string {
  const savedDraft = lead.copilotEdits?.["1"]?.trim();
  if (opts?.allowSavedDraft && savedDraft) return savedDraft;

  return buildInviteMessageFromSource(lead, campaign, agent, templates);
}

// ── ICP Scoring ─────────────────────────────────────────────────────────

function scoreIcpFit(person: LinkedInPerson, icp: Agent["icp"]): number {
  let score = 0;
  const hl = (person.headline || "").toLowerCase();
  const loc = (person.location || "").toLowerCase();

  // Job title match (0-1 point)
  const titleMatch = icp.jobTitles.some((t) => hl.includes(t.toLowerCase()));
  if (titleMatch) score += 1;

  // Location match (0-0.5 point)
  const locMatch = icp.locations.some((l) => loc.includes(l.toLowerCase()));
  if (locMatch) score += 0.5;

  // Network proximity (0-0.5 point)
  if (person.network_distance === "DISTANCE_1") score += 0.5;
  else if (person.network_distance === "DISTANCE_2") score += 0.25;

  // Shared connections signal (0-0.5 point)
  const shared = person.shared_connections_count || 0;
  if (shared >= 10) score += 0.5;
  else if (shared >= 3) score += 0.25;

  // Clamp to 1-3 range
  return Math.max(1, Math.min(3, Math.round(score * 1.5)));
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function logRun(entry: Record<string, unknown>) {
  await store.saveOutreachRun({ ts: new Date().toISOString(), ...entry });
}

function isAntiPersona(headline: string, excludeKeywords: string[]): boolean {
  const lower = headline.toLowerCase();
  return excludeKeywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getActiveHours(agent: Agent): { start: number; end: number } {
  const start = agent.limits.activeHoursStart ?? 9;
  const rawEnd = agent.limits.activeHoursEnd ?? 17;
  const end = rawEnd > start ? rawEnd : start + 8;
  return { start, end };
}

function isWeekend(date: Date): boolean {
  return date.getDay() === 0 || date.getDay() === 6;
}

function atHour(date: Date, hour: number): Date {
  const next = new Date(date);
  next.setHours(hour, 0, 0, 0);
  return next;
}

function activeWindow(date: Date, agent: Agent): { start: Date; end: Date } {
  const { start, end } = getActiveHours(agent);
  return {
    start: atHour(date, start),
    end: atHour(date, end),
  };
}

function nextWindowStart(date: Date, agent: Agent): Date {
  const startHour = getActiveHours(agent).start;
  if (isWeekend(date)) {
    const next = atHour(date, startHour);
    while (isWeekend(next)) {
      next.setDate(next.getDate() + 1);
      next.setHours(startHour, 0, 0, 0);
    }
    return next;
  }

  const { start, end } = activeWindow(date, agent);
  if (date < start) return start;
  if (date < end) return date;

  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  while (isWeekend(tomorrow)) {
    tomorrow.setDate(tomorrow.getDate() + 1);
  }
  return atHour(tomorrow, startHour);
}

function windowStartForDate(date: Date, agent: Agent): Date {
  const startHour = getActiveHours(agent).start;
  const next = atHour(date, startHour);
  while (isWeekend(next)) {
    next.setDate(next.getDate() + 1);
    next.setHours(startHour, 0, 0, 0);
  }
  return next;
}

function startOfLocalWeek(date: Date): Date {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function nextWeekWindowStart(date: Date, agent: Agent): Date {
  const nextWeek = startOfLocalWeek(date);
  nextWeek.setDate(nextWeek.getDate() + 7);
  return windowStartForDate(nextWeek, agent);
}

/** Returns a random delay between min and max (inclusive), in ms. */
function randomDelay(minMs: number, maxMs: number): number {
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

/** Human-readable duration. */
function fmtDuration(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function hydrateExecutionState(
  campaign: Campaign,
  agent: Agent,
  now: Date,
  dailyLimit: number
): Promise<CampaignExecutionState> {
  const existing = campaign.execution || {};
  const dayKey = localDayKey(now);
  const actualSentToday = await store.countCampaignInvitesOnDay(campaign.id, dayKey, campaign.workspaceId);
  const invitesSentToday = actualSentToday;

  const parsedNextInviteAt = typeof existing.nextInviteAt === "string"
    ? Date.parse(existing.nextInviteAt)
    : NaN;
  const preserveFutureProviderPause = existing.lastRunStatus === "rate_limited"
    && Number.isFinite(parsedNextInviteAt)
    && parsedNextInviteAt > now.getTime();
  const staleLongFutureWait = existing.lastRunStatus === "waiting"
    && Number.isFinite(parsedNextInviteAt)
    && parsedNextInviteAt > now.getTime() + 36 * 60 * 60 * 1000
    && invitesSentToday < dailyLimit;

  let nextInviteAt = existing.nextInviteAt;
  if (!Number.isFinite(parsedNextInviteAt)) {
    nextInviteAt = undefined;
  } else if (staleLongFutureWait && !preserveFutureProviderPause) {
    nextInviteAt = undefined;
  } else if ((existing.inviteDay !== dayKey || parsedNextInviteAt <= now.getTime()) && !preserveFutureProviderPause) {
    nextInviteAt = undefined;
  }

  if (!nextInviteAt) {
    if (invitesSentToday >= dailyLimit) {
      const nextDay = new Date(now);
      nextDay.setDate(nextDay.getDate() + 1);
      nextInviteAt = windowStartForDate(nextDay, agent).toISOString();
    } else {
      nextInviteAt = nextWindowStart(now, agent).toISOString();
    }
  }

  return {
    ...existing,
    inviteDay: dayKey,
    invitesSentToday,
    nextInviteAt,
  };
}

function computeNextInviteAt(
  now: Date,
  agent: Agent,
  dailyLimit: number,
  invitesSentToday: number
): string {
  const { start, end } = activeWindow(now, agent);
  const minDelay = agent.limits.minDelayMs ?? 600_000;
  const maxDelay = agent.limits.maxDelayMs ?? 1_800_000;

  if (invitesSentToday >= dailyLimit) {
    const nextDay = new Date(now);
    nextDay.setDate(nextDay.getDate() + 1);
    return windowStartForDate(nextDay, agent).toISOString();
  }

  if (now < start || now >= end) {
    return nextWindowStart(now, agent).toISOString();
  }

  const remainingInvites = Math.max(0, dailyLimit - invitesSentToday);
  if (remainingInvites === 0) {
    const nextDay = new Date(now);
    nextDay.setDate(nextDay.getDate() + 1);
    return windowStartForDate(nextDay, agent).toISOString();
  }

  const remainingWindowMs = Math.max(minDelay, end.getTime() - now.getTime());
  const evenlySpacedMs = Math.floor(remainingWindowMs / (remainingInvites + 1));
  const baseDelay = clamp(evenlySpacedMs || minDelay, minDelay, maxDelay);
  const jitterMs = Math.floor(baseDelay * 0.15);
  const jitteredDelay = jitterMs > 0
    ? baseDelay + randomDelay(-jitterMs, jitterMs)
    : baseDelay;
  const nextAt = new Date(now.getTime() + clamp(jitteredDelay, minDelay, maxDelay));

  if (nextAt >= end) {
    const nextDay = new Date(now);
    nextDay.setDate(nextDay.getDate() + 1);
    return windowStartForDate(nextDay, agent).toISOString();
  }

  return nextAt.toISOString();
}

function computeRetryAt(now: Date, agent: Agent, retryMs = 15 * 60 * 1000): string {
  const { end } = activeWindow(now, agent);
  const retryAt = new Date(now.getTime() + retryMs);
  if (retryAt >= end) {
    const nextDay = new Date(now);
    nextDay.setDate(nextDay.getDate() + 1);
    return windowStartForDate(nextDay, agent).toISOString();
  }
  return nextWindowStart(retryAt, agent).toISOString();
}

// ── Main engine ─────────────────────────────────────────────────────────

export async function runOutreach(opts: RunOptions): Promise<RunResult> {
  const {
    workspaceId,
    campaignId,
    dryRun = false,
    maxInvites,
    ignoreWeekendPause = false,
    ignoreScheduleWindow = false,
    inlineSendNewProspects = false,
    onEvent,
  } = opts;
  const events: OutreachEvent[] = [];
  const brainExperimentsEnabled = isBrainExperimentsEnabled();

  function emit(event: OutreachEvent) {
    events.push(event);
    onEvent?.(event);
  }

  // Load campaign + agent from store
  const campaign = await store.getCampaign(campaignId, workspaceId);
  if (!campaign) {
    emit({ type: "error", reason: `Campaign ${campaignId} not found` });
    return { status: "completed", sent: 0, skipped: 0, errors: 1, events };
  }

  const agent = await store.getAgent(campaign.agentId, workspaceId);
  if (!agent) {
    emit({ type: "error", reason: `Agent ${campaign.agentId} not found` });
    return { status: "completed", sent: 0, skipped: 0, errors: 1, events };
  }

  const workspace = await store.getWorkspace(campaign.workspaceId);
  const resolvedSeat = await resolveLinkedInSeatForCampaign(campaign, workspaceId || campaign.workspaceId);
  if (!resolvedSeat) {
    emit({ type: "error", reason: "No LinkedIn seat configured for this campaign" });
    return { status: "completed", sent: 0, skipped: 0, errors: 1, events };
  }
  let activeSeat = await persistNormalizedSeat(resolvedSeat);
  const clientConfig = await resolveWorkspaceLinkedInClientConfig(workspace, activeSeat);

  const activeCampaign = campaign;
  const activeAgent = agent;

  const now = new Date();
  const nowIso = now.toISOString();
  const reviewMode = Boolean(campaign.settings?.reviewMode);

  // Check weekly limit before starting
  // Check for active Brain v1 experiment
  let activeExp: BrainExperiment | null = null;
  if (brainExperimentsEnabled) {
    try {
      activeExp = await getActiveExperiment(campaign.workspaceId);
      if (activeExp && activeExp.campaignId !== campaignId) activeExp = null; // different campaign
    } catch { /* no experiment */ }
  }

  const weeklyCount = await store.countInvitesInCurrentWeek(campaign.workspaceId, now);
  const inviteQuota = seatQuotaUsage(activeSeat, "invitations", now);
  const effectiveSeatQuotas = seatEffectiveQuotas(activeSeat, now);
  const warmupState = getSeatWarmupState(activeSeat, now);
  const effectiveSeatInviteUsed = Math.max(inviteQuota.used, weeklyCount);
  if (effectiveSeatInviteUsed !== inviteQuota.used) {
    activeSeat = await store.saveLinkedInSeat({
      ...activeSeat,
      usage: {
        ...activeSeat.usage,
        invitationsUsed: effectiveSeatInviteUsed,
      },
    });
  }
  const weeklyRemaining = Math.max(
    0,
    Math.min(
      agent.limits.invitesPerWeek - weeklyCount,
      effectiveSeatQuotas.quotas.invitationsPerWeek - effectiveSeatInviteUsed,
    ),
  );
  const seatDailyLimit = seatDailyQuota(activeSeat, "invitations", now);
  const dailyLimit = Math.min(agent.limits.invitesPerDay, seatDailyLimit, weeklyRemaining);
  const runCap = dryRun ? Math.min(maxInvites ?? dailyLimit, dailyLimit) : Math.min(1, dailyLimit);
  const templates = agent.messageTemplates[campaign.search.language] || agent.messageTemplates["en"] || [];
  let execution = await hydrateExecutionState(campaign, agent, now, dailyLimit);

  async function persistExecution(nextExecution: CampaignExecutionState) {
    execution = nextExecution;
    activeCampaign.execution = nextExecution;
    await store.saveCampaign(activeCampaign);
  }

  async function flushQueuedLeads(queue: Lead[]): Promise<RunResult | null> {
    for (const lead of queue) {
      if (totalSent >= runCap) break;

      if (!leadMatchesCampaignLanguage(lead, activeCampaign)) {
        lead.status = "skipped";
        lead.approved = false;
        lead.events.push({
          ts: new Date().toISOString(),
          type: "skipped",
          message: languageMismatchReason(resolveLeadOutreachLanguage(lead), activeCampaign.search.language),
        });
        await store.saveLead(lead);
        totalSkipped++;
        emit({
          type: "skipped",
          name: lead.name,
          reason: languageMismatchReason(resolveLeadOutreachLanguage(lead), activeCampaign.search.language),
        });
        continue;
      }

      if (!leadMatchesCampaignMarket(lead, activeCampaign)) {
        lead.status = "skipped";
        lead.approved = false;
        lead.events.push({
          ts: new Date().toISOString(),
          type: "skipped",
          message: marketMismatchReason(lead.location, activeCampaign),
        });
        await store.saveLead(lead);
        totalSkipped++;
        emit({
          type: "skipped",
          name: lead.name,
          reason: marketMismatchReason(lead.location, activeCampaign),
        });
        continue;
      }

      const message = buildInvitePreviewForLead(lead, activeCampaign, activeAgent, templates, {
        allowSavedDraft: reviewMode || resolveAutopilotDraftMode(activeCampaign) === "use_saved_drafts",
      });

      if (dryRun) {
        emit({ type: "sent", name: lead.name, location: lead.location, message, reason: "dry-run" });
        totalSent++;
        continue;
      }

      const result = await sendInvite(lead.providerId, message, clientConfig);
      const inviteState = classifyInviteResponse(result);

      if (inviteState.isError) {
        if (inviteState.kind === "already_invited") {
          lead.status = "already_invited";
          lead.approved = false;
          lead.events.push({
            ts: new Date().toISOString(),
            type: "skipped",
            message: "Already invited (detected by provider)",
          });
          await store.saveLead(lead);
          totalSkipped++;
          emit({ type: "skipped", name: lead.name, reason: "already invited (provider)" });
          continue;
        }

        if (inviteState.kind === "provider_limit" || inviteState.kind === "rate_limited") {
          totalErrors++;
          const rateLimitAt = new Date();
          const cooldownUntil = new Date(rateLimitAt.getTime() + 24 * 60 * 60 * 1000);
          lead.status = "rate_limited";
          lead.events.push({
            ts: rateLimitAt.toISOString(),
            type: "rate_limited",
            message: inviteState.message || "LinkedIn rate limit",
          });
          await store.saveLead(lead);
          activeSeat = await recordSeatWarmupRateLimit(activeSeat, rateLimitAt);
          await persistExecution({
            ...execution,
            nextInviteAt: nextWindowStart(cooldownUntil, activeAgent).toISOString(),
            lastRunAt: rateLimitAt.toISOString(),
            lastRunStatus: "rate_limited",
          });
          emit({
            type: "rate_limited",
            name: lead.name,
            message: `Rate limited: ${inviteState.message || "LinkedIn rate limit"}. Stopping.`,
          });
          await logRun({
            workspaceId: activeCampaign.workspaceId,
            status: "rate_limited",
            campaignId,
            campaignName: activeCampaign.name,
            dailyLimit,
            sent: totalSent,
            skipped: totalSkipped,
            errors: totalErrors,
          });
          return { status: "rate_limited", sent: totalSent, skipped: totalSkipped, errors: totalErrors, events };
        }

        totalErrors++;
        lead.status = "invite_failed";
        lead.events.push({
          ts: new Date().toISOString(),
          type: "invite_failed",
          message: inviteState.message || "Unknown error",
        });
        await store.saveLead(lead);
        emit({ type: "error", name: lead.name, reason: inviteState.message || "Invite failed" });
        continue;
      }

      totalSent++;
      const sentAt = new Date();
      const sentAtIso = sentAt.toISOString();
      lead.status = "invite_sent";
      lead.currentStep = 1;
      lead.approved = false;
      lead.events.push({
        ts: sentAtIso,
        type: "invite_sent",
        step: 1,
        message,
      });
      await store.saveLead(lead);

      const invitesSentToday = (execution.invitesSentToday ?? 0) + 1;
      const nextInviteAt = computeNextInviteAt(sentAt, activeAgent, dailyLimit, invitesSentToday);
      activeSeat = await consumeSeatQuota(activeSeat, "invitations", 1, sentAt);
      await persistExecution({
        ...execution,
        inviteDay: localDayKey(sentAt),
        invitesSentToday,
        lastInviteAt: sentAtIso,
        lastRunAt: sentAtIso,
        lastRunStatus: "sent",
        nextInviteAt,
      });

      emit({ type: "sent", name: lead.name, location: lead.location, message });
      emit({ type: "info", message: `Next invite scheduled for ${nextInviteAt}.` });
    }

    return null;
  }

  if (JSON.stringify(campaign.execution || {}) !== JSON.stringify(execution)) {
    await persistExecution(execution);
  }

  if (weeklyRemaining === 0) {
    const nextAt = nextWeekWindowStart(now, agent).toISOString();
    if (!dryRun) {
      await persistExecution({
        ...execution,
        nextInviteAt: nextAt,
        lastRunAt: nowIso,
        lastRunStatus: "waiting",
      });
    }
    emit({
      type: "info",
      message: `Weekly invite quota reached (${effectiveSeatInviteUsed}/${effectiveSeatQuotas.quotas.invitationsPerWeek} effective invites on seat ${activeSeat.name}${warmupState.enabled ? ` • ${warmupState.statusLabel}` : ""}). Next invite scheduled for ${nextAt}.`,
    });
    return { status: "completed", sent: 0, skipped: 0, errors: 0, events };
  }

  const minDelay = agent.limits.minDelayMs ?? 600_000;
  const maxDelay = agent.limits.maxDelayMs ?? 1_800_000;
  const estMinTime = fmtDuration(dailyLimit * minDelay);
  const estMaxTime = fmtDuration(dailyLimit * maxDelay);

  emit({
    type: "info",
    message: `Campaign: ${campaign.name} | Seat: ${activeSeat.name} | Mode: ${dryRun ? "DRY RUN" : "LIVE"} | Daily limit: ${dailyLimit} | Run cap: ${runCap} | Invites this week: ${effectiveSeatInviteUsed}/${effectiveSeatQuotas.quotas.invitationsPerWeek}${warmupState.enabled ? ` • ${warmupState.statusLabel}` : ""} | Spread: ${fmtDuration(minDelay)}-${fmtDuration(maxDelay)} between invites (~${estMinTime}-${estMaxTime} total)`,
  });

  let totalSent = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let queuedProspects = 0;
  let profileBudgetNotified = false;

  if (!dryRun) {
    const { start, end } = activeWindow(now, agent);
    const hasProviderCooldown =
      execution.lastRunStatus === "rate_limited" &&
      typeof execution.nextInviteAt === "string" &&
      now < new Date(execution.nextInviteAt);
    const seatSchedule = getSeatScheduleStatus(activeSeat, now);

    if (isWeekend(now) && !ignoreWeekendPause) {
      const nextAt = nextWindowStart(now, agent).toISOString();
      await persistExecution({
        ...execution,
        nextInviteAt: nextAt,
        lastRunAt: nowIso,
        lastRunStatus: "waiting",
      });
      emit({ type: "info", message: `Weekend pause active. Next invite window opens at ${nextAt}.` });
      return { status: "completed", sent: 0, skipped: 0, errors: 0, events };
    }

    if (hasProviderCooldown) {
      await persistExecution({
        ...execution,
        lastRunAt: nowIso,
        lastRunStatus: "rate_limited",
      });
      emit({
        type: "rate_limited",
        message: `Provider cooldown active until ${execution.nextInviteAt}. Manual runs cannot bypass this lock.`,
      });
      return { status: "rate_limited", sent: 0, skipped: 0, errors: 0, events };
    }

    if (!seatSchedule.ok) {
      await persistExecution({
        ...execution,
        lastRunAt: nowIso,
        lastRunStatus: "waiting",
      });
      emit({ type: "info", message: seatSchedule.reason });
      return { status: "completed", sent: 0, skipped: 0, errors: 0, events };
    }

    if (now < start && !ignoreScheduleWindow) {
      await persistExecution({
        ...execution,
        nextInviteAt: start.toISOString(),
        lastRunAt: nowIso,
        lastRunStatus: "waiting",
      });
      emit({ type: "info", message: `Outside active window. Next invite window opens at ${start.toISOString()}.` });
      return { status: "completed", sent: 0, skipped: 0, errors: 0, events };
    }

    if (now >= end && !ignoreScheduleWindow) {
      const nextAt = nextWindowStart(new Date(now.getTime() + 60_000), agent).toISOString();
      await persistExecution({
        ...execution,
        nextInviteAt: nextAt,
        lastRunAt: nowIso,
        lastRunStatus: "waiting",
      });
      emit({ type: "info", message: `Active window closed. Next invite scheduled for ${nextAt}.` });
      return { status: "completed", sent: 0, skipped: 0, errors: 0, events };
    }

    if ((execution.invitesSentToday ?? 0) >= dailyLimit) {
      const nextAt = computeNextInviteAt(now, agent, dailyLimit, execution.invitesSentToday ?? 0);
      await persistExecution({
        ...execution,
        nextInviteAt: nextAt,
        lastRunAt: nowIso,
        lastRunStatus: "waiting",
      });
      emit({ type: "info", message: `Daily invite limit reached. Next invite scheduled for ${nextAt}.` });
      return { status: "completed", sent: 0, skipped: 0, errors: 0, events };
    }

    if (execution.nextInviteAt && now < new Date(execution.nextInviteAt) && !ignoreScheduleWindow) {
      await persistExecution({
        ...execution,
        lastRunAt: nowIso,
        lastRunStatus: "waiting",
      });
      emit({ type: "info", message: `Next invite is due at ${execution.nextInviteAt}.` });
      return { status: "completed", sent: 0, skipped: 0, errors: 0, events };
    }
  }

  if (reviewMode) {
    const approvedQueue = (await store.listLeads(campaign.id, { workspaceId: campaign.workspaceId }))
      .filter((lead) => (lead.status === "new" || lead.status === "discovered") && lead.approved)
      .sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0));
    const rateLimitedResult = await flushQueuedLeads(approvedQueue);
    if (rateLimitedResult) return rateLimitedResult;
  } else {
    const pendingQueue = (await store.listLeads(campaign.id, { workspaceId: campaign.workspaceId }))
      .filter((lead) => lead.status === "new" || lead.status === "discovered")
      .sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0));
    const rateLimitedResult = await flushQueuedLeads(pendingQueue);
    if (rateLimitedResult) return rateLimitedResult;
  }

  if (totalSent >= runCap) {
    if (!dryRun && (totalSent > 0 || totalErrors > 0)) {
      await logRun({
        workspaceId: campaign.workspaceId,
        status: "completed",
        campaignId,
        campaignName: campaign.name,
        dailyLimit,
        sent: totalSent,
        skipped: totalSkipped,
        errors: totalErrors,
        nextInviteAt: execution.nextInviteAt,
      });
    }

    return { status: "completed", sent: totalSent, skipped: totalSkipped, errors: totalErrors, events };
  }

  // Search LinkedIn using query variations to maximize unique prospects
  const queries = campaign.search.queryVariations?.length
    ? campaign.search.queryVariations
    : [{ keywords: campaign.search.keywords, titleFilter: campaign.search.titleFilter }];

  const seenIds = new Set<string>();
  const allPeople: LinkedInPerson[] = [];
  const contactedStatuses = ["invite_sent", "accepted", "replied", "messaged", "already_invited"];

  if (!dryRun && (activeSeat.usage.prospectingRunsToday || 0) >= 1) {
    const retryAt = computeRetryAt(now, agent, 6 * 60 * 60 * 1000);
    await persistExecution({
      ...execution,
      nextInviteAt: retryAt,
      lastRunAt: nowIso,
      lastRunStatus: "idle",
    });
    emit({
      type: "info",
      message: `Prospecting already ran once today for seat ${activeSeat.name}. Waiting for queued leads or the next active day.`,
    });
    return { status: "completed", sent: 0, skipped: 0, errors: 0, events };
  }

  if (!dryRun) {
    activeSeat = await markSeatProspectingRun(activeSeat, now);
  }

  for (const query of queries) {
    const kw = query.keywords || campaign.search.keywords;
    const tf = query.titleFilter || "";
    emit({ type: "info", message: `Searching: ${kw}${tf ? ` (${tf})` : ""}` });
    const batch = await searchPeople(kw, tf || undefined, 0, clientConfig) as LinkedInPerson[];
    if (!batch || batch.length === 0) continue;

    // Dedup within this run
    const fresh = batch.filter((p) => !seenIds.has(p.id));
    fresh.forEach((p) => seenIds.add(p.id));
    allPeople.push(...fresh);

    const eligibilityChecks = await Promise.all(allPeople.map(async (p) => {
      const ref = await store.lookupByProviderId(p.id, campaign.workspaceId);
      if (!ref) return true;
      const lead = await store.getLead(ref.campaignId, ref.leadId);
      return !lead || !contactedStatuses.includes(lead.status);
    }));
    const eligibleCount = eligibilityChecks.filter(Boolean).length;
    emit({ type: "info", message: `  → ${fresh.length} new unique (${eligibleCount} eligible so far)` });
  }

  const people = allPeople;
  emit({ type: "info", message: `Found ${people.length} unique prospects across ${queries.length} queries` });

  if (people.length === 0) {
    if (!dryRun) {
      const retryAt = computeRetryAt(now, agent, 30 * 60 * 1000);
      persistExecution({
        ...execution,
        nextInviteAt: retryAt,
        lastRunAt: nowIso,
        lastRunStatus: "idle",
      });
      emit({ type: "info", message: `No prospects found. Next discovery tick at ${retryAt}.` });
    }
    return { status: "completed", sent: 0, skipped: 0, errors: 0, events };
  }

  for (const person of people) {
    if (totalSent >= runCap) break;

    if (isNeverTargetProfile(agent, {
      publicIdentifier: person.public_identifier || "",
      providerId: person.id,
    })) {
      emit({ type: "skipped", name: person.name, reason: "source-only profile" });
      totalSkipped++;
      continue;
    }

    // Global dedup — only skip if actually contacted (not just discovered/skipped)
    const existingRef = await store.lookupByProviderId(person.id, campaign.workspaceId);
    if (existingRef) {
      const existingLead = await store.getLead(existingRef.campaignId, existingRef.leadId);
      const contactedStatuses = ["invite_sent", "accepted", "replied", "messaged", "already_invited"];
      if (existingLead && contactedStatuses.includes(existingLead.status)) {
        emit({ type: "skipped", name: person.name, reason: `already ${existingLead.status}` });
        totalSkipped++;
        continue;
      }
      if (reviewMode && existingLead && ["new", "discovered"].includes(existingLead.status)) {
        emit({ type: "skipped", name: person.name, reason: "already queued for review" });
        totalSkipped++;
        continue;
      }
    }

    // Anti-persona check
    if (isAntiPersona(person.headline || "", agent.icp.excludeKeywords)) {
      emit({ type: "skipped", name: person.name, reason: "anti-persona" });
      totalSkipped++;

      // Still create lead record for tracking
      await store.saveLead({
        id: "",
        workspaceId: campaign.workspaceId,
        campaignId,
        providerId: person.id,
        name: person.name,
        headline: person.headline || "",
        company: "",
        location: person.location || "",
        publicIdentifier: person.public_identifier || "",
        networkDistance: person.network_distance || "",
        segment: campaign.segment,
        language: detectLanguage(person),
        aiScore: 0,
        signal: JSON.stringify({ source: "keyword_search", context: "Anti-persona match", icpFit: 0, intentScore: 0 }),
        status: "skipped",
        currentStep: 0,
        events: [{ ts: new Date().toISOString(), type: "skipped", message: "anti-persona" }],
        createdAt: "",
        updatedAt: "",
      });
      continue;
    }

    // Network distance filter
    if (person.network_distance === "DISTANCE_3" || person.network_distance === "OUT_OF_NETWORK") {
      emit({ type: "skipped", name: person.name, reason: person.network_distance });
      totalSkipped++;
      continue;
    }

    const lang = detectLanguage(person);
    if (!languagesMatchCampaign(lang, campaign)) {
      emit({ type: "skipped", name: person.name, reason: languageMismatchReason(lang, campaign.search.language) });
      totalSkipped++;

      await store.saveLead({
        id: "",
        workspaceId: campaign.workspaceId,
        campaignId,
        providerId: person.id,
        name: person.name,
        headline: person.headline || "",
        company: "",
        location: person.location || "",
        publicIdentifier: person.public_identifier || "",
        networkDistance: person.network_distance || "",
        segment: campaign.segment,
        language: lang,
        aiScore: scoreIcpFit(person, agent.icp),
        signal: JSON.stringify({ source: "keyword_search", context: `Skipped for language mismatch in ${campaign.name}`, icpFit: 0, intentScore: 0 }),
        status: "skipped",
        currentStep: 0,
        events: [{ ts: new Date().toISOString(), type: "skipped", message: languageMismatchReason(lang, campaign.search.language) }],
        createdAt: "",
        updatedAt: "",
      });
      continue;
    }

    if (!campaignMatchesMarketLocation(person.location, campaign)) {
      emit({ type: "skipped", name: person.name, reason: marketMismatchReason(person.location, campaign) });
      totalSkipped++;

      await store.saveLead({
        id: "",
        workspaceId: campaign.workspaceId,
        campaignId,
        providerId: person.id,
        name: person.name,
        headline: person.headline || "",
        company: "",
        location: person.location || "",
        publicIdentifier: person.public_identifier || "",
        networkDistance: person.network_distance || "",
        segment: campaign.segment,
        language: lang,
        aiScore: scoreIcpFit(person, agent.icp),
        signal: JSON.stringify({ source: "keyword_search", context: `Skipped for market mismatch in ${campaign.name}`, icpFit: 0, intentScore: 0 }),
        status: "skipped",
        currentStep: 0,
        events: [{ ts: new Date().toISOString(), type: "skipped", message: marketMismatchReason(person.location, campaign) }],
        createdAt: "",
        updatedAt: "",
      });
      continue;
    }

    const langTemplates = agent.messageTemplates[lang] || templates;
    const firstName = person.name.split(" ")[0];
    const personalization = personalizeFromHeadline(person.headline || "", lang);

    // Brain v1: weighted template selection + experiment split
    const defaultWeights = agent.templateWeights?.[lang];
    const experimentForLead = activeExp && (!activeExp.language || activeExp.language === lang)
      ? activeExp
      : null;
    const selection = selectTemplate(langTemplates.length, defaultWeights, experimentForLead, person.id);
    const selectedArm = selection.experimentArm && experimentForLead
      ? (selection.experimentArm === "challenger" ? experimentForLead.challenger : experimentForLead.control)
      : null;
    const directTemplate = experimentForLead?.variable === "template_variant"
      ? selectedArm?.templateText
      : undefined;

    const message = directTemplate
      ? buildMessageFromTemplate(
          directTemplate,
          firstName,
          personalization,
          campaign.segment,
          agent.limits.maxMessageLength
        )
      : buildMessage(
          langTemplates,
          selection.templateIndex,
          firstName,
          personalization,
          campaign.segment,
          lang,
          agent.limits.maxMessageLength
        );

    // Fetch profile picture
    let profilePictureUrl: string | undefined;
    const profileQuota = seatQuotaUsage(activeSeat, "profileLookups", now);
    if (profileQuota.remaining > 0) {
      try {
        const profile = await getProfile(person.id, clientConfig);
        profilePictureUrl = profile?.profile_picture_url || undefined;
        activeSeat = await consumeSeatQuota(activeSeat, "profileLookups", 1, new Date());
      } catch {
        // Non-critical, continue without picture
      }
    } else if (!profileBudgetNotified) {
      emit({
        type: "info",
        message: `Seat ${activeSeat.name} has no profile lookup budget left this week. Continuing without profile enrichment.`,
      });
      profileBudgetNotified = true;
    }

    // Create lead record
    const lead: Lead = {
      id: "",
      workspaceId: campaign.workspaceId,
      campaignId,
      providerId: person.id,
      name: person.name,
      headline: person.headline || "",
      company: "",
      location: person.location || "",
      publicIdentifier: person.public_identifier || "",
      networkDistance: person.network_distance || "",
      profilePictureUrl,
      segment: campaign.segment,
      language: lang,
      aiScore: scoreIcpFit(person, agent.icp),
      signal: JSON.stringify({ source: "keyword_search", context: `Matched ICP: ${campaign.name}`, icpFit: Math.round((scoreIcpFit(person, agent.icp) / 3) * 100) / 100, intentScore: 1 }),
      status: "new",
      currentStep: 0,
      events: [],
      templateIndex: selection.templateIndex,
      templateHash: directTemplate
        ? (selectedArm?.templateHash || hashTemplate(directTemplate))
        : hashTemplate(langTemplates[selection.templateIndex] || langTemplates[0]),
      experimentId: selection.experimentId,
      experimentArm: selection.experimentArm,
      approved: false,
      createdAt: "",
      updatedAt: "",
    };

    if (!leadMatchesCampaignTarget(lead, campaign)) {
      lead.status = "skipped";
      lead.events.push({
        ts: new Date().toISOString(),
        type: "skipped",
        message: marketMismatchReason(lead.location, campaign),
      });
      await store.saveLead(lead);
      emit({ type: "skipped", name: person.name, reason: marketMismatchReason(lead.location, campaign) });
      totalSkipped++;
      continue;
    }

    if (reviewMode) {
      const initialDraft = buildInviteMessageFromSource(lead, activeCampaign, activeAgent, templates);
      lead.copilotEdits = { "1": initialDraft };
      await store.saveLead(lead);
      emit({ type: "skipped", name: person.name, reason: "queued for review" });
      totalSkipped++;
      continue;
    }

    if (dryRun) {
      emit({ type: "sent", name: person.name, location: person.location, message, reason: "dry-run" });
      totalSent++;
      continue;
    }

    if (!inlineSendNewProspects) {
      await store.saveLead(lead);
      queuedProspects++;
      continue;
    }

    // Send real invite
    const result = await sendInvite(person.id, message, clientConfig);

    const inviteState = classifyInviteResponse(result);

    if (inviteState.isError) {
      if (inviteState.kind === "already_invited") {
        // Keep a dedicated non-sent status so stats/pacing stay correct.
        lead.status = "already_invited";
        lead.currentStep = 0;
        lead.events.push({
          ts: new Date().toISOString(),
          type: "skipped",
          message: "Already invited (detected by provider)",
        });
        await store.saveLead(lead);
        totalSkipped++;
        emit({ type: "skipped", name: person.name, reason: "already invited (provider)" });
        continue;
      }

      if (inviteState.kind === "provider_limit" || inviteState.kind === "rate_limited") {
        totalErrors++;
        const rateLimitAt = new Date();
        const cooldownUntil = new Date(rateLimitAt.getTime() + 24 * 60 * 60 * 1000);
        lead.status = "rate_limited";
        lead.events.push({
          ts: rateLimitAt.toISOString(),
          type: "rate_limited",
          message: inviteState.message || "LinkedIn rate limit",
        });
        await store.saveLead(lead);
        await persistExecution({
          ...execution,
          nextInviteAt: nextWindowStart(cooldownUntil, agent).toISOString(),
          lastRunAt: rateLimitAt.toISOString(),
          lastRunStatus: "rate_limited",
        });
        emit({
          type: "rate_limited",
          name: person.name,
          message: `Rate limited: ${inviteState.message || "LinkedIn rate limit"}. Stopping.`,
        });
        await logRun({
          workspaceId: campaign.workspaceId,
          status: "rate_limited",
          campaignId,
          campaignName: campaign.name,
          dailyLimit,
          sent: totalSent,
          skipped: totalSkipped,
          errors: totalErrors,
        });
        return { status: "rate_limited", sent: totalSent, skipped: totalSkipped, errors: totalErrors, events };
      }

      totalErrors++;
      const failedAt = new Date().toISOString();
      lead.status = "invite_failed";
      lead.events.push({
        ts: failedAt,
        type: "invite_failed",
        message: inviteState.message || "Unknown error",
      });
      await store.saveLead(lead);
      emit({ type: "error", name: person.name, reason: inviteState.message || "Invite failed" });
      continue;
    }

    // Success
    totalSent++;
    const sentAt = new Date();
    const sentAtIso = sentAt.toISOString();
    lead.status = "invite_sent";
    lead.currentStep = 1;
    lead.events.push({
      ts: sentAtIso,
      type: "invite_sent",
      step: 1,
      message,
    });
    const savedLead = await store.saveLead(lead);
    activeSeat = await consumeSeatQuota(activeSeat, "invitations", 1, sentAt);

    // Track lead in experiment arm
    if (activeExp && selection.experimentId === activeExp.id && selection.experimentArm) {
      const controlLeadIds = selection.experimentArm === "control"
        ? Array.from(new Set([...activeExp.controlLeadIds, savedLead.id]))
        : activeExp.controlLeadIds;
      const challengerLeadIds = selection.experimentArm === "challenger"
        ? Array.from(new Set([...activeExp.challengerLeadIds, savedLead.id]))
        : activeExp.challengerLeadIds;

      const updatedExperiment = await updateExperiment(activeExp.id, {
        controlLeadIds,
        challengerLeadIds,
      });

      if (updatedExperiment) {
        activeExp = updatedExperiment;
      }
    }

    const invitesSentToday = (execution.invitesSentToday ?? 0) + 1;
    const nextInviteAt = computeNextInviteAt(sentAt, agent, dailyLimit, invitesSentToday);
    await persistExecution({
      ...execution,
      inviteDay: localDayKey(sentAt),
      invitesSentToday,
      lastInviteAt: sentAtIso,
      lastRunAt: sentAtIso,
      lastRunStatus: "sent",
      nextInviteAt,
    });

    emit({ type: "sent", name: person.name, location: person.location, message });
    emit({ type: "info", message: `Next invite scheduled for ${nextInviteAt}.` });
  }

  if (queuedProspects > 0) {
    emit({
      type: "info",
      message: `Queued ${queuedProspects} new prospects on seat ${activeSeat.name}. Future runs will send from this queue before prospecting again.`,
    });
  }

  if (!dryRun && totalSent === 0) {
    const retryAt = computeRetryAt(new Date(), agent, totalErrors > 0 ? 20 * 60 * 1000 : 15 * 60 * 1000);
    await persistExecution({
      ...execution,
      nextInviteAt: retryAt,
      lastRunAt: new Date().toISOString(),
      lastRunStatus: totalErrors > 0 ? "error" : "idle",
    });
    emit({ type: "info", message: `No invite sent in this tick. Next attempt at ${retryAt}.` });
  }

  if (!dryRun && (totalSent > 0 || totalErrors > 0)) {
    await logRun({
      workspaceId: campaign.workspaceId,
      status: "completed",
      campaignId,
      campaignName: campaign.name,
      dailyLimit,
      sent: totalSent,
      skipped: totalSkipped,
      errors: totalErrors,
      nextInviteAt: execution.nextInviteAt,
    });
  }

  return { status: "completed", sent: totalSent, skipped: totalSkipped, errors: totalErrors, events };
}
