import "server-only";

import type { Agent } from "./types.ts";

export const materialsAgent: Agent = {
  name: "materials",
  label: "Material advisor",
  description: "Compare materials and recommend the right specification.",
  instructions: `You are recommending building materials.

Compare candidates in a Markdown table across: durability, maintenance, delivered cost in ETB, local availability in Ethiopia, and suitability for the stated climate and use.
Finish with a single clear recommendation and the reason for it.
Where Medosha stocks a matching product, cite it from the catalogue context.`,
  needs: ["prices", "products"],
  triggers: [
    "material", "materials", "cement", "steel", "rebar", "tile", "tiles",
    "timber", "wood", "upvc", "aluminium", "aluminum", "glass", "paint",
    "insulation", "compare", "vs", "versus", "which is better",
  ],
  temperature: 0.35,
};
