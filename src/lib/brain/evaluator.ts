/**
 * Brain v1 — Experiment Evaluator
 *
 * Computes ConversionMetrics per arm and determines winner.
 */

import * as store from "../store";
import type { BrainExperiment, ConversionMetrics, ExperimentExposure, Lead } from "../types";
import { listExperimentExposures } from "./exposure-store";
import { CONNECT_MATURATION_DAYS, REPLY_MATURATION_DAYS } from "./constants";

function emptyMetrics(): ConversionMetrics {
  return { total: 0, sent: 0, accepted: 0, replied: 0, connectRate: 0, replyRate: 0, replyOfAccepted: 0 };
}

function finalizeMetrics(m: ConversionMetrics): ConversionMetrics {
  m.connectRate = m.sent > 0 ? Math.round((m.accepted / m.sent) * 1000) / 10 : 0;
  m.replyRate = m.sent > 0 ? Math.round((m.replied / m.sent) * 1000) / 10 : 0;
  m.replyOfAccepted = m.accepted > 0 ? Math.round((m.replied / m.accepted) * 1000) / 10 : 0;
  return m;
}

export interface ExperimentResults {
  control: ConversionMetrics;
  challenger: ConversionMetrics;
  winner: "control" | "challenger" | "inconclusive";
  confidenceLevel: "low" | "medium" | "high";
  deltaConnectRate?: number;
  pValue?: number;
  summary: string;
}

async function getExperimentLeads(experiment: BrainExperiment) {
  return (await store.getAllLeads({ workspaceId: experiment.workspaceId }))
    .filter((lead) => lead.experimentId === experiment.id);
}

