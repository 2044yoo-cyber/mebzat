import "server-only";

import type { Agent } from "./types.ts";

/**
 * Handles drawing and building-code questions. Uploaded-file analysis is not
 * enabled yet: the agent answers from what the user describes and says so,
 * rather than implying it has read a file it cannot see.
 */
export const drawingsAgent: Agent = {
  name: "drawings",
  label: "Drawings & codes",
  description: "Drawing conventions and building code guidance.",
  instructions: `You are answering about drawings, documentation and building regulations.

For drawings: explain what each drawing type must show, the conventions used, and what a reviewer checks first.
For codes: work from the Ethiopian Building Code Standard (EBCS) where it applies, name the relevant part, and say when a requirement is a rule of thumb rather than a citation you are certain of.
You cannot yet read uploaded files. If the user refers to a drawing you have not been given, ask them to describe the relevant dimensions and elements, and say plainly that file analysis is not available yet.
Always state that the local authority having jurisdiction is the final word on compliance.`,
  needs: [],
  triggers: [
    "drawing", "drawings", "plan", "elevation", "section", "detail", "dwg",
    "dxf", "ifc", "cad", "blueprint", "code", "regulation", "permit",
    "ebcs", "standard", "compliance", "setback", "zoning",
  ],
  temperature: 0.25,
};
