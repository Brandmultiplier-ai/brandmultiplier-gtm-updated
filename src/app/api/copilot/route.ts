import { NextRequest, NextResponse } from "next/server";
import { listLeads, listCampaigns, saveCampaign } from "@/lib/store";
import type { Lead, Campaign } from "@/lib/types";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";
import { ensureLeadCompanyData, getLeadCompanySnapshot } from "@/lib/lead-enrichment";
import { type SignalSourceUrlType } from "@/lib/signal-source-url";
import { buildNormalizedSignal } from "@/lib/signal-taxonomy";
import {
  getSeatScheduleStatus,
  resolveWorkspaceLinkedInClientConfig,
  resolveLinkedInSeatForCampaign,
  seatQuotaUsage,
  serializeLinkedInSeatWithProfile,
} from "@/lib/linkedin-seats";
import {
  getStepAnchorTimestamp,
  isStepReady,
} from "@/lib/sequence-runner";
import {
  leadMatchesCampaignMarket,
  marketMismatchReason,
  resolveLeadOutreachLanguage,
} from "@/lib/campaign-targeting";
import { getWorkspace } from "@/lib/store";

export const dynamic = "force-dynamic";

type CopilotStepState = "completed" | "ready" | "scheduled" | "blocked" | "review";
type CopilotActionState = "ready" | "scheduled" | "blocked" | "review" | "completed";

type ParsedSignal = {
  signalSource: string;
  signalText: string;
  signalSourceUrl: string;
  signalSourceUrlType?: SignalSourceUrlType;
  signalKind?: string;
  topicKey?: string;
  topicLabel?: string;
  signalPayload?: Record<string, unknown>;
  scoreReasoning?: string;
  sourcePostId?: string;
};

function parseSignal(lead: Lead) {
  let signalSource = "keyword_search";
  let signalText = "";
  let signalSourceUrl = "";
  let signalKind = "";
  let topicKey = "";
  let topicLabel = "";
  let scoreReasoning = "";
  let signalPayload: Record<string, unknown> | undefined;
  let sourcePostId = "";

  try {
    const sig = JSON.parse(lead.signal);
    signalSource = sig.source || sig.signalSource || "keyword_search";
    signalText = sig.context || sig.signalContext || sig.scoreReasoning || "";
    signalKind = sig.signalKind || "";
    topicKey = sig.topicKey || "";
    topicLabel = sig.topicLabel || "";
    scoreReasoning = sig.reasoning || sig.scoreReasoning || "";
    signalPayload = sig.signalPayload && typeof sig.signalPayload === "object" ? sig.signalPayload : undefined;
    sourcePostId = sig.sourcePostId || "";
  } catch {
    signalText = lead.signal || "";
  }

  const normalized = buildNormalizedSignal({
    signalSource,
    signalContext: signalText,
    signalKind: signalKind || undefined,
    topicKey: topicKey || undefined,
    topicLabel: topicLabel || undefined,
    signalPayload,
    publicIdentifier: lead.publicIdentifier,
    sourcePostId: sourcePostId || undefined,
  });
  signalSourceUrl = normalized.sourceUrl || "";
  const signalSourceUrlType: SignalSourceUrlType | undefined = normalized.sourceUrlType || undefined;

  return {
    signalSource,
    signalText,
    signalSourceUrl,
    signalSourceUrlType,
    signalKind: signalKind || undefined,
    topicKey: topicKey || undefined,
    topicLabel: topicLabel || undefined,
    signalPayload,
    scoreReasoning: scoreReasoning || undefined,
    sourcePostId: sourcePostId || undefined,
  } satisfies ParsedSignal;
}

function normalizeLanguage(value: string | undefined) {
  return value?.trim().toLowerCase() || "";
}

function languagesMatchCampaign(leadLanguage: string | undefined, campaignLanguage: string | undefined) {
  const normalizedLeadLanguage = normalizeLanguage(leadLanguage);
  const normalizedCampaignLanguage = normalizeLanguage(campaignLanguage);
  if (!normalizedLeadLanguage || !normalizedCampaignLanguage) return true;
  return normalizedLeadLanguage === normalizedCampaignLanguage;
}

