/**
 * What each kind of project is asked, in one table.
 *
 * Three things need to agree about a kitchen project: the form (which fields
 * to render), the server action (which answers to accept), and the project
 * page (which answers to show). When they disagree the failure is silent — a
 * field the form collects and the action drops looks like a working form and
 * loses the answer, and a field the page shows but the form never asks reads
 * as "Bedrooms: —" on a wardrobe.
 *
 * So they read this file instead of each keeping a list. Adding a field to a
 * category is one entry here and nothing else.
 *
 * ## Columns and metadata
 *
 * `source` says where an answer lives. Three fields are columns on `projects`
 * because 0004 built the table around a house and rows already depend on them;
 * everything else goes in the `metadata` jsonb, because a kitchen's countertop
 * material is display-only and no query wants it. The form and the page do not
 * care which is which — that is the point of putting it here.
 */

import { BUILDING_TYPES } from "@/lib/constants/building-types";

export const PROJECT_CATEGORIES = [
  { value: "building_construction", label: "Building Construction" },
  { value: "architecture", label: "Architecture" },
  { value: "interior_design", label: "Interior Design" },
  { value: "kitchen", label: "Kitchen" },
  { value: "furniture", label: "Furniture" },
  { value: "wardrobe", label: "Wardrobe" },
  { value: "joinery", label: "Joinery" },
  { value: "renovation", label: "Renovation" },
  { value: "finishing", label: "Finishing" },
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "landscaping", label: "Landscaping" },
  { value: "construction_product", label: "Construction Product" },
  { value: "other", label: "Other" },
] as const;

export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number]["value"];

export const PROJECT_CATEGORY_VALUES = PROJECT_CATEGORIES.map(
  (c) => c.value,
) as ProjectCategory[];

