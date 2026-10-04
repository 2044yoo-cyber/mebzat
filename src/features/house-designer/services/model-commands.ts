import { patchHouseObject, removeFootprintCorner } from "./project-edit";
import { allHouseSelections, sameSelection } from "./model-state";
import { houseCommand, type HouseCommandId } from "./command-registry";
import { wallObjectId, openingObjectId, type HouseObjectKind, type HouseProject, type HouseSelection } from "../types/project";

export type HouseClipboard = { sourceProjectId: string; selections: HouseSelection[] };
export type HouseCommandMutation = { project: HouseProject; selections: HouseSelection[]; blocked: string[] };
export type HouseDraftPoint = { x: number; y: number };
export type HousePlacementOptions = {
  width?: number;
  depth?: number;
  height?: number;
  sillHeight?: number;
  wallThickness?: number;
  material?: string;
  /** A furniture item's name — "Bed", "Sofa" — from the catalogue. */
  name?: string;
};

export function deleteHouseSelections(project: HouseProject, selections: readonly HouseSelection[], options?: { footprintEditable?: boolean }): HouseCommandMutation {
  let next = project;
  const blocked: string[] = [];
  for (const selection of selections) {
    const conflict = lockConflict(next, selection);
    if (conflict) {
      blocked.push(conflict);
      continue;
    }
    if (selection.kind === "level") {
      blocked.push("Levels with model objects cannot be deleted here");
      continue;
    }
    if (selection.kind === "room") {
      blocked.push("Delete or edit the room boundary in the plan editor");
      continue;
    }
    if (selection.kind === "wall") {
      const wall = next.walls.find((item) => item.id === selection.id);
      const level = wall ? next.levels.find((item) => item.id === wall.levelId) : null;
      const sourceId = wall?.sourceWallId;
      const isFootprintWall = Boolean(sourceId && level?.plan?.corners.some((corner) => corner.id === sourceId));
      if (isFootprintWall) {
        if (!options?.footprintEditable) {
          blocked.push("Exterior footprint walls must be removed in plan verification");
          continue;
        }
        // Deleting one side of a closed footprint means deleting the corner
        // it starts from — there is no such thing as erasing a single wall
        // and leaving the shape open. removeFootprintCorner regenerates
        // every object that was derived from the footprint.
        const result = removeFootprintCorner(next, level!.id, sourceId!);
        if (!result.ok) {
          blocked.push("A footprint needs at least three walls");
          continue;
        }
        next = result.project;
        continue;
      }
      const openingIds = [...next.doors, ...next.windows].filter((item) => item.wallId === selection.id).map((item) => item.id);
      next = {
        ...next,
        walls: next.walls.filter((item) => item.id !== selection.id),
        doors: next.doors.filter((item) => item.wallId !== selection.id),
        windows: next.windows.filter((item) => item.wallId !== selection.id),
        structuralBeams: next.structuralBeams.filter((item) => item.sourceWallId !== sourceId),
        facadeElements: next.facadeElements.filter((item) => item.wallId !== selection.id),
        levels: sourceId ? next.levels.map((item) => item.id === wall?.levelId && item.plan ? {
          ...item,
          plan: {
            ...item.plan,
            interiorWalls: (item.plan.interiorWalls ?? []).filter((entry) => entry.id !== sourceId),
            openings: item.plan.openings.filter((entry) => entry.wallId !== sourceId),
          },
        } : item) : next.levels,
        objectInstances: omitKeys(next.objectInstances, [selection.id, ...openingIds]),
      };
      continue;
    }
    if (selection.kind === "door" || selection.kind === "window") {
      const list = selection.kind === "door" ? next.doors : next.windows;
      const opening = list.find((item) => item.id === selection.id);
      next = {
        ...next,
        doors: selection.kind === "door" ? next.doors.filter((item) => item.id !== selection.id) : next.doors,
        windows: selection.kind === "window" ? next.windows.filter((item) => item.id !== selection.id) : next.windows,
        levels: opening?.sourceOpeningId ? next.levels.map((level) => level.id === opening.levelId && level.plan ? {
          ...level,
          plan: { ...level.plan, openings: level.plan.openings.filter((item) => item.id !== opening.sourceOpeningId) },
        } : level) : next.levels,
        objectInstances: omitKeys(next.objectInstances, [selection.id]),
      };
      continue;
    }
    next = removeSimpleObject(next, selection);
  }
  return { project: next, selections: [], blocked };
}

export function duplicateHouseSelections(project: HouseProject, selections: readonly HouseSelection[], offset = 200): HouseCommandMutation {
  let next = project;
  const created: HouseSelection[] = [];
  const blocked: string[] = [];
  for (const selection of selections) {
    const result = duplicateOne(next, selection, offset);
    next = result.project;
    if (result.selection) created.push(result.selection);
    else blocked.push(`Cannot duplicate ${selection.kind}`);
  }
  return { project: next, selections: created, blocked };
}

/**
 * Why an edit to this object would break a lock, or null if it would not.
 * Locking a wall freezes its geometry, and that includes being stretched by a
 * neighbour: moving an outside wall moves the corners it shares, so a locked
 * wall either side of it has to say no too.
 */
export function lockConflict(project: HouseProject, selection: HouseSelection): string | null {
  if (project.objectInstances[selection.id]?.pinned) return `This ${selection.kind} is locked — unlock it to change it`;
  if (selection.kind !== "wall") return null;
  const wall = project.walls.find((item) => item.id === selection.id);
  if (!wall) return null;
  // Any wall with an end on this one changes with it: the neighbours that
  // share its corners, and walls meeting it in a T.
  const attached = project.walls.filter((item) => item.levelId === wall.levelId && item.id !== wall.id
    && [item.start, item.end].some((point) => pointSegmentDistance(point, wall.start, wall.end) <= wall.thickness / 2 + 5));
  return attached.some((item) => project.objectInstances[item.id]?.pinned) ? "A locked wall joined to it would have to change — unlock it first" : null;
}

export function moveHouseSelections(project: HouseProject, selections: readonly HouseSelection[], dx: number, dy: number, options?: { footprintEditable?: boolean }): HouseCommandMutation {
  let next = project;
  const blocked: string[] = [];
  for (const selection of selections) {
    const conflict = lockConflict(next, selection);
    if (conflict) { blocked.push(conflict); continue; }
    if (selection.kind === "wall") {
      const wall = next.walls.find((item) => item.id === selection.id);
      const level = wall ? next.levels.find((item) => item.id === wall.levelId) : null;
      if (!wall) continue;
      if (!options?.footprintEditable && next.originalPlanStrict && wall.sourceWallId && level?.plan?.corners.some((corner) => corner.id === wall.sourceWallId)) {
        blocked.push("Original Floor Plan Strict protects exterior walls");
        continue;
      }
      next = patchHouseObject(next, selection, { startX: wall.start.x + dx, startY: wall.start.y + dy, endX: wall.end.x + dx, endY: wall.end.y + dy });
      continue;
    }
    if (selection.kind === "door" || selection.kind === "window") {
      const item = (selection.kind === "door" ? next.doors : next.windows).find((entry) => entry.id === selection.id);
      if (item) next = patchHouseObject(next, selection, { offset: Math.max(0, item.offset + dx) });
      continue;
    }
    next = moveSimpleObject(next, selection, dx, dy);
  }
  return { project: next, selections: [...selections], blocked };
}

