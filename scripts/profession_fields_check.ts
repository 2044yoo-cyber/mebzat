/**
 * A contractor's profile and an electrician's are both finished at 100%.
 *
 *   npx tsx scripts/profession_fields_check.ts
 *
 * ## What was wrong
 *
 * One form for every trade, and one denominator for every bar. An architect
 * was asked for a crew size and a list of plant; an electrician was asked for
 * BIM capability; a carpenter was asked for a maximum project value in birr.
 * All three left the boxes empty, because the honest answer was nothing — and
 * all three were then told their profile was incomplete by a bar whose total
 * was the longest trade in the system.
 *
 * ## The rule
 *
 * A trade's bar is built from that trade's own required fields. Fifteen for a
 * contractor, nine for an architect, six for an electrician; all three reach
 * 100%. That sentence is asserted below with those three numbers, because the
 * numbers are the part somebody would quietly change.
 *
 * ## The traps this file is written around
 *
 * Both have caught checks in this repository before:
 *
 *   - **an identifier that outlives the call.** An import or a constant
 *     satisfies a regex while the call is gone, so source assertions here are
 *     on call syntax and comments are stripped first.
 *   - **a second copy elsewhere in the file.** Assertions about one function
 *     are scoped to that function's text.
 */

import "./lib/allow-server-only.ts";

import { readFileSync } from "node:fs";

