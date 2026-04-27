import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifySessionToken } from "./jwt";
import { BM_GTM_SESSION_COOKIE } from "./cookie-names";

function getCookieValue(req: NextRequest, name: string): string | null {
  return req.cookies.get(name)?.value?.trim() || null;
}

export interface ResolvedSession {
  userId: string;
  email: string;
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
    return { ok: true, value: { userId: v.sub, email: v.email } };
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
