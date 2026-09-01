"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  ClipboardList,
  Gavel,
  History,
  ListChecks,
  Lock,
  Sparkles,
  Users,
} from "lucide-react";

import { AgendaTimeline } from "@/components/agenda/timeline";
import { DailyLogPanel } from "@/components/agenda/daily-log-panel";
import { TaskPanel } from "@/components/agenda/task-panel";
import { LedgerPanel } from "@/components/agenda/ledger-panel";
import { MeetingPanel } from "@/components/agenda/meeting-panel";
import { DecisionPanel } from "@/components/agenda/decision-panel";
import { TeamPanel } from "@/components/agenda/team-panel";
import { HistoryPanel } from "@/components/agenda/history-panel";
import { ReportPanel } from "@/components/agenda/report-panel";
import type {
  AgendaEvent,
  AgendaMember,
  AgendaOverview,
  AgendaTask,
  AuditEntry,
  DailyLog,
  Decision,
  LedgerEntry,
  Meeting,
  Reminder,
} from "@/lib/data/agenda";
import type { AgendaRole } from "@/lib/agenda/constants";
import { cn } from "@/lib/utils";

/**
 * The Agenda workspace.
 *
 * One private record with several faces: the timeline is what happened, the
 * panels are how you add to it. Tabs rather than pages, because a site manager
 * updating a log and then a task should not wait for two navigations on a
 * phone with one bar of signal.
 *
 * The ledger tab is present for everyone but shows the records only to those
 * the client has granted finance access. It is not hidden from the others —
 * knowing that a ledger exists is not the secret; its contents are — and
 * hiding the tab would leave people quietly wondering where the money is.
 */

type Tab =
  | "timeline"
  | "logs"
  | "tasks"
  | "ledger"
  | "meetings"
  | "decisions"
  | "team"
  | "history";

const TABS: { id: Tab; label: string; icon: typeof ClipboardList }[] = [
  { id: "timeline", label: "Timeline", icon: CalendarDays },
  { id: "logs", label: "Daily log", icon: ClipboardList },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "ledger", label: "Ledger", icon: Banknote },
  { id: "meetings", label: "Meetings", icon: Users },
  { id: "decisions", label: "Decisions", icon: Gavel },
  { id: "team", label: "Team", icon: Users },
  { id: "history", label: "History", icon: History },
];

export function AgendaWorkspace({
  projectId,
  projectTitle,
  initialTab,
  overview,
  myUserId,
  myRole,
  isOwner,
  members,
  timeline,
  logs,
  tasks,
  ledger,
  meetings,
  decisions,
  reminders,
  history,
}: {
  projectId: string;
  projectTitle: string;
  initialTab?: string;
  overview: AgendaOverview;
  myUserId: string;
  myRole: AgendaRole;
  isOwner: boolean;
  members: AgendaMember[];
  timeline: AgendaEvent[];
  logs: DailyLog[];
  tasks: AgendaTask[];
  ledger: LedgerEntry[];
  meetings: Meeting[];
  decisions: Decision[];
  reminders: Reminder[];
  history: AuditEntry[];
}) {
  const [tab, setTab] = useState<Tab>(
    TABS.some((entry) => entry.id === initialTab)
      ? (initialTab as Tab)
      : "timeline",
  );
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <Link
          href={`/projects/${projectId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {projectTitle}
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Lock className="size-5 text-brand" />
              Agenda
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              The private record of this project. Visible only to its{" "}
              {overview.member_count}{" "}
              {overview.member_count === 1 ? "member" : "members"}, and nothing
              here is ever deleted.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setReportOpen((open) => !open)}
            className="flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-colors hover:border-brand"
          >
            <Sparkles className="size-4 text-brand" />
            Ask for a report
          </button>
        </div>

        {/* ---- The numbers ------------------------------------------- */}
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label="Open tasks"
            value={String(overview.open_tasks)}
            tone={overview.overdue_tasks > 0 ? "warn" : "plain"}
            note={
              overview.overdue_tasks > 0
                ? `${overview.overdue_tasks} overdue`
                : undefined
            }
          />
          <Stat
            label="Logs this week"
            value={String(overview.logs_this_week)}
            tone={overview.logs_this_week === 0 ? "warn" : "plain"}
            note={
              overview.last_log_date
                ? `last ${overview.last_log_date}`
                : "none yet"
            }
          />
          <Stat
            label="Reminders"
            value={String(overview.open_reminders)}
          />
          {/* Null means "not shown to you", which is a different thing from
              zero and must not be rendered as it. */}
          <Stat
            label="Spent"
            value={
              overview.can_view_finance && overview.total_spent !== null
                ? overview.total_spent.toLocaleString("en-ET")
                : "—"
            }
            note={
              overview.can_view_finance
                ? overview.outstanding
                  ? `${overview.outstanding.toLocaleString("en-ET")} outstanding`
                  : undefined
                : "not shown to you"
            }
          />
        </dl>
      </header>

      {reportOpen && (
        <ReportPanel projectId={projectId} onClose={() => setReportOpen(false)} />
      )}

      {/* ---- Tabs ---------------------------------------------------- */}
      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-px">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-current={tab === entry.id ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              tab === entry.id
                ? "border-brand font-medium text-brand"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <entry.icon className="size-3.5" />
            {entry.label}
            {entry.id === "ledger" && !overview.can_view_finance && (
              <Lock className="size-3 opacity-60" />
            )}
          </button>
        ))}
      </nav>

      <div className="min-h-64">
        {tab === "timeline" && (
          <AgendaTimeline events={timeline} reminders={reminders} />
        )}
        {tab === "logs" && (
          <DailyLogPanel projectId={projectId} logs={logs} />
        )}
        {tab === "tasks" && (
          <TaskPanel
            projectId={projectId}
            tasks={tasks}
            members={members}
            myUserId={myUserId}
          />
        )}
        {tab === "ledger" && (
          <LedgerPanel
            projectId={projectId}
            entries={ledger}
            canView={overview.can_view_finance}
            totals={{
              spent: overview.total_spent,
              received: overview.total_received,
              outstanding: overview.outstanding,
            }}
          />
        )}
        {tab === "meetings" && (
          <MeetingPanel projectId={projectId} meetings={meetings} />
        )}
        {tab === "decisions" && (
          <DecisionPanel projectId={projectId} decisions={decisions} />
        )}
        {tab === "team" && (
          <TeamPanel
            projectId={projectId}
            members={members}
            isOwner={isOwner}
            myUserId={myUserId}
            myRole={myRole}
          />
        )}
        {tab === "history" && <HistoryPanel entries={history} />}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone = "plain",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "plain" | "warn";
}) {
  return (
    <div className="rounded-xl border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-xl font-semibold tabular-nums",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </dd>
      {note && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{note}</p>
      )}
    </div>
  );
}
