import { NextRequest, NextResponse } from "next/server";
import { listInvitationsSent, listAllRelations } from "@/lib/unipile";
import * as store from "@/lib/store";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

/**
 * POST /api/sync/status — Sync lead statuses from Unipile
 *
 * Checks invitations-sent and relations against leads with status "invite_sent"
 * and updates to "accepted" if the person is now a connection.
 */
export async function POST(req: NextRequest) {
  try {
    const $wsa = await requireAppWorkspaceRead(req);

    if (!$wsa.ok) return $wsa.response;

    const workspaceId = $wsa.value.workspaceId;

    // Get all leads that we sent invites to
    const allLeads = await store.getAllLeads({ workspaceId });
    const pendingLeads = allLeads.filter((l) => l.status === "invite_sent");

    if (pendingLeads.length === 0) {
      return NextResponse.json({ updated: 0, checked: 0, message: "No pending invites to check" });
    }

    // Fetch current relations (connections) from Unipile
    const relations = await listAllRelations(10) as Record<string, unknown>[];
    const connectedProviderIds = new Set<string>();
    for (const rel of relations) {
      const pid = (rel.provider_id || rel.member_id || rel.id || "") as string;
      if (pid) connectedProviderIds.add(pid);
    }

    // Also fetch pending invitations to distinguish pending vs declined
    const invitationsRes = await listInvitationsSent();
    const pendingInvitationIds = new Set<string>();
    const invitations = invitationsRes?.items || invitationsRes?.data || invitationsRes || [];
    if (Array.isArray(invitations)) {
      for (const inv of invitations as Record<string, unknown>[]) {
        const pid = (inv.provider_id || inv.member_id || inv.id || "") as string;
        if (pid) pendingInvitationIds.add(pid);
      }
    }

    let updated = 0;
    const results: Array<{ name: string; providerId: string; newStatus: string }> = [];

    for (const lead of pendingLeads) {
      if (connectedProviderIds.has(lead.providerId)) {
        // They accepted
        lead.status = "accepted";
        lead.events.push({
          ts: new Date().toISOString(),
          type: "accepted",
          message: "Synced from Unipile relations",
        });
        await store.saveLead(lead);
        updated++;
        results.push({ name: lead.name, providerId: lead.providerId, newStatus: "accepted" });
      }
      // If not in relations and not in pending invitations, invitation was likely declined
      // But we don't change status for now - could be delayed
    }

    return NextResponse.json({
      checked: pendingLeads.length,
      updated,
      results,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Sync failed", detail: String(err) },
      { status: 500 },
    );
  }
}

/**
 * GET /api/sync/status — Preview pending leads without updating
 */
export async function GET(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const allLeads = await store.getAllLeads({ workspaceId });
  const pendingLeads = allLeads.filter((l) => l.status === "invite_sent");

  return NextResponse.json({
    pendingCount: pendingLeads.length,
    pending: pendingLeads.map((l) => ({
      id: l.id,
      name: l.name,
      providerId: l.providerId,
      campaignId: l.campaignId,
      invitedAt: l.events.find((e) => e.type === "invite_sent")?.ts,
    })),
  });
}
