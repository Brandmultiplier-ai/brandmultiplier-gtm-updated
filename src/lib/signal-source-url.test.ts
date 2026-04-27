import test from "node:test";
import assert from "node:assert/strict";

import { buildLinkedInProfileUrl, resolveSignalSourceUrl } from "./signal-source-url";

test("resolveSignalSourceUrl prefers explicit post url from payload", () => {
  const resolved = resolveSignalSourceUrl({
    signalSource: "post_engagement",
    publicIdentifier: "lead-profile",
    signalPayload: {
      sourcePostUrl: "https://www.linkedin.com/feed/update/urn:li:activity:123/",
      sourceEntityUrl: "https://www.linkedin.com/in/source-profile/",
    },
  });

  assert.deepEqual(resolved, {
    url: "https://www.linkedin.com/feed/update/urn:li:activity:123/",
    type: "signal",
  });
});

test("resolveSignalSourceUrl falls back to source entity url before lead profile", () => {
  const resolved = resolveSignalSourceUrl({
    signalSource: "company_followers",
    publicIdentifier: "lead-profile",
    signalPayload: {
      sourceEntityUrl: "https://www.linkedin.com/company/aiopenclaw/",
    },
  });

  assert.deepEqual(resolved, {
    url: "https://www.linkedin.com/company/aiopenclaw/",
    type: "signal",
  });
});

test("resolveSignalSourceUrl falls back to lead profile when no signal url is available", () => {
  const resolved = resolveSignalSourceUrl({
    signalSource: "keyword_search",
    publicIdentifier: "lead-profile",
  });

  assert.deepEqual(resolved, {
    url: "https://linkedin.com/in/lead-profile",
    type: "profile",
  });
});

test("buildLinkedInProfileUrl returns undefined for empty identifiers", () => {
  assert.equal(buildLinkedInProfileUrl(undefined), undefined);
});
