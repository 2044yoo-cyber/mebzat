import { Info } from "lucide-react";

import { I18nText } from "@/components/i18n/i18n-text";
import { cn } from "@/lib/utils";

/**
 * The line under an AI answer or a cost estimate that says it is one.
 *
 * Not a modal — the brief is explicit that this must not interrupt anything,
 * and a dialog every time Medosha AI answers is the fastest way to train
 * somebody to click through it without reading it. This sits in the flow
 * instead: small, muted, present every time the kind of content it describes
 * is shown, and never asking for a click to dismiss it.
 *
 * One component with two kinds rather than two components, because the two
 * disclaimers are the same shape and a caller choosing between
 * `<AiDisclaimer>` and `<BoqDisclaimer>` is one more place the wrong one gets
 * picked. `kind` is the only decision left to make.
 */
export function ContentDisclaimer({
  kind,
  className,
}: {
  kind: "ai" | "boq";
  className?: string;
}) {
  return (
    <p
      role="note"
      className={cn(
        "flex items-start gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <I18nText textKey={kind === "ai" ? "legal.aiDisclaimer" : "legal.boqDisclaimer"} />
    </p>
  );
}
