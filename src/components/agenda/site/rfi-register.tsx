"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Clock, Loader2, MessageCircleQuestion } from "lucide-react";
import { toast } from "sonner";

import {
  Empty,
  Field,
  PanelHeader,
  inputClass,
  textareaClass,
  usePanel,
  when,
  whenTime,
} from "@/components/agenda/shared";
import { StatusChip } from "@/components/agenda/shell/status-chip";
import { TASK_PRIORITIES } from "@/lib/agenda/constants";
import {
  DISCIPLINES,
  daysLate,
  disciplineLabel,
  isAwaitingAnswer,
  isOverdue,
  reviewStatusLabel,
  reviewStatusTone,
} from "@/lib/agenda/records";
import type { Person, Rfi } from "@/lib/data/agenda-site";
import { closeRfi, raiseRfi, respondToRfi } from "@/app/(dashboard)/agenda/projects/[projectId]/site-actions";
import { cn } from "@/lib/utils";

/**
 * The RFI register: questions asked of the consultant, and what came back.
 *
 * Open ones first, however old they are. A register sorted purely by date puts
 * last month's unanswered clash below this morning's closed query, and the
 * whole point of the screen is to show what is still waiting.
 */
export function RfiRegister({
  projectId,
  rfis,
  people,
}: {
  projectId: string;
  rfis: Rfi[];
  people: Person[];
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pending, start] = useTransition();
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [filter, setFilter] = useState<"waiting" | "all">("waiting");

  const waiting = rfis.filter((rfi) => isAwaitingAnswer(rfi.status));
  const shown = filter === "waiting" ? waiting : rfis;

  const ordered = [...shown].sort((a, b) => {
    const aOpen = isAwaitingAnswer(a.status) ? 0 : 1;
    const bOpen = isAwaitingAnswer(b.status) ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return a.createdAt < b.createdAt ? 1 : -1;
  });

  return (
    <div className="space-y-3">
      <PanelHeader
        title="RFIs"
        count={rfis.length}
        action="Raise an RFI"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {panel.open && (
        <form
          action={(formData) =>
            start(async () => {
              const result = await raiseRfi(projectId, formData);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Raised");
              panel.setOpen(false);
              router.refresh();
            })
          }
          className="space-y-3 rounded-2xl border p-4"
        >
          <Field label="Subject">
            <input
              name="subject"
              required
              maxLength={200}
              className={inputClass}
              placeholder="Clash between duct and beam at grid C4"
            />
          </Field>

          <Field label="The question">
            <textarea
              name="question"
              required
              maxLength={4000}
              className={textareaClass}
              placeholder="What the site needs decided, and what it is holding up."
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Discipline">
              <select name="discipline" className={inputClass} defaultValue="">
                <option value="">Not stated</option>
                {DISCIPLINES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Asked of">
              <select name="requestedFrom" className={inputClass} defaultValue="">
                <option value="">Anybody on the project</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName ?? person.username ?? "Unnamed"}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Where on site">
              <input
                name="location"
                maxLength={120}
                className={inputClass}
                placeholder="Block B, third floor"
              />
            </Field>

            <Field label="Priority">
              <select name="priority" className={inputClass} defaultValue="normal">
                {TASK_PRIORITIES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Answer needed by">
              <input type="date" name="dueDate" className={inputClass} />
            </Field>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="flex h-9 items-center gap-2 rounded-xl bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Raise it
          </button>
        </form>
      )}

      <div className="flex gap-1.5">
        {(
          [
            ["waiting", `Waiting (${waiting.length})`],
            ["all", `All (${rfis.length})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={cn(
              "h-8 rounded-lg border px-3 text-xs font-medium transition-colors",
              filter === value
                ? "border-brand bg-brand text-brand-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {ordered.length === 0 ? (
        <Empty>
          {filter === "waiting"
            ? "Nothing is waiting on an answer."
            : "No RFIs have been raised on this project yet."}
        </Empty>
      ) : (
        <ul className="space-y-2">
          {ordered.map((rfi) => {
            const late = isOverdue(rfi.dueDate, rfi.status);
            const by = daysLate(rfi.dueDate);
            const expanded = openThread === rfi.id;

            return (
              <li key={rfi.id} className="rounded-2xl border">
                <button
                  type="button"
                  onClick={() => setOpenThread(expanded ? null : rfi.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-start gap-3 p-4 text-left"
                >
                  <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {rfi.number}
                      </span>
                      <span className="text-sm font-medium">{rfi.subject}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[
                        disciplineLabel(rfi.discipline),
                        rfi.location,
                        rfi.requestedFrom
                          ? `Asked of ${rfi.requestedFrom.fullName ?? rfi.requestedFrom.username}`
                          : null,
                        rfi.responses.length > 0
                          ? `${rfi.responses.length} response${rfi.responses.length === 1 ? "" : "s"}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusChip
                      label={reviewStatusLabel(rfi.status)}
                      tone={reviewStatusTone(rfi.status)}
                    />
                    {late && by !== null && (
                      <span className="inline-flex items-center gap-1 text-xs text-destructive">
                        <Clock className="size-3" />
                        {by} day{by === 1 ? "" : "s"} late
                      </span>
                    )}
                  </div>
                </button>

                {expanded && (
                  <div className="space-y-3 border-t p-4">
                    <p className="text-sm whitespace-pre-wrap">{rfi.question}</p>
                    <p className="text-xs text-muted-foreground">
                      Raised by {rfi.createdBy?.fullName ?? rfi.createdBy?.username ?? "somebody"}
                      {" · "}
                      {whenTime(rfi.createdAt)}
                      {rfi.dueDate ? ` · answer needed by ${when(rfi.dueDate)}` : ""}
                    </p>

                    {rfi.responses.length > 0 && (
                      <ul className="space-y-2">
                        {rfi.responses.map((response) => (
                          <li
                            key={response.id}
                            className={cn(
                              "rounded-xl border p-3",
                              response.isOfficial && "border-brand/40 bg-brand/5",
                            )}
                          >
                            <p className="text-sm whitespace-pre-wrap">
                              {response.body}
                            </p>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                              {response.isOfficial && (
                                <CheckCircle2 className="size-3 text-brand" />
                              )}
                              {response.isOfficial ? "Official answer · " : ""}
                              {response.author?.fullName ??
                                response.author?.username ??
                                "Somebody"}
                              {" · "}
                              {whenTime(response.createdAt)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}

                    <form
                      action={(formData) =>
                        start(async () => {
                          const result = await respondToRfi(
                            projectId,
                            rfi.id,
                            formData,
                          );
                          if (result.error) {
                            toast.error(result.error);
                            return;
                          }
                          toast.success("Recorded");
                          router.refresh();
                        })
                      }
                      className="space-y-2"
                    >
                      <textarea
                        name="body"
                        required
                        maxLength={4000}
                        className={textareaClass}
                        placeholder="Answer, or a note on the way to one."
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            name="official"
                            className="size-4 rounded border"
                          />
                          This is the official answer
                        </label>
                        <button
                          type="submit"
                          disabled={pending}
                          className="flex h-8 items-center gap-2 rounded-lg bg-brand px-3 text-xs font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {pending && <Loader2 className="size-3 animate-spin" />}
                          Respond
                        </button>
                        {rfi.status === "answered" && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              start(async () => {
                                const result = await closeRfi(projectId, rfi.id);
                                if (result.error) {
                                  toast.error(result.error);
                                  return;
                                }
                                toast.success("Closed");
                                router.refresh();
                              })
                            }
                            className="h-8 rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                          >
                            Close it out
                          </button>
                        )}
                      </div>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
