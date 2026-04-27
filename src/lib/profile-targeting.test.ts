import test from "node:test";
import assert from "node:assert/strict";

import { getNeverTargetProfileRefs, isNeverTargetProfile, normalizeLinkedInProfileRef } from "./profile-targeting";

test("normalizeLinkedInProfileRef extracts slug from LinkedIn profile URLs", () => {
  assert.equal(
    normalizeLinkedInProfileRef("https://www.linkedin.com/in/steipete/"),
    "steipete"
  );
  assert.equal(
    normalizeLinkedInProfileRef("https://linkedin.com/in/Gisenberg/?trk=foo"),
    "gisenberg"
  );
});

test("watch profiles and manual never-target profiles are all treated as source-only refs", () => {
  const agent = {
    signals: {
      personalProfile: "https://www.linkedin.com/in/lucavizzielli/",
      companyPage: "",
      trackProfileVisitors: false,
      trackCompanyFollowers: false,
      engagementKeywords: [],
      watchProfiles: ["https://www.linkedin.com/in/steipete/"],
      neverTargetProfiles: ["https://www.linkedin.com/in/gisenberg/", "ACoAACGk7r0BL0tgWwVR7I2jn7zLfqaUO1R2oHI"],
      triggerEvents: {
        topActiveProfiles: false,
        recentFunding: false,
        jobChanges: false,
      },
      competitorPages: [],
    },
  };

  const refs = getNeverTargetProfileRefs(agent);
  assert.ok(refs.has("steipete"));
  assert.ok(refs.has("gisenberg"));
  assert.ok(refs.has("acoaacgk7r0bl0tgwwvr7i2jn7zlfqauo1r2ohi"));
  assert.ok(refs.has("lucavizzielli"));
});

test("isNeverTargetProfile blocks source-only profiles by slug or provider id", () => {
  const agent = {
    signals: {
      personalProfile: "",
      companyPage: "",
      trackProfileVisitors: false,
      trackCompanyFollowers: false,
      engagementKeywords: [],
      watchProfiles: ["https://www.linkedin.com/in/steipete/"],
      neverTargetProfiles: ["ACoAACGk7r0BL0tgWwVR7I2jn7zLfqaUO1R2oHI"],
      triggerEvents: {
        topActiveProfiles: false,
        recentFunding: false,
        jobChanges: false,
      },
      competitorPages: [],
    },
  };

  assert.equal(
    isNeverTargetProfile(agent, { publicIdentifier: "steipete" }),
    true
  );
  assert.equal(
    isNeverTargetProfile(agent, { providerId: "ACoAACGk7r0BL0tgWwVR7I2jn7zLfqaUO1R2oHI" }),
    true
  );
  assert.equal(
    isNeverTargetProfile(agent, { publicIdentifier: "marketer-person" }),
    false
  );
});

