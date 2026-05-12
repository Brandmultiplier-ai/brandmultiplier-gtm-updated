import { NextRequest, NextResponse } from "next/server";
import { getAppUserWithPasswordForLogin, getWorkspaceInviteByTokenHash, normalizeAppEmail } from "@/lib/app-auth-persistence";
import { hashInviteToken, isInviteUsable } from "@/lib/workspace-invites";

/**
 * Given a valid invite token + email, returns whether an app user already exists for that email.
 * Used by the invite page to show "create password" vs "sign in with existing password".
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { token?: string; email?: string };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const email = normalizeAppEmail(typeof body.email === "string" ? body.email : "");
  if (!token || !email) {
    return NextResponse.json({ ok: false, error: "token and email required" }, { status: 400 });
  }

  const invite = await getWorkspaceInviteByTokenHash(hashInviteToken(token));
  if (!invite || !isInviteUsable(invite)) {
    return NextResponse.json({ ok: false, error: "Invalid or expired invite" }, { status: 400 });
  }

  const user = await getAppUserWithPasswordForLogin(email);
  return NextResponse.json({ ok: true, accountExists: Boolean(user) });
}
