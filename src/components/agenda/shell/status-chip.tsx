"use client";

import { cn } from "@/lib/utils";

/**
 * One status chip, for everything in Agenda that has a status.
 *
 * The brief asks for a consistent status system in Medosha's existing design
 * language, and the way to get one is to have a single component that owns the
 * mapping. A badge written inline in each module is how a project ends up with
 * four shades of amber all meaning "waiting".
 *
 * Colours come from the theme tokens the rest of the site uses — `brand`,
 * `muted`, `destructive` — rather than from raw Tailwind palette classes, so
 * Agenda follows the theme and dark mode without knowing they exist.
 */

export type StatusTone =
  | "neutral"
  | "info"
  | "active"
  | "warning"
  | "success"
  | "danger"
  | "muted";

const TONES: Record<StatusTone, string> = {
  neutral: "border-foreground/15 bg-muted text-muted-foreground",
  info: "border-brand/30 bg-brand/10 text-brand",
  active: "border-brand/40 bg-brand text-brand-foreground",
  // Amber is the one hue Medosha's tokens do not name, and "needs attention"
  // is a real state that neutral cannot say. Kept to a single definition here.
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  success:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  muted: "border-foreground/10 bg-transparent text-muted-foreground",
};

export function StatusChip({
  label,
  tone = "neutral",
  className,
}: {
  label: string;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
