"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import {
  Flame,
  Linkedin,
  Loader2,
  Check,
  X,
  Sparkles,
  Eye,
  Send,
  MessageSquare,
  Building2,
  MapPin,
  Users2,
  Briefcase,
  Clock,
  Zap,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  CalendarClock,
  Pencil,
  Target,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types (mirror /api/copilot response) ──────────────────────────────

type ActionState = "ready" | "scheduled" | "blocked" | "review" | "completed";
type StepState = "completed" | "ready" | "scheduled" | "blocked" | "review";
type SourceOfCopy = "campaign_step" | "saved_draft" | "template_library";

type SignalFamily =
  | "topic_query_match"
  | "engaged_with_profile"
  | "engaged_with_company"
  | "engaged_with_post"
  | "posted_about_topic"
  | "visited_profile"
  | "follows_entity"
  | "job_change"
  | "recent_funding"
  | "high_activity_icp"
  | "generic_signal";

type SignalSourceType =
  | "search_query"
  | "personal_profile"
  | "watch_profile"
  | "author_profile"
  | "company_page"
  | "competitor_page"
  | "linkedin_post"
  | "profile"
  | "event"
  | "activity_score"
  | "generic";

interface SignalDetails {
  // Normalized (preferred)
  title: string;
  family: SignalFamily;
  familyLabel: string;
  sourceType: SignalSourceType;
  sourceTypeLabel: string;
  sourceName: string | null;
  reason: string;
  // Legacy compatibility
  source: string;
  sourceLabel: string;
  kind: string;
  kindLabel: string;
  topicKey: string | null;
  topicLabel: string | null;
  context: string;
  sourceUrl: string | null;
  sourceUrlType: "signal" | "profile" | null;
  sourcePostId: string | null;
  sourcePostUrl: string | null;
  sourceEntityUrl: string | null;
  sourceAuthorUrl: string | null;
  sourceQuery: string | null;
  quality: "high" | "medium" | "low";
}

function signalLinkLabel(signal: SignalDetails): string {
  if (signal.sourcePostUrl) return "View post";
  if (signal.sourceType === "company_page" || signal.sourceType === "competitor_page") return "View company page";
  if (signal.sourceType === "watch_profile" || signal.sourceType === "author_profile" || signal.sourceType === "personal_profile") return "View source profile";
  return "View signal source";
}

interface ScoreBreakdown {
  aiScore: number;
  totalScore: number;
  icpFit: number;
  intentScore: number;
  heat: number;
  reasoning: string;
}

interface CompanySnapshot {
  companyName: string;
  companySize: string;
  industry: string;
  companyDescription: string;
  companyLinkedInUrl: string;
}

interface ScheduledAction {
  id: string;
  leadId: string;
  campaignId: string;
  step: number;
  actionType: "connection_request" | "message" | "profile_visit";
  actionLabel: string;
  state: ActionState;
  scheduledFor: string | null;
  blockerReason: string | null;
  trigger: "immediate" | "accepted" | "no_reply";
  delayDays: number;
  anchorTs: string | null;
  sourceOfCopy: SourceOfCopy;
  contentPreview: string;
  score: number;
}

interface SequenceStep {
  step: number;
  type: "connection_request" | "message" | "profile_visit";
  label: string;
  delayDays: number;
  trigger: "immediate" | "accepted" | "no_reply";
  content: string;
  preview: string;
  status: "completed" | "scheduled" | "pending";
  state: StepState;
  executedAt?: string;
  scheduledFor: string | null;
  anchorTs: string | null;
  blockerReason: string | null;
  sourceOfCopy: SourceOfCopy;
}

interface SequenceState {
  currentStep: number;
  leadStatus: string;
  nextStep: SequenceStep | null;
  steps: SequenceStep[];
  manualOverride: boolean;
}

interface ActionLead {
  id: string;
  name: string;
  headline: string;
  location?: string;
  publicIdentifier: string;
  profilePictureUrl?: string;
  status: string;
  approved: boolean;
}

interface ActionQueueItem {
  id: string;
  lead: ActionLead;
  company: CompanySnapshot;
  signal: SignalDetails;
  scoreBreakdown: ScoreBreakdown;
  campaign: {
    id: string;
    name: string;
    status: string;
    reviewMode: boolean;
  };
  seat: { id: string; name: string } | null;
  scheduledAction: ScheduledAction;
  sequenceState: SequenceState;
}

