import { NextResponse } from "next/server";

import { GenerationError, generateContent } from "@/lib/social/generate";
import { chooseImage } from "@/lib/social/images";
import { enabledPlatforms, postingAllowance } from "@/lib/social/settings";
import { isSocialPlatform } from "@/lib/social/platforms";
import { holdCredits } from "@/lib/billing/gate";
import { AI_OPERATIONS } from "@/lib/billing/operations";
import { createClient } from "@/lib/supabase/server";

/**
 * Generating a post.
 *
 * The order is the whole security model, and it is the order `gate.ts`
 * describes: authenticate, check the plan, check the posting limit, hold the
 * credits, then call the model. Every one of those is on the server. The
 * browser sends a brief and a list of platforms — never a plan, never a price,
 * never a credit count.
 *
 * "Do not simply hide the button on the frontend" was the instruction. The
 * button is hidden too, because showing somebody a control that will refuse
 * them is unkind — but the refusal below is what actually enforces it, and it
 * is reached by anybody who calls this route directly with a free account.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  brief?: unknown;
  platforms?: unknown;
  category?: unknown;
  sourceType?: unknown;
  sourceId?: unknown;
  generateImage?: unknown;
};

const SOURCE_TYPES = [
  "property",
  "product",
  "project",
  "company",
  "service",
  "profile",
  "freeform",
] as const;

type SourceType = (typeof SOURCE_TYPES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to use this." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  if (brief.length < 3) {
    return NextResponse.json(
      { error: "Say what the post should be about." },
      { status: 400 },
    );
  }
  if (brief.length > 4000) {
    return NextResponse.json({ error: "That brief is too long." }, { status: 400 });
  }

  // Platforms are filtered against what the admin has switched on *and* what
  // the server has credentials for. A browser asking for TikTok on a
  // deployment with no TikTok app does not get a TikTok version it can never
  // publish.
  const requested = Array.isArray(body.platforms)
    ? body.platforms.filter(isSocialPlatform)
    : [];

  const available = await enabledPlatforms();
  const platforms = requested.filter((platform) => available.includes(platform));

  if (platforms.length === 0) {
    return NextResponse.json(
      {
        error:
          requested.length > 0
            ? "None of those platforms are available on this site yet. Medosha is always available."
            : "Choose at least one platform.",
        available,
      },
      { status: 400 },
    );
  }

  const sourceType = SOURCE_TYPES.includes(body.sourceType as SourceType)
    ? (body.sourceType as SourceType)
    : "freeform";

  const sourceId =
    typeof body.sourceId === "string" && UUID.test(body.sourceId)
      ? body.sourceId
      : null;

  // The rolling posting limit, from `platform_settings` rather than from a
  // constant in this file — the brief asked for it to be admin-configurable
  // and a number written here is a number that needs a deploy to change.
  const allowance = await postingAllowance(user.id);
  if (!allowance.ok) {
    return NextResponse.json(
      { error: allowance.reason, limit: allowance.limit, used: allowance.used },
      { status: 429 },
    );
  }

  // Plan and credits. `holdCredits` reads `ai_operation_costs` for the price
  // and the minimum plan, so a free account is refused here with a 402 and a
  // named plan, before a single token is spent.
  const hold = await holdCredits(AI_OPERATIONS.socialPost, {
    client: supabase,
    description: brief.slice(0, 120),
  });

  if (!hold.ok) {
    return NextResponse.json(
      {
        error: hold.error,
        reason: hold.reason,
        balance: hold.balance,
        credits: hold.credits,
        plan: hold.plan,
        minPlan: hold.minPlan,
      },
      { status: hold.status },
    );
  }

  try {
    const { content, listingImages } = await generateContent({
      brief,
      platforms,
      category: typeof body.category === "string" ? body.category : undefined,
      sourceType,
      sourceId,
    });

    // The image. A real listing's own photograph wins over anything generated;
    // see `images.ts` for why that is a rule rather than a preference.
    const image = await chooseImage({
      listingImages,
      imagePrompt: content.imagePrompt,
      wantsGenerated: body.generateImage === true,
      platforms,
      supabase,
      userId: user.id,
    });

    // One master row, then one row per platform. Two statements, not a
    // data-modifying CTE: the versions' RLS policy is an existence check
    // against the master, and a row created earlier in the same statement is
    // not visible to it.
    const { data: post, error: postError } = await supabase
      .from("ai_content_posts")
      .insert({
        owner_id: user.id,
        brief,
        source_type: sourceType,
        source_id: sourceId,
        headline: content.headline,
        body: content.body,
        call_to_action: content.callToAction,
        hashtags: content.hashtags,
        image_url: image.url,
        image_origin: image.origin,
        image_prompt: image.prompt,
        status: "awaiting_approval",
        credits_spent: hold.credits,
      })
      .select("id")
      .single();

    if (postError || !post) {
      // Nothing was stored, so nothing is owed. The generation happened, but
      // the member cannot see it and should not pay for it.
      await hold.refund("The post could not be saved");
      console.error(`[medosha-social] insert failed: ${postError?.message}`);
      return NextResponse.json(
        { error: "The post was written but could not be saved. Try again — you have not been charged." },
        { status: 500 },
      );
    }

    const { error: versionError } = await supabase
      .from("ai_content_versions")
      .insert(
        content.versions.map((version) => ({
          post_id: post.id,
          platform: version.platform,
          body: version.body,
          hashtags: version.hashtags,
          status: "generated" as const,
        })),
      );

    if (versionError) {
      await supabase.from("ai_content_posts").delete().eq("id", post.id);
      await hold.refund("The platform versions could not be saved");
      console.error(`[medosha-social] versions failed: ${versionError.message}`);
      return NextResponse.json(
        { error: "The post could not be saved. Try again — you have not been charged." },
        { status: 500 },
      );
    }

    // Charged once, for the master, whatever number of platforms came out of
    // it. The image is metered separately inside `chooseImage`, and only when
    // one was actually generated.
    await hold.commit();

    await notifyReady(supabase, user.id, post.id, content.headline);

    return NextResponse.json({
      id: post.id,
      headline: content.headline,
      body: content.body,
      callToAction: content.callToAction,
      hashtags: content.hashtags,
      versions: content.versions,
      image,
      grounding: content.grounding,
      missing: content.missing,
      credits: hold.credits,
    });
  } catch (error) {
    await hold.refund("Generation failed");

    if (error instanceof GenerationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[medosha-social] unexpected generation failure", error);
    return NextResponse.json(
      { error: "Medosha AI could not write the post. Try again — you have not been charged." },
      { status: 500 },
    );
  }
}

/** "Your AI post is ready for review", through the tray that already exists. */
async function notifyReady(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  postId: string,
  headline: string,
): Promise<void> {
  // A notification must never break a post that worked, so this is not awaited
  // for its result and its failure is swallowed.
  await supabase.from("notifications").insert({
    user_id: userId,
    kind: "ai_alert",
    title: "Your AI post is ready for review",
    body: headline || "Medosha AI has finished writing your post.",
    href: `/studio/content/${postId}`,
  });
}
