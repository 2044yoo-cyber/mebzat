"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Building2,
  CheckCircle2,
  FileUp,
  FolderOpen,
  House,
  LayoutGrid,
  PenLine,
  Sparkles,
  Loader2,
  PencilRuler,
} from "lucide-react";
import { toast } from "sonner";

import {
  FloorPlanInput,
  type DraftPlan,
} from "@/components/tour/floor-plan-input";
import {
  rectangularRoom,
  roomSchema,
  type Room,
} from "@/features/berchuma-studio/types/room";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { HouseColumnSuggestions } from "./house-modeling-chrome";
import {
  EditorHeader,
  FurniturePicker,
  PlanSecondaryBar,
  PlanToolbar,
  SelectionSheet,
  WorkspaceTabs,
  type MoreItem,
  type SaveStatus,
  type SheetAction,
  type WorkspaceTab,
} from "./house-plan-chrome";
import { HouseMeasurementsDrawer } from "./house-measurements-drawer";
import { HouseObjectInspector } from "./house-object-inspector";
import { HousePlanSelectionOverlay, type HousePlanPoint } from "./house-plan-selection-overlay";
import { HouseSaveDialog, type SaveChoice } from "./house-save-dialog";
import {
  houseDraftKey,
  readHouseDraft,
  writeHouseDraft,
} from "../services/draft";
import { ensurePhaseThreeProject } from "../services/facade";
import { ensureHouseEnvelopeProject } from "../services/envelope";
import { withoutStructure } from "../services/structure";
import {
  commandFromKeyboard,
  isModelTextInput,
  type HouseCommandId,
} from "../services/command-registry";
import {
  createHouseObjectFromGesture,
  createRoomFromGesture,
  roomOutline,
  lockConflict,
  type HouseRoomShape,
  deleteHouseSelections,
  duplicateHouseSelections,
  mirrorHouseSelections,
  moveHouseSelections,
  moveHouseSelectionsTo,
  pinHouseSelections,
  rotateHouseSelections,
  type HouseClipboard,
} from "../services/model-commands";
import { addHouseFloor, establishLevelOutline, mergeRooms, openSpace, patchHouseObject, splitRoomAlong } from "../services/project-edit";
import { PLAN_TEMPLATES } from "../services/plan-templates";
import { planDescriptionError } from "../services/plan-analysis";
import { acceptColumnProposals, suggestColumns, type ColumnProposal } from "../services/column-suggestions";
import { furnitureItem, type FurnitureItem } from "../services/furniture-catalog";
import {
  createProject,
  insertPlan,
  listRecentPlans,
  loadPlan,
  updatePlan,
  type PlanLink,
  type PlanSummary,
} from "../services/plan-store";
import {
  allHouseSelections,
  ensureHouseBimState,
  sameSelection,
} from "../services/model-state";
import {
  createHouseProject,
  ensurePhaseTwoProject,
  type HouseObjectKind,
  type HouseProject,
  type HouseSelection,
  type HouseStyle,
} from "../types/project";

import { HouseUnitsContext } from "./house-units";
import { applyModelingOptions, modelingPreset, type DisplayUnits, type ModelingOptions } from "../services/workspace-options";

// three.js is only loaded when somebody opens 3D: the plan is the screen most
// people stay on, and on a phone the 3D engine is most of the page's weight.
const HousePreview = dynamic(() => import("./house-preview").then((module) => module.HousePreview), {
  ssr: false,
  loading: () => <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" /> Loading 3D…</div>,
});

type Stage = "start" | "editor" | "loading";
type Source = "manual" | "rooms" | "upload" | "sketch" | "template" | "describe";

// The 3D view shows the space: walls, openings, floors, stairs, columns and
// furniture. Roofs, ceilings, façade dressing and site would hide the rooms or
// belong to modelling this screen does not do.
const HIDDEN_IN_3D = new Set<HouseObjectKind>(["roof", "ceiling", "facade", "site", "balcony", "veranda", "railing", "grid", "beam", "foundation"]);

const drawingCommands = new Set<HouseCommandId>([
  "wall", "door", "window", "room", "room-separator", "stair", "furniture", "column", "dimension", "text",
]);

const noSubscription = () => () => undefined;

