/**
 * Brain v1 — Hypothesis Generator
 *
 * Uses Claude to analyze Brain v0 patterns and propose experiments.
 * v1.5 scope: mutate one current template into a single challenger variant.
 */

import Anthropic from "@anthropic-ai/sdk";
import * as store from "../store";
import type { BrainSnapshot, BrainExperiment, Agent, Campaign, ConversionMetrics, Lead, TemplateWeights } from "../types";
import { generateExperimentId } from "./experiment-store";
import { detectTemplateIndex } from "./analyzer";
import { CONNECT_MATURATION_DAYS } from "./constants";
import { hashTemplate } from "./template-utils";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a growth experiment scientist for LinkedIn outreach optimization.

You analyze conversion data and propose ONE specific, testable hypothesis by rewriting ONE existing outreach template.

RULES:
- Focus on template text optimization only.
- The control arm is the current best-performing template chosen by the system.
- The challenger arm must be a rewrite of that control template.
- Change ONE dimension only: hook, CTA, specificity, framing, tone, or structure.
- Keep the same placeholders exactly as the control template.
- Do not add markdown, bullet lists, emojis, or line breaks.
- Keep the message concise and realistic for a LinkedIn connection request.
- Base your hypothesis on actual data patterns, not assumptions
- Write hypothesis and reasoning in Italian (the user is Italian)

OUTPUT FORMAT (JSON only, no markdown):
{
  "variable": "template_variant",
  "hypothesis": "string — the hypothesis in Italian",
  "reasoning": "string — why this should work, based on data, in Italian",
  "mutationAxis": "string — one short label like hook, CTA, specificity, framing, tone, structure",
  "challengerTemplate": "string — the full rewritten template"
}`;

type HypothesisPayload = {
  hypothesis: string;
  reasoning: string;
  mutationAxis?: string;
  challengerTemplate: string;
};

function emptyMetrics(): ConversionMetrics {
  return { total: 0, sent: 0, accepted: 0, replied: 0, connectRate: 0, replyRate: 0, replyOfAccepted: 0 };
}

function finalizeMetrics(m: ConversionMetrics): ConversionMetrics {
  m.connectRate = m.sent > 0 ? Math.round((m.accepted / m.sent) * 1000) / 10 : 0;
  m.replyRate = m.sent > 0 ? Math.round((m.replied / m.sent) * 1000) / 10 : 0;
  m.replyOfAccepted = m.accepted > 0 ? Math.round((m.replied / m.accepted) * 1000) / 10 : 0;
  return m;
}

function hasEvent(lead: Lead, type: string): boolean {
  return lead.events.some((event) => event.type === type);
}

function formatConnectSummary(metrics: ConversionMetrics): string {
  return `${metrics.sent} sent, ${metrics.accepted} accepted, ${metrics.connectRate}% connect, ${metrics.replyRate}% reply`;
}

function parseHypothesisPayload(text: string): HypothesisPayload {
  const jsonStr = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(jsonStr) as Partial<HypothesisPayload>;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Claude returned an invalid payload");
  }

  if (typeof parsed.hypothesis !== "string" || !parsed.hypothesis.trim()) {
    throw new Error("Claude response is missing a valid hypothesis");
  }

  if (typeof parsed.reasoning !== "string" || !parsed.reasoning.trim()) {
    throw new Error("Claude response is missing valid reasoning");
  }

  return {
    hypothesis: parsed.hypothesis.trim(),
    reasoning: parsed.reasoning.trim(),
    mutationAxis: typeof parsed.mutationAxis === "string" && parsed.mutationAxis.trim() ? parsed.mutationAxis.trim() : undefined,
    challengerTemplate: typeof parsed.challengerTemplate === "string" ? parsed.challengerTemplate : "",
  };
}

function normalizeTemplateText(template: string): string {
  return template.replace(/\s+/g, " ").trim();
}

function extractPlaceholderKeys(template: string): string[] {
  return Array.from(new Set(
    (template.match(/\{\{[^}]+\}\}/g) || [])
      .map((placeholder) => placeholder.replace(/[{}]/g, "").trim())
      .filter(Boolean),
  )).sort();
}

function renderTemplatePreview(template: string, campaign: Campaign): string {
  return template
    .replace(/\{\{\s*firstName\s*\}\}/gi, "Luca")
    .replace(/\{\{\s*first_name\s*\}\}/gi, "Luca")
    .replace(/\{\{\s*personalization\s*\}\}/gi, "vedo che ti occupi di growth")
    .replace(/\{\{\s*segment\s*\}\}/gi, campaign.segment)
    .replace(/\s+/g, " ")
    .trim();
}

function validateChallengerTemplate(
  challengerTemplate: string,
  controlTemplate: string,
  campaign: Campaign,
  agent: Agent,
): string {
  const normalized = normalizeTemplateText(challengerTemplate);
  if (!normalized) throw new Error("Claude response is missing a challenger template");
  if (normalized.includes("```")) throw new Error("Challenger template must not contain markdown fences");

  const controlPlaceholders = extractPlaceholderKeys(controlTemplate);
  const challengerPlaceholders = extractPlaceholderKeys(normalized);
  if (controlPlaceholders.join("|") !== challengerPlaceholders.join("|")) {
    throw new Error(`Challenger template must preserve placeholders exactly: ${controlPlaceholders.join(", ") || "none"}`);
  }

  const preview = renderTemplatePreview(normalized, campaign);
  if (preview.length > agent.limits.maxMessageLength) {
    throw new Error(`Challenger template exceeds max message length (${preview.length}/${agent.limits.maxMessageLength})`);
  }

  return normalized;
}

