/**
 * An image source `next/image` will actually accept.
 *
 * `next/image` throws on a host that is not in `remotePatterns`, and a throw
 * inside a client component is not a broken picture — it takes the whole route
 * down. The property map died on its error boundary with "The map could not
 * start" because fifty listings carried an `images.unsplash.com` URL, and one
 * unconfigured host was enough to lose the map, the list, the filters and the
 * search along with it.
 *
 * That is too much weight on a field a person can type into. The listing form
 * has a cover-image URL box; anything pasted there reaches this same code path.
 * So the check happens before the component instead of after: a source that
 * cannot be rendered becomes a local placeholder, and the page survives.
 *
 * ## What is allowed
 *
 * The same set `next.config.ts` allows, and no more:
 *
 *   * a relative path — everything under `public/`
 *   * a `data:` URI — the blur placeholders the uploader generates
 *   * this deployment's own Supabase Storage
 *
 * Deliberately not a mirror of the config's `remotePatterns` array read at
 * runtime: that array is built from an environment variable and is not
 * available in the browser. Both derive from `NEXT_PUBLIC_SUPABASE_URL`, which
 * is, so they agree without one importing the other.
 */

import { PROJECT_PLACEHOLDER } from "@/lib/constants/placeholders";

/** The Supabase host for this deployment, or null when unconfigured. */
function supabaseHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Whether `next/image` will accept this source without throwing. */
export function isRenderableSrc(src: string | null | undefined): src is string {
  if (!src) return false;

  // Relative paths are `public/`, which is always fine.
  if (src.startsWith("/")) return true;
  if (src.startsWith("data:image/")) return true;

  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;

  const host = supabaseHost();
  return host !== null && parsed.hostname === host;
}

/**
 * The source to render, falling back to a local placeholder.
 *
 * Never returns null: a card with a branded placeholder reads as a listing
 * without a photo, which is honest and survives. A card that throws reads as a
 * broken application.
 */
export function safeImageSrc(
  src: string | null | undefined,
  fallback: string = PROJECT_PLACEHOLDER,
): string {
  return isRenderableSrc(src) ? src : fallback;
}
