"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { BOARD_PRICE_LIST } from "@/lib/constants/board-price-list";

export type BoardPriceState = { error?: string; success?: boolean };

export async function publishBoardPrices(): Promise<BoardPriceState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in to the account that owns these prices." };

  const { data: existing, error } = await supabase.from("price_listings")
    .select("id, item")
    .eq("supplier_id", user.id)
    .eq("sector", "material")
    .eq("unit", "sheet")
    .in("item", BOARD_PRICE_LIST.map((row) => row.item));
  if (error) return { error: "Could not read your existing prices. Nothing was changed." };

  for (const row of BOARD_PRICE_LIST) {
    const matches = (existing ?? []).filter((entry) => entry.item === row.item);
    const values = {
      current_price: row.price,
      currency: "ETB",
      specification: row.specification,
      published: true,
    };
    if (matches.length) {
      const { error: updateError } = await supabase.from("price_listings")
        .update(values)
        .eq("supplier_id", user.id)
        .in("id", matches.map((entry) => entry.id));
      if (updateError) return { error: "Some prices could not be updated. You can safely retry." };
    } else {
      // A stable owner/item id makes retries and simultaneous submissions idempotent.
      const hex = createHash("sha256").update(`board-price:${user.id}:${row.item}`).digest("hex");
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
      const { error: insertError } = await supabase.from("price_listings").upsert({
        id,
        supplier_id: user.id,
        sector: "material",
        category: "Boards and panels",
        item: row.item,
        unit: "sheet",
        ...values,
      }, { onConflict: "id" });
      if (insertError) return { error: "Some prices could not be posted. You can safely retry." };
    }
  }
  revalidatePath("/price-exchange");
  revalidatePath("/studio");
  return { success: true };
}
