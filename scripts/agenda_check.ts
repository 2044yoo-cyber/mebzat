/**
 * Agenda: the module in the navigation, and the arithmetic its screens share.
 *
 *   npx tsx scripts/agenda_check.ts
 *
 * The database half — every policy, every trigger, the permission gates — is
 * checked against real PostgreSQL in `supabase/tests/agenda-construction.sql`,
 * because that is where it lives and a regex cannot evaluate a policy. This
 * file covers the application side and stops where SQL starts.
 *
 * Both traps AGENTS.md names apply: assertions are on call syntax rather than
 * on identifiers that outlive the call, and anything a sibling elsewhere in
 * the file could satisfy is scoped.
 */

import "./lib/allow-server-only.ts";

import { readFileSync } from "node:fs";

import {
  AGENDA_PROJECT_FILTERS,
  AGENDA_PROJECT_STATUSES,
  AGENDA_PROJECT_TYPES,
  daysRemaining,
  elapsedPercent,
  formatMoney,
  isAgendaProjectStatus,
  isAgendaProjectType,
  isLiveProject,
} from "../src/lib/agenda/projects.ts";
import {
  LIVE_SECTIONS,
  WORKSPACE_GROUPS,
  WORKSPACE_SECTIONS,
  activeSection,
  sectionHref,
} from "../src/lib/agenda/workspace-nav.ts";
import { translations, LANGUAGES } from "../src/lib/i18n/translations.ts";

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