function daysSinceIso(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

function getInviteSentTs(lead: Lead): Date | null {
  const ev = lead.events.find((e) => e.type === "invite_sent");
  return ev?.ts ? new Date(ev.ts) : null;
}

function daysSinceInvite(lead: Lead): number | null {
  const sentTs = getInviteSentTs(lead);
  if (!sentTs) return null;
  return (Date.now() - sentTs.getTime()) / 86400000;
}

function buildArmMetricsFromExposures(exposures: ExperimentExposure[]): { control: ConversionMetrics; challenger: ConversionMetrics } {
  const controlMetrics = emptyMetrics();
  const challengerMetrics = emptyMetrics();

  for (const exposure of exposures) {
    const metrics = exposure.experimentArm === "challenger" ? challengerMetrics : controlMetrics;
    const age = daysSinceIso(exposure.sentAt);

    metrics.total++;

    if (age >= CONNECT_MATURATION_DAYS) {
      metrics.sent++;
      if (exposure.acceptedAt) metrics.accepted++;
    }

    if (age >= REPLY_MATURATION_DAYS && exposure.repliedAt) {
      metrics.replied++;
    }
  }

  return {
    control: finalizeMetrics(controlMetrics),
    challenger: finalizeMetrics(challengerMetrics),
  };
}

async function buildArmMetrics(experiment: BrainExperiment): Promise<{ control: ConversionMetrics; challenger: ConversionMetrics }> {
  const exposures = await listExperimentExposures(experiment.id, experiment.workspaceId);
  if (exposures.length > 0) {
    return buildArmMetricsFromExposures(exposures);
  }

  const expLeads = await getExperimentLeads(experiment);
  const controlMetrics = emptyMetrics();
  const challengerMetrics = emptyMetrics();

  for (const lead of expLeads) {
    const metrics = lead.experimentArm === "challenger" ? challengerMetrics : controlMetrics;
    const age = daysSinceInvite(lead);
    const hasSent = lead.events.some((e) => e.type === "invite_sent");

    metrics.total++;

    if (!hasSent) continue;

    // Only count leads that have matured enough for connect evaluation
    if (age !== null && age >= CONNECT_MATURATION_DAYS) {
      metrics.sent++;
      if (lead.events.some((e) => e.type === "accepted")) metrics.accepted++;
    }

    // Only count reply if lead has matured enough for reply evaluation
    if (age !== null && age >= REPLY_MATURATION_DAYS) {
      if (lead.events.some((e) => e.type === "replied")) metrics.replied++;
    }
  }

  return {
    control: finalizeMetrics(controlMetrics),
    challenger: finalizeMetrics(challengerMetrics),
  };
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function twoProportionPValue(
  successA: number,
  totalA: number,
  successB: number,
  totalB: number,
): number | null {
  if (totalA <= 0 || totalB <= 0) return null;

  const pooled = (successA + successB) / (totalA + totalB);
  const standardError = Math.sqrt(pooled * (1 - pooled) * ((1 / totalA) + (1 / totalB)));
  if (standardError === 0) return successA === successB ? 1 : 0;

  const rateA = successA / totalA;
  const rateB = successB / totalB;
  const zScore = (rateB - rateA) / standardError;
  return Math.max(0, Math.min(1, 2 * (1 - normalCdf(Math.abs(zScore)))));
}

export async function getExperimentSampleCounts(experiment: BrainExperiment): Promise<{ controlSent: number; challengerSent: number }> {
  const { control, challenger } = await buildArmMetrics(experiment);
  return {
    controlSent: control.sent,
    challengerSent: challenger.sent,
  };
}

export async function evaluateExperiment(experiment: BrainExperiment): Promise<ExperimentResults> {
  const { control: controlMetrics, challenger: challengerMetrics } = await buildArmMetrics(experiment);

  // Determine winner
  const minSample = experiment.minSamplePerArm;
  let winner: "control" | "challenger" | "inconclusive" = "inconclusive";
  let confidenceLevel: "low" | "medium" | "high" = "low";
  const deltaConnectRate = Math.round((challengerMetrics.connectRate - controlMetrics.connectRate) * 10) / 10;
  const pValue = twoProportionPValue(
    controlMetrics.accepted,
    controlMetrics.sent,
    challengerMetrics.accepted,
    challengerMetrics.sent,
  );

  if (controlMetrics.sent >= minSample && challengerMetrics.sent >= minSample) {
    const minArm = Math.min(controlMetrics.sent, challengerMetrics.sent);
    if (pValue !== null && pValue < 0.05 && deltaConnectRate !== 0) {
      winner = deltaConnectRate > 0 ? "challenger" : "control";
    }

    if (pValue !== null && pValue < 0.05 && minArm >= 25) confidenceLevel = "high";
    else if (pValue !== null && pValue < 0.1 && minArm >= 15) confidenceLevel = "medium";
  }

  const pValueLabel = pValue === null ? "n/a" : pValue.toFixed(3);
  const replySummary = `reply-of-accepted control ${controlMetrics.replyOfAccepted}% vs challenger ${challengerMetrics.replyOfAccepted}%`;
  const summary = winner === "inconclusive"
    ? `Inconclusive: control ${controlMetrics.connectRate}% vs challenger ${challengerMetrics.connectRate}% (delta ${deltaConnectRate}pp, p=${pValueLabel}, ${controlMetrics.sent}/${challengerMetrics.sent} sent; ${replySummary})`
    : `Winner: ${winner} — ${winner === "challenger" ? challengerMetrics.connectRate : controlMetrics.connectRate}% connect rate vs ${winner === "challenger" ? controlMetrics.connectRate : challengerMetrics.connectRate}% (delta ${deltaConnectRate}pp, p=${pValueLabel}, ${confidenceLevel} confidence; ${replySummary})`;

  return {
    control: controlMetrics,
    challenger: challengerMetrics,
    winner,
    confidenceLevel,
    deltaConnectRate,
    pValue: pValue ?? undefined,
    summary,
  };
}

/**
 * Check if an experiment is ready for evaluation:
 * - Both arms have minSamplePerArm leads, OR
 * - maxDurationDays exceeded
 */
export async function isReadyForEvaluation(experiment: BrainExperiment): Promise<boolean> {
  if (experiment.status !== "running") return false;

  // Check timeout
  if (experiment.startedAt) {
    const elapsed = (Date.now() - new Date(experiment.startedAt).getTime()) / 86400000;
    if (elapsed >= experiment.maxDurationDays) return true;
  }

  // Check sample size
  const { controlSent, challengerSent } = await getExperimentSampleCounts(experiment);
  return controlSent >= experiment.minSamplePerArm && challengerSent >= experiment.minSamplePerArm;
}
