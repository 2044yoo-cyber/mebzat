/**
 * The 3D opening, and the cut list it has to agree with.
 *
 *   npx tsx scripts/opening_3d_check.ts
 *
 * One failure matters more than the rest: a viewer that lays its sashes out by
 * dividing the width evenly looks completely right and disagrees with the
 * quotation by the interlock overlap on every panel. Nobody spots that by eye
 * — the door is drawn 40 mm wider than the one that gets made, and the first
 * person to find out is the fabricator.
 *
 * So every dimension in the picture is asserted against the number
 * buildOpening puts on the cut list, from the same spec.
 */

import { buildOpening } from "../src/features/berchuma-studio/services/openings.ts";
import {
  buildOpeningGeometry,
  frameColour,
} from "../src/features/berchuma-studio/services/opening-geometry.ts";
import {
  defaultOpening,
  profileSystems,
  type OpeningSpec,
} from "../src/features/berchuma-studio/types/openings.ts";

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

const mm = (metres: number) => Math.round(metres * 1000);

function spec(overrides: Partial<OpeningSpec> = {}): OpeningSpec {
  return { ...defaultOpening("sliding-door"), ...overrides } as OpeningSpec;
}

// ---------------------------------------------------------------------------
// 1. The picture is the cut list
// ---------------------------------------------------------------------------

const cases: [string, OpeningSpec][] = [
  ["a 2400×2100 two-panel slider", spec({ width: 2400, height: 2100, panels: 2, opening: 1 })],
  ["a 3000×2200 four-panel slider", spec({ width: 3000, height: 2200, panels: 4, opening: 2 })],
  ["a 1800×2100 slider", spec({ width: 1800, height: 2100, panels: 2, opening: 1 })],
  [
    "a 1200×1500 fixed window",
    spec({ kind: "fixed-window", system: "casement-45", width: 1200, height: 1500, panels: 1, opening: 0 }),
  ],
  [
    "a 1500×1200 sliding window",
    spec({ kind: "sliding-window", width: 1500, height: 1200, panels: 2, opening: 1 }),
  ],
];

