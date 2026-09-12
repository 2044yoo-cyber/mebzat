/**
 * Project Showcase — category fields, drafts and the image pipeline.
 *
 *   npx tsx scripts/project_showcase_check.ts
 *
 * The brief this implements ends with eight numbered scenarios, and they are
 * the spine of this file: each section says which one it is. The form itself
 * is a React component and is not rendered here, so where a rule lives in
 * markup it is checked against the source — scoped to the function it belongs
 * to, and asserted on call syntax rather than on a name that also appears in
 * an import line or a comment.
 *
 * Plain Node with type stripping; no test framework, in keeping with the rest
 * of scripts/.
 */

import { readFileSync } from "node:fs";

import {
  CATEGORY_FIELDS,
  PROJECT_CATEGORIES,
  PROJECT_CATEGORY_VALUES,
  displayValue,
  fieldsFor,
  isProjectCategory,
  metadataKeysFor,
  usesBuildingColumns,
  type ProjectCategory,
} from "../src/lib/constants/project-categories.ts";
import { buildingColumnsFor, pickCover } from "../src/lib/projects/columns.ts";
import {
  DRAFT_VERSION,
  clearDraft,
  draftKey,
  isDraftWorthKeeping,
  readDraft,
  writeDraft,
} from "../src/lib/projects/draft.ts";
import {
  MAX_TAGS,
  MAX_TAGS_TOTAL_LENGTH,
  MAX_TAG_LENGTH,
  parseMetadata,
  parseTags,
  projectSchema,
} from "../src/lib/validations/project.ts";

let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
  } else {
    failures.push(detail ? `${label} — ${detail}` : label);
  }
}

/** Source with comments removed, so a rule described in prose cannot satisfy a check for it. */
function sourceOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const fieldIds = (category: ProjectCategory) =>
  fieldsFor(category).map((f) => f.id);

// ---------------------------------------------------------------------------
// TEST A — Building Construction has floors and bedrooms.
// ---------------------------------------------------------------------------
{
  for (const category of ["building_construction", "architecture"] as const) {
    const ids = fieldIds(category);
    check(`${category}: asks for floors`, ids.includes("floors"));
    check(`${category}: asks for bedrooms`, ids.includes("bedrooms"));
    check(`${category}: asks for a building type`, ids.includes("buildingType"));
    check(
      `${category}: uses the columns 0004 built`,
      usesBuildingColumns(category),
    );
  }

  // The brief names five more for these two, and a category that quietly lost
  // one would still pass every check above.
  const ids = fieldIds("building_construction");
  for (const wanted of [
    "built_area",
    "plot_area",
    "bathrooms",
    "project_phase",
    "construction_type",
  ]) {
    check(`building construction asks for ${wanted}`, ids.includes(wanted));
  }
}

// ---------------------------------------------------------------------------
// TEST B — Kitchen shows kitchen fields and no building fields.
// ---------------------------------------------------------------------------
{
  const ids = fieldIds("kitchen");

  check("kitchen does not ask for bedrooms", !ids.includes("bedrooms"));
  check("kitchen does not ask for floors", !ids.includes("floors"));
  check("kitchen does not ask for a building type", !ids.includes("buildingType"));
  check(
    "and so touches none of the building columns",
    !usesBuildingColumns("kitchen"),
  );

  for (const wanted of [
    "kitchen_type",
    "kitchen_size",
    "material",
    "finish",
    "countertop",
    "scope",
  ]) {
    check(`kitchen asks for ${wanted}`, ids.includes(wanted));
  }

  const kitchenType = fieldsFor("kitchen").find((f) => f.id === "kitchen_type");
  const shapes = (kitchenType?.options ?? []).map((o) => o.value);
  for (const shape of ["straight", "l_shaped", "u_shaped", "island", "other"]) {
    check(`kitchen type offers ${shape}`, shapes.includes(shape));
  }

  const scope = fieldsFor("kitchen").find((f) => f.id === "scope");
  const scopes = (scope?.options ?? []).map((o) => o.value);
  for (const s of ["design_only", "design_build", "installation", "renovation"]) {
    check(`kitchen scope offers ${s}`, scopes.includes(s));
  }
}

