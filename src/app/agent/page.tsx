"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  Plus,
  Settings,
  Calendar,
  Pencil,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  Bot,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Claudio } from "@/components/claudio";

// ── Types ───────────────────────────────────────────────────────────────

interface AgentConfig {
  id?: string;
  name: string;
  status: "active" | "paused" | "draft";
  icp: {
    jobTitles: string[];
    locations: string[];
    industries: string[];
    companySizes: string[];
    excludeKeywords: string[];
    matchingMode: "discovery" | "precision";
  };
  signals: {
    companyPage: string;
    personalProfile: string;
    trackProfileVisitors: boolean;
    trackCompanyFollowers: boolean;
    engagementKeywords: string[];
    watchProfiles: string[];
    neverTargetProfiles: string[];
    triggerEvents: {
      topActiveProfiles: boolean;
      recentFunding: boolean;
      jobChanges: boolean;
    };
    competitorPages: string[];
  };
  leads: {
    autoAddToList: boolean;
    listName: string;
  };
}

function countSignals(agent: AgentConfig): number {
  const s = agent.signals;
  return (
    [s.companyPage, s.personalProfile].filter(Boolean).length +
    [s.trackProfileVisitors, s.trackCompanyFollowers].filter(Boolean).length +
    s.engagementKeywords.length +
    s.watchProfiles.length +
    Object.values(s.triggerEvents).filter(Boolean).length +
    s.competitorPages.length
  );
}

// ── Tag Input ───────────────────────────────────────────────────────────

function TagInput({
  tags,
  onAdd,
  onRemove,
  placeholder,
}: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  function handleAdd() {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onAdd(trimmed);
      setInput("");
    }
  }

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={placeholder}
        />
        <Button variant="outline" size="sm" onClick={handleAdd} className="border-border text-muted-foreground hover:bg-muted/40">
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1 bg-muted/40 text-muted-foreground">
            {tag}
            <button
              onClick={() => onRemove(tag)}
              className="ml-0.5 rounded-full hover:bg-muted/70 p-0.5"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

// ── Multi Select ────────────────────────────────────────────────────────

