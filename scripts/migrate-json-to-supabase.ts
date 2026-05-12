import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf-8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(join(ROOT, ".env.local"));
loadEnvFile(join(ROOT, ".env"));

const DATA_DIR = process.env.BM_GTM_DATA_DIR || join(ROOT, "data");
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase envs: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function dataPath(...segments: string[]) {
  return join(DATA_DIR, ...segments);
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function readJsonLines<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}

function listJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(dir, name));
}

function maybeObject<T>(value: unknown, fallback: T): T {
  return value && typeof value === "object" && !Array.isArray(value) ? value as T : fallback;
}

function maybeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

const LEAD_STATUS_PRIORITY: Record<string, number> = {
  discovered: 0,
  new: 1,
  skipped: 1,
  rate_limited: 1,
  invite_sent: 2,
  already_invited: 2,
  invite_failed: 2,
  accepted: 3,
  message_sent: 4,
  replied: 5,
  interested: 6,
  not_interested: 6,
};

function parseTimestamp(value: unknown): number {
  if (typeof value !== "string") return 0;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function statusPriority(value: unknown): number {
  return typeof value === "string" ? (LEAD_STATUS_PRIORITY[value] || 0) : 0;
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function mergeLeadEvents(
  currentEvents: Record<string, unknown>[],
  incomingEvents: Record<string, unknown>[],
): Record<string, unknown>[] {
  const deduped = new Map<string, Record<string, unknown>>();
  for (const event of [...currentEvents, ...incomingEvents]) {
    const key = [
      typeof event.type === "string" ? event.type : "",
      typeof event.ts === "string" ? event.ts : "",
      typeof event.step === "number" ? String(event.step) : "",
      typeof event.message === "string" ? event.message : "",
    ].join("|");
    deduped.set(key, event);
  }

  return [...deduped.values()].sort((a, b) => parseTimestamp(a.ts) - parseTimestamp(b.ts));
}

function chooseLeadPreferred(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const currentPriority = statusPriority(current.status);
  const incomingPriority = statusPriority(incoming.status);
  if (incomingPriority !== currentPriority) return incomingPriority > currentPriority ? incoming : current;

  const currentEvents = maybeArray<Record<string, unknown>>(current.events).length;
  const incomingEvents = maybeArray<Record<string, unknown>>(incoming.events).length;
  if (incomingEvents !== currentEvents) return incomingEvents > currentEvents ? incoming : current;

  return parseTimestamp(incoming.updatedAt) >= parseTimestamp(current.updatedAt) ? incoming : current;
}

function mergeLeadRecords(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const preferred = chooseLeadPreferred(current, incoming);
  const secondary = preferred === current ? incoming : current;

  const currentCreatedAt = typeof current.createdAt === "string" ? current.createdAt : "";
  const incomingCreatedAt = typeof incoming.createdAt === "string" ? incoming.createdAt : "";
  const createdAtCandidates = [currentCreatedAt, incomingCreatedAt].filter(Boolean);
  const currentUpdatedAt = typeof current.updatedAt === "string" ? current.updatedAt : "";
  const incomingUpdatedAt = typeof incoming.updatedAt === "string" ? incoming.updatedAt : "";

  return {
    ...secondary,
    ...preferred,
    id: current.id,
    workspaceId: current.workspaceId || preferred.workspaceId || secondary.workspaceId || "ws_default",
    campaignId: current.campaignId || preferred.campaignId || secondary.campaignId,
    providerId: current.providerId || preferred.providerId || secondary.providerId,
    name: pickString(preferred.name, secondary.name, current.name) || "",
    headline: pickString(preferred.headline, secondary.headline, current.headline) || "",
    company: pickString(preferred.company, secondary.company, current.company) || "",
    location: pickString(preferred.location, secondary.location, current.location) || "",
    publicIdentifier: pickString(preferred.publicIdentifier, secondary.publicIdentifier, current.publicIdentifier) || "",
    networkDistance: pickString(preferred.networkDistance, secondary.networkDistance, current.networkDistance) || "",
    segment: pickString(preferred.segment, secondary.segment, current.segment) || "",
    language: pickString(preferred.language, secondary.language, current.language) || "en",
    signal: pickString(preferred.signal, secondary.signal, current.signal) || "",
    profilePictureUrl: pickString(preferred.profilePictureUrl, secondary.profilePictureUrl, current.profilePictureUrl) || null,
    status: statusPriority(preferred.status) >= statusPriority(secondary.status)
      ? preferred.status
      : secondary.status,
    currentStep: Math.max(
      typeof current.currentStep === "number" ? current.currentStep : 0,
      typeof incoming.currentStep === "number" ? incoming.currentStep : 0,
    ),
    aiScore: Math.max(
      typeof current.aiScore === "number" ? current.aiScore : 0,
      typeof incoming.aiScore === "number" ? incoming.aiScore : 0,
    ),
    events: mergeLeadEvents(
      maybeArray<Record<string, unknown>>(current.events),
      maybeArray<Record<string, unknown>>(incoming.events),
    ),
    templateIndex: typeof preferred.templateIndex === "number"
      ? preferred.templateIndex
      : typeof secondary.templateIndex === "number"
        ? secondary.templateIndex
        : null,
    templateHash: pickString(preferred.templateHash, secondary.templateHash, current.templateHash) || null,
    experimentId: pickString(preferred.experimentId, secondary.experimentId, current.experimentId) || null,
    experimentArm: pickString(preferred.experimentArm, secondary.experimentArm, current.experimentArm) || null,
    approved: typeof preferred.approved === "boolean"
      ? preferred.approved
      : typeof secondary.approved === "boolean"
        ? secondary.approved
        : null,
    copilotEdits: maybeObject(preferred.copilotEdits, maybeObject(secondary.copilotEdits, {})),
    unipileChatId: pickString(preferred.unipileChatId, secondary.unipileChatId, current.unipileChatId) || null,
    companySize: pickString(preferred.companySize, secondary.companySize, current.companySize) || null,
    industry: pickString(preferred.industry, secondary.industry, current.industry) || null,
    companyDescription: pickString(preferred.companyDescription, secondary.companyDescription, current.companyDescription) || null,
    companyLinkedInUrl: pickString(preferred.companyLinkedInUrl, secondary.companyLinkedInUrl, current.companyLinkedInUrl) || null,
    createdAt: createdAtCandidates.length > 0
      ? createdAtCandidates.sort((a, b) => parseTimestamp(a) - parseTimestamp(b))[0]
      : new Date().toISOString(),
    updatedAt: parseTimestamp(currentUpdatedAt) >= parseTimestamp(incomingUpdatedAt)
      ? currentUpdatedAt || incomingUpdatedAt || new Date().toISOString()
      : incomingUpdatedAt || currentUpdatedAt || new Date().toISOString(),
  };
}

function resolveLeadId(leadId: string, aliases: Map<string, string>): string {
  let current = leadId;
  const seen = new Set<string>();

  while (aliases.has(current) && !seen.has(current)) {
    seen.add(current);
    const next = aliases.get(current);
    if (!next || next === current) break;
    current = next;
  }

  return current;
}

async function chunkedUpsert(table: string, rows: Record<string, unknown>[], onConflict = "id") {
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(`upsert ${table}: ${error.message}`);
  }
}

async function chunkedInsert(table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw new Error(`insert ${table}: ${error.message}`);
  }
}

