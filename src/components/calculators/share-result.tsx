"use client";

import { useState } from "react";

import { Check, Share2 } from "lucide-react";

import { safeText } from "@/lib/calculators/validate";
import type { CalcOutput } from "@/lib/calculators/types";

/**
 * Sending a result to somebody.
 *
 * The share is the **numbers**, not a link. A colleague on WhatsApp wants to
 * read "Concrete required: 7.560 m³" in the message, not tap through to a page
 * that recalculates from a URL somebody may have truncated.
 *
 * `navigator.share` is the native sheet on a phone — which is where nearly
 * every Medosha reader is — and the clipboard is the fallback on a desktop
 * browser that has no share sheet. Both are wrapped: a reader who dismisses
 * the sheet triggers an `AbortError`, and that is not a failure worth showing
 * anybody an error for.
 */
export function ShareResult({ title, output }: { title: string; output: CalcOutput }) {
  const [copied, setCopied] = useState(false);

  function text(): string {
    const lines = [
      title,
      "",
      `${output.headline.label}: ${safeText(output.headline.value)}${output.headline.unit ? ` ${output.headline.unit}` : ""}`,
      ...output.lines
        .filter((line) => !line.muted)
        .map((line) => `${line.label}: ${safeText(line.value)}${line.unit ? ` ${line.unit}` : ""}`),
    ];

    // The working goes too. Somebody being sent a quantity will ask where it
    // came from, and the answer travelling with it saves the second message.
    if (output.formula.length > 0) {
      lines.push("", "How it was worked out:", ...output.formula.map((step) => `  ${step}`));
    }

    lines.push("", "Worked out on Medosha — medosha.net/calculators");
    return lines.join("\n");
  }

  async function share() {
    const payload = text();
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, text: payload });
        return;
      }
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Dismissing the share sheet lands here, and so does a browser that
      // refuses clipboard access. Neither is worth an error message.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
    >
      {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
      {copied ? "Copied" : "Share"}
    </button>
  );
}