interface CopilotSummary {
  activeCampaigns: number;
  reviewCampaigns: number;
  autopilotCampaigns: number;
  reviewQueueCount: number;
  actionQueueCount: number;
  readyActions: number;
  scheduledActions: number;
  blockedActions: number;
}

interface CopilotData {
  mode: "autopilot" | "review";
  nextLaunchIn: string;
  summary: CopilotSummary;
  leads: unknown[]; // legacy fallback, unused in new layout
  actionQueue: ActionQueueItem[];
}

// ── Presentational helpers ────────────────────────────────────────────

function FireScore({ score }: { score: number }) {
  return (
    <span className="flex gap-0.5" title={`Heat ${score}/3`}>
      {Array.from({ length: 3 }).map((_, i) => (
        <Flame
          key={i}
          className={`size-3.5 ${i < score ? "text-brand fill-brand" : "text-stone"}`}
        />
      ))}
    </span>
  );
}

function LeadAvatar({ name, pictureUrl, size = "md" }: { name: string; pictureUrl?: string; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "sm" ? "size-9" : size === "lg" ? "size-16" : "size-10";
  const textClass = size === "lg" ? "text-lg" : "text-xs";
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2);

  if (pictureUrl) {
    return <img src={pictureUrl} alt={name} className={`${sizeClass} rounded-full object-cover border border-border`} />;
  }
  return (
    <div className={`${sizeClass} rounded-full bg-muted/40 border border-border flex items-center justify-center ${textClass} font-medium text-muted-foreground`}>
      {initials}
    </div>
  );
}

function ActionTypeIcon({ type, state }: { type: ScheduledAction["actionType"]; state: ActionState }) {
  const baseClass = "size-8 rounded-full flex items-center justify-center shrink-0";
  if (state === "completed") {
    return (
      <div className={cn(baseClass, "bg-success/20 border border-success/30")}>
        <Check className="size-4 text-success" />
      </div>
    );
  }
  if (type === "connection_request") {
    return (
      <div className={cn(baseClass, "bg-terracotta/15 border border-terracotta/30")}>
        <Send className="size-3.5 text-terracotta" />
      </div>
    );
  }
  if (type === "profile_visit") {
    return (
      <div className={cn(baseClass, "bg-brand/15 border border-brand/30")}>
        <Eye className="size-3.5 text-brand" />
      </div>
    );
  }
  return (
    <div className={cn(baseClass, "bg-coral/15 border border-coral/30")}>
      <MessageSquare className="size-3.5 text-coral" />
    </div>
  );
}

function ActionStateBadge({ state }: { state: ActionState }) {
  const map: Record<ActionState, { label: string; cls: string; icon: typeof Check }> = {
    ready: { label: "Ready", cls: "bg-success/15 text-success border-success/30", icon: CheckCircle2 },
    review: { label: "Review", cls: "bg-warning/15 text-warning border-warning/30", icon: Eye },
    scheduled: { label: "Scheduled", cls: "bg-brand/15 text-brand border-brand/30", icon: CalendarClock },
    blocked: { label: "Blocked", cls: "bg-destructive/15 text-destructive border-destructive/30", icon: AlertTriangle },
    completed: { label: "Done", cls: "bg-stone/15 text-stone border-stone/30", icon: Check },
  };
  const info = map[state];
  const Icon = info.icon;
  return (
    <span className={cn("font-ui inline-flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full border", info.cls)}>
      <Icon className="size-2.5" />
      {info.label}
    </span>
  );
}

