import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { composeRenderPrompt, focusFor } from "@/lib/ai/rendering/compose";
import { checkFidelity, renderImage } from "@/lib/ai/rendering/engine";
import type { RenderSettings } from "@/lib/ai/rendering/options";
import { storeImages } from "@/lib/ai/image-storage";
import {
  isUsableImage,
  messageFor,
  readImageWithGrok,
  XaiImageError,
} from "@/lib/ai/xai-images";
import { holdCredits } from "@/lib/billing/gate";
import { estimateImages, meterImages } from "@/lib/billing/metering";
import { AI_OPERATIONS } from "@/lib/billing/operations";
import { createClient } from "@/lib/supabase/server";

/**
 * AI Sketch → 3D Render.
 *
 * One POST: a source image and a panel full of choices in, an architectural
 * render out. Everything between is server-side, which is not an architectural
 * preference but the requirement — the rendering knowledge and the xAI key both
 * live here and neither may reach a browser.
 *
 * The shape of a request:
 *
 *   source image → Grok reads it → knowledge composes the prompt → Grok draws
 *   → the bytes go to storage → the member gets a link
 *
 * The read is the step that makes this a render of *their* building rather than
 * a picture of a building. It is not optional and a failure is not swallowed:
 * falling through to a text-only generation would return a different house
 * while the member believes it is theirs.
 *
 * Credits are held before the work and committed after it. Nothing is charged
 * for a generation that produced nothing.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** Largest source image accepted, before base64 expansion. */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_INSTRUCTION = 1200;

function tooBig(dataUrl: string): boolean {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return (base64.length * 3) / 4 > MAX_IMAGE_BYTES;
}

/**
 * The settings, taken apart rather than trusted.
 *
 * Everything here arrives from a browser. Unknown option ids are dropped rather
 * than rejected — an id this server does not recognise contributes no hidden
 * instruction, so it cannot smuggle text into the prompt, and refusing the whole
 * request over one stale id would break every open tab on the next deploy.
 */
