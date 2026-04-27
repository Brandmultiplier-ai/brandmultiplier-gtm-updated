import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";
import type { Campaign, Lead, LeadStatus, SequenceStep } from "@/lib/types";
import {
  resolveLinkedInSeatForCampaign,
  serializeLinkedInSeatWithProfile,
  serializeLinkedInSeatsWithProfile,
} from "@/lib/linkedin-seats";

interface StepStats {
  step: number;
  type: string;
  total: number;
  accepted: number;
  replied: number;
}

interface DailyActivity {
  date: string;
  invited: number;
  accepted: number;
  replied: number;
}

function computeStepStats(leads: Lead[], sequenceLength: number): StepStats[] {
  const stats: StepStats[] = [];

  for (let s = 1; s <= sequenceLength; s++) {
    const atOrPastStep = leads.filter((l) => l.currentStep >= s);
    const acceptedStatuses: LeadStatus[] = ["accepted", "message_sent", "manual_override", "replied", "interested"];
    const repliedStatuses: LeadStatus[] = ["replied", "interested"];

    stats.push({
      step: s,
      type: s === 1 ? "connection_request" : "message",
      total: atOrPastStep.length,
      accepted: atOrPastStep.filter((l) => acceptedStatuses.includes(l.status)).length,
      replied: atOrPastStep.filter((l) => repliedStatuses.includes(l.status)).length,
    });
  }

  return stats;
}

function computeDailyActivity(leads: Lead[]): DailyActivity[] {
  const dayMap: Record<string, DailyActivity> = {};

  for (const lead of leads) {
    for (const event of lead.events) {
      const date = event.ts.slice(0, 10);
      if (!dayMap[date]) {
        dayMap[date] = { date, invited: 0, accepted: 0, replied: 0 };
      }
      if (event.type === "invite_sent") dayMap[date].invited++;
      if (event.type === "accepted") dayMap[date].accepted++;
      if (event.type === "replied") dayMap[date].replied++;
    }
  }

  return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
}

