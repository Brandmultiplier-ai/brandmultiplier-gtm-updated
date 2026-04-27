/**
 * BrandMultiplier GTM — Campaign Runner (full cycle)
 *
 * Runs the complete campaign lifecycle:
 * 1. Sync accepted connections from Unipile
 * 2. Send follow-up messages to accepted leads (sequence steps 2+)
 * 3. Search & send new connection requests (outreach step 1)
 *
 * Usage:
 *   npx tsx scripts/run-campaign.ts [--campaign cmp_xxx] [--dry-run] [--max 10]
 */

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

// Load env
const ROOT = join(__dirname, "..");
const envPath = join(ROOT, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^(\w+)=(.+)$/);
    if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

// ── CLI args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const campaignId = args.includes("--campaign")
  ? args[args.indexOf("--campaign") + 1]
  : undefined;
const maxInvites = args.includes("--max")
  ? parseInt(args[args.indexOf("--max") + 1])
  : undefined;

const LOCK_PATH = join(ROOT, "data", "run-campaign.lock");
const LOCK_TTL_MS = 30 * 60 * 1000;

function acquireLock(): boolean {
  const lockDir = join(ROOT, "data");
  if (!existsSync(lockDir)) mkdirSync(lockDir, { recursive: true });

  if (existsSync(LOCK_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(LOCK_PATH, "utf-8"));
      const expiresAt = typeof raw.expiresAt === "string" ? Date.parse(raw.expiresAt) : NaN;
      if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
        unlinkSync(LOCK_PATH);
      } else {
        return false;
      }
    } catch {
      const ageMs = Date.now() - statSync(LOCK_PATH).mtimeMs;
      if (ageMs > LOCK_TTL_MS) unlinkSync(LOCK_PATH);
      else return false;
    }
  }

  const fd = openSync(LOCK_PATH, "wx");
  writeFileSync(fd, JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
  }));
  closeSync(fd);
  return true;
}

function releaseLock() {
  if (existsSync(LOCK_PATH)) unlinkSync(LOCK_PATH);
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  if (!acquireLock()) {
    console.log("BrandMultiplier GTM — Campaign Runner");
    console.log("Another scheduler tick is already running. Exiting.");
    return;
  }

  try {
    const { runAutomationTick } = await import("../src/lib/automation-runner");
    const result = await runAutomationTick({
      campaignId,
      dryRun,
      maxInvites,
      onLog: (line) => console.log(line),
    });

    if (campaignId && result.campaigns.length === 0) {
      console.error(`Campaign ${campaignId} not found`);
      process.exitCode = 1;
    } else if (!campaignId && result.campaigns.length === 0) {
      console.error("No active campaigns found");
      process.exitCode = 1;
    }

    if (result.errors.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    releaseLock();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