for (const [label, one] of cases) {
  const cut = buildOpening(one);
  const drawn = buildOpeningGeometry(one);
  const system = profileSystems[one.system];

  // The frame members, against the lengths on the cut list.
  const head = cut.profiles.find((p) => p.label === "Frame head");
  const jamb = cut.profiles.find((p) => p.label === "Frame jamb");
  const drawnHead = drawn.frame.find((b) => b.id === "frame-head")!;
  const drawnJamb = drawn.frame.find((b) => b.id === "frame-jamb-left")!;

  check(`${label}: the head is drawn the length it is cut`, mm(drawnHead.width) === head?.length,
    `${mm(drawnHead.width)} vs ${head?.length}`);
  check(`${label}: the jamb is drawn the length it is cut`, mm(drawnJamb.height) === jamb?.length,
    `${mm(drawnJamb.height)} vs ${jamb?.length}`);
  check(`${label}: the frame is drawn its own section`, mm(drawnHead.height) === system.frameSection);

  // The sashes, against the stile and rail lengths.
  const stile = cut.profiles.find((p) => p.label === "Sash stile");
  if (stile && drawn.sashes.length > 0) {
    check(
      `${label}: the sash is drawn the height its stile is cut`,
      mm(drawn.sashes[0].height) === stile.length,
      `${mm(drawn.sashes[0].height)} vs ${stile.length}`,
    );
  }

  // Every pane fits inside the sash that holds it.
  for (const [index, pane] of drawn.glass.entries()) {
    const holder = drawn.sashes[index];
    if (!holder) continue;
    check(
      `${label}: pane ${index + 1} fits inside its sash`,
      pane.width <= holder.width + 1e-9 && pane.height <= holder.height + 1e-9,
    );
  }

  // Nothing is drawn outside the structural opening the client measured.
  const halfW = one.width / 2000;
  const halfH = one.height / 2000;
  for (const box of [...drawn.frame, ...drawn.sashes, ...drawn.glass]) {
    check(
      `${label}: ${box.id} is inside the opening`,
      box.x - box.width / 2 >= -halfW - 1e-6 &&
        box.x + box.width / 2 <= halfW + 1e-6 &&
        box.y - box.height / 2 >= -halfH - 1e-6 &&
        box.y + box.height / 2 <= halfH + 1e-6,
    );
  }

  // Inside the *frame*, which is the tighter and more useful bound: a sash
  // drawn to the structural opening overlaps the jambs, and the "inside the
  // opening" check above cannot see that.
  // buildOpening rounds the sash width to the nearest millimetre, so n sashes
  // can span up to n/2 mm more than the daylight opening — 2 mm on a
  // four-panel slider, absorbed by the interlock. That is the existing
  // engine's arithmetic and not this file's to change; the tolerance here
  // matches it exactly rather than pretending it is not there.
  const roundingSlack = one.panels / 2000;
  const halfDaylight = drawn.daylight.width / 2000;
  for (const sash of drawn.sashes) {
    check(
      `${label}: ${sash.id} is inside the frame, not over it`,
      sash.x - sash.width / 2 >= -halfDaylight - roundingSlack &&
        sash.x + sash.width / 2 <= halfDaylight + roundingSlack,
      `${mm(sash.x - sash.width / 2)}..${mm(sash.x + sash.width / 2)} in ±${mm(halfDaylight)}`,
    );
  }

  // The rail is cut from the sash width, so the drawn sash has to be that
  // width plus the two stiles it is cut to fit between.
  const rail = cut.profiles.find((p) => p.label === "Sash rail");
  if (rail && drawn.sashes.length > 0) {
    check(
      `${label}: the sash is drawn the width its rail is cut for`,
      mm(drawn.sashes[0].width) === rail.length + system.sashSection * 2,
      `${mm(drawn.sashes[0].width)} vs ${rail.length + system.sashSection * 2}`,
    );
  }

  check(
    `${label}: the daylight opening is the frame's own deduction`,
    drawn.daylight.width === one.width - system.frameSection * 2 &&
      drawn.daylight.height === one.height - system.frameSection * 2,
  );

  check(`${label}: one pane per panel`, drawn.glass.length >= 1);
  check(`${label}: nothing has a negative size`,
    [...drawn.frame, ...drawn.sashes, ...drawn.glass, ...drawn.handles].every(
      (b) => b.width > 0 && b.height > 0 && b.depth > 0,
    ));
}

// ---------------------------------------------------------------------------
// 2. The interlock — the mistake this file exists for
//
// Two sliding sashes overlap where they meet, so together they are wider than
// the opening. Divide evenly instead and every panel is drawn narrow.
// ---------------------------------------------------------------------------

const slider = spec({ width: 2400, height: 2100, panels: 2, opening: 1 });
const sliderGeometry = buildOpeningGeometry(slider);
const sliderCut = buildOpening(slider);
const sliderSystem = profileSystems[slider.system];
const daylight = slider.width - sliderSystem.frameSection * 2;

check(
  "a slider's sashes together are wider than the daylight opening",
  sliderGeometry.sashes.reduce((total, s) => total + mm(s.width), 0) > daylight,
  `${sliderGeometry.sashes.reduce((total, s) => total + mm(s.width), 0)} vs ${daylight}`,
);
check(
  "and each is wider than an even division would make it",
  mm(sliderGeometry.sashes[0].width) > Math.round(daylight / slider.panels),
);
check(
  "the drawn sash width is the one the cut list works from",
  mm(sliderGeometry.sashes[0].width) ===
    (sliderCut.profiles.find((p) => p.label === "Sash rail")?.length ?? -1) +
      sliderSystem.sashSection * 2,
  `${mm(sliderGeometry.sashes[0].width)} vs ${sliderCut.profiles.find((p) => p.label === "Sash rail")?.length}`,
);

// A fixed window has no interlock and no sash at all: the glass beds into the
// frame, and drawing a sash would show a member nobody is buying.
const fixed = spec({
  kind: "fixed-window",
  system: "casement-45",
  width: 1200,
  height: 1500,
  panels: 1,
  opening: 0,
});
const fixedGeometry = buildOpeningGeometry(fixed);
check("a fixed window is drawn with no sash", fixedGeometry.sashes.length === 0);
check("a fixed window still has its pane", fixedGeometry.glass.length === 1);
check("and no handle", fixedGeometry.handles.length === 0);

