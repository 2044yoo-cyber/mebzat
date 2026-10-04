import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { StatusChip } from "@/components/agenda/shell/status-chip";
import { WorkspaceNav } from "@/components/agenda/shell/workspace-nav";
import { AGENDA_PROJECT_STATUSES } from "@/lib/agenda/projects";
import { getAgendaProject } from "@/lib/data/agenda-projects";
import { requireViewer } from "@/lib/auth/session";

/**
 * The project workspace.
 *
 * A layout rather than a component each page renders, so the header and the
 * section navigation survive navigation between sections — the sidebar does
 * not flash and scroll position is kept, which on a thirty-item list matters.
 *
 * The project is fetched once here. Every child page gets it from its own
 * query rather than through props, because a layout cannot pass data to a page
 * in the App Router — but the fetch is cached per request, so this costs one
 * round trip rather than two.
 */
export default async function ProjectWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireViewer(`/agenda/projects/${projectId}`);

  const project = await getAgendaProject(projectId);
  // Row-level security hides projects the viewer is not on, so "no row" and
  // "no access" arrive the same way. Both are a not-found: telling somebody a
  // project exists but is not theirs is a leak dressed as a helpful message.
  if (!project) notFound();

  const status = AGENDA_PROJECT_STATUSES.find((s) => s.value === project.status);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          href="/agenda/projects"
          aria-label="Back to projects"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {project.name}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {[project.projectNumber, project.location]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <StatusChip
          label={status?.label ?? project.status}
          tone={status?.tone ?? "neutral"}
        />
      </header>

      <div className="grid min-h-0 overflow-hidden rounded-2xl border bg-card lg:grid-cols-[15rem_1fr]">
        <WorkspaceNav projectId={projectId} />
        {/* `min-w-0` because a grid item is sized by its content by default,
            so one wide table or one long unbroken word made the column wider
            than the phone and the text ran off the right-hand edge with the
            card clipped around it. With it the column is the screen, and
            anything genuinely too wide scrolls inside the card. */}
        <div className="min-h-0 min-w-0 overflow-x-auto overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </div>
  );
}
