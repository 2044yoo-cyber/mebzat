import type { HouseProject } from "../types/project";

/**
 * Stairs as geometry: every tread and landing a polygon, every one at its
 * height, and the walking line from the bottom to the top. The plan draws
 * these polygons, the 3D view raises them, Auto fit measures them: one
 * stair, not a plan symbol and a separate model.
 *
 * Millimetres. Built in the stair's own frame — centred on (0, 0), climbing
 * from the bottom of the drawing (+y) upwards — then turned by its rotation
 * and moved to its position. A stair has `risers` risers and one tread fewer:
 * the last riser steps onto the floor above.
 */

export type StairType = HouseProject["stairs"][number]["type"];
export const STAIR_TYPES: { id: StairType; name: string }[] = [
  { id: "straight", name: "Straight stair" },
  { id: "l-shaped", name: "L-shaped stair" },
  { id: "u-shaped", name: "U-shaped stair" },
  { id: "dog-legged", name: "Dog-legged stair" },
  { id: "switchback", name: "Switchback stair" },
  { id: "winder", name: "Winder stair" },
  { id: "l-winder", name: "L stair with winders" },
  { id: "u-winder", name: "U stair with winders" },
  { id: "spiral", name: "Spiral stair" },
  { id: "curved", name: "Curved stair" },
];

/** The comfortable riser most codes aim under. */
export const TARGET_RISER = 175;

export type StairParams = {
  type: StairType;
  /** Floor to floor. */
  height: number;
  risers: number;
  treadDepth: number;
  /** One flight's clear width. */
  stairWidth: number;
  /** A landing's length along the first flight. */
  landing: number;
  /** Between the two flights of a U. */
  gap: number;
  reversed: boolean;
};

type Point = { x: number; y: number };
export type StairPiece = { points: Point[]; level: number; landing: boolean };
export type StairGeometry = { width: number; length: number; pieces: StairPiece[]; walk: Point[]; treads: number; riserHeight: number };

export const risersFor = (height: number) => Math.max(3, Math.min(40, Math.ceil(height / TARGET_RISER - 1e-9)));
const defaultGap = (type: StairType) => type === "dog-legged" || type === "u-winder" ? 0 : type === "switchback" ? 200 : 100;

/** A new stair of a type for a floor height: comfortable risers, 280 mm treads, a metre wide. */
export function stairPreset(type: StairType, height: number, stairWidth = 1000, treadDepth = 280): StairParams {
  return { type, height, risers: risersFor(height), treadDepth, stairWidth, landing: stairWidth, gap: defaultGap(type), reversed: false };
}

/** The parameters of a stored stair; an old one without them reads them off its size. */
export function stairParams(stair: HouseProject["stairs"][number]): StairParams {
  const type = stair.type;
  const gap = stair.gap ?? defaultGap(type);
  const stairWidth = stair.stairWidth ?? (type === "u-shaped" || type === "dog-legged" || type === "switchback" || type === "u-winder" ? Math.max(600, (stair.width - gap) / 2) : stair.width);
  return {
    type,
    height: stair.height,
    risers: stair.steps,
    treadDepth: stair.treadDepth ?? Math.max(200, stair.length / Math.max(1, stair.steps - 1)),
    stairWidth,
    landing: stair.landing ?? stairWidth,
    gap,
    reversed: stair.reversed ?? false,
  };
}

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

