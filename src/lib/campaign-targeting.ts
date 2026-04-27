import type { Campaign, Lead } from "./types";

const COUNTRY_LOCATION_ALIASES: Record<string, string[]> = {
  italy: [
    "italy",
    "italia",
    "milan",
    "milano",
    "rome",
    "roma",
    "turin",
    "torino",
    "naples",
    "napoli",
    "florence",
    "firenze",
    "bologna",
    "venice",
    "venezia",
    "genoa",
    "genova",
    "palermo",
    "catania",
    "bari",
    "verona",
    "padua",
    "padova",
    "trieste",
    "brescia",
    "parma",
    "modena",
    "cagliari",
    "perugia",
    "bergamo",
    "trento",
    "monza",
    "arezzo",
    "ragusa",
    "treviso",
    "saronno",
    "savignano sul rubicone",
    "lucca",
    "olbia",
    "castel gandolfo",
    "san vito dei normanni",
    "rezzato",
    "molfetta",
    "potenza",
    "sesto san giovanni",
    "reggio emilia",
    "asti",
    "gela",
    "cassacco",
    "orroli",
    "lombardy",
    "lombardia",
    "lazio",
    "veneto",
    "tuscany",
    "toscana",
    "puglia",
    "sicily",
    "sicilia",
    "sardinia",
    "sardegna",
    "emilia-romagna",
    "emilia romagna",
    "piemonte",
    "liguria",
    "friuli",
    "umbria",
    "calabria",
  ],
  france: [
    "france",
    "francia",
    "paris",
    "lyon",
    "marseille",
    "toulouse",
    "nice",
    "lille",
    "bordeaux",
    "nantes",
  ],
  germany: [
    "germany",
    "deutschland",
    "berlin",
    "munich",
    "muenchen",
    "hamburg",
    "frankfurt",
    "cologne",
    "koln",
    "stuttgart",
    "dusseldorf",
  ],
  spain: [
    "spain",
    "espana",
    "españa",
    "madrid",
    "barcelona",
    "valencia",
    "seville",
    "sevilla",
    "malaga",
    "bilbao",
  ],
  portugal: [
    "portugal",
    "lisbon",
    "lisboa",
    "porto",
    "braga",
    "coimbra",
    "faro",
    "aveiro",
  ],
  malta: [
    "malta",
    "naxxar",
    "valletta",
    "sliema",
    "st julians",
    "st. julians",
    "san giljan",
    "birkirkara",
    "mosta",
    "gozo",
    "gzira",
    "swieqi",
    "mellieha",
    "rabat",
  ],
  romania: [
    "romania",
    "bucharest",
    "bucuresti",
    "bucharest romania",
    "brasov",
    "iasi",
    "cluj",
    "cluj napoca",
    "timisoara",
    "constanta",
    "sibiu",
    "oradea",
    "ploiesti",
    "craiova",
  ],
  belgium: [
    "belgium",
    "belgio",
    "brussels",
    "bruxelles",
    "antwerp",
    "ghent",
    "bruges",
    "knokke",
  ],
  netherlands: [
    "netherlands",
    "the netherlands",
    "holland",
    "olanda",
    "amsterdam",
    "rotterdam",
    "utrecht",
    "eindhoven",
    "the hague",
    "den haag",
  ],
  "united kingdom": [
    "united kingdom",
    "uk",
    "great britain",
    "england",
    "scotland",
    "wales",
    "london",
    "manchester",
    "birmingham",
    "leeds",
    "glasgow",
    "edinburgh",
    "liverpool",
  ],
  "united states": [
    "united states",
    "united states of america",
    "usa",
    "us",
    "new york",
    "san francisco",
    "los angeles",
    "chicago",
    "miami",
    "austin",
    "boston",
    "seattle",
  ],
};

function normalizeText(value: string | undefined): string {
  return value
    ?.normalize("NFKD")
    .replace(/[^\w\s,-]/g, "")
    .trim()
    .toLowerCase() || "";
}

