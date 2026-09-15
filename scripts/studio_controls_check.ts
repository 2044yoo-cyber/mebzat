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
  AXES,
  NUDGE_COARSE,
  NUDGE_FINE,
  NUDGE_STEP,
  canNudge,
  nudgeBlocked,
  nudgeStep,
  nudgeTo,
  readShortcut,
  typingInto,
} from "../src/features/berchuma-studio/services/nudge.ts";
import {
  frontHeightsOf,
  moveCabinet,
  openingHeightOf,
  setDrawerHeight,
} from "../src/features/berchuma-studio/services/operations.ts";
import {
  COALESCE_MS,
  DEPTH,
  canRewind,
  continuesStep,
  remember,
  rewind,
} from "../src/features/berchuma-studio/services/history.ts";
import {
  MIN_CONTROLS_PEEK,
  MIN_VIEWPORT,
  VIEWPORT_SHARE,
  coveredAtBottom,
  stickyViewportHeight,
  usableHeight,
} from "../src/features/berchuma-studio/services/mobile-layout.ts";

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

/**
 * One function's text, so a check can be scoped to it.
 *
 * The trap AGENTS.md names second: a sibling function in the same file has the
 * same line, so a check over the whole file passes while the function it is
 * about has lost the thing.
 *
 * Read to the next line that is a closing brace on its own. Two simpler rules
 * were tried and both stopped inside the signature, because a component in
 * this codebase is declared as `function DrawerList({ spec, ... }: { ... })`:
 * counting braces closed at the end of the destructuring pattern, and the
 * first `}` in column one is that pattern's, which is written `}: {`. A brace
 * alone on its line is the function's, because every component here is at the
 * top level and nothing inside one is indented that far. `indent` is for a
 * function nested inside another, whose closing brace is not in column one.
 */
function functionText(source: string, name: string, indent = ""): string {
  const at = source.indexOf(`function ${name}(`);
  if (at === -1) return "";

  const end = source.slice(at).search(new RegExp(`\\n${indent}\\}(\\n|$)`));
  return end === -1
    ? source.slice(at)
    : source.slice(at, at + end + 2 + indent.length);
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
      // The named import rather than the whole statement: the drawer heights
      // added `LengthInput` beside it, and an exact-statement match failed on
      // a file that had only grown a second name from the same module.
      /import \{[^}]*\bLengthField\b[^}]*\} from "[^"]*length-field"/.test(
        source,
      ),
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
// 9. Moving the selection without dragging it
// ---------------------------------------------------------------------------

