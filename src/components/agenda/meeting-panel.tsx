"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveMeeting } from "@/app/(dashboard)/projects/[id]/agenda/actions";
import {
  ActionForm,
  Empty,
  Field,
  PanelHeader,
  inputClass,
  textareaClass,
  usePanel,
  whenTime,
} from "@/components/agenda/shared";
import type { Meeting } from "@/lib/data/agenda";

/** Minutes, client decisions, design changes, approvals, inspections. */
export function MeetingPanel({
  projectId,
  meetings,
}: {
  projectId: string;
  meetings: Meeting[];
}) {
  const router = useRouter();
  const panel = usePanel();

  const [title, setTitle] = useState("");
  const [heldAt, setHeldAt] = useState(() =>
    new Date().toISOString().slice(0, 16),
  );
  const [location, setLocation] = useState("");
  const [attendees, setAttendees] = useState("");
  const [minutes, setMinutes] = useState("");
  const [decisions, setDecisions] = useState("");
  const [changes, setChanges] = useState("");
  const [approvals, setApprovals] = useState("");
  const [inspection, setInspection] = useState("");
  const [next, setNext] = useState("");

  return (
    <div className="space-y-3">
      <PanelHeader
        title="Meetings"
        count={meetings.length}
        action="Add minutes"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {panel.open && (
        <ActionForm
          submitLabel="Save the minutes"
          onSubmit={() =>
            saveMeeting({
              projectId,
              title,
              heldAt: new Date(heldAt).toISOString(),
              location,
              attendees,
              minutes,
              clientDecisions: decisions,
              designChanges: changes,
              approvals,
              inspectionResult: inspection,
              nextActions: next,
            })
          }
          onDone={() => {
            panel.setOpen(false);
            setTitle("");
            setMinutes("");
            setDecisions("");
            setChanges("");
            setApprovals("");
            setInspection("");
            setNext("");
            router.refresh();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Title" className="sm:col-span-1">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Site meeting 12"
                className={inputClass}
                required
              />
            </Field>
            <Field label="Held">
              <input
                type="datetime-local"
                value={heldAt}
                onChange={(event) => setHeldAt(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Where">
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Who was there">
            <input
              value={attendees}
              onChange={(event) => setAttendees(event.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Minutes">
            <textarea
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              className={textareaClass}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Client decisions">
              <textarea
                value={decisions}
                onChange={(event) => setDecisions(event.target.value)}
                className={textareaClass}
              />
            </Field>
            <Field label="Design changes">
              <textarea
                value={changes}
                onChange={(event) => setChanges(event.target.value)}
                className={textareaClass}
              />
            </Field>
            <Field label="Approvals">
              <textarea
                value={approvals}
                onChange={(event) => setApprovals(event.target.value)}
                className={textareaClass}
              />
            </Field>
            <Field label="Inspection result">
              <textarea
                value={inspection}
                onChange={(event) => setInspection(event.target.value)}
                className={textareaClass}
              />
            </Field>
          </div>

          <Field label="Next actions">
            <textarea
              value={next}
              onChange={(event) => setNext(event.target.value)}
              className={textareaClass}
            />
          </Field>
        </ActionForm>
      )}

      {meetings.length === 0 ? (
        <Empty>No meetings recorded.</Empty>
      ) : (
        <ul className="space-y-2">
          {meetings.map((meeting) => (
            <li key={meeting.id} className="space-y-2 rounded-2xl border p-4">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h3 className="font-medium">{meeting.title}</h3>
                <span className="text-xs text-muted-foreground">
                  {whenTime(meeting.held_at)}
                  {meeting.location && ` · ${meeting.location}`}
                </span>
              </div>
              {meeting.attendees && (
                <p className="text-sm text-muted-foreground">
                  {meeting.attendees}
                </p>
              )}
              {meeting.minutes && <p className="text-sm">{meeting.minutes}</p>}

              <dl className="grid gap-3 sm:grid-cols-2">
                <Block label="Client decisions" value={meeting.client_decisions} />
                <Block label="Design changes" value={meeting.design_changes} />
                <Block label="Approvals" value={meeting.approvals} />
                <Block label="Inspection" value={meeting.inspection_result} />
                <Block label="Next actions" value={meeting.next_actions} />
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Block({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}
