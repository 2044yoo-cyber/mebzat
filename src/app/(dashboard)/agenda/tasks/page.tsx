import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ListChecks } from "lucide-react";

import { Empty, when } from "@/components/agenda/shared";
import { StatusChip } from "@/components/agenda/shell/status-chip";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/agenda/constants";
import { getMyTasks } from "@/lib/data/agenda-projects";
import { requireViewer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My Tasks · Agenda" };

/**
 * What is assigned to me, across every project.
 *
 * Soonest due at the top, undated at the bottom. An undated task has no
 * deadline to have missed, and putting it above the work that is actually late
 * pushes the late work off the screen.
 */
export default async function AgendaTasksPage() {
  await requireViewer("/agenda/tasks");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/agenda/tasks");

  const tasks = await getMyTasks(user.id);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">My tasks</h1>
        <p className="text-sm text-muted-foreground">
          {tasks.length === 0
            ? "Nothing is assigned to you."
            : `${tasks.length} open across your projects.`}
        </p>
      </header>

      {tasks.length === 0 ? (
        <Empty>
          Nothing is assigned to you on any project you are on.
        </Empty>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => {
            const late = task.dueAt !== null && task.dueAt.slice(0, 10) < today;
            const status = TASK_STATUSES.find((s) => s.value === task.status);
            const priority = TASK_PRIORITIES.find(
              (p) => p.value === task.priority,
            );

            return (
              <li key={task.id}>
                <Link
                  href={`/agenda/projects/${task.projectId}/tasks`}
                  className="flex items-start gap-3 rounded-2xl border p-4 transition-colors hover:bg-muted"
                >
                  <ListChecks className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className={cn("text-sm font-medium", priority?.tone)}>
                      {task.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        task.projectName,
                        task.dueAt ? `due ${when(task.dueAt)}` : "no date",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusChip
                      label={status?.label ?? task.status}
                      tone={
                        status?.tone === "done"
                          ? "success"
                          : status?.tone === "warn"
                            ? "warning"
                            : status?.tone === "active"
                              ? "active"
                              : "neutral"
                      }
                    />
                    {late && (
                      <span className="text-xs text-destructive">Overdue</span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
