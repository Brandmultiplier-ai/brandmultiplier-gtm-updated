import { isSupabaseStorageEnabled } from "../storage-mode";
import type { ExperimentExposure, Lead } from "../types";
import * as localStore from "./exposure-store-local";
import * as supabaseStore from "./supabase-store";

export async function upsertExperimentExposure(lead: Lead): Promise<ExperimentExposure | null> {
  if (isSupabaseStorageEnabled()) {
    return supabaseStore.upsertExperimentExposure(lead);
  }
  return localStore.upsertExperimentExposure(lead);
}

export async function listExperimentExposures(experimentId: string, workspaceId?: string): Promise<ExperimentExposure[]> {
  if (isSupabaseStorageEnabled()) {
    return supabaseStore.listExperimentExposures(experimentId, workspaceId);
  }
  return localStore.listExperimentExposures(experimentId, workspaceId);
}