/** Three winders turning a corner square: wedges from its inner corner, between two directions. */
function winders(box: [number, number, number, number], inner: Point, from: number, to: number): Point[][] {
  const [x0, y0, x1, y1] = box;
  const hit = (angle: number): Point => {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const ts = [dx > 1e-9 ? (x1 - inner.x) / dx : dx < -1e-9 ? (x0 - inner.x) / dx : Infinity, dy > 1e-9 ? (y1 - inner.y) / dy : dy < -1e-9 ? (y0 - inner.y) / dy : Infinity].filter((t) => t > 1e-9);
    const t = Math.min(...ts);
    return { x: Math.round((inner.x + dx * t) * 10) / 10, y: Math.round((inner.y + dy * t) * 10) / 10 };
  };
  const corners = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }].filter((corner) => corner.x !== inner.x && corner.y !== inner.y);
  const angleOf = (point: Point) => { let angle = Math.atan2(point.y - inner.y, point.x - inner.x); while (angle < from - 1e-9) angle += Math.PI * 2; return angle; };
  return [0, 1, 2].map((index) => {
    const a = from + (to - from) * index / 3;
    const b = from + (to - from) * (index + 1) / 3;
    const between = corners.filter((corner) => { const angle = angleOf(corner); return angle > a + 1e-6 && angle < b - 1e-6; });
    return [inner, hit(a), ...between, hit(b)];
  });
}

function arcPiece(cx: number, cy: number, inner: number, outer: number, a: number, b: number): Point[] {
  const steps = 4;
  const outerArc = Array.from({ length: steps + 1 }, (_, index) => { const t = a + (b - a) * index / steps; return { x: cx + outer * Math.cos(t), y: cy + outer * Math.sin(t) }; });
  const innerArc = Array.from({ length: steps + 1 }, (_, index) => { const t = b - (b - a) * index / steps; return { x: cx + inner * Math.cos(t), y: cy + inner * Math.sin(t) }; });
  return [...outerArc, ...innerArc];
}