function StepStateBadge({ state }: { state: StepState }) {
  const map: Record<StepState, { label: string; cls: string }> = {
    completed: { label: "Completed", cls: "bg-success/15 text-success border-success/30" },
    ready: { label: "Ready", cls: "bg-success/15 text-success border-success/30" },
    scheduled: { label: "Scheduled", cls: "bg-brand/15 text-brand border-brand/30" },
    review: { label: "Review", cls: "bg-warning/15 text-warning border-warning/30" },
    blocked: { label: "Blocked", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  };
  const info = map[state];
  return (
    <span className={cn("font-ui inline-flex items-center text-[9px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full border", info.cls)}>
      {info.label}
    </span>
  );
}

function KpiPill({ label, value, accent }: { label: string; value: number | string; accent?: "ready" | "scheduled" | "blocked" | "neutral" }) {
  const accentCls = {
    ready: "text-success",
    scheduled: "text-brand",
    blocked: "text-destructive",
    neutral: "text-foreground",
  }[accent || "neutral"];
  return (
    <div className="flex flex-col items-start px-4 py-2 rounded-lg border border-border bg-card">
      <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <span className={cn("text-lg font-bold tracking-tight tabular-nums mt-0.5", accentCls)}>{value}</span>
    </div>
  );
}

function formatStepType(type: string): string {
  switch (type) {
    case "connection_request": return "Connection Request";
    case "profile_visit": return "Visit Profile";
    case "message": return "Message";
    default: return type.replace(/_/g, " ");
  }
}

function formatRelativeTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.floor(abs / 60000);
  const sign = diff < 0 ? "ago" : "in";
  if (mins < 60) return `${sign === "in" ? "in " : ""}${mins}m${sign === "ago" ? " ago" : ""}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${sign === "in" ? "in " : ""}${hours}h${sign === "ago" ? " ago" : ""}`;
  const days = Math.floor(hours / 24);
  return `${sign === "in" ? "in " : ""}${days}d${sign === "ago" ? " ago" : ""}`;
}

function formatCopySource(src: SourceOfCopy): string {
  switch (src) {
    case "saved_draft": return "Saved draft";
    case "template_library": return "Template library";
    case "campaign_step": return "Campaign step";
  }
}

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// ── Main Page ──────────────────────────────────────────────────────────

