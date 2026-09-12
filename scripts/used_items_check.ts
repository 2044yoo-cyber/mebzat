/**
 * Used Items is a section, not a second marketplace.
 *
 *   npx tsx scripts/used_items_check.ts
 *
 * ## The rule this file exists for
 *
 * `products.condition` decides which section a listing appears in, and the
 * badge on the card is drawn from the same column. There is no second product
 * table, no "mark as used" flag beside the condition, and no free-text label a
 * seller could set to say one thing while the database says another — so a
 * listing cannot be in the wrong place, and a badge cannot lie about a listing
 * it is sitting on.
 *
 * The second rule: everything already listed is `new` by default, so nothing
 * that was in the marketplace yesterday has moved.
 */

import "./lib/allow-server-only.ts";

import { readFileSync } from "node:fs";

import {
  CONDITIONS,
  DIGITAL_KINDS,
  MARKETPLACE_SECTIONS,
  SELLABLE_CONDITIONS,
  USED_GRADES,
  isSecondHand,
} from "../src/lib/constants/product-categories.ts";
import { safeRedirect } from "../src/lib/auth/safe-redirect.ts";
import {
  productSchema,
  usedFieldsFor,
} from "../src/lib/validations/product.ts";

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

const migration = readFileSync(
  "supabase/migrations/0074_used_items.sql",
  "utf8",
).replace(/^\s*--.*$/gm, "");

// ---------------------------------------------------------------------------
// 1. One product system
// ---------------------------------------------------------------------------

check(
  "no second product table was created",
  !/create table/i.test(migration),
  "a leftover marketplace would have needed one",
);
check(
  "the condition lives on the existing products table",
  /alter table public\.products[\s\S]{0,400}add column if not exists condition public\.product_condition/.test(
    migration,
  ),
);
check(
  "everything already listed stays where it was",
  /condition public\.product_condition not null default 'new'/.test(migration),
  "a default of 'used' would move the whole marketplace overnight",
);
check(
  "the second-hand categories join the shared taxonomy",
  /insert into public\.product_categories \(slug, name, icon, position\) values/.test(
    migration,
  ),
  "a used-only category table would mean a listing changing category with its condition",
);

// ---------------------------------------------------------------------------
// 2. The condition is the only source of truth
// ---------------------------------------------------------------------------

