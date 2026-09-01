"use server";

import { revalidatePath } from "next/cache";

import { isSocialPlatform } from "@/lib/social/platforms";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Disconnecting a social account.
 *
 * Two things have to happen and the order matters: tell the platform first,
 * then forget the row. Deleting the row first would leave a live grant on the
 * platform that Medosha can no longer revoke — the user believes they have
 * disconnected and the token keeps working until it expires.
 *
 * Where revocation fails the row is still removed. A user who asks to
 * disconnect must end up disconnected from Medosha's side whatever the
 * platform says, and they are told to remove the app on the platform too.
 */

export type DisconnectResult =
  | { ok: true; warning: string | null }
  | { ok: false; error: string };

export async function disconnectAccount(
  platform: string,
): Promise<DisconnectResult> {
  if (!isSocialPlatform(platform) || platform === "medosha") {
    return { ok: false, error: "Unknown platform." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Sign in first." };

  // The token is read with the service role — members have no select policy on
  // this table — and used only to tell the platform, never returned.
  const service = createServiceClient();

  const { data: account } = await service
    .from("social_accounts")
    .select("access_token, platform")
    .eq("owner_id", user.id)
    .eq("platform", platform)
    .maybeSingle();

  let warning: string | null = null;

  if (account?.access_token) {
    const revoked = await revoke(platform, account.access_token);
    if (!revoked) {
      warning =
        `Medosha has forgotten the connection, but ${platform} did not confirm ` +
        `the permission was withdrawn. Remove Medosha from that account's app ` +
        `settings to be certain.`;
    }
  }

  // Deleted with the member's own client, so RLS confirms the row is theirs.
  // The service role could delete anybody's.
  const { error } = await supabase
    .from("social_accounts")
    .delete()
    .eq("platform", platform);

  if (error) {
    console.error(`[medosha-social] disconnect failed: ${error.message}`);
    return { ok: false, error: "The account could not be disconnected." };
  }

  revalidatePath("/settings/social");
  return { ok: true, warning };
}

/**
 * Tells the platform to withdraw the grant.
 *
 * Meta has a documented revoke endpoint. TikTok has one too, and it takes the
 * client credentials rather than a bearer token. A platform that has neither
 * would return false here, and the caller says so rather than implying a
 * revocation that did not happen.
 */
async function revoke(platform: string, token: string): Promise<boolean> {
  try {
    if (platform === "facebook" || platform === "instagram") {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/me/permissions?access_token=${encodeURIComponent(token)}`,
        { method: "DELETE", signal: AbortSignal.timeout(15_000) },
      );
      return response.ok;
    }

    if (platform === "tiktok") {
      const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
      const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
      if (!clientKey || !clientSecret) return false;

      const response = await fetch(
        "https://open.tiktokapis.com/v2/oauth/revoke/",
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          signal: AbortSignal.timeout(15_000),
          body: new URLSearchParams({
            client_key: clientKey,
            client_secret: clientSecret,
            token,
          }),
        },
      );
      return response.ok;
    }
  } catch (error) {
    console.error(
      `[medosha-social] revoke failed for ${platform}:`,
      error instanceof Error ? error.message : error,
    );
  }

  return false;
}
