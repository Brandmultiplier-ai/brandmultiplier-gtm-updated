import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import type { Campaign } from "@/lib/types";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

export async function GET(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const agentId = req.nextUrl.searchParams.get("agentId") || undefined;
  const campaigns = await store.listCampaigns({ workspaceId, agentId });

  // Attach computed stats
  const withStats = await Promise.all(campaigns.map(async (c) => ({
    ...c,
    stats: await store.getCampaignStats(c.id, workspaceId),
  })));

  return NextResponse.json({ campaigns: withStats });
}

export async function POST(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const body = await req.json();
  const existing = body.id ? await store.getCampaign(body.id, workspaceId) : null;
  if (body.id && !existing && await store.getCampaign(body.id)) {
    return NextResponse.json({ error: "Campaign not found in workspace" }, { status: 404 });
  }

  const agentId = body.agentId || existing?.agentId;
  const agent = agentId ? await store.getAgent(agentId, workspaceId) : null;
  if (!agent) {
    return NextResponse.json({ error: "Agent not found in workspace" }, { status: 400 });
  }

  const campaign: Campaign = {
    id: body.id || existing?.id || "",
    workspaceId: existing?.workspaceId || agent.workspaceId,
    agentId: agent.id,
    linkedinSeatId: typeof body.linkedinSeatId === "string"
      ? body.linkedinSeatId
      : existing?.linkedinSeatId,
    name: body.name || existing?.name || "Untitled Campaign",
    status: body.status || existing?.status || "draft",
    segment: body.segment || existing?.segment || "",
    createdAt: existing?.createdAt || "",
    updatedAt: "",
    search: body.search || existing?.search || { keywords: "", titleFilter: "", language: "it", locations: [] },
    sequence: body.sequence || existing?.sequence || [],
    execution: body.execution || existing?.execution,
  };

  const saved = await store.saveCampaign(campaign);
  return NextResponse.json({ ok: true, campaign: saved });
}

export async function PATCH(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const action = typeof body.action === "string" ? body.action : "";

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const campaign = await store.getCampaign(id, workspaceId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (action === "duplicate") {
    const duplicate = await store.saveCampaign({
      ...campaign,
      id: "",
      name: `${campaign.name} Copy`,
      status: "draft",
      createdAt: "",
      updatedAt: "",
      execution: undefined,
    });

    return NextResponse.json({ ok: true, campaign: duplicate });
  }

  if (action === "delete") {
    await store.deleteCampaign(campaign.id);
    return NextResponse.json({ ok: true });
  }

  const nextStatus = body.status === "active" || body.status === "paused" || body.status === "draft" || body.status === "completed"
    ? body.status
    : campaign.status === "active"
      ? "paused"
      : "active";

  const saved = await store.saveCampaign({
    ...campaign,
    status: nextStatus,
  });

  return NextResponse.json({ ok: true, campaign: saved });
}
