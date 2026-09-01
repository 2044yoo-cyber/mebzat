import {
  glassTypes,
  openingLabel,
  profileSystems,
  type OpeningSpec,
} from "../types/openings";
import type { LinearPiece } from "./linear-stock";

/**
 * A frame, taken apart into things you can buy and cut.
 *
 * Input: "2400 × 2100 black aluminium sliding door, clear glass."
 * Output: every profile length, every pane, every roller and screw.
 *
 * ## Why this is arithmetic and not a model call
 *
 * A sash is the opening width divided by the panels, plus the interlap, minus
 * the frame section, minus clearance. That is a formula a fabricator can check
 * on the back of the drawing, and it gives the same answer every time. Asking a
 * language model to do it produces a number that is plausible, unrepeatable and
 * occasionally 40 mm out — which is a door that does not close.
 *
 * The AI's job upstream is reading "black aluminium sliding door, about 2.4 by
 * 2.1" and turning it into a spec. From the spec onwards it is subtraction.
 *
 * Every deduction below is named and commented, because the person checking
 * this quotation is a fabricator who will disagree with at least one of them,
 * and they need to be able to find it.
 */

/** Clearance between a sash and the frame it slides in, per side. */
const SASH_CLEARANCE = 3;

/** Glass sits this far short of the rebate so it can expand without cracking. */
const GLASS_CLEARANCE = 3;

/** Sliding sashes overlap at the interlock rather than meeting edge to edge. */
const INTERLOCK_OVERLAP = 20;

export type GlassPane = {
  label: string;
  typeId: string;
  typeLabel: string;
  thickness: number;
  width: number;
  height: number;
  quantity: number;
  /** m² for one pane. */
  area: number;
  /** m² for all of them. */
  totalArea: number;
  /** Toughened glass cannot be cut after tempering, so it is ordered to size. */
  madeToSize: boolean;
};

export type HardwareLine = {
  id: string;
  label: string;
  quantity: number;
  unit: string;
  /** Why this many, in words. A fabricator checks this before they trust it. */
  basis: string;
};

export type OpeningBreakdown = {
  spec: OpeningSpec;
  /** What the frame is called on a quotation. */
  title: string;
  /** Profile lengths ready for {@link packLinear}. */
  profiles: LinearPiece[];
  glass: GlassPane[];
  hardware: HardwareLine[];
  /** Structural opening area, m². What a client thinks they are buying. */
  openingArea: number;
  /** Glass area, m². Always less — the frame is not glass. */
  glazedArea: number;
  /** Notes worth showing: assumptions, estimates, anything unusual. */
  notes: string[];
};

/**
 * Turns one opening into its parts.
 *
 * Quantities are multiplied by `spec.quantity` at the end, so six identical
 * windows are six frames' worth of profile in one packing problem — which is
 * how a fabricator buys them and is materially cheaper than six separate ones.
 */
