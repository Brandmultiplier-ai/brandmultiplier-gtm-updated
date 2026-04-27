import test from "node:test";
import assert from "node:assert/strict";

import { getStepAnchorTimestamp, isStepReady } from "./sequence-runner";
import type { Lead, SequenceStep } from "./types";

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead_1",
    workspaceId: "ws_default",
    campaignId: "cmp_1",
    providerId: "prov_1",
    name: "Test Lead",
    headline: "",
    company: "",
    location: "Italy",
    publicIdentifier: "test-lead",
    networkDistance: "SECOND",
    segment: "all",
    language: "it",
    aiScore: 3,
    signal: "keyword_search",
    status: "accepted",
    currentStep: 1,
    events: [],
    createdAt: "2026-03-23T00:00:00.000Z",
    updatedAt: "2026-03-23T00:00:00.000Z",
    ...overrides,
  };
}

test("accepted-trigger steps anchor on the first accepted event after invite", () => {
  const lead = baseLead({
    status: "accepted",
    currentStep: 1,
    events: [
      { ts: "2026-03-25T12:45:37.150Z", type: "invite_sent", step: 1, message: "Invite" },
      { ts: "2026-03-25T16:14:48.986Z", type: "accepted", message: "Accepted" },
      { ts: "2026-03-25T19:33:27.836Z", type: "accepted", message: "Duplicate accepted sync" },
    ],
  });
  const step: SequenceStep = {
    step: 2,
    type: "message",
    trigger: "accepted",
    delayDays: 1,
    content: "Step 2",
  };

  assert.equal(getStepAnchorTimestamp(lead, step), "2026-03-25T16:14:48.986Z");
  assert.equal(isStepReady(lead, step, Date.parse("2026-03-26T17:00:00.000Z")), true);
  assert.equal(isStepReady(lead, step, Date.parse("2026-03-26T15:00:00.000Z")), false);
});

test("no-reply steps anchor on the previous step message, not on later accepted syncs", () => {
  const lead = baseLead({
    status: "message_sent",
    currentStep: 2,
    events: [
      { ts: "2026-03-25T11:45:32.311Z", type: "invite_sent", step: 1, message: "Invite" },
      { ts: "2026-03-25T14:34:30.147Z", type: "accepted", message: "Accepted" },
      { ts: "2026-03-25T14:34:30.148Z", type: "message_sent", step: 2, message: "Step 2" },
      { ts: "2026-03-25T19:33:27.882Z", type: "accepted", message: "Duplicate accepted sync" },
    ],
  });
  const step: SequenceStep = {
    step: 3,
    type: "message",
    trigger: "no_reply",
    delayDays: 1,
    content: "Step 3",
  };

  assert.equal(getStepAnchorTimestamp(lead, step), "2026-03-25T14:34:30.148Z");
  assert.equal(isStepReady(lead, step, Date.parse("2026-03-26T15:00:00.000Z")), true);
});

test("manual override blocks future sequence steps even if status was not normalized yet", () => {
  const lead = baseLead({
    status: "accepted",
    currentStep: 1,
    events: [
      { ts: "2026-03-25T12:45:37.150Z", type: "invite_sent", step: 1, message: "Invite" },
      { ts: "2026-03-25T16:14:48.986Z", type: "accepted", message: "Accepted" },
      { ts: "2026-03-25T16:14:48.988Z", type: "skipped", message: "Sequence stopped after manual outbound message" },
      { ts: "2026-03-25T19:33:27.836Z", type: "accepted", message: "Duplicate accepted sync" },
    ],
  });
  const step: SequenceStep = {
    step: 2,
    type: "message",
    trigger: "accepted",
    delayDays: 1,
    content: "Step 2",
  };

  assert.equal(isStepReady(lead, step, Date.parse("2026-03-27T12:00:00.000Z")), false);
});
