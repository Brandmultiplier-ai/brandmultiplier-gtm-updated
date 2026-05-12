import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import type { Workspace } from "@/lib/types";
import { requireSession } from "@/lib/auth/resolve-session";
import { listWorkspaceMembershipsForUser, setWorkspaceMembership } from "@/lib/app-auth-persistence";
import { canManageWorkspaceSettings, requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";
import { DEFAULT_BRANDMULTIPLIER_WORKSPACE_ID } from "@/lib/default-workspace";

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

  if (session.value.globalRole === "super admin") {
    const memberships = await listWorkspaceMembershipsForUser(session.value.userId);
    if (memberships.length === 0) {
      const hub = await store.getWorkspace(DEFAULT_BRANDMULTIPLIER_WORKSPACE_ID);
      if (hub) {
        await setWorkspaceMembership(session.value.userId, hub.id, "workspace admin");
      }
    }
    const all = await store.listWorkspaces();
    const sorted = [...all].sort((a, b) => {
      if (a.id === DEFAULT_BRANDMULTIPLIER_WORKSPACE_ID) return -1;
      if (b.id === DEFAULT_BRANDMULTIPLIER_WORKSPACE_ID) return 1;
      return 0;
    });
    return NextResponse.json({
      workspaces: sorted.map(serializeWorkspace),
      superAdmin: true,
    });
  }

  const memberships = await listWorkspaceMembershipsForUser(session.value.userId);
  const workspaces: Workspace[] = [];
  for (const m of memberships) {
    const w = await store.getWorkspace(m.workspaceId);
    if (w) workspaces.push(w);
  }
  return NextResponse.json({ workspaces: workspaces.map(serializeWorkspace), superAdmin: false });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (!session.ok) return session.response;

  if (session.value.globalRole !== "super admin") {
    return NextResponse.json(
      {
        ok: false,
        error: "Only a super admin can create a new workspace. Ask your super admin or use an invite link to join an existing workspace.",
      },
      { status: 403 },
    );
  }

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
  await setWorkspaceMembership(session.value.userId, saved.id, "workspace admin");
  return NextResponse.json({ ok: true, workspace: serializeWorkspace(saved) });
}

export async function PATCH(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);
  if (!$wsa.ok) return $wsa.response;
  if (!canManageWorkspaceSettings($wsa.value.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const existing = await store.getWorkspace($wsa.value.workspaceId);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({})) as Partial<Workspace>;
  const profileSettings = body.profileSettings && typeof body.profileSettings === "object"
    ? {
        companyName: typeof body.profileSettings.companyName === "string" ? body.profileSettings.companyName.trim() : undefined,
        website: typeof body.profileSettings.website === "string" ? body.profileSettings.website.trim() : undefined,
        industry: typeof body.profileSettings.industry === "string" ? body.profileSettings.industry.trim() : undefined,
        size: typeof body.profileSettings.size === "string" ? body.profileSettings.size.trim() : undefined,
        description: typeof body.profileSettings.description === "string" ? body.profileSettings.description.trim() : undefined,
        brandVoice: typeof body.profileSettings.brandVoice === "string" ? body.profileSettings.brandVoice.trim() : undefined,
      }
    : existing.profileSettings;

  const saved = await store.saveWorkspace({
    ...existing,
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : existing.name,
    niche: typeof body.niche === "string" && body.niche.trim() ? body.niche.trim() : existing.niche,
    defaultLanguage: body.defaultLanguage === "it" || body.defaultLanguage === "en"
      ? body.defaultLanguage
      : existing.defaultLanguage,
    profileSettings,
  });

  return NextResponse.json({ ok: true, workspace: serializeWorkspace(saved) });
}
