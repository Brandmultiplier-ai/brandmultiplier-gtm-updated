import test from "node:test";
import assert from "node:assert/strict";

import { reconcileSequenceProgressFromEvents } from "./sequence-progress";
import type { Campaign, Lead } from "./types";

const baseCampaign: Campaign = {
  id: "cmp_test",
  workspaceId: "ws_default",
  agentId: "agt_test",
  name: "Test Campaign",
  status: "active",
  segment: "test",
  search: {
    keywords: "test",
    titleFilter: "",
    language: "en",
    locations: [],
  },
  sequence: [
    { step: 1, type: "connection_request", delayDays: 0, trigger: "immediate", content: "Invite" },
    { step: 2, type: "message", delayDays: 1, trigger: "accepted", content: "Step 2" },
    { step: 3, type: "message", delayDays: 2, trigger: "no_reply", content: "Step 3" },
  ],
  createdAt: "2026-03-20T00:00:00.000Z",
  updatedAt: "2026-03-20T00:00:00.000Z",
};

function makeLead(partial: Partial<Lead>): Lead {
  return {
    id: "lead_test",
    workspaceId: "ws_default",
    campaignId: "cmp_test",
    providerId: "prov_test",
    name: "Test Lead",
    headline: "",
    company: "",
    location: "London",
    publicIdentifier: "test-lead",
    networkDistance: "OUT_OF_NETWORK",
    segment: "test",
    language: "en",
    aiScore: 3,
    signal: "keyword_search",
    status: "accepted",
    currentStep: 1,
    events: [],
    createdAt: "2026-03-20T00:00:00.000Z",
    updatedAt: "2026-03-20T00:00:00.000Z",
    ...partial,
  };
}

test("manual message after invite infers acceptance and stops the sequence", () => {
  const lead = makeLead({
    status: "invite_sent",
    currentStep: 1,
    events: [
      { ts: "2026-03-20T09:00:00.000Z", type: "invite_sent", message: "Invite sent" },
      { ts: "2026-03-21T10:00:00.000Z", type: "message_sent", message: "Manual follow-up" },
    ],
  });

  const result = reconcileSequenceProgressFromEvents(lead, baseCampaign);

  assert.equal(result.changed, true);
  assert.equal(result.inferredAccepted, true);
  assert.equal(result.manualOverride, true);
  assert.equal(result.lead.currentStep, 1);
  assert.equal(result.lead.status, "manual_override");
  assert.equal(result.lead.events.filter((event) => event.type === "accepted").length, 1);
  assert.equal(
    result.lead.events.find((event) => event.type === "message_sent" && event.message === "Manual follow-up")?.step,
    undefined
  );
});

test("manual message after reply does not stop an already replied lead again", () => {
  const lead = makeLead({
    status: "replied",
    currentStep: 1,
    events: [
      { ts: "2026-03-20T09:00:00.000Z", type: "invite_sent", message: "Invite sent" },
      { ts: "2026-03-21T09:00:00.000Z", type: "accepted", message: "Accepted" },
      { ts: "2026-03-21T10:00:00.000Z", type: "replied", message: "Interested" },
      { ts: "2026-03-21T10:30:00.000Z", type: "message_sent", message: "Manual response" },
    ],
  });

  const result = reconcileSequenceProgressFromEvents(lead, baseCampaign);

  assert.equal(result.manualOverride, false);
  assert.equal(result.lead.currentStep, 1);
  assert.equal(result.lead.status, "replied");
  assert.equal(
    result.lead.events.find((event) => event.type === "message_sent" && event.message === "Manual response")?.step,
    undefined
  );
});

test("manual message after automated step still stops future automation", () => {
  const lead = makeLead({
    status: "message_sent",
    currentStep: 2,
    events: [
      { ts: "2026-03-20T09:00:00.000Z", type: "invite_sent", message: "Invite sent" },
      { ts: "2026-03-21T09:00:00.000Z", type: "accepted", message: "Accepted" },
      { ts: "2026-03-22T09:00:00.000Z", type: "message_sent", step: 2, message: "Automated step 2" },
      { ts: "2026-03-24T09:00:00.000Z", type: "message_sent", message: "Manual step 3" },
    ],
  });

  const result = reconcileSequenceProgressFromEvents(lead, baseCampaign);

  assert.equal(result.manualOverride, true);
  assert.equal(result.lead.currentStep, 2);
  assert.equal(result.lead.status, "manual_override");
  assert.equal(
    result.lead.events.find((event) => event.type === "message_sent" && event.message === "Manual step 3")?.step,
    undefined
  );
});
