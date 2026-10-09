"use client";

import type { ReactNode } from "react";

import { doorType, windowType, type ObjectDefinition } from "../services/object-library";
import type { StairGeometry } from "../services/stair-geometry";

/**
 * Architectural plan symbols, drawn as a CAD floor plan draws them: a bed
 * with its pillows and turned-back sheet, a sofa with its cushions, a table
 * with its chairs, a toilet's cistern and bowl, a stair's treads and its UP
 * arrow, a door's leaf and swing. Line work only — no photographs, no emoji.
 *
 * Furniture is drawn in its own frame, centred on (0, 0), back at the top,
 * front at the bottom; the caller turns and places it.
 */

const LINE = { fill: "none", stroke: "currentColor", strokeWidth: 1.1, vectorEffect: "non-scaling-stroke" as const, strokeLinejoin: "round" as const };
const FAINT = { ...LINE, strokeWidth: 0.7 };
// Opaque, in the page's own background colour: a chair tucked under a table
// is hidden by it, in light and dark alike.
const SOLID = { style: { fill: "var(--background, #fff)" }, stroke: "currentColor", strokeWidth: 1.1, vectorEffect: "non-scaling-stroke" as const };

function Box({ x, y, w, h, r = 0, faint = false, fill = false }: { x: number; y: number; w: number; h: number; r?: number; faint?: boolean; fill?: boolean }) {
  return <rect x={x} y={y} width={Math.max(0, w)} height={Math.max(0, h)} rx={r} {...(fill ? SOLID : faint ? FAINT : LINE)} />;
}

function Chairs({ table, count, round = false }: { table: { w: number; h: number }; count: number; round?: boolean }) {
  const size = 420;
  const out: ReactNode[] = [];
  const seat = (cx: number, cy: number, angle: number, key: string) => (
    <g key={key} transform={`translate(${cx} ${cy}) rotate(${angle})`}>
      <Box x={-size / 2} y={-size / 2} w={size} h={size} r={50} fill />
      <line x1={-size / 2 + 40} y1={size / 2 - 70} x2={size / 2 - 40} y2={size / 2 - 70} {...FAINT} />
    </g>
  );
  if (round) {
    const radius = table.w / 2 + size * 0.42;
    for (let index = 0; index < count; index += 1) {
      const a = (index / count) * Math.PI * 2 - Math.PI / 2;
      out.push(seat(Math.cos(a) * radius, Math.sin(a) * radius, (a * 180) / Math.PI - 90, `c${index}`));
    }
    return <>{out}</>;
  }
  const { w, h } = table;
  const ends = count >= 6 || count === 2 ? (count === 2 ? 0 : 2) : 0;
  const sides = count - ends;
  const perSide = Math.ceil(sides / 2);
  for (let side = 0; side < 2; side += 1) {
    const n = side === 0 ? perSide : sides - perSide;
    for (let index = 0; index < n; index += 1) {
      const x = -w / 2 + (w * (index + 0.5)) / n;
      out.push(seat(x, side === 0 ? -h / 2 - size * 0.38 : h / 2 + size * 0.38, side === 0 ? 180 : 0, `s${side}${index}`));
    }
  }
  if (ends) {
    out.push(seat(-w / 2 - size * 0.38, 0, 90, "e0"));
    out.push(seat(w / 2 + size * 0.38, 0, -90, "e1"));
  }
  return <>{out}</>;
}

function Cushions({ x, y, w, h, count, vertical = false }: { x: number; y: number; w: number; h: number; count: number; vertical?: boolean }) {
  return <>{Array.from({ length: count }, (_, index) => vertical
    ? <Box key={index} x={x + 20} y={y + (h * index) / count + 20} w={w - 40} h={h / count - 40} r={60} faint />
    : <Box key={index} x={x + (w * index) / count + 20} y={y + 20} w={w / count - 40} h={h - 40} r={60} faint />)}</>;
}

