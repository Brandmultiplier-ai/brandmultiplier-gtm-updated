/**
 * Dump a campaign snapshot to local JSON for quick recovery.
 *
 * Usage:
 *   npx tsx scripts/snapshot-campaign.ts <campaignId> [--workspace ws_default] [--output ./tmp/foo.json] [--with-leads]
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { mkdir, writeFile } from "fs/promises";

config({ path: resolve(__dirname, "../.env.local") });

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const campaignId = process.argv[2];
  const workspaceId = getArg("--workspace") || process.env.WORKSPACE_ID || "ws_default";
  const outputArg = getArg("--output");
  const withLeads = process.argv.includes("--with-leads");

  if (!campaignId || campaignId.startsWith("--")) {
    throw new Error("Usage: npx tsx scripts/snapshot-campaign.ts <campaignId> [--workspace ws_default] [--output ./tmp/foo.json] [--with-leads]");
  }

  const store = await import("../src/lib/store");
  const campaign = await store.getCampaign(campaignId, workspaceId);

  if (!campaign) {
    throw new Error(`Campaign not found: ${campaignId} (workspace ${workspaceId})`);
  }

  const leads = withLeads ? await store.listLeads(campaign.id, { workspaceId }) : undefined;
  const snapshot = {
    generatedAt: new Date().toISOString(),
    workspaceId,
    campaign,
    ...(withLeads ? { leads } : {}),
  };

  const outputPath =
    outputArg ||
    resolve(
      process.cwd(),
      "tmp",
      "campaign-snapshots",
      `${campaign.id}-${timestampSlug()}.json`
    );

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  console.log(outputPath);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
