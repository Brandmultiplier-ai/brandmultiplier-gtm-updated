/**
 * Deletes all app_users (and related invites/memberships), then creates one super admin.
 * Requires .env.local: SUPABASE_SERVICE_ROLE_KEY + SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.
 *
 * Usage: npx tsx scripts/reset-and-seed-superadmin.ts [email]
 * Default email: sivasish@brandmultiplier.ai
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { normalizeAppEmail } from "../src/lib/auth/email";

const ROOT = join(__dirname, "..");
const envPath = join(ROOT, ".env.local");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([\w.]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const DEFAULT_EMAIL = "sivasish@brandmultiplier.ai";

async function main() {
  const emailArg = process.argv[2]?.trim();
  const email = normalizeAppEmail(emailArg || DEFAULT_EMAIL);
  const password = randomBytes(18).toString("base64url");

  const { getSupabaseAdminClient } = await import("../src/lib/supabase/admin");
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(password, 10);

  const { error: e1 } = await supabase.from("workspace_invites").delete().gte("expires_at", "1970-01-01T00:00:00Z");
  if (e1) throw new Error(`delete invites: ${e1.message}`);
  const { error: e2 } = await supabase.from("workspace_memberships").delete().gte("created_at", "1970-01-01T00:00:00Z");
  if (e2) throw new Error(`delete memberships: ${e2.message}`);
  const { error: e3 } = await supabase.from("app_users").delete().gte("created_at", "1970-01-01T00:00:00Z");
  if (e3) throw new Error(`delete app_users: ${e3.message}`);

  const { data, error: insErr } = await supabase
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

  if (insErr) throw new Error(`insert super admin: ${insErr.message}`);

  console.log("");
  console.log("Done. All previous app users, memberships, and invites were removed.");
  console.log("Super admin created:", data);
  console.log("");
  console.log("Sign in at /login with:");
  console.log("  Email:   ", email);
  console.log("  Password:", password);
  console.log("");
  console.log("Save this password now — it will not be shown again.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