async function clearTable(table: string, primaryColumn: string) {
  const { error } = await supabase.from(table).delete().not(primaryColumn, "is", null);
  if (error) throw new Error(`clear ${table}: ${error.message}`);
}

function workspaceRow(workspace: Record<string, unknown>) {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    status: workspace.status,
    niche: workspace.niche,
    default_language: workspace.defaultLanguage || "en",
    channels: workspace.channels || {},
    profile_settings: workspace.profileSettings || {},
    created_at: workspace.createdAt || new Date().toISOString(),
    updated_at: workspace.updatedAt || new Date().toISOString(),
  };
}

function agentRow(agent: Record<string, unknown>) {
  return {
    id: agent.id,
    workspace_id: agent.workspaceId || "ws_default",
    name: agent.name,
    status: agent.status,
    icp: agent.icp || {},
    signals: agent.signals || {},
    voice: agent.voice || {},
    limits: agent.limits || {},
    message_templates: agent.messageTemplates || {},
    template_weights: agent.templateWeights || null,
    linkedin_account_id: agent.linkedinAccountId || null,
    created_at: agent.createdAt || new Date().toISOString(),
    updated_at: agent.updatedAt || new Date().toISOString(),
  };
}

function campaignRow(campaign: Record<string, unknown>) {
  return {
    id: campaign.id,
    workspace_id: campaign.workspaceId || "ws_default",
    agent_id: campaign.agentId,
    linkedin_seat_id: campaign.linkedinSeatId || null,
    name: campaign.name,
    status: campaign.status,
    segment: campaign.segment || "",
    search: campaign.search || {},
    sequence: campaign.sequence || [],
    execution: campaign.execution || null,
    settings: campaign.settings || null,
    created_at: campaign.createdAt || new Date().toISOString(),
    updated_at: campaign.updatedAt || new Date().toISOString(),
  };
}

