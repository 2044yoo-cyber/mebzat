import { FlaskConical, Info } from "lucide-react";

import { DEMO_BADGE, DEMO_NOTICE, DEMO_SUBTITLE } from "@/lib/constants/invest";
import { cn } from "@/lib/utils";

/**
 * The demonstration disclosure.
 *
 * Medosha Invest shows funding targets and expected returns. Those numbers
 * belong to sample projects, and a page that displays "45% expected ROI"
 * without saying so plainly is misleading whatever the intent. So the badge is
 * not decoration and it is not optional: every card, every header and every
 * search result that carries a figure carries this too.
 *
 * `<DemoNotice>` is the long form for the top of a page. `<DemoBadge>` is the
 * chip for a card corner. Neither renders when `demo` is false, which is how a
 * real project would appear if one were ever added.
 */

export function DemoBadge({
  demo = true,
  className,
  size = "default",
}: {
  demo?: boolean;
  className?: string;
  size?: "default" | "sm";
}) {
  if (!demo) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 font-semibold tracking-wide text-amber-600 uppercase dark:text-amber-400",
        size === "sm" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]",
        className,
      )}
      title={DEMO_NOTICE}
    >
      <FlaskConical className={size === "sm" ? "size-2.5" : "size-3"} />
      {DEMO_BADGE}
    </span>
  );
}

export function DemoNotice({
  demo = true,
  className,
}: {
  demo?: boolean;
  className?: string;
}) {
  if (!demo) return null;

  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4",
        className,
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 text-sm">
        <p className="font-medium text-amber-700 dark:text-amber-300">
          {DEMO_BADGE} — {DEMO_SUBTITLE}
        </p>
        <p className="mt-1 text-muted-foreground">{DEMO_NOTICE}</p>
      </div>
    </div>
  );
}
