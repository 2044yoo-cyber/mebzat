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
  AGE_BUCKETS,
  BID_STATUSES,
  EQUIPMENT_STATUSES,
  ageInvoices,
  ageOf,
  compareBids,
  hoursByDay,
  invoiceTotals,
  outstanding,
  plantInUsePercent,
  serviceDue,
} from "../src/lib/agenda/billing.ts";
import {
  BOQ_UNITS,
  CHANGE_REASONS,
  CONTRACT_PARTIES,
  MONEY_STATUSES,
  budgetTotals,
  budgetVariance,
  changeImpact,
  committedPercent,
  groupBySection,
  isAgreed,
  isLiveMoney,
} from "../src/lib/agenda/money.ts";
import {
  FORM_FIELD_KINDS,
  INSPECTION_RESULTS,
  ISSUE_STATUSES,
  OBSERVATION_KINDS,
  byUrgency,
  isIssueOpen,
  missingAnswers,
  parseFieldLines,
  parseFormFields,
  punchProgress,
  rollUpInspection,
  type FormField,
} from "../src/lib/agenda/quality.ts";
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
    "every upload's path is checked against the project it claims",
    // Counted, not matched. Three actions take an uploaded path — a photo, a
    // drawing revision, a document version — and asserting the guard appears
    // "somewhere" passed with it deleted from one of the three.
    (actions.match(/if \(!isInProject\(storagePath, projectId\)\) \{/g) ?? [])
      .length === 3,
    "a row and an object that disagree is a file nobody can open",
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
// 7. Phase 3: quality, safety, and the chain that joins them
// ---------------------------------------------------------------------------

{
  check(
    "the build has reached phase 3",
    BUILT_THROUGH_PHASE >= 3,
  );
  for (const id of [
    "inspections",
    "observations",
    "punch-list",
    "forms",
    "progress-360",
  ]) {
    check(
      `${id} is live rather than "soon"`,
      LIVE_SECTIONS.some((section) => section.id === id),
    );
  }

  // --- inspections ---------------------------------------------------------

  check(
    "every inspection result the database has is spelled here",
    INSPECTION_RESULTS.length === 5,
    `${INSPECTION_RESULTS.length} of agenda_inspection_result's 5`,
  );
  check(
    "one failed check fails the inspection",
    rollUpInspection([
      { result: "pass" },
      { result: "pass" },
      { result: "fail" },
    ]) === "fail",
    "you do not pass a slab because nineteen of twenty checks were fine",
  );
  check(
    "a failed check outranks an unfinished one",
    rollUpInspection([{ result: "pending" }, { result: "fail" }]) === "fail",
  );
  check(
    "an unfinished check keeps the inspection unfinished",
    rollUpInspection([{ result: "pass" }, { result: "pending" }]) === "pending",
  );
  check(
    "a condition carries to the header",
    rollUpInspection([{ result: "pass" }, { result: "conditional" }]) ===
      "conditional",
  );
  check(
    "all passed is a pass",
    rollUpInspection([{ result: "pass" }, { result: "pass" }]) === "pass",
  );
  check(
    "a check that did not apply is not evidence of a pass",
    rollUpInspection([{ result: "not_applicable" }]) === null &&
      rollUpInspection([]) === null,
    "null lets the recorded result stand for an inspection with no checklist",
  );

  // --- observations --------------------------------------------------------

  check(
    "every observation kind the database has is spelled here",
    OBSERVATION_KINDS.length === 7,
    `${OBSERVATION_KINDS.length} of agenda_observation_kind's 7`,
  );
  check(
    "safety is offered first",
    OBSERVATION_KINDS[0]?.value === "safety",
    "it is the one that stops the job, so it should not be fourth in a list",
  );

  // --- issues --------------------------------------------------------------

  check(
    "every issue status the database has is spelled here",
    ISSUE_STATUSES.length === 7,
    `${ISSUE_STATUSES.length} of agenda_issue_status's 7`,
  );
  check(
    "a rejected fix is still somebody's work",
    isIssueOpen("rejected") && isIssueOpen("ready_for_inspection"),
    "counting it as done is how a punch list reaches zero with snags on site",
  );
  check(
    "resolved and closed are not",
    !isIssueOpen("resolved") && !isIssueOpen("closed"),
  );
  check(
    "an empty punch list is not a finished one",
    punchProgress([]) === null,
    "a complete bar for a snagging nobody has carried out is the worst answer",
  );
  check(
    "progress counts only what is settled",
    punchProgress([
      { status: "closed" },
      { status: "resolved" },
      { status: "rejected" },
      { status: "open" },
    ]) === 50,
  );
  {
    const sorted = byUrgency([
      { status: "closed", dueDate: "2026-01-01" },
      { status: "open", dueDate: null },
      { status: "open", dueDate: "2026-03-01" },
      { status: "open", dueDate: "2026-02-01" },
    ]);
    check(
      "open work comes first, soonest due at the top",
      sorted[0]?.dueDate === "2026-02-01" && sorted[1]?.dueDate === "2026-03-01",
    );
    check(
      "an undated item sorts after every dated one, not before",
      sorted[2]?.dueDate === null && sorted[3]?.status === "closed",
      "it has no deadline to have missed; the top is for work that is late",
    );
  }

  // --- forms ---------------------------------------------------------------

  check(
    "every field kind has a label",
    FORM_FIELD_KINDS.length === 6,
  );
  {
    const fields = parseFieldLines(
      [
        "Permit number*",
        "Gas tested [yes/no]",
        "Depth [number]",
        "Dug on [date]",
        "Method [hand dig | machine]",
        "What was found [long]",
        "",
        "   ",
      ].join("\n"),
    );
    check(
      "a form is written one question per line",
      fields.length === 6,
      `${fields.length} questions parsed`,
    );
    check(
      "a trailing star makes an answer compulsory, and is not part of the label",
      fields[0]?.required === true && fields[0]?.label === "Permit number",
    );
    check(
      "the bracket says what kind of answer, and is not part of the label",
      fields[1]?.kind === "yes_no" && fields[1]?.label === "Gas tested" &&
        fields[2]?.kind === "number" && fields[3]?.kind === "date" &&
        fields[5]?.kind === "long_text",
    );
    check(
      "a bracket with bars is a list to pick from",
      fields[4]?.kind === "choice" &&
        fields[4]?.options?.join(",") === "hand dig,machine",
    );
    check(
      "a question is not given an id it would lose when renamed",
      fields.every((field) => !("id" in field)),
      "answers are keyed by id; deriving it from the label orphans them",
    );
  }
  check(
    "a bracket nobody recognises leaves a question standing",
    parseFieldLines("Notes [ማስታወሻ]").length === 1,
    "losing a line somebody typed is worse than a text box",
  );
  check(
    "a list with no options is dropped rather than rendered unanswerable",
    parseFieldLines("Pick one [ | ]").length === 0,
  );
  check(
    "a template's stored fields are validated, not trusted",
    parseFormFields([
      { id: "a", label: "Fine", kind: "text" },
      { id: "b", label: "No kind" },
      { label: "No id", kind: "text" },
      "not an object",
      null,
      { id: "c", label: "Empty list", kind: "choice", options: [] },
    ]).length === 1,
    "fields is jsonb, so nothing in the database has an opinion about it",
  );
  check(
    "and something that is not a list at all is empty rather than a throw",
    parseFormFields(null).length === 0 && parseFormFields("[]").length === 0,
  );
  {
    const fields: FormField[] = [
      { id: "a", label: "Permit", kind: "text", required: true },
      { id: "b", label: "Gas tested", kind: "yes_no", required: true },
      { id: "c", label: "Notes", kind: "text", required: false },
    ];
    check(
      "a compulsory answer left blank is reported by name",
      missingAnswers(fields, { b: true }).map((f) => f.id).join() === "a",
    );
    check(
      "an answer of no is an answer",
      missingAnswers(fields, { a: "P1", b: false }).length === 0,
      "false and the empty string are not the same thing",
    );
    check(
      "and whitespace is not",
      missingAnswers(fields, { a: "   ", b: true }).map((f) => f.id).join() === "a",
    );
  }

  // --- the chain -----------------------------------------------------------

  const quality = code(
    "src/app/(dashboard)/agenda/projects/[projectId]/site-actions.ts",
  );
  check(
    "an observation can be raised from the inspection check that found it",
    /inspection_item_id: inspectionItemId \?\? null,/.test(quality),
    "the chain is what answers \"why was this rebuilt\" six months later",
  );
  check(
    "and a punch item from the observation that caused it",
    /observation_id: observationId \?\? null,/.test(quality),
  );
  check(
    "the inspection header is rolled up from its items, not typed",
    /const rolled = rollUpInspection\(/.test(quality),
  );
  check(
    "and rolled up from the items as they are now, not as the page knew them",
    /from\("agenda_inspection_items"\)\s*\.select\("result"\)\s*\.eq\("inspection_id", inspectionId\)/.test(
      quality,
    ),
    "another inspector recording a fail on the same walk must not be overwritten",
  );
  check(
    "a punch item is numbered, because it is read out on site",
    /record_kind: "punch",\s*prefix: "PL",/.test(quality),
  );
  check(
    "a yes/no answer is always written, so a deliberate no is not a skip",
    /if \(field\.kind === "yes_no"\) \{\s*[\s\S]{0,200}?answers\[field\.id\] = raw === "on";/.test(
      quality,
    ),
  );
  check(
    "an answer to a list is checked against that list",
    /if \(field\.kind === "choice" && !field\.options\?\.includes\(raw\)\) continue;/.test(
      quality,
    ),
  );
  check(
    "a form's compulsory questions are checked before it is filed",
    /const missing = missingAnswers\(fields, answers\);\s*if \(missing\.length > 0\)/.test(
      quality,
    ),
  );
  check(
    "a template minted for reuse has no project rather than this one",
    /project_id: formData\.get\("scope"\) === "everywhere" \? null : projectId,/.test(
      quality,
    ),
    "membership cannot gate a row with no project on it",
  );
  check(
    "each question gets a minted id",
    /\.map\(\(field\) => \(\{ \.\.\.field, id: crypto\.randomUUID\(\) \}\)\)/.test(
      quality,
    ),
  );
  check(
    "a pinned panorama points at the job rather than copying the image",
    /panorama_job_id: jobId,\s*storage_path: null,/.test(quality),
    "a re-stitch that fixes a seam must fix the site record too",
  );

  const inspectionView = code(
    "src/components/agenda/site/inspection-register.tsx",
  );
  check(
    "the register shows the rolled-up result, with the recorded one as fallback",
    /rollUpInspection\(inspection\.items\) \?\? inspection\.result/.test(
      inspectionView,
    ),
    "a row reading pass over a check reading fail is the bug this prevents",
  );
  {
    // Scoped by hand rather than with one regex: `item.result === "fail"` also
    // appears in the row's own className a hundred lines earlier, and a
    // distance-bounded match found that one and proved nothing about the
    // button. The guard's exact text is asserted as well as the containment,
    // because a button inside `{false && (...)}` is still in the source.
    const guard = inspectionView.indexOf('{item.result === "fail" && (');
    const button = inspectionView.indexOf("Raise an observation");
    check(
      "a failed check offers to raise an observation where somebody is looking",
      guard !== -1 &&
        button > guard &&
        !inspectionView.slice(guard, button).includes("</li>"),
      "on a passed check there is nothing to raise",
    );
  }

  const observationView = code("src/components/agenda/site/observation-list.tsx");
  check(
    "an observation offers to become a punch item",
    /Add to the punch list/.test(observationView) &&
      /addPunchItem\(\s*projectId,\s*formData,\s*observation\.id,\s*\)/.test(
        observationView,
      ),
  );

  const panoramaView = code("src/components/agenda/site/progress-360.tsx");
  check(
    "360 progress reuses the viewer that already exists",
    /<PanoramaViewer\s+src=\{open\.panoramaUrl\}/.test(panoramaView),
    "a second WebGL runtime on a phone that already carries Three and MapLibre",
  );
  check(
    "and offers only panoramas that have finished stitching",
    /\.eq\("status", "ready"\)\s*\.not\("panorama_url", "is", null\)/.test(
      code("src/lib/data/agenda-site.ts"),
    ),
    "a job still stitching has no image to put on the wall",
  );
}


// ---------------------------------------------------------------------------
// 8. Phase 4: the commercial record
// ---------------------------------------------------------------------------

{
  check("the build has reached phase 4", BUILT_THROUGH_PHASE >= 4);
  for (const id of [
    "boq",
    "budget",
    "contracts",
    "commitments",
    "purchase-orders",
    "change-events",
    "change-orders",
  ]) {
    check(
      `${id} is live rather than "soon"`,
      LIVE_SECTIONS.some((section) => section.id === id),
    );
  }

  // --- the vocabulary ------------------------------------------------------

  check(
    "every money status the database has is spelled here",
    MONEY_STATUSES.length === 10,
    `${MONEY_STATUSES.length} of agenda_money_status's 10`,
  );
  check(
    "every contract party and change reason too",
    CONTRACT_PARTIES.length === 5 && CHANGE_REASONS.length === 7,
  );
  check(
    "a bill can be measured in more than pieces",
    BOQ_UNITS.includes("m3") && BOQ_UNITS.includes("ton"),
  );
  check(
    "only approved and paid count as agreed",
    isAgreed("approved") && isAgreed("paid") &&
      !isAgreed("submitted") && !isAgreed("under_review") &&
      !isAgreed("pending") && !isAgreed("draft"),
    "0091's trigger moves a contract sum on approved alone",
  );
  check(
    "a rejected, paid, closed or cancelled row has stopped moving",
    !isLiveMoney("rejected") && !isLiveMoney("paid") &&
      !isLiveMoney("closed") && !isLiveMoney("cancelled"),
  );
  check(
    "and a draft or a part payment has not",
    isLiveMoney("draft") && isLiveMoney("partially_paid"),
  );

  // --- budget arithmetic ---------------------------------------------------

  {
    const rows = [
      {
        originalBudget: 1000,
        approvedChanges: 200,
        committedCost: 300,
        actualCost: 400,
        pendingCost: 50,
        forecastCost: 1100,
      },
      {
        originalBudget: 500,
        approvedChanges: 0,
        committedCost: 100,
        actualCost: 100,
        pendingCost: 0,
        forecastCost: 600,
      },
    ];
    const totals = budgetTotals(rows);
    check(
      "a budget total adds up its parts",
      totals.originalBudget === 1500 && totals.approvedChanges === 200 &&
        totals.actualCost === 500 && totals.committedCost === 400,
    );
    check(
      "the revised total is original plus approved changes",
      totals.revisedBudget === 1700,
    );
    check(
      "and what is left has committed money taken off as well as spent",
      totals.remainingBudget === 800,
      "a PO placed and not yet invoiced is money that has left",
    );
    check(
      "an empty budget totals to zero rather than throwing",
      budgetTotals([]).revisedBudget === 0,
    );
  }
  check(
    "committed money counts towards what is spoken for",
    committedPercent({
      originalBudget: 1000,
      approvedChanges: 0,
      committedCost: 300,
      actualCost: 400,
      pendingCost: 0,
      forecastCost: 0,
    }) === 70,
  );
  check(
    "a line over its budget is reported over, not capped at full",
    committedPercent({
      originalBudget: 1000,
      approvedChanges: 0,
      committedCost: 0,
      actualCost: 1300,
      pendingCost: 0,
      forecastCost: 0,
    }) === 130,
    "a bar that stops at 100 hides the one line that matters",
  );
  check(
    "an unbudgeted line has no percentage rather than a percentage of zero",
    committedPercent({
      originalBudget: 0,
      approvedChanges: 0,
      committedCost: 0,
      actualCost: 500,
      pendingCost: 0,
      forecastCost: 0,
    }) === null,
    "zero would read as nothing spent, which is the opposite of the truth",
  );
  check(
    "negative variance means over budget, as it does for lateness elsewhere",
    budgetVariance({
      originalBudget: 1000,
      approvedChanges: 0,
      committedCost: 200,
      actualCost: 900,
      pendingCost: 0,
      forecastCost: 0,
    }) === -100,
    "two sign conventions in one product is a red number read as good news",
  );

  // --- the bill ------------------------------------------------------------

  {
    const sections = groupBySection([
      { section: "Substructure", amount: 100, actualCost: 90 },
      { section: "Finishes", amount: 50, actualCost: null },
      { section: "Substructure", amount: 200, actualCost: null },
    ]);
    check(
      "a bill keeps the order it was written in",
      sections.map((s) => s.section).join(",") === "Substructure,Finishes",
      "sorting alphabetically puts Finishes first, which is nobody's bill",
    );
    check(
      "a section totals its lines",
      sections[0]?.priced === 300 && sections[0]?.rows.length === 2,
    );
    check(
      "a line with no actual recorded does not poison the section's actual",
      sections[0]?.actual === 90 && sections[1]?.actual === 0,
    );
  }

  // --- change orders -------------------------------------------------------

  {
    const impact = changeImpact([
      { status: "approved", costImpact: 4000, scheduleImpactDays: 10 },
      { status: "under_review", costImpact: 6000, scheduleImpactDays: 5 },
      { status: "rejected", costImpact: 9000, scheduleImpactDays: 30 },
      { status: "cancelled", costImpact: 1000, scheduleImpactDays: 1 },
    ]);
    check(
      "approved change is counted apart from what is still argued",
      impact.approvedCost === 4000 && impact.pendingCost === 6000,
      "one total says \"up by four million\" while meaning six more may follow",
    );
    check(
      "days follow the same split",
      impact.approvedDays === 10 && impact.pendingDays === 5,
    );
    check(
      "a rejected or cancelled change is neither agreed nor still arguable",
      impact.approvedCost + impact.pendingCost === 10000,
      "leaving it as pending is a number nobody is going to resolve",
    );
  }

  // --- the writes ----------------------------------------------------------

  const moneyActions = code(
    "src/app/(dashboard)/agenda/projects/[projectId]/money-actions.ts",
  );
  check(
    "a generated column is never written",
    // `^\s+amount:` rather than `amount:`, which also matches
    // `original_amount:` — a real stored column on commitments, and the kind
    // of substring match that makes a check fail on correct code.
    !/^\s+amount:/m.test(moneyActions) &&
      !/revised_budget/.test(moneyActions) &&
      !/remaining_budget/.test(moneyActions) &&
      !/current_value/.test(moneyActions),
    "0091 generates these so a stored copy cannot be wrong",
  );
  check(
    "a change order is always raised as a draft",
    /    status: "draft",\n  \}\);/.test(moneyActions),
    "0091's trigger fires on insert, so approving is a separate act",
  );
  check(
    "deciding one records who decided and when",
    /      status: decision,\n      decided_at: new Date\(\)\.toISOString\(\),\n      decided_by: user\.id,/.test(
      moneyActions,
    ),
  );
  check(
    "and does not touch the contract sum itself",
    // Scoped to updating the contracts table. A blanket ban on
    // `approved_changes` would also catch the budget's own column of that
    // name, which is stored rather than generated and is edited by hand.
    !/from\("agenda_contracts"\)\s*\.update/.test(moneyActions),
    "agenda_sync_contract_changes recomputes it from every approved order",
  );
  check(
    "a purchase order cannot exist without lines",
    /if \(lines\.length === 0\) \{\s*return \{ error: "Add at least one line to the order\." \};/.test(
      moneyActions,
    ),
    "an order for nothing is a number somebody has to chase",
  );
  check(
    "money written as a site office writes it still parses",
    // All three parsers, counted. Asserting the pattern appears "somewhere"
    // passed with it deleted from `money` because `quantity` and
    // `optionalMoney` each have their own copy — the second-copy trap.
    (moneyActions.match(/\.replace\(\/\[,\\s\]\/g, ""\)/g) ?? []).length === 3,
    "Number(\"4,200,000\") is NaN",
  );
  check(
    "a credit change order is allowed to be negative",
    // The exact return, rather than a grep for clamping that has to guess
    // what the clamp would look like — the first version of this check missed
    // `Math.max(Math.round(amount * 100) / 100, 0)` entirely.
    moneyActions.includes(
      "return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;",
    ),
    "refusing one means recording a reduction as an increase somewhere else",
  );
  check(
    "an unknown cost stays unknown rather than becoming zero",
    /potential_cost: optionalMoney\(formData\.get\("potentialCost"\)\),/.test(
      moneyActions,
    ),
    "zero is a priced change; null is one nobody has priced",
  );
  check(
    "a currency that is not a currency code falls back rather than being stored",
    /return \/\^\[A-Z\]\{3\}\$\/\.test\(raw\) \? raw : "ETB";/.test(moneyActions),
  );

  // --- why a section is empty ----------------------------------------------

  const moneyReads = code("src/lib/data/agenda-money.ts");
  check(
    "the screen asks the same two functions the policies ask",
    /supabase\.rpc\("agenda_can_view_finance", \{ target_project: projectId \}\)/.test(
      moneyReads,
    ) &&
      /supabase\.rpc\("agenda_can_view_contracts", \{ target_project: projectId \}\)/.test(
        moneyReads,
      ),
    "a second spelling of the permission is a second thing to get wrong",
  );
  check(
    "a failed permission call reads as no rather than as yes",
    /finance: finance\.data === true,/.test(moneyReads) &&
      /contracts: contracts\.data === true,/.test(moneyReads),
  );
  check(
    "the reads do not filter by permission themselves",
    !/can_view/.test(moneyReads.replace(/agenda_can_view_\w+", \{[^}]*\}/g, "")),
    "the policies do it; a copy in TypeScript is the one that drifts",
  );
  for (const [section, what] of [
    ["boq", "The bill of quantities"],
    ["budget", "The budget"],
    ["contracts", "The contract register"],
    ["commitments", "Commitments"],
    ["purchase-orders", "Purchase orders"],
    ["change-events", "Change events"],
    ["change-orders", "Change orders"],
  ] as [string, string][]) {
    const page = code(
      `src/app/(dashboard)/agenda/projects/[projectId]/${section}/page.tsx`,
    );
    check(
      `${section} says why it is empty rather than "nothing here yet"`,
      new RegExp(
        `if \\(!access\\.(finance|contracts)\\) return <NoMoneyAccess what="${what}" \\/>;`,
      ).test(page),
      "\"no budget yet\" and \"not shared with you\" look identical through RLS",
    );
  }
  check(
    "the contract register asks the contracts permission, not the finance one",
    /if \(!access\.contracts\)/.test(
      code(
        "src/app/(dashboard)/agenda/projects/[projectId]/contracts/page.tsx",
      ),
    ),
    "a surveyor who prices the work is not shown what the client signed",
  );

  // --- the screens ---------------------------------------------------------

  const budgetView = code("src/components/agenda/money/budget-table.tsx");
  check(
    "the budget reads the database's own revised and remaining figures",
    /item\.revisedBudget/.test(budgetView) &&
      /item\.remainingBudget/.test(budgetView),
  );
  const bits = code("src/components/agenda/money/money-bits.tsx");
  check(
    "the bar is clamped and the number is not",
    /Math\.min\(percent, 100\)/.test(bits) && /\{percent\}%/.test(bits),
  );
  const changeOrderView = code("src/components/agenda/money/change-orders.tsx");
  check(
    "approved and pending change are drawn apart",
    /label="Approved"/.test(changeOrderView) &&
      /label="Still being argued"/.test(changeOrderView),
  );
  const poView = code("src/components/agenda/money/purchase-orders.tsx");
  check(
    "an order can be placed against the submittal its material was approved on",
    /name="submittalId"/.test(poView),
    "ordering against the approved revision is what stops the wrong thing arriving",
  );
  check(
    "a delivery is recorded when the field is left, not on every keystroke",
    /onBlur=\{\(event\) => \{[\s\S]{0,700}?recordDelivery\(/.test(poView) &&
      !/onChange=\{\(event\) => \{[\s\S]{0,200}?recordDelivery\(/.test(poView),
  );
}


// ---------------------------------------------------------------------------
// 9. Phase 5, and the module finished
// ---------------------------------------------------------------------------

{
  check("the build has reached phase 5", BUILT_THROUGH_PHASE >= 5);
  check(
    "every section in the workspace is live",
    LIVE_SECTIONS.length === WORKSPACE_SECTIONS.length,
    `${LIVE_SECTIONS.length} of ${WORKSPACE_SECTIONS.length}`,
  );
  check(
    "and every one of them has a route",
    WORKSPACE_SECTIONS.every((section) =>
      exists(
        section.segment
          ? `src/app/(dashboard)/agenda/projects/[projectId]/${section.segment}/page.tsx`
          : "src/app/(dashboard)/agenda/projects/[projectId]/page.tsx",
      ),
    ),
  );
  check(
    "nothing is left saying it is being built",
    !exists("src/components/agenda/shell/section-shell.tsx"),
    "an unused stub is a stub somebody will route to again",
  );
  for (const route of [
    "src/app/(dashboard)/agenda/tasks/page.tsx",
    "src/app/(dashboard)/agenda/calendar/page.tsx",
  ]) {
    check(
      `${route.replace("src/app/(dashboard)", "")} is a real screen`,
      !/SectionShell/.test(code(route)),
    );
  }

  // --- invoices ------------------------------------------------------------

  const invoice = (over: Partial<Parameters<typeof outstanding>[0]> = {}) => ({
    amount: 1000,
    taxAmount: 150,
    retentionAmount: 50,
    totalAmount: 1100,
    paidAmount: 0,
    status: "approved" as const,
    dueOn: null,
    ...over,
  });

  check(
    "what is outstanding is the total less what was paid",
    outstanding(invoice({ paidAmount: 400 })) === 700,
  );
  check(
    "an overpayment is not negative debt",
    outstanding(invoice({ paidAmount: 1500 })) === 0,
    "a negative outstanding invites somebody to net it off the next invoice",
  );
  {
    const totals = invoiceTotals([
      invoice({ paidAmount: 400 }),
      invoice({ status: "draft" }),
      invoice({ status: "rejected" }),
      invoice({ status: "cancelled" }),
      invoice({ paidAmount: 1100 }),
    ]);
    check(
      "a draft, rejected or cancelled invoice is not a claim on the project",
      totals.invoiced === 2200,
      "counting them overstates what is owed by whatever somebody typed",
    );
    check(
      "and what is outstanding follows",
      totals.paid === 1500 && totals.outstanding === 700,
    );
    check(
      "retention is counted apart from what is unpaid",
      totals.retentionHeld === 100,
      "folding it in cannot tell a subcontractor why they are short",
    );
  }
  {
    const today = new Date("2026-03-31T09:00:00Z");
    check(
      "a settled invoice has no age",
      ageOf(invoice({ paidAmount: 1100, dueOn: "2020-01-01" }), today) === null,
    );
    check(
      "an undated one has no age either, rather than being called current",
      ageOf(invoice({ dueOn: null }), today) === null,
      "undated is not the same as not yet due",
    );
    check(
      "due today is not yet late, and due yesterday is",
      // The day itself is the case worth naming: the first version of this
      // check tested tomorrow and yesterday, which a boundary of `< 0` rather
      // than `<= 0` satisfies just as well.
      ageOf(invoice({ dueOn: "2026-03-31" }), today) === "not_due" &&
        ageOf(invoice({ dueOn: "2026-04-01" }), today) === "not_due" &&
        ageOf(invoice({ dueOn: "2026-03-30" }), today) === "under_30",
    );
    check(
      "the buckets break at thirty and sixty days",
      ageOf(invoice({ dueOn: "2026-03-01" }), today) === "under_30" &&
        ageOf(invoice({ dueOn: "2026-02-25" }), today) === "under_60" &&
        ageOf(invoice({ dueOn: "2026-01-01" }), today) === "over_60",
    );
    const aged = ageInvoices(
      [
        invoice({ dueOn: "2026-01-01" }),
        invoice({ dueOn: "2026-04-01" }),
        invoice({ dueOn: "2026-03-30" }),
      ],
      today,
    );
    check(
      "the ledger is read ending on what is worst",
      aged.at(-1)?.bucket === "over_60" && aged[0]?.bucket === "not_due",
      "the last line of a list is the one somebody acts on",
    );
    check(
      "and a bucket nothing falls into is left out rather than shown as zero",
      aged.length === 3 && AGE_BUCKETS.length === 4,
    );
  }

  // --- bidding -------------------------------------------------------------

  check(
    "every bid status the database has is spelled here",
    BID_STATUSES.length === 7,
    `${BID_STATUSES.length} of agenda_bid_status's 7`,
  );
  {
    const comparison = compareBids([
      { amount: 1000, status: "submitted" },
      { amount: 1400, status: "under_review" },
      { amount: null, status: "invited" },
      { amount: 500, status: "withdrawn" },
    ]);
    check(
      "an invitation nobody answered is not a bid of nothing",
      comparison.priced === 2 && comparison.lowest === 1000,
      "counting it as zero makes the lowest bid free",
    );
    check(
      "and a withdrawn bid is not compared either",
      comparison.highest === 1400,
    );
    check(
      "the spread is measured against the lowest",
      comparison.spreadPercent === 40 && comparison.average === 1200,
      "three bids 40% apart mean the scope is unclear, not that one is cheap",
    );
  }
  check(
    "a package nobody has priced compares to nothing rather than to zero",
    compareBids([{ amount: null, status: "invited" }]).lowest === null,
  );

  // --- timesheets ----------------------------------------------------------

  {
    const days = hoursByDay([
      { workerName: "Abebe", companyName: null, workedOn: "2026-03-02", hours: 8, overtimeHours: 2 },
      { workerName: "abebe", companyName: null, workedOn: "2026-03-02", hours: 3, overtimeHours: 0 },
      { workerName: "Kebede", companyName: null, workedOn: "2026-03-02", hours: 8, overtimeHours: 0 },
      { workerName: "Abebe", companyName: null, workedOn: "2026-03-01", hours: 8, overtimeHours: 0 },
    ]);
    check(
      "hours read newest day first",
      days[0]?.day === "2026-03-02",
    );
    check(
      "a day's hours are all of its hours",
      days[0]?.hours === 19 && days[0]?.overtime === 2,
    );
    check(
      "two entries for one person on one day is a split shift, not two people",
      days[0]?.workers === 2,
    );
  }

  // --- plant ---------------------------------------------------------------

  check(
    "every equipment state the database has is spelled here",
    EQUIPMENT_STATUSES.length === 5,
  );
  check(
    "a service due today is due, not due tomorrow",
    serviceDue("2026-03-31", new Date("2026-03-31T09:00:00Z")) &&
      !serviceDue("2026-04-01", new Date("2026-03-31T09:00:00Z")),
    "a service that reads as not yet is how a machine goes another week",
  );
  check(
    "a machine with no service date is not overdue for one",
    !serviceDue(null) && !serviceDue("not a date"),
  );
  check(
    "off-hire plant is out of both halves of utilisation",
    plantInUsePercent([
      { status: "in_use" },
      { status: "available" },
      { status: "off_hire" },
      { status: "off_hire" },
    ]) === 50,
    "leaving it in makes a site look idle for machines it no longer has",
  );
  check(
    "an empty yard has no utilisation rather than nought per cent",
    plantInUsePercent([]) === null &&
      plantInUsePercent([{ status: "off_hire" }]) === null,
  );

  // --- the writes ----------------------------------------------------------

  const billing = code(
    "src/app/(dashboard)/agenda/projects/[projectId]/billing-actions.ts",
  );
  check(
    "an invoice's generated total is never written",
    !/total_amount/.test(billing),
    "0091 generates it from the amount, the tax and the retention",
  );
  check(
    "nothing marks an invoice paid by hand",
    !/status: "paid"/.test(billing),
    "agenda_sync_invoice_status follows the payments, so there is no button",
  );
  check(
    "a payment has to be more than nothing before it is even sent",
    /if \(amount <= 0\) return \{ error: "A payment has to be more than nothing\." \};/.test(
      billing,
    ),
  );
  check(
    "a bid with no price is stored with no price",
    /const amount = optionalMoney\(formData\.get\("amount"\)\);/.test(billing) &&
      /submitted_at: amount === null \? null : new Date\(\)\.toISOString\(\),/.test(
        billing,
      ),
  );
  check(
    "awarding a package closes the other bidders",
    /\.update\(\{ status: "rejected" \}\)\s*\.eq\("package_id", packageId\)\s*\.neq\("id", bidId\)/.test(
      billing,
    ),
    "three bidders all believing they are still in it is how a tender becomes a complaint",
  );
  check(
    "and does not reopen one that withdrew",
    /\.in\("status", \["invited", "viewed", "submitted", "under_review"\]\)/.test(
      billing,
    ),
  );
  check(
    "a package due on a day closes at the end of it",
    /due_at: dueDate \? `\$\{dueDate\}T23:59:00Z` : null,/.test(billing),
    "closing as the day begins loses a day nobody agreed to",
  );
  check(
    "a machine's hours are left alone when the box is blank",
    /\.\.\.\(Number\.isFinite\(hoursUsed\) && hoursUsed >= 0[\s\S]{0,140}?: \{\}\),/.test(
      billing,
    ),
    "a blank box is not \"no hours\"; a machine's clock only goes up",
  );

  // --- the last of the stubs -----------------------------------------------

  const site = code(
    "src/app/(dashboard)/agenda/projects/[projectId]/site-actions.ts",
  );
  check(
    "a drawing revision does not decide for itself that it is current",
    !/current_revision_id/.test(site),
    "agenda_drawing_set_current does it, so current cannot disagree with issued",
  );
  check(
    "a document version follows the highest already filed",
    /order\("version", \{ ascending: false \}\)[\s\S]{0,200}?version: \(existing\?\.\[0\]\?\.version \?\? 0\) \+ 1,/.test(
      site,
    ),
  );
  check(
    "a document's confidentiality comes from the three words 0024 chose",
    /CONFIDENTIALITY\.includes\(level as Confidentiality\)/.test(site),
    "a fourth word is a second permission system to keep correct",
  );
  check(
    "reported progress stays reported",
    /\.\.\.\(Number\.isFinite\(progress\)[\s\S]{0,120}?progress_percent: Math\.min/.test(
      site,
    ),
  );
  check(
    "a project is archived, never deleted",
    /archived_at: new Date\(\)\.toISOString\(\)/.test(site) &&
      !/\.delete\(\)/.test(site),
  );

  const shelf = code("src/components/agenda/site/document-shelf.tsx");
  check(
    "a document the reader may not see is absent rather than shown locked",
    !/may not|not shared|no access/i.test(shelf),
    "a row saying a contract exists is itself the leak",
  );

  const report = code(
    "src/app/(dashboard)/agenda/projects/[projectId]/reports/page.tsx",
  );
  check(
    "the report reuses each section's own arithmetic",
    /punchProgress\(punchItems\)/.test(report) &&
      /invoiceTotals\(invoices\)/.test(report) &&
      /changeImpact\(changeOrders\)/.test(report) &&
      /rollUpInspection\(inspection\.items\)/.test(report),
    "a report that sums its own version disagrees with the screen it summarises",
  );
  check(
    "and leaves the money out rather than totalling an empty list to zero",
    /const money = access\.finance/.test(report),
    "empty lists total to zero, and \"0 outstanding\" is a confident lie",
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
