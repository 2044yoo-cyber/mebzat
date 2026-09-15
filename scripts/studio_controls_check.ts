/**
 * Berchuma Studio — the controls somebody actually touches.
 *
 *   npx tsx scripts/studio_controls_check.ts
 *
 * ## What was wrong
 *
 * **Measurements could not be typed.** The cabinet's width, height and depth
 * were sliders alone; the starting width was a slider alone; and a section's
 * width was not a control at all, only a label. A studio for joinery that
 * cannot accept 2437 is a studio that cannot be used for the wall somebody
 * measured — every number had to be approximated to the nearest step by
 * dragging, on a phone, with a thumb.
 *
 * `config-rail.tsx` already had the right answer and had written down why: a
 * number box beside the slider, because the slider is how somebody explores
 * and the box is how they enter a measurement. It just never reached the other
 * three places.
 *
 * **The design was a strip.** The controls sheet was fixed at 70% of the
 * editor, so the thing the person came to look at got what was left.
 *
 * Both halves are checked here: the pure height arithmetic by calling it, and
 * the wiring by reading the files, because a control that exists and is not
 * used is the failure mode that has bitten this session repeatedly.
 */

import { readFileSync } from "node:fs";

import {
  COALESCE_MS,
  DEPTH,
  canRewind,
  continuesStep,
  remember,
  rewind,
} from "../src/features/berchuma-studio/services/history.ts";
import {
  DEFAULT_SNAP,
  FULL,
  OPEN,
  PEEK,
  SNAPS,
  dragOwnsGesture,
  heightDuringDrag,
  settle,
} from "../src/features/berchuma-studio/components/ui/sheet-height.ts";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * A file with its comments stripped.
 *
 * Every assertion below is about code. A comment that mentions `LengthField`
 * satisfies a search for it perfectly well while the control it describes is
 * not rendered anywhere — which is the trap AGENTS.md names first.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/(^|[\s;,{(=])\/\*[\s\S]*?\*\//g, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const FIELD = "src/features/berchuma-studio/components/ui/length-field.tsx";
const PANEL = "src/features/berchuma-studio/components/editor/control-panel.tsx";
const RAIL = "src/features/berchuma-studio/components/config/config-rail.tsx";
const START = "src/features/berchuma-studio/components/start-panel.tsx";
const EDITOR = "src/features/berchuma-studio/components/editor/design-editor.tsx";

// ---------------------------------------------------------------------------
// 1. Every measurement can be typed
// ---------------------------------------------------------------------------

{
  const field = code(FIELD);

  check(
    "the length field has a box to type into",
    /inputMode="numeric"/.test(field),
    "a slider alone cannot accept the number somebody took off the wall with a tape",
  );
  check(
    "and a slider to feel for a size with",
    // The condition as well as the element. `type="range"` is still in the
    // file when the branch that renders it has been turned off, and a check
    // that matches the string alone goes green on a field with no slider in
    // it — which is the identifier outliving the call, exactly.
    /\{slider \? \(/.test(field) && /type="range"/.test(field),
    "a box alone makes you guess and retype until it looks right",
  );
  check(
    "the box keeps what is typed until it is committed",
    /const \[draft, setDraft\] = useState<string \| null>\(null\)/.test(field) &&
      /onBlur=\{commit\}/.test(field),
    "clamping on every keystroke rewrites the field under the caret: typing 1400 passes through 1",
  );
  check(
    "Enter commits it",
    /event\.key === "Enter"/.test(field) && /currentTarget\.blur\(\)/.test(field),
  );
  check(
    "Escape abandons it",
    /event\.key === "Escape"/.test(field) && /setDraft\(null\)/.test(field),
  );
  check(
    "the arrows step by the same amount the slider does",
    /event\.key === "ArrowUp" \|\| event\.key === "ArrowDown"/.test(field) &&
      /event\.key === "ArrowUp" \? step : -step/.test(field),
  );
  check(
    "an outside change is not swallowed by an uncommitted draft",
    /if \(seen !== rounded\) \{/.test(field) && /setDraft\(null\)/.test(field),
    "dragging the model's handle has to move the number in the box",
  );
  check(
    "and that reset happens during render, not in an effect",
    !/useEffect/.test(field),
    "an effect runs after the browser has painted, so the box would show the stale number for a frame",
  );
  check(
    "the slider is not announced as a second control for one number",
    /aria-hidden\s*\n?\s*tabIndex=\{-1\}/.test(field) ||
      (/aria-hidden/.test(field) && /tabIndex=\{-1\}/.test(field)),
    "two controls over one value are read out as two values",
  );
}

// ---------------------------------------------------------------------------
// 2. And it is used everywhere a length is set
// ---------------------------------------------------------------------------

{
  const panel = code(PANEL);
  const rail = code(RAIL);
  const start = code(START);

  for (const [label, source, path] of [
    ["the cabinet panel", panel, PANEL],
    ["the config rail", rail, RAIL],
    ["the start panel", start, START],
  ] as [string, string, string][]) {
    check(
      `${label} imports the shared field`,
      /import \{ LengthField \}/.test(source),
      path,
    );
    check(
      `and ${label} renders it`,
      /<LengthField/.test(source),
      path,
    );
  }

  check(
    "width, height and depth are all typeable",
    (panel.match(/<LengthField/g) ?? []).length >= 4,
    `${(panel.match(/<LengthField/g) ?? []).length} in the panel`,
  );
  check(
    "there is one length control, not three copies of it",
    !/function Slider\(/.test(panel) && !/function Dimension\(/.test(rail),
    "the argument for a box beside a slider was written down once and then not applied twice",
  );
  check(
    "the starting width is no longer a bare slider",
    !/type="range"/.test(start),
    "a room measured at 2437 had to be rounded to the nearest hundred before the design began",
  );
}

// ---------------------------------------------------------------------------
// 3. A section's width is a control, not a label
// ---------------------------------------------------------------------------

{
  const panel = code(PANEL);

  check(
    "a section's width can be typed",
    /setBayWidth\(spec, cabinet\.id, bay\.id, width\)/.test(panel),
    "it used to be printed as text beside the section's name",
  );
  check(
    "with no slider, because a cabinet can hold twenty-four sections",
    /slider=\{false\}/.test(panel),
    "twenty-four sliders is a wall of sliders",
  );
  check(
    "its ceiling leaves every neighbour the narrowest width worth building",
    /interiorWidthOf\(cabinet, spec\.carcass\.board\.thickness\)/.test(panel) &&
      /\(cabinet\.bays\.length - 1\) \* LIMITS\.minBayWidth/.test(panel),
  );
  check(
    "and a cabinet with one section says so instead of offering a box that refuses",
    /cabinet\.bays\.length > 1 \?/.test(panel) && /the whole interior/.test(panel),
    "one section is the interior; a control that can only refuse is not a control",
  );
}

// ---------------------------------------------------------------------------
// 3b. The material picker offers what the construction can actually use
// ---------------------------------------------------------------------------

{
  const panel = code(PANEL);

  check(
    "a wardrobe and everything else are offered different boards",
    /isWardrobe \? wardrobeStructuralBoards\(\) : carcassBoards\(\)/.test(panel),
    "both pickers called the wardrobe's list, which filters to exactly 18 mm, so a board at any other thickness was invisible to the entire application",
  );
  // Scoped to the "Carcass and doors" picker, which is the non-wardrobe one.
  //
  // A wardrobe has four pickers of its own, and one of them assigns
  // `draft.carcass.frontBoard = board` in exactly these words — so a search
  // across the file matched that and stayed green with the assignments in this
  // handler deleted. A second copy elsewhere in the file, again.
  const carcassPicker = (() => {
    const at = panel.indexOf('label="Carcass and doors"');
    return at < 0 ? "" : panel.slice(at, at + 1200);
  })();

  check(
    "the carcass picker was found to look inside",
    carcassPicker.length > 0 && /onChange=/.test(carcassPicker),
    "if this fails the check below is reading an empty string and proves nothing",
  );
  check(
    "picking a carcass board moves the fronts, the interior and the plinth with it",
    /draft\.carcass\.frontBoard = board;/.test(carcassPicker) &&
      /draft\.carcass\.interiorBoard = board;/.test(carcassPicker) &&
      /draft\.carcass\.plinthBoard = board;/.test(carcassPicker),
    "outside a wardrobe the validator holds the carcass to one thickness, so leaving them behind turns one deliberate choice into three corrections about it",
  );
}

// ---------------------------------------------------------------------------
// 4. The sheet can be pushed down to see the design
// ---------------------------------------------------------------------------

{
  check("the sheet has more than one height", SNAPS.length >= 3);
  check(
    "one of them leaves the design most of the screen",
    PEEK <= 0.3,
    `${PEEK}`,
  );
  check(
    "one of them covers most of it, for a long list of sections",
    FULL >= 0.85,
    `${FULL}`,
  );
  check("it opens at the middle one", DEFAULT_SNAP === OPEN);
  check(
    "the heights are in order",
    SNAPS.every((snap, i) => i === 0 || snap > SNAPS[i - 1]),
    SNAPS.join(", "),
  );

  // Dragging.
  check(
    "dragging down makes the sheet smaller",
    heightDuringDrag(0.68, 100, 1000) < 0.68,
  );
  check(
    "and dragging up makes it bigger",
    heightDuringDrag(0.68, -100, 1000) > 0.68,
  );
  check(
    "by the distance the finger moved, as a share of the editor",
    Math.abs(heightDuringDrag(0.68, 100, 1000) - 0.58) < 1e-9,
    `${heightDuringDrag(0.68, 100, 1000)}`,
  );
  check(
    "dragging past the bottom does not close it out from under the finger",
    heightDuringDrag(0.3, 100_000, 1000) === PEEK,
  );
  check(
    "and dragging past the top does not cover the header it hangs from",
    heightDuringDrag(0.9, -100_000, 1000) === FULL,
  );
  check(
    "an editor of no height leaves it where it was",
    heightDuringDrag(0.68, 200, 0) === 0.68,
    "a divide by zero here would set the height to NaN and the sheet would vanish",
  );

  // Settling.
  check(
    "a slow drag settles at the nearest height",
    settle(0.65, 0) === OPEN && settle(0.3, 0) === PEEK,
  );
  check(
    "a flick down goes a whole step, however short it was",
    settle(0.9, 3) === OPEN,
    `${settle(0.9, 3)} — without this a flick from full stops at the nearest, which reads as ignored`,
  );
  check(
    "a flick up goes a whole step too",
    settle(0.25, -3) === OPEN,
    `${settle(0.25, -3)}`,
  );
  check(
    "a flick at the bottom stays at the bottom",
    settle(PEEK, 3) === PEEK,
  );
  check(
    "and one at the top stays at the top",
    settle(FULL, -3) === FULL,
  );
  check(
    "every height it can settle at is one of the snaps",
    [0, 0.1, 0.35, 0.5, 0.77, 1].every((h) =>
      [-4, -0.2, 0, 0.2, 4].every((v) =>
        (SNAPS as readonly number[]).includes(settle(h, v)),
      ),
    ),
    "a sheet that stops at 37% stays at 37% and has to be fiddled with on every visit",
  );

  // Who owns the gesture.
  check(
    "pulling down on a list that is at its top moves the sheet",
    dragOwnsGesture(0, 20),
  );
  check(
    "pulling down on a list scrolled into its middle scrolls the list",
    !dragOwnsGesture(120, 20),
    "otherwise reading a list of twenty sections drags the sheet shut on every overshoot",
  );
  check(
    "and pushing up never moves the sheet from the list",
    !dragOwnsGesture(0, -20),
  );
}

// ---------------------------------------------------------------------------
// 4b. Undo
// ---------------------------------------------------------------------------

{
  // The case the whole design turns on: a drag is one step, not two hundred.
  //
  // Dragging a cabinet calls the setter on every animation frame, each with a
  // complete new design. Pushed one per frame, a single drag fills the whole
  // history and pressing undo steps back one sixtieth of a second — which
  // looks, to the person pressing it, exactly like a button that does nothing.
  let past: ReturnType<typeof remember<string>> = [];
  let clock = 1000;
  for (let frame = 0; frame < 60; frame += 1) {
    past = remember(past, `frame-${frame}`, clock);
    clock += 16;
  }

  check(
    "a second of dragging is one thing to undo",
    past.length === 1,
    `${past.length} steps for 60 frames`,
  );
  check(
    "and it goes back to before the drag started, not to the frame before",
    rewind(past)?.state === "frame-0",
    `${rewind(past)?.state}`,
  );

  // A drag that runs longer than the window is still one drag.
  let long: ReturnType<typeof remember<string>> = [];
  let slow = 1000;
  for (let frame = 0; frame < 300; frame += 1) {
    long = remember(long, `f${frame}`, slow);
    slow += 16;
  }
  check(
    "a five-second drag does not split into several",
    long.length === 1,
    `${long.length} steps — the window has to move with the gesture, not sit at its start`,
  );

  // A deliberate second action is its own step.
  clock += COALESCE_MS * 3;
  past = remember(past, "after-the-drag", clock);
  check("a separate edit is a separate step", past.length === 2);
  check(
    "undo walks back one step at a time",
    (() => {
      const first = rewind(past);
      if (!first || first.state !== "after-the-drag") return false;
      const second = rewind(first.past);
      return second?.state === "frame-0" && second.past.length === 0;
    })(),
  );

  check(
    "the very first edit on a design is undoable",
    continuesStep(null, 1000) === false,
    "with no history yet there is nothing to continue, so it has to open a step",
  );
  check(
    "two edits far apart are separate steps",
    !continuesStep(1000, 1000 + COALESCE_MS + 1),
  );
  check(
    "and two within the window are one",
    continuesStep(1000, 1000 + COALESCE_MS - 1),
  );

  // Bounded, because a design is a few hundred kilobytes.
  let deep: ReturnType<typeof remember<number>> = [];
  let far = 0;
  for (let i = 0; i < DEPTH + 25; i += 1) {
    deep = remember(deep, i, far);
    far += COALESCE_MS * 2;
  }
  check("the history is bounded", deep.length === DEPTH, `${deep.length}`);
  check(
    "and it is the oldest that falls off, not the newest",
    deep[deep.length - 1]?.state === DEPTH + 24,
    `top is ${deep[deep.length - 1]?.state}`,
  );

  check("an empty history offers nothing to go back to", rewind([]) === null);
  check("and says so", !canRewind([]));
  check("a history with something in it says so too", canRewind(deep));
}

// ---------------------------------------------------------------------------
// 4c. Undo's wiring
// ---------------------------------------------------------------------------

{
  const editor = code(EDITOR);
  const hook = code("src/features/berchuma-studio/hooks/use-design.ts");
  const workspace = code(
    "src/features/berchuma-studio/components/studio-workspace.tsx",
  );

  check(
    "there is an undo button over the drawing",
    /aria-label="Undo the last change"/.test(editor),
    "the edit somebody most wants back is a drag they did on the model, and the controls sheet is shut while they are doing it",
  );
  check(
    "it is disabled rather than hidden when there is nothing to undo",
    /disabled=\{!canUndo\}/.test(editor),
    "a button that appears and disappears moves under the thumb reaching for it",
  );
  check(
    "the editor is given the undo and whether it is available",
    /onUndo=\{design\.undo\}/.test(workspace) &&
      /canUndo=\{design\.canUndo\}/.test(workspace),
  );

  check(
    "every writer records the state it is replacing",
    (hook.match(/record\(previous\)/g) ?? []).length >= 3,
    `${(hook.match(/record\(previous\)/g) ?? []).length} of the three writers — a writer that does not record is an edit that cannot be undone`,
  );
  check(
    "and it records from inside the updater, not from the render's copy",
    !/record\(held\)/.test(hook),
    "`held` inside an updater is the render's copy and may already be an edit behind",
  );
  check(
    "undoing does not re-run the validator over an already-repaired design",
    /setHeld\(step\.state\)/.test(hook) && !/validateSpec\(step/.test(hook),
    "the second pass appends its corrections to the first pass's, so undoing five times prints the same warning five times",
  );
  check(
    "starting a new design clears the history",
    /past\.current = \[\];/.test(hook),
    "otherwise undo walks back out of the design that is open and into the one before it",
  );
}

// ---------------------------------------------------------------------------
// 5. The sheet's wiring
// ---------------------------------------------------------------------------

{
  const editor = code(EDITOR);

  check(
    "the sheet's height comes from the drag, not from a fixed class",
    /style=\{\{ height: `\$\{height \* 100\}%` \}\}/.test(editor) &&
      !/max-h-\[70%\]/.test(editor),
    "70% of the editor left the design a strip",
  );
  check(
    "there is a handle to drag it by",
    /onPointerDown=\{beginDrag\}/.test(editor),
  );
  check(
    "the list can drag it too, under the rule that decides which",
    /dragOwnsGesture\(scrollTop, travel\)/.test(editor),
  );
  check(
    "the gesture finishes even when the finger leaves the shrinking sheet",
    /window\.addEventListener\("pointermove"/.test(editor) &&
      /window\.addEventListener\("pointerup"/.test(editor),
    "handlers on the element stop firing the moment the sheet slides out from under the finger",
  );
  check(
    "and a cancelled pointer is cleaned up like a finished one",
    // Specifically the *adding* of it. `pointercancel` also appears in the
    // `removeEventListener` line, so a search for the bare word stays green
    // with the listener never attached — a second copy of the name elsewhere
    // in the same function.
    /window\.addEventListener\("pointercancel", finish\)/.test(editor) &&
      /window\.removeEventListener\("pointercancel", finish\)/.test(editor),
    "a phone call mid-drag otherwise leaves listeners on the window forever",
  );
  check(
    "the handle works without a pointer at all",
    /onClick=\{\(\) => setHeight\(nextSnap\(height\)\)\}/.test(editor),
    "a drag is not available to a keyboard or a switch",
  );
  check(
    "and says which height it is at",
    /aria-label=\{`Sheet height: \$\{describe\(height\)\}/.test(editor),
  );
  check(
    "the height does not animate while a finger is on it",
    /dragging \? "" : "transition-\[height\]/.test(editor),
    "a transition during a drag makes the sheet lag the finger by its duration",
  );
  check(
    "reopening returns it to the height it opens at",
    /function openPanel\(\) \{/.test(editor) &&
      /setHeight\(DEFAULT_SNAP\);/.test(editor),
    "somebody who pushed it down to see the model wants the controls back when they press Edit",
  );
  check(
    "the list still scrolls inside whatever height the sheet is",
    /min-h-0 flex-1 overflow-y-auto overscroll-contain/.test(editor),
  );
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
  console.log(`${GREEN}${passed} passed${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
console.log(`${DIM}studio: every measurement typed, and the design given room${RESET}`);
