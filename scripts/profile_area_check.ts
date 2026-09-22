/**
 * The profile area: what it asks for, and what it does with the answer.
 *
 *   npx tsx scripts/profile_area_check.ts
 *
 * ## What was reported
 *
 * Nine things, and most of them turned out to be one of three shapes:
 *
 *   - a field that cannot hold the answer ("5 yrs." typed into a number box,
 *     a language list separated by commas somebody has to keep in their head,
 *     a location dropdown with no row for where they live);
 *   - a confirmation that does not fire (the toast keyed on a boolean that was
 *     already true);
 *   - the same fact computed two ways in two files.
 *
 * The assertions below are grouped by that reading rather than by the numbers
 * in the brief, because the numbers describe symptoms and these describe the
 * defects.
 *
 * ## The two traps this file is written around
 *
 * Both have caught checks in this repository before, so both are worth naming:
 *
 *   - **an identifier that outlives the call.** An import line, a constant, or
 *     a comment satisfies a regex while the call it names is gone. So the
 *     assertions here are on call syntax and on JSX attributes, and comments
 *     are stripped first.
 *   - **a second copy elsewhere in the file.** One function loses a guard and
 *     the check passes because a sibling has the same line. `functionText`
 *     scopes an assertion to the function it is about.
 */

import "./lib/allow-server-only.ts";

import { readFileSync } from "node:fs";

