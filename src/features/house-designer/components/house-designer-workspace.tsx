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
  House,
  LayoutGrid,
  PenLine,
  Sparkles,
  Loader2,
  Magnet,
  PencilRuler,
  Save,
} from "lucide-react";
import { toast } from "sonner";

import {
  FloorPlanInput,
  type DraftPlan,
} from "@/components/tour/floor-plan-input";
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
  HouseColumnSuggestions,
  HouseCommandPalette,
  HouseContextMenu,
  HouseProjectBrowser,
  HouseRibbon,
  HouseMobileTools,
  HouseMobileTopBar,
  HouseSchedulePanel,
  HouseSelectionActions,
  HouseShortcutHelp,
  HouseStatusBar,
  HouseToolOptions,
  type HouseToolSettings,
  type HouseContextMenuState,
} from "./house-modeling-chrome";
import { HouseObjectInspector } from "./house-object-inspector";
import { HousePlanSelectionOverlay, type HousePlanPoint } from "./house-plan-selection-overlay";
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
  createHouseObjectFromGesture,
  createRoomFromGesture,
  roomOutline,
  lockConflict,
  type HouseRoomShape,
  deleteHouseSelections,
  duplicateHouseSelections,
  groupHouseSelections,
  joinHouseSelections,
  mirrorHouseSelections,
  moveHouseSelections,
  moveHouseSelectionsTo,
  pinHouseSelections,
  rotateHouseSelections,
  scaleHouseSelections,
  setHouseObjectType,
  splitHouseSelection,
  type HouseClipboard,
} from "../services/model-commands";
import { addHouseFloor, establishLevelOutline, mergeRooms, openSpace, patchHouseObject, splitRoomAlong } from "../services/project-edit";
import { PLAN_TEMPLATES } from "../services/plan-templates";
import { planDescriptionError } from "../services/plan-analysis";
import { acceptColumnProposals, suggestColumns, type ColumnProposal } from "../services/column-suggestions";
import {
  allHouseSelections,
  ensureHouseBimState,
  sameSelection,
} from "../services/model-state";
import {
  createHouseProject,
  ensurePhaseTwoProject,
  type HouseProject,
  type HouseObjectKind,
  type HouseSelection,
  type HouseStyle,
  type HouseViewState,
} from "../types/project";
import { generateFacadeAlternatives } from "../services/facade";
import { generatePreliminaryStructure } from "../services/structure";

import { HouseUnitsContext } from "./house-units";
import { applyModelingOptions, modelingPreset, type DisplayUnits, type ModelingOptions } from "../services/workspace-options";

type Stage = "start" | "verify" | "model";
type Source = "manual" | "rooms" | "upload" | "sketch" | "template" | "describe";
const SOURCE_LABEL: Record<Source, string> = { manual: "Manual plan", rooms: "Drawn room by room", upload: "Uploaded plan", sketch: "Hand sketch", template: "Template", describe: "AI from a description" };
type WorkspaceView = "2d" | "3d" | "split";

const drawingCommands = new Set<HouseCommandId>([
  "wall", "door", "window", "room", "room-separator", "floor", "ceiling", "roof", "stair", "railing", "opening", "component", "furniture", "kitchen", "wardrobe", "plumbing-fixture",
  "column", "beam", "structural-wall", "structural-slab", "foundation", "isolated-footing", "strip-footing", "foundation-slab", "grid", "level", "reference-plane",
  "dimension", "text", "room-tag", "tag", "section", "elevation",
]);

const noSubscription = () => () => undefined;

