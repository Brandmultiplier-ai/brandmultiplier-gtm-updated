/**
 * Backfill profile pictures for existing leads that don't have one.
 * Fetches from Unipile GET /users/{providerId}.
 *
 * Usage: npx tsx scripts/backfill-photos.ts [--dry-run]
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const store = await import("../src/lib/store");
  const { getProfile } = await import("../src/lib/unipile");

  const leads = await store.getAllLeads({});
  const withoutPhoto = leads.filter((l) => !l.profilePictureUrl && l.providerId);

  console.log(`Found ${withoutPhoto.length} leads without profile picture (of ${leads.length} total)`);
  if (dryRun) {
    console.log("[DRY RUN] Would fetch profiles for these leads:");
    withoutPhoto.forEach((l) => console.log(`  - ${l.name} (${l.providerId})`));
    return;
  }

  let updated = 0;
  let failed = 0;

  for (const lead of withoutPhoto) {
    try {
      const profile = await getProfile(lead.providerId);
      const pictureUrl = profile?.profile_picture_url;

      if (pictureUrl) {
        await store.saveLead({
          ...lead,
          profilePictureUrl: pictureUrl,
        });
        updated++;
        console.log(`  ✓ ${lead.name}: got picture`);
      } else {
        console.log(`  - ${lead.name}: no picture available`);
      }

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      failed++;
      console.log(`  ✗ ${lead.name}: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  console.log(`\nDone: ${updated} updated, ${failed} failed`);
}

main().catch(console.error);
