/**
 * Brain v1 — Experiment CLI
 *
 * Usage:
 *   npx tsx scripts/brain-experiment.ts generate [--campaign cmp_xxx]
 *   npx tsx scripts/brain-experiment.ts list
 *   npx tsx scripts/brain-experiment.ts approve <exp_id>
 *   npx tsx scripts/brain-experiment.ts evaluate <exp_id>
 *   npx tsx scripts/brain-experiment.ts keep <exp_id>
 *   npx tsx scripts/brain-experiment.ts discard <exp_id>
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

// Load env
const ROOT = new URL("..", import.meta.url).pathname;
const envPath = join(ROOT, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^(\w+)=(.+)$/);
    if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  const { listExperiments, getExperiment, saveExperiment, getActiveExperiment } = await import("../src/lib/brain/experiment-store");
  const { approveExperiment, runEvaluation, keepExperiment, discardExperiment } = await import("../src/lib/brain/experiment-lifecycle");
  const { assertCanProposeExperiment } = await import("../src/lib/brain/experiment-policy");
  const store = await import("../src/lib/store");

  switch (command) {
    case "generate": {
      const campaignIdArg = args.includes("--campaign") ? args[args.indexOf("--campaign") + 1] : undefined;

      const campaigns = store.listCampaigns({}).filter((c) => c.status === "active");
      const campaign = campaignIdArg
        ? campaigns.find((c) => c.id === campaignIdArg)
        : campaigns[0];

      if (!campaign) { console.error("No active campaign found"); process.exit(1); }

      const agent = store.getAgent(campaign.agentId);
      if (!agent) { console.error(`Agent ${campaign.agentId} not found`); process.exit(1); }

      const active = getActiveExperiment(campaign.workspaceId);
      if (active) { console.error(`Experiment ${active.id} is already ${active.status}. Evaluate/keep/discard it first.`); process.exit(1); }

      const { getLatestSnapshot } = await import("../src/lib/brain");
      const snapshot = getLatestSnapshot(campaign.workspaceId);
      if (!snapshot) { console.error("No brain snapshot found. Run brain analysis first."); process.exit(1); }

      try {
        assertCanProposeExperiment(campaign);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }

      const history = listExperiments(campaign.workspaceId);

      console.log("Generating hypothesis with Claude...\n");

      const { generateHypothesis } = await import("../src/lib/brain/hypothesis-generator");
      const experiment = await generateHypothesis(snapshot, agent, campaign, history);
      saveExperiment(experiment);

      console.log("=== NUOVA IPOTESI ===\n");
      console.log(`ID:         ${experiment.id}`);
      console.log(`Campagna:   ${campaign.name} (${campaign.id})`);
      console.log(`Variabile:  ${experiment.variable}`);
      console.log(`\nIpotesi:    ${experiment.hypothesis}`);
      console.log(`\nReasoning:  ${experiment.reasoning}`);
      if (experiment.mutationAxis) console.log(`Axis:       ${experiment.mutationAxis}`);
      console.log(`\nControl:    ${experiment.control.description}`);
      console.log(`Challenger: ${experiment.challenger.description}`);
      if (experiment.variable === "template_variant") {
        console.log(`            Control template:    ${experiment.control.templateText}`);
        console.log(`            Challenger template: ${experiment.challenger.templateText}`);
      } else {
        console.log(`            Pesi: ${JSON.stringify(experiment.challenger.templateWeights)}`);
      }
      console.log(`\nSplit:      ${experiment.splitRatio * 100}/${(1 - experiment.splitRatio) * 100}`);
      console.log(`Min sample: ${experiment.minSamplePerArm} per arm`);
      console.log(`Max durata: ${experiment.maxDurationDays} giorni`);
      console.log(`\nPer approvare: npx tsx scripts/brain-experiment.ts approve ${experiment.id}`);
      break;
    }

    case "list": {
      const experiments = listExperiments();
      if (experiments.length === 0) {
        console.log("Nessun esperimento trovato.");
        return;
      }
      console.log("=== ESPERIMENTI ===\n");
      for (const exp of experiments) {
        const icon = exp.status === "running" ? ">" : exp.status === "kept" ? "+" : exp.status === "discarded" ? "x" : exp.status === "proposed" ? "?" : "-";
        const result = exp.results ? ` → ${exp.results.winner} (${exp.results.confidenceLevel})` : "";
        console.log(`  [${icon}] ${exp.id} | ${exp.status.padEnd(10)} | ${exp.hypothesis.substring(0, 60)}${result}`);
      }
      break;
    }

    case "approve": {
      const expId = args[1];
      if (!expId) { console.error("Usage: approve <exp_id>"); process.exit(1); }
      approveExperiment(expId);
      console.log(`Experiment ${expId} approved and running!`);
      break;
    }

    case "evaluate": {
      const expId = args[1];
      if (!expId) { console.error("Usage: evaluate <exp_id>"); process.exit(1); }

      const exp = getExperiment(expId);
      if (!exp) { console.error(`Experiment ${expId} not found`); process.exit(1); return; }

      const results = runEvaluation(expId);

      console.log("=== RISULTATI ESPERIMENTO ===\n");
      console.log(`ID:         ${expId}`);
      console.log(`Ipotesi:    ${exp.hypothesis}`);
      console.log(`\nControl:    ${results.control.sent} sent → ${results.control.accepted} accepted (${results.control.connectRate}%) → ${results.control.replied} replied (${results.control.replyRate}%)`);
      console.log(`Challenger: ${results.challenger.sent} sent → ${results.challenger.accepted} accepted (${results.challenger.connectRate}%) → ${results.challenger.replied} replied (${results.challenger.replyRate}%)`);
      console.log(`\nVincitore:  ${results.winner} (${results.confidenceLevel} confidence)`);
      console.log(`\n${results.summary}`);
      break;
    }

    case "keep": {
      const expId = args[1];
      if (!expId) { console.error("Usage: keep <exp_id>"); process.exit(1); }
      keepExperiment(expId);
      console.log(`Experiment ${expId} → KEPT. Challenger promosso a default.`);
      break;
    }

    case "discard": {
      const expId = args[1];
      if (!expId) { console.error("Usage: discard <exp_id>"); process.exit(1); }
      discardExperiment(expId);
      console.log(`Experiment ${expId} → DISCARDED. Config ripristinata.`);
      break;
    }

    default:
      console.log("Brain v1 — Experiment CLI\n");
      console.log("Commands:");
      console.log("  generate [--campaign cmp_xxx]  Genera nuova ipotesi con Claude");
      console.log("  list                           Lista esperimenti");
      console.log("  approve <exp_id>               Approva → running");
      console.log("  evaluate <exp_id>              Valuta risultati");
      console.log("  keep <exp_id>                  Promuovi challenger");
      console.log("  discard <exp_id>               Scarta, torna a control");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
