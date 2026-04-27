"use client";

import { useEffect, useState } from "react";
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  Zap,
  BarChart3,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Claudio } from "@/components/claudio";

// ── Types ──────────────────────────────────────────────────────────────

interface CampaignWarmup {
  campaignId: string;
  campaignName: string;
  language: string;
  eligible: boolean;
  totalSent: number;
  matureSent: number;
  minTotalSent: number;
  minMatureSent: number;
}

interface ExperimentResults {
  control: ConversionMetrics;
  challenger: ConversionMetrics;
  winner: "control" | "challenger" | "inconclusive";
  confidenceLevel: "low" | "medium" | "high";
  deltaConnectRate?: number;
  pValue?: number;
  summary: string;
}

interface ConversionMetrics {
  total: number;
  sent: number;
  accepted: number;
  replied: number;
  connectRate: number;
  replyRate: number;
  replyOfAccepted: number;
}

interface ExperimentArm {
  name: string;
  templateWeights?: Record<number, number>;
  templateIndex?: number;
  templateText?: string;
  templateHash?: string;
  description: string;
}

interface Experiment {
  id: string;
  workspaceId: string;
  campaignId: string;
  campaignName?: string;
  language?: string;
  variable: string;
  hypothesis: string;
  reasoning: string;
  control: ExperimentArm;
  challenger: ExperimentArm;
  status: string;
  splitRatio: number;
  minSamplePerArm: number;
  maxDurationDays: number;
  controlLeadIds: string[];
  challengerLeadIds: string[];
  results?: ExperimentResults;
  proposedAt: string;
  approvedAt?: string;
  startedAt?: string;
  evaluatedAt?: string;
  decidedAt?: string;
  sampleCounts?: { controlSent: number; challengerSent: number };
  exposureCounts?: { control: number; challenger: number };
  daysElapsed?: number;
}

interface DashboardData {
  automationEnabled?: boolean;
  automationMessage?: string;
  campaigns: CampaignWarmup[];
  activeExperiment: Experiment | null;
  experiments: Experiment[];
  snapshotAt: string | null;
  leadsAnalyzed: number;
}

// ── Helpers ────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusColor(status: string) {
  switch (status) {
    case "running": return "text-coral bg-coral/10 border-coral/20";
    case "kept": return "text-success bg-success/10 border-emerald-400/20";
    case "discarded": return "text-zinc-400 bg-zinc-400/10 border-zinc-400/20";
    case "proposed": return "text-warning bg-warning/10 border-amber-400/20";
    case "cancelled": return "text-destructive bg-destructive/10 border-destructive/20";
    default: return "text-zinc-500 bg-zinc-500/10 border-zinc-500/20";
  }
}

function winnerLabel(winner: string) {
  switch (winner) {
    case "challenger": return { text: "Challenger wins", color: "text-success" };
    case "control": return { text: "Control wins", color: "text-coral" };
    default: return { text: "Inconclusive", color: "text-zinc-400" };
  }
}

// ── Components ─────────────────────────────────────────────────────────

function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-mono">{value}/{max}</span>
      </div>
      <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            pct >= 100 ? "bg-success" : "bg-brand"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="clean-card p-4">
      <p className="text-[10px] uppercase tracking-[0.15em] text-stone mb-1">{label}</p>
      <p className="text-xl font-semibold text-foreground font-mono">{value}</p>
      {sub && <p className="text-[11px] text-stone mt-0.5">{sub}</p>}
    </div>
  );
}

