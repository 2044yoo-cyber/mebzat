import "server-only";

import { createClient } from "@/lib/supabase/server";

import { calculateCost } from "./costing";
import { buildParts } from "./geometry";
import { marketRates } from "./rates";
import type { DesignVisibility } from "@/types/database.types";
import { designSpecSchema, upgradeSpec, type DesignSpec } from "../types/spec";

/**
 * Designs, stored.
 *
 * Everything here runs under the caller's own session, so row-level security
 * is the gate rather than a check in this file. That is deliberate: a service
 * layer that reaches for the service-role key is a service layer where every
 * future bug is an authorisation bug. The two operations that genuinely cannot
 * be expressed as the caller's own write — taking a remix's lineage and
 * counting a view on somebody else's design — go through the security-definer
 * functions from migration 0029, which is why they exist.
 *
 * The cost is recomputed here rather than trusted from the browser. A price
 * posted by a client is a price a client chose.
 */

export type SavedDesign = { id: string; slug: string };

export type SaveInput = {
  /** Omitted to create; supplied to update an existing design. */
  designId?: string;
  spec: DesignSpec;
  /** What the user asked for on the turn that produced this version. */
  note?: string;
};

export async function saveDesign(
  input: SaveInput,
): Promise<{ ok: true; design: SavedDesign } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Sign in to save a design." };

  // Re-parsed even though the caller typed it, because "the caller" is a
  // browser and this is the last place before the database.
  const parsed = designSpecSchema.safeParse(upgradeSpec(input.spec));
  if (!parsed.success) {
    return { ok: false, error: "That design could not be read." };
  }
  const spec = parsed.data;

  const { estimatedCost, confidence } = await priceOf(spec);

  if (input.designId) {
    const { data, error } = await supabase
      .from("designs")
      .update({
        title: spec.title,
        kind: spec.kind,
        prompt: spec.meta.prompt || null,
        spec,
        estimated_cost: estimatedCost,
        price_confidence: confidence,
      })
      .eq("id", input.designId)
      .select("id, slug")
      .maybeSingle();

    // No row back means the update matched nothing the caller may write —
    // which under RLS is indistinguishable from the design not existing, and
    // should stay that way.
    if (error || !data) {
      return { ok: false, error: "That design could not be updated." };
    }

    await appendVersion(supabase, data.id, spec, estimatedCost, user.id, input.note);
    return { ok: true, design: data };
  }

  const { data: slug, error: slugError } = await supabase.rpc("design_slug", {
    title: spec.title,
  });
  if (slugError || typeof slug !== "string") {
    return { ok: false, error: "That design could not be saved." };
  }

  const { data, error } = await supabase
    .from("designs")
    .insert({
      slug,
      owner_id: user.id,
      kind: spec.kind,
      title: spec.title,
      prompt: spec.meta.prompt || null,
      spec,
      estimated_cost: estimatedCost,
      price_confidence: confidence,
      visibility: "private",
    })
    .select("id, slug")
    .single();

  if (error || !data) {
    return { ok: false, error: "That design could not be saved." };
  }

  await appendVersion(supabase, data.id, spec, estimatedCost, user.id, input.note);
  return { ok: true, design: data };
}

/**
 * Publishing: the design goes public, and a card appears in the feed.
 *
 * Two writes, in that order, and the order matters. If the feed insert fails
 * the design is still published and its link still works — a design that is
 * public but missing from the feed is a smaller problem than a feed card
 * pointing at a private page. Re-publishing fixes it, because the unique index
 * from migration 0030 makes the second insert a no-op rather than a duplicate.
 */
export async function publishDesign(
  designId: string,
  visibility: Exclude<DesignVisibility, "private">,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to publish." };

  const { data: design, error } = await supabase
    .from("designs")
    .update({ visibility, published_at: new Date().toISOString() })
    .eq("id", designId)
    .select(
      "id, slug, kind, title, prompt, cover_url, currency, estimated_cost, spec",
    )
    .maybeSingle();

  if (error || !design) {
    return { ok: false, error: "That design could not be published." };
  }

  if (visibility === "public") {
    await postToFeed(supabase, user.id, design);
  }

  return { ok: true, slug: design.slug };
}

type PublishedDesign = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  prompt: string | null;
  cover_url: string | null;
  currency: string;
  estimated_cost: number | null;
};

