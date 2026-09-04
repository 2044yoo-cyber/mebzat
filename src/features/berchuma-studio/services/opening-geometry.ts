import {
  glassTypes,
  profileSystems,
  type OpeningSpec,
} from "../types/openings";

/**
 * An opening as boxes, for drawing.
 *
 * The one rule this file exists to keep: **the picture and the cut list are
 * the same arithmetic.** A viewer that lays out sashes by dividing the width
 * evenly will look right and disagree with the quotation by the interlock
 * overlap on every panel — a door drawn 40 mm wider than the one that gets
 * made. So the deductions here are the ones in services/openings.ts, taken
 * from the same profile system, and the two are asserted against each other.
 *
 * Millimetres in, metres out. Three.js works in metres and a 2400 mm door at
 * scene scale 2400 puts the camera inside the sun.
 *
 * Boxes rather than extruded profiles because §26 asks for architectural
 * geometry, not a game asset: a frame member is a cuboid of the right section,
 * which reads correctly at every angle anyone will look from and costs nothing
 * to re-generate on every keystroke of a width field.
 */

/** Clearance between a sash and the frame it slides in, per side. */
const SASH_CLEARANCE = 3;

/** Sliding sashes overlap at the interlock rather than meeting edge to edge. */
const INTERLOCK_OVERLAP = 20;

/** How far a moving sash is drawn in front of a fixed one, per track. */
const TRACK_OFFSET = 20;

/** A handle, roughly. Enough to read as one at a glance. */
const HANDLE_LENGTH = 220;
const HANDLE_SECTION = 26;
const HANDLE_STANDOFF = 45;

export type Box = {
  id: string;
  /** Centre, in metres. */
  x: number;
  y: number;
  z: number;
  /** Size, in metres. */
  width: number;
  height: number;
  depth: number;
};

export type OpeningGeometry = {
  /** Outer frame members: head, sill and two jambs. */
  frame: Box[];
  /** One per panel, in order from the left. */
  sashes: Box[];
  /** The pane inside each sash, same order. */
  glass: Box[];
  /** Handles on the panels that move. */
  handles: Box[];
  /** Overall size in metres, for framing the camera. */
  size: { width: number; height: number; depth: number };
  /** Millimetres, as the cut list states them. Shown as labels. */
  daylight: { width: number; height: number };
  sash: { width: number; height: number };
  /** Which panels move, left to right. */
  moving: boolean[];
  /** How the glass should look. */
  glassTint: { colour: string; opacity: number };
};

/** Metres from millimetres. */
const m = (mm: number) => mm / 1000;

/**
 * The colour a pane is drawn in.
 *
 * Not a physically-based glass shader — a tinted transparent surface, which is
 * what tells a client "this one is darker" and is all §7 asks for. Reflective
 * and frosted differ in opacity rather than colour because that is what they
 * look like from outside.
 */
function tintFor(glassId: string): { colour: string; opacity: number } {
  if (glassId.startsWith("tinted")) return { colour: "#4a5a63", opacity: 0.55 };
  if (glassId.startsWith("reflective")) return { colour: "#9fb4bd", opacity: 0.72 };
  if (glassId.startsWith("frosted")) return { colour: "#dbe6ea", opacity: 0.78 };
  if (glassId.startsWith("laminated")) return { colour: "#bcd4d8", opacity: 0.4 };
  if (glassId.startsWith("tempered")) return { colour: "#a8c6cc", opacity: 0.36 };
  return { colour: "#a8c6cc", opacity: 0.3 };
}

