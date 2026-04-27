import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import type { SignalCandidateStatus, SignalKind } from "@/lib/types";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";
import { buildNormalizedSignal } from "@/lib/signal-taxonomy";

export async function GET(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const agentId = req.nextUrl.searchParams.get("agentId") || undefined;
  const campaignId = req.nextUrl.searchParams.get("campaignId") || undefined;
  const status = req.nextUrl.searchParams.get("status") as SignalCandidateStatus | null;
  const topicKey = req.nextUrl.searchParams.get("topicKey") || undefined;
  const signalKind = req.nextUrl.searchParams.get("signalKind") as SignalKind | null;
  const family = req.nextUrl.searchParams.get("family") || undefined;
  const sourceType = req.nextUrl.searchParams.get("sourceType") || undefined;
  const limit = Number(req.nextUrl.searchParams.get("limit") || "100");

  const [signals, agents, campaigns] = await Promise.all([
    store.listSignalCandidates({
      workspaceId,
      agentId,
      campaignId,
      status: status || undefined,
      topicKey,
      signalKind: signalKind || undefined,
      limit: Number.isFinite(limit) ? limit : 100,
    }),
    store.listAgents(workspaceId),
    store.listCampaigns({ workspaceId }),
  ]);

  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
  const campaignNames = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));
  let normalizedSignals = signals.map((signal) => {
    const normalizedSignal = buildNormalizedSignal({
      signalSource: signal.signalSource,
      signalContext: signal.signalContext,
      signalKind: signal.signalKind,
      topicKey: signal.topicKey,
      topicLabel: signal.topicLabel,
      signalPayload: signal.signalPayload,
      publicIdentifier: signal.publicIdentifier,
      sourcePostId: signal.sourcePostId,
    });

    return {
      ...signal,
      agentName: agentNames.get(signal.agentId) || signal.agentId,
      campaignName: signal.campaignId ? (campaignNames.get(signal.campaignId) || signal.campaignId) : null,
      normalizedSignal,
    };
  });

  if (family) {
    normalizedSignals = normalizedSignals.filter((signal) => signal.normalizedSignal.family === family);
  }

  if (sourceType) {
    normalizedSignals = normalizedSignals.filter((signal) => signal.normalizedSignal.sourceType === sourceType);
  }

  return NextResponse.json({
    signals: normalizedSignals,
  });
}
