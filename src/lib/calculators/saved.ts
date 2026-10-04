import { createClient } from "@/lib/supabase/server";

export type SavedCalculation = {
  id: string;
  slug: string;
  name: string;
  headline: string | null;
  inputs: Record<string, { raw: string; unit: string }>;
  createdAt: string;
};

/**
 * A person's saved calculations.
 *
 * Returns `null` — not an empty list — when the table is unreachable, so the
 * page can tell "you have not saved anything" apart from "the database is
 * down". Those look identical to a reader and mean completely different things.
 */
export async function listSavedCalculations(): Promise<SavedCalculation[] | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await supabase
    .from("saved_calculations")
    .select("id, slug, name, headline, inputs, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return null;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    headline: (row.headline as string | null) ?? null,
    inputs: (row.inputs ?? {}) as Record<string, { raw: string; unit: string }>,
    createdAt: row.created_at as string,
  }));
}
