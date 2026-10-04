"use client";

import Link from "next/link";
import { ExternalLink, KeyRound, Settings2 } from "lucide-react";

import {
  IMAGE_MODELS,
  IMAGE_PROVIDERS,
  type ImageProviderName,
} from "@/lib/ai/image-models";
import {
  PROVIDER_STATUS,
  isUsable,
  type ProviderHealth,
} from "@/lib/ai/provider-status";
import { cn } from "@/lib/utils";

/**
 * What to do when no image provider is working.
 *
 * The brief asked for a configuration panel rather than a silent failure, and
 * this is the whole of it: which variable to set, where to get the value, and
 * which of them are free. Keys are set in `.env.local` on the server and never
 * typed into the browser — a field here would mean shipping a key to the
 * client, which is the one thing this feature must not do.
 *
 * When health is known it says *why* rather than just "not configured": a key
 * that was set and rejected is a different sentence from a key that was never
 * added, and the person reading this is the one who can tell them apart.
 */
export function ConfigPanel({
  configured,
  health,
  className,
}: {
  configured: ImageProviderName[];
  /** Per-provider status, when the caller has it. */
  health?: Pick<ProviderHealth, "provider" | "status" | "reason" | "keyVars">[];
  className?: string;
}) {
  const providers = Object.keys(IMAGE_PROVIDERS) as ImageProviderName[];
  const free: ImageProviderName[] = ["fal", "together", "huggingface", "replicate"];

  const statusOf = (name: ImageProviderName) =>
    health?.find((entry) => entry.provider === name) ?? null;

  // Keys that are set and not working. The distinction the old panel missed.
  const failing = (health ?? []).filter(
    (entry) => entry.status !== "missing_key" && !isUsable(entry.status),
  );

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-300">
            {configured.length > 0
              ? "Add another provider for more models"
              : failing.length > 0
                ? failing.length === 1
                  ? "One provider is configured, and it is not working"
                  : `${failing.length} providers are configured, and none are working`
                : "No image provider is configured yet"}
          </p>

          {failing.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {failing.map((entry) => (
                <li key={entry.provider}>
                  <span className="font-medium text-foreground">
                    {IMAGE_PROVIDERS[entry.provider].label}
                  </span>{" "}
                  — {entry.reason ?? PROVIDER_STATUS[entry.status].label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">
              Set one key in{" "}
              <code className="rounded bg-muted px-1">.env.local</code> and
              restart the dev server. Keys stay on the server — nothing is
              entered here, and nothing is sent to the browser. Four of these
              have a free tier.
            </p>
          )}

          <Link
            href="/settings#ai-providers"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
          >
            <Settings2 className="size-3" />
            Test providers in Settings
          </Link>
        </div>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {providers.map((name) => {
          const provider = IMAGE_PROVIDERS[name];
          const ready = configured.includes(name);
          const entry = statusOf(name);
          const broken = entry && !isUsable(entry.status) && entry.status !== "missing_key";
          const count = IMAGE_MODELS.filter(
            (model) => model.provider === name,
          ).length;

          return (
            <li
              key={name}
              className={cn(
                "rounded-xl border p-3",
                ready && "border-emerald-500/40 bg-emerald-500/5",
                broken && "border-rose-500/40 bg-rose-500/5",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{provider.label}</span>
                {ready ? (
                  <span className="rounded-full border border-emerald-500/40 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    ✓ Connected
                  </span>
                ) : broken ? (
                  <span className="rounded-full border border-rose-500/40 px-2 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-400">
                    ✗ {PROVIDER_STATUS[entry.status].label}
                  </span>
                ) : free.includes(name) ? (
                  <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                    Free tier
                  </span>
                ) : null}
                <span className="ml-auto text-xs text-muted-foreground">
                  {count} {count === 1 ? "model" : "models"}
                </span>
              </div>

              <p className="mt-1 text-sm text-muted-foreground">
                {broken
                  ? (entry.reason ?? PROVIDER_STATUS[entry.status].fix ?? provider.blurb)
                  : provider.blurb}
              </p>

              {!ready && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {(entry?.keyVars ?? [provider.keyVar]).map((keyVar) => (
                    <code
                      key={keyVar}
                      className="rounded bg-muted px-1.5 py-0.5 text-xs"
                    >
                      {keyVar}=…
                    </code>
                  ))}
                  <a
                    href={provider.signupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                  >
                    {provider.selfHosted ? "Set it up" : "Get a key"}
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
