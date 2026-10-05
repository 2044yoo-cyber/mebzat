import { constructionMaterials } from "./wardrobe-materials";
import { isSideDisplay } from "./geometry";
import {
  addNiche,
  addPartialOpening,
  addSideDisplay,
  removeCabinet,
  removeNiche,
  setBayDisplay,
  zoneKindOf,
  setZoneKind,
  type DisplayRef,
} from "./operations";
import type { Cabinet, DesignSpec } from "../types/spec";

/**
 * Open displays a wardrobe could have, by rule rather than by asking a model.
 *
 * Two things come out of here. `facadeVariations` is a handful of whole
 * compositions for one wardrobe — all closed, open shelves at one end or the
 * other, a centre niche, a partial opening — each a finished design to look
 * at and pick. `displayRecommendations` is a short list of single changes
 * worth suggesting for the wardrobe as it is, each a question with the
 * design it would make. Nothing here changes a design on its own: the studio
 * shows a preview and somebody presses Apply.
 *
 * The rules, in the order they are applied:
 *
 * - Width. Under 1500 mm a wardrobe is all the storage there is, so it stays
 *   closed. Up to 2400 one small opening at most. From 2400 a centre niche or
 *   side shelves. From 3600 two openings, never more, so the facade is
 *   broken up rather than broken.
 * - Ends. Side shelves only where the wardrobe meets the room. Against a wall
 *   they face the wall and nobody can reach them.
 * - Priority. Maximum storage suggests nothing; balanced suggests one opening
 *   in the wardrobe's own material; decorative allows more, in an accent board.
 */

export type DesignPriority = "storage" | "balanced" | "decorative";
export type FacadeOption = { id: string; title: string; description: string; spec: DesignSpec };
export type DisplayIdea = { id: string; question: string; detail: string; spec: DesignSpec };

const NARROW = 1500;
const WIDE = 2400;
const VERY_WIDE = 3600;

export function planOf(spec: DesignSpec): { priority: DesignPriority; leftEnd: "wall" | "open"; rightEnd: "wall" | "open" } {
  return { priority: "balanced", leftEnd: "wall", rightEnd: "wall", ...spec.wardrobePlan };
}

/** The wardrobe carcass the ideas are for: the lower one, not a side display or a top box. */
export function mainWardrobe(spec: DesignSpec, cabinetId?: string | null): Cabinet | null {
  if (spec.furnitureType !== "wardrobe") return null;
  const chosen = cabinetId ? spec.cabinets.find((cabinet) => cabinet.id === cabinetId) : null;
  const lower = chosen?.stackedOn ? spec.cabinets.find((cabinet) => cabinet.id === chosen.stackedOn) : chosen;
  if (lower && !isSideDisplay(lower)) return lower;
  if (chosen && isSideDisplay(chosen)) {
    const attached = chosen.bays[0]?.display?.attachedTo;
    return spec.cabinets.find((cabinet) => cabinet.id === attached) ?? null;
  }
  return spec.cabinets.filter((cabinet) => !cabinet.stackedOn && !isSideDisplay(cabinet)).sort((a, b) => b.size.width - a.size.width)[0] ?? null;
}

/** How many open displays this wardrobe already has: niches, partial zones, side units. */
export function displayCount(spec: DesignSpec, wardrobe: Cabinet): number {
  const inside = wardrobe.bays.reduce((total, bay) => total + (bay.display ? 1 : 0) + (bay.fitting.kind === "stack" ? bay.fitting.sections.filter((section) => section.kind === "display").length : 0), 0);
  const sides = spec.cabinets.filter((cabinet) => isSideDisplay(cabinet) && cabinet.bays[0]?.display?.attachedTo === wardrobe.id).length;
  return inside + sides;
}

function allowance(width: number, priority: DesignPriority): number {
  if (priority === "storage") return 0;
  if (width < NARROW) return priority === "decorative" ? 1 : 0;
  if (width < VERY_WIDE) return 1 + (priority === "decorative" && width >= WIDE ? 1 : 0);
  return priority === "decorative" ? 3 : 2;
}

