"use client";

import { useActionState } from "react";

import {
  createProject,
  updateProject,
  type ProjectFormState,
} from "@/app/(dashboard)/projects/actions";
import { ProjectImagesInput } from "@/components/projects/project-images-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BUILDING_TYPES } from "@/lib/constants/building-types";
import type { Project } from "@/types/database.types";

const initialState: ProjectFormState = {};

const BUILDING_TYPE_ITEMS = Object.fromEntries(
  BUILDING_TYPES.map((t) => [t.value, t.label]),
);
const STATUS_ITEMS = {
  published: "Published — visible to everyone",
  draft: "Draft — only you can see it",
};

export function ProjectForm({
  userId,
  project,
  initialImageUrls = [],
}: {
  userId: string;
  project?: Project;
  initialImageUrls?: string[];
}) {
  const action = project
    ? updateProject.bind(null, project.id)
    : createProject;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">Project title</Label>
        <Input
          id="title"
          name="title"
          defaultValue={project?.title ?? ""}
          placeholder="Lakeside Villa Renovation"
          required
        />
        {state.fieldErrors?.title && (
          <p className="text-sm text-destructive">{state.fieldErrors.title}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Images</Label>
        <ProjectImagesInput userId={userId} initialUrls={initialImageUrls} />
        <p className="text-xs text-muted-foreground">
          The first image is used as the cover. Hover an image to set a
          different cover or remove it.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={5}
          defaultValue={project?.description ?? ""}
          placeholder="Tell the story of this project — the brief, the challenges, and the outcome."
        />
        {state.fieldErrors?.description && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.description}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="buildingType">Building type</Label>
          <Select
            name="buildingType"
            defaultValue={project?.building_type ?? undefined}
            items={BUILDING_TYPE_ITEMS}
          >
            <SelectTrigger id="buildingType" className="w-full">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {BUILDING_TYPES.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="style">Style</Label>
          <Input
            id="style"
            name="style"
            defaultValue={project?.style ?? ""}
            placeholder="Modern, Minimalist, Traditional…"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="locationCity">City</Label>
          <Input
            id="locationCity"
            name="locationCity"
            defaultValue={project?.location_city ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="locationCountry">Country</Label>
          <Input
            id="locationCountry"
            name="locationCountry"
            defaultValue={project?.location_country ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bedrooms">Bedrooms</Label>
          <Input
            id="bedrooms"
            name="bedrooms"
            type="number"
            min={0}
            max={100}
            defaultValue={project?.bedrooms ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="floors">Floors</Label>
          <Input
            id="floors"
            name="floors"
            type="number"
            min={0}
            max={300}
            defaultValue={project?.floors ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div className="space-y-2">
          <Label htmlFor="budget">Budget</Label>
          <Input
            id="budget"
            name="budget"
            type="number"
            min={0}
            step="0.01"
            defaultValue={project?.budget ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="budgetCurrency">Currency</Label>
          <Input
            id="budgetCurrency"
            name="budgetCurrency"
            defaultValue={project?.budget_currency ?? "USD"}
            maxLength={8}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="completionDate">Completion date</Label>
          <Input
            id="completionDate"
            name="completionDate"
            type="date"
            defaultValue={project?.completion_date ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="client">Client (optional)</Label>
          <Input
            id="client"
            name="client"
            defaultValue={project?.client ?? ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="materials">Materials</Label>
        <Input
          id="materials"
          name="materials"
          defaultValue={project?.materials.join(", ") ?? ""}
          placeholder="Concrete, Glass, Timber, Steel"
        />
        <p className="text-xs text-muted-foreground">Separate with commas.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Visibility</Label>
        <Select
          name="status"
          defaultValue={project?.status ?? "published"}
          items={STATUS_ITEMS}
        >
          <SelectTrigger id="status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="published">Published — visible to everyone</SelectItem>
            <SelectItem value="draft">Draft — only you can see it</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending}>
        {pending
          ? "Saving…"
          : project
            ? "Save changes"
            : "Publish project"}
      </Button>
    </form>
  );
}
