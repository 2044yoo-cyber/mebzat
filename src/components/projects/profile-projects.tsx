import { ProjectCard } from "@/components/projects/project-card";
import { createClient } from "@/lib/supabase/server";

/**
 * Somebody's finished work, on their profile.
 *
 * Headed "Completed Medosha projects" rather than "Projects": the number is
 * the point. It is the one thing on a profile that is neither self-reported
 * nor a rating — the person published the work here, under their name, and it
 * is still there to look at. A count of two reads differently from a count of
 * forty, and neither reads at all without the word "completed".
 */
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
      "id, title, cover_image_url, category, description, location_city, location_country, status",
      { count: "exact" },
    )
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(6);

  if (!includeDrafts) {
    query = query.eq("status", "published");
  }

  const { data: projects, count } = await query;

  if (!projects || projects.length === 0) {
    return null;
  }

  const total = count ?? projects.length;

  return (
    <section className="space-y-4">
      <h2 className="flex flex-wrap items-baseline gap-2 text-sm font-medium text-muted-foreground">
        Completed Medosha projects
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
          {total}
        </span>
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
      {total > projects.length && (
        <p className="text-xs text-muted-foreground">
          Showing {projects.length} of {total}.
        </p>
      )}
    </section>
  );
}
