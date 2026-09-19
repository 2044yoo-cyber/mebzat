/**
 * Not everybody who signs up is a carpenter.
 *
 *   npx tsx scripts/roles_check.ts
 *
 * ## What was wrong
 *
 * Medosha had one kind of account. Somebody who signed up to find a carpenter
 * got the carpenter's form: a trade, years of experience, the areas they work
 * in, a completion bar that told them they were 40% of the way to being a
 * professional they had never claimed to be — and a place in the results for
 * "carpenter in Bole", where somebody rang them about a job.
 *
 * 0097 gave every account a role, 0099 taught the search to read it, and the
 * welcome screen asks the question once. This file is what keeps all three
 * saying the same thing.
 *
 * ## What is asserted, and why each one
 *
 * The rules that have no other guard:
 *
 *   * An account that existed before 0097 is never asked the question. This is
 *     the one the brief states outright and the one that cannot be noticed in
 *     testing — the developer's account was created yesterday.
 *   * Every completion set reaches 100. A bar that cannot be finished is the
 *     bug this replaced, in a different coat.
 *   * A client is asked for four things and none of them is a trade.
 *   * `client`, `agent` and `seller` are not in the professionals search — in
 *     the function and in the one list that selects from `profiles` directly.
 *   * A role is never a lock, and dropping one never deletes what it held.
 */

import "./lib/allow-server-only.ts";

import { readFileSync } from "node:fs";

import {
  COMPLETION_SETS,
  getProfileCompletion,
  requiredFields,
} from "../src/lib/profile/completion.ts";
import {
  MARKETPLACE_ROLES,
  ROLES,
  isMedoshaRole,
  primaryRoleOf,
  roleLabel,
  rolesOf,
} from "../src/lib/profile/roles.ts";
import type { MedoshaRole, Profile } from "../src/types/database.types.ts";

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

/** Source with comments removed, so a rule described is never a rule kept. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/(^|[\s;,{(=])\/\*[\s\S]*?\*\//g, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** Only the body of one named function, so a sibling cannot answer for it. */
function fn(source: string, opener: string): string {
  const start = source.indexOf(opener);
  if (start === -1) return "";
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}

const blank = (over: Partial<Profile> = {}) =>
  ({
    id: "00000000-0000-0000-0000-000000000000",
    account_type: "individual",
    full_name: null,
    company_name: null,
    avatar_url: null,
    location_city: null,
    base_area: null,
    bio: null,
    username: null,
    phone: null,
    profession: null,
    industry: null,
    website: null,
    years_experience: null,
    languages: null,
    roles: [],
    primary_role: null,
    ...over,
  }) as unknown as Profile;

// ---------------------------------------------------------------------------
// The vocabulary
// ---------------------------------------------------------------------------

check("all five ways of using Medosha are offered", ROLES.length === 5);

check(
  "and they are the five the enum names",
  ["client", "professional", "company", "agent", "seller"].every((role) =>
    ROLES.some((r) => r.value === role),
  ),
);

check(
  "an invented role is not a role",
  !isMedoshaRole("admin") && !isMedoshaRole("") && isMedoshaRole("seller"),
);

check(
  "every role has somewhere to fill its profile in",
  ROLES.every((role) => role.setupHref.startsWith("/")),
);

check(
  "an agent is not sent to the professional's form",
  ROLES.find((r) => r.value === "agent")?.setupHref === "/profile/agent" &&
    ROLES.find((r) => r.value === "seller")?.setupHref === "/profile/seller",
);

check("a role has a label to show", roleLabel("seller") !== "seller");

// An account part-way through the welcome question still has to be *something*
// to every screen that asks. `client` is the smallest claim.
check(
  "an unanswered account reads as a client",
  rolesOf(blank()).join() === "client" && primaryRoleOf(blank()) === "client",
);

check(
  "and an answered one reads as what it answered",
  rolesOf(blank({ roles: ["agent"], primary_role: "agent" })).join() === "agent",
);

