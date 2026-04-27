import { NextRequest, NextResponse } from "next/server";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";
import { analyzeWorkspace, getLatestSnapshot } from "@/lib/brain";

export async function GET(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const snapshot = await getLatestSnapshot(workspaceId);
  return NextResponse.json({ snapshot });
}

export async function POST(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const snapshot = await analyzeWorkspace(workspaceId);
  return NextResponse.json({ snapshot });
}
