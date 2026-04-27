/**
 * Brain v0 — Recommender
 *
 * Generates actionable recommendations from computed patterns.
 * All rules are hardcoded (no LLM). v1 will use Claude for deeper analysis.
 */

import type { BrainPatterns, BrainRecommendation, ConversionMetrics } from "../types";

function confidence(n: number): "low" | "medium" | "high" {
  if (n >= 15) return "high";
  if (n >= 5) return "medium";
  return "low";
}

function bestAndWorst(
  bucket: Record<string, ConversionMetrics>,
  metric: "connectRate" | "replyRate"
): { best: [string, ConversionMetrics] | null; worst: [string, ConversionMetrics] | null } {
  const entries = Object.entries(bucket).filter(([, m]) => m.sent >= 2);
  if (entries.length === 0) return { best: null, worst: null };
  entries.sort((a, b) => b[1][metric] - a[1][metric]);
  return { best: entries[0], worst: entries[entries.length - 1] };
}

function formatTemplateLabel(key: string): string {
  const [campaignId, language, templateIndex] = key.split(":");
  if (!campaignId || !language || templateIndex === undefined) {
    const templateNumber = Number(key);
    return Number.isFinite(templateNumber) ? `Template #${templateNumber + 1}` : key;
  }

  const templateNumber = Number(templateIndex);
  const templateLabel = Number.isFinite(templateNumber) ? `Template #${templateNumber + 1}` : `Template ${templateIndex}`;
  return `${templateLabel} (${language.toUpperCase()}, ${campaignId})`;
}

