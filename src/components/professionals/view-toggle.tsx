"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { List, Map as MapIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * List or map.
 *
 * In the URL like every other filter, so a map view is a link somebody can
 * send and the back button goes back to the list rather than off the page.
 */
export function ViewToggle() {
  const router = useRouter();
  const params = useSearchParams();
  const view = params.get("view") === "map" ? "map" : "list";

  function choose(next: "list" | "map") {
    const query = new URLSearchParams(params.toString());
    if (next === "map") query.set("view", "map");
    else query.delete("view");
    const qs = query.toString();
    router.push(qs ? `/professionals?${qs}` : "/professionals");
  }

  return (
    <div className="inline-flex shrink-0 rounded-full border p-0.5">
      {(
        [
          { id: "list" as const, label: "List", icon: List },
          { id: "map" as const, label: "Map", icon: MapIcon },
        ]
      ).map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => choose(id)}
          aria-pressed={view === id}
          className={cn(
            "flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm transition-colors",
            view === id
              ? "bg-brand text-brand-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
