import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Keeping the pictures.
 *
 * Medosha's image history lives in localStorage and holds URLs. That worked
 * while providers returned hosted links and stopped working the moment xAI
 * became the provider: its links expire, so Medosha asks for base64 instead,
 * and `image-history.ts` refuses to persist a data URL — correctly, since a
 * handful would exhaust the five megabyte quota and take the whole history with
 * them. The result was a generated image that survived until the next reload.
 *
 * So the bytes go to Supabase Storage, into the bucket added by migration 0050,
 * under a folder named for the member. What the history keeps is the **path**,
 * which never expires. A signed URL is minted to look at it and is allowed to
 * be short-lived, because it is not what is stored.
 *
 * ## Uploaded with the member's own client
 *
 * Not the service role. The row-level policy on the bucket says a member may
 * only write under their own id, and using their session means that policy is
 * doing real work on every upload rather than being a comment about intent.
 * The service role would bypass it, and a policy nothing exercises is a policy
 * nobody notices breaking.
 */

const BUCKET = "ai-images";

/** How long a view link lasts. Long enough to look at, short enough to matter. */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

export type StoredImage = {
  /** A link that works now. Expires; not what gets stored. */
  url: string;
  /** The permanent reference. This is what belongs in a history entry. */
  path?: string;
};

/** Splits a data URL into its bytes and its mime type. */
function decodeDataUrl(
  value: string,
): { bytes: Buffer; mime: string; extension: string } | null {
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(value);
  if (!match) return null;

  const mime = match[1]!.toLowerCase();
  const base64 = match[2]!;

  // The bucket accepts three types. Anything else is rejected by storage with
  // an error that reads like a server fault, so it is caught here instead.
  const extension =
    mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) return null;

  try {
    return { bytes: Buffer.from(base64, "base64"), mime, extension };
  } catch {
    return null;
  }
}

/**
 * Puts one image in the member's folder and hands back a link and a path.
 *
 * A hosted URL is returned untouched. Downloading somebody else's CDN image
 * only to upload it again costs a round trip and gains nothing — those links
 * already outlive the session, which is the entire problem being solved.
 */
export async function storeImage(
  supabase: SupabaseClient,
  userId: string,
  image: { url: string },
  name: string,
): Promise<StoredImage> {
  if (!image.url.startsWith("data:")) return { url: image.url };

  const decoded = decodeDataUrl(image.url);
  if (!decoded) return { url: image.url };

  const path = `${userId}/${name}.${decoded.extension}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, decoded.bytes, {
      contentType: decoded.mime,
      // A generated image is written once under a fresh name. Upsert would
      // only matter if two requests collided on a uuid, and if that happens
      // the right outcome is the error rather than one silently replacing the
      // other.
      upsert: false,
    });

  if (error) {
    // Storage failing is not the generation failing. The member has an image
    // in front of them and it works for this session; losing it on reload is
    // worse than nothing but far better than being told the render failed.
    console.error("[medosha-ai:storage] upload failed:", error.message);
    return { url: image.url };
  }

  const signed = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (signed.error || !signed.data?.signedUrl) {
    console.error(
      "[medosha-ai:storage] could not sign:",
      signed.error?.message ?? "no url",
    );
    return { url: image.url, path };
  }

  return { url: signed.data.signedUrl, path };
}

/** All of them, in parallel. One failing does not take the others with it. */
export async function storeImages(
  supabase: SupabaseClient,
  userId: string,
  images: { url: string }[],
  requestId: string,
): Promise<StoredImage[]> {
  return Promise.all(
    images.map((image, index) =>
      storeImage(supabase, userId, image, `${requestId}-${index}`),
    ),
  );
}

/**
 * A fresh link for a path the browser already holds.
 *
 * What makes the history durable: a member who comes back a week later has the
 * path, and this turns it back into something an `<img>` can load.
 *
 * The path is not trusted. It arrives from the browser, and a member who edited
 * localStorage could put somebody else's id in it — so the folder is checked
 * here as well as by the row-level policy. Two checks for one property, because
 * this one gives a clear refusal and the policy gives an empty result.
 */
export async function refreshImageUrl(
  supabase: SupabaseClient,
  userId: string,
  path: string,
): Promise<string | null> {
  if (!path.startsWith(`${userId}/`)) return null;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
