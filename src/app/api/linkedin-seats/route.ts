import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import type { LinkedInSeat } from "@/lib/types";
import {
  DEFAULT_LINKEDIN_SEAT_WARMUP,
  normalizeSeatUsage,
  serializeLinkedInSeatWithProfile,
  serializeLinkedInSeatsWithProfile,
} from "@/lib/linkedin-seats";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function dayKeyToIso(dayKey: string, now = new Date()) {
  return dayKey ? `${dayKey}T00:00:00.000Z` : now.toISOString();
}

function sanitizeWarmup(
  candidate: unknown,
  usage: LinkedInSeat["usage"],
  existing?: LinkedInSeat["schedule"]["warmup"],
  now = new Date(),
) {
  const raw = candidate && typeof candidate === "object"
    ? candidate as Record<string, unknown>
    : {};
  const current = existing || DEFAULT_LINKEDIN_SEAT_WARMUP;
  const enabled = raw.enabled === undefined ? Boolean(current.enabled) : Boolean(raw.enabled);
  const hadUsage = (usage.invitationsUsed + usage.messagesUsed + usage.profileLookupsUsed) > 0;
  const startedAt = typeof raw.startedAt === "string" && raw.startedAt
    ? raw.startedAt
    : enabled
      ? (current.startedAt || (hadUsage ? dayKeyToIso(usage.weekKey, now) : now.toISOString()))
      : current.startedAt;

  return {
    enabled,
    rampEveryDays: clampInteger(
      Number(raw.rampEveryDays ?? current.rampEveryDays ?? DEFAULT_LINKEDIN_SEAT_WARMUP.rampEveryDays),
      1,
      7,
    ),
    startedAt,
    lastRateLimitedAt: typeof raw.lastRateLimitedAt === "string" && raw.lastRateLimitedAt
      ? raw.lastRateLimitedAt
      : current.lastRateLimitedAt,
  };
}

export async function GET(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const [workspace, seats] = await Promise.all([
    store.getWorkspace(workspaceId),
    store.listLinkedInSeats(workspaceId),
  ]);
  return NextResponse.json({ seats: await serializeLinkedInSeatsWithProfile(seats, workspace) });
}

export async function POST(req: NextRequest) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const body = await req.json().catch(() => ({}));
  const usage = {
    weekKey: "",
    dayKey: "",
    invitationsUsed: 0,
    messagesUsed: 0,
    profileLookupsUsed: 0,
    prospectingRunsToday: 0,
    ...(body.usage || {}),
  };

  const seat: LinkedInSeat = {
    id: body.id || "",
    workspaceId,
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : "LinkedIn Seat",
    status: body.status === "paused" ? "paused" : "active",
    country: typeof body.country === "string" ? body.country : "",
    unipileAccountId: typeof body.unipileAccountId === "string" ? body.unipileAccountId : "",
    isDefault: Boolean(body.isDefault),
    quotas: {
      profileLookupsPerWeek: Number(body.quotas?.profileLookupsPerWeek || 0),
      invitationsPerWeek: Number(body.quotas?.invitationsPerWeek || 0),
      messagesPerWeek: Number(body.quotas?.messagesPerWeek || 0),
    },
    schedule: {
      timezone: typeof body.schedule?.timezone === "string" && body.schedule.timezone
        ? body.schedule.timezone
        : "Europe/Lisbon",
      launchHour: Math.max(0, Math.min(23, Number(body.schedule?.launchHour || 0))),
      randomizedLaunchWindowHours: Math.max(0, Math.min(8, Number(body.schedule?.randomizedLaunchWindowHours || 4))),
      activeDays: {
        monday: Boolean(body.schedule?.activeDays?.monday),
        tuesday: Boolean(body.schedule?.activeDays?.tuesday),
        wednesday: Boolean(body.schedule?.activeDays?.wednesday),
        thursday: Boolean(body.schedule?.activeDays?.thursday),
        friday: Boolean(body.schedule?.activeDays?.friday),
        saturday: Boolean(body.schedule?.activeDays?.saturday),
        sunday: Boolean(body.schedule?.activeDays?.sunday),
      },
      warmup: sanitizeWarmup(body.schedule?.warmup, usage),
    },
    usage,
    createdAt: body.createdAt || "",
    updatedAt: "",
  };

  if (!seat.unipileAccountId) {
    return NextResponse.json({ error: "unipileAccountId is required" }, { status: 400 });
  }

  const [workspace, saved] = await Promise.all([
    store.getWorkspace(workspaceId),
    store.saveLinkedInSeat(normalizeSeatUsage(seat)),
  ]);
  return NextResponse.json({ ok: true, seat: await serializeLinkedInSeatWithProfile(saved, workspace) });
}
