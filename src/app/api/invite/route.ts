import { NextRequest, NextResponse } from "next/server";
import { sendInvite } from "@/lib/unipile";
import { requireAppWorkspaceWrite } from "@/lib/auth/resolve-app-workspace";

export async function POST(req: NextRequest) {
  const auth = await requireAppWorkspaceWrite(req);
  if (!auth.ok) return auth.response;
  if (process.env.ALLOW_DIRECT_INVITE_API !== "true") {
    return NextResponse.json({
      error: "Direct invite API disabled. Use /api/outreach or the campaign runner to preserve pacing.",
    }, { status: 409 });
  }

  const { providerId, message } = await req.json();

  if (!providerId || !message) {
    return NextResponse.json({ error: "providerId and message required" }, { status: 400 });
  }

  const data = await sendInvite(providerId, message);
  const status = typeof data?._httpStatus === "number"
    ? data._httpStatus
    : typeof data?.status === "number"
      ? data.status
      : 200;
  return NextResponse.json(data, { status });
}