function linkedinSeatRow(seat: Record<string, unknown>) {
  return {
    id: seat.id,
    workspace_id: seat.workspaceId || "ws_default",
    name: seat.name || "LinkedIn Seat",
    status: seat.status || "active",
    country: seat.country || "",
    unipile_account_id: seat.unipileAccountId || "",
    is_default: Boolean(seat.isDefault),
    provider_connection_id: seat.providerConnectionId || null,
    quotas: seat.quotas || {},
    schedule: seat.schedule || {},
    usage: seat.usage || {},
    created_at: seat.createdAt || new Date().toISOString(),
    updated_at: seat.updatedAt || new Date().toISOString(),
  };
}

function providerConnectionRow(connection: Record<string, unknown>) {
  return {
    id: connection.id,
    workspace_id: connection.workspaceId || "ws_default",
    provider: connection.provider || "unipile",
    unipile_account_id: connection.unipileAccountId,
    unipile_api_key: connection.unipileApiKey || null,
    unipile_base_url: connection.unipileBaseUrl || null,
    name: connection.name || "Connection",
    is_default: connection.isDefault !== false,
    created_at: connection.createdAt || new Date().toISOString(),
    updated_at: connection.updatedAt || new Date().toISOString(),
  };
}

function signalCandidateRow(signal: Record<string, unknown>) {
  return {
    id: signal.id,
    workspace_id: signal.workspaceId || "ws_default",
    agent_id: signal.agentId,
    campaign_id: signal.campaignId || null,
    lead_id: signal.leadId || null,
    provider_id: signal.providerId,
    name: signal.name,
    headline: signal.headline || "",
    location: signal.location || "",
    public_identifier: signal.publicIdentifier || "",
    network_distance: signal.networkDistance || "",
    signal_source: signal.signalSource,
    signal_context: signal.signalContext || "",
    source_post_id: signal.sourcePostId || null,
    topic_key: signal.topicKey || null,
    topic_label: signal.topicLabel || null,
    signal_kind: signal.signalKind || null,
    signal_payload: signal.signalPayload || {},
    language: signal.language || "en",
    icp_fit: signal.icpFit || 0,
    intent_score: signal.intentScore || 0,
    total_score: signal.totalScore || 0,
    score_reasoning: signal.scoreReasoning || "",
    status: signal.status || "new",
    created_at: signal.createdAt || new Date().toISOString(),
    updated_at: signal.updatedAt || new Date().toISOString(),
  };
}

function dashboardSnapshotRow(snapshot: Record<string, unknown>) {
  return {
    workspace_id: snapshot.workspaceId || "ws_default",
    period: snapshot.period,
    payload: snapshot.payload || {},
    computed_at: snapshot.computedAt || new Date().toISOString(),
  };
}

