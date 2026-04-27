import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const LEADS_DIR = join(process.cwd(), "data", "leads");
let updated = 0;

for (const dir of readdirSync(LEADS_DIR)) {
  if (dir.startsWith("_") || dir.endsWith(".json")) continue;
  const campaignDir = join(LEADS_DIR, dir);
  for (const file of readdirSync(campaignDir)) {
    if (!file.endsWith(".json")) continue;
    const path = join(campaignDir, file);
    const lead = JSON.parse(readFileSync(path, "utf-8"));

    // Skip if already JSON format
    try {
      const parsed = JSON.parse(lead.signal);
      if (parsed && parsed.source) continue;
    } catch {
      // not JSON, needs migration
    }

    if (typeof lead.signal === "string" && lead.signal.startsWith("Matched ICP:")) {
      lead.signal = JSON.stringify({
        source: "keyword_search",
        context: lead.signal,
        icpFit: Math.round((lead.aiScore / 3) * 100) / 100,
        intentScore: 1,
      });
      writeFileSync(path, JSON.stringify(lead, null, 2));
      updated++;
      console.log(`Updated: ${file} — ${lead.name}`);
    } else if (typeof lead.signal === "string" && lead.signal === "anti-persona match") {
      lead.signal = JSON.stringify({
        source: "keyword_search",
        context: "Anti-persona match",
        icpFit: 0,
        intentScore: 0,
      });
      writeFileSync(path, JSON.stringify(lead, null, 2));
      updated++;
      console.log(`Updated: ${file} — ${lead.name}`);
    }
  }
}
console.log(`\nDone. ${updated} leads updated.`);
