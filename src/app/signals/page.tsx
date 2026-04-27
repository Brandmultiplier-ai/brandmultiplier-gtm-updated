"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ExternalLink, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { NormalizedSignal, SignalCandidate, SignalCandidateStatus, SignalFamily, SignalSourceType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

type SignalRow = SignalCandidate & {
  agentName?: string;
  campaignName?: string | null;
  normalizedSignal?: NormalizedSignal;
};

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
  const [loading, setLoading] = useState(true);
  const query = useAppStore((state) => state.signalsQuery);
  const setQuery = useAppStore((state) => state.setSignalsQuery);
  const [status, setStatus] = useState<"all" | SignalCandidateStatus>("all");
  const [familyFilter, setFamilyFilter] = useState<"all" | SignalFamily>("all");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<"all" | SignalSourceType>("all");
  const [qualityFilter, setQualityFilter] = useState<"all" | "high" | "medium" | "low">("all");

  useEffect(() => {
    fetch("/api/signals")
      .then((res) => res.json())
      .then((data) => setSignals(data.signals || []))
      .finally(() => setLoading(false));
  }, []);

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
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-right">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Pool Size</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{counts.all}</p>
        </div>
      </div>

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

        {/* Normalized signal filters */}
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Signal</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Lane</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((signal) => {
                const ns = signal.normalizedSignal;
                const title = ns?.title || signal.signalSource;
                const sourceName = ns?.sourceName;
                const reason = ns?.reason || signal.signalContext;
                const quality = ns?.quality;
                return (
                  <TableRow key={signal.id}>
                    <TableCell className="min-w-[260px]">
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">{signal.name}</p>
                        <p className="text-xs text-muted-foreground">{signal.headline || "No headline"}</p>
                        <p className="text-[11px] text-muted-foreground">{signal.location || "Location unknown"}</p>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[280px]">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand/15 text-brand border border-brand/30">
                            {title}
                          </span>
                          {sourceName && (
                            <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted/40 text-foreground border border-border">
                              {sourceName}
                            </span>
                          )}
                          {quality && (
                            <span className={cn("inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border", QUALITY_CONFIG[quality].cls)}>
                              {QUALITY_CONFIG[quality].label}
                            </span>
                          )}
                        </div>
                        {reason && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2">{reason}</p>
                        )}
                        {ns?.sourceUrl && (
                          <a
                            href={ns.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-terracotta hover:text-foreground"
                          >
                            <ExternalLink className="size-2.5" />
                            {signalLinkLabel(ns)}
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>Total {signal.totalScore.toFixed(2)}</p>
                        <p>ICP {Math.round(signal.icpFit * 100)}%</p>
                        <p>Intent {signal.intentScore}/5</p>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[220px]">
                      <div className="space-y-1">
                        <p className="text-sm text-foreground">{signal.agentName || signal.agentId}</p>
                        <p className="text-xs text-muted-foreground">
                          {signal.campaignName || "Signal pool only"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_CONFIG[signal.status].className}>
                        {STATUS_CONFIG[signal.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(signal.updatedAt).toLocaleString("en-GB", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
