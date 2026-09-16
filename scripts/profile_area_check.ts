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
  digitsOnly,
  formatYears,
  parseYears,
  MAX_YEARS,
} from "../src/lib/profile/experience.ts";

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

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
  console.log(`${GREEN}${passed} passed${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
console.log(`${DIM}profile: the field can hold the answer, and saving says so${RESET}`);
