export const houseCommandCategories = ["General", "Architecture", "Structure", "Modify", "Annotate", "View", "AI"] as const;
export type HouseCommandCategory = (typeof houseCommandCategories)[number];

export type HouseCommandId =
  | "select" | "delete" | "cancel" | "finish" | "undo" | "redo" | "save" | "save-as"
  | "copy" | "paste" | "cut" | "duplicate" | "select-all" | "cycle-selection" | "flip"
  | "wall" | "door" | "window" | "column" | "room" | "room-separator" | "floor" | "ceiling"
  | "roof" | "stair" | "railing" | "opening" | "component" | "furniture" | "kitchen"
  | "wardrobe" | "plumbing-fixture" | "move" | "rotate" | "align" | "offset" | "array"
  | "trim" | "split" | "join" | "unjoin" | "mirror-pick" | "mirror-draw" | "scale"
  | "pin" | "unpin" | "create-similar" | "match-type" | "group" | "ungroup"
  | "hide" | "isolate" | "reset-hide" | "visibility" | "zoom-fit" | "zoom-extents"
  | "default-3d" | "tile-views" | "dimension" | "text" | "room-tag" | "tag" | "section"
  | "elevation" | "grid" | "level" | "reference-plane" | "command-search" | "shortcut-help"
  | "ai-remodel" | "alternatives" | "estimate" | "boq";

export type HouseCommandDefinition = {
  id: HouseCommandId;
  label: string;
  category: HouseCommandCategory;
  shortcut?: string;
  selection?: boolean;
  tool?: boolean;
  description?: string;
};

const command = (id: HouseCommandId, label: string, category: HouseCommandCategory, shortcut?: string, selection = false, tool = false, description?: string): HouseCommandDefinition => ({ id, label, category, shortcut, selection, tool, description });

