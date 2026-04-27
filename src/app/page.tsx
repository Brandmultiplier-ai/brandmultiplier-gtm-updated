"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Flame,
  Send,
  MessageSquare,
  ArrowRight,
  Linkedin,
  Loader2,
  Target,
  Rocket,
  Zap,
  CalendarClock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Claudio } from "@/components/claudio";

// ── Types ──────────────────────────────────────────────────────────────

interface DashboardData {
  stats: {
    totalContacted: number;
    totalDiscovered: number;
    totalSent: number;
    totalAccepted: number;
    totalReplied: number;
    totalPending: number;
    activeAgents: number;
    activeCampaigns: number;
    connectRate: number;
    replyRate: number;
  };
  recentLeads: Array<{
    name: string;
    headline: string;
    status: string;
    aiScore: number;
    segment: string;
    profilePictureUrl?: string;
  }>;
  repliedLeads: Array<{
    name: string;
    profilePictureUrl?: string;
    events: Array<{ type: string; message?: string; ts: string }>;
  }>;
  campaigns: Array<{
    name: string;
    status: string;
    stats: { totalLeads: number; sent: number; connectRate: number; replyRate: number };
  }>;
  activityTimeline?: Array<{
    date: string;
    discovered: number;
    invited: number;
    messaged: number;
    accepted: number;
    replied: number;
  }>;
  nextActions?: {
    pendingFollowUp: number;
    pendingInvites: number;
    weeklyInvites: number;
    weeklyLimit: number;
    dailyLimit: number;
    weeklyRemaining: number;
    nextRunAt: string;
  };
}

// ── Components ─────────────────────────────────────────────────────────

function FireScore({ score }: { score: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: 3 }).map((_, i) => (
        <Flame
          key={i}
          className={`size-3.5 ${
            i < score ? "text-brand fill-brand" : "text-muted-foreground/30"
          }`}
        />
      ))}
    </span>
  );
}

function LeadAvatar({ name, pictureUrl, size = "md" }: { name: string; pictureUrl?: string; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "size-9" : "size-10";
  const initials = name.split(" ").map((n) => n[0]).join("");

  if (pictureUrl) {
    return (
      <img
        src={pictureUrl}
        alt={name}
        className={`${sizeClass} rounded-full object-cover border border-border`}
      />
    );
  }

  return (
    <div className={`${sizeClass} rounded-full bg-muted/40 border border-border flex items-center justify-center text-xs font-medium text-muted-foreground`}>
      {initials}
    </div>
  );
}

function MiniChart({ data, color, maxVal }: { data: number[]; color: string; maxVal: number }) {
  const h = 40;
  const w = 100;
  const max = Math.max(maxVal, 1);
  const points = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(" ")}
      />
      <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.15" />
        <stop offset="100%" stopColor={color} stopOpacity="0" />
      </linearGradient>
      <polygon
        fill={`url(#grad-${color})`}
        points={`0,${h} ${points.join(" ")} ${w},${h}`}
      />
    </svg>
  );
}

