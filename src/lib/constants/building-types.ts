import type { BuildingType } from "@/types/database.types";

export const BUILDING_TYPES: { value: BuildingType; label: string }[] = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "industrial", label: "Industrial" },
  { value: "hospitality", label: "Hospitality" },
  { value: "institutional", label: "Institutional" },
  { value: "mixed_use", label: "Mixed use" },
  { value: "landscape", label: "Landscape" },
  { value: "interior", label: "Interior" },
  { value: "renovation", label: "Renovation" },
  { value: "other", label: "Other" },
];

export const BUILDING_TYPE_MAP = Object.fromEntries(
  BUILDING_TYPES.map((t) => [t.value, t]),
) as Record<BuildingType, (typeof BUILDING_TYPES)[number]>;
