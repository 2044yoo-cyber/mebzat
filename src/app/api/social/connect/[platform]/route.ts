import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  authorizeUrl,
  credentialsFor,
  newNonce,
  signState,
} from "@/lib/social/oauth";
import { isSocialPlatform } from "@/lib/social/platforms";
import { enabledPlatforms } from "@/lib/social/settings";
import { createClient } from "@/lib/supabase/server";

/**
 * Starting a connection.
 *
 * Redirects to the platform's own consent screen. Nothing is stored yet — the
 * only thing that survives this request is a nonce in a cookie, which the
 * callback checks to prove the code coming back belongs to the person who
 * started the flow.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The nonce's cookie. Short-lived, HttpOnly, and never read by the browser. */
export const STATE_COOKIE = "medosha_oauth_nonce";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;

  if (!isSocialPlatform(platform) || platform === "medosha") {
    return NextResponse.json({ error: "Unknown platform." }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      new URL(`/login?next=/settings/social`, request.url),
    );
  }

  // Both conditions, for the same reason the generate route checks both: an
  // admin can switch a platform on, but only credentials make it work.
  const available = await enabledPlatforms();
  if (!available.includes(platform) || !credentialsFor(platform)) {
    return NextResponse.redirect(
      new URL(`/settings/social?error=unavailable`, request.url),
    );
  }

  const nonce = newNonce();
  const state = signState({ platform, userId: user.id, nonce });

  const url = authorizeUrl(platform, state);
  if (!url) {
    return NextResponse.redirect(
      new URL(`/settings/social?error=unavailable`, request.url),
    );
  }

  // The nonce is stored where script cannot read it and sent nowhere else. The
  // signed state travels to the platform and comes back; the cookie stays
  // here. Only a request that has both is one this server started.
  const jar = await cookies();
  jar.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Long enough to read a consent screen, short enough that an abandoned
    // flow does not leave a usable nonce lying about for a day.
    maxAge: 10 * 60,
  });

  return NextResponse.redirect(url);
}
