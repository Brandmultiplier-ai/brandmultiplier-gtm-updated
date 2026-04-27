/**
 * BrandMultiplier GTM — Sequence Runner
 *
 * Processes the campaign sequence for each lead:
 * 1. Sync statuses (who accepted)
 * 2. Send follow-up messages at the right time
 * 3. Stop when they reply
 *
 * Flow: invite_sent → (accepted) → message step 2 → (no_reply) → message step 3 → ...
 */

import { listAllRelations, getOrCreateChat, sendMessage } from "./unipile";
import * as store from "./store";
import type { Campaign, Lead, LinkedInSeat, SequenceStep, Workspace } from "./types";
import {
  leadMatchesCampaignMarket,
  marketMismatchReason,
  resolveLeadOutreachLanguage,
} from "./campaign-targeting";
import {
  consumeSeatQuota,
  getSeatScheduleStatus,
  resolveWorkspaceLinkedInClientConfig,
  persistNormalizedSeat,
  resolveLinkedInSeatForCampaign,
  seatQuotaUsage,
} from "./linkedin-seats";
import { reconcileSequenceProgressFromEvents } from "./sequence-progress";

// ── Types ───────────────────────────────────────────────────────────────

export interface SequenceRunOptions {
  workspaceId?: string;
  campaignId?: string;
  dryRun?: boolean;
  onEvent?: (event: SequenceEvent) => void;
}

export interface SequenceEvent {
  type: "info" | "synced" | "messaged" | "skipped" | "error";
  leadName?: string;
  step?: number;
  message?: string;
  reason?: string;
}

export interface SequenceRunResult {
  synced: number;
  messaged: number;
  skipped: number;
  errors: number;
  events: SequenceEvent[];
}

// ── Helpers ─────────────────────────────────────────────────────────────

