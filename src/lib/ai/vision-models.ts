/**
 * Which models can look at a picture.
 *
 * Its own module, with no `server-only` guard, for the same reason the Berchuma
 * prompt has none: the check script imports it under plain Node to prove the
 * list behaves, and a server-only import cannot be resolved there. There are no
 * keys and no secrets in here — it is a list of model names — so nothing is
 * given away by it being importable.
 *
 * Matched on substrings rather than exact names because model ids move
 * constantly: `gpt-4o`, `gpt-4o-mini`, `gpt-4o-2024-11-20` and
 * `openai/gpt-4o-mini` are the same model reached four ways, and a table of
 * exact names is a table that is wrong within a month.
 *
 * Being wrong in the cautious direction costs somebody a clear error message
 * telling them to add a key they may not need. Being wrong the other way sends
 * a photograph to a model that cannot see it and returns a confusing failure,
 * so anything uncertain is left out.
 */

export const VISION_MODEL_NAMES = [
  // OpenAI
  "gpt-4o",
  "gpt-4.1",
  "gpt-4-turbo",
  "gpt-5",
  "o3",
  "o4",
  // Google
  "gemini",
  // xAI. "grok-4" rather than "grok", and it covers grok-4.5 by prefix.
  // grok-3 is text only, and listing the family would tell somebody their
  // photograph had been read when it had not been.
  "grok-4",
  // Anthropic, through OpenRouter
  "claude-3",
  "claude-4",
  "claude-sonnet",
  "claude-opus",
  "claude-haiku",
  // Open models with vision heads
  "llava",
  "vision",
  "pixtral",
  "qwen2-vl",
  "qwen2.5-vl",
  "llama-3.2-11b",
  "llama-3.2-90b",
  "llama-4",
  "scout",
  "maverick",
  "internvl",
  "minicpm-v",
] as const;

export function looksLikeVision(model: string): boolean {
  const lower = model.toLowerCase();
  return VISION_MODEL_NAMES.some((name) => lower.includes(name));
}