export function HouseDesignerWorkspace({ userId }: { userId: string }) {
  const [stage, setStage] = useState<Stage>("start");
  const [source, setSource] = useState<Source>("manual");
  const [templateId, setTemplateId] = useState(PLAN_TEMPLATES[1]!.id);
  const [description, setDescription] = useState("");
  const [startTool, setStartTool] = useState<HouseCommandId>("select");
  const [room, setRoom] = useState<Room>(() => rectangularRoom(8000, 6500));
  const [floorPlans, setFloorPlans] = useState<DraftPlan[]>([]);
  const [facades, setFacades] = useState<DraftPlan[]>([]);
  const [title, setTitle] = useState("My house");
  const [floorCount, setFloorCount] = useState(1);
  const [displayUnits, setDisplayUnits] = useState<DisplayUnits>("mm");
  const [modelingOptions, setModelingOptions] = useState<ModelingOptions>(() => modelingPreset("house"));
  const [floorHeight, setFloorHeight] = useState(3000);
  const [style, setStyle] = useState<HouseStyle>("modern");
  const [strict, setStrict] = useState(false);
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

  async function openVerification(nextSource: Source, ai = false) {
    setSource(nextSource);
    const template = nextSource === "template" ? PLAN_TEMPLATES.find((item) => item.id === templateId) : null;
    let verifiedRoom: Room = {
      ...(template ? template.build() : room),
      ceilingHeight: clamp(floorHeight, 1800, 6000),
    };
    setPlanAnalysis(null);
    setStartTool(nextSource === "rooms" ? "room" : nextSource === "manual" ? "wall" : "select");
    const plan = floorPlans[0];
    const uploaded = nextSource === "upload" || nextSource === "sketch";
    if (uploaded && !ai) {
      setPlanAnalysis(plan?.mediaType === "image"
        ? "Your drawing is under the plan. Drag the corners and walls onto its lines, then type the exact lengths."
        : "Enter the walls from your drawing with their exact lengths.");
    }
    if (nextSource === "describe") {
      const invalid = planDescriptionError(description);
      if (invalid) { toast.info(invalid); return; }
      setAnalysingPlan(true);
      try {
        const response = await fetch("/api/house-design/generate-plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ description, ceilingHeight: floorHeight }),
        });
        const payload = (await response.json()) as { plan?: unknown; notes?: string[]; error?: string };
        const parsed = roomSchema.safeParse(payload.plan);
        if (!response.ok || !parsed.success) throw new Error(payload.error ?? "A plan could not be drawn from that description.");
        verifiedRoom = parsed.data;
        setPlanAnalysis(["AI drew this plan from your description. Check every wall, door and window before 3D.", ...(payload.notes ?? [])].join(" "));
      } catch (error) {
        // Nothing invented in its place: the description stays, ready to retry.
        toast.error(error instanceof Error ? error.message : "A plan could not be drawn from that description.");
        return;
      } finally {
        setAnalysingPlan(false);
      }
    }
    if (uploaded && ai && plan?.mediaType === "image") {
      setAnalysingPlan(true);
      try {
        const response = await fetch("/api/house-design/analyze-plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imageUrl: plan.url, ceilingHeight: floorHeight, kind: nextSource === "sketch" ? "sketch" : "plan" }),
        });
        const payload = (await response.json()) as { plan?: unknown; confidence?: number; notes?: string[]; error?: string };
        const parsed = roomSchema.safeParse(payload.plan);
        if (!response.ok || !parsed.success) throw new Error(payload.error ?? "Automatic plan detection could not be verified.");
        verifiedRoom = {
          ...parsed.data,
          reference: { url: plan.url, name: plan.title, mediaType: plan.mediaType, opacity: 0.45 },
        };
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
    setRoom(verifiedRoom);
    const built = ensureHouseBimState({ ...applyModelingOptions(createHouseProject({
      id: project?.id,
      title,
      room: verifiedRoom,
      style,
      strict,
      floorCount,
      floorToFloorHeight: floorHeight,
      referenceImages: references(floorPlans, facades),
    }), modelingOptions), displayUnits });
    // Drawing from scratch starts on genuinely open space: the project's
    // floors and settings, and nothing on them until it is drawn.
    setProject(nextSource === "manual" || nextSource === "rooms" ? openSpace(built) : built);
    setView("2d");
    setStage("verify");
  }

  function restore() {
    if (!savedDraft) return;
    const restored = ensureHouseBimState(ensureHouseEnvelopeProject(ensurePhaseFourProject(ensurePhaseThreeProject(ensurePhaseTwoProject(savedDraft.project)))));
    const restoredRoom = restored.levels.find((level) => level.plan)?.plan;
    setProject(restored);
    setDisplayUnits(restored.displayUnits ?? "mm");
    setModelingOptions(restored.modelingOptions ?? modelingPreset("house"));
    if (restoredRoom) setRoom(restoredRoom);
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
    <main className="mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden px-3 pb-6 pt-3 sm:px-5 md:pb-8">
      <header className={cn("mb-2 min-w-0 items-center justify-between gap-3 rounded-2xl border bg-card p-2 sm:mb-4 sm:flex sm:p-4", stage === "start" ? "flex" : "hidden")}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand sm:size-10">
            <Building2 className="size-4 sm:size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold sm:text-lg">House Design</h1>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
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
          analysingPlan={analysingPlan}
          templateId={templateId}
          onTemplate={setTemplateId}
          description={description}
          onDescription={setDescription}
          onContinue={(ai) => void openVerification(source, ai)}
          onRestore={savedDraft ? restore : undefined}
        />
      ) : stage === "verify" && project ? (
        <VerifyScreen
          project={project}
          source={source}
          analysis={planAnalysis}
          view={view}
          onView={setView}
          onProjectChange={updateProject}
          onDone={() => { setStage("model"); setView("3d"); }}
          onBack={() => setStage("start")}
          initialTool={startTool}
          userId={userId}
          onSave={save}
          saveState={saveState}
          onDownload={download}
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
          onBack={() => setStage("verify")}
          backLabel="Edit plan"
          userId={userId}
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
  analysingPlan,
  onContinue,
  onRestore,
  templateId,
  onTemplate,
  description,
  onDescription,
}: {
  userId: string;
  source: Source;
  onSource: (source: Source) => void;
  floorPlans: DraftPlan[];
  onFloorPlans: (plans: DraftPlan[]) => void;
  analysingPlan: boolean;
  onContinue: (ai: boolean) => void;
  onRestore?: () => void;
  templateId: string;
  onTemplate: (id: string) => void;
  description: string;
  onDescription: (value: string) => void;
}) {
  return (
    <div>
      <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">New house</p>
          <h2 className="mt-1 text-xl font-semibold sm:text-2xl">How do you want to start?</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every way in ends at the same editable plan — you check and correct it before anything is built from it.
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

        <div role="radiogroup" aria-label="How to start" className="grid grid-cols-2 gap-2 xl:grid-cols-3">
          {([
            ["manual", <PencilRuler key="manual" className="size-5" />, "Draw manually", "An empty grid; draw the walls yourself"],
            ["rooms", <LayoutGrid key="rooms" className="size-5" />, "Draw rooms", "Drag out each room; walls join up"],
            ["upload", <FileUp key="upload" className="size-5" />, "Upload floor plan", "JPG, PNG or PDF — trace it or convert it"],
            ["sketch", <PenLine key="sketch" className="size-5" />, "Upload hand sketch", "A photo of a drawing on paper"],
            ["template", <House key="template" className="size-5" />, "Use a template", "A ready plan to adjust"],
            ["describe", <Sparkles key="describe" className="size-5" />, "Describe it (AI)", "AI draws a plan; you check it"],
          ] as const).map(([value, icon, title, description]) => (
            <SourceCard key={value} active={source === value} icon={icon} title={title} description={description} onClick={() => onSource(value)} />
          ))}
        </div>

        {source === "upload" || source === "sketch" ? (
          <FloorPlanInput
            userId={userId}
            plans={floorPlans}
            onChange={onFloorPlans}
            maxPlans={1}
            multiple={false}
            buttonLabel={source === "sketch" ? "Upload sketch photo" : "Upload floor plan"}
            help={source === "sketch" ? "A clear, straight-on photo; write the main lengths on it if you can" : "JPG, JPEG, PNG or PDF, up to 25MB"}
          />
        ) : source === "describe" ? (
          <label className="block space-y-1.5 text-xs text-muted-foreground">
            <span>Describe the house</span>
            <textarea aria-label="House description" value={description} onChange={(event) => onDescription(event.target.value)} maxLength={2000} rows={4} placeholder="e.g. A single-storey 3-bedroom house about 12 × 10 m, open living and kitchen at the front, two bathrooms" className="w-full rounded-xl border bg-background p-3 text-sm text-foreground" />
          </label>
        ) : source === "template" ? (
          <div role="radiogroup" aria-label="Template" className="grid gap-2 sm:grid-cols-3">
            {PLAN_TEMPLATES.map((template) => (
              <button key={template.id} type="button" role="radio" aria-checked={templateId === template.id} onClick={() => onTemplate(template.id)} className={cn("rounded-xl border p-3 text-left text-sm", templateId === template.id ? "border-brand bg-brand/5" : "hover:bg-muted/40")}>
                <strong className="block">{template.name}</strong>
                <span className="text-xs text-muted-foreground">{template.summary}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
            {source === "rooms"
              ? "The plan opens with the Room tool ready: drag from corner to corner for each room, or type its size. Rooms that touch share their wall."
              : "An empty grid. Draw walls and close them on the first point, or drag out a Room."}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          {source === "upload" || source === "sketch" ? <>
            <button type="button" onClick={() => onContinue(true)} disabled={analysingPlan || floorPlans.length === 0 || floorPlans[0]?.mediaType !== "image"} className="flex-1 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-foreground disabled:opacity-40">
              {analysingPlan ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Reading your {source === "sketch" ? "sketch" : "plan"}…</span> : source === "sketch" ? "Convert sketch with AI" : "Convert with AI"}
            </button>
            <button type="button" onClick={() => onContinue(false)} disabled={analysingPlan || floorPlans.length === 0} className="flex-1 rounded-xl border px-4 py-3 text-sm font-semibold hover:bg-muted disabled:opacity-40">Trace it myself</button>
          </> : source === "describe" ? (
            <button type="button" onClick={() => onContinue(true)} disabled={analysingPlan || description.trim().length < 10} className="flex-1 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-foreground disabled:opacity-40">
              {analysingPlan ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Drawing your plan…</span> : "Generate plan"}
            </button>
          ) : (
            <button type="button" onClick={() => onContinue(false)} className="flex-1 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-foreground">
              {source === "rooms" ? "Start drawing rooms" : source === "template" ? "Use this template" : "Draw floor plan"}
            </button>
          )}
        </div>
        {(source === "upload" || source === "sketch") && floorPlans[0]?.mediaType === "pdf" ? <p className="text-xs text-muted-foreground">AI conversion reads images; a PDF can be traced by hand.</p> : null}
      </section>

    </div>
  );
}

function VerifyScreen({ project, source, analysis, view, onView, onProjectChange, onDone, onBack, onSave, saveState, onDownload, initialTool, userId }: { project: HouseProject; source: Source; analysis: string | null; view: WorkspaceView; onView: (view: WorkspaceView) => void; onProjectChange: (project: HouseProject) => void; onDone: () => void; onBack: () => void; onSave: () => void; saveState: string; onDownload: () => void; initialTool?: HouseCommandId; userId: string }) {
  return (
    <section className="space-y-3">
      <div className="hidden flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 sm:flex">
        <div>
          <h2 className="font-semibold">Verify the plan before 3D</h2>
          <p className="text-xs text-muted-foreground">Correct the outline, wall thickness, dimensions, doors and windows.</p>
        </div>
        <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
          {SOURCE_LABEL[source]}
        </span>
      </div>
      {project.levels[0]?.plan?.reference?.mediaType === "pdf" ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300">
          PDF uploaded. Use the visible filename as reference and enter the verified dimensions here; image overlay is available for JPG and PNG plans.
        </p>
      ) : null}
      {analysis ? <p className="rounded-xl border border-brand/25 bg-brand/5 p-3 text-xs text-foreground">{analysis}</p> : null}
      <ModelScreen project={project} view={view} onView={onView} onProjectChange={onProjectChange} onSave={onSave} onSaveAs={onSave} saveState={saveState} onDownload={onDownload} verification onFinish={onDone} onBack={onBack} backLabel="Start" initialTool={initialTool} userId={userId} />
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
  verification = false,
  onFinish,
  onBack,
  backLabel,
  initialTool = "select",
  userId,
}: {
  project: HouseProject;
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  onProjectChange: (project: HouseProject) => void;
  onSave: () => void;
  onSaveAs: () => void;
  saveState: string;
  onDownload: () => void;
  verification?: boolean;
  onFinish?: () => void;
  onBack?: () => void;
  backLabel?: string;
  initialTool?: HouseCommandId;
  userId?: string;
}) {
  const [chosenLevelId, setActiveLevelId] = useState(project.levels[0]?.id ?? "ground-floor");
  // Undoing Add Floor deletes the floor being looked at; everything that
  // reads the active level must then fall back to one that still exists.
  const activeLevelId = project.levels.some((level) => level.id === chosenLevelId) ? chosenLevelId : project.levels[0]?.id ?? chosenLevelId;
  const [visibleLevelIds, setVisibleLevelIds] = useState<Set<string>>(
    () => new Set(project.levels.map((level) => level.id)),
  );
  const [selections, setSelections] = useState<HouseSelection[]>([]);
  const [viewportOpen, setViewportOpen] = useState(true);
  const [activeCategory, setActiveCategory] = useState<HouseCommandCategory>("Architecture");
  const [activeTool, setActiveTool] = useState<HouseCommandId | null>(initialTool);
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
  const [draftStart, setDraftStart] = useState<HousePlanPoint | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [viewRevision, setViewRevision] = useState(0);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [roomShape, setRoomShape] = useState<HouseRoomShape>("rectangle");
  // Walls drawn on an empty floor: a sketch of its outline, kept here until
  // it closes on its first point and becomes the floor's outline.
  const [outlineSketch, setOutlineSketch] = useState<HousePlanPoint[]>([]);
  // Set when a sketch closes: the overlay asks to carry the chain on from the
  // last point straight afterwards, and a closed outline has nowhere to go.
  const chainEnded = useRef(false);
  // Merge Rooms with one room chosen: the next room tapped is merged into it.
  const [mergeFrom, setMergeFrom] = useState<string | null>(null);
  // Suggested columns live here, outside the model, until one is accepted.
  const [proposals, setProposals] = useState<{ levelId: string; maxSpan: number; items: ColumnProposal[]; chosen: string | null } | null>(null);
  const [toolSettings, setToolSettings] = useState<HouseToolSettings>({
    wallType: "200 mm Exterior",
    locationLine: "Wall Centerline",
    height: project.levels[0]?.floorToFloorHeight ?? 3000,
    chain: true,
    offset: 0,
    width: 600,
    depth: 600,
    sillHeight: 900,
    constrain: false,
    disjoin: false,
    multiple: false,
  });
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
    setOutlineSketch([]);
    if (proposals && proposals.levelId !== levelId) setProposals(null);
    setActiveLevelId(levelId);
    setActiveViewId(`view:plan:${levelId}`);
    setSelections([{ kind: "level", id: levelId }]);
  }

  function suggest(maxSpan: number) {
    const items = suggestColumns(project, activeLevelId, maxSpan);
    setActiveTool("select");
    setDraftStart(null);
    setSelections([]);
    if (view === "3d") onView("2d");
    if (!items.length) {
      setProposals(null);
      toast.info("Every corner, junction and span on this floor already has a column.");
      return;
    }
    setProposals({ levelId: activeLevelId, maxSpan, items, chosen: null });
    setGuidance(`${items.length} column${items.length === 1 ? "" : "s"} suggested · tap one to choose it, drag to move it`);
  }

  function acceptProposals(items: ColumnProposal[]) {
    if (!proposals || !items.length) return;
    commit(acceptColumnProposals(project, proposals.levelId, items), `Accepted ${items.length} suggested column${items.length === 1 ? "" : "s"}`);
    const left = proposals.items.filter((item) => !items.includes(item));
    setProposals(left.length ? { ...proposals, items: left, chosen: null } : null);
  }

  function addFloor() {
    const result = addHouseFloor(project);
    if (!result.levelId) { toast.info("The top floor needs a plan before another can go on it."); return; }
    const levelId = result.levelId;
    commit(result.project, "Floor added");
    setVisibleLevelIds((current) => new Set([...current, levelId]));
    chooseLevel(levelId);
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

  function mergeInto(firstId: string, secondId: string) {
    setMergeFrom(null);
    const result = mergeRooms(project, firstId, secondId);
    if (result.blocked) { toast.info(result.blocked); return; }
    commit(result.project, "Rooms merged");
    setSelections([{ kind: "room", id: firstId }]);
  }

  function chooseMany(items: HouseSelection[], mode: "replace" | "add" | "remove") {
    if (mergeFrom && items[0]?.kind === "room" && items[0].id !== mergeFrom) { mergeInto(mergeFrom, items[0].id); return; }
    if (mergeFrom) setMergeFrom(null);
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

  function activateDrawingTool(id: HouseCommandId) {
    if (!drawingCommands.has(id)) return false;
    if (id === "door" || id === "opening") setToolSettings((current) => ({ ...current, width: 900, height: 2100, sillHeight: 0 }));
    else if (id === "window") setToolSettings((current) => ({ ...current, width: 1200, height: 1500, sillHeight: 900 }));
    else if (["wall", "structural-wall", "room-separator"].includes(id)) setToolSettings((current) => ({ ...current, height: activeLevel?.floorToFloorHeight ?? 3000 }));
    else if (id === "column") setToolSettings((current) => ({ ...current, width: 300, depth: 300, height: activeLevel?.floorToFloorHeight ?? 3000 }));
    // A stair has its own size; inheriting the last column's 300 mm made it
    // a stair nobody could climb.
    else if (id === "stair") setToolSettings((current) => ({ ...current, width: 1000, depth: 3000, height: activeLevel?.floorToFloorHeight ?? 3000 }));
    setActiveTool(id);
    setDraftStart(null);
    // Drawing happens on the plan, so 3D alone gives way to it — but side by
    // side already shows the plan, and the 3D beside it is the point.
    if (view === "3d") onView("2d");
    setActiveViewId(`view:plan:${activeLevelId}`);
    setGuidance(`${houseCommand(id).label} Tool · ${lineDraftTool(id) ? "Pick start point" : "Pick placement point"}`);
    return true;
  }

  function draftObject(start: HousePlanPoint, end: HousePlanPoint) {
    if (!activeTool) return;
    if (activeTool === "move") {
      applyMutation(moveHouseSelectionsTo(project, selections, end), "Moved selection to picked point");
      if (!toolSettings.multiple) setActiveTool("select");
      return;
    }
    if (!activeLevel?.plan && activeTool === "room") {
      const outlined = establishLevelOutline(project, activeLevelId, roomOutline(roomShape, start, end));
      if (!outlined) { toast.info("Drag out the room — at least 500 mm each way"); return; }
      commit(outlined, "Outline created — this is the house; draw rooms inside it");
      return;
    }
    if (!activeLevel?.plan && activeTool === "wall") {
      const sketch = outlineSketch.length ? outlineSketch : [start];
      const closes = sketch.length >= 3 && Math.hypot(end.x - sketch[0]!.x, end.y - sketch[0]!.y) < 1;
      if (!closes) {
        setOutlineSketch([...sketch, end]);
        setGuidance(`${sketch.length} wall${sketch.length === 1 ? "" : "s"} sketched · close on the first point to make the outline`);
        return;
      }
      const outlined = establishLevelOutline(project, activeLevelId, sketch);
      setOutlineSketch([]);
      setDraftStart(null);
      chainEnded.current = true;
      if (!outlined) { toast.info("That shape encloses no floor — draw it again"); return; }
      commit(outlined, "Outline closed — this is the house");
      return;
    }
    if (activeTool === "room") {
      applyMutation(createRoomFromGesture(project, activeLevelId, start, end, roomShape, { wallThickness: 120, height: toolSettings.height }), `${roomShape === "l-shape" ? "L-shaped room" : "Room"} created`);
      return;
    }
    const wallThickness = activeTool === "room-separator" ? 25 : activeTool === "structural-wall" || toolSettings.wallType.includes("200") ? 200 : 120;
    const gesture = ["wall", "structural-wall", "room-separator"].includes(activeTool) ? offsetDraftSegment(start, end, toolSettings.offset) : { start, end };
    const created = createHouseObjectFromGesture(project, activeTool, activeLevelId, gesture.start, gesture.end, {
      width: toolSettings.width,
      depth: toolSettings.depth,
      height: activeTool === "window" || activeTool === "door" ? toolSettings.height : toolSettings.height,
      sillHeight: toolSettings.sillHeight,
      wallThickness,
    });
    // A wall drawn right across a room divides it, in the same undo step.
    if (activeTool === "wall" && !created.blocked.length) created.project = splitRoomAlong(created.project, activeLevelId, gesture.start, gesture.end);
    applyMutation(created, `${houseCommand(activeTool).label} created`);
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
      case "select": setActiveTool("select"); setDraftStart(null); setGuidance("Select objects · Ctrl adds · Shift removes"); return;
      case "cancel": {
        const now = Date.now();
        if (draftStart || outlineSketch.length) {
          setDraftStart(null);
          setOutlineSketch([]);
          setGuidance("Current tool step cancelled · press Esc again to exit tool");
          escapeRef.current = now;
          return;
        }
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
      case "finish": setActiveTool("select"); setDraftStart(null); setGuidance("Action finished"); return;
      case "delete": applyMutation(deleteHouseSelections(project, selections, { footprintEditable: verification }), "Deleted selection"); return;
      case "copy": clipboard.current = { sourceProjectId: project.id, selections: [...selections] }; setGuidance(`Copied ${selections.length} object${selections.length === 1 ? "" : "s"}`); return;
      case "cut": clipboard.current = { sourceProjectId: project.id, selections: [...selections] }; applyMutation(deleteHouseSelections(project, selections, { footprintEditable: verification }), "Cut selection"); return;
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
      case "trim": applyMutation(scaleHouseSelections(project, selections, 0.9), "Trimmed / extended selection"); return;
      case "scale": applyMutation(scaleHouseSelections(project, selections, 1.1), "Scaled selection 110%"); return;
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
      case "floor-plan": onView("2d"); setActiveViewId(`view:plan:${activeLevelId}`); return;
      case "default-3d": case "view-isometric": case "view-perspective": onView("3d"); setActiveViewId(id === "default-3d" ? "view:3d:default" : `view:camera:${id}`); return;
      case "split-view": onView("split"); return;
      case "view-top": case "view-front": case "view-back": case "view-left": case "view-right": onView("3d"); setActiveViewId(`view:camera:${id.replace("view-", "")}`); return;
      case "zoom-fit": case "zoom-extents": setViewRevision((value) => value + 1); setGuidance("View refitted to model extents"); return;
      case "move": setActiveTool(id); setDraftStart(null); if (view === "3d") onView("2d"); setGuidance("Move Tool · Pick a new location or use arrow keys"); return;
      case "ask-ai": case "ai-remodel": document.getElementById("house-ai-remodel")?.scrollIntoView({ behavior: "smooth", block: "center" }); return;
      case "generate-facade": case "alternatives": commit(generateFacadeAlternatives(project, 3), "Generated façade alternatives"); document.getElementById("house-facade")?.scrollIntoView({ behavior: "smooth", block: "center" }); return;
      case "generate-structure": commit(generatePreliminaryStructure(project), "Preliminary structure generated"); return;
      case "suggest-columns": suggest(proposals?.maxSpan ?? 4500); return;
      case "merge-rooms": {
        const rooms = selections.filter((item) => item.kind === "room");
        if (rooms.length >= 2) { mergeInto(rooms[0]!.id, rooms[1]!.id); return; }
        if (!rooms[0]) { toast.info("Select a room first"); return; }
        setMergeFrom(rooms[0].id);
        setGuidance("Tap the room to merge with");
        toast.info("Tap the room to merge with");
        return;
      }
      case "analyze-plan": setGuidance(`Plan analysis: ${project.walls.filter((item) => item.levelId === activeLevelId).length} walls · ${project.rooms.filter((item) => item.levelId === activeLevelId).length} rooms · ${project.doors.filter((item) => item.levelId === activeLevelId).length + project.windows.filter((item) => item.levelId === activeLevelId).length} openings`); return;
      case "estimate": case "boq": setSchedule("quantities"); setGuidance("Live preliminary quantities opened"); return;
      default:
        if (activateDrawingTool(id)) return;
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
    <HouseUnitsContext.Provider value={project.displayUnits ?? "mm"}><section className="min-w-0 space-y-3">
      <HouseMobileTopBar
        onBack={onBack}
        backLabel={backLabel}
        levels={project.levels}
        activeLevelId={activeLevelId}
        onLevel={chooseLevel}
        onAddFloor={addFloor}
        view={view}
        onView={onView}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={undo}
        onRedo={redo}
        moreOpen={mobileMoreOpen}
        onToggleMore={() => setMobileMoreOpen((value) => !value)}
      />

      <div className={cn("flex min-w-0 items-center justify-between gap-2 overflow-x-auto rounded-xl border bg-card p-2", mobileMoreOpen ? "flex" : "hidden lg:flex")}>
        <div className="flex shrink-0 rounded-lg bg-muted p-1">
          {(["2d", "3d", "split"] as const).map((item) => (
            <button key={item} type="button" onClick={() => onView(item)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium uppercase", view === item ? "bg-background text-brand shadow-sm" : "text-muted-foreground")}>{item === "split" ? "Split" : item}</button>
          ))}
        </div>
        <label className="flex shrink-0 items-center gap-1 text-xs">Units<select aria-label="Drawing units" value={project.displayUnits ?? "mm"} onChange={(event) => commit({ ...project, displayUnits: event.target.value as DisplayUnits }, "Display units updated")} className="rounded-lg border bg-background p-2"><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option></select></label>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => setSnapEnabled((value) => !value)} aria-pressed={snapEnabled} title="Toggle snap to grid, endpoints and intersections" className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs", snapEnabled ? "border-brand/40 bg-brand/10 text-brand" : "hover:bg-muted")}>
            <Magnet className="size-3.5" /> Snap
          </button>
          <button type="button" onClick={() => setViewportOpen((open) => !open)} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs hover:bg-muted">
            {viewportOpen ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} {viewportOpen ? "Hide view" : "Show view"}
          </button>
          <button type="button" onClick={onDownload} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs hover:bg-muted"><Download className="size-3.5" /> Data</button>
          <button type="button" onClick={onSave} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-medium text-brand-foreground"><Save className="size-3.5" /> Save</button>
        </div>
      </div>

      <div className={cn("flex min-w-0 gap-2 overflow-x-auto rounded-xl border bg-card p-2", mobileMoreOpen ? "flex" : "hidden lg:flex")}>
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
        <button type="button" onClick={addFloor} className="shrink-0 rounded-lg border border-dashed px-3 py-2 text-xs font-medium text-brand hover:bg-muted">+ Add floor</button>
      </div>

      {visibilityOpen ? (
        <div className="rounded-xl border bg-card p-3">
          <div className="mb-2 flex items-center justify-between"><div><p className="text-[11px] uppercase tracking-wide text-brand">Visibility / Graphics</p><h3 className="text-sm font-semibold">Model categories</h3></div><button type="button" onClick={() => setHiddenKinds(new Set())} className="rounded-lg border px-3 py-1.5 text-xs">Show all</button></div>
          <div className="flex flex-wrap gap-2">{(["wall", "door", "window", "room", "slab", "ceiling", "roof", "stair", "railing", "column", "beam", "grid", "foundation", "component", "facade", "balcony", "veranda", "site"] as HouseObjectKind[]).map((kind) => <label key={kind} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs capitalize"><input type="checkbox" checked={!hiddenKinds.has(kind)} onChange={(event) => setHiddenKinds((current) => { const next = new Set(current); if (event.target.checked) next.delete(kind); else next.add(kind); return next; })} />{kind.replace("-", " ")}</label>)}</div>
        </div>
      ) : null}

      {schedule ? <HouseSchedulePanel project={project} kind={schedule} onClose={() => setSchedule(null)} /> : null}

      <div className="grid min-w-0 gap-3 xl:grid-cols-[auto_minmax(0,1fr)_320px]">
        <div className="hidden xl:block"><HouseProjectBrowser project={project} activeLevelId={activeLevelId} activeViewId={activeViewId} onLevel={chooseLevel} onView={selectView} onSchedule={setSchedule} /></div>
        <div className="min-w-0" onContextMenu={(event) => { event.preventDefault(); if (selections.length) setContextMenu({ x: event.clientX, y: event.clientY }); }}>
      <div className="sticky top-[calc(env(safe-area-inset-top)+4rem)] z-30 space-y-2 bg-background/95 backdrop-blur lg:pb-1">
        <div className="hidden lg:block"><HouseRibbon
          activeCategory={activeCategory}
          activeTool={activeTool}
          selectionCount={selections.length}
          canUndo={past.length > 0}
          canRedo={future.length > 0}
          onCategory={setActiveCategory}
          onCommand={runCommand}
          onSearch={() => setPaletteOpen(true)}
          onHelp={() => setHelpOpen(true)}
        /></div>
        <div className={cn(mobileMoreOpen ? "block" : "hidden lg:block")}><HouseToolOptions activeTool={activeTool} project={project} levelId={activeLevelId} settings={toolSettings} onChange={(change) => setToolSettings((current) => ({ ...current, ...change }))} /></div>
      </div>
          <div className="hidden lg:block"><HouseSelectionActions selected={selected} onCommand={runCommand} /></div>
          <div className="flex min-w-0 gap-1"><HouseMobileTools activeTool={activeTool} selectionCount={selections.length} onCommand={runCommand} onMore={() => setPaletteOpen(true)} />
          <div className="min-w-0 flex-1">{viewportOpen ? <div className={cn("grid min-w-0 gap-3", view === "split" ? "lg:grid-cols-2" : "grid-cols-1")}>
            {view !== "3d" && activeLevel ? (
              <div className="relative h-[calc(100dvh-10rem)] min-h-[360px] min-w-0 overflow-hidden rounded-xl border bg-slate-200 lg:h-[min(680px,68dvh)] dark:bg-background">
                <HousePlanSelectionOverlay project={project} levelId={activeLevelId} activeTool={activeTool} selections={selections} draftStart={draftStart} snapEnabled={snapEnabled} chain={toolSettings.chain} viewRevision={viewRevision} roomShape={roomShape} sketch={outlineSketch} onCancelDraft={() => { setDraftStart(null); setOutlineSketch([]); }} proposals={proposals?.levelId === activeLevelId ? proposals.items : null} chosenProposal={proposals?.chosen ?? null} onProposalChoose={(id) => setProposals((current) => current && { ...current, chosen: id })} onProposalMove={(id, x, y) => setProposals((current) => current && { ...current, items: current.items.map((item) => item.id === id ? { ...item, x, y } : item) })} onMoveSelection={(selection, dx, dy) => applyMutation(moveHouseSelections(project, [selection], dx, dy, { footprintEditable: verification }), "Moved wall")} onDraftStart={(point) => { if (chainEnded.current) { chainEnded.current = false; setDraftStart(null); return; } setDraftStart(point); }} onDraft={draftObject} onSelect={chooseMany} onSelectionMenu={setContextMenu} onDimensionChange={(selection, patch) => { const conflict = lockConflict(project, selection); if (conflict) { toast.info(conflict); return; } commit(patchHouseObject(project, selection, patch), "Temporary dimension updated"); }} onGuidance={setGuidance} />
                <span className="absolute left-3 top-3 rounded-full border bg-background/90 px-3 py-1 text-xs font-medium">{activeLevel?.name} · {project.displayUnits ?? "mm"}</span>
                {activeTool === "room" && !draftStart ? <div role="radiogroup" aria-label="Room shape" className="absolute left-1/2 top-12 z-10 flex -translate-x-1/2 gap-1 rounded-xl border bg-card/95 p-1 text-xs shadow-sm backdrop-blur">
                  {([["rectangle", "Rectangle"], ["l-shape", "L shape"]] as const).map(([shape, label]) => <button key={shape} type="button" role="radio" aria-checked={roomShape === shape} onClick={() => setRoomShape(shape)} className={cn("rounded-lg px-3 py-1.5", roomShape === shape ? "bg-brand/15 text-brand" : "text-muted-foreground hover:bg-muted")}>{label}</button>)}
                  <button type="button" onClick={() => runCommand("wall")} className="rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted">Free draw</button>
                </div> : null}
                {proposals && proposals.levelId === activeLevelId ? <HouseColumnSuggestions items={proposals.items} chosen={proposals.chosen} maxSpan={proposals.maxSpan} onSpan={suggest} onRegenerate={() => suggest(proposals.maxSpan)} onAccept={acceptProposals} onRemove={(item) => setProposals({ ...proposals, items: proposals.items.filter((entry) => entry !== item), chosen: null })} onClear={() => setProposals(null)} /> : null}
                <div className="absolute inset-x-2 bottom-2 lg:hidden"><HouseSelectionActions selected={selected?.kind === "level" || proposals || activeTool && activeTool !== "select" ? null : selected} locked={Boolean(selected && project.objectInstances[selected.id]?.pinned)} onToggleLock={() => runCommand(selected && project.objectInstances[selected.id]?.pinned ? "unpin" : "pin")} onCommand={runCommand} onMore={() => setContextMenu({ x: 0, y: 0 })} /></div>
              </div>
            ) : null}
            {view !== "2d" ? (
              <HousePreview
                key={`${activeViewId ?? "model-view"}:${viewRevision}`}
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
          </div> : <button type="button" onClick={() => setViewportOpen(true)} className="min-h-16 w-full rounded-xl border border-dashed bg-muted/20 text-sm text-muted-foreground hover:border-brand hover:text-brand">Show 2D / 3D viewport</button>}</div></div>
          {verification ? <button type="button" onClick={onFinish} className="mt-3 w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-foreground">Finish design → 3D</button> : null}
          <details className="mt-2 rounded-lg border p-2 text-xs xl:hidden"><summary className="cursor-pointer py-1">Views / project browser</summary><HouseProjectBrowser project={project} activeLevelId={activeLevelId} activeViewId={activeViewId} onLevel={chooseLevel} onView={selectView} onSchedule={setSchedule} /></details>
        </div>
        <HouseObjectInspector project={project} activeLevelId={activeLevelId} selected={selected} selections={selections} onSelect={(selection) => choose(selection)} onChange={(next) => commit(next, "Properties updated")} />
      </div>

      <div id="house-facade"><HouseFacadePanel project={project} userId={userId} onChange={(next) => commit(next, "Façade updated")} /></div>
      <div id="house-ai-remodel"><HouseAiRemodelPanel project={project} selected={selected} selections={selections} onChange={(next) => commit(next, "AI model change applied")} /></div>
      <HouseStructurePanel project={project} onChange={(next) => commit(next, "Structure updated")} onSuggest={() => runCommand("suggest-columns")} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Level area" value={activeRoom ? `${floorArea(activeRoom).toFixed(2)} m²` : "—"} />
        <Summary label="Structured walls" value={String(project.walls.length)} />
        <Summary label="Openings" value={`${project.doors.length} doors · ${project.windows.length} windows`} />
        <Summary label="Structure" value={`${project.structuralColumns.length} columns · ${project.structuralBeams.length} beams`} />
      </div>

      <div className="rounded-xl border bg-card p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Structured house model:</strong> verified architecture, façade options and preliminary structural objects remain editable and reproducible from millimetre data. BOQ-ready quantities update from the same source objects.
      </div>

      <HouseStatusBar selectionCount={selections.length} snap="Endpoint · Midpoint · Intersection · Perpendicular · Nearest · Grid · Wall · Column" snapEnabled={snapEnabled} onToggleSnap={() => setSnapEnabled((value) => !value)} level={activeLevel?.name ?? "—"} units={project.displayUnits ?? "mm"} mode={activeTool ? houseCommand(activeTool).label : "Select"} saveState={`${saveState} · ${guidance}`} />
      <HouseCommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onCommand={runCommand} />
      <HouseShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <HouseContextMenu state={contextMenu} selectionCount={selections.length} onClose={() => setContextMenu(null)} onCommand={runCommand} />
    </section></HouseUnitsContext.Provider>
  );
}

function SourceCard({ active, icon, title, description, onClick }: { active: boolean; icon: React.ReactNode; title: string; description: string; onClick: () => void }) {
  return (
    <button type="button" role="radio" onClick={onClick} aria-checked={active} className={cn("block rounded-2xl border p-2.5 text-left transition-colors sm:p-5", active ? "border-brand bg-brand/5" : "hover:border-brand/40 hover:bg-muted/30")}>
      <span className="mb-1.5 flex size-8 items-center justify-center rounded-lg bg-brand/10 text-brand sm:mb-4 sm:size-11 sm:rounded-xl">{icon}</span>
      <strong className="block text-sm leading-tight sm:text-base">{title}</strong>
      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground sm:mt-1 sm:text-xs">{description}</span>
    </button>
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


function previewView(viewId: string | null): "3d" | "top" | "front" | "back" | "left" | "right" {
  if (viewId?.endsWith(":top")) return "top";
  if (viewId?.endsWith(":front")) return "front";
  if (viewId?.endsWith(":rear") || viewId?.endsWith(":back")) return "back";
  if (viewId?.endsWith(":left")) return "left";
  if (viewId?.endsWith(":right")) return "right";
  return "3d";
}

function lineDraftTool(id: HouseCommandId) {
  return ["room", "wall", "structural-wall", "room-separator", "beam", "railing", "grid", "reference-plane", "dimension", "section", "elevation", "strip-footing"].includes(id);
}

function offsetDraftSegment(start: HousePlanPoint, end: HousePlanPoint, offset: number) {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (!offset || length < 0.001) return { start, end };
  const x = -(end.y - start.y) / length * offset;
  const y = (end.x - start.x) / length * offset;
  return { start: { x: start.x + x, y: start.y + y }, end: { x: end.x + x, y: end.y + y } };
}
