import * as store from "./store";
import { getProviderConnection } from "./provider-connections";
import type { Campaign, LinkedInSeat, LinkedInSeatActiveDays, LinkedInSeatWarmup, Workspace } from "./types";
import { getAccount, getProfile, type UnipileClientOptions } from "./unipile";

export type LinkedInSeatQuotaKind = "invitations" | "messages" | "profileLookups";
export type LinkedInSeatQuotaSnapshot = {
  profileLookupsPerWeek: number;
  invitationsPerWeek: number;
  messagesPerWeek: number;
};

export interface LinkedInSeatWarmupState {
  enabled: boolean;
  stage: number;
  totalStages: number;
  factor: number;
  cleanDays: number;
  rampEveryDays: number;
  startedAt?: string;
  lastRateLimitedAt?: string;
  nextRampAt?: string;
  statusLabel: string;
  effectiveQuotas: LinkedInSeatQuotaSnapshot;
}

export const DEFAULT_LINKEDIN_SEAT_ACTIVE_DAYS: LinkedInSeatActiveDays = {
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
  saturday: false,
  sunday: false,
};

export const DEFAULT_LINKEDIN_SEAT_WARMUP: LinkedInSeatWarmup = {
  enabled: false,
  rampEveryDays: 2,
};

const WARMUP_STAGE_FACTORS = [0.3, 0.5, 0.75, 1] as const;

const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const SEAT_PROFILE_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const seatProfileCache = new Map<string, { expiresAt: number; value: Partial<LinkedInSeat> }>();

