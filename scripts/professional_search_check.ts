/**
 * Finding a person, and the badge that follows them.
 *
 *   npx tsx scripts/professional_search_check.ts
 *
 * ## What was wrong
 *
 * Medosha could find work, services and businesses, and not a person.
 * `global_search` has a professional branch, but it matches names and bios,
 * takes no filters and ranks by `profile_views` — the most looked-at profile
 * first, not the best one.
 *
 * And the verification a person earns was invisible everywhere except their
 * own profile. Where it did appear it appeared as a bare tick — and on a
 * property listing it appeared with the words "Medosha has checked this
 * seller's identity", which is not what a confirmed phone code establishes.
 * That sentence was being read by somebody deciding how to negotiate on a
 * house.
 */

import "./lib/allow-server-only.ts";

import { readFileSync } from "node:fs";

import { listingBadges } from "../src/lib/property/listing.ts";

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
  "supabase/migrations/0073_professional_search.sql",
  "utf8",
).replace(/^\s*--.*$/gm, "");

// ---------------------------------------------------------------------------
// 1. The search exists and is public
// ---------------------------------------------------------------------------

check(
  "there is a function for finding a person",
  /create or replace function public\.search_professionals\(/.test(migration),
);
check(
  "a signed-out visitor can call it",
  /\) to anon, authenticated;/.test(migration),
  "somebody looking for a carpenter should not need an account",
);
check(
  "and it is revoked from everyone else first",
  /revoke all on function public\.search_professionals\(/.test(migration),
);
check(
  "no new table was invented for the trade",
  !/create table/i.test(migration),
  "a trade is the category of the services somebody publishes",
);

// ---------------------------------------------------------------------------
// 2. Who is excluded
// ---------------------------------------------------------------------------

check(
  "a restricted account is never recommended",
  /p\.restricted_until is null or p\.restricted_until < now\(\)/.test(migration),
  "the one thing a directory of people to pay must not do",
);
check(
  "and neither is somebody with no public page",
  /p\.username is not null/.test(migration),
);
check(
  "a draft service does not make somebody findable under its trade",
  /where s\.status = 'published'/.test(migration),
  "otherwise anybody can claim any trade with a listing nobody can see",
);

// ---------------------------------------------------------------------------
// 3. The order
// ---------------------------------------------------------------------------

{
  const order = migration.slice(migration.indexOf("  order by\n"));
  // `indexOf` returns -1 for a term that is gone, and -1 is less than every
  // real position — so a bare `a < b` reports the right order for a clause
  // that has been deleted. Both have to be present first.
  const at = (needle: string) => {
    const found = order.indexOf(needle);
    return found === -1 ? null : found;
  };
  {
    const reviewed = at("(m.review_count > 0) desc");
    const views = at("m.profile_views desc");
    check(
      "having been reviewed outranks having been looked at",
      reviewed !== null && views !== null && reviewed < views,
      "ranking by views alone is what the global search does",
    );
  }
  {
    const rating = at("m.rating desc nulls last");
    const verified = at("m.verified_reviews desc");
    check(
      "and the rating leads the tie-breakers",
      rating !== null && verified !== null && rating < verified,
      "best rated, not most reviewed",
    );
  }
}

check(
  "the page size is capped whatever a caller asks for",
  /least\(greatest\(coalesce\(p_limit, 24\), 1\), 60\)/.test(migration),
);
check(
  "and the total is counted past the page",
  /count\(\*\) over \(\)::bigint as total_count/.test(migration),
);

// ---------------------------------------------------------------------------
// 4. The numbers on a row
// ---------------------------------------------------------------------------

check(
  "a rating spans reviews of the person and of their services",
  /when r\.subject_type = 'professional' then r\.subject_id/.test(migration) &&
    /when r\.subject_type = 'service' then \(/.test(migration),
);
check(
  "reviews of a draft service reach nobody",
  /where s\.id = r\.subject_id and s\.status = 'published'/.test(migration),
);
check(
  "reviews backed by a booking or a hire are counted apart",
  /count\(\*\) filter \(where r\.verified\)::bigint as verified_reviews/.test(
    migration,
  ),
);
check(
  "the verified filter needs a confirmed code",
  /or p\.phone_verified\)/.test(migration) &&
    !/p_verified_only[\s\S]{0,80}p\.phone is not null/.test(migration),
  "a typed number is not verification",
);
check(
  "an unrated profile does not pass a minimum rating",
  /p_min_rating is null or st\.rating >= p_min_rating/.test(migration) &&
    !/coalesce\(st\.rating,/.test(migration),
  "coalescing a missing rating to anything lets it through",
);

// ---------------------------------------------------------------------------
// 5. The page
// ---------------------------------------------------------------------------

{
  const page = code("src/app/professionals/page.tsx");
  check("there is a page for it", page.length > 0);
  check(
    "every filter is a URL parameter, so a search is a link",
    /searchParams/.test(page) &&
      ["q", "category", "city", "rating", "verified", "available"].every((key) =>
        new RegExp(`get\\("${key}"\\)`).test(page),
      ),
  );
  check(
    "the filters render inside Suspense",
    /<Suspense[\s\n]/.test(page),
    "useSearchParams without one opts the whole route out of static rendering",
  );
  check(
    "an empty result says whether filters caused it",
    /Try a wider search/.test(page),
  );
  check(
    "and a missing migration is explained rather than shown as no results",
    /!result\.available \?/.test(page),
  );
  check(
    "the cities offered are the cities people are in",
    // The call, not the identifier: the function's own definition stays in the
    // file after the call site is replaced with a literal list.
    /^\s*citiesWithProfessionals\(\),$/m.test(page),
    "a hard-coded list offers towns nobody works in",
  );
}

{
  const filters = code("src/components/professionals/professional-filters.tsx");
  check(
    "changing a filter resets the page number",
    /params\.delete\("page"\)/.test(filters),
    "page 4 of a result set that just became eleven rows reads as no results",
  );
  check(
    "the toggles announce their state",
    /aria-pressed=\{on\}/.test(filters),
  );
  check(
    "and say what they mean",
    /Confirmed a code sent to their phone/.test(filters),
  );
}

{
  const card = code("src/components/professionals/professional-card.tsx");
  check(
    "a card shows the count of reviews backed by a job, not just an average",
    /backed by a job/.test(card),
    "a card showing only 5.0 is a card a scammer can produce",
  );
  check(
    "an unreviewed person says so rather than showing empty stars",
    /No reviews yet/.test(card),
    "a row of empty stars reads as a bad rating, not as no rating",
  );
  check(
    "and the card links to the person",
    /href=\{`\/u\/\$\{person\.username\}`\}/.test(card),
  );
}

{
  const nav = code("src/lib/workspace/navigation.ts");
  check(
    "the page is reachable from the sidebar",
    /href: "\/professionals"/.test(nav),
    "a page nothing links to is a page nobody finds",
  );
  check(
    "and searchable by the trade somebody would type",
    /"carpenter"/.test(nav) && /"electrician"/.test(nav),
  );
}

// ---------------------------------------------------------------------------
// 6. The badge follows the person
// ---------------------------------------------------------------------------

{
  const badges = listingBadges({
    sellerKind: "owner",
    sellerVerified: true,
    listingVerified: false,
    isPremium: false,
    isCompany: false,
    isSample: false,
  });
  const seller = badges.find((badge) => badge.id === "seller-verified");

  check("a phone-verified seller still gets a badge", Boolean(seller));
  check(
    "but it does not claim Medosha checked their identity",
    !/checked this seller's identity/i.test(seller?.title ?? ""),
    "the source is a confirmed phone code and nothing else",
  );
  check(
    "it says what was actually confirmed",
    /one-time code sent to their phone/i.test(seller?.title ?? ""),
  );
  check(
    "and says outright what was not",
    /has not checked their identity/i.test(seller?.title ?? ""),
  );
  check(
    "the label matches the claim",
    /Phone-verified/.test(seller?.label ?? ""),
  );

  const unverified = listingBadges({
    sellerKind: "owner",
    sellerVerified: false,
    listingVerified: false,
    isPremium: false,
    isCompany: false,
    isSample: false,
  });
  check(
    "an unverified seller gets no badge at all",
    !unverified.some((badge) => badge.id === "seller-verified"),
  );
}

for (const [path, what] of [
  ["src/app/marketplace/[id]/page.tsx", "a marketplace supplier"],
  ["src/app/services/[id]/page.tsx", "a service provider"],
] as const) {
  const page = code(path);
  check(
    `${what} carries the named badge`,
    /<VerifiedBadge level="phone" showLabel=\{false\} \/>/.test(page),
    "a bare tick is read as an assurance whose strength the reader guesses",
  );
  check(
    `and no bare tick is left on ${what}`,
    !/<BadgeCheck[\s\n]/.test(page),
  );
  check(
    `${what} links to their profile`,
    /\/u\//.test(page),
    "the badge and the reputation behind it have to be reachable",
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
console.log(`${DIM}professionals: findable, ranked by what clients said${RESET}`);
