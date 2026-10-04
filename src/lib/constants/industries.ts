/**
 * What sector an organisation is in, and how big it is.
 *
 * The person's equivalent of the first question is `profession`, which already
 * exists and has its own list. These two are asked of a company and of nobody
 * else, which is the whole point of the split: a construction firm has no
 * years of experience as a person, and a carpenter has no headcount.
 *
 * Both lists are free-text columns with a fixed list in front of them, on the
 * same reasoning as `profession`: the list can grow without a migration, and
 * the validation below is the only thing between the column and whatever a
 * crafted post puts there.
 */

export const INDUSTRIES = [
  "Architecture and design",
  "General contracting",
  "Real estate development",
  "Property management",
  "Civil engineering",
  "Electromechanical",
  "Interior fit-out",
  "Furniture and joinery",
  "Building materials supply",
  "Manufacturing",
  "Equipment and machinery",
  "Surveying and consultancy",
  "Landscaping",
  "Government and public works",
  "Education and research",
  "Other",
] as const;

export type Industry = (typeof INDUSTRIES)[number];

export const COMPANY_SIZES = [
  "1–5 people",
  "6–20 people",
  "21–50 people",
  "51–200 people",
  "201–500 people",
  "More than 500 people",
] as const;

export type CompanySize = (typeof COMPANY_SIZES)[number];

export function isIndustry(value: unknown): value is Industry {
  return typeof value === "string" && (INDUSTRIES as readonly string[]).includes(value);
}

export function isCompanySize(value: unknown): value is CompanySize {
  return (
    typeof value === "string" && (COMPANY_SIZES as readonly string[]).includes(value)
  );
}
