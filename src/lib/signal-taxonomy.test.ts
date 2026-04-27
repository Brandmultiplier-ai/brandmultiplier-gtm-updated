import test from "node:test";
import assert from "node:assert/strict";

import { buildNormalizedSignal } from "./signal-taxonomy";

test("buildNormalizedSignal maps watched profile engagement to profile family", () => {
  const signal = buildNormalizedSignal({
    signalSource: "post_engagement",
    signalContext: 'Commented on watched profile\'s post: "OpenClaw setup for marketers"',
    signalKind: "commented_topic_post",
    topicKey: "openclaw",
    topicLabel: "OpenClaw",
    signalPayload: {
      sourceEntityType: "watch_profile",
      sourceEntityUrl: "https://www.linkedin.com/in/alex-lieberman/",
      sourceEntityLabel: "alex-lieberman",
      sourcePostUrl: "https://www.linkedin.com/feed/update/urn:li:activity:123/",
      engagementType: "comment",
    },
    publicIdentifier: "lead-profile",
    sourcePostId: "post_123",
  });

  assert.equal(signal.family, "engaged_with_profile");
  assert.equal(signal.title, "Just engaged with an industry expert");
  assert.equal(signal.familyLabel, "LinkedIn profile in your field");
  assert.equal(signal.sourceType, "watch_profile");
  assert.equal(signal.sourceName, "alex-lieberman");
  assert.equal(signal.reason, "Just engaged with an industry expert.");
  assert.equal(signal.engagementType, "comment");
  assert.equal(signal.sourceUrl, "https://www.linkedin.com/feed/update/urn:li:activity:123/");
});

test("buildNormalizedSignal maps recent funding to reusable funding signal", () => {
  const signal = buildNormalizedSignal({
    signalSource: "recent_funding",
    signalContext: 'Funding post: "We just raised our seed round"',
    signalKind: "recent_funding",
    signalPayload: {
      sourcePostUrl: "https://www.linkedin.com/feed/update/urn:li:activity:456/",
      sourceAuthorUrl: "https://www.linkedin.com/in/founder-one/",
      sourceAuthorLabel: "founder-one",
      engagementType: "event",
    },
    publicIdentifier: "lead-profile",
  });

  assert.equal(signal.family, "recent_funding");
  assert.equal(signal.title, "Recently raised funds");
  assert.equal(signal.familyLabel, "Recently raised funds");
  assert.equal(signal.reason, "Funding event. New budget opportunities.");
  assert.equal(signal.sourceType, "event");
});

test("buildNormalizedSignal maps top active signals without fake percentile", () => {
  const signal = buildNormalizedSignal({
    signalSource: "top_active",
    signalContext: "Top active: 4 posts on ICP topics in past week",
    signalKind: "top_active_topic_profile",
    signalPayload: {
      activityCount: 4,
      sourceAuthorUrl: "https://www.linkedin.com/in/creator-one/",
      sourceAuthorLabel: "creator-one",
      engagementType: "activity",
    },
    publicIdentifier: "lead-profile",
  });

  assert.equal(signal.family, "high_activity_icp");
  assert.equal(signal.title, "Top active in your ICP");
  assert.equal(signal.reason, "Highly active in your ICP (4 tracked posts this week).");
  assert.equal(signal.engagementType, "activity");
});
