import * as store from "../src/lib/store";
import type { Lead, SignalCandidate, SignalSource } from "../src/lib/types";
import { normalizeLeadSignalPayload } from "../src/lib/signal-normalization";

async function main() {
  const leads = await store.getAllLeads();
  const campaigns = await store.listCampaigns();
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  let backfilled = 0;

  for (const lead of leads) {
    const campaign = campaignById.get(lead.campaignId);
    if (!campaign) continue;
    const payload = normalizeLeadSignalPayload(lead);

    const signal: SignalCandidate = {
      id: "",
      workspaceId: lead.workspaceId,
      agentId: campaign.agentId,
      campaignId: lead.campaignId,
      leadId: lead.id,
      providerId: lead.providerId,
      name: lead.name,
      headline: lead.headline,
      location: lead.location,
      publicIdentifier: lead.publicIdentifier,
      networkDistance: lead.networkDistance,
      signalSource: payload.source,
      signalContext: payload.context,
      topicKey: payload.topicKey,
      topicLabel: payload.topicLabel,
      signalKind: payload.signalKind,
      signalPayload: payload.signalPayload,
      language: lead.language,
      icpFit: payload.icpFit,
      intentScore: payload.intentScore,
      totalScore: payload.totalScore,
      scoreReasoning: payload.reasoning,
      status: "promoted",
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    };

    await store.saveSignalCandidate(signal);
    backfilled++;
  }

  console.log(`Backfilled ${backfilled} signal candidates from existing leads.`);
}

void main();
