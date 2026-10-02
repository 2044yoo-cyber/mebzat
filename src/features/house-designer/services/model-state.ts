import type {
  HouseObjectKind,
  HouseObjectType,
  HouseProject,
  HouseSelection,
  HouseViewState,
} from "../types/project";

export function ensureHouseBimState(project: HouseProject): HouseProject {
  const groundId = project.levels[0]?.id;
  const foundations = project.foundations.length || !groundId ? project.foundations : project.structuralColumns.filter((item) => item.levelId === groundId).map((column) => ({ id: `foundation:${column.id}`, levelId: column.levelId, x: column.x, y: column.y, elevation: -450, width: Math.max(900, column.width * 3), depth: Math.max(900, column.depth * 3), thickness: 450, material: "Reinforced concrete" }));
  const base = { ...project, foundations };
  const objectTypes = base.objectTypes.length ? base.objectTypes : fallbackTypes(base);
  const objectInstances = { ...project.objectInstances };
  for (const selection of allHouseSelections(base)) {
    if (objectInstances[selection.id]) continue;
    objectInstances[selection.id] = {
      typeId: defaultTypeId(selection.kind),
      mark: `${selection.kind.slice(0, 2).toUpperCase()}-${Object.keys(objectInstances).length + 1}`,
      pinned: false,
      groupId: null,
      flipped: false,
      properties: {},
    };
  }
  const views = base.views.length ? base.views : fallbackViews(base);
  return { ...base, objectTypes, objectInstances, views };
}

export function allHouseSelections(project: HouseProject, levelId?: string): HouseSelection[] {
  const atLevel = <T extends { id: string; levelId: string }>(kind: HouseObjectKind, items: T[]) =>
    items.filter((item) => !levelId || item.levelId === levelId).map((item) => ({ kind, id: item.id }));
  const result: HouseSelection[] = [
    ...atLevel("room", project.rooms),
    ...atLevel("wall", project.walls),
    ...atLevel("door", project.doors),
    ...atLevel("window", project.windows),
    ...atLevel("stair", project.stairs),
    ...atLevel("slab", project.slabs),
    ...atLevel("roof", project.roofs),
    ...atLevel("column", project.structuralColumns),
    ...atLevel("beam", project.structuralBeams),
    ...atLevel("grid", project.structuralGrid),
    ...atLevel("facade", project.facadeElements),
    ...atLevel("balcony", project.balconies),
    ...atLevel("veranda", project.verandas),
    ...atLevel("ceiling", project.ceilings),
    ...atLevel("foundation", project.foundations),
    ...atLevel("railing", project.railings),
    ...atLevel("reference-plane", project.referencePlanes),
    ...atLevel("annotation", project.annotations),
    ...atLevel("component", project.components),
  ];
  if (project.site && (!levelId || project.site.levelId === levelId)) result.push({ kind: "site", id: project.site.id });
  if (levelId) result.unshift({ kind: "level", id: levelId });
  else result.unshift(...project.levels.map((level) => ({ kind: "level" as const, id: level.id })));
  return result;
}

export function sameSelection(a: HouseSelection, b: HouseSelection): boolean {
  return a.kind === b.kind && a.id === b.id;
}

export function selectionKey(selection: HouseSelection): string {
  return `${selection.kind}:${selection.id}`;
}

export function selectionLabel(project: HouseProject, selection: HouseSelection): string {
  const index = allHouseSelections(project).findIndex((item) => sameSelection(item, selection));
  const instance = project.objectInstances[selection.id];
  const named = selection.kind === "level"
    ? project.levels.find((item) => item.id === selection.id)?.name
    : selection.kind === "room"
      ? project.rooms.find((item) => item.id === selection.id)?.name
      : selection.kind === "component"
        ? project.components.find((item) => item.id === selection.id)?.name
        : selection.kind === "grid"
          ? project.structuralGrid.find((item) => item.id === selection.id)?.label
          : undefined;
  return named ?? (instance?.mark || `${title(selection.kind)} ${Math.max(1, index + 1)}`);
}

export function currentView(project: HouseProject, id: string | null): HouseViewState | null {
  return project.views.find((item) => item.id === id) ?? project.views.find((item) => item.id === "view:3d:default") ?? null;
}

function defaultTypeId(kind: HouseObjectKind): string | null {
  const ids: Partial<Record<HouseObjectKind, string>> = {
    wall: "wall-exterior-200",
    door: "door-single-900x2100",
    window: "window-sliding-1200x1500",
    column: "column-300x300",
    beam: "beam-250x450",
    slab: "slab-150",
    roof: "roof-flat-180",
  };
  return ids[kind] ?? null;
}

function fallbackTypes(project: HouseProject): HouseObjectType[] {
  const height = project.levels[0]?.floorToFloorHeight ?? 3000;
  return [
    { id: "wall-exterior-200", kind: "wall", name: "200 mm Exterior Block", properties: { thickness: 200, height, material: "Masonry", loadBearing: true } },
    { id: "wall-interior-120", kind: "wall", name: "120 mm Interior Block", properties: { thickness: 120, height, material: "Masonry", loadBearing: false } },
    { id: "door-single-900x2100", kind: "door", name: "Single 900 × 2100", properties: { width: 900, height: 2100, material: "Timber", panelCount: 1 } },
    { id: "window-sliding-1200x1500", kind: "window", name: "Aluminium Sliding 1200 × 1500", properties: { width: 1200, height: 1500, material: "Aluminium", panelCount: 2 } },
    { id: "column-300x300", kind: "column", name: "RC Column 300 × 300", properties: { width: 300, depth: 300, material: "Reinforced concrete", structural: true } },
    { id: "beam-250x450", kind: "beam", name: "RC Beam 250 × 450", properties: { width: 250, depth: 450, material: "Reinforced concrete", structural: true } },
    { id: "slab-150", kind: "slab", name: "RC Slab 150", properties: { thickness: 150, material: "Reinforced concrete" } },
    { id: "roof-flat-180", kind: "roof", name: "Flat RC Roof 180", properties: { thickness: 180, slope: 0, material: "Reinforced concrete" } },
  ];
}

function fallbackViews(project: HouseProject): HouseViewState[] {
  const common = { hiddenCategories: [] as HouseObjectKind[], temporaryHiddenIds: [] as string[], isolatedIds: [] as string[], cutPlane: 1200, topOffset: 2300, bottomOffset: 0 };
  return [
    ...project.levels.map((level) => ({ id: `view:plan:${level.id}`, name: level.name, kind: "floor-plan" as const, levelId: level.id, ...common })),
    { id: "view:3d:default", name: "Default 3D", kind: "3d", levelId: null, ...common },
    ...(["Front", "Rear", "Left", "Right"] as const).map((name) => ({ id: `view:elevation:${name.toLowerCase()}`, name, kind: "elevation" as const, levelId: null, ...common })),
  ];
}

function title(value: string) {
  return value.split("-").map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(" ");
}