// ---------------------------------------------------------------------------
// TEST C — Furniture shows furniture fields, building fields hidden.
// ---------------------------------------------------------------------------
{
  // All three of the maker categories, not just the one the brief names: they
  // share a field list, and sharing it is the thing that could break.
  for (const category of ["furniture", "wardrobe", "joinery"] as const) {
    const ids = fieldIds(category);
    check(`${category} does not ask for bedrooms`, !ids.includes("bedrooms"));
    check(`${category} does not ask for floors`, !ids.includes("floors"));
    check(
      `${category} touches no building column`,
      !usesBuildingColumns(category),
    );
    for (const wanted of [
      "furniture_type",
      "dimensions",
      "material",
      "finish",
      "quantity",
      "scope",
      "custom_made",
    ]) {
      check(`${category} asks for ${wanted}`, ids.includes(wanted));
    }
  }

  // Interior design and construction product, the other two the brief spells out.
  const interior = fieldIds("interior_design");
  for (const wanted of ["space_type", "area", "rooms", "scope_of_work", "delivery"]) {
    check(`interior design asks for ${wanted}`, interior.includes(wanted));
  }
  check(
    "interior design does not ask for bedrooms",
    !interior.includes("bedrooms"),
  );

  const product = fieldIds("construction_product");
  for (const wanted of [
    "product_type",
    "material",
    "dimensions",
    "quantity",
    "application",
    "custom_made",
  ]) {
    check(`construction product asks for ${wanted}`, product.includes(wanted));
  }
  check(
    "construction product does not ask for floors",
    !product.includes("floors"),
  );
}

// ---------------------------------------------------------------------------
// Every category in the brief exists, and only the two building ones use the
// house columns.
// ---------------------------------------------------------------------------
{
  for (const wanted of [
    "building_construction",
    "architecture",
    "interior_design",
    "kitchen",
    "furniture",
    "wardrobe",
    "joinery",
    "renovation",
    "finishing",
    "electrical",
    "plumbing",
    "landscaping",
    "construction_product",
    "other",
  ]) {
    check(`the form offers ${wanted}`, isProjectCategory(wanted));
  }

  check(
    "every category has a field list",
    PROJECT_CATEGORY_VALUES.every((c) => Array.isArray(CATEGORY_FIELDS[c])),
  );

  // Named, not counted: "exactly two" is satisfied by the wrong two.
  const building = PROJECT_CATEGORY_VALUES.filter(usesBuildingColumns).sort();
  check(
    "only building construction and architecture use the house columns",
    building.length === 2 &&
      building[0] === "architecture" &&
      building[1] === "building_construction",
    `got ${building.join(", ")}`,
  );

  check(
    "no category offers a field twice",
    PROJECT_CATEGORY_VALUES.every((c) => {
      const ids = fieldIds(c);
      return new Set(ids).size === ids.length;
    }),
  );

  check(
    "every select field offers options",
    PROJECT_CATEGORY_VALUES.every((c) =>
      fieldsFor(c).every(
        (f) => f.kind !== "select" || (f.options?.length ?? 0) > 0,
      ),
    ),
    "a select with no options is a field nobody can answer",
  );

  check(
    "the form's category list and the label map agree",
    PROJECT_CATEGORIES.length === PROJECT_CATEGORY_VALUES.length,
  );
}

