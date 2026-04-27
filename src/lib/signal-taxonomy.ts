import type {
  NormalizedSignal,
  SignalEngagementType,
  SignalFamily,
  SignalKind,
  SignalSource,
  SignalSourceType,
} from "./types";
import { resolveSignalSourceUrl, type SignalSourceUrlType } from "./signal-source-url";

const SIGNAL_SOURCE_LABELS: Record<string, string> = {
  keyword_search: "Keyword match",
  post_engagement: "Post engagement",
  recent_activity: "Recent activity",
  profile_visitors: "Profile visitor",
  company_page: "Company page",
  company_followers: "Company follower",
  job_changes: "Job change",
  recent_funding: "Recent funding",
  top_active: "Top active profile",
};

const SIGNAL_KIND_LABELS: Record<string, string> = {
  matched_topic_query: "Matched topic query",
  commented_topic_post: "Commented on topic post",
  reacted_topic_post: "Reacted to topic post",
  posted_about_topic: "Posted about topic",
  visited_profile: "Visited profile",
  follows_topic: "Follows topic",
  job_change: "Job change",
  recent_funding: "Recent funding",
  top_active_topic_profile: "Top active around topic",
  generic_topic_signal: "Topic signal",
};

const SIGNAL_FAMILY_LABELS: Record<SignalFamily, string> = {
  topic_query_match: "Topic match",
  engaged_with_profile: "LinkedIn profile in your field",
  engaged_with_company: "Company page in your field",
  engaged_with_post: "LinkedIn post in your field",
  posted_about_topic: "Recent topic activity",
  visited_profile: "Visited your profile",
  follows_entity: "Follows a tracked entity",
  job_change: "Recent role change",
  recent_funding: "Recently raised funds",
  high_activity_icp: "Highly active in your ICP",
  generic_signal: "Signal",
};

const SIGNAL_SOURCE_TYPE_LABELS: Record<SignalSourceType, string> = {
  search_query: "Search query",
  personal_profile: "Your profile",
  watch_profile: "Tracked profile",
  author_profile: "Author profile",
  company_page: "Company page",
  competitor_page: "Tracked company",
  linkedin_post: "LinkedIn post",
  profile: "LinkedIn profile",
  event: "Event",
  activity_score: "Activity score",
  generic: "Source",
};

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function profileLabelFromUrl(value?: string | null): string | null {
  const trimmed = pickString(value);
  if (!trimmed) return null;
  const match = trimmed.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (match?.[1]) return match[1];
  if (!trimmed.includes("://")) return trimmed.replace(/^@/, "");
  return null;
}

