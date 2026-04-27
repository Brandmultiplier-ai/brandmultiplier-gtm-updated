import type {
  Agent,
  Campaign,
  CampaignStats,
  ContactList,
  DiscoveryRun,
  Lead,
  LeadStatus,
  LinkedInSeat,
  SignalCandidate,
  SignalCandidateStatus,
  SignalKind,
  Workspace,
  WorkspaceTemplate,
} from "./types";
import { DEFAULT_WORKSPACE_ID } from "./store-local";
import { getSupabaseAdminClient } from "./supabase/admin";
import { buildSignalCandidateId, mergeSignalCandidateStatus } from "./signal-candidates";

type WorkspaceScoped = { workspaceId?: string };

function normalizeWorkspaceId(workspaceId?: string | null): string {
  return workspaceId || DEFAULT_WORKSPACE_ID;
}

function matchesWorkspace(record: WorkspaceScoped, workspaceId?: string): boolean {
  if (!workspaceId) return true;
  return normalizeWorkspaceId(record.workspaceId) === workspaceId;
}

function nanoid(prefix: string): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}_${id}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "workspace";
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalWeek(date: Date): Date {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function maybeRecord<T extends Record<string, unknown>>(value: unknown, fallback: T): T {
  return value && typeof value === "object" && !Array.isArray(value) ? value as T : fallback;
}

function maybeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function ensureNoError(error: { message: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  status: Workspace["status"];
  niche: string;
  default_language: Workspace["defaultLanguage"];
  channels: unknown;
  created_at: string;
  updated_at: string;
};

type AgentRow = {
  id: string;
  workspace_id: string;
  name: string;
  status: Agent["status"];
  icp: unknown;
  signals: unknown;
  voice: unknown;
  limits: unknown;
  message_templates: unknown;
  template_weights: unknown;
  linkedin_account_id: string | null;
  created_at: string;
  updated_at: string;
};

type CampaignRow = {
  id: string;
  workspace_id: string;
  agent_id: string;
  linkedin_seat_id: string | null;
  name: string;
  status: Campaign["status"];
  segment: string;
  search: unknown;
  sequence: unknown;
  execution: unknown;
  settings: unknown;
  created_at: string;
  updated_at: string;
};

type LeadRow = {
  id: string;
  workspace_id: string;
  campaign_id: string;
  provider_id: string;
  name: string;
  headline: string;
  company: string;
  location: string;
  public_identifier: string;
  network_distance: string;
  profile_picture_url: string | null;
  segment: string;
  language: Lead["language"];
  ai_score: number;
  signal: string;
  status: LeadStatus;
  current_step: number;
  events: unknown;
  template_index: number | null;
  template_hash: string | null;
  experiment_id: string | null;
  experiment_arm: Lead["experimentArm"] | null;
  approved: boolean | null;
  copilot_edits: unknown;
  unipile_chat_id: string | null;
  company_size: string | null;
  industry: string | null;
  company_description: string | null;
  company_linkedin_url: string | null;
  created_at: string;
  updated_at: string;
};

type WorkspaceTemplateRow = {
  id: string;
  workspace_id: string;
  name: string;
  content: string;
  language: WorkspaceTemplate["language"];
  type: WorkspaceTemplate["type"];
  step: number;
  created_at: string;
  updated_at: string;
};

type ContactListRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  lead_ids: string[];
  created_at: string;
  updated_at: string;
};

type LinkedInSeatRow = {
  id: string;
  workspace_id: string;
  name: string;
  status: LinkedInSeat["status"];
  country: string;
  unipile_account_id: string;
  is_default: boolean;
  provider_connection_id: string | null;
  quotas: unknown;
  schedule: unknown;
  usage: unknown;
  created_at: string;
  updated_at: string;
};

type DiscoveryRunRow = {
  id: string;
  workspace_id: string;
  agent_id: string;
  started_at: string;
  completed_at: string;
  status: DiscoveryRun["status"];
  sources: unknown;
  total_discovered: number;
  total_duplicates: number;
  total_saved: number;
  errors: unknown;
};

type SignalCandidateRow = {
  id: string;
  workspace_id: string;
  agent_id: string;
  campaign_id: string | null;
  lead_id: string | null;
  provider_id: string;
  name: string;
  headline: string;
  location: string;
  public_identifier: string;
  network_distance: string;
  signal_source: SignalCandidate["signalSource"];
  signal_context: string;
  source_post_id: string | null;
  topic_key?: string | null;
  topic_label?: string | null;
  signal_kind?: SignalKind | null;
  signal_payload?: Record<string, unknown> | null;
  language: SignalCandidate["language"];
  icp_fit: number | string;
  intent_score: number;
  total_score: number | string;
  score_reasoning: string;
  status: SignalCandidateStatus;
  created_at: string;
  updated_at: string;
};

type OutreachRunRow = {
  id: number;
  workspace_id: string;
  campaign_id: string | null;
  ts: string;
  payload: Record<string, unknown> | null;
};

type WebhookEventRow = {
  id: number;
  workspace_id: string;
  ts: string;
  event_type: string | null;
  provider_id: string | null;
  campaign_id: string | null;
  lead_id: string | null;
  payload: Record<string, unknown> | null;
};

function mapWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    niche: row.niche,
    defaultLanguage: row.default_language,
    channels: maybeRecord(row.channels, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function workspaceToRow(workspace: Workspace): WorkspaceRow {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    status: workspace.status,
    niche: workspace.niche,
    default_language: workspace.defaultLanguage,
    channels: workspace.channels || {},
    created_at: workspace.createdAt,
    updated_at: workspace.updatedAt,
  };
}

function mapAgent(row: AgentRow): Agent {
  const signals = maybeRecord(row.signals, AgentDefaults.signals);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    status: row.status,
    icp: maybeRecord(row.icp, AgentDefaults.icp),
    signals: {
      ...AgentDefaults.signals,
      ...signals,
      triggerEvents: {
        ...AgentDefaults.signals.triggerEvents,
        ...maybeRecord(signals.triggerEvents, AgentDefaults.signals.triggerEvents),
      },
    },
    voice: maybeRecord(row.voice, AgentDefaults.voice),
    limits: maybeRecord(row.limits, AgentDefaults.limits),
    messageTemplates: maybeRecord(row.message_templates, {}),
    templateWeights: row.template_weights ? maybeRecord(row.template_weights, {}) : undefined,
    linkedinAccountId: row.linkedin_account_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function agentToRow(agent: Agent): AgentRow {
  return {
    id: agent.id,
    workspace_id: agent.workspaceId,
    name: agent.name,
    status: agent.status,
    icp: agent.icp,
    signals: agent.signals,
    voice: agent.voice,
    limits: agent.limits,
    message_templates: agent.messageTemplates || {},
    template_weights: agent.templateWeights || null,
    linkedin_account_id: agent.linkedinAccountId || null,
    created_at: agent.createdAt,
    updated_at: agent.updatedAt,
  };
}

const AgentDefaults: Pick<Agent, "icp" | "signals" | "voice" | "limits"> = {
  icp: {
    jobTitles: [],
    locations: [],
    industries: [],
    companySizes: [],
    excludeKeywords: [],
    matchingMode: "discovery",
  },
  signals: {
    personalProfile: "",
    companyPage: "",
    trackProfileVisitors: false,
    trackCompanyFollowers: false,
    selectedTopics: [],
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
  voice: {
    it: { tone: "", constraints: [] },
    en: { tone: "", constraints: [] },
  },
  limits: {
    invitesPerDay: 0,
    invitesPerWeek: 0,
    delayBetweenInvitesMs: 0,
    maxMessageLength: 300,
  },
};

function mapCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    linkedinSeatId: row.linkedin_seat_id || undefined,
    name: row.name,
    status: row.status,
    segment: row.segment,
    search: maybeRecord(row.search, {
      keywords: "",
      titleFilter: "",
      language: "en",
      locations: [],
    }),
    sequence: maybeArray(row.sequence),
    execution: row.execution ? maybeRecord(row.execution, {}) : undefined,
    settings: row.settings ? maybeRecord(row.settings, {}) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function campaignToRow(campaign: Campaign): CampaignRow {
  return {
    id: campaign.id,
    workspace_id: campaign.workspaceId,
    agent_id: campaign.agentId,
    linkedin_seat_id: campaign.linkedinSeatId || null,
    name: campaign.name,
    status: campaign.status,
    segment: campaign.segment,
    search: campaign.search,
    sequence: campaign.sequence,
    execution: campaign.execution || null,
    settings: campaign.settings || null,
    created_at: campaign.createdAt,
    updated_at: campaign.updatedAt,
  };
}

function mapLead(row: LeadRow): Lead {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id,
    providerId: row.provider_id,
    name: row.name,
    headline: row.headline,
    company: row.company,
    location: row.location,
    publicIdentifier: row.public_identifier,
    networkDistance: row.network_distance,
    profilePictureUrl: row.profile_picture_url || undefined,
    segment: row.segment,
    language: row.language,
    aiScore: Number(row.ai_score || 0),
    signal: row.signal,
    status: row.status,
    currentStep: row.current_step,
    events: maybeArray(row.events),
    templateIndex: typeof row.template_index === "number" ? row.template_index : undefined,
    templateHash: row.template_hash || undefined,
    experimentId: row.experiment_id || undefined,
    experimentArm: row.experiment_arm || undefined,
    approved: typeof row.approved === "boolean" ? row.approved : undefined,
    copilotEdits: row.copilot_edits ? maybeRecord(row.copilot_edits, {}) : undefined,
    unipileChatId: row.unipile_chat_id || undefined,
    companySize: row.company_size || undefined,
    industry: row.industry || undefined,
    companyDescription: row.company_description || undefined,
    companyLinkedInUrl: row.company_linkedin_url || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function leadToRow(lead: Lead): LeadRow {
  return {
    id: lead.id,
    workspace_id: lead.workspaceId,
    campaign_id: lead.campaignId,
    provider_id: lead.providerId,
    name: lead.name,
    headline: lead.headline,
    company: lead.company,
    location: lead.location,
    public_identifier: lead.publicIdentifier,
    network_distance: lead.networkDistance,
    profile_picture_url: lead.profilePictureUrl || null,
    segment: lead.segment,
    language: lead.language,
    ai_score: lead.aiScore,
    signal: lead.signal,
    status: lead.status,
    current_step: lead.currentStep,
    events: lead.events,
    template_index: typeof lead.templateIndex === "number" ? lead.templateIndex : null,
    template_hash: lead.templateHash || null,
    experiment_id: lead.experimentId || null,
    experiment_arm: lead.experimentArm || null,
    approved: typeof lead.approved === "boolean" ? lead.approved : null,
    copilot_edits: lead.copilotEdits || null,
    unipile_chat_id: lead.unipileChatId || null,
    company_size: lead.companySize || null,
    industry: lead.industry || null,
    company_description: lead.companyDescription || null,
    company_linkedin_url: lead.companyLinkedInUrl || null,
    created_at: lead.createdAt,
    updated_at: lead.updatedAt,
  };
}

function mapTemplate(row: WorkspaceTemplateRow): WorkspaceTemplate {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    content: row.content,
    language: row.language,
    type: row.type,
    step: row.step,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLinkedInSeat(row: LinkedInSeatRow): LinkedInSeat {
  const now = new Date();
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    status: row.status,
    country: row.country,
    unipileAccountId: row.unipile_account_id,
    providerConnectionId: row.provider_connection_id || undefined,
    isDefault: row.is_default,
    quotas: maybeRecord(row.quotas, {
      profileLookupsPerWeek: 30,
      invitationsPerWeek: 35,
      messagesPerWeek: 70,
    }),
    schedule: maybeRecord(row.schedule, {
      timezone: "Europe/Lisbon",
      launchHour: 15,
      randomizedLaunchWindowHours: 4,
      activeDays: {
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: false,
        sunday: false,
      },
      warmup: {
        enabled: false,
        rampEveryDays: 2,
      },
    }),
    usage: maybeRecord(row.usage, {
      weekKey: localDateKey(startOfLocalWeek(now)),
      dayKey: localDateKey(now),
      invitationsUsed: 0,
      messagesUsed: 0,
      profileLookupsUsed: 0,
      prospectingRunsToday: 0,
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function linkedInSeatToRow(seat: LinkedInSeat): LinkedInSeatRow {
  return {
    id: seat.id,
    workspace_id: seat.workspaceId,
    name: seat.name,
    status: seat.status,
    country: seat.country,
    unipile_account_id: seat.unipileAccountId,
    provider_connection_id: seat.providerConnectionId || null,
    is_default: Boolean(seat.isDefault),
    quotas: seat.quotas,
    schedule: seat.schedule,
    usage: seat.usage,
    created_at: seat.createdAt,
    updated_at: seat.updatedAt,
  };
}

function templateToRow(template: WorkspaceTemplate): WorkspaceTemplateRow {
  return {
    id: template.id,
    workspace_id: template.workspaceId,
    name: template.name,
    content: template.content,
    language: template.language,
    type: template.type,
    step: template.step,
    created_at: template.createdAt,
    updated_at: template.updatedAt,
  };
}

function mapContactList(row: ContactListRow): ContactList {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description || undefined,
    leadIds: Array.isArray(row.lead_ids) ? row.lead_ids : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function contactListToRow(list: ContactList): ContactListRow {
  return {
    id: list.id,
    workspace_id: list.workspaceId,
    name: list.name,
    description: list.description || null,
    lead_ids: Array.from(new Set(list.leadIds || [])),
    created_at: list.createdAt,
    updated_at: list.updatedAt,
  };
}

function mapDiscoveryRun(row: DiscoveryRunRow): DiscoveryRun {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    sources: maybeRecord(row.sources, {}),
    totalDiscovered: row.total_discovered,
    totalDuplicates: row.total_duplicates,
    totalSaved: row.total_saved,
    errors: maybeArray(row.errors),
  };
}

function discoveryRunToRow(run: DiscoveryRun): DiscoveryRunRow {
  return {
    id: run.id,
    workspace_id: normalizeWorkspaceId(run.workspaceId),
    agent_id: run.agentId,
    started_at: run.startedAt,
    completed_at: run.completedAt,
    status: run.status,
    sources: run.sources,
    total_discovered: run.totalDiscovered,
    total_duplicates: run.totalDuplicates,
    total_saved: run.totalSaved,
    errors: run.errors,
  };
}

function mapSignalCandidate(row: SignalCandidateRow): SignalCandidate {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    campaignId: row.campaign_id || undefined,
    leadId: row.lead_id || undefined,
    providerId: row.provider_id,
    name: row.name,
    headline: row.headline,
    location: row.location,
    publicIdentifier: row.public_identifier,
    networkDistance: row.network_distance,
    signalSource: row.signal_source,
    signalContext: row.signal_context,
    sourcePostId: row.source_post_id || undefined,
    topicKey: row.topic_key || undefined,
    topicLabel: row.topic_label || undefined,
    signalKind: row.signal_kind || undefined,
    signalPayload: row.signal_payload || undefined,
    language: row.language,
    icpFit: Number(row.icp_fit),
    intentScore: row.intent_score,
    totalScore: Number(row.total_score),
    scoreReasoning: row.score_reasoning,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function signalCandidateToRow(signal: SignalCandidate): SignalCandidateRow {
  return {
    id: signal.id,
    workspace_id: signal.workspaceId,
    agent_id: signal.agentId,
    campaign_id: signal.campaignId || null,
    lead_id: signal.leadId || null,
    provider_id: signal.providerId,
    name: signal.name,
    headline: signal.headline,
    location: signal.location,
    public_identifier: signal.publicIdentifier,
    network_distance: signal.networkDistance,
    signal_source: signal.signalSource,
    signal_context: signal.signalContext,
    source_post_id: signal.sourcePostId || null,
    topic_key: signal.topicKey || null,
    topic_label: signal.topicLabel || null,
    signal_kind: signal.signalKind || null,
    signal_payload: signal.signalPayload || {},
    language: signal.language,
    icp_fit: signal.icpFit,
    intent_score: signal.intentScore,
    total_score: signal.totalScore,
    score_reasoning: signal.scoreReasoning,
    status: signal.status,
    created_at: signal.createdAt,
    updated_at: signal.updatedAt,
  };
}

function sortTemplates(templates: WorkspaceTemplate[]): WorkspaceTemplate[] {
  return [...templates].sort((a, b) => {
    if (a.language !== b.language) return a.language.localeCompare(b.language);
    if (a.step !== b.step) return a.step - b.step;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function sortLinkedInSeats(seats: LinkedInSeat[]): LinkedInSeat[] {
  return [...seats].sort((a, b) => {
    if (Boolean(a.isDefault) !== Boolean(b.isDefault)) {
      return a.isDefault ? -1 : 1;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

async function seedLinkedInSeatsFromWorkspace(workspaceId: string): Promise<LinkedInSeat[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("linkedin_seats")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });
  ensureNoError(error, `seedLinkedInSeatsFromWorkspace(${workspaceId})`);

  const existing = (data as LinkedInSeatRow[] || []).map(mapLinkedInSeat);
  if (existing.length > 0) {
    return sortLinkedInSeats(existing);
  }

  const workspace = await getWorkspace(workspaceId);
  const fallbackAccountId = (await listAgents(workspaceId)).find((agent) => agent.linkedinAccountId)?.linkedinAccountId || "";
  const accountId = workspace?.channels.linkedin?.unipileAccountId || fallbackAccountId;
  if (!accountId) return [];

  const now = new Date();
  const weekKey = localDateKey(startOfLocalWeek(now));
  const seeded: LinkedInSeat = {
    id: `seat_${workspaceId}`,
    workspaceId,
    name: "Primary LinkedIn Seat",
    status: "active",
    country: "Portugal",
    unipileAccountId: accountId,
    isDefault: true,
    quotas: {
      profileLookupsPerWeek: 30,
      invitationsPerWeek: 35,
      messagesPerWeek: 70,
    },
    schedule: {
      timezone: "Europe/Lisbon",
      launchHour: 15,
      randomizedLaunchWindowHours: 4,
      activeDays: {
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: false,
        sunday: false,
      },
      warmup: {
        enabled: true,
        rampEveryDays: 2,
        startedAt: `${weekKey}T00:00:00.000Z`,
      },
    },
    usage: {
      weekKey,
      dayKey: localDateKey(now),
      invitationsUsed: 0,
      messagesUsed: 0,
      profileLookupsUsed: 0,
      prospectingRunsToday: 0,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const { data: inserted, error: insertError } = await supabase
    .from("linkedin_seats")
    .upsert(linkedInSeatToRow(seeded), { onConflict: "id" })
    .select("*")
    .single<LinkedInSeatRow>();
  ensureNoError(insertError, `seedLinkedInSeatsFromWorkspace(${workspaceId})`);

  return inserted ? [mapLinkedInSeat(inserted)] : [];
}

function resequenceTemplates(templates: WorkspaceTemplate[]): WorkspaceTemplate[] {
  const counters = new Map<string, number>();
  return sortTemplates(templates).map((template) => {
    const nextStep = counters.get(template.language) || 0;
    counters.set(template.language, nextStep + 1);
    return { ...template, step: nextStep };
  });
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", id)
    .maybeSingle<WorkspaceRow>();

  ensureNoError(error, `getWorkspace(${id})`);
  return data ? mapWorkspace(data) : null;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .order("updated_at", { ascending: false });

  ensureNoError(error, "listWorkspaces");
  return (data as WorkspaceRow[] || []).map(mapWorkspace);
}

export async function saveWorkspace(workspace: Workspace): Promise<Workspace> {
  const existing = workspace.id ? await getWorkspace(workspace.id) : null;
  const next: Workspace = {
    ...existing,
    ...workspace,
    id: workspace.id || existing?.id || nanoid("ws"),
    slug: workspace.slug || existing?.slug || slugify(workspace.name || existing?.name || "workspace"),
    status: workspace.status || existing?.status || "active",
    niche: workspace.niche || existing?.niche || "general",
    defaultLanguage: workspace.defaultLanguage || existing?.defaultLanguage || "en",
    channels: workspace.channels || existing?.channels || {},
    createdAt: workspace.createdAt || existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workspaces")
    .upsert(workspaceToRow(next), { onConflict: "id" })
    .select("*")
    .single<WorkspaceRow>();

  ensureNoError(error, `saveWorkspace(${next.id})`);
  if (!data) throw new Error(`saveWorkspace(${next.id}): missing row`);
  return mapWorkspace(data);
}

export async function deleteWorkspace(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("workspaces").delete().eq("id", id);
  ensureNoError(error, `deleteWorkspace(${id})`);
}

async function writeWorkspaceTemplates(workspaceId: string, templates: WorkspaceTemplate[]): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const resequenced = resequenceTemplates(templates).map(templateToRow);
  const { error } = await supabase.from("workspace_templates").upsert(resequenced, { onConflict: "id" });
  ensureNoError(error, `writeWorkspaceTemplates(${workspaceId})`);
}

async function seedWorkspaceTemplatesFromAgents(workspaceId: string): Promise<WorkspaceTemplate[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workspace_templates")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("language", { ascending: true })
    .order("step", { ascending: true })
    .order("created_at", { ascending: true });

  ensureNoError(error, `seedWorkspaceTemplatesFromAgents(${workspaceId})`);
  const existing = (data as WorkspaceTemplateRow[] || []).map(mapTemplate);
  if (existing.length > 0) return resequenceTemplates(existing);

  const agents = await listAgents(workspaceId);
  if (agents.length === 0) return [];

  const seeded: WorkspaceTemplate[] = [];
  for (const agent of agents) {
    for (const [language, templates] of Object.entries(agent.messageTemplates || {})) {
      if (!Array.isArray(templates)) continue;
      templates.forEach((content, index) => {
        seeded.push({
          id: nanoid("tpl"),
          workspaceId,
          name: index === 0 ? `Connection Request (${language})` : `Message ${index} (${language})`,
          content,
          language: language === "it" ? "it" : "en",
          type: index === 0 ? "connection_request" : "message",
          step: index,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });
    }
  }

  if (seeded.length > 0) {
    await writeWorkspaceTemplates(workspaceId, seeded);
  }

  return resequenceTemplates(seeded);
}

export async function listWorkspaceTemplates(workspaceId?: string): Promise<WorkspaceTemplate[]> {
  return seedWorkspaceTemplatesFromAgents(normalizeWorkspaceId(workspaceId));
}

export async function saveWorkspaceTemplate(template: WorkspaceTemplate): Promise<WorkspaceTemplate> {
  const workspaceId = normalizeWorkspaceId(template.workspaceId);
  const existing = await listWorkspaceTemplates(workspaceId);
  const current = template.id
    ? existing.find((item) => item.id === template.id) || null
    : null;

  const next: WorkspaceTemplate = {
    ...current,
    ...template,
    id: template.id || current?.id || nanoid("tpl"),
    workspaceId,
    language: template.language || current?.language || "en",
    type: template.type || current?.type || "message",
    step: typeof template.step === "number"
      ? template.step
      : current?.step ?? existing.filter((item) => item.language === (template.language || current?.language || "en")).length,
    createdAt: current?.createdAt || template.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const nextTemplates = existing.filter((item) => item.id !== next.id);
  nextTemplates.push(next);
  await writeWorkspaceTemplates(workspaceId, nextTemplates);
  await syncWorkspaceTemplatesToAgents(workspaceId);

  return (await listWorkspaceTemplates(workspaceId)).find((item) => item.id === next.id)!;
}

export async function deleteWorkspaceTemplate(id: string, workspaceId?: string): Promise<void> {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const templates = (await listWorkspaceTemplates(resolvedWorkspaceId)).filter((item) => item.id !== id);

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("workspace_templates").delete().eq("id", id).eq("workspace_id", resolvedWorkspaceId);
  ensureNoError(error, `deleteWorkspaceTemplate(${id})`);

  if (templates.length > 0) {
    await writeWorkspaceTemplates(resolvedWorkspaceId, templates);
  }

  await syncWorkspaceTemplatesToAgents(resolvedWorkspaceId);
}

export async function syncWorkspaceTemplatesToAgents(workspaceId?: string): Promise<void> {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const templates = await listWorkspaceTemplates(resolvedWorkspaceId);
  const grouped = templates.reduce<Record<string, string[]>>((acc, template) => {
    acc[template.language] = acc[template.language] || [];
    acc[template.language].push(template.content);
    return acc;
  }, {});

  for (const agent of await listAgents(resolvedWorkspaceId)) {
    const allLanguages = new Set([
      ...Object.keys(agent.messageTemplates || {}),
      ...Object.keys(grouped),
    ]);
    const nextMessageTemplates = Object.fromEntries(
      Array.from(allLanguages).map((language) => [language, grouped[language] || []]),
    );

    await saveAgent({
      ...agent,
      messageTemplates: nextMessageTemplates,
    });
  }
}

export async function listContactLists(workspaceId?: string): Promise<ContactList[]> {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("contact_lists")
    .select("*")
    .eq("workspace_id", resolvedWorkspaceId)
    .order("updated_at", { ascending: false });

  ensureNoError(error, `listContactLists(${resolvedWorkspaceId})`);
  return (data as ContactListRow[] || []).map(mapContactList);
}

export async function saveContactList(list: ContactList): Promise<ContactList> {
  const workspaceId = normalizeWorkspaceId(list.workspaceId);
  const existing = list.id
    ? (await listContactLists(workspaceId)).find((item) => item.id === list.id) || null
    : null;

  const next: ContactList = {
    ...existing,
    ...list,
    id: list.id || existing?.id || nanoid("lst"),
    workspaceId,
    leadIds: Array.from(new Set(list.leadIds || existing?.leadIds || [])),
    createdAt: existing?.createdAt || list.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("contact_lists")
    .upsert(contactListToRow(next), { onConflict: "id" })
    .select("*")
    .single<ContactListRow>();

  ensureNoError(error, `saveContactList(${next.id})`);
  if (!data) throw new Error(`saveContactList(${next.id}): missing row`);
  return mapContactList(data);
}

export async function deleteContactList(id: string, workspaceId?: string): Promise<void> {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("contact_lists").delete().eq("id", id).eq("workspace_id", resolvedWorkspaceId);
  ensureNoError(error, `deleteContactList(${id})`);
}

export async function getLinkedInSeat(id: string, workspaceId?: string): Promise<LinkedInSeat | null> {
  const supabase = getSupabaseAdminClient();
  const query = supabase.from("linkedin_seats").select("*").eq("id", id);
  if (workspaceId) query.eq("workspace_id", workspaceId);
  const { data, error } = await query.maybeSingle<LinkedInSeatRow>();
  ensureNoError(error, `getLinkedInSeat(${id})`);
  return data ? mapLinkedInSeat(data) : null;
}

export async function listLinkedInSeats(workspaceId?: string): Promise<LinkedInSeat[]> {
  return seedLinkedInSeatsFromWorkspace(normalizeWorkspaceId(workspaceId));
}

export async function saveLinkedInSeat(seat: LinkedInSeat): Promise<LinkedInSeat> {
  const existing = seat.id ? await getLinkedInSeat(seat.id) : null;
  const next: LinkedInSeat = {
    ...existing,
    ...seat,
    id: seat.id || existing?.id || nanoid("seat"),
    workspaceId: normalizeWorkspaceId(seat.workspaceId || existing?.workspaceId),
    isDefault: typeof seat.isDefault === "boolean" ? seat.isDefault : existing?.isDefault ?? false,
    createdAt: seat.createdAt || existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const workspaceSeats = await listLinkedInSeats(next.workspaceId);
  if (next.isDefault) {
    const supabase = getSupabaseAdminClient();
    const resetRows = workspaceSeats
      .filter((item) => item.id !== next.id && item.isDefault)
      .map((item) => linkedInSeatToRow({ ...item, isDefault: false, updatedAt: next.updatedAt }));
    if (resetRows.length > 0) {
      const { error: resetError } = await supabase.from("linkedin_seats").upsert(resetRows, { onConflict: "id" });
      ensureNoError(resetError, `saveLinkedInSeat(${next.id}):reset-default`);
    }
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("linkedin_seats")
    .upsert(linkedInSeatToRow(next), { onConflict: "id" })
    .select("*")
    .single<LinkedInSeatRow>();

  ensureNoError(error, `saveLinkedInSeat(${next.id})`);
  if (!data) throw new Error(`saveLinkedInSeat(${next.id}): missing row`);
  return mapLinkedInSeat(data);
}

export async function deleteLinkedInSeat(id: string, workspaceId?: string): Promise<void> {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const existing = await listLinkedInSeats(resolvedWorkspaceId);
  const nextDefault = existing.find((seat) => seat.id !== id) || null;

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("linkedin_seats").delete().eq("id", id).eq("workspace_id", resolvedWorkspaceId);
  ensureNoError(error, `deleteLinkedInSeat(${id})`);

  if (nextDefault && !nextDefault.isDefault) {
    await saveLinkedInSeat({ ...nextDefault, isDefault: true });
  }
}

export async function getAgent(id: string, workspaceId?: string): Promise<Agent | null> {
  const supabase = getSupabaseAdminClient();
  const query = supabase.from("agents").select("*").eq("id", id);
  if (workspaceId) query.eq("workspace_id", workspaceId);
  const { data, error } = await query.maybeSingle<AgentRow>();
  ensureNoError(error, `getAgent(${id})`);
  return data ? mapAgent(data) : null;
}

export async function listAgents(workspaceId?: string): Promise<Agent[]> {
  const supabase = getSupabaseAdminClient();
  const query = supabase.from("agents").select("*").order("updated_at", { ascending: false });
  if (workspaceId) query.eq("workspace_id", workspaceId);
  const { data, error } = await query;
  ensureNoError(error, "listAgents");
  return (data as AgentRow[] || []).map(mapAgent);
}

export async function saveAgent(agent: Agent): Promise<Agent> {
  const existing = agent.id ? await getAgent(agent.id) : null;
  const next: Agent = {
    ...existing,
    ...agent,
    id: agent.id || existing?.id || nanoid("agt"),
    workspaceId: normalizeWorkspaceId(agent.workspaceId || existing?.workspaceId),
    createdAt: agent.createdAt || existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agents")
    .upsert(agentToRow(next), { onConflict: "id" })
    .select("*")
    .single<AgentRow>();

  ensureNoError(error, `saveAgent(${next.id})`);
  if (!data) throw new Error(`saveAgent(${next.id}): missing row`);
  return mapAgent(data);
}

export async function deleteAgent(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("agents").delete().eq("id", id);
  ensureNoError(error, `deleteAgent(${id})`);
}

export async function getCampaign(id: string, workspaceId?: string): Promise<Campaign | null> {
  const supabase = getSupabaseAdminClient();
  const query = supabase.from("campaigns").select("*").eq("id", id);
  if (workspaceId) query.eq("workspace_id", workspaceId);
  const { data, error } = await query.maybeSingle<CampaignRow>();
  ensureNoError(error, `getCampaign(${id})`);
  return data ? mapCampaign(data) : null;
}

export async function listCampaigns(opts: { workspaceId?: string; agentId?: string } = {}): Promise<Campaign[]> {
  const supabase = getSupabaseAdminClient();
  const query = supabase.from("campaigns").select("*").order("updated_at", { ascending: false });
  if (opts.workspaceId) query.eq("workspace_id", opts.workspaceId);
  if (opts.agentId) query.eq("agent_id", opts.agentId);
  const { data, error } = await query;
  ensureNoError(error, "listCampaigns");
  return (data as CampaignRow[] || []).map(mapCampaign);
}

export async function saveCampaign(campaign: Campaign): Promise<Campaign> {
  const existing = campaign.id ? await getCampaign(campaign.id) : null;
  const agentWorkspaceId = (await getAgent(campaign.agentId))?.workspaceId;
  const next: Campaign = {
    ...existing,
    ...campaign,
    id: campaign.id || existing?.id || nanoid("cmp"),
    workspaceId: normalizeWorkspaceId(campaign.workspaceId || existing?.workspaceId || agentWorkspaceId),
    createdAt: campaign.createdAt || existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("campaigns")
    .upsert(campaignToRow(next), { onConflict: "id" })
    .select("*")
    .single<CampaignRow>();

  ensureNoError(error, `saveCampaign(${next.id})`);
  if (!data) throw new Error(`saveCampaign(${next.id}): missing row`);
  return mapCampaign(data);
}

export async function deleteCampaign(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  ensureNoError(error, `deleteCampaign(${id})`);
}

export async function getCampaignStats(campaignId: string, workspaceId?: string): Promise<CampaignStats> {
  const leads = await listLeads(campaignId, { workspaceId });
  const sent = leads.filter((l) =>
    ["invite_sent", "accepted", "message_sent", "manual_override", "replied", "interested"].includes(l.status),
  ).length;
  const accepted = leads.filter((l) =>
    ["accepted", "message_sent", "manual_override", "replied", "interested"].includes(l.status),
  ).length;
  const replied = leads.filter((l) =>
    ["replied", "interested"].includes(l.status),
  ).length;
  const errored = leads.filter((l) => l.status === "invite_failed").length;

  return {
    totalLeads: leads.length,
    sent,
    accepted,
    replied,
    errored,
    connectRate: sent > 0 ? Math.round((accepted / sent) * 100) : 0,
    replyRate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
  };
}

export async function getLead(campaignId: string, leadId: string, workspaceId?: string): Promise<Lead | null> {
  const supabase = getSupabaseAdminClient();
  const query = supabase.from("leads").select("*").eq("campaign_id", campaignId).eq("id", leadId);
  if (workspaceId) query.eq("workspace_id", workspaceId);
  const { data, error } = await query.maybeSingle<LeadRow>();
  ensureNoError(error, `getLead(${leadId})`);
  return data ? mapLead(data) : null;
}

export async function listLeads(
  campaignId: string,
  opts: { status?: LeadStatus; workspaceId?: string } = {},
): Promise<Lead[]> {
  const supabase = getSupabaseAdminClient();
  const query = supabase
    .from("leads")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("updated_at", { ascending: false });

  if (opts.workspaceId) query.eq("workspace_id", opts.workspaceId);
  if (opts.status) query.eq("status", opts.status);

  const { data, error } = await query;
  ensureNoError(error, `listLeads(${campaignId})`);
  return (data as LeadRow[] || []).map(mapLead);
}

export async function saveLead(lead: Lead): Promise<Lead> {
  const campaignWorkspaceId = (await getCampaign(lead.campaignId))?.workspaceId;
  const resolvedWorkspaceId = normalizeWorkspaceId(lead.workspaceId || campaignWorkspaceId);
  let existing = lead.id ? await getLead(lead.campaignId, lead.id, resolvedWorkspaceId) : null;

  if (!existing && lead.providerId) {
    const existingRef = await lookupByProviderId(lead.providerId, resolvedWorkspaceId);
    if (existingRef) {
      existing = await getLead(existingRef.campaignId, existingRef.leadId, resolvedWorkspaceId);
    }
  }

  const next: Lead = {
    ...existing,
    ...lead,
    id: lead.id || existing?.id || nanoid("led"),
    campaignId: existing?.campaignId || lead.campaignId,
    workspaceId: normalizeWorkspaceId(lead.workspaceId || existing?.workspaceId || campaignWorkspaceId),
    createdAt: lead.createdAt || existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leads")
    .upsert(leadToRow(next), { onConflict: "id" })
    .select("*")
    .single<LeadRow>();

  ensureNoError(error, `saveLead(${next.id})`);
  if (!data) throw new Error(`saveLead(${next.id}): missing row`);
  const saved = mapLead(data);
  const { upsertExperimentExposure } = await import("./brain/exposure-store");
  await upsertExperimentExposure(saved);
  return saved;
}

export async function deleteLead(campaignId: string, leadId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("leads").delete().eq("campaign_id", campaignId).eq("id", leadId);
  ensureNoError(error, `deleteLead(${leadId})`);
}

export async function isProviderIdUsed(
  providerId: string,
  workspaceId: string,
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  const { count, error } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId)
    .eq("workspace_id", workspaceId);

  ensureNoError(error, `isProviderIdUsed(${providerId})`);
  return Boolean(count && count > 0);
}

export async function addToIndex(
  _providerId: string,
  _campaignId: string,
  _leadId: string,
  _workspaceId: string,
): Promise<void> {
  return;
}

export async function lookupByProviderId(
  providerId: string,
  workspaceId: string,
): Promise<{ campaignId: string; leadId: string } | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id, campaign_id, workspace_id")
    .eq("provider_id", providerId)
    .eq("workspace_id", workspaceId)
    .maybeSingle<{ id: string; campaign_id: string; workspace_id: string }>();
  ensureNoError(error, `lookupByProviderId(${providerId})`);
  if (!data) return null;
  return { campaignId: data.campaign_id, leadId: data.id };
}

export async function getAllLeads(opts: { status?: LeadStatus; workspaceId?: string } = {}): Promise<Lead[]> {
  const supabase = getSupabaseAdminClient();
  const query = supabase.from("leads").select("*").order("updated_at", { ascending: false });
  if (opts.workspaceId) query.eq("workspace_id", opts.workspaceId);
  if (opts.status) query.eq("status", opts.status);
  const { data, error } = await query;
  ensureNoError(error, "getAllLeads");
  return (data as LeadRow[] || []).map(mapLead);
}

export async function getDashboardStats(workspaceId?: string): Promise<{
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
}> {
  const [agents, campaigns, allLeads] = await Promise.all([
    listAgents(workspaceId),
    listCampaigns({ workspaceId }),
    getAllLeads({ workspaceId }),
  ]);

  const contacted = allLeads.filter((lead) =>
    ["invite_sent", "accepted", "message_sent", "manual_override", "replied", "interested"].includes(lead.status),
  );
  const discovered = allLeads.filter((lead) => !["skipped", "invite_failed"].includes(lead.status));
  const accepted = contacted.filter((lead) =>
    ["accepted", "message_sent", "manual_override", "replied", "interested"].includes(lead.status),
  );
  const replied = contacted.filter((lead) =>
    ["replied", "interested"].includes(lead.status),
  );

  return {
    totalContacted: contacted.length,
    totalDiscovered: discovered.length,
    totalSent: contacted.length,
    totalAccepted: accepted.length,
    totalReplied: replied.length,
    totalPending: allLeads.filter((lead) => ["rate_limited"].includes(lead.status)).length,
    activeAgents: agents.filter((agent) => agent.status === "active").length,
    activeCampaigns: campaigns.filter((campaign) => campaign.status === "active").length,
    connectRate: contacted.length > 0 ? Math.round((accepted.length / contacted.length) * 100) : 0,
    replyRate: contacted.length > 0 ? Math.round((replied.length / contacted.length) * 100) : 0,
  };
}

export async function saveDiscoveryRun(run: DiscoveryRun): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("discovery_runs")
    .upsert(discoveryRunToRow(run), { onConflict: "id" });

  ensureNoError(error, `saveDiscoveryRun(${run.id})`);
}

export async function listDiscoveryRuns(limit = 20, workspaceId?: string): Promise<DiscoveryRun[]> {
  const supabase = getSupabaseAdminClient();
  const query = supabase
    .from("discovery_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (workspaceId) query.eq("workspace_id", workspaceId);

  const { data, error } = await query;
  ensureNoError(error, "listDiscoveryRuns");
  return (data as DiscoveryRunRow[] || []).map(mapDiscoveryRun);
}

export async function listSignalCandidates(
  opts: {
    workspaceId?: string;
    agentId?: string;
    campaignId?: string;
    status?: SignalCandidateStatus;
    topicKey?: string;
    signalKind?: SignalKind;
    limit?: number;
  } = {},
): Promise<SignalCandidate[]> {
  const supabase = getSupabaseAdminClient();
  const limit = typeof opts.limit === "number" ? opts.limit : 100;
  const query = supabase
    .from("signal_candidates")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (opts.workspaceId) query.eq("workspace_id", opts.workspaceId);
  if (opts.agentId) query.eq("agent_id", opts.agentId);
  if (opts.campaignId) query.eq("campaign_id", opts.campaignId);
  if (opts.status) query.eq("status", opts.status);
  if (opts.topicKey) query.eq("topic_key", opts.topicKey);
  if (opts.signalKind) query.eq("signal_kind", opts.signalKind);

  const { data, error } = await query;
  ensureNoError(error, "listSignalCandidates");
  return (data as SignalCandidateRow[] || []).map(mapSignalCandidate);
}

export async function getSignalCandidate(id: string, workspaceId?: string): Promise<SignalCandidate | null> {
  const supabase = getSupabaseAdminClient();
  const query = supabase.from("signal_candidates").select("*").eq("id", id);
  if (workspaceId) query.eq("workspace_id", workspaceId);
  const { data, error } = await query.maybeSingle<SignalCandidateRow>();
  ensureNoError(error, `getSignalCandidate(${id})`);
  return data ? mapSignalCandidate(data) : null;
}

export async function saveSignalCandidate(candidate: SignalCandidate): Promise<SignalCandidate> {
  const signalId = candidate.id || buildSignalCandidateId(candidate.agentId, candidate.providerId);
  const supabase = getSupabaseAdminClient();
  const { data: existingRow, error: existingError } = await supabase
    .from("signal_candidates")
    .select("*")
    .eq("id", signalId)
    .maybeSingle<SignalCandidateRow>();
  ensureNoError(existingError, `getSignalCandidate(${signalId})`);
  const existing = existingRow ? mapSignalCandidate(existingRow) : null;

  const next: SignalCandidate = {
    ...existing,
    ...candidate,
    id: signalId,
    workspaceId: normalizeWorkspaceId(candidate.workspaceId || existing?.workspaceId),
    status: mergeSignalCandidateStatus(existing?.status, candidate.status),
    leadId: candidate.leadId || existing?.leadId,
    createdAt: candidate.createdAt || existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("signal_candidates")
    .upsert(signalCandidateToRow(next), { onConflict: "id" })
    .select("*")
    .single<SignalCandidateRow>();

  ensureNoError(error, `saveSignalCandidate(${next.id})`);
  if (!data) throw new Error(`saveSignalCandidate(${next.id}): missing row`);
  return mapSignalCandidate(data);
}

export async function countInvitesSince(days: number, workspaceId?: string): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const leads = await getAllLeads({ workspaceId });
  let count = 0;

  for (const lead of leads) {
    for (const event of lead.events) {
      if (event.type === "invite_sent" && event.ts >= cutoff) {
        count++;
        break;
      }
    }
  }

  return count;
}

export async function countInvitesInCurrentWeek(workspaceId?: string, now = new Date()): Promise<number> {
  const weekStart = startOfLocalWeek(now).getTime();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndTs = weekEnd.getTime();
  const leads = await getAllLeads({ workspaceId });
  let count = 0;

  for (const lead of leads) {
    for (const event of lead.events) {
      if (event.type !== "invite_sent") continue;
      const eventTs = Date.parse(event.ts);
      if (!Number.isFinite(eventTs)) continue;
      if (eventTs >= weekStart && eventTs < weekEndTs) {
        count++;
        break;
      }
    }
  }

  return count;
}

export async function countCampaignInvitesOnDay(
  campaignId: string,
  dayKey: string,
  workspaceId?: string,
): Promise<number> {
  const leads = await listLeads(campaignId, { workspaceId });
  let count = 0;
  for (const lead of leads) {
    for (const event of lead.events) {
      if (event.type !== "invite_sent") continue;
      if (localDateKey(new Date(event.ts)) === dayKey) {
        count++;
        break;
      }
    }
  }
  return count;
}

export async function saveOutreachRun(entry: Record<string, unknown>): Promise<void> {
  const workspaceId = typeof entry.workspaceId === "string"
    ? entry.workspaceId
    : typeof entry.campaignId === "string"
      ? (await getCampaign(entry.campaignId))?.workspaceId || DEFAULT_WORKSPACE_ID
      : DEFAULT_WORKSPACE_ID;
  const campaignId = typeof entry.campaignId === "string" ? entry.campaignId : null;
  const ts = typeof entry.ts === "string" ? entry.ts : new Date().toISOString();

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("outreach_runs").insert({
    workspace_id: normalizeWorkspaceId(workspaceId),
    campaign_id: campaignId,
    ts,
    payload: entry,
  });

  ensureNoError(error, "saveOutreachRun");
}

export async function listOutreachRuns(limit = 20, workspaceId?: string): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseAdminClient();
  const query = supabase
    .from("outreach_runs")
    .select("*")
    .order("ts", { ascending: false })
    .limit(limit);

  if (workspaceId) query.eq("workspace_id", workspaceId);

  const { data, error } = await query;
  ensureNoError(error, "listOutreachRuns");

  return (data as OutreachRunRow[] || []).map((row) => ({
    ts: row.ts,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id || undefined,
    ...(row.payload || {}),
  }));
}

export async function saveWebhookEvent(entry: {
  workspaceId: string;
  ts?: string;
  eventType?: string;
  providerId?: string;
  campaignId?: string;
  leadId?: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("webhook_events").insert({
    workspace_id: normalizeWorkspaceId(entry.workspaceId),
    ts: entry.ts || new Date().toISOString(),
    event_type: entry.eventType || null,
    provider_id: entry.providerId || null,
    campaign_id: entry.campaignId || null,
    lead_id: entry.leadId || null,
    payload: entry.payload,
  });

  ensureNoError(error, "saveWebhookEvent");
}

export async function listWebhookEvents(workspaceId: string, limit = 50): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("webhook_events")
    .select("*")
    .eq("workspace_id", normalizeWorkspaceId(workspaceId))
    .order("ts", { ascending: false })
    .limit(limit);

  ensureNoError(error, "listWebhookEvents");

  return (data as WebhookEventRow[] || []).map((row) => ({
    id: row.id,
    ts: row.ts,
    workspaceId: row.workspace_id,
    eventType: row.event_type || undefined,
    providerId: row.provider_id || undefined,
    campaignId: row.campaign_id || undefined,
    leadId: row.lead_id || undefined,
    ...(row.payload || {}),
  }));
}
