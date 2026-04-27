import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import type { SignalCandidateStatus } from "@/lib/types";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";
import { buildNormalizedSignal } from "@/lib/signal-taxonomy";

const MUTABLE_STATUSES: SignalCandidateStatus[] = ["new", "shortlisted", "dismissed"];

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const { id } = await context.params;
  const signal = await store.getSignalCandidate(id, workspaceId);

  if (!signal) {
    return NextResponse.json({ error: "Signal not found" }, { status: 404 });
  }

  return NextResponse.json({
    signal: {
      ...signal,
      normalizedSignal: buildNormalizedSignal({
        signalSource: signal.signalSource,
        signalContext: signal.signalContext,
        signalKind: signal.signalKind,
        topicKey: signal.topicKey,
        topicLabel: signal.topicLabel,
        signalPayload: signal.signalPayload,
        publicIdentifier: signal.publicIdentifier,
        sourcePostId: signal.sourcePostId,
      }),
    },
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const { id } = await context.params;
  const signal = await store.getSignalCandidate(id, workspaceId);

  if (!signal) {
    return NextResponse.json({ error: "Signal not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const nextStatus = body.status as SignalCandidateStatus | undefined;
  const nextCampaignId = typeof body.campaignId === "string" ? body.campaignId : signal.campaignId;

  if (nextStatus && !MUTABLE_STATUSES.includes(nextStatus)) {
    return NextResponse.json({ error: "Unsupported signal status update" }, { status: 400 });
  }

  if (nextCampaignId) {
    const campaign = await store.getCampaign(nextCampaignId, workspaceId);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
  }

  const savedSignal = await store.saveSignalCandidate({
    ...signal,
    campaignId: nextCampaignId,
    status: nextStatus || signal.status,
  });

  return NextResponse.json({
    ok: true,
    signal: {
      ...savedSignal,
      normalizedSignal: buildNormalizedSignal({
        signalSource: savedSignal.signalSource,
        signalContext: savedSignal.signalContext,
        signalKind: savedSignal.signalKind,
        topicKey: savedSignal.topicKey,
        topicLabel: savedSignal.topicLabel,
        signalPayload: savedSignal.signalPayload,
        publicIdentifier: savedSignal.publicIdentifier,
        sourcePostId: savedSignal.sourcePostId,
      }),
    },
  });
}