import { searchLanguages, parseLanguages } from "../src/lib/constants/languages.ts";
import {
  getProfileCompletion,
  requiredFields,
} from "../src/lib/profile/completion.ts";
import {
  digitsOnly,
  formatYears,
  parseYears,
  MAX_YEARS,
} from "../src/lib/profile/experience.ts";
import type { AccountType, Profile } from "../src/types/database.types.ts";

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
 * `/\*` opens a comment only when something that cannot be part of a token
 * precedes it. Without that guard the `/\*` inside a string literal — such as
 * `accept="image/\*"` — opens a comment that runs to the next real `*\/`,
 * deleting real code that no assertion can then see.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/(^|[\s;,{(=])\/\*[\s\S]*?\*\//g, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Just the body of one function or component, so an assertion about it cannot
 * be satisfied by its neighbour.
 *
 * The end is a closing brace on its own line at the function's indent — not
 * merely a brace at the start of a line. A destructured parameter list closes
 * with `}: SomeProps {`, which is a brace in column zero inside the signature,
 * and treating that as the end cut every one of these functions off before its
 * body began. The assertions then passed on an empty string.
 */
function functionText(source: string, name: string, indent = ""): string {
  const start = source.search(
    new RegExp(`^${indent}(export )?(async )?function ${name}\\b`, "m"),
  );
  if (start === -1) return "";
  const end = source.slice(start).search(new RegExp(`\\n${indent}\\}\\s*$`, "m"));
  return end === -1 ? source.slice(start) : source.slice(start, start + end);
}

// ---------------------------------------------------------------------------
// 1. The menu closes when you go somewhere
//
// Base UI's LinkItem defaults `closeOnClick` to false, on the reasoning that
// navigation takes the menu with it. Under client-side routing it does not:
// the route changes, the menu does not unmount, and the popup sits open over
// Profile, Dashboard and Settings.
// ---------------------------------------------------------------------------

{
  const menu = code("src/components/ui/dropdown-menu.tsx");
  const linkItem = functionText(menu, "DropdownMenuLinkItem");

  check(
    "a menu link item closes the menu by default",
    /closeOnClick = true/.test(linkItem),
    "scoped to the link item: DropdownMenuItem already closes and would satisfy a file-wide match",
  );
  check(
    "and the default is actually passed to the primitive",
    /closeOnClick=\{closeOnClick\}/.test(linkItem),
    "a default that is destructured and dropped is a default that does nothing",
  );

  const nav = code("src/components/layout/user-nav.tsx");
  check(
    "the account menu's links are link items",
    /<DropdownMenuLinkItem\b/.test(nav) &&
      /MENU_LINKS\.map/.test(nav),
    "if these became plain items the fix above would stop applying to them",
  );
  for (const href of ["/profile", "/dashboard", "/settings"]) {
    check(
      `${href} is in the account menu`,
      new RegExp(`href: "${href}"`).test(nav),
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Years of experience is a number
// ---------------------------------------------------------------------------

check("an empty field is not zero years", parseYears("") === null);
check("and neither is a missing one", parseYears(null) === null && parseYears(undefined) === null);
check(
  "a number typed as a number is that number",
  parseYears("5") === 5 && parseYears(" 12 ") === 12,
);
check(
  "a number typed with the word is still that number",
  parseYears("5 years") === 5,
  "somebody answering correctly in the wrong box",
);
check("a word with no number in it is nothing", parseYears("five") === null);
check(
  "an implausible figure is clamped rather than stored",
  parseYears("999") === MAX_YEARS,
);

check("the field shows two digits at most", digitsOnly("12345") === "12");
check("letters never reach the field", digitsOnly("5a") === "5" && digitsOnly("abc") === "");
check("and a leading zero does not survive", digitsOnly("007") === "7");

check('one year reads "1 yr."', formatYears(1) === "1 yr.");
check('five years read "5 yrs."', formatYears(5) === "5 yrs.");
check("nothing renders for nothing", formatYears(null) === null);

{
  const form = code("src/components/profile/edit-profile-form.tsx");
  check(
    "the field is not a number input",
    !/id="yearsExperience"[\s\S]{0,200}?type="number"/.test(form),
    'type="number" still accepts "e", "+" and "-" and reports the lot as empty',
  );
  check(
    "it asks the phone for a number pad",
    /id="yearsExperience"[\s\S]{0,300}?inputMode="numeric"/.test(form),
  );
  check(
    "and every keystroke goes through the filter",
    /onChange=\{\(event\) => setYears\(digitsOnly\(event\.target\.value\)\)\}/.test(form),
    "a call, not the imported name: the import survives the call being removed",
  );

  const action = code("src/app/(dashboard)/profile/edit/actions.ts");
  check(
    "and what is stored went through the parser",
    /years_experience: parseYears\(yearsExperience\)/.test(action),
  );
  check(
    "the form no longer trusts the raw value",
    !/years_experience: yearsExperience/.test(action),
  );
}

// Everywhere the figure is shown, it is shown by the formatter.
for (const file of [
  "src/components/profile/profile-display.tsx",
  "src/components/profile/profile-header.tsx",
  "src/components/professionals/professional-card.tsx",
  "src/components/jobs/applicant-card.tsx",
  "src/components/jobs/apply-form.tsx",
]) {
  const source = code(file);
  check(
    `${file.split("/").pop()} formats the years rather than writing the words`,
    /formatYears\(/.test(source) &&
      !/\}\s*years\b/.test(source) &&
      !/years_experience === 1 \? "year"/.test(source),
    "one screen said '5 years' and the next said '5 yrs.'",
  );
}

// ---------------------------------------------------------------------------
// 3. Saved says so, every time
// ---------------------------------------------------------------------------

{
  const action = code("src/app/(dashboard)/profile/edit/actions.ts");
  const form = code("src/components/profile/edit-profile-form.tsx");

  check(
    "a successful save is stamped",
    /return \{ success: true, savedAt: stamp\(\) \}/.test(action),
  );
  // Named one by one rather than counted. A count of "at least three" passes
  // when the fourth is deleted, which is the whole of what it was meant to
  // stop.
  const stamped: [string, RegExp][] = [
    ["a lapsed session", /Your session expired[\s\S]{0,80}?erroredAt: stamp\(\)/],
    ["a field that did not validate", /Nothing was saved[\s\S]{0,80}?erroredAt: stamp\(\)/],
    [
      // `(?:(?!\};)[\s\S])*?` rather than a character budget: the stamp has to
      // be inside *this* return, and a budget of any size eventually reaches
      // the next return's stamp and reports the branch as covered.
      "a username somebody else has",
      /fieldErrors: \{ username: "That username is taken\." \},(?:(?!\};)[\s\S])*?erroredAt: stamp\(\)/,
    ],
    ["a database error", /return \{ error: error\.message, erroredAt: stamp\(\) \};/],
  ];
  for (const [what, pattern] of stamped) {
    check(`${what} is stamped`, pattern.test(action));
  }

  check(
    "the confirmation watches the stamp, not the boolean",
    /\}, \[state\.savedAt\]\)/.test(form),
    "`success` is already true when the second save finishes, so the effect never reruns",
  );
  check(
    "the failure is a toast as well as inline text",
    /if \(state\.error\) toast\.error\(state\.error\);/.test(form),
    "the guard and the call together: `if (false) toast.error(...)` satisfies the call on its own",
  );
  check(
    "a validation failure says nothing was saved",
    /error: "Nothing was saved/.test(action),
  );
}

// ---------------------------------------------------------------------------
// 4. Languages are chosen, not typed with commas
// ---------------------------------------------------------------------------

check(
  "Amharic and Afaan Oromo are offered first on an empty box",
  searchLanguages("", 2).map((l) => l.name).join(",") === "Amharic,Afaan Oromo",
  searchLanguages("", 2).map((l) => l.name).join(","),
);
check(
  '"am" finds Amharic before anything else',
  searchLanguages("am", 1)[0]?.name === "Amharic",
  searchLanguages("am", 3).map((l) => l.name).join(", "),
);
check(
  '"oro" finds Afaan Oromo',
  searchLanguages("oro", 1)[0]?.name === "Afaan Oromo",
);
check(
  "a language can be found by the way it writes its own name",
  searchLanguages("ትግ", 1)[0]?.name === "Tigrinya" &&
    searchLanguages("Oromoo", 1)[0]?.name === "Afaan Oromo",
);
check(
  "Ge'ez is on the list",
  searchLanguages("ge", 12).some((l) => l.name === "Ge'ez"),
);

check("a trailing comma does not store an empty language", 
  parseLanguages("Amharic, English, ").length === 2);
check(
  "the same language twice is stored once",
  parseLanguages("Amharic, amharic, AMHARIC").length === 1,
);
check("blank in, empty out", parseLanguages("").length === 0 && parseLanguages(null).length === 0);
check(
  "and the list has a ceiling",
  parseLanguages(Array.from({ length: 40 }, (_, i) => `L${i}`).join(","), 12).length === 12,
);

{
  const form = code("src/components/profile/edit-profile-form.tsx");
  check(
    "the languages field is a picker, not a text box",
    /<TokenPicker[\s\S]{0,400}?name="languages"/.test(form) &&
      !/<Input[\s\S]{0,120}?name="languages"/.test(form),
  );
  check(
    "it is fed by the shared search",
    /searchLanguages\(query\)/.test(form),
  );

  const picker = code("src/components/ui/token-picker.tsx");
  check(
    "a chip cannot contain the separator the field is joined with",
    /replace\(\/,\/g, " "\)/.test(functionText(picker, "add", "  ")),
    "otherwise one chip posts as two and comes back as two",
  );
  check(
    "and the same value cannot be added twice",
    /value\.some\(\(item\) => item\.toLowerCase\(\) === clean\.toLowerCase\(\)\)/.test(
      functionText(picker, "add", "  "),
    ),
  );
}

// ---------------------------------------------------------------------------
// 5. Location is typed, not scrolled to
// ---------------------------------------------------------------------------

{
  const form = code("src/components/profile/edit-profile-form.tsx");
  check(
    "the city field is a place picker",
    /<PlacePicker[\s\S]{0,200}?name="locationCity"/.test(form),
  );
  check(
    "and not the text input it was",
    !/<Input[\s\S]{0,140}?name="locationCity"/.test(form),
  );

  const trade = code("src/components/profile/trade-and-areas.tsx");
  check(
    "the base location is a place picker too",
    /<PlacePicker[\s\S]{0,200}?name="baseArea"/.test(trade),
  );
  check(
    "and is no longer a select of every area there is",
    !/<select[\s\S]{0,120}?id="baseArea"/.test(trade),
  );
  check(
    "the service-area list can be searched",
    /setAreaQuery\(event\.target\.value\)/.test(trade),
    "a hundred and thirty chips in a scrolling box is not a picker",
  );
  check(
    "and the search is the same ranking as everywhere else",
    /searchPlaces\(areaQuery, \{ limit: 200, kinds: \["area", "city"\] \}\)/.test(trade),
    "filtering locally here would mean 'bol' meant two different things on one screen",
  );
  check(
    "the grouped list is what you get before you type, not instead of the search",
    /matching \?/.test(trade) && /if \(!areaQuery\.trim\(\)\) return null;/.test(trade),
  );

  const picker = code("src/components/location/place-picker.tsx");
  check(
    "what is submitted is what is in the box",
    /value=\{usable \? trimmed : ""\}/.test(picker),
    "not 'the last thing picked from the list' — typing the name in full is answering the question",
  );
  check(
    "but only if it looks like a place name",
    /isPlausiblePlace\(trimmed\)/.test(picker),
  );
  check(
    "and somebody is told when their answer is not on the list",
    /Not on our list/.test(picker),
  );

  const action = code("src/app/(dashboard)/profile/edit/actions.ts");
  check(
    "the server does not take the browser's word for it",
    /isPlausiblePlace\(baseAreaRaw\)/.test(action) &&
      /isPlausiblePlace\(locationCity\)/.test(action),
    "the picker is a convenience; this is the check",
  );
}

// ---------------------------------------------------------------------------
// 6. The combobox behaves like one
// ---------------------------------------------------------------------------

{
  const combobox = code("src/components/ui/combobox.tsx");
  // Split on the role rather than counted across the file: there are three
  // pointer-down handlers in here and two thumb-sized rows, so "at least two"
  // passes with one of them deleted. Every row has to carry both.
  const optionRows = combobox
    .split('role="option"')
    .slice(1)
    .map((row) => row.slice(0, 700));

  check(
    "there is more than one kind of option row",
    optionRows.length >= 2,
    "the places the list knows, and the one it is being told about",
  );
  check(
    "every option row selects on pointer-down, not on click",
    optionRows.length >= 2 &&
      optionRows.every((row) =>
        /onPointerDown=\{\(event\) => \{\s*event\.preventDefault\(\);/.test(row),
      ),
    "blur fires before click, so a click closed the list and selected nothing",
  );
  check(
    "and every option row is big enough to hit with a thumb",
    optionRows.length >= 2 && optionRows.every((row) => /min-h-10/.test(row)),
  );
  check(
    "the highlight is clamped as it is read",
    /const active = highlight >= rows \? 0 : highlight;/.test(combobox),
    "the list changes under it on every keystroke; row 7 of a 3-row list selects nothing",
  );
  check(
    "arrows move the highlight and Enter takes it",
    /event\.key === "ArrowDown"/.test(combobox) &&
      /event\.key === "Enter" && open && rows > 0/.test(combobox),
  );
  check(
    "Escape closes the list",
    /event\.key === "Escape" && open/.test(combobox),
  );
  check(
    "it announces itself as a combobox",
    /role="combobox"/.test(combobox) &&
      /aria-expanded=\{open\}/.test(combobox) &&
      /aria-activedescendant=/.test(combobox) &&
      /role="listbox"/.test(combobox) &&
      /role="option"/.test(combobox),
  );
  check(
    "and so is the field itself",
    /min-h-11 w-full rounded-lg border border-input/.test(combobox),
  );
}


// ---------------------------------------------------------------------------
// 7. One completion rule, and it knows who it is asking
// ---------------------------------------------------------------------------

{
  const person = (extra: Partial<Profile> = {}) =>
    ({
      account_type: "individual",
      full_name: "Hana Woldemariam",
      avatar_url: "https://example.test/a.png",
      location_city: "Ayertena",
      base_area: null,
      bio: "Carpenter.",
      username: "hana",
      phone: "+251900000000",
      // A trade with no questions of its own, on purpose. These checks are
      // about the person-or-organisation split, which is what still decides
      // the set for somebody hired by the day. A carpenter here would be
      // scored against the carpenter's own required fields — which is correct,
      // and is asserted in scripts/profession_fields_check.ts instead.
      profession: "Construction Labourer",
      years_experience: 5,
      languages: ["Amharic"],
      company_name: null,
      website: null,
      industry: null,
      ...extra,
    }) as unknown as Profile;

  const firm = (extra: Partial<Profile> = {}) =>
    ({
      account_type: "company",
      company_name: "Abyssinia Build PLC",
      full_name: "Contact Person",
      avatar_url: "https://example.test/logo.png",
      location_city: "Bole",
      base_area: null,
      bio: "Fit-out contractor.",
      username: "abyssinia",
      phone: "+251900000001",
      website: "https://abyssinia.test",
      industry: "General contracting",
      years_experience: null,
      profession: null,
      languages: [],
      ...extra,
    }) as unknown as Profile;

  check(
    "a finished profile reaches a hundred per cent",
    getProfileCompletion(person()).percent === 100 &&
      getProfileCompletion(person()).complete,
    `${getProfileCompletion(person()).percent}% — missing ${getProfileCompletion(person()).missing.join(", ")}`,
  );
  check(
    "and so does a finished company",
    getProfileCompletion(firm()).percent === 100 &&
      getProfileCompletion(firm()).complete,
    `${getProfileCompletion(firm()).percent}% — missing ${getProfileCompletion(firm()).missing.join(", ")}`,
  );

  check(
    "a company is never asked for years of experience",
    getProfileCompletion(firm({ years_experience: null })).complete,
    "a firm has no years of experience as a person, and was permanently short for saying so",
  );
  check(
    "or for a trade",
    !requiredFields("company").some((field) => field.key === "profession"),
  );
  check(
    "or for languages it never gave",
    getProfileCompletion(firm({ languages: [] })).complete,
  );
  check(
    "a person is never asked for an industry",
    getProfileCompletion(person({ industry: null })).complete,
  );
  check(
    "or for a website",
    getProfileCompletion(person({ website: null })).complete,
    "a day labourer has no website and was permanently short for saying so",
  );

  check(
    "both sets can actually reach a hundred",
    ["individual", "company", "student", "contractor", "supplier"].every(
      (type) =>
        requiredFields(type as AccountType).reduce(
          (total, field) => total + field.weight,
          0,
        ) === 100,
    ),
    "a bar that cannot reach the end is a bar people stop reading",
  );

  check(
    "what is missing is named",
    getProfileCompletion(person({ avatar_url: null })).missing.includes(
      "Profile photo",
    ),
  );
  check(
    "an empty string is not an answer",
    !getProfileCompletion(person({ bio: "   " })).complete,
    "`Boolean(\"   \")` is true, and a bio of three spaces is not a bio",
  );
  check(
    "a location can come from either field",
    getProfileCompletion(person({ location_city: null, base_area: "Bole" }))
      .complete,
  );
  check(
    "and the card says which audience it scored",
    getProfileCompletion(firm()).audience === "organization" &&
      getProfileCompletion(person()).audience === "person",
  );
}

{
  const card = code("src/components/profile/profile-completion-card.tsx");
  check(
    "the card does not vanish at a hundred per cent",
    /if \(complete\) \{\s*return \(/.test(card) &&
      !/return null;/.test(card) &&
      /Profile complete/.test(card),
    // The branch *and* what it returns. Asserting the words "Profile complete"
    // appear somewhere passes with them sitting in a branch guarded by
    // `if (false)` above a `return null`, which is exactly the bug back again.
    "the one moment it had good news was the moment it disappeared",
  );
  check(
    "it reads the shared rule",
    /getProfileCompletion\(profile\)/.test(card),
  );

  const jobs = code("src/lib/data/jobs.ts");
  check(
    "and so does the applicant snapshot",
    /complete: getProfileCompletion\(data\)\.complete/.test(jobs),
  );
  check(
    "the second rule is gone",
    !/full_name && data\.bio && data\.location_city/.test(jobs),
    "a profile with those three was complete here and 45% on the Dashboard",
  );
  check(
    "and the snapshot fetches the whole row the rule reads",
    /\.from\("profiles"\)\s*\.select\("\*"\)/.test(jobs),
    "a narrowed select reports every profile as missing whatever it did not fetch",
  );

  const profilePage = code("src/app/(dashboard)/profile/page.tsx");
  const dashboard = code("src/app/(dashboard)/dashboard/page.tsx");
  // The dashboard's is the compact variant — title, bar, Continue — because
  // the full card lists everything missing and that is a wall of text beside
  // a welcome card. Both still read the one rule, which is the point.
  check(
    "the same card is on the Profile and on the Dashboard",
    /<ProfileCompletionCard profile=\{profile\} \/>/.test(profilePage) &&
      /<ProfileCompletionCard profile=\{profile\} compact \/>/.test(dashboard),
    "they used to disagree; showing it in both places is how that stays visible",
  );
}

// ---------------------------------------------------------------------------
// 8. Different questions for someone looking for work and someone hiring
// ---------------------------------------------------------------------------

{
  const form = code("src/components/profile/edit-profile-form.tsx");

  check(
    "an employer is not asked for a CV",
    // The guard and the element it guards, adjacent. A window of a few
    // thousand characters reaches the *other* `!isOrganization` block further
    // up the file, so removing this one still matched.
    /\{!isOrganization && \(\s*<fieldset[\s\S]{0,1200}?<DocumentUpload/.test(form),
    "the complaint, in one line: the account type already knew",
  );
  check(
    "a person is not asked for an industry",
    /\{isOrganization \? \([\s\S]{0,400}?name="industry"/.test(form),
  );
  check(
    "and the two are alternatives, not both",
    /name="industry"[\s\S]{0,900}?\) : \([\s\S]{0,200}?htmlFor="yearsExperience"/.test(
      form,
    ),
    "years of experience is the person's version of the same question",
  );
  check(
    "a company size is asked only of a company",
    /\{isOrganization && \([\s\S]{0,400}?name="companySize"/.test(form),
  );
  check(
    "a firm is not asked for a trade or a travel radius",
    /\{!isOrganization && \(\s*<TradeAndAreas/.test(form),
    "a firm does not have a trade; its people do, and they have their own profiles",
  );
  check(
    "a job seeker is offered a portfolio link and a LinkedIn",
    /name="portfolioLink"/.test(form) && /name="linkedinUrl"/.test(form),
  );
  check(
    "both documents can be uploaded",
    /kind="cv"/.test(form) && /kind="portfolio"/.test(form),
  );

  const action = code("src/app/(dashboard)/profile/edit/actions.ts");
  check(
    "a field the form never rendered is left alone rather than cleared",
    /asked\("industry"\) \? \{ industry \}/.test(action) &&
      /const asked = \(field: string\) => formData\.has\(field\);/.test(action),
    "switching account type, saving, and switching back must not empty the other side",
  );
  check(
    "a missing field does not fail the whole save",
    /formData\.get\("portfolioLink"\) \?\? undefined/.test(action),
    "`z.string().optional()` rejects null, and FormData.get returns null for a field nobody was shown",
  );
  check(
    "the industry is checked against the list rather than trusted",
    /isIndustry\(industryRaw\) \? industryRaw : null/.test(action) &&
      /isCompanySize\(companySizeRaw\) \? companySizeRaw : null/.test(action),
  );

  const upload = code("src/components/profile/document-upload.tsx");
  check(
    "a document is stored under the profile it belongs to",
    /const path = `\$\{userId\}\/\$\{kind\}-\$\{crypto\.randomUUID\(\)\}-\$\{safe\}`/.test(
      upload,
    ),
    "the storage policy reads the first folder segment as the owner",
  );
  check(
    "and is saved as soon as it is chosen",
    /await saveProfileDocument\(kind, path, file\.name\)/.test(upload),
    "holding a file in state until Save loses it if Save is never pressed",
  );

  const documents = code("src/app/(dashboard)/profile/edit/document-actions.ts");
  check(
    "the server refuses a path into somebody else's folder",
    /if \(!path\.startsWith\(`\$\{user\.id\}\/`\) \|\| path\.includes\("\.\."\)\)/.test(
      documents,
    ),
    "the column's reader does not re-check it",
  );
  check(
    "removing a document removes the file too",
    /storage\s*\.from\(PROFILE_DOCUMENTS_BUCKET\)\s*\.remove\(\[existing\]\)/.test(
      documents,
    ),
    "clearing the column alone leaves it readable by every employer holding an application",
  );
  check(
    "a link to a document lasts a sitting, not a year",
    /createSignedUrl\(path, 60 \* 60\)/.test(documents),
    "a link with a year on it is a CV on the open internet the moment it is forwarded",
  );
}

// ---------------------------------------------------------------------------
// 9. The CV is uploaded once and offered on every application
// ---------------------------------------------------------------------------

{
  const apply = code("src/components/jobs/apply-form.tsx");
  check(
    "the saved CV is offered on an application",
    /Use my saved CV/.test(apply) && /Use my saved portfolio/.test(apply),
  );
  check(
    "a first application offers it by default",
    /existing \? existing\.use_saved_cv : Boolean\(profile\?\.savedCv\)/.test(apply),
    "somebody who uploaded a CV to Medosha has already answered that question",
  );
  check(
    "but an application being edited keeps the answer it was given",
    /existing \? existing\.use_saved_portfolio : Boolean\(profile\?\.savedPortfolio\)/.test(
      apply,
    ),
    "unticking it has to stay unticked",
  );
  check(
    "nothing is offered that is not there",
    /useSavedCv: Boolean\(profile\?\.savedCv\) && useSavedCv/.test(apply),
  );

  const actions = code("src/app/jobs/actions.ts");
  check(
    "the flags reach the database",
    /"job_application_set_saved_documents"/.test(actions) &&
      /p_cv: Boolean\(input\.useSavedCv\)/.test(actions),
  );
  check(
    "and a failure to record them is reported",
    /if \(flagsError\) return \{ error: rpcMessage\(flagsError\) \};/.test(actions),
    "an applicant told 'sent' who believes their CV went with it is worse off than one told to try again",
  );

  const jobsData = code("src/lib/data/jobs.ts");
  check(
    "the employer's page can sign the offered documents",
    /export async function signProfileDocuments/.test(jobsData) &&
      /createSignedUrls\(wanted, 60 \* 60\)/.test(jobsData),
  );

  const applications = code("src/app/jobs/[id]/applications/page.tsx");
  check(
    "and only asks for the ones that were offered",
    /application\.use_saved_cv \? application\.applicant\?\.cv_path : null/.test(
      applications,
    ),
  );

  const card = code("src/components/jobs/applicant-card.tsx");
  check(
    "the employer sees the offered CV under its own name",
    /application\.use_saved_cv &&[\s\S]{0,80}?applicant\?\.cv_path/.test(card),
  );
  check(
    "and a document nobody offered is not shown",
    !/signedDocuments\[applicant\.cv_path\]\s*\?\?/.test(card),
  );
}

// ---------------------------------------------------------------------------
// 10. The reading font
// ---------------------------------------------------------------------------

{
  const css = readFileSync("src/app/globals.css", "utf8");
  check(
    "--font-sans has a value of its own",
    /--font-sans: var\(--font-stack-default\);/.test(css),
    "it used to be `--font-sans: var(--font-sans)`, which computes to nothing",
  );
  check(
    "the Ethiopic face is loaded rather than hoped for",
    /--font-ethiopic-stack: var\(--font-noto-ethiopic\)/.test(css),
  );

  const layout = code("src/app/layout.tsx");
  check(
    "and the layout actually loads it",
    /Noto_Sans_Ethiopic\(\{/.test(layout) &&
      /variable: "--font-noto-ethiopic"/.test(layout) &&
      /subsets: \["ethiopic"\]/.test(layout),
  );
  check(
    "the variable reaches the document",
    /\$\{notoEthiopic\.variable\}/.test(layout),
    "a font declared and not put on an element is a font that is never used",
  );
  check(
    "the choice is rendered on the server",
    /data-font=\{profile\?\.font \?\? undefined\}/.test(layout),
    "an effect would repaint the page in a second face after the first",
  );
  check(
    "and the script that covers a signed-out reader runs before the page",
    /<FontPreference serverChoice=\{profile\?\.font \?\? null\} \/>/.test(layout) &&
      layout.indexOf("<FontPreference") < layout.indexOf("<LanguageProvider"),
  );

  const preference = code("src/components/layout/font-preference.tsx");
  check(
    "the account beats what one browser remembers",
    /if \(server\) \{[\s\S]{0,200}?setAttribute\("data-font", server\)/.test(
      preference,
    ),
    "a stale value in one browser must not override what the profile says",
  );
  check(
    "and storage that throws does not take the page down",
    /catch \(error\) \{\}/.test(preference),
    "reading localStorage throws outright in a Safari private window",
  );

  const settings = code("src/components/settings/font-settings-form.tsx");
  check(
    "choosing a font applies it before anything is saved",
    /document\.documentElement\.setAttribute\("data-font", next\)/.test(settings),
  );
  check(
    "choosing the default removes the override",
    /document\.documentElement\.removeAttribute\("data-font"\)/.test(settings),
  );
  check(
    "each option is shown in its own face",
    /data-font=\{option\.value\}/.test(settings) &&
      /fontFamily: "var\(--font-sans\)"/.test(settings),
    "a custom property set on an element changes nothing unless something re-declares font-family",
  );

  const page = code("src/app/(dashboard)/settings/page.tsx");
  check(
    "and the setting is on the Settings screen",
    /<FontSettingsForm initial=\{toFontChoice\(profile\?\.font_preference\)\} \/>/.test(
      page,
    ),
  );
}

// ---------------------------------------------------------------------------
// The profile form remembers what you typed
//
// A refresh, a dropped connection, or a phone that closes the tab used to
// lose whatever had not been submitted yet. `@/lib/projects/draft` already
// does this for the project form; this reuses the same functions under a
// different storage key rather than a second copy of the same logic.
// ---------------------------------------------------------------------------

{
  const form = code("src/components/profile/edit-profile-form.tsx");

  check(
    "the form reuses the project draft functions rather than reimplementing them",
    /from "@\/lib\/projects\/draft"/.test(form) &&
      /applyDraftToForm/.test(form) &&
      /writeDraft/.test(form) &&
      /readDraft/.test(form),
  );
  check(
    "it has its own storage key, not the project's",
    /medosha:profile-draft:/.test(form) && !/medosha:project-draft:/.test(form),
    "sharing a key with the project draft would let one form's autosave overwrite the other's",
  );
  check(
    "every field change is what starts the debounce, not only a blur",
    /onInput=\{queueSave\}/.test(form) && /onChange=\{queueSave\}/.test(form),
  );

  const save = form.slice(
    form.indexOf("const save = useCallback"),
    form.indexOf("const queueSave = useCallback"),
  );
  check(
    "a save carries no images",
    /images: \[\]/.test(save) && /primary: null/.test(save),
    "the avatar and cover already upload on selection; nothing here is lost before Save is pressed",
  );

  const continueDraft = functionText(form, "continueDraft", "  ");
  check(
    "continuing a draft restores it before anything else runs",
    /applyDraftToForm\(form, offer\.values\)/.test(continueDraft),
  );
  check(
    "account type, years and languages are restored through state",
    /setAccountType\(/.test(continueDraft) &&
      /setYears\(/.test(continueDraft) &&
      /setLanguages\(/.test(continueDraft),
    "these are React state as well as form fields; touching only the DOM leaves the visible control unchanged",
  );
  check(
    "and only a value the account type list actually has is restored",
    /ACCOUNT_TYPES\.some\(\(t\) => t\.value === draftAccountType\)/.test(
      continueDraft,
    ),
    "a corrupted draft must not put a string into state that nothing on the account-type list produced",
  );
  check(
    "the trade's own fields are restored by remounting it",
    /setTradeSeed\(/.test(continueDraft) && /setRestoreNonce/.test(continueDraft),
    "TradeAndAreas only reads its props at mount, so nothing short of a new one takes a restored profession",
  );

  const discardDraft = functionText(form, "discardDraft", "  ");
  check(
    "discarding actually clears the stored draft",
    /clearDraft\(window\.localStorage, draftKey\)/.test(discardDraft),
  );

  check(
    "a successful save clears the draft on its own",
    /useEffect\(\(\) => \{\s*if \(state\.savedAt\) \{\s*clearDraft/.test(form),
    "without this, refreshing after a successful save could still offer to continue a draft written before it — stored data overwritten by something older",
  );

  check(
    "the trade seed is passed to TradeAndAreas, keyed so it actually remounts",
    /key=\{restoreNonce\}/.test(form) &&
      /profession=\{tradeSeed\?\.profession \?\? profile\.profession\}/.test(form),
  );

  check(
    "the offer is not shown once it has been answered",
    /const hasOffer = !answered && isDraftWorthKeeping\(found\)/.test(form),
    "answered has to gate it, or discarding a draft would show the same offer again on the next render",
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
console.log(`${DIM}profile: the field can hold the answer, and saving says so${RESET}`);
