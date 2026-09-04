"use server";

import { openingSpecSchema, type OpeningSpec } from "../types/openings";
import { buildOpening } from "./openings";
import { reportFailure } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Saving a window or a door.
 *
 * Kept apart from saveDesign rather than folded into it. That function parses
 * designSpecSchema — a cabinet — and an opening is not one: different fields,
 * different arithmetic, different parts. Widening the schema to accept both
 * would make every cabinet field optional, which is how a cabinet with no
 * carcase gets saved.
 *
 * They share the table, which is the right amount of sharing. `designs.kind`
 * already distinguishes them, `spec` is jsonb, and everything the table
 * provides — ownership, visibility, slugs, remixing — works the same for both.
 *
 * No price is stored. The costing engine takes a DesignSpec and a
 * PartsBreakdown, neither of which an opening produces, so estimated_cost is
 * left null rather than filled with a number nobody computed. §12: show
 * "Price unavailable", do not invent one.
 */

export type SaveOpeningResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; error: string };

export async function saveOpening(input: {
  /** Omitted to create; supplied to update. */
  designId?: string;
  spec: OpeningSpec;
  /** What the person called it: "Living room sliding door". */
  title: string;
}): Promise<SaveOpeningResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Sign in to save a design." };

  const title = input.title.trim();
  if (title.length < 1) return { ok: false, error: "Give the opening a name." };
  if (title.length > 160) return { ok: false, error: "That name is too long." };

  // Re-parsed even though the caller typed it, because "the caller" is a
  // browser and this is the last place before the database.
  const parsed = openingSpecSchema.safeParse(input.spec);
  if (!parsed.success) {
    return { ok: false, error: "That opening could not be read." };
  }
  const spec = parsed.data;

  // Stored beside the spec so a quotation can be reproduced without re-running
  // the engine, and so a later change to the arithmetic does not silently
  // rewrite what somebody was quoted. The spec remains the source of truth.
  const breakdown = buildOpening(spec);

  const record = {
    spec,
    boq: {
      profiles: breakdown.profiles,
      glass: breakdown.glass,
      hardware: breakdown.hardware,
      openingArea: breakdown.openingArea,
      glazedArea: breakdown.glazedArea,
      notes: breakdown.notes,
    },
    savedAt: new Date().toISOString(),
  };

  if (input.designId) {
    const { data, error } = await supabase
      .from("designs")
      .update({ title, spec: record, updated_at: new Date().toISOString() })
      .eq("id", input.designId)
      .eq("owner_id", user.id)
      .select("id, slug")
      .single();

    if (error || !data) {
      return {
        ok: false,
        error: reportFailure("saveOpening.update", error, "That opening could not be updated."),
      };
    }
    return { ok: true, id: data.id, slug: data.slug };
  }

  const { data: slug, error: slugError } = await supabase.rpc("design_slug", { title });
  if (slugError || typeof slug !== "string") {
    return {
      ok: false,
      error: reportFailure("saveOpening.slug", slugError, "That opening could not be saved."),
    };
  }

  const { data, error } = await supabase
    .from("designs")
    .insert({
      slug,
      owner_id: user.id,
      kind: "opening",
      title,
      spec: record,
      // Deliberately null. See the note at the top of this file.
      estimated_cost: null,
      visibility: "private",
    })
    .select("id, slug")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: reportFailure("saveOpening.insert", error, "That opening could not be saved."),
    };
  }

  return { ok: true, id: data.id, slug: data.slug };
}
