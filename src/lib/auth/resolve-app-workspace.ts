import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifySessionToken } from "./jwt";
import { BM_GTM_ACTIVE_WORKSPACE_COOKIE, BM_GTM_SESSION_COOKIE } from "./cookie-names";
import {
  getWorkspaceMembership,
} from "../app-auth-persistence";
import type { WorkspaceRole } from "../types";
/** Dev-only fallback if active workspace cookie is missing (avoids import cycle) */
const DEV_FALLBACK_WORKSPACE = "ws_default";

function getCookieValue(req: NextRequest, name: string): string | null {
  return req.cookies.get(name)?.value?.trim() || null;
}

export interface ResolvedAppWorkspace {
  userId: string;
  email: string;
  workspaceId: string;
  role: WorkspaceRole;
}

export function canWriteRole(role: WorkspaceRole): boolean {
  return role !== "viewer";
}

export function canManageWorkspaceSettings(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}

/**
 * For authenticated app API routes: resolve active workspace from session + membership.
 * Rejects unauthenticated, unknown workspace, or member accessing workspace they are not in.
 * Does not trust X-Workspace-Id for security decisions (ignore it).
 */
export async function requireAppWorkspace(
  req: NextRequest,
  opts: { requireWrite?: boolean } = {},
): Promise<{ ok: true; value: ResolvedAppWorkspace } | { ok: false; response: NextResponse }> {
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

  let payload: { sub: string; email: string };
  try {
    const verified = await verifySessionToken(token);
    payload = { sub: verified.sub, email: verified.email };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Invalid session" },
        { status: 401 },
      ),
    };
  }

  const rawWorkspace = getCookieValue(req, BM_GTM_ACTIVE_WORKSPACE_COOKIE);
  const candidate = rawWorkspace || (process.env.NODE_ENV === "development" ? DEV_FALLBACK_WORKSPACE : null);
  if (!candidate) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "No active workspace; select a workspace" },
        { status: 400 },
      ),
    };
  }

  const membership = await getWorkspaceMembership(payload.sub, candidate);
  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Forbidden: not a member of this workspace" },
        { status: 403 },
      ),
    };
  }

  if (opts.requireWrite && !canWriteRole(membership.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Forbidden: read-only access" },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    value: {
      userId: payload.sub,
      email: payload.email,
      workspaceId: candidate,
      role: membership.role,
    },
  };
}

/**
 * For GET-only routes that viewers may call.
 */
export function requireAppWorkspaceRead(req: NextRequest) {
  return requireAppWorkspace(req, { requireWrite: false });
}

/**
 * For mutating routes (POST/PATCH/DELETE) — blocks viewers.
 */
export function requireAppWorkspaceWrite(req: NextRequest) {
  return requireAppWorkspace(req, { requireWrite: true });
}
