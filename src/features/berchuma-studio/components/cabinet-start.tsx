"use client";

import { useMemo, useState } from "react";
import { Archive, ArrowLeft, ArrowRight, Briefcase, ChefHat, Droplets, Footprints, Monitor, Shapes, Sparkles } from "lucide-react";

import { Cabinet } from "@/components/icons/cabinet";
import { cn } from "@/lib/utils";

import { KitchenSetup } from "./kitchen-setup";
import { TemplateThumb } from "./template-thumb";
import { LengthField } from "./ui/length-field";
import {
  CABINET_MATERIALS,
  CABINET_TYPES,
  buildTemplate,
  findTemplate,
  templatesFor,
  withMaterial,
  type CabinetTemplate,
  type CabinetType,
  type Space,
  type WardrobeLayout,
} from "../services/cabinet-templates";
import { wardrobeWalls } from "../services/starting-designs";
import type { DesignKind, DesignSpec } from "../types/spec";

/**
 * Cabinet Design's way in: type, space, layout, template, material, create.
 *
 * One question a screen, because on a phone that is what fits and because
 * every answer narrows the next: a wardrobe asks about its walls, a kitchen
 * hands over to the kitchen setup that knows about fridges and sinks, and the
 * templates on offer are the ones for the type and layout already chosen,
 * drawn at the size already entered. Nothing here is a picture of a design —
 * each template card is the design that "Create" will open, built from the
 * same generators, so what you pick is what you get, and all of it editable.
 */

type Step = "type" | "space" | "layout" | "template" | "material";

const ICONS: Record<CabinetType, typeof ChefHat> = {
  wardrobe: Cabinet,
  kitchen: ChefHat,
  vanity: Droplets,
  tv_unit: Monitor,
  shoe: Footprints,
  storage: Archive,
  office: Briefcase,
  custom: Shapes,
};

const LAYOUTS: { value: WardrobeLayout; label: string; path: string }[] = [
  { value: "straight", label: "Straight", path: "M12 12H68" },
  { value: "l_shaped", label: "L shape", path: "M12 12H68V48" },
  { value: "u_shaped", label: "U shape", path: "M12 48V12H68V48" },
];

const KITCHEN_SHAPES: Record<string, string> = {
  straight: "M12 12H68",
  l_shaped: "M12 12H68V48",
  u_shaped: "M12 48V12H68V48",
  g_shaped: "M12 48V12H68V48H44",
  island: "M12 12H68M28 44H52",
};

const PRIORITIES = [
  { value: "storage", label: "Maximum Storage" },
  { value: "balanced", label: "Balanced" },
  { value: "decorative", label: "Decorative" },
] as const;

/** The legacy design kinds the studio can be opened at, mapped to a cabinet type. */
function typeOfKind(kind: DesignKind | undefined): CabinetType | null {
  switch (kind) {
    case "wardrobe":
    case "kitchen":
    case "vanity":
    case "tv_unit":
    case "custom":
      return kind;
    case "bookshelf":
    case "shelving":
      return "storage";
    case "office_storage":
      return "office";
    default:
      return null;
  }
}

function stepsFor(type: CabinetType | null): Step[] {
  if (type === "kitchen") return ["type", "template", "material"];
  if (type === "wardrobe") return ["type", "space", "layout", "template", "material"];
  return ["type", "space", "template", "material"];
}

const STEP_LABELS: Record<Step, string> = { type: "Type", space: "Space", layout: "Layout", template: "Template", material: "Material" };

