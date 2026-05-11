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
    const [campaigns, leads] = await Promise.all([
      store.listCampaigns({ workspaceId }),
      store.listLeads(campaignId, {
        workspaceId,
        ...(statusFilter ? { status: statusFilter } : {}),
      }),
    ]);
    const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
    return NextResponse.json({
      leads: leads.map((lead) => ({
        ...lead,
        campaignName: campaignById.get(lead.campaignId)?.name || "Unknown campaign",
        campaignStatus: campaignById.get(lead.campaignId)?.status || null,
      })),
    });
  }

  // All leads across campaigns
  const [campaigns, leads] = await Promise.all([
    store.listCampaigns({ workspaceId }),
    store.getAllLeads({
      workspaceId,
      ...(statusFilter ? { status: statusFilter } : {}),
    }),
  ]);
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  return NextResponse.json({
    leads: leads.map((lead) => ({
      ...lead,
      campaignName: campaignById.get(lead.campaignId)?.name || "Unknown campaign",
      campaignStatus: campaignById.get(lead.campaignId)?.status || null,
    })),
  });
}
