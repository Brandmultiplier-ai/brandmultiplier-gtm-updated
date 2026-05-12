"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Settings,
  Users2,
  Building2,
  User,
  Linkedin,
  Shield,
  FileText,
  CreditCard,
  Code,
  Plus,
  Pencil,
  Trash2,
  Send,
  Loader2,
  Save,
  X,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Copy,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, type WorkspaceSummary } from "@/stores/app-store";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Types ──────────────────────────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  content: string;
  language: "it" | "en";
  type: "connection_request" | "message";
  step: number;
}

interface SeatActiveDays {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
}

interface SeatWarmup {
  enabled: boolean;
  rampEveryDays: number;
  startedAt?: string;
  lastRateLimitedAt?: string;
}

interface WarmupState {
  enabled: boolean;
  stage: number;
  totalStages: number;
  factor: number;
  cleanDays: number;
  rampEveryDays: number;
  startedAt?: string;
  lastRateLimitedAt?: string;
  nextRampAt?: string;
  statusLabel: string;
  effectiveQuotas: {
    profileLookupsPerWeek: number;
    invitationsPerWeek: number;
    messagesPerWeek: number;
  };
}

type SeatPreview = {
  effectiveQuotas: WarmupState["effectiveQuotas"];
  effectiveDailyQuotas: NonNullable<LinkedInSeat["effectiveDailyQuotas"]>;
  warmupState: WarmupState;
};

interface LinkedInSeat {
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
    activeDays: SeatActiveDays;
    warmup: SeatWarmup;
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
  warmupState?: WarmupState;
}

function seatActiveDaysCount(seat: LinkedInSeat) {
  return Object.values(seat.schedule.activeDays).filter(Boolean).length || 5;
}

function quotaPerDay(totalPerWeek: number, activeDays: number) {
  if (totalPerWeek <= 0) return 0;
  return Math.max(1, Math.round(totalPerWeek / Math.max(1, activeDays)));
}

function formatShortDateTime(iso: string | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const WARMUP_STAGE_FACTORS = [0.3, 0.5, 0.75, 1] as const;

function dayKeyToIso(dayKey: string | undefined) {
  return dayKey ? `${dayKey}T00:00:00.000Z` : new Date().toISOString();
}

function applyWarmupFactor(total: number, factor: number) {
  if (total <= 0) return 0;
  return Math.max(1, Math.round(total * factor));
}

function computeSeatPreview(seat: LinkedInSeat): SeatPreview {
  const targetQuotas = seat.quotas;
  const activeDays = seatActiveDaysCount(seat);
  const warmup = seat.schedule.warmup;

  if (!warmup?.enabled) {
    const effectiveQuotas = { ...targetQuotas };
    return {
      effectiveQuotas,
      effectiveDailyQuotas: {
        invitationsPerDay: quotaPerDay(effectiveQuotas.invitationsPerWeek, activeDays),
        messagesPerDay: quotaPerDay(effectiveQuotas.messagesPerWeek, activeDays),
        profileLookupsPerDay: quotaPerDay(effectiveQuotas.profileLookupsPerWeek, activeDays),
      },
      warmupState: {
        enabled: false,
        stage: WARMUP_STAGE_FACTORS.length,
        totalStages: WARMUP_STAGE_FACTORS.length,
        factor: 1,
        cleanDays: 0,
        rampEveryDays: warmup?.rampEveryDays || 2,
        startedAt: warmup?.startedAt,
        lastRateLimitedAt: warmup?.lastRateLimitedAt,
        statusLabel: "Manual target",
        effectiveQuotas,
      },
    };
  }

  const anchorCandidates = [
    warmup.startedAt,
    warmup.lastRateLimitedAt,
  ].filter((value): value is string => typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value)));
  const anchorIso = anchorCandidates.length > 0
    ? anchorCandidates.sort((a, b) => Date.parse(b) - Date.parse(a))[0]
    : dayKeyToIso(seat.usage.weekKey);
  const cleanDays = Math.max(0, Math.floor((Date.now() - Date.parse(anchorIso)) / (1000 * 60 * 60 * 24)));
  const rampEveryDays = Math.max(1, Math.min(7, warmup.rampEveryDays || 2));
  const stage = Math.min(WARMUP_STAGE_FACTORS.length, Math.floor(cleanDays / rampEveryDays) + 1);
  const factor = WARMUP_STAGE_FACTORS[stage - 1];
  const effectiveQuotas = {
    profileLookupsPerWeek: applyWarmupFactor(targetQuotas.profileLookupsPerWeek, factor),
    invitationsPerWeek: applyWarmupFactor(targetQuotas.invitationsPerWeek, factor),
    messagesPerWeek: applyWarmupFactor(targetQuotas.messagesPerWeek, factor),
  };

  return {
    effectiveQuotas,
    effectiveDailyQuotas: {
      invitationsPerDay: quotaPerDay(effectiveQuotas.invitationsPerWeek, activeDays),
      messagesPerDay: quotaPerDay(effectiveQuotas.messagesPerWeek, activeDays),
      profileLookupsPerDay: quotaPerDay(effectiveQuotas.profileLookupsPerWeek, activeDays),
    },
    warmupState: {
      enabled: true,
      stage,
      totalStages: WARMUP_STAGE_FACTORS.length,
      factor,
      cleanDays,
      rampEveryDays,
      startedAt: warmup.startedAt || anchorIso,
      lastRateLimitedAt: warmup.lastRateLimitedAt,
      nextRampAt: stage < WARMUP_STAGE_FACTORS.length
        ? new Date(Date.parse(anchorIso) + rampEveryDays * stage * 24 * 60 * 60 * 1000).toISOString()
        : undefined,
      statusLabel: `Stage ${stage}/${WARMUP_STAGE_FACTORS.length}`,
      effectiveQuotas,
    },
  };
}

// ── Tab config ─────────────────────────────────────────────────────────

const tabs = [
  { id: "templates", label: "AI Templates", icon: FileText },
  { id: "organization", label: "Organization", icon: Users2 },
  { id: "company", label: "Company", icon: Building2 },
  { id: "account", label: "Account", icon: User },
  { id: "linkedin", label: "LinkedIn Accounts", icon: Linkedin },
] as const;

/** Prefill when no LinkedIn URL is stored — change for other deployments */
const DEFAULT_OWNER_LINKEDIN_URL = "https://www.linkedin.com/in/sivasish48";

type TabId = (typeof tabs)[number]["id"];

// ── Main Page ──────────────────────────────────────────────────────────

function isTabId(value: string | null): value is TabId {
  return !!value && tabs.some((tab) => tab.id === value);
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-screen-2xl space-y-6" />}>
      <SettingsPageContent />
    </Suspense>
  );
}

