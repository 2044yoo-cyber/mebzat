"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import { projectSchema, type ProjectFormValues } from "@/lib/validations/project";
import type { BuildingType, ProjectStatus } from "@/types/database.types";

export type ProjectFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function parseImageUrls(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((u): u is string => typeof u === "string");
    }
  } catch {
    // ignore malformed payloads; treated as no images
  }
  return [];
}

function buildValues(formData: FormData) {
  return projectSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    locationCity: formData.get("locationCity"),
    locationCountry: formData.get("locationCountry"),
    buildingType: formData.get("buildingType"),
    style: formData.get("style"),
    bedrooms: formData.get("bedrooms") || undefined,
    floors: formData.get("floors") || undefined,
    budget: formData.get("budget") || undefined,
    budgetCurrency: formData.get("budgetCurrency"),
    materials: formData.get("materials"),
    completionDate: formData.get("completionDate"),
    client: formData.get("client"),
    status: formData.get("status"),
  });
}

function collectFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    fieldErrors[String(issue.path[0])] = issue.message;
  }
  return fieldErrors;
}

type ProjectColumns = {
  title: string;
  description: string | null;
  location_city: string | null;
  location_country: string | null;
  building_type: BuildingType | null;
  style: string | null;
  bedrooms: number | null;
  floors: number | null;
  budget: number | null;
  budget_currency: string;
  materials: string[];
  completion_date: string | null;
  client: string | null;
  status: ProjectStatus;
};

function toColumns(data: ProjectFormValues): ProjectColumns {
  return {
    title: data.title,
    description: data.description || null,
    location_city: data.locationCity || null,
    location_country: data.locationCountry || null,
    building_type: (data.buildingType || null) as BuildingType | null,
    style: data.style || null,
    bedrooms: data.bedrooms ?? null,
    floors: data.floors ?? null,
    budget: data.budget ?? null,
    budget_currency: data.budgetCurrency || "USD",
    materials: data.materials
      ? data.materials.split(",").map((m) => m.trim()).filter(Boolean)
      : [],
    completion_date: data.completionDate || null,
    client: data.client || null,
    status: data.status as ProjectStatus,
  };
}

export async function createProject(
  _prevState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const parsed = buildValues(formData);
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your session expired. Log in again." };
  }

  const columns = toColumns(parsed.data);
  const images = parseImageUrls(formData.get("images"));
  const baseSlug = slugify(columns.title) || "project";

  let projectId: string | null = null;
  for (let attempt = 0; attempt < 2 && !projectId; attempt++) {
    const slug =
      attempt === 0
        ? baseSlug
        : `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;

    const { data, error } = await supabase
      .from("projects")
      .insert({
        ...columns,
        owner_id: user.id,
        slug,
        cover_image_url: images[0] ?? null,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") continue; // slug clash, retry with suffix
      return { error: error.message };
    }
    projectId = data.id;
  }

  if (!projectId) {
    return { error: "Could not save project. Try a different title." };
  }

  if (images.length > 0) {
    const { error: imageError } = await supabase.from("project_images").insert(
      images.map((url, position) => ({
        project_id: projectId!,
        url,
        position,
      })),
    );
    if (imageError) {
      return { error: imageError.message };
    }
  }

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  redirect(`/projects/${projectId}`);
}

export async function updateProject(
  projectId: string,
  _prevState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const parsed = buildValues(formData);
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your session expired. Log in again." };
  }

  const columns = toColumns(parsed.data);
  const images = parseImageUrls(formData.get("images"));

  const { error } = await supabase
    .from("projects")
    .update({ ...columns, cover_image_url: images[0] ?? null })
    .eq("id", projectId)
    .eq("owner_id", user.id);

  if (error) {
    return { error: error.message };
  }

  // Replace the image set: RLS restricts these rows to the owner's projects.
  await supabase.from("project_images").delete().eq("project_id", projectId);
  if (images.length > 0) {
    await supabase.from("project_images").insert(
      images.map((url, position) => ({
        project_id: projectId,
        url,
        position,
      })),
    );
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  redirect(`/projects/${projectId}`);
}

export async function deleteProject(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("owner_id", user.id);

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  redirect("/projects");
}
