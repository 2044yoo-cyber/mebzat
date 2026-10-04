import "server-only";

import { createClient } from "@/lib/supabase/server";
import { AGENDA_FILES_BUCKET } from "@/lib/agenda/files";
import type { Discipline, ReviewStatus } from "@/lib/agenda/records";
import {
  parseFormFields,
  type FormField,
  type InspectionResult,
  type IssueStatus,
  type ObservationKind,
} from "@/lib/agenda/quality";
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
 * Signed URLs for a page of photos, keyed by storage path.
 *
 * The bucket is private, so there is no public URL to render — a site
 * photograph shows a client's building and its progress, and "unlisted URL" is
 * not a permission. One batched call rather than one per photo, and an hour of
 * validity, which outlasts reading a page and not a screenshot pasted into a
 * group chat.
 *
 * A path that cannot be signed is simply absent from the map. The caller draws
 * a placeholder for it: one unreadable object must not take the wall down.
 */
export async function signedPhotoUrls(
  paths: readonly string[],
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  if (paths.length === 0) return signed;

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(AGENDA_FILES_BUCKET)
    .createSignedUrls([...paths], 3600);

  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
  }
  return signed;
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

// ---------------------------------------------------------------------------
// Quality: inspections, observations, punch list
// ---------------------------------------------------------------------------

export type InspectionItem = {
  id: string;
  description: string;
  result: InspectionResult;
  comment: string | null;
  position: number;
};

export type Inspection = {
  id: string;
  number: string | null;
  title: string;
  discipline: Discipline | null;
  location: string | null;
  scheduledFor: string | null;
  inspectedAt: string | null;
  result: InspectionResult;
  notes: string | null;
  createdAt: string;
  inspector: Person | null;
  items: InspectionItem[];
};

type InspectionRow = {
  id: string;
  number: string | null;
  title: string;
  discipline: string | null;
  location: string | null;
  scheduled_for: string | null;
  inspected_at: string | null;
  result: string;
  notes: string | null;
  created_at: string;
  inspector: PersonRow | PersonRow[] | null;
  agenda_inspection_items:
    | {
        id: string;
        description: string;
        result: string;
        comment: string | null;
        position: number;
      }[]
    | null;
};

