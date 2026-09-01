import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Where Google sends the member back to.
 *
 * Supabase hands over a one-time `code`; this exchanges it for a session and
 * sets the cookies. The route must stay reachable without a session — it is the
 * request that *creates* one — and `src/proxy.ts` allows it through, refreshing
 * cookies on the way past rather than gating it.
 */

/**
 * Somewhere on Medosha, and nowhere else.
 *
 * `next` arrives in the query string, which means it arrives from whoever wrote
 * the link. Interpolating it into a redirect unchecked is an open redirect: a
 * value of `//evil.example` produces `https://medosha.com//evil.example`, which
 * browsers read as protocol-relative and follow off-site — landing somebody on
 * a stranger's page moments after signing in, still trusting the flow they
 * started. That is a convincing way to phish a member.
 *
 * So: one leading slash, no second slash, no scheme, no backslash. Anything
 * else falls back to the dashboard.
 */
function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/")) return "/dashboard";
  // `//host` is protocol-relative; `/\host` is the same trick with a backslash,
  // which some browsers normalise into a forward slash.
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
  if (raw.includes("://")) return "/dashboard";
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

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