export function generateRecommendations(patterns: BrainPatterns): BrainRecommendation[] {
  const recs: BrainRecommendation[] = [];
  const overall = patterns.overall;

  // Sample size warning
  if (overall.sent < 30) {
    recs.push({
      type: "warning",
      category: "general",
      message: `Only ${overall.sent} invites sent so far. Patterns are preliminary, need 30+ for reliable insights.`,
      confidence: "low",
      dataPoints: overall.sent,
    });
  }

  // Overall funnel
  recs.push({
    type: "insight",
    category: "general",
    message: `Funnel: ${overall.sent} sent → ${overall.accepted} accepted (${overall.connectRate}%) → ${overall.replied} replied (${overall.replyRate}%)`,
    confidence: confidence(overall.sent),
    dataPoints: overall.sent,
  });

  // Best/worst segment
  const { best: bestSeg, worst: worstSeg } = bestAndWorst(patterns.bySegment, "connectRate");
  if (bestSeg && bestSeg[1].connectRate > overall.connectRate + 10) {
    recs.push({
      type: "suggestion",
      category: "segment",
      message: `Segment "${bestSeg[0]}" has ${bestSeg[1].connectRate}% connect rate (vs ${overall.connectRate}% avg). Double down on this segment.`,
      confidence: confidence(bestSeg[1].sent),
      dataPoints: bestSeg[1].sent,
    });
  }
  if (worstSeg && worstSeg[1].sent >= 5 && worstSeg[1].connectRate < overall.connectRate * 0.5) {
    recs.push({
      type: "warning",
      category: "segment",
      message: `Segment "${worstSeg[0]}" underperforms at ${worstSeg[1].connectRate}% connect rate. Consider pausing or changing messaging.`,
      confidence: confidence(worstSeg[1].sent),
      dataPoints: worstSeg[1].sent,
    });
  }

  // Language comparison
  const langs = Object.entries(patterns.byLanguage).filter(([, m]) => m.sent >= 2);
  if (langs.length >= 2) {
    langs.sort((a, b) => b[1].connectRate - a[1].connectRate);
    const diff = langs[0][1].connectRate - langs[langs.length - 1][1].connectRate;
    if (diff > 15) {
      recs.push({
        type: "insight",
        category: "language",
        message: `${langs[0][0].toUpperCase()} outperforms ${langs[langs.length - 1][0].toUpperCase()} by ${Math.round(diff)}pp connect rate (${langs[0][1].connectRate}% vs ${langs[langs.length - 1][1].connectRate}%).`,
        confidence: confidence(Math.min(langs[0][1].sent, langs[langs.length - 1][1].sent)),
        dataPoints: langs[0][1].sent + langs[langs.length - 1][1].sent,
      });
    }
  }

  // Template winner
  const { best: bestTpl } = bestAndWorst(patterns.byTemplateIndex, "connectRate");
  if (bestTpl && bestTpl[0] !== "unknown" && bestTpl[1].connectRate > overall.connectRate + 10) {
    recs.push({
      type: "suggestion",
      category: "template",
      message: `${formatTemplateLabel(bestTpl[0])} has ${bestTpl[1].connectRate}% connect rate. Prioritize this template.`,
      confidence: confidence(bestTpl[1].sent),
      dataPoints: bestTpl[1].sent,
    });
  }

  // AI Score correlation
  const scoreBuckets = Object.entries(patterns.byAiScoreBucket)
    .filter(([, m]) => m.sent >= 2)
    .sort((a, b) => Number(b[0]) - Number(a[0]));
  if (scoreBuckets.length >= 2) {
    const highest = scoreBuckets[0];
    const lowest = scoreBuckets[scoreBuckets.length - 1];
    if (highest[1].connectRate > lowest[1].connectRate * 1.5) {
      recs.push({
        type: "insight",
        category: "icp",
        message: `ICP scoring works: score ${highest[0]} has ${highest[1].connectRate}% connect vs score ${lowest[0]} at ${lowest[1].connectRate}%.`,
        confidence: confidence(Math.min(highest[1].sent, lowest[1].sent)),
        dataPoints: highest[1].sent + lowest[1].sent,
      });
    } else {
      recs.push({
        type: "warning",
        category: "icp",
        message: `ICP scoring shows weak correlation: score ${highest[0]} at ${highest[1].connectRate}% vs score ${lowest[0]} at ${lowest[1].connectRate}%. Consider revising scoring criteria.`,
        confidence: confidence(Math.min(highest[1].sent, lowest[1].sent)),
        dataPoints: highest[1].sent + lowest[1].sent,
      });
    }
  }

  // Best day of week
  const { best: bestDay } = bestAndWorst(patterns.byDayOfWeek, "connectRate");
  if (bestDay && bestDay[1].connectRate > overall.connectRate + 10) {
    recs.push({
      type: "insight",
      category: "timing",
      message: `Best day: ${bestDay[0]} with ${bestDay[1].connectRate}% connect rate (vs ${overall.connectRate}% avg).`,
      confidence: confidence(bestDay[1].sent),
      dataPoints: bestDay[1].sent,
    });
  }

  // Timing insights
  if (patterns.avgDaysToAccept !== null) {
    recs.push({
      type: "insight",
      category: "timing",
      message: `Average time to accept: ${patterns.avgDaysToAccept} days. Average time to reply: ${patterns.avgDaysToReply ?? "N/A"} days.`,
      confidence: confidence(overall.accepted),
      dataPoints: overall.accepted,
    });
  }

  // Network distance
  const dist1 = patterns.byNetworkDistance["DISTANCE_1"];
  const dist2 = patterns.byNetworkDistance["DISTANCE_2"];
  if (dist1 && dist2 && dist1.sent >= 2 && dist2.sent >= 2) {
    const diff = dist1.connectRate - dist2.connectRate;
    if (Math.abs(diff) > 10) {
      const better = diff > 0 ? "1st degree" : "2nd degree";
      recs.push({
        type: "insight",
        category: "general",
        message: `${better} connections convert better: DISTANCE_1 at ${dist1.connectRate}% vs DISTANCE_2 at ${dist2.connectRate}%.`,
        confidence: confidence(Math.min(dist1.sent, dist2.sent)),
        dataPoints: dist1.sent + dist2.sent,
      });
    }
  }

  return recs;
}
