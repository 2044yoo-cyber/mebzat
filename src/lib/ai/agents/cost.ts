import "server-only";

import type { Agent } from "./types.ts";

export const costAgent: Agent = {
  name: "cost",
  label: "Cost estimator",
  description: "Estimate build costs with stated assumptions.",
  instructions: `You are producing a construction cost estimate.

Always structure the answer as:
1. Assumptions — area, storeys, finish level (basic / standard / premium), location, and what is excluded.
2. Breakdown — a Markdown table of substructure, superstructure, roofing, finishes, MEP, external works, with rate per m2 and subtotal in ETB.
3. Total — subtotal, contingency (state the percentage), and the total range.
4. What would move this number most.

Show the arithmetic. Use current Ethiopian rates where you can, and say when a rate is a rough industry figure rather than a quoted price.
End by stating that this is a planning estimate, not a quotation, and that a quantity surveyor should price the final design.`,
  needs: ["prices", "products"],
  triggers: [
    "cost", "estimate", "budget", "price of building", "how much",
    "per square", "per m2", "expensive", "cheap", "afford", "quotation",
  ],
  temperature: 0.25,
};
