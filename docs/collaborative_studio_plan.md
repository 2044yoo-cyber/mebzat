# Medosha Collaborative Studio — architecture and plan

Branch: `claude/last-job-stopping-point-ovz31u`, restarted from `main` at
`fb42c5e`. Nothing is pushed or deployed until the owner approves.

## What already exists (inspected, not assumed)

| Need | Existing piece | File |
| --- | --- | --- |
| Project | `agenda_projects` — the construction project; every Agenda table hangs off it | `supabase/migrations/0089_agenda_projects.sql` |
| Membership | `agenda_members` (role, status invited/active/suspended/removed, per-member flags); owner seeded by trigger | `0024_agenda.sql`, `0089` |
| Access predicates | `agenda_is_member(project)`, `agenda_is_owner(project)` — security definer, the one definition of access, `anon` revoked | `0024`, `0096` |
| Invitations | `inviteMember` (by email, existing account only, status `invited`) → `acceptInvite` (the invitee activates). No public links. | `src/app/(dashboard)/projects/[id]/agenda/actions.ts` |
| Tasks | `agenda_tasks` (todo / in_progress / blocked / review / done / cancelled, assignee, due date), `agenda_task_comments` | `0024` |
| Files | private bucket `agenda-files`, path `<projectId>/…`, read/upload policies on membership; `agendaFilePath`, `isInProject` | `0094`, `src/lib/agenda/files.ts` |
| Drawings + revisions | `agenda_drawings` + `agenda_drawing_revisions`; a trigger makes the newest revision current, nothing overwritten | `0090_agenda_site.sql` |
| Approvals | `agenda_approvals` (subject_type, subject_id, step, decision pending/approved/approved_with_comments/rejected) | `0091` |
| Markup and pins | `agenda_sketches` (markup stored apart from the source), `agenda_pins` (numbered, open/resolved, linked to a task) — used by House Plan | `0102_agenda_plans.sql` |
| Activity | `agenda_events` + `agenda_log_event(...)`, `agenda_audit` | `0024` |
| Numbering | `agenda_next_number(project, kind)` (PIN-001…) | `0092` |
| Notifications | `notifications` (user, actor, kind, title, body, href, read_at), written by security-definer triggers; in the realtime publication | `0010`, `0024`, `0087` |
| Realtime | Supabase `postgres_changes` + presence channels, removed on unmount | `src/components/messages/chat-window.tsx` |
| Project workspace UI | `/agenda/projects/[projectId]/<section>` with grouped section nav | `src/lib/agenda/workspace-nav.ts` |
| Main navigation | `src/lib/workspace/navigation.ts` (Agenda section) | |
| PDF rendering | `pdfjs-dist` already a dependency (House Plan sketch mode) | |
| DB tests | `supabase/tests/run.sh` — every migration on real PostgreSQL 16, tests as `authenticated` with `request.jwt.claim.sub` | |

No canvas library is installed (no tldraw, Excalidraw, Konva, Fabric). The
House Plan and Freehand Sketch are custom SVG and canvas.

## Decisions

1. **The Studio is a section of the Agenda project**, at
   `/agenda/projects/[projectId]/collaborate`, with four tabs — Board, Canvas,
   Review, Discussion & Tasks — and a **Collaborate** entry in the main
   navigation that lists the projects to open it in. No second kind of project.
2. **Access reuses Agenda membership.** A new `collab_access` row gives each
   active member a Studio level: `editor`, `commenter` or `viewer`. A member
   with no row is a **commenter** (can see and give feedback, cannot change
   boards) — edit access is granted deliberately. **Owner** is
   `agenda_is_owner` (the project owner, client or administrator), who sets
   levels. `collab_level(project)` is the one predicate every policy calls.
   Invitations stay the existing email invite → accept flow: it never
   creates a public link, so there is no token to leak or expire. (A
   shareable-link invitation was asked for "where possible"; the existing
   flow is stricter and is kept.)
3. **Boards and canvases**: `collab_boards` (kind `board` or `canvas`),
   `collab_items` — one row per card or object, with world coordinates
   (x, y, w, h, rotation), `z` order, `parent_id` for columns and groups, a
   `data` JSON per kind, and a per-row `revision`. Saves are per object and
   say which revision they were made from, so two people editing different
   objects never conflict and two editing the same one cannot silently
   overwrite each other.
4. **Files are Agenda's.** Uploads go to `agenda-files` under the project.
   A render or plan to be reviewed is an `agenda_drawings` row with
   `agenda_drawing_revisions`, so a revised render is a new revision and the
   original stays. A board card or canvas object points at the drawing; it
   is not a copy.
5. **Review threads** are new: `collab_threads` (anchored to a drawing
   revision and page at **normalised** coordinates 0..1, to a board item, or
   to the project's general discussion), `collab_comments` (replies,
   mentions), `collab_annotations` (markup geometry, normalised). Statuses
   open → ready for review → resolved / approved / changes requested.
   `agenda_pins` are not reused: they are pixel-anchored, single-status and
   serve the House Plan.
