import { z } from "zod";

import { ACCOUNT_TYPES } from "@/lib/constants/account-types";

const accountTypeValues = ACCOUNT_TYPES.map((t) => t.value) as [
  string,
  ...string[],
];

export const accountTypeSchema = z.object({
  accountType: z.enum(accountTypeValues),
});

export const ORGANIZATION_ACCOUNT_TYPES = new Set([
  "company",
  "supplier",
  "manufacturer",
  "contractor",
  "developer",
  "government",
  "university",
]);

export const profileDetailsSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name"),
  companyName: z.string().trim().optional().or(z.literal("")),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "At least 3 characters")
    .max(30, "At most 30 characters")
    .regex(
      /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])?$/,
      "Use lowercase letters, numbers, - and _ only",
    ),
  locationCity: z.string().trim().optional().or(z.literal("")),
  locationCountry: z.string().trim().optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  yearsExperience: z.coerce.number().int().min(0).max(80).optional(),
  bio: z.string().trim().max(600, "Keep it under 600 characters").optional().or(z.literal("")),
  website: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || /^https?:\/\/.+/.test(v),
      "Include http:// or https://",
    ),
  languages: z.string().trim().optional().or(z.literal("")),
});
