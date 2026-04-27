import { NextRequest, NextResponse } from "next/server";
import { promoteSignalCandidate } from "@/lib/signal-promotion";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

export async function POST(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const body = await req.json().catch(() => ({}));
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : undefined;
  const singleSignalId = typeof body.signalId === "string" ? body.signalId : null;
  const bulkSignalIds = Array.isArray(body.signalIds)
    ? body.signalIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
    : [];
  const signalIds = singleSignalId ? [singleSignalId] : bulkSignalIds;

  if (signalIds.length === 0) {
    return NextResponse.json({ error: "signalId or signalIds is required" }, { status: 400 });
  }

  const results = [];
  for (const signalId of signalIds) {
    try {
      const result = await promoteSignalCandidate({ signalId, workspaceId, campaignId });
      results.push({
        signalId,
        ok: true,
        created: result.created,
        signal: result.signal,
        lead: result.lead,
      });
    } catch (error) {
      results.push({
        signalId,
        ok: false,
        error: String(error),
      });
    }
  }

  const okCount = results.filter((result) => result.ok).length;
  const status = okCount > 0 ? 200 : 400;
  return NextResponse.json({ ok: okCount > 0, promoted: okCount, results }, { status });
}