/**
 * The feed card for a design.
 *
 * `ai_design` already exists as a feed kind — "generated in Medosha AI
 * Studio" — and a Berchuma design is exactly that. Adding `berchuma` as a
 * twenty-fourth kind would mean a migration, a new icon, a new filter chip and
 * a second thing for a reader to learn, in exchange for nothing they would
 * notice.
 */
async function postToFeed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  design: PublishedDesign,
): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, company_name, avatar_url, location_city, location_country, verification_status, account_type",
    )
    .eq("id", userId)
    .maybeSingle();

  const name = profile?.full_name ?? profile?.company_name ?? "Medosha member";
  const place = [profile?.location_city, profile?.location_country]
    .filter((part): part is string => Boolean(part))
    // A profile whose city and country read the same produces "Addis Ababa,
    // Addis Ababa" on the card.
    .filter((part, index, all) => all.indexOf(part) === index)
    .join(", ");

  const { error } = await supabase.from("feed_posts").insert({
    kind: "ai_design",
    topic: "design",
    title: design.title,
    body: design.prompt,
    author_id: userId,
    author_key: `profile:${userId}`,
    author_name: name,
    author_role: "Berchuma Studio",
    author_avatar_url: profile?.avatar_url ?? null,
    author_location: place || null,
    author_verified: profile?.verification_status === "verified",
    link_href: `/designs/${design.slug}`,
    link_label: "Open the design",
    entity_type: "design",
    entity_id: design.id,
    price_amount: design.estimated_cost,
    price_currency: design.currency,
    price_unit: "estimated",
    city: profile?.location_city ?? null,
    region: profile?.location_country ?? null,
    tags: [design.kind.replace(/_/g, " "), "berchuma"],
    status: "published",
    published_at: new Date().toISOString(),
  });

  // Already there. Publishing twice is not an error; it is somebody pressing a
  // button they were not sure had worked.
  if (error && error.code !== "23505") {
    console.error(`[berchuma] feed post failed: ${error.message}`);
  }
}

/** Takes a copy of somebody's design, with attribution the client cannot forge. */
export async function remixDesign(
  designId: string,
  title?: string,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data: newId, error } = await supabase.rpc("berchuma_remix", {
    p_design: designId,
    p_title: title ?? null,
  });

  if (error || typeof newId !== "string") {
    return { ok: false, error: "That design could not be remixed." };
  }

  const { data } = await supabase
    .from("designs")
    .select("slug")
    .eq("id", newId)
    .maybeSingle();

  if (!data) return { ok: false, error: "The remix was made but could not be opened." };
  return { ok: true, slug: data.slug };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type DesignRecord = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  prompt: string | null;
  spec: DesignSpec;
  coverUrl: string | null;
  currency: string;
  estimatedCost: number | null;
  priceConfidence: number | null;
  visibility: DesignVisibility;
  isTemplate: boolean;
  remixCount: number;
  viewCount: number;
  publishedAt: string | null;
  updatedAt: string;
  owner: {
    id: string;
    name: string;
    username: string | null;
    avatarUrl: string | null;
    headline: string | null;
  };
  /** The design this was remixed from, when it was. */
  parent: { slug: string; title: string; ownerName: string } | null;
  versionCount: number;
  isOwner: boolean;
};

export async function getDesign(slug: string): Promise<DesignRecord | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No visibility filter here: `designs_read` already hides private designs
  // from everyone but their owner, so adding one would be a second copy of a
  // rule that is allowed to change.
  const { data, error } = await supabase
    .from("designs")
    .select(
      `id, slug, kind, title, prompt, spec, cover_url, currency, estimated_cost,
       price_confidence, visibility, is_template, remix_count, view_count,
       published_at, updated_at, owner_id, parent_design_id`,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;

  const parsed = designSpecSchema.safeParse(upgradeSpec(data.spec));
  if (!parsed.success) return null;

  const [owner, parent, versions] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, company_name, username, avatar_url, bio")
      .eq("id", data.owner_id)
      .maybeSingle(),
    data.parent_design_id
      ? supabase
          .from("designs")
          .select("slug, title, owner_id")
          .eq("id", data.parent_design_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("design_versions")
      .select("id", { count: "exact", head: true })
      .eq("design_id", data.id),
  ]);

  let parentRecord: DesignRecord["parent"] = null;
  if (parent.data) {
    const { data: parentOwner } = await supabase
      .from("profiles")
      .select("full_name, company_name")
      .eq("id", parent.data.owner_id)
      .maybeSingle();
    parentRecord = {
      slug: parent.data.slug,
      title: parent.data.title,
      ownerName:
        parentOwner?.full_name ?? parentOwner?.company_name ?? "a Medosha member",
    };
  }

  return {
    id: data.id,
    slug: data.slug,
    kind: data.kind,
    title: data.title,
    prompt: data.prompt,
    spec: parsed.data,
    coverUrl: data.cover_url,
    currency: data.currency,
    estimatedCost: data.estimated_cost,
    priceConfidence: data.price_confidence,
    visibility: data.visibility,
    isTemplate: data.is_template,
    remixCount: data.remix_count,
    viewCount: data.view_count,
    publishedAt: data.published_at,
    updatedAt: data.updated_at,
    owner: {
      id: data.owner_id,
      name:
        owner.data?.full_name ?? owner.data?.company_name ?? "a Medosha member",
      username: owner.data?.username ?? null,
      avatarUrl: owner.data?.avatar_url ?? null,
      headline: owner.data?.bio ?? null,
    },
    parent: parentRecord,
    versionCount: versions.count ?? 0,
    isOwner: user?.id === data.owner_id,
  };
}

