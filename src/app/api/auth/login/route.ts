import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { signSessionToken, JWT_MAX_AGE } from "@/lib/auth/jwt";
import { BM_GTM_ACTIVE_WORKSPACE_COOKIE, BM_GTM_SESSION_COOKIE, sessionCookieBase } from "@/lib/auth/cookie-names";
import {
  countAppUsers,
  createAppUser,
  ensureDefaultMembershipsForAllWorkspaces,
  getAppUserWithPasswordForLogin,
  listWorkspaceMembershipsForUser,
  normalizeAppEmail,
} from "@/lib/app-auth-persistence";

const BOOTSTRAP_HEADER = "x-bm-bootstrap-secret";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { email?: string; password?: string; secret?: string };
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "email and password required" }, { status: 400 });
  }

  const nEmail = normalizeAppEmail(email);
  const usersCount = await countAppUsers();
  if (usersCount === 0) {
    const expected = process.env.BM_GTM_BOOTSTRAP_SECRET?.trim();
    const provided = body.secret?.trim() || req.headers.get(BOOTSTRAP_HEADER)?.trim();
    if (!expected || !provided || provided !== expected) {
      return NextResponse.json(
        { ok: false, error: "Bootstrap requires BM_GTM_BOOTSTRAP_SECRET" },
        { status: 403 },
      );
    }
    const hash = await bcrypt.hash(password, 10);
    const user = await createAppUser(nEmail, hash);
    await ensureDefaultMembershipsForAllWorkspaces(user.id, "owner");
  }

  const row = await getAppUserWithPasswordForLogin(nEmail);
  if (!row) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }
  const passwordOk = await bcrypt.compare(password, row.passwordHash);
  if (!passwordOk) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  const token = await signSessionToken(row.id, row.email);
  const members = await listWorkspaceMembershipsForUser(row.id);
  const firstWs = members[0]?.workspaceId;

  const res = NextResponse.json({ ok: true, user: { id: row.id, email: row.email } });
  res.cookies.set(BM_GTM_SESSION_COOKIE, token, {
    ...sessionCookieBase,
    maxAge: JWT_MAX_AGE,
  });
  if (firstWs) {
    res.cookies.set(BM_GTM_ACTIVE_WORKSPACE_COOKIE, firstWs, {
      ...sessionCookieBase,
      maxAge: JWT_MAX_AGE,
    });
  }
  return res;
}
