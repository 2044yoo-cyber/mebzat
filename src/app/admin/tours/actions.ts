"use server";

import { revalidatePath } from "next/cache";

import { canAdmin } from "@/lib/auth/admin-areas";
import { reportFailure } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import type { TourVisibility } from "@/types/database.types";

/**
 * Taking a 360° tour off the site, and putting it back.
 *
 * `archived` is the value the tour list already treats as gone — the owner's
 * own list filters it out — so an operator archiving a tour reaches the same
 * state the owner reaches by archiving it themselves. Nothing is deleted: the
 * scenes, the hotspots and the floor plans stay, because an archived tour that
 * turns out to have been fine should come back whole.
 *
 * Restoring puts it to `published`. The previous visibility is not remembered:
 * a tour that was `unlisted` before it was archived should not quietly return
 * to a state where the operator restoring it cannot check what they restored.
 */

export type TourResult = { ok: boolean; message: string };

const DENIED: TourResult = { ok: false, message: "Not permitted." };

async function setVisibility(
  id: string,
  visibility: TourVisibility,
  message: string,
): Promise<TourResult> {
  if (!(await canAdmin("tours"))) return DENIED;

  const supabase = await createClient();
  const { error } = await supabase
    .from("tours")
    .update({ visibility, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return {
      ok: false,
      message: reportFailure("adminSetTourVisibility", error, "Could not do that."),
    };
  }

  revalidatePath("/admin/tours");
  revalidatePath(`/tour/${id}`);
  revalidatePath("/tours");
  return { ok: true, message };
}

export async function archiveTour(id: string): Promise<TourResult> {
  return setVisibility(id, "archived", "Archived.");
}

export async function restoreTour(id: string): Promise<TourResult> {
  return setVisibility(id, "published", "Back on the site.");
}
