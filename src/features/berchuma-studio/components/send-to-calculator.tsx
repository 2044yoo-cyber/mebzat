"use client";

import Link from "next/link";

import { Calculator } from "lucide-react";

import { calculatorSlugForKind } from "@/lib/calculators/studio";
import type { DesignKind } from "../types/spec";

/**
 * The trip back out to the calculator.
 *
 * The furniture calculators send a design *in* — `/studio?kind=wardrobe&width=…`
 * — and this is the other direction, so the two are one loop rather than a
 * one-way door. Somebody who has widened a wardrobe here can take the new
 * width straight to the cut-list calculator without measuring it off the
 * screen and retyping it.
 *
 * Rendered only for the kinds that have a calculator. A design that started as
 * "custom" has nowhere to go, and a button that leads to a 404 is worse than
 * no button.
 */
export function SendToCalculator({ kind, width }: { kind: DesignKind; width: number }) {
  const slug = calculatorSlugForKind(kind);
  if (!slug) return null;

  const rounded = Math.round(width);

  return (
    <Link
      href={`/calculators/${slug}?width=${rounded}`}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors hover:bg-muted"
      title={`Open the ${slug.replace("-", " ")} calculator at ${rounded} mm`}
    >
      <Calculator className="size-3.5" />
      <span className="hidden sm:inline">Send to calculator</span>
    </Link>
  );
}
