import type { Metadata } from "next";
import Link from "next/link";
import { HardHat, Plus } from "lucide-react";

import { ProjectCard } from "@/components/agenda/shell/project-card";
import { ProjectFilter } from "@/components/agenda/shell/project-filter";
import { buttonVariants } from "@/components/ui/button";
import { isLiveProject, type AgendaProjectStatus } from "@/lib/agenda/projects";
import { getAgendaProjects } from "@/lib/data/agenda-projects";
import { requireViewer } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Projects · Agenda" };

/**
 * Every job the viewer is on.
 *
 * Filtered on the server from the query string rather than in the browser, so
 * a filtered list is a link somebody can send to the site engineer. The set of
 * filters and what "Active" means both come from `lib/agenda/projects`, which
 * is also what the dashboard's Active Projects figure counts — two definitions
 * of the same word is how the card and the list come to disagree.
 */
export default async function AgendaProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireViewer("/agenda/projects");

  const { status } = await searchParams;
  const all = await getAgendaProjects();

  const shown =
    !status || status === "all"
      ? all
      : status === "active"
        ? all.filter((project) => isLiveProject(project.status))
        : all.filter(
            (project) => project.status === (status as AgendaProjectStatus),
          );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {all.length === 1 ? "1 project" : `${all.length} projects`}
          </p>
        </div>
        <Link href="/agenda/projects/new" className={buttonVariants()}>
          <Plus className="size-4" /> New project
        </Link>
      </header>

      <ProjectFilter active={status ?? "all"} />

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <HardHat className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {all.length === 0
              ? "You are not on any project yet."
              : "No project in that state."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
