"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileUp,
  PencilRuler,
  Save,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import {
  FloorPlanInput,
  type DraftPlan,
} from "@/components/tour/floor-plan-input";
import { PlanCanvas } from "@/features/berchuma-studio/components/plan/plan-canvas";
import { PlanEditor } from "@/features/berchuma-studio/components/plan/plan-editor";
import { floorArea } from "@/features/berchuma-studio/services/room-geometry";
import {
  rectangularRoom,
  type Room,
} from "@/features/berchuma-studio/types/room";
import { cn } from "@/lib/utils";

import { HouseObjectInspector } from "./house-object-inspector";
import { HousePreview } from "./house-preview";
import {
  houseDraftKey,
  readHouseDraft,
  writeHouseDraft,
} from "../services/draft";
import {
  createHouseProject,
  ensurePhaseTwoProject,
  houseStyles,
  type HouseProject,
  type HouseSelection,
  type HouseStyle,
} from "../types/project";

type Stage = "start" | "verify" | "model";
type Source = "upload" | "manual";
type WorkspaceView = "2d" | "3d" | "split";

const noSubscription = () => () => undefined;

export function HouseDesignerWorkspace({ userId }: { userId: string }) {
  const [stage, setStage] = useState<Stage>("start");
  const [source, setSource] = useState<Source>("manual");
  const [room, setRoom] = useState<Room>(() => rectangularRoom(8000, 6500));
  const [floorPlans, setFloorPlans] = useState<DraftPlan[]>([]);
  const [facades, setFacades] = useState<DraftPlan[]>([]);
  const [title, setTitle] = useState("My house");
  const [floorCount, setFloorCount] = useState(1);
  const [floorHeight, setFloorHeight] = useState(3000);
  const [style, setStyle] = useState<HouseStyle>("modern");
  const [strict, setStrict] = useState(true);
  const [project, setProject] = useState<HouseProject | null>(null);
  const [view, setView] = useState<WorkspaceView>("split");

  const draftKey = houseDraftKey(userId);
  const stored = useSyncExternalStore(
    noSubscription,
    () => safeRead(draftKey),
    () => null,
  );
  const savedDraft = useMemo(
    () => (stored ? readHouseDraft(window.localStorage, draftKey) : null),
    [draftKey, stored],
  );

  function choosePlans(next: DraftPlan[]) {
    const selected = next.slice(-1);
    setFloorPlans(selected);
    setRoom((current) => ({
      ...current,
      reference: selected[0]
        ? {
            url: selected[0].url,
            name: selected[0].title,
            mediaType: selected[0].mediaType,
            opacity: 0.45,
          }
        : undefined,
    }));
  }

  function openVerification(nextSource: Source) {
    setSource(nextSource);
    setRoom((current) => ({
      ...current,
      ceilingHeight: clamp(floorHeight, 1800, 6000),
    }));
    setStage("verify");
  }

  function generate(verified: Room) {
    const next = createHouseProject({
      id: project?.id,
      title,
      room: verified,
      style,
      strict,
      floorCount,
      floorToFloorHeight: floorHeight,
      referenceImages: references(floorPlans, facades),
    });
    setRoom(verified);
    setProject(next);
    setStage("model");
  }

  function restore() {
    if (!savedDraft) return;
    const restored = ensurePhaseTwoProject(savedDraft.project);
    const restoredRoom = restored.levels.find((level) => level.plan)?.plan;
    if (!restoredRoom) return;
    setProject(restored);
    setRoom(restoredRoom);
    setTitle(restored.metadata.title);
    setFloorCount(restored.plannedFloorCount);
    setFloorHeight(restored.levels[0]?.floorToFloorHeight ?? 3000);
    setStyle(restored.designStyle);
    setStrict(restored.originalPlanStrict);
    setFloorPlans(toDraftPlans(restored, "floor-plan"));
    setFacades(toDraftPlans(restored, "facade"));
    setStage("model");
  }

  function save() {
    if (!project) return;
    const next = {
      ...project,
      metadata: { ...project.metadata, updatedAt: new Date().toISOString() },
    };
    setProject(next);
    const saved = writeHouseDraft(window.localStorage, draftKey, next);
    toast[saved ? "success" : "error"](
      saved
        ? "House project saved on this device."
        : "This browser could not save the project.",
    );
  }

  function updateProject(next: HouseProject) {
    setProject(next);
    const groundPlan = next.levels[0]?.plan;
    if (groundPlan) setRoom(groundPlan);
  }

  function download() {
    if (!project) return;
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug(project.metadata.title) || "house-design"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden px-3 pb-44 pt-3 sm:px-5 md:pb-8">
      <header className="mb-4 flex min-w-0 items-center justify-between gap-3 rounded-2xl border bg-card p-3 sm:p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <Building2 className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">House Design</h1>
            <p className="truncate text-xs text-muted-foreground">
              Verified plan → structured data → editable 3D
            </p>
          </div>
        </div>
        {stage !== "start" ? (
          <button
            type="button"
            onClick={() => setStage(stage === "model" ? "verify" : "start")}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
          >
            <ArrowLeft className="size-3.5" />
            {stage === "model" ? "Edit plan" : "Start"}
          </button>
        ) : null}
      </header>

      {stage === "start" ? (
        <StartScreen
          userId={userId}
          source={source}
          onSource={setSource}
          floorPlans={floorPlans}
          onFloorPlans={choosePlans}
          facades={facades}
          onFacades={(plans) => setFacades(plans.slice(-1))}
          title={title}
          onTitle={setTitle}
          floorCount={floorCount}
          onFloorCount={setFloorCount}
          floorHeight={floorHeight}
          onFloorHeight={setFloorHeight}
          style={style}
          onStyle={setStyle}
          strict={strict}
          onStrict={setStrict}
          onContinue={() => openVerification(source)}
          onRestore={savedDraft ? restore : undefined}
        />
      ) : stage === "verify" ? (
        <VerifyScreen
          room={room}
          source={source}
          onDone={generate}
        />
      ) : project ? (
        <ModelScreen
          project={project}
          view={view}
          onView={setView}
          onProjectChange={updateProject}
          onSave={save}
          onDownload={download}
        />
      ) : null}
    </main>
  );
}