check(
  "a new listing cannot carry a used grade",
  /condition <> 'new'[\s\S]{0,200}used_grade is null/.test(migration),
  "otherwise a listing sits under New Items saying \"Fair — needs repair\"",
);
for (const field of [
  "condition_notes",
  "known_defects",
  "sale_reason",
  "age_months",
]) {
  check(
    `nor a ${field.replace(/_/g, " ")}`,
    new RegExp(`and ${field} is null`).test(migration),
  );
}
check(
  "the section rule is \"not new\", not \"is used\"",
  /condition <> 'new'\s*\n\s*or \(/.test(migration),
  "written as = 'used' the day refurbished ships it fails with a check violation",
);

// ---------------------------------------------------------------------------
// 3. The section a listing lands in
// ---------------------------------------------------------------------------

check("new goes to New Items", !isSecondHand("new"));
check("used goes to Used Items", isSecondHand("used"));
check(
  "and so will refurbished, open box and for parts",
  isSecondHand("refurbished") &&
    isSecondHand("open_box") &&
    isSecondHand("for_parts"),
  "the section rule needs no change when the form offers them",
);
check(
  "the form offers exactly new and used today",
  SELLABLE_CONDITIONS.length === 2 &&
    SELLABLE_CONDITIONS.includes("new") &&
    SELLABLE_CONDITIONS.includes("used"),
);
check(
  "while the vocabulary already holds all five",
  Object.keys(CONDITIONS).length === 5,
);
check(
  "and the four used grades",
  Object.keys(USED_GRADES).length === 4 &&
    ["like_new", "good", "fair", "needs_repair"].every(
      (grade) => grade in USED_GRADES,
    ),
);

// ---------------------------------------------------------------------------
// 4. Switching back to New clears what no longer applies
// ---------------------------------------------------------------------------

{
  const base = {
    title: "Desk",
    stockStatus: "in_stock" as const,
    status: "published" as const,
    usedGrade: "fair" as const,
    conditionNotes: "worn",
    knownDefects: "scratched",
    saleReason: "moving",
    ageMonths: 30,
  };

  const asNew = usedFieldsFor({ ...base, condition: "new" } as never);
  check(
    "a listing saved as New keeps no second-hand detail",
    asNew.used_grade === null &&
      asNew.condition_notes === null &&
      asNew.known_defects === null &&
      asNew.sale_reason === null &&
      asNew.age_months === null,
    "the database would refuse it, and the seller would see a constraint error",
  );

  const asUsed = usedFieldsFor({ ...base, condition: "used" } as never);
  check(
    "and a listing saved as Used keeps all of it",
    asUsed.used_grade === "fair" &&
      asUsed.known_defects === "scratched" &&
      asUsed.age_months === 30,
  );
}

check(
  "the fulfilment is required on the form",
  // The same argument as the condition below: left blank, the column default
  // decides, and the default puts a course among the cement bags.
  !productSchema.safeParse({
    title: "Desk",
    stockStatus: "in_stock",
    status: "published",
    condition: "new",
  }).success,
  "which section a listing lands in is not a question with a silent answer",
);
check(
  "the condition is required on the form",
  // Everything else valid, so the parse can only fail on the missing
  // condition. Without `fulfilment` here the check passed on a schema where
  // condition was optional — it was failing on the wrong field.
  !productSchema.safeParse({
    title: "Desk",
    stockStatus: "in_stock",
    status: "published",
    fulfilment: "physical",
  }).success,
  "a blank condition would let the default decide, and the default is New",
);
check(
  "and only new or used is accepted from a browser",
  !productSchema.safeParse({
    title: "Desk",
    stockStatus: "in_stock",
    status: "published",
    fulfilment: "physical",
    condition: "refurbished",
  }).success,
  "the enum has five values; the form has shipped two",
);
check(
  "a valid used listing parses",
  productSchema.safeParse({
    title: "Used desk",
    stockStatus: "in_stock",
    status: "published",
    fulfilment: "physical",
    condition: "used",
    usedGrade: "good",
  }).success,
);
check(
  "a negative age is refused before it reaches the database",
  !productSchema.safeParse({
    title: "Used desk",
    stockStatus: "in_stock",
    status: "published",
    fulfilment: "physical",
    condition: "used",
    ageMonths: -1,
  }).success,
);

// ---------------------------------------------------------------------------
// 5. The badge comes from the column
// ---------------------------------------------------------------------------

{
  const badge = code("src/components/products/condition-badge.tsx");
  check(
    "the badge reads the condition and nothing else",
    /if \(condition === "new"\) return null;/.test(badge) &&
      /CONDITIONS\[condition\]/.test(badge),
  );
  check(
    "a new listing gets no badge",
    /if \(condition === "new"\) return null;/.test(badge),
    "a badge on every card is a badge nobody reads",
  );

  const card = code("src/components/products/product-card.tsx");
  check(
    "the card renders it from the product's own condition",
    /<ConditionBadge\s*\n?\s*condition=\{product\.condition\}/.test(card),
  );
  check(
    "and carries the columns needed to draw it",
    /\| "condition"/.test(card) && /\| "used_grade"/.test(card),
  );

  const products = code("src/lib/data/products.ts");
  check(
    "the card query selects the condition",
    /condition, used_grade/.test(products),
    "a card cannot show a badge for a column it never fetched",
  );
}

// ---------------------------------------------------------------------------
// 6. The sections read one table
// ---------------------------------------------------------------------------

{
  const products = code("src/lib/data/products.ts");
  // Checked in section 12, which knows about the fulfilment column these two
  // now also narrow on. Left here as the pointer, so nobody adds a second
  // pair that drifts.
  check(
    "the sections are decided in one place",
    (products.match(/section === "(new|used|digital)"/g) ?? []).length === 3,
  );
  check(
    "and SECOND_HAND is every non-new condition",
    /const SECOND_HAND: ProductCondition\[\] = \[\s*\n\s*"used",\s*\n\s*"refurbished",\s*\n\s*"open_box",\s*\n\s*"for_parts",\s*\n\s*\];/.test(
      products,
    ),
    "a listing in a condition nobody listed would vanish from both sections",
  );

  const newPage = code("src/app/marketplace/page.tsx");
  check(
    "the existing marketplace asks for the new section",
    /section: "new",/.test(newPage),
  );

  const usedPage = code("src/app/marketplace/used/page.tsx");
  check("there is a Used Items page", usedPage.length > 0);
  check(
    "which asks for the used section",
    /section: "used",/.test(usedPage),
  );
  check(
    "the used page filters by grade, city and area",
    /usedGrade: isUsedGrade\(gradeParam\)/.test(usedPage) &&
      /city: city \|\| undefined/.test(usedPage) &&
      /area: area \|\| undefined/.test(usedPage),
  );
  check(
    "and every one of them is a URL parameter",
    ["q", "category", "sort", "grade", "city", "area"].every((key) =>
      new RegExp(`get\\("${key}"\\)`).test(usedPage),
    ),
    "so a search for used tiles in Bole is a link somebody can send",
  );
  check(
    "the cities offered are the cities with second-hand listings",
    /^\s*citiesWithUsedItems\(\),$/m.test(usedPage),
    "the call, not the identifier — the definition survives a hard-coded list",
  );
  // Used to assert the page *said* anyone can sell. The sentence is gone —
  // five lines of prose describing a marketplace to somebody standing in it —
  // so what is checked now is the thing the sentence was describing: nothing
  // anywhere in browsing or posting narrows by who the account belongs to.
  // That is the property; the paragraph was only a claim about it.
  for (const [path, what] of [
    ["src/app/marketplace/used/page.tsx", "browsing used items"],
    ["src/lib/data/products.ts", "the marketplace query"],
    ["src/app/(dashboard)/products/actions.ts", "creating a listing"],
    ["src/lib/validations/product.ts", "the listing form's rules"],
  ] as const) {
    check(
      `${what} is not gated by account type`,
      !/account_type/.test(code(path)),
      "used items are open to everybody, not to construction accounts",
    );
  }
}

// ---------------------------------------------------------------------------
// 7. Three sections, and the third is the one that already existed
// ---------------------------------------------------------------------------

check(
  "the marketplace has four sections",
  MARKETPLACE_SECTIONS.length === 4,
);
check(
  "named New Items, Used Items, Rental and Digital Marketplace",
  MARKETPLACE_SECTIONS.map((section) => section.label).join(" · ") ===
    "New Items · Used Items · Rental · Digital Marketplace",
);
{
  // The word appears twice on purpose and neither is a name: "leftover
  // materials" is one of the things people sell in the used section, and
  // "leftover" is a search keyword so somebody typing "leftover tiles" lands
  // there. What the brief rules out is a section, route or menu entry *called*
  // one, so this checks labels and hrefs rather than every occurrence.
  const nav = code("src/lib/workspace/navigation.ts");
  const labels = nav.match(/label: "[^"]*"/g) ?? [];
  const hrefs = nav.match(/href: "[^"]*"/g) ?? [];

  check(
    "nothing is *called* a leftover marketplace",
    MARKETPLACE_SECTIONS.every(
      (section) =>
        !/leftover/i.test(section.label) && !/leftover/i.test(section.href),
    ) && ![...labels, ...hrefs].some((entry) => /leftover/i.test(entry)),
    "the brief names this outright",
  );
  check(
    "but somebody searching for leftovers still finds it",
    /"leftover"/.test(nav),
    "it is what people call the thing, whatever the section is named",
  );
}
check(
  "Digital Marketplace is a marketplace section, not Berchuma's gallery",
  MARKETPLACE_SECTIONS.find((section) => section.key === "digital")?.href ===
    "/marketplace/digital",
  // It pointed at `/designs`, which is a place to open somebody's fitted
  // wardrobe and remix it. Anybody who tapped the tab expecting a shop found a
  // portfolio belonging to a different product.
  "a shop tab has to lead to a shop",
);

{
  const nav = code("src/lib/workspace/navigation.ts");
  check(
    "Used Items is reachable from the sidebar",
    /href: "\/marketplace\/used"/.test(nav),
  );
  check(
    "and findable by what somebody would type",
    /"second hand"/.test(nav) && /"sofa"/.test(nav),
  );
}

// ---------------------------------------------------------------------------
// 8. Location, and what is not asked for
// ---------------------------------------------------------------------------

check(
  "a listing can carry an area",
  /add column if not exists location_area text/.test(migration),
);
check(
  "and nothing that is a street address",
  !/address/i.test(migration.replace(/street address/gi, "")) &&
    !/latitude|longitude/i.test(migration),
  "a second-hand listing is somebody's home",
);
{
  const form = code("src/components/products/product-form.tsx");
  check(
    "the form says what the area field is for",
    /A neighbourhood, not your address\./.test(form),
  );
  check(
    "the used fields only appear once Used is chosen",
    // Anchored on the block itself. `{secondHand && (` now guards two things —
    // these fields and the photo shot list below — so a bare match would keep
    // passing after one of them was deleted.
    /\{secondHand && \(\s*\n\s*<div className="space-y-4 border-t pt-4">/.test(
      form,
    ),
    "a form that shows every field to everybody is one people abandon",
  );
  check(
    "and the seller is told which section they are posting to",
    /Marketplace → Used Items/.test(form),
  );
  check(
    "including that one listing is enough",
    /You do not need to post it twice/.test(form),
  );
}

// ---------------------------------------------------------------------------
// 9. Reaching the seller, and photographing the thing
// ---------------------------------------------------------------------------

{
  const detail = code("src/app/marketplace/[id]/page.tsx");
  check(
    "a buyer can message the seller from the listing",
    /<MessageButton[\s\n]/.test(detail),
    "\"Contact supplier\" was a link to a profile, and a private seller has no number on theirs",
  );
  check(
    "the thread opens against this product",
    /contextType="product"/.test(detail) && /contextId=\{id\}/.test(detail),
    "a seller with six listings needs to know which one",
  );
  check(
    "and it reaches the owner of the listing",
    /userId=\{String\(product\.owner_id\)\}/.test(detail),
  );
  check(
    "the profile link is still there, as the secondary action",
    /View profile/.test(detail) &&
      /buttonVariants\(\{ variant: "outline" \}\)/.test(detail),
  );

  const form = code("src/components/products/product-form.tsx");
  check(
    "a second-hand seller is told which photographs buyers ask for",
    /What buyers ask for, in this order/.test(form),
  );
  for (const shot of [
    "Front, straight on",
    "Back",
    "Side",
    "Close-up",
    "scratch, dent or missing part",
    "Serial or model plate",
  ]) {
    check(
      `including ${shot.toLowerCase()}`,
      form.includes(shot),
    );
  }
  check(
    "the shot list is only on second-hand listings",
    /\{secondHand && \(\s*\n\s*<div className="rounded-xl border border-dashed/.test(
      form,
    ),
    "a shot list on every listing is a shot list nobody reads",
  );
  check(
    "and sellers are told their photos carry a watermark",
    /Published photos carry your watermark\./.test(form),
  );
}

// ---------------------------------------------------------------------------
// 10. Posting, from the page you are already on
//
// Listing something was reachable from the sidebar, the dashboard, the feed
// composer and the floating button — everywhere except the marketplace. The
// moment somebody browsing decides to sell their own sofa is the moment they
// have to leave the page and find the form, which is the moment most people
// do not bother.
// ---------------------------------------------------------------------------

for (const [path, expected, what] of [
  ["src/app/marketplace/page.tsx", "new", "New Items"],
  ["src/app/marketplace/used/page.tsx", "used", "Used Items"],
] as const) {
  const page = code(path);
  check(
    `${what} carries a post action in its header`,
    // Scoped to the header block. Now that the header and the empty state
    // render the identical element, a bare match on it would keep passing
    // after the header's copy was deleted — the empty state's would satisfy it.
    new RegExp(
      `<div className="mb-4 flex items-center justify-between gap-3">[\\s\\S]{0,400}<PostItemButton condition="${expected}" />`,
    ).test(page),
  );
  check(
    `and again where ${what} is empty`,
    new RegExp(
      `action=\\{<PostItemButton condition="${expected}" />\\}`,
    ).test(page),
    "the empty state is exactly where somebody is told to be the first",
  );
  check(
    `and the empty state actually renders what it is handed on ${what}`,
    /\{action\}/.test(page),
    "an `action` prop that is accepted and never rendered",
  );
}

{
  const button = code("src/components/products/post-item-button.tsx");
  check(
    "posting from Used Items carries the condition through",
    /`\/products\/new\?condition=\$\{condition\}`/.test(button),
    "otherwise the seller lands on a form set to New and has to find the field",
  );
  check(
    "and posting from New Items does not add a redundant parameter",
    /condition === "new"\s*\n?\s*\? "\/products\/new"/.test(button),
  );
  check(
    "the button is a real tap target on a phone",
    /min-h-11/.test(button),
  );
  check(
    "and says what it does in two words",
    /\{label \?\? "Post Product"\}/.test(button),
    'the labels were "Post an item" and "Sell something used" — a sentence each',
  );
  check(
    "it sits beside the heading rather than under it",
    /shrink-0/.test(button) && !/w-full/.test(button),
    "a full-width button below the title is another row of a phone screen",
  );
}

{
  // The browse pages lead with a heading and the one action. Everything that
  // used to sit between them and the products — an eyebrow repeating the tabs,
  // a paragraph describing the marketplace to people standing in it, and a
  // permanently open panel of refinements — is gone or folded away.
  const filters = code("src/components/products/marketplace-filters.tsx");
  check(
    "the refinements are behind the filter button, not permanently open",
    /\{showMore && showUsedFilters && \(/.test(filters),
    "they were roughly 250px of controls between the search box and the products",
  );
  check(
    "and one button opens all of them, not one panel each",
    (filters.match(/\{showMore && /g) ?? []).length === 2 &&
      !/showPrice/.test(filters),
    "price had its own disclosure while grade, city and area had none",
  );
  check(
    "a link that already carries a filter arrives with them open",
    /const \[showMore, setShowMore\] = useState\(\s*\n?\s*Boolean\(/.test(
      filters,
    ) && /current\.usedGrade \|\|/.test(filters),
    "otherwise a shared search looks unfiltered and the filters look broken",
  );

  for (const [path, what] of [
    ["src/app/marketplace/page.tsx", "New Items"],
    ["src/app/marketplace/used/page.tsx", "Used Items"],
  ] as const) {
    const page = code(path);
    check(
      `${what} does not explain itself in a paragraph`,
      !/<p className="mt-1 text-muted-foreground">/.test(page),
      "five lines of prose before a single product on a phone",
    );
    check(
      `and ${what} does not repeat the tab bar above it`,
      !/className="flex items-center gap-2 text-sm text-muted-foreground">\s*\n?\s*<(Store|Recycle)/.test(
        page,
      ),
    );
  }
}

{
  const page = code("src/app/(dashboard)/products/new/page.tsx");
  check(
    "the form honours the condition it was opened with",
    /initialCondition=\{condition\}/.test(page),
  );
  check(
    "validated against what the form can offer, not trusted",
    /\(SELLABLE_CONDITIONS as string\[\]\)\.includes\(raw\)/.test(page),
    "a parameter naming a condition the form never shipped would save as new",
  );
  // Where a signed-out seller actually goes is decided by the middleware, not
  // by this page — `/products/new` is in PROTECTED_ROUTES, so the redirect
  // happens before the file runs. Checked by serving the build and following
  // the link, which is how the page's own fallback was found to be both
  // unreachable and using the wrong parameter name.
  const middleware = code("src/lib/supabase/middleware.ts");
  check(
    "a signed-out seller is brought back to the whole address",
    /const target = pathname \+ request\.nextUrl\.search;/.test(middleware),
    "it sent back the path only, so ?condition=used was lost on sign-in",
  );
  check(
    "and the login URL is not left carrying the original parameters",
    /url\.search = "";/.test(middleware),
  );
  check(
    "the page's own fallback uses the parameter the login form reads",
    /redirect\(`\/login\?redirect=\$\{encodeURIComponent\(target\)\}`\)/.test(
      page,
    ),
    "`next` is the OAuth callback's name for it and is ignored by the form",
  );
  check(
    "and carries the condition with it",
    /const target = condition\s*\n?\s*\? `\/products\/new\?condition=\$\{condition\}`/.test(
      page,
    ),
  );

  const form = code("src/components/products/product-form.tsx");
  check(
    "an existing listing's own condition wins over the link that was followed",
    /\(product\?\.condition as ProductCondition \| undefined\) \?\?\s*\n?\s*initialCondition \?\?/.test(
      form,
    ),
    "editing a new listing from a Used link must not silently switch it",
  );
}

{
  const designs = code("src/app/designs/page.tsx");
  check(
    "the Digital Marketplace tab has a create action outside its empty state",
    (designs.match(/href="\/studio"/g) ?? []).length === 2,
    "it was only shown when nothing had been published, so a second design was never invited",
  );
  check(
    "in the header, beside the title",
    /<header className="flex flex-col gap-4[\s\S]{0,900}Design something/.test(
      designs,
    ),
  );
}

// ---------------------------------------------------------------------------
// 11. Signing in does not send anybody off Medosha
//
// Found while checking that the condition survived a sign-in: the password
// action redirected to whatever was in its hidden input, and the hidden input
// came from the query string. The Google callback had guarded its equivalent
// for exactly this reason; the password path had not. Widening what the
// middleware puts in that parameter without fixing it would have made it
// worse.
// ---------------------------------------------------------------------------

{
  check(
    "a same-site path is kept",
    safeRedirect("/products/new?condition=used") ===
      "/products/new?condition=used",
  );
  check(
    "an absolute URL is refused",
    safeRedirect("https://evil.example") === "/dashboard",
  );
  check(
    "a protocol-relative one is refused",
    safeRedirect("//evil.example") === "/dashboard",
    "browsers read it as a scheme-less absolute URL and follow it off-site",
  );
  check(
    "and the backslash variant of it",
    safeRedirect("/\\evil.example") === "/dashboard",
    "some browsers normalise the backslash into a forward slash",
  );
  check(
    "an embedded scheme is refused",
    safeRedirect("/redirect?to=https://evil.example") === "/dashboard",
  );
  // These two are what the leading-slash rule is for, and nothing else catches
  // them: `javascript:` has a colon but no `://`, and a bare hostname has
  // neither. Removing that rule left every other check passing.
  check(
    "a javascript: URL is refused",
    safeRedirect("javascript:alert(1)") === "/dashboard",
    "it has a colon but no `://`, so the scheme check does not see it",
  );
  check(
    "and so is a bare hostname",
    safeRedirect("evil.example") === "/dashboard",
  );
  check("nothing at all falls back", safeRedirect(null) === "/dashboard");

  const action = code("src/app/(auth)/login/actions.ts");
  check(
    "the password sign-in guards where it sends people",
    /redirect\(safeRedirect\(/.test(action),
    "it redirected to the hidden input's value, and that value came from the URL",
  );
  const form = code("src/app/(auth)/login/login-form.tsx");
  check(
    "and the form never renders an off-site destination in the first place",
    /safeRedirect\(searchParams\.get\("redirect"\)\)/.test(form),
  );
  const callback = code("src/app/auth/callback/route.ts");
  check(
    "the Google callback uses the same rule rather than its own copy",
    /safeRedirect\(searchParams\.get\("next"\)\)/.test(callback) &&
      !/function safeNext/.test(callback),
    "two implementations of one rule is how the second comes to be missing",
  );
}

// ---------------------------------------------------------------------------
// 12. Digital is a marketplace section, not somebody else's gallery
//
// The tab pointed at `/designs` — Berchuma Studio's catalogue, a place to open
// a fitted wardrobe and remix it. Tapping a shop tab and landing in a
// portfolio belonging to a different product is the bug this closes.
// ---------------------------------------------------------------------------

{
  const digitalMigration = readFileSync(
    "supabase/migrations/0075_digital_products.sql",
    "utf8",
  ).replace(/^\s*--.*$/gm, "");

  check(
    "no second product table for files either",
    !/create table/i.test(digitalMigration),
  );
  check(
    "everything already listed stays physical",
    /fulfilment public\.product_fulfilment\s*\n?\s*not null default 'physical'/.test(
      digitalMigration,
    ),
  );
  check(
    "a physical listing cannot carry file details",
    /fulfilment = 'digital'\s*\n\s*or \(\s*\n\s*digital_kind is null/.test(
      digitalMigration,
    ),
  );
  check(
    "and a digital one must say what kind of file it is",
    /fulfilment <> 'digital' or digital_kind is not null/.test(digitalMigration),
    "otherwise the filter rail has listings that answer to none of it",
  );
  check(
    "a file is never second-hand and never shipped",
    /fulfilment <> 'digital' or \(condition = 'new' and delivery_available = false\)/.test(
      digitalMigration,
    ),
    "either would put one listing in two sections",
  );

  const products = code("src/lib/data/products.ts");
  check(
    "Digital is read from the fulfilment column",
    /if \(section === "digital"\) \{\s*\n\s*query = query\.eq\("fulfilment", "digital"\);/.test(
      products,
    ),
  );
  check(
    "New Items narrows on fulfilment as well as condition",
    /section === "new"[\s\S]{0,120}\.eq\("fulfilment", "physical"\)\.eq\("condition", "new"\)/.test(
      products,
    ),
    "a digital product is condition new, so condition alone would list every course among the cement",
  );
  check(
    "and Used Items does too",
    /section === "used"[\s\S]{0,140}\.eq\("fulfilment", "physical"\)\.in\("condition", SECOND_HAND\)/.test(
      products,
    ),
  );

  const page = code("src/app/marketplace/digital/page.tsx");
  check("there is a Digital Marketplace page", page.length > 0);
  check("which asks for the digital section", /section: "digital",/.test(page));
  check(
    "the kind is its filter rail, not the physical categories",
    /Object\.entries\(DIGITAL_KINDS\)\.map/.test(page) &&
      !/getProductCategories/.test(page),
    "a course is not sorted by \"lighting\"",
  );
  check(
    "and it carries a post action like the other sections",
    // In the header. The empty state renders the identical element, so a bare
    // match would survive the header's copy being deleted.
    /<div className="mb-4 flex items-center justify-between gap-3">[\s\S]{0,300}<PostItemButton condition="new" \/>/.test(
      page,
    ),
  );

  check(
    "the five kinds the brief named are the five that exist",
    Object.keys(DIGITAL_KINDS).join(",") ===
      "course,sketchup,model_3d,floor_plan,other",
  );

  const form = code("src/components/products/product-form.tsx");
  check(
    "a seller can actually list one",
    /name="fulfilment"/.test(form) && /name="digitalKind"/.test(form),
    "a marketplace tab nobody can list into is the same dead end as the wrong link",
  );
  check(
    "and is not asked the questions that no longer apply",
    // Three of them — condition, location, delivery. Counted, because finding
    // one leaves the other two free to come back.
    (form.match(/digital && "hidden"/g) ?? []).length === 3,
    "condition, city and delivery mean nothing about a file",
  );

  const action = code("src/app/(dashboard)/products/actions.ts");
  check(
    "choosing Digital forces the columns the database insists on",
    /data\.fulfilment === "digital"\s*\n?\s*\? "new"/.test(action) &&
      /data\.fulfilment === "digital" \? false : Boolean\(data\.deliveryAvailable\)/.test(
        action,
      ),
    "otherwise the seller meets a check-constraint error instead of a saved listing",
  );

  // The samples exist so the section is not an empty page on the day it ships.
  check(
    "five samples are placed, one of each kind",
    // Distinct kinds, not five matches. Two samples of the same kind still
    // counted five and left a kind with an empty filter behind it.
    new Set(
      (digitalMigration.match(
        /'digital', '(course|sketchup|model_3d|floor_plan|other)'/g,
      ) ?? []).map((match) => match.split("'")[3]),
    ).size === 5,
  );
  check(
    "owned by an account that says it is not a real seller",
    /is_demo = true/.test(digitalMigration) &&
      /Not a real seller, and nothing here is for sale/.test(digitalMigration),
  );
  check(
    "marked so nobody mistakes one for a listing they can buy",
    /is_sample boolean not null default false/.test(digitalMigration) &&
      /Sample/.test(code("src/components/products/product-card.tsx")),
  );
  check(
    "and registered under a batch so they can be removed",
    // The insert, not the comment beneath it explaining how to undo it — the
    // comment stripper takes that away, and it would have been the only match.
    /'products', id, 'digital_samples_0075'/.test(digitalMigration),
  );
}

// ---------------------------------------------------------------------------
// 13. Posting is not held up, and a report takes the file down
// ---------------------------------------------------------------------------

{
  const review = readFileSync(
    "supabase/migrations/0076_review_after_posting.sql",
    "utf8",
  ).replace(/^\s*--.*$/gm, "");

  const upload = code("src/app/moderation/upload-actions.ts");
  check(
    "only a refusal stops a seller",
    // Literally only a refusal now. This also required `!outcome.itemId`,
    // which made a moderation row a precondition for publishing: a seller
    // whose photograph nothing objected to was refused because the audit
    // record could not be written.
    /if \(outcome\.status === "blocked"\) \{/.test(upload) &&
      !/!outcome\.itemId/.test(upload),
    'it was `!== "safe"`, and then it still demanded a moderation record',
  );
  check(
    "and the caller is told what actually happened",
    /status: outcome\.status,\s*\n\s*publicUrl,/.test(upload),
    "returning \"safe\" for something still being checked is a lie the UI repeats",
  );

  for (const surface of [
    "src/components/products/product-images-input.tsx",
    "src/components/projects/project-images-input.tsx",
    "src/components/profile/avatar-upload.tsx",
    "src/components/profile/cover-upload.tsx",
    "src/components/companies/single-image-input.tsx",
    "src/components/property/property-form.tsx",
  ]) {
    check(
      `${surface.split("/").at(-1)} treats a URL as published`,
      !/verdict\.status !== "safe"/.test(code(surface)),
      "eight surfaces each had their own copy of the old rule",
    );
  }
  for (const surface of [
    "src/components/tour/panorama-input.tsx",
    "src/components/tour/floor-plan-input.tsx",
  ]) {
    check(
      `${surface.split("/").at(-1)} treats a URL as published`,
      !/verdict\.status === "safe" &&/.test(code(surface)),
    );
  }

  check(
    "the seller is not told a published image was held back",
    !/is under review/.test(code("src/components/products/product-images-input.tsx")),
  );
  check(
    "and is told when one is published and still being checked",
    /posted and still being checked/.test(
      code("src/components/products/product-images-input.tsx"),
    ),
  );
  {
    // Whitespace-normalised once. The `||` that used to be here tested the
    // same normalised string twice with two regexes that could not disagree,
    // which is a check with a spare half rather than a stronger one.
    const guidelines = code("src/app/(info)/guidelines/page.tsx").replace(
      /\s+/g,
      " ",
    );
    check(
      "the public guidelines describe what actually happens",
      /post goes up anyway and a person looks at it afterwards/.test(guidelines),
      "a policy page describing a model the platform no longer uses is a false statement",
    );
    check(
      "and no longer say uploads are checked before anyone can see them",
      !/checked automatically before anyone else can see it/.test(guidelines),
    );
    check(
      "and say what a report does before it takes anything down",
      /One report does not take anything down/.test(guidelines),
    );
  }

  // Reports
  check(
    "one report does not hide anything",
    /select 3 \$\$/.test(review),
    "it is one person's opinion, and 0052 says so in as many words",
  );
  check(
    "severe categories do not wait for a third",
    /category in \('sexual_minors', 'sexual_explicit', 'illegal', 'threats'\)/.test(
      review,
    ),
  );
  check(
    "moderators are told when something is hidden",
    /insert into public\.notifications[\s\S]{0,200}Content hidden pending review/.test(
      review,
    ),
    "a queue nobody is watching leaves it hidden indefinitely",
  );
  check(
    "and only when it was not already hidden",
    /item\.hidden_at is null/.test(review),
  );

  const reportAction = code("src/app/moderation/actions.ts");
  check(
    "the report path no longer writes the count itself",
    !/report_count: \(existing\?\.report_count \?\? 0\) \+ 1/.test(reportAction),
    "the trigger owns it; two writers from a value read before the insert loses one",
  );
  check(
    "a hidden file is actually taken out of the public bucket",
    /await hideReported\(supabase, itemId, bucket\)/.test(reportAction),
    "`hidden_at` hides nothing on its own — the pages hold the URL, not this row",
  );
  const service = code("src/lib/moderation/service.ts");
  check(
    "which re-quarantines it before removing it",
    /\.from\("moderation-quarantine"\)\s*\n?\s*\.upload\(path, download\.data[\s\S]{0,300}\.remove\(\[path\]\)/.test(
      service,
    ),
    "removing first and failing to keep it would lose the evidence",
  );
  check(
    "and clears the public path so nothing renders it again",
    /\.update\(\{ public_path: null, quarantine_path: path \}\)/.test(service),
  );
}

// ---------------------------------------------------------------------------
// 14. Rental, and the file being sold
// ---------------------------------------------------------------------------

{
  const review = readFileSync(
    "supabase/migrations/0076_review_after_posting.sql",
    "utf8",
  ).replace(/^\s*--.*$/gm, "");

  check(
    "rental is a value of the column, not a second table",
    /alter type public\.product_fulfilment add value if not exists 'rental'/.test(
      review,
    ) && !/create table/i.test(review),
  );
  check(
    "and reuses the rental period equipment already had",
    !/create type public\.rental_period/.test(review),
    "a second enum with the same name and different words is how two parts of one marketplace disagree about a week",
  );
  check(
    "a rental must say per what",
    /fulfilment <> 'rental' or rental_period is not null/.test(review),
  );
  check(
    "and only a rental carries a period or a deposit",
    /fulfilment = 'rental'\s*\n\s*or \(rental_period is null and rental_deposit is null\)/.test(
      review,
    ),
  );
  check(
    "the file being sold is in a private bucket",
    /values \('digital-goods', 'digital-goods', false,/.test(review),
    "the file is the product; a public bucket gives it away to anybody who reads the HTML",
  );
  check(
    "scoped to the seller's own folder",
    /bucket_id = 'digital-goods'\s*\n\s*and \(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/.test(
      review,
    ),
  );
  check(
    "and only a digital listing may carry one",
    /fulfilment = 'digital'\s*\n\s*or \(digital_file_path is null and digital_file_name is null\)/.test(
      review,
    ),
  );

  const form = code("src/components/products/product-form.tsx");
  check(
    "the posting page offers all three types",
    /<SelectItem value="physical">/.test(form) &&
      /<SelectItem value="rental">/.test(form) &&
      /<SelectItem value="digital">/.test(form),
  );
  check(
    "choosing a file asks for the file",
    /\{digital && \([\s\S]{0,400}<DigitalFileInput/.test(form),
  );
  check(
    "choosing a rental asks for the rate period",
    /\{rental && \([\s\S]{0,400}name="rentalPeriod"/.test(form),
  );

  const fileInput = code("src/components/products/digital-file-input.tsx");
  check(
    "the file goes to the private bucket",
    /\.from\("digital-goods"\)/.test(fileInput),
  );
  check(
    "into the seller's own folder",
    /`\$\{userId\}\//.test(fileInput),
    "the storage policy checks the first path segment against auth.uid()",
  );
  check(
    "and the seller is told there is no checkout yet",
    /Medosha\s*\n?\s*does not take payment yet/.test(
      fileInput.replace(/\s+/g, " "),
    ) || /does not take payment yet/.test(fileInput),
    "storing a file people think they are selling automatically would be worse than not storing it",
  );

  check(
    "there is a Rental section",
    MARKETPLACE_SECTIONS.some(
      (section) => section.key === "rental" && section.href === "/marketplace/rental",
    ),
  );
  const rentalPage = code("src/app/marketplace/rental/page.tsx");
  check("with a page", rentalPage.length > 0);
  check("which asks for the rental section", /section: "rental",/.test(rentalPage));

  const card = code("src/components/products/product-card.tsx");
  check(
    "a rate says what it is per",
    /RENTAL_PERIODS\[product\.rental_period\]\.per/.test(card),
    'a number with no "per day" beside it reads as the purchase price',
  );
}

// ---------------------------------------------------------------------------
// 15. Nothing else about the marketplace changed
// ---------------------------------------------------------------------------

{
  const products = code("src/lib/data/products.ts");
  check(
    "a query with no section still reads both",
    /if \(section === "new"\)/.test(products) &&
      !/section = "new"/.test(products),
    "global search and saved items ask for everything",
  );
  const detail = code("src/app/marketplace/[id]/page.tsx");
  check(
    "the detail page shows the condition when there is one to show",
    /\{condition !== "new" && \(/.test(detail),
  );
  check(
    "related products match the condition",
    /\.eq\("condition", product\.condition as ProductCondition\)/.test(detail),
    "a second-hand listing among four new ones reads as a cheaper version of the same thing",
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
console.log(`${DIM}used items: one table, one column, one badge${RESET}`);