export function moveHouseSelectionsTo(project: HouseProject, selections: readonly HouseSelection[], point: HouseDraftPoint): HouseCommandMutation {
  const anchor = selections[0] ? objectAnchor(project, selections[0]) : null;
  if (!anchor) return { project, selections: [...selections], blocked: ["Select a movable object first"] };
  return moveHouseSelections(project, selections, point.x - anchor.x, point.y - anchor.y);
}

export function scaleHouseSelections(project: HouseProject, selections: readonly HouseSelection[], factor = 1.1): HouseCommandMutation {
  if (!Number.isFinite(factor) || factor <= 0) return { project, selections: [...selections], blocked: ["Scale factor must be greater than zero"] };
  let next = project;
  const blocked: string[] = [];
  for (const selection of selections) {
    if (next.objectInstances[selection.id]?.pinned) { blocked.push(`${selection.kind} ${selection.id} is pinned`); continue; }
    if (selection.kind === "wall") {
      const item = next.walls.find((entry) => entry.id === selection.id);
      if (item) next = patchHouseObject(next, selection, { length: Math.hypot(item.end.x - item.start.x, item.end.y - item.start.y) * factor });
      continue;
    }
    if (selection.kind === "door" || selection.kind === "window") {
      const item = next[`${selection.kind}s`].find((entry) => entry.id === selection.id);
      if (item) next = patchHouseObject(next, selection, { width: item.width * factor, height: item.height * factor });
      continue;
    }
    const item = findObject(next, selection) as Record<string, unknown> | null;
    if (!item) continue;
    const patch: Record<string, number> = {};
    for (const key of ["width", "depth", "height", "length", "thickness"] as const) if (typeof item[key] === "number") patch[key] = (item[key] as number) * factor;
    if (Object.keys(patch).length) next = patchHouseObject(next, selection, patch);
    else blocked.push(`Scale is not available for ${selection.kind}`);
  }
  return { project: next, selections: [...selections], blocked };
}

export function rotateHouseSelections(project: HouseProject, selections: readonly HouseSelection[], degrees = 90): HouseCommandMutation {
  let next = project;
  const blocked: string[] = [];
  for (const selection of selections) {
    if (next.objectInstances[selection.id]?.pinned) { blocked.push(`${selection.kind} ${selection.id} is pinned`); continue; }
    const collection = rotationCollection(next, selection.kind);
    if (!collection) { blocked.push(`Rotate is not available for ${selection.kind}`); continue; }
    next = collection((item) => item.id === selection.id ? { ...item, rotation: normalizeAngle(item.rotation + degrees) } : item);
  }
  return { project: next, selections: [...selections], blocked };
}

export function mirrorHouseSelections(project: HouseProject, selections: readonly HouseSelection[]): HouseCommandMutation {
  let next = project;
  for (const selection of selections) {
    const instance = next.objectInstances[selection.id];
    next = { ...next, objectInstances: { ...next.objectInstances, [selection.id]: { ...(instance ?? emptyInstance()), flipped: !(instance?.flipped ?? false) } } };
  }
  return { project: next, selections: [...selections], blocked: [] };
}

export function pinHouseSelections(project: HouseProject, selections: readonly HouseSelection[], pinned: boolean): HouseProject {
  const objectInstances = { ...project.objectInstances };
  for (const selection of selections) objectInstances[selection.id] = { ...(objectInstances[selection.id] ?? emptyInstance()), pinned };
  return { ...project, objectInstances };
}

export function groupHouseSelections(project: HouseProject, selections: readonly HouseSelection[], grouped: boolean): HouseProject {
  if (grouped && selections.length < 2) return project;
  const groupId = grouped ? `group-${crypto.randomUUID()}` : null;
  const objectInstances = { ...project.objectInstances };
  for (const selection of selections) objectInstances[selection.id] = { ...(objectInstances[selection.id] ?? emptyInstance()), groupId };
  return { ...project, objectInstances };
}

export function alignHouseSelections(project: HouseProject, selections: readonly HouseSelection[]): HouseCommandMutation {
  const anchor = selections.at(-1);
  const point = anchor ? objectAnchor(project, anchor) : null;
  if (!anchor || !point || selections.length < 2) return { project, selections: [...selections], blocked: ["Select at least two movable objects"] };
  let next = project;
  const blocked: string[] = [];
  for (const selection of selections.slice(0, -1)) {
    const current = objectAnchor(next, selection);
    if (!current) { blocked.push(`Cannot align ${selection.kind}`); continue; }
    const result = moveHouseSelections(next, [selection], point.x - current.x, point.y - current.y);
    next = result.project;
    blocked.push(...result.blocked);
  }
  return { project: next, selections: [...selections], blocked };
}

