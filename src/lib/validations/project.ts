import { z } from "zod";

import { BUILDING_TYPES } from "@/lib/constants/building-types";
import {
  PROJECT_CATEGORY_VALUES,
  type CategoryField,
  type ProjectCategory,
  fieldsFor,
} from "@/lib/constants/project-categories";

const buildingTypeValues = BUILDING_TYPES.map((t) => t.value) as [
  string,
  ...string[],
];

const categoryValues = PROJECT_CATEGORY_VALUES as [string, ...string[]];

const optionalText = z.string().trim().optional().or(z.literal(""));

export const projectSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Enter a project title")
    .max(160, "Keep the title under 160 characters"),
  category: z.enum(categoryValues, { message: "Choose a project category" }),
  description: z
    .string()
    .trim()
    .max(4000, "Keep the description under 4000 characters")
    .optional()
    .or(z.literal("")),
  locationCity: optionalText,
  locationCountry: optionalText,
  buildingType: z.enum(buildingTypeValues).optional().or(z.literal("")),
  style: optionalText,
  bedrooms: z.coerce.number().int().min(0).max(100).optional(),
  floors: z.coerce.number().int().min(0).max(300).optional(),
  budget: z.coerce.number().min(0).optional(),
  budgetCurrency: z.string().trim().max(8).optional().or(z.literal("")),
  materials: optionalText,
  completionDate: optionalText,
  client: optionalText,
  // 0077 added `private` and `archived`. A form that offered them while this
  // still said `["draft", "published"]` would fail validation on submit with
  // no field error to show for it, because status has no field error slot.
  status: z.enum(["draft", "published", "private", "archived"]),
});

export type ProjectFormValues = z.infer<typeof projectSchema>;

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/** Mirrors `projects_tags_bounded` in 0077. */
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;
export const MAX_TAGS_TOTAL_LENGTH = 800;

export function parseTags(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];

  const seen = new Set<string>();
  const tags: string[] = [];
  let total = 0;

  for (const piece of raw.split(",")) {
    const tag = piece.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    // A backstop, not the working limit. Twenty tags of forty characters is
    // exactly the 800 the column allows, so with the two limits above in
    // place this can never fire — which is why the check on it asserts that
    // arithmetic rather than trying to feed it an input that trips it.
    if (total + tag.length > MAX_TAGS_TOTAL_LENGTH) break;
    seen.add(key);
    tags.push(tag);
    total += tag.length;
    if (tags.length >= MAX_TAGS) break;
  }

  return tags;
}

// ---------------------------------------------------------------------------
// Category-specific answers
// ---------------------------------------------------------------------------

/** Mirrors `projects_metadata_bounded` in 0077, with room to spare. */
const MAX_METADATA_VALUE_LENGTH = 200;

function coerce(field: CategoryField, raw: string): unknown | null {
  const value = raw.trim();
  if (!value) return null;

  if (field.kind === "boolean") {
    // An unchecked checkbox posts nothing at all, so only a present value can
    // mean true here; `false` is the absence of the key, not a stored false.
    return value === "on" || value === "true" ? true : null;
  }

  if (field.kind === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (field.min !== undefined && n < field.min) return null;
    if (field.max !== undefined && n > field.max) return null;
    return n;
  }

  if (field.kind === "select") {
    // Only an option this field actually offers. Without this, a hand-written
    // post puts arbitrary text where the page expects one of four labels.
    const allowed = field.options?.some((o) => o.value === value);
    return allowed ? value : null;
  }

  return value.slice(0, MAX_METADATA_VALUE_LENGTH);
}

/**
 * The answers this category is allowed to store, and nothing else.
 *
 * Read from the category's own field list rather than from whatever the form
 * posted: the metadata column has no schema of its own, so this function is
 * the only thing standing between it and any key a crafted post cares to
 * invent. It is also what stops a kitchen keeping the bathrooms it was asked
 * for while it was still a building project.
 */
export function parseMetadata(
  category: ProjectCategory,
  formData: FormData,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  for (const field of fieldsFor(category)) {
    if (field.source !== "metadata") continue;
    const raw = formData.get(`meta.${field.id}`);
    if (typeof raw !== "string") continue;
    const value = coerce(field, raw);
    if (value !== null) metadata[field.id] = value;
  }

  return metadata;
}
