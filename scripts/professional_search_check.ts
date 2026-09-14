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

import {
  AVAILABILITY_LABELS,
  MAX_SPECIALTIES,
  PROFESSIONS,
  TRAVEL_RADII,
  findProfession,
  isProfession,
  isTravelRadius,
  parseSpecialties,
  specialtiesFor,
} from "../src/lib/constants/professions.ts";
import { whatsappNumber } from "../src/lib/contact/phone.ts";
import { boundsOf, mapPoints } from "../src/lib/professionals/map-points.ts";
import {
  MAX_PIN_CHARACTERS,
  TRADE_ICON_CATEGORIES,
  availabilityLabel,
  isTakingWork,
  markerDescription,
  pinLabel,
  placeLabel,
  tradeColour,
  tradeIconCategory,
} from "../src/lib/professionals/trade-markers.ts";
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
/**
 * The file with one brace-delimited block cut out of it.
 *
 * For checks that have to say "this rule is not only inside that media query".
 * Counts braces rather than matching to the next `}`, because a media query
 * contains rules, which contain braces of their own.
 */
function withoutBlock(source: string, opener: string): string {
  const start = source.indexOf(opener);
  if (start < 0) return source;

  let depth = 0;
  for (let i = start + opener.length - 1; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(0, start) + source.slice(i + 1);
    }
  }
  return source.slice(0, start);
}

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
      // `city` is gone: the filter is now the job's area, which is the whole
      // point of 0078. Every parameter the form can set is listed, so one
      // dropped from the page is one the URL stops carrying.
      [
        "q",
        "profession",
        "category",
        "area",
        "provider",
        "rating",
        "experience",
        "sort",
        "verified",
        "available",
        "page",
      ].every((key) => new RegExp(`get\\("${key}"\\)`).test(page)),
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
    "the places offered are the places the search can match",
    // The call, not the identifier: the import line survives the call site
    // being replaced with a literal list.
    /^\s*listAreas\(\),$/m.test(page),
    "offering a name the search cannot resolve reads as 'nobody works here'",
  );
  check(
    "the page searches on the job location",
    /area,$/m.test(page) && /const area = get\("area"\);/.test(page),
    "this is the filter the whole feature turns on",
  );
  check(
    "and never on where the professional lives",
    !/location_city/.test(page) && !/citiesWithProfessionals/.test(page),
    "filtering by base location is the bug this replaces",
  );
}