/** A furniture or fixture symbol in its own frame. */
export function ObjectSymbol({ definition, width, depth }: { definition: Pick<ObjectDefinition, "symbol" | "count">; width: number; depth: number }) {
  const w = width;
  const d = depth;
  const x0 = -w / 2;
  const y0 = -d / 2;
  const n = definition.count ?? 1;
  switch (definition.symbol) {
    case "chair":
    case "sofa": {
      const back = Math.min(220, d * 0.24);
      const arm = Math.min(180, w * 0.12);
      return <g><Box x={x0} y={y0} w={w} h={d} r={80} fill /><Box x={x0} y={y0} w={w} h={back} r={60} faint /><Box x={x0} y={y0 + back} w={arm} h={d - back} r={50} faint /><Box x={-x0 - arm} y={y0 + back} w={arm} h={d - back} r={50} faint /><Cushions x={x0 + arm} y={y0 + back} w={w - 2 * arm} h={d - back} count={n} /></g>;
    }
    case "sofa-l":
    case "sofa-u": {
      const seat = Math.min(900, Math.min(w, d) * 0.5);
      const back = seat * 0.24;
      const u = definition.symbol === "sofa-u";
      const outline = u
        ? `M${x0},${y0} H${-x0} V${-y0} H${-x0 - seat} V${y0 + seat} H${x0 + seat} V${-y0} H${x0} Z`
        : `M${x0},${y0} H${-x0} V${y0 + seat} H${x0 + seat} V${-y0} H${x0} Z`;
      return (
        <g>
          <path d={outline} {...SOLID} />
          <path d={u ? `M${x0 + back},${-y0} V${y0 + back} H${-x0 - back} V${-y0}` : `M${x0 + back},${-y0} V${y0 + back} H${-x0}`} {...FAINT} />
          <Cushions x={x0 + seat} y={y0 + back} w={w - seat * (u ? 2 : 1)} h={seat - back} count={Math.max(1, Math.round((w - seat * (u ? 2 : 1)) / 700))} />
          <Cushions x={x0 + back} y={y0 + seat} w={seat - back} h={d - seat} count={Math.max(1, Math.round((d - seat) / 700))} vertical />
          {u ? <Cushions x={-x0 - seat} y={y0 + seat} w={seat - back} h={d - seat} count={Math.max(1, Math.round((d - seat) / 700))} vertical /> : null}
        </g>
      );
    }
    case "coffee-table":
      return <g><Box x={x0} y={y0} w={w} h={d} r={40} fill /><Box x={x0 + 60} y={y0 + 60} w={w - 120} h={d - 120} r={30} faint /></g>;
    case "side-table":
    case "bedside":
      return <g><Box x={x0} y={y0} w={w} h={d} r={30} fill /><circle cx={0} cy={0} r={Math.min(w, d) * 0.28} {...FAINT} /><line x1={-Math.min(w, d) * 0.2} y1={0} x2={Math.min(w, d) * 0.2} y2={0} {...FAINT} /><line x1={0} y1={-Math.min(w, d) * 0.2} x2={0} y2={Math.min(w, d) * 0.2} {...FAINT} /></g>;
    case "tv-unit":
      return <g><Box x={x0} y={y0} w={w} h={d} fill /><Box x={x0 + w * 0.15} y={y0 + d * 0.2} w={w * 0.7} h={Math.min(60, d * 0.2)} faint /><line x1={0} y1={y0 + d * 0.2} x2={0} y2={-y0} {...FAINT} /></g>;
    case "bed": {
      const head = Math.min(80, d * 0.04);
      const pillowH = Math.min(380, d * 0.18);
      const fold = y0 + d * 0.38;
      return (
        <g>
          <Box x={x0} y={y0} w={w} h={d} r={30} fill />
          <Box x={x0} y={y0} w={w} h={head} faint />
          {Array.from({ length: n }, (_, index) => <Box key={index} x={x0 + 60 + ((w - 120) * index) / n + 20} y={y0 + head + 60} w={(w - 120) / n - 40} h={pillowH} r={70} faint />)}
          <line x1={x0} y1={fold} x2={-x0} y2={fold} {...LINE} />
          <path d={`M${x0},${fold} L${x0 + Math.min(w * 0.35, 500)},${fold + Math.min(w * 0.35, 500)}`} {...FAINT} />
        </g>
      );
    }
    case "wardrobe":
    case "dresser":
    case "cabinet":
    case "base-cabinet": {
      const doors = definition.symbol === "wardrobe" ? n : definition.symbol === "cabinet" ? 2 : 1;
      return (
        <g>
          <Box x={x0} y={y0} w={w} h={d} fill />
          {Array.from({ length: doors - 1 }, (_, index) => <line key={index} x1={x0 + (w * (index + 1)) / doors} y1={y0} x2={x0 + (w * (index + 1)) / doors} y2={-y0} {...FAINT} />)}
          {definition.symbol === "wardrobe" ? <line x1={x0 + 80} y1={0} x2={-x0 - 80} y2={0} {...FAINT} strokeDasharray="60 40" /> : null}
          {definition.symbol === "dresser" ? [0.33, 0.66].map((t) => <line key={t} x1={x0} y1={y0 + d * t} x2={-x0} y2={y0 + d * t} {...FAINT} />) : null}
          {definition.symbol === "cabinet" ? <><line x1={x0} y1={y0} x2={-x0} y2={-y0} {...FAINT} /><line x1={-x0} y1={y0} x2={x0} y2={-y0} {...FAINT} /></> : null}
          {definition.symbol === "base-cabinet" ? <line x1={x0} y1={-y0 - 40} x2={-x0} y2={-y0 - 40} {...FAINT} /> : null}
        </g>
      );
    }
    case "wall-cabinet":
      return <g><rect x={x0} y={y0} width={w} height={d} {...LINE} strokeDasharray="80 50" /><line x1={x0} y1={y0} x2={-x0} y2={-y0} {...FAINT} strokeDasharray="80 50" /></g>;
    case "dining-table":
    case "meeting-table":
      return <g><Chairs table={{ w, h: d }} count={n} /><Box x={x0} y={y0} w={w} h={d} r={30} fill /></g>;
    case "round-table":
      return <g><Chairs table={{ w, h: d }} count={n} round /><circle cx={0} cy={0} r={Math.min(w, d) / 2} {...SOLID} /></g>;
    case "sink":
    case "double-sink": {
      const bowls = definition.symbol === "double-sink" ? 2 : 1;
      const bw = (w - 120 - (bowls - 1) * 60) / bowls;
      return (
        <g>
          <Box x={x0} y={y0} w={w} h={d} fill />
          {Array.from({ length: bowls }, (_, index) => { const bx = x0 + 60 + index * (bw + 60); return <g key={index}><Box x={bx} y={y0 + d * 0.25} w={bw} h={d * 0.62} r={70} /><circle cx={bx + bw / 2} cy={y0 + d * 0.56} r={25} {...FAINT} /></g>; })}
          <circle cx={0} cy={y0 + d * 0.12} r={30} {...LINE} />
        </g>
      );
    }
    case "fridge":
    case "dishwasher":
    case "oven": {
      const label = definition.symbol === "fridge" ? "REF" : definition.symbol === "dishwasher" ? "DW" : "OV";
      return <g><Box x={x0} y={y0} w={w} h={d} fill /><line x1={x0} y1={-y0 - 50} x2={-x0} y2={-y0 - 50} {...FAINT} /><text x={0} y={Math.min(w, d) * 0.08} textAnchor="middle" fontSize={Math.min(w, d) * 0.22} fill="currentColor" stroke="none">{label}</text></g>;
    }
    case "stove":
      return <g><Box x={x0} y={y0} w={w} h={d} fill />{[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => <g key={`${sx}${sy}`}><circle cx={sx! * w * 0.22} cy={sy! * d * 0.22} r={Math.min(w, d) * 0.15} {...LINE} /><circle cx={sx! * w * 0.22} cy={sy! * d * 0.22} r={Math.min(w, d) * 0.07} {...FAINT} /></g>)}</g>;
    case "island":
      return <g><Box x={x0} y={y0} w={w} h={d} fill /><Box x={x0 + 50} y={y0 + 50} w={w - 100} h={d - 100} faint /></g>;
    case "toilet": {
      const tank = d * 0.27;
      return (
        <g>
          <Box x={x0} y={y0} w={w} h={tank} r={40} fill />
          <ellipse cx={0} cy={y0 + tank + (d - tank) * 0.5} rx={w * 0.45} ry={(d - tank) * 0.5} {...SOLID} />
          <ellipse cx={0} cy={y0 + tank + (d - tank) * 0.55} rx={w * 0.3} ry={(d - tank) * 0.36} {...FAINT} />
        </g>
      );
    }
    case "basin":
    case "double-basin": {
      const bowls = definition.symbol === "double-basin" ? 2 : 1;
      return <g><Box x={x0} y={y0} w={w} h={d} r={30} fill />{Array.from({ length: bowls }, (_, index) => { const cx = x0 + (w * (index + 0.5)) / bowls; return <g key={index}><ellipse cx={cx} cy={d * 0.06} rx={(w / bowls) * 0.36} ry={d * 0.32} {...LINE} /><circle cx={cx} cy={y0 + d * 0.13} r={22} {...FAINT} /></g>; })}</g>;
    }
    case "shower":
      return <g><Box x={x0} y={y0} w={w} h={d} fill /><line x1={x0} y1={y0} x2={-x0} y2={-y0} {...FAINT} /><line x1={-x0} y1={y0} x2={x0} y2={-y0} {...FAINT} /><circle cx={0} cy={0} r={Math.min(w, d) * 0.06} {...LINE} /></g>;
    case "bathtub":
      return <g><Box x={x0} y={y0} w={w} h={d} r={60} fill /><Box x={x0 + 80} y={y0 + 80} w={w - 160} h={d - 160} r={Math.min(w, d) * 0.3} /><circle cx={x0 + w * 0.15} cy={0} r={30} {...FAINT} /></g>;
    case "desk":
      return <g><Box x={x0} y={y0} w={w} h={d} fill /><line x1={-x0 - Math.min(450, w * 0.3)} y1={y0} x2={-x0 - Math.min(450, w * 0.3)} y2={-y0} {...FAINT} />{[0.33, 0.66].map((t) => <line key={t} x1={-x0 - Math.min(450, w * 0.3)} y1={y0 + d * t} x2={-x0} y2={y0 + d * t} {...FAINT} />)}</g>;
    case "office-chair": {
      const r = Math.min(w, d) * 0.4;
      return <g><circle cx={0} cy={d * 0.05} r={r} {...SOLID} /><path d={`M${-r},${-r * 0.6} Q0,${-r * 1.45} ${r},${-r * 0.6}`} {...LINE} /></g>;
    }
    case "washer":
      return <g><Box x={x0} y={y0} w={w} h={d} fill /><circle cx={0} cy={d * 0.05} r={Math.min(w, d) * 0.32} {...LINE} /><circle cx={0} cy={d * 0.05} r={Math.min(w, d) * 0.22} {...FAINT} /></g>;
    case "bench":
      return <g><Box x={x0} y={y0} w={w} h={d} r={30} fill />{[0.25, 0.5, 0.75].map((t) => <line key={t} x1={x0} y1={y0 + d * t} x2={-x0} y2={y0 + d * t} {...FAINT} />)}</g>;
    case "car": {
      const r = w * 0.18;
      return (
        <g>
          <Box x={x0} y={y0} w={w} h={d} r={r} fill />
          <path d={`M${x0 + w * 0.12},${-y0 - d * 0.3} Q0,${-y0 - d * 0.36} ${-x0 - w * 0.12},${-y0 - d * 0.3}`} {...LINE} />
          <path d={`M${x0 + w * 0.14},${y0 + d * 0.25} Q0,${y0 + d * 0.2} ${-x0 - w * 0.14},${y0 + d * 0.25}`} {...LINE} />
          <Box x={x0 + w * 0.12} y={y0 + d * 0.26} w={w * 0.76} h={d * 0.42} r={r * 0.6} faint />
          <line x1={x0 - 80} y1={-y0 - d * 0.32} x2={x0} y2={-y0 - d * 0.32} {...LINE} />
          <line x1={-x0} y1={-y0 - d * 0.32} x2={-x0 + 80} y2={-y0 - d * 0.32} {...LINE} />
        </g>
      );
    }
    default:
      return <g><Box x={x0} y={y0} w={w} h={d} fill /><line x1={x0} y1={y0} x2={-x0} y2={-y0} {...FAINT} /><line x1={-x0} y1={y0} x2={x0} y2={-y0} {...FAINT} /></g>;
  }
}

