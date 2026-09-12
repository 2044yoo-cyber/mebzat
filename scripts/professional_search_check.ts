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
// The menu
// ---------------------------------------------------------------------------

{
  const nav = code("src/lib/workspace/navigation.ts");
  const entries = [...nav.matchAll(/id: "professionals"/g)];
  check(
    "there is one Professionals entry in the menu, not two",
    entries.length === 1,
    `found ${entries.length}`,
  );
  check(
    "and it points at the search page",
    /href: "\/professionals"/.test(nav) && !/href: "\/directory\/individual"/.test(nav),
  );
  check(
    "Companies and Projects are still their own sections",
    /id: "companies"/.test(nav) && /id: "projects"/.test(nav),
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
