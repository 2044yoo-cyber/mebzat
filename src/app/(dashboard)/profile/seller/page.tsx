import type { Metadata } from "next";
import Link from "next/link";

import { SellerProfileForm } from "@/components/profile/seller-profile-form";
import { requireViewer } from "@/lib/auth/session";
import { listAreas } from "@/lib/data/professionals";
import { getProductCategories } from "@/lib/data/products";
import { sellerAreasFor, sellerProfileFor } from "@/lib/data/role-profiles";
import { hasRole } from "@/lib/profile/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Shop profile" };

export default async function SellerProfilePage() {
  const viewer = await requireViewer("/profile/seller");
  const supabase = await createClient();

  const [{ data: profile }, seller, categories, areas, mine] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("roles, primary_role")
        .eq("id", viewer.id)
        .maybeSingle(),
      sellerProfileFor(viewer.id),
      getProductCategories(),
      listAreas(),
      sellerAreasFor(viewer.id),
    ]);

  const chosen = profile ? hasRole(profile, "seller") : false;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shop profile</h1>
        <p className="text-muted-foreground">
          What buyers see beside the materials and products you list.
        </p>
      </div>

      {!chosen && (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          You have not turned the seller role on yet. Fill this in now if you
          like — then tick <span className="font-medium">Sales or supplier</span>{" "}
          in{" "}
          <Link href="/settings" className="font-medium underline">
            Settings
          </Link>{" "}
          to publish it.
        </p>
      )}

      <SellerProfileForm
        seller={seller}
        categories={categories.map((category) => ({
          slug: category.slug as string,
          name: category.name as string,
        }))}
        areas={areas}
        selectedAreas={mine.map((area) => area.slug)}
      />
    </div>
  );
}
