import { NextRequest, NextResponse } from "next/server";
import { runDiscovery } from "@/lib/discovery-engine";
import * as store from "@/lib/store";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

export const maxDuration = 300; // 5 min max

/**
 * POST /api/discovery — Launch discovery run
 * Body: { agentId, campaignId?, sources?, maxPerSource?, dryRun? }
 */
export async function POST(req: NextRequest) {
  try {
    const $wsa = await requireAppWorkspaceRead(req);

    if (!$wsa.ok) return $wsa.response;

    const workspaceId = $wsa.value.workspaceId;
    const body = await req.json().catch(() => ({}));
    const {
      agentId: requestedAgentId,
      campaignId,
      sources,
      maxPerSource,
      dryRun = false,
    } = body;

    const workspaceAgents = await store.listAgents(workspaceId);
    const agentId =
      requestedAgentId ||
      workspaceAgents.find((a) => a.status === "active")?.id ||
      workspaceAgents[0]?.id;
    if (!agentId) {
      return NextResponse.json({ error: "No agent found in workspace" }, { status: 400 });
    }

    const agent = await store.getAgent(agentId, workspaceId);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found in workspace" }, { status: 404 });
    }

    if (campaignId && !await store.getCampaign(campaignId, workspaceId)) {
      return NextResponse.json({ error: "Campaign not found in workspace" }, { status: 404 });
    }

    const result = await runDiscovery({
      agentId: agent.id,
      campaignId,
      sources,
      maxPerSource,
      dryRun,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Discovery failed", detail: String(err) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/discovery — List past discovery runs
 */
export async function GET(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const runs = await store.listDiscoveryRuns(20, workspaceId);
  return NextResponse.json({ runs });
}
