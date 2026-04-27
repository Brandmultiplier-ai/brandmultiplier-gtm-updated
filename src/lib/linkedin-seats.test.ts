import test from "node:test";
import assert from "node:assert/strict";

import { getSeatWarmupState, seatDailyQuota } from "./linkedin-seats";
import type { LinkedInSeat } from "./types";

function buildSeat(overrides: Partial<LinkedInSeat> = {}): LinkedInSeat {
  return {
    id: "seat_test",
    workspaceId: "ws_test",
    name: "Test Seat",
    status: "active",
    country: "Portugal",
    unipileAccountId: "acc_test",
    isDefault: true,
    quotas: {
      profileLookupsPerWeek: 30,
      invitationsPerWeek: 40,
      messagesPerWeek: 80,
    },
    schedule: {
      timezone: "Europe/Lisbon",
      launchHour: 10,
      randomizedLaunchWindowHours: 4,
      activeDays: {
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: false,
        sunday: false,
      },
      warmup: {
        enabled: true,
        rampEveryDays: 2,
        startedAt: "2026-03-24T00:00:00.000Z",
      },
    },
    usage: {
      weekKey: "2026-03-23",
      dayKey: "2026-03-27",
      invitationsUsed: 0,
      messagesUsed: 0,
      profileLookupsUsed: 0,
      prospectingRunsToday: 0,
    },
    createdAt: "2026-03-24T00:00:00.000Z",
    updatedAt: "2026-03-24T00:00:00.000Z",
    ...overrides,
  };
}

test("warmup ramps effective quotas by clean-day stage", () => {
  const seat = buildSeat();
  const state = getSeatWarmupState(seat, new Date("2026-03-27T12:00:00.000Z"));

  assert.equal(state.enabled, true);
  assert.equal(state.stage, 2);
  assert.equal(state.effectiveQuotas.invitationsPerWeek, 20);
  assert.equal(state.effectiveQuotas.messagesPerWeek, 40);
  assert.equal(state.effectiveQuotas.profileLookupsPerWeek, 15);
  assert.equal(seatDailyQuota(seat, "invitations", new Date("2026-03-27T12:00:00.000Z")), 4);
});

test("warmup resets back to stage one after a fresh rate limit", () => {
  const seat = buildSeat({
    schedule: {
      timezone: "Europe/Lisbon",
      launchHour: 10,
      randomizedLaunchWindowHours: 4,
      activeDays: {
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: false,
        sunday: false,
      },
      warmup: {
        enabled: true,
        rampEveryDays: 2,
        startedAt: "2026-03-20T00:00:00.000Z",
        lastRateLimitedAt: "2026-03-27T08:00:00.000Z",
      },
    },
  });

  const state = getSeatWarmupState(seat, new Date("2026-03-27T12:00:00.000Z"));
  assert.equal(state.stage, 1);
  assert.equal(state.effectiveQuotas.invitationsPerWeek, 12);
  assert.equal(state.nextRampAt, "2026-03-29T08:00:00.000Z");
});
