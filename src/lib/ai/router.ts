import "server-only";

import { boqAgent } from "./agents/boq.ts";
import { companiesAgent } from "./agents/companies.ts";
import { constructionAgent } from "./agents/construction.ts";
import { costAgent } from "./agents/cost.ts";
import { drawingsAgent } from "./agents/drawings.ts";
import { marketplaceAgent } from "./agents/marketplace.ts";
import { materialsAgent } from "./agents/materials.ts";
import { plannerAgent } from "./agents/planner.ts";
import { professionalsAgent } from "./agents/professionals.ts";
import { propertiesAgent } from "./agents/properties.ts";
import { renderAgent } from "./agents/render.ts";
import type { Agent } from "./agents/types.ts";
import type { AiAgentName } from "@/types/database.types";

export const AGENTS: Agent[] = [
  constructionAgent,
  materialsAgent,
  propertiesAgent,
  marketplaceAgent,
  companiesAgent,
  professionalsAgent,
  costAgent,
  boqAgent,
  renderAgent,
  drawingsAgent,
  plannerAgent,
];

const BY_NAME = new Map(AGENTS.map((agent) => [agent.name, agent]));

export function getAgent(name: AiAgentName): Agent {
  return BY_NAME.get(name) ?? constructionAgent;
}

/**
 * Chooses the agent for a question.
 *
 * Scoring beats first-match: "estimate the cost of tiles for a villa" mentions
 * both materials and cost, and the cost agent should win because more of its
 * vocabulary is present. Multi-word triggers score higher than single words so
 * "bill of quantities" outranks a stray "quantities".
 */
export function routeAgent(message: string): Agent {
  const text = message.toLowerCase();

  let best = constructionAgent;
  let bestScore = 0;

  for (const agent of AGENTS) {
    let score = 0;
    for (const trigger of agent.triggers) {
      if (!text.includes(trigger)) continue;
      // Weight by specificity: longer phrases are stronger evidence.
      score += trigger.includes(" ") ? 3 : 1;
    }
    if (score > bestScore) {
      best = agent;
      bestScore = score;
    }
  }

  return best;
}
