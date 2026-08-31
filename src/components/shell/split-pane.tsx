"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, RefreshCw, X } from "lucide-react";

import { LINKED_NAV_ITEMS, matchNavItem } from "@/lib/workspace/navigation";
import { update } from "@/lib/workspace/store";
import { cn } from "@/lib/utils";

/**
 * The second half of a split workspace.
 *
 * Rendered in a same-origin iframe. Next renders one route tree per router, so
 * a second *live* page — its own data, its own scroll, its own map — cannot be
 * a second subtree of the first. The frame gets its own router and its own
 * React root, which is exactly what "Marketplace on the left, AI on the right,
 * both working" requires.
 *
 * The `_pane` flag tells the shell in the frame to render bare, so there is
 * one sidebar and one context panel rather than a shell inside a shell.
 */
export function SplitPane({ href }: { href: string }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [picking, setPicking] = useState(false);

  const src = useMemo(() => {
    const [path = "/", query = ""] = href.split("?");
    const params = new URLSearchParams(query);
    params.set("_pane", "1");
    return `${path}?${params.toString()}`;
  }, [href]);

  const label = useMemo(() => {
    const [path = "/", query = ""] = href.split("?");
    const item = matchNavItem(path, new URLSearchParams(query));
    return item?.label ?? path;
  }, [href]);

  return (
    <div className="flex h-full w-full min-w-0 flex-col border-l">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
        <button
          type="button"
          onClick={() => setPicking((previous) => !previous)}
          aria-expanded={picking}
          className="flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors hover:bg-muted"
        >
          <ArrowLeftRight className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
        </button>

        <button
          type="button"
          onClick={() => setReloadKey((previous) => previous + 1)}
          aria-label="Reload this pane"
          title="Reload"
          className="ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => update({ splitHref: null })}
          aria-label="Close split view"
          title="Close split"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {picking && (
        <div className="max-h-64 shrink-0 overflow-y-auto border-b p-1.5">
          {LINKED_NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                update({ splitHref: item.href });
                setPicking(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                item.href === href && "bg-muted font-medium",
              )}
            >
              <item.icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {item.section.label}
              </span>
            </button>
          ))}
        </div>
      )}

      <iframe
        key={`${src}:${reloadKey}`}
        src={src}
        title={`${label} — split view`}
        className="min-h-0 w-full flex-1 border-0 bg-background"
      />
    </div>
  );
}
