import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const existing = (await store.listWorkspaceTemplates(workspaceId)).find((item) => item.id === id);

  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : existing.content;
  const name = typeof body.name === "string" ? body.name.trim() : existing.name;

  if (!name || !content) {
    return NextResponse.json({ error: "name and content are required" }, { status: 400 });
  }

  const saved = await store.saveWorkspaceTemplate({
    ...existing,
    name,
    content,
    language: body.language === "it" || body.language === "en" ? body.language : existing.language,
    type: body.type === "connection_request" || body.type === "message" ? body.type : existing.type,
    step: typeof body.step === "number" ? body.step : existing.step,
  });

  return NextResponse.json({ ok: true, template: saved });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const { id } = await params;
  const existing = (await store.listWorkspaceTemplates(workspaceId)).find((item) => item.id === id);

  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  await store.deleteWorkspaceTemplate(id, workspaceId);
  return NextResponse.json({ ok: true });
}
