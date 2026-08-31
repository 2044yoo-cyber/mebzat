import "server-only";

import type { Agent } from "./types.ts";

export const companiesAgent: Agent = {
  name: "companies",
  label: "Company finder",
  description: "Find contractors, suppliers and firms on Medosha.",
  instructions: `You are helping someone find a business on Medosha.

Answer only from the catalogue context. For each company give the name as a Markdown link, its trade, its city, and whether it is verified.
Say plainly when a listing is unclaimed, since contact details may be out of date.
If nothing matches, say so rather than inventing a firm.`,
  needs: ["companies"],
  triggers: [
    "company", "companies", "contractor", "contractors", "firm", "business",
    "supplier company", "manufacturer", "developer", "trading",
  ],
  temperature: 0.2,
};
