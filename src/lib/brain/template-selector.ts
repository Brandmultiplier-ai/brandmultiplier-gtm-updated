/**
 * Brain v1 — Template Selector
 *
 * Weighted template selection, replacing random Math.floor.
 * Supports A/B experiment splits (control vs challenger weights).
 */

import { createHash } from "crypto";
import type { TemplateWeights, BrainExperiment } from "../types";

export interface TemplateSelection {
  templateIndex: number;
  experimentId?: string;
  experimentArm?: "control" | "challenger";
}

/**
 * Select a template index using weighted random selection.
 * If an active experiment exists, assigns to control/challenger arm.
 */
export function selectTemplate(
  templateCount: number,
  defaultWeights?: TemplateWeights,
  activeExperiment?: BrainExperiment | null,
  assignmentKey?: string,
): TemplateSelection {
  if (!activeExperiment || activeExperiment.status !== "running") {
    // No experiment: use default weights (or uniform)
    const weights = defaultWeights || uniformWeights(templateCount);
    return { templateIndex: weightedRandom(weights, templateCount) };
  }

  // Active experiment: assign to arm based on split ratio
  const armRand = assignmentKey
    ? unitIntervalHash(`${activeExperiment.id}:arm:${assignmentKey}`)
    : Math.random();
  const isChallenger = armRand < activeExperiment.splitRatio;
  const arm = isChallenger ? "challenger" : "control";
  const armConfig = isChallenger ? activeExperiment.challenger : activeExperiment.control;

  if (activeExperiment.variable === "template_variant") {
    return {
      templateIndex: armConfig.templateIndex ?? 0,
      experimentId: activeExperiment.id,
      experimentArm: arm,
    };
  }

  const armWeights = isChallenger
    ? activeExperiment.challenger.templateWeights
    : activeExperiment.control.templateWeights;
  const templateRand = assignmentKey
    ? unitIntervalHash(`${activeExperiment.id}:${arm}:template:${assignmentKey}`)
    : Math.random();

  return {
    templateIndex: weightedRandom(armWeights || uniformWeights(templateCount), templateCount, templateRand),
    experimentId: activeExperiment.id,
    experimentArm: arm,
  };
}

function uniformWeights(count: number): TemplateWeights {
  const w: TemplateWeights = {};
  const v = 1 / count;
  for (let i = 0; i < count; i++) w[i] = v;
  return w;
}

function unitIntervalHash(seed: string): number {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 13);
  const int = parseInt(hex, 16);
  return int / 0x1fffffffffffff;
}

function weightedRandom(weights: TemplateWeights, templateCount: number, rand = Math.random()): number {
  // Normalize weights to sum to 1
  const indices = Array.from({ length: templateCount }, (_, i) => i);
  const values = indices.map((i) => weights[i] ?? 0);
  const total = values.reduce((a, b) => a + b, 0);

  if (total <= 0) return Math.floor(Math.random() * templateCount);

  const normalized = values.map((v) => v / total);
  let cumulative = 0;

  for (let i = 0; i < normalized.length; i++) {
    cumulative += normalized[i];
    if (rand <= cumulative) return i;
  }

  return templateCount - 1; // fallback
}
