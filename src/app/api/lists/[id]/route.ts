import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const existing = (await store.listContactLists(workspaceId)).find((item) => item.id === id);

  if (!existing) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  let leadIds = existing.leadIds;
  if (body.action === "addLeads" && Array.isArray(body.leadIds)) {
    leadIds = Array.from(new Set([...existing.leadIds, ...body.leadIds.filter((value: unknown): value is string => typeof value === "string")]));
  } else if (body.action === "removeLeads" && Array.isArray(body.leadIds)) {
    const toRemove = new Set(body.leadIds.filter((value: unknown): value is string => typeof value === "string"));
    leadIds = existing.leadIds.filter((leadId) => !toRemove.has(leadId));
  } else if (Array.isArray(body.leadIds)) {
    leadIds = body.leadIds.filter((value: unknown): value is string => typeof value === "string");
  }

  const saved = await store.saveContactList({
    ...existing,
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : existing.name,
    description: typeof body.description === "string" ? body.description.trim() : existing.description,
    leadIds,
  });

  return NextResponse.json({ ok: true, list: saved });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const { id } = await params;
  const existing = (await store.listContactLists(workspaceId)).find((item) => item.id === id);

  if (!existing) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  await store.deleteContactList(id, workspaceId);
  return NextResponse.json({ ok: true });
}
