"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  BarChart3,
  Target,
  TrendingUp,
  Zap,
  Users,
  Calendar,
  ArrowUp,
  ArrowDown,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return {
    start: dateInputValue(start),
    end: dateInputValue(end),
  };
}

// ── Types ──────────────────────────────────────────────────────────────

interface InsightsData {
  period: { start: string; end: string };
  kpis: {
    totalLeads: number;
    avgLeadsPerDay: number;
    activeSignals: number;
    totalInvited: number;
    totalAccepted: number;
    totalReplied: number;
    connectRate: number;
    replyRate: number;
  };
  dailyPerformance: Array<{
    date: string;
    discovered: number;
    invited: number;
    accepted: number;
    replied: number;
    messaged: number;
  }>;
  byAgent: Array<{
    agentName: string;
    agentStatus: string;
    totalLeads: number;
    invited: number;
    accepted: number;
    replied: number;
    connectRate: number;
    replyRate: number;
  }>;
  bySignal: Array<{
    signal: string;
    type: string;
    leadsGenerated: number;
  }>;
  byCampaign: Array<{
    campaignId?: string;
    campaignName: string;
    totalLeads: number;
    sent: number;
    accepted: number;
    replied: number;
    connectRate: number;
    replyRate: number;
  }>;
}

// ── Components ─────────────────────────────────────────────────────────

function KpiCard({ label, value, subtitle, icon: Icon, trend }: {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "flat";
}) {
  return (
    <div className="clean-card p-5 group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone">{label}</p>
          <p className="text-3xl font-light stat-glow text-foreground mt-2">{value}</p>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground mt-1.5">{subtitle}</p>
          )}
        </div>
        <div className="size-9 rounded-lg bg-muted/40 flex items-center justify-center">
          <Icon className="size-4 text-stone" />
        </div>
      </div>
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand to-transparent opacity-0 group-hover:opacity-30 transition-opacity duration-300" />
    </div>
  );
}

