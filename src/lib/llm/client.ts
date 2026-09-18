import Anthropic from "@anthropic-ai/sdk";

/**
 * A single Anthropic-compatible client, pointed at OpenRouter's Anthropic-
 * compatible endpoint. Free-tier models only by default — no Anthropic key
 * or OpenRouter credits required (confirmed: cost: 0 on every response).
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
 *  a smaller free model, genuinely hard judgment calls to a larger free
 *  model. Both are NVIDIA's Nemotron 3 free tier on OpenRouter — $0/M
 *  input and output, no Anthropic key or OpenRouter balance needed. Swap
 *  either via env var if you'd rather point at a paid model later. */
export const MODEL_ROUTINE = process.env.MODEL_ROUTINE ?? "nvidia/nemotron-3-super-120b-a12b:free";
export const MODEL_JUDGMENT = process.env.MODEL_JUDGMENT ?? "nvidia/nemotron-3-ultra-550b-a55b:free";
