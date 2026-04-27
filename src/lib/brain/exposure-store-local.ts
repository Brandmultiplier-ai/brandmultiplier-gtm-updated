import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { ExperimentExposure, Lead } from "../types";
import { dataPath } from "../data-paths";

const DATA_DIR = () => dataPath("brain", "exposures");

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function exposureDir(experimentId: string): string {
  return join(DATA_DIR(), experimentId);
}

function exposurePath(experimentId: string, leadId: string): string {
  return join(exposureDir(experimentId), `${leadId}.json`);
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function getLeadEventTs(lead: Lead, type: "invite_sent" | "accepted" | "replied"): string | undefined {
  return lead.events.find((event) => event.type === type)?.ts;
}

export function upsertExperimentExposure(lead: Lead): ExperimentExposure | null {
  if (!lead.id || !lead.experimentId || !lead.experimentArm || typeof lead.templateIndex !== "number") {
    return null;
  }

  const sentAt = getLeadEventTs(lead, "invite_sent");
  if (!sentAt) return null;

  const path = exposurePath(lead.experimentId, lead.id);
  const existing = readJson<ExperimentExposure>(path);
  const now = new Date().toISOString();

  const exposure: ExperimentExposure = {
    id: existing?.id || `${lead.experimentId}:${lead.id}`,
    experimentId: lead.experimentId,
    workspaceId: lead.workspaceId,
    campaignId: lead.campaignId,
    leadId: lead.id,
    providerId: lead.providerId,
    language: lead.language,
    experimentArm: lead.experimentArm,
    templateIndex: lead.templateIndex,
    templateHash: lead.templateHash,
    assignedAt: existing?.assignedAt || lead.createdAt || sentAt,
    sentAt,
    acceptedAt: getLeadEventTs(lead, "accepted") || existing?.acceptedAt,
    repliedAt: getLeadEventTs(lead, "replied") || existing?.repliedAt,
    updatedAt: now,
  };

  ensureDir(exposureDir(lead.experimentId));
  writeFileSync(path, JSON.stringify(exposure, null, 2));
  return exposure;
}

export function listExperimentExposures(experimentId: string, workspaceId?: string): ExperimentExposure[] {
  const dir = exposureDir(experimentId);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson<ExperimentExposure>(join(dir, file)))
    .filter((exposure): exposure is ExperimentExposure => exposure !== null)
    .filter((exposure) => !workspaceId || exposure.workspaceId === workspaceId)
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}
