import type { Metadata } from "next";

import { NewProjectForm } from "@/components/agenda/shell/new-project-form";
import { requireViewer } from "@/lib/auth/session";

export const metadata: Metadata = { title: "New project · Agenda" };

export default async function NewAgendaProjectPage() {
  await requireViewer("/agenda/projects/new");

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">New project</h1>
        <p className="text-sm text-muted-foreground">
          Only the name is needed to start. Everything else can be filled in as
          the job takes shape.
        </p>
      </header>
      <NewProjectForm />
    </div>
  );
}
