import type { BrainExperiment, BrainSnapshot, ExperimentExposure, Lead } from "../types";
import { DEFAULT_WORKSPACE_ID } from "../store-local";
import { getSupabaseAdminClient } from "../supabase/admin";

function normalizeWorkspaceId(workspaceId?: string | null): string {
  return workspaceId || DEFAULT_WORKSPACE_ID;
}

function ensureNoError(error: { message: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function maybeRecord<T extends Record<string, unknown>>(value: unknown, fallback: T): T {
  return value && typeof value === "object" && !Array.isArray(value) ? value as T : fallback;
}

function maybeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

type BrainSnapshotRow = {
  id: string;
  workspace_id: string;
  analyzed_at: string;
  leads_analyzed: number;
  campaigns_analyzed: number;
  patterns: unknown;
  recommendations: unknown;
  active_experiment_id: string | null;
};

type BrainExperimentRow = {
  id: string;
  workspace_id: string;
  campaign_id: string;
  language: string | null;
  variable: BrainExperiment["variable"];
  hypothesis: string;
  reasoning: string;
  control: unknown;
  challenger: unknown;
  status: BrainExperiment["status"];
  split_ratio: number;
  min_sample_per_arm: number;
  max_duration_days: number;
  control_lead_ids: unknown;
  challenger_lead_ids: unknown;
  mutation_axis: string | null;
  context_snapshot: unknown;
  results: unknown;
  previous_config: unknown;
  proposed_at: string;
  approved_at: string | null;
  started_at: string | null;
  evaluated_at: string | null;
  decided_at: string | null;
};

type ExperimentExposureRow = {
  id: string;
  experiment_id: string;
  workspace_id: string;
  campaign_id: string;
  lead_id: string;
  provider_id: string;
  language: Lead["language"];
  experiment_arm: "control" | "challenger";
  template_index: number;
  template_hash: string | null;
  assigned_at: string;
  sent_at: string;
  accepted_at: string | null;
  replied_at: string | null;
  updated_at: string;
};

function mapSnapshot(row: BrainSnapshotRow): BrainSnapshot {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    analyzedAt: row.analyzed_at,
    leadsAnalyzed: row.leads_analyzed,
    campaignsAnalyzed: row.campaigns_analyzed,
    patterns: maybeRecord(row.patterns, {
      bySegment: {},
      byLanguage: {},
      byNetworkDistance: {},
      byTemplateIndex: {},
      byDayOfWeek: {},
      byAiScoreBucket: {},
      byCampaign: {},
      avgDaysToAccept: null,
      avgDaysToReply: null,
      overall: {
        total: 0,
        sent: 0,
        accepted: 0,
        replied: 0,
        connectRate: 0,
        replyRate: 0,
        replyOfAccepted: 0,
      },
    }),
    recommendations: maybeArray(row.recommendations),
    activeExperimentId: row.active_experiment_id || undefined,
  };
}

function snapshotToRow(snapshot: BrainSnapshot): BrainSnapshotRow {
  return {
    id: snapshot.id,
    workspace_id: normalizeWorkspaceId(snapshot.workspaceId),
    analyzed_at: snapshot.analyzedAt,
    leads_analyzed: snapshot.leadsAnalyzed,
    campaigns_analyzed: snapshot.campaignsAnalyzed,
    patterns: snapshot.patterns,
    recommendations: snapshot.recommendations,
    active_experiment_id: snapshot.activeExperimentId || null,
  };
}

function mapExperiment(row: BrainExperimentRow): BrainExperiment {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id,
    language: row.language || undefined,
    variable: row.variable,
    hypothesis: row.hypothesis,
    reasoning: row.reasoning,
    control: maybeRecord(row.control, {
      name: "control",
      description: "",
    }),
    challenger: maybeRecord(row.challenger, {
      name: "challenger",
      description: "",
    }),
    status: row.status,
    splitRatio: Number(row.split_ratio),
    minSamplePerArm: row.min_sample_per_arm,
    maxDurationDays: row.max_duration_days,
    controlLeadIds: maybeArray(row.control_lead_ids),
    challengerLeadIds: maybeArray(row.challenger_lead_ids),
    mutationAxis: row.mutation_axis || undefined,
    contextSnapshot: row.context_snapshot ? row.context_snapshot as BrainExperiment["contextSnapshot"] : undefined,
    results: row.results ? row.results as NonNullable<BrainExperiment["results"]> : undefined,
    previousConfig: row.previous_config ? row.previous_config as NonNullable<BrainExperiment["previousConfig"]> : undefined,
    proposedAt: row.proposed_at,
    approvedAt: row.approved_at || undefined,
    startedAt: row.started_at || undefined,
    evaluatedAt: row.evaluated_at || undefined,
    decidedAt: row.decided_at || undefined,
  };
}

