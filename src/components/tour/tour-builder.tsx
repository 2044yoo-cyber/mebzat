"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, Globe, Link2, Loader2, MapPin, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { FloorPlanInput, type DraftPlan } from "@/components/tour/floor-plan-input";
import { PanoramaInput, type DraftScene } from "@/components/tour/panorama-input";
import { PanoramaViewer } from "@/components/tour/panorama-viewer";
import {
  createTour,
  updateTour,
  setTourVisibility,
  type HotspotInput,
} from "@/app/tours/actions";
import { addFloorPlan } from "@/app/tours/floor-plan-actions";
import { toSceneInputs, type DraftTourScene } from "@/lib/tour/draft";
import { cn } from "@/lib/utils";

/**
 * Building a tour.
 *
 * One page, scrolled, rather than a wizard: everything a person needs to
 * decide is visible at once, and adding a room after naming the tour does not
 * mean walking back through three steps.
 *
 * A hotspot is placed by pointing the view at where it belongs and pressing a
 * button, not by typing two angles. Yaw and pitch are the numbers the viewer
 * needs; they are nobody's idea of an interface.
 */

type DraftHotspot = HotspotInput & { key: string };

/** The same shape src/lib/tour/draft.ts converts, so the two cannot drift. */
type BuilderScene = DraftScene & DraftTourScene;

