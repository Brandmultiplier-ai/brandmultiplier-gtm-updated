/** `app_users.id` in Supabase is `uuid`; local dev uses `usr_*` strings. */
export function isSupabaseStyleAppUserId(id: string): boolean {
  const t = id.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);
}
