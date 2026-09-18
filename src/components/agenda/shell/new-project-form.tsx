"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import {
  createAgendaProject,
  type CreateProjectState,
} from "@/app/(dashboard)/agenda/projects/actions";
import { PlacePicker } from "@/components/location/place-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AGENDA_PROJECT_STATUSES,
  AGENDA_PROJECT_TYPES,
} from "@/lib/agenda/projects";

const initialState: CreateProjectState = {};

/**
 * Starting a project.
 *
 * Grouped into what the job *is*, who is on it, and what it is worth, because
 * a single column of eighteen fields is a form people abandon. Only the name
 * is required: a project is usually started before the contract is signed, and
 * refusing to create one until every party is known is refusing to be used at
 * the point somebody actually reaches for it.
 *
 * Reuses `PlacePicker` rather than a text box, so an Agenda project's location
 * is the same searchable Ethiopian gazetteer as everywhere else in Medosha.
 */
export function NewProjectForm() {
  const [state, formAction, pending] = useActionState(
    createAgendaProject,
    initialState,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error, state.erroredAt]);

  return (
    <form action={formAction} className="space-y-6">
      <section className="space-y-4 rounded-xl border p-4">
        <p className="text-sm font-medium">The job</p>

        <div className="space-y-2">
          <Label htmlFor="name">Project name</Label>
          <Input id="name" name="name" required placeholder="Bole Mixed-Use Tower" />
          {state.fieldErrors?.name && (
            <p className="text-sm text-destructive">{state.fieldErrors.name}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="projectNumber">Project number</Label>
            <Input id="projectNumber" name="projectNumber" placeholder="MED-001" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="projectType">Type</Label>
            <select
              id="projectType"
              name="projectType"
              defaultValue="residential"
              className="min-h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
            >
              {AGENDA_PROJECT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="status">Stage</Label>
            <select
              id="status"
              name="status"
              defaultValue="planning"
              className="min-h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
            >
              {AGENDA_PROJECT_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Site location</Label>
            <PlacePicker
              id="location"
              name="location"
              placeholder="Ayertena, Bole, Adama…"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border p-4">
        <p className="text-sm font-medium">Who is on it</p>
        <p className="text-xs text-muted-foreground">
          Names as they appear on the contract. Anyone with a Medosha account
          can be invited to the project afterwards.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ["clientName", "Client"],
            ["mainContractor", "Main contractor"],
            ["consultant", "Consultant"],
            ["architect", "Architect"],
            ["structuralEngineer", "Structural engineer"],
            ["mepEngineer", "MEP engineer"],
          ].map(([name, label]) => (
            <div key={name} className="space-y-2">
              <Label htmlFor={name}>{label}</Label>
              <Input id={name} name={name} />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border p-4">
        <p className="text-sm font-medium">Dates and value</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="startDate">Start</Label>
            <Input id="startDate" name="startDate" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="targetDate">Target completion</Label>
            <Input id="targetDate" name="targetDate" type="date" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <div className="space-y-2">
            <Label htmlFor="contractValue">Contract value</Label>
            <Input
              id="contractValue"
              name="contractValue"
              inputMode="decimal"
              placeholder="42,000,000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <select
              id="currency"
              name="currency"
              defaultValue="ETB"
              className="min-h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
            >
              <option value="ETB">ETB</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={3} />
        </div>
      </section>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Starting…" : "Start project"}
      </Button>
    </form>
  );
}
