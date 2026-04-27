import type { Agent } from "./types";

type AgentSignals = Pick<Agent, "signals">;

export function normalizeLinkedInProfileRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const profileMatch = trimmed.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (profileMatch?.[1]) return profileMatch[1].toLowerCase();
  return trimmed.replace(/\/$/, "").toLowerCase();
}

export function getNeverTargetProfileRefs(agent: AgentSignals): Set<string> {
  const refs = new Set<string>();
  const add = (value: string | undefined) => {
    const normalized = normalizeLinkedInProfileRef(value || "");
    if (normalized) refs.add(normalized);
  };

  add(agent.signals.personalProfile);
  for (const profile of agent.signals.watchProfiles || []) add(profile);
  for (const profile of agent.signals.neverTargetProfiles || []) add(profile);

  return refs;
}

export function isNeverTargetProfile(
  agent: AgentSignals,
  candidate: { publicIdentifier?: string; providerId?: string }
): boolean {
  const refs = getNeverTargetProfileRefs(agent);
  if (refs.size === 0) return false;

  const publicRef = normalizeLinkedInProfileRef(candidate.publicIdentifier || "");
  if (publicRef && refs.has(publicRef)) return true;

  const providerRef = normalizeLinkedInProfileRef(candidate.providerId || "");
  return Boolean(providerRef && refs.has(providerRef));
}

