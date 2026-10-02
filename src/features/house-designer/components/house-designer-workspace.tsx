"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Loader2,
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
  roomSchema,
  type Room,
} from "@/features/berchuma-studio/types/room";
import { cn } from "@/lib/utils";

import { HouseAiRemodelPanel } from "./house-ai-remodel-panel";
import { HouseFacadePanel } from "./house-facade-panel";
import {
  HouseCommandPalette,
  HouseContextMenu,
  HouseProjectBrowser,
  HouseRibbon,
  HouseSchedulePanel,
  HouseShortcutHelp,
  HouseStatusBar,
  type HouseContextMenuState,
} from "./house-modeling-chrome";
import { HouseObjectInspector } from "./house-object-inspector";
import { HousePlanSelectionOverlay } from "./house-plan-selection-overlay";
import { HousePreview } from "./house-preview";
import { HouseStructurePanel } from "./house-structure-panel";
import {
  houseDraftKey,
  readHouseDraft,
  writeHouseDraft,
} from "../services/draft";
import { ensurePhaseThreeProject } from "../services/facade";
import { ensureHouseEnvelopeProject } from "../services/envelope";
import { ensurePhaseFourProject } from "../services/structure";
import {
  commandFromChord,
  commandFromKeyboard,
  houseCommand,
  isModelTextInput,
  type HouseCommandCategory,
  type HouseCommandId,
} from "../services/command-registry";
import {
  alignHouseSelections,
  createDefaultHouseObject,
  deleteHouseSelections,
  duplicateHouseSelections,
  groupHouseSelections,
  joinHouseSelections,
  mirrorHouseSelections,
  moveHouseSelections,
  pinHouseSelections,
  rotateHouseSelections,
  setHouseObjectType,
  splitHouseSelection,
  type HouseClipboard,
} from "../services/model-commands";
import {
  allHouseSelections,
  ensureHouseBimState,
  sameSelection,
} from "../services/model-state";
import {
  createHouseProject,
  ensurePhaseTwoProject,
  houseStyles,
  type HouseProject,
  type HouseObjectKind,
  type HouseSelection,
  type HouseStyle,
  type HouseViewState,
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
  const [analysingPlan, setAnalysingPlan] = useState(false);
  const [planAnalysis, setPlanAnalysis] = useState<string | null>(null);
  const [saveState, setSaveState] = useState("Saved");

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

  useEffect(() => {
    if (!project || stage !== "model") return;
    const timer = window.setTimeout(() => {
      const saved = writeHouseDraft(window.localStorage, draftKey, project);
      setSaveState(saved ? "Autosaved" : "Save failed");
    }, 800);
    return () => window.clearTimeout(timer);
  }, [draftKey, project, stage]);

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

  async function openVerification(nextSource: Source) {
    setSource(nextSource);
    setRoom((current) => ({
      ...current,
      ceilingHeight: clamp(floorHeight, 1800, 6000),
    }));
    setPlanAnalysis(null);
    const plan = floorPlans[0];
    if (nextSource === "upload" && plan?.mediaType === "image") {
      setAnalysingPlan(true);
      try {
        const response = await fetch("/api/house-design/analyze-plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imageUrl: plan.url, ceilingHeight: floorHeight }),
        });
        const payload = (await response.json()) as { plan?: unknown; confidence?: number; notes?: string[]; error?: string };
        const parsed = roomSchema.safeParse(payload.plan);
        if (!response.ok || !parsed.success) throw new Error(payload.error ?? "Automatic plan detection could not be verified.");
        setRoom({
          ...parsed.data,
          reference: { url: plan.url, name: plan.title, mediaType: plan.mediaType, opacity: 0.45 },
        });
        const confidence = typeof payload.confidence === "number" ? `${Math.round(payload.confidence * 100)}% confidence` : "detected";
        setPlanAnalysis(`Plan geometry ${confidence}. Verify every wall and opening before generation.`);
        toast.success("Floor-plan objects detected. Please verify them.");
      } catch (error) {
        setPlanAnalysis("Automatic detection was unavailable. Trace and verify the uploaded plan manually.");
        toast.info(error instanceof Error ? error.message : "Continue with manual plan verification.");
      } finally {
        setAnalysingPlan(false);
      }
    }
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
    setProject(ensureHouseBimState(next));
    setStage("model");
  }

  function restore() {
    if (!savedDraft) return;
    const restored = ensureHouseBimState(ensureHouseEnvelopeProject(ensurePhaseFourProject(ensurePhaseThreeProject(ensurePhaseTwoProject(savedDraft.project)))));
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
    setSaveState(saved ? "Saved" : "Save failed");
    toast[saved ? "success" : "error"](
      saved
        ? "House project saved on this device."
        : "This browser could not save the project.",
    );
  }

  function updateProject(next: HouseProject) {
    const updated = { ...next, metadata: { ...next.metadata, updatedAt: new Date().toISOString() } };
    setSaveState("Saving…");
    setProject(updated);
    const groundPlan = updated.levels[0]?.plan;
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
          analysingPlan={analysingPlan}
          onContinue={() => void openVerification(source)}
          onRestore={savedDraft ? restore : undefined}
        />
      ) : stage === "verify" ? (
        <VerifyScreen
          room={room}
          source={source}
          analysis={planAnalysis}
          onDone={generate}
        />
      ) : project ? (
        <ModelScreen
          project={project}
          view={view}
          onView={setView}
          onProjectChange={updateProject}
          onSave={save}
          onSaveAs={() => {
            const copy = ensureHouseBimState({ ...project, id: crypto.randomUUID(), metadata: { ...project.metadata, title: `${project.metadata.title} Copy`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, revisions: [...project.revisions, { id: crypto.randomUUID(), createdAt: new Date().toISOString(), note: "Saved as a new design" }] });
            setProject(copy);
            writeHouseDraft(window.localStorage, draftKey, copy);
            setSaveState("Saved as copy");
          }}
          saveState={saveState}
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
  analysingPlan,
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
  analysingPlan: boolean;
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
          disabled={analysingPlan || (source === "upload" && floorPlans.length === 0)}
          className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-foreground disabled:opacity-40"
        >
          {analysingPlan ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Detecting plan…</span> : source === "upload" ? "Detect & verify floor plan" : "Draw floor plan"}
        </button>
      </aside>
    </div>
  );
}