function leadRow(lead: Record<string, unknown>) {
  return {
    id: lead.id,
    workspace_id: lead.workspaceId || "ws_default",
    campaign_id: lead.campaignId,
    provider_id: lead.providerId,
    name: lead.name,
    headline: lead.headline || "",
    company: lead.company || "",
    location: lead.location || "",
    public_identifier: lead.publicIdentifier || "",
    network_distance: lead.networkDistance || "",
    profile_picture_url: lead.profilePictureUrl || null,
    segment: lead.segment || "",
    language: lead.language || "en",
    ai_score: Math.round(Number(lead.aiScore) || 0),
    signal: lead.signal || "",
    status: lead.status,
    current_step: lead.currentStep || 0,
    events: lead.events || [],
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
    created_at: lead.createdAt || new Date().toISOString(),
    updated_at: lead.updatedAt || new Date().toISOString(),
  };
}

function templateRow(template: Record<string, unknown>) {
  return {
    id: template.id,
    workspace_id: template.workspaceId || "ws_default",
    name: template.name,
    content: template.content,
    language: template.language || "en",
    type: template.type || "message",
    step: template.step || 0,
    created_at: template.createdAt || new Date().toISOString(),
    updated_at: template.updatedAt || new Date().toISOString(),
  };
}

function contactListRow(list: Record<string, unknown>) {
  return {
    id: list.id,
    workspace_id: list.workspaceId || "ws_default",
    name: list.name,
    description: list.description || null,
    lead_ids: Array.from(new Set(maybeArray<string>(list.leadIds))),
    created_at: list.createdAt || new Date().toISOString(),
    updated_at: list.updatedAt || new Date().toISOString(),
  };
}

function discoveryRunRow(run: Record<string, unknown>) {
  return {
    id: run.id,
    workspace_id: run.workspaceId || "ws_default",
    agent_id: run.agentId,
    started_at: run.startedAt,
    completed_at: run.completedAt,
    status: run.status,
    sources: run.sources || {},
    total_discovered: run.totalDiscovered || 0,
    total_duplicates: run.totalDuplicates || 0,
    total_saved: run.totalSaved || 0,
    errors: run.errors || [],
  };
}

function brainSnapshotRow(snapshot: Record<string, unknown>) {
  return {
    id: snapshot.id,
    workspace_id: snapshot.workspaceId || "ws_default",
    analyzed_at: snapshot.analyzedAt,
    leads_analyzed: snapshot.leadsAnalyzed || 0,
    campaigns_analyzed: snapshot.campaignsAnalyzed || 0,
    patterns: snapshot.patterns || {},
    recommendations: snapshot.recommendations || [],
    active_experiment_id: snapshot.activeExperimentId || null,
  };
}

function brainExperimentRow(exp: Record<string, unknown>) {
  return {
    id: exp.id,
    workspace_id: exp.workspaceId || "ws_default",
    campaign_id: exp.campaignId,
    language: exp.language || null,
    variable: exp.variable,
    hypothesis: exp.hypothesis,
    reasoning: exp.reasoning,
    control: exp.control || {},
    challenger: exp.challenger || {},
    status: exp.status,
    split_ratio: exp.splitRatio || 0.5,
    min_sample_per_arm: exp.minSamplePerArm || 0,
    max_duration_days: exp.maxDurationDays || 0,
    control_lead_ids: exp.controlLeadIds || [],
    challenger_lead_ids: exp.challengerLeadIds || [],
    mutation_axis: exp.mutationAxis || null,
    context_snapshot: exp.contextSnapshot || null,
    results: exp.results || null,
    previous_config: exp.previousConfig || null,
    proposed_at: exp.proposedAt,
    approved_at: exp.approvedAt || null,
    started_at: exp.startedAt || null,
    evaluated_at: exp.evaluatedAt || null,
    decided_at: exp.decidedAt || null,
  };
}

