import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifySessionToken } from "./jwt";
import { BM_GTM_ACTIVE_WORKSPACE_COOKIE, BM_GTM_SESSION_COOKIE, sessionCookieBase } from "./cookie-names";
import { isSupabaseStorageEnabled } from "@/lib/storage-mode";
import { isSupabaseStyleAppUserId } from "./app-user-id";
import type { AppGlobalRole } from "@/lib/types";
import { getAppUserById } from "@/lib/app-auth-persistence";
import { normalizeAppGlobalRoleFromStorage } from "@/lib/auth/role-values";

function getCookieValue(req: NextRequest, name: string): string | null {
  return req.cookies.get(name)?.value?.trim() || null;
}

export interface ResolvedSession {
  userId: string;
  email: string;
  globalRole: AppGlobalRole;
}

export async function requireSession(
  req: NextRequest,
): Promise<
  { ok: true; value: ResolvedSession } | { ok: false; response: NextResponse }
> {
  const token = getCookieValue(req, BM_GTM_SESSION_COOKIE);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 },
      ),
    };
  }
  try {
    const v = await verifySessionToken(token);
    if (isSupabaseStorageEnabled() && !isSupabaseStyleAppUserId(v.sub)) {
      const res = NextResponse.json(
        {
          ok: false,
          error: "Session was created with local storage; sign in again now that the app uses Supabase.",
          code: "SESSION_USER_ID_STORAGE_MISMATCH",
        },
        { status: 401 },
      );
      res.cookies.set(BM_GTM_SESSION_COOKIE, "", { ...sessionCookieBase, maxAge: 0 });
      res.cookies.set(BM_GTM_ACTIVE_WORKSPACE_COOKIE, "", { ...sessionCookieBase, maxAge: 0 });
      return { ok: false, response: res };
    }
    const user = await getAppUserById(v.sub);
    if (!user) {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 }),
      };
    }
    const globalRole = normalizeAppGlobalRoleFromStorage(user.globalRole);
    return { ok: true, value: { userId: v.sub, email: user.email || v.email, globalRole } };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Invalid session" },
        { status: 401 },
      ),
    };
  }
}
