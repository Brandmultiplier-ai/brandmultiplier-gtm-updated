import type { SignalCandidateStatus } from "./types";

function compactIdentifier(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function buildSignalCandidateId(agentId: string, providerId: string): string {
  const compactAgent = compactIdentifier(agentId).slice(-12) || "agent";
  const compactProvider = compactIdentifier(providerId).slice(-20) || "provider";
  return `sig_${compactAgent}_${compactProvider}`;
}

const STATUS_PRIORITY: Record<SignalCandidateStatus, number> = {
  new: 0,
  shortlisted: 1,
  promoted: 2,
  dismissed: 3,
};

export function mergeSignalCandidateStatus(
  existing: SignalCandidateStatus | undefined,
  incoming: SignalCandidateStatus,
): SignalCandidateStatus {
  if (!existing) return incoming;
  return STATUS_PRIORITY[incoming] >= STATUS_PRIORITY[existing] ? incoming : existing;
}
