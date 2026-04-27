import test from "node:test";
import assert from "node:assert/strict";
import { buildSignalMetadata, getConfiguredTopics, normalizeTopicKey } from "./topic-signals";

test("buildSignalMetadata classifies commented topic post with configured topic", () => {
  const metadata = buildSignalMetadata({
    source: "post_engagement",
    context: 'Commented on watched profile\'s post: "OpenClaw setup for marketers"',
    sourcePostId: "post_123",
    signals: {
      selectedTopics: ["OpenClaw"],
      engagementKeywords: ["OpenClaw setup", "AI agents"],
      companyPage: "https://www.linkedin.com/company/aiopenclaw/",
      personalProfile: "",
      trackCompanyFollowers: false,
      trackProfileVisitors: false,
      watchProfiles: [],
      neverTargetProfiles: [],
      triggerEvents: { jobChanges: false, recentFunding: false, topActiveProfiles: false },
      competitorPages: [],
    },
  });

  assert.equal(metadata.signalKind, "commented_topic_post");
  assert.equal(metadata.topicKey, "openclaw");
  assert.equal(metadata.topicLabel, "OpenClaw");
  assert.equal(metadata.signalPayload.matchedKeyword, "OpenClaw");
  assert.equal(metadata.signalPayload.sourcePostId, "post_123");
});

test("buildSignalMetadata uses selectedTopics before engagementKeywords", () => {
  const topics = getConfiguredTopics({
    selectedTopics: ["Customer onboarding"],
    engagementKeywords: ["OpenClaw", "Setup friction"],
  });

  assert.deepEqual(topics, ["Customer onboarding"]);
  assert.equal(normalizeTopicKey(topics[0]), "customer_onboarding");
});

test("buildSignalMetadata infers topic from keyword search context without agent signals", () => {
  const metadata = buildSignalMetadata({
    source: "keyword_search",
    context: 'Found via search: "AI agent onboarding"',
  });

  assert.equal(metadata.signalKind, "matched_topic_query");
  assert.equal(metadata.topicKey, "ai_agent_onboarding");
  assert.equal(metadata.topicLabel, "AI agent onboarding");
});
