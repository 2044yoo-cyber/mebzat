"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";

import {
  createProject,
  updateProject,
  type ProjectFormState,
} from "@/app/(dashboard)/projects/actions";
import { MaterialSelector } from "@/components/projects/material-selector";
import {
  ProjectImagesInput,
  type ProjectImagesValue,
} from "@/components/projects/project-images-input";
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
import {
  DEFAULT_PROJECT_CATEGORY,
  PROJECT_CATEGORIES,
  PROJECT_CATEGORY_MAP,
  fieldsFor,
  isProjectCategory,
  type CategoryField,
  type ProjectCategory,
} from "@/lib/constants/project-categories";
import {
  applyDraftToForm,
  clearDraft,
  draftKey,
  isDraftWorthKeeping,
  readDraft,
  valuesFromForm,
  writeDraft,
  type ProjectDraft,
} from "@/lib/projects/draft";
import type { Project } from "@/types/database.types";

const initialState: ProjectFormState = {};

const STATUS_ITEMS = {
  published: "Published - anyone can see it",
  draft: "Draft - only you can see it",
  private: "Private - finished, but kept to yourself",
  archived: "Archived - put away",
};

const SAVE_DEBOUNCE_MS = 600;

/**
 * No subscription.
 *
 * The draft is read once, when the form opens. A `storage` listener would tell
 * this tab about writes from *other* tabs, and having a second tab's
 * keystrokes rewrite the form under someone's hands is worse than not knowing.
 */
