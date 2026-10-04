/**
 * A business page shows numbers somebody computed.
 *
 *   npx tsx scripts/company_check.ts
 *
 * ## What was wrong
 *
 * Three columns on `companies` were rendered as facts and nothing had ever
 * written any of them. `rating` was declared in 0006 and never set — 0011 says
 * outright that companies "read their aggregate through review_summary()
 * instead of carrying a column" — yet the page read the column and put it into
 * its schema.org `aggregateRating`, publishing a rating to search engines that
 * no set of reviews produced. `followers_count` displayed "Followers" and was
 * always 0. `projects_completed` displayed "Projects" and was always 0.
 *
 * `berchuma_workshops()` ordered its recommendations by the first two, so two
 * of its tie-breakers had never done anything.
 *
 * And `companies.verified` — set when an admin approves a claim to a listing —
 * was drawn as a bare tick, which reads as "Medosha checked this business".
 */

import "./lib/allow-server-only.ts";

import { readFileSync } from "node:fs";

import {
  VERIFICATION_LEVELS,
  companyVerificationLevelOf,
} from "../src/components/profile/verified-badge.tsx";

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
  "supabase/migrations/0072_company_profile.sql",
  "utf8",
).replace(/^\s*--.*$/gm, "");

// ---------------------------------------------------------------------------
// 1. The badge says what was actually established
// ---------------------------------------------------------------------------

check(
  "an approved claim earns a badge",
  companyVerificationLevelOf({ verified: true, is_claimed: true }) === "ownership",
);
check(
  "an unclaimed listing earns nothing",
  companyVerificationLevelOf({ verified: true, is_claimed: false }) === null,
  "`verified` without a claim is a state the claim flow never produces",
);
check(
  "and neither does a claimed but unapproved one",
  companyVerificationLevelOf({ verified: false, is_claimed: true }) === null,
);
check(
  "the badge does not claim registration was checked",
  companyVerificationLevelOf({ verified: true, is_claimed: true }) !== "business",
  "nothing in Medosha checks a registration document",
);
check(
  "and says so in as many words",
  /Business registration has not been checked/.test(
    VERIFICATION_LEVELS.ownership.detail,
  ),
);

{
  const header = code("src/components/companies/company-header.tsx");
  check(
    "the page draws the level, not a bare tick",
    /<VerifiedBadge level=\{level\} showLabel \/>/.test(header) &&
      !/<BadgeCheck className="size-5 text-brand" \/>/.test(header),
    "a tick with no noun beside it is read as more than it is",
  );
  check(
    "the level comes from the helper, not from the column directly",
    /companyVerificationLevelOf\(company\)/.test(header),
  );
}

// ---------------------------------------------------------------------------
// 2. The columns are maintained
// ---------------------------------------------------------------------------

check(
  "company reviews now update the rating",
  /elsif subject = 'company' then/.test(migration),
);
check(
  "in the existing trigger function, not a second one",
  /create or replace function public\.refresh_review_aggregates\(\)/.test(migration) &&
    !/create trigger reviews_refresh/.test(migration),
  "two functions writing one aggregate is two answers",
);
check(
  "the service and equipment branches survive the replacement",
  /if subject = 'service' then/.test(migration) &&
    /elsif subject = 'equipment' then/.test(migration),
  "adding a subject must not stop maintaining the others",
);
check(
  "no reviews leaves the rating null, not zero",
  /case when total = 0 then null else avg_rating end/.test(migration),
  "\"nobody has reviewed it\" and \"reviewed, and it averages nought\" are different",
);
check(
  "followers are counted by a trigger",
  /create trigger follows_refresh_company/.test(migration),
);
check(
  "on inserts and deletes both",
  /after insert or delete on public\.follows/.test(migration),
  "unfollowing has to count too",
);
check(
  "and only for company follows",
  /if kind <> 'company' then/.test(migration),
  "otherwise every follow of a person runs a count against companies",
);

check(
  "there is a repair for data that predates the triggers",
  /create or replace function public\.refresh_company_aggregates\(\)/.test(migration),
);
check(
  "and the migration runs it once",
  /select public\.refresh_company_aggregates\(\);/.test(migration),
  "without this every imported rating survives",
);
check(
  "the repair is plpgsql, not one statement of stacked CTEs",
  /create or replace function public\.refresh_company_aggregates\(\)\s*\nreturns void\s*\nlanguage plpgsql/.test(
    migration,
  ),
  "four CTEs updating one table: only the first takes effect, silently",
);
check(
  "it is not something a member can call",
  /grant execute on function public\.refresh_company_aggregates\(\) to service_role;/.test(
    migration,
  ) && !/refresh_company_aggregates\(\) to authenticated/.test(migration),
);

