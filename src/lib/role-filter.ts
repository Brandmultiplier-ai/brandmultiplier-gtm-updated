const AMBIGUOUS_SINGLE_WORD_TITLES = new Set([
  "growth",
  "acquisition",
  "brand",
  "content",
  "lifecycle",
]);

const ALLOWED_SINGLE_WORD_TITLES = new Set([
  "marketer",
  "cmo",
  "revops",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeRoleText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#&/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titlePattern(title: string): RegExp | null {
  const normalized = normalizeRoleText(title);
  if (!normalized) return null;

  if (!normalized.includes(" ")) {
    if (AMBIGUOUS_SINGLE_WORD_TITLES.has(normalized) && !ALLOWED_SINGLE_WORD_TITLES.has(normalized)) {
      return null;
    }
  }

  return new RegExp(`(^|\\b)${escapeRegExp(normalized).replace(/\s+/g, "\\s+")}(\\b|$)`, "i");
}

export function getRoleTitleMatches(headline: string, jobTitles: string[]): string[] {
  const normalizedHeadline = normalizeRoleText(headline);
  if (!normalizedHeadline) return [];

  return jobTitles.filter((title) => {
    const pattern = titlePattern(title);
    return pattern ? pattern.test(normalizedHeadline) : false;
  });
}

export function hasRoleTitleMatch(headline: string, jobTitles: string[]): boolean {
  return getRoleTitleMatches(headline, jobTitles).length > 0;
}

