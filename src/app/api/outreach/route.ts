import { NextRequest, NextResponse } from "next/server";
import { runOutreach } from "@/lib/outreach-engine";
import * as store from "@/lib/store";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const body = await req.json().catch(() => ({}));
  const { campaignId, dryRun = false, maxInvites } = body;

  if (campaignId) {
    const campaign = await store.getCampaign(campaignId, workspaceId);
    if (!campaign) {
      return NextResponse.json({
        status: "error",
        sent: 0,
        skipped: 0,
        errors: 1,
        events: [{ type: "error", reason: "Campaign not found in workspace" }],
      }, { status: 404 });
    }

    const result = await runOutreach({
      workspaceId,
      campaignId: campaign.id,
      dryRun,
      maxInvites,
      ignoreWeekendPause: !dryRun,
      ignoreScheduleWindow: !dryRun,
      inlineSendNewProspects: !dryRun,
    });
    return NextResponse.json(result);
  }

  const campaigns = await store.listCampaigns({ workspaceId });
  const target = campaigns.find((c) => c.status === "active") || campaigns[0];
  if (!target) {
    return NextResponse.json({ status: "error", sent: 0, skipped: 0, errors: 1, events: [{ type: "error", reason: "No active campaign found" }] });
  }

  const result = await runOutreach({
    workspaceId,
    campaignId: target.id,
    dryRun,
    maxInvites,
    ignoreWeekendPause: !dryRun,
    ignoreScheduleWindow: !dryRun,
    inlineSendNewProspects: !dryRun,
  });
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const runs = await store.listOutreachRuns(20, workspaceId);
  return NextResponse.json({ runs });
}
