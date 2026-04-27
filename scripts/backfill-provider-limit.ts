import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

type JsonObject = Record<string, unknown>;

type LeadEvent = {
  ts?: string;
  type?: string;
  message?: string;
};

type LeadRecord = JsonObject & {
  id?: string;
  campaignId?: string;
  status?: string;
  updatedAt?: string;
  events?: LeadEvent[];
};

type RunRecord = JsonObject & {
  ts?: string;
  campaignId?: string;
  status?: string;
  skipped?: number;
  errors?: number;
};

type ProviderLimitLead = {
  path: string;
  campaignId: string;
  eventTs: string;
  changed: boolean;
};

const ROOT = process.cwd();
const LEADS_DIR = join(ROOT, "data", "leads");
const RUN_LOG = join(ROOT, "data", "outreach-runs.jsonl");
const PROVIDER_LIMIT_TEXT = "temporary provider limit";

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

function writeJsonLines(path: string, rows: unknown[]) {
  const content = rows.map((row) => JSON.stringify(row)).join("\n");
  writeFileSync(path, `${content}\n`);
}

function isProviderLimitMessage(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase().includes(PROVIDER_LIMIT_TEXT);
}

function getProviderLimitEvent(events: LeadEvent[] | undefined): LeadEvent | undefined {
  return events?.find((event) => isProviderLimitMessage(event.message));
}

function sortByTs<T extends { ts?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.ts || "").localeCompare(b.ts || ""));
}

function backfillLeads(): ProviderLimitLead[] {
  const providerLimitLeads: ProviderLimitLead[] = [];

  for (const campaignDir of readdirSync(LEADS_DIR)) {
    if (campaignDir.startsWith("_") || campaignDir.endsWith(".json")) continue;
    const dirPath = join(LEADS_DIR, campaignDir);

    for (const fileName of readdirSync(dirPath)) {
      if (!fileName.endsWith(".json")) continue;

      const path = join(dirPath, fileName);
      const lead = readJson<LeadRecord>(path);
      const providerLimitEvent = getProviderLimitEvent(lead.events);
      if (!providerLimitEvent?.ts) continue;

      let changed = false;
      if (lead.status === "skipped") {
        lead.status = "rate_limited";
        changed = true;
      }

      if (lead.events?.length) {
        const nextEvents = lead.events.map((event) => {
          if (event.type === "skipped" && isProviderLimitMessage(event.message)) {
            changed = true;
            return { ...event, type: "rate_limited" };
          }
          return event;
        });
        lead.events = nextEvents;
      }

      if (changed) {
        writeJson(path, lead);
      }

      providerLimitLeads.push({
        path,
        campaignId: lead.campaignId || campaignDir,
        eventTs: providerLimitEvent.ts,
        changed,
      });
    }
  }

  return providerLimitLeads;
}

function backfillRuns(providerLimitLeads: ProviderLimitLead[]) {
  const runs = readJsonLines<RunRecord>(RUN_LOG);
  const sortedRuns = sortByTs(runs);
  const providerLimitByCampaign = new Map<string, ProviderLimitLead[]>();

  for (const lead of providerLimitLeads) {
    const campaignLeads = providerLimitByCampaign.get(lead.campaignId) || [];
    campaignLeads.push(lead);
    providerLimitByCampaign.set(lead.campaignId, campaignLeads);
  }

  let changedRuns = 0;

  for (const [campaignId, leads] of providerLimitByCampaign.entries()) {
    const campaignRuns = sortedRuns
      .filter((run) => run.campaignId === campaignId && typeof run.ts === "string")
      .sort((a, b) => (a.ts || "").localeCompare(b.ts || ""));

    for (let index = 0; index < campaignRuns.length; index++) {
      const run = campaignRuns[index];
      const runTs = run.ts;
      if (!runTs) continue;
      if (run.status !== "completed") continue;

      const previousRunTs = index > 0 ? campaignRuns[index - 1].ts : undefined;
      const matchingLeads = leads.filter((lead) =>
        lead.eventTs <= runTs && (!previousRunTs || lead.eventTs > previousRunTs)
      );

      if (matchingLeads.length === 0) continue;

      const previousErrors = typeof run.errors === "number" ? run.errors : 0;
      const previousSkipped = typeof run.skipped === "number" ? run.skipped : 0;

      run.status = "rate_limited";
      run.errors = previousErrors + matchingLeads.length;
      run.skipped = Math.max(0, previousSkipped - matchingLeads.length);
      changedRuns++;
    }
  }

  if (changedRuns > 0) {
    writeJsonLines(RUN_LOG, sortedRuns);
  }

  return { changedRuns };
}

function main() {
  const providerLimitLeads = backfillLeads();
  const changedLeads = providerLimitLeads.filter((lead) => lead.changed).length;
  const { changedRuns } = backfillRuns(providerLimitLeads);

  console.log(`Provider-limit leads scanned: ${providerLimitLeads.length}`);
  console.log(`Leads updated: ${changedLeads}`);
  console.log(`Runs updated: ${changedRuns}`);
}

main();
