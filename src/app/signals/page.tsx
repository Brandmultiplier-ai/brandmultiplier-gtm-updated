"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ExternalLink, Loader2, RefreshCw, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { NormalizedSignal, SignalCandidate, SignalCandidateStatus, SignalFamily, SignalSourceType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

type SignalRow = SignalCandidate & {
  agentName?: string;
  campaignName?: string | null;
  normalizedSignal?: NormalizedSignal;
};

type CampaignOption = {
  id: string;
  name: string;
  status: "active" | "paused" | "draft" | "completed";
};

type AgentGuardrail = {
  id: string;
  name: string;
  status: "active" | "paused" | "draft";
  icp: {
    jobTitles: string[];
    industries: string[];
  };
  signals: {
    selectedTopics?: string[];
    engagementKeywords: string[];
  };
};

function buildStarterKeywordsFromIcp(agent: AgentGuardrail): string[] {
  const unique = new Set<string>();
  const add = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    unique.add(trimmed);
  };

  const titles = agent.icp.jobTitles || [];
  const industries = agent.icp.industries || [];
  for (const title of titles) add(title);
  for (const industry of industries) {
    add(industry);
    add(`${industry} growth`);
  }

  for (const title of titles.slice(0, 3)) {
    for (const industry of industries.slice(0, 2)) {
      add(`${title} ${industry}`);
    }
  }

  return Array.from(unique).slice(0, 8);
}

const STATUS_CONFIG: Record<SignalCandidateStatus, { label: string; className: string }> = {
  new: { label: "Signal", className: "bg-muted/60 text-muted-foreground" },
  shortlisted: { label: "Shortlisted", className: "bg-coral/10 text-coral" },
  promoted: { label: "Promoted", className: "bg-green-500/10 text-green-400" },
  dismissed: { label: "Dismissed", className: "bg-amber-500/10 text-amber-400" },
};

const FAMILY_LABELS: Record<SignalFamily, string> = {
  topic_query_match: "Topic match",
  engaged_with_profile: "Engaged with profile",
  engaged_with_company: "Engaged with company",
  engaged_with_post: "Engaged with post",
  posted_about_topic: "Posted about topic",
  visited_profile: "Visited profile",
  follows_entity: "Follows entity",
  job_change: "Job change",
  recent_funding: "Recent funding",
  high_activity_icp: "High activity ICP",
  generic_signal: "Other",
};

const SOURCE_TYPE_LABELS: Record<SignalSourceType, string> = {
  search_query: "Search query",
  personal_profile: "Your profile",
  watch_profile: "Tracked profile",
  author_profile: "Author profile",
  company_page: "Company page",
  competitor_page: "Tracked company",
  linkedin_post: "LinkedIn post",
  profile: "LinkedIn profile",
  event: "Event",
  activity_score: "Activity score",
  generic: "Source",
};

const QUALITY_CONFIG: Record<"high" | "medium" | "low", { label: string; cls: string }> = {
  high: { label: "High quality", cls: "bg-success/15 text-success border-success/40" },
  medium: { label: "Medium quality", cls: "bg-warning/15 text-warning border-warning/40" },
  low: { label: "Low quality", cls: "bg-muted/40 text-muted-foreground border-border" },
};

