import test from "node:test";
import assert from "node:assert/strict";

import { getRoleTitleMatches, hasRoleTitleMatch } from "./role-filter";

test("matches explicit marketing role phrases", () => {
  const titles = ["Brand Marketing", "Product Marketing Manager", "Head of Growth"];
  const matches = getRoleTitleMatches(
    "Operator focused on Brand Marketing and Product Marketing Manager enablement",
    titles
  );

  assert.deepEqual(matches, ["Brand Marketing", "Product Marketing Manager"]);
});

test("does not treat ambiguous single-word growth as a marketing title match", () => {
  const titles = ["Growth", "Growth Manager", "Brand Marketing"];

  assert.equal(
    hasRoleTitleMatch("Writing on Leadership, Personal Growth and AI", titles),
    false
  );
  assert.equal(
    hasRoleTitleMatch("Growth Manager driving acquisition programs", titles),
    true
  );
});

test("allows short high-signal titles like CMO and RevOps", () => {
  const titles = ["CMO", "RevOps", "Marketer"];

  assert.equal(hasRoleTitleMatch("Fractional CMO for B2B SaaS", titles), true);
  assert.equal(hasRoleTitleMatch("Revenue leader focused on RevOps", titles), true);
  assert.equal(hasRoleTitleMatch("Just doing content about AI", titles), false);
});

