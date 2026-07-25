import { z } from "zod";

const optionalText = z.string().trim().optional().or(z.literal(""));

export const companyEditSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter the business name")
    .max(160, "Keep the name under 160 characters"),
  category: optionalText,
  description: z
    .string()
    .trim()
    .max(4000, "Keep the description under 4000 characters")
    .optional()
    .or(z.literal("")),
  website: optionalText.refine(
    (v) => !v || /^https?:\/\/.+/.test(v),
    "Include http:// or https://",
  ),
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .optional()
    .or(z.literal("")),
  phone: optionalText,
  address: optionalText,
  city: optionalText,
  country: optionalText,
  employeesCount: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

export type CompanyEditValues = z.infer<typeof companyEditSchema>;

export const claimSchema = z.object({
  roleAtCompany: z
    .string()
    .trim()
    .min(2, "Tell us your role at the business")
    .max(80),
  contactEmail: z.string().trim().email("Enter a valid email"),
  contactPhone: optionalText,
  message: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type ClaimValues = z.infer<typeof claimSchema>;