function signalLinkLabel(signal: NormalizedSignal): string {
  if (signal.sourcePostUrl) return "View post";
  if (signal.sourceType === "company_page" || signal.sourceType === "competitor_page") return "View company page";
  if (signal.sourceType === "watch_profile" || signal.sourceType === "author_profile" || signal.sourceType === "personal_profile") return "View source profile";
  return "View signal source";
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [agents, setAgents] = useState<AgentGuardrail[]>([]);
  /** Default campaign for discovery tick only (not shown as a “promotion target”). */
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [loading, setLoading] = useState(true);
  const [runningDiscovery, setRunningDiscovery] = useState(false);
  const [promoteDialogSignal, setPromoteDialogSignal] = useState<SignalRow | null>(null);
  const [promoteDialogCampaignId, setPromoteDialogCampaignId] = useState("");
  const [promoteDialogNewName, setPromoteDialogNewName] = useState("");
  const [creatingCampaignInDialog, setCreatingCampaignInDialog] = useState(false);
  const [promotingSignalId, setPromotingSignalId] = useState<string | null>(null);
  const [updatingSignalId, setUpdatingSignalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const query = useAppStore((state) => state.signalsQuery);
  const setQuery = useAppStore((state) => state.setSignalsQuery);
  const [status, setStatus] = useState<"all" | SignalCandidateStatus>("all");
  const [familyFilter, setFamilyFilter] = useState<"all" | SignalFamily>("all");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<"all" | SignalSourceType>("all");
  const [qualityFilter, setQualityFilter] = useState<"all" | "high" | "medium" | "low">("all");

  async function loadSignals() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/signals");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Failed to load signals");
      }
      setSignals(body.signals || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load signals");
      setSignals([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadContext() {
    try {
      const [campaignsRes, agentsRes] = await Promise.all([
        fetch("/api/campaigns"),
        fetch("/api/agent"),
      ]);

      const campaignsBody = await campaignsRes.json().catch(() => ({}));
      const agentsBody = await agentsRes.json().catch(() => ({}));

      if (campaignsRes.ok) {
        const rows = (campaignsBody.campaigns || []) as CampaignOption[];
        setCampaigns(rows.filter((row) => row.status !== "completed"));
      }
      if (agentsRes.ok) {
        setAgents((agentsBody.agents || []) as AgentGuardrail[]);
      }
    } catch {
      // Non-blocking: table can still render without context metadata.
    }
  }

  const activeAgent = useMemo(
    () => agents.find((agent) => agent.status === "active") || null,
    [agents]
  );

  const activeAgentTopics = useMemo(() => {
    if (!activeAgent) return [];
    const selected = Array.isArray(activeAgent.signals.selectedTopics) ? activeAgent.signals.selectedTopics : [];
    const engagement = Array.isArray(activeAgent.signals.engagementKeywords) ? activeAgent.signals.engagementKeywords : [];
    return selected.length > 0 ? selected : engagement;
  }, [activeAgent]);

  const starterKeywords = useMemo(
    () => (activeAgent ? buildStarterKeywordsFromIcp(activeAgent) : []),
    [activeAgent]
  );

  function preferredCampaignId(): string {
    return (
      campaigns.find((campaign) => campaign.status === "active")?.id ||
      campaigns[0]?.id ||
      ""
    );
  }

  async function createCampaignWithName(campaignName: string): Promise<string> {
    const targetAgent = activeAgent || agents[0];
    if (!targetAgent) {
      throw new Error("Create an AI agent first, then create a campaign.");
    }

    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: targetAgent.id,
        name: campaignName,
        status: "active",
        segment: "default",
        search: {
          keywords: "",
          titleFilter: "",
          language: "en",
          locations: [],
        },
        sequence: [
          {
            step: 1,
            type: "connection_request",
            delayDays: 0,
            trigger: "immediate",
            content: "Hi {{first_name}}, I'd like to connect.",
          },
          {
            step: 2,
            type: "message",
            delayDays: 1,
            trigger: "accepted",
            content: "Thanks for connecting, {{first_name}}.",
          },
        ],
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || "Failed to create campaign");
    }
    const id = body.campaign?.id as string | undefined;
    if (!id) throw new Error("Campaign created but no id returned.");
    setSelectedCampaignId(id);
    return id;
  }

  function openPromoteDialog(signal: SignalRow) {
    setError(null);
    setPromoteDialogNewName("");
    const linked =
      signal.campaignId && campaigns.some((c) => c.id === signal.campaignId)
        ? signal.campaignId
        : "";
    setPromoteDialogCampaignId(linked || preferredCampaignId());
    setPromoteDialogSignal(signal);
  }

  async function handleCreateCampaignInPromoteDialog() {
    const name = promoteDialogNewName.trim();
    if (!name) {
      setError("Enter a name for the new campaign.");
      return;
    }
    setCreatingCampaignInDialog(true);
    setError(null);
    try {
      const id = await createCampaignWithName(name);
      setPromoteDialogCampaignId(id);
      setPromoteDialogNewName("");
      await loadContext();
      setInfo(`Created campaign "${name}". Select Promote below to add this person.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create campaign");
    } finally {
      setCreatingCampaignInDialog(false);
    }
  }

  async function runDiscoveryNow() {
    setRunningDiscovery(true);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedCampaignId ? { campaignId: selectedCampaignId } : {}),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Discovery run failed");
      }
      const saved = typeof body.saved === "number" ? body.saved : 0;
      const discovered = typeof body.discovered === "number" ? body.discovered : 0;
      const duplicates = typeof body.duplicates === "number" ? body.duplicates : 0;
      setInfo(`Discovery finished: ${discovered} discovered, ${saved} saved, ${duplicates} duplicates.`);
      await loadSignals();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Discovery run failed");
    } finally {
      setRunningDiscovery(false);
    }
  }

  useEffect(() => {
    void loadSignals();
    void loadContext();
  }, []);

  /** If campaigns load after the dialog opens, preselect a sensible default */
  useEffect(() => {
    if (!promoteDialogSignal) return;
    if (promoteDialogCampaignId) return;
    const next =
      campaigns.find((campaign) => campaign.status === "active")?.id ||
      campaigns[0]?.id ||
      "";
    if (next) setPromoteDialogCampaignId(next);
  }, [promoteDialogSignal, campaigns, promoteDialogCampaignId]);

  useEffect(() => {
    if (selectedCampaignId) return;
    const preferred = campaigns.find((campaign) => campaign.status === "active")?.id || campaigns[0]?.id || "";
    if (preferred) setSelectedCampaignId(preferred);
  }, [campaigns, selectedCampaignId]);

  async function promoteSignalToCampaign(signal: SignalRow, campaignId: string) {
    const targetId = campaignId || signal.campaignId || "";
    if (!targetId) {
      setError("Pick a campaign or create one before promoting.");
      return;
    }
    setPromotingSignalId(signal.id);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/signals/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId: signal.id, campaignId: targetId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || body.results?.[0]?.error || "Failed to promote signal");
      }
      setInfo(`Promoted ${signal.name} into leads. It will now appear in Copilot queue.`);
      setPromoteDialogSignal(null);
      await loadSignals();
    } catch (promoteError) {
      setError(promoteError instanceof Error ? promoteError.message : "Failed to promote signal");
    } finally {
      setPromotingSignalId(null);
    }
  }

  async function updateSignalStatus(signal: SignalRow, nextStatus: "shortlisted" | "dismissed" | "new") {
    setUpdatingSignalId(signal.id);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch(`/api/signals/${signal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Failed to update signal");
      }
      await loadSignals();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Failed to update signal");
    } finally {
      setUpdatingSignalId(null);
    }
  }

  async function applyStarterKeywords() {
    if (!activeAgent || starterKeywords.length === 0) return;
    setError(null);
    setInfo(null);
    try {
      const mergedKeywords = Array.from(new Set([...(activeAgent.signals.engagementKeywords || []), ...starterKeywords]));
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...activeAgent,
          signals: {
            ...activeAgent.signals,
            engagementKeywords: mergedKeywords,
          },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Failed to apply starter keywords");
      }
      setInfo(`Applied ${starterKeywords.length} starter keywords to ${activeAgent.name}.`);
      await loadContext();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Failed to apply starter keywords");
    }
  }

  const familyOptions = useMemo(() => {
    const seen = new Set<SignalFamily>();
    for (const signal of signals) {
      if (signal.normalizedSignal?.family) seen.add(signal.normalizedSignal.family);
    }
    return Array.from(seen);
  }, [signals]);

  const sourceTypeOptions = useMemo(() => {
    const seen = new Set<SignalSourceType>();
    for (const signal of signals) {
      if (signal.normalizedSignal?.sourceType) seen.add(signal.normalizedSignal.sourceType);
    }
    return Array.from(seen);
  }, [signals]);

  const filtered = useMemo(() => {
    return signals.filter((signal) => {
      if (status !== "all" && signal.status !== status) return false;
      if (familyFilter !== "all" && signal.normalizedSignal?.family !== familyFilter) return false;
      if (sourceTypeFilter !== "all" && signal.normalizedSignal?.sourceType !== sourceTypeFilter) return false;
      if (qualityFilter !== "all" && signal.normalizedSignal?.quality !== qualityFilter) return false;
      if (!query) return true;

      const haystack = [
        signal.name,
        signal.headline,
        signal.location,
        signal.agentName,
        signal.campaignName,
        signal.signalContext,
        signal.normalizedSignal?.title,
        signal.normalizedSignal?.sourceName,
        signal.normalizedSignal?.reason,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query.toLowerCase());
    });
  }, [query, signals, status, familyFilter, sourceTypeFilter, qualityFilter]);

  const counts = {
    all: signals.length,
    new: signals.filter((signal) => signal.status === "new").length,
    shortlisted: signals.filter((signal) => signal.status === "shortlisted").length,
    promoted: signals.filter((signal) => signal.status === "promoted").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">Signals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Awareness pool captured by discovery before promotion into campaign leads.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { void loadSignals(); }}
            disabled={loading || runningDiscovery}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => { void runDiscoveryNow(); }}
            disabled={runningDiscovery}
            className="gap-1.5 bg-brand text-white hover:bg-brand-hover"
          >
            {runningDiscovery ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            Run discovery now
          </Button>
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-right">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Pool Size</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{counts.all}</p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {info}
        </div>
      ) : null}
      {activeAgent && activeAgentTopics.length === 0 ? (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          <p className="font-medium text-foreground">
            Guardrail: active agent `{activeAgent.name}` has no discovery topics.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Discovery can stall with zero results until topics/keywords are configured.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-warning/40 text-warning hover:bg-warning/20"
              onClick={() => { void applyStarterKeywords(); }}
              disabled={starterKeywords.length === 0}
            >
              Auto-apply ICP starter keywords ({starterKeywords.length})
            </Button>
            <a href="/agent" className="text-xs font-medium text-terracotta hover:text-foreground">
              Open Agent setup
            </a>
          </div>
        </div>
      ) : null}

      <div className="clean-card p-4 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search signals..."
              className="pl-9"
            />
          </div>
          <Tabs value={status} onValueChange={(value) => setStatus(value as typeof status)}>
            <TabsList>
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
              <TabsTrigger value="new">Signals ({counts.new})</TabsTrigger>
              <TabsTrigger value="shortlisted">Shortlisted ({counts.shortlisted})</TabsTrigger>
              <TabsTrigger value="promoted">Promoted ({counts.promoted})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Use <span className="font-semibold text-foreground">Promote</span> on each row—choose which campaign receives this signal, or create a campaign in the popup. Shortlist and dismiss stay inline.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Filters</span>
          <select
            value={familyFilter}
            onChange={(e) => setFamilyFilter(e.target.value as typeof familyFilter)}
            className="h-8 px-3 text-[11px] font-medium bg-card border border-border rounded-lg text-foreground focus:outline-none focus:border-brand/40 cursor-pointer"
          >
            <option value="all">All families</option>
            {familyOptions.map((family) => (
              <option key={family} value={family}>{FAMILY_LABELS[family]}</option>
            ))}
          </select>
          <select
            value={sourceTypeFilter}
            onChange={(e) => setSourceTypeFilter(e.target.value as typeof sourceTypeFilter)}
            className="h-8 px-3 text-[11px] font-medium bg-card border border-border rounded-lg text-foreground focus:outline-none focus:border-brand/40 cursor-pointer"
          >
            <option value="all">All source types</option>
            {sourceTypeOptions.map((sourceType) => (
              <option key={sourceType} value={sourceType}>{SOURCE_TYPE_LABELS[sourceType]}</option>
            ))}
          </select>
          <select
            value={qualityFilter}
            onChange={(e) => setQualityFilter(e.target.value as typeof qualityFilter)}
            className="h-8 px-3 text-[11px] font-medium bg-card border border-border rounded-lg text-foreground focus:outline-none focus:border-brand/40 cursor-pointer"
          >
            <option value="all">All qualities</option>
            <option value="high">High quality</option>
            <option value="medium">Medium quality</option>
            <option value="low">Low quality</option>
          </select>
          {(familyFilter !== "all" || sourceTypeFilter !== "all" || qualityFilter !== "all") && (
            <button
              type="button"
              onClick={() => { setFamilyFilter("all"); setSourceTypeFilter("all"); setQualityFilter("all"); }}
              className="font-ui text-[10px] uppercase tracking-wider text-terracotta hover:text-foreground"
            >
              Clear
            </button>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            {filtered.length}/{signals.length}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading signals...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <Activity className="mx-auto size-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-foreground">No signals found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Discovery candidates will appear here before or alongside lead promotion.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {filtered.map((signal) => {
              const ns = signal.normalizedSignal;
              const title = ns?.title || signal.signalSource;
              const sourceName = ns?.sourceName;
              const reason = ns?.reason || signal.signalContext;
              const quality = ns?.quality;
              return (
                <li key={signal.id} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <p className="font-medium text-foreground">{signal.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {signal.headline || "No headline"}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{signal.location || "Location unknown"}</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex max-w-full items-center break-words text-[11px] font-semibold rounded-full bg-brand/15 px-2 py-0.5 text-brand ring-1 ring-brand/25">
                            {title}
                          </span>
                          {sourceName ? (
                            <span className="inline-flex max-w-full items-center break-words text-[11px] font-medium rounded-full bg-muted/50 px-2 py-0.5 text-foreground ring-1 ring-border">
                              {sourceName}
                            </span>
                          ) : null}
                          {quality ? (
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                QUALITY_CONFIG[quality].cls
                              )}
                            >
                              {QUALITY_CONFIG[quality].label}
                            </span>
                          ) : null}
                          <Badge className={STATUS_CONFIG[signal.status].className}>{STATUS_CONFIG[signal.status].label}</Badge>
                        </div>
                        {reason ? <p className="text-[11px] leading-snug text-muted-foreground">{reason}</p> : null}
                        {ns?.sourceUrl ? (
                          <a
                            href={ns.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-terracotta hover:text-foreground"
                          >
                            <ExternalLink className="size-2.5 shrink-0" />
                            {signalLinkLabel(ns)}
                          </a>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          Scores: total <span className="tabular-nums text-foreground">{signal.totalScore.toFixed(2)}</span>
                        </span>
                        <span>
                          ICP <span className="tabular-nums text-foreground">{Math.round(signal.icpFit * 100)}%</span>
                        </span>
                        <span>
                          Intent <span className="tabular-nums text-foreground">{signal.intentScore}/5</span>
                        </span>
                        <span className="text-[11px]">
                          Agent: <span className="text-foreground">{signal.agentName || signal.agentId}</span>
                        </span>
                        <span className="min-w-0 text-[11px] break-words">
                          Campaign:{" "}
                          <span className="text-foreground">{signal.campaignName || "Not in a campaign yet"}</span>
                        </span>
                        <span className="text-[11px] tabular-nums">
                          {new Date(signal.updatedAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      </div>
                    </div>

                    <div className="flex w-full shrink-0 flex-col gap-2 sm:max-w-xs lg:w-44">
                      {signal.status !== "promoted" ? (
                        <Button
                          size="sm"
                          className="h-9 w-full bg-brand text-white hover:bg-brand-hover"
                          onClick={() => openPromoteDialog(signal)}
                          disabled={promotingSignalId === signal.id || updatingSignalId === signal.id}
                        >
                          Promote
                        </Button>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <a
                            href="/copilot"
                            className="inline-flex h-9 items-center justify-center rounded-lg bg-muted/80 text-xs font-medium text-foreground ring-1 ring-border hover:bg-muted"
                          >
                            Open Copilot
                          </a>
                          <a
                            href="/leads"
                            className="inline-flex h-9 items-center justify-center rounded-lg bg-muted/80 text-xs font-medium text-foreground ring-1 ring-border hover:bg-muted"
                          >
                            Open Leads
                          </a>
                        </div>
                      )}
                      {signal.status !== "shortlisted" && signal.status !== "promoted" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 w-full"
                          onClick={() => {
                            void updateSignalStatus(signal, "shortlisted");
                          }}
                          disabled={updatingSignalId === signal.id || promotingSignalId === signal.id}
                        >
                          Shortlist
                        </Button>
                      ) : null}
                      {signal.status !== "dismissed" && signal.status !== "promoted" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 w-full"
                          onClick={() => {
                            void updateSignalStatus(signal, "dismissed");
                          }}
                          disabled={updatingSignalId === signal.id || promotingSignalId === signal.id}
                        >
                          Dismiss
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={!!promoteDialogSignal}
        onOpenChange={(open) => {
          if (!open) {
            setPromoteDialogSignal(null);
            setPromoteDialogNewName("");
          }
        }}
      >
        <DialogContent className="gap-5 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Which campaign should this signal join?</DialogTitle>
            <DialogDescription>
              {promoteDialogSignal?.name ?? "Signal"} moves into leads for Copilot review after you promote. Pick an existing outreach campaign below, or create a new one.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Campaign</p>
              <select
                value={promoteDialogCampaignId}
                onChange={(event) => setPromoteDialogCampaignId(event.target.value)}
                className="flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                {campaigns.length === 0 ? (
                  <option value="">No campaigns yet — create one beneath</option>
                ) : null}
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name} ({campaign.status})
                  </option>
                ))}
              </select>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Create a new campaign</p>
              <p className="text-[11px] text-muted-foreground">
                Names the campaign immediately; then use Promote to add this person into it.
              </p>
              <Input
                value={promoteDialogNewName}
                onChange={(event) => setPromoteDialogNewName(event.target.value)}
                placeholder="e.g., Q2 enterprise founders"
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={creatingCampaignInDialog || !promoteDialogNewName.trim()}
                onClick={() => {
                  void handleCreateCampaignInPromoteDialog();
                }}
              >
                {creatingCampaignInDialog ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create campaign"
                )}
              </Button>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPromoteDialogSignal(null);
                setPromoteDialogNewName("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="inline-flex items-center justify-center gap-2 bg-brand text-white hover:bg-brand-hover"
              disabled={
                !promoteDialogSignal ||
                promotingSignalId === promoteDialogSignal.id ||
                !(
                  promoteDialogCampaignId.trim() ||
                  promoteDialogSignal.campaignId?.trim()
                )
              }
              onClick={() => {
                if (!promoteDialogSignal) return;
                const target =
                  promoteDialogCampaignId.trim() ||
                  promoteDialogSignal.campaignId?.trim() ||
                  "";
                void promoteSignalToCampaign(promoteDialogSignal, target);
              }}
            >
              {promoteDialogSignal && promotingSignalId === promoteDialogSignal.id ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Promoting…
                </>
              ) : (
                "Promote to campaign"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
