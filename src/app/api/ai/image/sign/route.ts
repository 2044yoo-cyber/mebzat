import { NextResponse } from "next/server";

import { refreshImageUrl } from "@/lib/ai/image-storage";
import { createClient } from "@/lib/supabase/server";

/**
 * Turning stored paths back into links the browser can load.
 *
 * The image history persists a storage path rather than a URL, because a signed
 * URL expires and a history full of expired links is a history full of broken
 * images. On the way back in, the paths come here and leave as fresh links.
 *
 * Every path is checked against the signed-in member's own folder before it is
 * signed. The row-level policy on the bucket says the same thing, so this is
 * the second of two checks for one property — but it is the one that can refuse
 * clearly, and paths arrive from localStorage, which a member can edit.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Enough for a full history page; not enough to be a signing service. */
const MAX_PATHS = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ urls: {} }, { status: 401 });

  let body: { paths?: unknown };
  try {
    body = (await request.json()) as { paths?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const paths = Array.isArray(body.paths)
    ? body.paths.filter((path): path is string => typeof path === "string").slice(0, MAX_PATHS)
    : [];

  const urls: Record<string, string> = {};

  await Promise.all(
    paths.map(async (path) => {
      const url = await refreshImageUrl(supabase, user.id, path);
      // A path that cannot be signed is simply absent from the answer. It is
      // either somebody else's, or an image that has been deleted, and neither
      // is worth an error the browser has to handle.
      if (url) urls[path] = url;
    }),
  );

  return NextResponse.json({ urls });
}