function languageMismatchReason(leadLanguage: string | undefined, campaignLanguage: string | undefined) {
  return `Language mismatch (${leadLanguage || "unknown"} vs ${campaignLanguage || "unknown"})`;
}

function personalizeContent(content: string, lead: Lead) {
  const firstName = lead.name.split(" ")[0];
  return content
    .replace(/\{\{first_name\}\}/gi, firstName)
    .replace(/\{\{firstName\}\}/g, firstName)
    .replace(/\{\{name\}\}/gi, lead.name);
}

function heatScore(lead: Lead) {
  const score = Math.max(lead.aiScore || 0, 0);
  return Math.max(0, Math.min(3, Math.round(score)));
}

function actionTypeLabel(type: "connection_request" | "message" | "profile_visit") {
  switch (type) {
    case "connection_request":
      return "Connection Request";
    case "message":
      return "Message";
    case "profile_visit":
      return "Profile Visit";
    default:
      return type;
  }
}

function getNextStep(lead: Lead, campaign: Campaign) {
  const nextStepNumber = lead.currentStep + 1;
  return campaign.sequence.find((step) => step.step === nextStepNumber) || null;
}

function hasManualOverride(lead: Lead) {
  return (lead.events || []).some(
    (event) => event.type === "skipped" && event.message === "Sequence stopped after manual outbound message",
  );
}

function buildSignalDetails(signal: ParsedSignal, publicIdentifier?: string) {
  return buildNormalizedSignal({
    signalSource: signal.signalSource,
    signalContext: signal.signalText,
    signalKind: signal.signalKind,
    topicKey: signal.topicKey,
    topicLabel: signal.topicLabel,
    signalPayload: signal.signalPayload,
    publicIdentifier,
    sourcePostId: signal.sourcePostId,
  });
}

function buildScoreBreakdown(lead: Lead, signal: ParsedSignal) {
  let parsedIcpFit = 0;
  let parsedIntentScore = 0;
  try {
    const sig = JSON.parse(lead.signal);
    parsedIcpFit = typeof sig.icpFit === "number" ? sig.icpFit : 0;
    parsedIntentScore = typeof sig.intentScore === "number" ? sig.intentScore : 0;
  } catch {
    parsedIcpFit = 0;
    parsedIntentScore = 0;
  }

  return {
    aiScore: lead.aiScore || 0,
    totalScore: Number((parsedIcpFit + parsedIntentScore).toFixed(2)),
    icpFit: parsedIcpFit,
    intentScore: parsedIntentScore,
    heat: heatScore(lead),
    reasoning: signal.scoreReasoning || "",
  };
}

function sequenceLegacyStatus(lead: Lead, executedAt?: string) {
  if (executedAt) return "completed" as const;
  return lead.approved ? "scheduled" as const : "pending" as const;
}

