import { z } from "zod";

import { BUILDING_TYPES } from "@/lib/constants/building-types";

const buildingTypeValues = BUILDING_TYPES.map((t) => t.value) as [
  string,
  ...string[],
];

const optionalText = z.string().trim().optional().or(z.literal(""));

export const projectSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Enter a project title")
    .max(160, "Keep the title under 160 characters"),
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
  status: z.enum(["draft", "published"]),
});

export type ProjectFormValues = z.infer<typeof projectSchema>;
