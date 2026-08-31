import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";

import { AgendaWorkspace } from "@/components/agenda/agenda-workspace";
import { AcceptInvite } from "@/components/agenda/accept-invite";
import { AgendaUnavailable } from "@/components/agenda/agenda-unavailable";
import {
  agendaAccess,
  agendaDecisions,
  agendaHistory,
  agendaLedger,
  agendaLogs,
  agendaMeetings,
  agendaMembers,
  agendaReminders,
  agendaTasks,
  agendaTimeline,
} from "@/lib/data/agenda";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Agenda",
  // A private record should not be indexed, summarised or cached by anything.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * A project's private Agenda.
 *
 * The project itself is public; this is not. A non-member gets `notFound()`
 * rather than a "you do not have access" page, because the second one confirms
 * that the Agenda exists and that there is something in it worth asking about.
 *
 * Everything is loaded here and passed down, and everything is loaded through
 * row-level security — so a contractor without finance access receives an
 * empty ledger array rather than one that gets filtered in the browser. The
 * data is not on the page to be found in the first place.
 */
export default async function AgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=/projects/${id}/agenda`);

  // The project has to exist before anything else is worth saying.
  const { data: exists } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!exists) notFound();

  const access = await agendaAccess(id);

  // The database could not answer. That is not "this does not exist" — most
  // often it is the Agenda migration not having been run, and telling the
  // owner of the project that their own Agenda is a 404 is simply wrong.
  if (!access.ok && access.reason !== "not_member") {
    return <AgendaUnavailable projectId={id} reason={access.reason} />;
  }

  const overview = access.ok ? access.overview : null;

  // Not a member: as far as this page is concerned, there is nothing here.
  if (!overview?.is_member) {
    // Unless they have been invited and have not accepted yet, which is a
    // different situation and needs a different answer.
    const { data: invite } = await supabase
      .from("agenda_members")
      .select("id, role, status")
      .eq("project_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (invite?.status === "invited") {
      const { data: project } = await supabase
        .from("projects")
        .select("title")
        .eq("id", id)
        .maybeSingle();

      return (
        <div className="mx-auto max-w-lg space-y-4 p-6">
          <Link
            href={`/projects/${id}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to the project
          </Link>
          <div className="space-y-3 rounded-2xl border p-6 text-center">
            <Lock className="mx-auto size-6 text-brand" />
            <h1 className="text-lg font-medium">
              You have been invited to this Agenda
            </h1>
            <p className="text-sm text-muted-foreground">
              {project?.title ?? "This project"} keeps a private record of the
              work — site logs, tasks, decisions and, if you are given access,
              the ledger. Accept to open it.
            </p>
            <AcceptInvite projectId={id} />
          </div>
        </div>
      );
    }

    notFound();
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, title, owner_id")
    .eq("id", id)
    .maybeSingle();

  if (!project) notFound();

  const [
    members,
    timeline,
    logs,
    tasks,
    ledger,
    meetings,
    decisions,
    reminders,
    history,
  ] = await Promise.all([
    agendaMembers(id),
    agendaTimeline(id),
    agendaLogs(id),
    agendaTasks(id),
    // Empty for a member without finance access. That is the policy, not a
    // branch — see the panel, which distinguishes "nothing recorded" from
    // "not shown to you" using overview.can_view_finance.
    agendaLedger(id),
    agendaMeetings(id),
    agendaDecisions(id),
    agendaReminders(id),
    agendaHistory(id),
  ]);

  const me = members.find((member) => member.user_id === user.id);

  return (
    <AgendaWorkspace
      projectId={id}
      projectTitle={project.title}
      initialTab={tab}
      overview={overview}
      myUserId={user.id}
      myRole={me?.role ?? (project.owner_id === user.id ? "client" : "employee")}
      isOwner={project.owner_id === user.id || me?.role === "client" || me?.role === "administrator"}
      members={members}
      timeline={timeline}
      logs={logs}
      tasks={tasks}
      ledger={ledger}
      meetings={meetings}
      decisions={decisions}
      reminders={reminders}
      history={history}
    />
  );
}