function VerifyScreen({ room, source, analysis, onDone }: { room: Room; source: Source; analysis: string | null; onDone: (room: Room) => void }) {
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
      {analysis ? <p className="rounded-xl border border-brand/25 bg-brand/5 p-3 text-xs text-foreground">{analysis}</p> : null}
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
  onSaveAs,
  saveState,
  onDownload,
}: {
  project: HouseProject;
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  onProjectChange: (project: HouseProject) => void;
  onSave: () => void;
  onSaveAs: () => void;
  saveState: string;
  onDownload: () => void;
}) {
  const [activeLevelId, setActiveLevelId] = useState(project.levels[0]?.id ?? "ground-floor");
  const [visibleLevelIds, setVisibleLevelIds] = useState<Set<string>>(
    () => new Set(project.levels.map((level) => level.id)),
  );
  const [selections, setSelections] = useState<HouseSelection[]>([]);
  const [viewportOpen, setViewportOpen] = useState(true);
  const [activeCategory, setActiveCategory] = useState<HouseCommandCategory>("Architecture");
  const [activeTool, setActiveTool] = useState<HouseCommandId | null>("select");
  const [past, setPast] = useState<HouseProject[]>([]);
  const [future, setFuture] = useState<HouseProject[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [hiddenKinds, setHiddenKinds] = useState<Set<HouseObjectKind>>(() => new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [isolatedIds, setIsolatedIds] = useState<Set<string>>(() => new Set());
  const [activeViewId, setActiveViewId] = useState<string | null>("view:3d:default");
  const [schedule, setSchedule] = useState<"doors" | "windows" | "rooms" | "quantities" | null>(null);
  const [contextMenu, setContextMenu] = useState<HouseContextMenuState>(null);
  const [guidance, setGuidance] = useState("Select an object or start a command");
  const clipboard = useRef<HouseClipboard | null>(null);
  const commandRef = useRef<(id: HouseCommandId) => void>(() => undefined);
  const keyboardRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  const chordRef = useRef({ value: "", at: 0 });
  const escapeRef = useRef(0);
  const selected = selections.at(-1) ?? null;
  const selectedIds = useMemo(() => new Set(selections.map((item) => item.id)), [selections]);
  const activeLevel = project.levels.find((level) => level.id === activeLevelId) ?? project.levels[0];
  const activeRoom = activeLevel?.plan;
  const effectiveHiddenIds = useMemo(() => {
    const result = new Set(hiddenIds);
    if (isolatedIds.size) for (const item of allHouseSelections(project)) if (!isolatedIds.has(item.id)) result.add(item.id);
    return result;
  }, [hiddenIds, isolatedIds, project]);

  function chooseLevel(levelId: string) {
    setActiveLevelId(levelId);
    setActiveViewId(`view:plan:${levelId}`);
    setSelections([{ kind: "level", id: levelId }]);
  }

  function toggleLevel(levelId: string) {
    setVisibleLevelIds((current) => {
      const next = new Set(current);
      if (next.has(levelId)) next.delete(levelId);
      else next.add(levelId);
      return next;
    });
  }

  function commit(next: HouseProject, label: string) {
    if (next === project) return;
    setPast((items) => [...items, project].slice(-60));
    setFuture([]);
    onProjectChange(next);
    setGuidance(label);
  }

  function applyMutation(result: ReturnType<typeof deleteHouseSelections>, label: string) {
    if (result.project !== project) commit(result.project, label);
    setSelections(result.selections);
    if (result.blocked.length) toast.info(result.blocked.join(". "));
  }

  function undo() {
    const previous = past.at(-1);
    if (!previous) return;
    setPast((items) => items.slice(0, -1));
    setFuture((items) => [project, ...items].slice(0, 60));
    onProjectChange(previous);
    setGuidance("Undid last model command");
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setFuture((items) => items.slice(1));
    setPast((items) => [...items, project].slice(-60));
    onProjectChange(next);
    setGuidance("Redid model command");
  }

  function choose(selection: HouseSelection | null, mode: "replace" | "add" | "remove" = "replace") {
    if (!selection) {
      if (mode === "replace") setSelections([]);
      return;
    }
    const groupId = project.objectInstances[selection.id]?.groupId;
    const targets = groupId
      ? allHouseSelections(project).filter((item) => project.objectInstances[item.id]?.groupId === groupId)
      : [selection];
    setSelections((current) => {
      if (mode === "replace") return targets;
      if (mode === "remove") return current.filter((item) => !targets.some((target) => sameSelection(item, target)));
      const next = [...current];
      for (const target of targets) if (!next.some((item) => sameSelection(item, target))) next.push(target);
      return next;
    });
  }

  function chooseMany(items: HouseSelection[], mode: "replace" | "add" | "remove") {
    setSelections((current) => {
      if (mode === "replace") return items;
      if (mode === "remove") return current.filter((item) => !items.some((target) => sameSelection(item, target)));
      const next = [...current];
      for (const target of items) if (!next.some((item) => sameSelection(item, target))) next.push(target);
      return next;
    });
  }

  function selectView(next: HouseViewState) {
    setActiveViewId(next.id);
    if (next.levelId) setActiveLevelId(next.levelId);
    onView(next.kind === "floor-plan" || next.kind === "ceiling-plan" ? "2d" : "3d");
    setGuidance(`Opened ${next.name}`);
  }

  function createFromCommand(id: HouseCommandId) {
    const kinds: Partial<Record<HouseCommandId, HouseObjectKind>> = {
      wall: "wall", door: "door", window: "window", column: "column", floor: "slab", ceiling: "ceiling", roof: "roof", stair: "stair", railing: "railing", component: "component", furniture: "component", grid: "grid", "reference-plane": "reference-plane", dimension: "annotation", text: "annotation", tag: "annotation", section: "annotation", elevation: "annotation",
    };
    const kind = kinds[id];
    if (!kind) return false;
    setActiveTool(id);
    applyMutation(createDefaultHouseObject(project, kind, activeLevelId), `${houseCommand(id).label} placed — edit exact values in Properties`);
    return true;
  }

  function runCommand(id: HouseCommandId) {
    setContextMenu(null);
    switch (id) {
      case "undo": undo(); return;
      case "redo": redo(); return;
      case "save": onSave(); setGuidance("Project saved"); return;
      case "save-as": onSaveAs(); setGuidance("Saved as a new project copy"); return;
      case "command-search": setPaletteOpen(true); return;
      case "shortcut-help": setHelpOpen(true); return;
      case "select": setActiveTool("select"); setGuidance("Select objects · Ctrl adds · Shift removes"); return;
      case "cancel": {
        const now = Date.now();
        if (activeTool && activeTool !== "select" && now - escapeRef.current < 700) {
          setActiveTool("select");
          setGuidance("Tool exited");
        } else if (activeTool && activeTool !== "select") {
          setGuidance("Current step cancelled · press Esc again to exit tool");
        } else {
          setSelections([]);
          setGuidance("Selection cleared");
        }
        escapeRef.current = now;
        return;
      }
      case "finish": setActiveTool("select"); setGuidance("Action finished"); return;
      case "delete": applyMutation(deleteHouseSelections(project, selections), "Deleted selection"); return;
      case "copy": clipboard.current = { sourceProjectId: project.id, selections: [...selections] }; setGuidance(`Copied ${selections.length} object${selections.length === 1 ? "" : "s"}`); return;
      case "cut": clipboard.current = { sourceProjectId: project.id, selections: [...selections] }; applyMutation(deleteHouseSelections(project, selections), "Cut selection"); return;
      case "paste": {
        if (!clipboard.current || clipboard.current.sourceProjectId !== project.id) { toast.info("Nothing from this model is ready to paste."); return; }
        applyMutation(duplicateHouseSelections(project, clipboard.current.selections, 250), "Pasted copy"); return;
      }
      case "duplicate": applyMutation(duplicateHouseSelections(project, selections), "Duplicated selection"); return;
      case "rotate": applyMutation(rotateHouseSelections(project, selections), "Rotated selection 90°"); return;
      case "mirror-pick": case "mirror-draw": case "flip": applyMutation(mirrorHouseSelections(project, selections), "Flipped selection"); return;
      case "offset": applyMutation(moveHouseSelections(project, selections, 100, 100), "Offset selection 100 mm"); return;
      case "array": {
        let nextProject = project;
        let created: HouseSelection[] = [];
        const blocked: string[] = [];
        for (const distance of [250, 500, 750]) {
          const result = duplicateHouseSelections(nextProject, selections, distance);
          nextProject = result.project;
          created = [...created, ...result.selections];
          blocked.push(...result.blocked);
        }
        applyMutation({ project: nextProject, selections: created, blocked }, "Created a 4-item array");
        return;
      }
      case "align": applyMutation(alignHouseSelections(project, selections), "Aligned selection to primary object"); return;
      case "split": applyMutation(splitHouseSelection(project, selected), "Split object at midpoint"); return;
      case "join": commit(joinHouseSelections(project, selections, true), "Joined selected objects"); return;
      case "unjoin": commit(joinHouseSelections(project, selections, false), "Unjoined selected objects"); return;
      case "pin": commit(pinHouseSelections(project, selections, true), "Pinned selection"); return;
      case "unpin": commit(pinHouseSelections(project, selections, false), "Unpinned selection"); return;
      case "group": commit(groupHouseSelections(project, selections, true), "Grouped selection"); return;
      case "ungroup": commit(groupHouseSelections(project, selections, false), "Ungrouped selection"); return;
      case "create-similar": applyMutation(duplicateHouseSelections(project, selected ? [selected] : [], 200), "Created similar object"); return;
      case "match-type": {
        const sourceTypeId = selected ? project.objectInstances[selected.id]?.typeId : null;
        if (!sourceTypeId) { toast.info("The primary object has no reusable type."); return; }
        commit(setHouseObjectType(project, selections.slice(0, -1), sourceTypeId), "Matched type and properties");
        return;
      }
      case "select-all": setSelections(allHouseSelections(project, activeLevelId).filter((item) => item.kind !== "level")); setGuidance("Selected all objects on active level"); return;
      case "cycle-selection": {
        const items = allHouseSelections(project, activeLevelId).filter((item) => item.kind !== "level");
        const index = selected ? items.findIndex((item) => sameSelection(item, selected)) : -1;
        if (items.length) setSelections([items[(index + 1) % items.length]!]);
        return;
      }
      case "hide": setHiddenIds((current) => new Set([...current, ...selections.map((item) => item.id)])); setSelections([]); setGuidance("Selection temporarily hidden"); return;
      case "isolate": setIsolatedIds(new Set(selections.map((item) => item.id))); setGuidance("Selection temporarily isolated"); return;
      case "reset-hide": setHiddenIds(new Set()); setIsolatedIds(new Set()); setGuidance("Temporary visibility reset"); return;
      case "visibility": setVisibilityOpen((open) => !open); return;
      case "default-3d": onView("3d"); setActiveViewId("view:3d:default"); return;
      case "zoom-fit": case "zoom-extents": setGuidance("View refitted to model extents"); return;
      case "move": case "trim": case "scale": setActiveTool(id); setGuidance(`${houseCommand(id).label}: select the target, then use exact Properties or arrow keys`); return;
      case "ai-remodel": document.getElementById("house-ai-remodel")?.scrollIntoView({ behavior: "smooth", block: "center" }); return;
      case "alternatives": document.getElementById("house-facade")?.scrollIntoView({ behavior: "smooth", block: "center" }); return;
      case "estimate": case "boq": setSchedule("quantities"); setGuidance("Live preliminary quantities opened"); return;
      default:
        if (createFromCommand(id)) return;
        setActiveTool(id);
        setGuidance(`${houseCommand(id).label} is ready for the active view`);
    }
  }

  useEffect(() => {
    commandRef.current = runCommand;
    keyboardRef.current = (event) => {
      if (isModelTextInput(event.target)) return;
      if (event.key.startsWith("Arrow") && selections.length) {
        event.preventDefault();
        const amount = event.shiftKey ? 100 : 10;
        const dx = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
        const dy = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
        applyMutation(moveHouseSelections(project, selections, dx, dy), `Moved selection ${amount} mm`);
        return;
      }
      const direct = commandFromKeyboard(event);
      if (direct) {
        event.preventDefault();
        commandRef.current(direct);
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1 || !/[a-z0-9]/i.test(event.key)) return;
      const now = Date.now();
      const first = now - chordRef.current.at < 900 ? chordRef.current.value : "";
      const chord = `${first}${event.key.toUpperCase()}`.slice(-2);
      const command = commandFromChord(chord);
      chordRef.current = command ? { value: "", at: 0 } : { value: event.key.toUpperCase(), at: now };
      if (command) { event.preventDefault(); commandRef.current(command); }
    };
  });

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => keyboardRef.current(event);
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);

  return (
    <section className="space-y-3">
      <HouseRibbon
        activeCategory={activeCategory}
        activeTool={activeTool}
        selectionCount={selections.length}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onCategory={setActiveCategory}
        onCommand={runCommand}
        onSearch={() => setPaletteOpen(true)}
        onHelp={() => setHelpOpen(true)}
      />
      <div className="flex min-w-0 items-center justify-between gap-2 overflow-x-auto rounded-xl border bg-card p-2">
        <div className="flex shrink-0 rounded-lg bg-muted p-1">
          {(["2d", "3d", "split"] as const).map((item) => (
            <button key={item} type="button" onClick={() => onView(item)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium uppercase", view === item ? "bg-background text-brand shadow-sm" : "text-muted-foreground")}>{item === "split" ? "Split" : item}</button>
          ))}
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => setViewportOpen((open) => !open)} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs hover:bg-muted">
            {viewportOpen ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} {viewportOpen ? "Hide view" : "Show view"}
          </button>
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

      {visibilityOpen ? (
        <div className="rounded-xl border bg-card p-3">
          <div className="mb-2 flex items-center justify-between"><div><p className="text-[11px] uppercase tracking-wide text-brand">Visibility / Graphics</p><h3 className="text-sm font-semibold">Model categories</h3></div><button type="button" onClick={() => setHiddenKinds(new Set())} className="rounded-lg border px-3 py-1.5 text-xs">Show all</button></div>
          <div className="flex flex-wrap gap-2">{(["wall", "door", "window", "room", "slab", "ceiling", "roof", "stair", "railing", "column", "beam", "grid", "foundation", "component", "facade", "balcony", "veranda", "site"] as HouseObjectKind[]).map((kind) => <label key={kind} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs capitalize"><input type="checkbox" checked={!hiddenKinds.has(kind)} onChange={(event) => setHiddenKinds((current) => { const next = new Set(current); if (event.target.checked) next.delete(kind); else next.add(kind); return next; })} />{kind.replace("-", " ")}</label>)}</div>
        </div>
      ) : null}

      <div id="house-facade"><HouseFacadePanel project={project} onChange={(next) => commit(next, "Façade updated")} /></div>

      <div id="house-ai-remodel"><HouseAiRemodelPanel project={project} selected={selected} selections={selections} onChange={(next) => commit(next, "AI model change applied")} /></div>

      {schedule ? <HouseSchedulePanel project={project} kind={schedule} onClose={() => setSchedule(null)} /> : null}

      <div className="grid min-w-0 gap-3 xl:grid-cols-[210px_minmax(0,1fr)_320px]">
        <HouseProjectBrowser project={project} activeLevelId={activeLevelId} activeViewId={activeViewId} onLevel={chooseLevel} onView={selectView} onSchedule={setSchedule} />
        <div className="min-w-0" onContextMenu={(event) => { event.preventDefault(); if (selections.length) setContextMenu({ x: event.clientX, y: event.clientY }); }}>
          {viewportOpen ? <div className={cn("grid min-w-0 gap-3", view === "split" ? "lg:grid-cols-2" : "grid-cols-1")}>
            {view !== "3d" && activeRoom ? (
              <div className="relative min-h-[340px] min-w-0 overflow-hidden rounded-xl border bg-background">
                <div className="pointer-events-none absolute inset-0"><PlanCanvas room={activeRoom} onChange={() => undefined} /></div>
                <HousePlanSelectionOverlay project={project} levelId={activeLevelId} onSelect={chooseMany} />
                <span className="absolute left-3 top-3 rounded-full border bg-background/90 px-3 py-1 text-xs font-medium">{activeLevel?.name} · mm</span>
              </div>
            ) : null}
            {view !== "2d" ? (
              <HousePreview
                key={activeViewId ?? "model-view"}
                project={project}
                visibleLevelIds={visibleLevelIds}
                selected={selected}
                selectedIds={selectedIds}
                hiddenKinds={hiddenKinds}
                hiddenIds={effectiveHiddenIds}
                initialView={previewView(activeViewId)}
                onSelect={choose}
                className="h-[min(620px,62dvh)]"
              />
            ) : null}
          </div> : <button type="button" onClick={() => setViewportOpen(true)} className="min-h-16 w-full rounded-xl border border-dashed bg-muted/20 text-sm text-muted-foreground hover:border-brand hover:text-brand">Show 2D / 3D viewport</button>}
        </div>
        <HouseObjectInspector project={project} activeLevelId={activeLevelId} selected={selected} selections={selections} onSelect={(selection) => choose(selection)} onChange={(next) => commit(next, "Properties updated")} />
      </div>

      <HouseStructurePanel project={project} onChange={(next) => commit(next, "Structure updated")} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Level area" value={activeRoom ? `${floorArea(activeRoom).toFixed(2)} m²` : "—"} />
        <Summary label="Structured walls" value={String(project.walls.length)} />
        <Summary label="Openings" value={`${project.doors.length} doors · ${project.windows.length} windows`} />
        <Summary label="Structure" value={`${project.structuralColumns.length} columns · ${project.structuralBeams.length} beams`} />
      </div>

      <div className="rounded-xl border bg-card p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Structured house model:</strong> verified architecture, façade options and preliminary structural objects remain editable and reproducible from millimetre data. BOQ-ready quantities update from the same source objects.
      </div>

      <HouseStatusBar selectionCount={selections.length} snap="Endpoint · Midpoint · Grid" level={activeLevel?.name ?? "—"} units={project.units} mode={activeTool ? houseCommand(activeTool).label : "Select"} saveState={`${saveState} · ${guidance}`} />
      <HouseCommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onCommand={runCommand} />
      <HouseShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <HouseContextMenu state={contextMenu} selectionCount={selections.length} onClose={() => setContextMenu(null)} onCommand={runCommand} />
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

function previewView(viewId: string | null): "3d" | "front" | "back" | "left" | "right" {
  if (viewId?.endsWith(":front")) return "front";
  if (viewId?.endsWith(":rear")) return "back";
  if (viewId?.endsWith(":left")) return "left";
  if (viewId?.endsWith(":right")) return "right";
  return "3d";
}
