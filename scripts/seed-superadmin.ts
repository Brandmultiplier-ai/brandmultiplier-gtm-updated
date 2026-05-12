/**
 * One-time: create the platform super administrator in Supabase (after migrations include `global_role`).
 *
 * Prerequisites:
 * 1. Run `supabase/migrations/20260513140000_app_users_global_role.sql` (or `supabase db push`).
 * 2. Optionally run `scripts/reset-app-users-supabase.sql` in the SQL editor to clear existing users.
 * 3. Set in `.env.local` (never commit real passwords):
 *    BM_GTM_SEED_SUPERADMIN_EMAIL=you@yourdomain.com
 *    BM_GTM_SEED_SUPERADMIN_PASSWORD=your-strong-password
 *
 * Then: npx tsx scripts/seed-superadmin.ts
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import bcrypt from "bcryptjs";
import { normalizeAppEmail } from "../src/lib/auth/email";

const ROOT = join(__dirname, "..");
const envPath = join(ROOT, ".env.local");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([\w.]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const email = normalizeAppEmail(process.env.BM_GTM_SEED_SUPERADMIN_EMAIL?.trim() || "");
  const password = process.env.BM_GTM_SEED_SUPERADMIN_PASSWORD?.trim();
  if (!email || !password) {
    throw new Error("Set BM_GTM_SEED_SUPERADMIN_EMAIL and BM_GTM_SEED_SUPERADMIN_PASSWORD in .env.local");
  }

  const { getSupabaseAdminClient } = await import("../src/lib/supabase/admin");
  const supabase = getSupabaseAdminClient();
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();

  const { data: existing, error: selErr } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (selErr) throw new Error(`seed-superadmin read: ${selErr.message}`);

  if (existing?.id) {
    const { error: upErr } = await supabase
      .from("app_users")
      .update({
        password_hash: passwordHash,
        global_role: "super admin",
        updated_at: now,
      })
      .eq("id", existing.id);
    if (upErr) throw new Error(`seed-superadmin update: ${upErr.message}`);
    console.log("Updated existing user to super admin:", existing.id);
  } else {
    const { data: created, error: insErr } = await supabase
      .from("app_users")
      .insert({
        email,
        password_hash: passwordHash,
        display_name: email.split("@")[0],
        profile_settings: {},
        global_role: "super admin",
        updated_at: now,
      })
      .select("id,email,global_role")
      .single();
    if (insErr) throw new Error(`seed-superadmin insert: ${insErr.message}`);
    console.log("Created super admin:", created);
  }
  console.log("Done. Sign in at /login with BM_GTM_SEED_SUPERADMIN_EMAIL / BM_GTM_SEED_SUPERADMIN_PASSWORD.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
