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
  // The two columns that decide the section. Both required, because a
  // marketplace where the seller can leave them blank is one where the default
  // quietly decides — and the defaults put second-hand goods under New and
  // files among the cement bags.
  fulfilment: z.enum(["physical", "rental", "digital"]),
  rentalPeriod: z
    .enum(["daily", "weekly", "monthly"])
    .optional()
    .or(z.literal("")),
  rentalDeposit: z.coerce
    .number()
    .min(0, "A deposit cannot be negative")
    .optional(),
  digitalFilePath: optionalText,
  digitalFileName: optionalText,
  digitalKind: z
    .enum(["course", "sketchup", "model_3d", "floor_plan", "other"])
    .optional()
    .or(z.literal("")),
  fileFormat: optionalText,
  fileSizeMb: z.coerce
    .number()
    .positive("Enter a size in megabytes")
    .max(100000, "That is larger than this marketplace handles")
    .optional(),
  license: z.enum(["personal", "commercial"]).optional().or(z.literal("")),
  condition: z.enum(["new", "used"]),
  usedGrade: z
    .enum(["like_new", "good", "fair", "needs_repair"])
    .optional()
    .or(z.literal("")),
  conditionNotes: z
    .string()
    .trim()
    .max(1000, "Keep the condition note under 1000 characters")
    .optional()
    .or(z.literal("")),
  knownDefects: z
    .string()
    .trim()
    .max(1000, "Keep the defects note under 1000 characters")
    .optional()
    .or(z.literal("")),
  saleReason: z
    .string()
    .trim()
    .max(300, "Keep this short")
    .optional()
    .or(z.literal("")),
  ageMonths: z.coerce
    .number()
    .int()
    .min(0, "Age can't be negative")
    .max(1200, "Enter the age in months")
    .optional(),
  locationCity: optionalText,
  // A neighbourhood or sub-city. Never a street address — the rest is for a
  // message, once the seller has decided to send one.
  locationArea: optionalText,
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

/**
 * The second-hand fields, cleared when the listing is not second-hand.
 *
 * The database refuses a new listing that carries a grade, so this is not the
 * only guard — but a seller who fills in "Fair, scratched" and then switches
 * the condition back to New would otherwise get a check-constraint error
 * instead of a saved listing. The fields are dropped rather than the save
 * refused, because the seller has already told us what they meant.
 */
export function usedFieldsFor(data: ProductFormValues) {
  if (data.condition === "new") {
    return {
      used_grade: null,
      condition_notes: null,
      known_defects: null,
      sale_reason: null,
      age_months: null,
    };
  }
  return {
    used_grade: data.usedGrade || null,
    condition_notes: data.conditionNotes || null,
    known_defects: data.knownDefects || null,
    sale_reason: data.saleReason || null,
    age_months: typeof data.ageMonths === "number" ? data.ageMonths : null,
  };
}

/**
 * The digital fields, cleared when the listing is not a file.
 *
 * And the physical ones forced when it is. A file is never second-hand and
 * never arrives in a van, so the database refuses a digital listing that says
 * otherwise — but a seller who filled in a condition and then switched to
 * Digital would meet that refusal as a check-constraint error rather than a
 * saved listing. What they meant is not ambiguous, so it is applied.
 */
export function digitalFieldsFor(data: ProductFormValues) {
  if (data.fulfilment !== "digital") {
    return {
      digital_kind: null,
      file_format: null,
      file_size_mb: null,
      license: null,
      digital_file_path: null,
      digital_file_name: null,
    };
  }
  return {
    digital_kind: data.digitalKind || null,
    file_format: data.fileFormat || null,
    file_size_mb: typeof data.fileSizeMb === "number" ? data.fileSizeMb : null,
    license: data.license || null,
    digital_file_path: data.digitalFilePath || null,
    digital_file_name: data.digitalFileName || null,
  };
}

/** The rental fields, cleared when the listing is not a rental. */
export function rentalFieldsFor(data: ProductFormValues) {
  if (data.fulfilment !== "rental") {
    return { rental_period: null, rental_deposit: null };
  }
  return {
    rental_period: data.rentalPeriod || "daily",
    rental_deposit:
      typeof data.rentalDeposit === "number" ? data.rentalDeposit : null,
  };
}
