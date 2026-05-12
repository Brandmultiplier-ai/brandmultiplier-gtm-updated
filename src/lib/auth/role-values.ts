import type { AppGlobalRole, WorkspaceRole } from "@/lib/types";

/** Normalize DB / legacy JSON values to canonical `AppGlobalRole`. */
export function normalizeAppGlobalRoleFromStorage(raw: string | null | undefined): AppGlobalRole {
  if (raw === "super admin" || raw === "super_admin") return "super admin";
  return "member";
}

/** Normalize DB / legacy JSON values to canonical `WorkspaceRole`. */
export function normalizeWorkspaceRoleFromStorage(raw: string | null | undefined): WorkspaceRole {
  if (raw === "workspace admin" || raw === "owner" || raw === "admin") return "workspace admin";
  return "user";
}

export function isSuperAdminGlobalRole(gr: AppGlobalRole | undefined): boolean {
  return gr === "super admin";
}
