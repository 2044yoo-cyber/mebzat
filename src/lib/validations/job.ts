import { z } from "zod";

import { JOB_CATEGORIES, SALARY_PERIODS } from "@/lib/constants/jobs";

/**
 * What a job posting has to contain before anyone sees it.
 *
 * One schema, used by the form in the browser and again by the server action,
 * because a validation that only runs in the browser is a suggestion. The
 * server does not trust the client's copy of it; it runs the same parse on
 * whatever arrives.
 *
 * A draft is held to the same shape but not the same completeness — see
 * `jobDraftSchema` at the bottom. Somebody halfway through writing a job
 * should be able to save it and come back.
 */

const categoryIds = JOB_CATEGORIES.map((category) => category.id);
const periodIds = SALARY_PERIODS.map((period) => period.id);

const optional = z.string().trim().max(200).optional().or(z.literal(""));

export const jobFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(4, "Give the role a title")
      .max(160, "Keep the title under 160 characters"),

    category: z
      .string()
      .refine((value) => categoryIds.includes(value), "Choose a category"),

    description: z
      .string()
      .trim()
      .min(40, "Describe the work in a few sentences")
      .max(8000, "Keep the description under 8000 characters"),

    responsibilities: z.string().trim().max(4000).optional().or(z.literal("")),
    requirements: z.string().trim().max(4000).optional().or(z.literal("")),

    jobType: z.enum([
      "full_time",
      "part_time",
      "contract",
      "freelance",
      "internship",
      "temporary",
    ]),
    workMode: z.enum(["on_site", "hybrid", "remote"]),
    experienceLevel: z.enum(["entry", "junior", "mid", "senior", "lead"]),

    profession: optional,
    skills: z.array(z.string().trim().min(1).max(40)).max(20, "Twenty skills is plenty"),

    city: optional,
    country: z.string().trim().max(80).optional().or(z.literal("")),

    salaryMin: z.number().min(0).max(1_000_000_000).nullable(),
    salaryMax: z.number().min(0).max(1_000_000_000).nullable(),
    currency: z.string().trim().min(1).max(8),
    salaryPeriod: z
      .string()
      .refine((value) => periodIds.includes(value as (typeof periodIds)[number]), "Choose a period"),
    salaryVisible: z.boolean(),

    openings: z.number().int().min(1, "At least one").max(500),
    closesOn: z
      .string()
      .trim()
      .optional()
      .or(z.literal(""))
      .refine(
        (value) => !value || !Number.isNaN(Date.parse(value)),
        "That is not a date",
      ),

    visibility: z.enum(["public", "private"]),
    companyId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (data) =>
      data.salaryMin === null ||
      data.salaryMax === null ||
      data.salaryMax >= data.salaryMin,
    { message: "The top of the range is below the bottom", path: ["salaryMax"] },
  )
  .refine(
    // A remote job with a city is not wrong, but an on-site job without one is
    // unanswerable: nobody can decide whether they can take it.
    (data) => data.workMode === "remote" || Boolean(data.city),
    { message: "Where is the work? On-site and hybrid roles need a city", path: ["city"] },
  );

export type JobFormValues = z.infer<typeof jobFormSchema>;

/**
 * A draft only needs a title.
 *
 * Everything else is optional, because the whole point of a draft is to keep
 * what somebody has written so far. The full schema runs at publish, and that
 * is where a half-finished job is stopped.
 */
export const jobDraftSchema = z.object({
  title: z.string().trim().min(2, "Give the draft a title").max(160),
});
