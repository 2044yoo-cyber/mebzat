import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PropertyVisualisation } from "@/components/tour/visualisation";
import { getProperty } from "@/lib/data/properties";
import { listFloorPlans } from "@/lib/tour/floor-plans";
import { listToursFor } from "@/lib/tour/queries";
import { getTour } from "@/lib/tour/queries";

/**
 * A property's plans, for a property that has no tour.
 *
 * When there is a tour, /tour/[id] is where the plan, the rooms and the 360°
 * view all live together and this page is not linked. A plan can exist without
 * one, though — an off-plan flat with a layout and no photographs yet — and it
 * still needs somewhere to be read.
 */

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const property = await getProperty(id);
  return { title: property ? `${property.title} — floor plan` : "Floor plan" };
}

export default async function PropertyPlanPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const property = await getProperty(id);
  if (!property) notFound();

  const plans = await listFloorPlans({ propertyId: id });
  if (plans.length === 0) notFound();

  // When a plan belongs to a tour, that tour's rooms belong on this screen too
  // — the point of the pairing is reading the layout and then walking it.
  const tours = await listToursFor({ propertyId: id, ownerId: property.owner_id });
  const tour = tours.length > 0 ? await getTour(tours[0].id) : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:py-6">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href={`/property/${id}`}
          className="flex size-10 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Back to the listing"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold sm:text-xl">{property.title}</h1>
          <p className="text-xs text-muted-foreground">
            {plans.length} {plans.length === 1 ? "plan" : "plans"}
          </p>
        </div>
      </div>

      <PropertyVisualisation
        title={property.title}
        scenes={tour?.scenes ?? []}
        plans={plans}
        photoHref={`/property/${id}`}
      />
    </div>
  );
}
