"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  CircleSlash,
  Clock,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  Server,
  ShieldAlert,
  Wallet,
  WifiOff,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import {
  CAPABILITY_LABEL,
  COST_LABEL,
  IMAGE_PROVIDERS,
  STRENGTH_LABEL,
  modelsByProvider,
  type ImageProviderName,
} from "@/lib/ai/image-models";
import {
  PROVIDER_STATUS,
  isUsable,
  type ProviderHealth,
  type ProviderStatus,
} from "@/lib/ai/provider-status";
import { cn } from "@/lib/utils";

/**
 * The AI provider manager.
 *
 * One row per provider: whether it is connected, *why* not when it is not,
 * what it can do, roughly what it costs and how fast it is, and when it last
 * actually worked.
 *
 * Keys are not entered here. They are read from the server's environment, and
 * a field on this page would mean shipping a secret through the browser to get
 * it there — which is the one thing this feature must never do. What the page
 * *can* do is test the keys that are already set, which is what turns "a key
 * is present" into "a key works".
 */

export type ProviderRow = ProviderHealth & {
  label: string;
  signupUrl: string;
  blurb: string;
  selfHosted: boolean;
  catalogue: string[];
};

const ICONS: Record<ProviderStatus, typeof CheckCircle2> = {
  connected: CheckCircle2,
  missing_key: KeyRound,
  invalid_key: CircleAlert,
  no_access: ShieldAlert,
  quota_exceeded: Wallet,
  rate_limited: Clock,
  model_unavailable: CircleSlash,
  network_error: WifiOff,
  provider_down: CircleSlash,
  unchecked: CircleSlash,
};

export const STATUS_TONE: Record<
  ProviderStatus,
  { dot: string; text: string; border: string }
> = {
  connected: {
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/40",
  },
  missing_key: {
    dot: "bg-muted-foreground/40",
    text: "text-muted-foreground",
    border: "",
  },
  invalid_key: {
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    border: "border-rose-500/40",
  },
  no_access: {
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    border: "border-rose-500/40",
  },
  quota_exceeded: {
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    border: "border-rose-500/40",
  },
  rate_limited: {
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/40",
  },
  model_unavailable: {
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/40",
  },
  network_error: {
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/40",
  },
  provider_down: {
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/40",
  },
  unchecked: {
    dot: "bg-muted-foreground/40",
    text: "text-muted-foreground",
    border: "",
  },
};

