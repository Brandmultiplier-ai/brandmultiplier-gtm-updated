/**
 * Brain v1 — Experiment Lifecycle Service
 *
 * Single source of truth for experiment state transitions.
 * Used by CLI, API, and campaign runner — no duplicated logic.
 */

import * as store from "../store";
import type { BrainExperiment, BrainSnapshot } from "../types";
import { getExperiment, updateExperiment, saveExperiment, getActiveExperiment, listExperiments } from "./experiment-store";
import { evaluateExperiment, isReadyForEvaluation, getExperimentSampleCounts, type ExperimentResults } from "./evaluator";
import { generateHypothesis } from "./hypothesis-generator";
import { assertCanProposeExperiment } from "./experiment-policy";

// ── State transitions ───────────────────────────────────────────────────

export async function approveExperiment(experimentId: string): Promise<BrainExperiment> {
  const exp = await getExperiment(experimentId);
  if (!exp) throw new Error(`Experiment ${experimentId} not found`);
  if (exp.status !== "proposed") throw new Error(`Cannot approve: status is ${exp.status}`);

  const now = new Date().toISOString();
  const updated = await updateExperiment(experimentId, { status: "running", approvedAt: now, startedAt: now });
  if (!updated) throw new Error(`Failed to update experiment ${experimentId}`);
  return updated;
}

export async function cancelExperiment(experimentId: string): Promise<BrainExperiment> {
  const exp = await getExperiment(experimentId);
  if (!exp) throw new Error(`Experiment ${experimentId} not found`);

  const updated = await updateExperiment(experimentId, { status: "cancelled", decidedAt: new Date().toISOString() });
  if (!updated) throw new Error(`Failed to update experiment ${experimentId}`);
  return updated;
}

export async function runEvaluation(experimentId: string): Promise<ExperimentResults> {
  const exp = await getExperiment(experimentId);
  if (!exp) throw new Error(`Experiment ${experimentId} not found`);
  if (exp.status !== "running") throw new Error(`Cannot evaluate: status is ${exp.status}`);

  const results = await evaluateExperiment(exp);
  await updateExperiment(experimentId, { results, evaluatedAt: new Date().toISOString() });
  return results;
}

export async function keepExperiment(experimentId: string): Promise<BrainExperiment> {
  const exp = await getExperiment(experimentId);
  if (!exp) throw new Error(`Experiment ${experimentId} not found`);

  await applyWinningConfig(exp, "keep");

  const updated = await updateExperiment(experimentId, { status: "kept", decidedAt: new Date().toISOString() });
  if (!updated) throw new Error(`Failed to update experiment ${experimentId}`);
  return updated;
}

export async function discardExperiment(experimentId: string): Promise<BrainExperiment> {
  const exp = await getExperiment(experimentId);
  if (!exp) throw new Error(`Experiment ${experimentId} not found`);

  await applyWinningConfig(exp, "discard");

  const updated = await updateExperiment(experimentId, { status: "discarded", decidedAt: new Date().toISOString() });
  if (!updated) throw new Error(`Failed to update experiment ${experimentId}`);
  return updated;
}

// ── Autonomous loop (called by campaign runner) ─────────────────────────

export interface LifecycleEvent {
  type: "evaluated" | "kept" | "discarded" | "new_experiment" | "progress" | "skipped" | "error";
  experimentId?: string;
  message: string;
  results?: ExperimentResults;
}

