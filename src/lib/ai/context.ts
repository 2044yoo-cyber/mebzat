import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  nearbyListings,
  propertyPageContext,
  searchAgents,
  searchListings,
  type ListingPin,
} from "./property-tools";
import type { ContextNeed } from "./agents/types.ts";

/**
 * Retrieves real catalogue rows for a question so answers are grounded in the
 * database rather than invented.
 *
 * The result is compact text rather than JSON: it costs fewer tokens, and the
 * model reproduces names and paths more reliably from a labelled line than
 * from nested objects. Every row carries its site path so answers can link
 * straight to the listing.
 */

/** Rows fetched per table. Enough to choose from, small enough to stay cheap. */
const ROW_LIMIT = 8;

export type Source = {
  kind: ContextNeed;
  id: string;
  title: string;
  href: string;
};

export type CatalogueContext = {
  text: string;
  sources: Source[];
  /**
   * Listings the answer is grounded in, for the map to highlight.
   *
   * Carried alongside the prompt text rather than parsed back out of the
   * model's reply: the map must show the rows that were searched, not the rows
   * the model chose to mention, and certainly not an id it hallucinated.
   */
  pins: ListingPin[];
};

/** Strips characters that would break PostgREST's filter grammar. */
function sanitize(term: string): string {
  return term.replace(/[,()%*]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Reduces a question to its searchable words. Removes the filler that would
 * otherwise match everything ("find me a good supplier of ..." → "supplier").
 */
const STOP_WORDS = new Set([
  "the", "a", "an", "of", "for", "in", "on", "at", "to", "and", "or", "is",
  "are", "what", "which", "who", "where", "how", "much", "many", "can", "i",
  "me", "my", "you", "your", "please", "find", "need", "want", "looking",
  "best", "good", "some", "any", "with", "from", "near", "about", "give",
  "show", "list", "recommend", "suggest", "help", "do", "does", "it", "that",
]);

function keywords(question: string): string[] {
  return sanitize(question.toLowerCase())
    .split(" ")
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .slice(0, 6);
}

function formatPrice(price: number | null, currency: string, unit: string | null) {
  if (price === null) return "price on request";
  return `${currency} ${price.toLocaleString()}${unit ? ` ${unit}` : ""}`;
}

/**
 * Builds the catalogue block for a question.
 *
 * Only the tables the agent declared are queried, so a cost question does not
 * pay for a professionals lookup. A failed query yields no rows rather than
 * throwing: the assistant should still answer, just without grounding.
 */
export async function buildContext(
  question: string,
  needs: ContextNeed[],
  options: { propertyId?: string | null } = {},
): Promise<CatalogueContext> {
  const sections: string[] = [];
  const sources: Source[] = [];
  const pins: ListingPin[] = [];

  // The open property comes first and is fetched whatever the agent asked for.
  // Somebody on a property page who types "does this have parking" has written
  // a question with no searchable words in it at all, and every keyword-driven
  // path below would return nothing — which is how a question about the thing
  // on screen gets answered with "which property do you mean?".
  if (options.propertyId) {
    const open = await propertyPageContext(options.propertyId);
    if (open.text) {
      sections.push(open.text);
      pins.push(...open.pins);
      for (const pin of open.pins) {
        sources.push({
          kind: "properties",
          id: pin.id,
          title: pin.title,
          href: pin.href,
        });
      }
    }
  }

  if (needs.length === 0) {
    return { text: sections.join("\n\n"), sources, pins };
  }

  const words = keywords(question);
  if (words.length === 0 && sections.length === 0) {
    return { text: "", sources: [], pins: [] };
  }

  const supabase = await createClient();
  const pattern = words.join(" | ");

  // The price book comes first, deliberately — both in the order it is fetched
  // and in the order it appears in the prompt. A question about what a material
  // costs has an answer in the database, and the model must reach that answer
  // before it reaches for what it remembers about Ethiopian prices. Putting the
  // block at the top is not decoration: the model reads the nearest grounded
  // figure, and the nearest one should be the one somebody can be held to.
  if (needs.includes("prices")) {
    sections.push(await priceSection(words.join(" "), question));
  }

  // Properties before the marketplace tables, for the same reason prices come
  // before everything: somebody asking about a house in Bole must be answered
  // from the listings, and the nearest grounded block is the one the model
  // reaches for.
  if (needs.includes("properties")) {
    // "near CMC" is a different query from "in CMC" — one is a radius around a
    // point, the other is a name on a listing — and answering the first with
    // the second is how "which properties are near CMC" returns only the
    // listings somebody happened to label CMC.
    const nearby = /\bnear(by)?\b|\baround\b|\bclose to\b|\bአጠገብ\b|\bአካባቢ\b/i.exec(
      question,
    );

    const listings = nearby
      ? await nearbyForQuestion(question)
      : await searchListings(question);

    if (listings.text) {
      sections.push(listings.text);
      pins.push(...listings.pins);
      for (const pin of listings.pins) {
        sources.push({
          kind: "properties",
          id: pin.id,
          title: pin.title,
          href: pin.href,
        });
      }
    }
  }

  if (needs.includes("agents")) {
    const agents = await searchAgents(question);
    if (agents.text) sections.push(agents.text);
  }

  if (needs.includes("products")) {
    const { data } = await supabase
      .from("products")
      .select(
        "id, title, slug, price, currency, unit, brand, stock_status, location_city, supplier:profiles!owner_id(full_name, company_name)",
      )
      .eq("status", "published")
      .textSearch("title", pattern, { type: "websearch", config: "simple" })
      .limit(ROW_LIMIT);

    const rows = data ?? [];
    if (rows.length > 0) {
      sections.push(
        `PRODUCTS\n${rows
          .map((p) => {
            const supplier = Array.isArray(p.supplier) ? p.supplier[0] : p.supplier;
            const seller =
              supplier?.company_name ?? supplier?.full_name ?? "Medosha supplier";
            sources.push({
              kind: "products",
              id: p.id,
              title: p.title,
              href: `/marketplace/${p.id}`,
            });
            return `- ${p.title} | ${formatPrice(p.price, p.currency, p.unit)} | ${p.stock_status} | brand: ${p.brand ?? "n/a"} | supplier: ${seller} | city: ${p.location_city ?? "n/a"} | path: /marketplace/${p.id}`;
          })
          .join("\n")}`,
      );
    }
  }

  if (needs.includes("companies")) {
    const { data } = await supabase
      .from("companies")
      .select("id, name, slug, category, city, verified, is_claimed, rating")
      .textSearch("name", pattern, { type: "websearch", config: "simple" })
      .limit(ROW_LIMIT);

    const rows = data ?? [];
    if (rows.length > 0) {
      sections.push(
        `COMPANIES\n${rows
          .map((c) => {
            sources.push({
              kind: "companies",
              id: c.id,
              title: c.name,
              href: `/companies/${c.slug}`,
            });
            return `- ${c.name} | trade: ${c.category ?? "n/a"} | city: ${c.city ?? "n/a"} | ${c.verified ? "verified" : "unverified"} | ${c.is_claimed ? "claimed" : "unclaimed"} | path: /companies/${c.slug}`;
          })
          .join("\n")}`,
      );
    }
  }

  if (needs.includes("professionals")) {
    const { data } = await supabase
      .from("profiles")
      .select(
        "id, full_name, username, account_type, company_name, location_city, years_experience, verification_status",
      )
      .not("username", "is", null)
      .textSearch("full_name", pattern, { type: "websearch", config: "simple" })
      .limit(ROW_LIMIT);

    const rows = data ?? [];
    if (rows.length > 0) {
      sections.push(
        `PROFESSIONALS\n${rows
          .map((p) => {
            const name = p.full_name ?? p.username ?? "Medosha member";
            sources.push({
              kind: "professionals",
              id: p.id,
              title: name,
              href: `/u/${p.username}`,
            });
            return `- ${name} | ${p.account_type ?? "professional"}${p.company_name ? ` at ${p.company_name}` : ""} | city: ${p.location_city ?? "n/a"} | experience: ${p.years_experience ?? "n/a"} years | ${p.verification_status} | path: /u/${p.username}`;
          })
          .join("\n")}`,
      );
    }
  }

  if (needs.includes("projects")) {
    const { data } = await supabase
      .from("projects")
      .select("id, title, building_type, style, location_city, budget, budget_currency")
      .eq("status", "published")
      .textSearch("title", pattern, { type: "websearch", config: "simple" })
      .limit(ROW_LIMIT);

    const rows = data ?? [];
    if (rows.length > 0) {
      sections.push(
        `PROJECTS\n${rows
          .map((p) => {
            sources.push({
              kind: "projects",
              id: p.id,
              title: p.title,
              href: `/projects/${p.id}`,
            });
            return `- ${p.title} | ${p.building_type} | style: ${p.style ?? "n/a"} | city: ${p.location_city ?? "n/a"} | budget: ${p.budget ? `${p.budget_currency} ${p.budget.toLocaleString()}` : "undisclosed"} | path: /projects/${p.id}`;
          })
          .join("\n")}`,
      );
    }
  }

  return {
    text: sections.filter((section) => section.length > 0).join("\n\n"),
    sources,
    pins,
  };
}

/**
 * The "near X" branch.
 *
 * Falls back to an ordinary search when no place in the question is one the
 * gazetteer holds — "near a school" is not a location, and returning nothing
 * for it would be worse than searching the text.
 */
async function nearbyForQuestion(question: string) {
  const { parsePropertyQuery } = await import("./property-query");
  const { knownNeighbourhoods } = await import(
    "@/lib/location/addis-neighbourhoods"
  );

  const parsed = parsePropertyQuery(
    question,
    knownNeighbourhoods().map((entry) => entry.name),
  );

  if (!parsed.place) return searchListings(question);

  const near = await nearbyListings(parsed.place);
  // A mapped place with nothing around it still beats silence, but an unmapped
  // one should not end the search — the name may still be on a listing.
  return near.pins.length > 0 ? near : searchListings(question);
}

/**
 * Cities the book is likely to hold, so "in Addis" becomes a preference.
 *
 * A short list on purpose. Guessing wrongly at a city is worse than not
 * guessing: the resolver treats it as a preference and would quietly reorder
 * the answer around a word that was never a place.
 */
const CITIES = [
  "Addis Ababa",
  "Adama",
  "Bahir Dar",
  "Hawassa",
  "Mekelle",
  "Dire Dawa",
  "Gondar",
  "Jimma",
  "Bishoftu",
];

/** The city named in a question, if it is one the book would recognise. */
function cityIn(question: string): string | undefined {
  const text = question.toLowerCase();
  // "Addis" on its own is what people actually type.
  if (/\baddis\b/.test(text)) return "Addis Ababa";
  return CITIES.find((city) => text.includes(city.toLowerCase()));
}

/**
 * The price block.
 *
 * Written as instructions the model cannot answer around. Three outcomes, and
 * each one has a sentence attached telling the model what it is allowed to say:
 *
 *   * A verified price — quote it as Medosha's.
 *   * An unverified one — quote it, labelled, with the caveat.
 *   * Nothing — say so. This is the case that matters, because it is the one
 *     where the model would otherwise fall back on training data and produce a
 *     confident number for a material nobody has priced.
 *
 * The wording comes from `@/lib/prices/resolve`, so the chat, the exchange and
 * the bill of quantities cannot describe the same figure three different ways.
 */
async function priceSection(search: string, question: string): Promise<string> {
  const { askPriceBook } = await import("@/lib/data/material-prices");

  let answer;
  try {
    answer = await askPriceBook({ material: search, city: cityIn(question) });
  } catch {
    // The book could not be read. This must not look like an empty book: an
    // unreachable database is a temporary failure, and answering "I have no
    // price for that" would be a confident statement about data nobody looked
    // at.
    return [
      "MATERIAL PRICES",
      "The price database could not be reached for this question.",
      "Say that Medosha's price database is temporarily unavailable and that you cannot give a price from it right now. Do not answer with a price from general knowledge.",
    ].join("\n");
  }

  if (answer.kind === "none" || !answer.best) {
    return [
      "MATERIAL PRICES",
      "No price in Medosha's database matches this material.",
      `You must say exactly: "${answer.message}"`,
      "Do not supply a figure from general knowledge, and do not estimate one. You may suggest the user submit a price or search the Marketplace.",
    ].join("\n");
  }

  const best = answer.best;
  const range = answer.range;

  const lines = [
    "MATERIAL PRICES",
    "Retrieved from Medosha's material price database. This is the only source you may use for Ethiopian material prices in this answer.",
    "",
    `- ${[best.material, best.specification].filter(Boolean).join(" ")}` +
      ` | ${best.currency} ${best.priceEtb.toLocaleString()} per ${best.unit}` +
      ` | city: ${best.cityRegion}` +
      ` | brand: ${best.brand ?? "n/a"}` +
      ` | status: ${best.dataStatus}` +
      ` | dated: ${best.priceDate}` +
      ` | VAT: ${best.vatStatus}` +
      (best.supplier ? ` | supplier: ${best.supplier}` : "") +
      (best.source ? ` | source: ${best.source}` : ""),
  ];

  if (range && range.sampleSize > 1) {
    lines.push(
      `- Range across ${range.sampleSize} comparable records: ${best.currency} ${range.lowest.toLocaleString()} – ${range.highest.toLocaleString()} per ${range.unit}` +
        ` | median ${range.median.toLocaleString()} | ${range.sourceCount} source(s) | newest ${range.latestDate}`,
    );
  }

  lines.push(`- Data confidence: ${answer.confidence ?? "low"}`);

  if (answer.stale) {
    lines.push(
      "- This record is older than the validity period. Say so, and recommend confirming it with a supplier.",
    );
  }

  lines.push("");
  lines.push(
    answer.kind === "verified"
      ? "This price is ADMIN_VERIFIED. You may present it as Medosha's verified price. State the date and the city."
      : `This price is NOT verified. Present it with exactly this caveat: "${answer.message}" Never call it official, confirmed or a quotation. State the status, the date and the city.`,
  );

  return lines.join("\n");
}
