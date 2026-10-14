import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Plus, Shapes } from "lucide-react";

import { Empty } from "@/components/agenda/shared";
import { getAgendaProjects } from "@/lib/data/agenda-projects";
import { requireViewer } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Collaborate · Agenda" };

/**
 * Where the Collaborative Studio is opened from.
 *
 * A Studio is always a project's: its boards, canvas, drawings and discussion
 * belong to one Agenda project and its team. So the way in is the list of
 * projects the viewer is on, each opening its own Studio — there is no Studio
 * floating free of a project for anybody to stumble into.
 */
export default async function CollaboratePage() {
  await requireViewer("/agenda/collaborate");
  const projects = await getAgendaProjects();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Shapes className="size-5 text-brand" aria-hidden />
          Collaborative Studio
        </h1>
        <p className="text-sm text-muted-foreground">
          Visual boards, a shared canvas, drawing review and discussion — inside each project, with its team.
        </p>
      </header>

      {projects.length === 0 ? (
        <Empty>
          <span className="block">A Studio belongs to a project. Start one, then invite your team to it.</span>
          <Link href="/agenda/projects/new" className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-foreground">
            <Plus className="size-4" aria-hidden />New project
          </Link>
        </Empty>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/agenda/projects/${project.id}/collaborate`}
                className="flex min-h-16 items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-brand/50 hover:bg-muted/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{project.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[project.projectNumber, project.location].filter(Boolean).join(" · ") || "Open the Studio"}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
