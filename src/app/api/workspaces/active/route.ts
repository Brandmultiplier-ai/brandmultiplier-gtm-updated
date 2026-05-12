import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/resolve-session";
import { effectiveWorkspaceMembership } from "@/lib/auth/resolve-app-workspace";
import { BM_GTM_ACTIVE_WORKSPACE_COOKIE, sessionCookieBase } from "@/lib/auth/cookie-names";
import { JWT_MAX_AGE } from "@/lib/auth/jwt";

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (!session.ok) return session.response;
  const body = await req.json().catch(() => ({})) as { workspaceId?: string };
  const wid = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
  if (!wid) {
    return NextResponse.json({ ok: false, error: "workspaceId required" }, { status: 400 });
  }
  const hit = await effectiveWorkspaceMembership(session.value.userId, session.value.globalRole, wid);
  if (!hit) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true, activeWorkspaceId: wid });
  res.cookies.set(BM_GTM_ACTIVE_WORKSPACE_COOKIE, wid, {
    ...sessionCookieBase,
    maxAge: JWT_MAX_AGE,
  });
  return res;
}
