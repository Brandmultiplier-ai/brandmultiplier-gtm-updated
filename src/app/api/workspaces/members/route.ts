import { NextRequest, NextResponse } from "next/server";
import { listWorkspaceMemberRecords } from "@/lib/app-auth-persistence";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

export async function GET(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);
  if (!$wsa.ok) return $wsa.response;

  const members = await listWorkspaceMemberRecords($wsa.value.workspaceId);
  return NextResponse.json({ ok: true, members });
}