export const PROJECT_CATEGORY_MAP = Object.fromEntries(
  PROJECT_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<ProjectCategory, string>;

export function isProjectCategory(value: unknown): value is ProjectCategory {
  return (
    typeof value === "string" &&
    (PROJECT_CATEGORY_VALUES as string[]).includes(value)
  );
}

export const DEFAULT_PROJECT_CATEGORY: ProjectCategory = "building_construction";

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export type FieldKind = "text" | "number" | "select" | "boolean";

export type CategoryField = {
  /** The metadata key, or the form field name when this is a column. */
  id: string;
  label: string;
  kind: FieldKind;
  /** A column on `projects`, or a key in `projects.metadata`. */
  source: "column" | "metadata";
  options?: readonly { value: string; label: string }[];
  placeholder?: string;
  /** Only meaningful for `number`. */
  min?: number;
  max?: number;
};

const PROJECT_PHASE = [
  { value: "concept", label: "Concept / design" },
  { value: "under_construction", label: "Under construction" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On hold" },
] as const;

const CONSTRUCTION_TYPE = [
  { value: "new_build", label: "New build" },
  { value: "extension", label: "Extension" },
  { value: "renovation", label: "Renovation" },
  { value: "fit_out", label: "Fit-out" },
] as const;

const KITCHEN_TYPE = [
  { value: "straight", label: "Straight" },
  { value: "l_shaped", label: "L-shaped" },
  { value: "u_shaped", label: "U-shaped" },
  { value: "island", label: "Island" },
  { value: "other", label: "Other" },
] as const;

const KITCHEN_SCOPE = [
  { value: "design_only", label: "Design only" },
  { value: "design_build", label: "Design + construction" },
  { value: "installation", label: "Installation" },
  { value: "renovation", label: "Renovation" },
] as const;

const MAKER_SCOPE = [
  { value: "design", label: "Design" },
  { value: "manufacture", label: "Manufacture" },
  { value: "installation", label: "Installation" },
  { value: "design_manufacture", label: "Design + manufacture" },
  { value: "full", label: "Design, manufacture and installation" },
] as const;

const INTERIOR_DELIVERY = [
  { value: "design_only", label: "Design only" },
  { value: "implementation", label: "Implementation" },
  { value: "both", label: "Both" },
] as const;

/**
 * Building type, bedrooms and floors are the three columns 0004 wrote, and
 * they keep their old form-field names so an existing project edits without a
 * migration of its answers.
 */
const BUILDING_FIELDS: CategoryField[] = [
  {
    id: "buildingType",
    label: "Building type",
    kind: "select",
    source: "column",
    options: BUILDING_TYPES,
  },
  { id: "built_area", label: "Built area (m²)", kind: "text", source: "metadata", placeholder: "320" },
  { id: "plot_area", label: "Plot / site area (m²)", kind: "text", source: "metadata", placeholder: "500" },
  { id: "floors", label: "Floors", kind: "number", source: "column", min: 0, max: 300 },
  { id: "bedrooms", label: "Bedrooms", kind: "number", source: "column", min: 0, max: 100 },
  { id: "bathrooms", label: "Bathrooms", kind: "number", source: "metadata", min: 0, max: 100 },
  { id: "project_phase", label: "Project status", kind: "select", source: "metadata", options: PROJECT_PHASE },
  { id: "construction_type", label: "Construction type", kind: "select", source: "metadata", options: CONSTRUCTION_TYPE },
];

const KITCHEN_FIELDS: CategoryField[] = [
  { id: "kitchen_type", label: "Kitchen type", kind: "select", source: "metadata", options: KITCHEN_TYPE },
  { id: "kitchen_size", label: "Approximate size", kind: "text", source: "metadata", placeholder: "3.6 m run, or 12 m²" },
  { id: "material", label: "Material", kind: "text", source: "metadata", placeholder: "MDF, plywood, solid wood…" },
  { id: "finish", label: "Finish", kind: "text", source: "metadata", placeholder: "Matte spray, melamine, veneer…" },
  { id: "countertop", label: "Countertop material", kind: "text", source: "metadata", placeholder: "Granite, quartz, laminate…" },
  { id: "scope", label: "Project type", kind: "select", source: "metadata", options: KITCHEN_SCOPE },
];

/** Furniture, wardrobes and joinery are the same questions about the same work. */
const MAKER_FIELDS: CategoryField[] = [
  { id: "furniture_type", label: "Furniture type", kind: "text", source: "metadata", placeholder: "Wardrobe, TV unit, office desk…" },
  { id: "dimensions", label: "Approximate dimensions", kind: "text", source: "metadata", placeholder: "2400 × 600 × 2100 mm" },
  { id: "material", label: "Material", kind: "text", source: "metadata", placeholder: "MDF, plywood, solid wood…" },
  { id: "finish", label: "Finish", kind: "text", source: "metadata", placeholder: "Spray, melamine, veneer…" },
  { id: "quantity", label: "Quantity", kind: "number", source: "metadata", min: 1, max: 10000 },
  { id: "scope", label: "Work done", kind: "select", source: "metadata", options: MAKER_SCOPE },
  { id: "custom_made", label: "Custom-made", kind: "boolean", source: "metadata" },
];

const INTERIOR_FIELDS: CategoryField[] = [
  { id: "space_type", label: "Space type", kind: "text", source: "metadata", placeholder: "Apartment, office, café…" },
  { id: "area", label: "Area (m²)", kind: "text", source: "metadata", placeholder: "120" },
  { id: "rooms", label: "Rooms / spaces designed", kind: "text", source: "metadata", placeholder: "Living room, two bedrooms, kitchen" },
  { id: "scope_of_work", label: "Scope of work", kind: "text", source: "metadata", placeholder: "Layout, joinery, lighting, furniture selection" },
  { id: "delivery", label: "Design or implementation", kind: "select", source: "metadata", options: INTERIOR_DELIVERY },
];

const PRODUCT_FIELDS: CategoryField[] = [
  { id: "product_type", label: "Product type", kind: "text", source: "metadata", placeholder: "Paving block, door, window frame…" },
  { id: "material", label: "Material", kind: "text", source: "metadata" },
  { id: "dimensions", label: "Dimensions", kind: "text", source: "metadata", placeholder: "200 × 100 × 60 mm" },
  { id: "quantity", label: "Quantity", kind: "number", source: "metadata", min: 1, max: 1000000 },
  { id: "application", label: "Application / use", kind: "text", source: "metadata", placeholder: "Driveways, external walls…" },
  { id: "custom_made", label: "Custom-made", kind: "boolean", source: "metadata" },
];

/**
 * The trades the brief lists but does not spell out fields for.
 *
 * Two questions, not eight. Every one of these jobs has a size and a scope and
 * an electrician has no use for a countertop material, so guessing further
 * would build exactly the giant form the brief asks not to have. If a trade
 * turns out to need more, it gets its own list here.
 */
const TRADE_FIELDS: CategoryField[] = [
  { id: "area", label: "Approximate area or size", kind: "text", source: "metadata", placeholder: "120 m², or 3 floors" },
  { id: "scope_of_work", label: "Scope of work", kind: "text", source: "metadata", placeholder: "What you did on this job" },
];

export const CATEGORY_FIELDS: Record<ProjectCategory, CategoryField[]> = {
  building_construction: BUILDING_FIELDS,
  architecture: BUILDING_FIELDS,
  interior_design: INTERIOR_FIELDS,
  kitchen: KITCHEN_FIELDS,
  furniture: MAKER_FIELDS,
  wardrobe: MAKER_FIELDS,
  joinery: MAKER_FIELDS,
  renovation: TRADE_FIELDS,
  finishing: TRADE_FIELDS,
  electrical: TRADE_FIELDS,
  plumbing: TRADE_FIELDS,
  landscaping: TRADE_FIELDS,
  construction_product: PRODUCT_FIELDS,
  other: TRADE_FIELDS,
};

export function fieldsFor(category: ProjectCategory): CategoryField[] {
  return CATEGORY_FIELDS[category] ?? TRADE_FIELDS;
}

/** The metadata keys a given category is allowed to write. */
export function metadataKeysFor(category: ProjectCategory): string[] {
  return fieldsFor(category)
    .filter((f) => f.source === "metadata")
    .map((f) => f.id);
}

/**
 * Whether this category uses the columns 0004 built for houses.
 *
 * Asked as a question about the fields rather than as a second list of
 * categories: a list would have to be kept in step with CATEGORY_FIELDS by
 * hand, and the first time it was not, a kitchen would be asked its bedrooms
 * again.
 */
export function usesBuildingColumns(category: ProjectCategory): boolean {
  return fieldsFor(category).some((f) => f.source === "column");
}

/** How a stored answer should read on the project page. */
export function displayValue(
  field: CategoryField,
  raw: unknown,
): string | null {
  if (raw === null || raw === undefined || raw === "") return null;

  if (field.kind === "boolean") {
    if (raw === true || raw === "true") return "Yes";
    if (raw === false || raw === "false") return "No";
    return null;
  }

  if (field.kind === "select" && field.options) {
    const match = field.options.find((o) => o.value === String(raw));
    // An option that is no longer offered still has to render as something.
    // Showing the raw value beats showing nothing, which would silently drop
    // an answer the author gave.
    return match ? match.label : String(raw);
  }

  return String(raw);
}
