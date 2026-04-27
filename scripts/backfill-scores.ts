/**
 * Backfill ICP scores for existing leads based on headline, location, network distance.
 *
 * Usage: npx tsx scripts/backfill-scores.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

async function main() {
  const store = await import("../src/lib/store");

  const agent = store.getAgent("agt_c4g_main");
  if (!agent) {
    console.log("Agent not found");
    return;
  }

  const leads = store.getAllLeads({});
  let updated = 0;

  for (const lead of leads) {
    const hl = (lead.headline || "").toLowerCase();
    const loc = (lead.location || "").toLowerCase();

    let score = 0;

    // Job title match
    if (agent.icp.jobTitles.some((t) => hl.includes(t.toLowerCase()))) score += 1;

    // Location match
    if (agent.icp.locations.some((l) => loc.includes(l.toLowerCase()))) score += 0.5;

    // Network proximity
    if (lead.networkDistance === "DISTANCE_1") score += 0.5;
    else if (lead.networkDistance === "DISTANCE_2") score += 0.25;

    const finalScore = Math.max(1, Math.min(3, Math.round(score * 1.5)));

    if (finalScore !== lead.aiScore) {
      lead.aiScore = finalScore;
      store.saveLead(lead);
      updated++;
      console.log(`  ${lead.name}: ${finalScore}/3 (title=${agent.icp.jobTitles.some((t) => hl.includes(t.toLowerCase()))}, loc=${agent.icp.locations.some((l) => loc.includes(l.toLowerCase()))}, net=${lead.networkDistance})`);
    }
  }

  console.log(`\nDone: ${updated} leads updated (of ${leads.length} total)`);
}

main().catch(console.error);
