import { getSupabaseAdminClient } from "./supabase/admin";
import type { AppUser, WorkspaceMembership, WorkspaceRole } from "./types";
import { normalizeAppEmail } from "./auth/email";
import * as store from "./store";

type UserRow = {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
};

type MembershipRow = {
  user_id: string;
  workspace_id: string;
  role: WorkspaceRole;
  created_at: string;
};

function mapUser(r: UserRow): AppUser {
  return {
    id: r.id,
    email: r.email,
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
      password_hash: string;
      created_at: string;
      updated_at: string;
    }>();
  ensureNoError(error, "getAppUserWithHashByEmail");
  if (!data) return null;
  return {
    id: data.id,
    email: data.email,
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
    .insert({ email: n, password_hash: passwordHash, updated_at: new Date().toISOString() })
    .select("*")
    .single();
  ensureNoError(error, "createAppUser");
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
