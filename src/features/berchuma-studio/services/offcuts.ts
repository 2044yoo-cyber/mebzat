import "server-only";

import { createClient } from "@/lib/supabase/server";

export const offcutStatuses = ["available", "reserved", "used", "discarded"] as const;
export type OffcutStatus = (typeof offcutStatuses)[number];

export type OffcutRecord = {
  id: string;
  owner_id: string;
  source_design_id: string | null;
  source_sheet_number: number | null;
  source_x_mm: number | null;
  source_y_mm: number | null;
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
  sourceSheetNumber?: number;
  sourceXmm?: number;
  sourceYmm?: number;
};

export async function listOffcuts(): Promise<OffcutRecord[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("offcut_inventory")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Offcut inventory could not be loaded.");
  return (data ?? []) as OffcutRecord[];
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
    source_sheet_number: input.sourceSheetNumber ?? null,
    source_x_mm: input.sourceXmm ?? null,
    source_y_mm: input.sourceYmm ?? null,
    location: input.location?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  if (error) return { ok: false, error: "The offcut could not be saved. Confirm the offcut inventory migration has been applied." };
  return { ok: true };
}


export type LayoutOffcutCandidate = {
  boardId: string;
  boardLabel: string;
  thicknessMm: number;
  sheet: number;
  x: number;
  y: number;
  length: number;
  width: number;
  reusable: boolean;
};

export async function addOffcutsFromLayout(
  input: unknown,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to save workshop offcuts." };
  if (!Array.isArray(input) || input.length === 0 || input.length > 100) {
    return { ok: false, error: "Choose between 1 and 100 offcut candidates." };
  }

  const rows: {
    owner_id: string;
    board_id: string;
    board_label: string;
    thickness_mm: number;
    length_mm: number;
    width_mm: number;
    quantity: number;
    source_sheet_number: number;
    source_x_mm: number;
    source_y_mm: number;
    status: "available";
    notes: string;
  }[] = [];

  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) {
      return { ok: false, error: "One of the selected offcuts is invalid." };
    }
    const item = raw as Partial<LayoutOffcutCandidate>;
    if (item.reusable !== true) continue;
    const values = [item.thicknessMm, item.length, item.width, item.sheet, item.x, item.y];
    if (typeof item.boardId !== "string" || typeof item.boardLabel !== "string" ||
        !values.every((value) => typeof value === "number" && Number.isFinite(value)) ||
        item.thicknessMm! <= 0 || item.length! <= 0 || item.width! <= 0 ||
        !Number.isInteger(item.sheet) || item.sheet! < 1 || item.x! < 0 || item.y! < 0) {
      return { ok: false, error: "One of the selected offcuts has invalid dimensions or source coordinates." };
    }
    rows.push({
      owner_id: user.id,
      board_id: item.boardId,
      board_label: item.boardLabel,
      thickness_mm: item.thicknessMm!,
      length_mm: item.length!,
      width_mm: item.width!,
      quantity: 1,
      source_sheet_number: item.sheet!,
      source_x_mm: item.x!,
      source_y_mm: item.y!,
      status: "available",
      notes: "Imported from a generated cutting layout. Inspect and measure the physical remnant before reuse.",
    });
  }
  if (rows.length === 0) return { ok: false, error: "There are no reusable candidates with a known board thickness to save." };

  const { error } = await supabase.from("offcut_inventory").insert(rows);
  if (error) return { ok: false, error: "The layout offcuts could not be saved. Check the inventory migration and try again." };
  return { ok: true, count: rows.length };
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