function experimentExposureRow(exposure: Record<string, unknown>) {
  return {
    id: exposure.id,
    experiment_id: exposure.experimentId,
    workspace_id: exposure.workspaceId || "ws_default",
    campaign_id: exposure.campaignId,
    lead_id: exposure.leadId,
    provider_id: exposure.providerId,
    language: exposure.language || "en",
    experiment_arm: exposure.experimentArm,
    template_index: exposure.templateIndex || 0,
    template_hash: exposure.templateHash || null,
    assigned_at: exposure.assignedAt,
    sent_at: exposure.sentAt,
    accepted_at: exposure.acceptedAt || null,
    replied_at: exposure.repliedAt || null,
    updated_at: exposure.updatedAt || new Date().toISOString(),
  };
}

async function main() {
  console.log(`Using data dir: ${DATA_DIR}`);

  const workspaceFiles = listJsonFiles(dataPath("workspaces"));
  const workspaces = workspaceFiles.map((file) => readJson<Record<string, unknown>>(file)).filter(Boolean) as Record<string, unknown>[];
  await chunkedUpsert("workspaces", workspaces.map(workspaceRow));

  const providerConnectionRows: Record<string, unknown>[] = [];
  const providerConnectionDir = dataPath("provider-connections");
  if (existsSync(providerConnectionDir)) {
    for (const file of listJsonFiles(providerConnectionDir)) {
      const rows = readJson<Record<string, unknown>[]>(file) || [];
      providerConnectionRows.push(
        ...rows
          .filter((connection) => typeof connection.id === "string" && typeof connection.unipileAccountId === "string")
          .map(providerConnectionRow),
      );
    }
  }
  if (providerConnectionRows.length > 0) {
    await chunkedUpsert("provider_connections", providerConnectionRows);
  }

  const workspaceStateDir = dataPath("workspaces");
  const linkedInSeatRows: Record<string, unknown>[] = [];
  if (existsSync(workspaceStateDir)) {
    for (const name of readdirSync(workspaceStateDir)) {
      const nestedDir = join(workspaceStateDir, name);
      const seats = readJson<Record<string, unknown>[]>(join(nestedDir, "linkedin-seats.json")) || [];
      linkedInSeatRows.push(
        ...seats
          .filter((seat) => typeof seat.id === "string" && typeof seat.unipileAccountId === "string")
          .map(linkedinSeatRow),
      );
    }
  }
  if (linkedInSeatRows.length > 0) {
    await chunkedUpsert("linkedin_seats", linkedInSeatRows);
  }

  const agentFiles = listJsonFiles(dataPath("agents"));
  const agents = agentFiles.map((file) => readJson<Record<string, unknown>>(file)).filter(Boolean) as Record<string, unknown>[];
  await chunkedUpsert("agents", agents.map(agentRow));
  const validAgentIds = new Set(agents.map((agent) => String(agent.id)));

  const campaignFiles = listJsonFiles(dataPath("campaigns"));
  const allCampaigns = campaignFiles.map((file) => readJson<Record<string, unknown>>(file)).filter(Boolean) as Record<string, unknown>[];
  const skippedOrphanCampaigns = allCampaigns.filter((campaign) => !validAgentIds.has(String(campaign.agentId)));
  const campaigns = allCampaigns.filter((campaign) => validAgentIds.has(String(campaign.agentId)));
  await chunkedUpsert("campaigns", campaigns.map(campaignRow));
  const validCampaignIds = new Set(campaigns.map((campaign) => String(campaign.id)));

  const leadAliases = new Map<string, string>();
  const dedupedLeads = new Map<string, Record<string, unknown>>();
  const leadsDir = dataPath("leads");
  if (existsSync(leadsDir)) {
    for (const campaignId of readdirSync(leadsDir)) {
      if (campaignId.startsWith("_") || campaignId.endsWith(".json")) continue;
      if (!validCampaignIds.has(campaignId)) continue;
      const campaignDir = join(leadsDir, campaignId);
      for (const file of listJsonFiles(campaignDir)) {
        const lead = readJson<Record<string, unknown>>(file);
        if (!lead || typeof lead.id !== "string" || typeof lead.providerId !== "string") continue;
        leadAliases.set(lead.id, lead.id);

        const existing = dedupedLeads.get(lead.providerId);
        if (!existing) {
          dedupedLeads.set(lead.providerId, lead);
          continue;
        }

        leadAliases.set(lead.id, String(existing.id));
        dedupedLeads.set(lead.providerId, mergeLeadRecords(existing, lead));
      }
    }
  }
  const leadRows = Array.from(dedupedLeads.values()).map(leadRow);
  await chunkedUpsert("leads", leadRows);
  const validLeadIds = new Set(leadRows.map((lead) => String(lead.id)));

  const signalRows = listJsonFiles(dataPath("signals"))
    .map((file) => readJson<Record<string, unknown>>(file))
    .filter((signal): signal is Record<string, unknown> => Boolean(
      signal &&
      typeof signal.id === "string" &&
      typeof signal.agentId === "string" &&
      typeof signal.providerId === "string" &&
      validAgentIds.has(String(signal.agentId)),
    ))
    .map((signal) => signalCandidateRow({
      ...signal,
      campaignId: typeof signal.campaignId === "string" && validCampaignIds.has(signal.campaignId) ? signal.campaignId : undefined,
      leadId: typeof signal.leadId === "string" && validLeadIds.has(resolveLeadId(signal.leadId, leadAliases))
        ? resolveLeadId(signal.leadId, leadAliases)
        : undefined,
    }));
  if (signalRows.length > 0) {
    await chunkedUpsert("signal_candidates", signalRows);
  }

  const templateRows: Record<string, unknown>[] = [];
  const contactListRows: Record<string, unknown>[] = [];
  const dashboardSnapshotRows: Record<string, unknown>[] = [];
  if (existsSync(workspaceStateDir)) {
    for (const name of readdirSync(workspaceStateDir)) {
      const nestedDir = join(workspaceStateDir, name);
      const templates = readJson<Record<string, unknown>[]>(join(nestedDir, "templates.json")) || [];
      const lists = readJson<Record<string, unknown>[]>(join(nestedDir, "lists.json")) || [];
      const snapshots = readJson<Record<string, unknown>[]>(join(nestedDir, "dashboard-snapshots.json")) || [];
      templateRows.push(...templates.map(templateRow));
      contactListRows.push(...lists.map((list) => contactListRow({
        ...list,
        leadIds: maybeArray<string>(list.leadIds).map((leadId) => resolveLeadId(leadId, leadAliases)),
      })));
      dashboardSnapshotRows.push(...snapshots.map(dashboardSnapshotRow));
    }
  }
  if (templateRows.length > 0) await chunkedUpsert("workspace_templates", templateRows);
  if (contactListRows.length > 0) await chunkedUpsert("contact_lists", contactListRows);
  if (dashboardSnapshotRows.length > 0) await chunkedUpsert("dashboard_snapshots", dashboardSnapshotRows, "workspace_id,period");

  const discoveryRuns = readJsonLines<Record<string, unknown>>(dataPath("discovery-runs.jsonl"));
  if (discoveryRuns.length > 0) {
    await clearTable("discovery_runs", "id");
    await chunkedInsert("discovery_runs", discoveryRuns.map(discoveryRunRow));
  }

  const campaignWorkspace = new Map<string, string>();
  for (const campaign of campaigns) {
    campaignWorkspace.set(String(campaign.id), String(campaign.workspaceId || "ws_default"));
  }

  const outreachRuns = readJsonLines<Record<string, unknown>>(dataPath("outreach-runs.jsonl")).map((run) => ({
    workspace_id: typeof run.workspaceId === "string"
      ? run.workspaceId
      : campaignWorkspace.get(String(run.campaignId || "")) || "ws_default",
    campaign_id: typeof run.campaignId === "string" ? run.campaignId : null,
    ts: typeof run.ts === "string" ? run.ts : new Date().toISOString(),
    payload: run,
  }));
  if (outreachRuns.length > 0) {
    await clearTable("outreach_runs", "id");
    await chunkedInsert("outreach_runs", outreachRuns);
  }

  const webhookEvents = readJsonLines<Record<string, unknown>>(dataPath("events.jsonl")).map((event) => ({
    workspace_id: typeof event.workspaceId === "string" ? event.workspaceId : "ws_default",
    ts: typeof event.ts === "string" ? event.ts : new Date().toISOString(),
    event_type: typeof event.eventType === "string"
      ? event.eventType
      : typeof event.event === "string"
        ? event.event
        : typeof event.type === "string"
          ? event.type
          : null,
    provider_id: typeof event.providerId === "string"
      ? event.providerId
      : typeof event.provider_id === "string"
        ? event.provider_id
        : typeof event.user_provider_id === "string"
          ? event.user_provider_id
          : null,
    campaign_id: typeof event.campaignId === "string" ? event.campaignId : null,
    lead_id: typeof event.leadId === "string" ? resolveLeadId(event.leadId, leadAliases) : null,
    payload: event,
  }));
  if (webhookEvents.length > 0) {
    await clearTable("webhook_events", "id");
    await chunkedInsert("webhook_events", webhookEvents);
  }

  const brainSnapshots = readJsonLines<Record<string, unknown>>(dataPath("brain", "snapshots.jsonl"));
  if (brainSnapshots.length > 0) {
    await chunkedUpsert("brain_snapshots", brainSnapshots.map(brainSnapshotRow));
  }

  const experimentsLog = readJsonLines<Record<string, unknown>>(dataPath("brain", "experiments.jsonl"));
  if (experimentsLog.length > 0) {
    const latestById = new Map<string, Record<string, unknown>>();
    for (const experiment of experimentsLog) {
      latestById.set(String(experiment.id), {
        ...experiment,
        controlLeadIds: maybeArray<string>(experiment.controlLeadIds).map((leadId) => resolveLeadId(leadId, leadAliases)),
        challengerLeadIds: maybeArray<string>(experiment.challengerLeadIds).map((leadId) => resolveLeadId(leadId, leadAliases)),
      });
    }
    await chunkedUpsert("brain_experiments", Array.from(latestById.values()).map(brainExperimentRow));
  }

  const exposureRows: Record<string, unknown>[] = [];
  const exposuresRoot = dataPath("brain", "exposures");
  if (existsSync(exposuresRoot)) {
    for (const experimentId of readdirSync(exposuresRoot)) {
      const experimentDir = join(exposuresRoot, experimentId);
      for (const file of listJsonFiles(experimentDir)) {
        const exposure = readJson<Record<string, unknown>>(file);
        if (exposure) {
          exposureRows.push(experimentExposureRow({
            ...exposure,
            leadId: typeof exposure.leadId === "string"
              ? resolveLeadId(exposure.leadId, leadAliases)
              : exposure.leadId,
          }));
        }
      }
    }
  }
  if (exposureRows.length > 0) {
    await chunkedUpsert("experiment_exposures", exposureRows);
  }

  const counts = {
    workspaces: workspaces.length,
    agents: agents.length,
    campaigns: campaigns.length,
    skippedOrphanCampaigns: skippedOrphanCampaigns.length,
    leads: leadRows.length,
    signals: signalRows.length,
    leadAliases: Array.from(leadAliases.entries()).filter(([from, to]) => from !== to).length,
    providerConnections: providerConnectionRows.length,
    linkedinSeats: linkedInSeatRows.length,
    templates: templateRows.length,
    contactLists: contactListRows.length,
    dashboardSnapshots: dashboardSnapshotRows.length,
    discoveryRuns: discoveryRuns.length,
    outreachRuns: outreachRuns.length,
    webhookEvents: webhookEvents.length,
    brainSnapshots: brainSnapshots.length,
    experiments: experimentsLog.length,
    experimentExposures: exposureRows.length,
  };

  console.log("Migration completed:");
  console.table(counts);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
