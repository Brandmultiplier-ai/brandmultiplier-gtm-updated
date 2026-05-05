import { NextRequest, NextResponse } from "next/server";
import {
  createWorkspaceInvite,
  listWorkspaceInvites,
} from "@/lib/app-auth-persistence";
import { canManageWorkspaceSettings, requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";
import { createInviteToken, hashInviteToken } from "@/lib/workspace-invites";
import type { WorkspaceRole } from "@/lib/types";

const VALID_ROLES = new Set<WorkspaceRole>(["admin", "operator", "viewer"]);

function inviteUrl(req: NextRequest, token: string) {
  const base = process.env.BM_GTM_APP_URL || req.nextUrl.origin;
  return new URL(`/invite/${token}`, base).toString();
}

export async function GET(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);
  if (!$wsa.ok) return $wsa.response;
  if (!canManageWorkspaceSettings($wsa.value.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const invites = await listWorkspaceInvites($wsa.value.workspaceId);
  return NextResponse.json({
    ok: true,
    invites: invites.map(({ tokenHash: _tokenHash, ...invite }) => invite),
  });
}

export async function POST(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);
  if (!$wsa.ok) return $wsa.response;
  if (!canManageWorkspaceSettings($wsa.value.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { role?: WorkspaceRole; expiresInDays?: number };
  const role = VALID_ROLES.has(body.role as WorkspaceRole) ? body.role as WorkspaceRole : "operator";
  const expiresInDays = Math.max(1, Math.min(30, Number(body.expiresInDays || 7)));
  const token = createInviteToken();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const invite = await createWorkspaceInvite({
    id: `inv_${Date.now().toString(36)}_${token.slice(0, 8)}`,
    workspaceId: $wsa.value.workspaceId,
    tokenHash: hashInviteToken(token),
    role,
    createdByUserId: $wsa.value.userId,
    expiresAt,
  });

  const { tokenHash: _tokenHash, ...safeInvite } = invite;
  return NextResponse.json({
    ok: true,
    invite: safeInvite,
    url: inviteUrl(req, token),
  });
}