export function splitHouseSelection(project: HouseProject, selection: HouseSelection | null): HouseCommandMutation {
  if (!selection) return { project, selections: [], blocked: ["Select a wall, beam, railing or reference plane"] };
  if (selection.kind === "wall") {
    const wall = project.walls.find((item) => item.id === selection.id);
    const level = wall ? project.levels.find((item) => item.id === wall.levelId) : null;
    if (!wall) return { project, selections: [selection], blocked: ["Wall not found"] };
    if (wall.sourceWallId && level?.plan?.corners.some((corner) => corner.id === wall.sourceWallId)) return { project, selections: [selection], blocked: ["An outside wall is the house's outline — to divide a room, select the room and Split it"] };
    const middle = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
    const oldEnd = { ...wall.end };
    let next = patchHouseObject(project, selection, { endX: middle.x, endY: middle.y });
    const sourceWallId = `interior-${crypto.randomUUID()}`;
    const id = wallObjectId(wall.levelId, sourceWallId);
    const copy = { ...wall, id, sourceWallId, start: middle, end: oldEnd };
    next = {
      ...next,
      walls: [...next.walls, copy],
      levels: next.levels.map((item) => item.id === wall.levelId && item.plan ? { ...item, plan: { ...item.plan, interiorWalls: [...(item.plan.interiorWalls ?? []), { id: sourceWallId, start: middle, end: oldEnd, thickness: wall.thickness, height: wall.height, label: "Split wall" }] } } : item),
      objectInstances: { ...next.objectInstances, [id]: { ...(project.objectInstances[wall.id] ?? emptyInstance()), mark: `${project.objectInstances[wall.id]?.mark ?? "Wall"} B` } },
    };
    return { project: next, selections: [selection, { kind: "wall", id }], blocked: [] };
  }
  const key = selection.kind === "beam" ? "structuralBeams" : selection.kind === "railing" ? "railings" : selection.kind === "reference-plane" ? "referencePlanes" : null;
  if (!key) return { project, selections: [selection], blocked: [`Split is not available for ${selection.kind}`] };
  const list = project[key] as Array<{ id: string; start: { x: number; y: number }; end: { x: number; y: number } }>;
  const source = list.find((item) => item.id === selection.id);
  if (!source) return { project, selections: [selection], blocked: ["Object not found"] };
  const middle = { x: (source.start.x + source.end.x) / 2, y: (source.start.y + source.end.y) / 2 };
  const id = `${selection.kind}:${crypto.randomUUID()}`;
  const nextList = list.map((item) => item.id === source.id ? { ...item, end: middle } : item);
  nextList.push({ ...structuredClone(source), id, start: middle });
  const next = { ...project, [key]: nextList, objectInstances: { ...project.objectInstances, [id]: { ...(project.objectInstances[source.id] ?? emptyInstance()), mark: `${project.objectInstances[source.id]?.mark ?? selection.kind} B` } } } as HouseProject;
  return { project: next, selections: [selection, { kind: selection.kind, id }], blocked: [] };
}

export function joinHouseSelections(project: HouseProject, selections: readonly HouseSelection[], joined: boolean): HouseProject {
  if (selections.length < 2) return project;
  const ids = selections.map((item) => item.id);
  const objectInstances = { ...project.objectInstances };
  for (const selection of selections) {
    const current = objectInstances[selection.id] ?? emptyInstance();
    objectInstances[selection.id] = { ...current, properties: { ...current.properties, joinedTo: joined ? ids.filter((id) => id !== selection.id).join(",") : "" } };
  }
  return { ...project, objectInstances };
}

export function setHouseObjectType(project: HouseProject, selections: readonly HouseSelection[], typeId: string): HouseProject {
  const type = project.objectTypes.find((item) => item.id === typeId);
  if (!type) return project;
  let next = project;
  for (const selection of selections.filter((item) => item.kind === type.kind)) {
    next = patchHouseObject(next, selection, type.properties as Record<string, string | number>);
    next = { ...next, objectInstances: { ...next.objectInstances, [selection.id]: { ...(next.objectInstances[selection.id] ?? emptyInstance()), typeId } } };
  }
  return next;
}

export function duplicateHouseType(project: HouseProject, sourceTypeId: string, name: string): { project: HouseProject; typeId: string } {
  const source = project.objectTypes.find((item) => item.id === sourceTypeId);
  if (!source) return { project, typeId: sourceTypeId };
  const typeId = `${source.kind}-type-${crypto.randomUUID()}`;
  return { project: { ...project, objectTypes: [...project.objectTypes, { ...structuredClone(source), id: typeId, name: name.trim() || `${source.name} Copy` }] }, typeId };
}

export function updateHouseType(project: HouseProject, typeId: string, properties: Record<string, string | number | boolean>): HouseProject {
  const definition = project.objectTypes.find((item) => item.id === typeId);
  if (!definition) return project;
  let next: HouseProject = {
    ...project,
    objectTypes: project.objectTypes.map((item) => item.id === typeId ? { ...item, properties: { ...item.properties, ...properties } } : item),
  };
  const patch = Object.fromEntries(Object.entries(properties).filter((entry): entry is [string, string | number] => typeof entry[1] === "string" || typeof entry[1] === "number"));
  for (const [id, instance] of Object.entries(next.objectInstances)) {
    if (instance.typeId === typeId) next = patchHouseObject(next, { kind: definition.kind, id }, patch);
  }
  return next;
}

