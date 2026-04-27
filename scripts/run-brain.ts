/**
 * Brain v0 — CLI
 *
 * Analyzes workspace data and prints patterns + recommendations.
 * Usage: npx tsx scripts/run-brain.ts [--workspace ws_default]
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

function formatTemplateBucket(key: string): string {
  const [campaignId, language, templateIndex] = key.split(":");
  if (!campaignId || !language || templateIndex === undefined) return key;
  return `${campaignId}/${language}/#${Number(templateIndex) + 1}`;
}

async function main() {
  const wsArg = process.argv.find((a) => a.startsWith("--workspace"));
  const workspaceId = wsArg ? process.argv[process.argv.indexOf(wsArg) + 1] : undefined;

  const { analyzeWorkspace } = await import("../src/lib/brain");
  const snapshot = analyzeWorkspace(workspaceId);

  const p = snapshot.patterns;

  console.log("\n====================================");
  console.log("  BRAIN v0 — Analysis Report");
  console.log("====================================\n");
  console.log(`Workspace: ${snapshot.workspaceId}`);
  console.log(`Analyzed:  ${snapshot.leadsAnalyzed} leads, ${snapshot.campaignsAnalyzed} campaigns`);
  console.log(`Time:      ${new Date(snapshot.analyzedAt).toLocaleString("it-IT")}`);

  // Overall funnel
  console.log("\n--- FUNNEL ---");
  console.log(`  Total:    ${p.overall.total} leads`);
  console.log(`  Sent:     ${p.overall.sent} invites`);
  console.log(`  Accepted: ${p.overall.accepted} (${p.overall.connectRate}%)`);
  console.log(`  Replied:  ${p.overall.replied} (${p.overall.replyRate}%)`);

  // Timing
  if (p.avgDaysToAccept !== null) {
    console.log(`\n--- TIMING ---`);
    console.log(`  Avg days to accept: ${p.avgDaysToAccept}`);
    console.log(`  Avg days to reply:  ${p.avgDaysToReply ?? "N/A"}`);
  }

  // Print dimension tables
  const dims: [string, Record<string, { sent: number; connectRate: number; replyRate: number }>][] = [
    ["SEGMENT", p.bySegment],
    ["LANGUAGE", p.byLanguage],
    ["NETWORK DISTANCE", p.byNetworkDistance],
    ["TEMPLATE", p.byTemplateIndex],
    ["DAY OF WEEK", p.byDayOfWeek],
    ["ICP SCORE", p.byAiScoreBucket],
    ["CAMPAIGN", p.byCampaign],
  ];

  for (const [name, data] of dims) {
    const entries = Object.entries(data).filter(([, m]) => m.sent > 0);
    if (entries.length === 0) continue;

    console.log(`\n--- ${name} ---`);
    entries.sort((a, b) => b[1].connectRate - a[1].connectRate);
    for (const [key, m] of entries) {
      const rawLabel = name === "TEMPLATE" ? formatTemplateBucket(key) : key;
      const label = rawLabel.length > 25 ? rawLabel.substring(0, 22) + "..." : rawLabel;
      console.log(`  ${label.padEnd(26)} ${String(m.sent).padStart(3)} sent  ${String(m.connectRate + "%").padStart(6)} connect  ${String(m.replyRate + "%").padStart(6)} reply`);
    }
  }

  // Recommendations
  console.log("\n====================================");
  console.log("  RECOMMENDATIONS");
  console.log("====================================\n");

  if (snapshot.recommendations.length === 0) {
    console.log("  No recommendations yet. Need more data.");
  }

  for (const rec of snapshot.recommendations) {
    const icon = rec.type === "insight" ? "i" : rec.type === "warning" ? "!" : "*";
    const conf = rec.confidence === "high" ? "+++" : rec.confidence === "medium" ? "++" : "+";
    console.log(`  [${icon}] ${rec.message} (${conf}, n=${rec.dataPoints})`);
  }

  console.log(`\nSnapshot saved: ${snapshot.id}`);
  console.log("");
}

main().catch(console.error);
