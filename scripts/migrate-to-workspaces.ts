import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import * as store from "../src/lib/store";
import type { Agent, Campaign, DiscoveryRun, Lead, Workspace } from "../src/lib/types";

const ROOT = new URL("..", import.meta.url).pathname;
const DATA_DIR = join(ROOT, "data");
const ENV_FILE = join(ROOT, ".env.local");
const DEFAULT_WORKSPACE_ID = store.DEFAULT_WORKSPACE_ID;

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};

  const env: Record<string, string> = {};
  for (const rawLine of readFileSync(path, "utf-8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const idx = line.indexOf("=");
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function loadEnv(): Record<string, string> {
  return {
    ...parseEnvFile(ENV_FILE),
    ...Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    ),
  };
}

function writeJson<T>(path: string, data: T) {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function patchAgents(): number {
  const dir = join(DATA_DIR, "agents");
  if (!existsSync(dir)) return 0;

  let changed = 0;
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    const path = join(dir, file);
    const agent = JSON.parse(readFileSync(path, "utf-8")) as Partial<Agent>;
    if (agent.workspaceId) continue;
    agent.workspaceId = DEFAULT_WORKSPACE_ID;
    writeJson(path, agent);
    changed++;
  }
  return changed;
}

function patchCampaigns(): number {
  const dir = join(DATA_DIR, "campaigns");
  if (!existsSync(dir)) return 0;

  let changed = 0;
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    const path = join(dir, file);
    const campaign = JSON.parse(readFileSync(path, "utf-8")) as Partial<Campaign>;
    if (campaign.workspaceId) continue;
    const agentWorkspaceId = campaign.agentId ? store.getAgent(campaign.agentId)?.workspaceId : undefined;
    campaign.workspaceId = agentWorkspaceId || DEFAULT_WORKSPACE_ID;
    writeJson(path, campaign);
    changed++;
  }
  return changed;
}

function patchLeads(): number {
  const leadsDir = join(DATA_DIR, "leads");
  if (!existsSync(leadsDir)) return 0;

  let changed = 0;
  for (const campaignId of readdirSync(leadsDir)) {
    if (campaignId.startsWith("_") || campaignId.endsWith(".json")) continue;

    const dir = join(leadsDir, campaignId);
    const campaignWorkspaceId = store.getCampaign(campaignId)?.workspaceId || DEFAULT_WORKSPACE_ID;

    for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
      const path = join(dir, file);
      const lead = JSON.parse(readFileSync(path, "utf-8")) as Partial<Lead>;
      if (lead.workspaceId) continue;
      lead.workspaceId = campaignWorkspaceId;
      writeJson(path, lead);
      changed++;
    }
  }
  return changed;
}

function patchJsonlRuns<T extends { workspaceId?: string }>(
  filename: string,
  resolver: (entry: T) => string
): number {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) return 0;

  const raw = readFileSync(path, "utf-8");
  if (!raw.trim()) return 0;

  const lines = raw.split("\n");
  let changed = 0;

  const nextLines = lines.map((line) => {
    if (!line.trim()) return line;
    const entry = JSON.parse(line) as T;
    if (entry.workspaceId) return JSON.stringify(entry);
    entry.workspaceId = resolver(entry);
    changed++;
    return JSON.stringify(entry);
  });

  if (changed > 0) {
    writeFileSync(path, nextLines.join("\n"));
  }

  return changed;
}

async function main() {
  const env = loadEnv();
  const existing = store.getWorkspace(DEFAULT_WORKSPACE_ID);

  const workspace: Workspace = {
    id: DEFAULT_WORKSPACE_ID,
    name: existing?.name || "Claw4Growth",
    slug: existing?.slug || "default",
    status: existing?.status || "active",
    niche: existing?.niche || "marketing",
    defaultLanguage: existing?.defaultLanguage || "it",
    channels: existing?.channels || {
      linkedin: env.UNIPILE_ACCOUNT_ID && env.UNIPILE_API_KEY && env.UNIPILE_BASE_URL
        ? {
            unipileAccountId: env.UNIPILE_ACCOUNT_ID,
            unipileApiKey: env.UNIPILE_API_KEY,
            unipileBaseUrl: env.UNIPILE_BASE_URL,
          }
        : undefined,
    },
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: "",
  };

  store.saveWorkspace(workspace);

  const agentsUpdated = patchAgents();
  const campaignsUpdated = patchCampaigns();
  const leadsUpdated = patchLeads();
  const discoveryRunsUpdated = patchJsonlRuns<DiscoveryRun>("discovery-runs.jsonl", (run) =>
    run.agentId ? store.getAgent(run.agentId)?.workspaceId || DEFAULT_WORKSPACE_ID : DEFAULT_WORKSPACE_ID
  );
  const outreachRunsUpdated = patchJsonlRuns<Record<string, unknown>>("outreach-runs.jsonl", (run) => {
    const campaignId = typeof run.campaignId === "string" ? run.campaignId : "";
    return campaignId ? store.getCampaign(campaignId)?.workspaceId || DEFAULT_WORKSPACE_ID : DEFAULT_WORKSPACE_ID;
  });

  console.log("Workspace migration complete");
  console.log(`workspace: ${DEFAULT_WORKSPACE_ID}`);
  console.log(`agents updated: ${agentsUpdated}`);
  console.log(`campaigns updated: ${campaignsUpdated}`);
  console.log(`leads updated: ${leadsUpdated}`);
  console.log(`discovery runs updated: ${discoveryRunsUpdated}`);
  console.log(`outreach runs updated: ${outreachRunsUpdated}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