export function TourBuilder({
  userId,
  tourId,
  initialTitle = "",
  initialDescription = "",
  initialScenes = [],
  initialPlans = [],
  initialShareToFeed = false,
  initialVisibility = "published",
  propertyId,
  buildingId,
  projectId,
}: {
  userId: string;
  /** Absent when this is a new tour. */
  tourId?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialScenes?: BuilderScene[];
  /** Plans already saved. Only newly added ones are written on save. */
  initialPlans?: DraftPlan[];
  initialShareToFeed?: boolean;
  /** What "publish" will mean for this tour: public, or link-only. */
  initialVisibility?: "published" | "unlisted";
  propertyId?: string | null;
  buildingId?: string | null;
  projectId?: string | null;
}) {
  const router = useRouter();

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [scenes, setScenes] = useState<BuilderScene[]>(initialScenes);
  const [plans, setPlans] = useState<DraftPlan[]>(initialPlans);
  const [editing, setEditing] = useState<string | null>(initialScenes[0]?.key ?? null);
  const [saving, setSaving] = useState(false);
  const [shareToFeed, setShareToFeed] = useState(initialShareToFeed);
  const [reach, setReach] = useState<"published" | "unlisted">(initialVisibility);

  // Where the preview is currently pointed. A hotspot is dropped here.
  const [aim, setAim] = useState({ yaw: 0, pitch: 0 });

  const scene = scenes.find((s) => s.key === editing) ?? null;

  function addScenes(added: DraftScene[]) {
    // The incoming list is the whole set: PanoramaInput handles adding,
    // renaming, reordering and removing. Its fields win — a rename would
    // otherwise be thrown away — while the builder's own additions to a scene,
    // its hotspots and opening angle, are carried across by key.
    const grown: BuilderScene[] = added.map((one) => {
      const existing = scenes.find((s) => s.key === one.key);
      return existing
        ? { ...existing, ...one }
        : { ...one, initialYaw: 0, initialPitch: 0, initialZoom: 75, hotspots: [] };
    });
    setScenes(grown);
    if (!editing && grown.length > 0) setEditing(grown[0].key);
    if (editing && !grown.some((s) => s.key === editing)) {
      setEditing(grown[0]?.key ?? null);
    }
  }

  function updateScene(key: string, patch: Partial<BuilderScene>) {
    setScenes((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function addHotspot(kind: HotspotInput["kind"]) {
    if (!scene) return;
    if (kind === "scene" && scenes.length < 2) {
      toast.error("Add a second 360° photo before linking rooms.");
      return;
    }
    const target = scenes.find((s) => s.key !== scene.key);
    updateScene(scene.key, {
      hotspots: [
        ...scene.hotspots,
        {
          key: crypto.randomUUID(),
          kind,
          yaw: Math.round(aim.yaw),
          pitch: Math.round(aim.pitch),
          title: kind === "scene" ? `To ${target?.title ?? "the next room"}` : "Note",
          description: null,
          targetSceneKey: kind === "scene" ? (target?.key ?? null) : null,
        },
      ],
    });
  }

  function patchHotspot(key: string, patch: Partial<DraftHotspot>) {
    if (!scene) return;
    updateScene(scene.key, {
      hotspots: scene.hotspots.map((h) => (h.key === key ? { ...h, ...patch } : h)),
    });
  }

  function removeHotspot(key: string) {
    if (!scene) return;
    updateScene(scene.key, { hotspots: scene.hotspots.filter((h) => h.key !== key) });
  }

  async function save(thenPublish: boolean) {
    setSaving(true);
    const input = {
      title,
      description,
      propertyId,
      buildingId,
      projectId,
      shareToFeed: reach === "published" && shareToFeed,
      scenes: toSceneInputs(scenes),
    };

    const result = tourId ? await updateTour(tourId, input) : await createTour(input);

    if (result.error || !result.id) {
      setSaving(false);
      toast.error(result.error ?? "Could not save that tour.");
      return;
    }

    // Plans are written after the tour, because a plan hangs off the tour and
    // a new tour has no id until now. Only the ones added in this session: the
    // rest are already rows.
    const fresh = plans.filter((plan) => !initialPlans.some((one) => one.key === plan.key));
    for (const [index, plan] of fresh.entries()) {
      const written = await addFloorPlan({
        title: plan.title,
        fileUrl: plan.pending ? null : plan.url,
        quarantinePath: plan.pending ? plan.quarantinePath : null,
        moderationItemId: plan.moderationItemId,
        mediaType: plan.mediaType,
        width: plan.width,
        height: plan.height,
        tourId: result.id,
        propertyId,
        buildingId,
        projectId,
        position: initialPlans.length + index,
      });

      // One plan failing must not lose the tour, which is already saved.
      if (written.error) toast.error(`${plan.title}: ${written.error}`);
    }

    if (thenPublish) {
      const published = await setTourVisibility(result.id, reach);
      if (published.error) {
        setSaving(false);
        // The tour is saved either way — say so, rather than letting it look
        // as though the whole thing failed.
        toast.error(`Saved as a draft. ${published.error}`);
        router.push(`/tours/${result.id}/edit`);
        return;
      }
      toast.success("Tour published.");
      router.push(`/tour/${result.id}`);
      return;
    }

    toast.success("Saved.");
    router.push(`/tours/${result.id}/edit`);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Name</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Two bedroom in Bole"
            maxLength={200}
            className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="What someone should notice walking through."
            className="w-full resize-y rounded-xl border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Rooms</h2>
        <PanoramaInput userId={userId} scenes={scenes} onChange={addScenes} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Floor plans</h2>
        <p className="text-xs text-muted-foreground">
          A plan of the flat, a floor of the building, or the whole project. A PDF
          keeps its pages.
        </p>
        <FloorPlanInput userId={userId} plans={plans} onChange={setPlans} />
      </section>

      {scenes.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium">Hotspots</h2>
            <div className="flex flex-wrap gap-1.5">
              {scenes.map((one) => (
                <button
                  key={one.key}
                  type="button"
                  onClick={() => setEditing(one.key)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    one.key === editing
                      ? "border-brand bg-brand text-brand-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  {one.title || "Untitled"}
                </button>
              ))}
            </div>
          </div>

          {scene && (
            <>
              <p className="text-xs text-muted-foreground">
                Turn the view to where the hotspot belongs, then add it. The angle it is
                facing now is the one it will be placed at.
              </p>

              <PanoramaViewer
                key={scene.key}
                src={scene.panoramaUrl}
                width={scene.width}
                height={scene.height}
                initialYaw={scene.initialYaw}
                initialPitch={scene.initialPitch}
                initialZoom={scene.initialZoom}
                onAim={setAim}
                hotspots={scene.hotspots.map((hotspot) => ({
                  id: hotspot.key,
                  yaw: hotspot.yaw,
                  pitch: hotspot.pitch,
                  title: hotspot.title,
                  kind: hotspot.kind,
                }))}
                className="h-[45vh] min-h-[280px] w-full overflow-hidden rounded-2xl border"
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => addHotspot("scene")}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition-colors hover:bg-muted"
                >
                  <Plus className="size-4" /> Door to another room
                </button>
                <button
                  type="button"
                  onClick={() => addHotspot("info")}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition-colors hover:bg-muted"
                >
                  <Plus className="size-4" /> Note
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateScene(scene.key, {
                      initialYaw: Math.round(aim.yaw),
                      initialPitch: Math.round(aim.pitch),
                    })
                  }
                  className="flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition-colors hover:bg-muted"
                >
                  <MapPin className="size-4" /> Open this room facing here
                </button>
              </div>

              {scene.hotspots.length > 0 && (
                <ul className="space-y-2">
                  {scene.hotspots.map((hotspot) => (
                    <li
                      key={hotspot.key}
                      className="flex flex-wrap items-center gap-2 rounded-xl border p-2"
                    >
                      <input
                        value={hotspot.title}
                        onChange={(event) =>
                          patchHotspot(hotspot.key, { title: event.target.value })
                        }
                        maxLength={80}
                        aria-label="Hotspot label"
                        className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                      />

                      {hotspot.kind === "scene" ? (
                        <select
                          value={hotspot.targetSceneKey ?? ""}
                          onChange={(event) =>
                            patchHotspot(hotspot.key, { targetSceneKey: event.target.value })
                          }
                          aria-label="Room this door opens"
                          className="rounded-lg border bg-background px-2 py-1.5 text-sm"
                        >
                          {/* A tour saved before a room was deleted holds a
                              door pointing at nothing. Without this the select
                              would show the first room while the door still
                              pointed nowhere, and saving would fail for a
                              reason nothing on screen explained. */}
                          {!hotspot.targetSceneKey && <option value="">Choose a room</option>}
                          {scenes
                            .filter((one) => one.key !== scene.key)
                            .map((one) => (
                              <option key={one.key} value={one.key}>
                                {one.title || "Untitled"}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <input
                          value={hotspot.description ?? ""}
                          onChange={(event) =>
                            patchHotspot(hotspot.key, { description: event.target.value })
                          }
                          placeholder="What to say about it"
                          aria-label="Note text"
                          className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-1.5 text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                        />
                      )}

                      <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                        {Math.round(hotspot.yaw)}° / {Math.round(hotspot.pitch)}°
                      </span>

                      <button
                        type="button"
                        onClick={() => removeHotspot(hotspot.key)}
                        aria-label={`Remove ${hotspot.title}`}
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-destructive hover:bg-muted"
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Who can see it</h2>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setReach("published")}
            aria-pressed={reach === "published"}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
              reach === "published" ? "border-brand bg-brand/5" : "hover:bg-muted/60",
            )}
          >
            <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="block text-sm font-medium">Public</span>
              <span className="block text-xs text-muted-foreground">
                Anyone can find and open it
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setReach("unlisted")}
            aria-pressed={reach === "unlisted"}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
              reach === "unlisted" ? "border-brand bg-brand/5" : "hover:bg-muted/60",
            )}
          >
            <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="block text-sm font-medium">Link only</span>
              <span className="block text-xs text-muted-foreground">
                Only people you send the link to
              </span>
            </span>
          </button>
        </div>

        {/* Only meaningful for a public tour, so it is not offered otherwise
            rather than being offered and quietly ignored. */}
        {reach === "published" && (
          <label className="flex items-start gap-3 rounded-xl border p-3">
            <input
              type="checkbox"
              checked={shareToFeed}
              onChange={(event) => setShareToFeed(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
            />
            <span>
              <span className="block text-sm font-medium">Post it to the feed</span>
              <span className="block text-xs text-muted-foreground">
                It appears in other people&apos;s feeds, where it can be liked,
                commented on and saved. You can turn this off later.
              </span>
            </span>
          </label>
        )}
      </section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => save(true)}
          disabled={saving || scenes.length === 0}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-medium text-brand-foreground transition-opacity disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
          {reach === "unlisted" ? "Publish as a link" : "Publish tour"}
        </button>
        <button
          type="button"
          onClick={() => save(false)}
          disabled={saving || scenes.length === 0}
          className="rounded-xl border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          Save draft
        </button>
        {tourId && (
          <button
            type="button"
            onClick={() => router.push(`/tour/${tourId}`)}
            className="flex size-11 items-center justify-center rounded-xl border transition-colors hover:bg-muted"
            aria-label="Preview"
          >
            <Eye className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