// ---------------------------------------------------------------------------
// 3. Standing
// ---------------------------------------------------------------------------

check(
  "a business's rating covers reviews of the business",
  /r\.subject_type = 'company' and r\.subject_id = p_company/.test(migration),
);
check(
  "and of the services it sells",
  // Twice: once to select the reviews and once to count the services. With a
  // bare test the review filter could be gutted and the service count would
  // still match it.
  (migration.match(/s\.company_id = p_company and s\.status = 'published'/g) ?? [])
    .length === 2,
);
check(
  "reviews backed by a booking or a hire are counted apart",
  /count\(\*\) filter \(where m\.verified\)::bigint/.test(migration),
);
check(
  "an unreviewed business gets no rating",
  /coalesce\(avg\(m\.rating\), 0\)/.test(migration),
  "not a starting score",
);
check(
  "a signed-out visitor can read it",
  /grant execute on function public\.company_reputation\(uuid\) to anon, authenticated;/.test(
    migration,
  ),
);
check(
  "and it is revoked from everyone else first",
  /revoke all on function public\.company_reputation\(uuid\) from public;/.test(
    migration,
  ),
);

// ---------------------------------------------------------------------------
// 4. The recommendation sort
// ---------------------------------------------------------------------------

check(
  "workshops are no longer ordered by a column nothing writes",
  !/c\.projects_completed desc/.test(migration),
);
check(
  "and are ordered by one that moves",
  /c\.review_count desc/.test(migration),
);

// ---------------------------------------------------------------------------
// 5. The page
// ---------------------------------------------------------------------------

{
  const page = code("src/app/companies/[slug]/page.tsx");

  check(
    "structured data carries a rating only when reviews exist",
    /aggregateRating:\s*\n?\s*rating\.total > 0/.test(page),
    "it used to publish whatever an importer put in the column",
  );
  check(
    "and never the raw column",
    !/company\.rating/.test(page),
    "the column is a cache of company reviews; the page is about the business",
  );
  check(
    "with a review count, or the structured data is invalid",
    /reviewCount: rating\.total/.test(page),
  );
  check(
    "the always-zero Projects stat is gone",
    !/projects_completed/.test(page),
    "nothing can populate it: projects have an owner_id and no company link",
  );

  const expected: [string, number][] = [
    ["CompanyHeader", 1],
    // Overview (trimmed to four) and the services tab in full.
    ["ProfileServices", 2],
    // Overview, and again above the reviews.
    ["ProfileStanding", 2],
    ["CompanyTeam", 1],
  ];
  for (const [section, times] of expected) {
    const found = (page.match(new RegExp(`<${section}[\\s/>]`, "g")) ?? []).length;
    check(
      `the page renders ${section} where it should`,
      found === times,
      `found ${found}, expected ${times}`,
    );
  }
  check(
    "views are counted for visitors and not the owner",
    /if \(!isOwner\) \{[\s\S]{0,200}increment_company_views/.test(page),
  );
  check(
    "an unclaimed listing still invites a claim",
    /Claim this business/.test(page),
  );
}

{
  const loader = code("src/lib/data/company-profile.ts");
  check(
    "the rating comes from the shared aggregate",
    /\.rpc\("company_reputation"/.test(loader),
  );
  check(
    "and reuses the person profile's shape rather than a second one",
    /from "\.\/professional-profile"/.test(loader),
    "a business's standing and a person's are the same question",
  );
  check(
    "only services that are published are shown",
    /\.eq\("status", "published"\)/.test(loader),
  );
  check(
    "and only team members who actually joined",
    /\.eq\("status", "active"\)/.test(loader),
    "an unaccepted invitation is not a colleague",
  );
  check(
    "no new table was invented",
    !/create table/i.test(migration),
  );
}

{
  const team = code("src/components/companies/company-team.tsx");
  check(
    "team members link to their own profile",
    /href=\{`\/u\/\$\{person\.username\}`\}/.test(team),
    "the reputation on a business and on its people stay connected",
  );
  check(
    "and carry their own verification level",
    /verificationLevelOf\(person\)/.test(team),
  );
  check(
    "an empty team says so rather than showing nothing",
    /Nobody has been added to this team yet/.test(team),
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
console.log(`${DIM}company: numbers somebody computed, and a badge that says what it means${RESET}`);
