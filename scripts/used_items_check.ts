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
  "the condition is required on the form",
  !productSchema.safeParse({
    title: "Desk",
    stockStatus: "in_stock",
    status: "published",
  }).success,
  "a blank condition would let the default decide, and the default is New",
);
check(
  "and only new or used is accepted from a browser",
  !productSchema.safeParse({
    title: "Desk",
    stockStatus: "in_stock",
    status: "published",
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
  check(
    "New Items is condition = new",
    /if \(section === "new"\) query = query\.eq\("condition", "new"\);/.test(
      products,
    ),
  );
  check(
    "Used Items is everything that is not new",
    /else if \(section === "used"\) query = query\.in\("condition", SECOND_HAND\);/.test(
      products,
    ),
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
  check(
    "the page says anyone can sell, not only builders",
    // Whitespace-normalised. The sentence is wrapped by the formatter and
    // moved every time the header layout changes, so a regex that pins the
    // line breaks fails on a reflow that changed no words.
    /you do not need to be in construction/.test(
      usedPage.replace(/\s+/g, " "),
    ),
  );
}

// ---------------------------------------------------------------------------
// 7. Three sections, and the third is the one that already existed
// ---------------------------------------------------------------------------

check(
  "the marketplace has three sections",
  MARKETPLACE_SECTIONS.length === 3,
);
check(
  "named New Items, Used Items and Digital Marketplace",
  MARKETPLACE_SECTIONS.map((section) => section.label).join(" · ") ===
    "New Items · Used Items · Digital Marketplace",
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
  "Digital Marketplace points at the catalogue that already exists",
  MARKETPLACE_SECTIONS.find((section) => section.key === "digital")?.href ===
    "/designs",
  "a fourth marketplace beside three working ones is not an improvement",
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
    new RegExp(
      `<PostItemButton condition="${expected}" className="shrink-0" />`,
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
// 12. Nothing else about the marketplace changed
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
