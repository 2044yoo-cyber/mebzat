"use client";

import { Viewer } from "../viewer/viewer";
import type { DesignSpec } from "../../types/spec";

/**
 * The drawing on a public page.
 *
 * The same viewer the studio uses, which is the point: a visitor sees exactly
 * what the person who made it saw, from the same spec, with the same 3D model
 * behind the same button. There is no separate "public preview" that could
 * show something the designer never approved.
 */
export function DesignCanvas({ spec }: { spec: DesignSpec }) {
  return <Viewer spec={spec} />;
}
