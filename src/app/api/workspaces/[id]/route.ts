import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import { requireSession } from "@/lib/auth/resolve-session";
import { effectiveWorkspaceMembership, requireWorkspaceAccessById } from "@/lib/auth/resolve-app-workspace";
import { isSuperAdminGlobalRole } from "@/lib/auth/role-values";
import type { Workspace } from "@/lib/types";

function serializeWorkspace(w: Workspace) {
  return {
    ...w,
    channels: {
      linkedin: w.channels.linkedin ? { configured: true } : undefined,
      email: w.channels.email
        ? { configured: true, provider: w.channels.email.provider }
        : undefined,
    },
  };
}

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: workspaceId } = await params;
  const $ws = await requireWorkspaceAccessById(req, workspaceId, { requireManageSettings: true });
  if (!$ws.ok) return $ws.response;

  const body = await req.json().catch(() => ({})) as Partial<Workspace>;
  const existing = await store.getWorkspace(workspaceId);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  const next: Workspace = { ...existing, ...body, id: existing.id, updatedAt: new Date().toISOString() };
  const saved = await store.saveWorkspace(next);
  return NextResponse.json({ ok: true, workspace: serializeWorkspace(saved) });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: workspaceId } = await params;
  const session = await requireSession(req);
  if (!session.ok) return session.response;
  if (!isSuperAdminGlobalRole(session.value.globalRole)) {
    return NextResponse.json(
      { ok: false, error: "Only a super admin can delete a workspace." },
      { status: 403 },
    );
  }
  const hit = await effectiveWorkspaceMembership(
    session.value.userId,
    session.value.globalRole,
    workspaceId,
  );
  if (!hit) {
    return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
  }
  await store.deleteWorkspace(workspaceId);
  return NextResponse.json({ ok: true });
}