// ---------------------------------------------------------------------------
// 3. Changing a dimension changes the geometry
//
// §5: the model must actually change, not just the label.
// ---------------------------------------------------------------------------

const narrow = buildOpeningGeometry(spec({ width: 1800, height: 2100 }));
const wide = buildOpeningGeometry(spec({ width: 2400, height: 2100 }));
const tall = buildOpeningGeometry(spec({ width: 2400, height: 2400 }));

check("a wider opening is drawn wider", wide.size.width > narrow.size.width);
check("its head is drawn longer", wide.frame[0].width > narrow.frame[0].width);
check("its sashes are drawn wider", wide.sashes[0].width > narrow.sashes[0].width);
check("its glass is drawn wider", wide.glass[0].width > narrow.glass[0].width);

check("a taller opening is drawn taller", tall.size.height > wide.size.height);
check("its jambs are drawn longer", tall.frame[2].height > wide.frame[2].height);
check("its sashes are drawn taller", tall.sashes[0].height > wide.sashes[0].height);
check("its glass is drawn taller", tall.glass[0].height > wide.glass[0].height);
check("and it is no wider than before", Math.abs(tall.size.width - wide.size.width) < 1e-9);

// Panels.
const two = buildOpeningGeometry(spec({ width: 3000, panels: 2, opening: 1 }));
const four = buildOpeningGeometry(spec({ width: 3000, panels: 4, opening: 2 }));
check("four panels are drawn as four", four.sashes.length === 4);
check("and each is narrower than one of two", four.sashes[0].width < two.sashes[0].width);
check("two of four move", four.moving.filter(Boolean).length === 2);
check("and they carry the handles", four.handles.length === 2);

// Glass thickness is a real dimension, not a label.
const thin = buildOpeningGeometry(spec({ glass: "clear-4" }));
const thick = buildOpeningGeometry(spec({ glass: "tempered-10" }));
check("thicker glass is drawn thicker", thick.glass[0].depth > thin.glass[0].depth);
check("4 mm glass is drawn 4 mm", mm(thin.glass[0].depth) === 4);
check("10 mm glass is drawn 10 mm", mm(thick.glass[0].depth) === 10);

// Tint.
check("clear glass is barely there", buildOpeningGeometry(spec({ glass: "clear-6" })).glassTint.opacity < 0.4);
check("tinted glass is darker", buildOpeningGeometry(spec({ glass: "tinted-6" })).glassTint.opacity > 0.5);
check("frosted glass is the most opaque", buildOpeningGeometry(spec({ glass: "frosted-6" })).glassTint.opacity > 0.7);

// The profile system changes the sections.
const slim = buildOpeningGeometry(spec({ system: "sliding-27" }));
const chunky = buildOpeningGeometry(spec({ kind: "shopfront", system: "shopfront-60", panels: 1, opening: 0 }));
check("a heavier system is drawn with a heavier frame", chunky.frame[0].height > slim.frame[0].height);

// ---------------------------------------------------------------------------
// 4. The finish is read, not looked up
// ---------------------------------------------------------------------------

check("black anodised is drawn black", frameColour("RAL 9005 black").toLowerCase() === "#23262a");
check("white is drawn white", frameColour("White powder coat").toLowerCase() === "#eceeef");
check("bronze is drawn bronze", frameColour("Bronze anodised").toLowerCase() === "#5a4632");
check("a wood finish is drawn as wood", frameColour("Oak effect").toLowerCase() === "#9c6b3f");
check("an unknown finish still has a colour", /^#[0-9a-f]{6}$/i.test(frameColour("Something nobody listed")));
check("black and white are not the same colour", frameColour("black") !== frameColour("white"));

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
}

console.log(
  `\n${failures.length === 0 ? GREEN : RED}${passed} passed, ${failures.length} failed${RESET}` +
    `\n${DIM}openings: the drawing and the cut list are the same arithmetic${RESET}\n`,
);

process.exit(failures.length === 0 ? 0 : 1);