function MultiSelect({
  options,
  selected,
  onChange,
  label,
}: {
  options: string[];
  selected: string[];
  onChange: (sel: string[]) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <label className="block text-sm text-muted-foreground mb-1.5">{label}</label>
      <Button
        variant="outline"
        onClick={() => setOpen(!open)}
        className="w-full justify-between border-border hover:bg-muted/40"
      >
        <span className="text-muted-foreground">{selected.length ? `${selected.length} selected` : "Select..."}</span>
        {open ? <ChevronUp className="size-4 text-stone" /> : <ChevronDown className="size-4 text-stone" />}
      </Button>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 cursor-pointer text-sm text-muted-foreground"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() =>
                  onChange(
                    selected.includes(opt)
                      ? selected.filter((s) => s !== opt)
                      : [...selected, opt]
                  )
                }
                className="rounded"
              />
              {opt}
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {selected.map((s) => (
          <Badge key={s} variant="outline" className="gap-1 pr-1 text-xs border-border text-muted-foreground">
            {s}
            <button
              onClick={() => onChange(selected.filter((x) => x !== s))}
              className="ml-0.5 rounded-full hover:bg-muted/70 p-0.5"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

// ── Signal Section ──────────────────────────────────────────────────────

function SignalSection({
  title,
  description,
  count,
  children,
  defaultOpen,
}: {
  title: string;
  description: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div className="clean-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-foreground">{title}</span>
            {count !== undefined && count > 0 && (
              <Badge variant="secondary" className="text-xs bg-success/10 text-success">
                {count} active
              </Badge>
            )}
          </div>
          <p className="text-xs text-stone mt-0.5">{description}</p>
        </div>
        {open ? <ChevronUp className="size-4 text-stone" /> : <ChevronDown className="size-4 text-stone" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 border-t border-border space-y-4">
          <div className="pt-4">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Constants ───────────────────────────────────────────────────────────

const INDUSTRY_OPTIONS = [
  "Software Development & SaaS",
  "Marketing & Advertising",
  "E-commerce",
  "Healthcare",
  "Finance",
  "IT Services & Consulting",
  "Technology",
  "Education",
  "Media & Communications",
  "Real Estate",
];

const COMPANY_SIZE_OPTIONS = [
  "1-10 employees",
  "11-50 employees",
  "51-200 employees",
  "201-500 employees",
  "501-1000 employees",
  "1000+ employees",
];

// ── Steps ───────────────────────────────────────────────────────────────

function StepICP({
  config,
  setConfig,
}: {
  config: AgentConfig;
  setConfig: (c: AgentConfig) => void;
}) {
  const icp = config.icp;
  const set = (patch: Partial<AgentConfig["icp"]>) =>
    setConfig({ ...config, icp: { ...icp, ...patch } });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium tracking-[-0.04em] text-foreground">Ideal Customer Profile</h3>
        <p className="text-sm text-stone mt-1">
          Who should the agent target on LinkedIn
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="block text-sm text-muted-foreground mb-1.5">Target Job Titles</label>
          <TagInput
            tags={icp.jobTitles}
            onAdd={(t) => set({ jobTitles: [...icp.jobTitles, t] })}
            onRemove={(t) => set({ jobTitles: icp.jobTitles.filter((x) => x !== t) })}
            placeholder="e.g., Founder, Freelancer, CMO"
          />
        </div>

        <div>
          <label className="block text-sm text-muted-foreground mb-1.5">Target Locations</label>
          <TagInput
            tags={icp.locations}
            onAdd={(t) => set({ locations: [...icp.locations, t] })}
            onRemove={(t) => set({ locations: icp.locations.filter((x) => x !== t) })}
            placeholder="e.g., Italy, United States"
          />
        </div>

        <MultiSelect
          label="Target Industries"
          options={INDUSTRY_OPTIONS}
          selected={icp.industries}
          onChange={(s) => set({ industries: s })}
        />

        <MultiSelect
          label="Company Sizes"
          options={COMPANY_SIZE_OPTIONS}
          selected={icp.companySizes}
          onChange={(s) => set({ companySizes: s })}
        />

        <div className="col-span-2">
          <label className="block text-sm text-muted-foreground mb-1.5">
            Exclude keywords (anti-personas)
          </label>
          <TagInput
            tags={icp.excludeKeywords}
            onAdd={(t) => set({ excludeKeywords: [...icp.excludeKeywords, t] })}
            onRemove={(t) => set({ excludeKeywords: icp.excludeKeywords.filter((x) => x !== t) })}
            placeholder="e.g., recruiter, HR"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm text-muted-foreground mb-2">Matching Mode</label>
          <div className="flex items-center gap-3">
            <Button
              variant={icp.matchingMode === "discovery" ? "default" : "outline"}
              size="sm"
              onClick={() => set({ matchingMode: "discovery" })}
              className={icp.matchingMode === "discovery" ? "bg-brand text-white hover:bg-brand-hover" : "border-border text-muted-foreground hover:bg-muted/40"}
            >
              Discovery
            </Button>
            <Button
              variant={icp.matchingMode === "precision" ? "default" : "outline"}
              size="sm"
              onClick={() => set({ matchingMode: "precision" })}
              className={icp.matchingMode === "precision" ? "bg-brand text-white hover:bg-brand-hover" : "border-border text-muted-foreground hover:bg-muted/40"}
            >
              High Precision
            </Button>
            <span className="text-xs text-stone">
              {icp.matchingMode === "discovery"
                ? "More leads, broader matches"
                : "Strict ICP, fewer but better leads"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepSignals({
  config,
  setConfig,
}: {
  config: AgentConfig;
  setConfig: (c: AgentConfig) => void;
}) {
  const sig = config.signals;
  const set = (patch: Partial<AgentConfig["signals"]>) =>
    setConfig({ ...config, signals: { ...sig, ...patch } });
  const appendUnique = (items: string[], value: string) =>
    items.includes(value) ? items : [...items, value];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-medium tracking-[-0.04em] text-foreground">Intent Signals</h3>
          <Badge variant="secondary" className="bg-success/10 text-success">
            {countSignals(config)} signals
          </Badge>
        </div>
        <p className="text-sm text-stone mt-1">
          What signals indicate buying intent
        </p>
      </div>

      <div className="space-y-3">
        <SignalSection
          title="You & Your company"
          description="Detect people engaging with your profile"
          count={
            [sig.companyPage, sig.personalProfile].filter(Boolean).length +
            [sig.trackProfileVisitors, sig.trackCompanyFollowers].filter(Boolean).length
          }
          defaultOpen
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs text-stone">Your LinkedIn Profile</label>
              <Input
                value={sig.personalProfile}
                onChange={(e) => set({ personalProfile: e.target.value })}
                placeholder="https://www.linkedin.com/in/..."
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-stone">Company LinkedIn Page</label>
              <Input
                value={sig.companyPage}
                onChange={(e) => set({ companyPage: e.target.value })}
                placeholder="https://www.linkedin.com/company/..."
                className="mt-1"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={sig.trackProfileVisitors}
                onChange={(e) => set({ trackProfileVisitors: e.target.checked })}
                className="rounded"
              />
              Track profile visitors
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={sig.trackCompanyFollowers}
                onChange={(e) => set({ trackCompanyFollowers: e.target.checked })}
                className="rounded"
              />
              Track company followers
            </label>
          </div>
        </SignalSection>

        <SignalSection
          title="Engagement & Interest"
          description="People engaging with relevant content"
          count={sig.engagementKeywords.length}
          defaultOpen
        >
          <div>
            <label className="text-xs text-stone">
              Keywords to track in your niche
            </label>
            <TagInput
              tags={sig.engagementKeywords}
              onAdd={(t) => set({ engagementKeywords: [...sig.engagementKeywords, t] })}
              onRemove={(t) =>
                set({ engagementKeywords: sig.engagementKeywords.filter((x) => x !== t) })
              }
              placeholder='e.g., "AI marketing", "automation"'
            />
          </div>
        </SignalSection>

        <SignalSection
          title="LinkedIn Profiles"
          description="People engaging with industry experts"
          count={sig.watchProfiles.length}
        >
          <TagInput
            tags={sig.watchProfiles}
            onAdd={(t) => set({
              watchProfiles: appendUnique(sig.watchProfiles, t),
              neverTargetProfiles: appendUnique(sig.neverTargetProfiles, t),
            })}
            onRemove={(t) =>
              set({ watchProfiles: sig.watchProfiles.filter((x) => x !== t) })
            }
            placeholder="https://linkedin.com/in/expert-profile"
          />
        </SignalSection>

        <SignalSection
          title="Never-target profiles"
          description="Sources or protected profiles that must never become leads"
          count={sig.neverTargetProfiles.length}
        >
          <div className="space-y-2">
            <p className="text-xs text-stone">
              Watch profiles are automatically added here. Add any extra LinkedIn profiles or provider IDs you want the engine to ignore as prospects.
            </p>
            <TagInput
              tags={sig.neverTargetProfiles}
              onAdd={(t) => set({ neverTargetProfiles: appendUnique(sig.neverTargetProfiles, t) })}
              onRemove={(t) =>
                set({ neverTargetProfiles: sig.neverTargetProfiles.filter((x) => x !== t) })
              }
              placeholder="https://linkedin.com/in/source-profile"
            />
          </div>
        </SignalSection>

        <SignalSection
          title="Change & Trigger Events"
          description="Job changes, funding, activity spikes"
          count={Object.values(sig.triggerEvents).filter(Boolean).length}
          defaultOpen
        >
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={sig.triggerEvents.topActiveProfiles}
                onChange={(e) =>
                  set({
                    triggerEvents: { ...sig.triggerEvents, topActiveProfiles: e.target.checked },
                  })
                }
                className="rounded"
              />
              Top 5% active profiles in ICP
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={sig.triggerEvents.recentFunding}
                onChange={(e) =>
                  set({
                    triggerEvents: { ...sig.triggerEvents, recentFunding: e.target.checked },
                  })
                }
                className="rounded"
              />
              Recently raised funds
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={sig.triggerEvents.jobChanges}
                onChange={(e) =>
                  set({
                    triggerEvents: { ...sig.triggerEvents, jobChanges: e.target.checked },
                  })
                }
                className="rounded"
              />
              Recent job changes (&lt; 90 days)
            </label>
          </div>
        </SignalSection>

        <SignalSection
          title="Competitors Engagement"
          description="People following or engaging with competitors"
          count={sig.competitorPages.length}
        >
          <TagInput
            tags={sig.competitorPages}
            onAdd={(t) => set({ competitorPages: [...sig.competitorPages, t] })}
            onRemove={(t) =>
              set({ competitorPages: sig.competitorPages.filter((x) => x !== t) })
            }
            placeholder="https://linkedin.com/company/competitor"
          />
        </SignalSection>
      </div>
    </div>
  );
}

function StepLeads({
  config,
  setConfig,
}: {
  config: AgentConfig;
  setConfig: (c: AgentConfig) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium tracking-[-0.04em] text-foreground">Leads Management</h3>
        <p className="text-sm text-stone mt-1">
          How found leads are organized
        </p>
      </div>

      <div className="clean-card p-5 space-y-4">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={config.leads.autoAddToList}
            onChange={(e) =>
              setConfig({
                ...config,
                leads: { ...config.leads, autoAddToList: e.target.checked },
              })
            }
            className="rounded"
          />
          <span className="font-medium text-foreground">Automatically add found leads to list</span>
        </label>
        <p className="text-xs text-stone">
          Lists help organize contacts and launch campaigns
        </p>

        <div>
          <label className="block text-sm text-muted-foreground mb-1.5">List name</label>
          <Input
            value={config.leads.listName}
            onChange={(e) =>
              setConfig({
                ...config,
                leads: { ...config.leads, listName: e.target.value },
              })
            }
            placeholder="e.g., AI Marketing Founders Q1"
          />
        </div>
      </div>
    </div>
  );
}

// ── Wizard Steps ────────────────────────────────────────────────────────

const STEPS = [
  { id: "icp", label: "ICP", subtitle: "Ideal Customer Profile" },
  { id: "signals", label: "Signals", subtitle: "Intent Signals" },
  { id: "leads", label: "Leads", subtitle: "Leads Management" },
];

// ── Agent Editor ────────────────────────────────────────────────────────

function AgentEditor({
  agent,
  onBack,
  onSave,
}: {
  agent: AgentConfig;
  onBack: () => void;
  onSave: (config: AgentConfig) => void | Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<AgentConfig>(agent);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save agent");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-muted-foreground hover:bg-muted/40">
        <ArrowLeft className="size-3.5" />
        Back to agents
      </Button>

      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-medium tracking-[-0.04em] text-foreground">Edit Agent</h2>
        <Badge variant="outline" className="text-terracotta border-border">{config.name}</Badge>
        <div className="ml-auto inline-flex rounded-lg border border-border bg-card p-1">
          {(["draft", "active", "paused"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, status }))}
              className={`rounded-md px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.15em] transition-colors ${
                config.status === status
                  ? status === "active"
                    ? "bg-success/15 text-success"
                    : status === "paused"
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-muted/60 text-foreground"
                  : "text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex gap-6">
        {/* Step sidebar */}
        <div className="w-52 shrink-0 space-y-2">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setStep(i)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                i === step
                  ? "bg-brand/10 border border-brand/20"
                  : i < step
                    ? "bg-success/5 border border-success/10"
                    : "bg-card border border-border"
              }`}
            >
              <span
                className={`size-7 rounded-full flex items-center justify-center text-xs font-medium ${
                  i < step
                    ? "bg-success/20 text-success"
                    : i === step
                      ? "bg-[rgba(148,163,184,0.15)] text-terracotta"
                      : "bg-muted/40 text-stone"
                }`}
              >
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              <div>
                <p className={`text-sm font-medium ${
                  i === step ? "text-terracotta" : i < step ? "text-success" : "text-stone"
                }`}>
                  {s.label}
                </p>
                <p className="text-xs text-stone">{s.subtitle}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 clean-card p-6">
          {step === 0 && <StepICP config={config} setConfig={setConfig} />}
          {step === 1 && <StepSignals config={config} setConfig={setConfig} />}
          {step === 2 && <StepLeads config={config} setConfig={setConfig} />}

          <Separator className="my-6 bg-muted/60" />

          <div className="flex justify-between">
            <Button
              variant="ghost"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="text-muted-foreground hover:bg-muted/40"
            >
              Previous
            </Button>
            {step < 2 ? (
              <Button onClick={() => setStep(step + 1)} className="bg-brand text-white hover:bg-brand-hover">
                Next
              </Button>
            ) : (
              <Button
                onClick={handleSave}
                disabled={saving}
                className={saved ? "bg-success hover:bg-success text-white" : "bg-brand text-white hover:bg-brand-hover"}
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 mr-1.5 animate-spin" /> Saving...
                  </>
                ) : saved ? (
                  <>
                    <Check className="size-4 mr-1.5" /> Saved
                  </>
                ) : (
                  "Save Agent"
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Agent List (main view) ──────────────────────────────────────────────

export default function AgentPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [editing, setEditing] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingAgentId, setSavingAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function newAgentDraft(): AgentConfig {
    return {
      name: `Signal Agent ${agents.length + 1}`,
      status: "draft",
      icp: {
        jobTitles: [],
        locations: [],
        industries: [],
        companySizes: [],
        excludeKeywords: [],
        matchingMode: "discovery",
      },
      signals: {
        companyPage: "",
        personalProfile: "",
        trackProfileVisitors: false,
        trackCompanyFollowers: false,
        engagementKeywords: [],
        watchProfiles: [],
        neverTargetProfiles: [],
        triggerEvents: {
          topActiveProfiles: false,
          recentFunding: false,
          jobChanges: false,
        },
        competitorPages: [],
      },
      leads: {
        autoAddToList: true,
        listName: "",
      },
    };
  }

  async function persistAgent(nextAgent: AgentConfig) {
    const agentKey = nextAgent.id || nextAgent.name;
    setSavingAgentId(agentKey);
    setError(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextAgent),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Failed to save agent");
      }
      const saved = (body.agent || nextAgent) as AgentConfig;
      setAgents((prev) =>
        prev.some((agent) => (agent.id || agent.name) === agentKey)
          ? prev.map((agent) =>
              (agent.id || agent.name) === agentKey
                ? {
                    ...agent,
                    ...saved,
                    signals: {
                      ...agent.signals,
                      ...(saved.signals || {}),
                    },
                  }
                : agent
            )
          : [...prev, saved]
      );
      return saved;
    } catch (persistError) {
      setError(persistError instanceof Error ? persistError.message : "Failed to save agent");
      throw persistError;
    } finally {
      setSavingAgentId(null);
    }
  }

  useEffect(() => {
    fetch("/api/agent")
      .then((r) => r.json())
      .then((d) => {
        const loaded = (d.agents || []).map((a: Record<string, unknown>) => ({
          ...a,
          signals: {
            ...(((a.signals || {}) as Record<string, unknown>)),
            neverTargetProfiles: Array.isArray((a.signals as Record<string, unknown> | undefined)?.neverTargetProfiles)
              ? ((a.signals as Record<string, unknown>).neverTargetProfiles as string[])
              : [],
          },
          leads: { autoAddToList: true, listName: "" },
        }));
        setAgents(loaded);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-stone" />
      </div>
    );
  }

  if (editing) {
    return (
      <AgentEditor
        agent={editing}
        onBack={() => setEditing(null)}
        onSave={async (updated) => {
          const saved = await persistAgent(updated);
          if ((editing.id || editing.name) === (saved.id || saved.name)) {
            setEditing(saved);
          }
          setEditing(null);
        }}
      />
    );
  }

  const activeAgentsCount = agents.filter((agent) => agent.status === "active").length;

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6">
      {/* Header */}
      <div className="clean-card overflow-hidden">
        <div className="px-6 py-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-xl bg-brand/15 border border-border flex items-center justify-center">
                <Claudio size={32} mood="wave" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-medium tracking-[-0.04em] text-gradient">Signals Agents</h2>
                  <Badge className="text-[10px] uppercase bg-success/10 text-success border-none px-2 py-0.5 rounded-full">
                    {activeAgentsCount} ACTIVE
                  </Badge>
                  <span className="text-[10px] font-mono text-stone tracking-[0.15em] uppercase">
                    Slot {agents.length} / 5
                  </span>
                </div>
                <p className="text-sm text-stone mt-1">
                  Manage your automated lead generation agents &amp; signals
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setEditing(newAgentDraft())}
              className="gap-2 px-5 py-5 rounded-xl bg-brand text-white hover:bg-brand-hover text-[10px] font-medium uppercase tracking-[0.2em] transition-all hover:scale-105 active:scale-95"
            >
              <Plus className="size-4" />
              Launch Agent
            </Button>
          </div>
        </div>
      </div>
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {/* Agent table */}
      <div className="clean-card overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_8rem_18rem] items-center gap-6 px-6 py-4 font-ui text-[10px] font-medium tracking-[0.2em] text-stone uppercase border-b border-border">
          <span>Agent Identity</span>
          <span className="text-center">Engine Signals</span>
          <span className="text-right">Control Deck</span>
        </div>
        <div className="divide-y divide-border">
          {agents.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Bot className="mx-auto mb-3 size-8 text-stone opacity-40" />
              <p className="text-sm font-medium text-foreground">No signal agents yet</p>
              <p className="mt-1 text-xs text-stone">Click Launch Agent to configure your first ICP and signals.</p>
            </div>
          ) : null}
          {agents.map((agent) => {
            const agentKey = agent.id || agent.name;
            const statusDotClass =
              agent.status === "active"
                ? "bg-success"
                : agent.status === "paused"
                  ? "bg-amber-500"
                  : "bg-stone";
            const statusButtonLabel =
              agent.status === "active" ? "Pause" : agent.status === "paused" ? "Resume" : "Activate";
            const nextStatus =
              agent.status === "active" ? "paused" : "active";
            const isSavingStatus = savingAgentId === agentKey;
            return (
            <div
              key={agentKey}
              className="grid grid-cols-[minmax(0,1fr)_8rem_18rem] items-center gap-6 px-6 py-6 transition-all duration-200 hover:bg-muted/20 group"
            >
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="size-12 rounded-xl bg-brand/10 border border-border flex items-center justify-center overflow-hidden">
                    <Claudio size={32} mood={agent.status === "active" ? "bounce" : "blink"} />
                  </div>
                  <div className={`absolute -top-1 -right-1 size-3.5 rounded-full border-2 border-card ${statusDotClass}`} />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-lg tracking-[-0.02em] text-foreground group-hover:text-terracotta transition-colors">{agent.name}</span>
                    <Badge
                      className={`text-[9px] uppercase px-2 py-0 border-none rounded-full ${
                        agent.status === "active"
                          ? "bg-success/10 text-success"
                          : "bg-muted/40 text-stone"
                      }`}
                    >
                      {agent.status}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-stone mt-1">
                    Targeting: {agent.icp.jobTitles.slice(0, 3).join(" / ")}
                    {agent.icp.jobTitles.length > 3 && ` +${agent.icp.jobTitles.length - 3} more`}
                  </p>
                </div>
              </div>

              <div className="text-center">
                <div className="inline-flex flex-col items-center">
                  <span className="text-2xl font-medium stat-glow text-foreground">{countSignals(agent)}</span>
                  <span className="font-ui text-[9px] text-stone uppercase tracking-wide mt-0.5">Active Signals</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 flex-nowrap shrink-0">
                <Button
                  variant={agent.status === "active" ? "outline" : "default"}
                  size="sm"
                  className={agent.status === "active"
                    ? "border-border text-muted-foreground text-[10px] uppercase tracking-[0.15em] h-9 px-4 rounded-lg hover:bg-muted/40"
                    : "bg-brand text-white hover:bg-brand-hover text-[10px] uppercase tracking-[0.15em] h-9 px-4 rounded-lg"}
                  disabled={isSavingStatus}
                  onClick={() => {
                    void persistAgent({ ...agent, status: nextStatus });
                  }}
                >
                  {isSavingStatus ? <Loader2 className="size-3.5 mr-2 animate-spin" /> : null}
                  {isSavingStatus ? "Saving..." : statusButtonLabel}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-brand/20 text-terracotta text-[10px] uppercase tracking-[0.15em] h-9 px-4 rounded-lg hover:bg-brand/10"
                  onClick={() => setEditing(agent)}
                >
                  <Pencil className="size-3.5 mr-2" />
                  Configure
                </Button>
              </div>
            </div>
          )})}
        </div>
      </div>
    </div>
  );
}
