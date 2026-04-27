import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import type { WorkspaceTemplate } from "@/lib/types";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

export async function GET(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const templates = await store.listWorkspaceTemplates(workspaceId);
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const body = await req.json().catch(() => ({}));

  const content = typeof body.content === "string" ? body.content.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const language = body.language === "it" ? "it" : "en";
  const type = body.type === "connection_request" ? "connection_request" : "message";

  if (!name || !content) {
    return NextResponse.json({ error: "name and content are required" }, { status: 400 });
  }

  const existingTemplates = await store.listWorkspaceTemplates(workspaceId);
  const template: WorkspaceTemplate = {
    id: "",
    workspaceId,
    name,
    content,
    language,
    type,
    step: typeof body.step === "number" ? body.step : existingTemplates.filter((item) => item.language === language).length,
    createdAt: "",
    updatedAt: "",
  };

  const saved = await store.saveWorkspaceTemplate(template);
  return NextResponse.json({ ok: true, template: saved });
}