function experimentToRow(experiment: BrainExperiment): BrainExperimentRow {
  return {
    id: experiment.id,
    workspace_id: normalizeWorkspaceId(experiment.workspaceId),
    campaign_id: experiment.campaignId,
    language: experiment.language || null,
    variable: experiment.variable,
    hypothesis: experiment.hypothesis,
    reasoning: experiment.reasoning,
    control: experiment.control,
    challenger: experiment.challenger,
    status: experiment.status,
    split_ratio: experiment.splitRatio,
    min_sample_per_arm: experiment.minSamplePerArm,
    max_duration_days: experiment.maxDurationDays,
    control_lead_ids: experiment.controlLeadIds,
    challenger_lead_ids: experiment.challengerLeadIds,
    mutation_axis: experiment.mutationAxis || null,
    context_snapshot: experiment.contextSnapshot || null,
    results: experiment.results || null,
    previous_config: experiment.previousConfig || null,
    proposed_at: experiment.proposedAt,
    approved_at: experiment.approvedAt || null,
    started_at: experiment.startedAt || null,
    evaluated_at: experiment.evaluatedAt || null,
    decided_at: experiment.decidedAt || null,
  };
}

function mapExposure(row: ExperimentExposureRow): ExperimentExposure {
  return {
    id: row.id,
    experimentId: row.experiment_id,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id,
    leadId: row.lead_id,
    providerId: row.provider_id,
    language: row.language,
    experimentArm: row.experiment_arm,
    templateIndex: row.template_index,
    templateHash: row.template_hash || undefined,
    assignedAt: row.assigned_at,
    sentAt: row.sent_at,
    acceptedAt: row.accepted_at || undefined,
    repliedAt: row.replied_at || undefined,
    updatedAt: row.updated_at,
  };
}

function exposureToRow(exposure: ExperimentExposure): ExperimentExposureRow {
  return {
    id: exposure.id,
    experiment_id: exposure.experimentId,
    workspace_id: normalizeWorkspaceId(exposure.workspaceId),
    campaign_id: exposure.campaignId,
    lead_id: exposure.leadId,
    provider_id: exposure.providerId,
    language: exposure.language,
    experiment_arm: exposure.experimentArm,
    template_index: exposure.templateIndex,
    template_hash: exposure.templateHash || null,
    assigned_at: exposure.assignedAt,
    sent_at: exposure.sentAt,
    accepted_at: exposure.acceptedAt || null,
    replied_at: exposure.repliedAt || null,
    updated_at: exposure.updatedAt,
  };
}

export function generateExperimentId(): string {
  return "exp_" + Math.random().toString(36).substring(2, 10);
}

export async function saveSnapshot(snapshot: BrainSnapshot): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("brain_snapshots")
    .upsert(snapshotToRow(snapshot), { onConflict: "id" });

  ensureNoError(error, `saveSnapshot(${snapshot.id})`);
}

export async function getLatestSnapshot(workspaceId?: string): Promise<BrainSnapshot | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("brain_snapshots")
    .select("*")
    .eq("workspace_id", normalizeWorkspaceId(workspaceId))
    .order("analyzed_at", { ascending: false })
    .limit(1)
    .maybeSingle<BrainSnapshotRow>();

  ensureNoError(error, "getLatestSnapshot");
  return data ? mapSnapshot(data) : null;
}

