import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

type LeadEvent = {
  ts?: string;
  type?: string;
  message?: string;
};

type LeadRecord = {
  campaignId?: string;
  status?: string;
  currentStep?: number;
  updatedAt?: string;
  events?: LeadEvent[];
};

type RunRecord = {
  ts?: string;
  campaignId?: string;
  status?: string;
};

const ROOT = process.cwd();
const LEADS_DIR = join(ROOT, "data", "leads");
const RUN_LOG = join(ROOT, "data", "outreach-runs.jsonl");
const FALSE_ALREADY_INVITED_MESSAGE = "Already invited (detected by provider)";
const PROVIDER_WINDOW_MS = 15 * 60 * 1000;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function writeJson(path: string, data: unknown) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function readJsonLines<T>(path: string): T[] {
  const content = readFileSync(path, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}

function hasNearbyProviderLimitRun(runs: RunRecord[], campaignId: string, eventTs: string): boolean {
  const target = Date.parse(eventTs);
  if (!Number.isFinite(target)) return false;

  return runs.some((run) => {
    if (run.campaignId !== campaignId || run.status !== "rate_limited" || !run.ts) return false;
    const runTs = Date.parse(run.ts);
    if (!Number.isFinite(runTs)) return false;
    return Math.abs(runTs - target) <= PROVIDER_WINDOW_MS;
  });
}

function main() {
  const runs = readJsonLines<RunRecord>(RUN_LOG);
  let updated = 0;

  for (const campaignDir of readdirSync(LEADS_DIR)) {
    if (campaignDir.startsWith("_") || campaignDir.endsWith(".json")) continue;
    const dirPath = join(LEADS_DIR, campaignDir);

    for (const fileName of readdirSync(dirPath)) {
      if (!fileName.endsWith(".json")) continue;

      const path = join(dirPath, fileName);
      const lead = readJson<LeadRecord>(path);
      const inviteEvent = lead.events?.find((event) =>
        event.type === "invite_sent" && event.message === FALSE_ALREADY_INVITED_MESSAGE && typeof event.ts === "string"
      );
      if (!inviteEvent?.ts) continue;

      const campaignId = lead.campaignId || campaignDir;
      if (!hasNearbyProviderLimitRun(runs, campaignId, inviteEvent.ts)) continue;

      lead.status = "rate_limited";
      lead.currentStep = 0;
      lead.updatedAt = new Date().toISOString();
      lead.events = (lead.events || []).map((event) => {
        if (event === inviteEvent) {
          return {
            ...event,
            type: "rate_limited",
            message: "Recovered from provider block after false already-invited classification",
          };
        }
        return event;
      });

      writeJson(path, lead);
      updated++;
    }
  }

  console.log(`False already-invited leads updated: ${updated}`);
}

main();
