"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Loader2,
  Plug,
  Unplug,
} from "lucide-react";

import { disconnectAccount } from "@/lib/actions/social-accounts";
import { PLATFORM_SPECS, type SocialPlatform } from "@/lib/social/platforms";
import { cn } from "@/lib/utils";
import type { SocialAccountPublic } from "@/types/database.types";

/**
 * Connected Social Accounts.
 *
 * Reads the token-free view. There is no code path from this component to an
 * access token, and there could not be: the table grants members no select
 * policy, so even a component that asked for one would get nothing.
 *
 * ## Requirements are shown before the button, not after the failure
 *
 * Instagram will complete an entire OAuth flow on a personal account and then
 * refuse every publish. TikTok will publish privately until the site owner's
 * app passes audit. Both are stated here, above the Connect button, because
 * the moment to learn them is before spending five minutes on a consent screen.
 */

type Props = {
  accounts: SocialAccountPublic[];
  /** Platforms with app credentials on the server. */
  configured: Record<string, boolean>;
  /** Platforms the administrator has switched on. */
  enabled: string[];
};

export function ConnectedAccounts({ accounts, configured, enabled }: Props) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const byPlatform = new Map(
    accounts.map((account) => [account.platform, account]),
  );

  // Medosha's own feed is not a connection — there is nothing to authorise.
  const platforms: SocialPlatform[] = ["facebook", "instagram", "tiktok"];

  return (
    <div className="space-y-3">
      {message ? (
        <p
          className={cn(
            "flex items-start gap-2 rounded-lg border p-3 text-sm",
            message.ok
              ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
              : "border-destructive/40 bg-destructive/5 text-destructive",
          )}
        >
          {message.ok ? (
            <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          {message.text}
        </p>
      ) : null}

      {platforms.map((platform) => (
        <AccountCard
          key={platform}
          platform={platform}
          account={byPlatform.get(platform) ?? null}
          configured={configured[platform] === true}
          enabled={enabled.includes(platform)}
          onMessage={setMessage}
        />
      ))}

      <p className="pt-2 text-xs text-muted-foreground">
        Medosha never asks for a social media password and could not use one.
        Connections go through each platform&rsquo;s own sign-in, and the access
        it returns is stored on the server where the browser cannot read it.
      </p>
    </div>
  );
}

function AccountCard({
  platform,
  account,
  configured,
  enabled,
  onMessage,
}: {
  platform: SocialPlatform;
  account: SocialAccountPublic | null;
  configured: boolean;
  enabled: boolean;
  onMessage: (message: { ok: boolean; text: string }) => void;
}) {
  const spec = PLATFORM_SPECS[platform];
  const [pending, startTransition] = useTransition();
  const [showRequirements, setShowRequirements] = useState(false);

  const connected = account?.status === "connected";
  const problem =
    account?.status === "permission_required" ||
    account?.status === "expired" ||
    account?.status === "revoked";

  const available = configured && enabled;

  return (
    <div className="rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            connected
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : problem
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "bg-muted text-muted-foreground",
          )}
          aria-hidden
        >
          <Plug className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{spec.label}</p>
          <p className="truncate text-xs text-muted-foreground">
            {connected
              ? (account?.display_name ?? "Connected")
              : problem
                ? (account?.last_error ?? "Needs attention")
                : !configured
                  ? `Not available yet — the site owner needs to set ${spec.credentialVars.join(" and ")}`
                  : !enabled
                    ? "Switched off by the site administrator"
                    : "Not connected"}
          </p>
        </div>

        {connected || problem ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await disconnectAccount(platform);
                onMessage(
                  result.ok
                    ? {
                        ok: true,
                        text:
                          result.warning ??
                          `${spec.label} disconnected.`,
                      }
                    : { ok: false, text: result.error },
                );
              })
            }
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors hover:bg-muted disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Unplug className="size-3.5" aria-hidden />
            )}
            Disconnect
          </button>
        ) : available ? (
          // A plain link, not a fetch. The OAuth flow is a full-page redirect
          // to the platform, and an XHR cannot follow one.
          <a
            href={`/api/social/connect/${platform}`}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/85"
          >
            Connect
          </a>
        ) : (
          <span className="rounded-lg border px-3 py-1.5 text-xs text-muted-foreground">
            Unavailable
          </span>
        )}
      </div>

      {problem && account?.last_error ? (
        <p className="mt-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-900 dark:text-amber-200">
          {account.last_error}
        </p>
      ) : null}

      {spec.requirements.length > 0 ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowRequirements((open) => !open)}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {showRequirements ? "Hide" : "What this needs"}
          </button>

          {showRequirements ? (
            <>
              <ul className="mt-1.5 space-y-1">
                {spec.requirements.map((requirement) => (
                  <li
                    key={requirement}
                    className="flex gap-1.5 text-xs text-muted-foreground"
                  >
                    <span aria-hidden>·</span>
                    {requirement}
                  </li>
                ))}
              </ul>

              {spec.docs ? (
                <a
                  href={spec.docs}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-brand hover:underline"
                >
                  {spec.label}&rsquo;s own documentation
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