/** Every tread and landing of a stair, in its own frame. */
export function stairGeometry(params: StairParams): StairGeometry {
  const t = Math.max(1, params.risers - 1);
  const T = params.treadDepth;
  const sw = params.stairWidth;
  const raw: { points: Point[]; landing: boolean }[] = [];
  let walk: Point[] = [];
  const type = params.type;

  if (type === "straight") {
    const L = t * T;
    for (let index = 0; index < t; index += 1) raw.push({ points: rect(0, L - (index + 1) * T, sw, L - index * T), landing: false });
    walk = [{ x: sw / 2, y: L }, { x: sw / 2, y: 0 }];
  } else if (type === "l-shaped" || type === "l-winder" || type === "winder") {
    const turn = type === "l-shaped" ? 1 : 3;
    const flights = t - turn;
    const n1 = type === "winder" ? flights : Math.ceil(flights / 2);
    const n2 = flights - n1;
    const corner = type === "l-shaped" ? Math.max(sw, params.landing) : sw;
    const L = n1 * T + corner;
    for (let index = 0; index < n1; index += 1) raw.push({ points: rect(0, L - (index + 1) * T, sw, L - index * T), landing: false });
    if (type === "l-shaped") raw.push({ points: rect(0, 0, sw, corner), landing: true });
    else for (const wedge of winders([0, 0, sw, sw], { x: sw, y: sw }, Math.PI, Math.PI * 1.5)) raw.push({ points: wedge, landing: false });
    for (let index = 0; index < n2; index += 1) raw.push({ points: rect(sw + index * T, 0, sw + (index + 1) * T, sw), landing: false });
    walk = [{ x: sw / 2, y: L }, { x: sw / 2, y: sw / 2 }, { x: sw + Math.max(n2 * T, 200), y: sw / 2 }];
  } else if (type === "u-shaped" || type === "dog-legged" || type === "switchback" || type === "u-winder") {
    const gap = type === "u-winder" ? 0 : params.gap;
    const turn = type === "u-winder" ? 6 : 1;
    const flights = t - turn;
    const n1 = Math.ceil(flights / 2);
    const n2 = flights - n1;
    const head = type === "u-winder" ? sw : Math.max(sw, params.landing);
    const W = 2 * sw + gap;
    const L = n1 * T + head;
    for (let index = 0; index < n1; index += 1) raw.push({ points: rect(0, L - (index + 1) * T, sw, L - index * T), landing: false });
    if (type === "u-winder") {
      for (const wedge of winders([0, 0, sw, sw], { x: sw, y: sw }, Math.PI, Math.PI * 1.5)) raw.push({ points: wedge, landing: false });
      for (const wedge of winders([sw, 0, 2 * sw, sw], { x: sw, y: sw }, Math.PI * 1.5, Math.PI * 2)) raw.push({ points: wedge, landing: false });
    } else raw.push({ points: rect(0, 0, W, head), landing: true });
    for (let index = 0; index < n2; index += 1) raw.push({ points: rect(W - sw, head + index * T, W, head + (index + 1) * T), landing: false });
    walk = [{ x: sw / 2, y: L }, { x: sw / 2, y: head / 2 }, { x: W - sw / 2, y: head / 2 }, { x: W - sw / 2, y: head + Math.max(n2 * T, 200) }];
  } else {
    // Spiral round a post, or a sweep about a wider centre: treads are
    // wedges, measured along the line a person walks.
    const spiral = type === "spiral";
    const inner = spiral ? 100 : Math.max(600, sw);
    const outer = inner + sw;
    const angle = T / (inner + sw * (spiral ? 0.6 : 0.5));
    const start = Math.PI / 2;
    for (let index = 0; index < t; index += 1) raw.push({ points: arcPiece(0, 0, inner, outer, start - index * angle, start - (index + 1) * angle), landing: false });
    const radius = inner + sw / 2;
    walk = Array.from({ length: 9 }, (_, index) => { const a = start - t * angle * index / 8; return { x: radius * Math.cos(a), y: radius * Math.sin(a) }; });
    if (spiral) raw.push({ points: Array.from({ length: 12 }, (_, index) => ({ x: inner * Math.cos(index * Math.PI / 6), y: inner * Math.sin(index * Math.PI / 6) })), landing: true });
  }

  // Centred on the stair's middle; each piece one riser above the last.
  const all = raw.flatMap((piece) => piece.points);
  const minX = Math.min(...all.map((point) => point.x));
  const maxX = Math.max(...all.map((point) => point.x));
  const minY = Math.min(...all.map((point) => point.y));
  const maxY = Math.max(...all.map((point) => point.y));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const centre = (point: Point) => ({ x: Math.round((point.x - cx) * 10) / 10, y: Math.round((point.y - cy) * 10) / 10 });
  const climbing = raw.filter((piece) => !(type === "spiral" && piece.landing));
  const count = climbing.length;
  const pieces: StairPiece[] = raw.map((piece) => {
    if (type === "spiral" && piece.landing) return { points: piece.points.map(centre), level: 0, landing: true };
    const index = climbing.indexOf(piece);
    return { points: piece.points.map(centre), level: params.reversed ? count - index : index + 1, landing: piece.landing };
  });
  const path = walk.map(centre);
  return { width: Math.round(maxX - minX), length: Math.round(maxY - minY), pieces, walk: params.reversed ? path.reverse() : path, treads: count, riserHeight: params.height / params.risers };
}

/** A stair object's fields for the parameters: its footprint follows from them. */
export function stairFields(params: StairParams) {
  const geometry = stairGeometry(params);
  return { type: params.type, height: params.height, steps: params.risers, treadDepth: params.treadDepth, stairWidth: params.stairWidth, landing: params.landing, gap: params.gap, reversed: params.reversed, width: geometry.width, length: geometry.length };
}

/**
 * One edit, and what follows from it. A new floor height re-counts the
 * risers to stay comfortable; a riser height re-counts them to match; a
 * total length re-works the tread; a total width the flight width.
 */
