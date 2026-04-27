import { isSupabaseStorageEnabled } from "../storage-mode";
import type { BrainExperiment } from "../types";
import * as localStore from "./experiment-store-local";
import * as supabaseStore from "./supabase-store";

export function generateExperimentId(): string {
  return isSupabaseStorageEnabled()
    ? supabaseStore.generateExperimentId()
    : localStore.generateExperimentId();
}

export async function saveExperiment(exp: BrainExperiment): Promise<void> {
  if (isSupabaseStorageEnabled()) {
    return supabaseStore.saveExperiment(exp);
  }
  return localStore.saveExperiment(exp);
}

export async function getActiveExperiment(workspaceId?: string): Promise<BrainExperiment | null> {
  if (isSupabaseStorageEnabled()) {
    return supabaseStore.getActiveExperiment(workspaceId);
  }
  return localStore.getActiveExperiment(workspaceId);
}

export async function getExperiment(id: string): Promise<BrainExperiment | null> {
  if (isSupabaseStorageEnabled()) {
    return supabaseStore.getExperiment(id);
  }
  return localStore.getExperiment(id);
}

export async function listExperiments(workspaceId?: string, limit = 20): Promise<BrainExperiment[]> {
  if (isSupabaseStorageEnabled()) {
    return supabaseStore.listExperiments(workspaceId, limit);
  }
  return localStore.listExperiments(workspaceId, limit);
}

export async function updateExperiment(id: string, updates: Partial<BrainExperiment>): Promise<BrainExperiment | null> {
  if (isSupabaseStorageEnabled()) {
    return supabaseStore.updateExperiment(id, updates);
  }
  return localStore.updateExperiment(id, updates);
}
