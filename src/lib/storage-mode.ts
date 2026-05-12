function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

type StorageMode = "supabase" | "local";

function configuredStorageMode(): string | null {
  return process.env.BM_GTM_STORAGE?.trim().toLowerCase() || null;
}

function hasSupabaseUrl(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
}

function hasServiceRoleKey(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export function getStorageModeDiagnostics(): {
  configuredMode: string | null;
  activeMode: StorageMode;
  supabaseDetected: boolean;
  supabaseEnabledFlag: boolean;
  hasSupabaseUrl: boolean;
  hasServiceRoleKey: boolean;
  localForced: boolean;
  warning: string | null;
} {
  const configuredMode = configuredStorageMode();
  const supabaseEnabledFlag = isTruthy(process.env.SUPABASE_ENABLED);
  const supabaseDetected = (hasSupabaseUrl() && hasServiceRoleKey()) || supabaseEnabledFlag;
  const localForced = configuredMode === "local" || configuredMode === "filesystem" || configuredMode === "fs";
  const activeMode: StorageMode = localForced
    ? "local"
    : configuredMode === "supabase" || supabaseDetected
      ? "supabase"
      : "local";

  return {
    configuredMode,
    activeMode,
    supabaseDetected,
    supabaseEnabledFlag,
    hasSupabaseUrl: hasSupabaseUrl(),
    hasServiceRoleKey: hasServiceRoleKey(),
    localForced,
    warning: localForced && supabaseDetected
      ? "BM_GTM_STORAGE is forcing local JSON even though Supabase envs are configured."
      : null,
  };
}

export function isSupabaseStorageEnabled(): boolean {
  return getStorageModeDiagnostics().activeMode === "supabase";
}
