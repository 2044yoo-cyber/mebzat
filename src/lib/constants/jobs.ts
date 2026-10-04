import type { JobVisibility } from "@/types/database.types";

/**
 * What a job can be about.
 *
 * The column is text rather than an enum precisely so this list can grow
 * without a migration — but it has to live somewhere, and one array read by
 * the form, the filters, the labels and the search chips is the only way four
 * surfaces agree about what the trade contains.
 *
 * These are the disciplines an Ethiopian construction platform actually hires
 * for. "Software Engineer" is not here, and that is the point: a jobs board
 * that accepts everything is a jobs board nobody filters.
 */

export type JobCategory = {
  /** Stored in `jobs.category`. Stable — renaming a label is free, this is not. */
  id: string;
  label: string;
  /** Coarse grouping for the filter list, so 25 chips are not one wall. */
  group: "Design" | "Engineering" | "Trades" | "Management" | "Site & supply";
};

export const JOB_CATEGORIES: JobCategory[] = [
  { id: "architecture", label: "Architecture", group: "Design" },
  { id: "interior_design", label: "Interior Design", group: "Design" },
  { id: "furniture", label: "Furniture", group: "Design" },
  { id: "drafting_cad", label: "Drafting / CAD", group: "Design" },
  { id: "bim", label: "BIM", group: "Design" },
  { id: "visualization_3d", label: "3D Visualization", group: "Design" },
  { id: "rendering", label: "Rendering", group: "Design" },

  { id: "civil_engineering", label: "Civil Engineering", group: "Engineering" },
  { id: "structural_engineering", label: "Structural Engineering", group: "Engineering" },
  { id: "mep", label: "MEP", group: "Engineering" },
  { id: "electrical", label: "Electrical", group: "Engineering" },
  { id: "plumbing", label: "Plumbing", group: "Engineering" },
  { id: "hvac", label: "HVAC", group: "Engineering" },
  { id: "surveying", label: "Surveying", group: "Engineering" },

  { id: "carpentry", label: "Carpentry", group: "Trades" },
  { id: "masonry", label: "Masonry", group: "Trades" },
  { id: "steel_fabrication", label: "Steel Fabrication", group: "Trades" },
  { id: "finishing", label: "Finishing", group: "Trades" },
  { id: "painting", label: "Painting", group: "Trades" },
  { id: "tiling", label: "Tiling", group: "Trades" },
  { id: "construction_labor", label: "Construction Labour", group: "Trades" },
  { id: "equipment_operators", label: "Equipment Operators", group: "Trades" },

  { id: "construction_management", label: "Construction Management", group: "Management" },
  { id: "project_management", label: "Project Management", group: "Management" },
  { id: "quantity_surveying", label: "Quantity Surveying", group: "Management" },
  { id: "procurement", label: "Procurement", group: "Management" },

  { id: "site_engineering", label: "Site Engineering", group: "Site & supply" },
  { id: "general_contractor", label: "General Contractor", group: "Site & supply" },
  { id: "subcontractor", label: "Subcontractor", group: "Site & supply" },
  { id: "landscaping", label: "Landscaping", group: "Site & supply" },
  { id: "property_services", label: "Property Services", group: "Site & supply" },
];

export const JOB_CATEGORY_GROUPS = [
  "Design",
  "Engineering",
  "Trades",
  "Management",
  "Site & supply",
] as const;

export function jobCategoryLabel(id: string | null | undefined): string {
  if (!id) return "Uncategorised";
  return (
    JOB_CATEGORIES.find((category) => category.id === id)?.label ??
    // An id that is not in the list is a category added after this build. It
    // is shown rather than hidden, because the column deliberately allows it.
    id.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase())
  );
}

export function isJobCategory(value: unknown): boolean {
  return (
    typeof value === "string" &&
    JOB_CATEGORIES.some((category) => category.id === value)
  );
}

/**
 * How a figure is quoted.
 *
 * `jobs.salary_period` is free text and this is the list the form offers. A
 * project fee is a range with a period of "project" rather than a separate
 * budget field — one pair of numbers with a word beside it reads correctly for
 * a monthly salary, a daily rate and a fixed price, and cannot drift out of
 * step with a second pair.
 */
export const SALARY_PERIODS = [
  { id: "month", label: "per month" },
  { id: "week", label: "per week" },
  { id: "day", label: "per day" },
  { id: "hour", label: "per hour" },
  { id: "project", label: "for the project" },
] as const;

export function salaryPeriodLabel(period: string): string {
  return (
    SALARY_PERIODS.find((entry) => entry.id === period)?.label ??
    `per ${period}`
  );
}

export const JOB_VISIBILITY: Record<JobVisibility, { label: string; hint: string }> = {
  public: {
    label: "Public",
    hint: "Listed on Medosha, in search and on your profile.",
  },
  private: {
    label: "Private",
    hint: "Reachable only by the link. Never listed, never searchable.",
  },
};

/** Where a job's files live. Path is `<job id>/<filename>`, which the storage policy reads. */
export const JOB_FILES_BUCKET = "job-files";

/** What the pipeline calls each stage, in the order it runs. */
export const APPLICATION_PIPELINE = [
  "submitted",
  "reviewing",
  "shortlisted",
  "interviewing",
  "offered",
  "hired",
] as const;