export function HouseDesignerWorkspace({ userId, planId = null, projectId = null, pinId = null }: { userId: string; planId?: string | null; projectId?: string | null; pinId?: string | null }) {
  const [stage, setStage] = useState<Stage>(planId ? "loading" : "start");
  const [source, setSource] = useState<Source>("manual");
  const [templateId, setTemplateId] = useState(PLAN_TEMPLATES[1]!.id);
  const [description, setDescription] = useState("");
  const [startTool, setStartTool] = useState<HouseCommandId>("select");
  const [room, setRoom] = useState<Room>(() => rectangularRoom(8000, 6500));
  const [floorPlans, setFloorPlans] = useState<DraftPlan[]>([]);
  const [title] = useState("My house");
  const [floorCount] = useState(1);
  const [displayUnits, setDisplayUnits] = useState<DisplayUnits>("mm");
  const [modelingOptions, setModelingOptions] = useState<ModelingOptions>(() => modelingPreset("house"));
  const [floorHeight] = useState(3000);
  const [style] = useState<HouseStyle>("modern");
  const [strict, setStrict] = useState(false);
  const [project, setProject] = useState<HouseProject | null>(null);
  const [analysingPlan, setAnalysingPlan] = useState(false);
  const [planAnalysis, setPlanAnalysis] = useState<string | null>(null);
  const [link, setLink] = useState<PlanLink | null>(null);
  const [status, setStatus] = useState<SaveStatus>("device");
  const [saveOpen, setSaveOpen] = useState(false);
  const [savingChoice, setSavingChoice] = useState(false);
  const [tab, setTab] = useState<WorkspaceTab>("plan");
  const [recentPlans, setRecentPlans] = useState<PlanSummary[] | null>(null);

  // What the autosave reads when its timer fires: the latest, not the render
  // that scheduled it.
  const projectRef = useRef<HouseProject | null>(null);
  const linkRef = useRef<PlanLink | null>(null);
  const lastSaved = useRef<HouseProject | null>(null);
  const savingRef = useRef(false);
  // A wall half drawn: autosave waits rather than interrupting the gesture.
  const busyRef = useRef(false);
  useEffect(() => {
    projectRef.current = project;
    linkRef.current = link;
  });

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

  // A copy on this device, always — the safety net under the project save.
  useEffect(() => {
    if (!project || stage !== "editor") return;
    const timer = window.setTimeout(() => { writeHouseDraft(window.localStorage, draftKey, project); }, 800);
    return () => window.clearTimeout(timer);
  }, [draftKey, project, stage]);

  // Autosave into the project, a moment after the last change.
  useEffect(() => {
    if (!project || !link || stage !== "editor" || lastSaved.current === project) return;
    let timer = 0;
    const tick = () => {
      if (busyRef.current || savingRef.current) { timer = window.setTimeout(tick, 1500); return; }
      void persist();
    };
    timer = window.setTimeout(tick, 2500);
    return () => window.clearTimeout(timer);
    // `persist` reads refs; the schedule depends only on what changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, link, stage]);

  // Opened from a link: /house-design?plan=…
  useEffect(() => {
    if (!planId) return;
    let live = true;
    void loadPlan(createClient(), planId).then((result) => {
      if (!live) return;
      if ("error" in result) { toast.error(result.error); setStage("start"); return; }
      openLoaded(result.project, result.link);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  useEffect(() => {
    if (stage !== "start" || recentPlans) return;
    let live = true;
    void listRecentPlans(createClient()).then((items) => { if (live) setRecentPlans(items); });
    return () => { live = false; };
  }, [recentPlans, stage]);

  function normalise(value: HouseProject) {
    // Structure is not generated automatically; a draft saved with the
    // generated kind comes back without it. Columns placed by hand stay.
    return ensureHouseBimState(withoutStructure(ensureHouseEnvelopeProject(ensurePhaseThreeProject(ensurePhaseTwoProject(value)))));
  }

  function openLoaded(loaded: HouseProject, loadedLink: PlanLink | null) {
    const restored = normalise(loaded);
    const restoredRoom = restored.levels.find((level) => level.plan)?.plan;
    setProject(restored);
    lastSaved.current = loadedLink ? restored : null;
    setLink(loadedLink);
    setStatus(loadedLink ? "saved" : "device");
    setDisplayUnits(restored.displayUnits ?? "mm");
    setModelingOptions(restored.modelingOptions ?? modelingPreset("house"));
    if (restoredRoom) setRoom(restoredRoom);
    setStrict(restored.originalPlanStrict);
    setFloorPlans(toDraftPlans(restored, "floor-plan"));
    setStartTool("select");
    setTab("plan");
    setStage("editor");
  }

  async function openSaved(id: string) {
    setStage("loading");
    const result = await loadPlan(createClient(), id);
    if ("error" in result) { toast.error(result.error); setStage("start"); return; }
    openLoaded(result.project, result.link);
    window.history.replaceState(null, "", `/house-design?plan=${result.link.planId}`);
  }

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

  async function openEditor(nextSource: Source, ai = false) {
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
        setPlanAnalysis(["AI drew this plan from your description. Check every wall, door and window.", ...(payload.notes ?? [])].join(" "));
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
        setPlanAnalysis(`Plan geometry ${confidence}. Check every wall and opening.`);
        toast.success("Floor-plan objects detected. Please verify them.");
      } catch (error) {
        setPlanAnalysis("Automatic detection was unavailable. Trace the uploaded plan by hand.");
        toast.info(error instanceof Error ? error.message : "Continue by tracing the plan.");
      } finally {
        setAnalysingPlan(false);
      }
    }
    setRoom(verifiedRoom);
    // Structure is not generated automatically: the plan arrives without it.
    const built = ensureHouseBimState({ ...withoutStructure(applyModelingOptions(createHouseProject({
      id: project?.id,
      title,
      room: verifiedRoom,
      style,
      strict,
      floorCount,
      floorToFloorHeight: floorHeight,
      referenceImages: references(floorPlans),
    }), modelingOptions)), displayUnits });
    // Drawing from scratch starts on genuinely open space: the project's
    // floors and settings, and nothing on them until it is drawn.
    setProject(nextSource === "manual" || nextSource === "rooms" ? openSpace(built) : built);
    setLink(null);
    lastSaved.current = null;
    setStatus("device");
    setTab("plan");
    setStage("editor");
  }

  function updateProject(next: HouseProject) {
    const updated = { ...next, metadata: { ...next.metadata, updatedAt: new Date().toISOString() } };
    setProject(updated);
    setStatus(linkRef.current ? "unsaved" : "device");
    const groundPlan = updated.levels[0]?.plan;
    if (groundPlan) setRoom(groundPlan);
  }

  async function persist() {
    const current = projectRef.current;
    const target = linkRef.current;
    if (!current || !target || savingRef.current) return;
    savingRef.current = true;
    setStatus("saving");
    const result = await updatePlan(createClient(), userId, target, current);
    savingRef.current = false;
    if (!result.ok) {
      setStatus(result.conflict ? "conflict" : "error");
      if (result.conflict) toast.error(result.error, { action: { label: "Reload", onClick: () => void openSaved(target.planId) } });
      return;
    }
    lastSaved.current = current;
    setLink(result.link);
    setStatus(projectRef.current === current ? "saved" : "unsaved");
  }

  function saveProject() {
    if (!project) return;
    if (link) { void persist(); return; }
    setSaveOpen(true);
  }

  async function saveInto(choice: SaveChoice) {
    if (!project) return;
    setSavingChoice(true);
    const client = createClient();
    const target = "newName" in choice.project ? await createProject(client, userId, choice.project.newName) : choice.project;
    if ("error" in target) { setSavingChoice(false); toast.error(target.error); return; }
    const named = { ...project, metadata: { ...project.metadata, title: choice.title, updatedAt: new Date().toISOString() } };
    const result = await insertPlan(client, userId, target, named);
    setSavingChoice(false);
    if (!result.ok) { toast.error(result.error); return; }
    setProject(named);
    lastSaved.current = named;
    setLink(result.link);
    setStatus("saved");
    setSaveOpen(false);
    window.history.replaceState(null, "", `/house-design?plan=${result.link.planId}`);
    toast.success(`Saved to ${target.name}`);
  }

  function toStart() {
    // The list is read again: a plan saved since it was last shown belongs in it.
    setRecentPlans(null);
    setStage("start");
    window.history.replaceState(null, "", "/house-design");
  }

  function download() {
    if (!project) return;
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slug(project.metadata.title) || "house_plan"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function rename() {
    if (!project) return;
    const next = window.prompt("Plan name", project.metadata.title)?.trim();
    if (next) updateProject({ ...project, metadata: { ...project.metadata, title: next.slice(0, 160) } });
  }

  const projectMenu: MoreItem[] = project ? [
    { id: "save", label: link ? "Save now" : "Save project…", onSelect: saveProject },
    ...(link ? [{ id: "agenda", label: `Open ${link.projectName} in Agenda`, onSelect: () => { window.location.href = `/agenda/projects/${link.projectId}/plan`; } }] : []),
    { id: "rename", label: "Rename plan", onSelect: rename },
    { id: "units", label: `Units: ${project.displayUnits ?? "mm"} (change)`, onSelect: () => updateProject({ ...project, displayUnits: nextUnit(project.displayUnits ?? "mm") }) },
    { id: "download", label: "Download plan data (JSON)", onSelect: download },
    { id: "new", label: "Start a new plan", onSelect: toStart },
  ] : [];

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden px-2 pb-6 pt-2 sm:px-5 md:pb-8">
      {stage === "start" ? (
        <>
          <header className="mb-2 flex min-w-0 items-center gap-3 rounded-2xl border bg-card p-2 sm:mb-4 sm:p-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand sm:size-10">
              <Building2 className="size-4 sm:size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold sm:text-lg">House Plan</h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">Record a space, measure it, sketch on it, and discuss it with the team</p>
            </div>
          </header>
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
            onContinue={(ai) => void openEditor(source, ai)}
            onRestore={savedDraft ? () => openLoaded(savedDraft.project, null) : undefined}
            recentPlans={recentPlans}
            onOpenPlan={(id) => void openSaved(id)}
          />
        </>
      ) : stage === "loading" || !project ? (
        <div className="flex min-h-[50dvh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" /> Opening the plan…</div>
      ) : (
        <PlanEditor
          key={project.id}
          project={project}
          onProjectChange={updateProject}
          tab={tab}
          onTab={setTab}
          status={status}
          onSave={saveProject}
          onRetry={status === "error" || status === "conflict" || status === "unsaved" ? saveProject : undefined}
          onBack={toStart}
          menu={projectMenu}
          analysis={planAnalysis}
          initialTool={startTool}
          link={link}
          onBusy={(busy) => { busyRef.current = busy; }}
        />
      )}
      {saveOpen && project ? <HouseSaveDialog defaultTitle={project.metadata.title} preferredProjectId={projectId} busy={savingChoice} onSave={(choice) => void saveInto(choice)} onClose={() => setSaveOpen(false)} /> : null}
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
  recentPlans,
  onOpenPlan,
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
  recentPlans: PlanSummary[] | null;
  onOpenPlan: (id: string) => void;
}) {
  return (
    <div>
      <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">New plan</p>
          <h2 className="mt-1 text-xl font-semibold sm:text-2xl">Record a floor plan</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every way in ends at the same plan: measure it, sketch on it, save it to a project and discuss it on its Agenda.
          </p>
        </div>

        {recentPlans?.length ? (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Saved plans</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {recentPlans.map((plan) => (
                <button key={plan.id} type="button" onClick={() => onOpenPlan(plan.id)} className="flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm hover:bg-muted/40">
                  <FolderOpen className="size-4 shrink-0 text-brand" />
                  <span className="min-w-0"><strong className="block truncate">{plan.title}</strong><span className="block truncate text-xs text-muted-foreground">{plan.projectName ?? "Project"} · {new Date(plan.updatedAt).toLocaleDateString()}</span></span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {onRestore ? (
          <button
            type="button"
            onClick={onRestore}
            className="flex w-full items-center justify-between rounded-xl border border-brand/30 bg-brand/5 p-3 text-left text-sm hover:bg-brand/10"
          >
            <span><strong>Continue the plan on this device</strong><br /><span className="text-xs text-muted-foreground">Not yet saved to a project</span></span>
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

function PlanEditor({
  project,
  onProjectChange,
  tab,
  onTab,
  status,
  onSave,
  onRetry,
  onBack,
  menu,
  analysis,
  initialTool = "select",
  link,
  onBusy,
}: {
  project: HouseProject;
  onProjectChange: (project: HouseProject) => void;
  tab: WorkspaceTab;
  onTab: (tab: WorkspaceTab) => void;
  status: SaveStatus;
  onSave: () => void;
  onRetry?: () => void;
  onBack: () => void;
  menu: MoreItem[];
  analysis: string | null;
  initialTool?: HouseCommandId;
  link: PlanLink | null;
  onBusy: (busy: boolean) => void;
}) {
  const [chosenLevelId, setActiveLevelId] = useState(project.levels[0]?.id ?? "ground-floor");
  // Undoing Add Floor deletes the floor being looked at; everything that
  // reads the active level must then fall back to one that still exists.
  const activeLevelId = project.levels.some((level) => level.id === chosenLevelId) ? chosenLevelId : project.levels[0]?.id ?? chosenLevelId;
  const [selections, setSelections] = useState<HouseSelection[]>([]);
  const [activeTool, setActiveTool] = useState<HouseCommandId | null>(initialTool);
  const [past, setPast] = useState<HouseProject[]>([]);
  const [future, setFuture] = useState<HouseProject[]>([]);
  const [draftStart, setDraftStart] = useState<HousePlanPoint | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridVisible, setGridVisible] = useState(true);
  const [viewRevision, setViewRevision] = useState(0);
  const [roomShape, setRoomShape] = useState<HouseRoomShape>("rectangle");
  const [showAnalysis, setShowAnalysis] = useState(true);
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
  const [furniture, setFurniture] = useState<FurnitureItem>(() => furnitureItem("bed"));
  const [furnitureOpen, setFurnitureOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [toolSettings, setToolSettings] = useState({
    height: project.levels[0]?.floorToFloorHeight ?? 3000,
    width: 600,
    depth: 600,
    sillHeight: 900,
    chain: true,
  });
  const clipboard = useRef<HouseClipboard | null>(null);
  const keyboardRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  const escapeRef = useRef(0);
  const selected = selections.at(-1) ?? null;
  const activeLevel = project.levels.find((level) => level.id === activeLevelId) ?? project.levels[0];
  const selectMode = !activeTool || activeTool === "select";

  useEffect(() => { onBusy(Boolean(draftStart || outlineSketch.length)); }, [draftStart, outlineSketch, onBusy]);

  function chooseLevel(levelId: string) {
    setOutlineSketch([]);
    if (proposals && proposals.levelId !== levelId) setProposals(null);
    setActiveLevelId(levelId);
    setSelections([]);
  }

  function suggest(maxSpan: number) {
    const items = suggestColumns(project, activeLevelId, maxSpan);
    setActiveTool("select");
    setDraftStart(null);
    setSelections([]);
    if (!items.length) {
      setProposals(null);
      toast.info("Every corner, junction and span on this floor already has a column.");
      return;
    }
    setProposals({ levelId: activeLevelId, maxSpan, items, chosen: null });
  }

  function acceptProposals(items: ColumnProposal[]) {
    if (!proposals || !items.length) return;
    commit(acceptColumnProposals(project, proposals.levelId, items));
    const left = proposals.items.filter((item) => !items.includes(item));
    setProposals(left.length ? { ...proposals, items: left, chosen: null } : null);
  }

  function addFloor() {
    const result = addHouseFloor(project);
    if (!result.levelId) { toast.info("The top floor needs a plan before another can go on it."); return; }
    const levelId = result.levelId;
    commit(result.project);
    chooseLevel(levelId);
  }

  function commit(next: HouseProject) {
    if (next === project) return;
    setPast((items) => [...items, project].slice(-60));
    setFuture([]);
    onProjectChange(next);
  }

  function applyMutation(result: ReturnType<typeof deleteHouseSelections>) {
    if (result.project !== project) commit(result.project);
    setSelections(result.selections);
    if (result.blocked.length) toast.info(result.blocked.join(". "));
  }

  function undo() {
    const previous = past.at(-1);
    if (!previous) return;
    setPast((items) => items.slice(0, -1));
    setFuture((items) => [project, ...items].slice(0, 60));
    onProjectChange(previous);
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setFuture((items) => items.slice(1));
    setPast((items) => [...items, project].slice(-60));
    onProjectChange(next);
  }

  function mergeInto(firstId: string, secondId: string) {
    setMergeFrom(null);
    const result = mergeRooms(project, firstId, secondId);
    if (result.blocked) { toast.info(result.blocked); return; }
    commit(result.project);
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

  function activateDrawingTool(id: HouseCommandId, item: FurnitureItem = furniture) {
    if (!drawingCommands.has(id)) return false;
    const height = activeLevel?.floorToFloorHeight ?? 3000;
    if (id === "door") setToolSettings((current) => ({ ...current, width: 900, height: 2100, sillHeight: 0 }));
    else if (id === "window") setToolSettings((current) => ({ ...current, width: 1200, height: 1500, sillHeight: 900 }));
    else if (id === "wall" || id === "room-separator") setToolSettings((current) => ({ ...current, height }));
    else if (id === "column") setToolSettings((current) => ({ ...current, width: 300, depth: 300, height }));
    // A stair has its own size; inheriting the last column's 300 mm made it
    // a stair nobody could climb.
    else if (id === "stair") setToolSettings((current) => ({ ...current, width: 1000, depth: 3000, height }));
    else if (id === "furniture") setToolSettings((current) => ({ ...current, width: item.width, depth: item.depth, height: item.height }));
    setActiveTool(id);
    setDraftStart(null);
    setSelections([]);
    return true;
  }

  function chooseTool(id: HouseCommandId) {
    setFurnitureOpen(id === "furniture");
    if (id === "select") { setActiveTool("select"); setDraftStart(null); setOutlineSketch([]); return; }
    activateDrawingTool(id);
  }

  function draftObject(start: HousePlanPoint, end: HousePlanPoint) {
    if (!activeTool) return;
    if (activeTool === "move") {
      applyMutation(moveHouseSelectionsTo(project, selections, end));
      setActiveTool("select");
      return;
    }
    if (!activeLevel?.plan && activeTool === "room") {
      const outlined = establishLevelOutline(project, activeLevelId, roomOutline(roomShape, start, end));
      if (!outlined) { toast.info("Drag out the room — at least 500 mm each way"); return; }
      commit(outlined);
      return;
    }
    if (!activeLevel?.plan && activeTool === "wall") {
      const sketch = outlineSketch.length ? outlineSketch : [start];
      const closes = sketch.length >= 3 && Math.hypot(end.x - sketch[0]!.x, end.y - sketch[0]!.y) < 1;
      if (!closes) {
        setOutlineSketch([...sketch, end]);
        return;
      }
      const outlined = establishLevelOutline(project, activeLevelId, sketch);
      setOutlineSketch([]);
      setDraftStart(null);
      chainEnded.current = true;
      if (!outlined) { toast.info("That shape encloses no floor — draw it again"); return; }
      commit(outlined);
      return;
    }
    if (activeTool === "room") {
      applyMutation(createRoomFromGesture(project, activeLevelId, start, end, roomShape, { wallThickness: 120, height: toolSettings.height }));
      return;
    }
    const wallThickness = activeTool === "room-separator" ? 25 : 120;
    const created = createHouseObjectFromGesture(project, activeTool, activeLevelId, start, end, {
      width: toolSettings.width,
      depth: toolSettings.depth,
      height: toolSettings.height,
      sillHeight: toolSettings.sillHeight,
      wallThickness: activeTool === "wall" ? (activeLevel?.plan ? 120 : 200) : wallThickness,
      name: activeTool === "furniture" ? furniture.name : undefined,
    });
    // A wall drawn right across a room divides it, in the same undo step.
    if (activeTool === "wall" && !created.blocked.length) created.project = splitRoomAlong(created.project, activeLevelId, start, end);
    applyMutation(created);
    // Furniture and a measurement are placed one at a time and then shown.
    if (activeTool === "furniture" || activeTool === "dimension" || activeTool === "text") setActiveTool("select");
  }

  function deleteSelection() {
    if (!selections.length) return;
    applyMutation(deleteHouseSelections(project, selections, { footprintEditable: true }));
    setSelections([]);
  }

  function sheetAction(action: SheetAction) {
    switch (action) {
      case "move": setActiveTool("move"); setDraftStart(null); toast.info("Tap where it should go — or drag it"); return;
      case "delete": deleteSelection(); return;
      case "flip": applyMutation(mirrorHouseSelections(project, selections)); return;
      case "rotate": applyMutation(rotateHouseSelections(project, selections)); return;
      case "duplicate": applyMutation(duplicateHouseSelections(project, selections)); return;
      case "lock": commit(pinHouseSelections(project, selections, !selections.every((item) => project.objectInstances[item.id]?.pinned))); return;
      case "merge": {
        const rooms = selections.filter((item) => item.kind === "room");
        if (rooms.length >= 2) { mergeInto(rooms[0]!.id, rooms[1]!.id); return; }
        if (!rooms[0]) return;
        setMergeFrom(rooms[0].id);
        toast.info("Tap the room to merge with");
        return;
      }
      case "agenda":
        if (!link) { toast.info("Save the project first — then it can go on its Agenda."); return; }
        toast.info("Open the Agenda tab to add this to the project's Agenda.");
        onTab("agenda");
        return;
      case "properties": setInspectorOpen(true); window.setTimeout(() => document.getElementById("house-properties")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); return;
    }
  }

  function runCommand(id: HouseCommandId) {
    switch (id) {
      case "undo": undo(); return;
      case "redo": redo(); return;
      case "save": onSave(); return;
      case "select": chooseTool("select"); return;
      case "cancel": {
        const now = Date.now();
        if (draftStart || outlineSketch.length) {
          setDraftStart(null);
          setOutlineSketch([]);
          escapeRef.current = now;
          return;
        }
        if (activeTool && activeTool !== "select") setActiveTool("select");
        else setSelections([]);
        setFurnitureOpen(false);
        escapeRef.current = now;
        return;
      }
      case "finish": setActiveTool("select"); setDraftStart(null); return;
      case "delete": deleteSelection(); return;
      case "copy": clipboard.current = { sourceProjectId: project.id, selections: [...selections] }; return;
      case "cut": clipboard.current = { sourceProjectId: project.id, selections: [...selections] }; deleteSelection(); return;
      case "paste": {
        if (!clipboard.current || clipboard.current.sourceProjectId !== project.id) return;
        applyMutation(duplicateHouseSelections(project, clipboard.current.selections, 250)); return;
      }
      case "duplicate": applyMutation(duplicateHouseSelections(project, selections)); return;
      case "rotate": applyMutation(rotateHouseSelections(project, selections)); return;
      case "flip": applyMutation(mirrorHouseSelections(project, selections)); return;
      case "select-all": setSelections(allHouseSelections(project, activeLevelId).filter((item) => item.kind !== "level")); return;
      case "cycle-selection": {
        const items = allHouseSelections(project, activeLevelId).filter((item) => item.kind !== "level");
        const index = selected ? items.findIndex((item) => sameSelection(item, selected)) : -1;
        if (items.length) setSelections([items[(index + 1) % items.length]!]);
        return;
      }
      default:
        if (drawingCommands.has(id)) chooseTool(id);
    }
  }

  useEffect(() => {
    keyboardRef.current = (event) => {
      if (tab !== "plan" || isModelTextInput(event.target)) return;
      if (event.key.startsWith("Arrow") && selections.length) {
        event.preventDefault();
        const amount = event.shiftKey ? 100 : 10;
        const dx = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
        const dy = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
        applyMutation(moveHouseSelections(project, selections, dx, dy, { footprintEditable: true }));
        return;
      }
      const direct = commandFromKeyboard(event);
      if (direct) {
        event.preventDefault();
        runCommand(direct);
      }
    };
  });

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => keyboardRef.current(event);
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);

  const moreTools: MoreItem[] = [
    { id: "partition", label: "Partition (thin wall)", onSelect: () => chooseTool("room-separator") },
    { id: "text", label: "Text label", onSelect: () => chooseTool("text") },
    { id: "add-floor", label: "Add floor", onSelect: addFloor },
    { id: "suggest", label: "Suggest columns", onSelect: () => suggest(proposals?.maxSpan ?? 4500), disabled: !activeLevel?.plan },
    { id: "select-all", label: "Select everything on this floor", onSelect: () => runCommand("select-all") },
    { id: "fit", label: "Zoom to fit", onSelect: () => setViewRevision((value) => value + 1) },
  ];

  const sheetFor = tab === "plan" && selectMode && selected && selected.kind !== "level" && !proposals && !mergeFrom && selections.length === 1 ? selected : null;
  const bottomActions = (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={onSave} className="min-h-12 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground">Save project</button>
      {tab === "3d"
        ? <button type="button" onClick={() => onTab("plan")} className="min-h-12 rounded-xl border px-4 text-sm font-semibold hover:bg-muted">Back to plan</button>
        : <button type="button" onClick={() => onTab("3d")} className="min-h-12 rounded-xl border px-4 text-sm font-semibold hover:bg-muted">View 3D</button>}
    </div>
  );

  return (
    <HouseUnitsContext.Provider value={project.displayUnits ?? "mm"}>
      <section className="min-w-0 space-y-2">
        <EditorHeader onBack={onBack} levels={project.levels} activeLevelId={activeLevelId} onLevel={chooseLevel} onAddFloor={addFloor} status={status} onRetry={onRetry} menu={menu} />
        <WorkspaceTabs tab={tab} onTab={onTab} />

        {tab === "plan" ? (
          <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-2">
              {analysis && showAnalysis ? <p className="flex items-start gap-2 rounded-xl border border-brand/25 bg-brand/5 p-2.5 text-xs">{analysis}<button type="button" onClick={() => setShowAnalysis(false)} aria-label="Dismiss" className="ml-auto shrink-0 text-muted-foreground">✕</button></p> : null}
              <PlanToolbar activeTool={activeTool} onTool={chooseTool} />
              <div className="relative h-[calc(100dvh-26rem)] min-h-[300px] min-w-0 overflow-hidden rounded-xl border bg-slate-200 lg:h-[min(640px,60dvh)] dark:bg-background">
                {activeLevel ? <HousePlanSelectionOverlay project={project} levelId={activeLevelId} activeTool={activeTool} selections={selections} draftStart={draftStart} snapEnabled={snapEnabled} showGrid={gridVisible} chain={toolSettings.chain} viewRevision={viewRevision} roomShape={roomShape} sketch={outlineSketch} onCancelDraft={() => { setDraftStart(null); setOutlineSketch([]); }} proposals={proposals?.levelId === activeLevelId ? proposals.items : null} chosenProposal={proposals?.chosen ?? null} onProposalChoose={(id) => setProposals((current) => current && { ...current, chosen: id })} onProposalMove={(id, x, y) => setProposals((current) => current && { ...current, items: current.items.map((item) => item.id === id ? { ...item, x, y } : item) })} onMoveSelection={(selection, dx, dy) => applyMutation(moveHouseSelections(project, [selection], dx, dy, { footprintEditable: true }))} onDraftStart={(point) => { if (chainEnded.current) { chainEnded.current = false; setDraftStart(null); return; } setDraftStart(point); }} onDraft={draftObject} onSelect={chooseMany} onSelectionMenu={() => undefined} onDimensionChange={(selection, patch) => { const conflict = lockConflict(project, selection); if (conflict) { toast.info(conflict); return; } commit(patchHouseObject(project, selection, patch)); }} onGuidance={() => undefined} /> : null}
                <span className="pointer-events-none absolute left-2 top-2 rounded-full border bg-background/90 px-2.5 py-1 text-[11px] font-medium">{activeLevel?.name} · {project.displayUnits ?? "mm"}</span>
                {activeTool === "room" && !draftStart ? <div role="radiogroup" aria-label="Room shape" className="absolute left-1/2 top-10 z-10 flex -translate-x-1/2 gap-1 rounded-xl border bg-card/95 p-1 text-xs shadow-sm backdrop-blur">
                  {([["rectangle", "Rectangle"], ["l-shape", "L shape"]] as const).map(([shape, label]) => <button key={shape} type="button" role="radio" aria-checked={roomShape === shape} onClick={() => setRoomShape(shape)} className={cn("min-h-9 rounded-lg px-3", roomShape === shape ? "bg-brand/15 text-brand" : "text-muted-foreground hover:bg-muted")}>{label}</button>)}
                  <button type="button" onClick={() => chooseTool("wall")} className="min-h-9 rounded-lg px-3 text-muted-foreground hover:bg-muted">Free draw</button>
                </div> : null}
                {activeTool === "furniture" && furnitureOpen ? <FurniturePicker chosen={furniture.id} onChoose={(item) => { setFurniture(item); activateDrawingTool("furniture", item); setFurnitureOpen(false); toast.info(`Tap where the ${item.name.toLowerCase()} goes`); }} onClose={() => setFurnitureOpen(false)} /> : null}
                {activeTool === "move" ? <p className="pointer-events-none absolute inset-x-2 top-10 z-10 rounded-lg bg-brand px-3 py-2 text-center text-xs font-medium text-brand-foreground">Tap the new position</p> : null}
                {mergeFrom ? <p className="pointer-events-none absolute inset-x-2 top-10 z-10 rounded-lg bg-brand px-3 py-2 text-center text-xs font-medium text-brand-foreground">Tap the room to merge with</p> : null}
                {proposals && proposals.levelId === activeLevelId ? <HouseColumnSuggestions items={proposals.items} chosen={proposals.chosen} maxSpan={proposals.maxSpan} onSpan={suggest} onRegenerate={() => suggest(proposals.maxSpan)} onAccept={acceptProposals} onRemove={(item) => setProposals({ ...proposals, items: proposals.items.filter((entry) => entry !== item), chosen: null })} onClear={() => setProposals(null)} /> : null}
                {sheetFor ? <SelectionSheet key={sheetFor.id} project={project} selection={sheetFor} onPatch={(patch) => { const conflict = lockConflict(project, sheetFor); if (conflict) { toast.info(conflict); return; } commit(patchHouseObject(project, sheetFor, patch)); }} onAction={sheetAction} onClose={() => setSelections([])} /> : null}
              </div>
              <PlanSecondaryBar canUndo={past.length > 0} canRedo={future.length > 0} onUndo={undo} onRedo={redo} snap={snapEnabled} onSnap={() => setSnapEnabled((value) => !value)} grid={gridVisible} onGrid={() => setGridVisible((value) => !value)} more={moreTools} />
              <HouseMeasurementsDrawer project={project} levelId={activeLevelId} onSelect={(selection) => { setActiveTool("select"); setSelections([selection]); }} />
              {bottomActions}
            </div>
            <div id="house-properties-panel" className={cn("min-w-0", inspectorOpen ? "block" : "hidden lg:block")}>
              <HouseObjectInspector project={project} activeLevelId={activeLevelId} selected={selected} selections={selections} onSelect={(selection) => setSelections(selection ? [selection] : [])} onChange={(next) => commit(next)} />
            </div>
          </div>
        ) : tab === "3d" ? (
          <div className="space-y-2">
            <HousePreview
              project={project}
              visibleLevelIds={new Set(project.levels.map((level) => level.id))}
              selected={null}
              hiddenKinds={HIDDEN_IN_3D}
              onSelect={() => undefined}
              className="h-[calc(100dvh-14rem)] min-h-[360px] lg:h-[min(680px,68dvh)]"
            />
            {bottomActions}
          </div>
        ) : (
          <ProjectSectionPlaceholder tab={tab} linked={Boolean(link)} onSave={onSave} />
        )}
      </section>
    </HouseUnitsContext.Provider>
  );
}

function ProjectSectionPlaceholder({ tab, linked, onSave }: { tab: WorkspaceTab; linked: boolean; onSave: () => void }) {
  const what = tab === "sketch" ? "Sketches" : tab === "files" ? "Files" : "Agenda items";
  return (
    <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
      {linked ? <p>{what} for this project appear here.</p> : <>
        <p>{what} live in the project. Save the plan into a project first.</p>
        <button type="button" onClick={onSave} className="mt-3 min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground">Save project</button>
      </>}
    </div>
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

function references(plans: DraftPlan[]): HouseProject["referenceImages"] {
  return plans.map((plan) => ({ id: plan.key, kind: "floor-plan" as const, name: plan.title, url: plan.url, mediaType: plan.mediaType }));
}

function toDraftPlans(project: HouseProject, kind: "floor-plan" | "facade"): DraftPlan[] {
  return project.referenceImages.filter((image) => image.kind === kind).map((image) => ({ key: image.id, title: image.name, url: image.url, mediaType: image.mediaType }));
}

function safeRead(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

function slug(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }

function nextUnit(unit: DisplayUnits): DisplayUnits { return unit === "mm" ? "cm" : unit === "cm" ? "m" : "mm"; }

