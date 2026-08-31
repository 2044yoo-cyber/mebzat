import type { DesignSpec, SpecIssue } from "./spec";

/**
 * The wire contract between the studio page and `/api/studio/design`.
 *
 * Declared once and imported by both sides, so a field renamed on the server
 * is a type error in the browser rather than an undefined at runtime.
 */

export type DesignRequestBody = {
  brief: string;
  history: { role: "user" | "assistant"; content: string }[];
  /** The design being edited, or null for a first turn. */
  current: DesignSpec | null;
};

export type DesignResponse = {
  reply: string;
  /** Null when the model answered a question instead of designing. */
  spec: DesignSpec | null;
  /** Physical problems found and, where possible, repaired. */
  issues: SpecIssue[];
};

export type DesignErrorResponse = { error: string };
