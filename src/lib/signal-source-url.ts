import type { SignalSource } from "./types";

export type SignalSourceUrlType = "signal" | "profile";

export type ResolvedSignalSourceUrl = {
  url: string;
  type: SignalSourceUrlType;
};

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function buildLinkedInProfileUrl(publicIdentifier?: string): string | undefined {
  return publicIdentifier ? `https://linkedin.com/in/${publicIdentifier}` : undefined;
}

function resolveFromPayload(signalPayload?: Record<string, unknown>): ResolvedSignalSourceUrl | null {
  if (!signalPayload) return null;

  const sourcePostUrl = pickString(
    signalPayload.sourcePostUrl,
    signalPayload.postUrl,
    signalPayload.post_url,
    signalPayload.activityUrl,
    signalPayload.activity_url,
    signalPayload.permalink,
    signalPayload.shareUrl,
    signalPayload.share_url,
    signalPayload.link
  );
  if (sourcePostUrl) {
    return { url: sourcePostUrl, type: "signal" };
  }

  const sourceEntityUrl = pickString(signalPayload.sourceEntityUrl, signalPayload.source_entity_url);
  if (sourceEntityUrl) {
    return { url: sourceEntityUrl, type: "signal" };
  }

  const sourceAuthorUrl = pickString(signalPayload.sourceAuthorUrl, signalPayload.source_author_url);
  if (sourceAuthorUrl) {
    return { url: sourceAuthorUrl, type: "signal" };
  }

  return null;
}

export function resolveSignalSourceUrl(opts: {
  signalSource: SignalSource | string;
  signalPayload?: Record<string, unknown>;
  publicIdentifier?: string;
}): ResolvedSignalSourceUrl | null {
  const fromPayload = resolveFromPayload(opts.signalPayload);
  if (fromPayload) return fromPayload;

  switch (opts.signalSource) {
    case "profile_visitors":
    case "company_page":
    case "company_followers":
    case "post_engagement":
    case "recent_activity":
    case "job_changes":
    case "recent_funding":
    case "top_active":
    case "keyword_search":
    default: {
      const profileUrl = buildLinkedInProfileUrl(opts.publicIdentifier);
      return profileUrl ? { url: profileUrl, type: "profile" } : null;
    }
  }
}