{
  const spec = tvUnitExample();
  const cabinet = spec.cabinets[0];

  check(
    "a step is ten millimetres",
    nudgeStep({}) === NUDGE_STEP && NUDGE_STEP === 10,
    `got ${nudgeStep({})}`,
  );
  check(
    "Shift takes a bigger bite",
    nudgeStep({ shiftKey: true }) === NUDGE_COARSE && NUDGE_COARSE > NUDGE_STEP,
  );
  check(
    "Alt takes a smaller one",
    nudgeStep({ altKey: true }) === NUDGE_FINE && NUDGE_FINE < NUDGE_STEP,
  );
  check(
    "Shift wins when both are held",
    nudgeStep({ shiftKey: true, altKey: true }) === NUDGE_COARSE,
    "the coarse step is the one you reach for deliberately",
  );

  check(
    "a step right moves it right by the step",
    nudgeTo(cabinet, "x", 1, 10).x === cabinet.position.x + 10,
  );
  check(
    "a step left moves it left",
    nudgeTo({ ...cabinet, position: { ...cabinet.position, x: 500 } }, "x", -1, 10)
      .x === 490,
  );
  check(
    "a cabinet at the end of the run does not go past it",
    nudgeTo({ ...cabinet, position: { ...cabinet.position, x: 0 } }, "x", -1, 10)
      .x === 0,
    "x is measured from the left end, so a negative one is off the drawing",
  );
  check(
    "and one on the floor does not go through it",
    nudgeTo({ ...cabinet, position: { ...cabinet.position, y: 0 } }, "y", -1, 10)
      .y === 0,
  );
  check(
    "depth is allowed to be negative",
    nudgeTo({ ...cabinet, runId: undefined, position: { ...cabinet.position, z: 0 } }, "z", -1, 10)
      .z === -10,
    "a wall shelf standing proud of the unit below it is a real thing somebody draws",
  );
  check(
    "one axis at a time",
    Object.keys(nudgeTo(cabinet, "x", 1, 10)).length === 1,
    "a move that also writes the other two would undo a drag somebody just made",
  );

  check(
    "a step that would move it is offered",
    canNudge({ ...cabinet, position: { ...cabinet.position, x: 500 } }, "x", -1),
  );
  check(
    "one that would not is refused with a reason",
    nudgeBlocked({ ...cabinet, position: { ...cabinet.position, y: 0 } }, "y", -1) ===
      "Already on the floor",
    `got ${nudgeBlocked({ ...cabinet, position: { ...cabinet.position, y: 0 } }, "y", -1)}`,
  );
  check(
    "depth is refused on a cabinet whose run decides it",
    Boolean(cabinet.runId) &&
      nudgeBlocked(cabinet, "z", 1) ===
        "Depth is set by the run this cabinet stands on",
    "moveCabinet drops a z for a cabinet on a run, so a Z button that did not know would be dead",
  );
  check(
    "and offered on one that stands free",
    canNudge({ ...cabinet, runId: undefined }, "z", 1),
  );

  // The reason the refusal above is not a guess: the operation really does
  // ignore it. Asserted by calling it rather than by reading moveCabinet,
  // because that is the behaviour the button is promising to reflect.
  check(
    "moveCabinet really does ignore a depth on a run cabinet",
    moveCabinet(spec, cabinet.id, { z: 40 }).cabinets[0].position.z ===
      cabinet.position.z,
  );
  check(
    "a step actually lands in the design",
    moveCabinet(spec, cabinet.id, nudgeTo(cabinet, "x", 1, 10)).cabinets[0]
      .position.x ===
      cabinet.position.x + 10,
    "the reflow used to pack the row, which swallowed the step on its way in",
  );

  check(
    "there is a pair of buttons for each of the three axes",
    AXES.length === 3 &&
      AXES.map(({ axis }) => axis).join("") === "xyz" &&
      AXES.every(({ towards }) => towards[0] !== towards[1]),
  );
  check(
    "and each direction is named for the room, not for the sign",
    AXES.every(({ towards }) =>
      towards.every((word) => word.length > 1 && !/^[+-]$/.test(word)),
    ),
    '"minus" means nothing to somebody looking at a wardrobe',
  );
}

// ---------------------------------------------------------------------------
// 10. What a keypress means
// ---------------------------------------------------------------------------

{
  const moves: [string, string, number][] = [
    ["ArrowLeft", "x", -1],
    ["ArrowRight", "x", 1],
    ["ArrowUp", "y", 1],
    ["ArrowDown", "y", -1],
    ["PageUp", "z", 1],
    ["PageDown", "z", -1],
  ];

  for (const [key, axis, direction] of moves) {
    const shortcut = readShortcut({ key });
    check(
      `${key} moves it ${direction > 0 ? "up" : "down"} the ${axis} axis`,
      shortcut?.kind === "move" &&
        shortcut.axis === axis &&
        shortcut.direction === direction,
      `got ${JSON.stringify(shortcut)}`,
    );
  }

  check(
    "Delete removes the selected cabinet",
    readShortcut({ key: "Delete" })?.kind === "delete",
  );
  check(
    "and so does Backspace, which is the key a laptop has",
    readShortcut({ key: "Backspace" })?.kind === "delete",
  );
  check(
    "Escape lets go of the selection",
    readShortcut({ key: "Escape" })?.kind === "deselect",
  );
  check(
    "Ctrl+Z undoes",
    readShortcut({ key: "z", ctrlKey: true })?.kind === "undo",
  );
  check(
    "and so does Cmd+Z, on a Mac",
    readShortcut({ key: "z", metaKey: true })?.kind === "undo",
  );
  check(
    "Ctrl+Shift+Z is left alone",
    readShortcut({ key: "z", ctrlKey: true, shiftKey: true }) === null,
    "that is redo everywhere else, and there is no redo here to give it",
  );
  check(
    "Ctrl+D duplicates, whatever case the key arrives in",
    readShortcut({ key: "d", ctrlKey: true })?.kind === "duplicate" &&
      readShortcut({ key: "D", metaKey: true })?.kind === "duplicate",
    "holding Shift-less Ctrl still sends 'd', but a caps-locked keyboard sends 'D'",
  );
  check(
    "Ctrl and an arrow are left to the browser",
    readShortcut({ key: "ArrowLeft", ctrlKey: true }) === null &&
      readShortcut({ key: "ArrowRight", metaKey: true }) === null,
    "that is jump-a-word and go-back-a-page, and they are not ours to take",
  );
  check(
    "anything unclaimed is left alone",
    readShortcut({ key: "Tab" }) === null &&
      readShortcut({ key: "a" }) === null &&
      readShortcut({ key: "Enter" }) === null,
    "swallowing Tab would trap the keyboard on the drawing",
  );

  check(
    "a key going into a text box is not a shortcut",
    typingInto({ tagName: "INPUT" }) &&
      typingInto({ tagName: "textarea" }) &&
      typingInto({ tagName: "SELECT" }),
    "Backspace in a cabinet's name would otherwise delete the cabinet",
  );
  check(
    "nor one going into something being edited in place",
    typingInto({ tagName: "DIV", isContentEditable: true }),
  );
  check(
    "a key on the drawing is",
    !typingInto({ tagName: "CANVAS" }) && !typingInto(null),
  );
}