/** A stair: every tread, the landings, the walking line and its UP arrow. */
export function StairSymbol({ geometry, label = true }: { geometry: StairGeometry; label?: boolean }) {
  const walk = geometry.walk;
  const end = walk.at(-1)!;
  const before = walk.at(-2) ?? walk[0]!;
  const angle = Math.atan2(end.y - before.y, end.x - before.x);
  const head = Math.min(260, Math.max(120, Math.min(geometry.width, geometry.length) * 0.12));
  const tip = (side: number) => ({ x: end.x - Math.cos(angle + side * 0.45) * head, y: end.y - Math.sin(angle + side * 0.45) * head });
  const start = walk[0]!;
  return (
    <g>
      {geometry.pieces.map((piece, index) => <polygon key={index} points={piece.points.map((point) => `${point.x},${point.y}`).join(" ")} {...SOLID} strokeWidth={piece.landing ? 1.3 : 1} />)}
      <polyline aria-label="Stair direction" points={walk.map((point) => `${point.x},${point.y}`).join(" ")} {...LINE} strokeWidth={1.4} />
      <path d={`M${tip(1).x},${tip(1).y} L${end.x},${end.y} L${tip(-1).x},${tip(-1).y}`} {...LINE} strokeWidth={1.4} />
      <circle cx={start.x} cy={start.y} r={head * 0.3} fill="currentColor" stroke="none" />
      {label ? <text x={start.x} y={start.y - head * 0.6} textAnchor="middle" fontSize={head * 0.9} fontWeight={700} fill="currentColor" stroke="none">UP</text> : null}
    </g>
  );
}