6. **Tasks are Agenda tasks.** Converting a comment creates an
   `agenda_tasks` row and links it from the thread (`task_id`), so it shows
   in Agenda's Tasks and My Tasks. Studio statuses map: Open = todo, In
   Progress = in_progress, In Review = review, Done = done.
7. **Approvals** are `agenda_approvals` rows (`subject_type =
   'drawing_revision'`); **activity** goes to `agenda_events`.
8. **Notifications**: triggers notify on mention, assignment and reply.
   **Unread**: `collab_reads` (last read per thread).
9. **Realtime**: the Studio tables join the `supabase_realtime`
   publication; clients subscribe per board / project and track presence
   (who is here, cursors on the canvas). Subscriptions are removed on
   unmount.
10. **Canvas: custom SVG, no new dependency.** tldraw's licence needs a paid
    key in production; Excalidraw (MIT) is large and owns its own document
    model, which fights per-object persistence and Agenda files; Konva is
    fine but adds a renderer the rest of Medosha does not use. An SVG world
    with a view transform renders only the objects in view, keeps
    coordinates stable under zoom and pan, and matches the House Plan's
    approach. The geometry, history and culling are pure modules with tests.

## Stages

1. Migration `0105_collab_studio.sql` + SQL tests (permissions, RLS,
   cross-project refusal, concurrency, notifications).
2. Server actions with validation and server-side authorisation.
3. Workspace shell, navigation entries, loading/empty/error/denied states.
4. Board. 5. Canvas. 6. Drawing review (images, PDFs, revisions).
7. Discussion, tasks, approvals. 8. Realtime and presence.
9. Tests (SQL, unit, browser), lint, type check, build; report.

## Limits known up front

- No Supabase project is reachable from this container, so the two-user
  realtime workflow cannot be run end to end here. Permissions are tested
  against real PostgreSQL with the real policies; the UI against the
  in-memory fake the House Plan's browser checks use. What was and was not
  run is reported.

## How it is checked

| Check | Command | What it proves |
| --- | --- | --- |
| Schema and permissions | `bash supabase/tests/run.sh` | 0105 on real PostgreSQL 16, as a non-superuser `authenticated` role with `request.jwt.claim.sub`: the four levels, row security on every Studio table, cross-project references refused, revisions in order, numbering, notifications, no deletes, nothing for `anon` |
| Model | `npx tsx scripts/collab_model_check.ts` | Item data validated per kind, `javascript:` links refused, pins stored as fractions, revision labels, mentions, who may do what |
| Save engine | `npx tsx scripts/collab_store_check.ts` | Optimistic edits, batched saves, "saved" only when the server said so, conflicts, offline and retry, undo, realtime merge, a pinch cancelling a drag |
| Canvas geometry | `npx tsx scripts/collab_canvas_geometry_check.ts` | Zoom about a point, fit, culling, rotated hit-testing and resizing, snapping, alignment |
| The Studio in a browser | `node scripts/collab_studio_browser_check.mjs` (after `npm run build`) | The workflow end to end, several people in several tabs: below |

Each has a mutation plan in `scripts/mutants/collab_*.json`, run with
`node scripts/mutate.mjs "<command>" <plan>`.

The browser check drives the real components and the real server actions
against `scripts/collab_fake_supabase.ts`, a fake that keeps its rows in the
browser and imitates 0105's rules (the rules themselves are tested on
PostgreSQL above). It covers: a board with the architecture sections, a card
that survives a reload, a drag between columns, free layout, undo; a canvas
with a sticky note, a rectangle and a connector, whose stored coordinates do
not move on zoom, fit or reload; a render uploaded and a pin placed at an
exact fraction; a client replying live with an @mention; a comment made into
an Agenda task, assigned, linked both ways and seen live in the other tabs; a
revision B uploaded with A kept; ready-for-review and approval by the client;
a stale save refused with the newer change kept; offline (said, never called
saved, resent on reconnect) and a failed save with Retry; a viewer with no
editing tools whose drags change nothing; an outsider getting not-found; and
a phone — comments as a sheet that can be lowered, nothing wider than the
screen, and a pinch that zooms without moving the object under it.

## What was not run here

- **A real Supabase project.** None is reachable from this container, so
  realtime between two real browsers, Supabase Storage uploads and signed
  URLs, and the server actions against a real PostgREST have not been run.
  The fake stands in for them in the browser check; the database rules are
  run for real in the SQL tests.
- **Migration 0105 has not been applied anywhere.** Until it is, the Studio
  page says the Studio is not installed and nothing else is affected.

## Known limits

- Studio levels govern the Studio's own tables. Agenda's own tables
  (drawings, tasks, approvals) keep Agenda's existing rules, under which any
  active project member may write them; a Studio viewer is not shown the
  controls, but Agenda's own pages are unchanged.
- Invitations reuse Agenda's existing invite-by-email and accept flow; there
  are no shareable invitation links, and nothing is open to visitors who are
  not signed in and on the project. A new member is a commenter until the
  owner gives them another level.
- On a phone the comment sheet covers the lower half of the screen; the
  drawing is not re-fitted into the upper half, but the sheet can be lowered
  to a handle.
