/**
 * The server-side wiring of the profile page that the browser harness stands
 * in for: the page itself and the product form's digital start.
 *
 *   npx tsx scripts/portfolio_wiring_check.ts
 *
 * Read with comments stripped and scoped to the function that has to say it,
 * so a comment or a sibling's line cannot satisfy a check.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const code = (source: string) => source.replace(/(^|[\s;,{(=])\/\*[\s\S]*?\*\//g, "$1").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const scope = (source: string, start: string) => {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `${start} not found`);
  const rest = source.slice(from + start.length);
  const next = rest.search(/\n(export |function )/);
  return start + (next < 0 ? rest : rest.slice(0, next));
};

const page = scope(code(readFileSync("src/app/(dashboard)/projects/page.tsx", "utf8")), "export default async function ProjectsPage");
ok(/if \(!user\) redirect\("\/login\?redirect=\/projects"\)/.test(page), "signed out, the page sends people to sign in and back");
ok(/countSections\(supabase, user\.id\)/.test(page), "counts are the signed-in person's own");
ok(/readSectionPage\(supabase, user\.id, first, null, PAGE_SIZE\)/.test(page), "the first section is read with the page, for the signed-in person");
ok(/\{ label: "Posts", value: counts\.designs \}/.test(page) && /\{ label: "Projects", value: counts\.projects \}/.test(page)
  && /\{ label: "Listings", value: counts\.marketplace \}/.test(page) && /\{ label: "Digital", value: counts\.digital \}/.test(page), "each statistic is its own section's count");
ok(/<PortfolioFeed owner=\{user\.id\}/.test(page), "the feed is the signed-in person's");
ok(!/searchParams[^;]*owner|query\.(owner|user)/.test(page), "and whose it is never comes from the address");

const action = scope(code(readFileSync("src/app/(dashboard)/projects/portfolio-actions.ts", "utf8")), "export async function loadPortfolioPage");
ok(/^export async function loadPortfolioPage\(section: string, cursor: string \| null, limit: number = PAGE_SIZE\)/.test(action), "the action takes no owner: it cannot be asked for somebody else's");
ok(/readSectionPage\(supabase, user\.id, section, after, size\)/.test(action), "it reads for whoever is signed in");

const newProduct = scope(code(readFileSync("src/app/(dashboard)/products/new/page.tsx", "utf8")), "export default async function NewProductPage");
ok(/rawFulfilment === "digital" \|\| rawFulfilment === "rental" \? rawFulfilment : undefined/.test(newProduct), "?fulfilment= is checked against what the form offers");
ok(/initialFulfilment=\{fulfilment\}/.test(newProduct), "and handed to the form");
const form = scope(code(readFileSync("src/components/products/product-form.tsx", "utf8")), "export function ProductForm");
ok(/\?\? initialFulfilment \?\? "physical"/.test(form), "the form starts on it");

console.log(`Portfolio wiring: ${checks} checks`);
