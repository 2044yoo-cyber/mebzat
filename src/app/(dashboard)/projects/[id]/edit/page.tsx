import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ProjectForm } from "@/components/projects/project-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit Project" };

export default async function EditProjectPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (!project) {
    notFound();
  }

  if (project.owner_id !== user.id) {
    redirect(`/projects/${id}`);
  }

  const { data: images } = await supabase
    .from("project_images")
    .select("url")
    .eq("project_id", id)
    .order("position", { ascending: true });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit project</h1>
        <p className="text-muted-foreground">Update this project&apos;s details.</p>
      </div>
      <ProjectForm
        userId={user.id}
        project={project}
        initialImageUrls={(images ?? []).map((i) => i.url)}
      />
    </div>
  );
}
