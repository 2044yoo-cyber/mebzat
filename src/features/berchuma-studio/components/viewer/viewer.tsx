"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Box, Loader2, Ruler } from "lucide-react";

import { cn } from "@/lib/utils";

import { Elevation } from "./elevation";
import type { DesignSpec } from "../../types/spec";

/**
 * The drawing, flat or solid.
 *
 * Two views of the same spec, and the switch between them is the reason this
 * wrapper exists. Three.js and the WebGL renderer are by a wide margin the
 * heaviest thing Medosha can load, and on the connections this runs on that is
 * a real cost to a real person — so the 3D module is not in the page until
 * somebody presses the button.
 *
 * The elevation is the default, deliberately. It is the drawing a joiner
 * works from, it renders instantly, and it is legible on a 390 px screen where
 * an orbiting camera mostly is not.
 */

const Model = dynamic(() => import("./model"), {
  ssr: false,
  loading: () => <Loading />,
});

type View = "flat" | "solid";

export function Viewer({ spec }: { spec: DesignSpec }) {
  const [view, setView] = useState<View>("flat");
  // Closed doors are what the unit looks like; open ones are what the customer
  // is actually buying. The first thing anyone does to a wardrobe is open it.
  const [hideFronts, setHideFronts] = useState(false);
  // Once loaded, three.js stays loaded — but the canvas is only mounted while
  // it is being looked at, so switching back to the elevation releases the
  // WebGL context rather than leaving it running behind a hidden div.
  const [ready, setReady] = useState(false);

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Drawing style"
          className="flex gap-1 rounded-lg bg-muted p-0.5"
        >
          <ViewTab
            active={view === "flat"}
            onClick={() => setView("flat")}
            icon={Ruler}
            label="Elevation"
          />
          <ViewTab
            active={view === "solid"}
            onClick={() => setView("solid")}
            icon={Box}
            label="3D"
          />
        </div>

        {view === "solid" ? (
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={hideFronts}
              onChange={(event) => setHideFronts(event.target.checked)}
              className="size-3.5 accent-primary"
            />
            Show inside
          </label>
        ) : null}
      </div>

      <div className="aspect-[4/3] w-full @lg/ws:aspect-[16/10]">
        {view === "flat" ? (
          <Elevation spec={spec} />
        ) : (
          <Model
            spec={spec}
            hideFronts={hideFronts}
            onReady={() => setReady(true)}
          />
        )}
      </div>

      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        {view === "flat"
          ? "Front elevation, to scale."
          : ready
            ? "Drag to turn, pinch to zoom. Every panel is a part on the cut list."
            : "Building the model…"}
      </p>
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Box;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
        active ? "bg-background shadow-sm" : "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}

function Loading() {
  return (
    <div className="flex h-full w-full items-center justify-center gap-2 rounded-lg bg-muted/40 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      Loading the 3D view…
    </div>
  );
}
