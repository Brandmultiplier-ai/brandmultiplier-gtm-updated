import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import type { ContactList } from "@/lib/types";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

export async function GET(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const lists = await store.listContactLists(workspaceId);
  return NextResponse.json({ lists });
}

export async function POST(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const body = await req.json().catch(() => ({}));

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const list: ContactList = {
    id: "",
    workspaceId,
    name,
    description: typeof body.description === "string" ? body.description.trim() : "",
    leadIds: Array.isArray(body.leadIds) ? body.leadIds.filter((value: unknown): value is string => typeof value === "string") : [],
    createdAt: "",
    updatedAt: "",
  };

  const saved = await store.saveContactList(list);
  return NextResponse.json({ ok: true, list: saved });
}
