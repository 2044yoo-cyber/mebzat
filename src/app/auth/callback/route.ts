import { NextResponse } from "next/server";

import { safeRedirect } from "@/lib/auth/safe-redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Google sends the member back to.
 *
 * Supabase hands over a one-time `code`; this exchanges it for a session and
 * sets the cookies. The route must stay reachable without a session — it is the
 * request that *creates* one — and `src/proxy.ts` allows it through, refreshing
 * cookies on the way past rather than gating it.
 */

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRedirect(searchParams.get("next"));

  // Google's own refusal — the member closed the consent screen, or the app is
  // misconfigured at the provider. It arrives as a parameter, not an exception.
  const oauthError = searchParams.get("error");
  if (oauthError) {
    console.error(
      "[auth] OAuth provider returned an error:",
      searchParams.get("error_description") ?? oauthError,
    );
    return NextResponse.redirect(`${origin}/login?error=oauth_denied`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    // Logged rather than shown. The message names internals, and the member can
    // do nothing with it beyond trying again.
    console.error("[auth] code exchange failed:", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