// ---------------------------------------------------------------------------
// 11. The wiring of the pad and the keyboard
// ---------------------------------------------------------------------------

{
  const editor = code(EDITOR);

  check(
    "the pad is on the drawing, and only with something selected",
    /\{view === "solid" && selected \? \(/.test(editor),
    "three dimmed pairs of buttons with nothing selected is three controls that do nothing",
  );
  check(
    "it draws a pair for every axis",
    /\{AXES\.map\(\(\{ axis, label, towards \}\) => \(/.test(editor),
    "a hardcoded X and Y would be one edit away from disagreeing with the keyboard",
  );
  check(
    "a refused button carries its reason",
    /const blocked = nudgeBlocked\(selected, axis, direction\);/.test(editor) &&
      /label=\{\s*\n?\s*blocked \?\? /.test(editor) &&
      /disabled=\{blocked !== null\}/.test(editor),
    "a control that refuses and will not say why is what this whole change is about",
  );
  check(
    "the keyboard is listened to on the window",
    /window\.addEventListener\("keydown", onKeyDown\)/.test(editor) &&
      /window\.removeEventListener\("keydown", onKeyDown\)/.test(editor),
    "the model is a canvas that never takes focus, so a focused wrapper would never hear the key",
  );
  check(
    "and a field that wants the key gets it first",
    /if \(typingInto\(event\.target as HTMLElement \| null\)\) return;/.test(
      editor,
    ),
  );
  // Scoped to the handler. `preventDefault` appears twice more in this file —
  // once in the sheet's pointer drag — so a check over the whole of it passed
  // with the keyboard's own call deleted, which is the second copy trap
  // AGENTS.md names, caught by mutating the code it is about.
  const onKeyDown = functionText(editor, "onKeyDown", "    ");

  check(
    "the handler is where the check is looking",
    onKeyDown.includes("readShortcut(event)") &&
      !onKeyDown.includes("pointermove"),
    `${onKeyDown.length} characters`,
  );
  check(
    "a claimed key does not also reach the browser",
    /if \(!selected\) return;\s*\n\s*event\.preventDefault\(\);/.test(onKeyDown),
    "an arrow that moves a cabinet and also scrolls the page is one keypress doing two things",
  );
  check(
    "including the undo, which is claimed before the selection is checked",
    /if \(!onUndo \|\| !canUndo\) return;\s*\n\s*event\.preventDefault\(\);/.test(
      onKeyDown,
    ),
    "Ctrl+Z would otherwise undo the studio's change and then the browser's",
  );
  check(
    "undo works with nothing selected",
    /if \(shortcut\.kind === "undo"\) \{/.test(editor) &&
      /if \(!selected\) return;/.test(editor),
    "the change being taken back need not have been made to the selected cabinet",
  );
  check(
    "deleting lets go of what it deleted",
    /setSelectedId\(null\);\s*\n\s*onChange\(removeCabinet\(spec, selected\.id\)\);/.test(
      editor,
    ),
    "a selection pointing at a cabinet that no longer exists leaves the panel editing nothing",
  );
  check(
    "the keyboard refuses the steps the buttons refuse",
    /if \(nudgeBlocked\(selected, axis, direction, step\)\) return false;/.test(
      editor,
    ),
    "a held PageDown would otherwise fill the undo history with changes that changed nothing",
  );
}

// ---------------------------------------------------------------------------
// 12. A drawer height you can clear
// ---------------------------------------------------------------------------

{
  const spec = tvUnitExample();
  const cabinet = spec.cabinets[0];
  const bay = cabinet.bays.find((entry) => entry.fitting.kind === "drawers");

  if (!bay) {
    failures.push("the TV unit has no drawer bay to check against");
  } else {
    const opening = openingHeightOf(cabinet, spec.carcass.board.thickness);
    const before =
      bay.fitting.kind === "drawers"
        ? frontHeightsOf(bay.fitting, opening)
        : [];

    // This is the bug, stated as a fact about the operation rather than about
    // the control: writing what an emptied box produces does not leave the
    // drawers alone. The control's job is never to write it.
    const cleared = setDrawerHeight(spec, cabinet.id, bay.id, 0, 0);
    const clearedBay = cleared.cabinets[0].bays.find(
      (entry) => entry.id === bay.id,
    );
    const after =
      clearedBay && clearedBay.fitting.kind === "drawers"
        ? frontHeightsOf(clearedBay.fitting, opening)
        : [];

    check(
      "writing the zero an emptied box produces would wreck the stack",
      after.length > 0 && after.join() !== before.join(),
      `${before.join("/")} -> ${after.join("/")} — which is why the field must not commit an empty draft`,
    );

    const field = code(FIELD);
    const panel = code(PANEL);

    // Scoped to the drawer list. The panel has other handlers that legitimately
    // write on every event — a checkbox, a select — and a check over the whole
    // file would be satisfied by any of them.
    const drawers = functionText(panel, "DrawerList");

    check(
      "the drawer list is where the check is looking",
      drawers.includes("setDrawerHeight("),
      "an empty body would make every assertion below it vacuous",
    );
    check(
      "so the drawer height is the studio's own measurement box",
      /<LengthInput/.test(drawers) &&
        /export function LengthInput\(/.test(field),
      "a plain type=number writing through on every keystroke is what made it look editable and refuse to be edited",
    );
    check(
      "and there is no raw number input left in the panel",
      !/type="number"/.test(panel),
      "one of the two would keep the old behaviour and nobody would know which",
    );
    check(
      "an empty box commits nothing",
      /if \(draft\.trim\(\) !== "" && Number\.isFinite\(next\)\) onChange\(clamp\(next\)\);/.test(
        field,
      ),
      "Number(\"\") is 0, and 0 clamps to the minimum front height",
    );
    check(
      "the drawer height is written on blur, not on every keystroke",
      /onBlur=\{commit\}/.test(field) && !/onChange=\{\(event\)/.test(drawers),
    );
    check(
      "the label still says which drawer it is",
      /label=\{`Drawer \$\{index \+ 1\} front height`\}/.test(drawers),
      "a row of boxes reading only 'height in millimetres' is unusable with a screen reader",
    );
    check(
      "and the one box is used by the labelled field too",
      /<LengthInput\s/.test(field),
      "two copies of the draft logic is one edit away from the two behaving differently",
    );
  }
}

// ---------------------------------------------------------------------------
// 13. How tall the drawing is on a phone
// ---------------------------------------------------------------------------

{
  check(
    "the drawing keeps most of the screen",
    VIEWPORT_SHARE > 0.5 && VIEWPORT_SHARE < 0.85,
    `${VIEWPORT_SHARE} — all of it hides the controls, half of it is a band`,
  );

  // A typical phone: the shell's column is the window less the top bar and the
  // tab strip, and the navigation bar covers the last 56 of it.
  const usable = usableHeight(700, 56);
  check(
    "what the navigation bar covers is not counted as room",
    usable === 644,
    `${usable}`,
  );
  check(
    "and a bar that covers nothing takes nothing",
    usableHeight(700, 0) === 700,
  );
  check(
    "a bar taller than the column cannot make the room negative",
    usableHeight(200, 500) === 0,
  );

  const tall = stickyViewportHeight(usable);
  check(
    "the drawing takes its share of what is left",
    tall === Math.round(644 * VIEWPORT_SHARE),
    `${tall} of ${usable}`,
  );
  check(
    "and the controls keep the rest",
    usable - tall >= MIN_CONTROLS_PEEK,
    `${usable - tall} left for the controls`,
  );

  // A short screen: the share alone would leave the controls a sliver.
  //
  // 132 written out rather than `MIN_CONTROLS_PEEK`, deliberately. Asserting a
  // constant against itself passes however the constant is set, and this one
  // was wrong: at 108 the floor below always won first and the rule governed
  // nothing at all. The literal is what noticed.
  const short = stickyViewportHeight(400);
  check(
    "on a short screen the controls are still visible under it",
    400 - short >= 132,
    `${short} of 400 leaves ${400 - short} — a control nobody can see is a control nobody uses`,
  );
  check(
    "and the peek is big enough to take effect before the floor does",
    // The clamp applies below `PEEK / (1 - SHARE)` and the floor takes over
    // below `MIN_VIEWPORT + PEEK`. For the clamp to govern anything at all
    // there has to be room between the two, which rearranges to this.
    MIN_CONTROLS_PEEK * (VIEWPORT_SHARE / (1 - VIEWPORT_SHARE)) > MIN_VIEWPORT,
    `${MIN_CONTROLS_PEEK} against a ${MIN_VIEWPORT} floor at a ${VIEWPORT_SHARE} share — below this it is decoration`,
  );
  check(
    "and the drawing is still worth looking at",
    stickyViewportHeight(330) >= MIN_VIEWPORT,
    `${stickyViewportHeight(330)} — below this it stops being a drawing`,
  );
  check(
    "nothing is asked for before there is anything to measure",
    stickyViewportHeight(0) === 0 && stickyViewportHeight(-50) === 0,
    "a height of zero is what leaves the CSS fallback in place for the first paint",
  );
  check(
    "a taller screen gives the drawing more, not a capped amount",
    stickyViewportHeight(1200) === Math.round(1200 * VIEWPORT_SHARE),
    `${stickyViewportHeight(1200)} of 1200 — a fixed pixel cap is what made the drawing a strip in the first place`,
  );

  check(
    "the bar's overlap is measured, not assumed",
    coveredAtBottom({ top: 100, bottom: 800 }, { top: 744, bottom: 800 }) === 56,
  );
  check(
    "a bar that does not reach the column covers none of it",
    coveredAtBottom({ top: 100, bottom: 700 }, { top: 744, bottom: 800 }) === 0,
  );
  check(
    "and no bar at all covers none of it",
    coveredAtBottom({ top: 100, bottom: 800 }, null) === 0,
    "the navigation bar is lg:hidden, so on a desktop there is nothing to find",
  );
}

// ---------------------------------------------------------------------------
// 14. The phone scrolls, and the drawing stays
// ---------------------------------------------------------------------------

{
  const editor = code(EDITOR);
  const workspace = code(
    "src/features/berchuma-studio/components/studio-workspace.tsx",
  );
  const panel = code(PANEL);
  const model = code(MODEL);

  check(
    "the design column is allowed to be taller than the window",
    /flowing \? "min-h-full" : "h-full"/.test(workspace),
    "capped at h-full there is nothing for the chrome above it to scroll away into",
  );
  check(
    "and only on the design tab",
    /const flowing = tab === "design";/.test(workspace),
    "the chat's message box is pinned to the bottom of a fixed-height column and needs to stay that way",
  );
  check(
    "the column stops being allowed to collapse to the window",
    /flowing \? "" : "min-h-0"/.test(workspace),
    "min-h-0 lets a flex child be shorter than its content, which is the opposite of what makes a page long",
  );
  check(
    "the studio is a fixed-height application again on a wide screen",
    /"flex flex-col @4xl\/ws:h-full"/.test(workspace),
  );

  check(
    "the drawing sticks to the top of the page",
    /"sticky top-0 z-10 w-full bg-background"/.test(editor),
    "this is the whole request: the chrome scrolls away and the model does not",
  );
  check(
    "it is sticky, not fixed",
    !/\bfixed inset-0\b/.test(editor),
    "fixed is relative to the window and would sit over the top bar and the tab strip",
  );
  check(
    "its height comes through a custom property",
    /"--studio-viewport": `\$\{viewportHeight\}px`/.test(editor) &&
      /h-\[var\(--studio-viewport,60dvh\)\]/.test(editor),
    "a plain inline height beats every stylesheet rule, so the desktop class could never take it back",
  );
  check(
    "which the wide layout overrides",
    /@4xl\/ws:relative @4xl\/ws:z-auto @4xl\/ws:h-full/.test(editor),
    "the desktop row is unchanged and must stay unchanged",
  );
  check(
    "the height is measured rather than calculated from the screen",
    /const viewportHeight = useViewportHeight\(root\);/.test(editor) &&
      /ref=\{setRoot\}/.test(editor),
  );
  check(
    "the fallback before the first measurement is a viewport unit that tracks the phone",
    /60dvh/.test(editor) && !/60vh/.test(editor),
    "100vh on a phone is the viewport with the address bar hidden — the largest it ever gets",
  );

  check(
    "the controls are one panel, under the drawing or beside it",
    (editor.match(/<ControlPanel/g) ?? []).length === 1,
    `${(editor.match(/<ControlPanel/g) ?? []).length} — there used to be a column and a second copy in the sheet`,
  );
  check(
    "the sheet that used to cover the model is gone",
    !/panelOpen/.test(editor) && !/sheet-height/.test(editor),
    "editing and watching were two states of one screen while the controls came up over the drawing",
  );
  check(
    "and nothing still imports the module it was built on",
    !/sheet-height/.test(workspace) && !/sheet-height/.test(panel),
  );
  check(
    "the controls do not scroll inside the page that is scrolling them",
    /"@4xl\/ws:h-full @4xl\/ws:overflow-y-auto @4xl\/ws:overscroll-contain"/.test(
      panel,
    ) && !/^\s*"flex h-full flex-col overflow-y-auto/m.test(panel),
    "a second scrolling region inside the first is the nested trap: the finger moves the controls and the page stays put",
  );
  check(
    "the bottom navigation is still cleared",
    /@4xl\/ws:pb-content-safe lg:pb-0/.test(panel),
    "the column that scrolls reserves it; on a phone that is the page, which already does",
  );

  // Scoped to the component. `updateProjectionMatrix` is also called by the
  // camera rig further up the file, so a check over the whole of it stayed
  // green with this one deleted — the second copy trap, again.
  const reframe = functionText(model, "Reframe");

  check(
    "the resize component is where the check is looking",
    reframe.includes("size.width") &&
      reframe.includes("store.getState()") &&
      !reframe.includes("OrbitControls"),
    `${reframe.length} characters`,
  );
  check(
    "the camera follows the box when the box changes size",
    /<Reframe \/>/.test(model) &&
      /camera\.aspect = size\.width \/ size\.height;/.test(reframe) &&
      /camera\.updateProjectionMatrix\(\);/.test(reframe),
    "the drawing's height moves every time the phone's address bar does",
  );
  check(
    "and something repaints after it",
    /invalidate\(\);\s*\n\s*\}, \[size\.width, size\.height, store\]\);/.test(
      reframe,
    ),
    "frameloop is demand, so a resize with no render leaves the last frame stretched across the new box",
  );
  check(
    "a canvas of no size is not divided by",
    /if \(size\.width === 0 \|\| size\.height === 0\) return;/.test(reframe),
  );
}

// ---------------------------------------------------------------------------
// 15. The measuring itself
// ---------------------------------------------------------------------------

{
  const hook = code(
    "src/features/berchuma-studio/hooks/use-viewport-height.ts",
  );

  check(
    "the column that actually scrolls is the one measured",
    /element\.closest\("main"\) \?\? document\.documentElement/.test(hook),
    "the studio is inside the shell's workspace column on this route and could be somewhere else on the next",
  );
  check(
    "the navigation bar is found by a name it publishes",
    /querySelector<HTMLElement>\("\[data-bottom-nav\]"\)/.test(hook) &&
      /data-bottom-nav=""/.test(
        code("src/components/shell/bottom-nav.tsx"),
      ),
    "re-deriving --bottom-nav-h and its env() by hand somewhere else is how the two get out of step",
  );
  check(
    "it is re-found on every measurement",
    /function measure\(\) \{[\s\S]*?querySelector/.test(hook),
    "the bar is mounted by a different part of the tree and may not exist when this effect first runs",
  );
  check(
    "the column is watched for resizing",
    /new ResizeObserver\(measure\)/.test(hook) &&
      /observer\.observe\(scrollport\)/.test(hook),
  );
  check(
    "so is the phone's own viewport",
    /window\.visualViewport\?\.addEventListener\("resize", measure\)/.test(hook),
    "on iOS the address bar collapsing fires only there, and window resize does not report it",
  );
  check(
    "and everything it listened to is let go of",
    /observer\.disconnect\(\)/.test(hook) &&
      /window\.removeEventListener\("resize", measure\)/.test(hook) &&
      /window\.visualViewport\?\.removeEventListener\("resize", measure\)/.test(
        hook,
      ),
  );
}

// ---------------------------------------------------------------------------
// 16. One scroller in the design column, not two
//
// This is the second time the same fault has been reported, and the second
// time it arrived through a component nobody had thought about. When the
// design tab became a scrolling page, `ControlPanel` was scoped to scroll only
// where it is a column of its own — and `StartPanel`, which renders in exactly
// the same slot, was left as `h-full overflow-y-auto`. In a column that is no
// longer a fixed height that is a second scroll container inside the first:
// measured in Chromium, the page ran out after 64 px with 372 px of cards
// trapped inside the panel and no gesture that reached them.
//
// So the rule is checked, not the instance. Everything that renders in the
// design column scrolls only at `@4xl/ws`, where it really is its own column.
// The chat and the price are deliberately not in this list: they are
// fixed-height columns on every screen, and their own scroller is correct.
// ---------------------------------------------------------------------------

{
  const inTheDesignColumn = [
    ["the start panel", "src/features/berchuma-studio/components/start-panel.tsx"],
    ["the control panel", PANEL],
    ["the editor", EDITOR],
  ] as const;

  for (const [label, path] of inTheDesignColumn) {
    const source = code(path);

    // Every `overflow-y-auto` in the file, with whatever variant prefixes it.
    const scrollers = source.match(/[\w@/:[\]-]*overflow-y-auto/g) ?? [];
    const unscoped = scrollers.filter((utility) => !utility.includes("@4xl/ws:"));

    check(
      `${label} scrolls only where it is a column of its own`,
      unscoped.length === 0,
      `${unscoped.join(", ")} — an unscoped scroller inside the scrolling page traps its own content`,
    );
  }

  const start = code("src/features/berchuma-studio/components/start-panel.tsx");
  check(
    "the start panel is found, and really does have a scroller to scope",
    /overflow-y-auto/.test(start),
    "if this file stops having one the check above is vacuous",
  );
  check(
    "and its height is scoped with it",
    !/(^|\s)h-full/.test(
      /className=\{cn\(\s*"mx-auto[^)]*\)\}/.exec(start)?.[0] ?? "h-full",
    ),
    "a height that survives without the scroll is a box that clips with nothing to scroll it",
  );

  // The two that are meant to keep their own scroller, so that scoping them by
  // accident is caught as well. A chat whose column grows with its messages
  // puts the message box below the fold.
  for (const [label, path] of [
    ["the chat", "src/features/berchuma-studio/components/chat/design-chat.tsx"],
    ["the price column", "src/features/berchuma-studio/components/studio-workspace.tsx"],
  ] as const) {
    check(
      `${label} keeps its own scroller`,
      /overflow-y-auto/.test(code(path)),
      path,
    );
  }
}

// ---------------------------------------------------------------------------
// 17. The move pad does not hide what it moves
// ---------------------------------------------------------------------------

{
  const editor = code(EDITOR);
  const pad = functionText(editor, "NudgeButton");

  check(
    "the pad is not a filled card over the drawing",
    /<div className="pointer-events-auto flex flex-col gap-1 p-1">/.test(editor),
    "a filled, blurred panel on a light theme is an opaque slab over the cabinet the buttons move",
  );
  // Scoped to the pad. "Show inside" is also an overlay and legitimately keeps
  // its frosted card — a file-wide search for the blur matched that instead
  // and failed on correct code.
  const padStart = editor.indexOf('{view === "solid" && selected ? (');
  const padEnd = editor.indexOf("{NUDGE_STEP} mm", padStart);
  const padRegion =
    padStart === -1 || padEnd === -1 ? "" : editor.slice(padStart, padEnd);

  check(
    "the pad region is where the check is looking",
    padRegion.includes("AXES.map") && !padRegion.includes("Show inside"),
    `${padRegion.length} characters`,
  );
  check(
    "and it no longer frosts the drawing behind it",
    !/backdrop-blur-xl/.test(padRegion),
    "backdrop-blur-xl at this size reads as frosted glass, which is another way of saying opaque",
  );
  check(
    "each button is translucent enough to see the carcass through",
    /bg-background\/40 backdrop-blur-\[2px\]/.test(pad),
    pad.slice(0, 60),
  );
  check(
    "and firms up under the finger, so a press still reads",
    /active:bg-background\/85/.test(pad),
    "at 40 per cent all the time there is nothing to see when it is pressed",
  );
  check(
    "the axis letters get their own backing now they sit on the drawing",
    /w-4 rounded bg-background\/45[^"]*backdrop-blur-\[2px\]/.test(editor),
    "a grey glyph on a grey carcass is nothing",
  );
}

// ---------------------------------------------------------------------------
// 18. New project, and a way out
// ---------------------------------------------------------------------------

{
  const workspace = code(
    "src/features/berchuma-studio/components/studio-workspace.tsx",
  );
  const publish = code("src/features/berchuma-studio/components/publish-bar.tsx");

  check(
    "there is a way to start again",
    /New project/.test(workspace) && /design\.clear\(\)/.test(workspace),
    "the only route to a second design was the back button, which is the gesture the draft exists to survive",
  );
  // The whole guard, not the word `confirm`. Replacing the condition with
  // something false leaves the call in the file and the branch dead, and a
  // search for the identifier passes on a button that discards without asking.
  check(
    "it asks before throwing the current one away",
    /if \(\s*unsaved &&\s*!window\.confirm\([\s\S]{0,300}?\)\s*\) \{\s*return;\s*\}/.test(
      workspace,
    ),
    "the refusal has to stop it, not merely be present",
  );
  check(
    "and only when there is something to lose",
    /const unsaved = Boolean\(design\.spec\);/.test(workspace),
    "asking on an empty studio is a dialogue about nothing",
  );
  check(
    "and clears the stored draft with it",
    /if \(key\) clearDraft\(window\.localStorage, key\);\s*\n\s*setDismissed\(true\);\s*\n\s*design\.clear\(\);/.test(
      workspace,
    ),
    "a draft left behind has the restore bar offer the discarded design straight back, which looks broken",
  );

  check(
    "there is a way out of the studio",
    /Exit\n/.test(publish) && /const exit = async \(\) => \{/.test(publish),
  );
  check(
    "which saves anything outstanding on the way",
    /if \(!target \|\| dirty\) \{/.test(publish),
    "leaving after an edit would otherwise land on a page showing an older wardrobe",
  );
  check(
    "then goes to this design's own page",
    /router\.push\(`\/designs\/\$\{target\.slug\}`\)/.test(publish),
  );
  check(
    "and does not leave when the save failed",
    /\} catch \(problem\) \{[\s\S]{0,200}?setBusy\(null\);\s*\n\s*\}\s*\n\s*\};\s*\n\s*const publish/.test(
      publish,
    ),
    "navigating past a failed save is how the work gets lost",
  );
  check(
    "Exit is offered before the design has ever been saved",
    !/\{saved \? \([\s\S]{0,120}onClick=\{exit\}/.test(publish),
    "a link that only appears once you have saved is no use at the moment you want to leave",
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