function ActivityChart({ timeline }: { timeline: DashboardData["activityTimeline"] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  if (!timeline || timeline.length === 0) return null;

  // Real-coordinate viewBox so strokes don't get distorted
  const W = 1200;
  const H = 280;
  const padTop = 20;
  const padBottom = 32;
  const padLeft = 44;
  const padRight = 16;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;

  const n = timeline.length;
  const rawMax = Math.max(
    ...timeline.map((d) => Math.max(d.discovered, d.invited, d.messaged)),
    1
  );

  // "Nice" axis: round up max to nearest 10/50/100/500 etc
  function niceMax(v: number) {
    if (v <= 5) return 5;
    if (v <= 10) return 10;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const norm = v / pow;
    let nice;
    if (norm <= 1) nice = 1;
    else if (norm <= 2) nice = 2;
    else if (norm <= 5) nice = 5;
    else nice = 10;
    return nice * pow;
  }
  const maxVal = niceMax(rawMax);
  const ticks = 4;

  function getX(i: number) {
    return padLeft + (i / Math.max(n - 1, 1)) * innerW;
  }
  function getY(val: number) {
    return padTop + (1 - val / maxVal) * innerH;
  }

  // Cubic bezier smoothed path (Catmull-Rom-ish), with control-point clamping
  // so the curve can never overshoot above max or below 0 (baseline).
  const minY = padTop;
  const maxY = padTop + innerH;
  const clampY = (v: number) => Math.max(minY, Math.min(maxY, v));

  function smoothPath(key: "discovered" | "invited" | "messaged") {
    const pts = timeline!.map((d, i) => [getX(i), getY(d[key])] as const);
    if (pts.length === 0) return "";
    if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;
    let path = `M ${pts[0][0]} ${pts[0][1]}`;
    const tension = 0.22; // softer than 0.35 → fewer overshoots near zeros
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) * tension;
      const c1y = clampY(p1[1] + (p2[1] - p0[1]) * tension);
      const c2x = p2[0] - (p3[0] - p1[0]) * tension;
      const c2y = clampY(p2[1] - (p3[1] - p1[1]) * tension);
      path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
    }
    return path;
  }

  function smoothArea(key: "discovered" | "invited" | "messaged") {
    const line = smoothPath(key);
    const lastX = getX(n - 1);
    const baseY = padTop + innerH;
    const firstX = getX(0);
    return `${line} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!chartRef.current) return;
    const rect = chartRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left - (padLeft / W) * rect.width) / ((innerW / W) * rect.width);
    const idx = Math.round(relX * (n - 1));
    setHoverIdx(Math.max(0, Math.min(n - 1, idx)));
  }

  const hoverData = hoverIdx !== null ? timeline[hoverIdx] : null;
  const hoverX = hoverIdx !== null ? getX(hoverIdx) : 0;

  // Date labels: show every ~5 days
  const labelStep = Math.max(1, Math.floor(n / 8));

  // Y axis ticks (e.g. 0, 10, 20, 30, 40)
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => Math.round((maxVal / ticks) * i));

  return (
    <div className="clean-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-ui text-[10px] font-medium uppercase tracking-[0.2em] text-stone">Activity Overview</h3>
          <p className="font-ui text-[11px] text-stone mt-1">Track relationships, follow-ups, and outreach momentum</p>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-success" />
            <span className="text-[11px] text-stone">Leads created</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-coral" />
            <span className="text-[11px] text-stone">Invitations sent</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-brand" />
            <span className="text-[11px] text-stone">Messages sent</span>
          </div>
        </div>
      </div>

      {/* Chart area */}
      <div className="px-6 pt-4 pb-2 relative" ref={chartRef} onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)}>
        {/* Tooltip */}
        {hoverData && hoverIdx !== null && (
          <div
            className="absolute z-20 pointer-events-none"
            style={{
              left: `${(hoverX / W) * 100}%`,
              top: 8,
              transform:
                (hoverX / W) > 0.7 ? "translateX(-100%)" : (hoverX / W) < 0.2 ? "translateX(0)" : "translateX(-50%)",
            }}
          >
            <div className="bg-popover border border-border rounded-lg px-4 py-3 shadow-xl min-w-[200px]">
              <p className="font-ui text-xs font-medium text-foreground mb-2.5">
                {new Date(hoverData.date).toLocaleDateString("en-US", { day: "numeric", month: "long" })}
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-6">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-success" />
                    <span className="font-ui text-[11px] text-muted-foreground">Leads created</span>
                  </div>
                  <span className="font-ui text-sm font-semibold text-foreground">{hoverData.discovered}</span>
                </div>
                <div className="flex items-center justify-between gap-6">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-coral" />
                    <span className="font-ui text-[11px] text-muted-foreground">Invitations sent</span>
                  </div>
                  <span className="font-ui text-sm font-semibold text-foreground">{hoverData.invited}</span>
                </div>
                <div className="flex items-center justify-between gap-6">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-brand" />
                    <span className="font-ui text-[11px] text-muted-foreground">Messages sent</span>
                  </div>
                  <span className="font-ui text-sm font-semibold text-foreground">{hoverData.messaged}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
          {/* Y-axis grid lines + labels */}
          {yTicks.map((tick) => {
            const y = getY(tick);
            return (
              <g key={tick}>
                <line
                  x1={padLeft} y1={y}
                  x2={W - padRight} y2={y}
                  stroke="var(--border-warm)" strokeOpacity="0.6" strokeWidth="1"
                />
                <text
                  x={padLeft - 10} y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--stone-gray)"
                  fontFamily="var(--font-body), system-ui"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Area fills */}
          <defs>
            <linearGradient id="grad-discovered" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--success-warm)" stopOpacity="0.20" />
              <stop offset="100%" stopColor="var(--success-warm)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="grad-invited" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--coral)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--coral)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="grad-messaged" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>

          <path d={smoothArea("discovered")} fill="url(#grad-discovered)" />
          <path d={smoothArea("invited")} fill="url(#grad-invited)" />
          <path d={smoothArea("messaged")} fill="url(#grad-messaged)" />

          {/* Smooth lines */}
          <path d={smoothPath("discovered")} fill="none" stroke="var(--success-warm)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d={smoothPath("invited")} fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d={smoothPath("messaged")} fill="none" stroke="var(--brand-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {/* Hover vertical line + dots */}
          {hoverIdx !== null && hoverData && (
            <>
              <line
                x1={hoverX} y1={padTop} x2={hoverX} y2={padTop + innerH}
                stroke="var(--olive-gray)" strokeOpacity="0.4" strokeWidth="1" strokeDasharray="3,3"
              />
              <circle cx={hoverX} cy={getY(hoverData.discovered)} r="4" fill="var(--success-warm)" stroke="var(--ivory)" strokeWidth="1.5" />
              <circle cx={hoverX} cy={getY(hoverData.invited)} r="4" fill="var(--coral)" stroke="var(--ivory)" strokeWidth="1.5" />
              <circle cx={hoverX} cy={getY(hoverData.messaged)} r="4" fill="var(--brand-primary)" stroke="var(--ivory)" strokeWidth="1.5" />
            </>
          )}
        </svg>
      </div>

      {/* Date labels row below chart */}
      <div className="px-6 pb-4 flex justify-between" style={{ paddingLeft: `${(padLeft / W) * 100 + 1.5}%`, paddingRight: `${(padRight / W) * 100 + 1.5}%` }}>
        {timeline.map((d, i) => {
          const show = i % labelStep === 0 || i === n - 1;
          const isHovered = i === hoverIdx;
          if (!show && !isHovered) return <span key={d.date} className="flex-1" />;
          const label = new Date(d.date).toLocaleDateString("en-US", { day: "numeric", month: "short" });
          return (
            <span
              key={d.date}
              className={`font-ui text-[10px] flex-1 text-center ${
                isHovered
                  ? "text-foreground font-medium bg-muted/60 rounded px-1.5 py-0.5 -mt-0.5"
                  : "text-stone"
              }`}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────

type PeriodOption = "7d" | "30d" | "3m" | "current";
const periodLabels: Record<PeriodOption, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "3m": "Last 3 months",
  "current": "Current month",
};

const DEAL_SIZE_STORAGE_KEY = "brandmultiplier-gtm:dealSize";

function formatPipelineValue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}K`;
  return `$${value.toLocaleString("en-US")}`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodOption>("30d");
  const [dealSize, setDealSize] = useState<number>(0);
  const [editingDealSize, setEditingDealSize] = useState(false);
  const [dealSizeDraft, setDealSizeDraft] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(DEAL_SIZE_STORAGE_KEY);
    if (stored) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed) && parsed >= 0) setDealSize(parsed);
    }
  }, []);

  function commitDealSize() {
    const next = Math.max(0, Math.floor(Number(dealSizeDraft) || 0));
    setDealSize(next);
    setEditingDealSize(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DEAL_SIZE_STORAGE_KEY, String(next));
    }
  }

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard?period=${period}`)
      .then((r) => r.json())
      .then((dashboard) => setData(dashboard))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = data?.stats || {
    totalContacted: 0,
    totalDiscovered: 0,
    totalSent: 0,
    totalAccepted: 0,
    totalReplied: 0,
    totalPending: 0,
    activeAgents: 0,
    activeCampaigns: 0,
    connectRate: 0,
    replyRate: 0,
  };

  const nextActions = data?.nextActions;

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between mb-2">
        <div className="flex items-center gap-4">
          <Claudio size={56} mood="wave" />
          <div>
            <h2 className="text-3xl font-medium tracking-[-0.04em] text-gradient">Welcome back</h2>
            <div className="text-sm text-stone mt-1 flex items-center gap-2 flex-wrap">
              {dealSize > 0 ? (
                <>
                  <span>
                    Your outreach has generated{" "}
                    <span className="text-foreground font-medium">{formatPipelineValue(dealSize * stats.totalReplied)}</span>{" "}
                    of pipeline ({stats.totalReplied} {stats.totalReplied === 1 ? "reply" : "replies"} × {formatPipelineValue(dealSize)})
                  </span>
                  {!editingDealSize && (
                    <button
                      type="button"
                      onClick={() => { setDealSizeDraft(String(dealSize)); setEditingDealSize(true); }}
                      className="font-ui text-[10px] uppercase tracking-[0.18em] text-terracotta hover:text-foreground transition-colors"
                    >
                      Edit
                    </button>
                  )}
                </>
              ) : (
                !editingDealSize && (
                  <button
                    type="button"
                    onClick={() => { setDealSizeDraft(""); setEditingDealSize(true); }}
                    className="font-ui text-[10px] uppercase tracking-[0.18em] text-terracotta hover:text-foreground transition-colors"
                  >
                    Set partnership value to estimate pipeline →
                  </button>
                )
              )}
              {editingDealSize && (
                <span className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-card px-2 py-1">
                  <span className="text-foreground font-medium">$</span>
                  <input
                    autoFocus
                    type="number"
                    min={0}
                    placeholder="5000"
                    value={dealSizeDraft}
                    onChange={(e) => setDealSizeDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitDealSize();
                      if (e.key === "Escape") setEditingDealSize(false);
                    }}
                    onBlur={commitDealSize}
                    className="w-20 bg-transparent outline-none text-foreground text-xs"
                  />
                  <span className="text-stone text-[10px]">per deal</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodOption)}
            className="bg-muted/40 border border-border rounded-lg px-3 py-1.5 text-[11px] text-muted-foreground focus:outline-none cursor-pointer"
          >
            {Object.entries(periodLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <Link href="/agent" title="Manage agents">
            <Badge variant="outline" className="gap-2 py-1.5 px-4 bg-transparent border-border rounded-full hover:border-brand/40 hover:bg-brand/5 transition-colors cursor-pointer">
              <span className={`size-2 rounded-full ${stats.activeAgents > 0 ? "bg-success" : "bg-warning"} animate-pulse`} />
              <span className="font-ui text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{stats.activeAgents} Active Agent{stats.activeAgents !== 1 ? "s" : ""}</span>
            </Badge>
          </Link>
          <Link href="/settings?tab=linkedin" title="LinkedIn seat settings">
            <Badge variant="outline" className="gap-2 py-1.5 px-4 bg-transparent border-border rounded-full hover:border-brand/40 hover:bg-brand/5 transition-colors cursor-pointer">
              <Linkedin className="size-3.5 text-[#0077B5]" />
              <span className="font-ui text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">LinkedIn Connected</span>
            </Badge>
          </Link>
        </div>
      </div>

      {/* Next Actions + KPI Row */}
      <div className="grid grid-cols-5 gap-5">
        {/* Next Actions card */}
        {nextActions && (
          <div className="clean-card p-6 group">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="font-ui text-[10px] font-medium uppercase tracking-[0.2em] text-stone">Next Actions</p>
                <div className="size-8 rounded-lg bg-brand/15 flex items-center justify-center">
                  <Zap className="size-4 text-brand" />
                </div>
              </div>
              <div className="space-y-2.5 mt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Follow-ups pending</span>
                  <span className="text-sm font-medium text-foreground">{nextActions.pendingFollowUp}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Invites pending</span>
                  <span className="text-sm font-medium text-foreground">{nextActions.pendingInvites}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Week {nextActions.weeklyInvites}/{nextActions.weeklyLimit}</span>
                  <div className="w-16 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-success/60 to-success/80 rounded-full"
                      style={{ width: `${Math.min(100, (nextActions.weeklyInvites / nextActions.weeklyLimit) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-1 pt-2 border-t border-border/60">
                <CalendarClock className="size-3 text-stone" />
                <span className="text-[9px] text-stone">
                  Next run: {new Date(nextActions.nextRunAt).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })} 09:00
                </span>
              </div>
            </div>
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand to-transparent opacity-0 group-hover:opacity-30 transition-opacity duration-300" />
          </div>
        )}

        {/* KPI cards */}
        {[
          { label: "Discovered", value: stats.totalDiscovered, icon: Target, detail: "Total pipeline" },
          { label: "Contacted", value: stats.totalContacted, icon: Send, detail: `${stats.totalDiscovered > 0 ? Math.round((stats.totalContacted / stats.totalDiscovered) * 100) : 0}% of pipeline` },
          { label: "Accepted", value: stats.totalAccepted, icon: Rocket, detail: `${stats.connectRate}% connect rate` },
          { label: "Replied", value: stats.totalReplied, icon: MessageSquare, detail: `${stats.replyRate}% reply rate` },
        ].map((item, i) => (
          <div key={i} className="clean-card p-6 group">
            <div className="flex flex-col gap-4">
              <p className="font-ui text-[10px] font-medium uppercase tracking-[0.2em] text-stone">{item.label}</p>
              <p className="text-[40px] leading-none font-medium stat-glow text-foreground">{item.value}</p>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{item.detail}</p>
                <div className="size-8 rounded-lg bg-muted/40 flex items-center justify-center">
                  <item.icon className="size-4 text-stone" />
                </div>
              </div>
            </div>
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand to-transparent opacity-0 group-hover:opacity-30 transition-opacity duration-300" />
          </div>
        ))}
      </div>

      {/* Activity Chart */}
      <ActivityChart timeline={data?.activityTimeline} />

      {/* Bottom row */}
      <div className="grid grid-cols-2 gap-6">
        {/* Latest Hot Leads */}
        <div className="clean-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Flame className="size-4 text-stone" />
              <h3 className="font-ui text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Latest High-Intent Leads</h3>
            </div>
            <Link href="/leads">
              <Button variant="ghost" size="sm" className="font-ui hover:bg-muted/40 text-[10px] uppercase tracking-[0.18em] text-stone gap-1.5 h-7">
                View More <ArrowRight className="size-3" />
              </Button>
            </Link>
          </div>
          <div className="p-6">
            {(data?.recentLeads?.length || 0) > 0 ? (
              <div className="space-y-5">
                {data!.recentLeads.slice(0, 5).map((lead, i) => (
                  <div key={i} className="flex items-center justify-between group cursor-default">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <LeadAvatar name={lead.name} pictureUrl={lead.profilePictureUrl} />
                        <div className="absolute -bottom-1 -right-1 size-4 rounded-full bg-[#0077B5] border-2 border-background flex items-center justify-center">
                          <Linkedin className="size-2 text-white" />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground group-hover:text-terracotta transition-colors">{lead.name}</p>
                        <p className="text-[10px] text-stone uppercase tracking-wide">{lead.headline.substring(0, 40)}...</p>
                      </div>
                    </div>
                    <FireScore score={lead.aiScore} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Claudio size={48} mood="thinking" />
                <p className="text-base text-foreground">No hot leads yet</p>
                <p className="font-ui text-xs text-stone">Claudio is still scouting</p>
              </div>
            )}
          </div>
        </div>

        {/* Latest Replies */}
        <div className="clean-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="size-4 text-stone" />
              <h3 className="font-ui text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Latest Replies</h3>
            </div>
            <Link href="/events">
              <Button variant="ghost" size="sm" className="font-ui hover:bg-muted/40 text-[10px] uppercase tracking-[0.18em] text-stone gap-1.5 h-7">
                Open Inbox <ArrowRight className="size-3" />
              </Button>
            </Link>
          </div>
          <div className="p-6">
            {(data?.repliedLeads?.length || 0) > 0 ? (
              <div className="space-y-5">
                {data!.repliedLeads.slice(0, 5).map((lead, i) => {
                  const replyEvent = [...lead.events].reverse().find((e) => e.type === "replied");
                  const timeAgo = replyEvent ? formatTimeAgo(replyEvent.ts) : "";
                  return (
                    <div key={i} className="flex items-start gap-4 group cursor-default">
                      <div className="shrink-0 mt-0.5">
                        <LeadAvatar name={lead.name} pictureUrl={lead.profilePictureUrl} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-foreground group-hover:text-terracotta transition-colors">{lead.name}</p>
                          <span className="text-[9px] text-stone uppercase tracking-wide shrink-0 ml-2">{timeAgo}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/70 line-clamp-2 mt-1 italic">
                          &ldquo;{replyEvent?.message || "Replied to your message"}&rdquo;
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Claudio size={48} mood="thinking" />
                <p className="text-base text-foreground">No replies yet</p>
                <p className="font-ui text-xs text-stone">When prospects reply, they show up here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

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