check(
  "a second role is carried, not dropped",
  rolesOf(
    blank({ roles: ["professional", "seller"], primary_role: "professional" }),
  ).length === 2,
);

// ---------------------------------------------------------------------------
// Every bar can be finished
// ---------------------------------------------------------------------------

for (const [name, fields] of Object.entries(COMPLETION_SETS)) {
  check(
    `the ${name} bar reaches 100`,
    fields.reduce((total, field) => total + field.weight, 0) === 100,
    "a percentage that cannot reach the end is a percentage people stop reading",
  );
}

check(
  "a homeowner is asked for four things",
  requiredFields("individual", "client").length === 4,
);

check(
  "and none of them is a trade, a CV or a language",
  requiredFields("individual", "client").every(
    (field) => !["profession", "years_experience", "languages"].includes(field.key),
  ),
  "this is the bar somebody signed up to hire a carpenter could not finish",
);

check(
  "an agent is not asked for a trade either",
  requiredFields("individual", "agent").every((f) => f.key !== "profession"),
);

check(
  "a seller may answer with the shop's name",
  requiredFields("individual", "seller").some((f) => f.key === "name"),
);

// The two roles where the person-or-organisation split is the real question
// still get the sets that were already right.
check(
  "a professional still gets the person's set",
  requiredFields("individual", "professional") === COMPLETION_SETS.person,
);

check(
  "a company still gets the organisation's set",
  requiredFields("company", "company") === COMPLETION_SETS.organization,
);

check(
  "and a caller who knows only the account type gets the old answer",
  requiredFields("company") === COMPLETION_SETS.organization &&
    requiredFields("individual") === COMPLETION_SETS.person,
);

{
  const homeowner = blank({
    roles: ["client"],
    primary_role: "client",
    full_name: "Selam",
    location_city: "Addis Ababa",
    phone: "0911000000",
    avatar_url: "https://example.test/a.png",
  });
  const done = getProfileCompletion(homeowner);
  check(
    "a homeowner who filled in four fields is finished",
    done.percent === 100 && done.complete && done.missing.length === 0,
  );
  check("and is told so as a client", done.audience === "client");
}

{
  const sameFields = blank({
    roles: ["professional"],
    primary_role: "professional",
    full_name: "Selam",
    location_city: "Addis Ababa",
    phone: "0911000000",
    avatar_url: "https://example.test/a.png",
  });
  check(
    "the same four fields do not finish a professional",
    !getProfileCompletion(sameFields).complete,
    "a professional is asked what an employer looks at, and still is",
  );
}

// ---------------------------------------------------------------------------
// Nobody who already had an account is asked anything
// ---------------------------------------------------------------------------

{
  const sql = readFileSync("supabase/migrations/0097_account_roles.sql", "utf8");
  const backfill = sql.slice(sql.indexOf("update public.profiles"));

  check(
    "every profile that existed is marked onboarded",
    /onboarding_completed = true/.test(backfill),
    "without this, a year-old account is stopped at a question it has answered",
  );

  check(
    "and only the ones with no role are touched",
    /where cardinality\(roles\) = 0/.test(backfill),
    "re-running this over answered accounts would overwrite their answers",
  );

  // Counted, not tested for presence. The rule is written twice — once for
  // `roles` and once for `primary_role` — and a version that lost it from the
  // array still matched the copy under `primary_role`, which is the second
  // copy elsewhere in the file that AGENTS.md names.
  check(
    "somebody with a trade is a professional, not a client",
    backfill.match(
      /profession is not null and length\(trim\(profession\)\) > 0\s*\n\s*then 'professional'/g,
    )?.length === 2,
    "the roles array and the primary role have to agree, so both say it",
  );
}

