import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/resolve-session";
import { listWorkspaceMembershipsForUser } from "@/lib/app-auth-persistence";
import { getAppUserById, updateAppUserProfile } from "@/lib/app-auth-persistence";
import { BM_GTM_ACTIVE_WORKSPACE_COOKIE } from "@/lib/auth/cookie-names";
import { normalizeLinkedInProfileUrlInput } from "@/lib/linkedin-account-url";
import type { AppUser } from "@/lib/types";

function mergeAppUserProfilePatch(
  prev: AppUser["profileSettings"],
  incoming: Record<string, unknown>,
): { ok: true; value: AppUser["profileSettings"] } | { ok: false; error: string } {
  const next: Record<string, unknown> = { ...(prev || {}) };

  const mergeStringKey = (key: string) => {
    if (!(key in incoming)) return;
    const v = incoming[key];
    if (typeof v !== "string") return;
    const t = v.trim();
    if (t) next[key] = t;
    else delete next[key];
  };

  mergeStringKey("title");
  mergeStringKey("phone");
  mergeStringKey("timezone");

  if ("linkedinProfileUrl" in incoming) {
    const v = incoming.linkedinProfileUrl;
    if (typeof v === "string") {
      const t = v.trim();
      if (!t) {
        delete next.linkedinProfileUrl;
        delete next.linkedinPublicIdentifier;
      } else {
        const normalized = normalizeLinkedInProfileUrlInput(t);
        if (!normalized) {
          return { ok: false, error: "Invalid LinkedIn profile URL" };
        }
        next.linkedinProfileUrl = normalized.url;
        next.linkedinPublicIdentifier = normalized.publicIdentifier;
      }
    }
  }

  return { ok: true, value: next as AppUser["profileSettings"] };
}

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
      globalRole: user.globalRole === "super admin" ? "super admin" : "member",
      profileSettings: user.profileSettings || {},
    },
    memberships,
    activeWorkspaceId: getActiveWorkspaceId(req),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession(req);
  if (!session.ok) return session.response;

  const existingUser = await getAppUserById(session.value.userId);
  if (!existingUser) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    displayName?: string;
    profileSettings?: Record<string, unknown>;
  };

  let nextProfile = existingUser.profileSettings || {};
  if (body.profileSettings && typeof body.profileSettings === "object") {
    const merged = mergeAppUserProfilePatch(existingUser.profileSettings, body.profileSettings);
    if (!merged.ok) {
      return NextResponse.json({ error: merged.error }, { status: 400 });
    }
    nextProfile = merged.value || {};
  }

  const user = await updateAppUserProfile(session.value.userId, {
    displayName: typeof body.displayName === "string"
      ? body.displayName.trim()
      : existingUser.displayName,
    profileSettings: nextProfile,
  });
  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      globalRole: user.globalRole === "super admin" ? "super admin" : "member",
      profileSettings: user.profileSettings || {},
    },
  });
}
