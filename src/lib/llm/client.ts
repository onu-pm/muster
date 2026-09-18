import Anthropic from "@anthropic-ai/sdk";

/**
 * A single Anthropic-compatible client, pointed at OpenRouter's Anthropic-
 * compatible endpoint (BYOK: your own Anthropic key is added under
 * OpenRouter -> Settings -> Integrations, so this costs the same as calling
 * Anthropic directly — see the "On cost" section of the Muster doc).
 *
 * This is the one place the model provider is chosen. Swapping providers
 * later means changing this file, nothing that calls it.
 */
export function llmClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseURL = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY. Set it in .env.local (see .env.example).");
  }

  return new Anthropic({ apiKey, baseURL });
}

/** Model tiering (see "On cost, first" in the Muster doc): routine calls to
 *  Haiku, genuinely hard judgment calls to Sonnet. Cost tracks exceptions,
 *  not headcount — most calls this agent makes should be MODEL_ROUTINE. */
export const MODEL_ROUTINE = process.env.MODEL_ROUTINE ?? "anthropic/claude-haiku-4.5";
export const MODEL_JUDGMENT = process.env.MODEL_JUDGMENT ?? "anthropic/claude-sonnet-5";
