import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderKanban, Plus } from "lucide-react";

import { ProjectCard } from "@/components/projects/project-card";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My Projects" };

export default async function ProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: projects } = await supabase
    .from("projects")
    .select(
      "id, title, cover_image_url, building_type, location_city, location_country, status",
    )
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            My projects
          </h1>
          <p className="text-muted-foreground">
            Your portfolio of published and draft projects.
          </p>
        </div>
        <Link href="/projects/new" className={buttonVariants()}>
          <Plus className="size-4" /> New project
        </Link>
      </div>

      {projects && projects.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-16 text-center">
          <FolderKanban className="size-8 text-muted-foreground" />
          <p className="font-medium">No projects yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Showcase your work by publishing your first project with photos
            and details.
          </p>
          <Link
            href="/projects/new"
            className={buttonVariants({ variant: "outline" })}
          >
            <Plus className="size-4" /> Create your first project
          </Link>
        </div>
      )}
    </div>
  );
}
