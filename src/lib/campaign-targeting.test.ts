import test from "node:test";
import assert from "node:assert/strict";

import {
  campaignMatchesMarketLocation,
  isItalyLocation,
  matchesLocationFilter,
  resolveLeadOutreachLanguage,
} from "./campaign-targeting";
import type { Campaign } from "./types";

const italyCampaign: Campaign = {
  id: "cmp_test_it",
  workspaceId: "ws_test",
  agentId: "agt_test",
  name: "Italy Campaign",
  status: "active",
  segment: "freelancer",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  search: {
    keywords: "",
    titleFilter: "",
    language: "it",
    locations: ["Italy"],
  },
  sequence: [],
};

test("does not match Romania as Italy", () => {
  assert.equal(matchesLocationFilter("Braşov, Romania", "Italy"), false);
  assert.equal(isItalyLocation("Braşov, Romania"), false);
  assert.equal(campaignMatchesMarketLocation("Braşov, Romania", italyCampaign), false);
});

test("still matches real Italian locations", () => {
  assert.equal(matchesLocationFilter("Rome, Italy", "Italy"), true);
  assert.equal(matchesLocationFilter("Arezzo", "Italy"), true);
  assert.equal(matchesLocationFilter("Sesto San Giovanni", "Italy"), true);
  assert.equal(isItalyLocation("Milan"), true);
});

test("does not confuse Bari with Brazil", () => {
  assert.equal(matchesLocationFilter("Sao Paulo, Brazil", "Italy"), false);
  assert.equal(isItalyLocation("Sao Paulo, Brazil"), false);
});

test("resolves outreach language from geography before Italian-looking names", () => {
  assert.equal(resolveLeadOutreachLanguage({ location: "Braşov, Romania", language: "it" }), "en");
  assert.equal(resolveLeadOutreachLanguage({ location: "Sliema", language: "it" }), "en");
  assert.equal(resolveLeadOutreachLanguage({ location: "Sesto San Giovanni", language: "en" }), "it");
  assert.equal(resolveLeadOutreachLanguage({ location: "Arezzo", language: "it" }), "it");
});

test("supports exclusion-only campaign markets conservatively", () => {
  const nonItalyCampaign: Campaign = {
    ...italyCampaign,
    id: "cmp_test_en",
    name: "EN Campaign",
    search: {
      ...italyCampaign.search,
      language: "en",
      locations: ["!Italy"],
    },
  };

  assert.equal(campaignMatchesMarketLocation("United Kingdom", nonItalyCampaign), true);
  assert.equal(campaignMatchesMarketLocation("Katowice", nonItalyCampaign), true);
  assert.equal(campaignMatchesMarketLocation("Hackettstown, NJ", nonItalyCampaign), true);
  assert.equal(campaignMatchesMarketLocation("Lithuania", nonItalyCampaign), true);
  assert.equal(campaignMatchesMarketLocation("Sesto San Giovanni", nonItalyCampaign), false);
  assert.equal(campaignMatchesMarketLocation("Unknown City", nonItalyCampaign), false);
});
