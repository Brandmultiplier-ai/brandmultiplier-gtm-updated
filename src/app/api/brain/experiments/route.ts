import { NextRequest, NextResponse } from "next/server";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";
import { BRAIN_EXPERIMENTS_ENABLED, brainExperimentsDisabledMessage } from "@/lib/brain/feature-flags";
import { listExperiments, saveExperiment, getActiveExperiment } from "@/lib/brain/experiment-store";
import { getLatestSnapshot } from "@/lib/brain";
import { generateHypothesis } from "@/lib/brain/hypothesis-generator";
import { assertCanProposeExperiment } from "@/lib/brain/experiment-policy";
import * as store from "@/lib/store";

export async function GET(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const status = req.nextUrl.searchParams.get("status");
  let experiments = await listExperiments(workspaceId);
  if (status) experiments = experiments.filter((e) => e.status === status);
  return NextResponse.json({ experiments });
}

export async function POST(req: NextRequest) {
  if (!BRAIN_EXPERIMENTS_ENABLED) {
    return NextResponse.json({ error: brainExperimentsDisabledMessage() }, { status: 409 });
  }

  const $wsa = await requireAppWorkspaceRead(req);


  if (!$wsa.ok) return $wsa.response;


  const workspaceId = $wsa.value.workspaceId;

  const active = await getActiveExperiment(workspaceId);
  if (active) {
    return NextResponse.json({ error: `Experiment ${active.id} already ${active.status}` }, { status: 409 });
  }

  const snapshot = await getLatestSnapshot(workspaceId);
  if (!snapshot) {
    return NextResponse.json({ error: "No brain snapshot. Run analysis first." }, { status: 400 });
  }

  const campaigns = (await store.listCampaigns({ workspaceId })).filter((c) => c.status === "active");
  const campaign = campaigns[0];
  if (!campaign) {
    return NextResponse.json({ error: "No active campaign" }, { status: 400 });
  }

  const agent = await store.getAgent(campaign.agentId);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 400 });
  }

  try {
    await assertCanProposeExperiment(campaign);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const history = await listExperiments(workspaceId);
  const experiment = await generateHypothesis(snapshot, agent, campaign, history);
  await saveExperiment(experiment);

  return NextResponse.json({ experiment });
}