function StartScreen({
  userId,
  source,
  onSource,
  floorPlans,
  onFloorPlans,
  facades,
  onFacades,
  title,
  onTitle,
  floorCount,
  onFloorCount,
  floorHeight,
  onFloorHeight,
  style,
  onStyle,
  strict,
  onStrict,
  onContinue,
  onRestore,
}: {
  userId: string;
  source: Source;
  onSource: (source: Source) => void;
  floorPlans: DraftPlan[];
  onFloorPlans: (plans: DraftPlan[]) => void;
  facades: DraftPlan[];
  onFacades: (plans: DraftPlan[]) => void;
  title: string;
  onTitle: (value: string) => void;
  floorCount: number;
  onFloorCount: (value: number) => void;
  floorHeight: number;
  onFloorHeight: (value: number) => void;
  style: HouseStyle;
  onStyle: (value: HouseStyle) => void;
  strict: boolean;
  onStrict: (value: boolean) => void;
  onContinue: () => void;
  onRestore?: () => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">Create from</p>
          <h2 className="mt-1 text-2xl font-semibold">Start with a measured plan</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Upload a drawing to trace and verify, or draw the building footprint with exact millimetre dimensions.
          </p>
        </div>

        {onRestore ? (
          <button
            type="button"
            onClick={onRestore}
            className="flex w-full items-center justify-between rounded-xl border border-brand/30 bg-brand/5 p-3 text-left text-sm hover:bg-brand/10"
          >
            <span><strong>Continue saved house</strong><br /><span className="text-xs text-muted-foreground">Stored on this device</span></span>
            <CheckCircle2 className="size-5 text-brand" />
          </button>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <SourceCard
            active={source === "upload"}
            icon={<FileUp className="size-6" />}
            title="Upload Floor Plan"
            description="JPG, JPEG, PNG or PDF"
            onClick={() => onSource("upload")}
          />
          <SourceCard
            active={source === "manual"}
            icon={<PencilRuler className="size-6" />}
            title="Draw Floor Plan"
            description="Drag walls and enter exact dimensions"
            onClick={() => onSource("manual")}
          />
        </div>

        {source === "upload" ? (
          <FloorPlanInput
            userId={userId}
            plans={floorPlans}
            onChange={onFloorPlans}
            maxPlans={1}
            multiple={false}
            buttonLabel="Upload floor plan"
            help="JPG, JPEG, PNG or PDF, up to 25MB"
          />
        ) : (
          <div className="rounded-xl border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
            Begin with an 8000 × 6500 mm footprint, then drag corners, add wall points, doors and windows.
          </div>
        )}
      </section>

      <aside className="space-y-4 rounded-2xl border bg-card p-4">
        <h2 className="font-semibold">House information</h2>
        <label className="block space-y-1.5 text-xs text-muted-foreground">
          <span>Project name</span>
          <input value={title} onChange={(event) => onTitle(event.target.value)} maxLength={100} className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Floors" value={floorCount} min={1} max={6} step={1} onChange={onFloorCount} />
          <NumberField label="Floor-to-floor" value={floorHeight} min={2200} max={6000} step={0.1} suffix="mm" onChange={onFloorHeight} />
        </div>
        <label className="block space-y-1.5 text-xs text-muted-foreground">
          <span>Architectural style</span>
          <select value={style} onChange={(event) => onStyle(event.target.value as HouseStyle)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm capitalize text-foreground">
            {houseStyles.map((item) => <option key={item} value={item}>{labelStyle(item)}</option>)}
          </select>
        </label>
        <label className="flex items-start gap-2 rounded-xl border p-3 text-sm">
          <input type="checkbox" checked={strict} onChange={(event) => onStrict(event.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
          <span><strong className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-brand" /> Original Floor Plan Strict</strong><span className="mt-1 block text-xs text-muted-foreground">Locks verified footprint and plan geometry for later style changes.</span></span>
        </label>

        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium">Optional front façade / reference</p>
          <FloorPlanInput
            userId={userId}
            plans={facades}
            onChange={onFacades}
            maxPlans={1}
            multiple={false}
            buttonLabel="Upload façade reference"
            help="JPG, JPEG or PNG recommended"
            contentType="project_image"
            publicBucket="project-images"
          />
        </div>

        <button
          type="button"
          onClick={onContinue}
          disabled={source === "upload" && floorPlans.length === 0}
          className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-foreground disabled:opacity-40"
        >
          {source === "upload" ? "Verify floor plan" : "Draw floor plan"}
        </button>
      </aside>
    </div>
  );
}

function VerifyScreen({ room, source, onDone }: { room: Room; source: Source; onDone: (room: Room) => void }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3">
        <div>
          <h2 className="font-semibold">Verify the plan before 3D</h2>
          <p className="text-xs text-muted-foreground">Correct the outline, wall thickness, dimensions, doors and windows.</p>
        </div>
        <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
          {source === "upload" ? "Uploaded plan" : "Manual plan"}
        </span>
      </div>
      {room.reference?.mediaType === "pdf" ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300">
          PDF uploaded. Use the visible filename as reference and enter the verified dimensions here; image overlay is available for JPG and PNG plans.
        </p>
      ) : null}
      <div className="h-[min(760px,calc(100dvh-220px))] min-h-[560px]">
        <PlanEditor
          initial={room}
          purpose="house"
          doneLabel="Plan Correct — Generate House"
          onDone={onDone}
        />
      </div>
    </section>
  );
}

function ModelScreen({
  project,
  view,
  onView,
  onProjectChange,
  onSave,
  onDownload,
}: {
  project: HouseProject;
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  onProjectChange: (project: HouseProject) => void;
  onSave: () => void;
  onDownload: () => void;
}) {
  const [activeLevelId, setActiveLevelId] = useState(project.levels[0]?.id ?? "ground-floor");
  const [visibleLevelIds, setVisibleLevelIds] = useState<Set<string>>(
    () => new Set(project.levels.map((level) => level.id)),
  );
  const [selected, setSelected] = useState<HouseSelection | null>(null);
  const activeLevel = project.levels.find((level) => level.id === activeLevelId) ?? project.levels[0];
  const activeRoom = activeLevel?.plan;

  function chooseLevel(levelId: string) {
    setActiveLevelId(levelId);
    setSelected({ kind: "level", id: levelId });
  }

  function toggleLevel(levelId: string) {
    setVisibleLevelIds((current) => {
      const next = new Set(current);
      if (next.has(levelId)) next.delete(levelId);
      else next.add(levelId);
      return next;
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex min-w-0 items-center justify-between gap-2 overflow-x-auto rounded-xl border bg-card p-2">
        <div className="flex shrink-0 rounded-lg bg-muted p-1">
          {(["2d", "3d", "split"] as const).map((item) => (
            <button key={item} type="button" onClick={() => onView(item)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium uppercase", view === item ? "bg-background text-brand shadow-sm" : "text-muted-foreground")}>{item === "split" ? "Split" : item}</button>
          ))}
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={onDownload} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs hover:bg-muted"><Download className="size-3.5" /> Data</button>
          <button type="button" onClick={onSave} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-medium text-brand-foreground"><Save className="size-3.5" /> Save</button>
        </div>
      </div>

      <div className="flex min-w-0 gap-2 overflow-x-auto rounded-xl border bg-card p-2">
        {project.levels.map((level) => {
          const visible = visibleLevelIds.has(level.id);
          return (
            <div key={level.id} className={cn("flex shrink-0 items-center rounded-lg border", activeLevelId === level.id && "border-brand bg-brand/5")}>
              <button type="button" onClick={() => chooseLevel(level.id)} className="px-3 py-2 text-xs font-medium">{level.name}</button>
              <button type="button" onClick={() => toggleLevel(level.id)} aria-label={`${visible ? "Hide" : "Show"} ${level.name}`} className="border-l p-2 text-muted-foreground hover:text-foreground">
                {visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              </button>
            </div>
          );
        })}
      </div>

      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className={cn("grid min-w-0 gap-3", view === "split" ? "lg:grid-cols-2" : "grid-cols-1")}>
          {view !== "3d" && activeRoom ? (
            <div className="relative min-h-[340px] min-w-0 overflow-hidden rounded-xl border bg-background">
              <div className="pointer-events-none absolute inset-0"><PlanCanvas room={activeRoom} onChange={() => undefined} /></div>
              <span className="absolute left-3 top-3 rounded-full border bg-background/90 px-3 py-1 text-xs font-medium">{activeLevel?.name} · mm</span>
            </div>
          ) : null}
          {view !== "2d" ? (
            <HousePreview
              project={project}
              visibleLevelIds={visibleLevelIds}
              selected={selected}
              onSelect={setSelected}
              className="h-[min(620px,62dvh)]"
            />
          ) : null}
        </div>
        <HouseObjectInspector
          project={project}
          activeLevelId={activeLevelId}
          selected={selected}
          onSelect={setSelected}
          onChange={onProjectChange}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Level area" value={activeRoom ? `${floorArea(activeRoom).toFixed(2)} m²` : "—"} />
        <Summary label="Structured walls" value={String(project.walls.length)} />
        <Summary label="Openings" value={`${project.doors.length} doors · ${project.windows.length} windows`} />
        <Summary label="Building elements" value={`${project.levels.length} levels · ${project.stairs.length} stairs · ${project.roofs.length} roof`} />
      </div>

      <div className="rounded-xl border bg-card p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Phase 2 model:</strong> levels, openings, slabs, stairs and roofs are generated as editable structured objects. Select them in 3D or from the inspector to change exact dimensions and materials.
      </div>
    </section>
  );
}

function SourceCard({ active, icon, title, description, onClick }: { active: boolean; icon: React.ReactNode; title: string; description: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn("rounded-2xl border p-5 text-left transition-colors", active ? "border-brand bg-brand/5" : "hover:border-brand/40 hover:bg-muted/30")}>
      <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-brand/10 text-brand">{icon}</span>
      <strong className="block">{title}</strong>
      <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
    </button>
  );
}

function NumberField({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <label className="space-y-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      <span className="flex rounded-lg border bg-background px-2">
        <input type="number" value={value} min={min} max={max} step={step} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(clamp(next, min, max)); }} className="min-w-0 flex-1 bg-transparent py-2 text-right text-sm text-foreground outline-none" />
        {suffix ? <span className="ml-1 self-center text-[11px]">{suffix}</span> : null}
      </span>
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-card p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{value}</p></div>;
}

function references(plans: DraftPlan[], facades: DraftPlan[]): HouseProject["referenceImages"] {
  return [
    ...plans.map((plan) => ({ id: plan.key, kind: "floor-plan" as const, name: plan.title, url: plan.url, mediaType: plan.mediaType })),
    ...facades.map((plan) => ({ id: plan.key, kind: "facade" as const, name: plan.title, url: plan.url, mediaType: plan.mediaType })),
  ];
}

function toDraftPlans(project: HouseProject, kind: "floor-plan" | "facade"): DraftPlan[] {
  return project.referenceImages.filter((image) => image.kind === kind).map((image) => ({ key: image.id, title: image.name, url: image.url, mediaType: image.mediaType }));
}

function safeRead(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

function slug(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

function labelStyle(value: HouseStyle) { return value.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "); }
