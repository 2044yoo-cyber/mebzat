"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardList, CornerDownLeft, Loader2, MapPin, Pencil, RotateCcw, Send, ThumbsUp, Trash2, Undo2, X } from "lucide-react";
import { toast } from "sonner";

import { isClosed, mentionedIn, TASK_COLUMNS, type ThreadStatus } from "@/lib/collab/model";
import type { Comment, Thread } from "@/lib/collab/queries";
import { cn } from "@/lib/utils";

import { convertToTask, editComment, postComment, updateThread } from "@/app/(dashboard)/agenda/projects/[projectId]/collaborate/actions";

import { Avatar, ThreadStatusChip, when } from "./chrome";
import { useCan, useStudio } from "./studio-context";

/**
 * One discussion: what was said, by whom and when, and what is to be done
 * about it. The actions offered follow the person's level, and the server
 * decides again whatever is pressed.
 */
export function ThreadPanel({ threadId, onClose, onLocate }: { threadId: string; onClose?: () => void; onLocate?: (thread: Thread) => void }) {
  const studio = useStudio();
  const allowed = useCan();
  const thread = studio.threads.find((entry) => entry.id === threadId);
  const comments = studio.comments(threadId);
  const [busy, setBusy] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const { loadComments, markRead } = studio;

  useEffect(() => {
    void loadComments(threadId);
    markRead(threadId);
  }, [threadId, loadComments, markRead]);
  useEffect(() => { listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" }); }, [comments?.length]);

  if (!thread) return <p className="p-4 text-sm text-muted-foreground">This discussion is not on the project, or has been removed.</p>;

  const task = thread.taskId ? studio.tasks.find((entry) => entry.id === thread.taskId) : undefined;
  const asset = thread.drawingId ? studio.assets.find((entry) => entry.id === thread.drawingId) : undefined;
  const revision = asset?.revisions.find((entry) => entry.id === thread.revisionId);

  const change = async (label: string, patch: { status?: ThreadStatus; assignedTo?: string | null }) => {
    setBusy(label);
    const result = await updateThread(studio.projectId, { id: thread.id, revision: thread.revision, ...patch });
    setBusy(null);
    if (!result.ok) { toast.error(result.error); return; }
    studio.upsertThread(result.thread);
  };

  const creator = studio.member(thread.createdBy);
  const assignee = studio.member(thread.assignedTo);

  return (
    <section aria-label={`Discussion ${thread.number}`} className="flex h-full min-h-0 flex-col">
      <header className="space-y-2 border-b p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">{thread.number}{asset ? ` · ${asset.number} ${asset.title}${revision ? ` · Rev ${revision.label}` : ""}${thread.page ? ` · p. ${thread.page}` : ""}` : thread.anchorKind === "item" ? " · on a board item" : " · project discussion"}</p>
            <h3 className="break-words font-semibold leading-snug">{thread.title || "Comment"}</h3>
          </div>
          <ThreadStatusChip status={thread.status} />
          {onClose ? <button type="button" onClick={onClose} aria-label="Close discussion" className="flex size-8 items-center justify-center rounded-lg hover:bg-muted"><X className="size-4" /></button> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Opened by {creator?.name ?? "a former member"} · {when(thread.createdAt)}</span>
          {thread.anchorKind !== "project" && onLocate ? <button type="button" onClick={() => onLocate(thread)} className="inline-flex items-center gap-1 font-medium text-brand hover:underline"><MapPin className="size-3.5" />Show where</button> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Assigned</span>
            {allowed.edit ? (
              <select aria-label="Assign to" value={thread.assignedTo ?? ""} disabled={busy !== null} onChange={(event) => void change("assign", { assignedTo: event.target.value || null })} className="h-8 max-w-44 rounded-md border bg-background px-1.5 text-xs">
                <option value="">Nobody</option>
                {studio.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
            ) : <span className="font-medium">{assignee?.name ?? "Nobody"}</span>}
          </label>
          {task ? (
            <Link href={`/agenda/projects/${studio.projectId}/tasks`} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:border-brand">
              <ClipboardList className="size-3.5" />Task · {TASK_COLUMNS.find((column) => column.value === task.status)?.label ?? task.status}
            </Link>
          ) : allowed.edit && !thread.taskId ? (
            <button type="button" onClick={() => setConverting(true)} className="inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-xs hover:border-brand"><ClipboardList className="size-3.5" />Make a task</button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="What to do with it">
          {allowed.edit && !isClosed(thread.status) && thread.status !== "ready_for_review" ? (
            <Action busy={busy === "ready"} onClick={() => void change("ready", { status: "ready_for_review" })} icon={<CornerDownLeft className="size-3.5" />}>Ready for review</Action>
          ) : null}
          {allowed.comment && !isClosed(thread.status) ? (
            <>
              <Action busy={busy === "approve"} tone="good" onClick={() => void change("approve", { status: "approved" })} icon={<ThumbsUp className="size-3.5" />}>Approve</Action>
              <Action busy={busy === "resolve"} tone="good" onClick={() => void change("resolve", { status: "resolved" })} icon={<CheckCircle2 className="size-3.5" />}>Resolve</Action>
              {thread.status === "ready_for_review" ? <Action busy={busy === "changes"} tone="warn" onClick={() => void change("changes", { status: "changes_requested" })} icon={<Undo2 className="size-3.5" />}>Request changes</Action> : null}
            </>
          ) : null}
          {allowed.comment && isClosed(thread.status) ? <Action busy={busy === "reopen"} onClick={() => void change("reopen", { status: "open" })} icon={<RotateCcw className="size-3.5" />}>Reopen</Action> : null}
          {thread.resolvedAt ? <span className="self-center text-xs text-muted-foreground">{thread.status === "approved" ? "Approved" : "Resolved"} by {studio.member(thread.resolvedBy)?.name ?? "a member"} · {when(thread.resolvedAt)}</span> : null}
        </div>
      </header>

      {converting ? <ConvertToTask thread={thread} onDone={() => setConverting(false)} /> : null}

      <ol ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" aria-label="Comments">
        {comments === undefined ? <li className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading…</li> : null}
        {comments?.map((comment) => <CommentRow key={comment.id} comment={comment} />)}
      </ol>

      {allowed.comment ? <Reply threadId={thread.id} /> : <p className="border-t p-3 text-xs text-muted-foreground">You can read this discussion. Ask the project owner for commenter access to reply.</p>}
    </section>
  );
}

function Action({ children, onClick, busy, icon, tone }: { children: React.ReactNode; onClick: () => void; busy?: boolean; icon: React.ReactNode; tone?: "good" | "warn" }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className={cn("inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors disabled:opacity-50", tone === "good" ? "hover:border-emerald-500 hover:text-emerald-700" : tone === "warn" ? "hover:border-amber-500 hover:text-amber-700" : "hover:border-brand hover:text-brand")}>
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : icon}{children}
    </button>
  );
}

function CommentRow({ comment }: { comment: Comment }) {
  const studio = useStudio();
  const author = studio.member(comment.authorId);
  const mine = comment.authorId === studio.me.id;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  if (comment.archived) return <li className="text-xs italic text-muted-foreground">A comment was withdrawn.</li>;
  const save = async (archive = false) => {
    const result = await editComment(studio.projectId, archive ? { id: comment.id, archive: true } : { id: comment.id, body: draft });
    if (!result.ok) { toast.error(result.error); return; }
    studio.addComment(result.comment);
    setEditing(false);
  };
  return (
    <li className="flex gap-2">
      <Avatar id={comment.authorId} name={author?.name ?? "Former member"} url={author?.avatarUrl} size={28} />
      <div className="min-w-0 flex-1">
        <p className="text-xs"><span className="font-semibold">{author?.name ?? "Former member"}</span> <time dateTime={comment.createdAt} className="text-muted-foreground">{when(comment.createdAt)}</time>{comment.editedAt ? <span className="text-muted-foreground"> · edited</span> : null}</p>
        {editing ? (
          <div className="mt-1 space-y-1">
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Edit comment" rows={3} className="w-full rounded-md border bg-background p-2 text-sm" />
            <div className="flex gap-1"><button type="button" onClick={() => void save()} className="rounded-md bg-brand px-2 py-1 text-xs font-medium text-brand-foreground">Save</button><button type="button" onClick={() => setEditing(false)} className="rounded-md border px-2 py-1 text-xs">Cancel</button></div>
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm"><MentionText body={comment.body} /></p>
        )}
        {mine && !editing ? (
          <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-0.5 hover:text-foreground"><Pencil className="size-3" />Edit</button>
            <button type="button" onClick={() => { if (window.confirm("Withdraw this comment?")) void save(true); }} className="inline-flex items-center gap-0.5 hover:text-destructive"><Trash2 className="size-3" />Withdraw</button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** @handles shown as names, without ever interpreting the text as markup. */
function MentionText({ body }: { body: string }) {
  const studio = useStudio();
  const handles = new Map(studio.members.flatMap((member) => (member.handle ? [[member.handle.toLowerCase(), member.name] as const] : [])));
  const parts = body.split(/(@[a-z0-9_.-]{2,40})/gi);
  return <>{parts.map((part, index) => { const name = part.startsWith("@") ? handles.get(part.slice(1).toLowerCase()) : undefined; return name ? <span key={index} className="rounded bg-brand/10 px-0.5 font-medium text-brand">@{name}</span> : <span key={index}>{part}</span>; })}</>;
}

export function Reply({ threadId, placeholder = "Reply… use @ to mention someone" }: { threadId: string; placeholder?: string }) {
  const studio = useStudio();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const query = /(?:^|\s)@([a-z0-9_.-]*)$/i.exec(body)?.[1];
  const suggestions = useMemo(() => (query === undefined ? [] : studio.members.filter((member) => member.handle && member.handle.toLowerCase().startsWith(query.toLowerCase()) && member.id !== studio.me.id).slice(0, 5)), [query, studio.members, studio.me.id]);

  const send = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    const result = await postComment(studio.projectId, { threadId, body, mentions: mentionedIn(body, studio.members) });
    setSending(false);
    if (!result.ok) { toast.error(result.error); return; }
    studio.addComment(result.comment);
    setBody("");
  };

  return (
    <form className="relative border-t p-2" onSubmit={(event) => { event.preventDefault(); void send(); }}>
      {suggestions.length ? (
        <ul role="listbox" aria-label="Mention" className="absolute bottom-full left-2 right-2 mb-1 rounded-lg border bg-popover p-1 shadow-lg">
          {suggestions.map((member) => (
            <li key={member.id}><button type="button" role="option" aria-selected={false} onClick={() => setBody(body.replace(/@([a-z0-9_.-]*)$/i, `@${member.handle} `))} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"><Avatar id={member.id} name={member.name} url={member.avatarUrl} size={20} />{member.name}<span className="text-xs text-muted-foreground">@{member.handle}</span></button></li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(); } }}
          aria-label="Reply"
          placeholder={placeholder}
          rows={2}
          maxLength={4000}
          className="min-h-10 flex-1 resize-none rounded-lg border bg-background p-2 text-sm"
        />
        <button type="submit" aria-label="Send" disabled={!body.trim() || sending} className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground disabled:opacity-40">{sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</button>
      </div>
    </form>
  );
}

function ConvertToTask({ thread, onDone }: { thread: Thread; onDone: () => void }) {
  const studio = useStudio();
  const [title, setTitle] = useState(thread.title ?? "");
  const [assignee, setAssignee] = useState(thread.assignedTo ?? "");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const result = await convertToTask(studio.projectId, { threadId: thread.id, revision: thread.revision, title, assignedTo: assignee || null, dueAt: due ? new Date(`${due}T17:00:00`).toISOString() : null });
    setBusy(false);
    if (!result.ok) { toast.error(result.error); return; }
    studio.upsertThread(result.thread);
    await studio.refreshTasks();
    toast.success("Task created and linked to this comment.");
    onDone();
  };
  return (
    <form className="space-y-2 border-b bg-muted/30 p-3" onSubmit={(event) => { event.preventDefault(); void submit(); }} aria-label="Make a task">
      <label className="block text-xs font-medium">Task<input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={2} maxLength={200} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm font-normal" /></label>
      <div className="flex flex-wrap gap-2">
        <label className="text-xs font-medium">Owner<select value={assignee} onChange={(event) => setAssignee(event.target.value)} className="mt-1 block h-9 rounded-md border bg-background px-1.5 text-sm font-normal"><option value="">Nobody yet</option>{studio.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        <label className="text-xs font-medium">Due<input type="date" value={due} onChange={(event) => setDue(event.target.value)} className="mt-1 block h-9 rounded-md border bg-background px-1.5 text-sm font-normal" /></label>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="inline-flex min-h-9 items-center gap-1 rounded-md bg-brand px-3 text-sm font-medium text-brand-foreground disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : null}Create task</button>
        <button type="button" onClick={onDone} className="min-h-9 rounded-md border px-3 text-sm">Cancel</button>
      </div>
    </form>
  );
}