// ---------------------------------------------------------------------------
// The bag only takes what the category asked for.
//
// This is what stands between `metadata` and any key a crafted post invents,
// and it is also what stops a kitchen keeping the bathrooms it was given while
// it was still a building project.
// ---------------------------------------------------------------------------
{
  const form = new FormData();
  form.set("meta.kitchen_type", "l_shaped");
  form.set("meta.countertop", "Granite");
  form.set("meta.bathrooms", "3");
  form.set("meta.bedrooms", "4");
  form.set("meta.anything_at_all", "hello");

  const kitchen = parseMetadata("kitchen", form);
  check("a kitchen keeps its kitchen type", kitchen.kitchen_type === "l_shaped");
  check("and its countertop", kitchen.countertop === "Granite");
  check(
    "and does not keep bathrooms, which belong to a building",
    !("bathrooms" in kitchen),
  );
  check("and drops an invented key", !("anything_at_all" in kitchen));

  const building = parseMetadata("building_construction", form);
  check("a building does keep bathrooms", building.bathrooms === 3);
  check(
    "and does not keep the kitchen type",
    !("kitchen_type" in building),
  );

  // A select takes only what it offers.
  const bad = new FormData();
  bad.set("meta.kitchen_type", "<script>alert(1)</script>");
  check(
    "a select refuses a value it does not offer",
    !("kitchen_type" in parseMetadata("kitchen", bad)),
  );

  // Numbers are bounded by the field, not merely parsed.
  const outOfRange = new FormData();
  outOfRange.set("meta.bathrooms", "9999");
  check(
    "a number outside the field's range is dropped",
    !("bathrooms" in parseMetadata("building_construction", outOfRange)),
  );
  const notANumber = new FormData();
  notANumber.set("meta.bathrooms", "three");
  check(
    "and so is text in a number field",
    !("bathrooms" in parseMetadata("building_construction", notANumber)),
  );

  // A checkbox that was not ticked posts nothing at all.
  const ticked = new FormData();
  ticked.set("meta.custom_made", "on");
  check(
    "a ticked checkbox stores true",
    parseMetadata("furniture", ticked).custom_made === true,
  );
  check(
    "an unticked one stores nothing",
    !("custom_made" in parseMetadata("furniture", new FormData())),
  );

  const blank = new FormData();
  blank.set("meta.material", "   ");
  check(
    "a field left blank is not stored as an empty string",
    !("material" in parseMetadata("kitchen", blank)),
  );

  check(
    "metadataKeysFor never names a column",
    PROJECT_CATEGORY_VALUES.every(
      (c) =>
        !metadataKeysFor(c).some((k) =>
          ["bedrooms", "floors", "buildingType"].includes(k),
        ),
    ),
    "a column written into the jsonb bag is that value stored twice",
  );
}

// ---------------------------------------------------------------------------
// TEST B and C, at the point it actually matters: the columns.
// ---------------------------------------------------------------------------
{
  const filled = { buildingType: "residential", bedrooms: 4, floors: 2 };

  const asBuilding = buildingColumnsFor("building_construction", filled);
  check("a building keeps its bedrooms", asBuilding.bedrooms === 4);
  check("and its floors", asBuilding.floors === 2);
  check(
    "and its building type",
    asBuilding.building_type === "residential",
  );

  // The recategorisation case. The form stops *showing* these for a kitchen;
  // this is what stops a kitchen still *carrying* them.
  for (const category of [
    "kitchen",
    "furniture",
    "wardrobe",
    "joinery",
    "interior_design",
    "construction_product",
    "electrical",
  ] as const) {
    const cleared = buildingColumnsFor(category, filled);
    check(
      `${category} is stored with no bedrooms`,
      cleared.bedrooms === null,
      "a kitchen that kept four bedrooms shows them on its project page",
    );
    check(`${category} is stored with no floors`, cleared.floors === null);
    check(
      `${category} is stored with no building type`,
      cleared.building_type === null,
    );
  }
}

// ---------------------------------------------------------------------------
// Tags.
// ---------------------------------------------------------------------------
{
  check(
    "tags split on commas and trim",
    JSON.stringify(parseTags(" joinery ,  mdf,spray finish ")) ===
      JSON.stringify(["joinery", "mdf", "spray finish"]),
  );
  check("an empty tag field is no tags", parseTags("").length === 0);
  check("and so is one that is only commas", parseTags(" , , ").length === 0);
  check(
    "a repeated tag is stored once",
    parseTags("mdf, MDF, mdf").length === 1,
  );

  // Each of these mirrors a constraint in 0077. If the parser lets one
  // through, the insert fails with a check violation the person cannot act on.
  const many = parseTags(
    Array.from({ length: 40 }, (_, i) => `tag${i}`).join(","),
  );
  check("no more than 20 tags reach the database", many.length <= 20);

  const long = parseTags("x".repeat(200));
  check(
    "a single tag is cut to the column's limit",
    long.every((t) => t.length <= 40),
  );

  // The column allows 800 characters across the whole array. The count limit
  // and the per-tag limit are what actually hold that line, so it is their
  // product that is checked: a fixture cannot exercise the running total,
  // because with these two in force nothing can exceed it.
  check(
    "twenty tags at the maximum length still fit the column",
    MAX_TAGS * MAX_TAG_LENGTH <= MAX_TAGS_TOTAL_LENGTH,
    `${MAX_TAGS} x ${MAX_TAG_LENGTH} = ${MAX_TAGS * MAX_TAG_LENGTH}, column allows ${MAX_TAGS_TOTAL_LENGTH}`,
  );
  // Distinct, or the deduplication collapses all twenty into one and the
  // check measures 40 characters instead of 800.
  const maxed = parseTags(
    Array.from({ length: 20 }, (_, i) =>
      "y".repeat(39) + String.fromCharCode(97 + i),
    ).join(","),
  );
  check(
    "and the parser actually produces that much and no more",
    maxed.join("").length === MAX_TAGS * MAX_TAG_LENGTH,
    `${maxed.join("").length} characters`,
  );
}

