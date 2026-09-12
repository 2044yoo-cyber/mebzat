/**
 * The watermark is in the pixels, and the phone number is never a default.
 *
 *   npx tsx scripts/watermark_check.ts
 *
 * ## What this is for
 *
 * Two claims are being made to the people who upload photographs of their
 * work, and both are the kind that is easy to half-implement:
 *
 *   1. The mark survives a download. A watermark drawn in CSS does not — the
 *      file behind it is the clean original and one right-click gets it. So
 *      the assertions below re-encode real images and compare bytes and
 *      pixels, not markup.
 *   2. Their phone number is not published unless they asked for it. That is
 *      one boolean away from being wrong, and wrong in a way nobody can undo
 *      once the copies have spread.
 *
 * The renders here are the real `applyWatermark` on real bytes, so a change
 * that breaks the drawing fails this script rather than being noticed by
 * somebody a month later looking at their own stolen photograph.
 */

import "./lib/allow-server-only.ts";

import { readFileSync } from "node:fs";
import sharp from "sharp";

import { applyWatermark } from "../src/lib/images/watermark.ts";
import {
  MODERATION_CATEGORIES,
  REPORT_CATEGORIES,
} from "../src/lib/moderation/types.ts";
import { nextLevel } from "../src/lib/moderation/strikes.ts";
import {
  DEFAULT_WATERMARK,
  normaliseSettings,
  shouldWatermark,
  watermarkLines,
  WATERMARK_POSITIONS,
  type WatermarkPosition,
  type WatermarkSettings,
} from "../src/lib/images/watermark-settings.ts";

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
 * NOTE ON STRIPPING BLOCK COMMENTS
 *
 * `/\*` is only a comment opener when something that cannot be part of a token
 * precedes it. Without that guard the `/\*` inside a string literal — such as
 * `accept="image/\*"` — opens a comment that runs to the next real `*\/`,
 * silently deleting real code that no assertion can then see.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/(^|[\s;,{(=])\/\*[\s\S]*?\*\//g, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const IDENTITY = {
  username: "abelbuilds",
  full_name: "Abel Tesfaye",
  company_name: "Tesfaye Construction",
  phone: "+251911223344",
};

/** A flat grey field, so any painted pixel came from the mark. */
async function canvas(width = 1200, height = 800): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: "#c8c8c8" },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
}

/** Pixels that are no longer the flat background. */
async function ink(buffer: Buffer): Promise<number> {
  const { data } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  let painted = 0;
  for (let i = 0; i < data.length; i += 3) {
    if (Math.abs(data[i] - 200) > 25 || Math.abs(data[i + 1] - 200) > 25) painted += 1;
  }
  return painted;
}

/** The bounding box of everything painted, in image coordinates. */
async function box(buffer: Buffer) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  let minX = Infinity;
  let maxX = -1;
  let minY = Infinity;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * 3;
      if (Math.abs(data[i] - 200) > 25 || Math.abs(data[i + 1] - 200) > 25) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, maxX, minY, maxY, width: info.width, height: info.height };
}

function settings(overrides: Partial<WatermarkSettings> = {}): WatermarkSettings {
  return { ...DEFAULT_WATERMARK, ...overrides };
}

async function draw(overrides: Partial<WatermarkSettings> = {}, logo: Buffer | null = null) {
  return applyWatermark({
    bytes: await canvas(),
    mime: "image/jpeg",
    identity: IDENTITY,
    settings: settings(overrides),
    logo,
  });
}

