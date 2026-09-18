import type { Metadata } from "next";

import { SectionShell } from "@/components/agenda/shell/section-shell";
import { requireViewer } from "@/lib/auth/session";

export const metadata: Metadata = { title: "My Tasks · Agenda" };

export default async function AgendaTasksPage() {
  await requireViewer("/agenda/tasks");

  return (
    <div className="mx-auto w-full max-w-4xl">
      <SectionShell
        title="My Tasks"
        blurb="What is assigned to you, across every project you are on."
        projectId="all-projects"
        section="tasks"
      />
    </div>
  );
}
