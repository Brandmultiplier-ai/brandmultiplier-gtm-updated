function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isSupabaseStorageEnabled(): boolean {
  const mode = process.env.BM_GTM_STORAGE?.trim().toLowerCase();
  if (mode === "local" || mode === "filesystem" || mode === "fs") return false;
  if (mode === "supabase") return true;

  return (
    isTruthy(process.env.SUPABASE_ENABLED) ||
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}
