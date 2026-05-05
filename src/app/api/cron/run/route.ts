import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { runAutomationTick } from "@/lib/automation-runner";
import { acquireJobLock, releaseJobLock } from "@/lib/job-lock";
import { hasSharedSecret } from "@/lib/security";
import { getCronJobWorkspaceId } from "@/lib/workspace-context";
import * as store from "@/lib/store";
import { refreshDashboardSnapshot } from "@/lib/dashboard-snapshots";

export const runtime = "nodejs";
export const maxDuration = 300;

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return undefined;
}

function isAuthorized(req: NextRequest): boolean {
  return hasSharedSecret(req, process.env.BM_GTM_CRON_SECRET, {
    headerNames: ["x-bm-cron-secret"],
    queryNames: ["secret"],
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const lockName = toOptionalString(body.lockName) || "bm_gtm_automation_tick";
  const lockTtlSeconds = Math.max(300, toOptionalNumber(body.lockTtlSeconds) || 1800);
  const resolved = getCronJobWorkspaceId(req, toOptionalString(body.workspaceId));
  const campaignId = toOptionalString(body.campaignId);
  const dryRun = toOptionalBoolean(body.dryRun) || false;
  const maxInvites = toOptionalNumber(body.maxInvites);
  const lockToken = randomUUID();

  const acquired = await acquireJobLock(lockName, lockToken, lockTtlSeconds);
  if (!acquired) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      reason: "Another automation tick is already running",
    }, { status: 409 });
  }

  try {
    if (resolved.mode === "all") {
      const workspaces = await store.listWorkspaces();
      const active = workspaces.filter((w) => w.status === "active");
      if (active.length === 0) {
        return NextResponse.json(
          { ok: false, error: "No active workspaces to run automation" },
          { status: 400 },
        );
      }
      const results: Awaited<ReturnType<typeof runAutomationTick>>[] = [];
      for (const w of active) {
        results.push(
          await runAutomationTick({
            workspaceId: w.id,
            campaignId,
            dryRun,
            maxInvites,
          }),
        );
        await Promise.all([
          refreshDashboardSnapshot(w.id, "7d"),
          refreshDashboardSnapshot(w.id, "30d"),
          refreshDashboardSnapshot(w.id, "3m"),
          refreshDashboardSnapshot(w.id, "current"),
        ]);
      }
      const ok = results.every((r) => r.ok);
      return NextResponse.json(
        { ok, mode: "all", count: results.length, results },
        { status: ok ? 200 : 207 },
      );
    }
    const result = await runAutomationTick({
      workspaceId: resolved.workspaceId,
      campaignId,
      dryRun,
      maxInvites,
    });
    await Promise.all([
      refreshDashboardSnapshot(resolved.workspaceId, "7d"),
      refreshDashboardSnapshot(resolved.workspaceId, "30d"),
      refreshDashboardSnapshot(resolved.workspaceId, "3m"),
      refreshDashboardSnapshot(resolved.workspaceId, "current"),
    ]);
    return NextResponse.json(result, { status: result.ok ? 200 : 207 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  } finally {
    await releaseJobLock(lockName, lockToken).catch(() => undefined);
  }
}
