import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TourBuilder } from "@/components/tour/tour-builder";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New 360° tour" };

/**
 * A tour can be attached to a property, a building or a project as it is
 * created — the link is passed in the query string by whichever page sent the
 * person here. It is not trusted: the server action writes the id, and the
 * row policies on properties, buildings and projects decide whether it holds.
 */
export default async function NewTourPage(props: {
  searchParams: Promise<{ property?: string; building?: string; project?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=%2Ftours%2Fnew");

  const { property, building, project } = await props.searchParams;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="mb-1 text-xl font-semibold">New 360° tour</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Add a 360° photo for each room, then place the doors between them.
      </p>

      <TourBuilder
        userId={user.id}
        propertyId={property ?? null}
        buildingId={building ?? null}
        projectId={project ?? null}
      />
    </div>
  );
}
