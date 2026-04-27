import type { Lead, SignalKind, SignalSource } from "./types";
import { buildSignalMetadata } from "./topic-signals";

export interface NormalizedSignalPayload {
  source: SignalSource;
  context: string;
  topicKey?: string;
  topicLabel?: string;
  signalKind?: SignalKind;
  signalPayload?: Record<string, unknown>;
  icpFit: number;
  intentScore: number;
  totalScore: number;
  reasoning: string;
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeTotalScore(icpFit: number, intentScore: number): number {
  return roundScore(clamp(icpFit, 0, 1) + clamp(intentScore, 0, 5) / 5);
}

function extractLegacyCampaignLabel(context: string): string | null {
  if (context.startsWith("Matched ICP:")) {
    return context.replace("Matched ICP:", "").trim() || null;
  }
  if (context.startsWith("Skipped for language mismatch in ")) {
    return context.replace("Skipped for language mismatch in ", "").trim() || null;
  }
  return null;
}

function normalizeLegacyContext(context: string, source: SignalSource): string {
  const campaignLabel = extractLegacyCampaignLabel(context);

  if (context === "Anti-persona match") {
    return "Backfilled from legacy anti-persona candidate history";
  }

  if (context.startsWith("Matched ICP:")) {
    return campaignLabel
      ? `Backfilled from existing lead history after matching campaign ICP (${campaignLabel})`
      : "Backfilled from existing lead history after matching campaign ICP";
  }

  if (context.startsWith("Skipped for language mismatch in ")) {
    return campaignLabel
      ? `Backfilled from existing lead history after language or market rerouting (${campaignLabel})`
      : "Backfilled from existing lead history after language or market rerouting";
  }

  if (context.startsWith("Found via search:")) {
    return context;
  }

  if (context.startsWith("Posted about:") || context.startsWith("Commented on") || context.startsWith("Reacted to")) {
    return context;
  }

  return `Backfilled from existing lead history (${source})`;
}

function defaultReasoning(source: SignalSource, originalContext: string): string {
  return `Backfilled from existing lead history. Original context: ${originalContext || source}`;
}

export function normalizeLeadSignalPayload(lead: Lead): NormalizedSignalPayload {
  let source: SignalSource = "keyword_search";
  let context = lead.signal || "";
  let topicKey: string | undefined;
  let topicLabel: string | undefined;
  let signalKind: SignalKind | undefined;
  let signalPayload: Record<string, unknown> | undefined;
  let icpFit = 0;
  let intentScore = 0;
  let reasoning = "";

  try {
    const parsed = JSON.parse(lead.signal || "{}") as Record<string, unknown>;
    if (typeof parsed.source === "string") {
      source = parsed.source as SignalSource;
    }
    if (typeof parsed.context === "string") {
      context = parsed.context;
    }
    if (typeof parsed.topicKey === "string") {
      topicKey = parsed.topicKey;
    }
    if (typeof parsed.topicLabel === "string") {
      topicLabel = parsed.topicLabel;
    }
    if (typeof parsed.signalKind === "string") {
      signalKind = parsed.signalKind as SignalKind;
    }
    if (parsed.signalPayload && typeof parsed.signalPayload === "object") {
      signalPayload = parsed.signalPayload as Record<string, unknown>;
    }
    if (typeof parsed.icpFit === "number") {
      icpFit = parsed.icpFit;
    }
    if (typeof parsed.intentScore === "number") {
      intentScore = parsed.intentScore;
    }
    if (typeof parsed.reasoning === "string") {
      reasoning = parsed.reasoning;
    }
  } catch {
    // fall through with string defaults
  }

  const normalizedContext = normalizeLegacyContext(context, source);
  const signalMeta = buildSignalMetadata({
    source,
    context: normalizedContext,
    topicKey,
    topicLabel,
    signalKind,
    signalPayload,
  });
  const normalizedIcpFit = clamp(icpFit, 0, 1);
  const normalizedIntentScore = clamp(intentScore, 0, 5);

  return {
    source,
    context: normalizedContext,
    topicKey: signalMeta.topicKey,
    topicLabel: signalMeta.topicLabel,
    signalKind: signalMeta.signalKind,
    signalPayload: signalMeta.signalPayload,
    icpFit: normalizedIcpFit,
    intentScore: normalizedIntentScore,
    totalScore: computeTotalScore(normalizedIcpFit, normalizedIntentScore),
    reasoning: reasoning || defaultReasoning(source, context),
  };
}
