"use server";

import { revalidatePath } from "next/cache";
import {
  addOffcut,
  addOffcutsFromLayout,
  changeOffcutStatus,
  deleteOffcut,
  type OffcutStatus,
} from "@/features/berchuma-studio/services/offcuts";

const inventoryPath = "/studio/offcuts";

export async function addOffcutAction(formData: FormData) {
  const result = await addOffcut({
    boardLabel: String(formData.get("boardLabel") ?? ""),
    boardId: String(formData.get("boardId") ?? ""),
    thicknessMm: Number(formData.get("thicknessMm")),
    lengthMm: Number(formData.get("lengthMm")),
    widthMm: Number(formData.get("widthMm")),
    quantity: Number(formData.get("quantity")),
    location: String(formData.get("location") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (result.ok) revalidatePath(inventoryPath);
  return result;
}

export async function saveLayoutOffcutsAction(candidates: unknown) {
  const result = await addOffcutsFromLayout(candidates);
  if (result.ok) revalidatePath(inventoryPath);
  return result;
}

export async function changeOffcutStatusAction(id: string, status: OffcutStatus) {
  const result = await changeOffcutStatus(id, status);
  if (result.ok) revalidatePath(inventoryPath);
  return result;
}

export async function deleteOffcutAction(id: string) {
  const result = await deleteOffcut(id);
  if (result.ok) revalidatePath(inventoryPath);
  return result;
}
