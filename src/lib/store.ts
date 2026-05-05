import type {
  Agent,
  Campaign,
  CampaignStats,
  ContactList,
  DiscoveryRun,
  Lead,
  LeadStatus,
  LinkedInSeat,
  DashboardPeriod,
  DashboardSnapshot,
  SignalCandidate,
  SignalCandidateStatus,
  SignalKind,
  Workspace,
  WorkspaceTemplate,
} from "./types";
import * as localStore from "./store-local";
import * as supabaseStore from "./store-supabase";
import { isSupabaseStorageEnabled } from "./storage-mode";

export const DEFAULT_WORKSPACE_ID = localStore.DEFAULT_WORKSPACE_ID;

function backend() {
  return isSupabaseStorageEnabled() ? supabaseStore : localStore;
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  return backend().getWorkspace(id);
}

export async function listWorkspaces(): Promise<Workspace[]> {
  return backend().listWorkspaces();
}

export async function saveWorkspace(workspace: Workspace): Promise<Workspace> {
  return backend().saveWorkspace(workspace);
}

export async function deleteWorkspace(id: string): Promise<void> {
  return backend().deleteWorkspace(id);
}

export async function listWorkspaceTemplates(workspaceId?: string): Promise<WorkspaceTemplate[]> {
  return backend().listWorkspaceTemplates(workspaceId);
}

export async function saveWorkspaceTemplate(template: WorkspaceTemplate): Promise<WorkspaceTemplate> {
  return backend().saveWorkspaceTemplate(template);
}

export async function deleteWorkspaceTemplate(id: string, workspaceId?: string): Promise<void> {
  return backend().deleteWorkspaceTemplate(id, workspaceId);
}

export async function syncWorkspaceTemplatesToAgents(workspaceId?: string): Promise<void> {
  return backend().syncWorkspaceTemplatesToAgents(workspaceId);
}

export async function listContactLists(workspaceId?: string): Promise<ContactList[]> {
  return backend().listContactLists(workspaceId);
}

export async function saveContactList(list: ContactList): Promise<ContactList> {
  return backend().saveContactList(list);
}

export async function deleteContactList(id: string, workspaceId?: string): Promise<void> {
  return backend().deleteContactList(id, workspaceId);
}

export async function getLinkedInSeat(id: string, workspaceId?: string): Promise<LinkedInSeat | null> {
  return backend().getLinkedInSeat(id, workspaceId);
}

export async function listLinkedInSeats(workspaceId?: string): Promise<LinkedInSeat[]> {
  return backend().listLinkedInSeats(workspaceId);
}

export async function saveLinkedInSeat(seat: LinkedInSeat): Promise<LinkedInSeat> {
  return backend().saveLinkedInSeat(seat);
}

export async function deleteLinkedInSeat(id: string, workspaceId?: string): Promise<void> {
  return backend().deleteLinkedInSeat(id, workspaceId);
}

export async function getAgent(id: string, workspaceId?: string): Promise<Agent | null> {
  return backend().getAgent(id, workspaceId);
}

export async function listAgents(workspaceId?: string): Promise<Agent[]> {
  return backend().listAgents(workspaceId);
}

export async function saveAgent(agent: Agent): Promise<Agent> {
  return backend().saveAgent(agent);
}

export async function deleteAgent(id: string): Promise<void> {
  return backend().deleteAgent(id);
}

export async function getCampaign(id: string, workspaceId?: string): Promise<Campaign | null> {
  return backend().getCampaign(id, workspaceId);
}

export async function listCampaigns(opts: { workspaceId?: string; agentId?: string } = {}): Promise<Campaign[]> {
  return backend().listCampaigns(opts);
}

export async function saveCampaign(campaign: Campaign): Promise<Campaign> {
  return backend().saveCampaign(campaign);
}

export async function deleteCampaign(id: string): Promise<void> {
  return backend().deleteCampaign(id);
}

export async function getCampaignStats(campaignId: string, workspaceId?: string): Promise<CampaignStats> {
  return backend().getCampaignStats(campaignId, workspaceId);
}

export async function getLead(campaignId: string, leadId: string, workspaceId?: string): Promise<Lead | null> {
  return backend().getLead(campaignId, leadId, workspaceId);
}

