import * as store from "../src/lib/store";
import type { Lead, Campaign } from "../src/lib/types";
import {
  isItalyLocation,
  isKnownForeignLocation,
  normalizeCampaignLocations,
  resolveLeadOutreachLanguage,
} from "../src/lib/campaign-targeting";
import { getSupabaseAdminClient } from "../src/lib/supabase/admin";

const WORKSPACE_ID = process.env.BM_GTM_WORKSPACE_ID || "ws_default";
const IT_CAMPAIGN_ID = process.env.BM_GTM_IT_CAMPAIGN_ID || "cmp_c4g_freelancer";
const EN_CAMPAIGN_ID = process.env.BM_GTM_EN_CAMPAIGN_ID || "cmp_c4g_freelancer_en";

function shouldMoveToItaly(lead: Lead): boolean {
  return isItalyLocation(lead.location) || resolveLeadOutreachLanguage(lead) === "it";
}

function shouldMoveToEnglish(lead: Lead): boolean {
  return isKnownForeignLocation(lead.location) && resolveLeadOutreachLanguage(lead) === "en";
}

async function ensureEnglishCampaignExcludesItaly(campaign: Campaign) {
  const nextLocations = normalizeCampaignLocations(campaign.search.locations);
  if (nextLocations.includes("!italy")) return false;

  const saved = await store.saveCampaign({
    ...campaign,
    search: {
      ...campaign.search,
      locations: ["!Italy"],
    },
  });

  console.log(`updated ${saved.name}: locations => ${saved.search.locations.join(", ")}`);
  return true;
}

async function moveLeadToCampaign(lead: Lead, campaignId: string, language: "it" | "en") {
  const supabase = getSupabaseAdminClient();
  const nextEvents = Array.isArray(lead.events) ? lead.events.slice() : [];
  nextEvents.push({
    ts: new Date().toISOString(),
    type: "skipped",
    message: `Reassigned to ${campaignId} after market normalization`,
  });

  const { error } = await supabase
    .from("leads")
    .update({
      campaign_id: campaignId,
      language,
      events: nextEvents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lead.id)
    .eq("workspace_id", lead.workspaceId);

  if (error) {
    throw new Error(`moveLeadToCampaign(${lead.id}): ${error.message}`);
  }
}

async function main() {
  const [itCampaign, enCampaign] = await Promise.all([
    store.getCampaign(IT_CAMPAIGN_ID, WORKSPACE_ID),
    store.getCampaign(EN_CAMPAIGN_ID, WORKSPACE_ID),
  ]);

  if (!itCampaign || !enCampaign) {
    throw new Error("Missing IT or EN campaign");
  }

  await ensureEnglishCampaignExcludesItaly(enCampaign);

  const [itLeads, enLeads] = await Promise.all([
    store.listLeads(itCampaign.id, { workspaceId: WORKSPACE_ID }),
    store.listLeads(enCampaign.id, { workspaceId: WORKSPACE_ID }),
  ]);

  let movedToItaly = 0;
  let movedToEnglish = 0;

  for (const lead of enLeads) {
    if (!shouldMoveToItaly(lead)) continue;
    await moveLeadToCampaign(lead, itCampaign.id, "it");
    movedToItaly++;
    console.log(`EN -> IT: ${lead.name} (${lead.location || "unknown"})`);
  }

  for (const lead of itLeads) {
    if (!shouldMoveToEnglish(lead)) continue;
    await moveLeadToCampaign(lead, enCampaign.id, "en");
    movedToEnglish++;
    console.log(`IT -> EN: ${lead.name} (${lead.location || "unknown"})`);
  }

  console.log(JSON.stringify({ movedToItaly, movedToEnglish }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
