"use client";

import { useState, useEffect, use, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Pause,
  Play,
  Loader2,
  Flame,
  User,
  Send,
  UserPlus,
  Eye,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Search,
  ChevronDown,
  Clock,
  Zap,
  BarChart3,
  Settings,
  CalendarClock,
  History,
  Plus,
  Minus,
  Trash2,
} from "lucide-react";
import type {
  Campaign,
  CampaignStats,
  SequenceStep,
  LeadStatus,
} from "@/lib/types";
import { describeCampaignMarket } from "@/lib/campaign-targeting";
import { Claudio } from "@/components/claudio";

// ── Types ────────────────────────────────────────────────────────────────

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

interface ContactItem {
  id: string;
  name: string;
  headline: string;
  company: string;
  profilePictureUrl?: string;
  signal: string;
  aiScore: number;
  status: LeadStatus;
  currentStep: number;
  segment: string;
  language: string;
  createdAt: string;
  updatedAt: string;
}

interface AgentInfo {
  id: string;
  name: string;
  limits: {
    invitesPerDay: number;
    invitesPerWeek: number;
    delayBetweenInvitesMs: number;
    maxMessageLength: number;
  };
}

interface LinkedInSeatSummary {
  id: string;
  name: string;
  status: "active" | "paused";
  country: string;
  unipileAccountId: string;
  profileName?: string;
  profilePictureUrl?: string;
  profileHeadline?: string;
  profilePublicIdentifier?: string;
  profileUrl?: string;
  isDefault?: boolean;
  quotas: {
    profileLookupsPerWeek: number;
    invitationsPerWeek: number;
    messagesPerWeek: number;
  };
  schedule: {
    timezone: string;
    launchHour: number;
    randomizedLaunchWindowHours: number;
    activeDays: {
      monday: boolean;
      tuesday: boolean;
      wednesday: boolean;
      thursday: boolean;
      friday: boolean;
      saturday: boolean;
      sunday: boolean;
    };
    warmup?: {
      enabled: boolean;
      rampEveryDays: number;
      startedAt?: string;
      lastRateLimitedAt?: string;
    };
  };
  usage: {
    weekKey: string;
    invitationsUsed: number;
    messagesUsed: number;
    profileLookupsUsed: number;
    prospectingRunsToday: number;
  };
  effectiveQuotas?: {
    profileLookupsPerWeek: number;
    invitationsPerWeek: number;
    messagesPerWeek: number;
  };
  effectiveDailyQuotas?: {
    profileLookupsPerDay: number;
    invitationsPerDay: number;
    messagesPerDay: number;
  };
  warmupState?: {
    enabled: boolean;
    stage: number;
    totalStages: number;
    statusLabel: string;
  };
}

interface CampaignDetailData {
  campaign: Campaign;
  agent: AgentInfo | null;
  seat: LinkedInSeatSummary | null;
  seats: LinkedInSeatSummary[];
  stats: CampaignStats;
  stepStats: StepStats[];
  contacts: ContactItem[];
  dailyActivity: DailyActivity[];
}

type CampaignSettingsPayload = {
  goal: "conversations" | "demos";
  tone: "professional" | "conversational" | "direct";
  excludeFirstDegree: boolean;
  reviewMode: boolean;
  inviteSource: "campaign_step" | "template_library";
  autopilotDraftMode: "ignore_saved_drafts" | "use_saved_drafts";
  targetLocations: string[];
};

type TabId =
  | "workflow"
  | "contacts"
  | "insights"
  | "settings"
  | "scheduled"
  | "launches";

// ── Helpers ──────────────────────────────────────────────────────────────

function statusLabel(status: LeadStatus): string {
  const map: Record<string, string> = {
    discovered: "Discovered",
    new: "New",
    invite_sent: "Invited",
    already_invited: "Already Invited",
    invite_failed: "Failed",
    accepted: "Accepted",
    message_sent: "Message Sent",
    manual_override: "Manual Override",
    replied: "Replied",
    interested: "Interested",
    not_interested: "Not Interested",
    rate_limited: "Rate Limited",
    skipped: "Excluded",
  };
  return map[status] || status;
}

function statusColor(status: LeadStatus): string {
  if (["accepted", "message_sent"].includes(status))
    return "bg-coral/10 text-coral";
  if (["manual_override"].includes(status))
    return "bg-warning/10 text-warning";
  if (["replied", "interested"].includes(status))
    return "bg-success/10 text-success";
  if (["invite_sent"].includes(status))
    return "bg-warning/10 text-warning";
  if (["invite_failed", "not_interested"].includes(status))
    return "bg-destructive/10 text-destructive";
  if (["skipped", "already_invited"].includes(status))
    return "bg-muted/40 text-stone";
  return "bg-muted/40 text-muted-foreground";
}

function stepTypeLabel(type: string): string {
  if (type === "connection_request") return "Send Invitation";
  if (type === "message") return "Send Message";
  if (type === "profile_visit") return "Visit Profile";
  return type;
}

function stepTypeColor(type: string): string {
  if (type === "connection_request") return "violet";
  if (type === "message") return "cyan";
  if (type === "profile_visit") return "blue";
  return "gray";
}

function stepBorderColor(type: string): string {
  if (type === "connection_request") return "border-terracotta/40";
  if (type === "message") return "border-coral/40";
  if (type === "visit_profile") return "border-brand/40";
  return "border-border";
}

function stepBgColor(type: string): string {
  if (type === "connection_request") return "bg-terracotta/5";
  if (type === "message") return "bg-coral/5";
  if (type === "visit_profile") return "bg-brand/5";
  return "bg-muted/20";
}

function stepAccentColor(type: string): string {
  if (type === "connection_request") return "text-terracotta";
  if (type === "message") return "text-coral";
  if (type === "visit_profile") return "text-brand";
  return "text-muted-foreground";
}

function stepDotColor(type: string): string {
  if (type === "connection_request") return "bg-terracotta";
  if (type === "message") return "bg-coral";
  if (type === "visit_profile") return "bg-brand";
  return "bg-stone";
}

function stepIconEl(type: string) {
  if (type === "connection_request")
    return <UserPlus className="size-4 text-terracotta" />;
  if (type === "message")
    return <MessageSquare className="size-4 text-coral" />;
  if (type === "profile_visit" || type === "visit_profile")
    return <Eye className="size-4 text-brand" />;
  return <Zap className="size-4 text-muted-foreground" />;
}

function stepIconElWhite(type: string) {
  if (type === "connection_request")
    return <UserPlus className="size-5 text-white" />;
  if (type === "message")
    return <MessageSquare className="size-5 text-white" />;
  if (type === "profile_visit" || type === "visit_profile")
    return <Eye className="size-5 text-white" />;
  return <Zap className="size-5 text-white" />;
}

function stepHeaderBg(type: string): string {
  if (type === "connection_request") return "bg-gradient-to-br from-terracotta to-[#a8472a]";
  if (type === "message") return "bg-gradient-to-br from-coral to-[#b85a36]";
  if (type === "visit_profile" || type === "profile_visit") return "bg-gradient-to-br from-brand to-brand-hover";
  return "bg-gradient-to-br from-stone to-charcoal";
}

function seatActiveDaysCount(seat: LinkedInSeatSummary | null): number {
  if (!seat) return 5;
  return Object.values(seat.schedule.activeDays).filter(Boolean).length || 5;
}

function perDayQuota(totalPerWeek: number, activeDays: number): number {
  if (totalPerWeek <= 0) return 0;
  return Math.max(1, Math.round(totalPerWeek / Math.max(1, activeDays)));
}

