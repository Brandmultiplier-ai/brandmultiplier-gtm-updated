import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";
import type {
  Agent,
  Campaign,
  CampaignStats,
  ContactList,
  DashboardPeriod,
  DashboardSnapshot,
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
import { upsertExperimentExposure } from "./brain/exposure-store-local";
import { dataPath, getDataDir } from "./data-paths";
import { buildSignalCandidateId, mergeSignalCandidateStatus } from "./signal-candidates";

export const DEFAULT_WORKSPACE_ID = "ws_default";

// ── Paths ──────────────────────────────────────────────────────────────

const DATA_DIR = () => getDataDir();
const WORKSPACES_DIR = () => dataPath("workspaces");
const AGENTS_DIR = () => dataPath("agents");
const CAMPAIGNS_DIR = () => dataPath("campaigns");
const LEADS_DIR = () => dataPath("leads");
const SIGNALS_DIR = () => dataPath("signals");
const INDEX_PATH = () => dataPath("leads", "_index.json");
const DISCOVERY_LOG = () => dataPath("discovery-runs.jsonl");
const OUTREACH_LOG = () => dataPath("outreach-runs.jsonl");

type WorkspaceScoped = { workspaceId?: string };

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(path: string, data: unknown) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function normalizeWorkspaceId(workspaceId?: string | null): string {
  return workspaceId || DEFAULT_WORKSPACE_ID;
}

function matchesWorkspace(record: WorkspaceScoped, workspaceId?: string): boolean {
  if (!workspaceId) return true;
  return normalizeWorkspaceId(record.workspaceId) === workspaceId;
}

function withWorkspaceId<T extends WorkspaceScoped>(record: T): T & { workspaceId: string } {
  return {
    ...record,
    workspaceId: normalizeWorkspaceId(record.workspaceId),
  };
}

function readJsonLines<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
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

function workspaceStateDir(workspaceId?: string): string {
  return join(WORKSPACES_DIR(), normalizeWorkspaceId(workspaceId));
}

function workspaceTemplatesPath(workspaceId?: string): string {
  return join(workspaceStateDir(workspaceId), "templates.json");
}

function workspaceListsPath(workspaceId?: string): string {
  return join(workspaceStateDir(workspaceId), "lists.json");
}

function workspaceLinkedInSeatsPath(workspaceId?: string): string {
  return join(workspaceStateDir(workspaceId), "linkedin-seats.json");
}

function workspaceDashboardSnapshotsPath(workspaceId?: string): string {
  return join(workspaceStateDir(workspaceId), "dashboard-snapshots.json");
}

// ── ID generation ──────────────────────────────────────────────────────

function nanoid(prefix: string): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}_${id}`;
}

// ── Workspace CRUD ─────────────────────────────────────────────────────

export function getWorkspace(id: string): Workspace | null {
  return readJson<Workspace>(join(WORKSPACES_DIR(), `${id}.json`));
}

export function listWorkspaces(): Workspace[] {
  ensureDir(WORKSPACES_DIR());
  return readdirSync(WORKSPACES_DIR())
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<Workspace>(join(WORKSPACES_DIR(), f))!)
    .filter(Boolean)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveWorkspace(workspace: Workspace): Workspace {
  const existing = workspace.id ? getWorkspace(workspace.id) : null;
  const next: Workspace = {
    ...existing,
    ...workspace,
    id: workspace.id || existing?.id || nanoid("ws"),
    slug: workspace.slug || existing?.slug || slugify(workspace.name || existing?.name || "workspace"),
    status: workspace.status || existing?.status || "active",
    niche: workspace.niche || existing?.niche || "general",
    defaultLanguage: workspace.defaultLanguage || existing?.defaultLanguage || "en",
    profileSettings: workspace.profileSettings || existing?.profileSettings || {},
    channels: workspace.channels || existing?.channels || {},
    createdAt: workspace.createdAt || existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  ensureDir(WORKSPACES_DIR());
  writeJson(join(WORKSPACES_DIR(), `${next.id}.json`), next);
  return next;
}

export function deleteWorkspace(id: string) {
  const path = join(WORKSPACES_DIR(), `${id}.json`);
  if (existsSync(path)) unlinkSync(path);
}

function sortTemplates(templates: WorkspaceTemplate[]): WorkspaceTemplate[] {
  return [...templates].sort((a, b) => {
    if (a.language !== b.language) return a.language.localeCompare(b.language);
    if (a.step !== b.step) return a.step - b.step;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function resequenceTemplates(templates: WorkspaceTemplate[]): WorkspaceTemplate[] {
  const counters = new Map<string, number>();
  return sortTemplates(templates).map((template) => {
    const nextStep = counters.get(template.language) || 0;
    counters.set(template.language, nextStep + 1);
    return { ...template, step: nextStep };
  });
}

function writeWorkspaceTemplates(workspaceId: string, templates: WorkspaceTemplate[]) {
  writeJson(workspaceTemplatesPath(workspaceId), resequenceTemplates(templates));
}

function seedWorkspaceTemplatesFromAgents(workspaceId: string): WorkspaceTemplate[] {
  const existing = readJson<WorkspaceTemplate[]>(workspaceTemplatesPath(workspaceId));
  if (existing) {
    return resequenceTemplates(existing);
  }

  const agents = listAgents(workspaceId);
  if (agents.length === 0) return [];

  const seeded: WorkspaceTemplate[] = [];
  for (const agent of agents) {
    for (const [language, templates] of Object.entries(agent.messageTemplates || {})) {
      if (!Array.isArray(templates)) continue;
      templates.forEach((content, index) => {
        seeded.push({
          id: nanoid("tpl"),
          workspaceId,
          name: index === 0
            ? `Connection Request (${language})`
            : `Message ${index} (${language})`,
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
    writeWorkspaceTemplates(workspaceId, seeded);
  }

  return resequenceTemplates(seeded);
}

function sortLinkedInSeats(seats: LinkedInSeat[]): LinkedInSeat[] {
  return [...seats].sort((a, b) => {
    if (Boolean(a.isDefault) !== Boolean(b.isDefault)) {
      return a.isDefault ? -1 : 1;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function seedLinkedInSeatsFromWorkspace(workspaceId: string): LinkedInSeat[] {
  const existing = readJson<LinkedInSeat[]>(workspaceLinkedInSeatsPath(workspaceId));
  if (existing) {
    return sortLinkedInSeats(existing.map((seat) => withWorkspaceId(seat)));
  }

  const workspace = getWorkspace(workspaceId);
  const fallbackAccountId = listAgents(workspaceId).find((agent) => agent.linkedinAccountId)?.linkedinAccountId || "";
  const accountId = workspace?.channels.linkedin?.unipileAccountId || fallbackAccountId;
  if (!accountId) return [];

  const now = new Date();
  const seeded: LinkedInSeat[] = [{
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
        startedAt: `${localDateKey(startOfLocalWeek(now))}T00:00:00.000Z`,
      },
    },
    usage: {
      weekKey: localDateKey(startOfLocalWeek(now)),
      dayKey: localDateKey(now),
      invitationsUsed: 0,
      messagesUsed: 0,
      profileLookupsUsed: 0,
      prospectingRunsToday: 0,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }];

  writeJson(workspaceLinkedInSeatsPath(workspaceId), seeded);
  return seeded;
}

export function listWorkspaceTemplates(workspaceId?: string): WorkspaceTemplate[] {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  return seedWorkspaceTemplatesFromAgents(resolvedWorkspaceId);
}

export function saveWorkspaceTemplate(template: WorkspaceTemplate): WorkspaceTemplate {
  const workspaceId = normalizeWorkspaceId(template.workspaceId);
  const existing = listWorkspaceTemplates(workspaceId);
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
    step: typeof template.step === "number" ? template.step : current?.step ?? existing.filter((item) => item.language === (template.language || current?.language || "en")).length,
    createdAt: current?.createdAt || template.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const nextTemplates = existing.filter((item) => item.id !== next.id);
  nextTemplates.push(next);
  writeWorkspaceTemplates(workspaceId, nextTemplates);
  syncWorkspaceTemplatesToAgents(workspaceId);

  return listWorkspaceTemplates(workspaceId).find((item) => item.id === next.id)!;
}

export function deleteWorkspaceTemplate(id: string, workspaceId?: string) {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const nextTemplates = listWorkspaceTemplates(resolvedWorkspaceId).filter((item) => item.id !== id);
  writeWorkspaceTemplates(resolvedWorkspaceId, nextTemplates);
  syncWorkspaceTemplatesToAgents(resolvedWorkspaceId);
}

export function syncWorkspaceTemplatesToAgents(workspaceId?: string) {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const templates = listWorkspaceTemplates(resolvedWorkspaceId);
  const grouped = templates.reduce<Record<string, string[]>>((acc, template) => {
    acc[template.language] = acc[template.language] || [];
    acc[template.language].push(template.content);
    return acc;
  }, {});

  for (const agent of listAgents(resolvedWorkspaceId)) {
    const allLanguages = new Set([
      ...Object.keys(agent.messageTemplates || {}),
      ...Object.keys(grouped),
    ]);
    const nextMessageTemplates = Object.fromEntries(
      Array.from(allLanguages).map((language) => [language, grouped[language] || []])
    );

    saveAgent({
      ...agent,
      messageTemplates: nextMessageTemplates,
    });
  }
}

export function listContactLists(workspaceId?: string): ContactList[] {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  return (readJson<ContactList[]>(workspaceListsPath(resolvedWorkspaceId)) || [])
    .map((list) => ({ ...list, workspaceId: normalizeWorkspaceId(list.workspaceId || resolvedWorkspaceId) }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveContactList(list: ContactList): ContactList {
  const workspaceId = normalizeWorkspaceId(list.workspaceId);
  const existing = list.id
    ? listContactLists(workspaceId).find((item) => item.id === list.id) || null
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

  const lists = listContactLists(workspaceId).filter((item) => item.id !== next.id);
  lists.push(next);
  writeJson(workspaceListsPath(workspaceId), lists);
  return next;
}

export function deleteContactList(id: string, workspaceId?: string) {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const lists = listContactLists(resolvedWorkspaceId).filter((item) => item.id !== id);
  writeJson(workspaceListsPath(resolvedWorkspaceId), lists);
}

export function getLinkedInSeat(id: string, workspaceId?: string): LinkedInSeat | null {
  return listLinkedInSeats(workspaceId).find((seat) => seat.id === id) || null;
}

export function listLinkedInSeats(workspaceId?: string): LinkedInSeat[] {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  return seedLinkedInSeatsFromWorkspace(resolvedWorkspaceId);
}

export function saveLinkedInSeat(seat: LinkedInSeat): LinkedInSeat {
  const workspaceId = normalizeWorkspaceId(seat.workspaceId);
  const existing = listLinkedInSeats(workspaceId);
  const current = seat.id
    ? existing.find((item) => item.id === seat.id) || null
    : null;

  const next: LinkedInSeat = {
    ...current,
    ...seat,
    id: seat.id || current?.id || nanoid("seat"),
    workspaceId,
    isDefault: typeof seat.isDefault === "boolean" ? seat.isDefault : current?.isDefault ?? existing.length === 0,
    createdAt: current?.createdAt || seat.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let seats = existing.filter((item) => item.id !== next.id);
  if (next.isDefault) {
    seats = seats.map((item) => ({ ...item, isDefault: false }));
  }
  seats.push(next);
  if (seats.length > 0 && !seats.some((item) => item.isDefault)) {
    seats[0] = { ...seats[0], isDefault: true };
  }

  const sorted = sortLinkedInSeats(seats);
  writeJson(workspaceLinkedInSeatsPath(workspaceId), sorted);
  return sorted.find((item) => item.id === next.id)!;
}

export function deleteLinkedInSeat(id: string, workspaceId?: string) {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const seats = listLinkedInSeats(resolvedWorkspaceId).filter((item) => item.id !== id);
  if (seats.length > 0 && !seats.some((item) => item.isDefault)) {
    seats[0] = { ...seats[0], isDefault: true };
  }
  writeJson(workspaceLinkedInSeatsPath(resolvedWorkspaceId), sortLinkedInSeats(seats));
}

// ── Agent CRUD ─────────────────────────────────────────────────────────

export function getAgent(id: string, workspaceId?: string): Agent | null {
  const agent = readJson<Agent>(join(AGENTS_DIR(), `${id}.json`));
  if (!agent) return null;
  const hydrated = withWorkspaceId(agent);
  return matchesWorkspace(hydrated, workspaceId) ? hydrated : null;
}

export function listAgents(workspaceId?: string): Agent[] {
  ensureDir(AGENTS_DIR());
  return readdirSync(AGENTS_DIR())
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<Agent>(join(AGENTS_DIR(), f))!)
    .filter(Boolean)
    .map((agent) => withWorkspaceId(agent))
    .filter((agent) => matchesWorkspace(agent, workspaceId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveAgent(agent: Agent): Agent {
  const existing = agent.id ? getAgent(agent.id) : null;
  const next: Agent = {
    ...existing,
    ...agent,
    id: agent.id || existing?.id || nanoid("agt"),
    workspaceId: normalizeWorkspaceId(agent.workspaceId || existing?.workspaceId),
    createdAt: agent.createdAt || existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  ensureDir(AGENTS_DIR());
  writeJson(join(AGENTS_DIR(), `${next.id}.json`), next);
  return next;
}

export function deleteAgent(id: string) {
  const path = join(AGENTS_DIR(), `${id}.json`);
  if (existsSync(path)) unlinkSync(path);
}

// ── Campaign CRUD ──────────────────────────────────────────────────────

export function getCampaign(id: string, workspaceId?: string): Campaign | null {
  const campaign = readJson<Campaign>(join(CAMPAIGNS_DIR(), `${id}.json`));
  if (!campaign) return null;
  const hydrated = withWorkspaceId(campaign);
  return matchesWorkspace(hydrated, workspaceId) ? hydrated : null;
}

export function listCampaigns(opts: { workspaceId?: string; agentId?: string } = {}): Campaign[] {
  ensureDir(CAMPAIGNS_DIR());
  return readdirSync(CAMPAIGNS_DIR())
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<Campaign>(join(CAMPAIGNS_DIR(), f))!)
    .filter(Boolean)
    .map((campaign) => withWorkspaceId(campaign))
    .filter((campaign) => matchesWorkspace(campaign, opts.workspaceId))
    .filter((campaign) => !opts.agentId || campaign.agentId === opts.agentId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveCampaign(campaign: Campaign): Campaign {
  const existing = campaign.id ? getCampaign(campaign.id) : null;
  const agentWorkspaceId = getAgent(campaign.agentId)?.workspaceId;
  const next: Campaign = {
    ...existing,
    ...campaign,
    id: campaign.id || existing?.id || nanoid("cmp"),
    workspaceId: normalizeWorkspaceId(campaign.workspaceId || existing?.workspaceId || agentWorkspaceId),
    createdAt: campaign.createdAt || existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  ensureDir(CAMPAIGNS_DIR());
  writeJson(join(CAMPAIGNS_DIR(), `${next.id}.json`), next);
  return next;
}

export function deleteCampaign(id: string) {
  const path = join(CAMPAIGNS_DIR(), `${id}.json`);
  if (existsSync(path)) unlinkSync(path);

  const leadsPath = leadsDir(id);
  if (existsSync(leadsPath)) rmSync(leadsPath, { recursive: true, force: true });
}

// ── Campaign Stats (computed from leads) ───────────────────────────────

export function getCampaignStats(campaignId: string, workspaceId?: string): CampaignStats {
  const leads = listLeads(campaignId, { workspaceId });
  const sent = leads.filter((l) =>
    ["invite_sent", "accepted", "message_sent", "replied", "interested"].includes(l.status)
  ).length;
  const accepted = leads.filter((l) =>
    ["accepted", "message_sent", "replied", "interested"].includes(l.status)
  ).length;
  const replied = leads.filter((l) =>
    ["replied", "interested"].includes(l.status)
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

// ── Lead CRUD ──────────────────────────────────────────────────────────

function leadsDir(campaignId: string): string {
  return join(LEADS_DIR(), campaignId);
}

export function getLead(campaignId: string, leadId: string, workspaceId?: string): Lead | null {
  const lead = readJson<Lead>(join(leadsDir(campaignId), `${leadId}.json`));
  if (!lead) return null;
  const hydrated = withWorkspaceId(lead);
  return matchesWorkspace(hydrated, workspaceId) ? hydrated : null;
}

export function listLeads(
  campaignId: string,
  opts: { status?: LeadStatus; workspaceId?: string } = {}
): Lead[] {
  const campaign = getCampaign(campaignId, opts.workspaceId);
  if (!campaign) return [];

  const dir = leadsDir(campaignId);
  ensureDir(dir);

  let leads = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<Lead>(join(dir, f))!)
    .filter(Boolean)
    .map((lead) => withWorkspaceId(lead))
    .filter((lead) => matchesWorkspace(lead, opts.workspaceId));

  if (opts.status) {
    leads = leads.filter((lead) => lead.status === opts.status);
  }

  return leads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveLead(lead: Lead): Lead {
  const existing = lead.id ? getLead(lead.campaignId, lead.id) : null;
  const campaignWorkspaceId = getCampaign(lead.campaignId)?.workspaceId;
  const next: Lead = {
    ...existing,
    ...lead,
    id: lead.id || existing?.id || nanoid("led"),
    workspaceId: normalizeWorkspaceId(lead.workspaceId || existing?.workspaceId || campaignWorkspaceId),
    createdAt: lead.createdAt || existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const dir = leadsDir(next.campaignId);
  ensureDir(dir);
  writeJson(join(dir, `${next.id}.json`), next);
  addToIndex(next.providerId, next.campaignId, next.id, next.workspaceId);
  upsertExperimentExposure(next);
  return next;
}

export function deleteLead(campaignId: string, leadId: string) {
  const path = join(leadsDir(campaignId), `${leadId}.json`);
  if (existsSync(path)) unlinkSync(path);
}

// ── Per-workspace dedup index (provider_id is unique per workspace) ─

type DedupeIndex = Record<string, { campaignId: string; leadId: string; workspaceId: string }>;

function indexKey(workspaceId: string, providerId: string) {
  return `${workspaceId}::${providerId}`;
}

function loadIndex(): DedupeIndex {
  ensureDir(LEADS_DIR());
  return readJson<DedupeIndex>(INDEX_PATH()) || {};
}

function saveIndex(index: DedupeIndex) {
  ensureDir(LEADS_DIR());
  writeJson(INDEX_PATH(), index);
}

function migrateLegacyIndexIfNeeded() {
  const index = loadIndex();
  let dirty = false;
  for (const [key, ref] of Object.entries(index)) {
    if (key.includes("::")) continue;
    if (!("workspaceId" in ref) || !ref.workspaceId) {
      const campaign = getCampaign(ref.campaignId);
      const ws = campaign?.workspaceId || DEFAULT_WORKSPACE_ID;
      const migrated = { ...ref, workspaceId: ws };
      delete index[key];
      index[indexKey(ws, key)] = migrated;
      dirty = true;
    }
  }
  if (dirty) saveIndex(index);
}

export function isProviderIdUsed(providerId: string, workspaceId: string): boolean {
  migrateLegacyIndexIfNeeded();
  return Boolean(loadIndex()[indexKey(workspaceId, providerId)]);
}

export function addToIndex(
  providerId: string,
  campaignId: string,
  leadId: string,
  workspaceId: string,
) {
  const index = loadIndex();
  index[indexKey(workspaceId, providerId)] = { campaignId, leadId, workspaceId };
  saveIndex(index);
}

export function lookupByProviderId(
  providerId: string,
  workspaceId: string,
): { campaignId: string; leadId: string } | null {
  migrateLegacyIndexIfNeeded();
  const ref = loadIndex()[indexKey(workspaceId, providerId)];
  if (!ref) return null;
  const campaign = getCampaign(ref.campaignId);
  if (!campaign) return null;
  return campaign.workspaceId === workspaceId ? ref : null;
}

// ── Aggregate queries ──────────────────────────────────────────────────

export function getAllLeads(opts: { status?: LeadStatus; workspaceId?: string } = {}): Lead[] {
  ensureDir(LEADS_DIR());
  const leads: Lead[] = [];

  for (const dir of readdirSync(LEADS_DIR())) {
    if (dir.startsWith("_") || dir.endsWith(".json")) continue;
    const campaign = getCampaign(dir, opts.workspaceId);
    if (!campaign) continue;

    const dirPath = join(LEADS_DIR(), dir);
    for (const file of readdirSync(dirPath).filter((f) => f.endsWith(".json"))) {
      const lead = readJson<Lead>(join(dirPath, file));
      if (!lead) continue;
      const hydrated = withWorkspaceId(lead);
      if (!matchesWorkspace(hydrated, opts.workspaceId)) continue;
      leads.push(hydrated);
    }
  }

  const filtered = opts.status ? leads.filter((lead) => lead.status === opts.status) : leads;
  return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getDashboardStats(workspaceId?: string): {
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
} {
  const agents = listAgents(workspaceId);
  const campaigns = listCampaigns({ workspaceId });
  const allLeads = getAllLeads({ workspaceId });

  // Contacted = actually sent an invite (not just discovered/skipped)
  const contacted = allLeads.filter((lead) =>
    ["invite_sent", "accepted", "message_sent", "manual_override", "replied", "interested"].includes(lead.status)
  );
  // Discovered = total pipeline (all leads excluding skipped/errored)
  const discovered = allLeads.filter((lead) =>
    !["skipped", "invite_failed"].includes(lead.status)
  );
  const accepted = contacted.filter((lead) =>
    ["accepted", "message_sent", "manual_override", "replied", "interested"].includes(lead.status)
  );
  const replied = contacted.filter((lead) =>
    ["replied", "interested"].includes(lead.status)
  );

  return {
    totalContacted: contacted.length,
    totalDiscovered: discovered.length,
    totalSent: contacted.length,
    totalAccepted: accepted.length,
    totalReplied: replied.length,
    totalPending: allLeads.filter((lead) =>
      ["rate_limited"].includes(lead.status)
    ).length,
    activeAgents: agents.filter((agent) => agent.status === "active").length,
    activeCampaigns: campaigns.filter((campaign) => campaign.status === "active").length,
    connectRate: contacted.length > 0 ? Math.round((accepted.length / contacted.length) * 100) : 0,
    replyRate: contacted.length > 0 ? Math.round((replied.length / contacted.length) * 100) : 0,
  };
}

export function getDashboardSnapshot(
  workspaceId: string,
  period: DashboardPeriod,
): DashboardSnapshot | null {
  const snapshots = readJson<DashboardSnapshot[]>(workspaceDashboardSnapshotsPath(workspaceId)) || [];
  return snapshots.find((snapshot) => snapshot.workspaceId === workspaceId && snapshot.period === period) || null;
}

export function saveDashboardSnapshot(snapshot: DashboardSnapshot): DashboardSnapshot {
  const path = workspaceDashboardSnapshotsPath(snapshot.workspaceId);
  const snapshots = readJson<DashboardSnapshot[]>(path) || [];
  const next = [
    snapshot,
    ...snapshots.filter((item) => !(item.workspaceId === snapshot.workspaceId && item.period === snapshot.period)),
  ];
  writeJson(path, next);
  return snapshot;
}

// ── Discovery Runs ─────────────────────────────────────────────────────

function hydrateDiscoveryRun(run: DiscoveryRun): DiscoveryRun {
  const agentWorkspaceId = getAgent(run.agentId)?.workspaceId;
  return {
    ...run,
    workspaceId: normalizeWorkspaceId(run.workspaceId || agentWorkspaceId),
  };
}

export function saveDiscoveryRun(run: DiscoveryRun) {
  ensureDir(DATA_DIR());
  appendFileSync(DISCOVERY_LOG(), JSON.stringify(hydrateDiscoveryRun(run)) + "\n");
}

export function listDiscoveryRuns(limit = 20, workspaceId?: string): DiscoveryRun[] {
  return readJsonLines<DiscoveryRun>(DISCOVERY_LOG())
    .map((run) => hydrateDiscoveryRun(run))
    .filter((run) => matchesWorkspace(run, workspaceId))
    .reverse()
    .slice(0, limit);
}

// ── Signal Candidates ──────────────────────────────────────────────────

export function listSignalCandidates(
  opts: {
    workspaceId?: string;
    agentId?: string;
    campaignId?: string;
    status?: SignalCandidateStatus;
    topicKey?: string;
    signalKind?: SignalKind;
    limit?: number;
  } = {},
): SignalCandidate[] {
  ensureDir(SIGNALS_DIR());

  let signals = readdirSync(SIGNALS_DIR())
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<SignalCandidate>(join(SIGNALS_DIR(), f))!)
    .filter(Boolean)
    .map((signal) => withWorkspaceId(signal))
    .filter((signal) => matchesWorkspace(signal, opts.workspaceId));

  if (opts.agentId) {
    signals = signals.filter((signal) => signal.agentId === opts.agentId);
  }
  if (opts.campaignId) {
    signals = signals.filter((signal) => signal.campaignId === opts.campaignId);
  }
  if (opts.status) {
    signals = signals.filter((signal) => signal.status === opts.status);
  }
  if (opts.topicKey) {
    signals = signals.filter((signal) => signal.topicKey === opts.topicKey);
  }
  if (opts.signalKind) {
    signals = signals.filter((signal) => signal.signalKind === opts.signalKind);
  }

  const sorted = signals.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return typeof opts.limit === "number" ? sorted.slice(0, opts.limit) : sorted;
}

export function getSignalCandidate(id: string, workspaceId?: string): SignalCandidate | null {
  const signal = getSignalCandidateById(id);
  if (!signal) return null;
  return matchesWorkspace(signal, workspaceId) ? signal : null;
}

export function saveSignalCandidate(candidate: SignalCandidate): SignalCandidate {
  const signalId = candidate.id || buildSignalCandidateId(candidate.agentId, candidate.providerId);
  const existing = getSignalCandidateById(signalId);
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

  ensureDir(SIGNALS_DIR());
  writeJson(join(SIGNALS_DIR(), `${next.id}.json`), next);
  return next;
}

function getSignalCandidateById(signalId: string): SignalCandidate | null {
  const signal = readJson<SignalCandidate>(join(SIGNALS_DIR(), `${signalId}.json`));
  return signal ? withWorkspaceId(signal) : null;
}

// ── Rate Limit Tracking ─────────────────────────────────────────────────

/** Count invites sent in the last N days by checking lead events */
export function countInvitesSince(days: number, workspaceId?: string): number {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const leads = getAllLeads({ workspaceId });
  let count = 0;
  for (const lead of leads) {
    for (const event of lead.events) {
      if (event.type === "invite_sent" && event.ts >= cutoff) {
        count++;
        break; // count each lead only once
      }
    }
  }
  return count;
}

/** Count invites sent in the current local calendar week (Monday-Sunday). */
export function countInvitesInCurrentWeek(workspaceId?: string, now = new Date()): number {
  const weekStart = startOfLocalWeek(now).getTime();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndTs = weekEnd.getTime();
  const leads = getAllLeads({ workspaceId });
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

/** Count invites sent for a campaign on a given local calendar day (YYYY-MM-DD). */
export function countCampaignInvitesOnDay(
  campaignId: string,
  dayKey: string,
  workspaceId?: string
): number {
  const leads = listLeads(campaignId, { workspaceId });
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

// ── Outreach Runs ──────────────────────────────────────────────────────

export function listOutreachRuns(limit = 20, workspaceId?: string): Record<string, unknown>[] {
  return readJsonLines<Record<string, unknown>>(OUTREACH_LOG())
    .map((run) => {
      const campaignId = typeof run.campaignId === "string" ? run.campaignId : "";
      const campaignWorkspaceId = campaignId ? getCampaign(campaignId)?.workspaceId : undefined;
      return {
        ...run,
        workspaceId: normalizeWorkspaceId(
          typeof run.workspaceId === "string" ? run.workspaceId : campaignWorkspaceId
        ),
      };
    })
    .filter((run) => matchesWorkspace(run, workspaceId))
    .reverse()
    .slice(0, limit);
}

export function saveOutreachRun(entry: Record<string, unknown>) {
  ensureDir(DATA_DIR());
  appendFileSync(OUTREACH_LOG(), JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
}

const WEBHOOK_LOG = () => dataPath("events.jsonl");

export function saveWebhookEvent(entry: {
  workspaceId: string;
  ts?: string;
  eventType?: string;
  providerId?: string;
  campaignId?: string;
  leadId?: string;
  payload: Record<string, unknown>;
}) {
  ensureDir(DATA_DIR());
  appendFileSync(WEBHOOK_LOG(), JSON.stringify({
    ts: entry.ts || new Date().toISOString(),
    workspaceId: normalizeWorkspaceId(entry.workspaceId),
    eventType: entry.eventType,
    providerId: entry.providerId,
    campaignId: entry.campaignId,
    leadId: entry.leadId,
    ...entry.payload,
  }) + "\n");
}

export function listWebhookEvents(workspaceId: string, limit = 50): Record<string, unknown>[] {
  return readJsonLines<Record<string, unknown>>(WEBHOOK_LOG())
    .map((event) => ({
      ...event,
      workspaceId: typeof event.workspaceId === "string" ? event.workspaceId : DEFAULT_WORKSPACE_ID,
    }))
    .filter((event) => event.workspaceId === workspaceId)
    .reverse()
    .slice(0, limit);
}
