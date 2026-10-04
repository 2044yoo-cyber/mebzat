"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, CircleDashed, X } from "lucide-react";

import { recordDecision } from "@/app/(dashboard)/projects/[id]/agenda/actions";
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
import type { Decision } from "@/lib/data/agenda";
import { cn } from "@/lib/utils";

/**
 * The decision log.
 *
 * "Kitchen tiles approved — client — 14 March." The record that settles an
 * argument six months later. A decision is never edited away: changing your
 * mind records a new one that supersedes the old, and both remain.
 */
export function DecisionPanel({
  projectId,
  decisions,
}: {
  projectId: string;
  decisions: Decision[];
}) {
  const router = useRouter();
  const panel = usePanel();

  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [status, setStatus] =
    useState<"proposed" | "approved" | "rejected">("approved");
  const [decidedBy, setDecidedBy] = useState("");
  const [decidedOn, setDecidedOn] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  return (
    <div className="space-y-3">
      <PanelHeader
        title="Decisions"
        count={decisions.length}
        action="Record a decision"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {panel.open && (
        <ActionForm
          submitLabel="Record it"
          onSubmit={() =>
            recordDecision({
              projectId,
              title,
              detail,
              status,
              decidedByName: decidedBy,
              decidedOn,
            })
          }
          onDone={() => {
            panel.setOpen(false);
            setTitle("");
            setDetail("");
            setDecidedBy("");
            router.refresh();
          }}
        >
          <Field label="What was decided">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Kitchen tiles approved"
              className={inputClass}
              required
            />
          </Field>

          <Field label="Detail">
            <textarea
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              placeholder="60x60 porcelain, matt, from the samples shown on 12 March."
              className={textareaClass}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Outcome">
              <select
                value={status}
                onChange={(event) =>
                  setStatus(
                    event.target.value as "proposed" | "approved" | "rejected",
                  )
                }
                className={inputClass}
              >
                <option value="approved">Approved</option>
                <option value="proposed">Proposed</option>
                <option value="rejected">Rejected</option>
              </select>
            </Field>
            <Field label="Who decided">
              <input
                value={decidedBy}
                onChange={(event) => setDecidedBy(event.target.value)}
                placeholder="Client"
                className={inputClass}
              />
            </Field>
            <Field label="When">
              <input
                type="date"
                value={decidedOn}
                onChange={(event) => setDecidedOn(event.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </ActionForm>
      )}

      {decisions.length === 0 ? (
        <Empty>
          No decisions recorded. This is the log that settles what was agreed,
          and when.
        </Empty>
      ) : (
        <ul className="space-y-2">
          {decisions.map((decision) => {
            const Icon =
              decision.status === "approved"
                ? Check
                : decision.status === "rejected"
                  ? X
                  : CircleDashed;
            return (
              <li
                key={decision.id}
                className={cn(
                  "flex gap-3 rounded-2xl border p-4",
                  decision.status === "approved" && "border-emerald-500/40",
                  decision.status === "rejected" && "border-rose-500/40",
                  decision.status === "superseded" && "opacity-60",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
                    decision.status === "approved" &&
                      "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
                    decision.status === "rejected" &&
                      "border-rose-500/40 text-rose-600 dark:text-rose-400",
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{decision.title}</p>
                  {decision.detail && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {decision.detail}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {decision.status}
                    {decision.decided_by_name && ` · ${decision.decided_by_name}`}
                    {decision.decided_on && ` · ${when(decision.decided_on)}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
