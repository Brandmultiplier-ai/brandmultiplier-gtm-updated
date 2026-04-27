import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/resolve-session";
import { listWorkspaceMembershipsForUser } from "@/lib/app-auth-persistence";
import { getAppUserById } from "@/lib/app-auth-persistence";
import { BM_GTM_ACTIVE_WORKSPACE_COOKIE } from "@/lib/auth/cookie-names";

function getActiveWorkspaceId(req: NextRequest): string | null {
  return req.cookies.get(BM_GTM_ACTIVE_WORKSPACE_COOKIE)?.value?.trim() || null;
}

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (!session.ok) return session.response;
  const user = await getAppUserById(session.value.userId);
  if (!user) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 401 });
  }
  const memberships = await listWorkspaceMembershipsForUser(user.id);
  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email },
    memberships,
    activeWorkspaceId: getActiveWorkspaceId(req),
  });
}