function readSettings(raw: unknown): RenderSettings {
  const body = (raw ?? {}) as Record<string, unknown>;
  const rawSelections = (body.selections ?? {}) as Record<string, unknown>;

  const selections: RenderSettings["selections"] = {};
  for (const [category, value] of Object.entries(rawSelections)) {
    if (!Array.isArray(value)) continue;
    const ids = value
      .filter((id): id is string => typeof id === "string")
      .slice(0, 12);
    if (ids.length > 0) {
      selections[category as keyof RenderSettings["selections"]] = ids;
    }
  }

  const creative =
    body.creative === "balanced" || body.creative === "creative"
      ? body.creative
      : "strict";

  return {
    selections,
    // Preservation is on unless the browser explicitly turned it off. Defaulting
    // the other way would mean a dropped field quietly redesigns somebody's
    // building.
    preserveDesign: body.preserveDesign !== false,
    creative,
    instruction:
      typeof body.instruction === "string"
        ? body.instruction.trim().slice(0, MAX_INSTRUCTION)
        : "",
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to render." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const image = body.image;
  if (!isUsableImage(image) || (image.startsWith("data:") && tooBig(image))) {
    return NextResponse.json(
      { error: "Please upload a supported image." },
      { status: 400 },
    );
  }

  const settings = readSettings(body);

  // Held for one image. What the provider does not return comes back at commit.
  const requestId = randomUUID();
  const hold = await holdCredits(AI_OPERATIONS.aiImage, {
    client: supabase,
    description: settings.instruction
      ? settings.instruction.slice(0, 120)
      : "Sketch to render",
    estimate: estimateImages(1, "high"),
  });

  if (!hold.ok) {
    return NextResponse.json(
      { error: hold.error, reason: hold.reason, balance: hold.balance },
      { status: hold.status },
    );
  }

  try {
    // 1. Look at what they uploaded, pointed at whatever is about to change.
    const description = await readImageWithGrok({
      image,
      focus: focusFor(settings),
      signal: request.signal,
    });

    // 2. Compose. The prompt never leaves this function.
    const composed = composeRenderPrompt({ settings, description });

    // The toggle alone. See `composeRenderPrompt` — creative freedom governs
    // licence over the surroundings and the finish, never over the geometry.
    const locked = settings.preserveDesign;

    // 3. Draw, by the strongest path this deployment has. Under the lock that
    //    means a real image-to-image edit where one is configured — the pixels
    //    go to the model rather than a paragraph about them.
    const outcome = await renderImage({
      image,
      prompt: composed.prompt,
      editPrompt: composed.editPrompt,
      locked,
      creativeFreedom: settings.creative,
      description,
      signal: request.signal,
    });

    // 4. Did it keep the building? Only worth asking under the lock, and only
    //    advisory — a wrong accusation costing somebody their render would be
    //    the check causing the harm it exists to prevent.
    const fidelity =
      locked && outcome.images[0]
        ? await checkFidelity({
            description,
            rendered: outcome.images[0].url,
            signal: request.signal,
          })
        : null;

    // 5. Keep, so it is still there tomorrow.
    const stored = await storeImages(supabase, user.id, outcome.images, requestId);

    const charge = meterImages(stored.length, "high");
    await hold.commit(charge);

    await supabase.from("ai_usage_logs").insert({
      user_id: user.id,
      feature: "render",
      provider: outcome.path === "image-to-image" ? "openai" : "xai",
      ok: true,
      request_id: requestId,
      credits: charge,
      images: stored.length,
      quality: "high",
      capability: "sketch-to-render",
      // Which engine drew it. A described redraw and a true edit are different
      // products and the log must not conflate them.
      model: outcome.path === "image-to-image" ? "gpt-image-1" : "grok-image",
      // Which rules produced this picture. When somebody says the renders were
      // better last month, this is the difference between a conversation and an
      // investigation.
      knowledge_version: composed.version,
    });

    return NextResponse.json({
      images: stored,
      credits: charge,
      balance: await balanceOf(supabase),
      knowledgeVersion: composed.version,
      /**
       * How it was made, so nothing claims fidelity it did not deliver.
       *
       * "image-to-image" means the uploaded pixels went to the model and the
       * geometry is genuinely carried. "described" means Grok read the building
       * and redrew it — grounded in the original, but a redraw. The workspace
       * says which, because a client told their model was preserved when it was
       * described would be misled by us rather than by the model.
       */
      renderPath: outcome.path,
      fidelity: fidelity
        ? { ok: fidelity.ok, differences: fidelity.differences }
        : null,
      // Deliberately absent: `composed.prompt` and `composed.overruled`. The
      // hidden instructions are the thing the client must not see, and a
      // debugging field is how they leak.
    });
  } catch (error) {
    if (request.signal.aborted) {
      await hold.refund("The request was cancelled");
      return NextResponse.json({ error: "Cancelled." }, { status: 499 });
    }

    // Nothing was produced, so nothing is owed.
    await hold.refund("The render could not be produced");

    if (error instanceof XaiImageError) {
      // The technical detail goes to the log; the member gets a sentence about
      // what to do next, with no provider, endpoint or variable named.
      console.error(`[medosha-ai:render] ${error.failure}:`, error.detail);
      return NextResponse.json(
        { error: messageFor(error.failure) },
        { status: error.failure === "bad_image" ? 400 : 502 },
      );
    }

    console.error("[medosha-ai:render] unexpected:", error);
    return NextResponse.json(
      { error: "Medosha AI could not generate the image. Please try again." },
      { status: 500 },
    );
  }
}

async function balanceOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<number | null> {
  const { data } = await supabase
    .from("credit_wallets")
    .select("balance")
    .maybeSingle();
  return data?.balance ?? null;
}
