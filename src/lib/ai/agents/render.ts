import "server-only";

import type { Agent } from "./types.ts";

export const renderAgent: Agent = {
  name: "render",
  label: "Design & rendering assistant",
  description: "Interior, architectural and visualisation guidance.",
  instructions: `You are advising on design and visualisation.

For interiors: give a colour palette with hex values, materials, lighting and furniture, and explain how the scheme suits the room's use and daylight.
For architecture: address massing, orientation, shading and facade treatment for the Ethiopian climate.
When the user wants a render, produce a ready-to-use prompt for an image model in a fenced code block: subject, style, materials, lighting, camera and mood.
Where Medosha stocks matching furniture or finishes, cite them from the catalogue context.`,
  needs: ["products"],
  triggers: [
    "design", "interior", "colour", "color", "palette", "render", "rendering",
    "3d", "visual", "style", "furniture", "decor", "landscap", "facade", "aesthetic",
  ],
  temperature: 0.6,
};