function computeInviteAction(
  lead: Lead,
  campaign: Campaign,
  seat: Awaited<ReturnType<typeof resolveLinkedInSeatForCampaign>>,
  scoreBreakdown: ReturnType<typeof buildScoreBreakdown>,
) {
  const step = campaign.sequence.find((item) => item.step === 1) || null;
  if (!step) return null;

  let state: CopilotActionState = "ready";
  let blockerReason: string | null = null;
  let scheduledFor: string | null = null;

  if (campaign.status !== "active") {
    state = "blocked";
    blockerReason = `Campaign is ${campaign.status}`;
  } else if (!leadMatchesCampaignMarket(lead, campaign)) {
    state = "blocked";
    blockerReason = marketMismatchReason(lead.location, campaign);
  } else if (!languagesMatchCampaign(resolveLeadOutreachLanguage(lead), campaign.search.language)) {
    state = "blocked";
    blockerReason = languageMismatchReason(resolveLeadOutreachLanguage(lead), campaign.search.language);
  } else if (campaign.settings?.reviewMode && !lead.approved) {
    state = "review";
    blockerReason = "Awaiting manual approval in review mode";
  } else if (campaign.execution?.nextInviteAt && Date.parse(campaign.execution.nextInviteAt) > Date.now()) {
    state = "scheduled";
    scheduledFor = campaign.execution.nextInviteAt;
    blockerReason = "Invite pacing window not reached yet";
  } else if (seat) {
    const seatSchedule = getSeatScheduleStatus(seat);
    if (!seatSchedule.ok) {
      state = "scheduled";
      blockerReason = seatSchedule.reason;
    } else {
      const inviteQuota = seatQuotaUsage(seatSchedule.seat, "invitations");
      if (inviteQuota.remaining <= 0) {
        state = "blocked";
        blockerReason = `Invite quota reached on seat ${seatSchedule.seat.name}`;
      }
    }
  } else {
    state = "blocked";
    blockerReason = "No active LinkedIn seat assigned";
  }

  return {
    id: `${lead.id}:step:${step.step}`,
    leadId: lead.id,
    campaignId: campaign.id,
    step: step.step,
    actionType: step.type,
    actionLabel: actionTypeLabel(step.type),
    state,
    scheduledFor,
    blockerReason,
    trigger: step.trigger,
    delayDays: step.delayDays,
    anchorTs: null,
    sourceOfCopy: lead.copilotEdits?.[String(step.step)]
      ? "saved_draft"
      : campaign.settings?.inviteSource === "template_library"
        ? "template_library"
        : "campaign_step",
    contentPreview: personalizeContent(lead.copilotEdits?.[String(step.step)] || step.content, lead),
    score: scoreBreakdown.totalScore,
  };
}

