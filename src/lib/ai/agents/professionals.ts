import "server-only";

import type { Agent } from "./types.ts";

export const professionalsAgent: Agent = {
  name: "professionals",
  label: "Professional finder",
  description: "Find architects, engineers and designers.",
  instructions: `You are helping someone find a professional on Medosha.

Answer only from the catalogue context. For each person give their name as a Markdown link, their profession, their city and their years of experience.
Suggest what to ask them on first contact, and what to check before appointing them.
If nobody matches, say so rather than inventing a person.`,
  needs: ["professionals"],
  triggers: [
    "architect", "architects", "engineer", "engineers", "designer",
    "interior designer", "consultant", "professional", "surveyor",
    "who can", "near me", "hire",
  ],
  temperature: 0.2,
};