export async function listSnapshots(limit = 10, workspaceId?: string): Promise<BrainSnapshot[]> {
  const supabase = getSupabaseAdminClient();
  const query = supabase
    .from("brain_snapshots")
    .select("*")
    .order("analyzed_at", { ascending: false })
    .limit(limit);

  if (workspaceId) query.eq("workspace_id", workspaceId);

  const { data, error } = await query;
  ensureNoError(error, "listSnapshots");
  return (data as BrainSnapshotRow[] || []).map(mapSnapshot);
}

export async function saveExperiment(experiment: BrainExperiment): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("brain_experiments")
    .upsert(experimentToRow(experiment), { onConflict: "id" });

  ensureNoError(error, `saveExperiment(${experiment.id})`);
}

export async function getExperiment(id: string): Promise<BrainExperiment | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("brain_experiments")
    .select("*")
    .eq("id", id)
    .maybeSingle<BrainExperimentRow>();

  ensureNoError(error, `getExperiment(${id})`);
  return data ? mapExperiment(data) : null;
}

export async function listExperiments(workspaceId?: string, limit = 20): Promise<BrainExperiment[]> {
  const supabase = getSupabaseAdminClient();
  const query = supabase
    .from("brain_experiments")
    .select("*")
    .order("proposed_at", { ascending: false })
    .limit(limit);

  if (workspaceId) query.eq("workspace_id", workspaceId);

  const { data, error } = await query;
  ensureNoError(error, "listExperiments");
  return (data as BrainExperimentRow[] || []).map(mapExperiment);
}

export async function getActiveExperiment(workspaceId?: string): Promise<BrainExperiment | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("brain_experiments")
    .select("*")
    .eq("workspace_id", normalizeWorkspaceId(workspaceId))
    .in("status", ["approved", "running"])
    .order("started_at", { ascending: false, nullsFirst: false })
    .order("approved_at", { ascending: false, nullsFirst: false })
    .order("proposed_at", { ascending: false })
    .limit(1)
    .maybeSingle<BrainExperimentRow>();

  ensureNoError(error, "getActiveExperiment");
  return data ? mapExperiment(data) : null;
}

export async function updateExperiment(id: string, updates: Partial<BrainExperiment>): Promise<BrainExperiment | null> {
  const existing = await getExperiment(id);
  if (!existing) return null;
  const next = { ...existing, ...updates };
  await saveExperiment(next);
  return next;
}

function getLeadEventTs(lead: Lead, type: "invite_sent" | "accepted" | "replied"): string | undefined {
  return lead.events.find((event) => event.type === type)?.ts;
}

export async function upsertExperimentExposure(lead: Lead): Promise<ExperimentExposure | null> {
  if (!lead.id || !lead.experimentId || !lead.experimentArm || typeof lead.templateIndex !== "number") {
    return null;
  }

  const sentAt = getLeadEventTs(lead, "invite_sent");
  if (!sentAt) return null;

  const now = new Date().toISOString();
  const exposure: ExperimentExposure = {
    id: `${lead.experimentId}:${lead.id}`,
    experimentId: lead.experimentId,
    workspaceId: lead.workspaceId,
    campaignId: lead.campaignId,
    leadId: lead.id,
    providerId: lead.providerId,
    language: lead.language,
    experimentArm: lead.experimentArm,
    templateIndex: lead.templateIndex,
    templateHash: lead.templateHash,
    assignedAt: lead.createdAt || sentAt,
    sentAt,
    acceptedAt: getLeadEventTs(lead, "accepted"),
    repliedAt: getLeadEventTs(lead, "replied"),
    updatedAt: now,
  };

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("experiment_exposures")
    .upsert(exposureToRow(exposure), { onConflict: "id" });

  ensureNoError(error, `upsertExperimentExposure(${exposure.id})`);
  return exposure;
}

export async function listExperimentExposures(experimentId: string, workspaceId?: string): Promise<ExperimentExposure[]> {
  const supabase = getSupabaseAdminClient();
  const query = supabase
    .from("experiment_exposures")
    .select("*")
    .eq("experiment_id", experimentId)
    .order("sent_at", { ascending: true });

  if (workspaceId) query.eq("workspace_id", workspaceId);

  const { data, error } = await query;
  ensureNoError(error, `listExperimentExposures(${experimentId})`);
  return (data as ExperimentExposureRow[] || []).map(mapExposure);
}