export async function runLifecycle(
  workspaceId: string,
  snapshot: BrainSnapshot,
): Promise<LifecycleEvent[]> {
  const events: LifecycleEvent[] = [];
  const activeExp = await getActiveExperiment(workspaceId);

  if (activeExp && activeExp.status === "running") {
    if (await isReadyForEvaluation(activeExp)) {
      // Evaluate
      const results = await evaluateExperiment(activeExp);
      await updateExperiment(activeExp.id, { results, evaluatedAt: new Date().toISOString() });
      events.push({
        type: "evaluated",
        experimentId: activeExp.id,
        message: results.summary,
        results,
      });

      // Auto-keep or auto-discard
      if (results.winner === "challenger") {
        await keepExperiment(activeExp.id);
        events.push({
          type: "kept",
          experimentId: activeExp.id,
          message: "Challenger promosso a default",
        });
      } else {
        await discardExperiment(activeExp.id);
        events.push({
          type: "discarded",
          experimentId: activeExp.id,
          message: results.winner === "control" ? "Control vince, config ripristinata" : "Inconclusive, config ripristinata",
        });
      }

      // Generate next hypothesis immediately
      const nextResult = await tryGenerateAndApprove(workspaceId, snapshot);
      if (nextResult.experiment) {
        events.push({
          type: "new_experiment",
          experimentId: nextResult.experiment.id,
          message: nextResult.experiment.hypothesis,
        });
      } else if (nextResult.reason) {
        events.push({
          type: nextResult.error ? "error" : "skipped",
          message: nextResult.reason,
        });
      }
    } else {
      const { controlSent, challengerSent } = await getExperimentSampleCounts(activeExp);
      events.push({
        type: "progress",
        experimentId: activeExp.id,
        message: `control ${controlSent}/${activeExp.minSamplePerArm}, challenger ${challengerSent}/${activeExp.minSamplePerArm} — ${activeExp.hypothesis}`,
      });
    }
  } else if (!activeExp) {
    const nextResult = await tryGenerateAndApprove(workspaceId, snapshot);
    if (nextResult.experiment) {
      events.push({
        type: "new_experiment",
        experimentId: nextResult.experiment.id,
        message: nextResult.experiment.hypothesis,
      });
    } else if (nextResult.reason) {
      events.push({
        type: nextResult.error ? "error" : "skipped",
        message: nextResult.reason,
      });
    }
  }

  return events;
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function applyWinningConfig(exp: BrainExperiment, outcome: "keep" | "discard"): Promise<void> {
  if (exp.variable === "template_variant") {
    if (outcome === "keep") {
      await promoteTemplateVariant(exp);
    }
    return;
  }

  if (outcome === "keep") {
    await promoteWeights(exp, exp.challenger.templateWeights);
    return;
  }

  if (exp.previousConfig?.templateWeights) {
    await promoteWeights(exp, exp.previousConfig.templateWeights);
  }
}

async function promoteTemplateVariant(exp: BrainExperiment): Promise<void> {
  const templateText = exp.challenger.templateText;
  if (!templateText) return;

  const campaigns = await store.listCampaigns({});
  const campaign = campaigns.find((c) => c.id === exp.campaignId);
  if (!campaign) return;

  const agent = await store.getAgent(campaign.agentId);
  if (!agent) return;

  const language = exp.language || campaign.search.language;
  const targetIndex = exp.control.templateIndex ?? exp.challenger.templateIndex ?? 0;
  const existingTemplates = Array.isArray(agent.messageTemplates?.[language])
    ? [...agent.messageTemplates[language]]
    : [...(agent.messageTemplates[language] || agent.messageTemplates.en || [])];

  if (targetIndex >= 0 && targetIndex < existingTemplates.length) {
    existingTemplates[targetIndex] = templateText;
  } else {
    existingTemplates.push(templateText);
  }

  await store.saveAgent({
    ...agent,
    messageTemplates: {
      ...agent.messageTemplates,
      [language]: existingTemplates,
    },
  });
}

async function promoteWeights(exp: BrainExperiment, weights: BrainExperiment["challenger"]["templateWeights"]): Promise<void> {
  if (!weights) return;

  const campaigns = await store.listCampaigns({});
  const campaign = campaigns.find((c) => c.id === exp.campaignId);
  if (!campaign) return;

  const agent = await store.getAgent(campaign.agentId);
  if (!agent) return;

  const weightLanguage = exp.language || campaign.search.language;
  await store.saveAgent({
    ...agent,
    templateWeights: {
      ...(agent.templateWeights || {}),
      [weightLanguage]: weights,
    },
  });
}

type GenerationAttempt = {
  experiment?: BrainExperiment;
  reason?: string;
  error?: boolean;
};

async function tryGenerateAndApprove(
  workspaceId: string,
  snapshot: BrainSnapshot,
): Promise<GenerationAttempt> {
  const campaigns = (await store.listCampaigns({ workspaceId })).filter((c) => c.status === "active");
  const campaign = campaigns[0];
  if (!campaign) {
    return { reason: "No active campaign available for experiment generation" };
  }

  try {
    await assertCanProposeExperiment(campaign);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { reason: message };
  }

  try {
    const agent = await store.getAgent(campaign.agentId);
    if (!agent) return { reason: `Agent ${campaign.agentId} not found`, error: true };

    const history = await listExperiments(workspaceId);
    const experiment = await generateHypothesis(snapshot, agent, campaign, history);

    const now = new Date().toISOString();
    experiment.status = "running";
    experiment.approvedAt = now;
    experiment.startedAt = now;
    await saveExperiment(experiment);

    return { experiment };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { reason: `Failed to generate experiment: ${message}`, error: true };
  }
}