/** Create model geometry from an actual canvas gesture instead of a form button. */
export function createHouseObjectFromGesture(
  project: HouseProject,
  tool: HouseCommandId,
  levelId: string,
  start: HouseDraftPoint,
  end: HouseDraftPoint = start,
  options: HousePlacementOptions = {},
): HouseCommandMutation {
  const level = project.levels.find((item) => item.id === levelId) ?? project.levels[0];
  if (!level) return { project, selections: [], blocked: ["Create a level first"] };
  const width = Math.max(1, options.width ?? 600);
  const depth = Math.max(1, options.depth ?? 600);
  const height = Math.max(1, options.height ?? level.floorToFloorHeight);
  const wallThickness = Math.max(1, options.wallThickness ?? (tool === "room-separator" ? 25 : tool === "structural-wall" ? 200 : 120));
  const lineLength = Math.hypot(end.x - start.x, end.y - start.y);
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const id = `${tool}:${crypto.randomUUID()}`;
  let next = project;
  let selection: HouseSelection | null = null;

  if (["wall", "structural-wall", "room-separator"].includes(tool)) {
    if (lineLength < 50) return { project, selections: [], blocked: ["Wall length must be at least 50 mm"] };
    const sourceWallId = `interior-${crypto.randomUUID()}`;
    const objectId = wallObjectId(level.id, sourceWallId);
    const material = tool === "structural-wall" ? "Reinforced concrete" : tool === "room-separator" ? "Room separator" : options.material ?? "Masonry";
    next = {
      ...next,
      walls: [...next.walls, { id: objectId, sourceWallId, levelId: level.id, roomId: next.rooms.find((item) => item.levelId === level.id)?.id ?? `${level.id}:room-1`, start, end, thickness: wallThickness, height, material }],
      levels: next.levels.map((item) => item.id === level.id && item.plan ? { ...item, plan: { ...item.plan, interiorWalls: [...(item.plan.interiorWalls ?? []), { id: sourceWallId, start, end, thickness: wallThickness, height, label: tool === "room-separator" ? "Room separator" : tool === "structural-wall" ? "Structural wall" : "Interior wall" }] } } : item),
    };
    selection = { kind: "wall", id: objectId };
  } else if (tool === "door" || tool === "window" || tool === "opening") {
    const wall = nearestWall(next, level.id, start);
    if (!wall?.sourceWallId || !level.plan) return { project, selections: [], blocked: ["Tap a wall to place the opening"] };
    const kind = tool === "window" ? "window" as const : "door" as const;
    const planKind = tool === "opening" ? "passage" as const : kind;
    const sourceOpeningId = `${planKind}-${crypto.randomUUID()}`;
    const objectId = openingObjectId(level.id, planKind, sourceOpeningId);
    const openingWidth = Math.min(width || (kind === "door" ? 900 : 1200), Math.max(200, Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) - 100));
    const openingHeight = options.height ?? (kind === "door" ? 2100 : 1500);
    const sillHeight = kind === "door" ? 0 : Math.max(0, options.sillHeight ?? 900);
    const offset = wallOffsetAtPoint(wall, start, openingWidth);
    const opening: HouseProject["doors"][number] = { id: objectId, sourceOpeningId, levelId: level.id, wallId: wall.id, width: openingWidth, height: openingHeight, sillHeight, offset, type: planKind, style: tool === "opening" ? "open" : "standard", material: kind === "door" ? "Timber" : "Aluminium", swing: tool === "door" ? "in-right" : "none" };
    next = {
      ...next,
      doors: kind === "door" ? [...next.doors, opening] : next.doors,
      windows: kind === "window" ? [...next.windows, opening] : next.windows,
      levels: next.levels.map((item) => item.id === level.id && item.plan ? { ...item, plan: { ...item.plan, openings: [...item.plan.openings, { id: sourceOpeningId, kind: planKind, wallId: wall.sourceWallId!, offset, width: openingWidth, height: openingHeight, sill: sillHeight, swing: tool === "door" ? "in-right" as const : "none" as const, label: tool }] } } : item),
    };
    selection = { kind, id: objectId };
  } else if (tool === "column") {
    next = { ...next, structuralColumns: [...next.structuralColumns, { id, levelId: level.id, x: start.x, y: start.y, elevation: level.elevation, width, depth, height, type: "rectangular", material: "Reinforced concrete" }] };
    selection = { kind: "column", id };
  } else if (tool === "beam") {
    if (lineLength < 50) return { project, selections: [], blocked: ["Beam length must be at least 50 mm"] };
    next = { ...next, structuralBeams: [...next.structuralBeams, { id, levelId: level.id, start, end, elevation: level.elevation + level.floorToFloorHeight, width, depth, material: "Reinforced concrete" }] };
    selection = { kind: "beam", id };
  } else if (tool === "railing") {
    if (lineLength < 50) return { project, selections: [], blocked: ["Railing length must be at least 50 mm"] };
    next = { ...next, railings: [...next.railings, { id, levelId: level.id, hostId: null, start, end, elevation: level.elevation, height: options.height ?? 1050, material: "Steel" }] };
    selection = { kind: "railing", id };
  } else if (tool === "grid") {
    if (lineLength < 50) return { project, selections: [], blocked: ["Draw the grid line between two points"] };
    const axis = Math.abs(end.x - start.x) <= Math.abs(end.y - start.y) ? "x" as const : "y" as const;
    next = { ...next, structuralGrid: [...next.structuralGrid, { id, levelId: level.id, axis, label: String(next.structuralGrid.length + 1), position: axis === "x" ? midpoint.x : midpoint.y, start, end }] };
    selection = { kind: "grid", id };
  } else if (tool === "reference-plane") {
    if (lineLength < 50) return { project, selections: [], blocked: ["Draw the reference plane between two points"] };
    next = { ...next, referencePlanes: [...next.referencePlanes, { id, levelId: level.id, name: `Reference Plane ${next.referencePlanes.length + 1}`, start, end }] };
    selection = { kind: "reference-plane", id };
  } else if (["dimension", "text", "room-tag", "tag", "section", "elevation"].includes(tool)) {
    const annotationKind = tool === "room-tag" ? "tag" : tool as "dimension" | "text" | "tag" | "section" | "elevation";
    const value = tool === "dimension" ? lineLength : null;
    const text = tool === "dimension" ? `${lineLength.toFixed(1)} mm` : houseCommand(tool).label;
    next = { ...next, annotations: [...next.annotations, { id, levelId: level.id, kind: annotationKind, text, start, end: lineLength >= 1 ? end : null, value }] };
    if (tool === "section" || tool === "elevation") next = { ...next, views: [...next.views, { id: `view:${tool}:${crypto.randomUUID()}`, name: `${houseCommand(tool).label} ${next.views.filter((item) => item.kind === tool).length + 1}`, kind: tool, levelId: level.id, hiddenCategories: [], temporaryHiddenIds: [], isolatedIds: [], cutPlane: 1200, topOffset: 2300, bottomOffset: 0 }] };
    selection = { kind: "annotation", id };
  } else if (["foundation", "isolated-footing", "strip-footing", "foundation-slab"].includes(tool)) {
    const strip = tool === "strip-footing" && lineLength >= 50;
    const foundationThickness = options.height && options.height <= 1200 ? Math.max(150, options.height) : 450;
    next = { ...next, foundations: [...next.foundations, { id, levelId: level.id, x: strip ? midpoint.x : start.x, y: strip ? midpoint.y : start.y, elevation: level.elevation - foundationThickness, width: strip ? Math.max(width, Math.abs(end.x - start.x)) : width, depth: strip ? Math.max(width, Math.abs(end.y - start.y)) : depth, thickness: foundationThickness, material: "Reinforced concrete" }] };
    selection = { kind: "foundation", id };
  } else if (["component", "furniture", "kitchen", "wardrobe", "plumbing-fixture"].includes(tool)) {
    const name = options.name?.trim() || ({ component: "Generic Component", furniture: "Furniture", kitchen: "Kitchen Unit", wardrobe: "Wardrobe", "plumbing-fixture": "Plumbing Fixture" } as Record<string, string>)[tool]!;
    next = { ...next, components: [...next.components, { id, levelId: level.id, family: name, name, x: start.x, y: start.y, elevation: level.elevation, width, depth, height, rotation: 0, material: options.material ?? (tool === "wardrobe" || tool === "kitchen" ? "MDF" : "Generic"), source: tool === "wardrobe" || tool === "kitchen" ? "berchuma" : "library" }] };
    selection = { kind: "component", id };
  } else if (tool === "stair") {
    next = { ...next, stairs: [...next.stairs, { id, levelId: level.id, x: start.x, y: start.y, elevation: level.elevation, width, length: Math.max(depth, 1000), height, rotation: 0, steps: Math.max(3, Math.min(40, Math.round(height / 175))), type: "straight", material: "Reinforced concrete" }] };
    selection = { kind: "stair", id };
  } else if (tool === "room") {
    const zoneId = `zone-${crypto.randomUUID()}`;
    const boundary = rectangleAt(start, Math.max(width, 1000), Math.max(depth, 1000));
    const roomId = `${level.id}:${zoneId}`;
    next = {
      ...next,
      rooms: [...next.rooms, { id: roomId, levelId: level.id, name: `Room ${next.rooms.filter((item) => item.levelId === level.id).length + 1}`, boundary, floorMaterial: "Unspecified", wallMaterial: "Paint", ceilingMaterial: "Gypsum board", ceilingHeight: level.plan?.ceilingHeight ?? height }],
      levels: next.levels.map((item) => item.id === level.id && item.plan ? { ...item, plan: { ...item.plan, zones: [...(item.plan.zones ?? []), { id: zoneId, name: `Room ${(item.plan.zones?.length ?? 0) + 1}`, boundary, floorMaterial: "Unspecified", wallMaterial: "Paint", ceilingMaterial: "Gypsum board" }] } } : item),
    };
    selection = { kind: "room", id: roomId };
  } else if (tool === "level") {
    const elevation = Math.max(...project.levels.map((item) => item.elevation + item.floorToFloorHeight));
    const levelIdNew = `level-${crypto.randomUUID()}`;
    next = { ...next, levels: [...next.levels, { id: levelIdNew, name: `Level ${next.levels.length + 1}`, elevation, floorToFloorHeight: level.floorToFloorHeight, plan: level.plan ? structuredClone(level.plan) : null }], views: [...next.views, { id: `view:plan:${levelIdNew}`, name: `Level ${next.levels.length + 1}`, kind: "floor-plan", levelId: levelIdNew, hiddenCategories: [], temporaryHiddenIds: [], isolatedIds: [], cutPlane: 1200, topOffset: 2300, bottomOffset: 0 }] };
    selection = { kind: "level", id: levelIdNew };
  } else if (["floor", "structural-slab", "ceiling", "roof"].includes(tool)) {
    return coverRoomAt(project, level.id, tool === "roof" ? "roof" : tool === "ceiling" ? "ceiling" : "slab", start);
  } else {
    return { project, selections: [], blocked: [`${houseCommand(tool).label} is not available in this view`] };
  }

  if (!selection) return { project: next, selections: [], blocked: [] };
  next = { ...next, objectInstances: { ...next.objectInstances, [selection.id]: { ...emptyInstance(), typeId: defaultType(selection.kind), mark: `${selection.kind.slice(0, 2).toUpperCase()}-${allHouseSelections(next).length}` } } };
  return { project: next, selections: [selection], blocked: [] };
}

