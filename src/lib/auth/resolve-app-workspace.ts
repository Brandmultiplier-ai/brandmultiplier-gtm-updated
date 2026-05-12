import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { BM_GTM_ACTIVE_WORKSPACE_COOKIE } from "./cookie-names";
import { requireSession } from "./resolve-session";
import { getWorkspaceMembership } from "../app-auth-persistence";
import * as store from "../store";
import type { AppGlobalRole, WorkspaceMembership, WorkspaceRole } from "../types";
import { isSuperAdminGlobalRole } from "@/lib/auth/role-values";

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
  globalRole: AppGlobalRole;
  /** True when user is super admin and not a real row in workspace_memberships for this workspace */
  isSuperSynthetic: boolean;
}

export function canWriteRole(_role: WorkspaceRole): boolean {
  return true;
}

export function canManageWorkspaceSettings(role: WorkspaceRole): boolean {
  return role === "workspace admin" || role === "user";
}

/** Invite links and pending-invite list (not for plain `user` members). */
export function canInviteToWorkspace(role: WorkspaceRole): boolean {
  return role === "workspace admin";
}

/** Remove members from the workspace. */
export function canManageWorkspaceMembers(role: WorkspaceRole): boolean {
  return role === "workspace admin";
}

export async function effectiveWorkspaceMembership(
  userId: string,
  globalRole: AppGlobalRole,
  workspaceId: string,
): Promise<{ membership: WorkspaceMembership; isSuperSynthetic: boolean } | null> {
  if (isSuperAdminGlobalRole(globalRole)) {
    const w = await store.getWorkspace(workspaceId);
    if (w) {
      return {
        membership: {
          userId,
          workspaceId,
          role: "workspace admin",
          createdAt: new Date().toISOString(),
        },
        isSuperSynthetic: true,
      };
    }
    return null;
  }
  const m = await getWorkspaceMembership(userId, workspaceId);
  return m ? { membership: m, isSuperSynthetic: false } : null;
}

/**
 * For authenticated app API routes: resolve active workspace from session + membership.
 * Super admins may enter any existing workspace (synthetic workspace-admin-equivalent for permissions).
 */
export async function requireAppWorkspace(
  req: NextRequest,
  opts: { requireWrite?: boolean } = {},
): Promise<{ ok: true; value: ResolvedAppWorkspace } | { ok: false; response: NextResponse }> {
  const session = await requireSession(req);
  if (!session.ok) return session;

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

  const hit = await effectiveWorkspaceMembership(session.value.userId, session.value.globalRole, candidate);
  if (!hit) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Forbidden: not a member of this workspace" },
        { status: 403 },
      ),
    };
  }

  if (opts.requireWrite && !canWriteRole(hit.membership.role)) {
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
      userId: session.value.userId,
      email: session.value.email,
      workspaceId: candidate,
      role: hit.membership.role,
      globalRole: session.value.globalRole,
      isSuperSynthetic: hit.isSuperSynthetic,
    },
  };
}

export function requireAppWorkspaceRead(req: NextRequest) {
  return requireAppWorkspace(req, { requireWrite: false });
}

export function requireAppWorkspaceWrite(req: NextRequest) {
  return requireAppWorkspace(req, { requireWrite: true });
}

/**
 * For routes keyed by workspace id in the URL (PATCH/DELETE /api/workspaces/[id]).
 */
export async function requireWorkspaceAccessById(
  req: NextRequest,
  workspaceId: string,
  opts: { requireManageSettings?: boolean } = {},
): Promise<{ ok: true; value: ResolvedAppWorkspace } | { ok: false; response: NextResponse }> {
  const session = await requireSession(req);
  if (!session.ok) return session;

  const hit = await effectiveWorkspaceMembership(session.value.userId, session.value.globalRole, workspaceId);
  if (!hit) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }),
    };
  }

  if (opts.requireManageSettings && !canManageWorkspaceSettings(hit.membership.role)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    value: {
      userId: session.value.userId,
      email: session.value.email,
      workspaceId,
      role: hit.membership.role,
      globalRole: session.value.globalRole,
      isSuperSynthetic: hit.isSuperSynthetic,
    },
  };
}