function daysSince(isoDate: string, now = Date.now()): number {
  return (now - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function personalizeContent(content: string, lead: Lead): string {
  const firstName = lead.name.split(" ")[0];
  return content
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

function hasLanguageMismatchEvent(lead: Lead, campaign: Campaign, step: SequenceStep): boolean {
  const reason = languageMismatchReason(resolveLeadOutreachLanguage(lead), campaign.search.language);
  return (lead.events || []).some((event) =>
    event.type === "skipped" &&
    event.step === step.step &&
    event.message === reason
  );
}

function hasMarketMismatchEvent(lead: Lead, campaign: Campaign, step: SequenceStep): boolean {
  const reason = marketMismatchReason(lead.location, campaign);
  return (lead.events || []).some((event) =>
    event.type === "skipped" &&
    event.step === step.step &&
    event.message === reason
  );
}

// ── Phase 1: Sync accepted ─────────────────────────────────────────────

async function syncAccepted(
  leads: Lead[],
  seat: LinkedInSeat,
  workspace: Workspace | null,
  emit: (e: SequenceEvent) => void
): Promise<number> {
  const pendingLeads = leads.filter((l) => l.status === "invite_sent");
  if (pendingLeads.length === 0) return 0;

  const relations = (await listAllRelations(10, await resolveWorkspaceLinkedInClientConfig(workspace, seat))) as Record<string, unknown>[];
  const connectedIds = new Set<string>();
  for (const rel of relations) {
    const pid = (rel.provider_id || rel.member_id || rel.id || "") as string;
    if (pid) connectedIds.add(pid);
  }

  let synced = 0;
  for (const lead of pendingLeads) {
    if (connectedIds.has(lead.providerId)) {
      lead.status = "accepted";
      lead.events.push({
        ts: new Date().toISOString(),
        type: "accepted",
        message: "Synced from Unipile relations",
      });
      await store.saveLead(lead);
      synced++;
      emit({ type: "synced", leadName: lead.name, message: "Connection accepted" });
    }
  }

  return synced;
}

// ── Phase 2: Process sequence steps ─────────────────────────────────────

function getNextStep(lead: Lead, sequence: SequenceStep[]): SequenceStep | null {
  const nextStepNum = lead.currentStep + 1;
  return sequence.find((s) => s.step === nextStepNum) || null;
}

function hasManualOverride(lead: Lead): boolean {
  return (lead.events || []).some((event) =>
    event.type === "skipped" && event.message === "Sequence stopped after manual outbound message"
  );
}

function firstAcceptedAfterInvite(lead: Lead): string | null {
  const inviteEvent = [...(lead.events || [])]
    .reverse()
    .find((event) => event.type === "invite_sent" && event.step === 1);

  const inviteTs = inviteEvent ? Date.parse(inviteEvent.ts) : Number.NEGATIVE_INFINITY;
  const acceptedEvent = (lead.events || []).find((event) =>
    event.type === "accepted" && Date.parse(event.ts) >= inviteTs
  );

  return acceptedEvent?.ts || null;
}

function previousStepMessageTs(lead: Lead): string | null {
  const previousStep = lead.currentStep;
  if (previousStep <= 0) return null;

  const exactMatch = [...(lead.events || [])]
    .reverse()
    .find((event) => event.type === "message_sent" && event.step === previousStep);
  if (exactMatch?.ts) return exactMatch.ts;

  const fallback = [...(lead.events || [])]
    .reverse()
    .find((event) => event.type === "message_sent");
  return fallback?.ts || null;
}

export function getStepAnchorTimestamp(lead: Lead, step: SequenceStep): string | null {
  if (step.trigger === "accepted") {
    return firstAcceptedAfterInvite(lead);
  }

  if (step.trigger === "no_reply") {
    return previousStepMessageTs(lead);
  }

  const lastEvent = [...(lead.events || [])]
    .reverse()
    .find((event) => ["invite_sent", "accepted", "message_sent"].includes(event.type));
  return lastEvent?.ts || null;
}

export function isStepReady(lead: Lead, step: SequenceStep, now = Date.now()): boolean {
  if (hasManualOverride(lead)) {
    return false;
  }

  const anchorTs = getStepAnchorTimestamp(lead, step);
  if (!anchorTs) return false;

  if (step.trigger === "accepted" && lead.status !== "accepted" && lead.status !== "message_sent") {
    return false;
  }
  if (step.trigger === "no_reply" && lead.status === "replied") {
    return false;
  }

  return daysSince(anchorTs, now) >= step.delayDays;
}

async function processSequenceStep(
  lead: Lead,
  campaign: Campaign,
  step: SequenceStep,
  seat: LinkedInSeat,
  workspace: Workspace | null,
  dryRun: boolean,
  emit: (e: SequenceEvent) => void
): Promise<{ status: "sent" | "skipped" | "error"; seat: LinkedInSeat | null }> {
  if (!leadMatchesCampaignLanguage(lead, campaign)) {
    if (!hasLanguageMismatchEvent(lead, campaign, step)) {
      lead.events.push({
        ts: new Date().toISOString(),
        type: "skipped",
        step: step.step,
        message: languageMismatchReason(resolveLeadOutreachLanguage(lead), campaign.search.language),
      });
      await store.saveLead(lead);
    }
    emit({
      type: "skipped",
      leadName: lead.name,
      step: step.step,
      reason: languageMismatchReason(resolveLeadOutreachLanguage(lead), campaign.search.language),
    });
    return { status: "skipped", seat };
  }

  if (!leadMatchesCampaignMarket(lead, campaign)) {
    if (!hasMarketMismatchEvent(lead, campaign, step)) {
      lead.events.push({
        ts: new Date().toISOString(),
        type: "skipped",
        step: step.step,
        message: marketMismatchReason(lead.location, campaign),
      });
      await store.saveLead(lead);
    }
    emit({
      type: "skipped",
      leadName: lead.name,
      step: step.step,
      reason: marketMismatchReason(lead.location, campaign),
    });
    return { status: "skipped", seat };
  }

  const stepContent = lead.copilotEdits?.[String(step.step)]?.trim() || step.content;
  const message = personalizeContent(stepContent, lead);

  if (dryRun) {
    emit({
      type: "messaged",
      leadName: lead.name,
      step: step.step,
      message: `[DRY RUN] ${message}`,
    });
    return { status: "sent", seat };
  }

  const seatSchedule = getSeatScheduleStatus(seat);
  if (!seatSchedule.ok) {
    emit({
      type: "skipped",
      leadName: lead.name,
      step: step.step,
      reason: seatSchedule.reason,
    });
    return { status: "skipped", seat: seatSchedule.seat };
  }

  const messageQuota = seatQuotaUsage(seatSchedule.seat, "messages");
  if (messageQuota.remaining <= 0) {
    emit({
      type: "skipped",
      leadName: lead.name,
      step: step.step,
      reason: `Message quota reached on seat ${seatSchedule.seat.name}`,
    });
    return { status: "skipped", seat: seatSchedule.seat };
  }

  // Prefer the resolved chat we already know from sync/inbox before asking Unipile to create one.
  const clientConfig = await resolveWorkspaceLinkedInClientConfig(workspace, seatSchedule.seat);
  const chatId = lead.unipileChatId || await getOrCreateChat(lead.providerId, clientConfig);
  if (!chatId) {
    emit({
      type: "error",
      leadName: lead.name,
      step: step.step,
      reason: "Could not create chat",
    });
    return { status: "error", seat: seatSchedule.seat };
  }

  // Send the message
  const result = await sendMessage(chatId, message, clientConfig);
  const httpStatus = result._httpStatus || result.status;
  const isError =
    (typeof httpStatus === "number" && httpStatus >= 400) ||
    (result.type && typeof result.type === "string" && result.type.startsWith("errors/"));

  if (isError) {
    emit({
      type: "error",
      leadName: lead.name,
      step: step.step,
      reason: result.detail || result.title || "Send failed",
    });
    return { status: "error", seat: seatSchedule.seat };
  }

  // Update lead
  lead.status = "message_sent";
  lead.currentStep = step.step;
  lead.unipileChatId = chatId;
  lead.events.push({
    ts: new Date().toISOString(),
    type: "message_sent",
    step: step.step,
    message,
  });
  await store.saveLead(lead);

  emit({
    type: "messaged",
    leadName: lead.name,
    step: step.step,
    message,
  });

  return { status: "sent", seat: await consumeSeatQuota(seatSchedule.seat, "messages", 1, new Date()) };
}

// ── Main runner ─────────────────────────────────────────────────────────

export async function runSequence(opts: SequenceRunOptions): Promise<SequenceRunResult> {
  const { workspaceId, campaignId, dryRun = false, onEvent } = opts;
  const events: SequenceEvent[] = [];

  function emit(event: SequenceEvent) {
    events.push(event);
    onEvent?.(event);
  }

  // Get campaigns to process
  const campaigns = campaignId
    ? [await store.getCampaign(campaignId, workspaceId)].filter((campaign): campaign is Campaign => campaign !== null)
    : (await store.listCampaigns({ workspaceId })).filter((c) => c.status === "active");

  if (campaigns.length === 0) {
    emit({ type: "info", message: "No active campaigns found" });
    return { synced: 0, messaged: 0, skipped: 0, errors: 0, events };
  }

  let totalSynced = 0;
  let totalMessaged = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const campaign of campaigns) {
    emit({ type: "info", message: `Processing: ${campaign.name}` });

    let seat = await resolveLinkedInSeatForCampaign(campaign, campaign.workspaceId);
    if (!seat) {
      emit({ type: "error", reason: `No LinkedIn seat configured for ${campaign.name}` });
      totalErrors++;
      continue;
    }
    seat = await persistNormalizedSeat(seat);
    const workspace = await store.getWorkspace(campaign.workspaceId);

    const leads = await store.listLeads(campaign.id, { workspaceId });
    if (leads.length === 0) {
      emit({ type: "info", message: `No leads in ${campaign.name}` });
      continue;
    }

    // Phase 1: sync accepted
    const synced = await syncAccepted(leads, seat, workspace, emit);
    totalSynced += synced;

    // Reload leads after sync (statuses may have changed)
    const updatedLeads = await store.listLeads(campaign.id, { workspaceId });
    const reconciledLeads: Lead[] = [];

    for (const lead of updatedLeads) {
      const reconciled = reconcileSequenceProgressFromEvents(lead, campaign);
      if (reconciled.changed) {
        reconciledLeads.push(await store.saveLead(reconciled.lead));
      } else {
        reconciledLeads.push(lead);
      }
    }

    // Phase 2: process sequence steps for eligible leads
    const eligibleLeads = reconciledLeads.filter((l) =>
      ["accepted", "message_sent"].includes(l.status)
    );

    for (const lead of eligibleLeads) {
      // Skip if already replied
      if (lead.status === "replied" || lead.status === "interested") {
        totalSkipped++;
        continue;
      }

      const nextStep = getNextStep(lead, campaign.sequence);
      if (!nextStep) {
        // All steps completed
        emit({ type: "skipped", leadName: lead.name, reason: "Sequence completed" });
        totalSkipped++;
        continue;
      }

      if (!isStepReady(lead, nextStep)) {
        emit({
          type: "skipped",
          leadName: lead.name,
          step: nextStep.step,
          reason: `Not ready (delay: ${nextStep.delayDays}d, trigger: ${nextStep.trigger})`,
        });
        totalSkipped++;
        continue;
      }

      const stepResult = await processSequenceStep(
        lead,
        campaign,
        nextStep,
        seat,
        workspace,
        dryRun,
        emit,
      );
      if (stepResult.seat) {
        seat = stepResult.seat;
      }
      if (stepResult.status === "sent") {
        totalMessaged++;
      } else if (stepResult.status === "error") {
        totalErrors++;
      } else {
        totalSkipped++;
      }

      // Delay between messages to seem human
      if (!dryRun) {
        await sleep(5000 + Math.random() * 10000);
      }
    }
  }

  emit({
    type: "info",
    message: `Done. Synced: ${totalSynced}, Messaged: ${totalMessaged}, Skipped: ${totalSkipped}, Errors: ${totalErrors}`,
  });

  return { synced: totalSynced, messaged: totalMessaged, skipped: totalSkipped, errors: totalErrors, events };
}