export async function getInspections(
  projectId: string,
): Promise<Inspection[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_inspections")
    .select(
      `id, number, title, discipline, location, scheduled_for, inspected_at,
       result, notes, created_at,
       inspector:profiles!agenda_inspections_inspector_id_fkey(${PERSON_COLUMNS}),
       agenda_inspection_items(id, description, result, comment, position)`,
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(PAGE);

  if (!data) return [];

  return (data as unknown as InspectionRow[]).map((row) => ({
    id: row.id,
    number: row.number,
    title: row.title,
    discipline: row.discipline as Discipline | null,
    location: row.location,
    scheduledFor: row.scheduled_for,
    inspectedAt: row.inspected_at,
    result: row.result as InspectionResult,
    notes: row.notes,
    createdAt: row.created_at,
    inspector: toPerson(one(row.inspector)),
    items: (row.agenda_inspection_items ?? [])
      .map((item) => ({
        id: item.id,
        description: item.description,
        result: item.result as InspectionResult,
        comment: item.comment,
        position: item.position,
      }))
      // A checklist is walked in the order it was written, not the order the
      // database happened to return.
      .sort((a, b) => a.position - b.position),
  }));
}

export type Observation = {
  id: string;
  kind: ObservationKind;
  description: string;
  location: string | null;
  responsibleCompany: string | null;
  dueDate: string | null;
  status: IssueStatus;
  inspectionItemId: string | null;
  createdAt: string;
  assignedTo: Person | null;
  createdBy: Person | null;
};

type ObservationRow = {
  id: string;
  kind: string;
  description: string;
  location: string | null;
  responsible_company: string | null;
  due_date: string | null;
  status: string;
  inspection_item_id: string | null;
  created_at: string;
  assignee: PersonRow | PersonRow[] | null;
  author: PersonRow | PersonRow[] | null;
};

export async function getObservations(
  projectId: string,
): Promise<Observation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_observations")
    .select(
      `id, kind, description, location, responsible_company, due_date, status,
       inspection_item_id, created_at,
       assignee:profiles!agenda_observations_assigned_to_fkey(${PERSON_COLUMNS}),
       author:profiles!agenda_observations_created_by_fkey(${PERSON_COLUMNS})`,
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(PAGE);

  if (!data) return [];

  return (data as unknown as ObservationRow[]).map((row) => ({
    id: row.id,
    kind: row.kind as ObservationKind,
    description: row.description,
    location: row.location,
    responsibleCompany: row.responsible_company,
    dueDate: row.due_date,
    status: row.status as IssueStatus,
    inspectionItemId: row.inspection_item_id,
    createdAt: row.created_at,
    assignedTo: toPerson(one(row.assignee)),
    createdBy: toPerson(one(row.author)),
  }));
}

export type PunchItem = {
  id: string;
  number: string | null;
  description: string;
  location: string | null;
  assignedCompany: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  status: IssueStatus;
  observationId: string | null;
  createdAt: string;
  assignedTo: Person | null;
};

type PunchRow = {
  id: string;
  number: string | null;
  description: string;
  location: string | null;
  assigned_company: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  observation_id: string | null;
  created_at: string;
  assignee: PersonRow | PersonRow[] | null;
};

export async function getPunchItems(projectId: string): Promise<PunchItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_punch_items")
    .select(
      `id, number, description, location, assigned_company, due_date, priority,
       status, observation_id, created_at,
       assignee:profiles!agenda_punch_items_assigned_to_fkey(${PERSON_COLUMNS})`,
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(PAGE);

  if (!data) return [];

  return (data as unknown as PunchRow[]).map((row) => ({
    id: row.id,
    number: row.number,
    description: row.description,
    location: row.location,
    assignedCompany: row.assigned_company,
    dueDate: row.due_date,
    priority: row.priority as TaskPriority,
    status: row.status as IssueStatus,
    observationId: row.observation_id,
    createdAt: row.created_at,
    assignedTo: toPerson(one(row.assignee)),
  }));
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export type FormTemplate = {
  id: string;
  name: string;
  description: string | null;
  fields: FormField[];
  /** Null when it is a template the owner reuses across their projects. */
  projectId: string | null;
};

export type FormSubmission = {
  id: string;
  templateId: string;
  templateName: string | null;
  number: string | null;
  answers: Record<string, unknown>;
  status: ReviewStatus;
  submittedAt: string | null;
  createdAt: string;
  submittedBy: Person | null;
};

/**
 * The templates available on this project: its own, and the ones the viewer
 * reuses across projects.
 *
 * Two conditions in one `or`, because the policy in 0091 allows both and a
 * query that asked only for `project_id = x` would hide the reusable ones the
 * policy was written to let through.
 */
export async function getFormTemplates(
  projectId: string,
): Promise<FormTemplate[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_form_templates")
    .select("id, name, description, fields, project_id")
    .or(`project_id.eq.${projectId},project_id.is.null`)
    .is("archived_at", null)
    .order("name", { ascending: true })
    .limit(100);

  if (!data) return [];

  return (
    data as unknown as {
      id: string;
      name: string;
      description: string | null;
      fields: unknown;
      project_id: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    fields: parseFormFields(row.fields),
    projectId: row.project_id,
  }));
}

export async function getFormSubmissions(
  projectId: string,
): Promise<FormSubmission[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_form_submissions")
    .select(
      `id, template_id, number, answers, status, submitted_at, created_at,
       template:agenda_form_templates!agenda_form_submissions_template_id_fkey(name),
       submitter:profiles!agenda_form_submissions_submitted_by_fkey(${PERSON_COLUMNS})`,
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(PAGE);

  if (!data) return [];

  return (
    data as unknown as {
      id: string;
      template_id: string;
      number: string | null;
      answers: unknown;
      status: string;
      submitted_at: string | null;
      created_at: string;
      template: { name: string } | { name: string }[] | null;
      submitter: PersonRow | PersonRow[] | null;
    }[]
  ).map((row) => ({
    id: row.id,
    templateId: row.template_id,
    templateName: one(row.template)?.name ?? null,
    number: row.number,
    answers:
      typeof row.answers === "object" && row.answers !== null
        ? (row.answers as Record<string, unknown>)
        : {},
    status: row.status as ReviewStatus,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    submittedBy: toPerson(one(row.submitter)),
  }));
}

// ---------------------------------------------------------------------------
// 360 progress
// ---------------------------------------------------------------------------

export type ProgressPanorama = {
  id: string;
  caption: string | null;
  building: string | null;
  floor: string | null;
  area: string | null;
  takenAt: string;
  jobId: string;
  /** The published equirectangular image, or null while it is still stitching. */
  panoramaUrl: string | null;
  width: number | null;
  height: number | null;
};

/**
 * The project's progress panoramas, newest first.
 *
 * `agenda_photos` rows that point at a `panorama_jobs` row rather than at a
 * file of their own — see 0095. The image is read through the join rather than
 * copied, so a re-stitch that fixes a seam fixes the site record too.
 */
export async function getProgressPanoramas(
  projectId: string,
): Promise<ProgressPanorama[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_photos")
    .select(
      `id, caption, building, floor, area, taken_at, panorama_job_id,
       job:panorama_jobs!agenda_photos_panorama_job_id_fkey(panorama_url, width, height)`,
    )
    .eq("project_id", projectId)
    .not("panorama_job_id", "is", null)
    .order("taken_at", { ascending: false })
    .limit(PAGE);

  if (!data) return [];

  return (
    data as unknown as {
      id: string;
      caption: string | null;
      building: string | null;
      floor: string | null;
      area: string | null;
      taken_at: string;
      panorama_job_id: string;
      job:
        | { panorama_url: string | null; width: number | null; height: number | null }
        | { panorama_url: string | null; width: number | null; height: number | null }[]
        | null;
    }[]
  ).map((row) => {
    const job = one(row.job);
    return {
      id: row.id,
      caption: row.caption,
      building: row.building,
      floor: row.floor,
      area: row.area,
      takenAt: row.taken_at,
      jobId: row.panorama_job_id,
      panoramaUrl: job?.panorama_url ?? null,
      width: job?.width ?? null,
      height: job?.height ?? null,
    };
  });
}

export type FinishedPanorama = {
  id: string;
  panoramaUrl: string;
  createdAt: string;
};

/**
 * The viewer's own finished panoramas, for the "pin one to this project"
 * picker.
 *
 * Scoped to `ready` rather than to everything: a job still stitching has no
 * image, and offering it would put a broken tile on the wall. The policy in
 * 0081 already limits this to the caller's own jobs.
 */
export async function getFinishedPanoramas(): Promise<FinishedPanorama[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("panorama_jobs")
    .select("id, panorama_url, created_at")
    .eq("status", "ready")
    .not("panorama_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(60);

  if (!data) return [];

  return (
    data as unknown as {
      id: string;
      panorama_url: string | null;
      created_at: string;
    }[]
  )
    .filter((row): row is { id: string; panorama_url: string; created_at: string } =>
      Boolean(row.panorama_url),
    )
    .map((row) => ({
      id: row.id,
      panoramaUrl: row.panorama_url,
      createdAt: row.created_at,
    }));
}

// ---------------------------------------------------------------------------
// Drawings and documents
// ---------------------------------------------------------------------------

export type DrawingRevision = {
  id: string;
  revision: string;
  storagePath: string;
  fileName: string | null;
  issuedOn: string | null;
  status: ReviewStatus;
  notes: string | null;
  createdAt: string;
  uploadedBy: Person | null;
};

export type Drawing = {
  id: string;
  drawingNumber: string;
  title: string;
  discipline: Discipline;
  currentRevisionId: string | null;
  revisions: DrawingRevision[];
};

/**
 * The drawing register, with every revision of every sheet.
 *
 * A drawing is not a file, it is a series of files with one of them current —
 * 0090's own words. The whole series comes back because "what did the
 * contractor build to in March" is the question a dispute turns on, and it
 * cannot be answered from the current sheet alone.
 */
export async function getDrawings(projectId: string): Promise<Drawing[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_drawings")
    .select(
      `id, drawing_number, title, discipline, current_revision_id,
       agenda_drawing_revisions(id, revision, storage_path, file_name, issued_on,
         status, notes, created_at,
         uploader:profiles!agenda_drawing_revisions_uploaded_by_fkey(${PERSON_COLUMNS}))`,
    )
    .eq("project_id", projectId)
    .is("archived_at", null)
    .order("drawing_number", { ascending: true })
    .limit(PAGE);

  if (!data) return [];

  return (
    data as unknown as {
      id: string;
      drawing_number: string;
      title: string;
      discipline: string;
      current_revision_id: string | null;
      agenda_drawing_revisions:
        | (Record<string, string | null> & {
            uploader: PersonRow | PersonRow[] | null;
          })[]
        | null;
    }[]
  ).map((row) => ({
    id: row.id,
    drawingNumber: row.drawing_number,
    title: row.title,
    discipline: row.discipline as Discipline,
    currentRevisionId: row.current_revision_id,
    revisions: (row.agenda_drawing_revisions ?? [])
      .map((revision) => ({
        id: String(revision.id),
        revision: String(revision.revision),
        storagePath: String(revision.storage_path),
        fileName: revision.file_name === null ? null : String(revision.file_name),
        issuedOn: revision.issued_on === null ? null : String(revision.issued_on),
        status: revision.status as ReviewStatus,
        notes: revision.notes === null ? null : String(revision.notes),
        createdAt: String(revision.created_at),
        uploadedBy: toPerson(one(revision.uploader)),
      }))
      // Newest issued first. The revision label is free text — "Rev 01",
      // "Rev A", "P2" are all real — so it cannot be sorted on, and the date
      // it was issued is what "newest" actually means.
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
  }));
}

export type DocumentVersion = {
  id: string;
  version: number;
  storagePath: string;
  fileName: string | null;
  notes: string | null;
  createdAt: string;
  uploadedBy: Person | null;
};

export type ProjectDocument = {
  id: string;
  title: string;
  kind: string;
  tags: string[];
  confidentiality: "members" | "finance" | "meetings";
  currentVersionId: string | null;
  versions: DocumentVersion[];
};

/**
 * The documents the viewer may read.
 *
 * 0090 replaced the read policy on this table rather than adding one, so a
 * document filed as `finance` or `meetings` is gated a second time on the
 * matching permission. A document missing from this list is a document the
 * reader is not entitled to, and that is the correct answer rather than an
 * error.
 */
export async function getDocuments(
  projectId: string,
): Promise<ProjectDocument[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agenda_documents")
    .select(
      `id, title, kind, tags, confidentiality, current_version_id,
       agenda_document_versions(id, version, storage_path, file_name, notes,
         created_at,
         uploader:profiles!agenda_document_versions_uploaded_by_fkey(${PERSON_COLUMNS}))`,
    )
    .eq("project_id", projectId)
    .is("archived_at", null)
    .order("title", { ascending: true })
    .limit(PAGE);

  if (!data) return [];

  return (
    data as unknown as {
      id: string;
      title: string;
      kind: string;
      tags: string[] | null;
      confidentiality: string;
      current_version_id: string | null;
      agenda_document_versions:
        | (Record<string, string | number | null> & {
            uploader: PersonRow | PersonRow[] | null;
          })[]
        | null;
    }[]
  ).map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    tags: row.tags ?? [],
    confidentiality: row.confidentiality as "members" | "finance" | "meetings",
    currentVersionId: row.current_version_id,
    versions: (row.agenda_document_versions ?? [])
      .map((version) => ({
        id: String(version.id),
        version: Number(version.version),
        storagePath: String(version.storage_path),
        fileName: version.file_name === null ? null : String(version.file_name),
        notes: version.notes === null ? null : String(version.notes),
        createdAt: String(version.created_at),
        uploadedBy: toPerson(one(version.uploader)),
      }))
      .sort((a, b) => b.version - a.version),
  }));
}

/**
 * Signed URLs for files in the project's store, keyed by path.
 *
 * The same batched signing the photo wall uses, named for what it is: a
 * drawing and a contract are downloaded rather than rendered, but they live in
 * the same private bucket and need the same short-lived link.
 */
export async function signedFileUrls(
  paths: readonly string[],
): Promise<Map<string, string>> {
  return signedPhotoUrls(paths);
}
