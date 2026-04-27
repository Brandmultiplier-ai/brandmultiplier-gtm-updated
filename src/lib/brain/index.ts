import { isSupabaseStorageEnabled } from "../storage-mode";
import type { BrainSnapshot } from "../types";
import * as localBrain from "./index-local";
import * as supabaseBrain from "./supabase-store";
import * as store from "../store";
import { analyzeLeads } from "./analyzer";
import { generateRecommendations } from "./recommender";
import { getActiveExperiment } from "./experiment-store";

const DEFAULT_WORKSPACE_ID = "ws_default";

function normalizeWorkspaceId(workspaceId?: string | null): string {
  return workspaceId || DEFAULT_WORKSPACE_ID;
}

function generateId(): string {
  return "brn_" + Math.random().toString(36).substring(2, 10);
}

export async function analyzeWorkspace(workspaceId?: string): Promise<BrainSnapshot> {
  if (!isSupabaseStorageEnabled()) {
    return localBrain.analyzeWorkspace(workspaceId);
  }

  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const campaigns = await store.listCampaigns({ workspaceId: scopedWorkspaceId });
  const patterns = await analyzeLeads(scopedWorkspaceId);
  const recommendations = generateRecommendations(patterns);
  const activeExp = await getActiveExperiment(scopedWorkspaceId);

  const snapshot: BrainSnapshot = {
    id: generateId(),
    workspaceId: scopedWorkspaceId,
    analyzedAt: new Date().toISOString(),
    leadsAnalyzed: patterns.overall.total,
    campaignsAnalyzed: campaigns.length,
    patterns,
    recommendations,
    activeExperimentId: activeExp?.id,
  };

  await supabaseBrain.saveSnapshot(snapshot);
  return snapshot;
}

export async function getLatestSnapshot(workspaceId?: string): Promise<BrainSnapshot | null> {
  if (!isSupabaseStorageEnabled()) {
    return localBrain.getLatestSnapshot(workspaceId);
  }
  return supabaseBrain.getLatestSnapshot(workspaceId);
}

export async function listSnapshots(limit = 10, workspaceId?: string): Promise<BrainSnapshot[]> {
  if (!isSupabaseStorageEnabled()) {
    return localBrain.listSnapshots(limit, workspaceId);
  }
  return supabaseBrain.listSnapshots(limit, workspaceId);
}
