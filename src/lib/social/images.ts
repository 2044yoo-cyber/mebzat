import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { generateImages, ImageProviderError } from "@/lib/ai/image-provider";
import { IMAGE_MODELS } from "@/lib/ai/image-models";
import { holdCredits } from "@/lib/billing/gate";
import { AI_OPERATIONS } from "@/lib/billing/operations";
import { PLATFORM_SPECS, type SocialPlatform } from "./platforms";
import type { Database } from "@/types/database.types";

/**
 * Which picture goes on the post.
 *
 * The order is a rule, not a preference, and it is the one thing in this
 * feature that could do real harm if it were the other way round:
 *
 *   1. The listing's own photographs.
 *   2. An image the user uploaded.
 *   3. A generated one — and only then, and labelled.
 *
 * A generated picture of "a modern three-bedroom apartment in Bole" attached
 * to a real three-bedroom apartment in Bole is an advertisement for a
 * building that does not exist. The buyer arrives, the rooms are a different
 * shape, and the agent is the one holding it. Medosha would have written it
 * for them.
 *
 * So a listing that has photographs never gets a generated image, whatever the
 * user ticked. `wantsGenerated` is honoured for freeform and educational posts
 * — "the benefits of reinforced concrete" has no real photograph to be false
 * about — and quietly ignored where a real one exists. The origin is recorded
 * either way, and the database's check constraint means the label cannot go
 * missing.
 */

/** Mirrors the `ai_image_origin` enum in 0049. */
export type ImageOrigin =
  | "listing_photo"
  | "user_upload"
  | "ai_generated"
  | "none";

export type ChosenImage = {
  url: string | null;
  origin: ImageOrigin;
  prompt: string | null;
  /** Shown under the preview when the picture was not a photograph. */
  label: string | null;
  /** Credits spent here, on top of the generation. Zero when reusing a photo. */
  credits: number;
};

export async function chooseImage(options: {
  listingImages: string[];
  imagePrompt: string | null;
  wantsGenerated: boolean;
  platforms: SocialPlatform[];
  supabase: SupabaseClient<Database>;
  userId: string;
  /** Set when the user attached their own picture. Beats generation, not a photo. */
  uploadedUrl?: string | null;
}): Promise<ChosenImage> {
  const { listingImages, uploadedUrl, wantsGenerated, imagePrompt } = options;

  // 1. The real thing.
  if (listingImages.length > 0 && listingImages[0]) {
    return {
      url: listingImages[0],
      origin: "listing_photo",
      prompt: null,
      label: null,
      credits: 0,
    };
  }

  // 2. The user's own.
  if (uploadedUrl) {
    return {
      url: uploadedUrl,
      origin: "user_upload",
      prompt: null,
      label: null,
      credits: 0,
    };
  }

  const needsImage = options.platforms.some(
    (platform) => PLATFORM_SPECS[platform].requiresImage,
  );

  // 3. Generated — asked for, or required by a platform that cannot publish
  //    without one. Instagram has no text-only post, so a post going there
  //    with no picture is a post that will fail at the last step; making the
  //    image here is better than failing after approval.
  if (!wantsGenerated && !needsImage) {
    return { url: null, origin: "none", prompt: null, label: null, credits: 0 };
  }

  if (!imagePrompt) {
    return {
      url: null,
      origin: "none",
      prompt: null,
      label: null,
      credits: 0,
    };
  }

  const model = IMAGE_MODELS.find((entry) => entry.id === "grok-image");
  if (!model) {
    return { url: null, origin: "none", prompt: null, label: null, credits: 0 };
  }

  // Its own charge, its own operation, and only reached when an image is
  // really being made. A post that reused a listing photograph never gets
  // here, so it is never billed for one.
  const hold = await holdCredits(AI_OPERATIONS.socialImage, {
    client: options.supabase,
    description: imagePrompt.slice(0, 120),
  });

  if (!hold.ok) {
    // Not fatal. The post is written; it simply has no picture, and the
    // preview will say so. Failing the whole generation over an image would
    // throw away work the member has already paid for.
    return {
      url: null,
      origin: "none",
      prompt: imagePrompt,
      label: null,
      credits: 0,
    };
  }

  try {
    const images = await generateImages({
      model,
      prompt: imagePrompt,
      // 4:5 is the aspect that survives being cropped to a square by Instagram
      // and to landscape by Facebook without losing the subject.
      aspect: "4:3",
      quality: "standard",
      count: 1,
    });

    const first = images[0];
    if (!first) {
      await hold.refund("No image was returned");
      return { url: null, origin: "none", prompt: imagePrompt, label: null, credits: 0 };
    }

    await hold.commit();

    return {
      url: first.url,
      origin: "ai_generated",
      prompt: imagePrompt,
      label: "AI-generated image",
      credits: hold.credits,
    };
  } catch (error) {
    await hold.refund("Image generation failed");

    // The provider's body goes to the log; the member gets a post with no
    // picture and a preview that says why.
    console.error(
      `[medosha-social] image generation failed: ${
        error instanceof ImageProviderError
          ? `${error.provider} ${error.status}`
          : error instanceof Error
            ? error.message
            : "unknown"
      }`,
    );

    return { url: null, origin: "none", prompt: imagePrompt, label: null, credits: 0 };
  }
}