function SettingsPageContent() {
  const searchParams = useSearchParams();
  const initialTab = isTabId(searchParams.get("tab")) ? (searchParams.get("tab") as TabId) : "templates";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-medium tracking-[-0.04em] text-gradient">Settings</h2>
        <p className="text-sm text-stone mt-1">Manage your account and preferences</p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-all",
              activeTab === tab.id
                ? "border-orange-500 text-foreground"
                : "border-transparent text-stone hover:text-muted-foreground"
            )}
          >
            <tab.icon className="size-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "templates" && <AITemplatesTab />}
      {activeTab === "organization" && <OrganizationTab />}
      {activeTab === "company" && <CompanyProfileTab />}
      {activeTab === "account" && <AccountProfileTab />}
      {activeTab === "linkedin" && <LinkedInAccountsTab />}
    </div>
  );
}

type ReadinessPayload = {
  ok: boolean;
  storage: {
    configuredMode: string | null;
    activeMode: "supabase" | "local";
    supabaseDetected: boolean;
    supabaseEnabledFlag: boolean;
    hasSupabaseUrl: boolean;
    hasServiceRoleKey: boolean;
    localForced: boolean;
    warning: string | null;
  };
  checks: {
    openRouterApiKey: boolean;
    unipileApiKey: boolean;
    unipileBaseUrl: boolean;
    unipileAccountId: boolean;
    webhookSecret: boolean;
    cronSecret: boolean;
    supabaseUrl: boolean;
    supabaseServiceRoleKey: boolean;
    supabaseStorage: boolean;
    seatsConfigured: boolean;
    connectedSeats: number;
    providerConnections: number;
  };
  readiness: {
    openRouterReady: boolean;
    unipileReady: boolean;
    automationReady: boolean;
    storageReady: boolean;
    seatReady: boolean;
  };
  nextSteps: string[];
};

function ReadinessItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]",
        ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
      )}>
        {ok ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
        {ok ? "Ready" : "Missing"}
      </span>
    </div>
  );
}

function IntegrationReadinessCard() {
  const [payload, setPayload] = useState<ReadinessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadReadiness() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/readiness");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Failed to load integration checks");
      }
      setPayload(body as ReadinessPayload);
    } catch (readinessError) {
      setError(readinessError instanceof Error ? readinessError.message : "Failed to load integration checks");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReadiness();
  }, []);

  return (
    <div className="clean-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-medium text-foreground">Integration Readiness</h3>
          <p className="text-[11px] text-stone mt-1">
            Quick status for OpenRouter + Unipile + automation secrets.
          </p>
        </div>
        <button
          onClick={() => { void loadReadiness(); }}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/30 disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {payload ? (
        <>
          {payload.storage.warning ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-3 text-xs text-warning">
              <p className="font-medium text-foreground">Storage warning</p>
              <p className="mt-1">{payload.storage.warning}</p>
            </div>
          ) : null}
          <div className="grid gap-2 md:grid-cols-2">
            <ReadinessItem label={`Storage backend: ${payload.storage.activeMode}`} ok={payload.checks.supabaseStorage} />
            <ReadinessItem label="Supabase URL" ok={payload.checks.supabaseUrl} />
            <ReadinessItem label="Supabase service role" ok={payload.checks.supabaseServiceRoleKey} />
            <ReadinessItem label="OpenRouter API key" ok={payload.checks.openRouterApiKey} />
            <ReadinessItem label="Unipile API key" ok={payload.checks.unipileApiKey} />
            <ReadinessItem label="Unipile base URL" ok={payload.checks.unipileBaseUrl} />
            <ReadinessItem label="Unipile account ID" ok={payload.checks.unipileAccountId} />
            <ReadinessItem label="Webhook secret" ok={payload.checks.webhookSecret} />
            <ReadinessItem label="Cron secret" ok={payload.checks.cronSecret} />
            <ReadinessItem label="LinkedIn seats connected" ok={payload.checks.connectedSeats > 0} />
            <ReadinessItem label="Provider connection record" ok={payload.checks.providerConnections > 0} />
          </div>
          {payload.nextSteps.length > 0 ? (
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Next actions</p>
              <ul className="mt-2 space-y-1 text-xs text-foreground">
                {payload.nextSteps.map((step) => (
                  <li key={step}>- {step}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
              All integration checks look good.
            </div>
          )}
        </>
      ) : loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Running checks...
        </div>
      ) : null}
    </div>
  );
}