// ---------------------------------------------------------------------------
// TEST F — the cover is a choice, not a position.
// ---------------------------------------------------------------------------
{
  const images = ["a.jpg", "b.jpg", "c.jpg"];

  check("the chosen cover is used", pickCover(images, "b.jpg") === "b.jpg");
  check(
    "with none chosen, the first is the cover",
    pickCover(images, null) === "a.jpg",
  );
  check(
    "a cover that is not one of the images is refused",
    pickCover(images, "https://example.test/elsewhere.jpg") === "a.jpg",
    "otherwise any URL at all renders as this project's card",
  );
  check(
    "a project with no images has no cover",
    pickCover([], "b.jpg") === null,
  );
  check(
    "removing the chosen cover falls back to the first",
    pickCover(["b.jpg", "c.jpg"], "a.jpg") === "b.jpg",
  );
}

// ---------------------------------------------------------------------------
// TEST D — fill it in, leave, come back.
// ---------------------------------------------------------------------------
{
  // Enough of localStorage to exercise the module. The real one is a browser
  // API; what is being checked is this code's handling of it.
  class FakeStorage {
    private map = new Map<string, string>();
    get length() {
      return this.map.size;
    }
    getItem(k: string) {
      return this.map.get(k) ?? null;
    }
    setItem(k: string, v: string) {
      this.map.set(k, v);
    }
    removeItem(k: string) {
      this.map.delete(k);
    }
    clear() {
      this.map.clear();
    }
    key(i: number) {
      return [...this.map.keys()][i] ?? null;
    }
  }

  const storage = new FakeStorage() as unknown as Storage;
  const key = draftKey("user-1");

  check(
    "two people on one browser get different drafts",
    draftKey("user-1") !== draftKey("user-2"),
  );
  check(
    "and a new project does not reuse an edit's draft",
    draftKey("user-1") !== draftKey("user-1", "project-1"),
  );

  check("nothing saved is nothing to restore", readDraft(storage, key) === null);

  writeDraft(storage, key, {
    values: { title: "Bole Kitchen", category: "kitchen", locationCity: "Addis Ababa" },
    images: ["one.jpg", "two.jpg"],
    primary: "two.jpg",
  });

  const back = readDraft(storage, key);
  check("the title comes back", back?.values.title === "Bole Kitchen");
  check("the category comes back", back?.values.category === "kitchen");
  check("the city comes back", back?.values.locationCity === "Addis Ababa");
  check(
    "both images come back",
    JSON.stringify(back?.images) === JSON.stringify(["one.jpg", "two.jpg"]),
    "an image that survives upload and not the trip back is a paid-for file nobody can reach",
  );
  check("and so does the chosen cover", back?.primary === "two.jpg");

  check("a draft with content is offered", isDraftWorthKeeping(back));
  check(
    "an empty one is not",
    !isDraftWorthKeeping({
      version: DRAFT_VERSION,
      savedAt: 0,
      values: { title: "", category: "" },
      images: [],
      primary: null,
    }),
    "offering to restore nothing is a dialog in the way for no reason",
  );
  check(
    "a draft with only images is still offered",
    isDraftWorthKeeping({
      version: DRAFT_VERSION,
      savedAt: 0,
      values: {},
      images: ["one.jpg"],
      primary: "one.jpg",
    }),
  );

  clearDraft(storage, key);
  check("discarding removes it", readDraft(storage, key) === null);

  // Everything read back is untrusted: it is JSON from a store the person can
  // edit, and a draft that throws takes the form down with it.
  storage.setItem(key, "{not json");
  check("malformed JSON is no draft", readDraft(storage, key) === null);
  storage.setItem(key, '"a string"');
  check("a bare string is no draft", readDraft(storage, key) === null);
  storage.setItem(key, "null");
  check("a literal null is no draft", readDraft(storage, key) === null);
  storage.setItem(
    key,
    JSON.stringify({ version: 999, values: {}, images: [], primary: null }),
  );
  check(
    "a draft from an older form is discarded, not half-restored",
    readDraft(storage, key) === null,
  );
  storage.setItem(
    key,
    JSON.stringify({
      version: DRAFT_VERSION,
      savedAt: 0,
      values: { title: 5, ok: "yes" },
      images: ["good.jpg", 7, null],
      primary: "good.jpg",
    }),
  );
  const messy = readDraft(storage, key);
  check("a non-string value is dropped", messy?.values.title === undefined);
  check("a good one beside it is kept", messy?.values.ok === "yes");
  check(
    "a non-string image is dropped",
    JSON.stringify(messy?.images) === JSON.stringify(["good.jpg"]),
  );
  storage.setItem(
    key,
    JSON.stringify({
      version: DRAFT_VERSION,
      savedAt: 0,
      values: {},
      images: ["a.jpg"],
      primary: "gone.jpg",
    }),
  );
  check(
    "a cover pointing at an image that is not there is dropped",
    readDraft(storage, key)?.primary === null,
  );

  // A browser that refuses storage must not take the form with it.
  const refusing = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
    removeItem() {
      throw new Error("denied");
    },
  } as unknown as Storage;
  check(
    "a browser that blocks storage reads as no draft",
    readDraft(refusing, key) === null,
  );
  check(
    "and says so rather than throwing on write",
    writeDraft(refusing, key, { values: {}, images: [], primary: null }) === false,
  );
}