function computeSequenceAction(
  lead: Lead,
  campaign: Campaign,
  seat: Awaited<ReturnType<typeof resolveLinkedInSeatForCampaign>>,
  scoreBreakdown: ReturnType<typeof buildScoreBreakdown>,
) {
  const step = getNextStep(lead, campaign);
  if (!step) {
    return {
      id: `${lead.id}:completed`,
      leadId: lead.id,
      campaignId: campaign.id,
      step: lead.currentStep,
      actionType: "message" as const,
      actionLabel: "Sequence Complete",
      state: "completed" as CopilotActionState,
      scheduledFor: null,
      blockerReason: null,
      trigger: "no_reply" as const,
      delayDays: 0,
      anchorTs: null,
      sourceOfCopy: "campaign_step",
      contentPreview: "",
      score: scoreBreakdown.totalScore,
    };
  }

  const anchorTs = getStepAnchorTimestamp(lead, step);
  const scheduledFor = anchorTs
    ? new Date(Date.parse(anchorTs) + step.delayDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  let state: CopilotActionState = "ready";
  let blockerReason: string | null = null;

  if (campaign.status !== "active") {
    state = "blocked";
    blockerReason = `Campaign is ${campaign.status}`;
  } else if (hasManualOverride(lead)) {
    state = "blocked";
    blockerReason = "Sequence stopped after manual outbound message";
  } else if (lead.status === "replied" || lead.status === "interested") {
    state = "completed";
    blockerReason = "Lead already replied";
  } else if (!anchorTs) {
    state = "blocked";
    blockerReason = step.trigger === "accepted"
      ? "Waiting for accepted connection"
      : step.trigger === "no_reply"
        ? "Waiting for previous message anchor"
        : "Waiting for previous sequence event";
  } else if (!isStepReady(lead, step)) {
    state = "scheduled";
    blockerReason = step.trigger === "accepted"
      ? "Waiting for accepted delay window"
      : step.trigger === "no_reply"
        ? "Waiting for no-reply delay window"
        : "Waiting for step delay window";
  } else if (!leadMatchesCampaignMarket(lead, campaign)) {
    state = "blocked";
    blockerReason = marketMismatchReason(lead.location, campaign);
  } else if (!languagesMatchCampaign(resolveLeadOutreachLanguage(lead), campaign.search.language)) {
    state = "blocked";
    blockerReason = languageMismatchReason(resolveLeadOutreachLanguage(lead), campaign.search.language);
  } else if (seat) {
    const seatSchedule = getSeatScheduleStatus(seat);
    if (!seatSchedule.ok) {
      state = "scheduled";
      blockerReason = seatSchedule.reason;
    } else {
      const messageQuota = seatQuotaUsage(seatSchedule.seat, "messages");
      if (messageQuota.remaining <= 0) {
        state = "blocked";
        blockerReason = `Message quota reached on seat ${seatSchedule.seat.name}`;
      }
    }
  } else {
    state = "blocked";
    blockerReason = "No active LinkedIn seat assigned";
  }

  return {
    id: `${lead.id}:step:${step.step}`,
    leadId: lead.id,
    campaignId: campaign.id,
    step: step.step,
    actionType: step.type,
    actionLabel: actionTypeLabel(step.type),
    state,
    scheduledFor,
    blockerReason,
    trigger: step.trigger,
    delayDays: step.delayDays,
    anchorTs,
    sourceOfCopy: lead.copilotEdits?.[String(step.step)] ? "saved_draft" : "campaign_step",
    contentPreview: personalizeContent(lead.copilotEdits?.[String(step.step)] || step.content, lead),
    score: scoreBreakdown.totalScore,
  };
}

function buildSequence(lead: Lead, campaign: Campaign, seat: Awaited<ReturnType<typeof resolveLinkedInSeatForCampaign>>) {
  return campaign.sequence.map((step) => {
    const executedEvent = step.type === "connection_request"
      ? lead.events.find((event) => event.type === "invite_sent" && (event.step === step.step || step.step === 1))
      : lead.events.find((event) => event.type === "message_sent" && event.step === step.step);

    const anchorTs = step.step > 1 ? getStepAnchorTimestamp(lead, step) : null;
    const scheduledFor = anchorTs
      ? new Date(Date.parse(anchorTs) + step.delayDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    let state: CopilotStepState = executedEvent ? "completed" : "scheduled";
    let blockerReason: string | null = null;

    if (!executedEvent) {
      if (campaign.status !== "active") {
        state = "blocked";
        blockerReason = `Campaign is ${campaign.status}`;
      } else if (step.step === 1) {
        if (campaign.settings?.reviewMode && !lead.approved) {
          state = "review";
          blockerReason = "Awaiting approval in review mode";
        } else if (campaign.execution?.nextInviteAt && Date.parse(campaign.execution.nextInviteAt) > Date.now()) {
          state = "scheduled";
          blockerReason = "Invite pacing window not reached yet";
        } else if (seat) {
          const seatSchedule = getSeatScheduleStatus(seat);
          if (!seatSchedule.ok) {
            state = "scheduled";
            blockerReason = seatSchedule.reason;
          } else {
            const inviteQuota = seatQuotaUsage(seatSchedule.seat, "invitations");
            if (inviteQuota.remaining <= 0) {
              state = "blocked";
              blockerReason = `Invite quota reached on seat ${seatSchedule.seat.name}`;
            } else {
              state = "ready";
            }
          }
        } else {
          state = "blocked";
          blockerReason = "No active LinkedIn seat assigned";
        }
      } else if (hasManualOverride(lead)) {
        state = "blocked";
        blockerReason = "Sequence stopped after manual outbound message";
      } else if (lead.status === "replied" || lead.status === "interested") {
        state = "blocked";
        blockerReason = "Lead already replied";
      } else if (!anchorTs) {
        state = "blocked";
        blockerReason = step.trigger === "accepted"
          ? "Waiting for accepted connection"
          : step.trigger === "no_reply"
            ? "Waiting for previous step completion"
            : "Waiting for previous step completion";
      } else if (!isStepReady(lead, step)) {
        state = "scheduled";
        blockerReason = "Delay window not reached yet";
      } else if (!leadMatchesCampaignMarket(lead, campaign)) {
        state = "blocked";
        blockerReason = marketMismatchReason(lead.location, campaign);
      } else if (!languagesMatchCampaign(resolveLeadOutreachLanguage(lead), campaign.search.language)) {
        state = "blocked";
        blockerReason = languageMismatchReason(resolveLeadOutreachLanguage(lead), campaign.search.language);
      } else if (seat) {
        const seatSchedule = getSeatScheduleStatus(seat);
        if (!seatSchedule.ok) {
          state = "scheduled";
          blockerReason = seatSchedule.reason;
        } else {
          const messageQuota = seatQuotaUsage(seatSchedule.seat, "messages");
          if (messageQuota.remaining <= 0) {
            state = "blocked";
            blockerReason = `Message quota reached on seat ${seatSchedule.seat.name}`;
          } else {
            state = "ready";
          }
        }
      } else {
        state = "blocked";
        blockerReason = "No active LinkedIn seat assigned";
      }
    }

    return {
      step: step.step,
      type: step.type,
      label: actionTypeLabel(step.type),
      delayDays: step.delayDays,
      trigger: step.trigger,
      content: lead.copilotEdits?.[String(step.step)] || step.content,
      preview: personalizeContent(lead.copilotEdits?.[String(step.step)] || step.content, lead),
      status: sequenceLegacyStatus(lead, executedEvent?.ts),
      state,
      executedAt: executedEvent?.ts,
      scheduledFor,
      anchorTs,
      blockerReason,
      sourceOfCopy: lead.copilotEdits?.[String(step.step)]
        ? "saved_draft"
        : step.step === 1 && campaign.settings?.inviteSource === "template_library"
          ? "template_library"
          : "campaign_step",
    };
  });
}

export async function GET(req: NextRequest) {
  try {
    const $wsa = await requireAppWorkspaceRead(req);

    if (!$wsa.ok) return $wsa.response;

    const workspaceId = $wsa.value.workspaceId;
    const campaigns = await listCampaigns({ workspaceId });
    const managedCampaigns = campaigns.filter((campaign: Campaign) => campaign.status !== "completed");
    // Keep promoted leads visible in Copilot even when campaign is draft/paused.
    const activeCampaigns = managedCampaigns;
    const mode = managedCampaigns.some((campaign) => campaign.settings?.reviewMode)
      ? "review"
      : "autopilot";

    const scheduledLeads: Array<{
      lead: Lead;
      campaign: Campaign;
    }> = [];
    const actionCandidates: Array<{
      lead: Lead;
      campaign: Campaign;
    }> = [];

    for (const campaign of activeCampaigns) {
      const leads = await listLeads(campaign.id, { workspaceId });
      for (const lead of leads) {
        if (lead.status === "discovered" || lead.status === "new") {
          scheduledLeads.push({ lead, campaign });
        }
        if (["discovered", "new", "invite_sent", "accepted", "message_sent"].includes(lead.status)) {
          actionCandidates.push({ lead, campaign });
        }
      }
    }

    scheduledLeads.sort((a, b) => (b.lead.aiScore || 0) - (a.lead.aiScore || 0));
    const top = scheduledLeads.slice(0, 50);

    const enrichmentCache = new Map<string, Lead>();
    async function getEnrichedLead(lead: Lead, campaign: Campaign) {
      const cacheKey = `${campaign.id}:${lead.id}`;
      const cached = enrichmentCache.get(cacheKey);
      if (cached) return cached;
      const seat = await resolveLinkedInSeatForCampaign(campaign, campaign.workspaceId);
      const workspace = await getWorkspace(campaign.workspaceId);
      const clientConfig = await resolveWorkspaceLinkedInClientConfig(workspace, seat);
      const enriched = await ensureLeadCompanyData(lead, clientConfig);
      enrichmentCache.set(cacheKey, enriched);
      return enriched;
    }

    const copilotLeads = await Promise.all(top.map(async ({ lead, campaign }) => {
      const enrichedLead = await getEnrichedLead(lead, campaign);
      const parsedSignal = parseSignal(enrichedLead);
      const { signalSource, signalText, signalSourceUrl, signalSourceUrlType } = parsedSignal;
      const signalDetails = buildSignalDetails(parsedSignal, enrichedLead.publicIdentifier);
      const scoreBreakdown = buildScoreBreakdown(enrichedLead, parsedSignal);
      const company = getLeadCompanySnapshot(enrichedLead);
      const seat = await resolveLinkedInSeatForCampaign(campaign, campaign.workspaceId);
      const workspace = await getWorkspace(campaign.workspaceId);
      const sequence = buildSequence(enrichedLead, campaign, seat);
      const scheduledAction = computeInviteAction(enrichedLead, campaign, seat, scoreBreakdown);

      return {
        id: lead.id,
        name: enrichedLead.name,
        headline: enrichedLead.headline,
        company: company.companyName,
        companyName: company.companyName,
        companySize: company.companySize,
        industry: company.industry,
        companyDescription: company.companyDescription,
        companyLinkedInUrl: company.companyLinkedInUrl,
        location: enrichedLead.location || "",
        profilePictureUrl: enrichedLead.profilePictureUrl,
        publicIdentifier: enrichedLead.publicIdentifier,
        aiScore: enrichedLead.aiScore || 0,
        signal: signalText,
        signalSource,
        signalSourceUrl,
        signalSourceUrlType,
        signalDetails,
        scoreBreakdown,
        segment: enrichedLead.segment || campaign.segment,
        campaignId: campaign.id,
        campaignName: campaign.name,
        campaignStatus: campaign.status,
        reviewMode: Boolean(campaign.settings?.reviewMode),
        approved: Boolean(enrichedLead.approved),
        sequence,
        sequenceState: {
          currentStep: enrichedLead.currentStep,
          leadStatus: enrichedLead.status,
          nextStep: sequence.find((step) => step.step === enrichedLead.currentStep + 1) || null,
          manualOverride: hasManualOverride(enrichedLead),
          completed: !sequence.some((step) => step.state !== "completed"),
        },
        scheduledAction,
        seat: seat ? await serializeLinkedInSeatWithProfile(seat, workspace) : null,
      };
    }));

    const actionQueueRaw = await Promise.all(
      actionCandidates.map(async ({ lead, campaign }) => {
        const enrichedLead = await getEnrichedLead(lead, campaign);
        const parsedSignal = parseSignal(enrichedLead);
        const signalDetails = buildSignalDetails(parsedSignal, enrichedLead.publicIdentifier);
        const scoreBreakdown = buildScoreBreakdown(enrichedLead, parsedSignal);
        const company = getLeadCompanySnapshot(enrichedLead);
        const seat = await resolveLinkedInSeatForCampaign(campaign, campaign.workspaceId);
        const workspace = await getWorkspace(campaign.workspaceId);
        const sequence = buildSequence(enrichedLead, campaign, seat);
        const scheduledAction = lead.status === "discovered" || lead.status === "new"
          ? computeInviteAction(enrichedLead, campaign, seat, scoreBreakdown)
          : computeSequenceAction(enrichedLead, campaign, seat, scoreBreakdown);

        if (!scheduledAction) return null;
        if (scheduledAction.state === "completed") return null;

        return {
          id: scheduledAction.id,
          lead: {
            id: enrichedLead.id,
            name: enrichedLead.name,
            headline: enrichedLead.headline,
            location: enrichedLead.location,
            publicIdentifier: enrichedLead.publicIdentifier,
            profilePictureUrl: enrichedLead.profilePictureUrl,
            status: enrichedLead.status,
            approved: Boolean(enrichedLead.approved),
          },
          company,
          signal: signalDetails,
          scoreBreakdown,
          campaign: {
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            reviewMode: Boolean(campaign.settings?.reviewMode),
          },
          seat: seat ? await serializeLinkedInSeatWithProfile(seat, workspace) : null,
          scheduledAction,
          sequenceState: {
            currentStep: enrichedLead.currentStep,
            leadStatus: enrichedLead.status,
            nextStep: sequence.find((step) => step.step === enrichedLead.currentStep + 1) || null,
            steps: sequence,
            manualOverride: hasManualOverride(enrichedLead),
          },
        };
      }),
    );

    const actionStateRank: Record<CopilotActionState, number> = {
      ready: 0,
      review: 1,
      scheduled: 2,
      blocked: 3,
      completed: 4,
    };

    const actionQueue = actionQueueRaw
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => {
        const stateDiff = actionStateRank[a.scheduledAction.state] - actionStateRank[b.scheduledAction.state];
        if (stateDiff !== 0) return stateDiff;
        const timeA = a.scheduledAction.scheduledFor ? Date.parse(a.scheduledAction.scheduledFor) : Number.POSITIVE_INFINITY;
        const timeB = b.scheduledAction.scheduledFor ? Date.parse(b.scheduledAction.scheduledFor) : Number.POSITIVE_INFINITY;
        if (timeA !== timeB) return timeA - timeB;
        return b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore;
      })
      .slice(0, 100);

    let nextLaunchIn = "unknown";
    for (const c of activeCampaigns) {
      if (c.execution?.nextInviteAt) {
        const diff = new Date(c.execution.nextInviteAt).getTime() - Date.now();
        if (diff > 0) {
          const hours = Math.floor(diff / 3600000);
          if (hours > 0) {
            nextLaunchIn = `in ${hours} hour${hours !== 1 ? "s" : ""}`;
          } else {
            const mins = Math.floor(diff / 60000);
            nextLaunchIn = `in ${mins} min`;
          }
          break;
        }
      }
    }

    return NextResponse.json({
      mode,
      nextLaunchIn,
      summary: {
        activeCampaigns: activeCampaigns.length,
        reviewCampaigns: activeCampaigns.filter((campaign) => campaign.settings?.reviewMode).length,
        autopilotCampaigns: activeCampaigns.filter((campaign) => !campaign.settings?.reviewMode).length,
        reviewQueueCount: scheduledLeads.length,
        actionQueueCount: actionQueue.length,
        readyActions: actionQueue.filter((item) => item.scheduledAction.state === "ready").length,
        scheduledActions: actionQueue.filter((item) => item.scheduledAction.state === "scheduled").length,
        blockedActions: actionQueue.filter((item) => item.scheduledAction.state === "blocked").length,
      },
      leads: copilotLeads,
      actionQueue,
    });
  } catch (error) {
    console.error("Copilot API error:", error);
    return NextResponse.json(
      {
        error: "Failed to load copilot queue",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const $wsa = await requireAppWorkspaceRead(req);

    if (!$wsa.ok) return $wsa.response;

    const workspaceId = $wsa.value.workspaceId;
    const body = await req.json().catch(() => ({}));
    const requestedMode = body.mode === "autopilot" ? "autopilot" : body.mode === "review" ? "review" : null;

    if (!requestedMode) {
      return NextResponse.json({ error: "mode must be 'autopilot' or 'review'" }, { status: 400 });
    }

    const campaigns = await listCampaigns({ workspaceId });
    const mutableCampaigns = campaigns.filter((campaign) => campaign.status !== "completed");
    const reviewMode = requestedMode === "review";

    await Promise.all(
      mutableCampaigns.map((campaign) =>
        saveCampaign({
          ...campaign,
          settings: {
            ...campaign.settings,
            reviewMode,
          },
        })
      )
    );

    return NextResponse.json({
      ok: true,
      mode: requestedMode,
      updatedCount: mutableCampaigns.length,
    });
  } catch (error) {
    console.error("Copilot mode update error:", error);
    return NextResponse.json({ error: "Failed to update copilot mode" }, { status: 500 });
  }
}
