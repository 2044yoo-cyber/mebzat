/**
 * The trades, in the words somebody hiring would use.
 *
 * `service_categories` from 0011 is twelve broad groupings — "Joinery &
 * Furniture", "MEP Engineering" — which is the right shape for filing a
 * service listing and the wrong shape for a search box. Nobody types "MEP
 * Engineering"; they type "electrician". So this is the specific job title,
 * and `category` maps each one back onto the grouping that already exists,
 * so a profession filter and a category filter agree about who is who.
 *
 * Stored as text on `profiles.profession` rather than as an enum. This list
 * grows every time somebody names a trade nobody thought of, and a migration
 * per trade is a reason not to add them. The server validates against this
 * constant before writing, which is the same guarantee at a cost that does not
 * fall on whoever adds the next one.
 */

export type Profession = {
  /** Stored, and matched case-insensitively by the search. */
  value: string;
  label: string;
  /** service_categories.slug */
  category: string;
  /** Offered in the specialty field once this profession is chosen. */
  specialties: readonly string[];
};

export const PROFESSIONS: readonly Profession[] = [
  {
    value: "Welder",
    label: "Welder",
    category: "joinery",
    specialties: [
      "Gates",
      "Handrails",
      "Steel furniture",
      "Roof structures",
      "Stainless steel",
      "Window frames",
      "Security doors",
    ],
  },
  {
    value: "Carpenter",
    label: "Carpenter",
    category: "joinery",
    specialties: [
      "Doors",
      "Cabinets",
      "Roof timber",
      "Formwork",
      "Flooring",
      "Skirting and trim",
    ],
  },
  {
    value: "Electrician",
    label: "Electrician",
    category: "electrical",
    specialties: [
      "House wiring",
      "Distribution boards",
      "Lighting",
      "Generators",
      "Solar",
      "Fault finding",
    ],
  },
  {
    value: "Plumber",
    label: "Plumber",
    category: "plumbing",
    specialties: [
      "Bathrooms",
      "Kitchens",
      "Water tanks",
      "Drainage",
      "Pumps",
      "Leak repair",
    ],
  },
  {
    value: "Mason",
    label: "Mason",
    category: "general-contracting",
    specialties: [
      "Block work",
      "Plastering",
      "Concrete",
      "Stone work",
      "Foundations",
    ],
  },
  {
    value: "Painter",
    label: "Painter",
    category: "finishing",
    specialties: [
      "Interior painting",
      "Exterior painting",
      "Spray finish",
      "Decorative finishes",
      "Wood staining",
    ],
  },
  {
    value: "Architect",
    label: "Architect",
    category: "architecture",
    specialties: [
      "Residential",
      "Commercial",
      "Working drawings",
      "Permit drawings",
      "3D visualisation",
    ],
  },
  {
    value: "Civil Engineer",
    label: "Civil Engineer",
    category: "structural",
    specialties: [
      "Structural design",
      "Site supervision",
      "Quantity take-off",
      "Foundations",
      "Retaining walls",
    ],
  },
  {
    value: "Mechanical Engineer",
    label: "Mechanical Engineer",
    category: "mep",
    specialties: ["HVAC design", "Plumbing design", "Lifts", "Fire systems"],
  },
  {
    value: "Interior Designer",
    label: "Interior Designer",
    category: "interior",
    specialties: [
      "Residential",
      "Offices",
      "Cafés and restaurants",
      "Furniture selection",
      "Lighting design",
    ],
  },
  {
    value: "Furniture Maker",
    label: "Furniture Maker",
    category: "joinery",
    specialties: [
      "Kitchens",
      "Wardrobes",
      "TV units",
      "Office furniture",
      "Beds",
      "Upholstery",
    ],
  },
  {
    value: "Aluminium Worker",
    label: "Aluminium Worker",
    category: "joinery",
    specialties: [
      "Windows",
      "Doors",
      "Curtain walling",
      "Partitions",
      "Shopfronts",
    ],
  },
  {
    value: "Tile Installer",
    label: "Tile Installer",
    category: "finishing",
    specialties: ["Floor tiling", "Wall tiling", "Bathrooms", "Terrazzo", "Granite"],
  },
  {
    value: "Gypsum Worker",
    label: "Gypsum Worker",
    category: "finishing",
    specialties: ["Ceilings", "Partitions", "Cornices", "Bulkheads", "Lighting coves"],
  },
  {
    value: "HVAC Technician",
    label: "HVAC Technician",
    category: "mep",
    specialties: ["Split units", "Ducting", "Ventilation", "Cold rooms", "Servicing"],
  },
  {
    value: "Contractor",
    label: "Contractor",
    category: "general-contracting",
    specialties: [
      "Full build",
      "Renovation",
      "Fit-out",
      "Site management",
      "Finishing works",
    ],
  },
  {
    value: "Surveyor",
    label: "Surveyor",
    category: "surveying",
    specialties: [
      "Land survey",
      "Setting out",
      "Quantity surveying",
      "Topographic survey",
    ],
  },
  {
    value: "Landscape Designer",
    label: "Landscape Designer",
    category: "landscaping",
    specialties: ["Gardens", "Paving", "Irrigation", "Planting", "Outdoor lighting"],
  },
] as const;

export const PROFESSION_VALUES = PROFESSIONS.map((p) => p.value);

const BY_VALUE = new Map(
  PROFESSIONS.map((p) => [p.value.toLowerCase(), p] as const),
);

export function findProfession(value: string | null | undefined): Profession | null {
  if (!value) return null;
  return BY_VALUE.get(value.trim().toLowerCase()) ?? null;
}

/** Whether this is a trade the form offers, for the server to check before writing. */
export function isProfession(value: unknown): value is string {
  return typeof value === "string" && BY_VALUE.has(value.trim().toLowerCase());
}

/**
 * The specialties this profession offers, for the edit form.
 *
 * An unknown profession gets an empty list rather than every specialty in the
 * file: offering a welder "Irrigation" is worse than offering nothing, and a
 * free-text box beside it covers whatever is missing.
 */
export function specialtiesFor(profession: string | null | undefined): readonly string[] {
  return findProfession(profession)?.specialties ?? [];
}

/** Mirrors `profiles_specialties_bounded` in 0078. */
export const MAX_SPECIALTIES = 12;
const MAX_SPECIALTY_LENGTH = 40;

export function parseSpecialties(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(",")) {
    const value = piece.trim().replace(/\s+/g, " ").slice(0, MAX_SPECIALTY_LENGTH);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= MAX_SPECIALTIES) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// How far somebody will travel
// ---------------------------------------------------------------------------

/** Mirrors `profiles_travel_radius_choice` in 0078. */
export const TRAVEL_RADII = [5, 10, 20, 50] as const;

export function isTravelRadius(value: unknown): value is number {
  return (
    typeof value === "number" && (TRAVEL_RADII as readonly number[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/**
 * The four answers the brief asks for, on the `work_status` enum that already
 * exists. `limited` is "available this week" and `fully_booked` is "not
 * accepting work"; the enum has five values and the form offers four of them,
 * rather than a migration adding words for states already spelled.
 */
export const AVAILABILITY = [
  { value: "available", label: "Available now", tone: "good" },
  { value: "limited", label: "Available this week", tone: "good" },
  { value: "busy", label: "Busy", tone: "warn" },
  { value: "fully_booked", label: "Not accepting work", tone: "off" },
] as const;

export const AVAILABILITY_LABELS: Record<string, string> = {
  available: "Available now",
  limited: "Available this week",
  busy: "Busy",
  fully_booked: "Not accepting work",
  offline: "Not accepting work",
};