async function main() {
  const base = await canvas();

  // -------------------------------------------------------------------------
  // 1. The mark is in the file, not over it
  // -------------------------------------------------------------------------

  const marked = await draw();
  check("a default upload comes back marked", marked?.watermarked === true);
  check(
    "and the bytes are not the bytes that went in",
    !!marked && !marked.buffer.equals(base),
    "the published file would be the clean original",
  );
  check("pixels were actually painted", !!marked && (await ink(marked.buffer)) > 200);

  // -------------------------------------------------------------------------
  // 2. The phone number
  //
  // The one setting that cannot be undone after the fact.
  // -------------------------------------------------------------------------

  check("the default settings do not draw a phone number", DEFAULT_WATERMARK.use_phone === false);
  check(
    "and the default text does not contain one",
    !watermarkLines(IDENTITY, DEFAULT_WATERMARK).join(" ").includes(IDENTITY.phone),
  );
  check(
    "an empty settings row still does not draw one",
    normaliseSettings({}).use_phone === false,
  );
  check(
    "and no row at all does not either",
    normaliseSettings(null).use_phone === false &&
      normaliseSettings(undefined).use_phone === false,
    "somebody who has never opened the settings screen",
  );
  check(
    "but they are still protected: no row means the default mark, not none",
    normaliseSettings(null).enabled &&
      normaliseSettings(null).use_username &&
      normaliseSettings(null).use_logo,
    "the common case is somebody who never opens the screen at all",
  );
  check(
    "nor does a row with a truthy value that is not true",
    normaliseSettings({ use_phone: 1 as unknown as boolean }).use_phone === false,
    "an opt-in should need an exact true",
  );
  check(
    "opting in draws it",
    watermarkLines(IDENTITY, settings({ use_phone: true })).join(" ").includes(IDENTITY.phone),
  );

  const without = await draw();
  const with_ = await draw({ use_phone: true });
  check(
    "and the drawn image differs, so the setting reaches the pixels",
    !!without && !!with_ && (await ink(with_.buffer)) > (await ink(without.buffer)),
  );

  // -------------------------------------------------------------------------
  // 3. Nothing to draw means nothing drawn
  //
  // Recording an image as watermarked when the mark did not render would be
  // the worst outcome: a false assurance rather than a missing feature.
  // -------------------------------------------------------------------------

  const off = await draw({ enabled: false });
  check("switching it off publishes the photograph unmarked", off?.watermarked === false);
  check("and paints nothing", !!off && (await ink(off.buffer)) === 0);

  const anonymous = await applyWatermark({
    bytes: base,
    mime: "image/jpeg",
    identity: {},
    settings: settings(),
    logo: null,
  });
  check("an account with no name or handle is not marked", anonymous?.watermarked === false);
  check("and nothing is painted on it", !!anonymous && (await ink(anonymous.buffer)) === 0);

  const nothingChosen = await draw({
    use_username: false,
    use_display_name: false,
    use_company: false,
    use_logo: false,
    use_phone: false,
  });
  check("choosing nothing to draw is not reported as marked", nothingChosen?.watermarked === false);

  // The failure is the point of the assertion, and the compositor logs it.
  const noise = console.error;
  console.error = () => {};
  const broken = await applyWatermark({
    bytes: new TextEncoder().encode("not an image"),
    mime: "image/jpeg",
    identity: IDENTITY,
    settings: settings(),
    logo: null,
  });
  console.error = noise;
  check("a file that is not an image returns nothing rather than throwing", broken === null);

  // -------------------------------------------------------------------------
  // 4. Placement
  // -------------------------------------------------------------------------

  const logo = await sharp({
    create: { width: 240, height: 240, channels: 3, background: "#e2001a" },
  })
    .png()
    .toBuffer();

  const placements: Record<
    Exclude<WatermarkPosition, "tiled">,
    (b: Awaited<ReturnType<typeof box>>) => boolean
  > = {
    bottom_right: (b) => b.minX > b.width / 2 && b.minY > b.height / 2,
    bottom_left: (b) => b.maxX < b.width / 2 && b.minY > b.height / 2,
    top_right: (b) => b.minX > b.width / 2 && b.maxY < b.height / 2,
    top_left: (b) => b.maxX < b.width / 2 && b.maxY < b.height / 2,
    center: (b) =>
      b.minX > b.width * 0.2 &&
      b.maxX < b.width * 0.8 &&
      b.minY > b.height * 0.3 &&
      b.maxY < b.height * 0.7,
  };

  for (const [position, sits] of Object.entries(placements)) {
    const result = await draw({ position: position as WatermarkPosition }, logo);
    check(
      `the mark sits ${position.replace("_", " ")}`,
      !!result && sits(await box(result.buffer)),
    );
  }

  const tiled = await draw({ position: "tiled" });
  check("a tiled mark is drawn", tiled?.watermarked === true);
  {
    const tiledBox = await box(tiled!.buffer);
    const cornerBox = await box((await draw())!.buffer);
    check(
      "and it spans the frame rather than sitting in a corner",
      tiledBox.maxX - tiledBox.minX > (cornerBox.maxX - cornerBox.minX) * 2 &&
        tiledBox.maxY - tiledBox.minY > (cornerBox.maxY - cornerBox.minY) * 2,
    );
  }

  check(
    "every position in the vocabulary was exercised",
    WATERMARK_POSITIONS.length === Object.keys(placements).length + 1,
  );

  // -------------------------------------------------------------------------
  // 5. Strength and size reach the output
  // -------------------------------------------------------------------------

  const faint = await draw({ opacity: 15 });
  const strong = await draw({ opacity: 80 });
  check(
    "a stronger setting paints more heavily",
    !!faint && !!strong && (await ink(strong.buffer)) > (await ink(faint.buffer)),
  );

  const small = await box((await draw({ size: "small" }))!.buffer);
  const large = await box((await draw({ size: "large" }))!.buffer);
  check(
    "a larger setting draws a larger mark",
    large.maxY - large.minY > small.maxY - small.minY,
  );

  // The last letter of "@abelbuilds" was being cut off, because the block was
  // sized from an estimate of 0.58em per character and the glyphs are wider
  // than that. Nothing above noticed: every string was clipped by the same
  // fraction, so every ratio between them stayed the same.
  //
  // A capital W is about 0.9em wide, so a layout that measures the text grows
  // by roughly that per extra character while one that trusts the estimate
  // cannot grow by more than 0.58em — the canvas it draws on is exactly that
  // wide. Comparing two handles that differ by four W's separates them.
  {
    const wide = async (handle: string) =>
      box(
        (await applyWatermark({
          bytes: await canvas(),
          mime: "image/jpeg",
          identity: { username: handle },
          settings: settings({ size: "small", position: "bottom_left", opacity: 80 }),
          logo: null,
        }))!.buffer,
      );
    const short = await wide("WWWWWW");
    const long = await wide("WWWWWWWWWW");
    const perCharacter = (long.maxX - long.minX - (short.maxX - short.minX)) / 4;
    const fontSize = Math.round(1200 * 0.028);
    check(
      "wide glyphs are not clipped to a guessed width",
      perCharacter > fontSize * 0.58 * 1.05,
      `${perCharacter.toFixed(1)}px per character at font-size ${fontSize}`,
    );
  }

  // -------------------------------------------------------------------------
  // 6. What else publishing does to the file
  // -------------------------------------------------------------------------

  const withGps = await sharp(await canvas(600, 400))
    // IFD3 is sharp's GPS directory. What is being proved is that the whole
    // EXIF block is dropped, GPS along with it.
    .withExif({ IFD0: { Copyright: "probe" }, IFD3: { GPSLatitudeRef: "N" } })
    .jpeg()
    .toBuffer();
  const stripped = await applyWatermark({
    bytes: withGps,
    mime: "image/jpeg",
    identity: IDENTITY,
    settings: settings(),
    logo: null,
  });
  const strippedMeta = await sharp(stripped!.buffer).metadata();
  check(
    "the published copy carries no EXIF, so no GPS trail",
    !strippedMeta.exif,
    "a photo taken at a client's house would publish its coordinates",
  );
  check("the original still had some", !!(await sharp(withGps).metadata()).exif);

  const huge = await applyWatermark({
    bytes: await canvas(4000, 3000),
    mime: "image/jpeg",
    identity: IDENTITY,
    settings: settings(),
    logo: null,
  });
  const hugeMeta = await sharp(huge!.buffer).metadata();
  check(
    "an oversized upload is capped rather than published at full size",
    (hugeMeta.width ?? 0) <= 2400 && (hugeMeta.height ?? 0) <= 2400,
    `got ${hugeMeta.width}x${hugeMeta.height}`,
  );
  check("and keeps its aspect ratio", hugeMeta.width === 2400 && hugeMeta.height === 1800);

  const png = await applyWatermark({
    bytes: await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#c8c8c8" },
    })
      .png()
      .toBuffer(),
    mime: "image/png",
    identity: IDENTITY,
    settings: settings(),
    logo: null,
  });
  check("a PNG is published as a PNG", png?.mime === "image/png");

  // -------------------------------------------------------------------------
  // 7. Which uploads are marked at all
  //
  // A mark on an avatar is noise; a mark across a floor plan's dimension line
  // makes the drawing wrong; a flat overlay on an equirectangular panorama is
  // a smear across the viewer's horizon.
  // -------------------------------------------------------------------------

  check("project photos are marked", shouldWatermark("project_image"));
  check("marketplace photos are marked", shouldWatermark("product_image"));
  check("property listing photos are marked", shouldWatermark("listing"));
  check("profile pictures are not", !shouldWatermark("profile_avatar"));
  check("cover images are not", !shouldWatermark("profile_cover"));
  check("company logos are not", !shouldWatermark("company"));
  check("panoramas are not", !shouldWatermark("panorama"));
  check("floor plans are not", !shouldWatermark("floor_plan"));

  // -------------------------------------------------------------------------
  // 8. The wiring
  //
  // All eight upload surfaces publish through `publishApproved`. Assertions
  // are scoped to that function rather than the file: `moderate()` above it
  // mentions the same tables, and a check that matched anywhere would keep
  // passing after the call it describes was deleted.
  // -------------------------------------------------------------------------

  const service = code("src/lib/moderation/service.ts");
  const publish = service.slice(service.indexOf("export async function publishApproved"));
  check("the publish path is the only seam", publish.length > 0);
  check(
    "publishing marks the image",
    /await watermarkForPublishing\(\{/.test(publish),
    "matched on the call, not on the import",
  );
  check(
    "the marked bytes are what get uploaded",
    /\.upload\(publicPath, marked \? marked\.buffer : download\.data/.test(publish),
    "uploading download.data would publish the clean original",
  );
  check(
    "the unmarked original is kept privately",
    /\.from\("image-originals"\)\s*\n?\s*\.upload\(/.test(publish),
  );
  check(
    "only when the published copy actually differs",
    /if \(marked\?\.watermarked\) \{/.test(publish),
  );
  check(
    "and the row records whether a mark was applied",
    /watermarked: marked\?\.watermarked \?\? false/.test(publish),
    "assuming true would be a false assurance",
  );
  {
    // Scoped to the call itself. `actual` is the sniffed type and appears
    // several times above; matching the identifier anywhere in the file would
    // survive the argument being removed.
    const upload = code("src/app/moderation/upload-actions.ts");
    const call = upload.slice(
      upload.indexOf("const publicUrl = await publishApproved("),
      upload.indexOf("if (!publicUrl)"),
    );
    check(
      "the sniffed type is passed through, not the filename's claim",
      // Still positional and still scoped to the call, but the record is now
      // optional (`?? null`) and a watermark fallback follows, because an
      // ordinary upload no longer depends on a moderation row existing.
      /publishApproved\(\s*supabase,\s*outcome\.itemId \?\? null,\s*input\.quarantinePath,\s*input\.publicBucket,\s*actual,/.test(
        call,
      ),
      "publishing a PNG named .jpg would encode and serve it wrongly",
    );
    check(
      "and the author is passed through for the mark when there is no record",
      /\{ userId: user\.id, contentType: input\.contentType \}/.test(call),
      "publishApproved reads the author off the moderation row; with none there is nothing to read, and an unmarked image is the watermark silently off",
    );
  }

  // -------------------------------------------------------------------------
  // 9. Where the phone number is read
  //
  // Exactly one place, under exactly one condition.
  // -------------------------------------------------------------------------

  const pipeline = code("src/lib/images/watermark-pipeline.ts");
  check(
    "the pipeline reads a phone only under the opt-in",
    /phone: settings\.use_phone \? \(profile\?\.phone \?\? null\) : null,/.test(pipeline),
    "passing it through and filtering later is one refactor from a leak",
  );
  check(
    "no other read of the profile phone",
    (pipeline.match(/profile\?\.phone/g) ?? []).length === 1,
  );
  check(
    "the settings row is made total before it is trusted",
    /normaliseSettings\(/.test(pipeline),
  );
  check(
    "and a missing row falls back to the defaults, not to nothing",
    /\{ \.\.\.DEFAULT_WATERMARK \}/.test(pipeline),
  );
  check(
    "an avatar is only fetched over https",
    /parsed\.protocol !== "https:"/.test(pipeline),
    "a database-supplied URL handed to a server-side fetch",
  );
  check("and the fetch cannot hang an upload", /AbortSignal\.timeout\(/.test(pipeline));

  const preview = code("src/app/api/settings/watermark/preview/route.ts");
  check(
    "the preview obeys the same rule",
    /phone: settings\.use_phone \? \(profile\?\.phone \?\? null\) : null,/.test(preview),
    "a preview that shows something the publisher would not draw is a lie",
  );
  check("and refuses an anonymous caller", /if \(!user\) \{/.test(preview));
  check("and is never cached", /"Cache-Control": "private, no-store"/.test(preview));

  // -------------------------------------------------------------------------
  // 10. The settings screen
  // -------------------------------------------------------------------------

  const form = code("src/components/settings/watermark-settings-form.tsx");
  check(
    "the phone control says what turning it on means",
    /cannot be taken back out of the copies that spread/.test(form),
  );
  check(
    "the preview is the server's own render",
    /src=\{debounced\}/.test(form) && /\/api\/settings\/watermark\/preview/.test(form),
    "a CSS mock-up would agree with itself and disagree with the file",
  );
  check("and it is debounced", /setTimeout\(\(\) => setDebounced\(target\), 350\)/.test(form));
  check(
    "the screen says which uploads are marked",
    /Profile pictures, cover images, logos/.test(form),
  );
  check(
    "and that published images are left alone",
    /already published are left/.test(form),
  );

  const action = code("src/app/(dashboard)/settings/watermark-actions.ts");
  check(
    "saving validates the position against the vocabulary",
    /WATERMARK_POSITIONS\.includes\(input\.position\)/.test(action),
  );
  check("and the opacity range", /input\.opacity < OPACITY_MIN/.test(action));
  check(
    "and writes the phone flag as a strict boolean",
    /use_phone: settings\.use_phone === true,/.test(action),
  );
  check("nobody may save somebody else's row", /user_id: user\.id,/.test(action));

  // -------------------------------------------------------------------------
  // 11. Somewhere to say "that is my photograph"
  //
  // The mark only helps if the person who finds their own work on somebody
  // else's listing has a way to report it that reaches a moderator as a
  // copyright claim rather than as "Something else".
  // -------------------------------------------------------------------------

  check(
    "there is a category for stolen work",
    (MODERATION_CATEGORIES as readonly string[]).includes("infringement"),
  );
  check(
    "and a reporter can choose it",
    REPORT_CATEGORIES.some((entry) => entry.id === "infringement"),
  );
  check(
    "worded as the person filing it would say it",
    REPORT_CATEGORIES.some(
      (entry) =>
        entry.id === "infringement" &&
        /my photos or work without permission/i.test(entry.label),
    ),
  );

  // One person's word against another's until somebody looks. A first claim
  // that restricts an account is a weapon handed to a competitor.
  check(
    "a first claim does not restrict the account",
    nextLevel(0, "infringement") === "warning",
  );
  check(
    "unlike the categories that do",
    nextLevel(0, "illegal") === "restricted" && nextLevel(0, "threats") === "restricted",
  );

  {
    const provider = code("src/lib/moderation/provider.ts");
    check(
      "no classifier verdict maps to it",
      !/infringement/.test(provider),
      "whether a photograph is somebody's own work is not visible in the pixels",
    );
  }
  {
    const queue = code("src/components/moderation/queue-row.tsx");
    check(
      "the moderator queue names it rather than showing the raw value",
      /infringement: "Stolen work"/.test(queue),
    );
  }
  {
    const project = code("src/app/(dashboard)/projects/[id]/page.tsx");
    check(
      "a portfolio project can be reported",
      /<ReportDialog[\s\n]/.test(project),
      "the surface photographs are lifted from had no report path at all",
    );
    check(
      "but not by its own owner",
      /\{!isOwner && \(\s*<ReportDialog/.test(project),
    );
    check(
      "and the report carries the owner, so a strike has somebody to land on",
      /ownerId=\{project\.owner_id\}/.test(project),
    );
  }
  {
    const migration = readFileSync(
      "supabase/migrations/0070_infringement_reports.sql",
      "utf8",
    ).replace(/^\s*--.*$/gm, "");
    check(
      "the value is added to the database enum",
      /add value if not exists 'infringement'/.test(migration),
      "and idempotently, so re-running the migration is safe",
    );
  }

  // -------------------------------------------------------------------------

  if (failures.length > 0) {
    console.log(`\n${RED}${failures.length} failed${RESET}`);
    for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
    console.log(`${GREEN}${passed} passed${RESET}`);
    process.exit(1);
  }

  console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
  console.log(`${DIM}watermark: the mark is in the pixels, and the phone is opt-in${RESET}`);
}

void main();