{
  const page = code("src/app/(dashboard)/dashboard/page.tsx");
  check(
    "the dashboard asks the question only when it is unanswered",
    /if \(!profile\.onboarding_completed\) \{\s*redirect\("\/welcome"\)/.test(page),
  );
}

{
  const welcome = code("src/app/(dashboard)/welcome/page.tsx");
  check(
    "and the welcome screen turns away anybody who has answered",
    /if \(profile\?\.onboarding_completed\) redirect\("\/dashboard"\)/.test(welcome),
    "otherwise the question comes back every time the URL is opened",
  );
}

{
  const action = fn(
    code("src/app/(dashboard)/welcome/actions.ts"),
    "export async function chooseRole",
  );
  check(
    "answering writes the role and closes the question in one statement",
    /roles: \[role\],/.test(action) &&
      /primary_role: role,/.test(action) &&
      /onboarding_completed: true,/.test(action),
    "two statements is how an account ends up with the screen gone and no role",
  );
  check(
    "a client is not sent to the professional's form",
    /redirect\(role === "client" \? "\/dashboard" : "\/profile\/edit"\)/.test(action),
  );
}

// ---------------------------------------------------------------------------
// A first answer is not a lock
// ---------------------------------------------------------------------------

{
  const action = fn(
    code("src/app/(dashboard)/settings/role-actions.ts"),
    "export async function setRoles",
  );
  check(
    "roles can be changed later",
    /\.from\("profiles"\)\s*\.update\(\{ roles: chosen, primary_role: primary \}\)/.test(
      action,
    ),
  );
  check(
    "at least one always remains",
    /if \(chosen\.length === 0\) \{/.test(action),
    "an account with no role is one no screen knows what to ask for",
  );
  check(
    "and the one it leads with is one it has",
    /chosen\.includes\(asked\) \? asked : chosen\[0\]/.test(action),
  );
  check(
    "nothing is deleted when a role is dropped",
    !/\.delete\(\)/.test(action),
    "an agent who stops being one must find their agency where they left it",
  );
}

{
  const settings = code("src/app/(dashboard)/settings/page.tsx");
  // `\b` after the name, because `<RoleSettingsFormDisabled` satisfies a bare
  // prefix match and renders nothing of the sort.
  check(
    "settings is where that happens",
    /<RoleSettingsForm\b/.test(settings) &&
      /import \{ RoleSettingsForm \}/.test(settings),
  );
  check(
    "and it says so when a profile is finished",
    /completion\.complete \?/.test(settings) && /Profile complete/.test(settings),
  );
}

// ---------------------------------------------------------------------------
// A client is not offered for hire
// ---------------------------------------------------------------------------

check(
  "only two roles are in a search for somebody to hire",
  MARKETPLACE_ROLES.length === 2 &&
    MARKETPLACE_ROLES.includes("professional") &&
    MARKETPLACE_ROLES.includes("company"),
);

check(
  "and a client, an agent and a seller are not",
  (["client", "agent", "seller"] as MedoshaRole[]).every(
    (role) => !MARKETPLACE_ROLES.includes(role),
  ),
);

{
  const sql = readFileSync(
    "supabase/migrations/0099_professional_search_roles.sql",
    "utf8",
  );
  const candidates = sql.slice(sql.indexOf("and coalesce(p.is_demo, false) = false"));

  check(
    "the search function reads the role",
    /p\.roles && array\['professional', 'company'\]::public\.medosha_role\[\]/.test(
      candidates,
    ),
    "the query the Professionals page runs is where this actually has to hold",
  );

  check(
    "an account mid-question is not thrown out of it",
    /cardinality\(p\.roles\) = 0/.test(candidates),
  );

  check(
    "and the filter sits with the other candidate rules, before the page is cut",
    sql.indexOf("p.roles &&") < sql.indexOf("limit (select lim from bounds)"),
    "filtering after the limit returns four rows where four were asked for and two survive",
  );
}

{
  const recommended = code(
    "src/components/dashboard/recommended-professionals.tsx",
  );
  check(
    "the one list that selects profiles directly reads the same two roles",
    /\.overlaps\("roles", MARKETPLACE_ROLES\)/.test(recommended),
    "without it the four newest accounts are recommended as professionals",
  );
  check(
    "in the query rather than after it",
    recommended.indexOf('.overlaps("roles"') < recommended.indexOf(".limit(4)"),
  );
}

// ---------------------------------------------------------------------------
// The agent and the seller have their own screens
// ---------------------------------------------------------------------------

{
  const agent = fn(
    code("src/app/(dashboard)/profile/agent/actions.ts"),
    "export async function saveAgentProfile",
  );
  const seller = fn(
    code("src/app/(dashboard)/profile/seller/actions.ts"),
    "export async function saveSellerProfile",
  );

  check(
    "both create their row on first save",
    /onConflict: "profile_id"/.test(agent) && /onConflict: "profile_id"/.test(seller),
    "insert would fail on the second save and update would write nothing on the first",
  );

  check(
    "neither asks for a trade or years as a tradesperson",
    !/profession/.test(agent) && !/profession/.test(seller),
  );

  check(
    "a blank years field is a blank, not a claim of nought",
    /Number\.isInteger\(years\) \? years : null/.test(agent),
  );

  check(
    "a shop's categories survive a comma in a category name",
    /formData\s*\.getAll\("categories"\)/.test(seller) &&
      !/get\("categories"\)/.test(seller),
    "splitting on commas turns 'Doors, Windows and Frames' into two categories",
  );

  check(
    "a delivery note goes with the delivery",
    /delivery_note: delivers \? text\(formData\.get\("deliveryNote"\)\) : null/.test(
      seller,
    ),
    "a note about a service that is switched off reads as a promise",
  );

  check(
    "both replace their areas through the one function",
    /replaceServiceAreas\(\s*"agent_service_areas"/.test(agent) &&
      /replaceServiceAreas\(\s*"seller_service_areas"/.test(seller),
  );
}

{
  const shared = code("src/lib/data/role-profiles.ts");
  const replace = fn(shared, "export async function replaceServiceAreas");

  check(
    "a deselected area actually goes",
    /\.delete\(\)\.eq\("profile_id", profileId\)/.test(replace),
    "merging instead of replacing means an area can be added and never removed",
  );

  check(
    "and an invented area is never written",
    /\.from\("location_areas"\)/.test(replace) && /\.in\("slug", slugs\)/.test(replace),
    "names come from the gazetteer, so a posted slug that matches nothing writes nothing",
  );

  const posted = fn(shared, "export function postedAreaSlugs");
  check(
    "a form that posts the same area twice writes it once",
    /new Set\(/.test(posted),
  );
  check(
    "and a form that posts a thousand writes forty",
    /\.slice\(0, 40\)/.test(posted),
  );
}

// ---------------------------------------------------------------------------
// What the screens say
// ---------------------------------------------------------------------------

{
  const picker = code("src/components/profile/role-picker.tsx");
  check(
    "the question is asked in the words the brief asked for",
    /How will you use Medosha\?/.test(picker),
  );
  check(
    "and it says the answer is not final",
    /change this later/i.test(picker),
  );
}

{
  const card = code("src/components/profile/profile-completion-card.tsx");
  check(
    "the compact card is what the dashboard shows",
    /if \(compact && !complete\)/.test(card),
    "the full card lists everything missing, which is a wall beside a welcome card",
  );
  check(
    "a finished profile is told it is finished, not shown a bar",
    card.indexOf("if (complete)") > 0 && /Profile complete/.test(card),
  );
  check(
    "and the sentence follows the role",
    /DONE_BLURB\[audience\]/.test(card),
    "a homeowner is not filling this in for an employer",
  );
}

{
  const dashboard = code("src/app/(dashboard)/dashboard/page.tsx");
  check(
    "the reminder is a card, not a section of the homepage",
    /<ProfileCompletionCard profile=\{profile\} compact \/>/.test(dashboard),
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
console.log(`${DIM}roles: not everybody who signs up is a carpenter${RESET}`);