{
  // professional-filters.tsx is gone; professional-search.tsx replaces it and
  // does the same job plus the job-location field. Two filter components on
  // one page would have been the duplicate-menu-entry problem in code form.
  const search = code("src/components/professionals/professional-search.tsx");
  check(
    "changing a filter resets the page number",
    /next\.delete\("page"\)/.test(search),
    "page 4 of a result set that just became eleven rows reads as no results",
  );
  check(
    "the job location is a list, not a free-text box",
    /<select\s*\n\s*name="area"/.test(search),
    "a typed Summitt matching nothing reads as 'no welders work in Summit'",
  );
  check(
    "the job location field asks where the job is",
    /Where is the job\?/.test(search),
  );
  check(
    "and the service field asks what is needed",
    /What service do you need\?/.test(search),
  );
  check(
    "the quick filters are all six the brief names",
    ["All", "Individuals", "Companies", "Available Now", "Verified", "Top Rated"]
      .every((label) => search.includes(`label: "${label}"`)),
  );
  check(
    "and they scroll rather than wrapping on a phone",
    /overflow-x-auto/.test(search),
    "two rows of chips push the results below the fold",
  );
  check(
    "turning one quick filter on clears the others",
    /provider: null,\s*available: null,\s*verified: null,\s*rating: null,/.test(
      search,
    ),
    "a row where three are lit and the result is the intersection is a row nobody can reason about",
  );
  check(
    "the four sorts the brief names are offered",
    ["relevance", "rating", "nearest", "experience"].every((s) =>
      new RegExp(`value: "${s}"`).test(search),
    ),
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
// Where somebody works is not where somebody lives
//
// The whole point of 0078. These are the checks that would fail if the
// distinction were quietly collapsed back into one field.
// ---------------------------------------------------------------------------

{
  const migration = readFileSync(
    "supabase/migrations/0078_service_areas.sql",
    "utf8",
  );

  check(
    "there is a table for the areas somebody works in",
    /create table if not exists public\.professional_service_areas/.test(migration),
    "one column cannot hold both a base and a list of places somebody will travel to",
  );
  check(
    "the search matches on those areas",
    /when m\.job_slug = any \(m\.area_slugs\) then 'area'/.test(migration),
  );
  check(
    "and not on the base area",
    !/job_slug = lower\(replace\(coalesce\(m\.base_area/.test(migration),
    "matching the base is the bug this replaces",
  );
  check(
    "an area nobody recognises matches nobody",
    /when m\.job_slug is null then null/.test(migration),
    "without it, a misspelling returns every citywide provider as though they all work in a place that does not exist",
  );
  check(
    "a travel radius can cover an area that was never listed",
    /when m\.travel_radius_km is not null/.test(migration),
  );
  check(
    "and so can covering the whole city",
    /when m\.serves_entire_city/.test(migration),
  );
  check(
    "listing an area outranks merely being within radius",
    /when 'area' then 300[\s\S]{0,60}when 'radius' then 200[\s\S]{0,60}when 'city' then 100/.test(
      migration,
    ),
  );
  check(
    "distance is the last thing ranking looks at, and it subtracts",
    /- coalesce\(f\.distance_km, 0\) \* 0\.5/.test(migration),
    "ranking a directory by proximity buries the good tradesman two areas over",
  );
  check(
    "a phone number is not what the verified filter means",
    /or m\.id_verified or m\.business_verified or m\.license_verified/.test(
      migration,
    ) && !/or m\.phone_verified or m\.id_verified/.test(migration),
  );
  check(
    "the number is only returned when its owner published it",
    /case when s\.show_phone then s\.phone else null end as phone/.test(migration),
    "a search result that returns it anyway is the same leak through another door",
  );
  check(
    "the three new badges cannot be self-granted",
    /license_verified cannot be changed from an authenticated session/.test(
      migration,
    ) &&
      /id_verified cannot be changed from an authenticated session/.test(migration) &&
      /business_verified cannot be changed from an authenticated session/.test(
        migration,
      ),
    "a badge somebody can set on themselves is worse than no badge",
  );
  check(
    "service areas are public to read and owner-only to write",
    /using \(true\);/.test(migration) &&
      /with check \(auth\.uid\(\) = profile_id\);/.test(migration),
  );
  check(
    "and are bounded per professional",
    /if n >= 40 then/.test(migration),
    "a row per area with nothing stopping it claims the whole city one insert at a time",
  );
}

// ---------------------------------------------------------------------------
// The trades
// ---------------------------------------------------------------------------

{
  for (const trade of [
    "Welder",
    "Carpenter",
    "Electrician",
    "Plumber",
    "Mason",
    "Painter",
    "Architect",
    "Civil Engineer",
    "Mechanical Engineer",
    "Interior Designer",
    "Furniture Maker",
    "Aluminium Worker",
    "Tile Installer",
    "Gypsum Worker",
    "HVAC Technician",
    "Contractor",
    "Surveyor",
    "Landscape Designer",
  ]) {
    check(`the form offers ${trade}`, isProfession(trade));
  }

  check(
    "a trade nobody offers is refused",
    !isProfession("Astronaut"),
    "profession is a text column, so this is the only thing between it and a crafted post",
  );
  check(
    "matching a trade ignores case and spacing",
    isProfession("  welder ") && findProfession("WELDER")?.value === "Welder",
  );
  check(
    "every trade maps onto a category that exists",
    PROFESSIONS.every((p) =>
      [
        "architecture",
        "structural",
        "mep",
        "surveying",
        "general-contracting",
        "interior",
        "landscaping",
        "electrical",
        "plumbing",
        "finishing",
        "joinery",
        "project-management",
      ].includes(p.category),
    ),
    "a profession filter and a category filter have to agree about who is who",
  );
  check(
    "a welder is offered welding specialties",
    specialtiesFor("Welder").includes("Gates"),
  );
  check(
    "and is not offered a landscaper's",
    !specialtiesFor("Welder").includes("Irrigation"),
    "offering a welder Irrigation is worse than offering nothing",
  );
  check(
    "an unknown trade is offered none rather than all of them",
    specialtiesFor("Astronaut").length === 0,
  );
}

{
  check(
    "specialties split on commas and trim",
    JSON.stringify(parseSpecialties(" gates , handrails ")) ===
      JSON.stringify(["gates", "handrails"]),
  );
  check(
    "a repeated specialty is stored once",
    parseSpecialties("Gates, gates, GATES").length === 1,
  );
  check(
    "no more than the column allows",
    parseSpecialties(
      Array.from({ length: 30 }, (_, i) => `s${i}`).join(","),
    ).length <= MAX_SPECIALTIES,
    "mirrors profiles_specialties_bounded in 0078; letting one through is a check violation the person cannot act on",
  );
  check(
    "and none of them blank",
    parseSpecialties("gates, , handrails").every((s) => s.length > 0),
  );

  check(
    "the travel radii are the ones the constraint allows",
    TRAVEL_RADII.every(isTravelRadius) && !isTravelRadius(7),
    "offering a radius the database refuses is a save that fails with nothing to show for it",
  );
}

// ---------------------------------------------------------------------------
// Call and WhatsApp
// ---------------------------------------------------------------------------

{
  check(
    "a local Ethiopian mobile gets its country code",
    whatsappNumber("0911223344") === "251911223344",
    "wa.me with a local number opens a chat with a stranger in the reader's country",
  );
  check(
    "an international one is left alone",
    whatsappNumber("+251911223344") === "251911223344",
  );
  check(
    "spaces and dashes are ignored",
    whatsappNumber("+251 91 122 33 44") === "251911223344",
  );
  check(
    "something too short is refused rather than guessed at",
    whatsappNumber("0911") === null,
  );
  check("and so is nonsense", whatsappNumber("call me") === null);

  const contact = code("src/components/professionals/contact-buttons.tsx");
  check(
    "a professional with no published number gets no Call button",
    /phone \? \(/.test(contact),
    "a tel: link to nothing reads as a broken app, not as a private number",
  );
  check(
    "Request Quote is offered either way",
    /Request Quote/.test(contact),
  );
}

// ---------------------------------------------------------------------------
// The card, and the two locations on it
// ---------------------------------------------------------------------------

{
  const card = code("src/components/professionals/professional-card.tsx");
  check("the card says where they are based", /Based in /.test(card));
  check(
    "and, separately, where they work",
    /Works in /.test(card),
    "showing only the base is why a welder in Bole looked like the wrong answer in Summit",
  );
  check(
    "somebody covering the whole city is said to",
    /Works anywhere in /.test(card),
  );
  check(
    "the strongest badge is shown, not the weakest",
    /verificationLevelsOf\(person\)/.test(card) && /levels\[0\]/.test(card),
  );
  check(
    "and availability is on the card",
    /Available today/.test(card),
  );
}

{
  const works = code("src/components/professionals/works-in-your-area.tsx");
  check(
    "a customer can ask whether somebody works in their area",
    /Check if they work in my area/.test(works),
  );
  check(
    "the answer compares areas, not spellings",
    /serviceAreas\.some\(\(a\) => a\.slug === asked\)/.test(works),
  );
  check(
    "covering the whole city counts as a yes",
    /servesEntireCity \|\|/.test(works),
  );
  check(
    "a no is not a dead end",
    /worth asking/.test(works),
    "somebody who would travel and has not ticked the box is the common case",
  );
}

// ---------------------------------------------------------------------------
// Saying where you work
// ---------------------------------------------------------------------------

{
  const form = code("src/components/profile/trade-and-areas.tsx");
  check(
    "the profile form asks for the areas somebody works in",
    /Areas I work in/.test(form),
  );
  check(
    "and says which of the two locations customers search by",
    /This is what customers search by/.test(form),
  );
  check(
    "the base area says it is not the search field",
    /Customers do not search by this/.test(form),
  );
  check(
    "areas are a multiple selection, not one choice",
    /toggleArea\(/.test(form) && /prev\.includes\(slug\)/.test(form),
  );
  check(
    "the whole-city shortcut exists",
    /name="servesEntireCity"/.test(form),
  );
  check(
    "and a travel radius is optional",
    /Only the areas I pick/.test(form),
  );

  const action = code("src/app/(dashboard)/profile/edit/actions.ts");
  check(
    "the action checks the trade against the list before writing it",
    /isProfession\(professionRaw\)/.test(action),
  );
  check(
    "and the radius against the constraint",
    /isTravelRadius\(radiusRaw\)/.test(action),
  );
  check(
    "area names come from the gazetteer, not from the browser",
    /from\("location_areas"\)/.test(action),
    "a posted name would create an area that exists only on one profile",
  );
  check(
    "deselecting an area actually removes it",
    /\.from\("professional_service_areas"\)\s*\.delete\(\)/.test(action),
    "merging instead of replacing means an area can be added and never taken away",
  );
  check(
    "and the search page is rebuilt when they change",
    /revalidatePath\("\/professionals"\)/.test(action),
  );
}

// ---------------------------------------------------------------------------
// Post a Job
//
// The other half of the same idea: a job is somewhere, and the people who
// should hear about it are the people who work there. 0015's matcher scored
// locality as `s.location_city = b.location_city`, so a posted job reached the
// welder in Bole exactly as often as the directory search had — never, for a
// job in Summit.
// ---------------------------------------------------------------------------

{
  // SQL comments stripped. The header of 0079 quotes the line it replaced —
  // `when s.location_city = b.location_city then 0.15` — so the check below
  // that the line is *gone* was satisfied by the prose explaining why it went.
  const matcher = readFileSync(
    "supabase/migrations/0079_job_area_matching.sql",
    "utf8",
  ).replace(/^\s*--.*$/gm, "");

  check(
    "a job can say which area it is in",
    /add column if not exists location_area text/.test(matcher),
    "a brief had a city, and the only city is the city",
  );
  check(
    "the matcher checks the areas professionals listed",
    /from public\.professional_service_areas a, job j/.test(matcher),
  );
  check(
    "and not whether they live in the same city",
    !/s\.location_city = b\.location_city/.test(matcher),
    "this is the line that made a Summit job miss the welder in Bole",
  );
  check(
    "somebody who does not cover the area is not told about the job",
    /where s\.coverage is not null/.test(matcher),
    "do not send unrelated job requests to every professional",
  );
  check(
    "nor is somebody in the wrong trade",
    /and s\.trade > 0/.test(matcher),
  );
  check(
    "a brief with no area stated still matches",
    /when m\.job_slug is null then 'unstated'/.test(matcher),
    "every brief written before this column exists has a null there; reading it as 'covers nowhere' breaks posting a job for everyone",
  );
  check(
    "a professional with a trade and no service listing can be matched",
    /where bs\.provider_id is not null or p\.profession is not null/.test(matcher),
    "the matcher started from services, so everyone the Professionals page finds was invisible to it",
  );
  check(
    "saying you work there outranks being caught by a radius",
    /when 'area' then 0\.15[\s\S]{0,80}when 'radius' then 0\.12[\s\S]{0,80}when 'city' then 0\.10/.test(
      matcher,
    ),
  );
  check(
    "and the client is told that is the reason",
    /when s\.coverage = 'area' then 'Works in the area you named'/.test(matcher),
    "a marketplace that cannot explain its own ranking is one nobody trusts",
  );
  check(
    "a restricted account is not recommended for a job",
    /p\.restricted_until is null or p\.restricted_until < now\(\)/.test(matcher),
    "telling somebody about a job is recommending them",
  );
  check(
    "nobody is offered their own job",
    /p\.id <> b\.client_id/.test(matcher),
  );
  check(
    "and filler is still excluded",
    /and s\.total >= 0\.33/.test(matcher),
  );

  const form = code("src/components/hire/brief-form.tsx");
  check(
    "the Post a Job form asks which area the job is in",
    /Area the job is in/.test(form),
  );
  check(
    "as a list, so the matcher can resolve it",
    /<select\s*\n\s*id="b-area"/.test(form),
  );
  check(
    "leaving it blank means the whole city rather than nowhere",
    /<option value="">Anywhere in the city<\/option>/.test(form),
  );
  check(
    "and it asks which trade is needed",
    /Trade needed/.test(form),
  );

  const action = code("src/app/hire/actions.ts");
  check(
    "the brief stores the area it was given",
    /location_area: input\.locationArea/.test(action),
  );
  check(
    "and checks the trade against the list before storing it",
    /isProfession\(input\.profession \?\? ""\)/.test(action),
  );
}

// ---------------------------------------------------------------------------
// The map, and the thing it must never show
// ---------------------------------------------------------------------------

{
  // The privacy property is structural: `search_professionals` has no
  // latitude or longitude in its `returns table`, so the map has no exact
  // coordinate to leak even if somebody wrote code that wanted one.
  const migration = readFileSync(
    "supabase/migrations/0078_service_areas.sql",
    "utf8",
  ).replace(/^\s*--.*$/gm, "");
  const returns = migration.slice(
    migration.indexOf("returns table ("),
    migration.indexOf("language sql"),
  );
  check(
    "the search never hands out a coordinate somebody set on their profile",
    !/\blatitude\b/.test(returns) && !/\blongitude\b/.test(returns),
    "a rule saying 'do not plot the exact pin' is one somebody breaks by adding a column to a select; not having it cannot be",
  );

  const points = mapPoints([
    {
      id: "a",
      username: "one",
      full_name: "Bole Welder",
      company_name: null,
      base_area: "Bole",
      location_city: "Addis Ababa",
      service_areas: ["Summit"],
      serves_entire_city: false,
      profession: "Welder",
      work_status: "available" as const,
    },
    {
      id: "b",
      username: "two",
      full_name: "No Base",
      company_name: null,
      base_area: null,
      location_city: "Addis Ababa",
      service_areas: ["CMC"],
      serves_entire_city: false,
      profession: "Electrician",
      work_status: "available" as const,
    },
    {
      id: "c",
      username: "three",
      full_name: "Nowhere Named",
      company_name: null,
      base_area: null,
      location_city: "Addis Ababa",
      service_areas: [],
      serves_entire_city: true,
      profession: "Mason",
      work_status: "available" as const,
    },
  ]);

  check("somebody with a base area is placed there", points[0]?.areaName === "Bole");
  check("and that is said to be their base", points[0]?.kind === "base");
  check(
    "somebody with no base falls back to an area they work in",
    points[1]?.areaName === "CMC" && points[1]?.kind === "service",
  );
  check(
    "and somebody who named no area at all is not placed",
    points.length === 2,
    "inventing a point puts a welder in the middle of the city who never said he worked there",
  );

  // Two people in the same area must not land on the same pixel, and the same
  // person must land in the same place twice.
  const twice = mapPoints([
    {
      id: "a",
      username: "one",
      full_name: "One",
      company_name: null,
      base_area: "Bole",
      location_city: "Addis Ababa",
      service_areas: [],
      serves_entire_city: false,
      profession: "Carpenter",
      work_status: "available" as const,
    },
    {
      id: "z",
      username: "two",
      full_name: "Two",
      company_name: null,
      base_area: "Bole",
      location_city: "Addis Ababa",
      service_areas: [],
      serves_entire_city: false,
      profession: "Plumber",
      work_status: "available" as const,
    },
  ]);
  check(
    "two professionals in one area do not stack on one point",
    twice[0].latitude !== twice[1].latitude ||
      twice[0].longitude !== twice[1].longitude,
    "nine markers on one pixel is one marker, and eight of them are unreachable",
  );
  check(
    "and the same person lands in the same place every time",
    twice[0].latitude === points[0].latitude &&
      twice[0].longitude === points[0].longitude,
    "a map that rearranges itself on every render cannot be used",
  );
  check(
    "a scattered point stays inside its own area",
    Math.abs(twice[0].latitude - 9.01) < 0.01 &&
      Math.abs(twice[0].longitude - 38.78) < 0.01,
    "drifting into a neighbouring area says somebody works where they did not say",
  );

  check("no points, no bounds", boundsOf([]) === null);
  const box = boundsOf(points)!;
  check(
    "the bounds contain every point",
    points.every(
      (p) =>
        p.longitude >= box[0][0] &&
        p.longitude <= box[1][0] &&
        p.latitude >= box[0][1] &&
        p.latitude <= box[1][1],
    ),
  );

  const map = code("src/components/professionals/professionals-map.tsx");
  check(
    "the map says the markers are areas, not addresses",
    /not an address/.test(map),
    "a map of pins is read as a map of addresses unless it is told otherwise",
  );
  check(
    "a browser that cannot draw it says so instead of crashing",
    /setFailed\(true\)/.test(map) && /could not load/.test(map),
  );

  const panel = code("src/components/professionals/map-panel.tsx");
  check(
    "MapLibre is only fetched when somebody asks for the map",
    /dynamic\(/.test(panel) && /ssr: false/.test(panel),
    "most visits never leave the list",
  );

  const toggle = code("src/components/professionals/view-toggle.tsx");
  check("there is a list and map toggle", /List/.test(toggle) && /Map/.test(toggle));
  check(
    "and the choice is in the URL like every other filter",
    /query\.set\("view", "map"\)/.test(toggle),
    "so a map view is a link, and back goes back to the list",
  );
  check(
    "the toggle announces which one is on",
    /aria-pressed=\{view === id\}/.test(toggle),
  );
}

// ---------------------------------------------------------------------------
// A project is somebody's work
// ---------------------------------------------------------------------------

{
  const claim = readFileSync(
    "supabase/migrations/0080_project_professional_links.sql",
    "utf8",
  ).replace(/^\s*--.*$/gm, "");

  check(
    "a project can name the business it was built under",
    /add column if not exists company_id uuid/.test(claim),
  );
  check(
    "and only somebody who belongs to that business can name it",
    // The condition as well as the message. The message survives the guard
    // being short-circuited, and supabase/tests/project-company-claim.sql is
    // what proves the behaviour — this is the cheap second line.
    /if not exists \(/.test(claim) &&
      /You can only attach a project to a company you belong to/.test(claim),
    "0004's update policy says who may edit the row and nothing about which company they may write into it",
  );
  check(
    "an invitation nobody accepted is not permission",
    /m\.status = 'active'/.test(claim),
  );
  check(
    "the guard runs as invoker, or current_user could never be an API role",
    /security invoker/.test(claim),
  );
  check(
    "deleting a business does not delete the work people did for it",
    /on delete set null/.test(claim),
  );

  const card = code("src/components/projects/project-professional.tsx");
  check(
    "the project page says who did the work",
    /Work by/.test(card),
  );
  check(
    "with their trade",
    // The guard, not the identifier: `professional.profession` still appears
    // inside the block after the condition is mutated to `false`.
    /\{professional\.profession && \(/.test(card),
    "a name under a photograph does not say the person is for hire",
  );
  check(
    "and how many projects they have on Medosha",
    // The guard again, plus the words. `projectsCompleted` and "on Medosha"
    // are split by the plural ternary, so the phrase is never contiguous.
    /\{projectsCompleted > 0 && \(/.test(card) && /on Medosha/.test(card),
  );
  check(
    "and offers both a profile and a quote",
    /<ContactButtons/.test(card),
  );
  check(
    "the number is still only shown when its owner published it",
    /professional\.show_phone \? professional\.phone : null/.test(card),
  );

  const portfolio = code("src/components/projects/profile-projects.tsx");
  check(
    "the profile calls them completed Medosha projects",
    /Completed Medosha projects/.test(portfolio),
  );
  check(
    "and counts them",
    /\{ count: "exact" \}/.test(portfolio),
    "two reads differently from forty",
  );

  const form = code("src/components/projects/project-form.tsx");
  check(
    "the project form offers only the companies somebody belongs to",
    /companies\.length > 0 &&/.test(form) && /name="companyId"/.test(form),
  );
  check(
    "and most projects name none",
    /<option value="">Just me<\/option>/.test(form),
  );
}

// ---------------------------------------------------------------------------
// The menu
// ---------------------------------------------------------------------------

{
  const nav = code("src/lib/workspace/navigation.ts");

  // Counted by destination, not by id.
  //
  // This check used to count `id: "professionals"` and assert there was one.
  // Then Professionals was promoted to a top-level section, which gave the
  // section and the row inside it the same id — two matches, one menu entry,
  // and a red check for a menu that was correct. An id is a name; what a
  // person clicks is an href, and the regression worth catching is two rows
  // going to the same page.
  const entries = [...nav.matchAll(/href: "\/professionals"/g)];
  check(
    "there is one Professionals row in the menu, not two",
    entries.length === 1,
    `found ${entries.length} rows pointing at /professionals`,
  );
  check(
    "and the old directory link it replaced is gone",
    !/href: "\/directory\/individual"/.test(nav),
  );
  check(
    "Professionals is a section of its own, not filed under something else",
    /id: "professionals",\s*\n\s*label: "Professionals",\s*\n\s*emoji:/.test(nav),
    "moved to the main menu, where the owner asked for it",
  );
  check(
    "Companies and Projects are still their own sections",
    /id: "companies"/.test(nav) && /id: "projects"/.test(nav),
  );
}

/**
 * The categories that actually exist, read from the migration that creates
 * them rather than copied here.
 *
 * A copy is a second list to keep in step, and the check it feeds passes for as
 * long as the copy is self-consistent — which it is, even after somebody
 * removes a category from 0011.
 */
const CATEGORY_SLUGS = (() => {
  const sql = readFileSync(
    "supabase/migrations/0011_services_equipment_reviews.sql",
    "utf8",
  );
  const insert = sql.slice(sql.indexOf("insert into public.service_categories"));
  return [...insert.split(";")[0].matchAll(/\('([a-z-]+)', '/g)].map((m) => m[1]);
})();

check(
  "the category list was actually read out of the migration",
  CATEGORY_SLUGS.length >= 12 && CATEGORY_SLUGS.includes("joinery"),
  `found ${CATEGORY_SLUGS.length}: ${CATEGORY_SLUGS.join(", ")}`,
);

// ---------------------------------------------------------------------------
// The trades a site hires by the day
//
// Added because Medosha had no word for any of them: a rebar bender had to
// file himself under "Welder" or leave the field blank.
// ---------------------------------------------------------------------------

{
  const values = PROFESSIONS.map((entry) => entry.value);

  check(
    "a rebar bender has a trade of his own",
    values.includes("Rebar Bender (Ferayo)"),
  );
  check(
    "and the word used on site is in the name, not only in a comment",
    findProfession("Rebar Bender (Ferayo)")?.label.includes("Ferayo") === true,
    "somebody typing 'ferayo' into the search box should find these people",
  );
  check(
    "a carpenter's helper is not the same trade as a carpenter",
    values.includes("Carpenter's Helper") &&
      findProfession("Carpenter's Helper") !== findProfession("Carpenter"),
  );
  check(
    "general labour is a trade somebody can be hired as",
    values.includes("Construction Labourer"),
  );

  const labour = [
    "Rebar Bender (Ferayo)",
    "Carpenter's Helper",
    "Mason's Helper",
    "Electrician's Helper",
    "Plumber's Helper",
    "Construction Labourer",
    "Scaffolder",
    "Roofer",
    "Excavator Operator",
  ];
  check(
    "every one of them is a trade the form offers",
    labour.every((trade) => isProfession(trade)),
    labour.filter((trade) => !isProfession(trade)).join(", "),
  );
  check(
    "and every one of them files under a category that exists",
    labour.every((trade) => {
      const found = findProfession(trade);
      return found !== null && CATEGORY_SLUGS.includes(found.category);
    }),
    "a profession whose category is not in service_categories is unfilterable",
  );
  check(
    "and every one of them offers specialties, so the field is not empty",
    labour.every((trade) => specialtiesFor(trade).length > 0),
  );
}

// ---------------------------------------------------------------------------
// What a marker on the professionals map says
// ---------------------------------------------------------------------------

{
  const point = {
    id: "a",
    username: "one",
    name: "Solomon Desta",
    latitude: 8.955,
    longitude: 38.71,
    areaName: "Lebu",
    kind: "base" as const,
    trade: "Rebar Bender (Ferayo)",
    availability: "available" as const,
  };

  check(
    "the hover card names the trade",
    pinLabel(point.trade).startsWith("Rebar Bender"),
    "the marker is an icon; the words are in the card that opens over it",
  );
  check(
    "a long trade is shortened rather than allowed to cover three streets",
    pinLabel("Mechanical Engineer").length <= MAX_PIN_CHARACTERS &&
      pinLabel("Mechanical Engineer").endsWith("\u2026"),
    pinLabel("Mechanical Engineer"),
  );
  check(
    "somebody who has not said what they do still gets a word for it",
    pinLabel(null) === "Professional",
    "a blank line in the card reads as a bug",
  );

  check(
    "a trade takes the icon of the category it is already filed under",
    tradeIconCategory("Electrician") === "electrical" &&
      tradeIconCategory("Carpenter") === "joinery",
    "an electrician with a plug on the category chip and something else on the map is a difference to learn for nothing",
  );
  check(
    "and a trade nobody recognises gets the fallback rather than a wrong icon",
    tradeIconCategory("Astronaut") === "unknown" &&
      tradeIconCategory(null) === "unknown",
  );
  check(
    "every trade in the list resolves to an icon category",
    PROFESSIONS.every((entry) => tradeIconCategory(entry.value) !== "unknown"),
    PROFESSIONS.filter((entry) => tradeIconCategory(entry.value) === "unknown")
      .map((entry) => entry.value)
      .join(", ") || "none missing",
  );
  check(
    "and every category the professions use is one the icon list has",
    CATEGORY_SLUGS.every((slug) =>
      (TRADE_ICON_CATEGORIES as readonly string[]).includes(slug),
    ),
    CATEGORY_SLUGS.filter(
      (slug) => !(TRADE_ICON_CATEGORIES as readonly string[]).includes(slug),
    ).join(", ") || "none missing",
  );

  check(
    "a workplace is labelled as one",
    placeLabel(point) === "Based in Lebu",
  );
  check(
    "and an area somebody travels to is labelled differently",
    placeLabel({ kind: "service", areaName: "Sarbet" }) === "Works in Sarbet",
    "the distinction the owner asked for: workplace or home, against where they go",
  );

  check(
    "availability is in the words the rest of the app uses",
    availabilityLabel("available") === AVAILABILITY_LABELS.available &&
      availabilityLabel("fully_booked") === AVAILABILITY_LABELS.fully_booked,
    "two vocabularies for one fact is two things to keep in step",
  );
  check(
    "somebody available this week counts as taking work",
    isTakingWork("limited") && isTakingWork("available"),
  );
  check(
    "and somebody booked solid does not",
    !isTakingWork("fully_booked") && !isTakingWork("busy"),
    "the dot on the marker is the answer to 'who can start', so it has to be true",
  );

  // Everything the sighted user gets from colour, fill and a dot has to
  // survive being read aloud, because none of it does on its own.
  const said = markerDescription(point);
  check(
    "the screen reader is told the name, the trade, the place and the availability",
    said.includes("Solomon Desta") &&
      said.includes("Rebar Bender (Ferayo)") &&
      said.includes("Based in Lebu") &&
      said.includes(AVAILABILITY_LABELS.available),
    said,
  );

  check(
    "two trades in different categories are different colours",
    tradeColour("Electrician").base !== tradeColour("Plumber").base,
  );
  check(
    "two trades in the same category are the same colour",
    tradeColour("Carpenter").base === tradeColour("Furniture Maker").base,
    "twenty-seven colours is a paint chart, not a legend",
  );
  check(
    "and a trade nobody recognises is grey rather than a wrong colour",
    tradeColour("Astronaut").base === tradeColour(null).base,
  );
  check(
    "every trade in the list has a colour of its own category",
    PROFESSIONS.every(
      (entry) => tradeColour(entry.value).base !== tradeColour(null).base,
    ),
    PROFESSIONS.filter(
      (entry) => tradeColour(entry.value).base === tradeColour(null).base,
    )
      .map((entry) => entry.value)
      .join(", ") || "none missing",
  );
}

// ---------------------------------------------------------------------------
// The map draws what the search found, and the marker is built from the point
// ---------------------------------------------------------------------------

{
  const map = code("src/components/professionals/professionals-map.tsx");
  const page = code("src/app/professionals/page.tsx");
  const data = code("src/lib/data/professionals.ts");

  check(
    "the map asks for more than one page of results",
    /limit: onMap \? MAP_LIMIT : undefined/.test(page),
    "a map with a next-page button is not a map",
  );
  check(
    "and starts at the first page when it does",
    /page: onMap \? 1 : page/.test(page),
    "page 3 of a map is twenty-four people and no explanation",
  );
  check(
    "the limit the search is given is the one it actually honours",
    /export const MAP_LIMIT = 60;/.test(data) &&
      /p_limit: limit,/.test(data) &&
      /p_offset: \(page - 1\) \* limit,/.test(data),
    "0078 clamps p_limit to 60; asking for 200 returns 60 and a caller that believes it has them all",
  );
  check(
    "and the page says so when the search found more than the map shows",
    /result\.total > result\.professionals\.length/.test(page),
  );
  check(
    "the map is told how many people it was given, not how many matched",
    /considered=\{result\.professionals\.length\}/.test(page),
    "conflating the two makes the unplaced count lie the moment a search is truncated",
  );

  check(
    "a marker is an icon, not a pill with a trade written across it",
    /data-trade-icon="\$\{tradeIconCategory\(point\.trade\)\}/.test(map) &&
      /cloneNode\(true\) as SVGElement/.test(map) &&
      !/button\.textContent =/.test(map),
    "fifty pills reading 'Construction Labourer' cover the city they describe",
  );
  check(
    "and it still carries the fill and the dot",
    /dataset\.kind = point\.kind/.test(map) &&
      /isTakingWork\(point\.availability\)/.test(map),
  );
  check(
    "the icon is about a tenth the area the pill was",
    /width:18px; height:18px/.test(map),
    "a 110x24 pill is 2640 square pixels; an 18px circle is 254",
  );
  check(
    "but the thing you tap is bigger than the thing you see",
    /\.medosha-pro \{[^}]*padding:11px; margin:-11px;/.test(map),
    "eighteen pixels is a good marker and a bad target",
  );

  check(
    "the words move to a card that opens on hover",
    /\.medosha-pro__card \{/.test(map) &&
      /tradeWord\.textContent = pinLabel\(point\.trade\)/.test(map) &&
      /where\.textContent = placeLabel\(point\)/.test(map) &&
      /free\.textContent = availabilityLabel\(point\.availability\)/.test(map),
  );
  check(
    "and the name is on it, which the pill never had room for",
    /name\.textContent = point\.name/.test(map),
  );
  check(
    "the card is hidden until it is hovered, not merely transparent",
    /opacity:0; visibility:hidden;/.test(map),
    "an invisible card that still takes pointer events eats every tap near it",
  );
  // Scoped to the rules OUTSIDE the hover media query, and that is the whole
  // point of the check. The selector appears twice: once beside `:hover`
  // inside `@media (hover: hover)`, and once on its own. A regex for the
  // selector matches the first and says nothing about the second — so it went
  // green with the standalone rule deleted, because the copy in the media
  // query satisfied it. A phone reports no hover, so a rule that lives only in
  // there is a rule a keyboard on a touch device never gets.
  const outsideHover = withoutBlock(map, "@media (hover: hover) {");
  check(
    "the hover media query was actually found and removed",
    outsideHover.length < map.length && !outsideHover.includes("@media (hover: hover)"),
    "if this fails the check below is looking at the whole file and proves nothing",
  );
  check(
    "a keyboard reaches the card as well as a pointer, on any device",
    /\.medosha-pro:focus-within \.medosha-pro__card \{/.test(outsideHover),
    "focus is the only way to reach a marker without a pointer",
  );
  check(
    "and a phone, which cannot hover, is given the panel under the map instead",
    /@media \(hover: hover\)/.test(map) && /selected && \(/.test(map),
  );
  check(
    "the icons are rendered once and cloned, not once per marker",
    /TRADE_ICON_CATEGORIES\.map\(\(category\)/.test(map) &&
      /ref=\{iconsRef\} hidden/.test(map),
    "sixty React roots for markup that never changes after it is built",
  );
  check(
    "and its accessible label is the whole marker in words",
    /setAttribute\("aria-label", markerDescription\(point\)\)/.test(map),
    "colour, fill and a dot are three things a screen reader gets none of",
  );
  check(
    "base and service are drawn differently, not only coloured differently",
    /\.medosha-pro\[data-kind="base"\]/.test(map) &&
      /\.medosha-pro\[data-kind="service"\]/.test(map) &&
      /border:1\.5px dashed/.test(map),
    "fill survives sunlight, printing and colour blindness; hue does not",
  );
  check(
    "an empty map explains itself instead of showing a blank city",
    /points\.length === 0 &&/.test(map) &&
      /has said which area they work in/.test(map),
    "fifty-six results and no pins reads as broken unless it says why",
  );
  check(
    "and the note about not showing addresses is still there",
    /Nobody&apos;s\s*\n?\s*home or exact location is shown/.test(map),
    "a map of pins is read as a map of addresses unless it is told otherwise",
  );
}

// ---------------------------------------------------------------------------
// The basemap under all of it
// ---------------------------------------------------------------------------

{
  const tiles = code("src/lib/map/tiles.ts");
  const order = [...tiles.matchAll(/id: "([a-z-]+)",/g)].map((m) => m[1]);
  const osm = order.indexOf("osm");
  const voyager = order.indexOf("carto-voyager");
  const light = order.indexOf("carto-light");

  check("OpenStreetMap is still in the list", osm >= 0);
  check("and so is Carto Voyager", voyager >= 0);
  check("and Carto Light", light >= 0);
  check(
    "the keyless provider is the one the map is built from",
    osm >= 0 && voyager >= 0 && osm < voyager && osm < light,
    `order: ${order.join(", ")}`,
  );
  check(
    "a remembered Carto choice does not survive the change",
    /WATERMARKED_WITHOUT_KEY\.has\(id\)/.test(tiles),
    "every visitor who loaded a map before this has carto-voyager in localStorage, and nothing clears it",
  );
  check(
    "and the set names both of the watermarked ones",
    /new Set\(\["carto-voyager", "carto-light"\]\)/.test(tiles),
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
