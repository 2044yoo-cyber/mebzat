import { NextResponse } from "next/server";

import { DETECTED_PLAN_SHAPE, detectedPlanToRoom, planDescriptionError } from "@/features/house-designer/services/plan-analysis";
import { ProviderError, configurationError, providerChain, streamCompletion, type AiMessage } from "@/lib/ai/provider";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The same budget as plan detection: one paid model call per request.
const RATE_LIMIT = 80;
const WINDOW_SECONDS = 60 * 60;
const SYSTEM = `Design a residential floor plan from the person's description and return only JSON. Coordinates and dimensions are millimetres. Keep sizes buildable: bedrooms at least 3000 x 3000, a bathroom at least 1500 x 2000, corridors at least 1000 wide, exterior walls 200 thick, interior walls 120. The outerBoundary follows the exterior wall centreline in order; give each point an id (c1, c2...) and use the starting point id as that exterior wall's wallId. Rooms must tile the inside of the outline without overlapping; separate them with interior walls (ids iw1, iw2...) and give every room a door, with one entrance door in an exterior wall. Put windows in exterior walls. An opening's offset is measured from its wall's start and must fit inside the wall. Use only what the description asks for or a house of that kind needs; set confidence to how closely the plan matches the description and list any assumptions in notes. Return exactly this shape (arrays may be empty):
${DETECTED_PLAN_SHAPE}`;

/** A plan drawn up from a written description. Proposed, not applied: it
 * opens in plan verification, where the person checks every wall. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to generate a floor plan." }, { status: 401 });

  let body: { description?: unknown; ceilingHeight?: unknown };
  try { body = (await request.json()) as typeof body; }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const invalid = planDescriptionError(body.description);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const { data: recent } = await supabase.rpc("ai_feature_requests_in_window", { feature_name: "house_plan_generation", window_seconds: WINDOW_SECONDS });
  if (typeof recent === "number" && recent >= RATE_LIMIT) return NextResponse.json({ error: "The plan-generation limit will reset shortly." }, { status: 429 });
  const setupError = configurationError();
  if (setupError) return NextResponse.json({ error: setupError }, { status: 503 });

  const messages: AiMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: String(body.description).trim() },
  ];
  const ceilingHeight = typeof body.ceilingHeight === "number" && Number.isFinite(body.ceilingHeight) ? Math.min(6_000, Math.max(1_800, body.ceilingHeight)) : undefined;
  const startedAt = Date.now();
  let lastError = "No AI provider could draw the plan.";
  for (const [index, provider] of providerChain().entries()) {
    let output = "";
    let promptTokens = 0;
    let completionTokens = 0;
    try {
      for await (const chunk of streamCompletion(provider, { messages, temperature: 0.2, maxTokens: 4_000, signal: request.signal })) {
        if (chunk.type === "text") output += chunk.value;
        else { promptTokens = chunk.promptTokens; completionTokens = chunk.completionTokens; }
      }
      const result = detectedPlanToRoom(extractJson(output), { ceilingHeight });
      await record(supabase, user.id, provider.name, provider.defaultModel, startedAt, true, null, index > 0, promptTokens, completionTokens);
      return NextResponse.json({ plan: result.room, confidence: result.confidence, notes: result.notes, provider: provider.name });
    } catch (error) {
      if (request.signal.aborted) return NextResponse.json({ error: "Request cancelled." }, { status: 499 });
      lastError = error instanceof ProviderError ? `${error.provider} ${error.status}: ${error.message}` : error instanceof Error ? error.message : lastError;
      await record(supabase, user.id, provider.name, provider.defaultModel, startedAt, false, lastError, index > 0, promptTokens, completionTokens);
    }
  }
  console.error(`[medosha:house-plan-generation] ${lastError}`);
  return NextResponse.json({ error: "A plan could not be drawn from that description. Try again, or draw it yourself." }, { status: 502 });
}

async function record(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, provider: string, model: string, startedAt: number, ok: boolean, error: string | null, fellBack: boolean, promptTokens: number, completionTokens: number) {
  await supabase.from("ai_usage_logs").insert({ user_id: userId, feature: "house_plan_generation", provider, model, prompt_tokens: promptTokens, completion_tokens: completionTokens, latency_ms: Date.now() - startedAt, ok, error, fell_back: fellBack });
}

function extractJson(value: string): unknown {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The generated plan was not valid JSON.");
  return JSON.parse(value.slice(start, end + 1));
}
