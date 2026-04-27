import { NextRequest, NextResponse } from "next/server";
import { runSequence } from "@/lib/sequence-runner";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

export const maxDuration = 300;

/**
 * POST /api/sequence — Run sequence processor
 * Body: { campaignId?, dryRun? }
 *
 * Syncs accepted connections, then sends follow-up messages
 * for all eligible leads based on campaign sequence steps.
 */
export async function POST(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const body = await req.json().catch(() => ({}));
  const { campaignId, dryRun = false } = body;

  const result = await runSequence({ workspaceId, campaignId, dryRun });
  return NextResponse.json(result);
}
