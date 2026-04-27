/**
 * Backfill company enrichment for existing leads using the same runtime path
 * used by Copilot/Unibox. This first tries Unipile profile/company data and
 * falls back to conservative headline inference only when needed.
 *
 * Usage:
 *   npx tsx scripts/backfill-company-enrichment.ts [--dry-run]
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });

function cleanString(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function snapshot(lead: { company?: string; companySize?: string; industry?: string; companyDescription?: string; companyLinkedInUrl?: string }) {
  return {
    company: cleanString(lead.company),
    companySize: cleanString(lead.companySize),
    industry: cleanString(lead.industry),
    companyDescription: cleanString(lead.companyDescription),
    companyLinkedInUrl: cleanString(lead.companyLinkedInUrl),
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const store = await import("../src/lib/store");
  const { ensureLeadCompanyData } = await import("../src/lib/lead-enrichment");

  const leads = await store.getAllLeads({});
  let updated = 0;
  let suggested = 0;

  for (const lead of leads) {
    const before = snapshot(lead);
    const enriched = await ensureLeadCompanyData(lead, undefined, { persist: !dryRun });
    const after = snapshot(enriched);

    const changed = JSON.stringify(before) !== JSON.stringify(after);
    if (!changed) {
      continue;
    }

    suggested++;
    if (dryRun) {
      console.log(`[DRY] ${lead.name}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
      continue;
    }
    updated++;
    console.log(`✓ ${lead.name}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  }

  console.log(`\nDone. ${dryRun ? "Would update" : "Updated"} ${dryRun ? suggested : updated} lead(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
