import type { Metadata } from "next";

import { SectionShell } from "@/components/agenda/shell/section-shell";
import { requireViewer } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Calendar · Agenda" };

export default async function AgendaCalendarPage() {
  await requireViewer("/agenda/calendar");

  return (
    <div className="mx-auto w-full max-w-4xl">
      <SectionShell
        title="Calendar"
        blurb="Deadlines, inspections, meetings and milestones from every project in one place."
        projectId="all-projects"
        section="calendar"
      />
    </div>
  );
}