function LinkedInAccountsTab() {
  const [seats, setSeats] = useState<LinkedInSeat[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = seats.find((seat) => seat.id === selectedId) || seats[0] || null;
  const selectedPreview = selected ? computeSeatPreview(selected) : null;

  useEffect(() => {
    fetch("/api/linkedin-seats")
      .then((response) => response.json())
      .then((data) => {
        const nextSeats = (data.seats || []) as LinkedInSeat[];
        setSeats(nextSeats);
        setSelectedId(nextSeats[0]?.id || "");
      })
      .catch(() => setError("Failed to load LinkedIn seats"))
      .finally(() => setLoading(false));
  }, []);

  function updateSelected(mutator: (seat: LinkedInSeat) => LinkedInSeat) {
    if (!selected) return;
    setSeats((current) => current.map((seat) => seat.id === selected.id ? mutator(seat) : seat));
  }

  async function saveSeat() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/linkedin-seats/${encodeURIComponent(selected.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selected),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Failed to save LinkedIn seat");
      }

      const saved = body.seat as LinkedInSeat;
      setSeats((current) => current.map((seat) => seat.id === saved.id ? saved : seat));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save LinkedIn seat");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="clean-card p-12 text-center">
        <Linkedin className="size-10 mx-auto mb-4 text-stone opacity-20" />
        <h3 className="text-base font-medium text-foreground mb-2">No LinkedIn seat configured</h3>
        <p className="text-[11px] text-stone">Connect Unipile first to bootstrap a primary LinkedIn seat.</p>
      </div>
    );
  }

  const days = [
    ["monday", "Monday"],
    ["tuesday", "Tuesday"],
    ["wednesday", "Wednesday"],
    ["thursday", "Thursday"],
    ["friday", "Friday"],
    ["saturday", "Saturday"],
    ["sunday", "Sunday"],
  ] as const;

  return (
    <div className="space-y-6">
      <IntegrationReadinessCard />
      <div className="clean-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <Linkedin className="size-5 text-orange-400" />
            <div>
              <h3 className="text-lg font-medium text-foreground">LinkedIn Accounts ({seats.length})</h3>
              <p className="text-[11px] text-stone mt-1">Manage your LinkedIn sender seats and monitor their status.</p>
            </div>
          </div>
        </div>
        <div className="p-5 space-y-3">
          {seats.map((seat) => {
            const preview = computeSeatPreview(seat);
            const invitesPerDay = preview.effectiveDailyQuotas.invitationsPerDay;
            const messagesPerDay = preview.effectiveDailyQuotas.messagesPerDay;
            const selectedSeat = selected?.id === seat.id;

            return (
              <div
                key={seat.id}
                className={cn(
                  "rounded-2xl border px-4 py-4 transition-colors",
                  selectedSeat
                    ? "border-orange-500/20 bg-brand/[0.06]"
                    : "border-border bg-muted/20",
                )}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    {seat.profilePictureUrl ? (
                      <img
                        src={seat.profilePictureUrl}
                        alt={seat.profileName || seat.name}
                        className="size-11 rounded-full object-cover shrink-0 border border-border"
                      />
                    ) : (
                      <div className="size-11 rounded-full bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center text-sm font-bold text-white shrink-0">
                        {(seat.profileName || seat.name).charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="text-base font-medium text-foreground">{seat.name}</p>
                        <button
                          onClick={() => setSelectedId(seat.id)}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/30"
                        >
                          Settings & Limits
                        </button>
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand/10 px-2.5 py-1 text-xs text-orange-300 border border-orange-500/10">
                          <User className="size-3" /> {invitesPerDay}/day
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand/10 px-2.5 py-1 text-xs text-orange-300 border border-orange-500/10">
                          <Send className="size-3" /> {messagesPerDay}/day
                        </span>
                        {preview.warmupState.enabled && (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-coral/10 px-2.5 py-1 text-xs text-coral border border-coral/10">
                            Warmup {preview.warmupState.stage}/{preview.warmupState.totalStages}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-stone mt-1">
                        {seat.profileName ? `${seat.profileName} • ` : ""}
                        {seat.country || "No country set"} {seat.isDefault ? "• Default seat" : ""}
                        {preview.warmupState.enabled ? ` • Effective ${preview.effectiveQuotas.invitationsPerWeek}/${seat.quotas.invitationsPerWeek} invites/week` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm border",
                      seat.status === "active" && seat.unipileAccountId
                        ? "border-success/20 bg-success/10 text-success"
                        : "border-border bg-muted/40 text-stone",
                    )}>
                      {seat.status === "active" && seat.unipileAccountId ? "Connected" : "Paused"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="clean-card p-6 space-y-6">
          <div>
            <h3 className="text-base font-medium text-foreground">Update LinkedIn Sender</h3>
            <p className="text-[11px] text-stone mt-1">
              This seat uses your connected Unipile LinkedIn account and gates invites, messages and profile lookups.
            </p>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-lg text-xs text-destructive bg-destructive/10 border border-destructive/20">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Country</label>
            <input
              value={selected.country}
              onChange={(e) => updateSelected((seat) => ({ ...seat, country: e.target.value }))}
              className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-foreground focus:outline-none"
            />
            <p className="text-[11px] text-stone">Country information helps with localized LinkedIn activity planning.</p>
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-medium text-foreground">Target Weekly Quotas</h4>
              <p className="text-[11px] text-stone mt-1">Set the full target limits for this seat. Warmup, if enabled, will ramp progressively toward these targets.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Profile lookups / week</span>
                <input
                  type="number"
                  min={0}
                  value={selected.quotas.profileLookupsPerWeek}
                  onChange={(e) => updateSelected((seat) => ({
                    ...seat,
                    quotas: { ...seat.quotas, profileLookupsPerWeek: Number(e.target.value) || 0 },
                  }))}
                  className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-foreground focus:outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Invitations / week</span>
                <input
                  type="number"
                  min={0}
                  value={selected.quotas.invitationsPerWeek}
                  onChange={(e) => updateSelected((seat) => ({
                    ...seat,
                    quotas: { ...seat.quotas, invitationsPerWeek: Number(e.target.value) || 0 },
                  }))}
                  className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-foreground focus:outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Messages / week</span>
                <input
                  type="number"
                  min={0}
                  value={selected.quotas.messagesPerWeek}
                  onChange={(e) => updateSelected((seat) => ({
                    ...seat,
                    quotas: { ...seat.quotas, messagesPerWeek: Number(e.target.value) || 0 },
                  }))}
                  className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-foreground focus:outline-none"
                />
              </label>
            </div>
            <div className="rounded-xl border border-brand/15 bg-brand/10 px-4 py-3 text-[11px] text-brand">
              Start low on a recovering account. A conservative baseline is 20-35 invites/week, 50-80 messages/week, and 20-30 profile lookups/week.
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-medium text-foreground">Warmup</h4>
              <p className="text-[11px] text-stone mt-1">Auto-ramp this seat from a conservative stage to the full target quota, and reset after a provider rate limit.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
                <div>
                  <p className="text-sm text-foreground">Warmup enabled</p>
                  <p className="text-[11px] text-stone mt-1">Use progressive effective quotas instead of jumping straight to the full weekly target.</p>
                </div>
                <input
                  type="checkbox"
                  checked={selected.schedule.warmup.enabled}
                  onChange={(e) => updateSelected((seat) => ({
                    ...seat,
                    schedule: {
                      ...seat.schedule,
                      warmup: {
                        ...seat.schedule.warmup,
                        enabled: e.target.checked,
                        startedAt: e.target.checked
                          ? (seat.schedule.warmup.startedAt || new Date().toISOString())
                          : seat.schedule.warmup.startedAt,
                      },
                    },
                  }))}
                  className="accent-orange-500"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Ramp every X clean days</span>
                <input
                  type="number"
                  min={1}
                  max={7}
                  value={selected.schedule.warmup.rampEveryDays}
                  onChange={(e) => updateSelected((seat) => ({
                    ...seat,
                    schedule: {
                      ...seat.schedule,
                      warmup: {
                        ...seat.schedule.warmup,
                        rampEveryDays: Math.max(1, Math.min(7, Number(e.target.value) || 1)),
                      },
                    },
                  }))}
                  className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-foreground focus:outline-none"
                />
              </label>
            </div>

            <div className="rounded-xl border border-coral/15 bg-coral/5 p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <p className="text-sm font-medium text-foreground">
                    {selectedPreview?.warmupState.enabled ? selectedPreview.warmupState.statusLabel : "Warmup disabled"}
                  </p>
                  <p className="text-[11px] text-terracotta mt-1">
                    {selectedPreview?.warmupState.enabled
                      ? `${selectedPreview.warmupState.cleanDays} clean day(s), ${Math.round((selectedPreview.warmupState.factor || 1) * 100)}% of target quota active`
                      : "This seat is currently using the full target quota directly."}
                  </p>
                </div>
                {selectedPreview?.warmupState.enabled && (
                  <div className="text-right text-[11px] text-muted-foreground">
                    <p>Next ramp: {formatShortDateTime(selectedPreview.warmupState.nextRampAt)}</p>
                    <p>Last rate limit: {formatShortDateTime(selectedPreview.warmupState.lastRateLimitedAt)}</p>
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-3 mt-4">
                <div>
                  <p className="text-[11px] text-stone">Effective lookups / week</p>
                  <p className="text-lg font-medium text-foreground">
                    <span className="text-coral">{selectedPreview?.effectiveQuotas.profileLookupsPerWeek ?? selected.quotas.profileLookupsPerWeek}</span>
                    <span className="text-stone"> / {selected.quotas.profileLookupsPerWeek}</span>
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-stone">Effective invites / week</p>
                  <p className="text-lg font-medium text-foreground">
                    <span className="text-coral">{selectedPreview?.effectiveQuotas.invitationsPerWeek ?? selected.quotas.invitationsPerWeek}</span>
                    <span className="text-stone"> / {selected.quotas.invitationsPerWeek}</span>
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-stone">Effective messages / week</p>
                  <p className="text-lg font-medium text-foreground">
                    <span className="text-coral">{selectedPreview?.effectiveQuotas.messagesPerWeek ?? selected.quotas.messagesPerWeek}</span>
                    <span className="text-stone"> / {selected.quotas.messagesPerWeek}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-medium text-foreground">Launch Hour</h4>
              <p className="text-[11px] text-stone mt-1">Select when this seat should start daily activity.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Launch hour</span>
                <input
                  type="range"
                  min={0}
                  max={23}
                  value={selected.schedule.launchHour}
                  onChange={(e) => updateSelected((seat) => ({
                    ...seat,
                    schedule: { ...seat.schedule, launchHour: Number(e.target.value) || 0 },
                  }))}
                  className="w-full"
                />
                <p className="text-sm text-foreground">{selected.schedule.launchHour}:00 ({selected.schedule.timezone})</p>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Randomized window (hours)</span>
                <input
                  type="number"
                  min={0}
                  max={8}
                  value={selected.schedule.randomizedLaunchWindowHours}
                  onChange={(e) => updateSelected((seat) => ({
                    ...seat,
                    schedule: {
                      ...seat.schedule,
                      randomizedLaunchWindowHours: Math.max(0, Math.min(8, Number(e.target.value) || 0)),
                    },
                  }))}
                  className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-foreground focus:outline-none"
                />
                <p className="text-[11px] text-stone">Launch time is randomized within this window after the selected hour.</p>
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-medium text-foreground">Active Days</h4>
              <p className="text-[11px] text-stone mt-1">Choose the days when this seat can run LinkedIn activities.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {days.map(([key, label]) => (
                <label
                  key={key}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-3 text-sm transition-colors",
                    selected.schedule.activeDays[key]
                      ? "border-orange-500/30 bg-brand/6 text-foreground"
                      : "border-border text-stone",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.schedule.activeDays[key]}
                    onChange={(e) => updateSelected((seat) => ({
                      ...seat,
                      schedule: {
                        ...seat.schedule,
                        activeDays: { ...seat.schedule.activeDays, [key]: e.target.checked },
                      },
                    }))}
                    className="accent-orange-500"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-5">
            <h4 className="text-sm font-medium text-foreground mb-4">Current Usage This Week</h4>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-[11px] text-stone">Profile lookups</p>
                <p className="text-lg font-medium text-foreground">
                  <span className="text-success">{selected.usage.profileLookupsUsed}</span>
                  <span className="text-stone"> / {selectedPreview?.effectiveQuotas.profileLookupsPerWeek ?? selected.quotas.profileLookupsPerWeek}</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] text-stone">Invitations</p>
                <p className="text-lg font-medium text-foreground">
                  <span className={selected.usage.invitationsUsed >= (selectedPreview?.effectiveQuotas.invitationsPerWeek ?? selected.quotas.invitationsPerWeek) ? "text-destructive" : "text-success"}>
                    {selected.usage.invitationsUsed}
                  </span>
                  <span className="text-stone"> / {selectedPreview?.effectiveQuotas.invitationsPerWeek ?? selected.quotas.invitationsPerWeek}</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] text-stone">Messages</p>
                <p className="text-lg font-medium text-foreground">
                  <span className={selected.usage.messagesUsed >= (selectedPreview?.effectiveQuotas.messagesPerWeek ?? selected.quotas.messagesPerWeek) ? "text-destructive" : "text-success"}>
                    {selected.usage.messagesUsed}
                  </span>
                  <span className="text-stone"> / {selectedPreview?.effectiveQuotas.messagesPerWeek ?? selected.quotas.messagesPerWeek}</span>
                </p>
              </div>
            </div>
            <p className="text-[11px] text-stone mt-4">Prospecting runs today: {selected.usage.prospectingRunsToday}</p>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => updateSelected((seat) => ({ ...seat, status: seat.status === "active" ? "paused" : "active" }))}
              className="px-3 py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground border border-border rounded-lg"
            >
              {selected.status === "active" ? "Pause Seat" : "Resume Seat"}
            </button>
            <button
              onClick={saveSeat}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-medium uppercase tracking-[0.2em] disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Save Quotas
            </button>
          </div>
      </div>
    </div>
  );
}

// ── AI Templates Tab ───────────────────────────────────────────────────

function AITemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editLanguage, setEditLanguage] = useState<"it" | "en">("en");
  const [editType, setEditType] = useState<"connection_request" | "message">("message");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadTemplates() {
    setLoading(true);
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data) => {
        setTemplates((data.templates || []) as Template[]);
      })
      .catch(() => setError("Failed to load templates"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  function startEdit(template: Template) {
    setError(null);
    setEditing(template.id);
    setEditName(template.name);
    setEditContent(template.content);
    setEditLanguage(template.language);
    setEditType(template.type);
  }

  function cancelEdit() {
    setEditing(null);
    setCreating(false);
    setEditName("");
    setEditContent("");
    setEditLanguage("en");
    setEditType("message");
    setError(null);
  }

  function startCreate() {
    setCreating(true);
    setEditName("");
    setEditContent("");
    setEditLanguage("en");
    setEditType("message");
    setError(null);
  }

  async function saveCreate() {
    if (!editName.trim() || !editContent.trim()) {
      setError("Name and content are required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          content: editContent,
          language: editLanguage,
          type: editType,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Failed to create template");
      }
      cancelEdit();
      loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id: string) {
    if (!editName.trim() || !editContent.trim()) {
      setError("Name and content are required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          content: editContent,
          language: editLanguage,
          type: editType,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Failed to update template");
      }
      cancelEdit();
      loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update template");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Failed to delete template");
      }
      if (editing === id) cancelEdit();
      loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete template");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="clean-card p-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-base font-medium text-foreground">AI LinkedIn Templates</h3>
            <p className="text-[11px] text-stone mt-0.5">Define how your AI writes LinkedIn messages</p>
          </div>
        </div>

        {/* Current template info */}
        <div className="mt-4 p-4 rounded-lg bg-muted/20 border border-border/60">
          <p className="text-[11px] text-muted-foreground">
            Templates guide your AI. Messages are generated dynamically for each lead using variables like <code className="text-orange-400/80">[FirstName]</code>, <code className="text-orange-400/80">[Company]</code>, <code className="text-orange-400/80">[Headline]</code>.
          </p>
        </div>
      </div>

      {/* Templates list */}
      <div className="clean-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Your Templates</h4>
            <span className="text-[9px] bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded-full">
              {templates.length}
            </span>
          </div>
          <button
            onClick={startCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand/10 hover:bg-brand/20 border border-orange-500/20 text-orange-400 text-[10px] font-medium uppercase tracking-wider transition-all"
          >
            <Plus className="size-3" />
            Create Template
          </button>
        </div>

        {error && (
          <div className="px-6 py-3 border-b border-border text-xs text-destructive bg-destructive/10">
            {error}
          </div>
        )}

        {/* Create form */}
        {creating && (
          <div className="px-6 py-5 border-b border-border bg-muted/20">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Template name..."
              className="w-full bg-transparent border-b border-border pb-2 text-sm text-foreground placeholder:text-stone focus:outline-none focus:border-border mb-3"
            />
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Write your template... Use [FirstName], [Company], [Headline] as variables."
              className="w-full bg-muted/20 border border-border rounded-lg px-3.5 py-3 text-sm text-foreground placeholder:text-stone resize-none focus:outline-none focus:border-border"
              rows={5}
            />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <select
                value={editLanguage}
                onChange={(e) => setEditLanguage(e.target.value === "it" ? "it" : "en")}
                className="w-full bg-muted/20 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none"
              >
                <option value="en">English</option>
                <option value="it">Italian</option>
              </select>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value === "connection_request" ? "connection_request" : "message")}
                className="w-full bg-muted/20 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none"
              >
                <option value="message">Message</option>
                <option value="connection_request">Connection Request</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={cancelEdit} className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-stone hover:text-muted-foreground">
                Cancel
              </button>
              <button
                onClick={saveCreate}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/10 hover:bg-success/20 border border-emerald-500/20 text-success text-[10px] font-medium uppercase tracking-wider disabled:opacity-50"
              >
                <Save className="size-3" />
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}

        {/* Template items */}
        <div>
          {templates.length === 0 && !creating ? (
            <div className="px-6 py-12 text-center">
              <FileText className="size-8 mx-auto mb-3 text-stone opacity-30" />
              <p className="text-[10px] uppercase tracking-[0.2em] text-stone">No templates yet</p>
            </div>
          ) : (
            templates.map((template) => (
              <div key={template.id} className="px-6 py-4 border-b border-border/60 hover:bg-muted/20 transition-colors group">
                {editing === template.id ? (
                  <div>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-transparent border-b border-border pb-2 text-sm text-foreground focus:outline-none mb-3"
                    />
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full bg-muted/20 border border-border rounded-lg px-3.5 py-3 text-sm text-foreground resize-none focus:outline-none"
                      rows={5}
                    />
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <select
                        value={editLanguage}
                        onChange={(e) => setEditLanguage(e.target.value === "it" ? "it" : "en")}
                        className="w-full bg-muted/20 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none"
                      >
                        <option value="en">English</option>
                        <option value="it">Italian</option>
                      </select>
                      <select
                        value={editType}
                        onChange={(e) => setEditType(e.target.value === "connection_request" ? "connection_request" : "message")}
                        className="w-full bg-muted/20 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none"
                      >
                        <option value="message">Message</option>
                        <option value="connection_request">Connection Request</option>
                      </select>
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                      <button onClick={cancelEdit} className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-stone">
                        Cancel
                      </button>
                      <button
                        onClick={() => saveEdit(template.id)}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/10 border border-emerald-500/20 text-success text-[10px] font-medium uppercase tracking-wider disabled:opacity-50"
                      >
                        <Save className="size-3" />
                        {saving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{template.name}</p>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-border text-stone uppercase">
                          {template.language}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-border text-stone">
                          {template.type === "connection_request" ? "Connection" : "Message"}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone line-clamp-2 mt-1 leading-relaxed">{template.content}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-4 shrink-0">
                      <button
                        onClick={() => startEdit(template)}
                        className="size-7 rounded-lg flex items-center justify-center text-stone hover:text-muted-foreground hover:bg-muted/40"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={() => deleteTemplate(template.id)}
                        className="size-7 rounded-lg flex items-center justify-center text-stone hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Workspace / Profile Settings ───────────────────────────────────────

type WorkspaceMember = {
  userId: string;
  workspaceId: string;
  role: "workspace admin" | "user";
  email: string;
  createdAt: string;
};

type WorkspaceInviteSummary = {
  id: string;
  workspaceId: string;
  role: WorkspaceMember["role"];
  expiresAt: string;
  acceptedAt?: string;
  createdAt: string;
};

function activeWorkspace(workspaces: WorkspaceSummary[], activeWorkspaceId: string | null) {
  return workspaces.find((workspace) => workspace.id === activeWorkspaceId) || workspaces[0] || null;
}

function CompanyProfileTab() {
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const user = useAppStore((state) => state.user);
  const memberships = useAppStore((state) => state.memberships);
  const refreshWorkspaces = useAppStore((state) => state.refreshWorkspaces);
  const workspace = activeWorkspace(workspaces, activeWorkspaceId);
  const activeRole = memberships.find((m) => m.workspaceId === activeWorkspaceId)?.role;
  const canInvite =
    Boolean(user?.globalRole === "super admin") || activeRole === "workspace admin";
  const [draft, setDraft] = useState<WorkspaceSummary | null>(workspace);
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceMember["role"]>("user");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(workspace);
  }, [workspace]);

  async function saveCompany() {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to save workspace profile");
      await refreshWorkspaces();
      setMessage("Workspace profile saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save workspace profile");
    } finally {
      setSaving(false);
    }
  }

  async function createInvite() {
    setMessage(null);
    const res = await fetch("/api/workspaces/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ role: inviteRole, expiresInDays: 7 }),
    });
    const data = await res.json().catch(() => ({})) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      setMessage(data.error || "Failed to create invite");
      return;
    }
    setInviteUrl(data.url);
    setMessage("Invite link created.");
  }

  if (!draft) {
    return <EmptySettingsState title="Company" description="No workspace is selected." />;
  }

  const profile = draft.profileSettings || {};
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
      <div className="clean-card p-6 space-y-4">
        <div>
          <h3 className="text-base font-medium text-foreground">Profile Settings</h3>
          <p className="text-[11px] text-stone">Workspace company profile stored in Supabase.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SettingsInput label="Workspace name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
          <SettingsInput label="Company name" value={profile.companyName || ""} onChange={(companyName) => setDraft({ ...draft, profileSettings: { ...profile, companyName } })} />
          <SettingsInput label="Website" value={profile.website || ""} onChange={(website) => setDraft({ ...draft, profileSettings: { ...profile, website } })} />
          <SettingsInput label="Industry" value={profile.industry || ""} onChange={(industry) => setDraft({ ...draft, profileSettings: { ...profile, industry } })} />
          <SettingsInput label="Company size" value={profile.size || ""} onChange={(size) => setDraft({ ...draft, profileSettings: { ...profile, size } })} />
          <SettingsInput label="Niche" value={draft.niche || ""} onChange={(niche) => setDraft({ ...draft, niche })} />
        </div>
        <label className="block text-sm">
          <span className="text-[11px] uppercase tracking-[0.18em] text-stone">Description</span>
          <textarea
            className="mt-1 min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            value={profile.description || ""}
            onChange={(event) => setDraft({ ...draft, profileSettings: { ...profile, description: event.target.value } })}
          />
        </label>
        <button onClick={saveCompany} disabled={saving} className="btn-primary">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save profile
        </button>
        {message ? <p className="text-xs text-stone">{message}</p> : null}
      </div>
      <div className="clean-card p-6 space-y-4">
        <div>
          <h3 className="text-base font-medium text-foreground">Workspace Access</h3>
          <p className="text-[11px] text-stone">Invite links grant access only to this workspace.</p>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-stone">
          <p><span className="text-foreground">Current workspace:</span> {draft.name}</p>
          <p><span className="text-foreground">Workspace ID:</span> {draft.id}</p>
          <p><span className="text-foreground">Slug:</span> {draft.slug || "—"}</p>
        </div>
        {canInvite ? (
          <>
            <div className="space-y-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-stone block">Invite role</span>
              <Select value={inviteRole} onValueChange={(v) => v && setInviteRole(v as WorkspaceMember["role"])}>
                <SelectTrigger className="h-10 w-full rounded-xl border-border/90 bg-muted/20 dark:bg-muted/35">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">user</SelectItem>
                  <SelectItem value="workspace admin">workspace admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="secondary" className="w-full gap-2" onClick={() => void createInvite()}>
              <Send className="size-4" />
              Create invite link
            </Button>
            {inviteUrl ? (
              <Input readOnly className="font-mono text-xs h-9 rounded-xl" value={inviteUrl} onFocus={(event) => event.currentTarget.select()} />
            ) : null}
          </>
        ) : (
          <p className="text-[11px] text-stone">Only workspace admin or super admin can create invites for this workspace. Use Organization for full invite tools.</p>
        )}
      </div>
    </div>
  );
}

function AccountProfileTab() {
  const user = useAppStore((state) => state.user);
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const primarySeat = useAppStore((state) => state.primarySeat);
  const refreshSession = useAppStore((state) => state.refreshSession);
  const refreshProfile = useAppStore((state) => state.refreshProfile);
  const workspace = activeWorkspace(workspaces, activeWorkspaceId);
  const [displayName, setDisplayName] = useState("");
  const [title, setTitle] = useState("");
  const [timezone, setTimezone] = useState("");
  const [linkedinProfileUrl, setLinkedinProfileUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName || "");
    setTitle(user.profileSettings?.title || "");
    setTimezone(user.profileSettings?.timezone || "");
    setLinkedinProfileUrl(
      user.profileSettings?.linkedinProfileUrl?.trim() || DEFAULT_OWNER_LINKEDIN_URL,
    );
  }, [user]);

  async function saveAccount() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          displayName,
          profileSettings: { title, timezone, linkedinProfileUrl },
        }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to save account profile");
      await refreshSession();
      await refreshProfile();
      setMessage("Account profile saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save account profile");
    } finally {
      setSaving(false);
    }
  }

  const resolvedLinkedInUrl =
    primarySeat?.profileUrl?.trim()
    || user?.profileSettings?.linkedinProfileUrl?.trim()
    || null;
  const senderLabel =
    primarySeat?.profileName?.trim()
    || primarySeat?.name?.trim()
    || user?.displayName?.trim()
    || user?.profileSettings?.linkedinPublicIdentifier
    || "LinkedIn sender";
  const senderConnected = Boolean(primarySeat?.unipileAccountId && primarySeat?.status === "active");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start">
      <div className="clean-card overflow-hidden ring-1 ring-border/40">
        <div className="border-b border-border/80 bg-muted/15 px-6 py-4">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">Account profile</h3>
          <p className="text-[11px] text-stone mt-1 leading-relaxed">
            How you appear inside BrandMultiplier and in automated outreach previews.
          </p>
        </div>
        <div className="space-y-4 p-6">
          <SettingsInput label="Display name" value={displayName} onChange={setDisplayName} />
          <SettingsInput
            label="Email"
            value={user?.email || ""}
            onChange={() => undefined}
            disabled
            hint="Provided by your login. Contact an admin to change."
          />
          <SettingsInput label="Title" value={title} onChange={setTitle} placeholder="e.g. Growth lead" />
          <SettingsInput
            label="Timezone"
            value={timezone}
            onChange={setTimezone}
            placeholder="Europe/Lisbon"
          />
          <SettingsInput
            label="Your LinkedIn profile"
            value={linkedinProfileUrl}
            onChange={setLinkedinProfileUrl}
            placeholder={DEFAULT_OWNER_LINKEDIN_URL}
            hint="Paste your public profile URL or handle (example: sivasish48)."
          />

          <div className="flex flex-col-reverse gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p
              className={cn(
                "text-xs min-h-[1.25rem]",
                message?.includes("Failed") || message?.includes("Invalid")
                  ? "text-destructive"
                  : "text-stone",
              )}
            >
              {message || "\u00a0"}
            </p>
            <button type="button" onClick={() => void saveAccount()} disabled={saving} className="btn-primary shrink-0">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save account
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="clean-card overflow-hidden ring-1 ring-border/40">
          <div className="flex items-start gap-3 border-b border-border/80 bg-muted/15 px-5 py-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/12 text-orange-400 ring-1 ring-orange-500/20">
              <Building2 className="size-[18px]" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone">Current workspace</p>
              <p className="mt-1 text-base font-medium text-foreground truncate">
                {workspace?.name || "No workspace"}
              </p>
              <p className="text-[11px] text-stone font-mono mt-1 truncate">
                {workspace?.id || "Select or join a workspace to continue"}
              </p>
            </div>
          </div>
          <div className="p-5">
            <p className="text-xs text-stone leading-relaxed max-w-md">
              Switch context from the sidebar, or invite teammates under Organization.
            </p>
          </div>
        </div>

        <div className="clean-card overflow-hidden ring-1 ring-orange-500/15">
          <div className="flex items-start gap-3 border-b border-border/80 bg-orange-500/[0.06] px-5 py-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/25">
              <Linkedin className="size-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone">LinkedIn sender</p>
              <p className="mt-1 text-base font-medium text-foreground truncate">{senderLabel}</p>
              <span
                className={cn(
                  "mt-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                  senderConnected
                    ? "border-success/25 bg-success/10 text-success"
                    : "border-border bg-muted/30 text-stone",
                )}
              >
                {senderConnected ? "Unipile connected" : "Not connected"}
              </span>
            </div>
            {resolvedLinkedInUrl ? (
              <a
                href={resolvedLinkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost shrink-0 text-[11px] normal-case tracking-normal px-3 py-2"
              >
                <ExternalLink className="size-3.5" />
                Profile
              </a>
            ) : null}
          </div>
          <div className="space-y-3 p-5">
            <p className="text-xs text-stone leading-relaxed">
              Messaging runs through Unipile. Save your LinkedIn URL on the left so this card stays aligned with your public profile.
            </p>
            <Link
              href="/settings?tab=linkedin"
              className="inline-flex w-full items-center justify-between gap-2 rounded-xl border border-orange-500/25 bg-orange-500/[0.07] px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-orange-500/[0.11]"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Linkedin className="size-4 text-orange-400 shrink-0" />
                <span className="truncate">Manage LinkedIn accounts and quotas</span>
              </span>
              <ChevronRight className="size-4 text-orange-400/90 shrink-0" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrganizationTab() {
  const user = useAppStore((state) => state.user);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const memberships = useAppStore((state) => state.memberships);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<WorkspaceInviteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"workspace admin" | "user">("user");
  const [inviteExpiresDays, setInviteExpiresDays] = useState(7);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<WorkspaceMember | null>(null);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  const activeRole = memberships.find((m) => m.workspaceId === activeWorkspaceId)?.role;
  const canManageMembers =
    Boolean(user?.globalRole === "super admin")
    || activeRole === "workspace admin";

  async function loadOrg() {
    setLoading(true);
    try {
      const [memberRes, inviteRes] = await Promise.all([
        fetch("/api/workspaces/members", { credentials: "include" }),
        fetch("/api/workspaces/invites", { credentials: "include" }),
      ]);
      const memberData = await memberRes.json().catch(() => ({})) as { members?: WorkspaceMember[] };
      const inviteData = inviteRes.ok
        ? await inviteRes.json().catch(() => ({})) as { invites?: WorkspaceInviteSummary[] }
        : { invites: [] };
      setMembers(memberData.members || []);
      setInvites(inviteData.invites || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrg();
  }, [activeWorkspaceId]);

  async function confirmRemoveMember() {
    if (!removeTarget || !canManageMembers) return;
    const userId = removeTarget.userId;
    setRemovingId(userId);
    try {
      const res = await fetch(`/api/workspaces/members?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Failed to remove member");
      setRemoveTarget(null);
      await loadOrg();
    } catch (e) {
      setErrorDialog(e instanceof Error ? e.message : "Failed to remove member");
      setRemoveTarget(null);
    } finally {
      setRemovingId(null);
    }
  }

  const inviteJoinUrl = useMemo(() => {
    if (!lastInviteUrl) return null;
    const em = inviteEmail.trim();
    if (!em) return lastInviteUrl;
    try {
      const u = new URL(lastInviteUrl);
      u.searchParams.set("email", em);
      return u.toString();
    } catch {
      return lastInviteUrl;
    }
  }, [lastInviteUrl, inviteEmail]);

  if (loading) {
    return <EmptySettingsState title="Organization" description="Loading workspace members..." />;
  }

  return (
    <div className="space-y-6">
      <div className="clean-card p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Shield className="size-5 text-orange-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-medium text-foreground">Roles & access</h3>
            <p className="text-[11px] text-stone mt-1 leading-relaxed max-w-3xl">
              Roles use the same labels in the database and in this screen: <strong className="text-foreground">super admin</strong>, <strong className="text-foreground">workspace admin</strong>, and <strong className="text-foreground">user</strong>.
              {" "}
              <strong className="text-foreground">super admin</strong> (stored on your account): lists every workspace, switches into any of them, edits or deletes any workspace, manages members in any workspace, and creates new workspaces (orange + in the sidebar). Invites use whichever workspace is currently selected.
              {" "}
              <strong className="text-foreground">workspace admin</strong> (stored on <code className="text-foreground">workspace_memberships.role</code>): can invite people only into the workspace they belong to and remove members there; cannot create, delete, or switch tenants like a super admin.
              {" "}
              <strong className="text-foreground">user</strong> (same column): joined via invite; can use and change campaigns, outreach, and the rest of the product in that workspace, but cannot manage members or workspace settings.
              {" "}
              Accounts that are not <strong className="text-foreground">super admin</strong> keep <code className="text-foreground">app_users.global_role</code> = <strong className="text-foreground">member</strong> (only the three names above apply to workspace invites and memberships).
            </p>
            {user?.globalRole === "super admin" ? (
              <p className="mt-2 text-xs text-success">You are signed in as a super admin.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="clean-card p-6 border border-success/20 bg-success/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-medium text-foreground">Production LinkedIn sender (Unipile)</h3>
            <p className="text-[11px] text-stone mt-1 max-w-xl">
              Connect your live LinkedIn account through Unipile so outreach, inbox sync, and webhooks use the correct sender. Env keys and seat configuration live under LinkedIn Accounts.
            </p>
          </div>
          <Link
            href="/settings?tab=linkedin"
            className="btn-secondary shrink-0 text-[11px] normal-case tracking-normal"
          >
            <Linkedin className="size-4" />
            Open sender setup
          </Link>
        </div>
      </div>

      <div className="clean-card overflow-hidden border border-border ring-1 ring-orange-500/10">
        <div className="border-b border-border bg-muted/15 px-5 py-4">
          <h3 className="text-base font-medium text-foreground">Invite by email</h3>
          <p className="text-[11px] text-stone mt-1 max-w-2xl leading-relaxed">
            Enter their address and role. We generate a secure link for this workspace — the app does not send email automatically yet; use copy or open your mail client to send it to them.
          </p>
        </div>
        <div className="p-5">
        {!activeWorkspaceId ? (
          <p className="text-sm text-warning">Select a workspace in the sidebar first.</p>
        ) : !canManageMembers ? (
          <p className="text-sm text-stone">Only workspace admin or super admin can create invites for this workspace.</p>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-12 sm:items-end">
              <label className="block text-sm sm:col-span-5">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Email address</span>
                <Input
                  type="email"
                  autoComplete="off"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className={cn(
                    "mt-1.5 h-10 rounded-xl border-border/90 bg-muted/20 dark:bg-muted/35",
                    "focus-visible:ring-orange-500/35",
                  )}
                />
              </label>
              <div className="block text-sm sm:col-span-3">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone block mb-1.5">Role</span>
                <Select value={inviteRole} onValueChange={(v) => v && setInviteRole(v as "workspace admin" | "user")}>
                  <SelectTrigger className="h-10 w-full rounded-xl border-border/90 bg-muted/20 dark:bg-muted/35">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">user</SelectItem>
                    <SelectItem value="workspace admin">workspace admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="block text-sm sm:col-span-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone block mb-1.5">Expires</span>
                <Select
                  value={String(inviteExpiresDays)}
                  onValueChange={(v) => v && setInviteExpiresDays(Number(v) || 7)}
                >
                  <SelectTrigger className="h-10 w-full rounded-xl border-border/90 bg-muted/20 dark:bg-muted/35">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[3, 7, 14, 30].map((d) => (
                      <SelectItem key={d} value={String(d)}>{d} days</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 flex sm:justify-end">
                <Button
                  type="button"
                  disabled={inviteSaving}
                  className="w-full sm:w-auto h-10 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-ui text-[11px] normal-case tracking-normal gap-2"
                  onClick={async () => {
                    const trimmed = inviteEmail.trim();
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
                      setInviteError("Enter a valid email address.");
                      return;
                    }
                    setInviteSaving(true);
                    setInviteError(null);
                    setLastInviteUrl(null);
                    setCopied(false);
                    try {
                      const res = await fetch("/api/workspaces/invites", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({
                          role: inviteRole,
                          expiresInDays: inviteExpiresDays,
                        }),
                      });
                      const body = await res.json().catch(() => ({})) as { error?: string; url?: string };
                      if (!res.ok) throw new Error(body.error || "Could not create invite");
                      if (body.url) setLastInviteUrl(body.url);
                      await loadOrg();
                    } catch (e) {
                      setInviteError(e instanceof Error ? e.message : "Invite failed");
                    } finally {
                      setInviteSaving(false);
                    }
                  }}
                >
                  {inviteSaving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Create link
                </Button>
              </div>
            </div>

            {inviteError ? (
              <p className="text-xs text-destructive">{inviteError}</p>
            ) : null}

            {lastInviteUrl ? (
              <div className="rounded-xl border border-border bg-muted/15 p-4 space-y-3">
                <p className="text-xs text-stone">
                  Link for <span className="text-foreground font-medium">{inviteEmail.trim()}</span> — role <span className="text-foreground">{inviteRole}</span>
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    readOnly
                    className="flex-1 font-mono text-xs h-9 rounded-lg bg-background"
                    value={inviteJoinUrl ?? ""}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="text-[11px] normal-case gap-1.5"
                      onClick={async () => {
                        if (inviteJoinUrl) {
                          await navigator.clipboard.writeText(inviteJoinUrl);
                        }
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                    >
                      <Copy className="size-3.5" />
                      {copied ? "Copied" : "Copy link"}
                    </Button>
                    <a
                      href={`mailto:${inviteEmail.trim()}?subject=${encodeURIComponent("You're invited to BrandMultiplier GTM")}&body=${encodeURIComponent(
                        `You've been invited with role: ${inviteRole}.\n\nOpen this link to join (your email is pre-filled on the page):\n\n${inviteJoinUrl ?? lastInviteUrl}\n`,
                      )}`}
                      className="inline-flex h-7 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium text-foreground hover:bg-muted dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
                    >
                      <Mail className="size-3.5" />
                      Draft email
                    </a>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="clean-card p-6">
          <h3 className="text-base font-medium text-foreground mb-4">Workspace members</h3>
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={`${member.workspaceId}:${member.userId}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{member.email || member.userId}</p>
                  <p className="text-xs text-stone font-mono truncate">{member.userId}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="rounded-full bg-muted px-2 py-1 text-xs text-stone">{member.role}</span>
                  {canManageMembers && member.userId !== user?.id ? (
                    <button
                      type="button"
                      onClick={() => setRemoveTarget(member)}
                      disabled={removingId === member.userId}
                      className="rounded-lg border border-destructive/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      {removingId === member.userId ? "…" : "Remove"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="clean-card p-6">
          <h3 className="text-base font-medium text-foreground mb-4">Recent invites</h3>
          <div className="space-y-2">
            {!canManageMembers ? (
              <p className="text-xs text-stone">Only workspace admin or super admin can view pending invites.</p>
            ) : null}
            {canManageMembers && invites.length === 0 ? <p className="text-xs text-stone">No invite links yet.</p> : null}
            {canManageMembers
              ? invites.map((invite) => (
                <div key={invite.id} className="rounded-xl border border-border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{invite.role}</span>
                    <span className="text-xs text-stone">{invite.acceptedAt ? "Accepted" : "Open"}</span>
                  </div>
                  <p className="mt-1 text-xs text-stone">Expires {formatShortDateTime(invite.expiresAt)}</p>
                </div>
              ))
              : null}
          </div>
        </div>
      </div>

      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <DialogContent className="gap-4 sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Remove from workspace?</DialogTitle>
            <DialogDescription>
              {removeTarget
                ? (
                  <>
                    Remove <span className="font-medium text-foreground">{removeTarget.email || removeTarget.userId}</span> from this workspace. They lose access immediately.
                  </>
                )
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 border-0 bg-transparent p-0 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!removeTarget || removingId !== null}
              onClick={() => void confirmRemoveMember()}
            >
              {removingId ? <Loader2 className="size-4 animate-spin" /> : null}
              Remove member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={errorDialog !== null} onOpenChange={(open) => !open && setErrorDialog(null)}>
        <DialogContent className="gap-4 sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Something went wrong</DialogTitle>
            <DialogDescription className="text-destructive">
              {errorDialog}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
            <Button type="button" onClick={() => setErrorDialog(null)}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsInput({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{label}</span>
      <input
        className={cn(
          "mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/55",
          "border-border/90 bg-muted/20 dark:bg-muted/35",
          "shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.18)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/35 focus-visible:border-orange-500/45",
          "disabled:cursor-not-allowed disabled:opacity-[0.62]",
        )}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
      />
      {hint ? (
        <p className="mt-1 text-[11px] text-muted-foreground/90 leading-snug">{hint}</p>
      ) : null}
    </label>
  );
}

function EmptySettingsState({ title, description }: { title: string; description: string }) {
  return (
    <div className="clean-card p-12 text-center">
      <Settings className="size-10 mx-auto mb-4 text-stone opacity-20" />
      <h3 className="text-base font-medium text-foreground mb-2">{title}</h3>
      <p className="text-[11px] text-stone">{description}</p>
    </div>
  );
}
