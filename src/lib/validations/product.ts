import { z } from "zod";

const optionalText = z.string().trim().optional().or(z.literal(""));

export const productSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Enter a product name")
    .max(160, "Keep the name under 160 characters"),
  description: z
    .string()
    .trim()
    .max(4000, "Keep the description under 4000 characters")
    .optional()
    .or(z.literal("")),
  categoryId: z.string().uuid().optional().or(z.literal("")),
  brand: optionalText,
  price: z.coerce.number().min(0, "Price can't be negative").optional(),
  currency: z.string().trim().max(8).optional().or(z.literal("")),
  unit: optionalText,
  stockStatus: z.enum(["in_stock", "made_to_order", "out_of_stock"]),
  locationCity: optionalText,
  locationCountry: optionalText,
  deliveryAvailable: z.coerce.boolean().optional(),
  // Specs arrive as a JSON string of [{ key, value }] rows from the client.
  specs: optionalText,
  status: z.enum(["draft", "published"]),
});

export type ProductFormValues = z.infer<typeof productSchema>;

export function parseSpecs(raw: string | undefined | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return {};
    const specs: Record<string, string> = {};
    for (const row of parsed) {
      const key = typeof row?.key === "string" ? row.key.trim() : "";
      const value = typeof row?.value === "string" ? row.value.trim() : "";
      if (key && value) specs[key] = value;
    }
    return specs;
  } catch {
    return {};
  }
}
