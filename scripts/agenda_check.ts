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
  BUILT_THROUGH_PHASE,
  LIVE_SECTIONS,
  WORKSPACE_GROUPS,
  WORKSPACE_SECTIONS,
  activeSection,
  sectionHref,
} from "../src/lib/agenda/workspace-nav.ts";
import {
  AGENDA_FILES_BUCKET,
  agendaFilePath,
  isInProject,
} from "../src/lib/agenda/files.ts";
import {
  REVIEW_STATUSES,
  buildScheduleTree,
  daysLate,
  // Named `elapsedOnSchedule` here because `lib/agenda/projects` exports an
  // `elapsedPercent` of its own — the project's, not an activity's — and this
  // file checks both.
  elapsedPercent as elapsedOnSchedule,
  groupPhotosByDay,
  isAwaitingAnswer,
  isOverdue,
  nextRevision,
  photoPlace,
  revisionLabel,
  scheduleVariance,
} from "../src/lib/agenda/records.ts";
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
    /if \(section\.phase > BUILT_THROUGH_PHASE\) \{[\s\S]{0,400}?<span/.test(
      navSource,
    ),
    "a link to an empty page costs somebody a tap to find out",
  );
  check(
    "and it asks the shared constant rather than a literal phase number",
    /BUILT_THROUGH_PHASE/.test(navSource) && !/section\.phase [!=]== \d/.test(navSource),
    "a hard-coded 1 here is how the menu and LIVE_SECTIONS came to disagree",
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
// 6. Phase 2: the records a site actually argues about
// ---------------------------------------------------------------------------

{
  check(
    "the build has reached phase 2",
    BUILT_THROUGH_PHASE >= 2,
  );
  check(
    "the uploader names the bucket 0094 actually created",
    AGENDA_FILES_BUCKET === "agenda-files" &&
      readFileSync("supabase/migrations/0094_agenda_files.sql", "utf8").includes(
        "'agenda-files'",
      ),
  );
  for (const id of [
    "rfis",
    "submittals",
    "schedule",
    "photos",
    "daily-logs",
    "meetings",
  ]) {
    check(
      `${id} is live rather than "soon"`,
      LIVE_SECTIONS.some((section) => section.id === id),
    );
  }

  // --- review status -------------------------------------------------------

  check(
    "every review status the database has is spelled here",
    REVIEW_STATUSES.length === 9,
    `${REVIEW_STATUSES.length} of agenda_review_status's 9`,
  );
  check(
    "each one has a tone the chip can actually draw",
    REVIEW_STATUSES.every((entry) =>
      ["neutral", "info", "active", "warning", "success", "danger", "muted"].includes(
        entry.tone,
      ),
    ),
  );
  check(
    "a draft is still waiting on somebody",
    isAwaitingAnswer("draft") && isAwaitingAnswer("open") &&
      isAwaitingAnswer("pending") && isAwaitingAnswer("revise_resubmit"),
  );
  check(
    "and an answered, approved, rejected or closed one is not",
    !isAwaitingAnswer("answered") && !isAwaitingAnswer("approved") &&
      !isAwaitingAnswer("approved_with_comments") &&
      !isAwaitingAnswer("rejected") && !isAwaitingAnswer("closed"),
    "counting a closed RFI as open is how a register stops being believed",
  );

  // --- overdue -------------------------------------------------------------

  const today = new Date("2026-03-10T09:00:00Z");
  check(
    "an undated record is not late",
    daysLate(null, today) === null && !isOverdue(null, "open", today),
    "a red badge on everything teaches people to ignore red badges",
  );
  check(
    "due today is not yet overdue",
    daysLate("2026-03-10", today) === 0 && !isOverdue("2026-03-10", "open", today),
  );
  check(
    "yesterday is one day late",
    daysLate("2026-03-09", today) === 1 && isOverdue("2026-03-09", "open", today),
  );
  check(
    "a settled record is never late, however old the date",
    !isOverdue("2020-01-01", "answered", today) &&
      !isOverdue("2020-01-01", "closed", today),
  );
  check(
    "a date that is not a date does not become day zero",
    daysLate("not a date", today) === null,
  );

  // --- revisions -----------------------------------------------------------

  check(
    "a revision reads the way a transmittal writes it",
    revisionLabel(1) === "Rev 01" && revisionLabel(12) === "Rev 12",
    "Rev 9 sorting after Rev 10 is a list somebody misreads",
  );
  check(
    "the next revision follows the highest issued, not the count",
    nextRevision([1, 2, 5]) === 6 && nextRevision([]) === 1,
    "reusing a withdrawn number puts two documents in two inboxes as one",
  );

  // --- schedule ------------------------------------------------------------

  check(
    "elapsed is null without both dates, not zero",
    elapsedOnSchedule("2026-03-01", null, today) === null &&
      elapsedOnSchedule(null, "2026-03-20", today) === null,
    "undated is not the same as not started",
  );
  check(
    "halfway through the dates is halfway elapsed",
    elapsedOnSchedule("2026-03-05", "2026-03-15", today) === 50,
  );
  check(
    "before it starts is 0 and after it finishes is 100",
    elapsedOnSchedule("2026-04-01", "2026-04-10", today) === 0 &&
      elapsedOnSchedule("2026-01-01", "2026-01-10", today) === 100,
  );
  check(
    "variance is progress minus elapsed, in points",
    scheduleVariance("2026-03-05", "2026-03-15", 20, today) === -30 &&
      scheduleVariance("2026-03-05", "2026-03-15", 50, today) === 0,
    "20% built against 80% elapsed is the activity the meeting is about",
  );
  check(
    "an undated activity has no variance rather than a variance of zero",
    scheduleVariance(null, null, 40, today) === null,
    "zero means on track, and unplanned is not on track",
  );

  {
    const flat = [
      { id: "b", parentId: "a", position: 1 },
      { id: "a", parentId: null, position: 0 },
      { id: "c", parentId: "a", position: 0 },
      { id: "orphan", parentId: "gone", position: 9 },
    ];
    const tree = buildScheduleTree(flat);
    check(
      "the programme nests, in planner's order",
      tree.length === 2 &&
        tree[0]?.id === "a" &&
        tree[0]?.children.map((child) => child.id).join(",") === "c,b",
    );
    check(
      "an activity whose parent is missing is kept, not dropped",
      tree.some((node) => node.id === "orphan"),
      "a programme that silently loses rows is worse than a wrong indent",
    );
  }

  // --- photos --------------------------------------------------------------

  check(
    "a photo's place skips the parts nobody filled in",
    photoPlace({ building: "Block B", floor: null, area: "Core" }) ===
      "Block B · Core" &&
      photoPlace({ building: null, floor: null, area: null }) === null,
  );
  {
    const days = groupPhotosByDay([
      { takenAt: "2026-03-01T08:00:00Z" },
      { takenAt: "2026-03-02T08:00:00Z" },
      { takenAt: "2026-03-01T17:00:00Z" },
    ]);
    check(
      "photos read as a diary: newest day first, both of that day together",
      days.length === 2 &&
        days[0]?.day === "2026-03-02" &&
        days[1]?.photos.length === 2,
    );
  }

  // --- the writes ----------------------------------------------------------

  const actions = code(
    "src/app/(dashboard)/agenda/projects/[projectId]/site-actions.ts",
  );
  check(
    "an RFI takes its number from the counter, not from a count",
    /supabase\.rpc\(\s*"agenda_next_number",\s*\{\s*target_project: projectId,\s*record_kind: "rfi"/.test(
      actions,
    ),
    "count(*) + 1 hands two engineers the same RFI-024",
  );
  check(
    "and a submittal takes its own",
    /record_kind: "submittal",\s*prefix: "SUB"/.test(actions),
  );
  check(
    "neither counts rows to find the next number",
    !/count\(\*\)/.test(actions) &&
      !/\.select\("id",\s*\{\s*count: "exact"[\s\S]{0,200}?number/.test(actions),
  );
  check(
    "a resubmission follows the highest revision issued",
    /order\("revision",\s*\{\s*ascending: false\s*\}\)[\s\S]{0,400}?revision: highest \+ 1,/.test(
      actions,
    ),
  );
  check(
    "a review is written to the revision and to the submittal",
    /from\("agenda_submittal_revisions"\)\s*\.update\(\{[\s\S]{0,300}?reviewed_by: user\.id/.test(
      actions,
    ) &&
      /from\("agenda_submittals"\)\s*\.update\(\{ status: outcome as Reviewable \}\)/.test(
        actions,
      ),
    "the revision keeps what was decided; the register shows the latest",
  );
  check(
    "only a real outcome is accepted",
    /if \(!REVIEWABLE\.includes\(outcome as Reviewable\)\) \{/.test(actions),
  );
  check(
    "reported progress carries the status with it",
    /status: clamped >= 100 \? "done" : clamped > 0 \? "in_progress" : "todo"/.test(
      actions,
    ),
    "an activity at 100% still reading To do is a programme nobody believes",
  );
  check(
    "a photo's path is checked against the project it claims",
    /if \(!isInProject\(storagePath, projectId\)\) \{/.test(actions),
    "a row and an object that disagree is a photo nobody can open",
  );

  const wall = code("src/components/agenda/site/photo-wall.tsx");
  check(
    "the uploader files under the project id, which is what the policy matches",
    /agendaFilePath\(projectId, "photos", file\.name\)/.test(wall) &&
      agendaFilePath("p1", "photos", "slab.JPG").startsWith("p1/photos/"),
  );
  check(
    "and the uploader and the checker share one definition of that",
    isInProject(agendaFilePath("p1", "photos", "slab.jpg"), "p1") &&
      !isInProject(agendaFilePath("p2", "photos", "slab.jpg"), "p1"),
    "two spellings of \"inside this project\" is one of them being wrong",
  );
  check(
    "inside means the first segment, not anywhere in the path",
    !isInProject("p2/photos/p1-elevation.jpg", "p1") &&
      !isInProject("elsewhere/p1/photos/slab.jpg", "p1"),
    "the storage policy reads foldername[1]; a substring match is not that",
  );
  check(
    "a file name that is not really an extension does not become the path",
    agendaFilePath("p1", "photos", "slab.tar.gz;rm -rf").endsWith(".bin"),
  );
  check(
    "and it uploads from the browser rather than through the action",
    /storage\.from\(AGENDA_FILES_BUCKET\)\s*\.upload\(path, file/.test(wall),
    "an 8 MB phone photo through a server action is held in memory twice",
  );

  const rfiView = code("src/components/agenda/site/rfi-register.tsx");
  check(
    "the RFI register puts what is waiting above what is settled",
    /const aOpen = isAwaitingAnswer\(a\.status\) \? 0 : 1;[\s\S]{0,200}?if \(aOpen !== bOpen\) return aOpen - bOpen;/.test(
      rfiView,
    ),
    "sorted by date alone, last month's clash sits below this morning's query",
  );

  const board = code("src/components/agenda/site/schedule-board.tsx");
  check(
    "the programme draws reported progress and elapsed time separately",
    /<Bar\s+label="Built"/.test(board) && /<Bar\s+label="Elapsed"/.test(board),
    "one bar would hide the activity 20% built and 80% elapsed",
  );
  check(
    "progress is written when the slider is let go, not on every pixel",
    /onBlur=\{\(event\) => \{[\s\S]{0,200}?onProgress\(node\.id, next\)/.test(board) &&
      !/onChange=\{\(event\) => \{[\s\S]{0,120}?onProgress\(/.test(board),
  );

  // Daily logs and meetings are 0024's panels, reused. The check is that they
  // were reused: a second daily-log form is a second place for "one entry per
  // day" to be wrong.
  const logPage = code(
    "src/app/(dashboard)/agenda/projects/[projectId]/daily-logs/page.tsx",
  );
  check(
    "the daily log screen reuses the panel that already existed",
    /<DailyLogPanel projectId=\{projectId\} logs=\{logs\} \/>/.test(logPage),
  );
  const meetingPage = code(
    "src/app/(dashboard)/agenda/projects/[projectId]/meetings/page.tsx",
  );
  check(
    "and so does the meetings screen",
    /<MeetingPanel projectId=\{projectId\} meetings=\{meetings\} \/>/.test(
      meetingPage,
    ),
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
console.log(`${DIM}agenda: a construction record, in Medosha's navigation${RESET}`);