export function buildOpening(spec: OpeningSpec): OpeningBreakdown {
  const system = profileSystems[spec.system];
  const glass = glassTypes[spec.glass];
  const notes: string[] = [];
  const count = spec.quantity;

  if (!spec.given.width || !spec.given.height) {
    notes.push(
      "Dimensions marked as estimated have not been confirmed. Check them against the structural opening before cutting.",
    );
  }

  const profiles: LinearPiece[] = [];
  const panes: GlassPane[] = [];
  const hardware: HardwareLine[] = [];

  // ---- The outer frame ----------------------------------------------------
  //
  // Cut to the structural opening. Head and sill run the full width; the jambs
  // fit between them, so they lose a frame section top and bottom.

  const frameId = `${spec.system}-frame`;
  const frameLabel = `${system.label} outer frame`;
  const jambLength = spec.height - system.frameSection * 2;

  profiles.push(
    {
      profileId: frameId,
      profileLabel: frameLabel,
      label: "Frame head",
      length: spec.width,
      quantity: count,
      angles: [90, 90],
    },
    {
      profileId: frameId,
      profileLabel: frameLabel,
      label: "Frame sill",
      length: spec.width,
      quantity: count,
      angles: [90, 90],
    },
    {
      profileId: frameId,
      profileLabel: frameLabel,
      label: "Frame jamb",
      length: jambLength,
      quantity: 2 * count,
      angles: [90, 90],
    },
  );

  // ---- The sashes ---------------------------------------------------------

  const isSliding = spec.kind === "sliding-door" || spec.kind === "sliding-window";
  const moving = Math.min(spec.opening, spec.panels);

  // Daylight opening: what is left once the frame is in.
  const daylightWidth = spec.width - system.frameSection * 2;
  const daylightHeight = spec.height - system.frameSection * 2;

  // A slider's sashes overlap where they meet, so together they are wider than
  // the opening. Panels that do not slide simply divide it.
  const sashWidth = isSliding
    ? Math.round(
        (daylightWidth + INTERLOCK_OVERLAP * (spec.panels - 1)) / spec.panels,
      )
    : Math.round(daylightWidth / spec.panels);

  const sashHeight = daylightHeight - SASH_CLEARANCE * 2;

  if (spec.panels > 0 && (moving > 0 || spec.kind !== "fixed-window")) {
    const sashId = `${spec.system}-sash`;
    const sashLabel = `${system.label} sash`;

    // Stiles run the full height of the sash; rails fit between them.
    profiles.push(
      {
        profileId: sashId,
        profileLabel: sashLabel,
        label: "Sash stile",
        length: sashHeight,
        quantity: 2 * spec.panels * count,
        angles: [90, 90],
      },
      {
        profileId: sashId,
        profileLabel: sashLabel,
        label: "Sash rail",
        length: sashWidth - system.sashSection * 2,
        quantity: 2 * spec.panels * count,
        angles: [90, 90],
      },
    );

    // The interlock is a different section from a plain stile, and there is one
    // per pair of meeting sashes.
    if (isSliding && spec.panels > 1) {
      profiles.push({
        profileId: `${spec.system}-interlock`,
        profileLabel: `${system.label} interlock`,
        label: "Interlock stile",
        length: sashHeight,
        quantity: (spec.panels - 1) * count,
        angles: [90, 90],
      });
    }
  }

  // ---- Glazing beads ------------------------------------------------------
  //
  // Four per pane, mitred. Mitres matter here in a way they do not on a frame
  // member: a bead cut square shows a gap at the corner.

  const beadId = `${spec.system}-bead`;
  const paneWidth = sashWidth - system.sashSection * 2 + system.glassRebate * 2;
  const paneHeight = sashHeight - system.sashSection * 2 + system.glassRebate * 2;

  profiles.push(
    {
      profileId: beadId,
      profileLabel: "Glazing bead",
      label: "Bead (horizontal)",
      length: paneWidth,
      quantity: 2 * spec.panels * count,
      angles: [45, 45],
    },
    {
      profileId: beadId,
      profileLabel: "Glazing bead",
      label: "Bead (vertical)",
      length: paneHeight,
      quantity: 2 * spec.panels * count,
      angles: [45, 45],
    },
  );

  // ---- Glass --------------------------------------------------------------
  //
  // The pane is the sash daylight plus the depth it sits into the rebate, less
  // a clearance all round. Cutting it to the rebate exactly is how glass
  // cracks the first hot afternoon.

  const glassWidth = paneWidth - GLASS_CLEARANCE * 2;
  const glassHeight = paneHeight - GLASS_CLEARANCE * 2;
  const paneArea = (glassWidth * glassHeight) / 1_000_000;
  const toughened = spec.glass.startsWith("tempered");

  panes.push({
    label: `${openingLabel(spec.kind)} pane`,
    typeId: spec.glass,
    typeLabel: glass.label,
    thickness: glass.thickness,
    width: glassWidth,
    height: glassHeight,
    quantity: spec.panels * count,
    area: round(paneArea, 4),
    totalArea: round(paneArea * spec.panels * count, 3),
    madeToSize: toughened,
  });

  if (toughened) {
    notes.push(
      "Toughened glass cannot be cut, drilled or notched after tempering. These sizes go to the supplier as an order, not to site as a sheet.",
    );
  }

  // ---- Hardware -----------------------------------------------------------

  const perimeterM = ((spec.width + spec.height) * 2) / 1000;
  const sashPerimeterM = ((sashWidth + sashHeight) * 2) / 1000;

  if (isSliding) {
    hardware.push({
      id: "roller-tandem",
      label: "Tandem roller",
      quantity: 2 * moving * count,
      unit: "pc",
      basis: `2 per sliding sash × ${moving} sliding sash${moving === 1 ? "" : "es"}`,
    });
    hardware.push({
      id: "handle-sliding",
      label: "Sliding handle",
      quantity: moving * count,
      unit: "pc",
      basis: "1 per sliding sash",
    });
    if (spec.lockable) {
      hardware.push({
        id: "lock-hook",
        label: "Hook lock and keep",
        quantity: 1 * count,
        unit: "set",
        basis: "1 per opening",
      });
    }
    hardware.push({
      id: "brush-pile",
      label: "Brush pile weatherseal",
      quantity: round(sashPerimeterM * spec.panels * count, 2),
      unit: "m",
      basis: "sash perimeter, all sashes",
    });
  } else if (spec.kind !== "fixed-window" && spec.kind !== "glass-partition") {
    // Three hinges on a door leaf, two on a window sash — the third stops a
    // door leaf bowing, and a window is not heavy enough to need it.
    const perLeaf = spec.height > 1800 ? 3 : 2;
    hardware.push({
      id: "hinge",
      label: "Hinge",
      quantity: perLeaf * moving * count,
      unit: "pc",
      basis: `${perLeaf} per opening leaf × ${moving}`,
    });
    hardware.push({
      id: "handle-lever",
      label: "Lever handle",
      quantity: moving * count,
      unit: "set",
      basis: "1 per opening leaf",
    });
    if (spec.lockable) {
      hardware.push({
        id: "lock-mortice",
        label: "Mortice lock and cylinder",
        quantity: moving * count,
        unit: "set",
        basis: "1 per opening leaf",
      });
    }
  }

  if (spec.flyScreen && isSliding) {
    hardware.push({
      id: "flyscreen",
      label: "Fly screen sash, made to size",
      quantity: moving * count,
      unit: "pc",
      basis: "1 per sliding sash",
    });
  }

  // Everything gets gasket, silicone and fixings, and leaving them off a
  // quotation is how a job loses its margin in small change.
  hardware.push({
    id: "gasket-wedge",
    label: "Glazing gasket",
    quantity: round(((paneWidth + paneHeight) * 2 * spec.panels * count) / 1000, 2),
    unit: "m",
    basis: "pane perimeter, both faces counted once",
  });
  hardware.push({
    id: "silicone",
    label: "Neutral silicone",
    quantity: Math.ceil((perimeterM * count) / 12),
    unit: "cartridge",
    basis: "1 cartridge per 12 m of frame perimeter",
  });
  hardware.push({
    id: "frame-fixing",
    label: "Frame fixing and plug",
    quantity: Math.max(6, Math.ceil((perimeterM * 1000) / 600)) * count,
    unit: "pc",
    basis: "1 per 600 mm of frame perimeter, minimum 6",
  });
  hardware.push({
    id: "screw-assembly",
    label: "Assembly screw",
    quantity: 8 * spec.panels * count,
    unit: "pc",
    basis: "8 per sash corner set",
  });

  const openingArea = (spec.width * spec.height) / 1_000_000;

  return {
    spec,
    title: `${spec.reference} — ${openingLabel(spec.kind)} ${spec.width} × ${spec.height} mm, ${spec.finish}`,
    profiles,
    glass: panes,
    hardware,
    openingArea: round(openingArea * count, 3),
    glazedArea: round(paneArea * spec.panels * count, 3),
    notes,
  };
}

/**
 * The share of the opening that is actually glass.
 *
 * Worth showing because it is the number clients argue about — a 2-panel
 * slider is around 80% glazed and a 4-panel one noticeably less, and somebody
 * comparing two quotations is often comparing two different frame counts
 * without realising it.
 */
export function glazingRatio(breakdown: OpeningBreakdown): number {
  if (breakdown.openingArea <= 0) return 0;
  return round(breakdown.glazedArea / breakdown.openingArea, 3);
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
