import { NextRequest, NextResponse } from "next/server";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";
import { getDashboardSnapshotPayload } from "@/lib/dashboard-snapshots";
import type { DashboardPeriod } from "@/lib/types";

function parsePeriod(value: string | null): DashboardPeriod {
  if (value === "7d" || value === "30d" || value === "3m" || value === "current") {
    return value;
  }
  return "30d";
}

export async function GET(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const period = parsePeriod(req.nextUrl.searchParams.get("period"));
  return NextResponse.json(await getDashboardSnapshotPayload(workspaceId, period));
}