import { PROFESSIONS } from "../src/lib/constants/professions.ts";
import {
  completionRatio,
  getProfileCompletion,
} from "../src/lib/profile/completion.ts";
import {
  COMMON_FIELDS,
  PROFESSION_FIELDS,
  detailFieldName,
  detailsOf,
  detailsToWrite,
  fieldsFor,
  hasProfessionFields,
  isAnswered,
  readPostedDetail,
  type ProfessionDetails,
  type ProfessionField,
} from "../src/lib/profile/profession-fields.ts";
import type { Profile } from "../src/types/database.types.ts";

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

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/(^|[\s;,{(=])\/\*[\s\S]*?\*\//g, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** Only one named function's text, so a sibling cannot answer for it. */
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

const required = (profession: string) =>
  (PROFESSION_FIELDS[profession] ?? []).filter((f) => f.required);

const ids = (fields: readonly ProfessionField[]) => fields.map((f) => f.id);

// ---------------------------------------------------------------------------
// The configuration holds together
// ---------------------------------------------------------------------------

for (const [profession, fields] of Object.entries(PROFESSION_FIELDS)) {
  check(
    `${profession}: no field is asked twice`,
    new Set(ids(fields)).size === fields.length,
    "two fields with one id means the second silently overwrites the first",
  );
  check(
    `${profession}: every choice field has choices`,
    fields.every(
      (f) => !["select", "multi"].includes(f.type) || (f.options?.length ?? 0) > 1,
    ),
    "a select with no options renders an empty box nobody can answer",
  );
  check(
    `${profession}: every field can be answered`,
    fields.every((f) => f.label.trim().length > 0 && /^[a-z][a-z0-9_]*$/.test(f.id)),
    "ids are the jsonb keys; renaming one loses everybody's answer",
  );
  check(
    `${profession}: something is required`,
    required(profession).length > 0,
    "a trade whose fields are all optional has a bar that is 100% before it starts",
  );
}

check(
  "every configured trade is a trade the form offers",
  Object.keys(PROFESSION_FIELDS).every((profession) =>
    PROFESSIONS.some((p) => p.value === profession),
  ),
  "a configuration keyed on a name nothing can be saved as is a configuration nobody sees",
);

// The brief names these. A missing one is a trade that silently falls back to
// the generic form, which is the failure this whole file is about.
for (const profession of [
  "Contractor",
  "Architect",
  "Electrical Engineer",
  "Interior Designer",
  "Structural Engineer",
  "Civil Engineer",
  "Mechanical Engineer",
  "MEP Engineer",
  "Quantity Surveyor",
  "Surveyor",
  "Carpenter",
  "Furniture Maker",
  "Welder",
  "Plumber",
  "Electrician",
  "Painter",
]) {
  check(`${profession} has questions of its own`, hasProfessionFields(profession));
}

check(
  "somebody hired by the day is asked nothing extra",
  !hasProfessionFields("Construction Labourer") &&
    !hasProfessionFields("Carpenter's Helper") &&
    !hasProfessionFields("Rebar Bender (Ferayo)"),
  "a labourer has no licence grade and no software, and asking is how a bar stops being finishable",
);

check(
  "an unknown trade falls back to nothing rather than to somebody else's form",
  fieldsFor(["Nonexistent Trade"]).length === 0 && fieldsFor([null]).length === 0,
);

// ---------------------------------------------------------------------------
// Fifteen, nine, six
// ---------------------------------------------------------------------------

check("a contractor is asked fifteen things", required("Contractor").length === 15);
check("an architect is asked nine", required("Architect").length === 9);
check("an electrician is asked six", required("Electrician").length === 6);

check(
  "an architect is not asked for a crew, plant or capacity",
  ["crew_size", "equipment", "current_capacity", "max_project_value", "licence_grade"].every(
    (id) => !ids(PROFESSION_FIELDS.Architect ?? []).includes(id),
  ),
  "these are the contractor's questions and were on everybody's form",
);

check(
  "an electrical engineer is asked neither the contractor's nor the architect's",
  ["crew_size", "equipment", "current_capacity", "subcontracting", "design_services", "design_lead_time"].every(
    (id) => !ids(PROFESSION_FIELDS["Electrical Engineer"] ?? []).includes(id),
  ),
);

check(
  "and is asked about power",
  ["electrical_systems", "max_load_handled", "engineering_services"].every((id) =>
    ids(PROFESSION_FIELDS["Electrical Engineer"] ?? []).includes(id),
  ),
);

// A tradesperson's form is short. The number is a ceiling rather than an exact
// count because the trades differ; what matters is that none of them is being
// run through a contractor's business questionnaire.
const TRADES = [
  "Carpenter",
  "Furniture Maker",
  "Welder",
  "Plumber",
  "Electrician",
  "Painter",
  "Mason",
  "Tile Installer",
  "Gypsum Worker",
  "HVAC Technician",
  "Aluminium Worker",
];

for (const trade of TRADES) {
  check(
    `${trade} is asked at most six things`,
    required(trade).length <= 6,
    `${required(trade).length} — a tradesperson's profile is meant to be short`,
  );
}

check(
  "no tradesperson is asked to run a business",
  TRADES.every((trade) =>
    ["crew_size", "max_project_value", "licence_grade", "subcontracting", "current_capacity", "active_projects", "insurance"].every(
      (id) => !ids(PROFESSION_FIELDS[trade] ?? []).includes(id),
    ),
  ),
  "these are a contractor's questions; a carpenter answering them is the bug",
);

// ---------------------------------------------------------------------------
// The bar, per trade
// ---------------------------------------------------------------------------

/** A professional with every common field filled in and no trade answers. */
const pro = (profession: string, details: ProfessionDetails = {}) =>
  ({
    account_type: "individual",
    roles: ["professional"],
    primary_role: "professional",
    full_name: "Probe Person",
    company_name: null,
    avatar_url: "https://example.test/a.png",
    profession,
    location_city: "Addis Ababa",
    base_area: "Bole",
    serves_entire_city: false,
    years_experience: 7,
    bio: "Years of it.",
    phone: "+251900000000",
    work_status: "available",
    portfolio_link: null,
    username: "probe",
    languages: ["Amharic"],
    industry: null,
    website: null,
    profession_details: details,
  }) as unknown as Profile;

/** Every required field of a trade, answered plausibly. */
function answerAll(profession: string): ProfessionDetails {
  const out: ProfessionDetails = {};
  for (const field of required(profession)) {
    if (field.type === "multi") out[field.id] = [field.options?.[0] ?? "x"];
    else if (field.type === "boolean") out[field.id] = true;
    else if (field.type === "number") out[field.id] = 4;
    else if (field.type === "select") out[field.id] = field.options?.[0] ?? "x";
    else out[field.id] = "Answered";
  }
  return out;
}

for (const profession of ["Contractor", "Architect", "Electrician"]) {
  const done = getProfileCompletion(pro(profession, answerAll(profession)));
  check(
    `a ${profession} who answers their own fields is at 100%`,
    done.percent === 100 && done.complete,
    `${done.percent}% — missing ${done.missing.join(", ")}`,
  );
  check(
    `and is told it was the ${profession}'s bar`,
    done.profession === profession,
  );
}

{
  // The sentence the brief asks for, as one assertion: three trades with three
  // different numbers of questions, all equally finished.
  const all = ["Contractor", "Architect", "Electrician"].map(
    (p) => getProfileCompletion(pro(p, answerAll(p))).percent,
  );
  check(
    "fifteen, nine and six are all worth the same 100",
    all.every((percent) => percent === 100) &&
      required("Contractor").length !== required("Electrician").length,
  );
}

{
  const bare = getProfileCompletion(pro("Contractor"));
  check(
    "a contractor who has answered none of them is not finished",
    !bare.complete && bare.percent < 100 && bare.percent > 0,
    `${bare.percent}%`,
  );
  check(
    "and is told what is missing in the contractor's words",
    bare.missing.includes("Crew size") && bare.missing.includes("Largest project you take"),
  );
}

{
  const details = answerAll("Contractor");
  delete details.references_available;
  const nearly = getProfileCompletion(pro("Contractor", details));
  check(
    "one field short is not reported as finished",
    nearly.percent === 96 && !nearly.complete,
    `${nearly.percent}% — one of fifteen, against a set the common half also weighs`,
  );
}

{
  // The two ends, called directly. No set here is heavy enough to reach them —
  // a contractor missing one field of fifteen is 96% — so a check that went
  // only through a profile would assert nothing about the clamps at all.
  check(
    "a heavy set missing one light field never rounds up to finished",
    completionRatio(999, 1000, 1) === 99,
    "somebody is otherwise told they are done with a box empty",
  );
  check(
    "and somebody who has started is never told they have not",
    completionRatio(1, 1000, 999) === 1,
  );
  check(
    "nothing filled in is nothing",
    completionRatio(0, 100, 5) === 0,
  );
  check(
    "nothing missing is a hundred, stated rather than added up",
    completionRatio(93, 100, 0) === 100,
    "a mistyped weight would otherwise show 93% beside 'nothing is missing'",
  );
}

{
  const labourer = getProfileCompletion(pro("Construction Labourer"));
  check(
    "a trade with no questions of its own still gets the generic bar",
    labourer.profession === null && labourer.audience === "person",
  );
}

{
  // An organisation is never asked for a trade, so it must never be scored
  // against one — that would be fifteen things missing and nowhere to answer.
  const firm = pro("Contractor");
  const asFirm = getProfileCompletion({
    ...firm,
    account_type: "company",
    company_name: "Probe Build PLC",
    industry: "General contracting",
    website: "https://probe.test",
  } as Profile);
  check(
    "a firm is not scored against a trade it is never asked for",
    asFirm.profession === null && asFirm.audience === "organization",
  );
}

// ---------------------------------------------------------------------------
// Changing trade loses nothing
// ---------------------------------------------------------------------------

{
  const carpentry: ProfessionDetails = {
    work_types: ["Doors and frames"],
    materials: ["Solid wood"],
    own_workshop: true,
  };

  const afterSwitch = detailsToWrite(
    carpentry,
    fieldsFor(["Contractor"]),
    (field) => (field.id === "crew_size" ? 12 : undefined),
  );

  check(
    "changing trade keeps what the old one asked",
    afterSwitch.own_workshop === true &&
      Array.isArray(afterSwitch.work_types) === Array.isArray(carpentry.work_types),
    "a carpenter who becomes a contractor must find their answers on the way back",
  );
  check(
    "and records what the new one answered",
    afterSwitch.crew_size === 12,
  );
  check(
    "a field the form did not ask is left alone, not cleared",
    Object.keys(afterSwitch).length > Object.keys(carpentry).length,
  );
}

{
  // Cleared is not the same as unasked. A field shown and left empty has to
  // overwrite, or an answer could be given and never taken back.
  const cleared = detailsToWrite(
    { certificate: "EEU-11" },
    fieldsFor(["Electrician"]),
    (field) => (field.id === "certificate" ? null : undefined),
  );
  check("a field emptied on the form is emptied in the record", cleared.certificate === null);
}

check(
  "the fields of a trade somebody no longer does are not shown",
  !ids(fieldsFor(["Carpenter"])).includes("crew_size") &&
    ids(fieldsFor(["Carpenter"])).includes("own_workshop"),
  "the answers stay in the column; what is rendered follows the current trade",
);

// ---------------------------------------------------------------------------
// Two trades at once is not blocked
// ---------------------------------------------------------------------------

{
  const union = fieldsFor(["Architect", "Interior Designer"]);
  check(
    "two trades union their questions",
    union.length > fieldsFor(["Architect"]).length,
  );
  check(
    "and a question both ask is asked once",
    union.filter((f) => f.id === "software_used").length === 1,
    "a shared key space is what makes the multi-profession day a change of one line",
  );
}

// ---------------------------------------------------------------------------
// What a post may say
// ---------------------------------------------------------------------------

function posted(pairs: [string, string][]): FormData {
  const form = new FormData();
  for (const [key, value] of pairs) form.append(key, value);
  return form;
}

{
  const field = (id: string, profession: string) =>
    (PROFESSION_FIELDS[profession] ?? []).find((f) => f.id === id)!;

  const sectors = field("sectors", "Contractor");
  check(
    "a chosen option that is not on the list is dropped",
    JSON.stringify(
      readPostedDetail(
        posted([
          [detailFieldName("sectors"), "Residential"],
          [detailFieldName("sectors"), "<script>"],
        ]),
        sectors,
      ),
    ) === JSON.stringify(["Residential"]),
    "these are rendered on a public profile with no constraint behind them",
  );

  const type = field("contractor_type", "Contractor");
  check(
    "and neither is an invented single choice",
    readPostedDetail(posted([[detailFieldName("contractor_type"), "Emperor"]]), type) === null,
  );
  check(
    "a real one is kept",
    readPostedDetail(
      posted([[detailFieldName("contractor_type"), "General contractor"]]),
      type,
    ) === "General contractor",
  );

  const crew = field("crew_size", "Contractor");
  check(
    "a number that is not a number is nothing",
    readPostedDetail(posted([[detailFieldName("crew_size"), "lots"]]), crew) === null,
  );
  check(
    "a number is a number",
    readPostedDetail(posted([[detailFieldName("crew_size"), "12"]]), crew) === 12,
  );
  check(
    "a negative crew is refused",
    readPostedDetail(posted([[detailFieldName("crew_size"), "-4"]]), crew) === null,
  );

  const refs = field("references_available", "Contractor");
  check(
    "a word that is neither yes nor no is not an answer",
    readPostedDetail(posted([[detailFieldName("references_available"), "maybe"]]), refs) === null,
    "a blank already returns early, so this is the only post that reaches the branch",
  );
  check(
    "a tick box has three answers, not two",
    readPostedDetail(posted([[detailFieldName("references_available"), "yes"]]), refs) === true &&
      readPostedDetail(posted([[detailFieldName("references_available"), "no"]]), refs) === false &&
      readPostedDetail(posted([]), refs) === null,
    "without a third state, an untouched box counts as a completed 'no' and fills the bar in",
  );
}

check(
  "a tick box holding something that is not a tick is not an answer",
  !isAnswered({ id: "x", label: "x", type: "boolean" }, "yes" as unknown as boolean),
  "the early return covers a blank; this covers a column somebody has edited by hand",
);

check(
  "no is an answer; blank is not",
  isAnswered(
    { id: "x", label: "x", type: "boolean" },
    false,
  ) &&
    !isAnswered({ id: "x", label: "x", type: "multi", options: ["a"] }, []) &&
    !isAnswered({ id: "x", label: "x", type: "text" }, "   ") &&
    !isAnswered({ id: "x", label: "x", type: "number" }, null),
  "a required tick box that only counts when ticked forces everybody to answer yes",
);

check(
  "a column holding something else reads as nothing",
  Object.keys(detailsOf({ profession_details: null } as Profile)).length === 0 &&
    Object.keys(detailsOf({ profession_details: "text" } as unknown as Profile)).length === 0,
);

// ---------------------------------------------------------------------------
// One form, walked from the configuration
// ---------------------------------------------------------------------------

{
  const renderer = code("src/components/profile/profession-fields-form.tsx");
  check(
    "the form is walked from the configuration",
    /fieldsFor\(\[profession\]\)/.test(renderer) && /fields\.map\(/.test(renderer),
    "a call, not the import: the name survives the call being deleted",
  );
  check(
    "it follows the profession as it is typed, not as it was saved",
    /profession=\{trade\}/.test(code("src/components/profile/trade-and-areas.tsx")),
    "bound to the saved value, the questions would only change after a round trip",
  );
  check(
    "and a changed trade does not reuse the old trade's boxes",
    /key=\{`\$\{profession\}:\$\{field\.id\}`\}/.test(renderer),
    "React keeps a defaultValue across a re-render when the key does not change",
  );
  // Counted, not tested for presence. The single-choice select has the same
  // line, and dropping it from the tick box alone left the check passing —
  // the second copy elsewhere in the file that AGENTS.md names.
  check(
    "both kinds of select can say nothing",
    renderer.match(/<option value="">Not said<\/option>/g)?.length === 2,
  );
  check(
    "and no field uses a number input",
    !/type="number"/.test(renderer),
    'type="number" accepts "e", "+" and "-" and reports the lot as empty',
  );
}

check(
  "there is no form per trade",
  (() => {
    try {
      readFileSync("src/components/profile/contractor-profile-form.tsx", "utf8");
      return false;
    } catch {
      return true;
    }
  })(),
  "one configuration and one renderer is the whole design",
);

{
  const action = fn(
    code("src/app/(dashboard)/profile/edit/actions.ts"),
    "export async function updateProfile",
  );
  check(
    "the save reads the trade being saved",
    /fieldsFor\(\[profession\]\)/.test(action),
    "reading the trade on the row would store nothing for somebody changing trade",
  );
  check(
    "and merges over what is stored",
    /detailsToWrite\(\s*detailsOf\(\{ profession_details: stored\?\.profession_details/.test(
      action,
    ) && /profession_details: professionDetails/.test(action),
    "merging over an empty object is replacing it, and the check passed on that",
  );
  check(
    "which it had to read first",
    /\.select\("profession_details"\)/.test(action),
  );
  check(
    "a trade with no questions writes nothing rather than an empty object",
    /shownFields\.length > 0/.test(action),
    "otherwise saving as a labourer wipes the answers of the trade they came from",
  );
}

{
  const display = code("src/components/profile/profession-details.tsx");
  check(
    "the public profile shows only what was answered",
    /\.filter\(\(field\) =>\s*isAnswered\(field, stored\[field\.id\]\),\s*\)/.test(display),
  );
  check(
    "and only the fields of the trade they do now",
    /fieldsFor\(\[profile\.profession\]\)/.test(display),
    "the answers of an old trade are kept, not published",
  );
  check(
    "nothing is rendered when nothing was answered",
    /if \(answered\.length === 0\) return null;/.test(display),
  );
}

check(
  "the owner sees the same panel a client sees",
  /<ProfessionDetails profile=\{profile\} \/>/.test(
    code("src/components/profile/profile-display.tsx"),
  ) &&
    /<ProfessionDetails profile=\{profile\} \/>/.test(
      code("src/app/u/[username]/page.tsx"),
    ),
  "one component, so there is no version that shows them something a client never gets",
);

check(
  "the marketplace card is left alone",
  !/profession-fields/.test(
    readFileSync("src/components/professionals/professional-card.tsx", "utf8"),
  ),
  "a card shows a name, a trade and a rating; the detail is what the full profile is for",
);

// ---------------------------------------------------------------------------
// The common half
// ---------------------------------------------------------------------------

check(
  "everybody is asked the same ten things",
  COMMON_FIELDS.length === 10 &&
    ["name", "avatar", "profession", "location", "service_areas", "years_experience", "bio", "contact", "availability", "portfolio"].every(
      (id) => COMMON_FIELDS.some((f) => f.id === id),
    ),
);

check(
  "an optional common field is never in the denominator",
  COMMON_FIELDS.some((f) => !f.required),
  "a bar that counts what nobody has to answer is a bar nobody can finish",
);

{
  const withoutPortfolio = getProfileCompletion(
    pro("Electrician", answerAll("Electrician")),
  );
  check(
    "and a professional with no portfolio link still reaches 100%",
    withoutPortfolio.complete && withoutPortfolio.percent === 100,
  );
}

check(
  "working anywhere in the city answers where you work",
  COMMON_FIELDS.find((f) => f.id === "service_areas")?.filled({
    serves_entire_city: true,
    base_area: null,
    location_city: null,
  } as unknown as Profile) === true,
);

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
  console.log(`${GREEN}${passed} passed${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
console.log(`${DIM}professions: fifteen, nine and six are all worth the same 100${RESET}`);