export async function listLeads(
  campaignId: string,
  opts: { status?: LeadStatus; workspaceId?: string } = {},
): Promise<Lead[]> {
  return backend().listLeads(campaignId, opts);
}

export async function saveLead(lead: Lead): Promise<Lead> {
  return backend().saveLead(lead);
}

export async function deleteLead(campaignId: string, leadId: string): Promise<void> {
  return backend().deleteLead(campaignId, leadId);
}

export async function isProviderIdUsed(
  providerId: string,
  workspaceId: string,
): Promise<boolean> {
  return backend().isProviderIdUsed(providerId, workspaceId);
}

export async function addToIndex(
  providerId: string,
  campaignId: string,
  leadId: string,
  workspaceId: string,
): Promise<void> {
  return backend().addToIndex(providerId, campaignId, leadId, workspaceId);
}

export async function lookupByProviderId(
  providerId: string,
  workspaceId: string,
): Promise<{ campaignId: string; leadId: string } | null> {
  return backend().lookupByProviderId(providerId, workspaceId);
}

export async function getAllLeads(opts: { status?: LeadStatus; workspaceId?: string } = {}): Promise<Lead[]> {
  return backend().getAllLeads(opts);
}

export async function getDashboardStats(workspaceId?: string) {
  return backend().getDashboardStats(workspaceId);
}

export async function getDashboardSnapshot(
  workspaceId: string,
  period: DashboardPeriod,
): Promise<DashboardSnapshot | null> {
  if ("getDashboardSnapshot" in backend()) {
    return backend().getDashboardSnapshot(workspaceId, period);
  }
  return null;
}

export async function saveDashboardSnapshot(snapshot: DashboardSnapshot): Promise<DashboardSnapshot> {
  if ("saveDashboardSnapshot" in backend()) {
    return backend().saveDashboardSnapshot(snapshot);
  }
  return snapshot;
}

export async function saveDiscoveryRun(run: DiscoveryRun): Promise<void> {
  return backend().saveDiscoveryRun(run);
}

export async function listDiscoveryRuns(limit = 20, workspaceId?: string): Promise<DiscoveryRun[]> {
  return backend().listDiscoveryRuns(limit, workspaceId);
}

export async function listSignalCandidates(opts: {
  workspaceId?: string;
  agentId?: string;
  campaignId?: string;
  status?: SignalCandidateStatus;
  topicKey?: string;
  signalKind?: SignalKind;
  limit?: number;
} = {}): Promise<SignalCandidate[]> {
  return backend().listSignalCandidates(opts);
}

export async function getSignalCandidate(id: string, workspaceId?: string): Promise<SignalCandidate | null> {
  return backend().getSignalCandidate(id, workspaceId);
}

export async function saveSignalCandidate(candidate: SignalCandidate): Promise<SignalCandidate> {
  return backend().saveSignalCandidate(candidate);
}

export async function countInvitesSince(days: number, workspaceId?: string): Promise<number> {
  return backend().countInvitesSince(days, workspaceId);
}

export async function countInvitesInCurrentWeek(workspaceId?: string, now = new Date()): Promise<number> {
  return backend().countInvitesInCurrentWeek(workspaceId, now);
}

export async function countCampaignInvitesOnDay(
  campaignId: string,
  dayKey: string,
  workspaceId?: string,
): Promise<number> {
  return backend().countCampaignInvitesOnDay(campaignId, dayKey, workspaceId);
}

export async function saveOutreachRun(entry: Record<string, unknown>): Promise<void> {
  if ("saveOutreachRun" in backend()) {
    return backend().saveOutreachRun(entry);
  }
}

export async function listOutreachRuns(limit = 20, workspaceId?: string): Promise<Record<string, unknown>[]> {
  return backend().listOutreachRuns(limit, workspaceId);
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
  if ("saveWebhookEvent" in backend()) {
    return backend().saveWebhookEvent(entry);
  }
}

export async function listWebhookEvents(workspaceId: string, limit = 50): Promise<Record<string, unknown>[]> {
  if ("listWebhookEvents" in backend()) {
    return backend().listWebhookEvents(workspaceId, limit);
  }
  return [];
}