export function buildOpeningGeometry(spec: OpeningSpec): OpeningGeometry {
  const system = profileSystems[spec.system];
  const glass = glassTypes[spec.glass];

  const isSliding = spec.kind === "sliding-door" || spec.kind === "sliding-window";
  const moving = Math.min(spec.opening, spec.panels);

  // The same three numbers the cut list is built from.
  const daylightWidth = spec.width - system.frameSection * 2;
  const daylightHeight = spec.height - system.frameSection * 2;
  const sashWidth = isSliding
    ? Math.round((daylightWidth + INTERLOCK_OVERLAP * (spec.panels - 1)) / spec.panels)
    : Math.round(daylightWidth / spec.panels);
  const sashHeight = daylightHeight - SASH_CLEARANCE * 2;

  const depth = system.frameSection;
  const halfW = spec.width / 2;
  const halfH = spec.height / 2;

  const frame: Box[] = [
    {
      id: "frame-head",
      x: 0,
      y: m(halfH - system.frameSection / 2),
      z: 0,
      width: m(spec.width),
      height: m(system.frameSection),
      depth: m(depth),
    },
    {
      id: "frame-sill",
      x: 0,
      y: m(-halfH + system.frameSection / 2),
      z: 0,
      width: m(spec.width),
      height: m(system.frameSection),
      depth: m(depth),
    },
    // The jambs fit between head and sill, exactly as they are cut.
    {
      id: "frame-jamb-left",
      x: m(-halfW + system.frameSection / 2),
      y: 0,
      z: 0,
      width: m(system.frameSection),
      height: m(spec.height - system.frameSection * 2),
      depth: m(depth),
    },
    {
      id: "frame-jamb-right",
      x: m(halfW - system.frameSection / 2),
      y: 0,
      z: 0,
      width: m(system.frameSection),
      height: m(spec.height - system.frameSection * 2),
      depth: m(depth),
    },
  ];

  const sashes: Box[] = [];
  const panes: Box[] = [];
  const handles: Box[] = [];
  const movingFlags: boolean[] = [];

  // A fixed window has no sash at all: the glass is bedded straight into the
  // frame. Drawing a sash round it would show a member nobody is buying.
  const sashless = spec.kind === "fixed-window";

  for (let index = 0; index < spec.panels; index += 1) {
    // The last panels are the ones that move — the convention buildOpening
    // uses when it counts rollers.
    const slides = index >= spec.panels - moving;
    movingFlags.push(slides);

    // Sliding panels overlap at the interlock, so each starts one overlap
    // earlier than a simple division would put it.
    const left = isSliding
      ? -daylightWidth / 2 + index * (sashWidth - INTERLOCK_OVERLAP)
      : -daylightWidth / 2 + index * sashWidth;

    const centreX = left + sashWidth / 2;

    // Front and back tracks, so two sashes at the same x do not fight for the
    // same pixels. A single-track opening keeps everything flush.
    const track = isSliding && slides ? TRACK_OFFSET : 0;

    if (!sashless) {
      sashes.push({
        id: `sash-${index}`,
        x: m(centreX),
        y: 0,
        z: m(track),
        width: m(sashWidth),
        height: m(sashHeight),
        depth: m(system.sashSection),
      });
    }

    // The pane, inset by the sash section all round — or by the frame's own
    // rebate when there is no sash.
    const inset = sashless ? system.glassRebate : system.sashSection;
    const paneWidth = sashless ? daylightWidth - inset * 2 : sashWidth - inset * 2;
    const paneHeight = sashless ? daylightHeight - inset * 2 : sashHeight - inset * 2;

    panes.push({
      id: `glass-${index}`,
      x: m(sashless ? 0 : centreX),
      y: 0,
      z: m(track),
      width: m(Math.max(paneWidth, 1)),
      height: m(Math.max(paneHeight, 1)),
      depth: m(glass.thickness),
    });

    if (slides && !sashless) {
      // On the leading stile, at the height a hand reaches for.
      const stile = index === 0 ? 1 : -1;
      handles.push({
        id: `handle-${index}`,
        x: m(centreX + (stile * (sashWidth / 2 - system.sashSection / 2))),
        y: m(Math.min(0, -sashHeight / 2 + 1000)),
        z: m(track + system.sashSection / 2 + HANDLE_STANDOFF / 2),
        width: m(HANDLE_SECTION),
        height: m(HANDLE_LENGTH),
        depth: m(HANDLE_STANDOFF),
      });
    }

    // A fixed window is one pane in one frame; the loop has nothing more to do.
    if (sashless) break;
  }

  return {
    frame,
    sashes,
    glass: panes,
    handles,
    size: {
      width: m(spec.width),
      height: m(spec.height),
      depth: m(depth + TRACK_OFFSET),
    },
    daylight: { width: daylightWidth, height: daylightHeight },
    sash: { width: sashWidth, height: sashHeight },
    moving: movingFlags,
    glassTint: tintFor(spec.glass),
  };
}

/**
 * The frame's colour, from the finish the person typed.
 *
 * The finish is free text — "Natural anodised", "RAL 9005 black", "White" —
 * because a supplier's list is longer than any dropdown. So this reads it
 * rather than looking it up, and falls back to the anodised grey that most
 * aluminium in Addis actually is.
 */
export function frameColour(finish: string): string {
  const text = finish.toLowerCase();
  if (text.includes("black") || text.includes("9005") || text.includes("anthracite")) {
    return "#23262a";
  }
  if (text.includes("white") || text.includes("9016") || text.includes("9010")) {
    return "#eceeef";
  }
  if (text.includes("bronze") || text.includes("brown") || text.includes("coffee")) {
    return "#5a4632";
  }
  if (text.includes("wood") || text.includes("oak") || text.includes("timber")) {
    return "#9c6b3f";
  }
  if (text.includes("grey") || text.includes("gray") || text.includes("silver")) {
    return "#9aa1a6";
  }
  return "#b7bdc0";
}