function normalizeLocationMatchText(value: string | undefined): string {
  return normalizeText(value)
    .replace(/[-,/_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCampaignFilter(value: string | undefined): string {
  const raw = value?.trim() || "";
  if (!raw) return "";
  const isExclusion = raw.startsWith("!");
  const normalized = normalizeText(isExclusion ? raw.slice(1) : raw);
  if (!normalized) return "";
  return isExclusion ? `!${normalized}` : normalized;
}

function containsAlias(location: string | undefined, alias: string): boolean {
  const normalizedLocation = normalizeLocationMatchText(location);
  const normalizedAlias = normalizeLocationMatchText(alias);
  if (!normalizedLocation || !normalizedAlias) return false;
  return ` ${normalizedLocation} `.includes(` ${normalizedAlias} `);
}

export function normalizeCampaignLocations(locations: string[] | undefined): string[] {
  const items = Array.isArray(locations) ? locations : [];
  return Array.from(
    new Set(
      items
        .map((location) => normalizeCampaignFilter(location))
        .filter(Boolean),
    ),
  );
}

function expandCountryAliases(filter: string): string[] {
  const normalized = normalizeText(filter);
  if (!normalized) return [];

  const matchedCountry = Object.entries(COUNTRY_LOCATION_ALIASES).find(([, aliases]) =>
    aliases.includes(normalized),
  );
  if (!matchedCountry) return [normalized];

  return Array.from(new Set(matchedCountry[1].concat(matchedCountry[0])));
}

function buildLocationTerms(location: string | undefined): Set<string> {
  const normalizedLocation = normalizeText(location);
  const terms = new Set<string>();

  if (!normalizedLocation) return terms;
  terms.add(normalizedLocation);

  for (const [country, aliases] of Object.entries(COUNTRY_LOCATION_ALIASES)) {
    if (aliases.some((alias) => containsAlias(normalizedLocation, alias))) {
      terms.add(country);
      for (const alias of aliases) terms.add(alias);
    }
  }

  return terms;
}

function hasMeaningfulLocation(location: string | undefined): boolean {
  const normalizedLocation = normalizeLocationMatchText(location);
  if (!normalizedLocation) return false;

  const genericUnknownLocations = new Set([
    "unknown",
    "unknown city",
    "unknown location",
    "n a",
    "na",
    "none",
    "remote",
    "worldwide",
    "global",
  ]);

  return !genericUnknownLocations.has(normalizedLocation);
}

function matchesSingleLocationFilter(location: string | undefined, filter: string): boolean {
  const normalizedLocation = normalizeText(location);
  if (!normalizedLocation) return false;

  const locationTerms = buildLocationTerms(location);
  const filterTerms = expandCountryAliases(filter);

  return filterTerms.some((term) =>
    containsAlias(normalizedLocation, term) ||
    Array.from(locationTerms).some((locationTerm) => containsAlias(locationTerm, term)),
  );
}

export function matchesLocationFilter(location: string | undefined, filter: string): boolean {
  return matchesSingleLocationFilter(location, filter);
}

export function isItalyLocation(location: string | undefined): boolean {
  return matchesSingleLocationFilter(location, "italy");
}

export function isKnownForeignLocation(location: string | undefined): boolean {
  return Object.keys(COUNTRY_LOCATION_ALIASES)
    .filter((country) => country !== "italy")
    .some((country) => matchesSingleLocationFilter(location, country));
}

function isKnownLocation(location: string | undefined): boolean {
  return Object.keys(COUNTRY_LOCATION_ALIASES)
    .some((country) => matchesSingleLocationFilter(location, country));
}

export function campaignMatchesMarketLocation(location: string | undefined, campaign: Campaign): boolean {
  const filters = normalizeCampaignLocations(campaign.search.locations);
  if (filters.length === 0) return true;

  const includeFilters = filters.filter((filter) => !filter.startsWith("!"));
  const excludeFilters = filters
    .filter((filter) => filter.startsWith("!"))
    .map((filter) => filter.slice(1));

  if (excludeFilters.some((filter) => matchesSingleLocationFilter(location, filter))) {
    return false;
  }

  if (includeFilters.length === 0) {
    // Exclusion-only filters such as !Italy should allow any explicit
    // non-excluded location. Only empty/placeholder locations stay out.
    return hasMeaningfulLocation(location);
  }

  return includeFilters.some((filter) => matchesSingleLocationFilter(location, filter));
}

export function leadMatchesCampaignMarket(lead: Pick<Lead, "location">, campaign: Campaign): boolean {
  return campaignMatchesMarketLocation(lead.location, campaign);
}

export function marketMismatchReason(location: string | undefined, campaign: Campaign): string {
  const filters = normalizeCampaignLocations(campaign.search.locations);
  const campaignMarket = filters.length > 0 ? filters.join(", ") : "any";
  return `market mismatch (campaign: ${campaignMarket}, lead: ${location || "unknown"})`;
}

export function describeCampaignMarket(campaign: Campaign): string {
  const filters = normalizeCampaignLocations(campaign.search.locations);
  return filters.length > 0 ? filters.join(", ") : "Any market";
}

export function resolveLeadOutreachLanguage(lead: Pick<Lead, "location" | "language">): "it" | "en" {
  const normalizedStoredLanguage = normalizeText(lead.language);
  if (isItalyLocation(lead.location)) return "it";
  if (isKnownForeignLocation(lead.location)) return "en";
  if (normalizedStoredLanguage === "it") return "it";
  return normalizedStoredLanguage === "it" ? "it" : "en";
}