/** A board that stands out from the wardrobe's fronts: oak against white or black, white against wood. */
export function accentFor(spec: DesignSpec): string {
  const front = constructionMaterials(spec).fronts.appearance?.colour.toLowerCase() ?? "";
  return front === "oak" || front === "walnut" ? "mdf-18-white" : "mdf-18-oak";
}

function nicheWidth(width: number): number {
  return width < WIDE ? 350 : width < VERY_WIDE ? 450 : 500;
}

/** The middle closed bay, where a partial opening reads best. */
function middleClosedBay(wardrobe: Cabinet) {
  const closed = wardrobe.bays.filter((bay) => !bay.display && bay.door !== "none");
  return closed[Math.floor((closed.length - 1) / 2)] ?? null;
}

/** The wardrobe with every open display of its own taken back out. */
export function closedVersion(spec: DesignSpec, wardrobeId: string): DesignSpec {
  let next = spec;
  for (const cabinet of spec.cabinets) {
    if (isSideDisplay(cabinet) && cabinet.bays[0]?.display?.attachedTo === wardrobeId) next = removeCabinet(next, cabinet.id);
  }
  const wardrobe = next.cabinets.find((cabinet) => cabinet.id === wardrobeId);
  for (const bay of wardrobe?.bays ?? []) {
    if (bay.display?.style === "niche") {
      // A niche the wardrobe was built with is a bay; one added as a niche
      // goes. Either way the facade is closed.
      next = wardrobe!.bays.length > 1 && bay.id.startsWith("niche-") ? removeNiche(next, wardrobeId, bay.id) : setBayDisplay(next, wardrobeId, bay.id, null);
    } else if (bay.fitting.kind === "stack") {
      for (const section of bay.fitting.sections) if (zoneKindOf(section) === "display") next = setZoneKind(next, wardrobeId, bay.id, section.id, "door");
    }
  }
  return next;
}

/**
 * Whole facades for one wardrobe, closed first. Side shelves only at an end
 * that meets the room; the rest only where the width allows. Each option is
 * built from the closed wardrobe, so they are alternatives, not additions.
 */
export function facadeVariations(spec: DesignSpec, cabinetId?: string | null): FacadeOption[] {
  const wardrobe = mainWardrobe(spec, cabinetId);
  if (!wardrobe) return [];
  const plan = planOf(spec);
  const accent = plan.priority === "decorative" ? accentFor(spec) : undefined;
  const base = closedVersion(spec, wardrobe.id);
  const width = wardrobe.size.width;
  const options: FacadeOption[] = [{ id: "closed", title: "All closed doors", description: "Every bay behind a door — the most storage.", spec: base }];
  const side = (end: "left" | "right") => {
    if ((end === "left" ? plan.leftEnd : plan.rightEnd) !== "open") return;
    options.push({
      id: `side-${end}`,
      title: `Open shelves, ${end}`,
      description: `A ${width < WIDE ? 350 : 450} mm shelving unit against the ${end} end, where it meets the room.`,
      spec: addSideDisplay(base, wardrobe.id, { side: end, width: width < WIDE ? 350 : 450, shelves: 5, boardId: accent }),
    });
  };
  side("left");
  if (width >= NARROW && wardrobe.bays.length >= 2) {
    options.push({
      id: "niche",
      title: "Centre open niche",
      description: `A ${nicheWidth(width)} mm open niche between closed sections${accent ? ", in an accent board" : ""}.`,
      spec: addNiche(base, wardrobe.id, { width: nicheWidth(width), boardId: accent, lighting: plan.priority === "decorative" ? "shelf" : undefined }),
    });
  }
  side("right");
  const middle = middleClosedBay(base.cabinets.find((cabinet) => cabinet.id === wardrobe.id)!);
  if (middle && width >= NARROW) {
    options.push({ id: "partial", title: "Partial decorative opening", description: "Closed above and below, an open display across the middle of one bay.", spec: addPartialOpening(base, wardrobe.id, middle.id) });
  }
  if (width >= VERY_WIDE && plan.priority !== "storage" && wardrobe.bays.length >= 4) {
    const quarter = Math.max(1, Math.round(wardrobe.bays.length / 4));
    const two = addNiche(addNiche(base, wardrobe.id, { width: 400, index: wardrobe.bays.length - quarter, boardId: accent }), wardrobe.id, { width: 400, index: quarter, boardId: accent });
    options.push({ id: "two-niches", title: "Two open niches", description: "A narrow niche at each third, the long facade broken up evenly.", spec: two });
  }
  return options;
}

