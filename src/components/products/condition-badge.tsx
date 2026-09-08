import { CONDITIONS, USED_GRADES } from "@/lib/constants/product-categories";
import { cn } from "@/lib/utils";
import type { ProductCondition, UsedGrade } from "@/types/database.types";

/**
 * USED.
 *
 * Drawn from `products.condition` and from nothing else. There is no separate
 * "mark this as used" field a seller could set independently, and no free-text
 * label that could say one thing while the column says another — the badge and
 * the marketplace section it implies are the same fact rendered twice.
 *
 * A new listing gets no badge. New is the default and the larger half of the
 * marketplace, and a badge on every card is a badge nobody reads.
 */
export function ConditionBadge({
  condition,
  grade,
  className,
  size = "normal",
}: {
  condition: ProductCondition;
  grade?: UsedGrade | null;
  className?: string;
  size?: "small" | "normal";
}) {
  if (condition === "new") return null;

  const info = CONDITIONS[condition];
  const detail = grade ? USED_GRADES[grade] : null;

  return (
    <span
      title={detail ? `${info.detail} ${detail.detail}` : info.detail}
      className={cn(
        "inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/10 font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400",
        size === "small"
          ? "px-1.5 py-0 text-[10px]"
          : "px-2 py-0.5 text-[11px]",
        className,
      )}
    >
      {info.short}
    </span>
  );
}

/** "Used — Good condition", for a detail page rather than a card corner. */
export function conditionSentence(
  condition: ProductCondition,
  grade?: UsedGrade | null,
): string {
  const info = CONDITIONS[condition];
  if (condition === "new" || !grade) return info.label;
  return `${info.label} — ${USED_GRADES[grade].label.toLowerCase()} condition`;
}