async function buildCampaignTemplatePerformance(
  agent: Agent,
  campaign: Campaign,
  currentTemplateHashes: string[],
): Promise<Record<string, ConversionMetrics>> {
  const leads = (await store.listLeads(campaign.id, { workspaceId: campaign.workspaceId }))
    .filter((lead) => lead.status !== "skipped" && lead.language === campaign.search.language);
  const metricsByTemplate: Record<string, ConversionMetrics> = {};

  for (const lead of leads) {
    const templateKey = detectTemplateIndex(lead, agent);
    if (templateKey === "unknown") continue;
    const templateIndex = Number(templateKey);
    if (!Number.isInteger(templateIndex) || templateIndex < 0 || templateIndex >= currentTemplateHashes.length) continue;

    const currentTemplateHash = currentTemplateHashes[templateIndex];
    if (lead.templateHash && lead.templateHash !== currentTemplateHash) continue;

    const inviteSent = lead.events.find((event) => event.type === "invite_sent");
    if (!inviteSent) continue;
    const ageInDays = (Date.now() - new Date(inviteSent.ts).getTime()) / 86400000;
    if (ageInDays < CONNECT_MATURATION_DAYS) continue;

    if (!metricsByTemplate[templateKey]) metricsByTemplate[templateKey] = emptyMetrics();
    const metrics = metricsByTemplate[templateKey];
    metrics.total++;
    metrics.sent++;
    if (hasEvent(lead, "accepted")) metrics.accepted++;
    if (hasEvent(lead, "replied")) metrics.replied++;
  }

  for (const key of Object.keys(metricsByTemplate)) {
    finalizeMetrics(metricsByTemplate[key]);
  }

  return metricsByTemplate;
}

