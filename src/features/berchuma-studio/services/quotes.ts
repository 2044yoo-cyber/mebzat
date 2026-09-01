import "server-only";

import { createClient } from "@/lib/supabase/server";

import { buildCutList } from "./cutlist";
import { buildParts } from "./geometry";
import { getDesign } from "./designs";

/**
 * Sending a design to a workshop.
 *
 * The cut list attached to a request is built here, on the server, from the
 * design's own spec — never taken from the request body. A client that
 * supplies the parts list is a client that can supply a cheaper one than the
 * page showed, and the frozen copy is the thing a shop is later held to.
 *
 * Freezing is the point of storing it at all. The design may be edited
 * tomorrow; what was agreed today must not change underneath the person who
 * agreed to build it.
 */

export type Workshop = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  logoUrl: string | null;
  verified: boolean;
  isClaimed: boolean;
};

export async function listWorkshops(
  city?: string | null,
  limit = 20,
): Promise<Workshop[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("berchuma_workshops", {
      p_city: city ?? null,
      p_limit: limit,
    });

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      city: row.city,
      logoUrl: row.logo_url,
      verified: row.verified,
      isClaimed: row.is_claimed,
    }));
  } catch {
    return [];
  }
}

export async function requestQuote(input: {
  designId: string;
  companyId: string;
  note?: string;
  city?: string | null;
  neededBy?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to ask for a quote." };

  // Fetched by slug-less id through the same reader the page uses, so a design
  // the caller may not see comes back null here exactly as it would there.
  const { data: design } = await supabase
    .from("designs")
    .select("slug")
    .eq("id", input.designId)
    .maybeSingle();

  if (!design) return { ok: false, error: "That design could not be found." };

  const record = await getDesign(design.slug);
  if (!record) return { ok: false, error: "That design could not be found." };

  const cutList = buildCutList(record.spec, buildParts(record.spec));

  const { data, error } = await supabase.rpc("berchuma_request_quote", {
    p_design: input.designId,
    p_company: input.companyId,
    p_cut_list: cutList,
    p_note: input.note ?? null,
    p_city: input.city ?? null,
    p_needed_by: input.neededBy ?? null,
  });

  if (error || typeof data !== "string") {
    console.error(`[berchuma] quote request failed: ${error?.message}`);
    return { ok: false, error: "That request could not be sent." };
  }

  return { ok: true, id: data };
}
