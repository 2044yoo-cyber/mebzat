import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Discipline, ReviewStatus } from "@/lib/agenda/records";
import type { TaskPriority, TaskStatus } from "@/lib/agenda/constants";

/**
 * Reads for the site record: RFIs, submittals, the programme, site photos.
 *
 * As in `agenda-projects`, nothing here filters by membership. The policies in
 * 0090 do it — every one of these tables is gated on `agenda_is_member` — and
 * a second check in TypeScript would be a second place for the rule to be
 * wrong, with the copy being the one that drifts. An empty list is the correct
 * answer to give somebody who is not on the project.
 *
 * Each list is capped. A programme with eight hundred activities is a real
 * thing and rendering all of them into one server response is not; the cap is
 * generous enough that no ordinary project meets it and low enough that a
 * pathological one does not take the page down.
 */

const PAGE = 300;

/** The author of a record, as much of them as a list needs. */
export type Person = {
  id: string;
  fullName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

type PersonRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

const PERSON_COLUMNS = "id, full_name, username, avatar_url";

function toPerson(row: PersonRow | null): Person | null {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    avatarUrl: row.avatar_url,
  };
}

/**
 * Supabase types an embedded one-to-one relationship as an array when it
 * cannot prove the foreign key is unique. It is one row either way, and
 * unwrapping it here keeps the `Array.isArray` dance out of every mapper.
 */
function one<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

// ---------------------------------------------------------------------------
// RFIs
// ---------------------------------------------------------------------------

export type RfiResponse = {
  id: string;
  body: string;
  isOfficial: boolean;
  createdAt: string;
  author: Person | null;
};

export type Rfi = {
  id: string;
  number: string;
  subject: string;
  question: string;
  discipline: Discipline | null;
  location: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  status: ReviewStatus;
  answeredAt: string | null;
  closedAt: string | null;
  createdAt: string;
  createdBy: Person | null;
  requestedFrom: Person | null;
  responses: RfiResponse[];
};

type RfiRow = {
  id: string;
  number: string;
  subject: string;
  question: string;
  discipline: string | null;
  location: string | null;
  priority: string;
  due_date: string | null;
  status: string;
  answered_at: string | null;
  closed_at: string | null;
  created_at: string;
  created_by_profile: PersonRow | PersonRow[] | null;
  requested_from_profile: PersonRow | PersonRow[] | null;
  agenda_rfi_responses:
    | {
        id: string;
        body: string;
        is_official: boolean;
        created_at: string;
        author: PersonRow | PersonRow[] | null;
      }[]
    | null;
};

/**
 * Every RFI on the project, newest first, with its answers.
 *
 * The responses come back in the same round trip rather than one query per
 * RFI: a register of forty questions would otherwise be forty-one queries, and
 * the thread is what makes an RFI list worth reading.
 */
