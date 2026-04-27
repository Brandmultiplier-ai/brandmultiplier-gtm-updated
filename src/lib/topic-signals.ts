import type { Agent, SignalKind, SignalSource } from "./types";

type AgentSignals = Agent["signals"];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTopicKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = normalizeText(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(trimmed);
  }
  return next;
}

export function getConfiguredTopics(signals?: Partial<AgentSignals>): string[] {
  if (!signals) return [];
  const selectedTopics = Array.isArray(signals.selectedTopics) ? signals.selectedTopics : [];
  const engagementKeywords = Array.isArray(signals.engagementKeywords) ? signals.engagementKeywords : [];
  return uniqueNonEmpty(selectedTopics.length > 0 ? selectedTopics : engagementKeywords);
}

function extractQuotedValue(context: string): string | null {
  const matches = [...context.matchAll(/"([^"]+)"/g)];
  for (const match of matches) {
    const value = match[1]?.trim();
    if (value) return value;
  }
  return null;
}

function firstTopicMatch(text: string, topicLabels: string[]): { topicKey: string; topicLabel: string; matchedKeyword: string } | null {
  const normalizedText = normalizeText(text);
  if (!normalizedText || topicLabels.length === 0) return null;

  for (const topicLabel of topicLabels) {
    const normalizedTopic = normalizeText(topicLabel);
    if (!normalizedTopic) continue;
    if (normalizedText.includes(normalizedTopic)) {
      return {
        topicKey: normalizeTopicKey(topicLabel),
        topicLabel,
        matchedKeyword: topicLabel,
      };
    }
  }

  return null;
}

function inferSignalKind(source: SignalSource, context: string): SignalKind {
  const lower = context.toLowerCase();

  switch (source) {
    case "keyword_search":
      return "matched_topic_query";
    case "post_engagement":
    case "company_page":
      return lower.includes("commented") ? "commented_topic_post" : "reacted_topic_post";
    case "recent_activity":
      return "posted_about_topic";
    case "profile_visitors":
      return "visited_profile";
    case "company_followers":
      return "follows_topic";
    case "job_changes":
      return "job_change";
    case "recent_funding":
      return "recent_funding";
    case "top_active":
      return "top_active_topic_profile";
    default:
      return "generic_topic_signal";
  }
}

function inferFallbackTopic(source: SignalSource, context: string): string | null {
  if (source === "keyword_search") {
    return extractQuotedValue(context);
  }

  if (source === "recent_activity" || source === "post_engagement" || source === "company_page") {
    return extractQuotedValue(context);
  }

  return null;
}

export function buildSignalMetadata(opts: {
  source: SignalSource;
  context: string;
  sourcePostId?: string;
  signals?: Partial<AgentSignals>;
  topicKey?: string;
  topicLabel?: string;
  signalKind?: SignalKind;
  signalPayload?: Record<string, unknown>;
}): {
  topicKey?: string;
  topicLabel?: string;
  signalKind: SignalKind;
  signalPayload: Record<string, unknown>;
} {
  const configuredTopics = getConfiguredTopics(opts.signals);
  const signalKind = opts.signalKind || inferSignalKind(opts.source, opts.context);

  const directTopic =
    opts.topicKey && opts.topicLabel
      ? { topicKey: opts.topicKey, topicLabel: opts.topicLabel, matchedKeyword: opts.topicLabel }
      : null;

  const matchedTopic =
    directTopic ||
    firstTopicMatch(opts.context, configuredTopics) ||
    (() => {
      const fallbackLabel = inferFallbackTopic(opts.source, opts.context);
      if (!fallbackLabel) return null;
      return {
        topicKey: normalizeTopicKey(fallbackLabel),
        topicLabel: fallbackLabel,
        matchedKeyword: fallbackLabel,
      };
    })() ||
    (() => {
      const primaryTopic = configuredTopics[0];
      if (!primaryTopic) return null;
      return {
        topicKey: normalizeTopicKey(primaryTopic),
        topicLabel: primaryTopic,
        matchedKeyword: primaryTopic,
      };
    })();

  const signalPayload: Record<string, unknown> = {
    originSource: opts.source,
    sourcePostId: opts.sourcePostId,
    ...(matchedTopic?.matchedKeyword ? { matchedKeyword: matchedTopic.matchedKeyword } : {}),
    ...(opts.signalPayload || {}),
  };

  if (opts.source === "company_page" || opts.source === "company_followers") {
    if (opts.signals?.companyPage) signalPayload.sourceEntityUrl = opts.signals.companyPage;
    signalPayload.sourceEntityType = "company_page";
  } else if (opts.source === "profile_visitors") {
    if (opts.signals?.personalProfile) signalPayload.sourceEntityUrl = opts.signals.personalProfile;
    signalPayload.sourceEntityType = "personal_profile";
  } else if (opts.source === "keyword_search") {
    signalPayload.sourceEntityType = "search_query";
  } else {
    signalPayload.sourceEntityType = "content_signal";
  }

  return {
    topicKey: matchedTopic?.topicKey,
    topicLabel: matchedTopic?.topicLabel,
    signalKind,
    signalPayload,
  };
}
