import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/resolve-session";
import { listWorkspaceMembershipsForUser } from "@/lib/app-auth-persistence";
import { getAppUserById, updateAppUserProfile } from "@/lib/app-auth-persistence";
import { BM_GTM_ACTIVE_WORKSPACE_COOKIE } from "@/lib/auth/cookie-names";

function getActiveWorkspaceId(req: NextRequest): string | null {
  return req.cookies.get(BM_GTM_ACTIVE_WORKSPACE_COOKIE)?.value?.trim() || null;
}

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (!session.ok) return session.response;
  const user = await getAppUserById(session.value.userId);
  if (!user) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 401 });
  }
  const memberships = await listWorkspaceMembershipsForUser(user.id);
  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      profileSettings: user.profileSettings || {},
    },
    memberships,
    activeWorkspaceId: getActiveWorkspaceId(req),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession(req);
  if (!session.ok) return session.response;

  const body = await req.json().catch(() => ({})) as {
    displayName?: string;
    profileSettings?: Record<string, unknown>;
  };
  const user = await updateAppUserProfile(session.value.userId, {
    displayName: typeof body.displayName === "string" ? body.displayName.trim() : undefined,
    profileSettings: body.profileSettings && typeof body.profileSettings === "object"
      ? {
          title: typeof body.profileSettings.title === "string" ? body.profileSettings.title : undefined,
          phone: typeof body.profileSettings.phone === "string" ? body.profileSettings.phone : undefined,
          timezone: typeof body.profileSettings.timezone === "string" ? body.profileSettings.timezone : undefined,
        }
      : {},
  });
  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      profileSettings: user.profileSettings || {},
    },
  });
}
