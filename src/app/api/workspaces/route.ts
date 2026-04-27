import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import type { Workspace } from "@/lib/types";
import { requireSession } from "@/lib/auth/resolve-session";
import { listWorkspaceMembershipsForUser, setWorkspaceMembership } from "@/lib/app-auth-persistence";

function serializeWorkspace(workspace: Workspace) {
  return {
    ...workspace,
    channels: {
      linkedin: workspace.channels.linkedin ? { configured: true } : undefined,
      email: workspace.channels.email
        ? { configured: true, provider: workspace.channels.email.provider }
        : undefined,
    },
  };
}

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (!session.ok) return session.response;
  const memberships = await listWorkspaceMembershipsForUser(session.value.userId);
  const workspaces: Workspace[] = [];
  for (const m of memberships) {
    const w = await store.getWorkspace(m.workspaceId);
    if (w) workspaces.push(w);
  }
  return NextResponse.json({ workspaces: workspaces.map(serializeWorkspace) });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (!session.ok) return session.response;
  const body = await req.json().catch(() => ({}));

  const workspace: Workspace = {
    id: body.id || "",
    name: body.name || "Untitled Workspace",
    slug: body.slug || "",
    status: body.status || "active",
    niche: body.niche || "general",
    defaultLanguage: body.defaultLanguage || "en",
    channels: body.channels || {},
    createdAt: body.createdAt || "",
    updatedAt: "",
  };

  const saved = await store.saveWorkspace(workspace);
  await setWorkspaceMembership(session.value.userId, saved.id, "owner");
  return NextResponse.json({ ok: true, workspace: serializeWorkspace(saved) });
}
