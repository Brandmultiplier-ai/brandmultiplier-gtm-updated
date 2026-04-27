import * as store from "../store";
import type { Campaign } from "../types";
import { CONNECT_MATURATION_DAYS, EXPERIMENT_WARMUP_MATURE_SENT, EXPERIMENT_WARMUP_TOTAL_SENT } from "./constants";

export interface ExperimentProposalEligibility {
  eligible: boolean;
  totalSent: number;
  matureSent: number;
  minTotalSent: number;
  minMatureSent: number;
  reason?: string;
}

function hasInviteSent(campaignLeadId: { events: Array<{ type: string; ts: string }> }): boolean {
  return campaignLeadId.events.some((event) => event.type === "invite_sent");
}

function isMatureForConnect(campaignLeadId: { events: Array<{ type: string; ts: string }> }): boolean {
  const inviteSent = campaignLeadId.events.find((event) => event.type === "invite_sent");
  if (!inviteSent) return false;
  return (Date.now() - new Date(inviteSent.ts).getTime()) / 86400000 >= CONNECT_MATURATION_DAYS;
}

export async function getExperimentProposalEligibility(campaign: Campaign): Promise<ExperimentProposalEligibility> {
  const leads = (await store.listLeads(campaign.id, { workspaceId: campaign.workspaceId }))
    .filter((lead) => lead.language === campaign.search.language);

  const sentLeads = leads.filter(hasInviteSent);
  const matureLeads = sentLeads.filter(isMatureForConnect);
  const eligible = sentLeads.length >= EXPERIMENT_WARMUP_TOTAL_SENT && matureLeads.length >= EXPERIMENT_WARMUP_MATURE_SENT;

  return {
    eligible,
    totalSent: sentLeads.length,
    matureSent: matureLeads.length,
    minTotalSent: EXPERIMENT_WARMUP_TOTAL_SENT,
    minMatureSent: EXPERIMENT_WARMUP_MATURE_SENT,
    reason: eligible
      ? undefined
      : `Warm-up in progress for ${campaign.name}: need ${EXPERIMENT_WARMUP_TOTAL_SENT} sent and ${EXPERIMENT_WARMUP_MATURE_SENT} mature sent in ${campaign.search.language}; currently ${sentLeads.length} sent, ${matureLeads.length} mature.`,
  };
}

export async function assertCanProposeExperiment(campaign: Campaign): Promise<ExperimentProposalEligibility> {
  const eligibility = await getExperimentProposalEligibility(campaign);
  if (!eligibility.eligible) {
    throw new Error(eligibility.reason || "Insufficient data to propose a new experiment");
  }
  return eligibility;
}
