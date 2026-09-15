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
  DRAFT_TTL_MS,
  DRAFT_VERSION,
  differsFrom,
  draftKey,
  readDraft,
  savedAgo,
  writeDraft,
  clearDraft,
} from "../src/features/berchuma-studio/services/draft.ts";
import {
  bayDimensionsWorthDrawing,
  layOutBays,
} from "../src/features/berchuma-studio/services/bay-layout.ts";
import {
  kitchenExample,
  tvUnitExample,
} from "../src/features/berchuma-studio/services/examples.ts";
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
const ELEVATION = "src/features/berchuma-studio/components/viewer/elevation.tsx";
const MODEL = "src/features/berchuma-studio/components/viewer/model.tsx";

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
// 4d. Open in Studio actually opens the design
// ---------------------------------------------------------------------------

{
  const page = code("src/app/designs/[slug]/page.tsx");
  const studio = code("src/app/studio/page.tsx");
  const workspace = code(
    "src/features/berchuma-studio/components/studio-workspace.tsx",
  );
  const bar = code("src/features/berchuma-studio/components/publish-bar.tsx");

  check(
    "the button carries the design it was pressed on",
    /href=\{`\/studio\?design=\$\{encodeURIComponent\(design\.slug\)\}`\}/.test(page),
    'it was `href="/studio"`, which opens the picker — so pressing it on a design gave you an empty studio',
  );
  check(
    "and the old bare link is gone",
    !/href="\/studio"/.test(page),
  );

  check(
    "the studio loads the design named in the URL",
    /const record = await getDesign\(design\)/.test(studio),
  );
  check(
    "on the server, under the viewer's own session",
    /await getDesign\(design\)\.catch/.test(studio) &&
      !/use client/.test(studio),
    "a slug typed by hand has to meet the same row-level rules as the page it came from",
  );
  check(
    "and only opens it for its owner",
    /if \(record\?\.isOwner\)/.test(studio),
    "editing somebody else's design in place would fail on save or overwrite their work; Remix is the route for that",
  );
  check(
    "a design that cannot be read falls back to the ordinary studio",
    /\.catch\(\(\) => null\)/.test(studio),
    "a hand-edited slug should get the picker, not a crash",
  );

  check(
    "the workspace opens holding that design rather than the picker",
    /if \(editing\) return editing\.spec;/.test(workspace),
  );
  check(
    "and lands on the Design tab, not the chat",
    /editing \|\| opening\?\.kind === "kitchen" \? "design" : "chat"/.test(workspace),
    "somebody who pressed Open in Studio is looking at a design, not starting a conversation",
  );
  check(
    "the publish bar is told which design this is",
    /initialSaved=\{\s*\n?\s*editing \? \{ id: editing\.designId, slug: editing\.slug \} : null\s*\n?\s*\}/.test(
      workspace,
    ) || /initialSaved=\{/.test(workspace),
  );
  check(
    "and starts from it rather than from nothing",
    /useState<Saved \| null>\(initialSaved\)/.test(bar),
    "without it Save posts with no designId and writes a second design rather than a new version of this one",
  );
}

// ---------------------------------------------------------------------------
// 4e. A draft that survives the back button
// ---------------------------------------------------------------------------

{
  // A tiny stand-in for localStorage, so the module can be exercised without a
  // browser — and so the throwing case can be tested, which a real one will
  // not do on demand.
  const makeStore = (throwing = false): Storage => {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      key: (i: number) => [...map.keys()][i] ?? null,
      getItem: (k: string) => {
        if (throwing) throw new Error("private mode");
        return map.get(k) ?? null;
      },
      setItem: (k: string, v: string) => {
        if (throwing) throw new Error("quota");
        map.set(k, v);
      },
      removeItem: (k: string) => {
        if (throwing) throw new Error("private mode");
        map.delete(k);
      },
    } as Storage;
  };

  const spec = tvUnitExample();

  check(
    "a draft belongs to one person",
    draftKey("alice") !== draftKey("bob"),
    "a shared phone must not show one owner's unfinished work to the next",
  );
  check(
    "and to one design",
    draftKey("alice", "design-1") !== draftKey("alice", "design-2") &&
      draftKey("alice") !== draftKey("alice", "design-1"),
    "editing a saved wardrobe and starting a new bookshelf are two pieces of work",
  );

  {
    const store = makeStore();
    const key = draftKey("alice", null);
    check("a design can be written down", writeDraft(store, key, spec, null));

    const back = readDraft(store, key);
    check("and read back", back !== null);
    check(
      "as the same design",
      back?.spec.title === spec.title &&
        back?.spec.cabinets.length === spec.cabinets.length,
    );
    check(
      "with a time on it, so it can say how old it is",
      (back?.savedAt ?? 0) > 0,
    );

    clearDraft(store, key);
    check("and discarded", readDraft(store, key) === null);
  }

  // Untrusted input. It is JSON from a store anybody with the browser open can
  // edit, and it becomes a drawing and a price.
  {
    const store = makeStore();
    const key = draftKey("alice", null);

    store.setItem(key, "not json at all");
    check("a draft that is not JSON is ignored", readDraft(store, key) === null);

    store.setItem(key, JSON.stringify({ version: 999, savedAt: Date.now(), spec }));
    check(
      "a draft from an older shape is discarded rather than half-restored",
      readDraft(store, key) === null,
      "putting back three fields of eight is worse than asking again, because it looks like it worked",
    );

    store.setItem(
      key,
      JSON.stringify({ version: DRAFT_VERSION, savedAt: Date.now(), spec: { title: "nonsense" } }),
    );
    check(
      "and one that is not a design cannot become one",
      readDraft(store, key) === null,
      "the same gate the API uses, for the same reason",
    );

    store.setItem(
      key,
      JSON.stringify({
        version: DRAFT_VERSION,
        savedAt: Date.now() - DRAFT_TTL_MS - 1000,
        spec,
      }),
    );
    check(
      "a draft older than a fortnight is not offered back",
      readDraft(store, key) === null,
      "a design abandoned a month ago reappearing over a fresh start gets mistaken for it",
    );
  }

  // A browser that refuses storage must not take the studio down with it.
  {
    const hostile = makeStore(true);
    const key = draftKey("alice", null);
    check(
      "a browser that refuses to store does not throw on write",
      writeDraft(hostile, key, spec, null) === false,
    );
    check("nor on read", readDraft(hostile, key) === null);
    check("nor on discard", (() => {
      clearDraft(hostile, key);
      return true;
    })());
  }

  // What is worth offering back.
  {
    const store = makeStore();
    const key = draftKey("alice", "design-1");
    writeDraft(store, key, spec, "design-1");
    const found = readDraft(store, key)!;

    check(
      "a draft of the design already on screen is not offered back",
      !differsFrom(found, spec),
      "opening a saved design writes a draft of it within a second; offering that back is offering somebody their own unchanged work",
    );
    check(
      "a draft of something else is",
      differsFrom(found, { ...spec, title: "Something different" }),
    );
    check(
      "and so is one when nothing is open",
      differsFrom(found, null),
    );
  }

  check(
    "how long ago is said in words",
    savedAgo(Date.now() - 30_000) === "a moment ago" &&
      savedAgo(Date.now() - 20 * 60_000) === "20 minutes ago" &&
      savedAgo(Date.now() - 3 * 3_600_000) === "3 hours ago" &&
      savedAgo(Date.now() - 26 * 3_600_000) === "yesterday",
    `${savedAgo(Date.now() - 30_000)} / ${savedAgo(Date.now() - 20 * 60_000)} / ${savedAgo(Date.now() - 3 * 3_600_000)} / ${savedAgo(Date.now() - 26 * 3_600_000)}`,
  );
}

