import * as store from "../src/lib/store";
import { reconcileSequenceProgressFromEvents } from "../src/lib/sequence-progress";

async function main() {
  const workspaceId = process.env.WORKSPACE_ID || "ws_default";
  const campaigns = await store.listCampaigns({ workspaceId });

  let updated = 0;
  let inferredAccepted = 0;
  let manualOverrides = 0;

  for (const campaign of campaigns) {
    const leads = await store.listLeads(campaign.id, { workspaceId });

    for (const lead of leads) {
      if (!(lead.events || []).some((event) => event.type === "message_sent" && typeof event.step !== "number")) {
        continue;
      }

      const result = reconcileSequenceProgressFromEvents(lead, campaign);
      if (!result.changed) continue;

      await store.saveLead(result.lead);
      updated++;
      if (result.inferredAccepted) inferredAccepted++;
      if (result.manualOverride) manualOverrides++;

      console.log(
        `[backfill] ${campaign.name} :: ${lead.name} -> step ${result.lead.currentStep} status ${result.lead.status}${result.inferredAccepted ? " +accepted" : ""}${result.manualOverride ? " +manual_override" : ""}`
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        workspaceId,
        campaigns: campaigns.length,
        leadsUpdated: updated,
        inferredAccepted,
        manualOverrides,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
