import { architectureSpecs } from "./specs/architecture";
import { businessSpecs } from "./specs/business";
import { concreteSpecs } from "./specs/concrete";
import { constructionSpecs, costSpecs } from "./specs/cost";
import { earthworkSpecs } from "./specs/earthwork";
import { finishingSpecs } from "./specs/finishing";
import { furnitureSpecs } from "./specs/furniture";
import { masonrySpecs } from "./specs/masonry";
import { roofingSpecs } from "./specs/roofing";
import { steelSpecs } from "./specs/steel";
import { CALCULATOR_CATEGORIES, type CalculatorSpec, type CategoryId } from "./types";

/**
 * Every calculator, in one list.
 *
 * The hub, the search box, the route handler and the sitemap all read from
 * here. A calculator that is not in this array does not exist as far as the
 * site is concerned, which is the property that keeps the four of them from
 * disagreeing about what has been built.
 */
export const CALCULATORS: CalculatorSpec[] = [
  ...constructionSpecs,
  ...concreteSpecs,
  ...steelSpecs,
  ...masonrySpecs,
  ...finishingSpecs,
  ...roofingSpecs,
  ...earthworkSpecs,
  ...architectureSpecs,
  ...furnitureSpecs,
  ...costSpecs,
  ...businessSpecs,
];

/** Guards against two calculators claiming the same URL. */
const seen = new Set<string>();
for (const calculator of CALCULATORS) {
  if (seen.has(calculator.slug)) {
    throw new Error(`Two calculators share the slug "${calculator.slug}".`);
  }
  seen.add(calculator.slug);
}

export function calculatorBySlug(slug: string): CalculatorSpec | undefined {
  return CALCULATORS.find((calculator) => calculator.slug === slug);
}

export function calculatorsInCategory(category: CategoryId): CalculatorSpec[] {
  return CALCULATORS.filter((calculator) => calculator.category === category);
}

/** The categories that actually have something in them, in display order. */
export function populatedCategories() {
  return CALCULATOR_CATEGORIES.map((category) => ({
    ...category,
    calculators: calculatorsInCategory(category.id),
  })).filter((category) => category.calculators.length > 0);
}

export function popularCalculators(): CalculatorSpec[] {
  return CALCULATORS.filter((calculator) => calculator.popular);
}

/**
 * Search.
 *
 * Ranked rather than filtered: a title match beats a keyword match beats a
 * mention in the summary, so typing "concrete" puts the Concrete Volume
 * Calculator first and the ones that merely mention concrete after it. All of
 * it runs in the browser over an array of forty — there is no reason to ask a
 * server what "tile" means.
 */
export function searchCalculators(query: string): CalculatorSpec[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const scored = CALCULATORS.map((calculator) => {
    const title = calculator.title.toLowerCase();
    let score = 0;

    if (title === needle) score = 100;
    // The calculator whose slug *is* the query is the one meant by it.
    // "concrete" matches the titles of five concrete calculators and all of
    // them start with the word; without this, the tie broke alphabetically and
    // typing "concrete" offered the Slab calculator ahead of the Concrete one.
    else if (calculator.slug === needle) score = 90;
    else if (title.startsWith(needle)) score = 80;
    else if (title.includes(needle)) score = 60;
    else if (calculator.slug.includes(needle)) score = 55;
    else if (calculator.keywords.some((word) => word === needle)) score = 50;
    else if (calculator.keywords.some((word) => word.includes(needle))) score = 30;
    else if (calculator.summary.toLowerCase().includes(needle)) score = 15;

    return { calculator, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.calculator.title.localeCompare(b.calculator.title));

  return scored.map((entry) => entry.calculator);
}

export { CALCULATOR_CATEGORIES };
export type { CalculatorSpec, CategoryId };