export function CabinetStart({
  onStart,
  initialKind,
  initialWidth,
  initialTemplate,
}: {
  onStart: (spec: DesignSpec) => void;
  initialKind?: DesignKind;
  initialWidth?: number;
  /** Opened from the gallery's "Use Template": that type, that template, then the space. */
  initialTemplate?: string;
}) {
  const fromGallery = initialTemplate ? findTemplate(initialTemplate) : undefined;
  const initialType = fromGallery?.type ?? typeOfKind(initialKind);
  const [type, setType] = useState<CabinetType | null>(initialType);
  const [step, setStep] = useState<Step>(initialType ? (initialType === "kitchen" ? "template" : "space") : "type");
  const [space, setSpace] = useState<Space>(() => {
    const base = CABINET_TYPES.find((entry) => entry.type === initialType)?.space ?? CABINET_TYPES[0]!.space;
    return { ...base, width: initialWidth ?? base.width };
  });
  const [layout, setLayout] = useState<WardrobeLayout>(fromGallery?.layouts?.[0] ?? "straight");
  const [walls, setWalls] = useState<number[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(fromGallery?.id ?? null);
  const [boardId, setBoardId] = useState<string>(CABINET_MATERIALS[0]?.id ?? "mdf-18-white");
  const [priority, setPriority] = useState<"storage" | "balanced" | "decorative">("balanced");
  const [ends, setEnds] = useState<{ leftEnd: "wall" | "open"; rightEnd: "wall" | "open" }>({ leftEnd: "wall", rightEnd: "wall" });

  const steps = stepsFor(type);
  const at = steps.indexOf(step);
  const chosenType = CABINET_TYPES.find((entry) => entry.type === type) ?? null;

  const wallsFor = (shape: WardrobeLayout): number[] =>
    shape === "l_shaped" ? [space.width, 1800] : shape === "u_shaped" ? [1800, space.width, 1800] : [space.width];
  const currentWalls = layout === "straight" ? [space.width] : walls.length === wardrobeWalls(layout).length ? walls : wallsFor(layout);

  const templates = useMemo(
    () => (type ? templatesFor(type).filter((template) => type !== "wardrobe" || (template.layouts ?? ["straight"]).includes(layout)) : []),
    [type, layout],
  );
  const template = templates.find((entry) => entry.id === templateId) ?? templates[0] ?? null;

  // The cards' designs, built once per space rather than on every render: a
  // grid of ten wardrobes is ten sets of parts.
  const wallKey = currentWalls.join(",");
  const previews = useMemo(() => {
    if (step !== "template") return new Map<string, DesignSpec | null>();
    const walls = wallKey.split(",").map(Number);
    return new Map(templates.map((entry) => [entry.id, entry.build ? buildTemplate(entry.id, space, { layout, walls }) : null]));
  }, [step, templates, space, layout, wallKey]);

  const choose = (next: CabinetType) => {
    setType(next);
    const base = CABINET_TYPES.find((entry) => entry.type === next)!.space;
    setSpace({ ...base });
    setLayout("straight");
    setWalls([]);
    setTemplateId(null);
    setStep(next === "kitchen" ? "template" : "space");
  };

  const build = (entry: CabinetTemplate, material?: string): DesignSpec | null =>
    buildTemplate(entry.id, space, { layout, walls: currentWalls, boardId: material, priority, ends: layout === "straight" ? ends : undefined });

  const go = (direction: 1 | -1) => {
    const next = steps[at + direction];
    if (next) setStep(next);
  };

  return (
    <div className="space-y-3" data-cabinet-start>
      {/* Where you are. Tappable backwards, never forwards past an unanswered question. */}
      <ol className="flex flex-wrap items-center gap-1 text-[11px]" aria-label="Steps">
        {steps.map((entry, index) => (
          <li key={entry}>
            <button
              type="button"
              disabled={index > at}
              aria-current={entry === step ? "step" : undefined}
              onClick={() => setStep(entry)}
              className={cn(
                "rounded-full border px-2 py-0.5 transition-colors",
                entry === step ? "border-brand bg-brand text-brand-foreground" : index < at ? "border-brand/50 text-foreground" : "text-muted-foreground",
              )}
            >
              {index + 1}. {STEP_LABELS[entry]}
            </button>
          </li>
        ))}
      </ol>

      {step === "type" ? (
        <div className="grid grid-cols-2 gap-2 @lg/ws:grid-cols-4" role="group" aria-label="Cabinet type">
          {CABINET_TYPES.map((entry) => {
            const Icon = ICONS[entry.type];
            return (
              <button
                key={entry.type}
                type="button"
                aria-pressed={type === entry.type}
                onClick={() => choose(entry.type)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  type === entry.type ? "border-brand bg-brand/5" : "hover:border-brand/50 hover:bg-muted/40",
                )}
              >
                <Icon className="size-5 text-brand" aria-hidden />
                <span className="mt-1.5 block text-sm font-medium">{entry.label}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">{entry.hint}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {step === "space" && chosenType ? (
        <div className="space-y-2 rounded-xl border p-4">
          <span className="text-sm font-medium">The space for your {chosenType.label.toLowerCase()}</span>
          <p className="text-[11px] text-muted-foreground">What a tape measure reads. Templates are laid out to fit it.</p>
          <LengthField label="Width" value={space.width} min={300} max={8000} step={50} onChange={(width) => setSpace((current) => ({ ...current, width }))} />
          <LengthField label="Height" value={space.height} min={300} max={3200} step={50} onChange={(height) => setSpace((current) => ({ ...current, height }))} />
          <LengthField label="Depth" value={space.depth} min={150} max={900} step={10} onChange={(depth) => setSpace((current) => ({ ...current, depth }))} />
        </div>
      ) : null}

      {step === "layout" && type === "wardrobe" ? (
        <div className="space-y-3 rounded-xl border p-4">
          <span className="text-sm font-medium">Wardrobe layout</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Wardrobe layout">
            {LAYOUTS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                aria-pressed={layout === entry.value}
                onClick={() => {
                  setLayout(entry.value);
                  setWalls(wallsFor(entry.value));
                  setTemplateId(null);
                }}
                className={cn(
                  "flex flex-1 basis-24 flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-colors",
                  layout === entry.value ? "border-brand bg-brand/5 text-foreground" : "text-muted-foreground hover:border-brand",
                )}
              >
                <svg viewBox="0 0 80 60" className="h-8 w-16" aria-hidden>
                  <path d={entry.path} fill="none" stroke="currentColor" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {entry.label}
              </button>
            ))}
          </div>
          {layout === "straight" ? null : (
            <div className="space-y-2">
              {wardrobeWalls(layout).map((wall, index) => (
                <LengthField
                  key={wall.id}
                  label={wall.label}
                  value={currentWalls[index] ?? 1800}
                  min={600}
                  max={6000}
                  step={50}
                  onChange={(value) => setWalls(currentWalls.map((length, place) => (place === index ? value : length)))}
                />
              ))}
              <p className="text-[10px] text-muted-foreground">Each corner takes a {space.depth} mm square out of both walls it joins.</p>
            </div>
          )}
        </div>
      ) : null}

      {step === "template" && type ? (
        <div className="space-y-2">
          <span className="text-sm font-medium">Choose a template</span>
          <div className="grid grid-cols-2 gap-2 @lg/ws:grid-cols-3" role="group" aria-label="Templates">
            {templates.map((entry) => (
              <TemplateCard key={entry.id} template={entry} selected={template?.id === entry.id} spec={previews.get(entry.id) ?? null} onSelect={() => setTemplateId(entry.id)} />
            ))}
          </div>
        </div>
      ) : null}

      {step === "material" && type ? (
        <div className="space-y-3 rounded-xl border p-4">
          <span className="text-sm font-medium">Material</span>
          <div className="grid grid-cols-2 gap-2 @lg/ws:grid-cols-3" role="radiogroup" aria-label="Material">
            {CABINET_MATERIALS.map((board) => (
              <button
                key={board.id}
                type="button"
                role="radio"
                aria-checked={boardId === board.id}
                onClick={() => setBoardId(board.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-2 text-left text-xs transition-colors",
                  boardId === board.id ? "border-brand bg-brand/5" : "hover:border-brand/50",
                )}
              >
                <span className="size-6 shrink-0 rounded border" style={{ background: board.appearance?.hex ?? "#ddd" }} aria-hidden />
                <span className="leading-snug">{board.label}</span>
              </button>
            ))}
          </div>

          {type === "wardrobe" ? (
            <div className="space-y-1.5">
              <span className="text-[11px] text-muted-foreground">Design priority</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Design priority">
                {PRIORITIES.map((entry) => (
                  <button
                    key={entry.value}
                    type="button"
                    aria-pressed={priority === entry.value}
                    onClick={() => setPriority(entry.value)}
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors",
                      priority === entry.value ? "border-brand bg-brand/5 text-foreground" : "text-muted-foreground hover:border-brand",
                    )}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
              {layout === "straight" ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {(["leftEnd", "rightEnd"] as const).map((end) => (
                    <label key={end} className="space-y-0.5 text-[11px] text-muted-foreground">
                      {end === "leftEnd" ? "Left end" : "Right end"}
                      <select
                        value={ends[end]}
                        onChange={(event) => setEnds((previous) => ({ ...previous, [end]: event.target.value as "wall" | "open" }))}
                        className="h-8 w-full rounded-md border bg-background px-1.5 text-xs text-foreground"
                      >
                        <option value="wall">Against a wall</option>
                        <option value="open">Open to the room</option>
                      </select>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {type === "kitchen" ? (
            // The kitchen's own setup takes it from here: the room, the
            // shape, and where the fridge, sink and stove go. The template
            // chose its starting shape; the material is applied to what it
            // makes.
            <KitchenSetup
              key={template?.id}
              initial={template?.kitchen}
              submitLabel="Create kitchen"
              onStart={(spec) => onStart(withMaterial(spec, boardId))}
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-2">
        {at > 0 ? (
          <button
            type="button"
            onClick={() => go(-1)}
            className="flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted/40"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </button>
        ) : null}
        {step === "type" ? null : step === "material" ? (
          type === "kitchen" ? null : (
            <button
              type="button"
              disabled={!template}
              onClick={() => {
                const spec = template ? build(template, boardId) : null;
                if (spec) onStart(spec);
              }}
              // `pr-actions-safe` keeps the label clear of the floating
              // buttons in the corner, as the start panel's button does.
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 pr-actions-safe text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50"
            >
              <Sparkles className="size-4" aria-hidden />
              Create {template ? template.label.toLowerCase() : "design"}
            </button>
          )
        ) : (
          <button
            type="button"
            disabled={step === "template" && !template}
            onClick={() => {
              if (step === "template" && template) setTemplateId(template.id);
              go(1);
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 pr-actions-safe text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-50"
          >
            Next: {STEP_LABELS[steps[at + 1] ?? "material"]}
            <ArrowRight className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

function TemplateCard({ template, spec, selected, onSelect }: { template: CabinetTemplate; spec: DesignSpec | null; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn("flex flex-col rounded-xl border p-2 text-left transition-colors", selected ? "border-brand bg-brand/5" : "hover:border-brand/50 hover:bg-muted/40")}
    >
      <span className="flex h-24 items-center justify-center rounded-lg bg-muted/30 p-1.5 text-foreground/70">
        {spec ? (
          <TemplateThumb spec={spec} className="h-full w-full" />
        ) : template.kitchen?.shape ? (
          <svg viewBox="0 0 80 60" className="h-12 w-20" aria-hidden>
            <path d={KITCHEN_SHAPES[template.kitchen.shape] ?? KITCHEN_SHAPES.straight} fill="none" stroke="currentColor" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <span className="mt-1.5 block text-xs font-medium">{template.label}</span>
      <span className="block text-[10px] leading-snug text-muted-foreground">{template.blurb}</span>
    </button>
  );
}