function cleanString(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const cleaned = cleanString(value);
    if (cleaned) return cleaned;
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function buildVectorImageUrl(image: unknown): string | undefined {
  const record = asRecord(image);
  if (!record) return undefined;

  const root = firstString(
    record.rootUrl,
    record.root_url,
    record['com.linkedin.common.VectorImage.rootUrl'],
  );
  const artifacts = asRecordArray(
    record.artifacts || record['com.linkedin.common.VectorImage.artifacts'],
  );
  if (!root || artifacts.length === 0) return undefined;

  const artifact = [...artifacts]
    .reverse()
    .find((item) => firstString(item.fileIdentifyingUrlPathSegment, item.file_identifying_url_path_segment));
  const segment = artifact
    ? firstString(artifact.fileIdentifyingUrlPathSegment, artifact.file_identifying_url_path_segment)
    : "";

  return root && segment ? `${root}${segment}` : undefined;
}

function extractNestedProfilePictureUrl(record: Record<string, unknown>): string {
  const direct = firstString(
    record.profile_picture_url,
    record.picture_url,
    record.avatar_url,
    record.image_url,
    record.photo_url,
    record.profilePictureUrl,
    record.pictureUrl,
    record.avatarUrl,
    record.imageUrl,
    record.url,
    record.secure_url,
  );
  if (direct) return direct;

  const nestedKeys = [
    "profile_picture",
    "profilePicture",
    "picture",
    "photo",
    "avatar",
    "image",
    "miniProfile",
    "mini_profile",
    "profile",
    "viewer",
  ];

  for (const key of nestedKeys) {
    const nested = asRecord(record[key]);
    if (!nested) continue;
    const nestedDirect = extractNestedProfilePictureUrl(nested);
    if (nestedDirect) return nestedDirect;
    const vectorUrl = buildVectorImageUrl(
      nested.vectorImage || nested.vector_image || nested.displayImage || nested.display_image || nested['displayImage~'],
    );
    if (vectorUrl) return vectorUrl;
  }

  return buildVectorImageUrl(
    record.vectorImage || record.vector_image || record.displayImage || record.display_image || record['displayImage~'],
  ) || "";
}

function extractSeatProfile(payload: unknown): Partial<LinkedInSeat> {
  const record = asRecord(payload);
  if (!record) return {};

  const candidates = [
    record,
    asRecord(record.user),
    asRecord(record.account),
    asRecord(record.profile),
    asRecord(record.data),
    asRecord(record.miniProfile),
    asRecord(record.mini_profile),
    ...asRecordArray(record.included),
  ].filter((item): item is Record<string, unknown> => Boolean(item));

  const publicIdentifier = firstString(
    ...candidates.flatMap((candidate) => [
      candidate.public_identifier,
      candidate.publicIdentifier,
      candidate.username,
      candidate.slug,
    ]),
  );
  const profileUrl = firstString(
    ...candidates.flatMap((candidate) => [
      candidate.profile_url,
      candidate.linkedin_url,
      candidate.public_url,
      candidate.url,
    ]),
    publicIdentifier ? `https://www.linkedin.com/in/${publicIdentifier}` : "",
  );

  return {
    profileName: firstString(
      ...candidates.flatMap((candidate) => [
        candidate.full_name,
        candidate.display_name,
        candidate.name,
        [cleanString(candidate.first_name), cleanString(candidate.last_name)].filter(Boolean).join(" "),
      ]),
    ),
    profilePictureUrl: firstString(
      ...candidates.map((candidate) => extractNestedProfilePictureUrl(candidate)),
    ),
    profileHeadline: firstString(
      ...candidates.flatMap((candidate) => [
        candidate.headline,
        candidate.occupation,
        candidate.title,
        candidate.position,
      ]),
    ),
    profilePublicIdentifier: publicIdentifier,
    profileUrl,
    profileSyncedAt: new Date().toISOString(),
  };
}

function isProviderThrottle(payload: unknown) {
  const record = asRecord(payload);
  if (!record) return false;
  const status = Number(record.status);
  const type = cleanString(record.type).toLowerCase();
  const title = cleanString(record.title).toLowerCase();
  const detail = cleanString(record.detail).toLowerCase();
  return status === 429
    || type.includes("too_many_requests")
    || title.includes("too many requests")
    || detail.includes("provider cannot accept any more requests");
}

function extractSeatAccountProfile(payload: unknown): Partial<LinkedInSeat> & { memberId?: string } {
  const record = asRecord(payload);
  if (!record) return {};

  const connectionParams = asRecord(record.connection_params);
  const instantMessaging = asRecord(connectionParams?.im);
  const publicIdentifier = firstString(
    instantMessaging?.publicIdentifier,
    instantMessaging?.public_identifier,
  );

  return {
    profileName: firstString(
      record.name,
      instantMessaging?.username,
      instantMessaging?.display_name,
    ),
    profilePublicIdentifier: publicIdentifier,
    profileUrl: publicIdentifier ? `https://www.linkedin.com/in/${publicIdentifier}` : "",
    profileSyncedAt: new Date().toISOString(),
    memberId: firstString(
      instantMessaging?.id,
      instantMessaging?.member_id,
      instantMessaging?.provider_id,
    ) || undefined,
  };
}

async function fetchSeatProfile(
  seat: LinkedInSeat,
  workspace: Workspace | null,
): Promise<Partial<LinkedInSeat>> {
  if (!seat.unipileAccountId) return {};

  const cacheKey = `${seat.workspaceId}:${seat.unipileAccountId}`;
  const cached = seatProfileCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const client = await resolveWorkspaceLinkedInClientConfig(workspace, seat);
  let accountProfile: Partial<LinkedInSeat> & { memberId?: string } = {};

  try {
    const account = await getAccount(seat.unipileAccountId, client as UnipileClientOptions);
    accountProfile = extractSeatAccountProfile(account);
    if (accountProfile.profileName || accountProfile.profileUrl) {
      seatProfileCache.set(cacheKey, {
        expiresAt: Date.now() + SEAT_PROFILE_CACHE_TTL_MS,
        value: {
          profileName: accountProfile.profileName,
          profilePublicIdentifier: accountProfile.profilePublicIdentifier,
          profileUrl: accountProfile.profileUrl,
          profileSyncedAt: accountProfile.profileSyncedAt,
        },
      });
    }
  } catch {
    // Keep account enrichment best-effort.
  }

  const identifiers = Array.from(new Set([
    accountProfile.memberId,
    "me",
  ].filter((value): value is string => Boolean(value))));

  for (const identifier of identifiers) {
    try {
      const profile = await getProfile(identifier, client as UnipileClientOptions);
      if (isProviderThrottle(profile)) {
        seatProfileCache.set(cacheKey, {
          expiresAt: Date.now() + 1000 * 60 * 60,
          value: {
            profileName: accountProfile.profileName,
            profilePublicIdentifier: accountProfile.profilePublicIdentifier,
            profileUrl: accountProfile.profileUrl,
            profileSyncedAt: accountProfile.profileSyncedAt,
          },
        });
        return {
          profileName: accountProfile.profileName,
          profilePublicIdentifier: accountProfile.profilePublicIdentifier,
          profileUrl: accountProfile.profileUrl,
          profileSyncedAt: accountProfile.profileSyncedAt,
        };
      }
      const parsed = extractSeatProfile(profile);
      if (parsed.profileName || parsed.profilePictureUrl || parsed.profileUrl) {
        const merged = {
          ...accountProfile,
          ...parsed,
        };
        seatProfileCache.set(cacheKey, {
          expiresAt: Date.now() + SEAT_PROFILE_CACHE_TTL_MS,
          value: merged,
        });
        return merged;
      }
    } catch {
      // Keep sender profile enrichment best-effort.
    }
  }

  seatProfileCache.set(cacheKey, {
    expiresAt: Date.now() + 1000 * 60 * 15,
    value: {
      profileName: accountProfile.profileName,
      profilePublicIdentifier: accountProfile.profilePublicIdentifier,
      profileUrl: accountProfile.profileUrl,
      profileSyncedAt: accountProfile.profileSyncedAt,
    },
  });
  return {
    profileName: accountProfile.profileName,
    profilePublicIdentifier: accountProfile.profilePublicIdentifier,
    profileUrl: accountProfile.profileUrl,
    profileSyncedAt: accountProfile.profileSyncedAt,
  };
}

function localParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  const year = Number(parts.year || "1970");
  const month = Number(parts.month || "01");
  const day = Number(parts.day || "01");
  const hour = Number(parts.hour || "00");
  const minute = Number(parts.minute || "00");
  const weekday = (parts.weekday || "monday").toLowerCase();
  const weekdayKey = WEEKDAY_KEYS.includes(weekday as typeof WEEKDAY_KEYS[number])
    ? weekday as typeof WEEKDAY_KEYS[number]
    : "monday";

  return {
    year,
    month,
    day,
    hour,
    minute,
    weekdayKey,
    dayKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function weekKeyFromDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map((part) => Number(part));
  const anchor = new Date(Date.UTC(year, month - 1, day, 12));
  const weekday = anchor.getUTCDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  anchor.setUTCDate(anchor.getUTCDate() + diff);
  return `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}-${String(anchor.getUTCDate()).padStart(2, "0")}`;
}

function dayKeyToIso(dayKey: string): string {
  return `${dayKey}T00:00:00.000Z`;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function activeDaysCount(days: LinkedInSeatActiveDays | undefined) {
  if (!days) return 5;
  return Math.max(1, Object.values(days).filter(Boolean).length);
}

function applyWarmupFactor(total: number, factor: number) {
  if (total <= 0) return 0;
  return Math.max(1, Math.round(total * factor));
}

function normalizeWarmupConfig(seat: LinkedInSeat): LinkedInSeatWarmup {
  const warmup = seat.schedule?.warmup;
  return {
    enabled: Boolean(warmup?.enabled),
    rampEveryDays: clampInteger(
      Number(warmup?.rampEveryDays || DEFAULT_LINKEDIN_SEAT_WARMUP.rampEveryDays),
      1,
      7,
    ),
    startedAt: typeof warmup?.startedAt === "string" && warmup.startedAt ? warmup.startedAt : undefined,
    lastRateLimitedAt: typeof warmup?.lastRateLimitedAt === "string" && warmup.lastRateLimitedAt
      ? warmup.lastRateLimitedAt
      : undefined,
  };
}

export function normalizeSeatUsage(seat: LinkedInSeat, now = new Date()): LinkedInSeat {
  const timezone = seat.schedule?.timezone || "Europe/Lisbon";
  const { dayKey } = localParts(now, timezone);
  const weekKey = weekKeyFromDayKey(dayKey);
  const usage = seat.usage || {
    weekKey,
    dayKey,
    invitationsUsed: 0,
    messagesUsed: 0,
    profileLookupsUsed: 0,
    prospectingRunsToday: 0,
  };

  const nextUsage = {
    ...usage,
    weekKey,
    dayKey,
  };

  if (usage.weekKey !== weekKey) {
    nextUsage.weekKey = weekKey;
    nextUsage.invitationsUsed = 0;
    nextUsage.messagesUsed = 0;
    nextUsage.profileLookupsUsed = 0;
  }

  if (usage.dayKey !== dayKey) {
    nextUsage.dayKey = dayKey;
    nextUsage.prospectingRunsToday = 0;
  }

  return {
    ...seat,
    schedule: {
      ...seat.schedule,
      warmup: normalizeWarmupConfig(seat),
    },
    usage: nextUsage,
  };
}

export function getSeatWarmupState(seat: LinkedInSeat, now = new Date()): LinkedInSeatWarmupState {
  const normalized = normalizeSeatUsage(seat, now);
  const warmup = normalizeWarmupConfig(normalized);
  const targetQuotas = normalized.quotas;

  if (!warmup.enabled) {
    return {
      enabled: false,
      stage: WARMUP_STAGE_FACTORS.length,
      totalStages: WARMUP_STAGE_FACTORS.length,
      factor: 1,
      cleanDays: 0,
      rampEveryDays: warmup.rampEveryDays,
      startedAt: warmup.startedAt,
      lastRateLimitedAt: warmup.lastRateLimitedAt,
      statusLabel: "Manual target",
      effectiveQuotas: { ...targetQuotas },
    };
  }

  const defaultAnchor = dayKeyToIso(normalized.usage.weekKey || localParts(now, normalized.schedule.timezone || "Europe/Lisbon").dayKey);
  const startedAtTs = warmup.startedAt && Number.isFinite(Date.parse(warmup.startedAt))
    ? Date.parse(warmup.startedAt)
    : Date.parse(defaultAnchor);
  const rateLimitedTs = warmup.lastRateLimitedAt && Number.isFinite(Date.parse(warmup.lastRateLimitedAt))
    ? Date.parse(warmup.lastRateLimitedAt)
    : Number.NEGATIVE_INFINITY;
  const anchorTs = Math.max(startedAtTs, rateLimitedTs);
  const anchorAt = new Date(anchorTs).toISOString();
  const cleanDays = Math.max(0, Math.floor((now.getTime() - anchorTs) / (1000 * 60 * 60 * 24)));
  const stage = Math.min(
    WARMUP_STAGE_FACTORS.length,
    Math.floor(cleanDays / warmup.rampEveryDays) + 1,
  );
  const factor = WARMUP_STAGE_FACTORS[stage - 1];
  const nextRampAt = stage < WARMUP_STAGE_FACTORS.length
    ? new Date(anchorTs + warmup.rampEveryDays * stage * 24 * 60 * 60 * 1000).toISOString()
    : undefined;

  return {
    enabled: true,
    stage,
    totalStages: WARMUP_STAGE_FACTORS.length,
    factor,
    cleanDays,
    rampEveryDays: warmup.rampEveryDays,
    startedAt: warmup.startedAt || anchorAt,
    lastRateLimitedAt: warmup.lastRateLimitedAt,
    nextRampAt,
    statusLabel: `Stage ${stage}/${WARMUP_STAGE_FACTORS.length}`,
    effectiveQuotas: {
      profileLookupsPerWeek: applyWarmupFactor(targetQuotas.profileLookupsPerWeek, factor),
      invitationsPerWeek: applyWarmupFactor(targetQuotas.invitationsPerWeek, factor),
      messagesPerWeek: applyWarmupFactor(targetQuotas.messagesPerWeek, factor),
    },
  };
}

export function seatEffectiveQuotas(seat: LinkedInSeat, now = new Date()) {
  const normalized = normalizeSeatUsage(seat, now);
  const warmupState = getSeatWarmupState(normalized, now);

  return {
    normalized,
    warmupState,
    quotas: warmupState.effectiveQuotas,
  };
}

export function seatDailyQuota(seat: LinkedInSeat, kind: LinkedInSeatQuotaKind, now = new Date()) {
  const { normalized, quotas } = seatEffectiveQuotas(seat, now);
  const total = kind === "invitations"
    ? quotas.invitationsPerWeek
    : kind === "messages"
      ? quotas.messagesPerWeek
      : quotas.profileLookupsPerWeek;

  if (total <= 0) return 0;
  return Math.max(1, Math.round(total / activeDaysCount(normalized.schedule.activeDays)));
}

export function serializeLinkedInSeat(seat: LinkedInSeat, now = new Date()) {
  const { normalized, quotas, warmupState } = seatEffectiveQuotas(seat, now);
  return {
    ...normalized,
    effectiveQuotas: quotas,
    effectiveDailyQuotas: {
      invitationsPerDay: seatDailyQuota(normalized, "invitations", now),
      messagesPerDay: seatDailyQuota(normalized, "messages", now),
      profileLookupsPerDay: seatDailyQuota(normalized, "profileLookups", now),
    },
    warmupState,
  };
}

export async function serializeLinkedInSeatWithProfile(
  seat: LinkedInSeat,
  workspace: Workspace | null,
  now = new Date(),
) {
  const serialized = serializeLinkedInSeat(seat, now);
  const profile = await fetchSeatProfile(serialized, workspace);
  return {
    ...serialized,
    ...profile,
  };
}

export async function serializeLinkedInSeatsWithProfile(
  seats: LinkedInSeat[],
  workspace: Workspace | null,
  now = new Date(),
) {
  return Promise.all(seats.map((seat) => serializeLinkedInSeatWithProfile(seat, workspace, now)));
}

export function seatLaunchTime(seat: LinkedInSeat, now = new Date()) {
  const normalized = normalizeSeatUsage(seat, now);
  const timezone = normalized.schedule.timezone || "Europe/Lisbon";
  const { hour, minute, dayKey } = localParts(now, timezone);
  const totalWindowMinutes = Math.max(0, normalized.schedule.randomizedLaunchWindowHours || 0) * 60;
  const launchOffsetMinutes = totalWindowMinutes > 0
    ? hashString(`${normalized.id}:${dayKey}`) % (totalWindowMinutes + 1)
    : 0;
  const launchHour = normalized.schedule.launchHour || 0;
  const launchMinutes = launchHour * 60 + launchOffsetMinutes;
  const currentMinutes = hour * 60 + minute;

  return {
    normalized,
    currentMinutes,
    launchMinutes,
    launchLabel: `${String(Math.floor(launchMinutes / 60)).padStart(2, "0")}:${String(launchMinutes % 60).padStart(2, "0")} (${timezone})`,
  };
}

export function seatQuotaUsage(seat: LinkedInSeat, kind: LinkedInSeatQuotaKind, now = new Date()) {
  const { normalized, quotas } = seatEffectiveQuotas(seat, now);
  const used = kind === "invitations"
    ? normalized.usage.invitationsUsed
    : kind === "messages"
      ? normalized.usage.messagesUsed
      : normalized.usage.profileLookupsUsed;
  const quota = kind === "invitations"
    ? quotas.invitationsPerWeek
    : kind === "messages"
      ? quotas.messagesPerWeek
      : quotas.profileLookupsPerWeek;

  return {
    normalized,
    used,
    quota,
    remaining: Math.max(0, quota - used),
  };
}

export function getSeatScheduleStatus(seat: LinkedInSeat, now = new Date()) {
  const { normalized, currentMinutes, launchMinutes, launchLabel } = seatLaunchTime(seat, now);
  const timezone = normalized.schedule.timezone || "Europe/Lisbon";
  const { weekdayKey } = localParts(now, timezone);
  const isActiveDay = Boolean(normalized.schedule.activeDays?.[weekdayKey]);

  if (normalized.status !== "active") {
    return {
      ok: false,
      seat: normalized,
      reason: "LinkedIn seat is paused.",
    };
  }

  if (!isActiveDay) {
    return {
      ok: false,
      seat: normalized,
      reason: `LinkedIn seat is inactive on ${weekdayKey}.`,
    };
  }

  if (currentMinutes < launchMinutes) {
    return {
      ok: false,
      seat: normalized,
      reason: `LinkedIn seat launches later today at ${launchLabel}.`,
    };
  }

  return {
    ok: true,
    seat: normalized,
    reason: "",
  };
}

export async function persistNormalizedSeat(seat: LinkedInSeat, now = new Date()) {
  const normalized = normalizeSeatUsage(seat, now);
  if (JSON.stringify(normalized.usage) === JSON.stringify(seat.usage)) {
    return normalized;
  }
  return store.saveLinkedInSeat(normalized);
}

export async function consumeSeatQuota(
  seat: LinkedInSeat,
  kind: LinkedInSeatQuotaKind,
  count = 1,
  now = new Date(),
) {
  const normalized = normalizeSeatUsage(seat, now);
  const usage = { ...normalized.usage };

  if (kind === "invitations") {
    usage.invitationsUsed += count;
    usage.lastInviteAt = now.toISOString();
  } else if (kind === "messages") {
    usage.messagesUsed += count;
    usage.lastMessageAt = now.toISOString();
  } else {
    usage.profileLookupsUsed += count;
    usage.lastProfileLookupAt = now.toISOString();
  }

  return store.saveLinkedInSeat({
    ...normalized,
    usage,
  });
}

export async function recordSeatWarmupRateLimit(seat: LinkedInSeat, now = new Date()) {
  const normalized = normalizeSeatUsage(seat, now);
  const warmup = normalizeWarmupConfig(normalized);

  if (!warmup.enabled) {
    return normalized;
  }

  return store.saveLinkedInSeat({
    ...normalized,
    schedule: {
      ...normalized.schedule,
      warmup: {
        ...warmup,
        startedAt: warmup.startedAt || dayKeyToIso(normalized.usage.weekKey),
        lastRateLimitedAt: now.toISOString(),
      },
    },
  });
}

export async function markSeatProspectingRun(seat: LinkedInSeat, now = new Date()) {
  const normalized = normalizeSeatUsage(seat, now);
  return store.saveLinkedInSeat({
    ...normalized,
    usage: {
      ...normalized.usage,
      prospectingRunsToday: (normalized.usage.prospectingRunsToday || 0) + 1,
      lastProspectingAt: now.toISOString(),
    },
  });
}

export async function resolveLinkedInSeatForCampaign(campaign: Campaign, workspaceId?: string): Promise<LinkedInSeat | null> {
  const seats = (await store.listLinkedInSeats(workspaceId || campaign.workspaceId))
    .map((seat) => normalizeSeatUsage(seat))
    .filter((seat) => seat.status === "active");

  if (seats.length === 0) return null;
  if (campaign.linkedinSeatId) {
    const matched = seats.find((seat) => seat.id === campaign.linkedinSeatId);
    if (matched) return matched;
  }
  return seats.find((seat) => seat.isDefault) || seats[0];
}

export function defaultLinkedInSeat(workspace: Workspace, fallbackAccountId?: string): LinkedInSeat | null {
  const accountId = workspace.channels.linkedin?.unipileAccountId || fallbackAccountId || "";
  if (!accountId) return null;

  const now = new Date();
  const dayKey = localParts(now, "Europe/Lisbon").dayKey;
  const weekKey = weekKeyFromDayKey(dayKey);

  return {
    id: `seat_${workspace.id}`,
    workspaceId: workspace.id,
    name: "Primary LinkedIn Seat",
    status: "active",
    country: "Portugal",
    unipileAccountId: accountId,
    isDefault: true,
    quotas: {
      profileLookupsPerWeek: 30,
      invitationsPerWeek: 35,
      messagesPerWeek: 70,
    },
    schedule: {
      timezone: "Europe/Lisbon",
      launchHour: 15,
      randomizedLaunchWindowHours: 4,
      activeDays: { ...DEFAULT_LINKEDIN_SEAT_ACTIVE_DAYS },
      warmup: {
        ...DEFAULT_LINKEDIN_SEAT_WARMUP,
        enabled: true,
        startedAt: dayKeyToIso(weekKey),
      },
    },
    usage: {
      weekKey,
      dayKey,
      invitationsUsed: 0,
      messagesUsed: 0,
      profileLookupsUsed: 0,
      prospectingRunsToday: 0,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function getWorkspaceLinkedInClientConfig(workspace: Workspace | null, seat: LinkedInSeat | null) {
  return {
    accountId: seat?.unipileAccountId || workspace?.channels.linkedin?.unipileAccountId,
    apiKey: workspace?.channels.linkedin?.unipileApiKey,
    baseUrl: workspace?.channels.linkedin?.unipileBaseUrl,
  };
}

/**
 * Resolves Unipile credentials, preferring a first-class provider connection
 * when the seat is linked, then workspace channel config.
 */
export async function resolveWorkspaceLinkedInClientConfig(
  workspace: Workspace | null,
  seat: LinkedInSeat | null,
): Promise<{
  accountId: string | undefined;
  apiKey: string | undefined;
  baseUrl: string | undefined;
}> {
  if (seat?.providerConnectionId && seat.workspaceId) {
    const conn = await getProviderConnection(seat.providerConnectionId, seat.workspaceId);
    if (conn) {
      return {
        accountId: seat.unipileAccountId,
        apiKey: conn.unipileApiKey,
        baseUrl: conn.unipileBaseUrl,
      };
    }
  }
  return getWorkspaceLinkedInClientConfig(workspace, seat);
}