export const houseCommandRegistry: readonly HouseCommandDefinition[] = [
  command("select", "Select", "General", undefined, false, true),
  command("delete", "Delete", "General", "Delete", true),
  command("cancel", "Cancel / exit tool", "General", "Esc"),
  command("finish", "Finish action", "General", "Enter"),
  command("undo", "Undo", "General", "Ctrl+Z"),
  command("redo", "Redo", "General", "Ctrl+Y"),
  command("save", "Save", "General", "Ctrl+S"),
  command("save-as", "Save As", "General", "Ctrl+Shift+S"),
  command("copy", "Copy", "Modify", "Ctrl+C", true),
  command("paste", "Paste", "Modify", "Ctrl+V"),
  command("cut", "Cut", "Modify", "Ctrl+X", true),
  command("duplicate", "Duplicate", "Modify", "Ctrl+D", true),
  command("select-all", "Select all in view", "General", "Ctrl+A"),
  command("cycle-selection", "Cycle selection", "General", "Tab"),
  command("flip", "Flip orientation", "Modify", "Space", true),
  command("wall", "Wall", "Architecture", "WA", false, true),
  command("door", "Door", "Architecture", "DR", false, true),
  command("window", "Window", "Architecture", "WN", false, true),
  command("column", "Column", "Structure", "CL", false, true),
  command("room", "Room", "Architecture", "RM", false, true),
  command("room-separator", "Room Separator", "Architecture", "RS", false, true),
  command("floor", "Floor", "Architecture", "FL", false, true),
  command("ceiling", "Ceiling", "Architecture", "CE", false, true),
  command("roof", "Roof", "Architecture", "RF", false, true),
  command("stair", "Stair", "Architecture", "ST", false, true),
  command("railing", "Railing", "Architecture", "RA", false, true),
  command("opening", "Opening", "Architecture", "OP", false, true),
  command("component", "Component", "Architecture", "CM", false, true),
  command("furniture", "Furniture", "Architecture", "FU", false, true),
  command("kitchen", "Kitchen", "Architecture", "KT", false, true),
  command("wardrobe", "Wardrobe", "Architecture", "WD", false, true),
  command("plumbing-fixture", "Plumbing Fixture", "Architecture", "PF", false, true),
  command("move", "Move", "Modify", "MV", true, true),
  command("rotate", "Rotate 90°", "Modify", "RO", true),
  command("align", "Align", "Modify", "AL", true, true),
  command("offset", "Offset", "Modify", "OF", true),
  command("array", "Array", "Modify", "AR", true),
  command("trim", "Trim / Extend", "Modify", "TR", true, true),
  command("split", "Split", "Modify", "SL", true, true),
  command("join", "Join", "Modify", "JN", true),
  command("unjoin", "Unjoin", "Modify", "UJ", true),
  command("mirror-pick", "Mirror — Pick Axis", "Modify", "MM", true),
  command("mirror-draw", "Mirror — Draw Axis", "Modify", "DM", true, true),
  command("scale", "Scale", "Modify", "SC", true, true),
  command("pin", "Pin", "Modify", "PN", true),
  command("unpin", "Unpin", "Modify", "UP", true),
  command("create-similar", "Create Similar", "Modify", "CS", true),
  command("match-type", "Match Type / Properties", "Modify", "MA", true, true),
  command("group", "Group", "Modify", "GP", true),
  command("ungroup", "Ungroup", "Modify", "UG", true),
  command("hide", "Temporarily Hide", "View", "HH", true),
  command("isolate", "Temporarily Isolate", "View", "HI", true),
  command("reset-hide", "Reset Hide / Isolate", "View", "HR"),
  command("visibility", "Visibility / Graphics", "View", "VG"),
  command("zoom-fit", "Zoom Fit", "View", "ZF"),
  command("zoom-extents", "Zoom Extents", "View", "ZE"),
  command("default-3d", "Default 3D View", "View", "3D"),
  command("tile-views", "Tile Views", "View", "WT"),
  command("dimension", "Dimension", "Annotate", "DI", false, true),
  command("text", "Text", "Annotate", "TX", false, true),
  command("room-tag", "Room Tag", "Annotate", "RT", false, true),
  command("tag", "Tag", "Annotate", "TG", false, true),
  command("section", "Section", "Annotate", "SE", false, true),
  command("elevation", "Elevation", "Annotate", "EL", false, true),
  command("grid", "Grid", "Structure", "GR", false, true),
  command("level", "Level", "Structure", "LL", false, true),
  command("reference-plane", "Reference Plane", "Structure", "RP", false, true),
  command("command-search", "Command Search", "General", "Ctrl+K"),
  command("shortcut-help", "Keyboard Shortcuts", "General", "?"),
  command("ai-remodel", "Ask Medosha AI", "AI", undefined, true),
  command("alternatives", "Generate Alternatives", "AI", undefined, false),
  command("estimate", "Estimate Cost", "AI", undefined, true),
  command("boq", "Show in BOQ", "AI", undefined, true),
];

const byId = new Map(houseCommandRegistry.map((item) => [item.id, item]));
const byChord = new Map(houseCommandRegistry.filter((item) => item.shortcut && /^[A-Z0-9]{2}$/.test(item.shortcut)).map((item) => [item.shortcut!, item.id]));

export function houseCommand(id: HouseCommandId): HouseCommandDefinition {
  return byId.get(id)!;
}

export function commandFromChord(chord: string): HouseCommandId | null {
  return byChord.get(chord.toUpperCase()) ?? null;
}

export function commandFromKeyboard(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey">): HouseCommandId | null {
  const control = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (control && event.shiftKey && key === "s") return "save-as";
  if (control) {
    if (key === "z" && event.shiftKey) return "redo";
    if (key === "z") return "undo";
    if (key === "y") return "redo";
    if (key === "s") return "save";
    if (key === "c") return "copy";
    if (key === "v") return "paste";
    if (key === "x") return "cut";
    if (key === "d") return "duplicate";
    if (key === "a") return "select-all";
    if (key === "k") return "command-search";
    return null;
  }
  if (event.key === "Delete" || event.key === "Backspace") return "delete";
  if (event.key === "Escape") return "cancel";
  if (event.key === "Enter") return "finish";
  if (event.key === " ") return "flip";
  if (event.key === "Tab") return "cycle-selection";
  if (event.key === "?") return "shortcut-help";
  return null;
}

export function isModelTextInput(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

export function searchHouseCommands(query: string): HouseCommandDefinition[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...houseCommandRegistry];
  return houseCommandRegistry.filter((item) => `${item.label} ${item.category} ${item.shortcut ?? ""} ${item.description ?? ""}`.toLowerCase().includes(needle));
}
