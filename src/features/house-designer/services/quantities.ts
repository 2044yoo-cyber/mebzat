import type { HouseProject } from "../types/project";

export type HouseQuantityRow = {
  code: string;
  category: "concrete" | "masonry" | "finishes" | "openings" | "ceilings" | "external";
  description: string;
  unit: "m³" | "m²" | "m" | "No.";
  quantity: number;
  sourceObjectIds: string[];
  preliminary: true;
};

/** Derived live from structured objects so BOQ data cannot drift from the model. */
export function calculateHouseQuantities(project: HouseProject): HouseQuantityRow[] {
  const openingByWall = new Map<string, typeof project.doors>();
  for (const opening of [...project.doors, ...project.windows]) {
    const list = openingByWall.get(opening.wallId) ?? [];
    list.push(opening);
    openingByWall.set(opening.wallId, list);
  }

  let masonryVolume = 0;
  let netWallArea = 0;
  for (const wall of project.walls) {
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    const openings = openingByWall.get(wall.id) ?? [];
    const openingArea = openings.reduce((sum, opening) => sum + opening.width * opening.height, 0);
    const grossArea = length * wall.height;
    const netArea = Math.max(0, grossArea - openingArea);
    netWallArea += netArea / 1_000_000;
    masonryVolume += netArea * wall.thickness / 1_000_000_000;
  }

  const slabConcrete = project.slabs.reduce((sum, slab) => sum + polygonArea(slab.boundary) * slab.thickness / 1_000_000_000, 0);
  const columnConcrete = project.structuralColumns.reduce((sum, column) => sum + column.width * column.depth * column.height / 1_000_000_000, 0);
  const beamConcrete = project.structuralBeams.reduce((sum, beam) => sum + Math.hypot(beam.end.x - beam.start.x, beam.end.y - beam.start.y) * beam.width * beam.depth / 1_000_000_000, 0);
  const stairConcrete = project.stairs.reduce((sum, stair) => sum + stair.width * stair.length * stair.height * 0.5 / 1_000_000_000, 0);
  const balconyConcrete = project.balconies.reduce((sum, balcony) => sum + balcony.width * balcony.depth * balcony.thickness / 1_000_000_000, 0);
  const foundationConcrete = project.foundations.reduce((sum, foundation) => sum + foundation.width * foundation.depth * foundation.thickness / 1_000_000_000, 0);
  const railingLength = project.railings.reduce((sum, railing) => sum + Math.hypot(railing.end.x - railing.start.x, railing.end.y - railing.start.y) / 1000, 0);
  const floorFinish = project.rooms.reduce((sum, room) => sum + polygonArea(room.boundary) / 1_000_000, 0);
  const verandaFloor = project.verandas.reduce((sum, veranda) => sum + veranda.width * veranda.depth / 1_000_000, 0);
  const ceilingArea = project.ceilings.reduce((sum, ceiling) => sum + polygonArea(ceiling.boundary) / 1_000_000, 0);
  const siteArea = project.site ? polygonArea(project.site.boundary) / 1_000_000 : 0;
  const roofArea = project.roofs.reduce((sum, roof) => {
    const planArea = polygonArea(roof.boundary) / 1_000_000;
    const slope = roof.type === "flat" ? 0 : Math.max(0, roof.slope) * Math.PI / 180;
    return sum + planArea / Math.max(0.4, Math.cos(slope));
  }, 0);
  const doorArea = project.doors.reduce((sum, door) => sum + door.width * door.height / 1_000_000, 0);
  const windowArea = project.windows.reduce((sum, window) => sum + window.width * window.height / 1_000_000, 0);

  return [
    row("CON-01", "concrete", "Floor and roof slabs", "m³", slabConcrete, project.slabs.map((item) => item.id)),
    row("CON-02", "concrete", "Preliminary columns", "m³", columnConcrete, project.structuralColumns.map((item) => item.id)),
    row("CON-03", "concrete", "Preliminary beams", "m³", beamConcrete, project.structuralBeams.map((item) => item.id)),
    row("CON-04", "concrete", "Preliminary stairs", "m³", stairConcrete, project.stairs.map((item) => item.id)),
    row("CON-05", "concrete", "Balcony slabs", "m³", balconyConcrete, project.balconies.map((item) => item.id)),
    row("CON-06", "concrete", "Preliminary foundations", "m³", foundationConcrete, project.foundations.map((item) => item.id)),
    row("MAS-01", "masonry", "Net wall construction", "m³", masonryVolume, project.walls.map((item) => item.id)),
    row("FIN-01", "finishes", "Wall finish / paint, both faces", "m²", netWallArea * 2, project.walls.map((item) => item.id)),
    row("FIN-02", "finishes", "Floor finishes", "m²", floorFinish, project.rooms.map((item) => item.id)),
    row("FIN-03", "finishes", "Roof covering", "m²", roofArea, project.roofs.map((item) => item.id)),
    row("FIN-04", "finishes", "Veranda flooring", "m²", verandaFloor, project.verandas.map((item) => item.id)),
    row("FIN-05", "ceilings", "Ceiling finishes", "m²", ceilingArea, project.ceilings.map((item) => item.id)),
    row("EXT-01", "external", "Site / ground finish", "m²", siteArea, project.site ? [project.site.id] : []),
    row("EXT-02", "external", "Railings", "m", railingLength, project.railings.map((item) => item.id)),
    row("OPN-01", "openings", "Doors", "No.", project.doors.length, project.doors.map((item) => item.id)),
    row("OPN-02", "openings", "Door area", "m²", doorArea, project.doors.map((item) => item.id)),
    row("OPN-03", "openings", "Windows", "No.", project.windows.length, project.windows.map((item) => item.id)),
    row("OPN-04", "openings", "Window area", "m²", windowArea, project.windows.map((item) => item.id)),
    row("OPN-05", "openings", "Placed components", "No.", project.components.length, project.components.map((item) => item.id)),
  ];
}

export function quantityCsv(project: HouseProject): string {
  const lines = ["Code,Category,Description,Unit,Quantity,Status"];
  for (const item of calculateHouseQuantities(project)) {
    lines.push([item.code, item.category, quote(item.description), item.unit, item.quantity.toFixed(3), "PRELIMINARY"].join(","));
  }
  return lines.join("\n");
}

function row(code: string, category: HouseQuantityRow["category"], description: string, unit: HouseQuantityRow["unit"], quantity: number, sourceObjectIds: string[]): HouseQuantityRow {
  return { code, category, description, unit, quantity, sourceObjectIds, preliminary: true };
}

function polygonArea(points: { x: number; y: number }[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function quote(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
