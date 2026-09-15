"use client";

import { useId } from "react";

import {
  RAIL_SHELF_HEIGHTS,
  hingesPerLeaf,
  sectionBands,
  sectionFitting,
} from "../../services/geometry";
import {
  drawerFaceSvgTop,
  resolveDrawerFaces,
} from "../../services/drawer-construction";
import {
  boardColour,
  constructionMaterials,
} from "../../services/wardrobe-materials";
import {
  bayDimensionsWorthDrawing,
  layOutBays,
} from "../../services/bay-layout";
import { resolveDesign } from "../../services/resolve";
import type { Bay, Cabinet, DesignSpec } from "../../types/spec";

/**
 * The design, drawn flat.
 *
 * Phase 3 replaces this with a real 3D viewer. Until then a scaled front
 * elevation is not a placeholder — it is the drawing a joiner actually works
 * from, and it answers the questions a customer asks first: how many doors,
 * where do the drawers go, how high is the hanging rail.
 *
 * It is drawn from the spec rather than from the parts list, because it is a
 * picture of the design and the spec *is* the design. Both are derived from
 * the same object, so the drawing cannot disagree with the price.
 *
 * The viewBox is in millimetres. No scaling arithmetic, no magic constants —
 * a 2400 mm wardrobe is 2400 units wide and the browser fits it to the box.
 */

/** Millimetres of paper around the unit, for dimension lines. */
const MARGIN = 260;

/**
 * Extra paper below, for the second chain of dimensions.
 *
 * A drawing with one overall width on it tells a joiner how long a wall is and
 * nothing about what to cut. Widths per cabinet go on a chain of their own
 * under the overall one, which is how a shop drawing is laid out and which
 * needs room the original margin did not have.
 */
const CHAIN_DEPTH = 320;

