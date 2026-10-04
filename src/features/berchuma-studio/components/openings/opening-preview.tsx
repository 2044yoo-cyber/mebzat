"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Box, Loader2, Ruler } from "lucide-react";

import { cn } from "@/lib/utils";

import { OpeningElevation } from "./opening-elevation";
import type { OpeningSpec } from "../../types/openings";

/**
 * The opening, flat or solid.
 *
 * The same bargain the cabinet viewer strikes, for the same reason: three.js
 * and a WebGL context are by a wide margin the heaviest thing Medosha loads,
 * and on the connections this runs on that is a real cost to a real person.
 * So the 3D module is not in the page until somebody asks for it, and the
 * canvas is unmounted when they switch away rather than left running behind a
 * hidden div.
 *
 * The elevation is the default. It is the drawing a fabricator works from, it
 * renders instantly, and on a 390 px screen it is more legible than an
 * orbiting camera.
 */

const Model = dynamic(() => import("./opening-model"), {
  ssr: false,
  loading: () => <Loading />,
});

export function OpeningPreview({ spec }: { spec: OpeningSpec }) {
  const [view, setView] = useState<"flat" | "solid">("flat");

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border bg-muted/30 sm:aspect-[16/10]">
      {view === "flat" ? <OpeningElevation spec={spec} /> : <Model spec={spec} />}

      <div className="absolute right-3 top-3 flex gap-1 rounded-full border bg-background/90 p-1 backdrop-blur">
        <Toggle active={view === "flat"} onClick={() => setView("flat")} label="Elevation">
          <Ruler className="size-3.5" />
        </Toggle>
        <Toggle active={view === "solid"} onClick={() => setView("solid")} label="3D">
          <Box className="size-3.5" />
        </Toggle>
      </div>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-brand text-brand-foreground"
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
      {label}
    </button>
  );
}

function Loading() {
  return (
    <div className="grid size-full place-items-center text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}