export function applyStairEdit(params: StairParams, patch: Record<string, string | number>): StairParams {
  const next = { ...params };
  const num = (key: string) => typeof patch[key] === "number" && Number.isFinite(patch[key] as number) ? patch[key] as number : undefined;
  if (typeof patch.type === "string" && STAIR_TYPES.some((item) => item.id === patch.type)) { next.type = patch.type as StairType; next.gap = defaultGap(next.type); }
  const height = num("height");
  if (height !== undefined && height > 0) { next.height = height; next.risers = risersFor(height); }
  const riserHeight = num("riserHeight");
  if (riserHeight !== undefined && riserHeight > 0) next.risers = Math.max(3, Math.min(40, Math.round(next.height / riserHeight)));
  const risers = num("risers") ?? num("steps");
  if (risers !== undefined) next.risers = Math.max(3, Math.min(40, Math.round(risers)));
  const treads = num("treads");
  if (treads !== undefined) next.risers = Math.max(3, Math.min(40, Math.round(treads) + 1));
  const tread = num("treadDepth");
  if (tread !== undefined && tread > 0) next.treadDepth = tread;
  const flight = num("stairWidth");
  if (flight !== undefined && flight > 0) next.stairWidth = flight;
  const landing = num("landing");
  if (landing !== undefined && landing > 0) next.landing = landing;
  if (patch.reversed !== undefined) next.reversed = patch.reversed === "toggle" ? !next.reversed : Boolean(Number(patch.reversed));
  const total = num("length");
  if (total !== undefined && total > 0) {
    const now = stairGeometry(next);
    const along = now.length - (next.type === "straight" ? 0 : next.type === "spiral" || next.type === "curved" ? 0 : Math.max(next.stairWidth, next.landing));
    const count = Math.max(1, Math.round(along / next.treadDepth));
    next.treadDepth = Math.max(150, Math.round((total - (now.length - along)) / count));
  }
  const across = num("width");
  if (across !== undefined && across > 0) {
    const u = ["u-shaped", "dog-legged", "switchback", "u-winder"].includes(next.type);
    next.stairWidth = Math.max(600, Math.round(next.type === "spiral" || next.type === "curved" ? across / 2 - 100 : u ? (across - next.gap) / 2 : next.type === "straight" ? across : next.stairWidth));
  }
  return next;
}

/** What a builder would query about a stair: a steep riser, a short tread, the step rule. */
export function stairWarnings(params: StairParams): string[] {
  const riser = params.height / params.risers;
  const warnings: string[] = [];
  if (riser > 190) warnings.push(`Risers of ${riser.toFixed(1)} mm are steep — add risers`);
  if (params.treadDepth < 250) warnings.push(`Treads of ${params.treadDepth} mm are short`);
  const rule = 2 * riser + params.treadDepth;
  if (rule < 550 || rule > 700) warnings.push(`2 risers + 1 tread is ${Math.round(rule)} mm — 600 to 650 is comfortable`);
  if (params.stairWidth < 800) warnings.push("Narrower than 800 mm");
  return warnings;
}

export type StairFit = { params: StairParams; width: number; length: number; rotated: boolean };

/**
 * Auto fit: the stair arrangements that fit a space for a floor height,
 * widest and easiest first. A type that cannot fit is not offered.
 */
export function fitStairs(space: { width: number; length: number }, height: number): StairFit[] {
  const order: StairType[] = ["straight", "l-shaped", "u-shaped", "dog-legged", "l-winder", "u-winder", "winder", "switchback", "curved", "spiral"];
  const fits: StairFit[] = [];
  for (const type of order) {
    let found: StairFit | null = null;
    for (const stairWidth of [1000, 900, 800]) {
      for (const treadDepth of [280, 270, 260, 250]) {
        const params = stairPreset(type, height, stairWidth, treadDepth);
        const geometry = stairGeometry(params);
        if (geometry.width <= space.width && geometry.length <= space.length) found = { params, width: geometry.width, length: geometry.length, rotated: false };
        else if (geometry.length <= space.width && geometry.width <= space.length) found = { params, width: geometry.width, length: geometry.length, rotated: true };
        if (found) break;
      }
      if (found) break;
    }
    if (found) fits.push(found);
  }
  return fits;
}

/** A point of the stair's frame on the plan: turned by its rotation, moved to its centre. */
export function onPlan(stair: { x: number; y: number; rotation: number }, point: Point): Point {
  const a = stair.rotation * Math.PI / 180;
  return { x: stair.x + point.x * Math.cos(a) - point.y * Math.sin(a), y: stair.y + point.x * Math.sin(a) + point.y * Math.cos(a) };
}