function formatNextLaunch(campaign: Campaign): string {
  if (campaign.status !== "active") return "Campaign is paused";
  const next = campaign.execution?.nextInviteAt;
  if (!next) return "Waiting for next launch window";
  const diffMs = new Date(next).getTime() - Date.now();
  if (Number.isNaN(diffMs)) return "Waiting for next launch window";
  if (diffMs <= 0) return "Launch window open";
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) return `Next launch ~ in ${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  return `Next launch ~ in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
}

function buildDefaultStepContent(language: string, stepNumber: number): string {
  const normalizedLanguage = language.trim().toLowerCase();
  const isItalian = normalizedLanguage === "it";

  if (stepNumber === 2) {
    return isItalian
      ? "Ciao {{firstName}}, grazie per aver accettato. Ti scrivo qui per capire se ha senso confrontarci su come state gestendo oggi questa parte."
      : "Hi {{firstName}}, thanks for accepting. Following up here to see whether it makes sense to compare notes on how you are handling this today.";
  }

  return isItalian
    ? "Ciao {{firstName}}, riprendo questo messaggio nel caso ti fosse sfuggito. Se ha senso, posso condividerti 2-3 spunti concreti."
    : "Hi {{firstName}}, bumping this in case it got buried. If useful, I can share 2-3 concrete ideas relevant to your situation.";
}

function buildAppendedSequenceStep(sequence: SequenceStep[], campaignLanguage: string): SequenceStep {
  const lastStep = sequence[sequence.length - 1];
  const nextStepNumber = (lastStep?.step || 0) + 1;

  return {
    step: nextStepNumber,
    type: "message",
    trigger: nextStepNumber === 2 ? "accepted" : "no_reply",
    delayDays: nextStepNumber === 2 ? 1 : 2,
    content: buildDefaultStepContent(campaignLanguage, nextStepNumber),
  };
}

// ── Score Flames ─────────────────────────────────────────────────────────

function ScoreFlames({ score }: { score: number }) {
  // score 0-10 maps to 0-3 flames
  const active = Math.min(3, Math.round((score / 10) * 3));
  return (
    <div className="flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <Flame
          key={i}
          className={`size-3.5 ${
            i < active
              ? "text-brand fill-brand"
              : "text-stone fill-transparent"
          }`}
        />
      ))}
    </div>
  );
}

// ── Workflow Tab ──────────────────────────────────────────────────────────

