import { NextRequest, NextResponse } from "next/server";
import { syncInbox, replyToLead } from "@/lib/inbox-sync";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

/**
 * GET /api/inbox — Check for new replies from leads
 * POST /api/inbox — Send a reply to a lead
 *   Body: { leadId, campaignId, chatId, message }
 */

export async function GET(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const result = await syncInbox(workspaceId);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const body = await req.json().catch(() => ({}));
  const { leadId, campaignId, chatId, message } = body;

  if (!leadId || !campaignId || !message) {
    return NextResponse.json(
      { error: "Missing required fields: leadId, campaignId, message" },
      { status: 400 }
    );
  }

  const result = await replyToLead(leadId, campaignId, chatId, message, workspaceId);
  return NextResponse.json(result);
}
