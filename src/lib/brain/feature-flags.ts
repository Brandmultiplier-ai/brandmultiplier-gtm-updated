const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY?.trim());

const bmBrain = process.env.BM_GTM_BRAIN_EXPERIMENTS?.trim().toLowerCase();

/**
 * Runs Brain Lab experiment flows when OpenRouter + Claude access is configured
 * (see OPENROUTER_API_KEY). Set BM_GTM_BRAIN_EXPERIMENTS=0 to force-disable.
 */
export const BRAIN_EXPERIMENTS_ENABLED =
  hasOpenRouterKey && bmBrain !== "0" && bmBrain !== "false";

export function brainExperimentsDisabledMessage() {
  if (!hasOpenRouterKey) {
    return "Brain Lab needs OPENROUTER_API_KEY (OpenRouter bearer key). Optionally set OPENROUTER_MODEL (default: ~anthropic/claude-haiku-latest).";
  }
  if (!BRAIN_EXPERIMENTS_ENABLED) {
    return "Brain experiments are disabled (BM_GTM_BRAIN_EXPERIMENTS=0). Remove that or unset it to enable.";
  }
  return "";
}
