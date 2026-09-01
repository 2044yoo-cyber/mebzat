import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Share2 } from "lucide-react";

import { ConnectedAccounts } from "@/components/social/connected-accounts";
import { getConnectedAccounts } from "@/lib/data/content";
import { SOCIAL_PLATFORMS } from "@/lib/social/platforms";
import { enabledPlatforms, hasCredentials } from "@/lib/social/settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Connected social accounts",
};

export const dynamic = "force-dynamic";

/**
 * Connected Social Accounts.
 *
 * The accounts come from `social_accounts_public`, which carries no token
 * columns at all — so there is nothing on this page for a token to leak
 * through, and nothing a component could accidentally serialise into the HTML.
 *
 * Whether each platform is *available* is computed on the server, because it
 * depends on environment variables. Only the boolean crosses to the browser.
 */
export default async function SocialSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/settings/social");

  const [accounts, enabled] = await Promise.all([
    getConnectedAccounts(),
    enabledPlatforms(),
  ]);

  const configured = Object.fromEntries(
    SOCIAL_PLATFORMS.map((platform) => [platform, hasCredentials(platform)]),
  );

  const params = await searchParams;
  const notice = noticeFor(params);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <Share2 className="size-5 text-brand" aria-hidden />
        Social accounts
      </h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Connect the accounts Medosha may publish to. Nothing is ever posted
        without your approval.
      </p>

      {notice ? (
        <p
          className={`mb-4 rounded-lg border p-3 text-sm ${
            notice.tone === "ok"
              ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
              : notice.tone === "warn"
                ? "border-amber-500/40 bg-amber-500/5 text-amber-900 dark:text-amber-200"
                : "border-destructive/40 bg-destructive/5 text-destructive"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <ConnectedAccounts
        accounts={accounts}
        configured={configured}
        enabled={enabled}
      />
    </div>
  );
}

/**
 * The message after a redirect back from a platform.
 *
 * The `message` parameter is text this server put there — the platform's own
 * explanation of why a connection failed, which is often the actionable part
 * ("no Instagram Professional account is linked"). It is rendered as text by
 * React, so it cannot carry markup, and it is capped so a crafted link cannot
 * fill the page.
 */
function noticeFor(
  params: Record<string, string | string[] | undefined>,
): { tone: "ok" | "warn" | "bad"; text: string } | null {
  const first = (key: string): string | null => {
    const value = params[key];
    return typeof value === "string" ? value : null;
  };

  if (first("connected")) {
    return { tone: "ok", text: "Account connected." };
  }

  if (first("warning")) {
    return {
      tone: "warn",
      text: "Account connected, but it cannot publish yet. See the note below.",
    };
  }

  if (first("cancelled")) {
    return { tone: "warn", text: "Connection cancelled — nothing was changed." };
  }

  const error = first("error");
  if (!error) return null;

  const detail = first("message");

  switch (error) {
    case "unavailable":
      return {
        tone: "bad",
        text: "That platform is not available on this site yet.",
      };
    case "state":
      return {
        tone: "bad",
        text: "That connection link had expired or did not start here. Try again from this page.",
      };
    case "exchange":
      return {
        tone: "bad",
        text: detail ? detail.slice(0, 400) : "The account could not be connected.",
      };
    case "signin":
      return { tone: "bad", text: "Sign in and try again." };
    default:
      return { tone: "bad", text: "The account could not be connected." };
  }
}
