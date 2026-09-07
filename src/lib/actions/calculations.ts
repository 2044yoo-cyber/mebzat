"use server";

import { revalidatePath } from "next/cache";

import { calculatorBySlug } from "@/lib/calculators/registry";
import { createClient } from "@/lib/supabase/server";

/**
 * Saving a calculation.
 *
 * ## Ownership is not re-checked here
 *
 * `saved_calculations` carries `auth.uid() = user_id` on select, insert, update
 * and delete, so a delete aimed at somebody else's row matches nothing and
 * changes nothing. A second `.eq("user_id", …)` on top of that would be a copy
 * of the rule, and copies are what get forgotten on the fifth action somebody
 * adds.
 *
 * What *is* checked is the slug, because the database has no opinion about
 * whether "concrete-slabb" is a calculator that exists.
 */

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };
export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveCalculation(input: {
  slug: string;
  name: string;
  inputs: Record<string, { raw: string; unit: string }>;
  headline: string;
}): Promise<SaveResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the calculation a name." };
  if (name.length > 120) return { ok: false, error: "That name is too long." };
  if (!calculatorBySlug(input.slug)) return { ok: false, error: "That calculator does not exist." };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Sign in to save a calculation." };

  const { data, error } = await supabase
    .from("saved_calculations")
    .insert({
      user_id: auth.user.id,
      slug: input.slug,
      name,
      inputs: input.inputs,
      headline: input.headline.slice(0, 200),
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "That did not save. Try again." };

  revalidatePath("/calculators/saved");
  return { ok: true, id: data.id };
}

export async function renameCalculation(id: string, name: string): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Give the calculation a name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("saved_calculations")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: "That did not save." };
  revalidatePath("/calculators/saved");
  return { ok: true };
}

/** A copy, so a variant can be explored without losing the original. */
export async function duplicateCalculation(id: string): Promise<SaveResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Sign in first." };

  const { data: original } = await supabase
    .from("saved_calculations")
    .select("slug, name, inputs, headline")
    .eq("id", id)
    .single();

  if (!original) return { ok: false, error: "That calculation is gone." };

  const { data, error } = await supabase
    .from("saved_calculations")
    .insert({
      user_id: auth.user.id,
      slug: original.slug,
      name: `${original.name} (copy)`.slice(0, 120),
      inputs: original.inputs,
      headline: original.headline,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "That did not copy." };
  revalidatePath("/calculators/saved");
  return { ok: true, id: data.id };
}

export async function deleteCalculation(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("saved_calculations").delete().eq("id", id);
  if (error) return { ok: false, error: "That did not delete." };
  revalidatePath("/calculators/saved");
  return { ok: true };
}
