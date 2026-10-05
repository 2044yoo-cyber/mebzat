"use client";

import { cn } from "@/lib/utils";

import type { SurfaceView } from "../../services/wardrobe-materials";

/**
 * Model view or Material view. Model is the clean white working drawing, the
 * one for judging proportions and construction; Material draws every board in
 * its own decor, the one for judging the finish. Two words a tap apart, so a
 * phone can flip between them without a menu.
 */
export function SurfaceToggle({ value, onChange, className }: { value: SurfaceView; onChange: (value: SurfaceView) => void; className?: string }) {
  return (
    <div role="group" aria-label="Surface view" className={cn("flex items-center gap-0.5 rounded-lg border bg-background/70 p-0.5 text-[11px] backdrop-blur-xl", className)}>
      {(["model", "material"] as const).map((entry) => (
        <button
          key={entry}
          type="button"
          aria-pressed={value === entry}
          onClick={() => onChange(entry)}
          className={cn("rounded-md px-2 py-1 transition-colors", value === entry ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {entry === "model" ? "Model" : "Material"}
        </button>
      ))}
    </div>
  );
}
