import { FlaskConical } from "lucide-react";

import { I18nText } from "@/components/i18n/i18n-text";
import { cn } from "@/lib/utils";

/**
 * Seeded content, labelled so it cannot be mistaken for a real listing, a
 * real product, or a real person's work.
 *
 * The property listing badge and Medosha Invest already had their own way of
 * saying this — `ListingBadges` for a property, `DemoBadge` scoped under
 * `@/components/invest` for a project — and this is not a third one. It is
 * for the places that had neither and were instead writing the same little
 * amber pill inline each time a new card needed it: a product, a feed post,
 * anywhere else sample data shows up. Two shapes cover both: a `pill` for a
 * card corner, and `text` for a badge sitting inline in a line of meta text,
 * which a pill would visually overpower.
 *
 * Renders nothing when `demo` is false, which is how a real listing looks —
 * the badge is never present by omission, only ever explicit.
 */
export function DemoBadge({
  demo = true,
  label,
  title = "Placed by Medosha to show what this section looks like. Not a real listing, product, or account.",
  variant = "pill",
  size = "default",
  className,
}: {
  demo?: boolean;
  /** Defaults to the translated "Sample" — pass one only to say something more specific. */
  label?: string;
  title?: string;
  variant?: "pill" | "text";
  size?: "default" | "sm";
  className?: string;
}) {
  if (!demo) return null;

  const text = label ?? <I18nText textKey="common.sampleData" />;

  if (variant === "text") {
    return (
      <span
        title={title}
        className={cn("tracking-wide uppercase", className)}
      >
        {text}
      </span>
    );
  }

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-transparent bg-amber-500 font-semibold tracking-wide text-amber-950 uppercase",
        size === "sm" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]",
        className,
      )}
    >
      <FlaskConical className={size === "sm" ? "size-2.5" : "size-3"} />
      {text}
    </span>
  );
}
