"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CloudSun, HardHat, TriangleAlert, Users } from "lucide-react";

import { saveDailyLog } from "@/app/(dashboard)/projects/[id]/agenda/actions";
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
import { WEATHER } from "@/lib/agenda/constants";
import type { DailyLog } from "@/lib/data/agenda";

/**
 * The daily site log.
 *
 * One entry per day, which is why the date is unique in the database: a second
 * entry for the same day is an edit of the first, and edits are recorded. That
 * is the difference between a site record and a notebook.
 */
export function DailyLogPanel({
  projectId,
  logs,
}: {
  projectId: string;
  logs: DailyLog[];
}) {
  const router = useRouter();
  const panel = usePanel();

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weather, setWeather] = useState("");
  const [workers, setWorkers] = useState("");
  const [completed, setCompleted] = useState("");
  const [materials, setMaterials] = useState("");
  const [equipment, setEquipment] = useState("");
  const [problems, setProblems] = useState("");
  const [safety, setSafety] = useState("");
  const [visitors, setVisitors] = useState("");

  return (
    <div className="space-y-3">
      <PanelHeader
        title="Daily site log"
        count={logs.length}
        action="Record today"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {panel.open && (
        <ActionForm
          submitLabel="Save the log"
          onSubmit={() =>
            saveDailyLog({
              projectId,
              logDate: date,
              weather,
              workersPresent: workers ? Number(workers) : null,
              workCompleted: completed,
              materialsDelivered: materials,
              equipmentUsed: equipment,
              problems,
              safetyIssues: safety,
              visitors,
            })
          }
          onDone={() => {
            panel.setOpen(false);
            setCompleted("");
            setMaterials("");
            setEquipment("");
            setProblems("");
            setSafety("");
            setVisitors("");
            router.refresh();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Date">
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className={inputClass}
                required
              />
            </Field>
            <Field label="Weather">
              <select
                value={weather}
                onChange={(event) => setWeather(event.target.value)}
                className={inputClass}
              >
                <option value="">—</option>
                {WEATHER.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Workers present">
              <input
                type="number"
                min={0}
                value={workers}
                onChange={(event) => setWorkers(event.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Work completed">
            <textarea
              value={completed}
              onChange={(event) => setCompleted(event.target.value)}
              placeholder="Foundation poured, east wing. Blockwork to first course."
              className={textareaClass}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Materials delivered">
              <textarea
                value={materials}
                onChange={(event) => setMaterials(event.target.value)}
                placeholder="200 bags cement, 3 tonnes rebar"
                className={textareaClass}
              />
            </Field>
            <Field label="Equipment used">
              <textarea
                value={equipment}
                onChange={(event) => setEquipment(event.target.value)}
                placeholder="Mixer, vibrator, one tipper"
                className={textareaClass}
              />
            </Field>
            <Field label="Problems">
              <textarea
                value={problems}
                onChange={(event) => setProblems(event.target.value)}
                placeholder="Rain stopped work after 3pm"
                className={textareaClass}
              />
            </Field>
            <Field label="Safety issues">
              <textarea
                value={safety}
                onChange={(event) => setSafety(event.target.value)}
                placeholder="None, or what happened"
                className={textareaClass}
              />
            </Field>
          </div>

          <Field label="Visitors">
            <input
              value={visitors}
              onChange={(event) => setVisitors(event.target.value)}
              placeholder="Client, city inspector"
              className={inputClass}
            />
          </Field>
        </ActionForm>
      )}

      {logs.length === 0 ? (
        <Empty>
          No site logs yet. The daily log is what makes this record worth
          having when somebody asks what happened in March.
        </Empty>
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => (
            <li key={log.id} className="space-y-2 rounded-2xl border p-4">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-medium">{when(log.log_date)}</h3>
                {log.weather && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CloudSun className="size-3.5" />
                    {log.weather}
                  </span>
                )}
                {log.workers_present !== null && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <HardHat className="size-3.5" />
                    {log.workers_present} on site
                  </span>
                )}
                {log.author?.full_name && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {log.author.full_name}
                  </span>
                )}
              </div>

              {log.work_completed && (
                <p className="text-sm">{log.work_completed}</p>
              )}

              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {log.materials_delivered && (
                  <Row label="Delivered" value={log.materials_delivered} />
                )}
                {log.equipment_used && (
                  <Row label="Equipment" value={log.equipment_used} />
                )}
                {log.visitors && (
                  <Row label="Visitors" value={log.visitors} />
                )}
              </dl>

              {(log.problems || log.safety_issues) && (
                <div className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/5 p-2.5 text-sm">
                  {log.problems && (
                    <p className="flex gap-2">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                      {log.problems}
                    </p>
                  )}
                  {log.safety_issues && (
                    <p className="flex gap-2">
                      <Users className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                      {log.safety_issues}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{value}</dd>
    </div>
  );
}
