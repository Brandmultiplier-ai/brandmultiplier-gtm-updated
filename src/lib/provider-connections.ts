import type { ProviderConnection } from "./types";
import { isSupabaseStorageEnabled } from "./storage-mode";
import { getSupabaseAdminClient } from "./supabase/admin";
import { dataPath } from "./data-paths";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";

function err(ctx: string, e: { message: string } | null) {
  if (e) throw new Error(`${ctx}: ${e.message}`);
}

type ProviderConnectionRow = {
  id: string;
  workspace_id: string;
  provider: string;
  unipile_account_id: string;
  unipile_api_key: string | null;
  unipile_base_url: string | null;
  name: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

function mapRow(r: ProviderConnectionRow): ProviderConnection {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    provider: r.provider,
    unipileAccountId: r.unipile_account_id,
    unipileApiKey: r.unipile_api_key || "",
    unipileBaseUrl: r.unipile_base_url || "",
    name: r.name || "Connection",
    isDefault: r.is_default,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const LOCAL_DIR = () => dataPath("provider-connections");

function ensureDataDir() {
  const d = LOCAL_DIR();
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function readLocalList(workspaceId: string): ProviderConnection[] {
  ensureDataDir();
  const p = join(LOCAL_DIR(), `${workspaceId}.json`);
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, "utf-8")) as ProviderConnection[];
}

function writeLocalList(workspaceId: string, list: ProviderConnection[]) {
  ensureDataDir();
  writeFileSync(join(LOCAL_DIR(), `${workspaceId}.json`), JSON.stringify(list, null, 2), "utf-8");
}

export async function getProviderConnection(
  id: string,
  workspaceId: string,
): Promise<ProviderConnection | null> {
  if (isSupabaseStorageEnabled()) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("provider_connections")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .maybeSingle<ProviderConnectionRow>();
    err("getProviderConnection", error);
    return data ? mapRow(data) : null;
  }
  return readLocalList(workspaceId).find((c) => c.id === id) || null;
}

export async function findProviderConnectionByUnipileAccountId(
  unipileAccountId: string,
): Promise<ProviderConnection | null> {
  if (isSupabaseStorageEnabled()) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("provider_connections")
      .select("*")
      .eq("unipile_account_id", unipileAccountId)
      .maybeSingle<ProviderConnectionRow>();
    err("findProviderConnectionByUnipileAccountId", error);
    return data ? mapRow(data) : null;
  }
  ensureDataDir();
  if (!existsSync(LOCAL_DIR())) return null;
  for (const f of readdirSync(LOCAL_DIR()).filter((x) => x.endsWith(".json"))) {
    const list = JSON.parse(readFileSync(join(LOCAL_DIR(), f), "utf-8")) as ProviderConnection[];
    const hit = list.find((c) => c.unipileAccountId === unipileAccountId);
    if (hit) return hit;
  }
  return null;
}

export async function listProviderConnections(workspaceId: string): Promise<ProviderConnection[]> {
  if (isSupabaseStorageEnabled()) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("provider_connections")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });
    err("listProviderConnections", error);
    return (data as ProviderConnectionRow[] | null)?.map(mapRow) || [];
  }
  return readLocalList(workspaceId);
}

export async function saveProviderConnection(
  connection: Partial<ProviderConnection> & { workspaceId: string; unipileAccountId: string },
): Promise<ProviderConnection> {
  const now = new Date().toISOString();
  if (isSupabaseStorageEnabled()) {
    const supabase = getSupabaseAdminClient();
    const id = connection.id || `conn_${Math.random().toString(36).slice(2, 14)}`;
    const next: ProviderConnection = {
      id,
      workspaceId: connection.workspaceId,
      provider: connection.provider || "unipile",
      unipileAccountId: connection.unipileAccountId,
      unipileApiKey: connection.unipileApiKey || "",
      unipileBaseUrl: connection.unipileBaseUrl || "",
      name: connection.name || "Connection",
      isDefault: connection.isDefault !== false,
      createdAt: connection.createdAt || now,
      updatedAt: now,
    };
    const { data, error } = await supabase
      .from("provider_connections")
      .upsert(
        {
          id: next.id,
          workspace_id: next.workspaceId,
          provider: next.provider,
          unipile_account_id: next.unipileAccountId,
          unipile_api_key: next.unipileApiKey || null,
          unipile_base_url: next.unipileBaseUrl || null,
          name: next.name,
          is_default: next.isDefault,
          created_at: next.createdAt,
          updated_at: next.updatedAt,
        },
        { onConflict: "id" },
      )
      .select("*")
      .single<ProviderConnectionRow>();
    err("saveProviderConnection", error);
    if (!data) throw new Error("saveProviderConnection: missing row");
    return mapRow(data);
  }
  const list = readLocalList(connection.workspaceId);
  const id = connection.id || `conn_${Math.random().toString(36).slice(2, 14)}`;
  const next: ProviderConnection = {
    id,
    workspaceId: connection.workspaceId,
    provider: connection.provider || "unipile",
    unipileAccountId: connection.unipileAccountId,
    unipileApiKey: connection.unipileApiKey || "",
    unipileBaseUrl: connection.unipileBaseUrl || "",
    name: connection.name || "Connection",
    isDefault: connection.isDefault !== false,
    createdAt: connection.createdAt || now,
    updatedAt: now,
  };
  const idx = list.findIndex((c) => c.id === id);
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  writeLocalList(connection.workspaceId, list);
  return next;
}
