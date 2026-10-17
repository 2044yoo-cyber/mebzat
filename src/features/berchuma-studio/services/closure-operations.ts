import type { ClosurePanelSettings, DesignSpec, DoorHardware, FingerPull, FrontGrip } from "../types/spec";

/**
 * The edits behind the door-hardware and Smart Closure Panels controls.
 *
 * Each returns a new spec and changes nothing else: a grip is a setting on
 * the design (or on a cabinet's bays), a closure panel's state is an entry
 * under its stable id. The geometry works out the rest on the next build, so
 * there is no second copy of a panel to keep in step.
 */

const HARDWARE_DEFAULT: DoorHardware = { grip: "handle", profile: {} };
const CLOSURE_DEFAULT: ClosurePanelSettings = { enabled: false, sizing: "auto", panels: [] };

/**
 * The grip every door has. Setting it for the design clears the cabinets'
 * own choices, so "every door" means every door.
 */
export function setDesignGrip(spec: DesignSpec, grip: FrontGrip): DesignSpec {
  return {
    ...spec,
    doorHardware: { ...(spec.doorHardware ?? HARDWARE_DEFAULT), grip },
    cabinets: spec.cabinets.map((cabinet) => ({ ...cabinet, bays: cabinet.bays.map(({ frontGrip: _drop, ...bay }) => { void _drop; return bay; }) })),
  };
}

/** The finger-pull profile's height or depth. A value left out goes back to the grip's default. */
export function setFingerPull(spec: DesignSpec, profile: FingerPull): DesignSpec {
  const current = spec.doorHardware ?? HARDWARE_DEFAULT;
  return { ...spec, doorHardware: { ...current, profile: { ...current.profile, ...profile } } };
}

/** One cabinet's grip, for all its doors; null follows the design again. */
export function setCabinetGrip(spec: DesignSpec, cabinetId: string, grip: FrontGrip | null): DesignSpec {
  return {
    ...spec,
    cabinets: spec.cabinets.map((cabinet) => cabinet.id !== cabinetId ? cabinet : {
      ...cabinet,
      bays: cabinet.bays.map((bay) => {
        if (grip !== null) return { ...bay, frontGrip: grip };
        const { frontGrip: _drop, ...rest } = bay;
        void _drop;
        return rest;
      }),
    }),
  };
}

/** The cabinet's grip if all its bays agree on one of their own, else null (the design's). */
export function cabinetGripOf(spec: DesignSpec, cabinetId: string): FrontGrip | null {
  const bays = spec.cabinets.find((cabinet) => cabinet.id === cabinetId)?.bays ?? [];
  const grips = new Set(bays.map((bay) => bay.frontGrip ?? null));
  return grips.size === 1 ? [...grips][0]! : null;
}

/** Smart Closure Panels on or off, the board, automatic or manual sizing. */
export function setClosureSettings(spec: DesignSpec, change: Partial<Omit<ClosurePanelSettings, "panels">>): DesignSpec {
  const current = spec.closurePanels ?? CLOSURE_DEFAULT;
  return { ...spec, closurePanels: { ...current, ...change } };
}

type PanelChange = { enabled?: boolean; hidden?: boolean; width?: number; height?: number };

/**
 * One panel switched off, hidden, or sized. Stored only as what differs from
 * the worked-out panel: an entry that says nothing is removed, so a design's
 * settings do not fill up with panels nobody touched.
 */
export function setClosurePanel(spec: DesignSpec, id: string, change: PanelChange): DesignSpec {
  const current = spec.closurePanels ?? CLOSURE_DEFAULT;
  const existing = current.panels.find((entry) => entry.id === id) ?? { id };
  const next = { ...existing, ...change };
  const meaningful = next.enabled === false || next.hidden === true || next.width !== undefined || next.height !== undefined;
  const panels = current.panels.filter((entry) => entry.id !== id);
  if (meaningful) panels.push(cleanEntry(next));
  // Typing a size means sizing by hand.
  const sizing = change.width !== undefined || change.height !== undefined ? "manual" : current.sizing;
  return { ...spec, closurePanels: { ...current, sizing, panels } };
}

/** Back to its worked-out size; switched on and shown are kept as they are. */
export function resetClosurePanelSize(spec: DesignSpec, id: string): DesignSpec {
  const current = spec.closurePanels ?? CLOSURE_DEFAULT;
  const entry = current.panels.find((panel) => panel.id === id);
  if (!entry) return spec;
  const { width: _w, height: _h, ...rest } = entry;
  void _w; void _h;
  const panels = current.panels.filter((panel) => panel.id !== id);
  if (rest.enabled === false || rest.hidden === true) panels.push(rest);
  return { ...spec, closurePanels: { ...current, panels } };
}

function cleanEntry(entry: PanelChange & { id: string }): ClosurePanelSettings["panels"][number] {
  return {
    id: entry.id,
    ...(entry.enabled === false ? { enabled: false } : {}),
    ...(entry.hidden === true ? { hidden: true } : {}),
    ...(entry.width !== undefined ? { width: Math.round(entry.width) } : {}),
    ...(entry.height !== undefined ? { height: Math.round(entry.height) } : {}),
  };
}
