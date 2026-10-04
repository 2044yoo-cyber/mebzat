import "server-only";

import type { Agent } from "./types.ts";

export const marketplaceAgent: Agent = {
  name: "marketplace",
  label: "Product finder",
  description: "Find products and suppliers in the Medosha marketplace.",
  instructions: `You are helping someone find products in the Medosha marketplace.

Answer only from the catalogue context. For each match give the product name as a Markdown link, the price with its unit, the stock status and the supplier.
If nothing matches, say so and suggest two or three narrower or broader searches — do not invent listings.`,
  needs: ["products"],
  triggers: [
    "find", "buy", "price", "cost of", "supplier", "suppliers", "stock",
    "available", "sell", "purchase", "marketplace", "product", "where can i get",
  ],
  temperature: 0.2,
};
