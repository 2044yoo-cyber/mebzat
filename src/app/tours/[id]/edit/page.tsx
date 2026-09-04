import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { TourBuilder } from "@/components/tour/tour-builder";
import { getTour } from "@/lib/tour/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit 360° tour" };

export default async function EditTourPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=%2Ftours%2F${id}%2Fedit`);

  const tour = await getTour(id);
  // A tour somebody else owns and one that does not exist are the same answer.
  // The row policies already hide a draft; this covers a published tour, which
  // anybody can read but only its owner may edit.
  if (!tour || tour.ownerId !== user.id) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="mb-1 text-xl font-semibold">Edit tour</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Saving replaces the scenes and hotspots with what is here.
      </p>

      <TourBuilder
        userId={user.id}
        tourId={tour.id}
        initialTitle={tour.title}
        initialDescription={tour.description ?? ""}
        propertyId={tour.propertyId}
        buildingId={tour.buildingId}
        projectId={tour.projectId}
        initialScenes={tour.scenes.map((scene) => ({
          // The scene's own uuid doubles as the builder's local key, so a door
          // that pointed at it before the edit still resolves afterwards.
          key: scene.id,
          title: scene.title,
          panoramaUrl: scene.panoramaUrl,
          width: scene.width ?? 0,
          height: scene.height ?? 0,
          initialYaw: scene.initialYaw,
          initialPitch: scene.initialPitch,
          initialZoom: scene.initialZoom,
          hotspots: scene.hotspots.map((hotspot) => ({
            key: hotspot.id,
            kind: hotspot.kind,
            yaw: hotspot.yaw,
            pitch: hotspot.pitch,
            title: hotspot.title,
            description: hotspot.description,
            targetSceneKey: hotspot.targetSceneId,
          })),
        }))}
      />
    </div>
  );
}