/**
 * Single changes worth suggesting for the wardrobe as it is, most useful
 * first. Empty for maximum storage, and once the wardrobe has as many open
 * displays as its width allows.
 */
export function displayRecommendations(spec: DesignSpec, cabinetId?: string | null): DisplayIdea[] {
  const wardrobe = mainWardrobe(spec, cabinetId);
  if (!wardrobe) return [];
  const plan = planOf(spec);
  const width = wardrobe.size.width;
  if (displayCount(spec, wardrobe) >= allowance(width, plan.priority)) return [];
  const accent = plan.priority === "decorative" ? accentFor(spec) : undefined;
  const ideas: DisplayIdea[] = [];
  const hasNiche = wardrobe.bays.some((bay) => bay.display?.style === "niche");
  const sideAt = (end: "left" | "right") => spec.cabinets.some((cabinet) => isSideDisplay(cabinet) && cabinet.bays[0]?.display?.attachedTo === wardrobe.id && cabinet.bays[0]?.display?.side === end);

  if (width >= WIDE && !hasNiche && wardrobe.bays.length >= 2) {
    ideas.push({ id: "niche", question: "Add a centre display niche?", detail: `A ${nicheWidth(width)} mm open niche between closed sections — the wardrobe stays ${width} mm wide.`, spec: addNiche(spec, wardrobe.id, { width: nicheWidth(width), boardId: accent, lighting: accent ? "shelf" : undefined }) });
  }
  for (const end of ["left", "right"] as const) {
    if ((end === "left" ? plan.leftEnd : plan.rightEnd) === "open" && !sideAt(end)) {
      ideas.push({ id: `side-${end}`, question: `Add side display shelves on the ${end}?`, detail: `The ${end} end meets the room: open shelves there are reachable and finish the run.`, spec: addSideDisplay(spec, wardrobe.id, { side: end, width: width < WIDE ? 350 : 450, boardId: accent }) });
    }
  }
  const narrow = wardrobe.bays.find((bay) => !bay.display && bay.door !== "none" && bay.width < 400 && bay.fitting.kind !== "drawers");
  if (narrow) {
    ideas.push({ id: `narrow-${narrow.id}`, question: "Convert this narrow section to open display?", detail: `A ${Math.round(narrow.width)} mm bay is too narrow to hang clothes in; as open shelves it shows things off instead.`, spec: setBayDisplay(spec, wardrobe.id, narrow.id, accent ? { boardId: accent } : {}) });
  }
  const leaves = wardrobe.bays.filter((bay) => !bay.display && bay.door !== "none").flatMap((bay) => Array.from({ length: bay.doorLeaves }, () => Math.round(bay.width / bay.doorLeaves)));
  const middle = middleClosedBay(wardrobe);
  if (width >= WIDE && leaves.length >= 4 && middle && Math.max(...leaves) - Math.min(...leaves) <= 10) {
    ideas.push({ id: "break-up", question: "Break up the facade with an open display section?", detail: `${leaves.length} identical doors in a row read as a wall; an open zone across one bay breaks the line.`, spec: addPartialOpening(spec, wardrobe.id, middle.id) });
  }
  if (width < NARROW) return ideas.filter((idea) => idea.id.startsWith("side-") || idea.id.startsWith("narrow-")).slice(0, 1);
  return ideas;
}

