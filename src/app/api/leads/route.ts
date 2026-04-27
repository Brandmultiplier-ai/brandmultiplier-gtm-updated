import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import type { LeadStatus } from "@/lib/types";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

export async function GET(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const campaignId = req.nextUrl.searchParams.get("campaignId");
  const statusFilter = req.nextUrl.searchParams.get("status") as LeadStatus | null;

  if (campaignId) {
    const leads = await store.listLeads(campaignId, {
      workspaceId,
      ...(statusFilter ? { status: statusFilter } : {}),
    });
    return NextResponse.json({ leads });
  }

  // All leads across campaigns
  const leads = await store.getAllLeads({
    workspaceId,
    ...(statusFilter ? { status: statusFilter } : {}),
  });
  return NextResponse.json({ leads });
}
