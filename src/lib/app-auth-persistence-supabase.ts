import { getSupabaseAdminClient } from "./supabase/admin";
import type { AppUser, WorkspaceInvite, WorkspaceMembership, WorkspaceRole } from "./types";
import { normalizeAppEmail } from "./auth/email";
import * as store from "./store";

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  profile_settings: unknown;
  created_at: string;
  updated_at: string;
};

type MembershipRow = {
  user_id: string;
  workspace_id: string;
  role: WorkspaceRole;
  created_at: string;
};

type InviteRow = {
  id: string;
  workspace_id: string;
  token_hash: string;
  role: WorkspaceRole;
  created_by_user_id: string | null;
  accepted_by_user_id: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

function maybeRecord<T extends Record<string, unknown>>(value: unknown, fallback: T): T {
  return value && typeof value === "object" && !Array.isArray(value) ? value as T : fallback;
}

function mapUser(r: UserRow): AppUser {
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name || undefined,
    profileSettings: maybeRecord(r.profile_settings, {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapM(r: MembershipRow): WorkspaceMembership {
  return {
    userId: r.user_id,
    workspaceId: r.workspace_id,
    role: r.role,
    createdAt: r.created_at,
  };
}

function mapInvite(r: InviteRow): WorkspaceInvite {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    tokenHash: r.token_hash,
    role: r.role,
    createdByUserId: r.created_by_user_id || undefined,
    acceptedByUserId: r.accepted_by_user_id || undefined,
    expiresAt: r.expires_at,
    acceptedAt: r.accepted_at || undefined,
    createdAt: r.created_at,
  };
}

function ensureNoError(e: { message: string } | null, ctx: string) {
  if (e) throw new Error(`${ctx}: ${e.message}`);
}

export async function getAppUserById(id: string): Promise<AppUser | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("app_users").select("*").eq("id", id).maybeSingle();
  ensureNoError(error, "getAppUserById");
  return data ? mapUser(data as UserRow) : null;
}

export async function getAppUserByEmail(email: string): Promise<AppUser | null> {
  const n = normalizeAppEmail(email);
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("app_users").select("*").eq("email", n).maybeSingle();
  ensureNoError(error, "getAppUserByEmail");
  return data ? mapUser(data as UserRow) : null;
}

export async function getAppUserWithPasswordForLogin(
  email: string,
): Promise<(AppUser & { passwordHash: string }) | null> {
  return getAppUserWithHashByEmail(email);
}

export async function getAppUserWithHashByEmail(
  email: string,
): Promise<(AppUser & { passwordHash: string }) | null> {
  const n = normalizeAppEmail(email);
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("email", n)
    .maybeSingle<{
      id: string;
      email: string;
      display_name: string | null;
      profile_settings: unknown;
      password_hash: string;
      created_at: string;
      updated_at: string;
    }>();
  ensureNoError(error, "getAppUserWithHashByEmail");
  if (!data) return null;
  return {
    id: data.id,
    email: data.email,
    displayName: data.display_name || undefined,
    profileSettings: maybeRecord(data.profile_settings, {}),
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    passwordHash: data.password_hash,
  };
}

export async function createAppUser(
  email: string,
  passwordHash: string,
): Promise<AppUser> {
  const n = normalizeAppEmail(email);
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("app_users")
    .insert({
      email: n,
      password_hash: passwordHash,
      display_name: n.split("@")[0],
      profile_settings: {},
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  ensureNoError(error, "createAppUser");
  return mapUser(data as UserRow);
}

export async function updateAppUserProfile(
  userId: string,
  patch: Pick<AppUser, "displayName" | "profileSettings">,
): Promise<AppUser> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("app_users")
    .update({
      display_name: patch.displayName || null,
      profile_settings: patch.profileSettings || {},
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("*")
    .single();
  ensureNoError(error, "updateAppUserProfile");
  return mapUser(data as UserRow);
}

export async function countAppUsers(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { count, error } = await supabase
    .from("app_users")
    .select("id", { count: "exact", head: true });
  ensureNoError(error, "countAppUsers");
  return count || 0;
}

export async function listWorkspaceMembershipsForUser(
  userId: string,
): Promise<WorkspaceMembership[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workspace_memberships")
    .select("*")
    .eq("user_id", userId);
  ensureNoError(error, "listWorkspaceMembershipsForUser");
  return (data as MembershipRow[] | null)?.map(mapM) || [];
}

export async function getWorkspaceMembership(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceMembership | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workspace_memberships")
    .select("*")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  ensureNoError(error, "getWorkspaceMembership");
  return data ? mapM(data as MembershipRow) : null;
}

export async function setWorkspaceMembership(
  userId: string,
  workspaceId: string,
  role: WorkspaceRole,
): Promise<WorkspaceMembership> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workspace_memberships")
    .upsert(
      { user_id: userId, workspace_id: workspaceId, role },
      { onConflict: "user_id,workspace_id" },
    )
    .select("*")
    .single();
  ensureNoError(error, "setWorkspaceMembership");
  return mapM(data as MembershipRow);
}

export async function listWorkspaceMemberRecords(
  workspaceId: string,
): Promise<Array<WorkspaceMembership & { email: string }>> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workspace_memberships")
    .select("*")
    .eq("workspace_id", workspaceId);
  ensureNoError(error, "listWorkspaceMemberRecords");
  const rows = (data as MembershipRow[] | null) || [];
  const out: Array<WorkspaceMembership & { email: string }> = [];
  for (const r of rows) {
    const { data: u, error: uerr } = await supabase
      .from("app_users")
      .select("email")
      .eq("id", r.user_id)
      .maybeSingle<{ email: string }>();
    if (uerr) throw new Error(`listWorkspaceMemberRecords user: ${uerr.message}`);
    out.push({
      userId: r.user_id,
      workspaceId: r.workspace_id,
      role: r.role,
      createdAt: r.created_at,
      email: u?.email || "",
    });
  }
  return out;
}

export async function deleteWorkspaceMembership(
  userId: string,
  workspaceId: string,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("workspace_memberships")
    .delete()
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId);
  ensureNoError(error, "deleteWorkspaceMembership");
}

export async function createWorkspaceInvite(
  invite: Omit<WorkspaceInvite, "createdAt" | "acceptedAt" | "acceptedByUserId">,
): Promise<WorkspaceInvite> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workspace_invites")
    .insert({
      id: invite.id,
      workspace_id: invite.workspaceId,
      token_hash: invite.tokenHash,
      role: invite.role,
      created_by_user_id: invite.createdByUserId || null,
      expires_at: invite.expiresAt,
    })
    .select("*")
    .single();
  ensureNoError(error, "createWorkspaceInvite");
  return mapInvite(data as InviteRow);
}

export async function getWorkspaceInviteByTokenHash(tokenHash: string): Promise<WorkspaceInvite | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workspace_invites")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  ensureNoError(error, "getWorkspaceInviteByTokenHash");
  return data ? mapInvite(data as InviteRow) : null;
}

export async function listWorkspaceInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workspace_invites")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  ensureNoError(error, "listWorkspaceInvites");
  return (data as InviteRow[] | null)?.map(mapInvite) || [];
}

export async function markWorkspaceInviteAccepted(
  inviteId: string,
  userId: string,
): Promise<WorkspaceInvite> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workspace_invites")
    .update({
      accepted_by_user_id: userId,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", inviteId)
    .select("*")
    .single();
  ensureNoError(error, "markWorkspaceInviteAccepted");
  return mapInvite(data as InviteRow);
}

export async function ensureDefaultMembershipsForAllWorkspaces(
  userId: string,
  role: WorkspaceRole,
): Promise<void> {
  const workspaces = await store.listWorkspaces();
  for (const w of workspaces) {
    const m = await getWorkspaceMembership(userId, w.id);
    if (!m) await setWorkspaceMembership(userId, w.id, role);
  }
}
