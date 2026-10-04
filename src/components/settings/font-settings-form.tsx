"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { saveFontPreference } from "@/app/(dashboard)/settings/font-actions";
import {
  FONT_CHOICES,
  FONT_STORAGE_KEY,
  DEFAULT_FONT,
  type FontChoice,
} from "@/lib/constants/fonts";
import { cn } from "@/lib/utils";

/**
 * Choosing the reading face.
 *
 * The choice is applied to `<html>` the moment it is made, before anything is
 * saved, because a font setting that needs a round trip and a reload to show
 * you what you picked is a font setting nobody uses twice. Saving happens
 * behind that, and only a *failure* is announced — a toast confirming
 * something the reader can already see on the screen is noise.
 *
 * Each option is rendered in its own face. Describing a font in words is a
 * strange thing to ask somebody to do when the alternative is showing it.
 */
export function FontSettingsForm({ initial }: { initial: FontChoice }) {
  const [choice, setChoice] = useState<FontChoice>(initial);
  const [, startTransition] = useTransition();

  function pick(next: FontChoice) {
    setChoice(next);

    // `setAttribute` rather than `dataset.font =`. The React compiler's
    // immutability rule treats a DOM element's `dataset` as a value that must
    // not be assigned to, and it is not wrong to: this is a deliberate escape
    // from React's rendering into the document element React does not own.
    //
    // The default has no attribute of its own — `:root` is the default — so
    // choosing it removes the override rather than setting another one.
    if (next === DEFAULT_FONT) {
      document.documentElement.removeAttribute("data-font");
    } else {
      document.documentElement.setAttribute("data-font", next);
    }

    try {
      window.localStorage.setItem(FONT_STORAGE_KEY, next);
    } catch {
      // A private window refuses storage. The choice still applies to this
      // page, and for a signed-in reader the profile below is the real record.
    }

    startTransition(async () => {
      const result = await saveFontPreference(next);
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <section className="space-y-4 rounded-2xl border p-4 sm:p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Reading font</h2>
        <p className="text-sm text-muted-foreground">
          Applies everywhere on Medosha. Every option covers Amharic, Tigrinya
          and Afaan Oromo written in Fidel.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Reading font"
        className="grid gap-2 sm:grid-cols-3"
      >
        {FONT_CHOICES.map((option) => {
          const on = option.value === choice;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pick(option.value)}
              // Its own face, so the sample is the description.
              data-font={option.value}
              className={cn(
                "flex min-h-24 flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                on ? "border-brand bg-brand/5" : "hover:bg-muted",
              )}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="font-medium">{option.label}</span>
                {on && <Check className="size-4 shrink-0 text-brand" />}
              </span>
              <span
                className="text-lg"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                Medosha · መዶሻ
              </span>
              <span className="text-xs text-muted-foreground">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