function CampaignWarmupCards({ campaigns }: { campaigns: CampaignWarmup[] }) {
  if (campaigns.length === 0) return null;

  return (
    <div className="clean-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="size-4 text-stone" />
        <h3 className="text-sm font-medium text-foreground">Warm-up Gate</h3>
        <span className="text-[10px] text-stone ml-auto">
          {campaigns.filter((c) => c.eligible).length}/{campaigns.length} ready
        </span>
      </div>
      <div className={cn("gap-4", campaigns.length > 1 ? "grid grid-cols-2" : "")}>
        {campaigns.map((c) => (
          <div key={c.campaignId} className="clean-card p-4 bg-muted/20">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-foreground font-medium">{c.campaignName}</span>
              <span className="text-[10px] text-stone">{c.language}</span>
              {c.eligible ? (
                <CheckCircle2 className="size-3.5 text-success ml-auto" />
              ) : (
                <Clock className="size-3.5 text-warning ml-auto" />
              )}
            </div>
            <div className="space-y-2">
              <ProgressBar value={c.totalSent} max={c.minTotalSent} label="Leads sent" />
              <ProgressBar value={c.matureSent} max={c.minMatureSent} label="Mature leads (connect)" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActiveExperimentCard({ exp }: { exp: Experiment }) {
  const controlSent = exp.sampleCounts?.controlSent ?? 0;
  const challengerSent = exp.sampleCounts?.challengerSent ?? 0;
  const min = exp.minSamplePerArm;
  const daysLeft = exp.daysElapsed !== null && exp.daysElapsed !== undefined
    ? Math.max(0, exp.maxDurationDays - Math.floor(exp.daysElapsed))
    : null;

  return (
    <div className="clean-card p-6 border-coral/30 bg-gradient-to-br from-coral/5 to-transparent">
      <div className="flex items-center gap-2 mb-1">
        <FlaskConical className="size-5 text-coral" />
        <h3 className="text-base font-medium text-foreground">Active Experiment</h3>
        <span className={cn("text-[10px] px-2 py-0.5 rounded-full border ml-auto", statusColor(exp.status))}>
          {exp.status}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-4">
        <p className="text-[10px] font-mono text-stone">{exp.id}</p>
        {exp.campaignName && (
          <>
            <span className="text-[10px] text-stone">/</span>
            <p className="text-[10px] text-stone">{exp.campaignName}</p>
          </>
        )}
      </div>

      {/* Hypothesis — prominent */}
      <div className="clean-card p-4 mb-4 bg-muted/30 border-coral/10">
        <p className="text-[10px] uppercase tracking-[0.15em] text-coral/60 mb-1.5">Hypothesis</p>
        <p className="text-sm text-foreground leading-relaxed">{exp.hypothesis}</p>
        {exp.reasoning && (
          <p className="text-xs text-stone mt-2 leading-relaxed">{exp.reasoning}</p>
        )}
      </div>

      {/* Arms side by side */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="clean-card p-4 bg-muted/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="size-2 rounded-full bg-coral" />
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone">Control</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{exp.control.description}</p>
          {exp.control.templateText && (
            <p className="text-[11px] text-stone mt-2 line-clamp-4 italic leading-relaxed">
              &ldquo;{exp.control.templateText.slice(0, 200)}{exp.control.templateText.length > 200 ? "..." : ""}&rdquo;
            </p>
          )}
        </div>
        <div className="clean-card p-4 bg-muted/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="size-2 rounded-full bg-warning" />
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone">Challenger</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{exp.challenger.description}</p>
          {exp.challenger.templateText && (
            <p className="text-[11px] text-stone mt-2 line-clamp-4 italic leading-relaxed">
              &ldquo;{exp.challenger.templateText.slice(0, 200)}{exp.challenger.templateText.length > 200 ? "..." : ""}&rdquo;
            </p>
          )}
        </div>
      </div>

      {/* Progress bars */}
      <div className="space-y-2.5">
        <ProgressBar value={controlSent} max={min} label={`Control arm (${controlSent} mature)`} />
        <ProgressBar value={challengerSent} max={min} label={`Challenger arm (${challengerSent} mature)`} />
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-5 mt-4 pt-3 border-t border-border/60 text-[11px] text-stone">
        <span>Split {Math.round(exp.splitRatio * 100)}/{Math.round((1 - exp.splitRatio) * 100)}</span>
        <span>Variable: {exp.variable.replace("_", " ")}</span>
        {exp.daysElapsed !== null && exp.daysElapsed !== undefined && (
          <span>Day {Math.floor(exp.daysElapsed)}/{exp.maxDurationDays}{daysLeft !== null ? ` (${daysLeft}d left)` : ""}</span>
        )}
        {exp.language && <span>Language: {exp.language}</span>}
        <span className="ml-auto font-mono text-[10px]">min {min}/arm</span>
      </div>
    </div>
  );
}

function ExperimentResultsPanel({ results }: { results: ExperimentResults }) {
  const w = winnerLabel(results.winner);
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-3">
        <span className={cn("text-xs font-medium", w.color)}>{w.text}</span>
        {results.pValue !== undefined && (
          <span className="text-[10px] font-mono text-stone">p={results.pValue.toFixed(3)}</span>
        )}
        {results.deltaConnectRate !== undefined && (
          <span className={cn(
            "text-[10px] font-mono",
            results.deltaConnectRate > 0 ? "text-success" : results.deltaConnectRate < 0 ? "text-destructive" : "text-stone"
          )}>
            {results.deltaConnectRate > 0 ? "+" : ""}{results.deltaConnectRate}pp
          </span>
        )}
        <span className="text-[10px] text-stone">{results.confidenceLevel} confidence</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MetricsRow label="Control" metrics={results.control} />
        <MetricsRow label="Challenger" metrics={results.challenger} />
      </div>
    </div>
  );
}

function MetricsRow({ label, metrics }: { label: string; metrics: ConversionMetrics }) {
  return (
    <div className="text-[11px] space-y-0.5">
      <p className="text-stone font-medium">{label}</p>
      <div className="flex gap-3 font-mono">
        <span className="text-foreground">{metrics.connectRate}% conn</span>
        <span className="text-stone">{metrics.replyOfAccepted}% reply</span>
        <span className="text-stone">{metrics.sent} sent</span>
      </div>
    </div>
  );
}

function ExperimentHistoryCard({ experiments }: { experiments: Experiment[] }) {
  const completed = experiments.filter((e) => e.status === "kept" || e.status === "discarded");
  if (completed.length === 0) {
    return (
      <div className="clean-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="size-4 text-stone" />
          <h3 className="text-sm font-medium text-foreground">Experiment History</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <Claudio size={48} mood="blink" />
          <p className="font-ui text-xs text-stone">Claudio is napping — no completed experiments yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="clean-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="size-4 text-stone" />
        <h3 className="text-sm font-medium text-foreground">Experiment History</h3>
        <span className="text-[10px] text-stone ml-auto">{completed.length} completed</span>
      </div>
      <div className="space-y-3">
        {completed.map((exp) => (
          <div key={exp.id} className="clean-card p-3 bg-muted/20">
            <div className="flex items-center gap-2 mb-1">
              {exp.status === "kept" ? (
                <CheckCircle2 className="size-3.5 text-success" />
              ) : (
                <XCircle className="size-3.5 text-zinc-400" />
              )}
              <span className="text-xs text-foreground flex-1 line-clamp-1">{exp.hypothesis}</span>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", statusColor(exp.status))}>
                {exp.status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-stone">
              <span className="font-mono">{exp.id}</span>
              {exp.campaignName && <span>{exp.campaignName}</span>}
              <span>{exp.variable}</span>
              {exp.decidedAt && <span>{fmtDate(exp.decidedAt)}</span>}
            </div>
            {exp.results && <ExperimentResultsPanel results={exp.results} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateEvolutionCard({ experiments }: { experiments: Experiment[] }) {
  const timeline = experiments
    .filter((e) => (e.status === "kept" || e.status === "discarded"))
    .sort((a, b) => (a.decidedAt || a.proposedAt).localeCompare(b.decidedAt || b.proposedAt));

  if (timeline.length === 0) {
    return null;
  }

  return (
    <div className="clean-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="size-4 text-stone" />
        <h3 className="text-sm font-medium text-foreground">Template Evolution</h3>
      </div>
      <div className="relative">
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-muted/60" />

        <div className="space-y-4">
          {timeline.map((exp) => {
            const isKept = exp.status === "kept";
            return (
              <div key={exp.id} className="relative pl-6">
                <div className={cn(
                  "absolute left-0 top-1.5 size-[14px] rounded-full border-2",
                  isKept
                    ? "border-emerald-400 bg-success/20"
                    : "border-zinc-600 bg-zinc-600/20"
                )} />

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-stone">
                      {exp.decidedAt ? fmtDate(exp.decidedAt) : "\u2014"}
                    </span>
                    {isKept ? (
                      <ArrowRight className="size-3 text-success" />
                    ) : (
                      <XCircle className="size-3 text-zinc-500" />
                    )}
                    <span className={cn("text-[10px]", isKept ? "text-success" : "text-zinc-500")}>
                      {isKept ? "Promoted" : "Discarded"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{exp.hypothesis}</p>
                  {exp.challenger.templateText && (
                    <p className="text-[11px] text-stone mt-0.5 italic line-clamp-2">
                      &ldquo;{exp.challenger.templateText.slice(0, 100)}...&rdquo;
                    </p>
                  )}
                  {exp.results && (
                    <div className="flex gap-3 mt-1 text-[10px] font-mono">
                      <span className={cn(
                        exp.results.deltaConnectRate && exp.results.deltaConnectRate > 0 ? "text-success" : "text-zinc-500"
                      )}>
                        {exp.results.deltaConnectRate && exp.results.deltaConnectRate > 0 ? "+" : ""}
                        {exp.results.deltaConnectRate}pp connect
                      </span>
                      <span className="text-stone">p={exp.results.pValue?.toFixed(3) ?? "\u2014"}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────

export default function BrainPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    try {
      const res = await fetch("/api/brain/dashboard");
      const json = await res.json();
      setData(json);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-5 text-stone animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-screen-2xl">
        <p className="text-sm text-stone">Failed to load Brain data.</p>
      </div>
    );
  }

  const completed = data.experiments.filter((e) => e.status === "kept" || e.status === "discarded");
  const kept = data.experiments.filter((e) => e.status === "kept");
  const automationEnabled = data.automationEnabled !== false;

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-medium tracking-[-0.04em] text-gradient">Brain</h2>
          <p className="text-sm text-stone mt-1">
            {automationEnabled ? "Autonomous experiment loop" : "Archived experiment layer"}
          </p>
        </div>
        <button
          onClick={loadData}
          className="text-[10px] uppercase tracking-[0.2em] text-stone hover:text-terracotta transition-colors"
        >
          Refresh
        </button>
      </div>

      {!automationEnabled && (
        <div className="clean-card p-5 border-amber-500/20 bg-warning/[0.04]">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="size-4 text-amber-300" />
            <h3 className="text-sm font-medium text-foreground">Brain Paused</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {data.automationMessage || "Brain experiments are paused. Campaign copy is managed directly from campaign settings."}
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatBox
          label="Experiments"
          value={data.experiments.length}
          sub={`${completed.length} completed`}
        />
        <StatBox
          label="Kept"
          value={kept.length}
          sub={completed.length > 0 ? `${Math.round((kept.length / completed.length) * 100)}% win rate` : "\u2014"}
        />
        <StatBox
          label="Leads analyzed"
          value={data.leadsAnalyzed}
          sub={data.snapshotAt ? `Snapshot ${fmtDateTime(data.snapshotAt)}` : "\u2014"}
        />
        <StatBox
          label="Status"
          value={!automationEnabled ? "Paused" : data.activeExperiment ? "Running" : data.campaigns.every((c) => c.eligible) ? "Idle" : "Warm-up"}
          sub={!automationEnabled ? "Analytics only" : data.activeExperiment ? `Day ${Math.floor(data.activeExperiment.daysElapsed ?? 0)}` : "\u2014"}
        />
      </div>

      {/* Active experiment — full width, prominent */}
      {automationEnabled && data.activeExperiment ? (
        <ActiveExperimentCard exp={data.activeExperiment} />
      ) : automationEnabled ? (
        <div className="clean-card p-8 flex items-center justify-center">
          <div className="text-center">
            <Clock className="size-6 text-stone mx-auto mb-3" />
            <p className="text-sm text-stone">
              {data.campaigns.some((c) => c.eligible)
                ? "No active experiment. Next one will be generated on the next cycle."
                : "Waiting for enough baseline data."}
            </p>
          </div>
        </div>
      ) : null}

      {/* Warm-up gate per campaign */}
      {automationEnabled && data.campaigns.length > 0 && <CampaignWarmupCards campaigns={data.campaigns} />}

      {/* Template Evolution */}
      <TemplateEvolutionCard experiments={data.experiments} />

      {/* History */}
      <ExperimentHistoryCard experiments={data.experiments} />
    </div>
  );
}
