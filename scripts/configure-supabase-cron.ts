import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const envPath = join(ROOT, ".env.local");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^(\w+)=(.+)$/);
    if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const { getSupabaseAdminClient } = await import("../src/lib/supabase/admin");

  const admin = getSupabaseAdminClient();
  const jobName = process.env.BM_GTM_CRON_JOB_NAME || "bm_gtm_automation_tick";
  const schedule = process.env.BM_GTM_CRON_SCHEDULE || "*/15 * * * *";
  const appUrl = (process.env.BM_GTM_APP_URL || "https://brandmultiplier-gtm.vercel.app").replace(/\/$/, "");
  const cronSecret = process.env.BM_GTM_CRON_SECRET;
  const requestTimeoutMs = Math.max(
    10_000,
    Number.parseInt(process.env.BM_GTM_CRON_HTTP_TIMEOUT_MS || "300000", 10) || 300_000,
  );

  if (!cronSecret) {
    throw new Error("Missing BM_GTM_CRON_SECRET");
  }

  const endpointUrl = `${appUrl}/api/cron/run`;
  const { data, error } = await admin.rpc("configure_automation_cron", {
    job_name: jobName,
    cron_schedule: schedule,
    endpoint_url: endpointUrl,
    cron_secret: cronSecret,
    request_timeout_ms: requestTimeoutMs,
  });

  if (error) {
    throw new Error(`configure_automation_cron: ${error.message}`);
  }

  console.log(JSON.stringify({
    ok: true,
    jobId: data,
    jobName,
    schedule,
    endpointUrl,
    requestTimeoutMs,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
