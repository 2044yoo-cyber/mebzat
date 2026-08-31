"use client";

import { Printer } from "lucide-react";

/**
 * Print, or save as PDF.
 *
 * The browser's own dialog does both, and it does them better than a PDF
 * generator built here would: it has the fonts, it knows the paper size the
 * user's printer takes, it handles page breaks in the table, and it costs
 * nothing to ship. The work that makes this good is in the `print:` styles on
 * the page, not in a library.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
    >
      <Printer className="size-4" aria-hidden />
      Print or save as PDF
    </button>
  );
}
