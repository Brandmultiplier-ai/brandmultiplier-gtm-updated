import type { AppUser, WorkspaceMembership, WorkspaceRole } from "./types";
import { isSupabaseStorageEnabled } from "./storage-mode";
import * as local from "./app-auth-persistence-local";
import * as supa from "./app-auth-persistence-supabase";

function backend() {
  return isSupabaseStorageEnabled() ? supa : local;
}

export { normalizeAppEmail } from "./auth/email";

export async function getAppUserById(id: string): Promise<AppUser | null> {
  return backend().getAppUserById(id);
}

export async function getAppUserByEmail(email: string): Promise<AppUser | null> {
  return backend().getAppUserByEmail(email);
}

export async function getAppUserWithPasswordForLogin(
  email: string,
): Promise<(AppUser & { passwordHash: string }) | null> {
  return backend().getAppUserWithPasswordForLogin(email);
}

export async function createAppUser(
  email: string,
  passwordHash: string,
): Promise<AppUser> {
  return backend().createAppUser(email, passwordHash);
}

export async function countAppUsers(): Promise<number> {
  return backend().countAppUsers();
}

export async function listWorkspaceMembershipsForUser(userId: string): Promise<WorkspaceMembership[]> {
  return backend().listWorkspaceMembershipsForUser(userId);
}

export async function getWorkspaceMembership(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceMembership | null> {
  return backend().getWorkspaceMembership(userId, workspaceId);
}

export async function setWorkspaceMembership(
  userId: string,
  workspaceId: string,
  role: WorkspaceRole,
): Promise<WorkspaceMembership> {
  return backend().setWorkspaceMembership(userId, workspaceId, role);
}

export async function listWorkspaceMemberRecords(workspaceId: string): Promise<
  Array<WorkspaceMembership & { email: string }>
> {
  return backend().listWorkspaceMemberRecords(workspaceId);
}

export async function deleteWorkspaceMembership(
  userId: string,
  workspaceId: string,
): Promise<void> {
  return backend().deleteWorkspaceMembership(userId, workspaceId);
}

export async function ensureDefaultMembershipsForAllWorkspaces(
  userId: string,
  role: WorkspaceRole = "owner",
): Promise<void> {
  return backend().ensureDefaultMembershipsForAllWorkspaces(userId, role);
}
