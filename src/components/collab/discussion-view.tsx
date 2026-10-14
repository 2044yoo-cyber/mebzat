"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ClipboardList, Loader2, MessageSquarePlus, MessagesSquare } from "lucide-react";
import { toast } from "sonner";

import { isClosed, mentionedIn, TASK_COLUMNS } from "@/lib/collab/model";
import type { Thread } from "@/lib/collab/queries";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { openThread, setTaskStatus } from "@/app/(dashboard)/agenda/projects/[projectId]/collaborate/actions";

import { Avatar, ThreadStatusChip, when } from "./chrome";
import { useCan, useStudio } from "./studio-context";
import { ThreadPanel } from "./thread-panel";

type Filter = "open" | "mine" | "assigned" | "closed" | "all";

/**
 * The project's discussion: every comment thread — on drawings, on board
 * items, and about the project as a whole — and the work that came out of
 * them, as Agenda tasks on a four-column board.
 */
export function DiscussionView({ onLocate }: { onLocate: (thread: Thread) => void }) {
  const studio = useStudio();
  const allowed = useCan();
  const [filter, setFilter] = useState<Filter>("open");
  const [panel, setPanel] = useState<"threads" | "tasks" | "activity">("threads");
  const [composing, setComposing] = useState(false);

  const shown = useMemo(() => studio.threads.filter((thread) => {
    if (filter === "open") return !isClosed(thread.status);
    if (filter === "closed") return isClosed(thread.status);
    if (filter === "mine") return thread.createdBy === studio.me.id;
    if (filter === "assigned") return thread.assignedTo === studio.me.id;
    return true;
  }), [studio.threads, filter, studio.me.id]);

  const anchorLabel = (thread: Thread) => {
    if (thread.anchorKind === "project") return "Project";
    if (thread.anchorKind === "item") return "Board item";
    const asset = studio.assets.find((entry) => entry.id === thread.drawingId);
    const revision = asset?.revisions.find((entry) => entry.id === thread.revisionId);
    return asset ? `${asset.number}${revision ? ` · Rev ${revision.label}` : ""}` : "Drawing";
  };

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="flex min-h-0 flex-col border-b lg:w-96 lg:border-b-0 lg:border-r">
        <div className="flex gap-1 border-b p-2" role="tablist" aria-label="Discussion">
          {([["threads", "Discussions", MessagesSquare], ["tasks", "Tasks", ClipboardList], ["activity", "Activity", Activity]] as const).map(([value, label, Icon]) => (
            <button key={value} type="button" role="tab" aria-selected={panel === value} onClick={() => setPanel(value)} className={cn("inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm", panel === value ? "bg-brand/10 font-semibold text-brand" : "text-muted-foreground hover:bg-muted")}>
              <Icon className="size-4" aria-hidden />{label}
              {value === "threads" && studio.unread.size ? <span className="rounded-full bg-brand px-1.5 text-[10px] font-semibold text-brand-foreground">{studio.unread.size}</span> : null}
            </button>
          ))}
        </div>

        {panel === "threads" ? (
          <>
            <div className="flex items-center gap-2 p-2">
              <select aria-label="Show" value={filter} onChange={(event) => setFilter(event.target.value as Filter)} className="h-9 flex-1 rounded-md border bg-background px-2 text-sm">
                <option value="open">Open</option>
                <option value="assigned">Assigned to me</option>
                <option value="mine">Started by me</option>
                <option value="closed">Resolved and approved</option>
                <option value="all">All</option>
              </select>
              {allowed.comment ? <button type="button" onClick={() => { setComposing(true); studio.openThread(null); }} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-foreground"><MessageSquarePlus className="size-4" />New</button> : null}
            </div>
            <ul className="min-h-0 flex-1 divide-y overflow-y-auto" aria-label="Discussions">
              {shown.length === 0 ? <li className="p-6 text-center text-sm text-muted-foreground">{filter === "open" ? "Nothing open. Comments placed on drawings and board items appear here too." : "Nothing here."}</li> : null}
              {shown.map((thread) => {
                const author = studio.member(thread.createdBy);
                return (
                  <li key={thread.id}>
                    <button type="button" onClick={() => { setComposing(false); studio.openThread(thread.id); }} aria-current={studio.openThreadId === thread.id} className={cn("flex w-full gap-2 p-3 text-left hover:bg-muted/50", studio.openThreadId === thread.id && "bg-brand/5")}>
                      <span className="relative">
                        <Avatar id={thread.createdBy ?? thread.id} name={author?.name ?? "?"} url={author?.avatarUrl} size={28} />
                        {studio.unread.has(thread.id) ? <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-brand ring-2 ring-card" aria-label="Unread" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2"><span className={cn("min-w-0 flex-1 truncate text-sm", studio.unread.has(thread.id) ? "font-semibold" : "font-medium")}>{thread.title || "Comment"}</span><ThreadStatusChip status={thread.status} /></span>
                        <span className="block truncate text-xs text-muted-foreground">{thread.number} · {anchorLabel(thread)} · {when(thread.lastActivityAt)}{thread.assignedTo ? ` · ${studio.member(thread.assignedTo)?.name ?? "assigned"}` : ""}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : panel === "tasks" ? (
          <TaskBoard />
        ) : (
          <ActivityFeed />
        )}
      </div>

      <div className="min-h-[28rem] min-w-0 flex-1 lg:min-h-0">
        {composing ? (
          <NewDiscussion onDone={(id) => { setComposing(false); if (id) studio.openThread(id); }} />
        ) : studio.openThreadId ? (
          <ThreadPanel key={studio.openThreadId} threadId={studio.openThreadId} onClose={() => studio.openThread(null)} onLocate={onLocate} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">Choose a discussion, or start one about the project.</div>
        )}
      </div>
    </div>
  );
}

function NewDiscussion({ onDone }: { onDone: (id: string | null) => void }) {
  const studio = useStudio();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const result = await openThread(studio.projectId, { anchorKind: "project", title, body, mentions: mentionedIn(body, studio.members) });
    setBusy(false);
    if (!result.ok) { toast.error(result.error); return; }
    studio.upsertThread(result.thread);
    onDone(result.thread.id);
  };
  return (
    <form className="space-y-3 p-4" onSubmit={(event) => { event.preventDefault(); void submit(); }} aria-label="New discussion">
      <h3 className="font-semibold">New discussion</h3>
      <label className="block text-sm font-medium">Subject<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm font-normal" placeholder="Site visit, a decision, a question" /></label>
      <label className="block text-sm font-medium">Message<textarea value={body} onChange={(event) => setBody(event.target.value)} required rows={5} maxLength={4000} className="mt-1 w-full rounded-lg border bg-background p-3 text-sm font-normal" placeholder="Use @ to mention someone" /></label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !body.trim()} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : null}Post</button>
        <button type="button" onClick={() => onDone(null)} className="min-h-10 rounded-lg border px-4 text-sm">Cancel</button>
      </div>
    </form>
  );
}

/** Studio tasks are Agenda tasks: here as Open, In Progress, In Review and Done. */
function TaskBoard() {
  const studio = useStudio();
  const allowed = useCan();
  const [busy, setBusy] = useState<string | null>(null);
  const { refreshTasks } = studio;
  useEffect(() => { void refreshTasks(); }, [refreshTasks]);
  const threadOf = new Map(studio.threads.flatMap((thread) => (thread.taskId ? [[thread.taskId, thread] as const] : [])));
  const move = async (taskId: string, status: string) => {
    setBusy(taskId);
    const result = await setTaskStatus(studio.projectId, { taskId, status });
    setBusy(null);
    if (!result.ok) { toast.error(result.error); return; }
    await studio.refreshTasks();
  };
  if (!studio.tasks.length) return <p className="p-6 text-center text-sm text-muted-foreground">No tasks yet. Open a comment and choose “Make a task” — it stays linked to the drawing or card it came from, and appears in Agenda’s tasks too.</p>;
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
      {TASK_COLUMNS.map((column) => {
        const tasks = studio.tasks.filter((task) => (column.value === "todo" ? task.status === "todo" || task.status === "blocked" : task.status === column.value));
        return (
          <section key={column.value} aria-label={column.label} className="rounded-xl border bg-muted/20">
            <h4 className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{column.label}<span>{tasks.length}</span></h4>
            <ul className="space-y-1.5 px-2 pb-2">
              {tasks.map((task) => {
                const thread = threadOf.get(task.id);
                const owner = studio.member(task.assignedTo);
                const canMove = allowed.edit || task.assignedTo === studio.me.id;
                return (
                  <li key={task.id} className="rounded-lg border bg-card p-2 text-sm">
                    <button type="button" onClick={() => thread && studio.openThread(thread.id)} className="block w-full text-left font-medium hover:text-brand">{task.title}</button>
                    <p className="mt-0.5 text-xs text-muted-foreground">{owner ? owner.name : "Unassigned"}{task.dueAt ? ` · due ${new Date(task.dueAt).toLocaleDateString()}` : ""}{thread ? ` · ${thread.number}` : ""}</p>
                    {canMove ? (
                      <select aria-label={`Status of ${task.title}`} value={task.status === "blocked" ? "todo" : task.status} disabled={busy === task.id} onChange={(event) => void move(task.id, event.target.value)} className="mt-1.5 h-8 w-full rounded-md border bg-background px-1.5 text-xs">
                        {TASK_COLUMNS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ActivityFeed() {
  const studio = useStudio();
  const [events, setEvents] = useState<{ id: string; title: string; detail: string | null; actor_id: string | null; occurred_at: string }[] | null>(null);
  useEffect(() => {
    let live = true;
    void createClient().from("agenda_events").select("id, title, detail, actor_id, occurred_at").eq("project_id", studio.projectId).eq("kind", "collab").order("occurred_at", { ascending: false }).limit(100)
      .then(({ data }) => { if (live) setEvents(data ?? []); });
    return () => { live = false; };
  }, [studio.projectId, studio.threads]);
  if (!events) return <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading…</p>;
  if (!events.length) return <p className="p-6 text-center text-sm text-muted-foreground">Nothing has happened in the Studio yet.</p>;
  return (
    <ol className="min-h-0 flex-1 divide-y overflow-y-auto" aria-label="Activity">
      {events.map((event) => (
        <li key={event.id} className="p-3 text-sm">
          <p><span className="font-medium">{studio.member(event.actor_id)?.name ?? "Someone"}</span> · {event.title}</p>
          {event.detail ? <p className="truncate text-xs text-muted-foreground">{event.detail}</p> : null}
          <time dateTime={event.occurred_at} className="text-xs text-muted-foreground">{when(event.occurred_at)}</time>
        </li>
      ))}
    </ol>
  );
}