export function createDefaultHouseObject(project: HouseProject, kind: HouseObjectKind, levelId: string): HouseCommandMutation {
  const level = project.levels.find((item) => item.id === levelId) ?? project.levels[0];
  if (!level) return { project, selections: [], blocked: ["Create a level first"] };
  const bounds = level.plan ? boundsOf(level.plan.corners) : { minX: 0, minY: 0, maxX: 8000, maxY: 6000 };
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const id = `${kind}:${crypto.randomUUID()}`;
  let next = project;
  let selection: HouseSelection | null = { kind, id };
  switch (kind) {
    case "wall": {
      const sourceId = `interior-${crypto.randomUUID()}`;
      const start = { x: cx - 1500, y: cy };
      const end = { x: cx + 1500, y: cy };
      const wallId = wallObjectId(level.id, sourceId);
      next = {
        ...next,
        walls: [...next.walls, { id: wallId, sourceWallId: sourceId, levelId: level.id, roomId: next.rooms.find((item) => item.levelId === level.id)?.id ?? `${level.id}:room-1`, start, end, thickness: 120, height: level.plan?.ceilingHeight ?? 2700, material: "Masonry" }],
        levels: next.levels.map((item) => item.id === level.id && item.plan ? { ...item, plan: { ...item.plan, interiorWalls: [...(item.plan.interiorWalls ?? []), { id: sourceId, start, end, thickness: 120, height: item.plan.ceilingHeight, label: "Interior wall" }] } } : item),
      };
      selection = { kind, id: wallId };
      break;
    }
    case "door":
    case "window": {
      const wall = next.walls.find((item) => item.levelId === level.id && item.sourceWallId);
      if (!wall?.sourceWallId || !level.plan) return { project, selections: [], blocked: ["Place a wall before an opening"] };
      const sourceId = `${kind}-${crypto.randomUUID()}`;
      const objectId = openingObjectId(level.id, kind, sourceId);
      const width = kind === "door" ? 900 : 1200;
      const height = kind === "door" ? 2100 : 1500;
      const sill = kind === "door" ? 0 : 900;
      const opening = { id: objectId, sourceOpeningId: sourceId, levelId: level.id, wallId: wall.id, width, height, sillHeight: sill, offset: 300, type: kind, style: "standard", material: kind === "door" ? "Timber" : "Aluminium", swing: kind === "door" ? "in-right" : "none" };
      next = {
        ...next,
        doors: kind === "door" ? [...next.doors, opening] : next.doors,
        windows: kind === "window" ? [...next.windows, opening] : next.windows,
        levels: next.levels.map((item) => item.id === level.id && item.plan ? { ...item, plan: { ...item.plan, openings: [...item.plan.openings, { id: sourceId, kind, wallId: wall.sourceWallId!, offset: 300, width, height, sill, swing: kind === "door" ? "in-right" as const : "none" as const, label: kind }] } } : item),
      };
      selection = { kind, id: objectId };
      break;
    }
    case "column":
      next = { ...next, structuralColumns: [...next.structuralColumns, { id, levelId: level.id, x: cx, y: cy, elevation: level.elevation, width: 300, depth: 300, height: level.floorToFloorHeight, type: "rectangular", material: "Reinforced concrete" }] };
      break;
    case "grid": {
      const vertical = next.structuralGrid.filter((item) => item.levelId === level.id && item.axis === "x").length <= next.structuralGrid.filter((item) => item.levelId === level.id && item.axis === "y").length;
      next = { ...next, structuralGrid: [...next.structuralGrid, { id, levelId: level.id, axis: vertical ? "x" : "y", label: String(next.structuralGrid.length + 1), position: vertical ? cx : cy, start: vertical ? { x: cx, y: bounds.minY - 500 } : { x: bounds.minX - 500, y: cy }, end: vertical ? { x: cx, y: bounds.maxY + 500 } : { x: bounds.maxX + 500, y: cy } }] };
      break;
    }
    case "stair":
      next = { ...next, stairs: [...next.stairs, { id, levelId: level.id, x: cx, y: cy, elevation: level.elevation, width: 1000, length: 3000, height: level.floorToFloorHeight, rotation: 0, steps: Math.max(12, Math.round(level.floorToFloorHeight / 175)), type: "straight", material: "Reinforced concrete" }] };
      break;
    case "slab":
      if (!level.plan) return { project, selections: [], blocked: ["A floor needs a closed level boundary"] };
      next = { ...next, slabs: [...next.slabs, { id, levelId: level.id, boundary: level.plan.corners.map((point) => ({ x: point.x, y: point.y })), thickness: 150, elevation: level.elevation, material: "Reinforced concrete" }] };
      break;
    case "ceiling": {
      const room = next.rooms.find((item) => item.levelId === level.id);
      if (!room) return { project, selections: [], blocked: ["A ceiling needs a room boundary"] };
      next = { ...next, ceilings: [...next.ceilings, { id, levelId: level.id, roomId: room.id, boundary: room.boundary.map((point) => ({ ...point })), elevation: level.elevation + room.ceilingHeight, thickness: 12.5, material: "Gypsum board" }] };
      break;
    }
    case "roof":
      if (!level.plan) return { project, selections: [], blocked: ["A roof needs a closed level boundary"] };
      next = { ...next, roofs: [...next.roofs, { id, levelId: level.id, boundary: level.plan.corners.map((point) => ({ ...point })), elevation: level.elevation + level.plan.ceilingHeight, type: "flat", height: 300, slope: 0, overhang: 400, thickness: 180, material: "Reinforced concrete" }] };
      break;
    case "foundation":
      next = { ...next, foundations: [...next.foundations, { id, levelId: level.id, x: cx, y: cy, elevation: level.elevation - 450, width: 1200, depth: 1200, thickness: 450, material: "Reinforced concrete" }] };
      break;
    case "reference-plane":
      next = { ...next, referencePlanes: [...next.referencePlanes, { id, levelId: level.id, name: `Reference Plane ${next.referencePlanes.length + 1}`, start: { x: bounds.minX, y: cy }, end: { x: bounds.maxX, y: cy } }] };
      break;
    case "railing":
      next = { ...next, railings: [...next.railings, { id, levelId: level.id, hostId: null, start: { x: cx - 1000, y: cy }, end: { x: cx + 1000, y: cy }, elevation: level.elevation, height: 1050, material: "Steel" }] };
      break;
    case "component":
      next = { ...next, components: [...next.components, { id, levelId: level.id, family: "Generic Model", name: "Generic Component", x: cx, y: cy, elevation: level.elevation, width: 600, depth: 600, height: 800, rotation: 0, material: "MDF", source: "library" }] };
      selection = { kind: "component", id };
      break;
    case "annotation":
      next = { ...next, annotations: [...next.annotations, { id, levelId: level.id, kind: "dimension", text: "2000 mm", start: { x: cx - 1000, y: cy }, end: { x: cx + 1000, y: cy }, value: 2000 }] };
      selection = { kind: "annotation", id };
      break;
    default:
      return { project, selections: [], blocked: [`${kind} uses its boundary editor or existing generator`] };
  }
  if (!selection) return { project, selections: [], blocked: [] };
  next = { ...next, objectInstances: { ...next.objectInstances, [selection.id]: { ...emptyInstance(), typeId: defaultType(kind), mark: `${kind.slice(0, 2).toUpperCase()}-${allHouseSelections(next).length}` } } };
  return { project: next, selections: [selection], blocked: [] };
}

