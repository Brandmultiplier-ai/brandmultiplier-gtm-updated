"use client";

import { Suspense, useState, useEffect } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

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

  useEffect(() => {
    const next = searchParams.get("tab");
    if (isTabId(next)) setActiveTab(next as TabId);
  }, [searchParams]);

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
      {activeTab === "organization" && <PlaceholderTab title="Organization" description="Team management and roles will be available here." />}
      {activeTab === "company" && <PlaceholderTab title="Company" description="Company profile and branding settings will be available here." />}
      {activeTab === "account" && <PlaceholderTab title="Account" description="Personal account settings will be available here." />}
      {activeTab === "linkedin" && <LinkedInAccountsTab />}
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

// ── Placeholder Tab ────────────────────────────────────────────────────

function PlaceholderTab({ title, description }: { title: string; description: string }) {
  return (
    <div className="clean-card p-12 text-center">
      <Settings className="size-10 mx-auto mb-4 text-stone opacity-20" />
      <h3 className="text-base font-medium text-foreground mb-2">{title}</h3>
      <p className="text-[11px] text-stone">{description}</p>
    </div>
  );
}