// ---------------------------------------------------------------------------
// 4f. The draft's wiring
// ---------------------------------------------------------------------------

{
  const workspace = code(
    "src/features/berchuma-studio/components/studio-workspace.tsx",
  );
  const studio = code("src/app/studio/page.tsx");

  check(
    "the design is written down as it changes",
    /writeDraft\(window\.localStorage, key, spec, editing\?\.designId \?\? null\)/.test(
      workspace,
    ),
  );
  check(
    "on a debounce, not on every frame of a drag",
    /setTimeout\(\s*\n?\s*\(\) => \{/.test(workspace) &&
      /DRAFT_WRITE_MS/.test(workspace),
    "serialising a whole design sixty times a second would make the drag it is protecting stutter",
  );
  check(
    "and the pending write is cancelled when the design changes again",
    /return \(\) => clearTimeout\(timer\);/.test(workspace),
  );
  check(
    "the draft is read without breaking server rendering",
    /useSyncExternalStore\(/.test(workspace) && /\(\) => null,/.test(workspace),
    "a useState initialiser would run on the server, where there is no localStorage to read",
  );
  check(
    "it is offered back rather than put back",
    /Put it back/.test(workspace) && /Discard/.test(workspace),
    "restoring silently leaves somebody who meant to start again with no obvious way out of it",
  );
  check(
    "discarding actually removes it",
    /clearDraft\(window\.localStorage, key\)/.test(workspace),
    "a Discard that only hides the bar offers the same draft again on the next visit",
  );
  check(
    "the draft is keyed to who is signed in",
    /userId \? draftKey\(userId, editing\?\.designId \?\? null\) : null/.test(
      workspace,
    ) && /userId=\{session\.state === "signed-in" \? session\.userId : null\}/.test(studio),
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
// 6. Where the bays are
// ---------------------------------------------------------------------------

{
  const spec = tvUnitExample();
  const cabinet = spec.cabinets[0];
  const t = spec.carcass.board.thickness;

  const placed = layOutBays(cabinet, t);

  check(
    "every bay is placed",
    placed.length === cabinet.bays.length,
    `${placed.length} of ${cabinet.bays.length}`,
  );
  check(
    "the first opening starts one board in from the cabinet's edge",
    placed[0].x === t,
    `started at ${placed[0].x} with a ${t} mm board`,
  );
  check(
    "there is exactly one board between one opening and the next",
    placed.every((bay, i) =>
      i === 0 ? true : bay.x - (placed[i - 1].x + placed[i - 1].width) === t,
    ),
    "a bay drawn where the divider is is a bay drawn in the wrong place",
  );
  check(
    "the openings and the boards between them fill the carcass",
    placed[placed.length - 1].x + placed[placed.length - 1].width + t ===
      cabinet.size.width,
    `bays + boards came to ${placed[placed.length - 1].x + placed[placed.length - 1].width + t} in a ${cabinet.size.width} carcass`,
  );
  check(
    "an opening is as wide as the bay it is drawn for",
    placed.every((bay, i) => bay.width === cabinet.bays[i].width),
  );
  check(
    "a kitchen's cabinets are laid out the same way",
    kitchenExample().cabinets.every((unit) => {
      const bays = layOutBays(unit, t);
      const last = bays[bays.length - 1];
      return bays[0].x === t && last.x + last.width + t === unit.size.width;
    }),
    "the elevation and the 3D view both call this for whatever is on screen",
  );

  check(
    "a cabinet with several bays gets them dimensioned",
    bayDimensionsWorthDrawing(cabinet),
    `the TV unit has ${cabinet.bays.length} bays`,
  );
  check(
    "a single-bay cabinet does not",
    !bayDimensionsWorthDrawing({ ...cabinet, bays: cabinet.bays.slice(0, 1) }),
    "its opening is the cabinet width less two boards, and the width is already on the drawing",
  );
}

// ---------------------------------------------------------------------------
// 7. The drawing carries the numbers somebody cuts to
// ---------------------------------------------------------------------------

{
  const elevation = code(ELEVATION);
  const model = code(MODEL);

  check(
    "the elevation draws a chain of cabinet widths",
    /<CabinetChain\b/.test(elevation) && /function CabinetChain\(/.test(elevation),
    "the overall width tells you whether it fits the wall, not what to cut",
  );
  check(
    "which is only drawn when there is more than one cabinet on it",
    /const chained =\s*\n?\s*supportsFrontElevation && elevationCabinets\.length > 1;/.test(
      elevation,
    ),
    "on a single cabinet the chain repeats the overall width immediately below the overall width",
  );
  check(
    "and the paper grows to hold it",
    /const bottomMargin = MARGIN \+ \(chained \? CHAIN_DEPTH : 0\);/.test(
      elevation,
    ) && /\$\{envelope\.height \+ MARGIN \+ bottomMargin\}/.test(elevation),
    "drawn below a viewBox that stops at the old margin, the chain is off the page",
  );
  check(
    "the chain is ordered left to right whatever order the cabinets are stored in",
    /\[\.\.\.cabinets\]\.sort\(\(a, b\) => a\.x - b\.x\)/.test(elevation),
  );
  // Whitespace-flattened, because the condition is written across three lines
  // and a regex over the raw file would be asserting where the line breaks are.
  const flatElevation = elevation.replace(/\s+/g, " ");

  check(
    "each cabinet's own height is written beside it when they differ",
    /const heightsDiffer = new Set\( ?elevationCabinets\.map\(\(\{ cabinet \}\) => Math\.round\(cabinet\.size\.height\)\),? ?\)\.size > 1;/.test(
      flatElevation,
    ) && /supportsFrontElevation && heightsDiffer \?/.test(flatElevation),
    "a TV unit with a shelf over it is two heights and one overall, and the overall is the one you cannot cut to",
  );
  check(
    "and it is the cabinet's height that is written, not the envelope's",
    /\{Math\.round\(cabinet\.size\.height\)\}/.test(flatElevation),
  );
  check(
    "the elevation writes each opening inside the bay it measures",
    /\{bayDimensionsWorthDrawing\(cabinet\)/.test(elevation) &&
      /\{Math\.round\(geometry\.width\)\}/.test(elevation),
  );
  check(
    "the 3D view labels the openings of the selected cabinet too",
    /<BayLabels cabinet=\{cabinet\} board=\{board\} scale=\{scale\} \/>/.test(
      model,
    ) && /function BayLabels\(/.test(model),
    "a label the elevation carries and the model does not is a drawing somebody has to switch views to read",
  );
  check(
    "it is given the real board thickness, not a guess",
    /board=\{spec\.carcass\.board\.thickness\}/.test(model),
    "15 mm foam board and 18 mm MDF put the openings in different places",
  );
  check(
    "and both views place the bays with the same function",
    /layOutBays\(cabinet, board\)/.test(model) &&
      /layOutBays\(cabinet, t\)/.test(elevation),
    "two copies of the sum is one edit away from the elevation and the model disagreeing about where a bay is",
  );
}

// ---------------------------------------------------------------------------
// 8. The header folds away
// ---------------------------------------------------------------------------

{
  const workspace = code(
    "src/features/berchuma-studio/components/studio-workspace.tsx",
  );
  const editor = code(EDITOR);

  check(
    "the header starts open",
    /const \[headerOpen, setHeaderOpen\] = useState\(true\)/.test(workspace),
    "somebody arriving needs to see what they are looking at and where Save is",
  );
  check(
    "and it is taken out of the layout, not just hidden",
    /\{headerOpen \? \(/.test(workspace) && /\) : null\}/.test(workspace),
    "a header hidden with a class still takes its height, which is the whole point of folding it",
  );
  check(
    "there is a control that folds it",
    /onClick=\{\(\) => setHeaderOpen\(false\)\}/.test(workspace) &&
      /aria-label="Fold this away and give the drawing the room"/.test(workspace),
  );
  check(
    "the editor is told the header is gone",
    /headerHidden=\{!headerOpen\}/.test(workspace) &&
      /onShowHeader=\{\(\) => setHeaderOpen\(true\)\}/.test(workspace),
  );
  check(
    "and offers the way back, over the drawing",
    /\{headerHidden && onShowHeader \? \(/.test(editor) &&
      /onClick=\{onShowHeader\}/.test(editor),
    "folded with no control to unfold it, the title and the Save buttons are gone for good",
  );
  check(
    "the way back is labelled for a screen reader",
    /aria-label="Show the title and the save buttons"/.test(editor),
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
