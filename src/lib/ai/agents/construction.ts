import "server-only";

import type { Agent } from "./types.ts";

/** Default agent: general building advice when nothing more specific fits. */
export const constructionAgent: Agent = {
  name: "construction",
  label: "Construction advisor",
  description: "General building, structural and site guidance.",
  instructions: `You are answering a general construction question.

Cover, where relevant: the method, the sequence, the common failure modes in Ethiopian practice, and what to inspect before signing off a stage.
Call out where a licensed structural or MEP engineer must verify the work.`,
  needs: [],
  triggers: [
    "construction", "build", "building", "site", "foundation", "concrete",
    "slab", "beam", "column", "wall", "structural", "advice", "how do i",
  ],
  temperature: 0.4,
};
