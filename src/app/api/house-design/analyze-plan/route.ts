import { NextResponse } from "next/server";

import { detectedPlanToRoom } from "@/features/house-designer/services/plan-analysis";
import {
  ProviderError,
  streamCompletion,
  visionChain,
  visionConfigurationError,
  type AiMessage,
} from "@/lib/ai/provider";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
// Same budget as the other vision-analysis endpoint (src/app/api/ai/analyze) —
// this one calls the same kind of paid vision model and had no limit at all.
const RATE_LIMIT = 80;
const WINDOW_SECONDS = 60 * 60;
const SYSTEM = `Read a residential floor-plan drawing and return only JSON. Coordinates and dimensions must be millimetres. Use the plan's printed dimensions; infer proportional values only when a dimension is unreadable. The outerBoundary must follow the exterior wall centreline in order. Give each exterior point a stable id (c1, c2...), and use the starting point id as that exterior wall's wallId. Interior walls need ids (iw1, iw2...) and openings on them must reference those ids. Detect rooms, doors, windows, passages, stairs, balconies, verandas, structural columns and drawn dimension lines where visible. Do not invent objects. Return exactly this shape (arrays may be empty):
{"outerBoundary":[{"id":"c1","x":0,"y":0},{"id":"c2","x":8000,"y":0},{"id":"c3","x":8000,"y":6500},{"id":"c4","x":0,"y":6500}],"wallThickness":150,"ceilingHeight":2700,"interiorWalls":[{"id":"iw1","start":{"x":4000,"y":0},"end":{"x":4000,"y":6500},"thickness":150,"height":2700,"label":"Interior wall"}],"rooms":[{"id":"r1","name":"Living room","boundary":[{"x":0,"y":0},{"x":4000,"y":0},{"x":4000,"y":6500},{"x":0,"y":6500}]}],"openings":[{"id":"o1","kind":"door","wallId":"c1","offset":1000,"width":900,"height":2100,"sill":0,"swing":"in-left","label":"Entry"}],"columns":[{"id":"col1","x":4000,"y":3250,"width":300,"depth":300}],"stairs":[{"id":"s1","x":6000,"y":3000,"width":1000,"length":3000,"rotation":0}],"dimensions":[{"id":"d1","start":{"x":0,"y":0},"end":{"x":8000,"y":0},"label":"8000"}],"platforms":[{"id":"p1","kind":"balcony","x":4000,"y":-600,"width":3000,"depth":1200,"rotation":0,"wallId":"c1","label":"Balcony"}],"confidence":0.8,"notes":[]}`;

// A hand sketch is not a drawing: the lines wander and the dimensions are
// written in by hand. Same output, read more forgivingly — and the person
// verifies every wall before anything is generated from it.
const SKETCH_INSTRUCTION = [
  "This is a photo of a hand-drawn sketch of a building plan, not a measured drawing.",
  "Treat nearly straight lines as straight and nearly right angles as right angles.",
  "Read handwritten dimensions where they are written (they may be in metres or centimetres; convert to millimetres).",
  "Where a wall has no written dimension, estimate it from its proportion to the walls that do, and lower confidence.",
  "Extract the editable building plan. Return JSON only.",
].join(" ");

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to analyse a floor plan." }, { status: 401 });

  let body: { imageUrl?: unknown; ceilingHeight?: unknown; kind?: unknown };
  try { body = (await request.json()) as typeof body; }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body.imageUrl !== "string" || !allowedPlanUrl(body.imageUrl)) {
    return NextResponse.json({ error: "The uploaded plan URL is not allowed." }, { status: 400 });
  }

  const { data: recent } = await supabase.rpc("ai_feature_requests_in_window", {
    feature_name: "house_plan_analysis",
    window_seconds: WINDOW_SECONDS,
  });
  if (typeof recent === "number" && recent >= RATE_LIMIT) {
    return NextResponse.json({ error: "The plan-detection limit will reset shortly." }, { status: 429 });
  }

  const setupError = visionConfigurationError();
  if (setupError) return NextResponse.json({ error: setupError }, { status: 503 });

  let image: string;
  try { image = await readImage(body.imageUrl, request.signal); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read the plan image." }, { status: 400 }); }

  const messages: AiMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: [
      { type: "text", text: body.kind === "sketch" ? SKETCH_INSTRUCTION : "Extract the editable building plan. Return JSON only." },
      { type: "image_url", image_url: { url: image } },
    ] },
  ];
  const startedAt = Date.now();
  let lastError = "No vision provider could read the floor plan.";
  for (const [index, provider] of visionChain().entries()) {
    let output = "";
    let promptTokens = 0;
    let completionTokens = 0;
    try {
      for await (const chunk of streamCompletion(provider, { messages, temperature: 0, maxTokens: 4_000, signal: request.signal })) {
        if (chunk.type === "text") output += chunk.value;
        else {
          promptTokens = chunk.promptTokens;
          completionTokens = chunk.completionTokens;
        }
      }
      const json = extractJson(output);
      const result = detectedPlanToRoom(json, {
        ceilingHeight: finiteHeight(body.ceilingHeight),
      });
      await record(supabase, user.id, provider.name, provider.defaultModel, startedAt, true, null, index > 0, promptTokens, completionTokens);
      return NextResponse.json({ plan: result.room, confidence: result.confidence, notes: result.notes, provider: provider.name });
    } catch (error) {
      if (request.signal.aborted) return NextResponse.json({ error: "Request cancelled." }, { status: 499 });
      lastError = error instanceof ProviderError ? `${error.provider} ${error.status}: ${error.message}` : error instanceof Error ? error.message : lastError;
      await record(supabase, user.id, provider.name, provider.defaultModel, startedAt, false, lastError, index > 0, promptTokens, completionTokens);
    }
  }
  console.error(`[medosha:house-plan] ${lastError}`);
  return NextResponse.json({ error: "The plan could not be detected automatically. Continue with manual verification." }, { status: 502 });
}

async function record(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  provider: string,
  model: string,
  startedAt: number,
  ok: boolean,
  error: string | null,
  fellBack: boolean,
  promptTokens: number,
  completionTokens: number,
) {
  await supabase.from("ai_usage_logs").insert({
    user_id: userId,
    feature: "house_plan_analysis",
    provider,
    model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    latency_ms: Date.now() - startedAt,
    ok,
    error,
    fell_back: fellBack,
  });
}

async function readImage(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Could not open the uploaded floor plan.");
  const type = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!type.startsWith("image/")) throw new Error("Automatic detection supports JPG, PNG and WebP plans.");
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) throw new Error("The plan image is too large for automatic detection.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("The plan image is too large for automatic detection.");
  return `data:${type};base64,${bytes.toString("base64")}`;
}

function allowedPlanUrl(value: string) {
  try {
    const url = new URL(value);
    const storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://invalid.local");
    return url.protocol === "https:" && url.hostname === storage.hostname;
  } catch { return false; }
}

function finiteHeight(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(6_000, Math.max(1_800, value)) : undefined;
}

function extractJson(value: string): unknown {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The plan analysis was not valid JSON.");
  return JSON.parse(value.slice(start, end + 1));
}