function chooseControlTemplateIndex(
  templatePerformance: Record<string, ConversionMetrics>,
  templateCount: number,
  currentWeights?: TemplateWeights,
): number {
  const ranked = Object.entries(templatePerformance)
    .map(([index, metrics]) => ({ index: Number(index), metrics }))
    .filter((entry) => Number.isInteger(entry.index))
    .sort((a, b) => {
      if (b.metrics.connectRate !== a.metrics.connectRate) return b.metrics.connectRate - a.metrics.connectRate;
      if (b.metrics.sent !== a.metrics.sent) return b.metrics.sent - a.metrics.sent;
      return a.index - b.index;
    });

  const bestObserved = ranked.find((entry) => entry.metrics.sent >= 5) || ranked.find((entry) => entry.metrics.sent > 0);
  if (bestObserved) return bestObserved.index;

  if (currentWeights) {
    let bestIndex = 0;
    let bestWeight = currentWeights[0] ?? 0;
    for (let i = 1; i < templateCount; i++) {
      const weight = currentWeights[i] ?? 0;
      if (weight > bestWeight) {
        bestWeight = weight;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  return 0;
}

export async function generateHypothesis(
  snapshot: BrainSnapshot,
  agent: Agent,
  campaign: Campaign,
  experimentHistory: BrainExperiment[],
): Promise<BrainExperiment> {
  const experimentLanguage = campaign.search.language;
  const templates = agent.messageTemplates[experimentLanguage] || agent.messageTemplates["en"] || [];
  const templateCount = templates.length;
  if (templateCount === 0) {
    throw new Error(`No message templates found for campaign ${campaign.id} (${experimentLanguage})`);
  }

  const currentWeights = agent.templateWeights?.[experimentLanguage];
  const templatesDisplay = templates.map((t, i) => `Template #${i}: "${t.substring(0, 100)}${t.length > 100 ? "..." : ""}"`).join("\n");
  const templateHashes = templates.map((template) => hashTemplate(template));
  const templatePerformance = await buildCampaignTemplatePerformance(agent, campaign, templateHashes);
  const controlTemplateIndex = chooseControlTemplateIndex(templatePerformance, templateCount, currentWeights);
  const controlTemplate = templates[controlTemplateIndex] || templates[0];
  const controlTemplateHash = templateHashes[controlTemplateIndex] || hashTemplate(controlTemplate);
  const controlTemplateMetrics = templatePerformance[String(controlTemplateIndex)] || emptyMetrics();

  // Build experiment history display
  const relevantHistory = experimentHistory.filter((experiment) =>
    experiment.campaignId === campaign.id && (!experiment.language || experiment.language === experimentLanguage)
  );
  const historyDisplay = relevantHistory.length > 0
    ? relevantHistory.map((e) => {
        const status = e.results ? `${e.results.winner} (${e.results.summary})` : e.status;
        return `- ${e.hypothesis} → ${status}`;
      }).join("\n")
    : "Nessun esperimento precedente.";

  const userPrompt = `## Dati attuali (Brain v0 analysis)

### Funnel complessivo
- Sent: ${snapshot.patterns.overall.sent}
- Accepted: ${snapshot.patterns.overall.accepted} (${snapshot.patterns.overall.connectRate}%)
- Replied: ${snapshot.patterns.overall.replied} (${snapshot.patterns.overall.replyRate}%)

### Performance per template nella campagna corrente (lingua: ${experimentLanguage})
${JSON.stringify(templatePerformance, null, 2)}

### Performance per segmento
${JSON.stringify(snapshot.patterns.bySegment, null, 2)}

### Performance per lingua
${JSON.stringify(snapshot.patterns.byLanguage, null, 2)}

### Performance per network distance
${JSON.stringify(snapshot.patterns.byNetworkDistance, null, 2)}

### Performance per giorno
${JSON.stringify(snapshot.patterns.byDayOfWeek, null, 2)}

## Configurazione attuale

### Template (lingua: ${experimentLanguage})
${templatesDisplay}

### Control scelto dal sistema
- Template index: ${controlTemplateIndex}
- Hash: ${controlTemplateHash}
- Performance: ${formatConnectSummary(controlTemplateMetrics)}
- Testo: "${controlTemplate}"

### Campagna
- Nome: ${campaign.name}
- Segmento: ${campaign.segment}
- Keywords: ${campaign.search.keywords}

## Storia esperimenti
${historyDisplay}

## Istruzioni
Analizza i dati e proponi UN esperimento di template rewriting.
Il control e' gia' stato scelto dal sistema: devi proporre solo il challenger.
Mantieni esattamente questi placeholder: ${extractPlaceholderKeys(controlTemplate).join(", ") || "nessuno"}.
Rispondi SOLO con il JSON, nessun altro testo.`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!text) {
    throw new Error("Claude returned an empty response");
  }

  const parsed = parseHypothesisPayload(text);
  const challengerTemplate = validateChallengerTemplate(parsed.challengerTemplate, controlTemplate, campaign, agent);
  const challengerTemplateHash = hashTemplate(challengerTemplate);

  const experiment: BrainExperiment = {
    id: generateExperimentId(),
    workspaceId: campaign.workspaceId,
    campaignId: campaign.id,
    language: experimentLanguage,
    variable: "template_variant",
    hypothesis: parsed.hypothesis,
    reasoning: parsed.reasoning,
    mutationAxis: parsed.mutationAxis,
    control: {
      name: "control",
      templateIndex: controlTemplateIndex,
      templateText: controlTemplate,
      templateHash: controlTemplateHash,
      description: `Template #${controlTemplateIndex} (${controlTemplateMetrics.connectRate}% connect su ${controlTemplateMetrics.sent} sent maturi)`,
    },
    challenger: {
      name: "challenger",
      templateIndex: controlTemplateIndex,
      templateText: challengerTemplate,
      templateHash: challengerTemplateHash,
      description: `Variante proposta dall'AI${parsed.mutationAxis ? ` (${parsed.mutationAxis})` : ""}`,
    },
    status: "proposed",
    splitRatio: 0.5,
    minSamplePerArm: 20,
    maxDurationDays: 14,
    controlLeadIds: [],
    challengerLeadIds: [],
    contextSnapshot: {
      sourceSnapshotId: snapshot.id,
      agentId: agent.id,
      agentName: agent.name,
      campaignName: campaign.name,
      segment: campaign.segment,
      search: campaign.search,
      templates,
      templateHashes,
      bestTemplateIndex: controlTemplateIndex,
    },
    proposedAt: new Date().toISOString(),
  };

  return experiment;
}