/** Relative time, to the nearest useful unit. */
export function ago(at: number | null): string {
  if (!at) return "never";
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ProviderManager() {
  const [rows, setRows] = useState<ProviderRow[] | null>(null);
  const [testing, setTesting] = useState<ImageProviderName | null>(null);
  const [testingAll, setTestingAll] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        // Probing on open: the person who navigated here came to find out
        // what is broken, so a cached "not checked yet" would waste the trip.
        const response = await fetch("/api/ai/image/providers?probe=1", {
          signal: controller.signal,
        });
        if (!response.ok) {
          setRows([]);
          return;
        }
        const payload = (await response.json()) as { providers?: ProviderRow[] };
        setRows(payload.providers ?? []);
      } catch {
        if (!controller.signal.aborted) setRows([]);
      }
    })();
    return () => controller.abort();
  }, []);

  const test = useCallback(async (provider: ImageProviderName) => {
    setTesting(provider);
    try {
      const response = await fetch("/api/ai/image/providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const payload = (await response.json()) as { provider?: ProviderRow };
      if (payload.provider) {
        const updated = payload.provider;
        setRows((current) =>
          (current ?? []).map((row) =>
            row.provider === updated.provider ? updated : row,
          ),
        );
        toast[isUsable(updated.status) ? "success" : "error"](
          `${updated.label}: ${PROVIDER_STATUS[updated.status].label}`,
        );
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setTesting(null);
    }
  }, []);

  const testAll = useCallback(async () => {
    setTestingAll(true);
    try {
      const response = await fetch("/api/ai/image/providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const payload = (await response.json()) as { providers?: ProviderRow[] };
      const next = payload.providers ?? [];
      setRows(next);

      const working = next.filter((row) => isUsable(row.status)).length;
      const configured = next.filter(
        (row) => row.status !== "missing_key",
      ).length;

      if (configured === 0) {
        toast.error("No provider is configured yet.");
      } else if (working === 0) {
        toast.error(`Tested ${configured}. None are working.`);
      } else {
        toast.success(
          `${working} of ${configured} working.`,
        );
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setTestingAll(false);
    }
  }, []);

  const names = Object.keys(IMAGE_PROVIDERS) as ImageProviderName[];

  if (rows === null) {
    return (
      <div className="space-y-2">
        {names.map((provider) => (
          <div
            key={provider}
            className="h-24 animate-pulse rounded-2xl border bg-muted/40"
          />
        ))}
      </div>
    );
  }

  const working = rows.filter((row) => isUsable(row.status));
  const configured = rows.filter((row) => row.status !== "missing_key");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/30 p-4">
        <div className="flex min-w-0 items-start gap-3 text-sm">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            Keys live in{" "}
            <code className="rounded bg-muted px-1">.env.local</code> on the
            server and are never sent to the browser — which is why there is no
            field here to paste one into. Add a key, restart, then test.
            {configured.length > 0 && (
              <>
                {" "}
                <strong className="font-medium text-foreground">
                  {working.length} of {configured.length}
                </strong>{" "}
                working.
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={testAll}
          disabled={testingAll}
          className="flex h-9 shrink-0 items-center gap-2 rounded-xl bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {testingAll ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Test Providers
        </button>
      </div>

      <ul className="space-y-2">
        {rows.map((row) => {
          const provider = IMAGE_PROVIDERS[row.provider];
          const models = modelsByProvider(row.provider);
          const freeModels = models.filter((model) => model.free);
          const meta = PROVIDER_STATUS[row.status];
          const tone = STATUS_TONE[row.status];
          const Icon = ICONS[row.status];

          // Averages across the provider's models, which is what the row is
          // summarising — not a single model's figures.
          const avgSpeed =
            models.length > 0
              ? models.reduce((sum, model) => sum + model.speed, 0) / models.length
              : 0;
          const avgQuality =
            models.length > 0
              ? models.reduce((sum, model) => sum + model.quality, 0) / models.length
              : 0;
          const cheapest = models.reduce<number | null>(
            (lowest, model) =>
              lowest === null || model.costPerImage < lowest
                ? model.costPerImage
                : lowest,
            null,
          );

          const capabilities = [
            ...new Set(models.flatMap((model) => model.capabilities)),
          ];
          const strengths = [
            ...new Set(models.flatMap((model) => model.strengths)),
          ];

          return (
            <li
              key={row.provider}
              className={cn("rounded-2xl border p-4", tone.border)}
            >
              <div className="flex flex-wrap items-start gap-3">
                {/* A lettered tile rather than a fetched logo: an external
                    image request per provider is a tracking surface and a
                    failure mode for something purely decorative. */}
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted text-sm font-semibold"
                >
                  {provider.selfHosted ? (
                    <Server className="size-4" />
                  ) : (
                    provider.label.slice(0, 2)
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{provider.label}</span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs font-medium",
                        tone.text,
                      )}
                    >
                      <Icon className="size-3.5" />
                      {meta.mark === "ok" ? "✓" : meta.mark === "fail" ? "✗" : ""}{" "}
                      {meta.label}
                    </span>
                    {freeModels.length > 0 && (
                      <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                        {freeModels.length} free
                      </span>
                    )}
                  </div>

                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {row.reason ?? provider.blurb}
                  </p>

                  {/* The fix, when there is one to give. This is the line that
                      turns a red row into something the reader can act on. */}
                  {meta.fix && !isUsable(row.status) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {meta.fix}
                    </p>
                  )}

                  <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    <Stat label="Models" value={String(models.length)} />
                    <Stat
                      label="Cheapest"
                      value={
                        cheapest === null
                          ? "—"
                          : cheapest === 0
                            ? "Free"
                            : `$${cheapest.toFixed(3)}/image`
                      }
                    />
                    <Stat label="Speed" value={<Dots value={avgSpeed} />} />
                    <Stat label="Quality" value={<Dots value={avgQuality} />} />
                    <Stat
                      label="Checked"
                      value={
                        row.checkedAt
                          ? `${ago(row.checkedAt)}${row.ms !== null ? ` · ${row.ms}ms` : ""}`
                          : "never"
                      }
                    />
                    {row.lastSuccessAt && (
                      <Stat
                        label="Last success"
                        value={ago(row.lastSuccessAt)}
                      />
                    )}
                    {row.quota && (
                      <Stat label={row.quota.label} value={row.quota.value} />
                    )}
                  </dl>

                  {capabilities.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1">
                      {capabilities.map((capability) => (
                        <li
                          key={capability}
                          className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {CAPABILITY_LABEL[capability]}
                        </li>
                      ))}
                      {strengths.map((strength) => (
                        <li
                          key={strength}
                          className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {STRENGTH_LABEL[strength]}
                        </li>
                      ))}
                    </ul>
                  )}

                  {models.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-brand hover:underline">
                        {models.length} {models.length === 1 ? "model" : "models"}
                      </summary>
                      <ul className="mt-1.5 space-y-1">
                        {models.map((model) => (
                          <li
                            key={model.id}
                            className="flex flex-wrap items-center gap-2 text-xs"
                          >
                            <span className="font-medium">{model.label}</span>
                            <span className="text-muted-foreground">
                              {COST_LABEL[model.cost]}
                              {model.costPerImage > 0 &&
                                ` · $${model.costPerImage.toFixed(3)}`}
                            </span>
                            <span className="flex items-center gap-0.5 text-muted-foreground">
                              <Zap className="size-3" />
                              <Dots value={model.speed} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => test(row.provider)}
                    disabled={testing === row.provider || testingAll}
                    className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors hover:border-brand disabled:opacity-40"
                  >
                    {testing === row.provider || testingAll ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3.5" />
                    )}
                    Test
                  </button>

                  {/* Every variable it needs, so a two-variable provider does
                      not look broken when only one of them is missing. */}
                  {!row.keyPresent && (
                    <>
                      {row.keyVars.map((keyVar) => (
                        <code
                          key={keyVar}
                          className="rounded bg-muted px-1.5 py-0.5 text-[11px]"
                        >
                          {keyVar}
                        </code>
                      ))}
                      <a
                        href={provider.signupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                      >
                        {provider.selfHosted ? "Set it up" : "Get a key"}
                        <ExternalLink className="size-2.5" />
                      </a>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <dt>{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

/** Five dots, filled to the rating. Reads faster than "4.2/5". */
function Dots({ value }: { value: number }) {
  const filled = Math.round(value);
  return (
    <span aria-label={`${filled} out of 5`} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((step) => (
        <span
          key={step}
          aria-hidden
          className={cn(
            "size-1 rounded-full",
            step <= filled ? "bg-foreground" : "bg-muted-foreground/30",
          )}
        />
      ))}
    </span>
  );
}
