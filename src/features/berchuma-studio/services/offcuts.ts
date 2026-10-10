import "server-only";

import { createClient } from "@/lib/supabase/server";

export const offcutStatuses = ["available", "reserved", "used", "discarded"] as const;
export type OffcutStatus = (typeof offcutStatuses)[number];

export type OffcutRecord = {
  id: string;
  owner_id: string;
  source_design_id: string | null;
  source_sheet_number: number | null;
  board_id: string | null;
  board_label: string;
  thickness_mm: number;
  length_mm: number;
  width_mm: number;
  quantity: number;
  status: string;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type NewOffcut = {
  boardId?: string | null;
  boardLabel: string;
  thicknessMm: number;
  lengthMm: number;
  widthMm: number;
  quantity: number;
  location?: string;
  notes?: string;
};

export async function listOffcuts(): Promise<OffcutRecord[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("offcut_inventory")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as OffcutRecord[];
}

export async function addOffcut(input: NewOffcut):
  Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to save workshop offcuts." };

  const boardLabel = input.boardLabel.trim();
  if (!boardLabel) return { ok: false, error: "Enter a board or material name." };
  const measurements = [
    ["thickness", input.thicknessMm],
    ["length", input.lengthMm],
    ["width", input.widthMm],
  ] as const;
  for (const [name, value] of measurements) {
    if (!Number.isFinite(value) || value <= 0) {
      return { ok: false, error: `Enter a positive, valid ${name} in millimetres.` };
    }
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100000) {
    return { ok: false, error: "Quantity must be a positive whole number." };
  }

  const { error } = await supabase.from("offcut_inventory").insert({
    owner_id: user.id,
    board_id: input.boardId?.trim() || null,
    board_label: boardLabel,
    thickness_mm: input.thicknessMm,
    length_mm: input.lengthMm,
    width_mm: input.widthMm,
    quantity: input.quantity,
    location: input.location?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  if (error) return { ok: false, error: "The offcut could not be saved. Confirm the offcut inventory migration has been applied." };
  return { ok: true };
}

export async function changeOffcutStatus(
  id: string,
  status: OffcutStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!offcutStatuses.includes(status)) return { ok: false, error: "Choose a valid inventory status." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to update your inventory." };

  const { error } = await supabase
    .from("offcut_inventory")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) return { ok: false, error: "The offcut status could not be updated." };
  return { ok: true };
}

export async function deleteOffcut(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to manage your inventory." };

  const { error } = await supabase
    .from("offcut_inventory")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) return { ok: false, error: "The offcut could not be removed." };
  return { ok: true };
}