function duplicateOne(project: HouseProject, selection: HouseSelection, offset: number): { project: HouseProject; selection: HouseSelection | null } {
  const id = `${selection.kind}:${crypto.randomUUID()}`;
  const copyInstance = (next: HouseProject, copiedId: string) => ({ ...next, objectInstances: { ...next.objectInstances, [copiedId]: { ...(project.objectInstances[selection.id] ?? emptyInstance()), mark: `${project.objectInstances[selection.id]?.mark ?? selection.kind} copy`, groupId: null } } });
  if (selection.kind === "wall") {
    const item = project.walls.find((entry) => entry.id === selection.id);
    if (!item) return { project, selection: null };
    const sourceWallId = `interior-${crypto.randomUUID()}`;
    const objectId = wallObjectId(item.levelId, sourceWallId);
    const start = { x: item.start.x + offset, y: item.start.y + offset };
    const end = { x: item.end.x + offset, y: item.end.y + offset };
    const copy = { ...structuredClone(item), id: objectId, sourceWallId, start, end };
    const next = {
      ...project,
      walls: [...project.walls, copy],
      levels: project.levels.map((level) => level.id === item.levelId && level.plan ? { ...level, plan: { ...level.plan, interiorWalls: [...(level.plan.interiorWalls ?? []), { id: sourceWallId, start, end, thickness: item.thickness, height: item.height, label: "Copied wall" }] } } : level),
    };
    return { project: copyInstance(next, objectId), selection: { kind: "wall", id: objectId } };
  }
  if (selection.kind === "door" || selection.kind === "window") {
    const key = selection.kind === "door" ? "doors" : "windows";
    const item = project[key].find((entry) => entry.id === selection.id);
    if (!item) return { project, selection: null };
    const sourceOpeningId = `${selection.kind}-${crypto.randomUUID()}`;
    const objectId = openingObjectId(item.levelId, selection.kind, sourceOpeningId);
    const copy = { ...structuredClone(item), id: objectId, sourceOpeningId, offset: item.offset + Math.max(50, item.width) };
    const wall = project.walls.find((entry) => entry.id === item.wallId);
    const next = {
      ...project,
      [key]: [...project[key], copy],
      levels: wall?.sourceWallId ? project.levels.map((level) => level.id === item.levelId && level.plan ? { ...level, plan: { ...level.plan, openings: [...level.plan.openings, { id: sourceOpeningId, kind: selection.kind, wallId: wall.sourceWallId!, offset: copy.offset, width: copy.width, height: copy.height, sill: copy.sillHeight, swing: copy.swing as "in-left" | "in-right" | "out-left" | "out-right" | "none", label: selection.kind }] } } : level) : project.levels,
    } as HouseProject;
    return { project: copyInstance(next, objectId), selection: { kind: selection.kind, id: objectId } };
  }
  const key = simpleCollectionKey(selection.kind);
  if (!key) return { project, selection: null };
  const list = project[key] as Array<Record<string, unknown> & { id: string }>;
  const source = list.find((item) => item.id === selection.id);
  if (!source) return { project, selection: null };
  const copy = offsetObject(structuredClone(source), id, offset);
  const next = { ...project, [key]: [...list, copy] } as HouseProject;
  return { project: copyInstance(next, id), selection: { kind: selection.kind, id } };
}

function removeSimpleObject(project: HouseProject, selection: HouseSelection): HouseProject {
  if (selection.kind === "site") return { ...project, site: null, objectInstances: omitKeys(project.objectInstances, [selection.id]) };
  const key = simpleCollectionKey(selection.kind);
  if (!key) return project;
  const list = project[key] as Array<{ id: string }>;
  return { ...project, [key]: list.filter((item) => item.id !== selection.id), objectInstances: omitKeys(project.objectInstances, [selection.id]) } as HouseProject;
}

