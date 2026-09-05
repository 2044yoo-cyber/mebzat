"use server";

import { revalidatePath } from "next/cache";

import { CATALOGUE_AREA, type CatalogueKind } from "@/lib/admin/catalogue-shape";
import { canAdmin } from "@/lib/auth/admin-areas";
import { reportFailure } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Taking a product or a design project off the site, and putting it back.
 *
 * `status` is the column the public queries already read, and `draft` is what
 * they already understand as "not on the site" — so an operator unpublishing
 * something leaves it in exactly the state its owner would have left it in
 * before publishing. The owner can still see it, fix what was wrong with it,
 * and publish it again. That matters: a hidden flag only an admin can clear is
 * a dead end for somebody who has corrected the problem.
 *
 * One pair of actions for both tables. They are the same operation on the same
 * column, and two copies of it is two places for a revalidate to go missing.
 */

export type CatalogueResult = { ok: boolean; message: string };

const DENIED: CatalogueResult = { ok: false, message: "Not permitted." };

async function setPublished(
  kind: CatalogueKind,
  id: string,
  published: boolean,
  message: string,
): Promise<CatalogueResult> {
  if (!(await canAdmin(CATALOGUE_AREA[kind]))) return DENIED;

  const supabase = await createClient();
  const { error } = await supabase
    .from(kind)
    .update({
      status: published ? "published" : "draft",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return {
      ok: false,
      message: reportFailure("adminSetCataloguePublished", error, "Could not do that."),
    };
  }

  revalidatePath(kind === "products" ? "/admin/products" : "/admin/projects");
  revalidatePath(kind === "products" ? "/marketplace" : "/designs");
  return { ok: true, message };
}

export async function unpublishItem(
  kind: CatalogueKind,
  id: string,
): Promise<CatalogueResult> {
  return setPublished(kind, id, false, "Taken off the site.");
}

export async function publishItem(
  kind: CatalogueKind,
  id: string,
): Promise<CatalogueResult> {
  return setPublished(kind, id, true, "Back on the site.");
}
