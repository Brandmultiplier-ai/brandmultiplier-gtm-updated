import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import {
  DEFAULT_LINKEDIN_SEAT_WARMUP,
  normalizeSeatUsage,
  serializeLinkedInSeatWithProfile,
} from "@/lib/linkedin-seats";
import { requireAppWorkspaceRead } from "@/lib/auth/resolve-app-workspace";

type Params = { params: Promise<{ id: string }> };

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function dayKeyToIso(dayKey: string, now = new Date()) {
  return dayKey ? `${dayKey}T00:00:00.000Z` : now.toISOString();
}

function sanitizeWarmup(
  candidate: unknown,
  existing: NonNullable<ReturnType<typeof normalizeSeatUsage>["schedule"]["warmup"]>,
  usage: ReturnType<typeof normalizeSeatUsage>["usage"],
  now = new Date(),
) {
  const raw = candidate && typeof candidate === "object"
    ? candidate as Record<string, unknown>
    : {};
  const enabled = raw.enabled === undefined ? Boolean(existing.enabled) : Boolean(raw.enabled);
  const hadUsage = (usage.invitationsUsed + usage.messagesUsed + usage.profileLookupsUsed) > 0;
  const wasDisabled = !existing.enabled && enabled;

  return {
    enabled,
    rampEveryDays: clampInteger(
      Number(raw.rampEveryDays ?? existing.rampEveryDays ?? DEFAULT_LINKEDIN_SEAT_WARMUP.rampEveryDays),
      1,
      7,
    ),
    startedAt: typeof raw.startedAt === "string" && raw.startedAt
      ? raw.startedAt
      : enabled
        ? (wasDisabled
            ? (hadUsage ? dayKeyToIso(usage.weekKey, now) : now.toISOString())
            : (existing.startedAt || (hadUsage ? dayKeyToIso(usage.weekKey, now) : now.toISOString())))
        : existing.startedAt,
    lastRateLimitedAt: typeof raw.lastRateLimitedAt === "string" && raw.lastRateLimitedAt
      ? raw.lastRateLimitedAt
      : existing.lastRateLimitedAt,
  };
}

export async function PUT(req: NextRequest, { params }: Params) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const { id } = await params;
  const existing = await store.getLinkedInSeat(id, workspaceId);

  if (!existing) {
    return NextResponse.json({ error: "LinkedIn seat not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const normalizedExisting = normalizeSeatUsage(existing);
  const nextUsage = body.usage ? { ...normalizedExisting.usage, ...body.usage } : normalizedExisting.usage;
  const saved = await store.saveLinkedInSeat(normalizeSeatUsage({
    id,
    workspaceId,
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : normalizedExisting.name,
    status: body.status === "paused" ? "paused" : body.status === "active" ? "active" : normalizedExisting.status,
    country: typeof body.country === "string" ? body.country : normalizedExisting.country,
    unipileAccountId: typeof body.unipileAccountId === "string" && body.unipileAccountId
      ? body.unipileAccountId
      : normalizedExisting.unipileAccountId,
    isDefault: typeof body.isDefault === "boolean" ? body.isDefault : normalizedExisting.isDefault,
    quotas: {
      ...normalizedExisting.quotas,
      ...(body.quotas || {}),
    },
    schedule: {
      ...normalizedExisting.schedule,
      ...(body.schedule || {}),
      activeDays: {
        ...normalizedExisting.schedule.activeDays,
        ...(body.schedule?.activeDays || {}),
      },
      warmup: sanitizeWarmup(body.schedule?.warmup, normalizedExisting.schedule.warmup || DEFAULT_LINKEDIN_SEAT_WARMUP, nextUsage),
    },
    usage: nextUsage,
    createdAt: normalizedExisting.createdAt,
    updatedAt: normalizedExisting.updatedAt,
  }));

  const workspace = await store.getWorkspace(workspaceId);
  return NextResponse.json({ ok: true, seat: await serializeLinkedInSeatWithProfile(saved, workspace) });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const $wsa = await requireAppWorkspaceRead(req);

  if (!$wsa.ok) return $wsa.response;

  const workspaceId = $wsa.value.workspaceId;
  const { id } = await params;
  const existing = await store.getLinkedInSeat(id, workspaceId);

  if (!existing) {
    return NextResponse.json({ error: "LinkedIn seat not found" }, { status: 404 });
  }

  await store.deleteLinkedInSeat(id, workspaceId);
  return NextResponse.json({ ok: true });
}