type Point = { x: number; y: number };

/**
 * A door in its wall: `from`→`to` along the wall, `side` the normal it opens
 * towards, `hinge` which jamb it hangs on.
 */
/**
 * A door as it is drawn on a floor plan: the wall's ends closed off at both
 * jambs, the leaf as a panel standing open at 90° from its hinge on the face
 * of the wall it swings out of, and the quarter circle its edge sweeps, from
 * the far jamb to the open leaf, drawn as a line. Sliding, pocket, folding
 * and pivot doors keep their own marks, between the same jambs.
 */
export function DoorSymbol({ from, to, side, hingeAtFrom, style, thickness }: { from: Point; to: Point; side: Point; hingeAtFrom: boolean; style: string | undefined; thickness: number }) {
  const type = doorType(style);
  const width = Math.hypot(to.x - from.x, to.y - from.y);
  const u = { x: (to.x - from.x) / width, y: (to.y - from.y) / width };
  const half = thickness / 2;
  const at = (base: Point, along: number, out: number) => ({ x: base.x + u.x * along + side.x * out, y: base.y + u.y * along + side.y * out });
  // The jambs: each end of the opening closed across the wall.
  const jamb = (along: number, key: string) => { const p = at(from, along, -half); const q = at(from, along, half); return <line key={key} data-door-part="jamb" x1={p.x} y1={p.y} x2={q.x} y2={q.y} {...LINE} strokeWidth={1.4} />; };
  const jambs = <>{jamb(0, "j0")}{jamb(width, "j1")}</>;
  // A hinged leaf: a panel 40 mm thick, open square to the wall, hung on the
  // wall's face on the side it opens to; its swing a solid quarter circle.
  const leaf = (hingeAlong: number, length: number, direction: 1 | -1, key: string) => {
    const leafThickness = Math.min(40, length / 10);
    const hinge = at(from, hingeAlong, half);
    const open = at(hinge, 0, length);
    const shut = at(hinge, length * direction, 0);
    const panel = [hinge, open, at(open, leafThickness * direction, 0), at(hinge, leafThickness * direction, 0)];
    const sweep = (side.x * u.y - side.y * u.x) * direction > 0 ? 1 : 0;
    return (
      <g key={key}>
        <polygon data-door-part="leaf" points={panel.map((point) => `${point.x},${point.y}`).join(" ")} {...SOLID} strokeWidth={1.4} />
        <path data-door-part="swing" d={`M${shut.x},${shut.y} A${length},${length} 0 0 ${sweep} ${open.x},${open.y}`} {...LINE} strokeWidth={0.9} />
      </g>
    );
  };
  const panel = (a: number, b: number, offset: number, key: string) => { const p = at(from, a, offset); const q = at(from, b, offset); return <line key={key} x1={p.x} y1={p.y} x2={q.x} y2={q.y} {...LINE} strokeWidth={2.2} />; };
  const hinge = hingeAtFrom ? from : to;
  const direction: 1 | -1 = hingeAtFrom ? 1 : -1;
  switch (type) {
    case "double": return <g data-door={type}>{jambs}{leaf(0, width / 2, 1, "a")}{leaf(width, width / 2, -1, "b")}</g>;
    case "sliding": return <g data-door={type}>{jambs}{panel(0, width * 0.55, -thickness * 0.15, "a")}{panel(width * 0.45, width, thickness * 0.15, "b")}</g>;
    case "double-sliding": return <g data-door={type}>{jambs}{panel(0, width * 0.3, thickness * 0.15, "a")}{panel(width * 0.25, width * 0.5, -thickness * 0.15, "b")}{panel(width * 0.5, width * 0.75, -thickness * 0.15, "c")}{panel(width * 0.7, width, thickness * 0.15, "d")}</g>;
    case "pocket": { const p = at(from, -width * 0.6, 0); const q = at(from, width * 0.4, 0); return <g data-door={type}>{jambs}<line x1={p.x} y1={p.y} x2={q.x} y2={q.y} {...LINE} strokeWidth={2.2} strokeDasharray="60 30" /></g>; }
    case "folding": {
      const fold = (base: Point, dir: 1 | -1, key: string) => { const leafW = width / 4; const a = base; const b = { x: a.x + u.x * leafW * 0.6 * dir + side.x * leafW * 0.8, y: a.y + u.y * leafW * 0.6 * dir + side.y * leafW * 0.8 }; const c = { x: a.x + u.x * leafW * 1.2 * dir, y: a.y + u.y * leafW * 1.2 * dir }; return <path key={key} d={`M${a.x},${a.y} L${b.x},${b.y} L${c.x},${c.y}`} {...LINE} strokeWidth={1.6} />; };
      return <g data-door={type}>{jambs}{fold(from, 1, "a")}{fold(to, -1, "b")}</g>;
    }
    case "pivot": {
      const pivot = at(hinge, (width / 3) * direction, 0);
      const outer = at(pivot, 0, (width * 2) / 3);
      const inner = at(pivot, 0, -width / 3);
      return <g data-door={type}>{jambs}<line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} {...LINE} strokeWidth={1.6} /><circle cx={pivot.x} cy={pivot.y} r={30} {...LINE} /><path d={`M${at(pivot, ((width * 2) / 3) * -direction, 0).x},${at(pivot, ((width * 2) / 3) * -direction, 0).y} A${(width * 2) / 3},${(width * 2) / 3} 0 0 ${(side.x * u.y - side.y * u.x) * -direction > 0 ? 1 : 0} ${outer.x},${outer.y}`} {...FAINT} strokeDasharray="40 30" /></g>;
    }
    default: return <g data-door={type}>{jambs}{leaf(hingeAtFrom ? 0 : width, width, direction, "a")}</g>;
  }
}

