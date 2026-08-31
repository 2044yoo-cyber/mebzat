import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { STATE_COOKIE } from "../../connect/[platform]/route";
import { OAuthError, exchangeCode, verifyState } from "@/lib/social/oauth";
import { isSocialPlatform, type SocialPlatform } from "@/lib/social/platforms";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Where the platform sends the browser back.
 *
 * This route is the one an attacker would aim at, so the order of checks is
 * the security model:
 *
 *   1. The user is signed in.
 *   2. The `state` verifies against *our* signature.
 *   3. The nonce inside it matches the cookie this browser was given.
 *   4. The user id inside it is the user making the request.
 *
 * Three and four are what stop the classic attack: sending a logged-in
 * Medosha user to this URL carrying the attacker's authorization code, which
 * would otherwise attach the attacker's Page to the victim's account and send
 * every future post to it.
 *
 * Nothing is written until all four hold.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;
  const url = new URL(request.url);

  const settings = (query: string) =>
    NextResponse.redirect(new URL(`/settings/social?${query}`, request.url));

  if (!isSocialPlatform(platform) || platform === "medosha") {
    return settings("error=unknown");
  }

  // The user declined on the platform's own screen. Not an error worth
  // shouting about — they changed their mind, which is allowed.
  const denied = url.searchParams.get("error");
  if (denied) {
    return settings("cancelled=1");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) return settings("error=incomplete");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return settings("error=signin");

  const parsed = verifyState(state);
  if (!parsed) {
    console.error("[medosha-social] oauth state failed to verify");
    return settings("error=state");
  }

  const jar = await cookies();
  const nonce = jar.get(STATE_COOKIE)?.value;

  if (!nonce || nonce !== parsed.nonce) {
    // Either the flow was not started here, or it was started in another
    // browser. Both are refused, and the difference is not worth telling
    // somebody who might be attacking.
    console.error("[medosha-social] oauth nonce mismatch");
    return settings("error=state");
  }

  if (parsed.userId !== user.id || parsed.platform !== platform) {
    console.error("[medosha-social] oauth state belongs to another session");
    return settings("error=state");
  }

  // Single use. A nonce that survives its callback can be replayed.
  jar.delete(STATE_COOKIE);

  let account;
  try {
    account = await exchangeCode(platform, code);
  } catch (error) {
    const technical = error instanceof Error ? error.message : String(error);
    console.error(`[medosha-social] ${platform} exchange failed: ${technical}`);

    // The platform's own explanation is often the actionable one — "no
    // Instagram Professional account is linked" is worth showing. It is
    // carried in `userMessage`, which is written by us; the raw body stays in
    // the log, because platform error payloads echo the request.
    const message =
      error instanceof OAuthError
        ? error.userMessage
        : "That account could not be connected. Try again.";

    return settings(`error=exchange&message=${encodeURIComponent(message)}`);
  }

  // Written with the service role. `social_accounts` grants members insert and
  // update on their own rows, so the member's client would work — but the row
  // carries an access token, and the client that writes a token should be the
  // one that can never accidentally read it back into a page.
  const service = createServiceClient();

  const { error } = await service.from("social_accounts").upsert(
    {
      owner_id: user.id,
      platform: platform as SocialPlatform,
      status: account.problem ? "permission_required" : "connected",
      external_id: account.externalId,
      display_name: account.displayName,
      avatar_url: account.avatarUrl,
      page_id: account.pageId,
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
      token_expires_at: account.expiresAt,
      scopes: account.scopes,
      last_error: account.problem,
      last_checked_at: new Date().toISOString(),
      connected_at: new Date().toISOString(),
    },
    // Reconnecting replaces the old grant rather than adding a second row.
    // The unique index is (owner_id, platform, company_id).
    { onConflict: "owner_id,platform,company_id" },
  );

  if (error) {
    console.error(`[medosha-social] could not store connection: ${error.message}`);
    return settings("error=save");
  }

  await service.from("notifications").insert({
    user_id: user.id,
    kind: "ai_alert",
    title: account.problem
      ? `${platform} connected, but not ready to post`
      : `${platform} connected`,
    body: account.problem,
    href: "/settings/social",
  });

  return settings(account.problem ? "warning=1" : "connected=1");
}
