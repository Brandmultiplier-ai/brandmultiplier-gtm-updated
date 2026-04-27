/**
 * Brain v1 — Experiment Store
 *
 * CRUD for experiments. Storage: data/brain/experiments.jsonl (append-only)
 * + workspace-scoped active experiment pointers.
 */

import { appendFileSync, writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import type { BrainExperiment } from "../types";
import { dataPath } from "../data-paths";

const DATA_DIR = () => dataPath("brain");
const EXPERIMENTS_LOG = () => dataPath("brain", "experiments.jsonl");
const ACTIVE_DIR = () => dataPath("brain", "active-experiments");
const LEGACY_ACTIVE_FILE = () => dataPath("brain", "active-experiment.json");
const DEFAULT_WORKSPACE_ID = "ws_default";

function ensureDir() {
  if (!existsSync(DATA_DIR())) mkdirSync(DATA_DIR(), { recursive: true });
  if (!existsSync(ACTIVE_DIR())) mkdirSync(ACTIVE_DIR(), { recursive: true });
}

function normalizeWorkspaceId(workspaceId?: string | null): string {
  return workspaceId || DEFAULT_WORKSPACE_ID;
}

function getActiveFile(workspaceId?: string): string {
  return join(ACTIVE_DIR(), `${normalizeWorkspaceId(workspaceId)}.json`);
}

function clearActiveFileIfMatches(path: string, experimentId: string): void {
  if (!existsSync(path)) return;
  try {
    const active = JSON.parse(readFileSync(path, "utf-8")) as { experimentId?: string };
    if (active.experimentId === experimentId) unlinkSync(path);
  } catch {
    // ignore corrupt pointer files
  }
}

export function generateExperimentId(): string {
  return "exp_" + Math.random().toString(36).substring(2, 10);
}

export function saveExperiment(exp: BrainExperiment): void {
  ensureDir();
  appendFileSync(EXPERIMENTS_LOG(), JSON.stringify(exp) + "\n");

  const activeFile = getActiveFile(exp.workspaceId);
  if (exp.status === "running" || exp.status === "approved") {
    writeFileSync(activeFile, JSON.stringify({ experimentId: exp.id, workspaceId: normalizeWorkspaceId(exp.workspaceId) }, null, 2));
  } else if (exp.status === "kept" || exp.status === "discarded" || exp.status === "cancelled") {
    clearActiveFileIfMatches(activeFile, exp.id);
    clearActiveFileIfMatches(LEGACY_ACTIVE_FILE(), exp.id);
  }
}

export function getActiveExperiment(workspaceId?: string): BrainExperiment | null {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const candidateFiles = [getActiveFile(scopedWorkspaceId), LEGACY_ACTIVE_FILE()];

  for (const path of candidateFiles) {
    if (!existsSync(path)) continue;
    try {
      const active = JSON.parse(readFileSync(path, "utf-8")) as { experimentId?: string; workspaceId?: string };
      if (!active.experimentId) continue;
      if (normalizeWorkspaceId(active.workspaceId) !== scopedWorkspaceId) continue;
      return getExperiment(active.experimentId);
    } catch {
      // ignore corrupt pointer files
    }
  }

  return null;
}

export function getExperiment(id: string): BrainExperiment | null {
  if (!existsSync(EXPERIMENTS_LOG())) return null;
  try {
    const lines = readFileSync(EXPERIMENTS_LOG(), "utf-8").trim().split("\n").filter(Boolean);
    // Return latest entry for this ID (status updates append new lines)
    for (let i = lines.length - 1; i >= 0; i--) {
      const exp = JSON.parse(lines[i]) as BrainExperiment;
      if (exp.id === id) return exp;
    }
    return null;
  } catch {
    return null;
  }
}

export function listExperiments(workspaceId?: string, limit = 20): BrainExperiment[] {
  if (!existsSync(EXPERIMENTS_LOG())) return [];
  try {
    const lines = readFileSync(EXPERIMENTS_LOG(), "utf-8").trim().split("\n").filter(Boolean);
    // Get latest state per experiment ID
    const byId = new Map<string, BrainExperiment>();
    for (const line of lines) {
      const exp = JSON.parse(line) as BrainExperiment;
      if (workspaceId && exp.workspaceId !== workspaceId) continue;
      byId.set(exp.id, exp);
    }
    return Array.from(byId.values()).slice(-limit).reverse();
  } catch {
    return [];
  }
}

export function updateExperiment(id: string, updates: Partial<BrainExperiment>): BrainExperiment | null {
  const existing = getExperiment(id);
  if (!existing) return null;
  const updated = { ...existing, ...updates };
  saveExperiment(updated);
  return updated;
}
