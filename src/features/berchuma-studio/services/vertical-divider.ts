import type { Bay } from "../types/spec";

/**
 * Where a full-height vertical divider can stand.
 *
 * It splits the shelves of its section into two boards, so it belongs in a
 * section fitted with shelves. Drawer boxes and hanging rails run the whole
 * width of a section: a divider there would pass through them, so it is not
 * offered, and one that is already saved there is not built (the panel says
 * why) rather than put through the drawers on the cut list.
 */
export function verticalDividerBlocker(bay: Pick<Bay, "fitting">): string | null {
  switch (bay.fitting.kind) {
    case "shelves":
      return null;
    case "drawers":
      return "Drawers run the full width of the section, so a vertical divider cannot go through them.";
    case "hanging":
      return "A hanging rail runs the full width of the section, so a vertical divider cannot go through it.";
    default:
      return "This section mixes fittings that run the full width, so a vertical divider cannot go in it.";
  }
}

/** A divider that is both asked for and possible. */
export function verticalDividerBuilt(bay: Pick<Bay, "fitting" | "verticalDivider">): boolean {
  return Boolean(bay.verticalDivider) && verticalDividerBlocker(bay) === null;
}
