import * as store from "./store";
import type { Lead, SignalCandidate } from "./types";

function buildLeadSignal(signal: SignalCandidate): string {
  return JSON.stringify({
    source: signal.signalSource,
    context: signal.signalContext,
    topicKey: signal.topicKey,
    topicLabel: signal.topicLabel,
    signalKind: signal.signalKind,
    signalPayload: signal.signalPayload,
    icpFit: signal.icpFit,
    intentScore: signal.intentScore,
    reasoning: signal.scoreReasoning,
  });
}

function detectSignalLanguage(signal: SignalCandidate): Lead["language"] {
  return signal.language === "it" ? "it" : "en";
}

export async function promoteSignalCandidate(opts: {
  signalId: string;
  workspaceId?: string;
  campaignId?: string;
}): Promise<{ signal: SignalCandidate; lead: Lead; created: boolean }> {
  const signal = await store.getSignalCandidate(opts.signalId, opts.workspaceId);
  if (!signal) {
    throw new Error("Signal not found");
  }

  const targetCampaignId = opts.campaignId || signal.campaignId;
  if (!targetCampaignId) {
    throw new Error("campaignId is required to promote this signal");
  }

  const campaign = await store.getCampaign(targetCampaignId, opts.workspaceId);
  if (!campaign) {
    throw new Error("Campaign not found");
  }

  const existingRef = await store.lookupByProviderId(signal.providerId, signal.workspaceId);
  const existingLead = existingRef
    ? await store.getLead(existingRef.campaignId, existingRef.leadId, signal.workspaceId)
    : null;

  const leadToSave: Lead = existingLead || {
    id: "",
    workspaceId: signal.workspaceId,
    campaignId: targetCampaignId,
    providerId: signal.providerId,
    name: signal.name,
    headline: signal.headline,
    company: "",
    location: signal.location,
    publicIdentifier: signal.publicIdentifier,
    networkDistance: signal.networkDistance,
    segment: campaign.segment || "discovered",
    language: detectSignalLanguage(signal),
    aiScore: signal.totalScore,
    signal: buildLeadSignal(signal),
    status: "discovered",
    currentStep: 0,
    events: [
      {
        ts: new Date().toISOString(),
        type: "discovered",
        message: `${signal.signalSource}: ${signal.signalContext}`,
      },
    ],
    createdAt: "",
    updatedAt: "",
  };

  const savedLead = await store.saveLead({
    ...leadToSave,
    workspaceId: signal.workspaceId,
    campaignId: existingLead?.campaignId || targetCampaignId,
    providerId: signal.providerId,
    name: signal.name,
    headline: signal.headline,
    location: signal.location,
    publicIdentifier: signal.publicIdentifier,
    networkDistance: signal.networkDistance,
    language: detectSignalLanguage(signal),
    aiScore: signal.totalScore,
    signal: buildLeadSignal(signal),
  });

  const savedSignal = await store.saveSignalCandidate({
    ...signal,
    campaignId: savedLead.campaignId,
    leadId: savedLead.id,
    status: "promoted",
  });

  return {
    signal: savedSignal,
    lead: savedLead,
    created: !existingLead,
  };
}