function moveSimpleObject(project: HouseProject, selection: HouseSelection, dx: number, dy: number): HouseProject {
  if (["stair", "column", "balcony", "veranda", "foundation", "component"].includes(selection.kind)) {
    return patchHouseObject(project, selection, { x: numberField(project, selection, "x") + dx, y: numberField(project, selection, "y") + dy });
  }
  if (selection.kind === "grid") {
    const item = project.structuralGrid.find((entry) => entry.id === selection.id);
    return item ? patchHouseObject(project, selection, { position: item.position + (item.axis === "x" ? dx : dy) }) : project;
  }
  if (["beam", "grid", "railing", "reference-plane", "annotation"].includes(selection.kind)) {
    const item = findObject(project, selection) as { start?: { x: number; y: number }; end?: { x: number; y: number } | null } | null;
    if (!item?.start) return project;
    return patchHouseObject(project, selection, { startX: item.start.x + dx, startY: item.start.y + dy, ...(item.end ? { endX: item.end.x + dx, endY: item.end.y + dy } : {}) });
  }
  if (["slab", "roof", "ceiling", "room"].includes(selection.kind)) {
    const key = selection.kind === "room" ? "rooms" : `${selection.kind}s` as "slabs" | "roofs" | "ceilings";
    const list = project[key] as Array<{ id: string; boundary: { x: number; y: number }[] }>;
    return { ...project, [key]: list.map((item) => item.id === selection.id ? { ...item, boundary: item.boundary.map((point) => ({ x: point.x + dx, y: point.y + dy })) } : item) } as HouseProject;
  }
  return project;
}

function rotationCollection(project: HouseProject, kind: HouseObjectKind) {
  const key = (["stair", "balcony", "veranda", "component"] as HouseObjectKind[]).includes(kind) ? simpleCollectionKey(kind) : null;
  if (!key) return null;
  return (map: (item: { id: string; rotation: number }) => { id: string; rotation: number }) => ({ ...project, [key]: (project[key] as Array<{ id: string; rotation: number }>).map(map) } as HouseProject);
}

function simpleCollectionKey(kind: HouseObjectKind): keyof HouseProject | null {
  const keys: Partial<Record<HouseObjectKind, keyof HouseProject>> = {
    stair: "stairs", slab: "slabs", roof: "roofs", column: "structuralColumns", beam: "structuralBeams", grid: "structuralGrid", facade: "facadeElements", balcony: "balconies", veranda: "verandas", ceiling: "ceilings", foundation: "foundations", railing: "railings", "reference-plane": "referencePlanes", annotation: "annotations", component: "components",
  };
  return keys[kind] ?? null;
}

function findObject(project: HouseProject, selection: HouseSelection): unknown {
  if (selection.kind === "site") return project.site?.id === selection.id ? project.site : null;
  if (selection.kind === "level") return project.levels.find((item) => item.id === selection.id);
  if (selection.kind === "room") return project.rooms.find((item) => item.id === selection.id);
  if (selection.kind === "wall") return project.walls.find((item) => item.id === selection.id);
  if (selection.kind === "door" || selection.kind === "window") return project[`${selection.kind}s`].find((item) => item.id === selection.id);
  const key = simpleCollectionKey(selection.kind);
  return key ? (project[key] as Array<{ id: string }>).find((item) => item.id === selection.id) : null;
}

function objectAnchor(project: HouseProject, selection: HouseSelection): { x: number; y: number } | null {
  const object = findObject(project, selection) as { x?: unknown; y?: unknown; start?: PointLike; end?: PointLike; boundary?: PointLike[] } | null;
  if (!object) return null;
  if (typeof object.x === "number" && typeof object.y === "number") return { x: object.x, y: object.y };
  if (object.start && object.end) return { x: (object.start.x + object.end.x) / 2, y: (object.start.y + object.end.y) / 2 };
  if (object.boundary?.length) return { x: object.boundary.reduce((sum, point) => sum + point.x, 0) / object.boundary.length, y: object.boundary.reduce((sum, point) => sum + point.y, 0) / object.boundary.length };
  return null;
}

type PointLike = { x: number; y: number };

function numberField(project: HouseProject, selection: HouseSelection, field: string): number {
  const item = findObject(project, selection) as Record<string, unknown> | null;
  return typeof item?.[field] === "number" ? item[field] : 0;
}

function offsetObject<T extends Record<string, unknown>>(item: T, id: string, offset: number): T {
  const result: Record<string, unknown> = { ...item, id };
  if (typeof result.x === "number") result.x += offset;
  if (typeof result.y === "number") result.y += offset;
  if (result.start && typeof result.start === "object") result.start = offsetPoint(result.start as { x: number; y: number }, offset);
  if (result.end && typeof result.end === "object") result.end = offsetPoint(result.end as { x: number; y: number }, offset);
  if (Array.isArray(result.boundary)) result.boundary = (result.boundary as { x: number; y: number }[]).map((point) => offsetPoint(point, offset));
  return result as T;
}

function offsetPoint(point: { x: number; y: number }, value: number) { return { x: point.x + value, y: point.y + value }; }
/**
 * Floor, ceiling or roof for the room under the finger. These tools used to
 * ignore where you tapped and lay a copy of the whole footprint on top of
 * the one already there; now they cover the room you point at, and say so
 * when something already covers it.
 */
export function coverRoomAt(project: HouseProject, levelId: string, kind: "slab" | "ceiling" | "roof", point: HouseDraftPoint): HouseCommandMutation {
  const level = project.levels.find((item) => item.id === levelId);
  const what = kind === "slab" ? "floor" : kind;
  if (!level) return { project, selections: [], blocked: ["Create a level first"] };
  const room = project.rooms
    .filter((item) => item.levelId === levelId && insidePolygon(point, item.boundary))
    .sort((a, b) => Math.abs(polygonArea(a.boundary)) - Math.abs(polygonArea(b.boundary)))[0];
  if (!room) return { project, selections: [], blocked: [`Tap inside a room to give it a ${what}`] };
  const covers = (boundary: readonly HouseDraftPoint[]) => room.boundary.every((corner) => onOrInsidePolygon(corner, boundary));
  const existing = kind === "slab" ? project.slabs.filter((item) => item.levelId === levelId)
    : kind === "ceiling" ? project.ceilings.filter((item) => item.levelId === levelId)
      : project.roofs.filter((item) => item.levelId === levelId);
  if (existing.some((item) => covers(item.boundary))) {
    return { project, selections: [], blocked: [kind === "roof" ? `${room.name} is already under a roof` : `${room.name} already has a ${what}`] };
  }
  const id = `${kind}:${crypto.randomUUID()}`;
  const boundary = room.boundary.map((corner) => ({ x: corner.x, y: corner.y }));
  const ceilingHeight = room.ceilingHeight || level.plan?.ceilingHeight || level.floorToFloorHeight;
  if (kind === "slab") {
    return { project: { ...project, slabs: [...project.slabs, { id, levelId, boundary, thickness: 150, elevation: level.elevation, material: "Reinforced concrete" }] }, selections: [{ kind: "slab", id }], blocked: [] };
  }
  if (kind === "ceiling") {
    return { project: { ...project, ceilings: [...project.ceilings, { id, levelId, roomId: room.id, boundary, elevation: level.elevation + ceilingHeight, thickness: 12.5, material: "Gypsum board" }] }, selections: [{ kind: "ceiling", id }], blocked: [] };
  }
  return { project: { ...project, roofs: [...project.roofs, { id, levelId, boundary, elevation: level.elevation + ceilingHeight, type: "flat", height: 300, slope: 0, overhang: 400, thickness: 180, material: "Reinforced concrete" }] }, selections: [{ kind: "roof", id }], blocked: [] };
}

