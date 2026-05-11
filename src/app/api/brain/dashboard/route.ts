import { NextRequest, NextResponse } from "next/server";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";
import { getLatestSnapshot } from "@/lib/brain";
import { brainExperimentsDisabledMessage, isBrainExperimentsEnabled } from "@/lib/brain/feature-flags";
import { listExperiments, getActiveExperiment } from "@/lib/brain/experiment-store";
import { listExperimentExposures } from "@/lib/brain/exposure-store";
import { getExperimentSampleCounts } from "@/lib/brain/evaluator";
import { getExperimentProposalEligibility } from "@/lib/brain/experiment-policy";
import * as store from "@/lib/store";

export async function GET(req: NextRequest) {
  const brainEnabled = isBrainExperimentsEnabled();
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;

  // Warm-up status per campaign
  const campaigns = (await store.listCampaigns({ workspaceId })).filter((c) => c.status === "active");
  const warmupByCampaign = await Promise.all(campaigns.map(async (c) => {
    const eligibility = await getExperimentProposalEligibility(c);
    return {
      campaignId: c.id,
      campaignName: c.name,
      language: c.search.language,
      eligible: eligibility.eligible,
      totalSent: eligibility.totalSent,
      matureSent: eligibility.matureSent,
      minTotalSent: eligibility.minTotalSent,
      minMatureSent: eligibility.minMatureSent,
    };
  }));

  // Active experiment
  const activeExp = brainEnabled ? await getActiveExperiment(workspaceId) : null;
  let activeSample = null;
  let activeExposures: { control: number; challenger: number } | null = null;
  if (activeExp && activeExp.status === "running") {
    const counts = await getExperimentSampleCounts(activeExp);
    activeSample = counts;
    const exposures = await listExperimentExposures(activeExp.id, workspaceId);
    activeExposures = {
      control: exposures.filter((e) => e.experimentArm === "control").length,
      challenger: exposures.filter((e) => e.experimentArm === "challenger").length,
    };
  }

  // Experiment history — resolve campaign names
  const allCampaigns = await store.listCampaigns({ workspaceId });
  const campaignNames: Record<string, string> = {};
  for (const c of allCampaigns) campaignNames[c.id] = c.name;

  const experiments = (await listExperiments(workspaceId, 50)).map((exp) => ({
    ...exp,
    campaignName: campaignNames[exp.campaignId] || exp.campaignId,
  }));

  // Latest snapshot (for pattern overview)
  const snapshot = await getLatestSnapshot(workspaceId);

  // Days since active experiment started
  let activeDaysElapsed: number | null = null;
  if (activeExp?.startedAt) {
    activeDaysElapsed = Math.round((Date.now() - new Date(activeExp.startedAt).getTime()) / 86400000 * 10) / 10;
  }

  return NextResponse.json({
    automationEnabled: brainEnabled,
    automationMessage: brainExperimentsDisabledMessage(),
    campaigns: warmupByCampaign,
    activeExperiment: activeExp
      ? {
          ...activeExp,
          campaignName: campaignNames[activeExp.campaignId] || activeExp.campaignId,
          sampleCounts: activeSample,
          exposureCounts: activeExposures,
          daysElapsed: activeDaysElapsed,
        }
      : null,
    experiments,
    snapshotAt: snapshot?.analyzedAt || null,
    leadsAnalyzed: snapshot?.leadsAnalyzed || 0,
  });
}