export function Elevation({
  spec,
  selectedCabinetId,
  onSelectCabinet,
}: {
  spec: DesignSpec;
  /** Drawn with a highlight, so the flat view agrees with the 3D one. */
  selectedCabinetId?: string | null;
  onSelectCabinet?: (id: string) => void;
}) {
  const gradientId = useId();
  const { envelope } = spec;
  const resolved = resolveDesign(spec);
  // A front elevation is an orthographic view of one wall. Projecting an L or
  // U onto the same x axis would overlap its turned return and omit its real
  // corner module, which is worse than offering no drawing at all. The 3D
  // viewer remains the accurate front/side/perspective inspection for those
  // layouts; straight runs use the resolver below, never stale snapshots.
  const supportsFrontElevation =
    spec.furnitureType !== "wardrobe" || spec.layout === "straight";
  const elevationCabinets =
    spec.furnitureType === "wardrobe"
      ? resolved.cabinets
      : spec.cabinets.map((cabinet) => ({
          cabinet,
          x: cabinet.position.x,
          y: cabinet.position.y,
        }));
  const shade = boardColour(constructionMaterials(spec).body, spec);

  // A chain is only worth drawing when there is more than one thing on it: on
  // a single cabinet it would repeat the overall width immediately below the
  // overall width.
  const chained = supportsFrontElevation && elevationCabinets.length > 1;
  const heightsDiffer =
    new Set(
      elevationCabinets.map(({ cabinet }) => Math.round(cabinet.size.height)),
    ).size > 1;
  const bottomMargin = MARGIN + (chained ? CHAIN_DEPTH : 0);

  return (
    <svg
      viewBox={`${-MARGIN} ${-MARGIN} ${envelope.width + MARGIN * 2} ${envelope.height + MARGIN + bottomMargin}`}
      className="h-full w-full"
      role="img"
      aria-label={`Front elevation of ${spec.title}, ${envelope.width} by ${envelope.height} by ${envelope.depth} millimetres`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={shade} stopOpacity="0.95" />
          <stop offset="100%" stopColor={shade} stopOpacity="0.7" />
        </linearGradient>
      </defs>

      {/* Floor line, so the design reads as standing rather than floating. */}
      <line
        x1={-MARGIN * 0.6}
        y1={envelope.height}
        x2={envelope.width + MARGIN * 0.6}
        y2={envelope.height}
        className="stroke-foreground/25"
        strokeWidth={6}
      />

      {/*
        One group per cabinet, translated into place.

        Each cabinet is drawn in its own frame — origin at its bottom-left, the
        same drawing the old single-box elevation produced — and the transform
        puts it where it stands. A wall unit at y = 1500 is the same drawing as
        a base unit, moved up the page, which is why this took a transform
        rather than an argument threaded through every child.
      */}
      {supportsFrontElevation ? elevationCabinets.map(({ cabinet, x, y }) => (
        <g
          key={cabinet.id}
          transform={`translate(${x}, ${
            envelope.height - y - cabinet.size.height
          })`}
          onClick={onSelectCabinet ? () => onSelectCabinet(cabinet.id) : undefined}
          className={onSelectCabinet ? "cursor-pointer" : undefined}
        >
          <CabinetDrawing
            spec={spec}
            cabinet={cabinet}
            gradientId={gradientId}
            selected={cabinet.id === selectedCabinetId}
          />
        </g>
      )) : (
        <g>
          <text
            x={envelope.width / 2}
            y={envelope.height / 2 - 20}
            textAnchor="middle"
            className="fill-foreground text-[72px] font-medium"
          >
            Front elevation is available for a straight wall run.
          </text>
          <text
            x={envelope.width / 2}
            y={envelope.height / 2 + 90}
            textAnchor="middle"
            className="fill-muted-foreground text-[48px]"
          >
            Use the 3D view to inspect L/U front, side and perspective geometry.
          </text>
        </g>
      )}

      {supportsFrontElevation ? (
        <Dimensions width={envelope.width} height={envelope.height} />
      ) : null}

      {/*
        Each cabinet's own height, beside it, when they are not all the same.

        A run of identical base units needs one height and gets it from the
        overall dimension. A TV unit with a wall shelf over it is two different
        heights and one overall, and the overall is the one number that cannot
        be cut to.
      */}
      {supportsFrontElevation && heightsDiffer ? (
        <g className="fill-foreground/55" strokeWidth={0}>
          {elevationCabinets.map(({ cabinet, x, y }) => (
            <text
              key={`h-${cabinet.id}`}
              x={x + 70}
              y={envelope.height - y - cabinet.size.height / 2}
              textAnchor="middle"
              fontSize={62}
              transform={`rotate(-90 ${x + 70} ${envelope.height - y - cabinet.size.height / 2})`}
            >
              {Math.round(cabinet.size.height)}
            </text>
          ))}
        </g>
      ) : null}

      {/*
        One segment per cabinet, on its own chain under the overall width.
        This is the row a joiner sets a saw from.
      */}
      {chained ? (
        <CabinetChain
          cabinets={elevationCabinets.map(({ cabinet, x }) => ({
            id: cabinet.id,
            x,
            width: cabinet.size.width,
          }))}
          y={envelope.height + 130 + CHAIN_DEPTH}
        />
      ) : null}
    </svg>
  );
}

/** One cabinet, drawn at its own origin with y already flipped for SVG. */
function CabinetDrawing({
  spec,
  cabinet,
  gradientId,
  selected,
}: {
  spec: DesignSpec;
  cabinet: Cabinet;
  gradientId: string;
  selected: boolean;
}) {
  const materials = constructionMaterials(spec);
  const t = spec.carcass.board.thickness;
  const plinth = cabinet.plinthHeight;
  const { width, height } = cabinet.size;

  // SVG's y axis points down and the spec's points up, so everything inside a
  // cabinet is drawn in a flipped frame: `top(y)` converts a height above the
  // cabinet's own floor into a distance from the top of it.
  const top = (heightAboveFloor: number) => height - heightAboveFloor;

  const bayGeometry = layOutBays(cabinet, t);

  return (
    <>
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={`url(#${gradientId})`}
        className={selected ? "stroke-brand" : "stroke-foreground/40"}
        strokeWidth={selected ? 14 : 6}
      />

      {plinth > 0 ? (
        <rect
          x={0}
          y={top(plinth)}
          width={width}
          height={plinth}
          fill={boardColour(materials.plinth, spec)}
          fillOpacity={0.9}
          className="stroke-foreground/30"
          strokeWidth={4}
        />
      ) : null}

      {bayGeometry.map((geometry) => (
        <BayDrawing
          key={geometry.bay.id}
          bay={geometry.bay}
          x={geometry.x}
          width={geometry.width}
          bottom={plinth + t}
          height={height - plinth - 2 * t}
          top={top}
          gap={spec.carcass.doorGap}
          board={t}
          frontColour={boardColour(materials.fronts, spec)}
          interiorColour={boardColour(materials.interior, spec)}
        />
      ))}

      {/*
        The clear opening of each bay, written inside it.

        Inside rather than on a chain of its own, and this is a deliberate
        departure from how the cabinet widths are drawn. Bays belong to
        cabinets that stand at different heights — a wall unit above a base
        unit — so a single chain across the bottom of the drawing would put
        two rows of openings on one line and say nothing about which was which.
        Written in the opening it measures, it cannot be misread.
      */}
      {bayDimensionsWorthDrawing(cabinet)
        ? bayGeometry.map((geometry) => (
            <text
              key={`w-${geometry.bay.id}`}
              x={geometry.x + geometry.width / 2}
              y={top(height - plinth - t) + 90}
              textAnchor="middle"
              fontSize={62}
              className="fill-foreground/55"
            >
              {Math.round(geometry.width)}
            </text>
          ))
        : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// One bay
// ---------------------------------------------------------------------------

type BayProps = {
  bay: Bay;
  /** Left edge of the clear opening, in mm from the unit's left face. */
  x: number;
  width: number;
  /** Height above the floor of the opening's bottom. */
  bottom: number;
  height: number;
  top: (heightAboveFloor: number) => number;
  gap: number;
  /** Board thickness, in mm. A stack's dividers are cut from it. */
  board: number;
  frontColour: string;
  interiorColour: string;
};

function BayDrawing({
  bay,
  x,
  width,
  bottom,
  height,
  top,
  gap,
  board,
  frontColour,
  interiorColour,
}: BayProps) {
  const openingTop = top(bottom + height);

  return (
    <g>
      <rect
        x={x}
        y={openingTop}
        width={width}
        height={height}
        fill={interiorColour}
        fillOpacity={0.2}
        className="stroke-foreground/20"
        strokeWidth={3}
      />

      <Fitting
        bay={bay}
        x={x}
        width={width}
        y={openingTop}
        height={height}
        board={board}
        frontColour={frontColour}
        interiorColour={interiorColour}
      />

      {/* A drawer bay has fronts, not doors — and `buildParts` makes none, so
          drawing them here would put a door in the picture that nobody is
          cutting and nobody is paying for.

          A stack is the same rule applied section by section: its drawer bands
          show fronts and the rest is behind a door, so its doors are drawn
          from inside `Fitting` where the bands are known. */}
      {bay.door !== "none" &&
      bay.fitting.kind !== "drawers" &&
      bay.fitting.kind !== "stack" ? (
        <Doors
          bay={bay}
          x={x}
          width={width}
          y={openingTop}
          height={height}
          gap={gap}
          colour={frontColour}
        />
      ) : null}

      {bay.door !== "none" && bay.fitting.kind === "stack" ? (
        <StackDoors
          bay={bay}
          x={x}
          width={width}
          y={openingTop}
          height={height}
          gap={gap}
          board={board}
          colour={frontColour}
        />
      ) : null}
    </g>
  );
}

/**
 * The bands of a stacked bay, in this drawing's own coordinates.
 *
 * The heights come from the geometry service, not from arithmetic repeated
 * here. A drawing that put the shelf at a different height from the cut list
 * is two drawings of two different wardrobes, and the one that gets built is
 * whichever the joiner opened.
 *
 * `sectionBands` measures up from the bay floor and SVG measures down from the
 * top of the page, which is the whole of the conversion below.
 */
function bandBoxes(
  sections: Parameters<typeof sectionBands>[0],
  y: number,
  height: number,
  board: number,
) {
  return sectionBands(sections, 0, height, board).map((band) => ({
    section: band.section,
    top: y + height - (band.floor + band.height),
    height: band.height,
  }));
}

/** The doors over the parts of a stacked bay that are not drawer fronts. */
function StackDoors({
  bay,
  x,
  width,
  y,
  height,
  gap,
  board,
  colour,
}: Box & { bay: Bay; gap: number; board: number; colour: string }) {
  if (bay.fitting.kind !== "stack") return null;

  const boxes = bandBoxes(bay.fitting.sections, y, height, board);

  // Consecutive non-drawer bands share one door, the same as in the geometry:
  // a rail above a shelf is one opening to reach into, not two.
  const runs: { top: number; bottom: number }[] = [];
  for (const [index, box] of boxes.entries()) {
    if (box.section.kind === "drawers") continue;

    const previous = boxes[index - 1];
    const open = runs[runs.length - 1];

    if (open && previous && previous.section.kind !== "drawers") {
      open.bottom = box.top + box.height;
    } else {
      runs.push({ top: box.top, bottom: box.top + box.height });
    }
  }

  return (
    <>
      {runs.map((run) => (
        <Doors
          key={run.top}
          bay={bay}
          x={x}
          width={width}
          y={run.top}
          height={run.bottom - run.top}
          gap={gap}
          colour={colour}
        />
      ))}
    </>
  );
}

type Box = { x: number; width: number; y: number; height: number };

function Fitting({
  bay,
  x,
  width,
  y,
  height,
  board,
  frontColour,
  interiorColour,
}: Box & { bay: Bay; board: number; frontColour: string; interiorColour: string }) {
  const fitting = bay.fitting;

  if (fitting.kind === "stack") {
    // Each band drawn by the same code that draws a plain bay of that kind, so
    // a shelf inside a stack is the same line as a shelf anywhere else.
    const boxes = bandBoxes(fitting.sections, y, height, board);

    return (
      <g>
        {boxes.map((box, index) => (
          <g key={box.section.id}>
            <Fitting
              bay={{ ...bay, fitting: sectionFitting(box.section) }}
              x={x}
              width={width}
              y={box.top}
              height={box.height}
              board={board}
              frontColour={frontColour}
              interiorColour={interiorColour}
            />
            {/* The fixed shelf between this band and the one below. */}
            {index < boxes.length - 1 ? (
              <line
                x1={x}
                x2={x + width}
                y1={box.top + box.height}
                y2={box.top + box.height}
              stroke={interiorColour}
                strokeWidth={7}
              />
            ) : null}
          </g>
        ))}
      </g>
    );
  }

  if (fitting.kind === "shelves") {
    // Shelves divide the bay into count + 1 gaps, which is what puts the
    // topmost one below the ceiling of the bay rather than on it.
    const step = height / (fitting.count + 1);
    return (
      <g stroke={interiorColour} strokeWidth={5}>
        {Array.from({ length: fitting.count }, (_, index) => (
          <line
            key={index}
            x1={x}
            x2={x + width}
            y1={y + step * (index + 1)}
            y2={y + step * (index + 1)}
          />
        ))}
      </g>
    );
  }

  if (fitting.kind === "hanging") {
    // The shelf heights come from the geometry service, not from a number
    // chosen here. A rail hangs off the underside of its shelf, so if the two
    // files disagreed about where the shelf goes, the drawing and the model
    // would show rails at different heights and only one of them could be
    // built. `RAIL_SHELF_HEIGHTS` is a share of the interior measured up from
    // the bay floor; SVG measures down from the top, hence 1 − fraction.
    // A hanging section inside a stack has no shelf of its own — the stack's
    // divider is above it — so its rail hangs from the top of its band. Using
    // the fraction there would put the rail two thirds of the way down a
    // section that is already only a third of the bay. Same rule as
    // `railsInBand` in the geometry, and the elevation has to agree with it or
    // the drawing shows the rail somewhere the wardrobe does not have one.
    const shelves = fitting.shelfAbove
      ? RAIL_SHELF_HEIGHTS.slice(0, fitting.rails).map(
          (fraction) => y + height * (1 - fraction),
        )
      : fitting.rails <= 1
        ? [y]
        : [y, y + height / 2];

    // 45 mm below the shelf, as the geometry hangs it — expressed in mm rather
    // than as a share of the bay, because the drop is a fixed socket depth and
    // scaling it with the bay height would draw it wrong in a short section.
    const rails = shelves.map((shelfY) => shelfY + 45);

    return (
      <g>
        {fitting.shelfAbove
          ? shelves.map((shelfY) => (
              <line
                key={shelfY}
                x1={x}
                x2={x + width}
                y1={shelfY}
                y2={shelfY}
                stroke={interiorColour}
                strokeWidth={5}
              />
            ))
          : null}
        {rails.map((railY) => (
          <g key={railY}>
            <line
              x1={x + 20}
              x2={x + width - 20}
              y1={railY}
              y2={railY}
              className="stroke-foreground/60"
              strokeWidth={9}
              strokeLinecap="round"
            />
            {/* Two hangers, so the rail reads as a rail and not as a shelf. */}
            {[0.35, 0.6].map((fraction) => (
              <path
                key={fraction}
                d={`M ${x + width * fraction} ${railY} v 70 m -55 0 h 110`}
                className="stroke-foreground/35"
                strokeWidth={4}
                fill="none"
              />
            ))}
          </g>
        ))}
      </g>
    );
  }

  if (fitting.kind === "drawers") {
    // Stacked bottom-up into a list before drawing rather than accumulated
    // inside the map: a running total mutated during render is a value that
    // depends on how many times React chose to render, which is not a thing a
    // drawing may depend on.
    const stack = resolveDrawerFaces({
      count: fitting.count,
      openingHeight: height,
      openingFloor: 0,
      frontHeights: fitting.frontHeights,
    });

    return (
      <g>
        {stack.map((drawer, index) => (
          <g key={index}>
            <rect
              x={x + 6}
              y={drawerFaceSvgTop(drawer, y, height) + 4}
              width={width - 12}
              height={drawer.height - 8}
              fill={frontColour}
              fillOpacity={0.72}
              stroke={frontColour}
              strokeWidth={5}
            />
            <line
              x1={x + width * 0.3}
              x2={x + width * 0.7}
              y1={drawerFaceSvgTop(drawer, y, height) + drawer.height * 0.22}
              y2={drawerFaceSvgTop(drawer, y, height) + drawer.height * 0.22}
              className="stroke-foreground/50"
              strokeWidth={12}
              strokeLinecap="round"
            />
          </g>
        ))}
      </g>
    );
  }

  if (fitting.kind === "appliance") {
    const openingHeight = Math.min(fitting.openingHeight, height);
    return (
      <g>
        <rect
          x={x + 10}
          y={y + height - openingHeight}
          width={width - 20}
          height={openingHeight}
          className="fill-foreground/10 stroke-foreground/40"
          strokeWidth={5}
          strokeDasharray="24 18"
        />
        <text
          x={x + width / 2}
          y={y + height - openingHeight / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-foreground/60"
          fontSize={72}
        >
          {fitting.appliance}
        </text>
      </g>
    );
  }

  return null;
}

function Doors({
  bay,
  x,
  width,
  y,
  height,
  gap,
  colour,
}: Box & { bay: Bay; gap: number; colour: string }) {
  const leaves = bay.door === "hinged" ? bay.doorLeaves : bay.door === "sliding" ? 2 : 2;
  const leafWidth = (width - gap * (leaves + 1)) / leaves;

  return (
    <g>
      {Array.from({ length: leaves }, (_, index) => {
        const leafX = x + gap + index * (leafWidth + gap);
        // A sliding pair overlaps in reality; drawing them offset in depth is
        // what tells a reader at a glance that these do not swing.
        const offset = bay.door === "sliding" && index === 1 ? -14 : 0;

        return (
          <g key={index}>
            <rect
              x={leafX}
              y={y + gap + offset}
              width={leafWidth}
              height={height - gap * 2}
              fill={colour}
              fillOpacity={0.8}
              stroke={colour}
              strokeWidth={6}
              rx={8}
            />
            {bay.door === "hinged" ? (
              <Hinges
                x={index === 0 ? leafX + 14 : leafX + leafWidth - 14}
                y={y}
                height={height}
              />
            ) : null}
            {/* Handle: on the meeting stile for a pair, on the leading edge
                for a single. */}
            <circle
              cx={
                leaves === 1
                  ? leafX + leafWidth - 60
                  : index === 0
                    ? leafX + leafWidth - 60
                    : leafX + 60
              }
              cy={y + height / 2}
              r={26}
              className="fill-foreground/45"
            />
          </g>
        );
      })}
    </g>
  );
}

/**
 * Hinge positions, from the same rule the parts list buys hinges by.
 *
 * If the drawing showed three hinges and the quote paid for four, one of them
 * would be wrong and there would be no way to tell which.
 */
function Hinges({ x, y, height }: { x: number; y: number; height: number }) {
  const count = hingesPerLeaf(height);
  return (
    <g className="fill-foreground/40">
      {Array.from({ length: count }, (_, index) => (
        <rect
          key={index}
          x={x - 9}
          y={y + 90 + (index * (height - 220)) / Math.max(1, count - 1)}
          width={18}
          height={70}
          rx={6}
        />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

/**
 * One dimension per cabinet, laid end to end under the overall width.
 *
 * The drawing used to carry two numbers: the width of the whole run and its
 * height. Both are the numbers you need to know whether it fits the wall, and
 * neither is a number anybody cuts to. A run of three cabinets is three
 * carcasses, and their widths are the first thing the shop asks for.
 *
 * Drawn as a real chain — a tick at every join rather than three separate
 * lines — because that is what says these add up to the overall dimension
 * above, and because a gap between two cabinets shows up in it as a gap, which
 * is exactly the information somebody who deliberately left one wants recorded.
 */
function CabinetChain({
  cabinets,
  y,
}: {
  cabinets: { id: string; x: number; width: number }[];
  y: number;
}) {
  if (cabinets.length === 0) return null;
  const ordered = [...cabinets].sort((a, b) => a.x - b.x);

  return (
    <g className="stroke-foreground/35 fill-foreground/60" strokeWidth={4}>
      {ordered.map((cabinet) => (
        <g key={cabinet.id}>
          <line x1={cabinet.x} y1={y} x2={cabinet.x + cabinet.width} y2={y} />
          <line x1={cabinet.x} y1={y - 26} x2={cabinet.x} y2={y + 26} />
          <line
            x1={cabinet.x + cabinet.width}
            y1={y - 26}
            x2={cabinet.x + cabinet.width}
            y2={y + 26}
          />
          <text
            x={cabinet.x + cabinet.width / 2}
            y={y + 110}
            textAnchor="middle"
            fontSize={82}
            strokeWidth={0}
          >
            {Math.round(cabinet.width)}
          </text>
        </g>
      ))}
    </g>
  );
}

function Dimensions({ width, height }: { width: number; height: number }) {
  const below = height + 130;
  const beside = width + 130;

  return (
    <g className="stroke-foreground/40 fill-foreground/70" strokeWidth={4}>
      <line x1={0} y1={below} x2={width} y2={below} />
      <line x1={0} y1={below - 30} x2={0} y2={below + 30} />
      <line x1={width} y1={below - 30} x2={width} y2={below + 30} />
      <text
        x={width / 2}
        y={below + 120}
        textAnchor="middle"
        fontSize={100}
        strokeWidth={0}
      >
        {width} mm
      </text>

      <line x1={beside} y1={0} x2={beside} y2={height} />
      <line x1={beside - 30} y1={0} x2={beside + 30} y2={0} />
      <line x1={beside - 30} y1={height} x2={beside + 30} y2={height} />
      <text
        x={beside + 60}
        y={height / 2}
        textAnchor="middle"
        fontSize={100}
        strokeWidth={0}
        transform={`rotate(90 ${beside + 60} ${height / 2})`}
      >
        {height} mm
      </text>
    </g>
  );
}
