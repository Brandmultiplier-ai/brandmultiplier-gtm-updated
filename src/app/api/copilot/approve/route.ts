import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

export async function POST(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const body = await req.json().catch(() => ({}));
  const leadId = typeof body.leadId === "string" ? body.leadId : "";
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";

  if (!leadId || !campaignId) {
    return NextResponse.json({ error: "leadId and campaignId are required" }, { status: 400 });
  }

  const lead = await store.getLead(campaignId, leadId, workspaceId);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  lead.approved = true;
  if (lead.status === "discovered") {
    lead.status = "new";
  }

  const savedLead = await store.saveLead(lead);
  return NextResponse.json({ ok: true, lead: savedLead });
}
