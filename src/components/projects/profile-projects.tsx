import { ProjectCard } from "@/components/projects/project-card";
import { createClient } from "@/lib/supabase/server";

export async function ProfileProjects({
  ownerId,
  includeDrafts = false,
}: {
  ownerId: string;
  includeDrafts?: boolean;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("projects")
    .select(
      "id, title, cover_image_url, building_type, location_city, location_country, status",
    )
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(6);

  if (!includeDrafts) {
    query = query.eq("status", "published");
  }

  const { data: projects } = await query;

  if (!projects || projects.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium text-muted-foreground">Projects</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </section>
  );
}
