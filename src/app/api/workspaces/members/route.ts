import { NextRequest, NextResponse } from "next/server";
import {
  deleteWorkspaceMembership,
  listWorkspaceMemberRecords,
} from "@/lib/app-auth-persistence";
import { canManageWorkspaceMembers, requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";
import { isSuperAdminGlobalRole } from "@/lib/auth/role-values";

export async function GET(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);
  if (!$wsa.ok) return $wsa.response;

  const members = await listWorkspaceMemberRecords($wsa.value.workspaceId);
  return NextResponse.json({ ok: true, members });
}

export async function DELETE(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);
  if (!$wsa.ok) return $wsa.response;

  const targetUserId = req.nextUrl.searchParams.get("userId")?.trim() || "";
  if (!targetUserId) {
    return NextResponse.json({ ok: false, error: "userId query parameter required" }, { status: 400 });
  }

  const canManage =
    canManageWorkspaceMembers($wsa.value.role) || isSuperAdminGlobalRole($wsa.value.globalRole);
  if (!canManage) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const members = await listWorkspaceMemberRecords($wsa.value.workspaceId);
  const target = members.find((m) => m.userId === targetUserId);
  if (!target) {
    return NextResponse.json({ ok: false, error: "Member not found in this workspace" }, { status: 404 });
  }

  if (target.role === "workspace admin") {
    const adminCount = members.filter((m) => m.role === "workspace admin").length;
    if (adminCount <= 1) {
      return NextResponse.json(
        { ok: false, error: "Cannot remove the only workspace admin. Promote another workspace admin first." },
        { status: 400 },
      );
    }
  }

  await deleteWorkspaceMembership(targetUserId, $wsa.value.workspaceId);
  return NextResponse.json({ ok: true });
}
