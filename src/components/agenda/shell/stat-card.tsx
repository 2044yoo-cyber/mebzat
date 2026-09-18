import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * One figure on the Agenda dashboard.
 *
 * A link when there is somewhere to go and a plain card when there is not — a
 * card that looks clickable and is not is worse than one that does not, and a
 * figure with nothing behind it is a figure nobody can act on.
 *
 * `tone` says what the number *means*, not what colour it is. Seven overdue
 * items is bad news whatever the palette does next.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  href,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  href?: string;
  hint?: string;
  tone?: "neutral" | "attention";
}) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "attention" && value !== 0 && "text-destructive",
        )}
      >
        {value}
      </span>
      {hint && (
        <span className="text-xs text-muted-foreground">{hint}</span>
      )}
    </>
  );

  const shell = "flex min-h-24 flex-col justify-between gap-1 rounded-xl border bg-card p-4";

  if (!href) return <div className={shell}>{body}</div>;

  return (
    <Link href={href} className={cn(shell, "transition-colors hover:border-brand")}>
      {body}
    </Link>
  );
}
