"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleDot, ExternalLink, Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { addComment, listComments, type Comment, type Pin } from "../services/sketch-store";

/**
 * A pin, and the conversation about it.
 *
 * The conversation is the Agenda task's own comments: the same thread anyone
 * opening the task in Agenda reads and writes. Nothing here is a second
 * messaging system.
 */
export function HousePinSheet({ pin, userId, projectId, taskStatus, where, onClose, onChange, onAddToAgenda, onShow }: {
  pin: Pin;
  userId: string;
  projectId: string;
  taskStatus?: string;
  /** "Ground Floor", "kitchen.jpg · page 2" — what the pin is on. */
  where: string;
  onClose: () => void;
  onChange: (patch: Partial<Pick<Pin, "title" | "note" | "measurement" | "status">>) => void;
  onAddToAgenda: () => Promise<void>;
  onShow?: () => void;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const taskId = pin.taskId;

  useEffect(() => {
    if (!taskId) return;
    let live = true;
    void listComments(createClient(), userId, taskId).then((items) => { if (live) setComments(items); });
    return () => { live = false; };
  }, [taskId, userId]);

  async function send() {
    if (!taskId || !message.trim()) return;
    setBusy(true);
    const result = await addComment(createClient(), userId, projectId, taskId, message);
    setBusy(false);
    if (result.error) { toast.error(result.error); return; }
    setMessage("");
    setComments(await listComments(createClient(), userId, taskId));
  }

  return (
    <section aria-label={`Pin ${pin.number}`} className="space-y-2 rounded-2xl border bg-card p-3 shadow-xl">
      <div className="flex items-start gap-2">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", pin.status === "resolved" ? "bg-emerald-600" : "bg-rose-600")}>{pin.number.replace(/^PIN-0*/, "")}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{pin.number} · {where}</p>
          <input aria-label="Pin title" defaultValue={pin.title} onBlur={(event) => { if (event.target.value.trim() && event.target.value !== pin.title) onChange({ title: event.target.value }); }} className="w-full truncate bg-transparent text-sm font-semibold outline-none" />
        </div>
        <button type="button" onClick={onClose} aria-label="Close pin" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="col-span-2 block rounded-lg bg-muted/50 px-2 py-1"><span className="block text-[10px] text-muted-foreground">Note</span><textarea aria-label="Pin note" defaultValue={pin.note ?? ""} rows={2} onBlur={(event) => { if (event.target.value !== (pin.note ?? "")) onChange({ note: event.target.value }); }} className="w-full resize-none bg-transparent text-sm outline-none" /></label>
        <label className="block rounded-lg bg-muted/50 px-2 py-1"><span className="block text-[10px] text-muted-foreground">Measurement</span><input aria-label="Pin measurement" defaultValue={pin.measurement ?? ""} onBlur={(event) => { if (event.target.value !== (pin.measurement ?? "")) onChange({ measurement: event.target.value }); }} className="w-full bg-transparent text-sm outline-none" /></label>
        <button type="button" onClick={() => onChange({ status: pin.status === "open" ? "resolved" : "open" })} aria-pressed={pin.status === "resolved"} className={cn("flex min-h-10 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium", pin.status === "resolved" ? "border-emerald-600/40 text-emerald-700 dark:text-emerald-400" : "")}>{pin.status === "resolved" ? <><CheckCircle2 className="size-3.5" /> Resolved</> : <><CircleDot className="size-3.5" /> Open — mark resolved</>}</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {onShow ? <button type="button" onClick={onShow} className="min-h-10 rounded-lg border px-3 text-xs font-medium hover:bg-muted">Show on drawing</button> : null}
        {taskId ? (
          <a href={`/agenda/projects/${projectId}/tasks`} className="flex min-h-10 items-center gap-1 rounded-lg border px-3 text-xs font-medium hover:bg-muted"><ExternalLink className="size-3.5" />On the Agenda{taskStatus ? ` · ${taskStatus.replace("_", " ")}` : ""}</a>
        ) : (
          <button type="button" disabled={adding} onClick={async () => { setAdding(true); await onAddToAgenda(); setAdding(false); }} className="flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-brand-foreground disabled:opacity-50">{adding ? <Loader2 className="size-3.5 animate-spin" /> : null}Add to Agenda</button>
        )}
      </div>
      {taskId ? (
        <div aria-label="Discussion" role="region" className="space-y-1.5 border-t pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Discussion</p>
          {comments === null ? <p className="text-xs text-muted-foreground">Loading…</p> : comments.length === 0 ? <p className="text-xs text-muted-foreground">No messages yet.</p> : null}
          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
            {comments?.map((comment) => (
              <li key={comment.id} className={cn("rounded-xl px-2.5 py-1.5 text-sm", comment.mine ? "ml-6 bg-brand/10" : "mr-6 bg-muted")}>
                <span className="block text-[10px] font-semibold text-muted-foreground">{comment.author}</span>
                {comment.body}
              </li>
            ))}
          </ul>
          <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="flex gap-1.5">
            <input aria-label="Message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write a message" className="min-h-10 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm" />
            <button type="submit" disabled={busy || !message.trim()} aria-label="Send message" className="flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-brand text-brand-foreground disabled:opacity-40">{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

/** Asking for a new pin's title, note and measurement, before it is placed. */
export function HousePinDialog({ initial, discussionOnly = false, onSave, onCancel }: { initial?: { title?: string; measurement?: string; note?: string }; discussionOnly?: boolean; onSave: (pin: { title: string; note: string; measurement: string; agenda: boolean }) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [measurement, setMeasurement] = useState(initial?.measurement ?? "");
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-3 sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <form role="dialog" aria-modal="true" aria-label="New pin" onSubmit={(event) => event.preventDefault()} className="w-full max-w-md space-y-2 rounded-2xl border bg-card p-4 shadow-2xl">
        <h2 className="text-base font-semibold">{discussionOnly ? "Start a drawing discussion" : "New pin"}</h2>
        {discussionOnly ? <p className="text-xs text-muted-foreground">This annotation will become a pin and an Agenda task. Project members can comment on the same discussion.</p> : null}
        <input autoFocus aria-label="Title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Kitchen wall" maxLength={200} className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm" />
        <textarea aria-label="Note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Please verify on site" rows={2} maxLength={4000} className="w-full rounded-lg border bg-background p-3 text-sm" />
        <input aria-label="Measurement" value={measurement} onChange={(event) => setMeasurement(event.target.value)} placeholder="e.g. 3.62 m" maxLength={200} className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm" />
        <div className={discussionOnly ? "grid grid-cols-2 gap-2" : "grid grid-cols-3 gap-2"}>
          <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border text-sm font-medium">Cancel</button>
          {!discussionOnly ? <button type="button" disabled={!title.trim()} onClick={() => onSave({ title, note, measurement, agenda: false })} className="min-h-11 rounded-xl border text-sm font-semibold disabled:opacity-40">Place pin</button> : null}
          <button type="button" disabled={!title.trim()} onClick={() => onSave({ title, note, measurement, agenda: true })} className="min-h-11 rounded-xl bg-brand text-sm font-semibold text-brand-foreground disabled:opacity-40">{discussionOnly ? "Create discussion" : "+ Agenda"}</button>
        </div>
      </form>
    </div>
  );
}
