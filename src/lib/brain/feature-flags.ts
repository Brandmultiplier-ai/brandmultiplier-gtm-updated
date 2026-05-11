function hasOpenRouterKey() {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

function isBrainForceDisabled() {
  const bmBrain = process.env.BM_GTM_BRAIN_EXPERIMENTS?.trim().toLowerCase();
  return bmBrain === "0" || bmBrain === "false";
}

/**
 * Runtime check (not module-level constant) so env changes are reflected
 * without stale flags lingering in long-lived dev sessions.
 */
export function isBrainExperimentsEnabled() {
  return hasOpenRouterKey() && !isBrainForceDisabled();
}

export function brainExperimentsDisabledMessage() {
  if (!hasOpenRouterKey()) {
    return "Brain Lab needs OPENROUTER_API_KEY (OpenRouter bearer key). Model is hard-locked to anthropic/claude-haiku-4.5.";
  }
  if (isBrainForceDisabled()) {
    return "Brain experiments are disabled (BM_GTM_BRAIN_EXPERIMENTS=0). Remove that or unset it to enable.";
  }
  return "";
}