export type DesignCard = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  coverUrl: string | null;
  currency: string;
  estimatedCost: number | null;
  remixCount: number;
  viewCount: number;
  ownerName: string | null;
  ownerUsername: string | null;
  ownerAvatarUrl: string | null;
};

export async function listPublicDesigns(options: {
  limit?: number;
  kind?: string | null;
  templatesOnly?: boolean;
  exclude?: string | null;
} = {}): Promise<DesignCard[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("public_designs", {
      p_limit: options.limit ?? 12,
      p_kind: options.kind ?? null,
      p_templates_only: options.templatesOnly ?? false,
      p_exclude: options.exclude ?? null,
    });

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      slug: row.slug,
      kind: row.kind,
      title: row.title,
      coverUrl: row.cover_url,
      currency: row.currency,
      estimatedCost: row.estimated_cost,
      remixCount: row.remix_count,
      viewCount: row.view_count,
      ownerName: row.owner_name,
      ownerUsername: row.owner_username,
      ownerAvatarUrl: row.owner_avatar_url,
    }));
  } catch {
    // Supabase unreachable. An empty gallery renders its own empty state.
    return [];
  }
}

/** The designs the signed-in member owns, newest first. */
export async function listOwnDesigns(limit = 24): Promise<DesignCard[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
      .from("designs")
      .select(
        "id, slug, kind, title, cover_url, currency, estimated_cost, remix_count, view_count",
      )
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(limit);

    return (data ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      kind: row.kind,
      title: row.title,
      coverUrl: row.cover_url,
      currency: row.currency,
      estimatedCost: row.estimated_cost,
      remixCount: row.remix_count,
      viewCount: row.view_count,
      ownerName: null,
      ownerUsername: null,
      ownerAvatarUrl: null,
    }));
  } catch {
    return [];
  }
}

/**
 * Counts a view.
 *
 * Fire and forget, and never awaited by a page render: a design page that
 * fails to load because the counter could not be written would be trading
 * something that matters for something that does not.
 */
export async function recordDesignView(designId: string): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("berchuma_record_view", { p_design: designId });
  } catch {
    // Deliberately silent.
  }
}

// ---------------------------------------------------------------------------

/** The price as the server computes it, from live rates. */
async function priceOf(spec: DesignSpec) {
  const rates = await marketRates();
  const cost = calculateCost(spec, buildParts(spec), { rates });
  return {
    estimatedCost: Math.round(cost.price),
    confidence: Math.round(cost.confidence * 100) / 100,
  };
}

async function appendVersion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  designId: string,
  spec: DesignSpec,
  estimatedCost: number,
  authorId: string,
  note: string | undefined,
): Promise<void> {
  // The next number, read rather than counted: a deleted version must not
  // cause the next save to collide with one that already exists.
  const { data: latest } = await supabase
    .from("design_versions")
    .select("version")
    .eq("design_id", designId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("design_versions").insert({
    design_id: designId,
    version: (latest?.version ?? 0) + 1,
    spec,
    note: note ?? null,
    author_id: authorId,
    estimated_cost: estimatedCost,
  });

  if (error) {
    // History is worth having but not worth losing the save over.
    console.error(`[berchuma] version not written: ${error.message}`);
  }
}