function exists(path: string): boolean {
  try {
    readFileSync(path, "utf8");
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 1. Agenda is in the navigation
// ---------------------------------------------------------------------------

{
  const nav = code("src/lib/workspace/navigation.ts");

  check(
    "Agenda is its own section, not a row under something else",
    /\{\s*id: "agenda",\s*label: "Agenda",/.test(nav),
  );
  check(
    "it reaches /agenda",
    /href: "\/agenda",/.test(nav),
  );
  for (const [what, href] of [
    ["the project list", "/agenda/projects"],
    ["my tasks", "/agenda/tasks"],
    ["the calendar", "/agenda/calendar"],
  ] as [string, string][]) {
    check(`and ${what}`, new RegExp(`href: "${href}",`).test(nav));
  }
  check(
    "it is signed-in only",
    /id: "agenda-home",[\s\S]{0,200}?private: true/.test(nav),
    "a construction record is not a public page",
  );
  check(
    "it does not point at the portfolio module",
    !/id: "agenda-projects",[\s\S]{0,160}?href: "\/projects"/.test(nav),
    "/projects is the showcase; two rows pointing at it read as duplicates",
  );
}

// ---------------------------------------------------------------------------
// 2. Every route the navigation promises exists
// ---------------------------------------------------------------------------

{
  for (const route of [
    "src/app/(dashboard)/agenda/page.tsx",
    "src/app/(dashboard)/agenda/projects/page.tsx",
    "src/app/(dashboard)/agenda/projects/new/page.tsx",
    "src/app/(dashboard)/agenda/tasks/page.tsx",
    "src/app/(dashboard)/agenda/calendar/page.tsx",
    "src/app/(dashboard)/agenda/projects/[projectId]/layout.tsx",
    "src/app/(dashboard)/agenda/projects/[projectId]/page.tsx",
  ]) {
    check(`${route.replace("src/app/(dashboard)", "")} exists`, exists(route));
  }

  // Every section the workspace menu links to has to resolve. A dead link is
  // the one failure this navigation can produce on its own.
  for (const section of LIVE_SECTIONS) {
    const route = section.segment
      ? `src/app/(dashboard)/agenda/projects/[projectId]/${section.segment}/page.tsx`
      : "src/app/(dashboard)/agenda/projects/[projectId]/page.tsx";
    check(`the ${section.label} section has a route`, exists(route));
  }
}

// ---------------------------------------------------------------------------
// 3. The workspace navigation
// ---------------------------------------------------------------------------

{
  check(
    "the workspace is grouped rather than one flat list of thirty",
    WORKSPACE_GROUPS.length >= 5 && WORKSPACE_SECTIONS.length >= 28,
    `${WORKSPACE_GROUPS.length} groups, ${WORKSPACE_SECTIONS.length} sections`,
  );
  check(
    "every section id is unique",
    new Set(WORKSPACE_SECTIONS.map((s) => s.id)).size ===
      WORKSPACE_SECTIONS.length,
  );
  check(
    "every segment is unique",
    new Set(WORKSPACE_SECTIONS.map((s) => s.segment)).size ===
      WORKSPACE_SECTIONS.length,
  );
  check(
    "Overview is the project root rather than a segment",
    WORKSPACE_SECTIONS.find((s) => s.id === "overview")?.segment === "",
  );
  check(
    "the root href has no trailing segment",
    sectionHref("abc", "") === "/agenda/projects/abc",
  );
  check(
    "and a section href does",
    sectionHref("abc", "drawings") === "/agenda/projects/abc/drawings",
  );

  check(
    "the project root highlights Overview",
    activeSection("abc", "/agenda/projects/abc") === "overview",
  );
  check(
    "a section highlights itself",
    activeSection("abc", "/agenda/projects/abc/drawings") === "drawings",
  );
  check(
    "a deeper path still highlights its section",
    activeSection("abc", "/agenda/projects/abc/drawings/A-101") === "drawings",
    "opening one drawing must not un-highlight Drawings",
  );
  check(
    "an unknown path falls back rather than highlighting nothing",
    activeSection("abc", "/agenda/projects/abc/nonsense") === "overview",
  );

  const navSource = code("src/components/agenda/shell/workspace-nav.tsx");
  check(
    "a section that is not built yet is not a link",
    /if \(section\.phase !== 1\) \{[\s\S]{0,400}?<span/.test(navSource),
    "a link to an empty page costs somebody a tap to find out",
  );
  check(
    "the built ones are",
    /<Link\s+key=\{section\.id\}\s+href=\{sectionHref\(projectId, section\.segment\)\}/.test(
      navSource,
    ),
  );
  check(
    "it is a strip on a phone and a column from lg up",
    /flex gap-1 overflow-x-auto border-b p-2/.test(navSource) &&
      /lg:h-full lg:flex-col/.test(navSource),
  );
}

// ---------------------------------------------------------------------------
// 4. "Active" means one thing
// ---------------------------------------------------------------------------

{
  check(
    "a job in planning, tender or construction is live",
    isLiveProject("planning") &&
      isLiveProject("tender") &&
      isLiveProject("construction"),
  );
  check(
    "and one on hold, finished or cancelled is not",
    !isLiveProject("on_hold") &&
      !isLiveProject("completed") &&
      !isLiveProject("cancelled"),
  );

  // The dashboard counts and the list filters, and they have to agree. Both
  // read the same three statuses — the count from the data layer, the filter
  // from `isLiveProject` — so this asserts the data layer names exactly those.
  const data = code("src/lib/data/agenda-projects.ts");
  check(
    "the Active Projects figure counts exactly those three",
    /countWhere\("agenda_projects", \["planning", "tender", "construction"\]\)/.test(
      data,
    ),
    "a fourth status counted here and not in the filter is a card that disagrees with its own list",
  );

  check(
    "the filter offers every status plus all and active",
    AGENDA_PROJECT_FILTERS.length === AGENDA_PROJECT_STATUSES.length + 2,
  );
  check(
    "the brief's project types are all there",
    AGENDA_PROJECT_TYPES.length === 11 &&
      isAgendaProjectType("mixed_use") &&
      isAgendaProjectType("infrastructure"),
  );
  check(
    "and an invented type or status is refused",
    !isAgendaProjectType("skyscraper") && !isAgendaProjectStatus("nearly"),
  );
  check(
    "no status names a colour",
    AGENDA_PROJECT_STATUSES.every(
      (status) => !/amber|red|green|blue|yellow/.test(status.tone),
    ),
    "a tone is a meaning; the chip maps it onto Medosha's palette",
  );
}

// ---------------------------------------------------------------------------
// 5. The dates and the money
// ---------------------------------------------------------------------------

{
  const now = new Date("2026-09-18T10:00:00Z");

  check("a week away is seven days", daysRemaining("2026-09-25", now) === 7);
  check(
    "three days past is negative, not zero",
    daysRemaining("2026-09-15", now) === -3,
    "a job that is late has to be able to say so",
  );
  check(
    "no target date is null rather than zero",
    daysRemaining(null, now) === null && daysRemaining(undefined, now) === null,
    "'no date set' and 'due today' are different facts",
  );
  check("junk is null", daysRemaining("not-a-date", now) === null);
  check(
    "today is zero",
    daysRemaining("2026-09-18", now) === 0,
  );

  check(
    "elapsed time is a share of the programme",
    elapsedPercent("2026-01-01", "2026-12-31", now) === 72,
    String(elapsedPercent("2026-01-01", "2026-12-31", now)),
  );
  check(
    "it needs both dates",
    elapsedPercent(null, "2026-12-31", now) === null &&
      elapsedPercent("2026-01-01", null, now) === null,
  );
  check(
    "a finish before a start is null rather than negative",
    elapsedPercent("2026-12-31", "2026-01-01", now) === null,
  );
  check(
    "it is clamped at both ends",
    elapsedPercent("2020-01-01", "2020-12-31", now) === 100 &&
      elapsedPercent("2030-01-01", "2030-12-31", now) === 0,
    "a job whose dates have passed is 100% elapsed, not 340%",
  );

  // The amount *and* the currency. Asserting the digits alone passes with the
  // format switched to plain decimal, which is a figure labelled with nothing.
  check(
    "money carries its currency",
    /[$]|USD/.test(formatMoney(1500, "USD") ?? "") &&
      /ETB|Br/.test(formatMoney(42000000, "ETB") ?? "") &&
      (formatMoney(1500, "USD") ?? "").includes("1,500"),
    `${formatMoney(1500, "USD")} / ${formatMoney(42000000, "ETB")}`,
  );
  check(
    "no amount renders nothing rather than zero",
    formatMoney(null) === null && formatMoney(undefined) === null,
  );
  // "Z" rather than "ZZZ": a three-letter code is structurally valid and ICU
  // renders it happily, so it never reaches the catch. A one-letter code is
  // what actually makes the constructor throw.
  check(
    "a currency code that cannot be formatted still shows the number",
    (formatMoney(100, "Z") ?? "").includes("100"),
    `${formatMoney(100, "Z")} — the constructor throws, and the figure is still worth showing`,
  );
}

// ---------------------------------------------------------------------------
// 6. Access is decided in the database
// ---------------------------------------------------------------------------

{
  const data = code("src/lib/data/agenda-projects.ts");

  check(
    "the reads do not filter by membership themselves",
    !/agenda_members/.test(data),
    "the policies already do it, and the copy is what drifts",
  );
  check(
    "a project the viewer is not on comes back as null",
    /return data \? toSummary\(data as unknown as SummaryRow\) : null;/.test(data),
  );

  const layout = code("src/app/(dashboard)/agenda/projects/[projectId]/layout.tsx");
  check(
    "and renders as not-found rather than as a refusal",
    /if \(!project\) notFound\(\);/.test(layout),
    "telling somebody a project exists but is not theirs is a leak dressed as a helpful message",
  );
  check(
    "the workspace is behind the sign-in gate",
    /await requireViewer\(`\/agenda\/projects\/\$\{projectId\}`\)/.test(layout),
  );

  // Every page asks again rather than trusting the layout.
  for (const segment of ["tasks", "drawings", "documents", "activity", "directory", "settings"]) {
    const page = code(
      `src/app/(dashboard)/agenda/projects/[projectId]/${segment}/page.tsx`,
    );
    check(
      `the ${segment} page checks access itself`,
      /const project = await getAgendaProject\(projectId\);\s*if \(!project\) notFound\(\);/.test(
        page,
      ),
      "a layout cannot hand data to a page, and a page that assumed it had is reachable without the check",
    );
  }

  const action = code("src/app/(dashboard)/agenda/projects/actions.ts");
  check(
    "creating a project sets the owner from the session, not from the form",
    /owner_id: user\.id,/.test(action) && !/owner_id: text\(/.test(action),
  );
  check(
    "the type and status are checked against the lists",
    /isAgendaProjectType\(type\) \? type : "residential"/.test(action) &&
      /isAgendaProjectStatus\(status\) \? status : "planning"/.test(action),
  );
  check(
    "the location goes through the same gazetteer as the rest of Medosha",
    /isPlausiblePlace\(location\)/.test(action),
  );
  check(
    "an empty date is null rather than Invalid Date",
    /\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(raw\) \? raw : null/.test(action),
    "an empty date input posts \"\", and new Date(\"\") is what PostgreSQL complains about",
  );
  check(
    "the owner is not made a member here",
    !/agenda_members/.test(action),
    "0089's trigger does it, so a project created any other way is not orphaned",
  );
}

// ---------------------------------------------------------------------------
// 7. It looks like Medosha
// ---------------------------------------------------------------------------

{
  const chip = code("src/components/agenda/shell/status-chip.tsx");
  check(
    "the status chip uses the theme's tokens",
    /bg-brand text-brand-foreground/.test(chip) &&
      /text-destructive/.test(chip) &&
      /bg-muted text-muted-foreground/.test(chip),
    "so Agenda follows the theme and dark mode without knowing they exist",
  );
  check(
    "there is one chip rather than a badge per module",
    exists("src/components/agenda/shell/status-chip.tsx"),
  );

  const card = code("src/components/agenda/shell/project-card.tsx");
  check(
    "the project list is cards, not a desktop table",
    !/<table/.test(card) && /rounded-xl border bg-card/.test(card),
    "this list is read on site more often than at a desk",
  );
  check(
    "the progress bar is announced",
    /role="progressbar"/.test(card) && /aria-valuenow=\{project\.progressPercent\}/.test(card),
  );

  const filter = code("src/components/agenda/shell/project-filter.tsx");
  check(
    "a filtered list has a URL somebody can send",
    /<Link/.test(filter) && /\/agenda\/projects\?status=\$\{filter\.value\}/.test(filter),
  );

  const overview = code("src/app/(dashboard)/agenda/projects/[projectId]/page.tsx");
  check(
    "the overview shows time elapsed beside work done",
    /Programme elapsed/.test(overview) && /Reported progress/.test(overview),
    "a job 80% through its time and 40% built is the one thing this screen must be able to say",
  );
  check(
    "and says plainly when the two disagree",
    /const behind =\s*elapsed !== null && elapsed - project\.progressPercent >= 10;/.test(
      overview,
    ),
  );
}

// ---------------------------------------------------------------------------
// 8. Three languages
// ---------------------------------------------------------------------------

{
  const keys = [
    "agenda",
    "agenda-home",
    "agenda-projects",
    "agenda-tasks",
    "agenda-calendar",
  ];
  const english = translations.en as Record<string, Record<string, string>>;

  for (const key of keys) {
    for (const language of LANGUAGES) {
      const dictionary = translations[language] as Record<
        string,
        Record<string, string>
      >;
      const value = dictionary.navigation?.[key];
      check(
        `navigation.${key} exists in ${language}`,
        typeof value === "string" && value.trim().length > 0,
      );
    }
    for (const language of LANGUAGES.filter((l) => l !== "en")) {
      const dictionary = translations[language] as Record<
        string,
        Record<string, string>
      >;
      check(
        `navigation.${key} is translated into ${language}`,
        dictionary.navigation?.[key] !== english.navigation?.[key],
        `${language}: ${dictionary.navigation?.[key]}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 9. Nothing user-facing names the system this was inspired by
// ---------------------------------------------------------------------------

{
  for (const file of [
    "src/lib/agenda/projects.ts",
    "src/lib/agenda/workspace-nav.ts",
    "src/lib/workspace/navigation.ts",
    "src/components/agenda/shell/project-card.tsx",
    "src/components/agenda/shell/workspace-nav.tsx",
    "src/app/(dashboard)/agenda/page.tsx",
  ]) {
    check(
      `${file.split("/").pop()} does not mention it`,
      !/procore/i.test(readFileSync(file, "utf8")),
    );
  }
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
  console.log(`${GREEN}${passed} passed${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
console.log(`${DIM}agenda: a construction record, in Medosha's navigation${RESET}`);