function companyLabelFromUrl(value?: string | null): string | null {
  const trimmed = pickString(value);
  if (!trimmed) return null;
  const match = trimmed.match(/linkedin\.com\/company\/([^/?#]+)/i);
  if (match?.[1]) return match[1];
  if (!trimmed.includes("://")) return trimmed.replace(/^@/, "");
  return null;
}

function signalQuality(signalKind?: string, signalSource?: string): "high" | "medium" | "low" {
  if (signalKind === "commented_topic_post" || signalKind === "posted_about_topic") return "high";
  if (signalKind === "reacted_topic_post" || signalKind === "follows_topic") return "medium";
  if (signalSource === "keyword_search") return "low";
  return "medium";
}

function inferEngagementType(
  signalSource: SignalSource | string,
  signalKind: SignalKind | string | undefined,
  signalContext: string,
  signalPayload?: Record<string, unknown>,
): SignalEngagementType | null {
  const payloadType = pickString(signalPayload?.engagementType);
  if (payloadType === "comment" || payloadType === "reaction" || payloadType === "post" || payloadType === "visit" || payloadType === "follow" || payloadType === "event" || payloadType === "search" || payloadType === "activity") {
    return payloadType;
  }

  const lower = signalContext.toLowerCase();
  if (signalKind === "commented_topic_post" || lower.includes("commented")) return "comment";
  if (signalKind === "reacted_topic_post" || lower.includes("reacted")) return "reaction";
  if (signalKind === "posted_about_topic" || lower.includes("posted about")) return "post";
  if (signalKind === "visited_profile" || signalSource === "profile_visitors" || lower.includes("visited your profile")) return "visit";
  if (signalKind === "follows_topic" || signalSource === "company_followers" || lower.includes("follows")) return "follow";
  if (signalKind === "recent_funding" || signalSource === "recent_funding" || signalSource === "job_changes") return "event";
  if (signalKind === "matched_topic_query" || signalSource === "keyword_search") return "search";
  if (signalKind === "top_active_topic_profile" || signalSource === "top_active") return "activity";
  return null;
}

function inferSourceType(
  signalSource: SignalSource | string,
  signalPayload?: Record<string, unknown>,
): SignalSourceType {
  const entityType = pickString(signalPayload?.sourceEntityType, signalPayload?.source_entity_type);
  if (entityType === "personal_profile") return "personal_profile";
  if (entityType === "watch_profile") return "watch_profile";
  if (entityType === "company_page") return "company_page";
  if (entityType === "competitor_page") return "competitor_page";
  if (entityType === "search_query") return "search_query";
  if (signalSource === "keyword_search") return "search_query";
  if (signalSource === "company_page" || signalSource === "company_followers") return "company_page";
  if (signalSource === "recent_funding" || signalSource === "job_changes") return "event";
  if (signalSource === "top_active") return "activity_score";
  if (signalSource === "profile_visitors") return "personal_profile";
  if (pickString(signalPayload?.sourcePostUrl, signalPayload?.postUrl, signalPayload?.post_url)) return "linkedin_post";
  if (pickString(signalPayload?.sourceAuthorUrl, signalPayload?.source_author_url)) return "author_profile";
  return "generic";
}

function inferFamily(
  signalSource: SignalSource | string,
  signalKind: SignalKind | string | undefined,
  sourceType: SignalSourceType,
  signalContext: string,
): SignalFamily {
  if (signalKind === "recent_funding" || signalSource === "recent_funding") return "recent_funding";
  if (signalKind === "job_change" || signalSource === "job_changes") return "job_change";
  if (signalKind === "top_active_topic_profile" || signalSource === "top_active") return "high_activity_icp";
  if (signalKind === "visited_profile" || signalSource === "profile_visitors") return "visited_profile";
  if (signalKind === "follows_topic" || signalSource === "company_followers") return "follows_entity";
  if (signalKind === "posted_about_topic" || signalSource === "recent_activity") return "posted_about_topic";
  if (signalKind === "matched_topic_query" || signalSource === "keyword_search") return "topic_query_match";
  if (signalSource === "company_page" || sourceType === "company_page" || sourceType === "competitor_page") return "engaged_with_company";
  if (sourceType === "personal_profile" || sourceType === "watch_profile" || sourceType === "author_profile") return "engaged_with_profile";
  if (signalContext.toLowerCase().includes("your post")) return "engaged_with_profile";
  if (signalSource === "post_engagement") return "engaged_with_post";
  return "generic_signal";
}

function inferSourceName(
  sourceType: SignalSourceType,
  signalPayload: Record<string, unknown> | undefined,
  topicLabel?: string,
): string | null {
  const entityLabel = pickString(signalPayload?.sourceEntityLabel, signalPayload?.source_entity_label);
  const authorLabel = pickString(signalPayload?.sourceAuthorLabel, signalPayload?.source_author_label);
  const query = pickString(signalPayload?.sourceQuery, signalPayload?.source_query);
  const entityUrl = pickString(signalPayload?.sourceEntityUrl, signalPayload?.source_entity_url);
  const authorUrl = pickString(signalPayload?.sourceAuthorUrl, signalPayload?.source_author_url);

  switch (sourceType) {
    case "personal_profile":
      return entityLabel || "your profile";
    case "watch_profile":
      return entityLabel || profileLabelFromUrl(entityUrl);
    case "author_profile":
      return authorLabel || profileLabelFromUrl(authorUrl);
    case "company_page":
    case "competitor_page":
      return entityLabel || companyLabelFromUrl(entityUrl);
    case "search_query":
      return query || topicLabel || null;
    case "linkedin_post":
      return authorLabel || profileLabelFromUrl(authorUrl) || topicLabel || null;
    case "profile":
      return profileLabelFromUrl(authorUrl) || entityLabel || null;
    default:
      return entityLabel || authorLabel || query || topicLabel || null;
  }
}

function inferReason(
  family: SignalFamily,
  sourceType: SignalSourceType,
  sourceName: string | null,
  signalContext: string,
  signalPayload?: Record<string, unknown>,
  topicLabel?: string,
): string {
  switch (family) {
    case "recent_funding":
      return "Funding event. New budget opportunities.";
    case "job_change":
      return "Recent role change. New mandate or budget window.";
    case "high_activity_icp": {
      const count = String(signalPayload?.activityCount || signalContext.match(/Top active:\s*(\d+)/i)?.[1] || "").trim();
      return count
        ? `Highly active in your ICP (${count} tracked posts this week).`
        : "Highly active in your ICP.";
    }
    case "visited_profile":
      return sourceType === "personal_profile"
        ? "Recently visited your LinkedIn profile."
        : "Recently visited a tracked LinkedIn profile.";
    case "follows_entity":
      return sourceType === "company_page"
        ? "Follows your company page."
        : "Follows a tracked profile or company page.";
    case "posted_about_topic":
      return topicLabel
        ? `Recently posted about ${topicLabel}.`
        : "Recently posted about a tracked topic.";
    case "topic_query_match":
      return topicLabel
        ? `Matched tracked topic \"${topicLabel}\".`
        : "Matched a tracked topic search.";
    case "engaged_with_company":
      return sourceType === "company_page"
        ? "Just engaged with your company."
        : "Just engaged with a tracked company.";
    case "engaged_with_profile":
      if (sourceType === "personal_profile") return "Just engaged with your profile.";
      return "Just engaged with an industry expert.";
    case "engaged_with_post":
      return "Just engaged with a LinkedIn post.";
    default:
      return signalContext || "Tracked signal";
  }
}

function inferTitle(
  family: SignalFamily,
  sourceType: SignalSourceType,
): string {
  switch (family) {
    case "recent_funding":
      return "Recently raised funds";
    case "visited_profile":
      return "Just engaged with your profile";
    case "follows_entity":
      return sourceType === "company_page" ? "Follows your company" : "Follows a tracked entity";
    case "posted_about_topic":
      return "Posted about topic";
    case "topic_query_match":
      return "Matched topic query";
    case "engaged_with_company":
      return sourceType === "company_page" ? "Just engaged with your company" : "Just engaged with a LinkedIn post";
    case "engaged_with_profile":
      return sourceType === "personal_profile" ? "Just engaged with your profile" : "Just engaged with an industry expert";
    case "engaged_with_post":
      return "Just engaged with a LinkedIn post";
    case "high_activity_icp":
      return "Top active in your ICP";
    case "job_change":
      return "Recent role change";
    default:
      return "Signal";
  }
}

export function buildNormalizedSignal(opts: {
  signalSource: SignalSource | string;
  signalContext: string;
  signalKind?: SignalKind | string;
  topicKey?: string;
  topicLabel?: string;
  signalPayload?: Record<string, unknown>;
  publicIdentifier?: string;
  sourcePostId?: string;
}): NormalizedSignal {
  const signalPayload = opts.signalPayload;
  const sourceType = inferSourceType(opts.signalSource, signalPayload);
  const family = inferFamily(opts.signalSource, opts.signalKind, sourceType, opts.signalContext);
  const sourceName = inferSourceName(sourceType, signalPayload, opts.topicLabel);
  const reason = inferReason(family, sourceType, sourceName, opts.signalContext, signalPayload, opts.topicLabel);
  const title = inferTitle(family, sourceType);
  const engagementType = inferEngagementType(opts.signalSource, opts.signalKind, opts.signalContext, signalPayload);
  const resolvedUrl = resolveSignalSourceUrl({
    signalSource: opts.signalSource,
    signalPayload,
    publicIdentifier: opts.publicIdentifier,
  });

  const sourcePostUrl = pickString(signalPayload?.sourcePostUrl, signalPayload?.postUrl, signalPayload?.post_url);
  const sourceEntityUrl = pickString(signalPayload?.sourceEntityUrl, signalPayload?.source_entity_url);
  const sourceAuthorUrl = pickString(signalPayload?.sourceAuthorUrl, signalPayload?.source_author_url);
  const sourceQuery = pickString(signalPayload?.sourceQuery, signalPayload?.source_query);

  return {
    title,
    source: opts.signalSource,
    sourceLabel: SIGNAL_SOURCE_LABELS[opts.signalSource] || String(opts.signalSource),
    kind: opts.signalKind || "generic_topic_signal",
    kindLabel: SIGNAL_KIND_LABELS[opts.signalKind || "generic_topic_signal"] || opts.signalKind || "Signal",
    family,
    familyLabel: SIGNAL_FAMILY_LABELS[family],
    sourceType,
    sourceTypeLabel: SIGNAL_SOURCE_TYPE_LABELS[sourceType],
    sourceName,
    reason,
    engagementType,
    topicKey: opts.topicKey || null,
    topicLabel: opts.topicLabel || null,
    context: opts.signalContext,
    quality: signalQuality(opts.signalKind, opts.signalSource),
    sourceUrl: resolvedUrl?.url || null,
    sourceUrlType: (resolvedUrl?.type || null) as SignalSourceUrlType | null,
    sourcePostId: opts.sourcePostId || null,
    sourcePostUrl: sourcePostUrl || null,
    sourceEntityUrl: sourceEntityUrl || null,
    sourceAuthorUrl: sourceAuthorUrl || null,
    sourceQuery: sourceQuery || null,
  };
}
