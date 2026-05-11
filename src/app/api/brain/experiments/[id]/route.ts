import { NextRequest, NextResponse } from "next/server";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";
import { brainExperimentsDisabledMessage, isBrainExperimentsEnabled } from "@/lib/brain/feature-flags";
import { getExperiment } from "@/lib/brain/experiment-store";
import { approveExperiment, cancelExperiment, runEvaluation, keepExperiment, discardExperiment } from "@/lib/brain/experiment-lifecycle";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const experiment = await getExperiment(id);
  if (!experiment || experiment.workspaceId !== workspaceId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ experiment });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isBrainExperimentsEnabled()) {
    return NextResponse.json({ error: brainExperimentsDisabledMessage() }, { status: 409 });
  }

  const { id } = await params;
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const body = await req.json();
  const action = body.action as string;

  const exp = await getExperiment(id);
  if (!exp || exp.workspaceId !== workspaceId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    switch (action) {
      case "approve":
        return NextResponse.json({ experiment: await approveExperiment(id) });
      case "cancel":
        return NextResponse.json({ experiment: await cancelExperiment(id) });
      case "evaluate":
        return NextResponse.json({ results: await runEvaluation(id) });
      case "keep":
        return NextResponse.json({ experiment: await keepExperiment(id) });
      case "discard":
        return NextResponse.json({ experiment: await discardExperiment(id) });
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
