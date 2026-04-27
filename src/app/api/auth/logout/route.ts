import { NextResponse } from "next/server";
import { BM_GTM_ACTIVE_WORKSPACE_COOKIE, BM_GTM_SESSION_COOKIE, sessionCookieBase } from "@/lib/auth/cookie-names";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(BM_GTM_SESSION_COOKIE, "", { ...sessionCookieBase, maxAge: 0 });
  res.cookies.set(BM_GTM_ACTIVE_WORKSPACE_COOKIE, "", { ...sessionCookieBase, maxAge: 0 });
  return res;
}