export async function getRfis(projectId: string): Promise<Rfi[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_rfis")
    .select(
      `id, number, subject, question, discipline, location, priority, due_date,
       status, answered_at, closed_at, created_at,
       created_by_profile:profiles!agenda_rfis_created_by_fkey(${PERSON_COLUMNS}),
       requested_from_profile:profiles!agenda_rfis_requested_from_fkey(${PERSON_COLUMNS}),
       agenda_rfi_responses(id, body, is_official, created_at,
         author:profiles!agenda_rfi_responses_author_id_fkey(${PERSON_COLUMNS}))`,
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(PAGE);

  if (!data) return [];

  return (data as unknown as RfiRow[]).map((row) => ({
    id: row.id,
    number: row.number,
    subject: row.subject,
    question: row.question,
    discipline: row.discipline as Discipline | null,
    location: row.location,
    priority: row.priority as TaskPriority,
    dueDate: row.due_date,
    status: row.status as ReviewStatus,
    answeredAt: row.answered_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    createdBy: toPerson(one(row.created_by_profile)),
    requestedFrom: toPerson(one(row.requested_from_profile)),
    responses: (row.agenda_rfi_responses ?? [])
      .map((response) => ({
        id: response.id,
        body: response.body,
        isOfficial: response.is_official,
        createdAt: response.created_at,
        author: toPerson(one(response.author)),
      }))
      // Oldest first inside a thread: a conversation reads downwards, even
      // though the register it sits in reads newest first.
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
  }));
}

// ---------------------------------------------------------------------------
// Submittals
// ---------------------------------------------------------------------------

export type SubmittalRevision = {
  id: string;
  revision: number;
  status: ReviewStatus;
  reviewerComment: string | null;
  reviewedAt: string | null;
  createdAt: string;
  reviewedBy: Person | null;
};

export type Submittal = {
  id: string;
  number: string;
  title: string;
  specSection: string | null;
  discipline: Discipline | null;
  contractor: string | null;
  submittedOn: string | null;
  requiredBy: string | null;
  status: ReviewStatus;
  currentRevisionId: string | null;
  createdAt: string;
  reviewer: Person | null;
  revisions: SubmittalRevision[];
};

type SubmittalRow = {
  id: string;
  number: string;
  title: string;
  spec_section: string | null;
  discipline: string | null;
  contractor: string | null;
  submitted_on: string | null;
  required_by: string | null;
  status: string;
  current_revision_id: string | null;
  created_at: string;
  reviewer: PersonRow | PersonRow[] | null;
  agenda_submittal_revisions:
    | {
        id: string;
        revision: number;
        status: string;
        reviewer_comment: string | null;
        reviewed_at: string | null;
        created_at: string;
        reviewed_by_profile: PersonRow | PersonRow[] | null;
      }[]
    | null;
};

export async function getSubmittals(projectId: string): Promise<Submittal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_submittals")
    .select(
      `id, number, title, spec_section, discipline, contractor, submitted_on,
       required_by, status, current_revision_id, created_at,
       reviewer:profiles!agenda_submittals_reviewer_id_fkey(${PERSON_COLUMNS}),
       agenda_submittal_revisions(id, revision, status, reviewer_comment,
         reviewed_at, created_at,
         reviewed_by_profile:profiles!agenda_submittal_revisions_reviewed_by_fkey(${PERSON_COLUMNS}))`,
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(PAGE);

  if (!data) return [];

  return (data as unknown as SubmittalRow[]).map((row) => ({
    id: row.id,
    number: row.number,
    title: row.title,
    specSection: row.spec_section,
    discipline: row.discipline as Discipline | null,
    contractor: row.contractor,
    submittedOn: row.submitted_on,
    requiredBy: row.required_by,
    status: row.status as ReviewStatus,
    currentRevisionId: row.current_revision_id,
    createdAt: row.created_at,
    reviewer: toPerson(one(row.reviewer)),
    revisions: (row.agenda_submittal_revisions ?? [])
      .map((revision) => ({
        id: revision.id,
        revision: revision.revision,
        status: revision.status as ReviewStatus,
        reviewerComment: revision.reviewer_comment,
        reviewedAt: revision.reviewed_at,
        createdAt: revision.created_at,
        reviewedBy: toPerson(one(revision.reviewed_by_profile)),
      }))
      // Newest revision first: "what is with the consultant now" is the
      // question a submittal register is opened to answer.
      .sort((a, b) => b.revision - a.revision),
  }));
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export type ScheduleItem = {
  id: string;
  parentId: string | null;
  name: string;
  startDate: string | null;
  finishDate: string | null;
  durationDays: number | null;
  progressPercent: number;
  isMilestone: boolean;
  isCritical: boolean;
  priority: TaskPriority;
  status: TaskStatus;
  position: number;
  assignedTo: Person | null;
};

type ScheduleRow = {
  id: string;
  parent_id: string | null;
  name: string;
  start_date: string | null;
  finish_date: string | null;
  duration_days: number | null;
  progress_percent: number;
  is_milestone: boolean;
  is_critical: boolean;
  priority: string;
  status: string;
  position: number;
  assignee: PersonRow | PersonRow[] | null;
};

/**
 * The programme, flat and in planner's order.
 *
 * Flat rather than nested: the tree is built by `buildScheduleTree`, which is
 * pure and therefore testable, and a recursive query here would put the same
 * logic somewhere no check can reach it.
 */
export async function getScheduleItems(
  projectId: string,
): Promise<ScheduleItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_schedule_items")
    .select(
      `id, parent_id, name, start_date, finish_date, duration_days,
       progress_percent, is_milestone, is_critical, priority, status, position,
       assignee:profiles!agenda_schedule_items_assigned_to_fkey(${PERSON_COLUMNS})`,
    )
    .eq("project_id", projectId)
    .order("position", { ascending: true })
    .limit(PAGE);

  if (!data) return [];

  return (data as unknown as ScheduleRow[]).map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    startDate: row.start_date,
    finishDate: row.finish_date,
    durationDays: row.duration_days,
    progressPercent: row.progress_percent,
    isMilestone: row.is_milestone,
    isCritical: row.is_critical,
    priority: row.priority as TaskPriority,
    status: row.status as TaskStatus,
    position: row.position,
    assignedTo: toPerson(one(row.assignee)),
  }));
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export type SitePhoto = {
  id: string;
  storagePath: string;
  caption: string | null;
  building: string | null;
  floor: string | null;
  area: string | null;
  takenAt: string;
  tags: string[];
  panoramaJobId: string | null;
  uploadedBy: Person | null;
};

type PhotoRow = {
  id: string;
  storage_path: string;
  caption: string | null;
  building: string | null;
  floor: string | null;
  area: string | null;
  taken_at: string;
  tags: string[] | null;
  panorama_job_id: string | null;
  uploader: PersonRow | PersonRow[] | null;
};

export async function getSitePhotos(projectId: string): Promise<SitePhoto[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_photos")
    .select(
      `id, storage_path, caption, building, floor, area, taken_at, tags,
       panorama_job_id,
       uploader:profiles!agenda_photos_uploaded_by_fkey(${PERSON_COLUMNS})`,
    )
    .eq("project_id", projectId)
    .order("taken_at", { ascending: false })
    .limit(PAGE);

  if (!data) return [];

  return (data as unknown as PhotoRow[]).map((row) => ({
    id: row.id,
    storagePath: row.storage_path,
    caption: row.caption,
    building: row.building,
    floor: row.floor,
    area: row.area,
    takenAt: row.taken_at,
    tags: row.tags ?? [],
    panoramaJobId: row.panorama_job_id,
    uploadedBy: toPerson(one(row.uploader)),
  }));
}

/**
 * The people on the project, for the "who is this for" pickers.
 *
 * An RFI is asked *of* somebody, and a submittal is reviewed *by* somebody;
 * both need the roster and neither needs anything else from it.
 */
export async function getProjectPeople(projectId: string): Promise<Person[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_members")
    .select(`user_id, profiles!agenda_members_user_id_fkey(${PERSON_COLUMNS})`)
    .eq("project_id", projectId)
    .eq("status", "active")
    .limit(200);

  if (!data) return [];

  return (data as unknown as { profiles: PersonRow | PersonRow[] | null }[])
    .map((row) => toPerson(one(row.profiles)))
    .filter((person): person is Person => person !== null)
    .sort((a, b) =>
      (a.fullName ?? a.username ?? "").localeCompare(
        b.fullName ?? b.username ?? "",
      ),
    );
}