export default function CopilotPage() {
  const [data, setData] = useState<CopilotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"autopilot" | "review">("review");
  const [editedMessages, setEditedMessages] = useState<Record<string, Record<number, string>>>({});
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [savingMessageKey, setSavingMessageKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [modeSaving, setModeSaving] = useState(false);
  const [campaignFilter, setCampaignFilter] = useState<string>("all");

  async function loadCopilotData() {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/copilot");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Failed to load copilot queue");
      }
      setData(body as CopilotData);
      setMode((body as CopilotData).mode);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load copilot queue";
      setLoadError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCopilotData();
  }, []);

  const actionQueue = data?.actionQueue || [];
  const summary = data?.summary;
  const blockedCount = summary?.blockedActions || 0;

  // Distinct campaigns surfaced in the queue (used for the filter dropdown).
  const campaignOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of actionQueue) {
      if (!seen.has(item.campaign.id)) seen.set(item.campaign.id, item.campaign.name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [actionQueue]);

  const filteredQueue = useMemo(
    () => campaignFilter === "all"
      ? actionQueue
      : actionQueue.filter((item) => item.campaign.id === campaignFilter),
    [actionQueue, campaignFilter]
  );

  // Auto-select first action when data loads
  useEffect(() => {
    if (actionQueue.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !actionQueue.find((item) => item.id === selectedId)) {
      setSelectedId(actionQueue[0].id);
    }
  }, [actionQueue, selectedId]);

  const selected = useMemo(
    () => actionQueue.find((item) => item.id === selectedId) || null,
    [actionQueue, selectedId]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="clean-card max-w-md p-6 text-center">
          <p className="text-sm font-medium text-foreground">Copilot queue unavailable</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {loadError || "Something went wrong while loading campaign actions."}
          </p>
          <button
            onClick={() => {
              void loadCopilotData();
            }}
            className="mt-4 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/30"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  function getEditedContent(leadId: string, step: number, original: string): string {
    return editedMessages[leadId]?.[step] ?? original;
  }

  function setEditedContent(leadId: string, step: number, content: string) {
    setEditedMessages((prev) => ({
      ...prev,
      [leadId]: { ...prev[leadId], [step]: content },
    }));
  }

  async function handleModeChange(nextMode: "autopilot" | "review") {
    if (nextMode === mode || modeSaving) return;
    const previousMode = mode;
    setActionError(null);
    setMode(nextMode);
    setModeSaving(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Mode update failed");
      setData((prev) => prev ? { ...prev, mode: nextMode } : prev);
    } catch (error) {
      setMode(previousMode);
      setActionError(error instanceof Error ? error.message : "Mode update failed");
    } finally {
      setModeSaving(false);
    }
  }

  async function handleApprove(item: ActionQueueItem) {
    if (!data) return;
    const previousData = data;
    setActionError(null);
    setBusyLeadId(item.lead.id);

    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        actionQueue: prev.actionQueue.map((q) =>
          q.id === item.id
            ? { ...q, lead: { ...q.lead, approved: true }, scheduledAction: { ...q.scheduledAction, state: "ready" as ActionState, blockerReason: null } }
            : q
        ),
      };
    });

    try {
      const res = await fetch("/api/copilot/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: item.lead.id, campaignId: item.campaign.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Approve failed");
    } catch (error) {
      setData(previousData);
      setActionError(error instanceof Error ? error.message : "Approve failed");
    } finally {
      setBusyLeadId(null);
    }
  }

  async function handleRemove(item: ActionQueueItem) {
    if (!data) return;
    const previousData = data;
    const previousSelectedId = selectedId;
    setActionError(null);
    setBusyLeadId(item.lead.id);

    setData((prev) => {
      if (!prev) return prev;
      const newQueue = prev.actionQueue.filter((q) => q.id !== item.id);
      return { ...prev, actionQueue: newQueue };
    });
    if (selectedId === item.id) {
      const remaining = previousData.actionQueue.filter((q) => q.id !== item.id);
      setSelectedId(remaining[0]?.id || null);
    }

    try {
      const res = await fetch("/api/copilot/remove", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: item.lead.id, campaignId: item.campaign.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Remove failed");
    } catch (error) {
      setData(previousData);
      setSelectedId(previousSelectedId);
      setActionError(error instanceof Error ? error.message : "Remove failed");
    } finally {
      setBusyLeadId(null);
    }
  }

  async function handleSaveMessage(item: ActionQueueItem, step: number, content: string) {
    const stepKey = `${item.lead.id}-${step}`;
    setActionError(null);
    setSavingMessageKey(stepKey);
    try {
      const res = await fetch("/api/copilot/message", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: item.lead.id, campaignId: item.campaign.id, step, content }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Save failed");

      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          actionQueue: prev.actionQueue.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  sequenceState: {
                    ...q.sequenceState,
                    steps: q.sequenceState.steps.map((s) =>
                      s.step === step ? { ...s, content, preview: content, sourceOfCopy: "saved_draft" } : s
                    ),
                  },
                  scheduledAction:
                    q.scheduledAction.step === step
                      ? { ...q.scheduledAction, contentPreview: content, sourceOfCopy: "saved_draft" }
                      : q.scheduledAction,
                }
              : q
          ),
        };
      });

      setEditedMessages((prev) => {
        const next = { ...prev };
        const leadEdits = { ...(next[item.lead.id] || {}) };
        delete leadEdits[step];
        if (Object.keys(leadEdits).length === 0) delete next[item.lead.id];
        else next[item.lead.id] = leadEdits;
        return next;
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSavingMessageKey(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Sparkles className="size-5 text-orange-400" />
            <div>
              <h2 className="text-xl font-medium tracking-[-0.04em] text-foreground">Copilot</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {mode === "review"
                  ? `Review and approve each action before it goes out · ${actionQueue.length} contact${actionQueue.length === 1 ? "" : "s"} awaiting approval`
                  : `Automatic launch ~ ${data?.nextLaunchIn || "unknown"} · ${actionQueue.length} contact${actionQueue.length === 1 ? "" : "s"} scheduled`}
              </p>
            </div>
            <span className="text-[9px] font-medium uppercase tracking-wider bg-brand/20 text-orange-400 px-2 py-0.5 rounded-full ml-2">Beta</span>
          </div>

          {/* Mode toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                void loadCopilotData();
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/30"
            >
              Refresh
            </button>
            <div className="flex rounded-lg overflow-hidden border border-border">
              <button
                onClick={() => handleModeChange("autopilot")}
                disabled={modeSaving}
                className={cn(
                  "px-4 py-2 text-xs font-medium transition-all disabled:opacity-60",
                  mode === "autopilot" ? "bg-brand/20 text-orange-400" : "text-stone hover:text-muted-foreground hover:bg-muted/20"
                )}
              >
                {modeSaving && mode === "autopilot" ? "Saving..." : "Autopilot"}
              </button>
              <button
                onClick={() => handleModeChange("review")}
                disabled={modeSaving}
                className={cn(
                  "px-4 py-2 text-xs font-medium transition-all disabled:opacity-60",
                  mode === "review" ? "bg-muted/60 text-foreground" : "text-stone hover:text-muted-foreground hover:bg-muted/20"
                )}
              >
                {modeSaving && mode === "review" ? "Saving..." : "Review"}
              </button>
            </div>
          </div>
        </div>
        {loadError && (
          <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {loadError}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0">
        {/* Left rail — Action queue */}
        <div className="w-[420px] border-r border-border flex flex-col shrink-0">
          {/* Header + campaign filter */}
          <div className="px-4 py-3 border-b border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="font-ui text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground">Upcoming Queue</h3>
              <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                {filteredQueue.length}{campaignFilter !== "all" ? `/${actionQueue.length}` : ""} contact{filteredQueue.length === 1 ? "" : "s"}
              </span>
            </div>
            {campaignOptions.length > 1 && (
              <div className="relative">
                <Target className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
                <select
                  value={campaignFilter}
                  onChange={(e) => setCampaignFilter(e.target.value)}
                  className="w-full h-8 pl-7 pr-7 text-[11px] font-medium bg-card border border-border rounded-lg text-foreground appearance-none focus:outline-none focus:border-brand/40 cursor-pointer"
                >
                  <option value="all">All campaigns</option>
                  {campaignOptions.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Action list */}
          <div className="flex-1 overflow-y-auto">
            {filteredQueue.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 p-6">
                <Sparkles className="size-8 opacity-20" />
                <p className="text-[11px] text-center max-w-[260px]">No upcoming contacts. Your campaigns are caught up or your seat is paused.</p>
              </div>
            ) : (
              <div className="py-1">
                {filteredQueue.map((item) => {
                  const isSelected = selectedId === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={cn(
                        "w-full px-4 py-3 flex items-start gap-3 text-left transition-all border-l-2",
                        isSelected ? "bg-muted/40 border-l-orange-500" : "border-l-transparent hover:bg-muted/20"
                      )}
                    >
                      <LeadAvatar name={item.lead.name} pictureUrl={item.lead.profilePictureUrl} size="sm" />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">{item.lead.name}</p>
                          <FireScore score={item.scoreBreakdown.heat} />
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{item.lead.headline}</p>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <ActionStateBadge state={item.scheduledAction.state} />
                          <span className="font-ui text-[10px] font-semibold text-foreground uppercase tracking-wider">
                            {item.scheduledAction.actionLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Target className="size-3 text-muted-foreground" />
                          <span className="text-[11px] text-muted-foreground truncate">{item.campaign.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Activity className="size-3 text-muted-foreground" />
                          <span className="text-[11px] text-muted-foreground truncate">
                            {item.signal.title || item.signal.sourceLabel}
                            {item.signal.sourceName ? ` · ${item.signal.sourceName}` : item.signal.topicLabel ? ` · ${item.signal.topicLabel}` : ""}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Right panel — Action detail */}
        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <SelectedDetail
              item={selected}
              onApprove={() => handleApprove(selected)}
              onRemove={() => handleRemove(selected)}
              onSaveMessage={handleSaveMessage}
              busy={busyLeadId === selected.lead.id}
              savingMessageKey={savingMessageKey}
              getEditedContent={getEditedContent}
              setEditedContent={setEditedContent}
              actionError={actionError}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-stone gap-3">
              <Sparkles className="size-10 opacity-20" />
              <p className="text-[10px] uppercase tracking-[0.2em]">Select an action to review</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Selected detail panel ─────────────────────────────────────────────

function SelectedDetail({
  item,
  onApprove,
  onRemove,
  onSaveMessage,
  busy,
  savingMessageKey,
  getEditedContent,
  setEditedContent,
  actionError,
}: {
  item: ActionQueueItem;
  onApprove: () => void;
  onRemove: () => void;
  onSaveMessage: (item: ActionQueueItem, step: number, content: string) => Promise<void>;
  busy: boolean;
  savingMessageKey: string | null;
  getEditedContent: (leadId: string, step: number, original: string) => string;
  setEditedContent: (leadId: string, step: number, content: string) => void;
  actionError: string | null;
}) {
  const { lead, company, signal, scoreBreakdown, campaign, seat, scheduledAction, sequenceState } = item;
  const isReviewable = scheduledAction.state === "review";

  return (
    <div className="p-6 space-y-6">
      {/* Lead identity */}
      <div className="clean-card p-6">
        <div className="flex items-start gap-5">
          <div className="relative shrink-0">
            <LeadAvatar name={lead.name} pictureUrl={lead.profilePictureUrl} size="lg" />
            <div className="absolute -bottom-1 -right-1 size-5 rounded-full bg-[#0077B5] border-2 border-background flex items-center justify-center">
              <Linkedin className="size-2.5 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-lg font-medium text-foreground">{lead.name}</h3>
              <a
                href={`https://linkedin.com/in/${lead.publicIdentifier}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#0077B5] hover:text-[#0077B5]/80"
                title="Open LinkedIn profile"
              >
                <ExternalLink className="size-3.5" />
              </a>
              <ActionStateBadge state={scheduledAction.state} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">{lead.headline}</p>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <FireScore score={scoreBreakdown.heat} />
              {lead.location && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <MapPin className="size-3" />
                  {lead.location}
                </span>
              )}
              {lead.approved && (
                <span className="text-[9px] font-medium uppercase tracking-wider bg-success/15 text-success px-2 py-0.5 rounded-full border border-success/30">
                  Approved
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scheduled action prominent card */}
      <div className="clean-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-ui text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground">Scheduled Action</h4>
          <ActionStateBadge state={scheduledAction.state} />
        </div>
        <div className="flex items-start gap-4">
          <ActionTypeIcon type={scheduledAction.actionType} state={scheduledAction.state} />
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-foreground">{scheduledAction.actionLabel}</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Step {scheduledAction.step} · trigger {scheduledAction.trigger.replace("_", " ")}
              {scheduledAction.delayDays > 0 ? ` · +${scheduledAction.delayDays}d` : ""}
            </p>
            <div className="grid grid-cols-2 gap-3 mt-4">
              {scheduledAction.scheduledFor && (
                <div>
                  <p className="font-ui text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Scheduled For</p>
                  <p className="text-xs font-medium text-foreground mt-1 inline-flex items-center gap-1.5">
                    <CalendarClock className="size-3 text-muted-foreground" />
                    {new Date(scheduledAction.scheduledFor).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    <span className="text-muted-foreground font-normal">({formatRelativeTime(scheduledAction.scheduledFor)})</span>
                  </p>
                </div>
              )}
              <div>
                <p className="font-ui text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Source of Copy</p>
                <p className="text-xs font-medium text-foreground mt-1">{formatCopySource(scheduledAction.sourceOfCopy)}</p>
              </div>
            </div>
            {scheduledAction.blockerReason && (
              <div className="mt-3 px-3 py-2.5 rounded-lg bg-warning/10 border border-warning/40 text-[12px] font-medium text-warning flex items-start gap-2">
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                <span>{scheduledAction.blockerReason}</span>
              </div>
            )}
            {scheduledAction.contentPreview && (
              <div className="mt-3 px-3 py-2.5 rounded-lg bg-muted/30 border border-border">
                <p className="font-ui text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Preview</p>
                <p className="text-[12px] text-foreground whitespace-pre-wrap leading-relaxed">{scheduledAction.contentPreview}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Company + Signal + Score grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Company */}
        <div className="clean-card p-5">
          <h4 className="font-ui text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground mb-3">Company</h4>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="size-3.5 text-muted-foreground shrink-0" />
              {company.companyLinkedInUrl ? (
                <a href={company.companyLinkedInUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-foreground hover:text-terracotta truncate">
                  {company.companyName || "Unknown"}
                </a>
              ) : (
                <span className="text-sm font-medium text-foreground truncate">{company.companyName || "Unknown"}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {company.companySize && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-border bg-muted/30 text-foreground">
                  <Users2 className="size-3" />
                  {company.companySize}
                </span>
              )}
              {company.industry && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-border bg-muted/30 text-foreground">
                  <Briefcase className="size-3" />
                  {company.industry}
                </span>
              )}
            </div>
            {company.companyDescription ? (
              <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-4">{company.companyDescription}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground italic">No company description.</p>
            )}
          </div>
        </div>

        {/* Signal */}
        <div className="clean-card p-5">
          <h4 className="font-ui text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground mb-3">Signal</h4>
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand/15 text-brand border border-brand/30">
                {signal.title || signal.sourceLabel}
              </span>
              {signal.sourceName && (
                <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted/40 text-foreground border border-border">
                  {signal.sourceName}
                </span>
              )}
              {signal.topicLabel && (
                <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-coral/15 text-coral border border-coral/30">
                  {signal.topicLabel}
                </span>
              )}
              <span
                className={cn(
                  "inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border",
                  signal.quality === "high" && "bg-success/15 text-success border-success/40",
                  signal.quality === "medium" && "bg-warning/15 text-warning border-warning/40",
                  signal.quality === "low" && "bg-muted/40 text-muted-foreground border-border"
                )}
              >
                {signal.quality} quality
              </span>
            </div>
            {(signal.reason || signal.context) && (
              <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-4">
                {signal.reason || signal.context}
              </p>
            )}
            {signal.sourceUrl && (
              <a
                href={signal.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-terracotta hover:text-foreground transition-colors"
              >
                <ExternalLink className="size-3" />
                {signalLinkLabel(signal)}
              </a>
            )}
          </div>
        </div>

        {/* Score */}
        <div className="clean-card p-5">
          <h4 className="font-ui text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground mb-3">Score Breakdown</h4>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-ui text-[11px] font-medium uppercase tracking-wider text-muted-foreground">AI Score</span>
              <span className="text-sm font-semibold text-foreground tabular-nums">{scoreBreakdown.aiScore}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-ui text-[11px] font-medium uppercase tracking-wider text-muted-foreground">ICP Fit</span>
              <span className="text-sm font-semibold text-foreground tabular-nums">{scoreBreakdown.icpFit.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-ui text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Intent</span>
              <span className="text-sm font-semibold text-foreground tabular-nums">{scoreBreakdown.intentScore.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="font-ui text-[11px] font-semibold uppercase tracking-wider text-foreground">Total</span>
              <span className="text-base font-bold text-foreground tabular-nums">{scoreBreakdown.totalScore.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-ui text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Heat</span>
              <FireScore score={scoreBreakdown.heat} />
            </div>
            {scoreBreakdown.reasoning && (
              <p className="text-[11px] text-muted-foreground italic leading-relaxed line-clamp-3 pt-2 border-t border-border">
                {scoreBreakdown.reasoning}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Campaign + Seat */}
      <div className="clean-card p-5">
        <h4 className="font-ui text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground mb-3">Campaign Context</h4>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Target className="size-3.5 text-muted-foreground" />
            <Link href={`/campaigns/${campaign.id}`} className="text-sm font-semibold text-foreground hover:text-terracotta inline-flex items-center gap-1.5">
              {campaign.name}
              <ExternalLink className="size-3" />
            </Link>
            <span className="font-ui text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full border border-border bg-muted/30 text-muted-foreground">
              {campaign.status}
            </span>
            {campaign.reviewMode && (
              <span className="font-ui text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/40">
                Review mode
              </span>
            )}
          </div>
          {seat && (
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <span className="font-ui uppercase tracking-wider">Seat</span>
              <span className="text-foreground">{seat.name}</span>
            </div>
          )}
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {/* Sequence timeline */}
      <div className="clean-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h4 className="font-ui text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Sequence Timeline</h4>
            {sequenceState.manualOverride && (
              <p className="text-[10px] text-warning mt-0.5">Manual override active — automation paused</p>
            )}
          </div>
          <span className="text-[11px] font-medium text-muted-foreground">
            Step {sequenceState.currentStep}/{sequenceState.steps.length}
          </span>
        </div>
        <div className="p-5">
          <div className="space-y-0">
            {sequenceState.steps.map((step, i) => {
              const isNext = sequenceState.nextStep?.step === step.step;
              const isEditableMessage = step.type === "message" && step.state !== "completed";
              const editedContent = getEditedContent(item.lead.id, step.step, step.content);
              const stepKey = `${item.lead.id}-${step.step}`;
              return (
                <div key={step.step}>
                  {i > 0 && <div className="ml-4 h-6 border-l border-dashed border-border" />}
                  <div className="flex items-start gap-4">
                    <ActionTypeIcon type={step.type} state={step.state} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">{formatStepType(step.type)}</span>
                          <StepStateBadge state={step.state} />
                          {isNext && (
                            <span className="font-ui text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-brand/15 text-brand border border-brand/40">
                              Next
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3" />
                            {step.delayDays > 0 ? `+${step.delayDays}d` : "immediate"}
                          </span>
                          <span className="text-muted-foreground/60">·</span>
                          <span>{step.trigger.replace("_", " ")}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {step.executedAt && (
                          <span className="text-[10px] font-medium text-muted-foreground">Executed {formatTimeAgo(step.executedAt)}</span>
                        )}
                        {!step.executedAt && step.scheduledFor && (
                          <span className="text-[10px] font-medium text-muted-foreground">Scheduled {formatRelativeTime(step.scheduledFor)}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground/80">{formatCopySource(step.sourceOfCopy)}</span>
                      </div>

                      {step.blockerReason && (
                        <p className="text-[11px] font-medium text-warning mt-1.5 inline-flex items-center gap-1">
                          <AlertTriangle className="size-3" />
                          {step.blockerReason}
                        </p>
                      )}

                      {/* Inline editable preview only for the next step that's a message */}
                      {isNext && isEditableMessage ? (
                        <div className="mt-3 space-y-2">
                          <textarea
                            value={editedContent}
                            onChange={(e) => setEditedContent(item.lead.id, step.step, e.target.value)}
                            className="w-full bg-muted/20 border border-border rounded-lg px-3 py-2.5 text-[12px] text-foreground resize-none focus:outline-none focus:border-brand/40 transition-colors"
                            rows={Math.min(8, Math.max(3, editedContent.split("\n").length + 1))}
                          />
                          {editedContent !== step.content && (
                            <div className="flex justify-end">
                              <button
                                onClick={() => onSaveMessage(item, step.step, editedContent)}
                                disabled={savingMessageKey === stepKey}
                                className="font-ui text-[10px] uppercase tracking-wider bg-brand/15 hover:bg-brand/25 text-foreground border border-brand/30 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                              >
                                <Pencil className="size-3" />
                                {savingMessageKey === stepKey ? "Saving..." : "Save draft"}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : step.preview && step.state !== "completed" ? (
                        <p className="text-[12px] text-muted-foreground leading-relaxed mt-2 whitespace-pre-wrap line-clamp-3">
                          {step.preview}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action buttons — only meaningful when reviewable */}
      <div className="flex items-center gap-3">
        {isReviewable ? (
          <>
            {lead.approved ? (
              <button disabled className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-success/20 border border-success/30 text-success text-sm font-medium">
                <Check className="size-4" />
                Approved
              </button>
            ) : (
              <button
                onClick={onApprove}
                disabled={busy}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-success/10 hover:bg-success/20 border border-success/20 hover:border-success/30 text-success text-sm font-medium transition-all disabled:opacity-50"
              >
                <Check className="size-4" />
                {busy ? "Approving..." : "Approve"}
              </button>
            )}
            <button
              onClick={onRemove}
              disabled={busy}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-muted/20 hover:bg-destructive/10 border border-border hover:border-destructive/30 text-muted-foreground hover:text-destructive text-sm font-medium transition-all disabled:opacity-50"
            >
              <X className="size-4" />
              {busy ? "Removing..." : "Remove"}
            </button>
          </>
        ) : (
          <p className="text-[12px] text-muted-foreground italic">
            <Zap className="size-3 inline mr-1 text-brand" />
            This action is in <span className="text-foreground font-semibold">{scheduledAction.state}</span> state — no manual review needed.
          </p>
        )}
      </div>
    </div>
  );
}