/** A window in its wall: the frame across the wall's thickness, and the glass as its type has it. */
export function WindowSymbol({ from, to, side, style, thickness }: { from: Point; to: Point; side: Point; style: string | undefined; thickness: number }) {
  const type = windowType(style);
  const width = Math.hypot(to.x - from.x, to.y - from.y);
  const u = { x: (to.x - from.x) / width, y: (to.y - from.y) / width };
  const at = (along: number, out: number) => ({ x: from.x + u.x * along + side.x * out, y: from.y + u.y * along + side.y * out });
  const line = (a: number, b: number, out: number, props = LINE, key = `${a}${b}${out}`) => { const p = at(a, out); const q = at(b, out); return <line key={key} x1={p.x} y1={p.y} x2={q.x} y2={q.y} {...props} />; };
  const half = thickness / 2;
  const sash = (hingeAlong: number, length: number, dir: 1 | -1, key: string) => {
    const hinge = at(hingeAlong, -half);
    const open = { x: hinge.x - side.x * length, y: hinge.y - side.y * length };
    const shut = at(hingeAlong + length * dir, -half);
    return <g key={key}><line x1={hinge.x} y1={hinge.y} x2={open.x} y2={open.y} {...FAINT} /><path d={`M${shut.x},${shut.y} A${length},${length} 0 0 ${(side.x * u.y - side.y * u.x) * dir < 0 ? 1 : 0} ${open.x},${open.y}`} {...FAINT} strokeDasharray="30 25" /></g>;
  };
  return (
    <g>
      <polygon points={[at(0, -half), at(width, -half), at(width, half), at(0, half)].map((point) => `${point.x},${point.y}`).join(" ")} {...SOLID} />
      {type === "sliding"
        ? <>{line(0, width * 0.55, -thickness * 0.12)}{line(width * 0.45, width, thickness * 0.12)}</>
        : type === "picture" ? <>{line(0, width, -thickness * 0.1)}{line(0, width, thickness * 0.1)}</>
          : line(0, width, 0)}
      {type === "casement" ? sash(0, width, 1, "a") : null}
      {type === "double-casement" ? <>{sash(0, width / 2, 1, "a")}{sash(width, width / 2, -1, "b")}</> : null}
      {type === "awning" ? (() => { const a = at(0, -half); const m = at(width / 2, -half - width * 0.25); const b = at(width, -half); return <path d={`M${a.x},${a.y} L${m.x},${m.y} L${b.x},${b.y}`} {...FAINT} strokeDasharray="30 25" />; })() : null}
      {type === "corner" ? <>{line(0, 0.1, -half, LINE, "c1")}<circle cx={at(width, 0).x} cy={at(width, 0).y} r={half * 0.5} {...FAINT} /></> : null}
    </g>
  );
}
