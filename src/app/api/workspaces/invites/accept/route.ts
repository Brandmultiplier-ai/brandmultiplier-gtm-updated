import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { BM_GTM_ACTIVE_WORKSPACE_COOKIE, BM_GTM_SESSION_COOKIE, sessionCookieBase } from "@/lib/auth/cookie-names";
import { JWT_MAX_AGE, signSessionToken } from "@/lib/auth/jwt";
import {
  createAppUser,
  getAppUserWithPasswordForLogin,
  getWorkspaceInviteByTokenHash,
  markWorkspaceInviteAccepted,
  normalizeAppEmail,
  setWorkspaceMembership,
  updateAppUserProfile,
} from "@/lib/app-auth-persistence";
import { hashInviteToken, isInviteUsable } from "@/lib/workspace-invites";

const MIN_PASSWORD_LEN = 8;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    token?: string;
    email?: string;
    password?: string;
    passwordConfirm?: string;
    displayName?: string;
  };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const email = normalizeAppEmail(typeof body.email === "string" ? body.email : "");
  const password = typeof body.password === "string" ? body.password : "";
  const passwordConfirm = typeof body.passwordConfirm === "string" ? body.passwordConfirm : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";

  if (!token || !email || !password) {
    return NextResponse.json({ ok: false, error: "token, email and password required" }, { status: 400 });
  }

  const invite = await getWorkspaceInviteByTokenHash(hashInviteToken(token));
  if (!invite || !isInviteUsable(invite)) {
    return NextResponse.json({ ok: false, error: "Invite is invalid or expired" }, { status: 400 });
  }

  let user = await getAppUserWithPasswordForLogin(email);
  if (user) {
    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "That password does not match your existing BrandMultiplier account. Use the password you already set for this email, or ask your admin to invite a different email if you need a new account.",
        },
        { status: 401 },
      );
    }
  } else {
    if (password.length < MIN_PASSWORD_LEN) {
      return NextResponse.json(
        { ok: false, error: `Choose a password of at least ${MIN_PASSWORD_LEN} characters.` },
        { status: 400 },
      );
    }
    if (password !== passwordConfirm) {
      return NextResponse.json({ ok: false, error: "Passwords do not match." }, { status: 400 });
    }
    try {
      const passwordHash = await bcrypt.hash(password, 10);
      user = {
        ...(await createAppUser(email, passwordHash)),
        passwordHash,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not create account";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
  }

  if (displayName && !user.displayName) {
    user = {
      ...(await updateAppUserProfile(user.id, { displayName, profileSettings: user.profileSettings })),
      passwordHash: user.passwordHash,
    };
  }

  await setWorkspaceMembership(user.id, invite.workspaceId, invite.role);
  await markWorkspaceInviteAccepted(invite.id, user.id);

  const sessionToken = await signSessionToken(
    user.id,
    user.email,
    user.globalRole === "super admin" ? "super admin" : "member",
  );
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, displayName: user.displayName },
    activeWorkspaceId: invite.workspaceId,
  });
  res.cookies.set(BM_GTM_SESSION_COOKIE, sessionToken, {
    ...sessionCookieBase,
    maxAge: JWT_MAX_AGE,
  });
  res.cookies.set(BM_GTM_ACTIVE_WORKSPACE_COOKIE, invite.workspaceId, {
    ...sessionCookieBase,
    maxAge: JWT_MAX_AGE,
  });
  return res;
}
