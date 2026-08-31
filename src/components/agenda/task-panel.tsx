"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { saveTask } from "@/app/(dashboard)/projects/[id]/agenda/actions";
import {
  ActionForm,
  Empty,
  Field,
  PanelHeader,
  inputClass,
  textareaClass,
  usePanel,
  when,
} from "@/components/agenda/shared";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/agenda/constants";
import type { AgendaMember, AgendaTask } from "@/lib/data/agenda";
import { cn } from "@/lib/utils";

/** The job list, with the status changeable in place. */
export function TaskPanel({
  projectId,
  tasks,
  members,
  myUserId,
}: {
  projectId: string;
  tasks: AgendaTask[];
  members: AgendaMember[];
  myUserId: string;
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, start] = useTransition();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [due, setDue] = useState("");

  // Read once. See the note in timeline.tsx.
  const [now] = useState(() => Date.now());

  const open = tasks.filter(
    (task) => task.status !== "done" && task.status !== "cancelled",
  );
  const closed = tasks.filter(
    (task) => task.status === "done" || task.status === "cancelled",
  );

  function setStatus(task: AgendaTask, status: TaskStatus) {
    setPendingId(task.id);
    start(async () => {
      const result = await saveTask({
        projectId,
        id: task.id,
        title: task.title,
        status,
      });
      setPendingId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <PanelHeader
        title="Tasks"
        count={open.length}
        action="Add a task"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {panel.open && (
        <ActionForm
          submitLabel="Add the task"
          onSubmit={() =>
            saveTask({
              projectId,
              title,
              description,
              assignedTo: assignee || null,
              priority,
              dueAt: due ? new Date(due).toISOString() : null,
            })
          }
          onDone={() => {
            panel.setOpen(false);
            setTitle("");
            setDescription("");
            setDue("");
            router.refresh();
          }}
        >
          <Field label="Title">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Cast the ground floor slab"
              className={inputClass}
              required
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={textareaClass}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Assign to">
              <select
                value={assignee}
                onChange={(event) => setAssignee(event.target.value)}
                className={inputClass}
              >
                <option value="">Nobody yet</option>
                {members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.user?.full_name ?? member.user?.username ?? "Member"}
                    {member.user_id === myUserId ? " (you)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as TaskPriority)
                }
                className={inputClass}
              >
                {TASK_PRIORITIES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Due">
              <input
                type="date"
                value={due}
                onChange={(event) => setDue(event.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </ActionForm>
      )}

      {tasks.length === 0 ? (
        <Empty>No tasks yet.</Empty>
      ) : (
        <div className="space-y-4">
          <ul className="space-y-2">
            {open.map((task) => (
              <Row
                key={task.id}
                task={task}
                now={now}
                pending={pendingId === task.id}
                onStatus={setStatus}
              />
            ))}
          </ul>

          {closed.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                {closed.length} finished
              </summary>
              <ul className="mt-2 space-y-2">
                {closed.map((task) => (
                  <Row
                    key={task.id}
                    task={task}
                    now={now}
                    pending={pendingId === task.id}
                    onStatus={setStatus}
                  />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  task,
  now,
  pending,
  onStatus,
}: {
  task: AgendaTask;
  now: number;
  pending: boolean;
  onStatus: (task: AgendaTask, status: TaskStatus) => void;
}) {
  const priority = TASK_PRIORITIES.find((entry) => entry.value === task.priority);
  const late =
    task.due_at &&
    new Date(task.due_at).getTime() < now &&
    task.status !== "done" &&
    task.status !== "cancelled";

  return (
    <li
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-2xl border p-3",
        late && "border-amber-500/40",
      )}
    >
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium",
            task.status === "done" && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </p>
        {task.description && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {task.description}
          </p>
        )}
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className={priority?.tone}>{priority?.label}</span>
          {task.assignee?.full_name && <span>{task.assignee.full_name}</span>}
          {task.due_at && (
            <span
              className={cn(
                "flex items-center gap-1",
                late && "font-medium text-amber-600 dark:text-amber-400",
              )}
            >
              <CalendarClock className="size-3" />
              {late ? "overdue · " : "due "}
              {when(task.due_at)}
            </span>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {pending && <Loader2 className="size-3.5 animate-spin text-brand" />}
        <select
          value={task.status}
          onChange={(event) => onStatus(task, event.target.value as TaskStatus)}
          disabled={pending}
          aria-label="Status"
          className="h-8 rounded-lg border bg-transparent px-2 text-xs outline-none focus-visible:border-ring"
        >
          {TASK_STATUSES.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}
