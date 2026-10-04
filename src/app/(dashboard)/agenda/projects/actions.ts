"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  isAgendaProjectStatus,
  isAgendaProjectType,
} from "@/lib/agenda/projects";
import { isPlausiblePlace } from "@/lib/location/places";
import { createClient } from "@/lib/supabase/server";

export type CreateProjectState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  erroredAt?: number;
};

/** Trimmed, capped, and null rather than empty — an empty string is not an answer. */
function text(value: FormDataEntryValue | null, max = 200): string | null {
  const trimmed = String(value ?? "").trim().slice(0, max);
  return trimmed || null;
}

/**
 * A date the browser sent, or null.
 *
 * `<input type="date">` posts an empty string when nothing was picked, and
 * `new Date("")` is Invalid Date — which PostgreSQL rejects with a message
 * about the input syntax for type date, several fields away from the one that
 * was blank.
 */
function date(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function money(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").replace(/[,\s]/g, "").trim();
  if (!raw) return null;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/**
 * Starts a construction project.
 *
 * The creator becomes an administrator of it, and that happens in the database
 * — `agenda_project_seed_owner` in 0089 — rather than here. Doing it in this
 * action would leave a project created any other way unreachable by the person
 * who made it, because the read policy asks whether you are a member and there
 * would be no members.
 */
export async function createAgendaProject(
  _prev: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session expired. Log in again.", erroredAt: Date.now() };
  }

  const name = text(formData.get("name"), 160);
  if (!name) {
    return {
      fieldErrors: { name: "Give the project a name." },
      error: "Nothing was saved — the project needs a name.",
      erroredAt: Date.now(),
    };
  }

  const type = formData.get("projectType");
  const status = formData.get("status");
  const location = text(formData.get("location"), 120);

  const { data, error } = await supabase
    .from("agenda_projects")
    .insert({
      owner_id: user.id,
      name,
      project_number: text(formData.get("projectNumber"), 40),
      // Checked against the lists rather than trusted. Both are enums in the
      // database and a bad value would be refused there too — but with an
      // error about an enum, which is not a sentence anybody should be shown.
      project_type: isAgendaProjectType(type) ? type : "residential",
      status: isAgendaProjectStatus(status) ? status : "planning",
      client_name: text(formData.get("clientName")),
      main_contractor: text(formData.get("mainContractor")),
      consultant: text(formData.get("consultant")),
      architect: text(formData.get("architect")),
      structural_engineer: text(formData.get("structuralEngineer")),
      mep_engineer: text(formData.get("mepEngineer")),
      // The same rule the profile's location uses: a place not on the list can
      // still be typed, but it has to look like a place name.
      location: location && isPlausiblePlace(location) ? location : null,
      start_date: date(formData.get("startDate")),
      target_completion_date: date(formData.get("targetDate")),
      contract_value: money(formData.get("contractValue")),
      currency: text(formData.get("currency"), 8) ?? "ETB",
      description: text(formData.get("description"), 2000),
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      error: error?.message ?? "Could not start that project.",
      erroredAt: Date.now(),
    };
  }

  revalidatePath("/agenda");
  revalidatePath("/agenda/projects");
  redirect(`/agenda/projects/${data.id}`);
}
