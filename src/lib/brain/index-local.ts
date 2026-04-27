/**
 * Brain v0 — Entry point
 *
 * Analyzes workspace data and produces a BrainSnapshot with patterns + recommendations.
 * Storage: data/brain/snapshots.jsonl (append-only) + workspace-scoped latest snapshots
 */

import { appendFileSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import * as store from "../store-local";
import type { BrainSnapshot } from "../types";
import { analyzeLeads } from "./analyzer";
import { generateRecommendations } from "./recommender";
import { getActiveExperiment } from "./experiment-store-local";
import { dataPath } from "../data-paths";

const DATA_DIR = () => dataPath("brain");
const SNAPSHOTS_LOG = () => dataPath("brain", "snapshots.jsonl");
const LATEST_DIR = () => dataPath("brain", "latest");
const LEGACY_LATEST_FILE = () => dataPath("brain", "latest.json");
const DEFAULT_WORKSPACE_ID = "ws_default";

function ensureDir() {
  if (!existsSync(DATA_DIR())) mkdirSync(DATA_DIR(), { recursive: true });
  if (!existsSync(LATEST_DIR())) mkdirSync(LATEST_DIR(), { recursive: true });
}

function generateId(): string {
  return "brn_" + Math.random().toString(36).substring(2, 10);
}

function normalizeWorkspaceId(workspaceId?: string | null): string {
  return workspaceId || DEFAULT_WORKSPACE_ID;
}

function getLatestFile(workspaceId?: string): string {
  return join(LATEST_DIR(), `${normalizeWorkspaceId(workspaceId)}.json`);
}

// ── Public API ──────────────────────────────────────────────────────────

export async function analyzeWorkspace(workspaceId?: string): Promise<BrainSnapshot> {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const campaigns = store.listCampaigns({ workspaceId: scopedWorkspaceId });
  const patterns = await analyzeLeads(scopedWorkspaceId);
  const recommendations = generateRecommendations(patterns);

  // Check for active experiment
  const activeExp = getActiveExperiment(scopedWorkspaceId);

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

  // Persist
  ensureDir();
  appendFileSync(SNAPSHOTS_LOG(), JSON.stringify(snapshot) + "\n");
  writeFileSync(getLatestFile(scopedWorkspaceId), JSON.stringify(snapshot, null, 2));

  return snapshot;
}

export function getLatestSnapshot(workspaceId?: string): BrainSnapshot | null {
  const scopedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const candidateFiles = [getLatestFile(scopedWorkspaceId), LEGACY_LATEST_FILE()];

  for (const path of candidateFiles) {
    if (!existsSync(path)) continue;
    try {
      const data = JSON.parse(readFileSync(path, "utf-8")) as BrainSnapshot;
      if (normalizeWorkspaceId(data.workspaceId) !== scopedWorkspaceId) continue;
      return data;
    } catch {
      // ignore invalid snapshot files
    }
  }

  return null;
}

export function listSnapshots(limit = 10, workspaceId?: string): BrainSnapshot[] {
  if (!existsSync(SNAPSHOTS_LOG())) return [];
  try {
    const lines = readFileSync(SNAPSHOTS_LOG(), "utf-8").trim().split("\n").filter(Boolean);
    const all = lines.map((line) => JSON.parse(line) as BrainSnapshot);
    const filtered = workspaceId ? all.filter((s) => s.workspaceId === workspaceId) : all;
    return filtered.slice(-limit).reverse();
  } catch {
    return [];
  }
}
