/**
 * One-off: create an app user and grant workspace admin on all existing workspaces.
 * Usage:  npx tsx scripts/seed-app-user.ts
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and:
 *   BM_GTM_SEED_EMAIL, BM_GTM_SEED_PASSWORD
 */
import * as bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const email = (process.env.BM_GTM_SEED_EMAIL || "admin@example.com").toLowerCase().trim();
const password = process.env.BM_GTM_SEED_PASSWORD || "change-me-now";
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  const hash = await bcrypt.hash(password, 10);
  let userId: string;
  const { data: ex } = await supabase.from("app_users").select("id, email").eq("email", email).maybeSingle();
  if (ex) {
    userId = (ex as { id: string }).id;
    const { error } = await supabase
      .from("app_users")
      .update({ password_hash: hash, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) {
      console.error("update user", error);
      process.exit(1);
    }
    console.log("Updated password for", email);
  } else {
    const { data, error } = await supabase
      .from("app_users")
      .insert({ email, password_hash: hash, updated_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error || !data) {
      console.error("insert user", error);
      process.exit(1);
    }
    userId = (data as { id: string }).id;
    console.log("Created user", userId);
  }

  const { data: wss, error: werr } = await supabase.from("workspaces").select("id");
  if (werr) {
    console.error(werr);
    process.exit(1);
  }
  for (const w of wss || []) {
    const wid = (w as { id: string }).id;
    const { error } = await supabase
      .from("workspace_memberships")
      .upsert(
        { user_id: userId, workspace_id: wid, role: "workspace admin" },
        { onConflict: "user_id,workspace_id" },
      );
    if (error) {
      console.error("membership", wid, error);
    } else {
      console.log("membership", wid, "ok");
    }
  }
  console.log("Done. Set BM_GTM_SESSION_SECRET in Vercel and sign in at /login");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
