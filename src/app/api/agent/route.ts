import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import type { Agent } from "@/lib/types";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

export async function GET(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const agents = await store.listAgents(workspaceId);
  return NextResponse.json({ agents });
}

export async function POST(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const body = await req.json();
  // If updating existing agent, preserve id
  const existing = body.id ? await store.getAgent(body.id, workspaceId) : null;
  const defaultSignals: Agent["signals"] = {
    personalProfile: "",
    companyPage: "",
    trackProfileVisitors: false,
    trackCompanyFollowers: false,
    selectedTopics: [],
    engagementKeywords: [],
    watchProfiles: [],
    neverTargetProfiles: [],
    triggerEvents: { topActiveProfiles: false, recentFunding: false, jobChanges: false },
    competitorPages: [],
  };
  const nextSignals = body.signals && typeof body.signals === "object" ? body.signals : {};
  const existingSignals = existing?.signals || defaultSignals;

  if (body.id && !existing && await store.getAgent(body.id)) {
    return NextResponse.json({ error: "Agent not found in workspace" }, { status: 404 });
  }

  const agent: Agent = {
    id: body.id || existing?.id || "",
    workspaceId,
    name: body.name || existing?.name || "Unnamed Agent",
    status: body.status || existing?.status || "active",
    createdAt: existing?.createdAt || "",
    updatedAt: "",
    icp: body.icp || existing?.icp || {
      jobTitles: [],
      locations: [],
      industries: [],
      companySizes: [],
      excludeKeywords: [],
      matchingMode: "discovery",
    },
    signals: {
      ...defaultSignals,
      ...existingSignals,
      ...nextSignals,
      triggerEvents: {
        ...defaultSignals.triggerEvents,
        ...(existingSignals.triggerEvents || {}),
        ...(nextSignals.triggerEvents || {}),
      },
    },
    voice: body.voice || existing?.voice || {
      it: { tone: "diretto, colloquiale", constraints: [] },
      en: { tone: "direct, friendly", constraints: [] },
    },
    limits: body.limits || existing?.limits || {
      invitesPerDay: 20,
      invitesPerWeek: 100,
      delayBetweenInvitesMs: 30000,
      maxMessageLength: 200,
      activeHoursStart: 9,
      activeHoursEnd: 17,
      minDelayMs: 600000,
      maxDelayMs: 1800000,
    },
    messageTemplates: body.messageTemplates || existing?.messageTemplates || {},
  };

  const saved = await store.saveAgent(agent);
  return NextResponse.json({ ok: true, agent: saved });
}

export async function DELETE(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const body = await req.json().catch(() => ({})) as { id?: string };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const agent = await store.getAgent(id, workspaceId);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found in workspace" }, { status: 404 });
  }

  await store.deleteAgent(id);
  return NextResponse.json({ ok: true });
}