export type DisplayType = "side" | "niche" | "partial";

/** What kind of open display a reference names. */
export function displayTypeOf(spec: DesignSpec, ref: DisplayRef): DisplayType | null {
  const bay = spec.cabinets.find((cabinet) => cabinet.id === ref.cabinetId)?.bays.find((entry) => entry.id === ref.bayId);
  if (!bay) return null;
  if (ref.sectionId) return "partial";
  return bay.display?.style ?? null;
}

/**
 * An open display turned into another kind, its look kept: a niche becomes
 * a zone across the same bay, or a shelving unit at the wardrobe's open end
 * (its right end, when neither is marked open), and so on. Returns the new
 * design and the display to select in it.
 */
export function convertDisplay(spec: DesignSpec, ref: DisplayRef, type: DisplayType): { spec: DesignSpec; ref: DisplayRef | null } {
  const from = displayTypeOf(spec, ref);
  if (!from || from === type) return { spec, ref };
  const cabinet = spec.cabinets.find((entry) => entry.id === ref.cabinetId)!;
  const bay = cabinet.bays.find((entry) => entry.id === ref.bayId)!;
  const section = ref.sectionId && bay.fitting.kind === "stack" ? bay.fitting.sections.find((entry) => entry.id === ref.sectionId) : null;
  const look = section?.display ?? bay.display ?? { back: true, lighting: "off" as const };
  const shelves = section?.count ?? (bay.fitting.kind === "shelves" ? bay.fitting.count : 4);
  const wardrobe = from === "side" ? mainWardrobe(spec, cabinet.id) : cabinet;
  if (!wardrobe) return { spec, ref };

  // Out of the old one first.
  let next = spec;
  if (from === "side") next = removeCabinet(next, cabinet.id);
  // A niche turned into a zone keeps its bay; turned into anything else, a
  // niche that was added as one goes and gives its width back.
  else if (from === "niche") next = type !== "partial" && bay.id.startsWith("niche-") && cabinet.bays.length > 1 ? removeNiche(next, cabinet.id, bay.id) : setBayDisplay(next, cabinet.id, bay.id, null);
  else next = setZoneKind(next, cabinet.id, bay.id, ref.sectionId!, "door");

  const before = new Set(next.cabinets.flatMap((entry) => entry.bays.map((item) => item.id)));
  if (type === "side") {
    const plan = planOf(next);
    const side = plan.leftEnd === "open" && plan.rightEnd !== "open" ? "left" : "right";
    next = addSideDisplay(next, wardrobe.id, { side, shelves, boardId: look.boardId, lighting: look.lighting });
    const added = next.cabinets.find((entry) => entry.bays.some((item) => !before.has(item.id)));
    return { spec: next, ref: added ? { cabinetId: added.id, bayId: added.bays[0]!.id } : null };
  }
  if (type === "niche") {
    next = addNiche(next, wardrobe.id, { shelves, boardId: look.boardId, lighting: look.lighting });
    const added = next.cabinets.find((entry) => entry.id === wardrobe.id)?.bays.find((item) => !before.has(item.id));
    return { spec: next, ref: added ? { cabinetId: wardrobe.id, bayId: added.id } : null };
  }
  const target = from === "niche" ? bay : middleClosedBay(next.cabinets.find((entry) => entry.id === wardrobe.id)!);
  if (!target || !next.cabinets.find((entry) => entry.id === wardrobe.id)?.bays.some((item) => item.id === target.id)) return { spec: next, ref: null };
  next = addPartialOpening(next, wardrobe.id, target.id);
  const zones = next.cabinets.find((entry) => entry.id === wardrobe.id)!.bays.find((item) => item.id === target.id)!.fitting;
  const zone = zones.kind === "stack" ? zones.sections.find((item) => item.kind === "display") : undefined;
  return { spec: next, ref: zone ? { cabinetId: wardrobe.id, bayId: target.id, sectionId: zone.id } : null };
}