function insidePolygon(point: HouseDraftPoint, polygon: readonly HouseDraftPoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index]!;
    const b = polygon[previous]!;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Inside, or on an edge: a room drawn against the outside wall shares its
 * edges with the footprint, and the slab under the footprint still covers it. */
function onOrInsidePolygon(point: HouseDraftPoint, polygon: readonly HouseDraftPoint[]) {
  return insidePolygon(point, polygon) || polygon.some((corner, index) => pointSegmentDistance(point, corner, polygon[(index + 1) % polygon.length]!) <= 1);
}

function polygonArea(points: readonly HouseDraftPoint[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) { const a = points[index]!; const b = points[(index + 1) % points.length]!; sum += a.x * b.y - b.x * a.y; }
  return sum / 2;
}

export type HouseRoomShape = "rectangle" | "l-shape";

/** The outline a room drag describes: start and end are opposite corners. An
 * L-shape gives up the quarter at the end corner, so you drag from the
 * elbow's outside toward the notch. */
export function roomOutline(shape: HouseRoomShape, start: HouseDraftPoint, end: HouseDraftPoint): HouseDraftPoint[] {
  if (shape === "l-shape") {
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    return [start, { x: end.x, y: start.y }, { x: end.x, y: mid.y }, mid, { x: mid.x, y: end.y }, { x: start.x, y: end.y }];
  }
  return [start, { x: end.x, y: start.y }, end, { x: start.x, y: end.y }];
}

/**
 * Room-first drawing: walls round the outline plus the room itself, in one
 * undoable step. An edge already lying along an existing wall — the house's
 * outside wall, or the room next door — reuses that wall instead of getting a
 * second one drawn on top of it.
 */
export function createRoomFromGesture(
  project: HouseProject,
  levelId: string,
  start: HouseDraftPoint,
  end: HouseDraftPoint,
  shape: HouseRoomShape,
  options: HousePlacementOptions = {},
): HouseCommandMutation {
  const level = project.levels.find((item) => item.id === levelId);
  if (!level?.plan) return { project, selections: [], blocked: ["Create a level first"] };
  if (Math.abs(end.x - start.x) < 500 || Math.abs(end.y - start.y) < 500) {
    return { project, selections: [], blocked: ["Drag out the room — at least 500 mm each way"] };
  }
  const boundary = roomOutline(shape, start, end);
  let next = project;
  const created: HouseSelection[] = [];
  boundary.forEach((corner, index) => {
    const following = boundary[(index + 1) % boundary.length]!;
    const covered = project.walls.some((wall) => wall.levelId === levelId
      && pointSegmentDistance(corner, wall.start, wall.end) <= wall.thickness / 2 + 20
      && pointSegmentDistance(following, wall.start, wall.end) <= wall.thickness / 2 + 20);
    if (covered) return;
    const result = createHouseObjectFromGesture(next, "wall", levelId, corner, following, options);
    next = result.project;
    created.push(...result.selections);
  });
  const zoneId = `zone-${crypto.randomUUID()}`;
  const roomId = `${level.id}:${zoneId}`;
  const name = `Room ${next.rooms.filter((item) => item.levelId === level.id).length + 1}`;
  next = {
    ...next,
    rooms: [...next.rooms, { id: roomId, levelId: level.id, name, boundary, floorMaterial: "Unspecified", wallMaterial: "Paint", ceilingMaterial: "Gypsum board", ceilingHeight: level.plan.ceilingHeight ?? level.floorToFloorHeight }],
    levels: next.levels.map((item) => item.id === level.id && item.plan ? { ...item, plan: { ...item.plan, zones: [...(item.plan.zones ?? []), { id: zoneId, name, boundary, floorMaterial: "Unspecified", wallMaterial: "Paint", ceilingMaterial: "Gypsum board" }] } } : item),
  };
  return { project: next, selections: [{ kind: "room", id: roomId }, ...created], blocked: [] };
}

function rectangleAt(point: HouseDraftPoint, width: number, depth: number) {
  return [
    { x: point.x - width / 2, y: point.y - depth / 2 },
    { x: point.x + width / 2, y: point.y - depth / 2 },
    { x: point.x + width / 2, y: point.y + depth / 2 },
    { x: point.x - width / 2, y: point.y + depth / 2 },
  ];
}
function nearestWall(project: HouseProject, levelId: string, point: HouseDraftPoint): HouseProject["walls"][number] | null {
  let closest: HouseProject["walls"][number] | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const wall of project.walls.filter((item) => item.levelId === levelId)) {
    const candidate = pointSegmentDistance(point, wall.start, wall.end);
    if (candidate < distance) { closest = wall; distance = candidate; }
  }
  return closest;
}
function wallOffsetAtPoint(wall: HouseProject["walls"][number], point: HouseDraftPoint, openingWidth: number) {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const centre = ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / length;
  return Math.max(0, Math.min(length - openingWidth, centre - openingWidth / 2));
}
function pointSegmentDistance(point: HouseDraftPoint, start: HouseDraftPoint, end: HouseDraftPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}
function emptyInstance(): HouseProject["objectInstances"][string] { return { typeId: null, mark: "", pinned: false, groupId: null, flipped: false, properties: {} }; }
function omitKeys<T>(record: Record<string, T>, keys: string[]) { const next = { ...record }; keys.forEach((key) => delete next[key]); return next; }
function normalizeAngle(value: number) { return ((value % 360) + 360) % 360; }
function defaultType(kind: HouseObjectKind) { return ({ wall: "wall-interior-120", door: "door-single-900x2100", window: "window-sliding-1200x1500", column: "column-300x300", beam: "beam-250x450", slab: "slab-150", roof: "roof-flat-180" } as Partial<Record<HouseObjectKind, string>>)[kind] ?? null; }
function boundsOf(points: { x: number; y: number }[]) { const xs = points.map((point) => point.x); const ys = points.map((point) => point.y); return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }; }

export function selectionsEqual(a: readonly HouseSelection[], b: readonly HouseSelection[]) {
  return a.length === b.length && a.every((item, index) => !!b[index] && sameSelection(item, b[index]!));
}
