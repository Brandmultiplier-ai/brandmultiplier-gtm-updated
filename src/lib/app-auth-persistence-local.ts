import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import * as store from "./store";
import { dataPath } from "./data-paths";
import type { AppUser, WorkspaceMembership, WorkspaceRole } from "./types";
import { normalizeAppEmail } from "./auth/email";

const AUTH_FILE = () => dataPath("app-auth.json");

type AuthFile = {
  users: Array<{
    id: string;
    email: string;
    passwordHash: string;
    createdAt: string;
    updatedAt: string;
  }>;
  memberships: Array<{
    userId: string;
    workspaceId: string;
    role: WorkspaceRole;
    createdAt: string;
  }>;
};

function ensureAuthDir() {
  const p = AUTH_FILE();
  const d = dirname(p);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function readAuth(): AuthFile {
  ensureAuthDir();
  if (!existsSync(AUTH_FILE())) {
    return { users: [], memberships: [] };
  }
  return JSON.parse(readFileSync(AUTH_FILE(), "utf-8")) as AuthFile;
}

function writeAuth(data: AuthFile) {
  ensureAuthDir();
  writeFileSync(AUTH_FILE(), JSON.stringify(data, null, 2), "utf-8");
}

function mapUser(row: AuthFile["users"][0]): AppUser {
  return {
    id: row.id,
    email: row.email,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapM(row: AuthFile["memberships"][0]): WorkspaceMembership {
  return {
    userId: row.userId,
    workspaceId: row.workspaceId,
    role: row.role,
    createdAt: row.createdAt,
  };
}

export async function getAppUserById(id: string): Promise<AppUser | null> {
  const auth = readAuth();
  const u = auth.users.find((x) => x.id === id);
  return u ? mapUser(u) : null;
}

export async function getAppUserByEmail(email: string): Promise<AppUser | null> {
  const n = normalizeAppEmail(email);
  const auth = readAuth();
  const u = auth.users.find((x) => x.email === n);
  return u ? mapUser(u) : null;
}

export async function getAppUserWithPasswordForLogin(
  email: string,
): Promise<(AppUser & { passwordHash: string }) | null> {
  const n = normalizeAppEmail(email);
  const auth = readAuth();
  const u = auth.users.find((x) => x.email === n);
  if (!u) return null;
  return { ...mapUser(u), passwordHash: u.passwordHash };
}

export async function createAppUser(email: string, passwordHash: string): Promise<AppUser> {
  const n = normalizeAppEmail(email);
  const auth = readAuth();
  if (auth.users.some((u) => u.email === n)) {
    throw new Error("User already exists");
  }
  const now = new Date().toISOString();
  const id = `usr_${[...Array(8)].map(() => "abcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(Math.random() * 36))).join("")}`;
  const row = { id, email: n, passwordHash, createdAt: now, updatedAt: now };
  auth.users.push(row);
  writeAuth(auth);
  return mapUser(row);
}

export async function countAppUsers(): Promise<number> {
  return readAuth().users.length;
}

export async function listWorkspaceMembershipsForUser(userId: string): Promise<WorkspaceMembership[]> {
  return readAuth().memberships.filter((m) => m.userId === userId).map(mapM);
}

export async function getWorkspaceMembership(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceMembership | null> {
  const m = readAuth().memberships.find(
    (x) => x.userId === userId && x.workspaceId === workspaceId,
  );
  return m ? mapM(m) : null;
}

export async function setWorkspaceMembership(
  userId: string,
  workspaceId: string,
  role: WorkspaceRole,
): Promise<WorkspaceMembership> {
  const auth = readAuth();
  const now = new Date().toISOString();
  const idx = auth.memberships.findIndex(
    (x) => x.userId === userId && x.workspaceId === workspaceId,
  );
  if (idx >= 0) {
    auth.memberships[idx] = { userId, workspaceId, role, createdAt: auth.memberships[idx].createdAt };
  } else {
    auth.memberships.push({ userId, workspaceId, role, createdAt: now });
  }
  writeAuth(auth);
  const found = auth.memberships.find((x) => x.userId === userId && x.workspaceId === workspaceId);
  if (!found) throw new Error("membership save failed");
  return mapM(found);
}

export async function listWorkspaceMemberRecords(
  workspaceId: string,
): Promise<Array<WorkspaceMembership & { email: string }>> {
  const auth = readAuth();
  return auth.memberships
    .filter((m) => m.workspaceId === workspaceId)
    .map((m) => {
      const u = auth.users.find((r) => r.id === m.userId);
      return { ...mapM(m), email: u?.email || "" };
    });
}

export async function deleteWorkspaceMembership(
  userId: string,
  workspaceId: string,
): Promise<void> {
  const auth = readAuth();
  auth.memberships = auth.memberships.filter(
    (m) => !(m.userId === userId && m.workspaceId === workspaceId),
  );
  writeAuth(auth);
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
