"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import type { ProviderRow } from "@/components/ai/studio/provider-manager";
import { ago, STATUS_TONE } from "@/components/ai/studio/provider-manager";
import { PROVIDER_STATUS, isUsable } from "@/lib/ai/provider-status";
import { cn } from "@/lib/utils";

/**
 * The diagnostics table.
 *
 * One row per provider, every column being something an operator would
 * otherwise go to the server logs for: status, last successful request, last
 * error, available models, remaining quota.
 *
 * Deliberately a table rather than the card layout used in Settings. Settings
 * is for the person setting a provider up, one at a time; this is for the
 * person asking which of nine providers is broken, and a table is how you
 * answer that at a glance.
 */
export function Diagnostics() {
  const [rows, setRows] = useState<ProviderRow[] | null>(null);
  const [testing, setTesting] = useState(false);

  // First load: read the registry, probing anything stale. Written inline
  // rather than through the callback below so the effect body does no
  // synchronous state work at all.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/ai/image/providers?probe=1", {
          signal: controller.signal,
        });
        const payload = response.ok
          ? ((await response.json()) as { providers?: ProviderRow[] })
          : { providers: [] };
        setRows(payload.providers ?? []);
      } catch {
        if (!controller.signal.aborted) setRows([]);
      }
    })();
    return () => controller.abort();
  }, []);

  /** Re-probes every provider. The button, not the page load. */
  const retest = useCallback(async () => {
    setTesting(true);
    try {
      const response = await fetch("/api/ai/image/providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) {
        toast.error("Could not test the providers.");
        return;
      }
      const payload = (await response.json()) as { providers?: ProviderRow[] };
      const next = payload.providers ?? [];
      setRows(next);
      const working = next.filter((row) => isUsable(row.status)).length;
      toast.success(`${working} of ${next.length} connected.`);
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setTesting(false);
    }
  }, []);

  if (rows === null) {
    return <div className="h-64 animate-pulse rounded-2xl border bg-muted/40" />;
  }

  const working = rows.filter((row) => isUsable(row.status)).length;
  const configured = rows.filter((row) => row.status !== "missing_key").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          <strong className="font-medium text-foreground">{working}</strong>{" "}
          connected · {configured} configured · {rows.length} known
        </p>
        <button
          type="button"
          onClick={retest}
          disabled={testing}
          className="ml-auto flex h-9 items-center gap-2 rounded-xl bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {testing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Test Providers
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[64rem] text-sm">
          <thead className="border-b bg-muted/40 text-left">
            <tr className="text-xs text-muted-foreground uppercase">
              <Th>Provider</Th>
              <Th>Status</Th>
              <Th>Last success</Th>
              <Th>Last error</Th>
              <Th>Models</Th>
              <Th>Quota</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => {
              const meta = PROVIDER_STATUS[row.status];
              const tone = STATUS_TONE[row.status];

              return (
                <tr key={row.provider} className="align-top">
                  <Td>
                    <span className="font-medium">{row.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {row.keyVars.join(", ")}
                    </span>
                  </Td>

                  <Td>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 font-medium",
                        tone.text,
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn("size-1.5 rounded-full", tone.dot)}
                      />
                      {meta.mark === "ok" ? "✓" : meta.mark === "fail" ? "✗" : ""}{" "}
                      {meta.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      checked {ago(row.checkedAt)}
                      {row.ms !== null && ` · ${row.ms}ms`}
                    </span>
                  </Td>

                  <Td>
                    {row.lastSuccessAt ? (
                      <>
                        <span>{ago(row.lastSuccessAt)}</span>
                        {row.lastSuccessModel && (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {row.lastSuccessModel}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        no generation yet
                      </span>
                    )}
                  </Td>

                  <Td>
                    {row.lastError ? (
                      <>
                        <span className="text-rose-600 dark:text-rose-400">
                          {row.lastError}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {ago(row.lastErrorAt)}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">none</span>
                    )}
                  </Td>

                  <Td>
                    {/* What Medosha knows how to run, and — when the provider
                        will say — what it actually has. The two disagreeing is
                        itself a useful diagnosis. */}
                    <span className="text-xs">
                      {row.catalogue.length} in catalogue
                    </span>
                    {row.models && row.models.length > 0 && (
                      <details className="mt-0.5">
                        <summary className="cursor-pointer text-xs text-brand hover:underline">
                          {row.models.length} reported
                        </summary>
                        <ul className="mt-1 space-y-0.5">
                          {row.models.map((model) => (
                            <li
                              key={model}
                              className="font-mono text-[11px] text-muted-foreground"
                            >
                              {model}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </Td>

                  <Td>
                    {row.quota ? (
                      <>
                        <span className="font-medium">{row.quota.value}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {row.quota.label}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        not published
                      </span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Keys are read from the server environment and never leave it. This page
        reports only whether each variable is set and what the provider replied.
      </p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2.5">{children}</td>;
}
