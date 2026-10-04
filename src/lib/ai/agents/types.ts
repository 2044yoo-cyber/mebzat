import "server-only";

import type { AiAgentName } from "@/types/database.types";

/**
 * What an agent needs retrieved from the catalogue before it answers.
 *
 * `prices` is the material price book, and it is retrieved before the others —
 * a question about what something costs must be answered from the book rather
 * than from what the model remembers about Ethiopian construction.
 */
export type ContextNeed =
  | "prices"
  | "properties"
  | "agents"
  | "products"
  | "companies"
  | "professionals"
  | "projects";

export type Agent = {
  name: AiAgentName;
  /** Shown in the UI when this agent handles a turn. */
  label: string;
  /** One-line description used by the quick-action cards. */
  description: string;
  /** Appended to the base system prompt. */
  instructions: string;
  /** Catalogue tables to search before answering. */
  needs: ContextNeed[];
  /** Words that route a question here. Matched case-insensitively. */
  triggers: string[];
  /** Lower is more deterministic. Estimation work wants tighter output. */
  temperature: number;
};
