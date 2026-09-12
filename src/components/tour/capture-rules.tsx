"use client";

import { useState } from "react";
import { ArrowLeftRight, MoveHorizontal, Ruler, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * How to shoot a 360, before shooting one.
 *
 * Every panorama that comes out melted comes out melted for one of four
 * reasons, and all four are things the person is doing rather than things the
 * software can fix afterwards. Walking while turning is the big one: the
 * stitcher assumes every frame was taken from the same point, and a metre of
 * travel between two frames cannot be reconciled by any seam, so the wall
 * arrives twice at two different sizes.
 *
 * A single paragraph of instructions on the intro screen does not get read.
 * Four cards, one rule each, with an illustration and a Next button, do — and
 * they are skippable, because somebody on their fourth room should not have to
 * read them again.
 */

type Rule = {
  title: string;
  detail: string;
  /** Why it matters, in the terms of what goes wrong without it. */
  because: string;
  icon: typeof Target;
};

export const CAPTURE_RULES: Rule[] = [
  {
    title: "Stand in one place",
    detail: "Turn on the spot. Don't walk while you shoot.",
    because:
      "Every photo has to be taken from the same point. A step between two of them and the wall arrives twice, at two different sizes.",
    icon: ArrowLeftRight,
  },
  {
    title: "Keep the phone close to your chest",
    detail: "Hold it upright, elbows in, and turn your whole body.",
    because:
      "Turning your arm swings the camera through an arc. Turning your body keeps it over one spot, which is what the stitcher is expecting.",
    icon: Ruler,
  },
  {
    title: "Line the circle up with the box",
    detail: "The box is the next photo. Put the circle over it and hold still.",
    because:
      "It takes each photo for you when you get there, so you are never pressing a button with the hand holding the phone steady.",
    icon: Target,
  },
  {
    title: "Turn slowly, all the way round",
    detail: "About one full turn over half a minute. Don't stop halfway.",
    because:
      "Photos need to overlap to be joined. Turning fast leaves gaps between them, and a gap cannot be filled in — only left as a hole.",
    icon: MoveHorizontal,
  },
];

export function CaptureRules({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);
  const rule = CAPTURE_RULES[step];
  const last = step === CAPTURE_RULES.length - 1;
  const Icon = rule.icon;

  return (
    <div className="space-y-5 rounded-2xl border p-5 text-center">
      <div className="flex justify-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-brand/10 text-brand">
          <Icon className="size-9" aria-hidden />
        </span>
      </div>

      <div className="space-y-1.5">
        <h3 className="text-lg font-medium">{rule.title}</h3>
        <p className="text-sm text-muted-foreground">{rule.detail}</p>
      </div>

      {/* The reason, not just the rule. Somebody who knows why the photo has
          to come from one spot will hold the phone right in a room this
          screen never anticipated. */}
      <p className="rounded-xl bg-muted/60 p-3 text-left text-xs text-muted-foreground">
        {rule.because}
      </p>

      <div
        className="flex justify-center gap-1.5"
        role="progressbar"
        aria-label="Instructions"
        aria-valuemin={1}
        aria-valuemax={CAPTURE_RULES.length}
        aria-valuenow={step + 1}
      >
        {CAPTURE_RULES.map((entry, index) => (
          <span
            key={entry.title}
            className={cn(
              "h-1.5 rounded-full transition-all",
              index === step ? "w-6 bg-brand" : "w-1.5 bg-muted-foreground/30",
            )}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}
          className="min-h-12"
        >
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        <Button
          onClick={() => (last ? onDone() : setStep(step + 1))}
          className="min-h-12 text-base"
        >
          {last ? "Start 360 Capture" : "Next"}
        </Button>
      </div>

      {/* Somebody on their fourth room should not read this four times. */}
      {!last && (
        <button
          type="button"
          onClick={onDone}
          className="min-h-9 text-xs text-muted-foreground underline underline-offset-4"
        >
          Skip and start
        </button>
      )}
    </div>
  );
}