// ---------------------------------------------------------------------------
// TEST H — the project page shows this category's answers and no others.
// ---------------------------------------------------------------------------
{
  const kitchenType = fieldsFor("kitchen").find((f) => f.id === "kitchen_type")!;
  check(
    "a select renders its label, not its stored value",
    displayValue(kitchenType, "l_shaped") === "L-shaped",
  );
  check(
    "an option that is no longer offered still renders",
    displayValue(kitchenType, "galley") === "galley",
    "showing nothing would silently drop an answer the author gave",
  );
  check("a blank answer renders as nothing", displayValue(kitchenType, "") === null);
  check("and so does a missing one", displayValue(kitchenType, undefined) === null);
  check("and a null", displayValue(kitchenType, null) === null);

  const custom = fieldsFor("furniture").find((f) => f.id === "custom_made")!;
  check("a ticked box reads as Yes", displayValue(custom, true) === "Yes");
  check("an unticked one reads as No", displayValue(custom, false) === "No");

  const quantity = fieldsFor("furniture").find((f) => f.id === "quantity")!;
  check("a number renders", displayValue(quantity, 4) === "4");
  check(
    "and zero renders rather than vanishing",
    displayValue(quantity, 0) === "0",
  );

  const page = sourceOf("src/app/(dashboard)/projects/[id]/page.tsx");
  check(
    "the project page asks the spec which fields this category has",
    /fieldsFor\(/.test(page),
  );
  check(
    "and does not render bedrooms on its own account",
    !/project\.bedrooms/.test(page),
    "a hard-coded bedrooms row is the 'Bedrooms: —' on a kitchen",
  );
  check(
    "nor floors",
    !/project\.floors/.test(page),
  );
  check(
    "and drops the answers the author left blank",
    /\.filter\(/.test(page) && /value !== null/.test(page),
    "a column of dashes says nothing about the work",
  );
}

// ---------------------------------------------------------------------------
// The form renders from the spec rather than from a list of its own.
// ---------------------------------------------------------------------------
{
  const form = sourceOf("src/components/projects/project-form.tsx");

  check(
    "the form asks the spec which fields to render",
    /fieldsFor\(/.test(form),
  );
  check(
    "and has no bedrooms input of its own",
    !/name="bedrooms"/.test(form),
    "an input outside the spec is a field the category cannot turn off",
  );
  check("nor a floors input", !/name="floors"/.test(form));
  check(
    "nor a building type input",
    !/name="buildingType"/.test(form),
  );
  check(
    "the category select is rendered",
    /name="category"/.test(form),
  );
  check(
    "the draft is saved on a debounce, not on every keystroke",
    /setTimeout\(save, SAVE_DEBOUNCE_MS\)/.test(form),
  );
  check(
    "the form offers to restore an unfinished draft",
    // The binding, not the bare name: `settled` calls it too, so matching the
    // call alone passed with the banner hard-wired off.
    /const hasOffer = !answered && isDraftWorthKeeping\(found\)/.test(form),
  );
  check(
    "and can discard it",
    /clearDraft\(/.test(form),
  );
  check(
    "an image change schedules a save",
    /imagesChanged/.test(form) && /imagesRef\.current = value/.test(form),
    "images kept only in React state are the ones that vanish on refresh",
  );
  check(
    "the save reads the images from the ref, not from state",
    /images: imagesRef\.current\.urls/.test(form),
    "reading state in the handler that changed it writes the previous set",
  );
  check(
    "the form offers more than draft and published",
    /\bprivate:/.test(form) && /\barchived:/.test(form),
  );
}

// ---------------------------------------------------------------------------
// The four states a project can be in.
//
// The form offering a status the schema rejects is a submit that fails
// validation with nothing on screen to explain it — status has no field-error
// slot — so the schema is checked rather than the markup.
// ---------------------------------------------------------------------------
{
  const base = {
    title: "A project",
    category: "kitchen",
    description: "",
    locationCity: "",
    locationCountry: "",
    buildingType: "",
    style: "",
    budgetCurrency: "",
    materials: "",
    completionDate: "",
    client: "",
  };

  for (const status of ["draft", "published", "private", "archived"]) {
    check(
      `a project can be ${status}`,
      projectSchema.safeParse({ ...base, status }).success,
    );
  }
  check(
    "and cannot be something else",
    !projectSchema.safeParse({ ...base, status: "deleted" }).success,
  );

  check(
    "a project must say what kind of work it is",
    !projectSchema.safeParse({ ...base, status: "draft", category: "" }).success,
  );
  check(
    "and it must be a category that exists",
    !projectSchema.safeParse({ ...base, status: "draft", category: "spaceship" })
      .success,
  );
  check(
    "every category the form offers is one the schema takes",
    PROJECT_CATEGORY_VALUES.every(
      (category) =>
        projectSchema.safeParse({ ...base, status: "draft", category }).success,
    ),
  );
}

// ---------------------------------------------------------------------------
// TESTS E and G — six images, and one failure does not lose the rest.
// ---------------------------------------------------------------------------
{
  const images = sourceOf("src/components/projects/project-images-input.tsx");

  check(
    "six images, not twelve",
    /MAX_PROJECT_IMAGES = 6/.test(images),
  );
  check(
    "the picker takes more than one file at a time",
    /multiple/.test(images),
  );
  check(
    "JPG, PNG and WEBP",
    /image\/jpeg/.test(images) &&
      /image\/png/.test(images) &&
      /image\/webp/.test(images),
  );

  // TEST G. The old code had no try/catch at all: a server action that
  // rejected left the control on "Uploading" forever, with every image in the
  // batch lost and nothing on screen to say why.
  check(
    "an upload that throws is caught",
    /catch \(cause\)/.test(images),
    "an uncaught rejection left the button spinning with no message and no way back",
  );
  check(
    "and the failure is recorded against the one image",
    /patch\(key, \{\s*status: "failed"/.test(images),
  );
  check(
    "a failed image can be retried",
    /void upload\(slot\.key, slot\.file as File\)/.test(images),
  );
  check(
    "a refused image is not offered a retry",
    /file: refused \? undefined : file/.test(images),
    "sending somebody round the same loop is not a remedy",
  );
  check(
    "progress is counted through the batch",
    /Uploading \$\{Math\.min\(finished \+ 1, busy\)\} of \$\{busy\}/.test(images),
  );

  // TEST F, in the component.
  check(
    "the cover is chosen, not assumed",
    /setPrimary\(slot\.url/.test(images),
  );
  check(
    "the cover is posted by name",
    /name="primaryImage"/.test(images),
  );
  check(
    "a cover that is no longer in the set falls back",
    /primary && urls\.includes\(primary\)/.test(images),
  );
  check("images can be reordered", /function move\(/.test(images));
  check("and dragged", /onDrop=/.test(images));
  check("and replaced", /function startReplace\(/.test(images));
  check("and removed one at a time", /function remove\(/.test(images));

  // Section 21: the real error to the log, a plain sentence to the person.
  check(
    "storage errors are logged",
    /console\.error\(/.test(images),
  );
  check(
    "and are not shown to the person",
    !/toast\.error\(\s*error\.message/.test(images) &&
      // The message that reaches the slot, which is what the person reads. A
      // check on toast() alone passed while the raw text was assigned here.
      !/error:\s*error\.message/.test(images),
    "'new row violates row-level security policy' is not a thing anybody can act on",
  );
  check(
    "the upload path reports through one function",
    /reportUploadFailure\(/.test(images),
  );

  const compress = sourceOf("src/lib/images/compress.ts");
  check(
    "a large photograph is shrunk before it is sent",
    /createImageBitmap\(/.test(compress),
  );
  check(
    "with its orientation applied",
    /imageOrientation: "from-image"/.test(compress),
    "a portrait photo drawn on its side is worse than one not resized",
  );
  check(
    "and is left alone when re-encoding would not help",
    /blob\.size >= file\.size/.test(compress),
  );
  check(
    "the component calls it",
    /compressImage\(/.test(images),
  );
}

// ---------------------------------------------------------------------------
// The card.
// ---------------------------------------------------------------------------
{
  const card = sourceOf("src/components/projects/project-card.tsx");
  check("the card shows the category", /PROJECT_CATEGORY_MAP\[/.test(card));
  check(
    "and not the building type",
    !/BUILDING_TYPE_MAP/.test(card),
    "a wardrobe labelled by a column meant for houses reads as 'Interior' or as nothing",
  );
  check("and a short description", /line-clamp-2/.test(card));
  check("and the cover image", /cover_image_url/.test(card));
  check(
    "a project that is not published says so",
    /HIDDEN_LABELS\[/.test(card),
  );

  // The card cannot show a column nobody selected.
  for (const [name, path] of [
    ["the portfolio", "src/components/projects/profile-projects.tsx"],
    ["the projects page", "src/app/(dashboard)/projects/page.tsx"],
  ] as const) {
    const source = sourceOf(path);
    check(
      `${name} selects the category`,
      /"[^"]*\bcategory\b[^"]*"/.test(source),
      "the card reads project.category; a query that does not fetch it renders no badge",
    );
    check(
      `${name} selects the description`,
      /"[^"]*\bdescription\b[^"]*"/.test(source),
    );
  }
}

// ---------------------------------------------------------------------------
// Backward compatibility — 0004's rows still work.
// ---------------------------------------------------------------------------
{
  const migration = readFileSync(
    "supabase/migrations/0077_project_categories.sql",
    "utf8",
  );

  check(
    "existing projects default to building construction",
    /not null default 'building_construction'/.test(migration),
  );
  check(
    "the building columns are not dropped",
    !/drop column/i.test(migration),
    "bedrooms and floors are what every project written before this carries",
  );
  check(
    "an interior project becomes an interior design project",
    /when 'interior' then 'interior_design'/.test(migration),
  );
  check(
    "private and archived are added without being used in the same transaction",
    /add value if not exists 'private'/.test(migration) &&
      /add value if not exists 'archived'/.test(migration),
  );
  check(
    "the metadata bag has a shape",
    /jsonb_typeof\(metadata\) = 'object'/.test(migration),
  );
  check(
    "and a ceiling",
    /pg_column_size\(metadata\)/.test(migration),
  );
}

// ---------------------------------------------------------------------------

const dim = "\x1b[2m";
const green = "\x1b[32m";
const red = "\x1b[31m";
const reset = "\x1b[0m";

console.log(`${dim}Project Showcase${reset}`);
console.log(`${dim}${"-".repeat(50)}${reset}`);

if (failures.length === 0) {
  console.log(`${green}[ok] ${passed} checks passed.${reset}`);
  console.log(
    `${dim}Category fields, drafts, covers and the upload pipeline.${reset}`,
  );
} else {
  console.log(`${red}[fail] ${failures.length} failed:${reset}`);
  for (const f of failures) console.log(`  ${red}-${reset} ${f}`);
  console.log(`${dim}${passed} passed.${reset}`);
  process.exitCode = 1;
}
