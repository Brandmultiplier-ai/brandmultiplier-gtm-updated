import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import { listProviderConnections } from "@/lib/provider-connections";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";
import { getStorageModeDiagnostics } from "@/lib/storage-mode";

function isEnvSet(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export async function GET(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);
  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const storage = getStorageModeDiagnostics();
  const [seats, providerConnections] = await Promise.all([
    store.listLinkedInSeats(workspaceId),
    listProviderConnections(workspaceId),
  ]);

  const checks = {
    openRouterApiKey: isEnvSet("OPENROUTER_API_KEY"),
    unipileApiKey: isEnvSet("UNIPILE_API_KEY"),
    unipileBaseUrl: isEnvSet("UNIPILE_BASE_URL"),
    unipileAccountId: isEnvSet("UNIPILE_ACCOUNT_ID"),
    webhookSecret: isEnvSet("BM_GTM_WEBHOOK_SECRET"),
    cronSecret: isEnvSet("BM_GTM_CRON_SECRET"),
    supabaseUrl: storage.hasSupabaseUrl,
    supabaseServiceRoleKey: storage.hasServiceRoleKey,
    supabaseStorage: storage.activeMode === "supabase",
    seatsConfigured: seats.length > 0,
    connectedSeats: seats.filter((seat) => Boolean(seat.unipileAccountId)).length,
    providerConnections: providerConnections.length,
  };

  const readiness = {
    openRouterReady: checks.openRouterApiKey,
    unipileReady: checks.unipileApiKey && checks.unipileBaseUrl && checks.unipileAccountId,
    automationReady: checks.webhookSecret && checks.cronSecret,
    storageReady: checks.supabaseStorage,
    seatReady: checks.connectedSeats > 0,
  };

  const nextSteps: string[] = [];
  if (!checks.unipileApiKey) nextSteps.push("Set UNIPILE_API_KEY");
  if (!checks.unipileBaseUrl) nextSteps.push("Set UNIPILE_BASE_URL");
  if (!checks.unipileAccountId) nextSteps.push("Set UNIPILE_ACCOUNT_ID from /api/v1/accounts");
  if (checks.connectedSeats === 0) nextSteps.push("Configure at least one LinkedIn seat in Settings");
  if (!checks.webhookSecret) nextSteps.push("Set BM_GTM_WEBHOOK_SECRET and configure Unipile webhook");
  if (!checks.cronSecret) nextSteps.push("Set BM_GTM_CRON_SECRET and configure cron endpoint");
  if (!checks.openRouterApiKey) nextSteps.push("Set OPENROUTER_API_KEY for Brain experiments");
  if (storage.warning) nextSteps.push(storage.warning);
  if (storage.activeMode !== "supabase") nextSteps.push("Enable Supabase storage so GTM data persists in the database");

  return NextResponse.json({
    ok: readiness.openRouterReady && readiness.unipileReady && readiness.automationReady && readiness.seatReady && readiness.storageReady,
    workspaceId,
    storage,
    checks,
    readiness,
    nextSteps,
  });
}
