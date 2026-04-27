import * as store from "../src/lib/store";
import { buildSignalMetadata } from "../src/lib/topic-signals";

async function main() {
  const signals = await store.listSignalCandidates({ limit: 5000 });
  let updated = 0;

  for (const signal of signals) {
    const agent = await store.getAgent(signal.agentId, signal.workspaceId);
    const metadata = buildSignalMetadata({
      source: signal.signalSource,
      context: signal.signalContext,
      sourcePostId: signal.sourcePostId,
      signals: agent?.signals,
      topicKey: signal.topicKey,
      topicLabel: signal.topicLabel,
      signalKind: signal.signalKind,
      signalPayload: signal.signalPayload,
    });

    await store.saveSignalCandidate({
      ...signal,
      topicKey: metadata.topicKey,
      topicLabel: metadata.topicLabel,
      signalKind: metadata.signalKind,
      signalPayload: metadata.signalPayload,
    });
    updated++;
  }

  console.log(`Backfilled signal metadata for ${updated} signals.`);
}

void main();
