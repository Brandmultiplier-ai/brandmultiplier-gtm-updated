import { getSupabaseAdminClient } from "../src/lib/supabase/admin";

async function main() {
  const timestamps = process.argv.slice(2).filter(Boolean);
  if (timestamps.length === 0) {
    throw new Error("Usage: npx tsx scripts/delete-outreach-runs.ts <ts> [<ts>...]");
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("outreach_runs")
    .delete()
    .in("ts", timestamps)
    .select("id, ts, campaign_id");

  if (error) {
    throw new Error(`deleteOutreachRuns: ${error.message}`);
  }

  console.log(JSON.stringify({
    deleted: (data || []).length,
    runs: data || [],
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