function RateDisplay({ rate, label }: { rate: number; label: string }) {
  const color = rate >= 30 ? "text-success" : rate >= 15 ? "text-warning" : "text-muted-foreground";
  return (
    <div className="text-center">
      <p className={cn("text-lg font-medium", color)}>{rate}%</p>
      <p className="text-[9px] text-stone uppercase tracking-wider">{label}</p>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(defaultDateRange().start);
  const [endDate, setEndDate] = useState(defaultDateRange().end);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!startDate || !endDate || startDate > endDate) {
      return;
    }

    setLoading(true);
    setError(null);
    fetch(`/api/insights?start=${startDate}&end=${endDate}`)
      .then((r) => r.json())
      .then((d: InsightsData) => setData(d))
      .catch(() => setError("Failed to load insights"))
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const kpis = data?.kpis || {
    totalLeads: 0, avgLeadsPerDay: 0, activeSignals: 0,
    totalInvited: 0, totalAccepted: 0, totalReplied: 0,
    connectRate: 0, replyRate: 0,
  };

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between mb-2">
        <div>
          <h2 className="text-3xl font-medium tracking-[-0.04em] text-gradient">Insights</h2>
          <p className="text-sm text-stone mt-1">Analytics and performance insights for your lead generation</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[10px] text-stone">
            <Calendar className="size-3.5" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-border bg-muted/30 px-2 py-1 text-muted-foreground focus:outline-none"
            />
            <span>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-border bg-muted/30 px-2 py-1 text-muted-foreground focus:outline-none"
            />
          </div>
          {data?.period && (
            <div className="text-[10px] text-stone">
              {new Date(data.period.start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {" — "}
              {new Date(data.period.end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-5">
        <KpiCard label="Total Leads" value={kpis.totalLeads} subtitle="in the selected period" icon={Users} />
        <KpiCard label="Avg Leads/Day" value={kpis.avgLeadsPerDay} subtitle="daily average" icon={TrendingUp} />
        <KpiCard label="Active Signals" value={kpis.activeSignals} subtitle="generating leads" icon={Zap} />
        <KpiCard label="Contacted" value={kpis.totalInvited} subtitle={`${kpis.connectRate}% connect rate`} icon={Target} />
      </div>

      {/* Funnel overview */}
      <div className="clean-card p-6">
        <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone mb-5">Conversion Funnel</h3>
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: "Discovered", value: kpis.totalLeads, color: "bg-coral/20 text-violet-300" },
            { label: "Invited", value: kpis.totalInvited, color: "bg-coral/20 text-coral" },
            { label: "Accepted", value: kpis.totalAccepted, color: "bg-success/20 text-emerald-300" },
            { label: "Replied", value: kpis.totalReplied, color: "bg-brand/20 text-pink-300" },
          ].map((item, i, arr) => (
            <div key={item.label} className="text-center">
              <div className={cn("inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium", item.color)}>
                {item.value}
              </div>
              <p className="text-[9px] text-stone uppercase tracking-wider mt-2">{item.label}</p>
              {i < arr.length - 1 && i > 0 && (
                <p className="text-[9px] text-stone mt-1">
                  {item.value > 0 && arr[i - 1]?.value > 0
                    ? `${Math.round((item.value / arr[i - 1].value) * 100)}%`
                    : "—"}
                </p>
              )}
            </div>
          ))}
          {/* Rates */}
          <div className="flex flex-col items-center justify-center gap-2">
            <RateDisplay rate={kpis.connectRate} label="Connect" />
            <RateDisplay rate={kpis.replyRate} label="Reply" />
          </div>
        </div>
      </div>

      {/* Daily Performance chart (simplified bar view) */}
      {data?.dailyPerformance && data.dailyPerformance.length > 0 && (
        <div className="clean-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone">Daily Performance</h3>
            <p className="text-[10px] text-stone mt-0.5">Lead generation across the selected period</p>
          </div>
          <div className="p-6">
            <div className="flex items-end gap-1 h-32">
              {data.dailyPerformance.slice(-30).map((day, i) => {
                const maxVal = Math.max(...data.dailyPerformance.map((d) => d.discovered + d.invited), 1);
                const h = ((day.discovered + day.invited) / maxVal) * 100;
                return (
                  <div
                    key={day.date}
                    className="flex-1 min-w-0 group relative"
                    title={`${day.date}: ${day.discovered} discovered, ${day.invited} invited`}
                  >
                    <div
                      className="w-full bg-gradient-to-t from-violet-500/30 to-violet-400/10 rounded-t-sm hover:from-violet-500/50 hover:to-violet-400/20 transition-all"
                      style={{ height: `${Math.max(h, 2)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[9px] text-stone">
                {new Date(data.dailyPerformance[Math.max(0, data.dailyPerformance.length - 30)].date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
              <span className="text-[9px] text-stone">
                {new Date(data.dailyPerformance[data.dailyPerformance.length - 1].date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* By Campaign table */}
      {data?.byCampaign && data.byCampaign.length > 0 && (
        <div className="clean-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone">Campaign Performance</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60">
                  {["Campaign", "Leads", "Sent", "Accepted", "Replied", "Connect %", "Reply %"].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-[9px] font-medium uppercase tracking-[0.2em] text-stone">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.byCampaign.map((row, index) => (
                  <tr
                    key={row.campaignId || `${row.campaignName}-${index}`}
                    className="border-b border-border/60 hover:bg-muted/20"
                  >
                    <td className="px-6 py-3 text-sm text-foreground">{row.campaignName}</td>
                    <td className="px-6 py-3 text-sm text-muted-foreground">{row.totalLeads}</td>
                    <td className="px-6 py-3 text-sm text-muted-foreground">{row.sent}</td>
                    <td className="px-6 py-3 text-sm text-muted-foreground">{row.accepted}</td>
                    <td className="px-6 py-3 text-sm text-muted-foreground">{row.replied}</td>
                    <td className="px-6 py-3">
                      <span className={cn("text-sm font-medium", row.connectRate >= 30 ? "text-success" : "text-muted-foreground")}>
                        {row.connectRate}%
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className={cn("text-sm font-medium", row.replyRate >= 15 ? "text-success" : "text-muted-foreground")}>
                        {row.replyRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Signal Performance */}
      {data?.bySignal && data.bySignal.length > 0 && (
        <div className="clean-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone">Signal Performance</h3>
            <p className="text-[10px] text-stone mt-0.5">Total leads generated per signal</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60">
                  {["Signal", "Type", "Leads Generated"].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-[9px] font-medium uppercase tracking-[0.2em] text-stone">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.bySignal.map((row, i) => (
                  <tr key={i} className="border-b border-border/60 hover:bg-muted/20">
                    <td className="px-6 py-3 text-sm text-foreground">{row.signal}</td>
                    <td className="px-6 py-3">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/40 border border-border text-muted-foreground">
                        {row.type.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm font-medium text-foreground">{row.leadsGenerated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
