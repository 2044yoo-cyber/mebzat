import type { Metadata } from "next";
import Link from "next/link";
import {
  ClipboardCheck, HardHat, ListChecks, MessageCircleQuestion, Plus,
  TriangleAlert,
} from "lucide-react";

import { ProjectCard } from "@/components/agenda/shell/project-card";
import { StatCard } from "@/components/agenda/shell/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { getAgendaHeadline, getAgendaProjects } from "@/lib/data/agenda-projects";
import { requireViewer } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Agenda" };

/**
 * Agenda's home screen.
 *
 * The brief asks what a project manager should understand within seconds of
 * opening it: what needs attention, what is late, what needs approval. So the
 * figures across the top are the things that *stop work* — questions waiting
 * for an answer, materials waiting for approval, snags still open — rather
 * than the things that flatter a dashboard.
 *
 * Everything here is scoped by row-level security rather than by a filter in
 * this file. A member of four jobs gets the totals for four jobs, and somebody
 * on none gets zeroes and an invitation to start one.
 */
export default async function AgendaPage() {
  await requireViewer("/agenda");

  const [projects, headline] = await Promise.all([
    getAgendaProjects(),
    getAgendaHeadline(),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground">
            Every job you are on, and what needs you today.
          </p>
        </div>
        <Link
          href="/agenda/projects/new"
          className={cn(buttonVariants(), "shrink-0")}
        >
          <Plus className="size-4" /> New project
        </Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Active projects"
          value={headline.activeProjects}
          icon={HardHat}
          href="/agenda/projects"
        />
        <StatCard
          label="Tasks due"
          value={headline.tasksDue}
          icon={ListChecks}
          href="/agenda/tasks"
        />
        <StatCard
          label="Overdue"
          value={headline.overdueTasks}
          icon={TriangleAlert}
          href="/agenda/tasks?filter=overdue"
          tone="attention"
        />
        <StatCard
          label="Open RFIs"
          value={headline.openRfis}
          icon={MessageCircleQuestion}
        />
        <StatCard
          label="Pending submittals"
          value={headline.pendingSubmittals}
          icon={ClipboardCheck}
        />
        <StatCard
          label="Open punch items"
          value={headline.openPunchItems}
          icon={ClipboardCheck}
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">Projects</h2>
          {projects.length > 0 && (
            <Link
              href="/agenda/projects"
              className="text-sm text-brand hover:underline"
            >
              See all
            </Link>
          )}
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
            <HardHat className="size-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">No projects yet</p>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                Start one and invite the team. Everything on site — drawings,
                daily logs, questions, snags and cost — is recorded against it.
              </p>
            </div>
            <Link href="/agenda/projects/new" className={buttonVariants()}>
              <Plus className="size-4" /> Start a project
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {projects.slice(0, 6).map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
