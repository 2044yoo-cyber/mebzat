import { createLucideIcon } from "lucide-react";

/**
 * A two-door cabinet: carcass, a meeting line between the doors, a handle
 * either side of it and two feet. Lucide has no cabinet or wardrobe glyph, and
 * Cabinet Design should not be drawn as a chair. Drawn on Lucide's 24 grid
 * with its stroke conventions so it sits in a row of Lucide icons unnoticed.
 */
export const Cabinet = createLucideIcon("cabinet", [
  ["rect", { x: "4", y: "2", width: "16", height: "18", rx: "1.5", key: "carcass" }],
  ["path", { d: "M12 2v18", key: "meeting" }],
  ["path", { d: "M9.5 10v2.5", key: "handle-left" }],
  ["path", { d: "M14.5 10v2.5", key: "handle-right" }],
  ["path", { d: "M6.5 20v2", key: "foot-left" }],
  ["path", { d: "M17.5 20v2", key: "foot-right" }],
]);
