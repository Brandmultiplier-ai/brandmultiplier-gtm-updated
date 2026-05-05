/** OpenAI-compatible Chat Completions at api.openrouter.ai (same schema as OpenAI). */

/** OpenRouter has no `anthropic/claude-haiku-4.6` slug yet; this alias tracks the newest Haiku family model. */
export const OPENROUTER_DEFAULT_MODEL = "~anthropic/claude-haiku-latest";

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
  message?: string;
};

function completionsUrl(): string {
  const base = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  return `${base}/chat/completions`;
}

/**
 * Single-turn chat completion via OpenRouter.
 * Use BM_GTM_APP_URL / OPENROUTER_HTTP_REFERRER so OpenRouter can attribute requests per their docs.
 */
export async function openRouterComplete(params: {
  system: string;
  user: string;
  /** Override env OPENROUTER_MODEL */
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const model = params.model?.trim()
    || process.env.OPENROUTER_MODEL?.trim()
    || OPENROUTER_DEFAULT_MODEL;

  const referer = process.env.OPENROUTER_HTTP_REFERRER?.trim()
    || process.env.BM_GTM_APP_URL?.trim()
    || "http://localhost:3000";

  const res = await fetch(completionsUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": referer,
      "X-Title": "BrandMultiplier GTM",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
      max_tokens: params.maxTokens ?? 1024,
    }),
  });

  const body = (await res.json()) as ChatCompletionResponse;
  if (!res.ok) {
    const detail = body.error?.message || body.message || JSON.stringify(body);
    throw new Error(`OpenRouter HTTP ${res.status}: ${detail}`);
  }

  const content = body.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) {
    throw new Error("OpenRouter returned an empty completion");
  }

  return text;
}
