import type { Cabinet } from "../types/spec";

/**
 * Moving the selected cabinet without dragging it.
 *
 * Dragging is the only way a cabinet could be moved, and dragging is bad at
 * two things. It cannot be precise — a 10 mm shadow gap between two cabinets
 * is not something a thumb can hit — and on a phone it competes with the
 * orbit gesture, so pushing a cabinet sideways swings the camera as often as
 * it moves anything.
 *
 * So: three pairs of buttons beside the model, and the arrow keys on a
 * desktop. Both go through here, which is the point of the module — the pad
 * and the keyboard agree about how far a step is and where a cabinet is
 * allowed to end up, because there is one answer and they both ask for it.
 *
 * Kept free of React and of the DOM so it can be called in a check.
 */

/** A step, in millimetres. Ten is the granularity the sliders already use. */
export const NUDGE_STEP = 10;

/** Shift: a bigger bite, for crossing a room rather than closing a gap. */
export const NUDGE_COARSE = 100;

/** Alt: one millimetre, for the last of it. */
export const NUDGE_FINE = 1;

export type Axis = "x" | "y" | "z";

/** Which way a pair of buttons or a pair of arrow keys points. */
export type Direction = 1 | -1;

export type Shortcut =
  | { kind: "move"; axis: Axis; direction: Direction }
  | { kind: "delete" }
  | { kind: "duplicate" }
  | { kind: "undo" }
  | { kind: "deselect" };

/** The parts of a keyboard event this reads. */
export type Keys = {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
};

/**
 * How far one press moves the cabinet.
 *
 * Shift and Alt are the modifiers every drawing program uses for "more" and
 * "less", and somebody who has used one will try them before reading anything.
 * Shift wins when both are held, because the coarse step is the one you reach
 * for deliberately.
 */
export function nudgeStep(keys: Pick<Keys, "shiftKey" | "altKey">): number {
  if (keys.shiftKey) return NUDGE_COARSE;
  if (keys.altKey) return NUDGE_FINE;
  return NUDGE_STEP;
}

/**
 * What a keypress means, or nothing.
 *
 * `null` for anything unclaimed, and the caller leaves those alone rather than
 * swallowing them: Tab still moves focus, and a key this does not know about
 * still reaches the browser.
 */
export function readShortcut(keys: Keys): Shortcut | null {
  const command = Boolean(keys.ctrlKey || keys.metaKey);
  const lower = keys.key.length === 1 ? keys.key.toLowerCase() : keys.key;

  if (command) {
    // Ctrl/Cmd + an arrow is "jump a word" or "go back a page" depending on
    // the platform, and taking it would be taking something that is not ours.
    if (lower === "z" && !keys.shiftKey) return { kind: "undo" };
    if (lower === "d") return { kind: "duplicate" };
    return null;
  }

  switch (keys.key) {
    case "ArrowLeft":
      return { kind: "move", axis: "x", direction: -1 };
    case "ArrowRight":
      return { kind: "move", axis: "x", direction: 1 };
    case "ArrowUp":
      return { kind: "move", axis: "y", direction: 1 };
    case "ArrowDown":
      return { kind: "move", axis: "y", direction: -1 };
    // Depth, on the two keys next to the arrows. Nothing on a keyboard means
    // "towards me", so this is a convention rather than a discovery — which is
    // why the buttons beside the model are labelled Z and these are not the
    // only way to do it.
    case "PageUp":
      return { kind: "move", axis: "z", direction: 1 };
    case "PageDown":
      return { kind: "move", axis: "z", direction: -1 };
    case "Delete":
    case "Backspace":
      return { kind: "delete" };
    case "Escape":
      return { kind: "deselect" };
    default:
      return null;
  }
}

/**
 * True when the keypress belongs to whatever is being typed into.
 *
 * Without this the studio's own shortcuts eat the text fields: Backspace in
 * the cabinet's name would delete the cabinet, and an arrow key in a
 * measurement box would move the thing being measured instead of stepping the
 * number. A control that wants a key takes it first and this never sees it.
 */
export function typingInto(
  target: { tagName?: string; isContentEditable?: boolean } | null,
): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Where a cabinet lands after one step, as an argument for `moveCabinet`.
 *
 * `x` and `y` are measured from the left end of the run and from the floor, so
 * neither goes negative — a cabinet at zero pressed left stays at zero rather
 * than disappearing behind the origin. `z` is depth from the wall and is
 * allowed to be negative, because a wall shelf standing proud of the unit
 * below it is a real thing somebody draws.
 */
export function nudgeTo(
  cabinet: Cabinet,
  axis: Axis,
  direction: Direction,
  step: number,
): Partial<Record<Axis, number>> {
  const next = cabinet.position[axis] + direction * step;
  return { [axis]: axis === "z" ? next : Math.max(0, next) };
}

/**
 * Why this step would do nothing, or null if it would.
 *
 * A reason rather than a boolean, because the button it dims has to be able to
 * say what is wrong. The failure this exists to prevent is the one the drawer
 * heights had: a control that looks live, does nothing when pressed, and gives
 * no account of itself.
 *
 * The depth case is the interesting one. A cabinet with a `runId` has its `x`
 * and `z` *derived* from where the run stands — `resolveDesign` reads the run's
 * wall line and the distance along it, and never looks at `position.z` — so
 * `moveCabinet` deliberately drops a `z` for such a cabinet. Every stock design
 * puts its cabinets on a run, so a Z pair that did not know this would be dead
 * on almost everything somebody opens.
 */
export function nudgeBlocked(
  cabinet: Cabinet,
  axis: Axis,
  direction: Direction,
  step: number = NUDGE_STEP,
): string | null {
  if (axis === "z" && cabinet.runId) {
    return "Depth is set by the run this cabinet stands on";
  }
  if (nudgeTo(cabinet, axis, direction, step)[axis] === cabinet.position[axis]) {
    return axis === "y"
      ? "Already on the floor"
      : "Already at the end of the run";
  }
  return null;
}

/** True when the step would move it — the button is dimmed, not hidden. */
export function canNudge(
  cabinet: Cabinet,
  axis: Axis,
  direction: Direction,
  step: number = NUDGE_STEP,
): boolean {
  return nudgeBlocked(cabinet, axis, direction, step) === null;
}

/** What each pair of buttons is called, and what it does to the design. */
export const AXES: {
  axis: Axis;
  label: string;
  /** Read out in place of "minus" and "plus", which mean nothing in a room. */
  towards: [string, string];
}[] = [
  { axis: "x", label: "X", towards: ["left", "right"] },
  { axis: "y", label: "Y", towards: ["down", "up"] },
  { axis: "z", label: "Z", towards: ["towards the wall", "away from the wall"] },
];