function WorkflowTab({
  campaign,
  agent,
  seat,
  seats,
  stats,
  stepStats,
  assigningSeat,
  onAssignSeat,
  onSaveSequence,
  onToggleStatus,
  togglingStatus,
  onViewStepContacts,
}: {
  campaign: Campaign;
  agent: AgentInfo | null;
  seat: LinkedInSeatSummary | null;
  seats: LinkedInSeatSummary[];
  stats: CampaignStats;
  stepStats: StepStats[];
  assigningSeat: boolean;
  onAssignSeat: (seatId: string) => Promise<void>;
  onSaveSequence: (sequence: SequenceStep[]) => Promise<void>;
  onToggleStatus: () => Promise<void>;
  togglingStatus: boolean;
  onViewStepContacts: (stepNumber: number) => void;
}) {
  const responded = stats.replied;
  const finished = stats.accepted - stats.replied;
  const activeDays = seatActiveDaysCount(seat);
  const invitationPerDay = seat?.effectiveDailyQuotas?.invitationsPerDay
    ?? perDayQuota(seat?.effectiveQuotas?.invitationsPerWeek || seat?.quotas.invitationsPerWeek || 0, activeDays);
  const messagesPerDay = seat?.effectiveDailyQuotas?.messagesPerDay
    ?? perDayQuota(seat?.effectiveQuotas?.messagesPerWeek || seat?.quotas.messagesPerWeek || 0, activeDays);
  const senderName = seat?.profileName || seat?.name || agent?.name || "Primary sender";
  const senderConnected = Boolean(seat?.unipileAccountId);
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [stepDraft, setStepDraft] = useState<SequenceStep | null>(null);
  const [savingStep, setSavingStep] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [stepNotice, setStepNotice] = useState<string | null>(null);
  const [queuedEditStep, setQueuedEditStep] = useState<number | null>(null);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 1.5;
  const ZOOM_STEP = 0.1;
  function zoomIn() { setCanvasZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2))); }
  function zoomOut() { setCanvasZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2))); }
  function zoomReset() { setCanvasZoom(1); }
  const originalEditingStep = editingStep !== null
    ? campaign.sequence.find((step) => step.step === editingStep) || null
    : null;
  const hasUnsavedChanges = Boolean(
    editingStep !== null &&
    stepDraft &&
    originalEditingStep &&
    JSON.stringify(stepDraft) !== JSON.stringify(originalEditingStep)
  );

  function draftStorageKey(stepNumber: number): string {
    return `brandmultiplier-gtm:campaign-sequence-draft:${campaign.id}:${stepNumber}`;
  }

  useEffect(() => {
    if (queuedEditStep !== null) {
      const nextStep = campaign.sequence.find((step) => step.step === queuedEditStep);
      if (nextStep) {
        let hydratedStep = { ...nextStep };
        if (typeof window !== "undefined") {
          const savedDraft = window.sessionStorage.getItem(draftStorageKey(nextStep.step));
          if (savedDraft) {
            try {
              hydratedStep = JSON.parse(savedDraft) as SequenceStep;
            } catch {}
          }
        }
        setEditingStep(nextStep.step);
        setStepDraft(hydratedStep);
        setStepError(null);
        setStepNotice("Step added. Finish the copy and save it to the campaign.");
        setQueuedEditStep(null);
      }
      return;
    }
    setEditingStep(null);
    setStepDraft(null);
    setStepError(null);
  }, [campaign.sequence, queuedEditStep, campaign.id]);

  useEffect(() => {
    if (typeof window === "undefined" || editingStep === null || !stepDraft) return;
    window.sessionStorage.setItem(draftStorageKey(editingStep), JSON.stringify(stepDraft));
  }, [campaign.id, editingStep, stepDraft]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  function startEditing(step: SequenceStep) {
    if (
      hasUnsavedChanges &&
      editingStep !== step.step &&
      !window.confirm("You have unsaved changes in this step. Discard them and switch?")
    ) {
      return;
    }
    let hydratedStep = { ...step };
    if (typeof window !== "undefined") {
      const savedDraft = window.sessionStorage.getItem(draftStorageKey(step.step));
      if (savedDraft) {
        try {
          hydratedStep = JSON.parse(savedDraft) as SequenceStep;
        } catch {}
      }
    }
    setEditingStep(step.step);
    setStepDraft(hydratedStep);
    setStepError(null);
    setStepNotice(null);
  }

  function clearDraft(stepNumber: number | null) {
    if (typeof window === "undefined" || stepNumber === null) return;
    window.sessionStorage.removeItem(draftStorageKey(stepNumber));
  }

  function cancelEditing(force = false) {
    if (!force && hasUnsavedChanges && !window.confirm("Discard unsaved changes for this step?")) {
      return;
    }
    clearDraft(editingStep);
    setEditingStep(null);
    setStepDraft(null);
    setStepError(null);
  }

  async function saveStep() {
    if (!stepDraft) return;
    setSavingStep(true);
    setStepError(null);
    try {
      const nextSequence = campaign.sequence.map((step) =>
        step.step === stepDraft.step ? stepDraft : step
      );
      await onSaveSequence(nextSequence);
      clearDraft(stepDraft.step);
      setStepNotice(`Step ${stepDraft.step} saved to campaign.`);
      cancelEditing(true);
    } catch (error) {
      setStepError(error instanceof Error ? error.message : "Failed to save step");
    } finally {
      setSavingStep(false);
    }
  }

  async function updateStepConnector(
    stepNumber: number,
    update: { delayDays: number; trigger: SequenceStep["trigger"] }
  ) {
    const target = campaign.sequence.find((s) => s.step === stepNumber);
    const safeDelay = Math.max(0, Math.floor(update.delayDays));
    const safeTrigger = update.trigger;
    if (!target || (target.delayDays === safeDelay && target.trigger === safeTrigger)) return;
    setSavingStep(true);
    setStepError(null);
    try {
      const nextSequence = campaign.sequence.map((s) =>
        s.step === stepNumber
          ? { ...s, delayDays: safeDelay, trigger: safeTrigger }
          : s
      );
      await onSaveSequence(nextSequence);
      setStepNotice(`Step ${stepNumber} timing updated.`);
    } catch (error) {
      setStepError(error instanceof Error ? error.message : "Failed to update timing");
    } finally {
      setSavingStep(false);
    }
  }

  async function appendStep() {
    const nextStep = buildAppendedSequenceStep(campaign.sequence, campaign.search.language);
    setSavingStep(true);
    setStepError(null);
    setStepNotice(null);
    try {
      setQueuedEditStep(nextStep.step);
      await onSaveSequence([...campaign.sequence, nextStep]);
    } catch (error) {
      setQueuedEditStep(null);
      setStepError(error instanceof Error ? error.message : "Failed to add step");
    } finally {
      setSavingStep(false);
    }
  }

  async function deleteTrailingStep(step: SequenceStep, stepStat: StepStats | undefined) {
    if (step.step === 1 || step.step !== campaign.sequence.length) return;
    if ((stepStat?.total || 0) > 0) {
      setStepError("Only trailing steps with no contacted leads can be deleted.");
      return;
    }
    if (!window.confirm(`Delete Step ${step.step} from this workflow?`)) return;

    setSavingStep(true);
    setStepError(null);
    setStepNotice(null);
    try {
      await onSaveSequence(campaign.sequence.filter((item) => item.step !== step.step));
      clearDraft(step.step);
      setStepNotice(`Step ${step.step} deleted from campaign.`);
      if (editingStep === step.step) {
        cancelEditing(true);
      }
    } catch (error) {
      setStepError(error instanceof Error ? error.message : "Failed to delete step");
    } finally {
      setSavingStep(false);
    }
  }

  return (
    <div className="space-y-0">
      <div className="clean-card overflow-hidden mb-6">
        <div className="px-6 py-5 border-b border-border flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-medium tracking-[-0.04em] text-foreground">Campaign Workflow</h3>
            <p className="text-sm text-stone mt-1">Design and manage your campaign automation steps</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className={`inline-flex items-center gap-2 text-sm font-medium ${campaign.status === "active" ? "text-foreground" : "text-muted-foreground"}`}>
                <span className={`size-3 rounded-full ${campaign.status === "active" ? "bg-success" : "bg-stone"}`} />
                Campaign is {campaign.status}
              </div>
              <p className="text-sm text-stone mt-1">{formatNextLaunch(campaign)}</p>
            </div>
            {campaign.status === "active" ? (
              <button
                onClick={() => void onToggleStatus()}
                disabled={togglingStatus}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-60"
              >
                <Pause className="size-3.5" /> {togglingStatus ? "Pausing..." : "Pause"}
              </button>
            ) : (
              <button
                onClick={() => void onToggleStatus()}
                disabled={togglingStatus}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors disabled:opacity-60"
              >
                <Play className="size-3.5" /> {togglingStatus ? "Resuming..." : "Resume"}
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="rounded-2xl border border-border bg-muted/20 px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <p className="text-sm font-medium text-muted-foreground shrink-0">Sender:</p>
              {seat?.profilePictureUrl ? (
                <img
                  src={seat.profilePictureUrl}
                  alt={senderName}
                  className="size-10 rounded-full object-cover shrink-0 border border-border"
                />
              ) : (
                <div className="size-10 rounded-full bg-gradient-to-br from-brand to-terracotta flex items-center justify-center text-sm font-bold text-white shrink-0 font-ui">
                  {senderName.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-2xl font-light tracking-[-0.04em] text-foreground">{senderName}</p>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${senderConnected ? "bg-success/10 text-success border border-success/20" : "bg-muted/40 text-stone border border-border"}`}>
                    {senderConnected ? "Connected" : "Not connected"}
                  </span>
                  {seat && (
                    <>
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand/10 px-2.5 py-1 text-xs text-brand border border-brand/15">
                        <UserPlus className="size-3.5" /> ~{invitationPerDay}/day
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand/10 px-2.5 py-1 text-xs text-brand border border-brand/15">
                        <Send className="size-3.5" /> ~{messagesPerDay}/day
                      </span>
                      {seat?.warmupState?.enabled && (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-coral/10 px-2.5 py-1 text-xs text-coral border border-coral/20">
                          <Zap className="size-3.5" /> {seat.warmupState.statusLabel}
                        </span>
                      )}
                    </>
                  )}
                </div>
                <p className="text-[11px] text-stone mt-1">
                  {seat
                    ? `${seat.name}${seat.country ? ` • ${seat.country}` : ""} • ${seat.usage.invitationsUsed}/${seat.effectiveQuotas?.invitationsPerWeek ?? seat.quotas.invitationsPerWeek} invites used this week`
                    : "Assign a LinkedIn sender seat to control quotas and launch timing"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="relative">
                <select
                  value={campaign.linkedinSeatId || seat?.id || ""}
                  onChange={(event) => void onAssignSeat(event.target.value)}
                  disabled={assigningSeat || seats.length === 0}
                  className="h-10 min-w-[220px] rounded-lg border border-border bg-muted/20 px-3 pr-9 text-sm text-foreground appearance-none focus:outline-none disabled:opacity-60"
                >
                  {seats.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} {item.isDefault ? "• Default" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-stone" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notices above canvas */}
      {(stepNotice || stepError) && (
        <div className="space-y-2">
          {stepNotice && (
            <div className="rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
              {stepNotice}
            </div>
          )}
          {stepError && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {stepError}
            </div>
          )}
        </div>
      )}

      {/* Visual workflow — horizontal canvas */}
      <div className="relative">
        {/* Zoom controls — fixed inside canvas top-right corner */}
        <div className="absolute top-4 right-4 z-40">
          <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card shadow-md px-1 py-1">
            <button
              onClick={zoomOut}
              disabled={canvasZoom <= ZOOM_MIN + 0.001}
              className="size-8 rounded-full flex items-center justify-center text-stone hover:text-foreground hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Zoom out"
            >
              <Minus className="size-4" />
            </button>
            <button
              onClick={zoomReset}
              className="font-ui px-3 h-8 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 min-w-[52px]"
              title="Reset zoom"
            >
              {Math.round(canvasZoom * 100)}%
            </button>
            <button
              onClick={zoomIn}
              disabled={canvasZoom >= ZOOM_MAX - 0.001}
              className="size-8 rounded-full flex items-center justify-center text-stone hover:text-foreground hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Zoom in"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        <div className="canvas-grid overflow-x-auto p-12">
        <div
          className="flex items-center gap-0 min-w-fit pb-4 pt-24"
          style={{ transform: `scale(${canvasZoom})`, transformOrigin: 'top left', transition: 'transform 0.15s ease' }}
        >
          {/* Input Source Node */}
          <div className="flex items-center shrink-0">
            <div className="w-[260px] rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="bg-muted/40 px-5 py-3 flex items-center gap-3">
                <div className="size-9 rounded-lg bg-card flex items-center justify-center shrink-0">
                  <User className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="font-ui text-[10px] uppercase tracking-[0.12em] font-semibold text-stone">Input Source</p>
                  <p className="font-ui text-sm font-semibold text-foreground truncate">{agent?.name || "Agent"}</p>
                </div>
              </div>
              <div className="px-5 py-3">
                <p className="font-ui text-xs text-muted-foreground">{stats.totalLeads} contacts in this list</p>
              </div>
            </div>
            <CanvasConnector />
          </div>

          {/* Sequence Steps */}
          {campaign.sequence.map((step, i) => {
            const ss = stepStats[i];
            const isEditing = editingStep === step.step && stepDraft;
            const activeDraft = isEditing ? stepDraft : step;
            const isLastStep = i === campaign.sequence.length - 1;
            const canDeleteStep =
              step.step > 1 && isLastStep && (ss?.total || 0) === 0;
            const isFirst = i === 0;
            const headerBg = stepHeaderBg(step.type);
            return (
              <div key={step.step} className="flex items-center shrink-0">
                {/* Delay connector before each non-first step */}
                {!isFirst && (
                  <CanvasConnector
                    editableDelayDays={step.delayDays}
                    editableTrigger={step.trigger}
                    onConnectorChange={(update) => void updateStepConnector(step.step, update)}
                    subLabel={step.trigger !== "immediate" ? step.trigger.replace("_", " ") : undefined}
                  />
                )}

                {/* Step Node */}
                <div className="relative">
                  {/* Branch responded — full "exit" node SOPRA each step (Gojiberry style) */}
                  {(ss?.replied || 0) > 0 && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 flex flex-col items-center">
                      <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-2.5 shadow-sm w-[200px]">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="size-4 text-success shrink-0" />
                          <div className="min-w-0">
                            <p className="font-ui text-[11px] font-bold text-success leading-tight">
                              {ss?.replied || 0} {ss?.replied === 1 ? "contact" : "contacts"} responded
                            </p>
                            <p className="font-ui text-[9px] text-success/70 leading-tight">Sequence complete</p>
                          </div>
                        </div>
                      </div>
                      {/* Curved arrow connecting card-bottom → step-top */}
                      <svg width="40" height="24" viewBox="0 0 40 24" className="text-success -mt-px">
                        <path
                          d="M 20 2 C 20 8, 8 10, 8 18 L 8 20"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          fill="none"
                          strokeDasharray="3,3"
                        />
                        <path
                          d="M 5 17 L 8 20 L 11 17"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </svg>
                    </div>
                  )}

                  <div
                    className={`w-[320px] rounded-2xl border-2 ${stepBorderColor(step.type)} bg-card shadow-md overflow-hidden`}
                  >
                    {/* Header — full colored bar */}
                    <div className={`${headerBg} px-5 py-4 flex items-center justify-between`}>
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                          {stepIconElWhite(step.type)}
                        </div>
                        <div>
                          <p className="font-ui text-[9px] uppercase tracking-[0.14em] font-bold text-white/80">Step {step.step}</p>
                          <p className="text-base font-bold text-white tracking-tight">{stepTypeLabel(step.type)}</p>
                        </div>
                      </div>
                      {canDeleteStep && (
                        <button
                          onClick={() => void deleteTrailingStep(step, ss)}
                          disabled={savingStep}
                          className="rounded-lg p-1.5 text-white/70 hover:text-white hover:bg-white/15 disabled:opacity-50"
                          title="Delete trailing step"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Body */}
                    <div className="px-5 py-4">
                      <p className="font-ui text-xs text-muted-foreground line-clamp-3 italic min-h-[42px]">
                        &ldquo;{step.content.slice(0, 130)}{step.content.length > 130 ? "…" : ""}&rdquo;
                      </p>

                      {/* Metrics */}
                      <div className="flex items-center justify-between gap-2 mt-4 pb-3 border-b border-border/60">
                        <div className="flex items-center gap-1.5">
                          <Send className="size-3 text-stone" />
                          <span className="font-ui text-[11px] font-medium text-muted-foreground">{ss?.total || 0}</span>
                          <span className="font-ui text-[10px] text-stone">contacted</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="size-3 text-success" />
                          <span className="font-ui text-[11px] font-medium text-success">{ss?.accepted || 0}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="size-3 text-coral" />
                          <span className="font-ui text-[11px] font-medium text-coral">{ss?.replied || 0}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <button
                          onClick={() => onViewStepContacts(step.step)}
                          className="font-ui rounded-lg border border-border bg-muted/20 hover:bg-muted/40 px-3 py-2 text-[11px] font-medium text-muted-foreground transition-colors"
                          title="View contacts in this step"
                        >
                          View Contacts
                        </button>
                        <button
                          onClick={() => isEditing ? cancelEditing() : startEditing(step)}
                          disabled={savingStep}
                          className={`font-ui rounded-lg px-3 py-2 text-[11px] font-medium transition-colors ${isEditing ? "bg-brand text-white hover:bg-brand-hover" : "border border-brand/20 bg-brand/5 text-brand hover:bg-brand/10"}`}
                        >
                          {isEditing ? "Close" : "Edit"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Inline editor expanded BELOW the step node, absolute positioned */}
                  {isEditing && activeDraft && (
                    <div className="absolute top-[calc(100%+12px)] left-0 z-30 w-[420px] rounded-2xl border border-border bg-popover shadow-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">Edit Step {step.step}</p>
                        <button
                          onClick={() => cancelEditing()}
                          disabled={savingStep}
                          className="text-stone hover:text-foreground"
                        >
                          <XCircle className="size-4" />
                        </button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="font-ui text-[10px] uppercase tracking-wider font-medium text-stone mb-1.5">Trigger</p>
                          <select
                            value={activeDraft.trigger}
                            disabled={activeDraft.step === 1}
                            onChange={(event) =>
                              setStepDraft({
                                ...activeDraft,
                                trigger: event.target.value as SequenceStep["trigger"],
                              })
                            }
                            className="font-ui w-full h-9 rounded-lg border border-border bg-muted/20 px-3 text-sm text-foreground focus:outline-none disabled:opacity-50"
                          >
                            <option value="immediate">Immediate</option>
                            <option value="accepted">After accepted</option>
                            <option value="no_reply">After no reply</option>
                          </select>
                        </div>
                        <div>
                          <p className="font-ui text-[10px] uppercase tracking-wider font-medium text-stone mb-1.5">Delay (days)</p>
                          <input
                            type="number"
                            min={0}
                            value={activeDraft.delayDays}
                            disabled={activeDraft.step === 1}
                            onChange={(event) =>
                              setStepDraft({
                                ...activeDraft,
                                delayDays: Math.max(0, Number(event.target.value) || 0),
                              })
                            }
                            className="font-ui w-full h-9 rounded-lg border border-border bg-muted/20 px-3 text-sm text-foreground focus:outline-none disabled:opacity-50"
                          />
                        </div>
                      </div>
                      <div>
                        <p className="font-ui text-[10px] uppercase tracking-wider font-medium text-stone mb-1.5">
                          {activeDraft.type === "connection_request" ? "Invite copy" : "Message copy"}
                        </p>
                        <textarea
                          value={activeDraft.content}
                          rows={activeDraft.type === "connection_request" ? 4 : 6}
                          onChange={(event) =>
                            setStepDraft({
                              ...activeDraft,
                              content: event.target.value,
                            })
                          }
                          className="font-ui w-full rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm text-foreground placeholder:text-stone focus:outline-none resize-y"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => cancelEditing()}
                          disabled={savingStep}
                          className="font-ui rounded-lg border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => void saveStep()}
                          disabled={savingStep || !hasUnsavedChanges}
                          className="font-ui rounded-lg bg-brand text-white px-3 py-1.5 text-[11px] font-medium hover:bg-brand-hover disabled:opacity-50"
                        >
                          {savingStep ? "Saving..." : hasUnsavedChanges ? "Save step" : "Saved"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add follow-up step button */}
          <div className="flex items-center shrink-0">
            <CanvasConnector />
            <button
              onClick={() => void appendStep()}
              disabled={savingStep}
              className="font-ui inline-flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-brand/30 bg-brand/5 hover:bg-brand/10 px-6 py-6 w-[160px] h-[180px] text-sm font-medium text-brand disabled:opacity-50 transition-colors"
            >
              <div className="size-9 rounded-full bg-brand/15 flex items-center justify-center">
                <Plus className="size-4" />
              </div>
              <span className="text-center text-[11px] leading-tight">{savingStep ? "Updating..." : "Add follow-up step"}</span>
            </button>
          </div>

          {/* Workflow exit — only the "no-reply" path that finished the full sequence */}
          <div className="flex items-center shrink-0">
            <CanvasConnector />
            <div className="rounded-2xl border border-stone/30 bg-muted/20 px-4 py-3 w-[200px]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-stone shrink-0" />
                <div className="min-w-0">
                  <p className="font-ui text-[11px] font-bold text-foreground leading-tight">Workflow finished</p>
                  <p className="font-ui text-[10px] text-stone leading-tight">{finished > 0 ? `${finished} contacts finished without reply` : "No contacts reached the end yet"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer hint */}
        <p className="font-ui mt-6 text-[11px] text-stone text-center">
          New steps are appended at the end. Trailing steps can be deleted only before any lead reaches them.
        </p>
        </div>
      </div>

      {/* Workflow stats below canvas */}
      <div className="flex items-center gap-3 px-2">
        <div className="flex items-center gap-2 text-[11px] text-stone">
          <CheckCircle2 className="size-3.5 text-success" />
          <span className="font-ui">Workflow processed <strong className="text-foreground">{stats.totalLeads}</strong> contacts</span>
        </div>
      </div>
    </div>
  );
}

// ── Canvas connector — horizontal arrow with optional label above ────
function CanvasConnector({
  label,
  subLabel,
  editableDelayDays,
  editableTrigger,
  onConnectorChange,
}: {
  label?: string;
  subLabel?: string;
  editableDelayDays?: number;
  editableTrigger?: SequenceStep["trigger"];
  onConnectorChange?: (update: {
    delayDays: number;
    trigger: SequenceStep["trigger"];
  }) => void;
}) {
  const isEditable =
    typeof editableDelayDays === "number" &&
    editableTrigger !== undefined &&
    !!onConnectorChange;
  const [editing, setEditing] = useState(false);
  const [draftDelay, setDraftDelay] = useState<string>(String(editableDelayDays ?? 0));
  const [draftTrigger, setDraftTrigger] = useState<SequenceStep["trigger"]>(
    editableTrigger ?? "immediate"
  );
  const editorRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!editing) {
      setDraftDelay(String(editableDelayDays ?? 0));
      setDraftTrigger(editableTrigger ?? "immediate");
    }
  }, [editableDelayDays, editableTrigger, editing]);

  const commit = () => {
    const nextDelay = Math.max(0, Math.floor(Number(draftDelay) || 0));
    const nextTrigger = draftTrigger;
    setEditing(false);
    if (
      onConnectorChange &&
      (nextDelay !== editableDelayDays || nextTrigger !== editableTrigger)
    ) {
      onConnectorChange({ delayDays: nextDelay, trigger: nextTrigger });
    }
  };

  const cancel = () => {
    setDraftDelay(String(editableDelayDays ?? 0));
    setDraftTrigger(editableTrigger ?? "immediate");
    setEditing(false);
  };

  const displayLabel = isEditable
    ? `+${editableDelayDays} day${editableDelayDays !== 1 ? "s" : ""}`
    : label;

  return (
    <div className="flex flex-col items-center justify-center mx-6 shrink-0 relative">
      {(displayLabel || isEditable) && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full">
          {isEditable && editing ? (
            <span
              ref={editorRef}
              className="font-ui inline-flex items-center gap-1 rounded-full border border-brand/40 bg-card px-2.5 py-1 text-[10px] font-medium text-foreground whitespace-nowrap shadow-sm"
              onBlur={(event) => {
                const nextFocus = event.relatedTarget;
                if (nextFocus instanceof Node && editorRef.current?.contains(nextFocus)) return;
                commit();
              }}
            >
              <Clock className="size-3" />
              <span>+</span>
              <input
                autoFocus
                type="number"
                min={0}
                value={draftDelay}
                onChange={(e) => setDraftDelay(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") cancel();
                }}
                className="w-10 bg-transparent outline-none text-center"
              />
              <span>days</span>
              {editableTrigger ? (
                <>
                  <span className="text-stone/60">·</span>
                  <select
                    value={draftTrigger}
                    onChange={(e) => setDraftTrigger(e.target.value as SequenceStep["trigger"])}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commit();
                      if (e.key === "Escape") cancel();
                    }}
                    className="bg-transparent outline-none text-stone hover:text-foreground cursor-pointer"
                  >
                    <option value="immediate">immediate</option>
                    <option value="accepted">accepted</option>
                    <option value="no_reply">no reply</option>
                  </select>
                </>
              ) : subLabel ? (
                <span className="text-stone/60">· {subLabel}</span>
              ) : null}
              <button
                type="button"
                onClick={commit}
                className="rounded-full p-0.5 text-success hover:bg-success/10"
                title="Save timing"
              >
                <CheckCircle2 className="size-3" />
              </button>
              <button
                type="button"
                onClick={cancel}
                className="rounded-full p-0.5 text-stone hover:bg-muted/40 hover:text-foreground"
                title="Cancel timing changes"
              >
                <XCircle className="size-3" />
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => isEditable && setEditing(true)}
              className={`font-ui inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-medium text-stone whitespace-nowrap shadow-sm ${isEditable ? "hover:border-brand/40 hover:text-foreground cursor-text" : "cursor-default"}`}
              title={isEditable ? "Click to edit timing" : undefined}
            >
              <Clock className="size-3" />
              {displayLabel}
              {subLabel && <span className="text-stone/60">· {subLabel}</span>}
            </button>
          )}
        </div>
      )}
      <svg width="80" height="14" viewBox="0 0 80 14" fill="none" className="text-brand">
        <path
          d="M2 7 H68"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M64 2 L72 7 L64 12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  );
}

// ── Contacts Tab ─────────────────────────────────────────────────────────

function ContactsTab({
  contacts,
  sequence,
  campaignName,
  onRejectContact,
  rejectingId,
  initialStepFilter,
  onStepFilterChange,
}: {
  contacts: ContactItem[];
  sequence: SequenceStep[];
  campaignName: string;
  onRejectContact: (contactId: string) => Promise<void>;
  rejectingId: string | null;
  initialStepFilter?: string;
  onStepFilterChange?: (step: string) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [stepFilter, setStepFilter] = useState<string>(initialStepFilter || "all");
  useEffect(() => {
    if (initialStepFilter !== undefined) setStepFilter(initialStepFilter);
  }, [initialStepFilter]);

  const filtered = contacts.filter((c) => {
    const matchesSearch =
      !searchTerm ||
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.headline.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStep =
      stepFilter === "all" || c.currentStep === parseInt(stepFilter);
    return matchesSearch && matchesStep;
  });

  function exportCsv() {
    const rows = [
      ["Name", "Headline", "Company", "Signal", "Score", "Status", "Step", "Segment", "Language", "Updated At"],
      ...filtered.map((contact) => [
        contact.name,
        contact.headline,
        contact.company,
        contact.signal,
        String(contact.aiScore),
        statusLabel(contact.status),
        String(contact.currentStep),
        contact.segment,
        contact.language,
        contact.updatedAt,
      ]),
    ];

    const csv = rows
      .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${campaignName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-contacts.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-stone" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-9 pl-9 pr-3 text-sm bg-muted/30 border border-border rounded-lg text-foreground placeholder:text-stone focus:outline-none focus:border-border"
          />
        </div>
        <div className="relative">
          <select
            value={stepFilter}
            onChange={(e) => {
              setStepFilter(e.target.value);
              onStepFilterChange?.(e.target.value);
            }}
            className="h-9 px-3 pr-8 text-sm bg-muted/30 border border-border rounded-lg text-muted-foreground appearance-none focus:outline-none focus:border-border"
          >
            <option value="all">All steps</option>
            {sequence.map((s) => (
              <option key={s.step} value={s.step}>
                Step {s.step} - {stepTypeLabel(s.type)}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-stone pointer-events-none" />
        </div>
        <button
          onClick={exportCsv}
          className="h-9 px-3 text-sm rounded-lg border border-border text-muted-foreground hover:bg-muted/20 transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="clean-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-[10px] font-medium uppercase tracking-[0.2em] text-stone px-4 py-3">
                Contact
              </th>
              <th className="text-left text-[10px] font-medium uppercase tracking-[0.2em] text-stone px-4 py-3">
                Signal
              </th>
              <th className="text-center text-[10px] font-medium uppercase tracking-[0.2em] text-stone px-4 py-3">
                Score
              </th>
              <th className="text-left text-[10px] font-medium uppercase tracking-[0.2em] text-stone px-4 py-3">
                Campaign Status
              </th>
              <th className="text-left text-[10px] font-medium uppercase tracking-[0.2em] text-stone px-4 py-3">
                Date
              </th>
              <th className="text-center text-[10px] font-medium uppercase tracking-[0.2em] text-stone px-4 py-3">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((contact) => (
              <tr
                key={contact.id}
                className="border-b border-border/60 hover:bg-muted/20 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {contact.profilePictureUrl ? (
                      <img
                        src={contact.profilePictureUrl}
                        alt=""
                        className="size-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="size-8 rounded-full bg-muted/60 flex items-center justify-center text-xs text-stone">
                        {contact.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {contact.name}
                      </p>
                      <p className="text-[11px] text-stone truncate max-w-[240px]">
                        {contact.headline}
                        {contact.company && ` at ${contact.company}`}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-muted-foreground">
                    {contact.signal || "--"}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <ScoreFlames score={contact.aiScore} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-stone">
                      Step {contact.currentStep}
                    </span>
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusColor(
                        contact.status
                      )}`}
                    >
                      {statusLabel(contact.status)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-stone">
                    {new Date(contact.updatedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => onRejectContact(contact.id)}
                    disabled={rejectingId === contact.id}
                    className="text-stone hover:text-destructive transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <XCircle className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="text-center text-stone py-12 text-sm"
                >
                  No contacts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Insights Tab ─────────────────────────────────────────────────────────

function InsightsTab({
  stats,
  dailyActivity,
}: {
  stats: CampaignStats;
  dailyActivity: DailyActivity[];
}) {
  // Simple area chart using SVG
  const maxVal = Math.max(
    1,
    ...dailyActivity.map((d) => Math.max(d.invited, d.accepted, d.replied))
  );
  const chartWidth = 600;
  const chartHeight = 200;
  const padding = { top: 20, right: 20, bottom: 40, left: 40 };
  const innerW = chartWidth - padding.left - padding.right;
  const innerH = chartHeight - padding.top - padding.bottom;

  function makePoints(data: DailyActivity[], key: keyof DailyActivity): string {
    if (data.length === 0) return "";
    return data
      .map((d, i) => {
        const x = padding.left + (i / Math.max(1, data.length - 1)) * innerW;
        const y =
          padding.top + innerH - ((d[key] as number) / maxVal) * innerH;
        return `${x},${y}`;
      })
      .join(" ");
  }

  function makeAreaPath(
    data: DailyActivity[],
    key: keyof DailyActivity
  ): string {
    if (data.length === 0) return "";
    const points = data.map((d, i) => {
      const x = padding.left + (i / Math.max(1, data.length - 1)) * innerW;
      const y = padding.top + innerH - ((d[key] as number) / maxVal) * innerH;
      return { x, y };
    });
    const baseline = padding.top + innerH;
    let path = `M ${points[0].x} ${baseline}`;
    points.forEach((p) => (path += ` L ${p.x} ${p.y}`));
    path += ` L ${points[points.length - 1].x} ${baseline} Z`;
    return path;
  }

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="clean-card p-5">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone mb-4">
            Number of Invitations
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-light text-foreground">{stats.sent}</p>
              <p className="text-[11px] text-stone mt-1">Sent</p>
            </div>
            <div>
              <p className="text-2xl font-light text-coral">
                {stats.accepted}
              </p>
              <p className="text-[11px] text-stone mt-1">Accepted</p>
            </div>
            <div>
              <p className="text-2xl font-light text-success">
                {stats.connectRate > 0 ? `${stats.connectRate}%` : "--"}
              </p>
              <p className="text-[11px] text-stone mt-1">Accept Rate</p>
            </div>
          </div>
        </div>

        <div className="clean-card p-5">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone mb-4">
            Number of Messages
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-light text-foreground">
                {stats.sent}
              </p>
              <p className="text-[11px] text-stone mt-1">Contacted</p>
            </div>
            <div>
              <p className="text-2xl font-light text-coral">
                {stats.replied}
              </p>
              <p className="text-[11px] text-stone mt-1">Replies</p>
            </div>
            <div>
              <p className="text-2xl font-light text-success">
                {stats.replyRate > 0 ? `${stats.replyRate}%` : "--"}
              </p>
              <p className="text-[11px] text-stone mt-1">Reply Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Activity chart */}
      <div className="clean-card p-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone mb-4">
          Daily Campaign Activity
        </p>

        {dailyActivity.length > 0 ? (
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <line
                key={ratio}
                x1={padding.left}
                y1={padding.top + innerH * (1 - ratio)}
                x2={padding.left + innerW}
                y2={padding.top + innerH * (1 - ratio)}
                stroke="var(--border)"
                strokeWidth={1}
              />
            ))}

            {/* Invited area */}
            <path
              d={makeAreaPath(dailyActivity, "invited")}
              fill="rgba(148,163,184,0.08)"
            />
            <polyline
              points={makePoints(dailyActivity, "invited")}
              fill="none"
              stroke="var(--coral)"
              strokeWidth={1.5}
            />

            {/* Accepted area */}
            <path
              d={makeAreaPath(dailyActivity, "accepted")}
              fill="rgba(59,130,246,0.08)"
            />
            <polyline
              points={makePoints(dailyActivity, "accepted")}
              fill="none"
              stroke="var(--coral)"
              strokeWidth={1.5}
            />

            {/* Replied area */}
            <path
              d={makeAreaPath(dailyActivity, "replied")}
              fill="rgba(34,197,94,0.08)"
            />
            <polyline
              points={makePoints(dailyActivity, "replied")}
              fill="none"
              stroke="var(--success-warm)"
              strokeWidth={1.5}
            />

            {/* X-axis labels */}
            {dailyActivity.map((d, i) => {
              if (
                dailyActivity.length > 14 &&
                i % Math.ceil(dailyActivity.length / 7) !== 0
              )
                return null;
              const x =
                padding.left +
                (i / Math.max(1, dailyActivity.length - 1)) * innerW;
              return (
                <text
                  key={d.date}
                  x={x}
                  y={chartHeight - 8}
                  textAnchor="middle"
                  className="text-[10px] fill-stone"
                >
                  {d.date.slice(5)}
                </text>
              );
            })}
          </svg>
        ) : (
          <div className="flex items-center justify-center h-32 text-sm text-stone">
            No activity data yet.
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-6 mt-3">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-brand" />
            <span className="text-[11px] text-stone">Invited</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-coral" />
            <span className="text-[11px] text-stone">Accepted</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-success" />
            <span className="text-[11px] text-stone">Replied</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Settings Tab ─────────────────────────────────────────────────────────

function SettingsTab({
  campaign,
  onSave,
}: {
  campaign: Campaign;
  onSave: (settings: CampaignSettingsPayload) => Promise<void>;
}) {
  const [excludeFirst, setExcludeFirst] = useState(true);
  const [reviewMode, setReviewMode] = useState(false);
  const [goal, setGoal] = useState<"conversations" | "demos">("conversations");
  const [tone, setTone] = useState<"professional" | "conversational" | "direct">(
    "conversational"
  );
  const [inviteSource, setInviteSource] = useState<"campaign_step" | "template_library">("campaign_step");
  const [autopilotDraftMode, setAutopilotDraftMode] = useState<"ignore_saved_drafts" | "use_saved_drafts">("ignore_saved_drafts");
  const [targetLocations, setTargetLocations] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    setExcludeFirst(campaign.settings?.excludeFirstDegree ?? true);
    setReviewMode(campaign.settings?.reviewMode ?? false);
    setGoal(campaign.settings?.goal ?? "conversations");
    setTone(campaign.settings?.tone ?? "conversational");
    setInviteSource(campaign.settings?.inviteSource ?? "campaign_step");
    setAutopilotDraftMode(campaign.settings?.autopilotDraftMode ?? "ignore_saved_drafts");
    setTargetLocations((campaign.search.locations || []).join(", "));
    setSaveState("idle");
  }, [campaign]);

  async function handleSave() {
    setSaving(true);
    setSaveState("idle");
    try {
      await onSave({
        goal,
        tone,
        excludeFirstDegree: excludeFirst,
        reviewMode,
        inviteSource,
        autopilotDraftMode,
        targetLocations: targetLocations
          .split(",")
          .map((location) => location.trim())
          .filter(Boolean),
      });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Connection Settings */}
      <div className="clean-card p-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone mb-4">
          Connection Settings
        </p>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={excludeFirst}
              onChange={(e) => setExcludeFirst(e.target.checked)}
              className="size-4 rounded border-border bg-muted/30 accent-coral"
            />
            <span className="text-sm text-muted-foreground">
              Exclude 1st degree connections
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={reviewMode}
              onChange={(e) => setReviewMode(e.target.checked)}
              className="size-4 rounded border-border bg-muted/30 accent-coral"
            />
            <span className="text-sm text-muted-foreground">
              Enable Review Mode (approve each invitation before sending)
            </span>
          </label>
        </div>
      </div>

      {/* AI Generation */}
      <div className="clean-card p-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone mb-4">
          AI Generation
        </p>
        <p className="mb-5 text-xs leading-5 text-stone">
          Review Mode prepares a first-invite draft using the source selected below. When you switch to Autopilot,
          you can decide whether queued personalized drafts should still be sent or whether the campaign should go back
          to its current Step 1 or Template Library.
        </p>

        <div className="space-y-5">
          {/* Campaign Goal */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-3">
              Campaign Goal
            </p>
            <div className="flex gap-3">
              {[
                { value: "conversations", label: "Warm Conversations" },
                { value: "demos", label: "Book Demos" },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                    goal === opt.value
                      ? "border-violet-500/40 bg-coral/5 text-coral"
                      : "border-border bg-muted/20 text-muted-foreground hover:border-border"
                  }`}
                >
                  <input
                    type="radio"
                    name="goal"
                    value={opt.value}
                    checked={goal === opt.value}
                    onChange={() => setGoal(opt.value as "conversations" | "demos")}
                    className="sr-only"
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Message Tone */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-3">
              Message Tone
            </p>
            <div className="flex gap-3">
              {[
                { value: "professional", label: "Professional" },
                { value: "conversational", label: "Conversational" },
                { value: "direct", label: "Direct" },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                    tone === opt.value
                      ? "border-violet-500/40 bg-coral/5 text-coral"
                      : "border-border bg-muted/20 text-muted-foreground hover:border-border"
                  }`}
                >
                  <input
                    type="radio"
                    name="tone"
                    value={opt.value}
                    checked={tone === opt.value}
                    onChange={() =>
                      setTone(
                        opt.value as
                          | "professional"
                          | "conversational"
                          | "direct"
                      )
                    }
                    className="sr-only"
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-3">
              First invite source
            </p>
            <div className="space-y-3">
              {[
                {
                  value: "campaign_step",
                  label: "Campaign Step 1",
                  description: "Autopilot always uses the current Step 1 copy from this campaign.",
                },
                {
                  value: "template_library",
                  label: "Template Library",
                  description: "Autopilot picks from your connection-request templates for this campaign language.",
                },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`block rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                    inviteSource === opt.value
                      ? "border-violet-500/40 bg-coral/5"
                      : "border-border bg-muted/20 hover:border-border"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="inviteSource"
                      value={opt.value}
                      checked={inviteSource === opt.value}
                      onChange={() => setInviteSource(opt.value as "campaign_step" | "template_library")}
                      className="mt-0.5 accent-coral"
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{opt.label}</p>
                      <p className="text-xs text-stone">{opt.description}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-3">
              When Autopilot sees queued review drafts
            </p>
            <div className="space-y-3">
              {[
                {
                  value: "ignore_saved_drafts",
                  label: "Use current source of truth",
                  description: "Ignore old queued drafts and send using Step 1 or Template Library, depending on the setting above.",
                },
                {
                  value: "use_saved_drafts",
                  label: "Reuse saved personalized drafts",
                  description: "If a lead already has a queued personalized intro from review mode, Autopilot can send that exact draft.",
                },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`block rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                    autopilotDraftMode === opt.value
                      ? "border-violet-500/40 bg-coral/5"
                      : "border-border bg-muted/20 hover:border-border"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="autopilotDraftMode"
                      value={opt.value}
                      checked={autopilotDraftMode === opt.value}
                      onChange={() => setAutopilotDraftMode(opt.value as "ignore_saved_drafts" | "use_saved_drafts")}
                      className="mt-0.5 accent-coral"
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{opt.label}</p>
                      <p className="text-xs text-stone">{opt.description}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="clean-card p-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone mb-4">
          Market Guardrail
        </p>

        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Allowed LinkedIn locations
            </p>
            <input
              type="text"
              value={targetLocations}
              onChange={(event) => setTargetLocations(event.target.value)}
              placeholder="Italy, Milan, Rome or !Italy"
              className="w-full h-10 rounded-lg border border-border bg-muted/20 px-3 text-sm text-foreground placeholder:text-stone focus:outline-none focus:border-border"
            />
          </div>
          <p className="text-xs text-stone">
            Only leads whose LinkedIn location matches one of these markets can enter or continue this campaign. Prefix a market with `!` to exclude it, for example `!Italy`.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {saveState === "saved" && (
          <span className="text-xs text-success">Saved</span>
        )}
        {saveState === "error" && (
          <span className="text-xs text-destructive">Save failed</span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-coral/15 border border-violet-500/20 text-violet-300 text-sm font-medium hover:bg-coral/20 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
      </div>
    </div>
  );
}

// ── Placeholder Tabs ─────────────────────────────────────────────────────

function PlaceholderTab({
  message,
  hint,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  message: string;
  hint?: string;
}) {
  return (
    <div className="clean-card p-16 flex flex-col items-center justify-center gap-4">
      <Claudio size={56} mood="thinking" />
      <p className="text-base text-foreground">{message}</p>
      {hint && <p className="font-ui text-xs text-stone">{hint}</p>}
    </div>
  );
}

// ── Tab Navigation ───────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "workflow", label: "Workflow", icon: Zap },
  { id: "contacts", label: "Contacts", icon: User },
  { id: "insights", label: "Insights", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "scheduled", label: "Scheduled", icon: CalendarClock },
  { id: "launches", label: "Last Launches", icon: History },
];

function parseTabId(value: string | null): TabId | null {
  return TABS.some((tab) => tab.id === value) ? (value as TabId) : null;
}

// ── Main Page ────────────────────────────────────────────────────────────

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<CampaignDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("workflow");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [assigningSeat, setAssigningSeat] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [contactsStepFilter, setContactsStepFilter] = useState<string>("all");

  useEffect(() => {
    const requestedTab = parseTabId(searchParams.get("tab")) || "workflow";
    const requestedStep = searchParams.get("step");
    setActiveTab(requestedTab);
    setContactsStepFilter(
      requestedTab === "contacts" && requestedStep && /^\d+$/.test(requestedStep)
        ? requestedStep
        : "all"
    );
  }, [searchParams]);

  function replaceTabState(nextTab: TabId, nextStepFilter = contactsStepFilter) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    if (nextTab === "contacts" && nextStepFilter !== "all") {
      params.set("step", nextStepFilter);
    } else {
      params.delete("step");
    }
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }

  function handleTabChange(nextTab: TabId) {
    setActiveTab(nextTab);
    replaceTabState(nextTab);
  }

  function handleContactsStepChange(nextStepFilter: string) {
    setContactsStepFilter(nextStepFilter);
    setActiveTab("contacts");
    replaceTabState("contacts", nextStepFilter);
  }

  useEffect(() => {
    fetch(`/api/campaigns/${resolvedParams.id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Campaign not found");
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [resolvedParams.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-stone" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Back to campaigns
        </Link>
        <div className="clean-card p-12 flex flex-col items-center gap-3">
          <XCircle className="size-8 text-destructive/50" />
          <p className="text-sm text-stone">{error || "Campaign not found"}</p>
        </div>
      </div>
    );
  }

  const { campaign, agent, stats, stepStats, contacts, dailyActivity } = data;

  async function handleSaveSettings(settings: CampaignSettingsPayload) {
    setActionError(null);
    const res = await fetch(`/api/campaigns/${resolvedParams.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: {
          goal: settings.goal,
          tone: settings.tone,
          excludeFirstDegree: settings.excludeFirstDegree,
          reviewMode: settings.reviewMode,
          inviteSource: settings.inviteSource,
          autopilotDraftMode: settings.autopilotDraftMode,
        },
        search: {
          locations: settings.targetLocations,
        },
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || "Failed to save settings");
    }

    setData((prev) => prev ? { ...prev, campaign: body.campaign } : prev);
  }

  async function handleRejectContact(contactId: string) {
    setRejectingId(contactId);
    setActionError(null);
    try {
      const res = await fetch(`/api/campaigns/${resolvedParams.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rejectLead",
          leadId: contactId,
          reason: "rejected_from_campaign",
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Failed to reject contact");
      }

      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          contacts: prev.contacts.map((contact) =>
            contact.id === contactId
              ? {
                  ...contact,
                  status: body.lead?.status || "skipped",
                  updatedAt: body.lead?.updatedAt || new Date().toISOString(),
                }
              : contact
          ),
        };
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to reject contact");
    } finally {
      setRejectingId(null);
    }
  }

  async function handleToggleCampaignStatus() {
    setTogglingStatus(true);
    setActionError(null);

    try {
      const nextStatus = campaign.status === "active" ? "paused" : "active";
      const res = await fetch(`/api/campaigns/${resolvedParams.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Failed to update campaign status");
      }

      setData((prev) => prev ? { ...prev, campaign: body.campaign } : prev);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to update campaign status");
    } finally {
      setTogglingStatus(false);
    }
  }

  async function handleAssignSeat(seatId: string) {
    if (!seatId || seatId === campaign.linkedinSeatId) return;
    setAssigningSeat(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/campaigns/${resolvedParams.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedinSeatId: seatId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Failed to assign LinkedIn sender");
      }

      setData((prev) => {
        if (!prev) return prev;
        const nextCampaign = body.campaign || prev.campaign;
        const nextSeat = prev.seats.find((item) => item.id === nextCampaign.linkedinSeatId) || prev.seat;
        return {
          ...prev,
          campaign: nextCampaign,
          seat: nextSeat,
        };
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to assign LinkedIn sender");
    } finally {
      setAssigningSeat(false);
    }
  }

  async function handleSaveSequence(sequence: SequenceStep[]) {
    setActionError(null);
    const res = await fetch(`/api/campaigns/${resolvedParams.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequence }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || "Failed to save campaign sequence");
    }

    setData((prev) => prev ? { ...prev, campaign: body.campaign } : prev);
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3.5" /> Back to campaigns
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-medium tracking-[-0.04em] text-foreground">
            {campaign.name}
          </h2>
          <p className="text-sm text-stone mt-1">
            {campaign.sequence.length}-step sequence for {campaign.segment} |{" "}
            {campaign.search.language.toUpperCase()} | {describeCampaignMarket(campaign)} |{" "}
            {stats.totalLeads} contacts
          </p>
        </div>
      </div>

      {/* Tab navigation */}
      {actionError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <div className="border-b border-border">
        <nav className="flex gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const count =
              tab.id === "contacts" ? contacts.length : undefined;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-foreground"
                    : "text-stone hover:text-muted-foreground"
                }`}
              >
                <Icon className="size-3.5" />
                {tab.label}
                {count !== undefined && (
                  <span className="text-[10px] text-stone ml-1">
                    ({count})
                  </span>
                )}
                {isActive && (
                  <span className="absolute bottom-0 inset-x-0 h-0.5 bg-white rounded-full" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === "workflow" && (
        <WorkflowTab
          campaign={campaign}
          agent={agent}
          seat={data.seat}
          seats={data.seats}
          stats={stats}
          stepStats={stepStats}
          assigningSeat={assigningSeat}
          onAssignSeat={handleAssignSeat}
          onSaveSequence={handleSaveSequence}
          onToggleStatus={handleToggleCampaignStatus}
          togglingStatus={togglingStatus}
          onViewStepContacts={(stepNumber) => {
            handleContactsStepChange(String(stepNumber));
          }}
        />
      )}
      {activeTab === "contacts" && (
        <ContactsTab
          contacts={contacts}
          sequence={campaign.sequence}
          campaignName={campaign.name}
          onRejectContact={handleRejectContact}
          rejectingId={rejectingId}
          initialStepFilter={contactsStepFilter}
          onStepFilterChange={handleContactsStepChange}
        />
      )}
      {activeTab === "insights" && (
        <InsightsTab stats={stats} dailyActivity={dailyActivity} />
      )}
      {activeTab === "settings" && (
        <SettingsTab campaign={campaign} onSave={handleSaveSettings} />
      )}
      {activeTab === "scheduled" && (
        <PlaceholderTab
          message="No scheduled actions"
          hint="Claudio is waiting for the next sequence run"
        />
      )}
      {activeTab === "launches" && (
        <PlaceholderTab
          message="No recent launches"
          hint="Once a sequence runs, you'll see its history here"
        />
      )}
    </div>
  );
}