function parseSequenceStep(step: unknown, index: number): { value?: SequenceStep; error?: string } {
  if (!step || typeof step !== "object") {
    return { error: `Sequence step ${index + 1} must be an object` };
  }

  const candidate = step as Partial<SequenceStep> & Record<string, unknown>;
  const hasRequiredKeys = ["step", "type", "trigger", "delayDays", "content"].every((key) =>
    Object.prototype.hasOwnProperty.call(candidate, key)
  );

  if (!hasRequiredKeys) {
    return { error: `Sequence step ${index + 1} is missing one of: step, type, trigger, delayDays, content` };
  }

  const type = candidate.type;
  const trigger = candidate.trigger;

  if (type !== "connection_request" && type !== "message" && type !== "profile_visit") {
    return { error: `Sequence step ${index + 1} has invalid type` };
  }
  if (trigger !== "immediate" && trigger !== "accepted" && trigger !== "no_reply") {
    return { error: `Sequence step ${index + 1} has invalid trigger` };
  }

  const stepNumber = Number(candidate.step);
  const delayDays = Number(candidate.delayDays);
  if (!Number.isFinite(stepNumber) || stepNumber < 1) {
    return { error: `Sequence step ${index + 1} has invalid step number` };
  }
  if (!Number.isFinite(delayDays) || delayDays < 0) {
    return { error: `Sequence step ${index + 1} has invalid delayDays` };
  }

  if (typeof candidate.content !== "string") {
    return { error: `Sequence step ${index + 1} content must be a string` };
  }
  const content = candidate.content.trim();
  if (type === "message" && !content) {
    return { error: `Sequence step ${index + 1} content cannot be empty for message steps` };
  }

  return {
    value: {
      step: Math.round(stepNumber),
      type,
      trigger,
      delayDays: Math.round(delayDays),
      content,
    },
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const campaign = await store.getCampaign(id, workspaceId);

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const [workspace, agent, leads, stats, seats] = await Promise.all([
    store.getWorkspace(workspaceId),
    store.getAgent(campaign.agentId, workspaceId),
    store.listLeads(campaign.id, { workspaceId }),
    store.getCampaignStats(campaign.id, workspaceId),
    store.listLinkedInSeats(workspaceId),
  ]);
  const stepStats = computeStepStats(leads, campaign.sequence.length);
  const dailyActivity = computeDailyActivity(leads);
  const normalizedSeats = await serializeLinkedInSeatsWithProfile(seats, workspace);
  const assignedSeat = await resolveLinkedInSeatForCampaign(campaign, workspaceId);

  // Enrich contacts with step info
  const contacts = leads.map((lead) => ({
    id: lead.id,
    name: lead.name,
    headline: lead.headline,
    company: lead.company,
    profilePictureUrl: lead.profilePictureUrl,
    signal: lead.signal,
    aiScore: lead.aiScore,
    status: lead.status,
    currentStep: lead.currentStep,
    segment: lead.segment,
    language: lead.language,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  }));

  return NextResponse.json({
    campaign,
    agent: agent ? { id: agent.id, name: agent.name, limits: agent.limits } : null,
    seat: assignedSeat ? await serializeLinkedInSeatWithProfile(assignedSeat, workspace) : null,
    seats: normalizedSeats,
    stats,
    stepStats,
    contacts,
    dailyActivity,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const campaign = await store.getCampaign(id, workspaceId);

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  if (body.action === "rejectLead") {
    const leadId = typeof body.leadId === "string" ? body.leadId : "";
    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }

    const lead = await store.getLead(id, leadId, workspaceId);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    lead.status = "skipped";
    lead.approved = false;
    lead.events.push({
      ts: new Date().toISOString(),
      type: "skipped",
      message: typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : "rejected_from_campaign",
    });

    const savedLead = await store.saveLead(lead);
    return NextResponse.json({ ok: true, lead: savedLead });
  }

  if (typeof body.status === "string") {
    const allowedStatuses: Campaign["status"][] = ["active", "paused", "draft", "completed"];
    if (!allowedStatuses.includes(body.status as Campaign["status"])) {
      return NextResponse.json({ error: "Invalid campaign status" }, { status: 400 });
    }

    const savedCampaign = await store.saveCampaign({
      ...campaign,
      status: body.status as Campaign["status"],
    });

    return NextResponse.json({ ok: true, campaign: savedCampaign });
  }

  if (typeof body.linkedinSeatId === "string" || body.linkedinSeatId === null) {
    const savedCampaign = await store.saveCampaign({
      ...campaign,
      linkedinSeatId: typeof body.linkedinSeatId === "string" && body.linkedinSeatId.trim()
        ? body.linkedinSeatId
        : undefined,
    });

    return NextResponse.json({ ok: true, campaign: savedCampaign });
  }

  if (
    (body.settings && typeof body.settings === "object") ||
    (body.search && typeof body.search === "object") ||
    Array.isArray(body.sequence)
  ) {
    const nextSettings = body.settings && typeof body.settings === "object"
      ? body.settings
      : {};
    const nextLocations = Array.isArray(body.search?.locations)
      ? body.search.locations
          .map((location: unknown) => typeof location === "string" ? location.trim() : "")
          .filter(Boolean)
      : campaign.search.locations;
    let nextSequence = campaign.sequence;
    if (Array.isArray(body.sequence)) {
      const parsed = body.sequence.map((step: unknown, index: number) => parseSequenceStep(step, index));
      const firstError = parsed.find((result: { value?: SequenceStep; error?: string }) => result.error);
      if (firstError?.error) {
        return NextResponse.json({ error: firstError.error }, { status: 400 });
      }

      nextSequence = parsed
        .map((result: { value?: SequenceStep; error?: string }) => result.value as SequenceStep)
        .sort((a: SequenceStep, b: SequenceStep) => a.step - b.step);

      const hasDuplicateStepNumbers = new Set(nextSequence.map((step: SequenceStep) => step.step)).size !== nextSequence.length;
      if (hasDuplicateStepNumbers) {
        return NextResponse.json({ error: "Sequence contains duplicate step numbers" }, { status: 400 });
      }

      const isContiguous = nextSequence.every((step: SequenceStep, index: number) => step.step === index + 1);
      if (!isContiguous) {
        return NextResponse.json({ error: "Sequence steps must be contiguous starting at 1" }, { status: 400 });
      }
    }

    const savedCampaign = await store.saveCampaign({
      ...campaign,
      search: {
        ...campaign.search,
        ...(typeof body.search?.keywords === "string" ? { keywords: body.search.keywords } : {}),
        ...(typeof body.search?.titleFilter === "string" ? { titleFilter: body.search.titleFilter } : {}),
        ...(typeof body.search?.language === "string" ? { language: body.search.language } : {}),
        locations: nextLocations,
      },
      sequence: nextSequence,
      settings: {
        ...campaign.settings,
        ...(typeof nextSettings.goal === "string" ? { goal: nextSettings.goal } : {}),
        ...(typeof nextSettings.tone === "string" ? { tone: nextSettings.tone } : {}),
        ...(typeof nextSettings.excludeFirstDegree === "boolean"
          ? { excludeFirstDegree: nextSettings.excludeFirstDegree }
          : {}),
        ...(typeof nextSettings.reviewMode === "boolean"
          ? { reviewMode: nextSettings.reviewMode }
          : {}),
        ...(nextSettings.inviteSource === "campaign_step" || nextSettings.inviteSource === "template_library"
          ? { inviteSource: nextSettings.inviteSource }
          : {}),
        ...(nextSettings.autopilotDraftMode === "ignore_saved_drafts" || nextSettings.autopilotDraftMode === "use_saved_drafts"
          ? { autopilotDraftMode: nextSettings.autopilotDraftMode }
          : {}),
      },
    });

    return NextResponse.json({ ok: true, campaign: savedCampaign });
  }

  return NextResponse.json({ error: "Unsupported patch payload" }, { status: 400 });
}
