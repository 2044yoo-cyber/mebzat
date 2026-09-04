"use client";

import Link from "next/link";
import { useState } from "react";
import { Box, Camera, Rotate3d, Ruler } from "lucide-react";

import { FloorPlanViewer } from "@/components/tour/floor-plan-viewer";
import { TourPlayer } from "@/components/tour/tour-player";
import type { FloorPlan } from "@/lib/tour/floor-plans";
import type { TourScene } from "@/lib/tour/queries";
import { cn } from "@/lib/utils";

/**
 * Everything there is to look at, for one place.
 *
 * The 360° tour, the floor plan, the photographs and the 3D view are four ways
 * of answering the same question — what is this place like — and a buyer moves
 * between them constantly. So they are one screen with large, obvious choices
 * rather than four pages, and the plan and the tour each offer a way into the
 * other: read the layout, then walk it; walk into a room, then find it on the
 * plan.
 *
 * A choice with nothing behind it is not shown. An empty card that does
 * nothing when tapped is worse than an absent one, because it reads as broken.
 */

type Panel = "tour" | "photos" | "model";

export function PropertyVisualisation({
  title,
  scenes,
  plans,
  photoHref,
  modelHref,
}: {
  title: string;
  scenes: TourScene[];
  plans: FloorPlan[];
  /** Where the photographs live, when there are any. */
  photoHref?: string | null;
  /** The 3D view, when the place has one. */
  modelHref?: string | null;
}) {
  const [panel, setPanel] = useState<Panel>("tour");
  const [openPlan, setOpenPlan] = useState<FloorPlan | null>(null);

  const hasTour = scenes.length > 0;
  const hasPlans = plans.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {hasPlans && (
          <ContentCard
            icon={Ruler}
            label="Floor plan"
            hint={
              plans.length === 1
                ? plans[0].title
                : `${plans.length} plans`
            }
            onClick={() => setOpenPlan(plans[0])}
          />
        )}

        {hasTour && (
          <ContentCard
            icon={Rotate3d}
            label="360° tour"
            hint={`${scenes.length} ${scenes.length === 1 ? "room" : "rooms"}`}
            active={panel === "tour"}
            onClick={() => setPanel("tour")}
          />
        )}

        {photoHref && (
          <ContentCard icon={Camera} label="Photos" hint="See the pictures" href={photoHref} />
        )}

        {modelHref && (
          <ContentCard icon={Box} label="3D view" hint="See the model" href={modelHref} />
        )}
      </div>

      {/* More than one plan is a list rather than a single card, so nobody has
          to guess which one the card opens. */}
      {plans.length > 1 && (
        <ul className="flex flex-wrap gap-2">
          {plans.map((plan) => (
            <li key={plan.id}>
              <button
                type="button"
                onClick={() => setOpenPlan(plan)}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
              >
                <Ruler className="size-3.5 text-muted-foreground" />
                {plan.title}
                {plan.pending && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400">
                    in review
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasTour && panel === "tour" && (
        <div className="space-y-2">
          <TourPlayer
            scenes={scenes}
            className="h-[70vh] min-h-[380px] w-full overflow-hidden rounded-2xl border sm:h-[65vh]"
          />

          {/* The way from a room back to the layout. Its opposite lives in the
              plan viewer's header. */}
          {hasPlans && (
            <button
              type="button"
              onClick={() => setOpenPlan(plans[0])}
              className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Ruler className="size-4" />
              View floor plan
            </button>
          )}
        </div>
      )}

      {!hasTour && !hasPlans && (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nothing to look at yet for {title}.
        </p>
      )}

      {openPlan && (
        <FloorPlanViewer
          plan={openPlan}
          onClose={() => setOpenPlan(null)}
          onOpenTour={
            hasTour
              ? () => {
                  setOpenPlan(null);
                  setPanel("tour");
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function ContentCard({
  icon: Icon,
  label,
  hint,
  href,
  onClick,
  active,
}: {
  icon: typeof Ruler;
  label: string;
  hint: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const body = (
    <>
      <Icon className="size-7" />
      <span className="text-sm font-medium">{label}</span>
      <span className="line-clamp-1 text-xs text-muted-foreground">{hint}</span>
    </>
  );

  const classes = cn(
    "flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border p-4 text-center transition-colors",
    active ? "border-brand bg-brand/5" : "hover:bg-muted/60",
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      {body}
    </button>
  );
}
