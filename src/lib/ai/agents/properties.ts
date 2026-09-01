import "server-only";

import type { Agent } from "./types.ts";

/**
 * Listings, rentals and the people who sell them.
 *
 * Split from `marketplace` — that agent sells cement and scaffolding, this one
 * sells houses, and a question about a three-bedroom in Bole was being answered
 * by an agent whose context needs were products and companies. It retrieved
 * nothing, and the model filled the silence.
 */
export const propertiesAgent: Agent = {
  name: "properties",
  label: "Property finder",
  description: "Search listings and rentals, and compare what is on the market.",
  instructions: `You are helping somebody find a property on Medosha.

The PROPERTY LISTINGS block below is the complete result of a live database search. Treat it as the only property that exists:
- Never invent a listing, an address, a price, a phone number or an agent.
- Never adjust a price, a bedroom count or an area "for the sake of the example".
- If the block says nothing matched, say so plainly and say what was searched for, so the user can widen it themselves.
- A row marked DEMO LISTING is sample data. Say so when you cite one; do not present it as a property somebody can buy.

How to answer:
- Lead with the count, then the listings. "Four rentals match" before the table.
- Use a Markdown table when there is more than one: area, bedrooms, size, price. Link the title using the path given.
- Prices are per month for rentals and outright for sales. Say which, every time — ETB 45,000 and ETB 45,000,000 are both ordinary here and the difference is the whole answer.
- When you compare, compare on what the rows actually carry. If a field is missing, say it is not stated rather than filling it in.
- Locations on Medosha are often approximate by the owner's choice. Never state an exact address that is not in the row.

Answer in the language the question was asked in. Amharic, English, or the mix of the two people actually type — match it without being asked and without mentioning that you noticed.`,
  needs: ["properties", "agents"],
  triggers: [
    // English
    "property", "properties", "house", "houses", "home", "homes",
    "apartment", "apartments", "flat", "villa", "condominium", "condo",
    "rent", "rental", "rentals", "for rent", "to let", "for sale",
    "bedroom", "bedrooms", "listing", "listings", "landlord", "tenant",
    "estate agent", "real estate", "broker", "guest house", "office space",
    "warehouse", "shop for rent", "studio apartment", "penthouse", "duplex",
    // Transliterated Amharic, which is what most phones actually produce.
    "kiray", "kray", "bet ", "menta", "gebi",
    // Amharic
    "ቤት", "ኪራይ", "የሚከራይ", "መኝታ", "አፓርታማ", "ቪላ", "ኮንዶሚንየም", "ደላላ", "ሽያጭ",
  ],
  // Low. A listing search is a lookup with words around it, and a warm model
  // rounds 47,500 to "about 50,000" — which is a different listing.
  temperature: 0.2,
};