function subscribeToNothing(): () => void {
  return () => {};
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "unavailable";

/**
 * One category-specific field.
 *
 * Rendered from the spec rather than written out per category, so the form and
 * the project page cannot drift: both ask `fieldsFor(category)` and neither
 * has a list of its own to forget to update.
 */
function CategoryFieldInput({
  field,
  value,
}: {
  field: CategoryField;
  value?: string | number | boolean | null;
}) {
  // A column field keeps the form-field name 0004's action already reads. A
  // metadata field is namespaced so the action can tell the two apart without
  // a second list of which is which.
  const name = field.source === "column" ? field.id : `meta.${field.id}`;
  const id = `field-${field.id}`;
  const asString =
    value === null || value === undefined ? "" : String(value);

  if (field.kind === "boolean") {
    return (
      <label
        htmlFor={id}
        className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm"
      >
        <input
          id={id}
          name={name}
          type="checkbox"
          defaultChecked={value === true || value === "true"}
          className="size-4 accent-[var(--brand)]"
        />
        {field.label}
      </label>
    );
  }

  if (field.kind === "select") {
    const items = Object.fromEntries(
      (field.options ?? []).map((o) => [o.value, o.label]),
    );
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{field.label}</Label>
        <Select name={name} defaultValue={asString || undefined} items={items}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{field.label}</Label>
      <Input
        id={id}
        name={name}
        type={field.kind === "number" ? "number" : "text"}
        min={field.min}
        max={field.max}
        defaultValue={asString}
        placeholder={field.placeholder}
      />
    </div>
  );
}

export function ProjectForm({
  userId,
  project,
  initialImageUrls = [],
  companies = [],
}: {
  userId: string;
  project?: Project;
  initialImageUrls?: string[];
  /** Only the companies this person belongs to. 0080 refuses any other. */
  companies?: { id: string; name: string }[];
}) {
  const action = project
    ? updateProject.bind(null, project.id)
    : createProject;
  const [state, formAction, pending] = useActionState(action, initialState);

  const formRef = useRef<HTMLFormElement>(null);
  const key = draftKey(userId, project?.id);

  const [category, setCategory] = useState<ProjectCategory>(() =>
    project && isProjectCategory(project.category)
      ? project.category
      : DEFAULT_PROJECT_CATEGORY,
  );

  const metadata = (project?.metadata ?? {}) as Record<string, unknown>;

  const [images, setImages] = useState<ProjectImagesValue>({
    urls: initialImageUrls,
    primary: project?.cover_image_url ?? initialImageUrls[0] ?? null,
  });
  // The debounced save fires after the render that set `images`, but it is
  // scheduled during the handler that changed them, so reading state there
  // would write the previous set. The ref is what the save actually reads.
  const imagesRef = useRef(images);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [restoreNonce, setRestoreNonce] = useState(0);

  /**
   * The draft as it was when this form opened.
   *
   * Read through `useSyncExternalStore` rather than in an effect. localStorage
   * does not exist while this renders on the server, so the server snapshot is
   * null and the client's is the stored string — which is exactly what this
   * hook is for, and is why there is no hydration mismatch and no render where
   * the banner flashes in.
   *
   * The snapshot is taken once and held: without the ref, every autosave would
   * change the stored string, the snapshot would differ, and React would
   * re-render the form on its own writes.
   */
  const snapshot = useRef<string | null | undefined>(undefined);
  const stored = useSyncExternalStore(
    subscribeToNothing,
    () => {
      if (snapshot.current === undefined) {
        try {
          snapshot.current = window.localStorage.getItem(key);
        } catch {
          snapshot.current = null;
        }
      }
      return snapshot.current;
    },
    () => null,
  );

  const found = useMemo<ProjectDraft | null>(() => {
    if (!stored) return null;
    try {
      return readDraft(window.localStorage, key);
    } catch {
      return null;
    }
  }, [stored, key]);

  // Whether the person has answered the restore question. Until they have,
  // autosave is held off, so it cannot overwrite the draft being offered.
  const [answered, setAnswered] = useState(false);
  const hasOffer = !answered && isDraftWorthKeeping(found);
  const offer = hasOffer ? found : null;
  const settled = answered || !isDraftWorthKeeping(found);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    setSaveState("saving");
    const ok = writeDraft(window.localStorage, key, {
      values: valuesFromForm(form),
      images: imagesRef.current.urls,
      primary: imagesRef.current.primary,
    });
    setSaveState(ok ? "saved" : "unavailable");
  }, [key]);

  const queueSave = useCallback(() => {
    if (!settled) return;
    setSaveState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_DEBOUNCE_MS);
  }, [save, settled]);

  /**
   * An upload finishing is a change worth saving on its own, and the one that
   * costs the most to lose: the file is already in storage and paid for, and
   * only the reference to it was in memory.
   */
  const imagesChanged = useCallback(
    (value: ProjectImagesValue) => {
      imagesRef.current = value;
      setImages(value);
      queueSave();
    },
    [queueSave],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function continueDraft() {
    const form = formRef.current;
    if (!form || !offer) return;

    applyDraftToForm(form, offer.values);

    // The category is not an ordinary input — it decides which inputs exist —
    // so it is restored through state, and the fields it brings with it are
    // filled on the next tick, once they have been rendered.
    const saved = offer.values.category;
    if (isProjectCategory(saved) && saved !== category) {
      setCategory(saved);
      const values = offer.values;
      setTimeout(() => {
        if (formRef.current) applyDraftToForm(formRef.current, values);
      }, 0);
    }

    imagesRef.current = { urls: offer.images, primary: offer.primary };
    setImages(imagesRef.current);
    setRestoreNonce((n) => n + 1);
    setAnswered(true);
  }

  function discardDraft() {
    clearDraft(window.localStorage, key);
    snapshot.current = null;
    setAnswered(true);
  }

  const fields = fieldsFor(category);

  return (
    <form
      ref={formRef}
      action={formAction}
      onInput={queueSave}
      onChange={queueSave}
      className="space-y-6"
    >
      {offer && (
        <div className="space-y-3 rounded-xl border border-brand/40 bg-brand/5 p-4">
          <p className="text-sm font-medium">
            You have an unfinished project draft.
          </p>
          <p className="text-xs text-muted-foreground">
            {offer.images.length > 0
              ? `${offer.images.length} ${offer.images.length === 1 ? "image" : "images"} and the details you had typed.`
              : "The details you had typed."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={continueDraft}>
              <RotateCcw className="size-4" /> Continue draft
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={discardDraft}
            >
              Discard
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="category">Project category</Label>
        <Select
          name="category"
          value={category}
          onValueChange={(value) => {
            if (isProjectCategory(value)) setCategory(value);
            queueSave();
          }}
          items={PROJECT_CATEGORY_MAP}
        >
          <SelectTrigger id="category" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROJECT_CATEGORIES.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {state.fieldErrors?.category && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.category}
          </p>
        )}
      </div>

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
        <ProjectImagesInput
          userId={userId}
          initialUrls={images.urls}
          initialPrimary={images.primary}
          onChange={imagesChanged}
          // Remounted when a draft is restored, so the thumbnails come from
          // the restored set rather than from the props it first mounted
          // with. Comparing the two lists instead would remount on any
          // ordinary edit that happened to end up matching.
          key={restoreNonce}
        />
        <p className="text-xs text-muted-foreground">
          Up to 6. The first is the cover unless you pick another.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={5}
          defaultValue={project?.description ?? ""}
          placeholder="The brief, what you did, and how it turned out."
        />
        {state.fieldErrors?.description && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.description}
          </p>
        )}
      </div>

      {/* Only this category's fields. A wardrobe is never asked its bedrooms,
          and a kitchen is never asked how many floors the building has. */}
      {fields.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <CategoryFieldInput
              key={field.id}
              field={field}
              value={
                field.source === "column"
                  ? ((project?.[field.id as keyof Project] ?? "") as string)
                  : (metadata[field.id] as string | undefined)
              }
            />
          ))}
        </div>
      )}

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
            defaultValue={project?.location_country ?? "Ethiopia"}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="style">Style (optional)</Label>
          <Input
            id="style"
            name="style"
            defaultValue={project?.style ?? ""}
            placeholder="Modern, minimalist, traditional"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="completionDate">Completed</Label>
          <Input
            id="completionDate"
            name="completionDate"
            type="date"
            defaultValue={project?.completion_date ?? ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags">Tags / skills used</Label>
        <Input
          id="tags"
          name="tags"
          defaultValue={(project?.tags ?? []).join(", ")}
          placeholder="Joinery, spray finish, site supervision"
        />
        <p className="text-xs text-muted-foreground">
          Separate with commas.
        </p>
      </div>

      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          More details
        </summary>
        <div className="mt-4 space-y-4">
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
                defaultValue={project?.budget_currency ?? "ETB"}
                maxLength={8}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client">Client (optional)</Label>
            <Input id="client" name="client" defaultValue={project?.client ?? ""} />
          </div>

          {/* Only offered to somebody who belongs to a business. A project is
              usually one person's own work and names no company at all. */}
          {companies.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="companyId">Built under</Label>
              <select
                id="companyId"
                name="companyId"
                defaultValue={project?.company_id ?? ""}
                className="min-h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Just me</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Materials</Label>
            <MaterialSelector defaultValue={project?.materials ?? []} />
          </div>
        </div>
      </details>

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
            {Object.entries(STATUS_ITEMS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      {/* Above the bottom navigation on a phone, which used to sit over it. */}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <Button type="submit" disabled={pending} className="min-h-11">
          {pending
            ? "Saving"
            : project
              ? "Save changes"
              : "Publish project"}
        </Button>
        <DraftStatus state={saveState} />
      </div>
    </form>
  );
}

function DraftStatus({ state }: { state: SaveState }) {
  if (state === "idle") return null;

  const text =
    state === "saving"
      ? "Saving"
      : state === "saved"
        ? "Saved"
        : state === "dirty"
          ? "Unsaved changes"
          : "This browser will not keep a draft";

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {state === "saving" && <Loader2 className="size-3 animate-spin" />}
      {state === "saved" && <Check className="size-3" />}
      {text}
    </span>
  );
}
