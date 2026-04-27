import type { NextRequest } from "next/server";

export const DEFAULT_WORKSPACE_ID = "ws_default";

/**
 * Legacy resolver: header → query → optional default.
 * Do not use for authenticated app API routes; use `requireAppWorkspace` from
 * `@/lib/auth/resolve-app-workspace` so tenant is bound to session + membership.
 */
export function getUnauthenticatedWorkspaceId(
  req: NextRequest,
  options: { allowDefault: boolean } = { allowDefault: true },
): string {
  const headerId = req.headers.get("x-workspace-id")?.trim();
  if (headerId) return headerId;

  const queryId = req.nextUrl.searchParams.get("workspaceId")?.trim();
  if (queryId) return queryId;

  if (!options.allowDefault && process.env.NODE_ENV === "production") {
    return "";
  }
  return DEFAULT_WORKSPACE_ID;
}

export type CronWorkspaceResolution =
  | { mode: "single"; workspaceId: string }
  | { mode: "all" };

/**
 * For `/api/cron/run` and internal jobs. In production, if no single workspace
 * is specified, callers should run automation for every active workspace.
 */
export function getCronJobWorkspaceId(
  req: NextRequest,
  bodyWorkspaceId?: string | null,
): CronWorkspaceResolution {
  const fromBody = bodyWorkspaceId?.trim();
  if (fromBody) return { mode: "single", workspaceId: fromBody };

  const fromHeader = req.headers.get("x-bm-cron-workspace")?.trim();
  if (fromHeader) return { mode: "single", workspaceId: fromHeader };

  const fromQuery = req.nextUrl.searchParams.get("workspaceId")?.trim();
  if (fromQuery) return { mode: "single", workspaceId: fromQuery };

  if (process.env.NODE_ENV === "production") {
    return { mode: "all" };
  }
  return { mode: "single", workspaceId: DEFAULT_WORKSPACE_ID };
}

/**
 * @deprecated — use getUnauthenticatedWorkspaceId or getCronJobWorkspaceId
 */
export function getWorkspaceId(req: NextRequest): string {
  return getUnauthenticatedWorkspaceId(req, { allowDefault: true });
}
