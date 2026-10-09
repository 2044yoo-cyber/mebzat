"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
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
  PlanSecondaryBar,
  PlanToolbar,
  QuickActionBar,
  SelectionSheet,
  WorkspaceTabs,
  type MoreItem,
  type QuickAction,
  type SaveStatus,
  type SheetAction,
  type WorkspaceTab,
} from "./house-plan-chrome";
import { HouseAgendaPanel } from "./house-agenda-panel";
import { HouseFilesPanel } from "./house-files-panel";
import { HouseMeasurementsDrawer } from "./house-measurements-drawer";
import { HousePinDialog, HousePinSheet } from "./house-pin-sheet";
import { HouseSketchPanel, type SketchRequest } from "./house-sketch-panel";
import { HouseObjectInspector } from "./house-object-inspector";
import { HousePlanSelectionOverlay, selectableBounds, type HousePlanPoint } from "./house-plan-selection-overlay";
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
  splitHouseSelection,
  type HouseClipboard,
} from "../services/model-commands";
import { addHouseFloor, establishLevelOutline, mergeRooms, openSpace, patchHouseObject, splitRoomAlong } from "../services/project-edit";
import { PLAN_TEMPLATES, ROOM_SAMPLES } from "../services/plan-templates";
import { HouseTemplateLibrary } from "./house-template-library";
import { ObjectLibrarySheet, type LibraryChoice, type LibraryKind, type StairSpace } from "./house-object-library";
import { ObjectSymbol, StairSymbol } from "./plan-symbols";
import { ColumnSymbol } from "./house-plan-selection-overlay";
import { doorType, placeAgainstWall, snapToFurniture } from "../services/object-library";
import { stairGeometry } from "../services/stair-geometry";
import { planDescriptionError } from "../services/plan-analysis";
import { acceptColumnProposals, suggestColumns, type ColumnProposal } from "../services/column-suggestions";
import { furnitureItem, type FurnitureItem } from "../services/furniture-catalog";
import { levelMeasurements, pointInPolygon } from "../services/measurements";
import { duplicateWallParallel, extendWall, moveWallEnd, roomRectangle, rotateWall90, setWallDistance, setWallLength, splitRoom, toggleWallJoints, wallJointLinked, wallJointsLinked } from "../services/quick-edit";
import { attachToTask, createPin, createTask, listPins, pinHref, taskStatuses, updatePin, type Pin, type SketchSource } from "../services/sketch-store";
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
import { applyModelingOptions, displayLength, modelLength, modelingPreset, type DisplayUnits, type ModelingOptions } from "../services/workspace-options";

// three.js is only loaded when somebody opens 3D: the plan is the screen most
// people stay on, and on a phone the 3D engine is most of the page's weight.
const HousePreview = dynamic(() => import("./house-preview").then((module) => module.HousePreview), {
  ssr: false,
  loading: () => <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" /> Loading 3D…</div>,
});

import { exportPlanImage, printPlan } from "../services/plan-export";
import { createHouseTakeoffPackage, HOUSE_TAKEOFF_SESSION_KEY } from "../services/takeoff-adapter";
import { FreehandCanvas } from "./freehand-canvas";
import { applyFreehand, dimensionRectangle, dimensionConflicts, calibrateFromWall, rememberWallLength } from "../services/freehand";
import { IMAGE_IMPORT_KEY } from "../services/image-line-detection";
import { MAX_REVIEWED_WALLS } from "../services/dxf-wall-import";

type Stage = "start" | "editor" | "loading";
type Source = "freehand" | "manual" | "rooms" | "upload" | "sketch" | "template" | "describe";

// The 3D view shows the space: walls, openings, floors, stairs, columns and
// furniture. Roofs, ceilings, façade dressing and site would hide the rooms or
// belong to modelling this screen does not do.
const HIDDEN_IN_3D = new Set<HouseObjectKind>(["roof", "ceiling", "facade", "site", "balcony", "veranda", "railing", "grid", "beam", "foundation"]);

const drawingCommands = new Set<HouseCommandId>([
  "wall", "door", "window", "room", "room-separator", "stair", "furniture", "column", "dimension", "text", "split",
]);

const noSubscription = () => () => undefined;

export function HouseDesignerWorkspace({ userId, planId = null, projectId = null, pinId = null, sketchId = null }: { userId: string; planId?: string | null; projectId?: string | null; pinId?: string | null; sketchId?: string | null }) {
  const [stage, setStage] = useState<Stage>(planId ? "loading" : "start");
  const [freehandOpen, setFreehandOpen] = useState(false);
  const [source, setSource] = useState<Source>("manual");
  const [templateId] = useState(PLAN_TEMPLATES[1]!.id);
  // "" is the empty grid with the Room tool; otherwise a sample room to start from.
  const [roomSampleId, setRoomSampleId] = useState("");
  const [description, setDescription] = useState("");
  const [startTool, setStartTool] = useState<HouseCommandId>("select");
  const [room, setRoom] = useState<Room>(() => rectangularRoom(8000, 6500));
  const [floorPlans, setFloorPlans] = useState<DraftPlan[]>([]);
  const [title] = useState("My house");
  const [floorCount] = useState(1);
  const [displayUnits, setDisplayUnits] = useState<DisplayUnits>("m");
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

  // One-time browser-local handoff from Design → Image to 3D.
  // No AI endpoint is called; the imported candidate walls stay editable.
  useEffect(() => {
    if (planId || new URLSearchParams(window.location.search).get("import") !== "image") return;
    const raw = window.sessionStorage.getItem(IMAGE_IMPORT_KEY);
    if (!raw) return;
    window.sessionStorage.removeItem(IMAGE_IMPORT_KEY);
    try {
      const payload = JSON.parse(raw) as {
        version?: number;
        createdAt?: number;
        source?: string;
        mmPerUnit?: number;
        lines?: { start: { x: number; y: number }; end: { x: number; y: number } }[];
      };
      if (payload.version !== 1 || !payload.createdAt || Date.now() - payload.createdAt > 10 * 60_000 ||
          !Number.isFinite(payload.mmPerUnit) || (payload.mmPerUnit ?? 0) <= 0 ||
          !Array.isArray(payload.lines) || !payload.lines.length || payload.lines.length > MAX_REVIEWED_WALLS ||
          payload.lines.some(line => !line || !line.start || !line.end ||
            ![line.start.x, line.start.y, line.end.x, line.end.y].every(Number.isFinite))) {
        throw new Error("The plan import expired or its wall geometry is invalid. Return to Upload Floor Plan and review it again.");
      }
      const sketch: NonNullable<HouseProject["freehandSketch"]> = {
        version: 1,
        calibrated: true,
        mmPerUnit: payload.mmPerUnit!,
        strokes: payload.lines.map((line, index) => ({
          id: `image-wall-${index + 1}`,
          thickness: 200,
          points: [
            { x: line.start.x, y: line.start.y },
            { x: line.end.x, y: line.end.y },
          ],
        })),
      };
      // Pixel-space snapping precedes one-time conversion into millimetres
      // using the user's known measurement; no paid AI service is involved.
      const blank = openSpace(createHouseProject({
        title: "Imported floor plan",
        room: rectangularRoom(8000, 6500),
        style: "modern",
        strict: false,
        floorCount: 1,
        floorToFloorHeight: 3000,
      }));
      const imported = ensureHouseBimState(applyFreehand(blank, sketch, 8));
      setProject({ ...imported, displayUnits: "m" });
      setSource("upload");
      setLink(null);
      setStatus("device");
      setTab("plan");
      setStartTool("select");
      setPlanAnalysis("Editable walls imported without AI from the reviewed image, PDF or DXF. Verify wall locations, closed rooms, door/window openings and dimensions before using 3D or quantity estimates.");
      setStage("editor");
      toast.success("Floor-plan wall geometry imported. Review and save the plan.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Floor-plan import failed.");
    } finally {
      window.history.replaceState(null, "", "/house-design");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

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

  async function openEditor(nextSource: Source, ai = false, chosen?: { room: Room; floors: number }) {
    setSource(nextSource);
    const template = chosen ? { build: () => chosen.room }
      : nextSource === "template" ? PLAN_TEMPLATES.find((item) => item.id === templateId)
      : nextSource === "rooms" && roomSampleId ? ROOM_SAMPLES.find((item) => item.id === roomSampleId) : null;
    let verifiedRoom: Room = {
      ...(template ? template.build() : room),
      ceilingHeight: clamp(floorHeight, 1800, 6000),
    };
    setPlanAnalysis(null);
    setStartTool(nextSource === "rooms" && !template ? "room" : nextSource === "manual" ? "wall" : "select");
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
      floorCount: chosen ? Math.min(3, Math.max(1, chosen.floors)) : floorCount,
      floorToFloorHeight: floorHeight,
      referenceImages: references(floorPlans),
    }), modelingOptions)), displayUnits });
    // Drawing from scratch starts on genuinely open space: the project's
    // floors and settings, and nothing on them until it is drawn.
    setProject(nextSource === "freehand" || nextSource === "manual" || (nextSource === "rooms" && !template) ? openSpace(built) : built);
    setLink(null);
    lastSaved.current = null;
    setStatus("device");
    setTab("plan");
    setStage("editor");
    if (nextSource === "freehand") setFreehandOpen(true);
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
    ...(project.freehandSketch ? [{ id: "freehand", label: "Original freehand sketch", onSelect: () => setFreehandOpen(true) }] : []),
    { id: "save", label: link ? "Save now" : "Save project…", onSelect: saveProject },
    ...(link ? [{ id: "agenda", label: `Open ${link.projectName} in Agenda`, onSelect: () => { window.location.href = `/agenda/projects/${link.projectId}/plan`; } }] : []),
    { id: "rename", label: "Rename plan", onSelect: rename },
    { id: "units", label: `Units: ${project.displayUnits ?? "mm"} (change)`, onSelect: () => updateProject({ ...project, displayUnits: nextUnit(project.displayUnits ?? "mm") }) },
    { id: "png", label: "Export plan image (PNG)", onSelect: () => { void exportPlanImage(project).catch(error => toast.error(error.message)); } },
    { id: "pdf", label: "Print / Save as PDF", onSelect: () => { try { printPlan(project); } catch (error) { toast.error(error instanceof Error ? error.message : "Print failed"); } } },
    { id: "boq", label: "Construction quantities / BOQ", onSelect: () => { try { window.sessionStorage.setItem(HOUSE_TAKEOFF_SESSION_KEY, JSON.stringify(createHouseTakeoffPackage(project))); window.location.href = "/takeoff?source=house-design"; } catch { toast.error("Could not prepare quantities. Your plan is unchanged."); } } },
    { id: "download", label: "Download plan data (JSON)", onSelect: download },
    { id: "new", label: "Start a new plan", onSelect: toStart },
  ] : [];

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden px-2 pb-6 pt-2 sm:px-5 md:pb-8">
      {freehandOpen && project ? <FreehandCanvas initial={project.freehandSketch} readOnly={project.walls.length > 0} onClose={() => setFreehandOpen(false)} onSave={(sketch) => { const next = { ...project, freehandSketch: sketch }; updateProject(next); if (!writeHouseDraft(window.localStorage, draftKey, next)) toast.error("Device storage is full. Save this plan to a project before leaving."); }} onConvert={(sketch, snap, unitsPerPixel) => { const next = ensureHouseBimState(applyFreehand(project, sketch, snap, unitsPerPixel)); updateProject(next); setStartTool("select"); setFreehandOpen(false); }} /> : null}
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
            roomSampleId={roomSampleId}
            onRoomSample={setRoomSampleId}
            description={description}
            onDescription={setDescription}
            onContinue={(ai) => { void openEditor(source, ai).catch((error: unknown) => { setAnalysingPlan(false); setStage("start"); toast.error(error instanceof Error ? `Could not open floor plan: ${error.message}` : "Could not open floor plan. Please try again."); }); }}
            onTemplatePlan={(plan, options) => { void openEditor("template", false, { room: plan, floors: options.floors }).catch((error: unknown) => { setStage("start"); toast.error(error instanceof Error ? `Could not open template: ${error.message}` : "Could not open template."); }); }}
            onRestore={savedDraft ? () => openLoaded(savedDraft.project, null) : undefined}
            recentPlans={recentPlans}
            onOpenPlan={(id) => void openSaved(id)}
          />
        </>
      ) : stage === "loading" || !project ? (
        <div className="flex min-h-[50dvh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" /> Opening the plan…</div>
      ) : (
        <PlanEditor
          key={`${project.id}:${project.freehandSketch && project.walls.length ? "converted" : "draft"}`}
          project={project}
          onProjectChange={updateProject}
          onOpenFreehand={() => setFreehandOpen(true)}
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
          userId={userId}
          // A link to a pin or a sketch opens there — once, for the plan it was for.
          focusRequest={link && link.planId === planId && (pinId || sketchId) ? { pinId, sketchId } : null}
          onBusy={(busy) => { busyRef.current = busy; }}
        />
      )}
      {saveOpen && project ? <HouseSaveDialog defaultTitle={project.metadata.title} preferredProjectId={projectId} busy={savingChoice} onSave={(choice) => void saveInto(choice)} onClose={() => setSaveOpen(false)} onDownload={download} /> : null}
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
  onTemplatePlan,
  onRestore,
  roomSampleId,
  onRoomSample,
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
  onTemplatePlan: (plan: Room, options: { name: string; floors: number }) => void;
  onRestore?: () => void;
  roomSampleId: string;
  onRoomSample: (id: string) => void;
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
            ["freehand", <PenLine key="freehand" className="size-5" />, "Freehand Sketch", "Draw naturally, convert to walls · no AI"],
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
          <HouseTemplateLibrary onUse={onTemplatePlan} />
        ) : source === "rooms" ? (
          <div role="radiogroup" aria-label="Room sample" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[{ id: "", name: "Empty grid", summary: "Drag out each room yourself" }, ...ROOM_SAMPLES].map((sample) => (
              <button key={sample.id || "empty"} type="button" role="radio" aria-checked={roomSampleId === sample.id} onClick={() => onRoomSample(sample.id)} className={cn("min-h-11 rounded-xl border p-3 text-left text-sm", roomSampleId === sample.id ? "border-brand bg-brand/5" : "hover:bg-muted/40")}>
                <strong className="block">{sample.name}</strong>
                <span className="text-xs text-muted-foreground">{sample.summary}</span>
              </button>
            ))}
            <p className="col-span-full text-xs text-muted-foreground">
              {roomSampleId
                ? "The room opens with its door and windows in place — every size, door and window can be changed, and more rooms dragged out beside it."
                : "The plan opens with the Room tool ready: drag from corner to corner for each room, or type its size. Rooms that touch share their wall."}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
            An empty grid. Draw walls and close them on the first point, or drag out a Room.
          </div>
        )}

        {source === "upload" ? (
          <Link href="/design/image-to-3d"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-center text-sm font-semibold text-brand-foreground hover:opacity-90">
            <FileUp className="size-4" /> Convert DXF, PDF or Image without AI
          </Link>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          {source === "upload" || source === "sketch" ? <>
            <button type="button" onClick={() => onContinue(true)} disabled={analysingPlan || floorPlans.length === 0 || floorPlans[0]?.mediaType !== "image"} className="flex-1 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-foreground disabled:opacity-40">
              {analysingPlan ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Reading your {source === "sketch" ? "sketch" : "plan"}…</span> : source === "sketch" ? "Convert sketch with AI" : "Convert with AI (paid)"}
            </button>
            <button type="button" onClick={() => onContinue(false)} disabled={analysingPlan || floorPlans.length === 0} className="flex-1 rounded-xl border px-4 py-3 text-sm font-semibold hover:bg-muted disabled:opacity-40">Trace it myself</button>
          </> : source === "describe" ? (
            <button type="button" onClick={() => onContinue(true)} disabled={analysingPlan || description.trim().length < 10} className="flex-1 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-foreground disabled:opacity-40">
              {analysingPlan ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Drawing your plan…</span> : "Generate plan"}
            </button>
          ) : source === "template" ? null : (
            <button type="button" onClick={() => onContinue(false)} className="flex-1 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-foreground">
              {source === "rooms" ? (roomSampleId ? "Start with this room" : "Start drawing rooms") : "Draw floor plan"}
            </button>
          )}
        </div>
        {(source === "upload" || source === "sketch") && floorPlans[0]?.mediaType === "pdf" ?
          <p className="text-xs text-muted-foreground">The no-AI importer supports PDF pages. The paid AI option only reads images.</p> : null}
      </section>

    </div>
  );
}

function PlanEditor({
  project,
  onProjectChange,
  onOpenFreehand,
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
  userId,
  focusRequest,
  onBusy,
}: {
  project: HouseProject;
  onProjectChange: (project: HouseProject) => void;
  onOpenFreehand: () => void;
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
  userId: string;
  focusRequest: { pinId: string | null; sketchId: string | null } | null;
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
  const [furniture] = useState<FurnitureItem>(() => furnitureItem("bed"));
  // The object library open over the plan, and what was chosen from it to put down.
  const [libraryFor, setLibraryFor] = useState<LibraryKind | null>(null);
  const [placing, setPlacing] = useState<LibraryChoice | null>(null);
  const [stairSpace, setStairSpace] = useState<StairSpace | null>(null);
  // Dragging out the space Auto fit fits a stair into.
  const [drawingSpace, setDrawingSpace] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [toolSettings, setToolSettings] = useState({
    height: project.levels[0]?.floorToFloorHeight ?? 3000,
    width: 600,
    depth: 600,
    sillHeight: 900,
    chain: true,
  });
  // Pins on this plan and its sketches, and the Agenda tasks made from them.
  const [pins, setPins] = useState<Pin[]>([]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [pinDialog, setPinDialog] = useState<{ at: HousePlanPoint; initial: { title: string; measurement: string } } | null>(null);
  const [sketchRequest, setSketchRequest] = useState<SketchRequest | null>(null);
  const [planFocus, setPlanFocus] = useState<{ x: number; y: number; key: string } | null>(null);
  const focusHandled = useRef(false);
  // The fast layout tools: properties on demand, a room's split, the Split
  // tool's line before it is made, and a room copy being placed.
  const [propertiesFor, setPropertiesFor] = useState<string | null>(null);
  const [roomSplit, setRoomSplit] = useState<string | null>(null);
  const [splitDraft, setSplitDraft] = useState<{ roomId: string; axis: "vertical" | "horizontal"; first: number } | null>(null);
  const clipboard = useRef<HouseClipboard | null>(null);
  const keyboardRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  const escapeRef = useRef(0);
  const selected = selections.at(-1) ?? null;
  const activeLevel = project.levels.find((level) => level.id === activeLevelId) ?? project.levels[0];
  const selectMode = !activeTool || activeTool === "select";

  useEffect(() => { onBusy(Boolean(draftStart || outlineSketch.length)); }, [draftStart, outlineSketch, onBusy]);

  const planId = link?.planId ?? null;
  async function reloadPins() {
    if (!planId) return;
    const client = createClient();
    const items = await listPins(client, planId);
    setPins(items);
    setStatuses(await taskStatuses(client, items.flatMap((pin) => (pin.taskId ? [pin.taskId] : []))));
  }
  useEffect(() => {
    if (!planId) return;
    let live = true;
    const client = createClient();
    void listPins(client, planId).then(async (items) => {
      if (!live) return;
      setPins(items);
      const found = await taskStatuses(client, items.flatMap((pin) => (pin.taskId ? [pin.taskId] : [])));
      if (live) setStatuses(found);
      // Opened from the Agenda: straight to the pin, or the sketch.
      if (focusRequest && !focusHandled.current) {
        focusHandled.current = true;
        const pin = items.find((item) => item.id === focusRequest.pinId);
        if (pin) openPin(pin);
        else if (focusRequest.sketchId) { onTab("sketch"); setSketchRequest({ sketchId: focusRequest.sketchId, nonce: Date.now() }); }
      }
    });
    return () => { live = false; };
    // `openPin` and the request are read once, when the pins arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  function whereOf(pin: Pin) {
    if (pin.source.kind === "plan") return project.levels.find((item) => item.id === pin.source.level)?.name ?? "Plan";
    return `${pin.source.name ?? pin.source.kind}${pin.source.kind === "pdf" && pin.source.page ? ` · page ${pin.source.page}` : ""}`;
  }

  /** Shows a pin where it was dropped: on its floor of the plan, or on its sketch. */
  function openPin(pin: Pin) {
    setActivePinId(pin.id);
    if (pin.sketchId) {
      onTab("sketch");
      setSketchRequest({ sketchId: pin.sketchId, pinId: pin.id, nonce: Date.now() });
      return;
    }
    onTab("plan");
    if (pin.source.level && project.levels.some((item) => item.id === pin.source.level)) setActiveLevelId(pin.source.level);
    setSelections([]);
    setPlanFocus({ x: pin.x, y: pin.y, key: `${pin.id}:${Date.now()}` });
  }

  /** The pin on the project's Agenda: a task saying what and where, linked both ways. */
  async function addPinToAgenda(pin: Pin, previewPath: string | null = null) {
    if (!link) return;
    const client = createClient();
    const address = `${window.location.origin}${pinHref(link.planId, pin)}`;
    const description = [pin.note, pin.measurement ? `Measurement: ${pin.measurement}` : null, `Drawing: ${project.metadata.title} · ${whereOf(pin)} · ${pin.number}`, `Open: ${address}`].filter(Boolean).join("\n");
    const task = await createTask(client, userId, link.projectId, { title: pin.title, description });
    if ("error" in task) { toast.error(task.error); return; }
    const linked = await updatePin(client, pin.id, { taskId: task.id });
    if (linked.error) { toast.error(linked.error); return; }
    if (previewPath) await attachToTask(client, userId, link.projectId, task.id, { path: previewPath, name: `${pin.number}.png`, caption: `Marked up: ${whereOf(pin)}` });
    await reloadPins();
    toast.success(`${pin.number} is on the Agenda`);
  }

  async function placePlanPin(at: HousePlanPoint, details: { title: string; note: string; measurement: string; agenda: boolean }) {
    setPinDialog(null);
    if (!link) return;
    const source: SketchSource = { kind: "plan", path: null, name: activeLevel?.name ?? null, level: activeLevelId, page: null };
    const pin = await createPin(createClient(), userId, { projectId: link.projectId, planId: link.planId }, { sketchId: null, source, x: at.x, y: at.y, title: details.title, note: details.note, measurement: details.measurement });
    if ("error" in pin) { toast.error(pin.error); return; }
    await reloadPins();
    setActivePinId(pin.id);
    if (details.agenda) await addPinToAgenda(pin);
  }

  async function sendMeasurements(text: string) {
    if (!link) return;
    const task = await createTask(createClient(), userId, link.projectId, { title: `Measurements — ${project.metadata.title} · ${activeLevel?.name ?? ""}`.trim(), description: `${text}\n\nOpen: ${window.location.origin}/house-design?plan=${link.planId}` });
    if ("error" in task) { toast.error(task.error); return; }
    toast.success("Measurements sent to the Agenda");
  }

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
    const conflicts = dimensionConflicts(next);
    if (conflicts.length) {
      if (!window.confirm("This edit changes a measured wall dimension. Apply the edit and release the affected dimension constraints? Cancel keeps the measured plan.")) return;
      next = { ...next, measuredWalls: next.measuredWalls?.filter(c => !conflicts.includes(c.id)) };
    }
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
    // For an empty plan, drawing a wall begins with the existing touch-first
    // freehand canvas instead of the direction/typed-length workflow.
    // Existing BIM walls remain editable with the regular wall tools until
    // incremental freehand conversion can safely preserve their geometry.
    if (id === "wall" && project.walls.length === 0) {
      setLibraryFor(null);
      setPlacing(null);
      setDrawingSpace(false);
      setSplitDraft(null);
        setDraftStart(null);
      setOutlineSketch([]);
      setActiveTool("select");
      onOpenFreehand();
      return;
    }
    const library = (["furniture", "stair", "door", "window", "column"] as const).find((item) => item === id) ?? null;
    // A room selected when Stair is tapped is the space Auto fit starts from.
    if (id === "stair") { const room = selections[0]?.kind === "room" ? roomRectangle(project, selections[0].id) : null; setStairSpace(room ? { width: room.width, length: room.depth } : null); }
    setLibraryFor(library);
    setPlacing(null);
    setDrawingSpace(false);
    setSplitDraft(null);
    if (id === "select") { setActiveTool("select"); setDraftStart(null); setOutlineSketch([]); return; }
    activateDrawingTool(id);
  }

  function chooseFromLibrary(choice: LibraryChoice) {
    setLibraryFor(null);
    if (choice.kind === "stair" && choice.at) {
      // Fitted into a space drawn on the plan: it goes in the middle of it.
      applyMutation(createHouseObjectFromGesture(project, "stair", activeLevelId, choice.at, undefined, { stair: choice.params, rotation: choice.rotation }));
      setStairSpace(null);
      setActiveTool("select");
      return;
    }
    setPlacing(choice);
    if (choice.kind === "object") setToolSettings((current) => ({ ...current, width: choice.definition.width, depth: choice.definition.depth, height: choice.definition.height }));
    else if (choice.kind === "door") setToolSettings((current) => ({ ...current, width: choice.width, height: 2100, sillHeight: 0 }));
    else if (choice.kind === "window") setToolSettings((current) => ({ ...current, width: choice.width, height: choice.height, sillHeight: choice.sill }));
    else if (choice.kind === "column") setToolSettings((current) => ({ ...current, width: choice.width, depth: choice.depth }));
    toast.info(choice.kind === "door" || choice.kind === "window" ? "Tap a wall to place it" : "Tap the plan to place it");
  }

  /** Where the chosen object lands for a tap at `point`: furniture backs onto a wall within reach. */
  function placementAt(point: HousePlanPoint) {
    if (placing?.kind !== "object") return { x: point.x, y: point.y, rotation: placing?.kind === "stair" ? placing.rotation : 0 };
    const size = { width: placing.definition.width, depth: placing.definition.depth };
    const wall = placeAgainstWall(project, activeLevelId, point, size);
    // Then edge to edge with what is there — along the wall, if it is against one.
    const along = wall.wallId ? (Math.abs(Math.round(wall.rotation / 90)) % 2 === 1 ? "y" as const : "x" as const) : undefined;
    return { ...wall, ...snapToFurniture(project, activeLevelId, { ...wall, ...size }, { along }) };
  }

  function placingGhost(point: HousePlanPoint) {
    if (!placing) return null;
    const at = placementAt(point);
    if (placing.kind === "object") return <g transform={`translate(${at.x} ${at.y}) rotate(${at.rotation})`}><ObjectSymbol definition={placing.definition} width={placing.definition.width} depth={placing.definition.depth} /></g>;
    if (placing.kind === "stair") return <g transform={`translate(${at.x} ${at.y}) rotate(${at.rotation})`}><StairSymbol geometry={stairGeometry(placing.params)} /></g>;
    if (placing.kind === "column") return <ColumnSymbol column={{ x: point.x, y: point.y, width: placing.width, depth: placing.depth, type: placing.shape, rotation: 0 }} />;
    return null;
  }

  function draftObject(start: HousePlanPoint, end: HousePlanPoint) {
    if (!activeTool) return;
    if (drawingSpace && activeTool === "room") {
      const width = Math.round(Math.abs(end.x - start.x));
      const length = Math.round(Math.abs(end.y - start.y));
      setDrawingSpace(false);
      setStairSpace({ width, length, x: Math.round((start.x + end.x) / 2), y: Math.round((start.y + end.y) / 2) });
      setActiveTool("stair");
      setLibraryFor("stair");
      return;
    }
    if (placing && (activeTool === "furniture" || activeTool === "stair" || activeTool === "column")) {
      const at = placementAt(end);
      const result = placing.kind === "object"
        ? createHouseObjectFromGesture(project, "furniture", activeLevelId, { x: at.x, y: at.y }, undefined, { width: placing.definition.width, depth: placing.definition.depth, height: placing.definition.height, family: placing.definition.id, rotation: at.rotation })
        : placing.kind === "stair"
          ? createHouseObjectFromGesture(project, "stair", activeLevelId, { x: at.x, y: at.y }, undefined, { stair: placing.params, rotation: at.rotation })
          : placing.kind === "column"
            ? createHouseObjectFromGesture(project, "column", activeLevelId, end, undefined, { width: placing.width, depth: placing.depth, height: activeLevel?.floorToFloorHeight, columnType: placing.shape })
            : null;
      if (!result) return;
      applyMutation(result);
      // Put down, it is selected — ready to move, turn or size.
      setPlacing(null);
      setActiveTool("select");
      return;
    }
    if (activeTool === "move") {
      applyMutation(moveHouseSelectionsTo(project, selections, end));
      setActiveTool("select");
      return;
    }
    if (activeTool === "split") {
      // The side tapped nearest says which way: tap the top or bottom for a
      // vertical partition, a side for a horizontal one.
      const room = project.rooms.find((item) => item.levelId === activeLevelId && pointInPolygon(end, item.boundary));
      if (!room) { toast.info("Tap inside a room, near the side to split from"); return; }
      const xs = room.boundary.map((point) => point.x);
      const ys = room.boundary.map((point) => point.y);
      const fromTopOrBottom = Math.min(end.y - Math.min(...ys), Math.max(...ys) - end.y);
      const fromSides = Math.min(end.x - Math.min(...xs), Math.max(...xs) - end.x);
      const axis = fromTopOrBottom <= fromSides ? "vertical" : "horizontal";
      const span = axis === "vertical" ? Math.max(...xs) - Math.min(...xs) : Math.max(...ys) - Math.min(...ys);
      setSplitDraft({ roomId: room.id, axis, first: Math.round(span / 2) });
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
      style: placing && (placing.kind === "door" || placing.kind === "window") ? placing.style : undefined,
    });
    // A wall drawn right across a room divides it, in the same undo step.
    if (activeTool === "wall" && !created.blocked.length) created.project = splitRoomAlong(created.project, activeLevelId, start, end);
    applyMutation(created);
    // Furniture and a measurement are placed one at a time and then shown;
    // so is a door or window chosen from the library, ready to edit.
    if (activeTool === "furniture" || activeTool === "dimension" || activeTool === "text") setActiveTool("select");
    if (placing && !created.blocked.length && (activeTool === "door" || activeTool === "window")) { setPlacing(null); setActiveTool("select"); }
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
      case "agenda": {
        if (!link) { toast.info("Save the project first — then it can go on its Agenda."); return; }
        const target = selections[0];
        const bounds = target ? selectableBounds(project, activeLevelId).find((item) => item.selection.id === target.id)?.bounds : null;
        if (!target || !bounds) return;
        const measured = levelMeasurements(project, activeLevelId).find((item) => item.id === target.id);
        setPinDialog({ at: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }, initial: { title: measured?.label ?? "Pin", measurement: measured?.value.split(" · ")[0] ?? "" } });
        return;
      }
      case "properties": setInspectorOpen(true); window.setTimeout(() => document.getElementById("house-properties")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); return;
    }
  }

  /** One undoable step, refused if it would move a locked wall. */
  function wallEdit(selection: HouseSelection, edit: () => ReturnType<typeof extendWall>) {
    const conflict = lockConflict(project, selection);
    if (conflict) { toast.info(conflict); return; }
    applyMutation(edit());
  }

  // Doors stay attached to their wall. Change their hinge and swing rather than
  // rotating the opening (which would detach it from the wall).
  function flipDoor(selection: HouseSelection, direction: "hinge" | "swing") {
    const door = project.doors.find((item) => item.id === selection.id);
    if (!door) return;
    const conflict = lockConflict(project, selection);
    if (conflict) { toast.info(conflict); return; }
    const side = door.swing.startsWith("out") ? "out" : "in";
    const hinge = door.swing.endsWith("left") ? "left" : "right";
    const swing = direction === "hinge"
      ? `${side}-${hinge === "left" ? "right" : "left"}`
      : `${side === "in" ? "out" : "in"}-${hinge}`;
    commit(patchHouseObject(project, selection, { swing }));
  }

  function quickActions(selection: HouseSelection): { label: string; actions: QuickAction[]; more: QuickAction[] } {
    const run = (id: SheetAction) => () => sheetAction(id);
    const shared: QuickAction[] = [
      { id: "delete", label: "Delete", onSelect: run("delete") },
      { id: "agenda", label: "Add to Agenda", onSelect: run("agenda") },
      { id: "properties", label: "Properties", onSelect: () => setPropertiesFor(selection.id) },
    ];
    const duplicate: QuickAction = { id: "duplicate", label: "Duplicate", onSelect: run("duplicate") };
    const move: QuickAction = { id: "move", label: "Move", onSelect: run("move") };
    switch (selection.kind) {
      case "wall": {
        const locked = Boolean(project.objectInstances[selection.id]?.pinned);
        const linked = wallJointsLinked(project, selection.id);
        const startLinked = wallJointLinked(project, selection.id, "start");
        const endLinked = wallJointLinked(project, selection.id, "end");
        return {
          label: "Wall actions",
          actions: [
            { id: "move", label: "Move", onSelect: run("move") },
            {
              id: "junction",
              label: linked ? "Release both wall endpoints" : "Link both wall endpoints",
              pressed: linked,
              onSelect: () => {
                commit(toggleWallJoints(project, selection.id));
                toast.info(linked ? "Both endpoints released. Move this wall independently." : "Both endpoints linked. Only walls sharing those exact endpoints will follow.");
              },
            },
            { id: "delete", label: "Delete", onSelect: run("delete") },
            { id: "duplicate", label: "Duplicate", onSelect: () => wallEdit(selection, () => duplicateWallParallel(project, selection.id)) },
            { id: "rotate", label: "↻ 90°", onSelect: () => wallEdit(selection, () => rotateWall90(project, selection.id)) },
            { id: "split", label: "Split", onSelect: () => wallEdit(selection, () => {
              const wall = project.walls.find(w => w.id === selection.id)!;
              if (!project.levels.find(l => l.id === wall.levelId)?.plan?.freehand) return splitHouseSelection(project, selection);
              const length = Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y);
              const input = window.prompt("Split distance from wall start (metres)", (length/2000).toFixed(3));
              return input === null ? {project,selections:[selection],blocked:[]} : splitHouseSelection(project,selection,Number(input)*1000/length);
            }) },
          ],
          more: [
            { id: "junction-start", label: startLinked ? "Release start joint" : "Link start joint", pressed: startLinked, onSelect: () => commit(toggleWallJoints(project, selection.id, "start")) },
            { id: "junction-end", label: endLinked ? "Release end joint" : "Link end joint", pressed: endLinked, onSelect: () => commit(toggleWallJoints(project, selection.id, "end")) },
            { id: "lock", label: locked ? "Unlock" : "Lock", onSelect: run("lock") },
            { id: "agenda", label: "Add to Agenda", onSelect: run("agenda") },
            { id: "properties", label: "Properties", onSelect: () => setPropertiesFor(selection.id) },
          ],
        };
      }
      case "room":
        if (roomSplit === selection.id) return {
          label: "Split room",
          actions: [
            { id: "vertical", label: "│ Vertical", onSelect: () => { setRoomSplit(null); applyMutation(splitRoom(project, selection.id, "vertical")); } },
            { id: "horizontal", label: "─ Horizontal", onSelect: () => { setRoomSplit(null); applyMutation(splitRoom(project, selection.id, "horizontal")); } },
            { id: "cancel", label: "Cancel", onSelect: () => setRoomSplit(null) },
          ],
          more: [],
        };
        return {
          label: "Room actions",
          actions: [
            { id: "divide", label: "Split", onSelect: () => setRoomSplit(selection.id) },
            { id: "rename", label: "Rename", onSelect: () => setPropertiesFor(selection.id) },
          ],
          more: [{ id: "merge", label: "Merge with…", onSelect: run("merge") }, ...shared],
        };
      case "door": {
        const door = project.doors.find((item) => item.id === selection.id);
        const style = doorType(door?.style);
        const hinged = style === "single" || style === "pivot";
        const swings = style === "single" || style === "double" || style === "pivot" || style === "folding";
        return {
          label: "Door actions",
          actions: [
            ...(hinged ? [{ id: "door-hinge", label: "Flip hinge left / right", onSelect: () => flipDoor(selection, "hinge") }] : []),
            ...(swings ? [{ id: "door-swing", label: "Flip door front / back (in / out)", onSelect: () => flipDoor(selection, "swing") }] : []),
            move,
            { id: "door-type", label: "Change door type and swing", onSelect: () => setPropertiesFor(selection.id) },
          ],
          more: [duplicate, ...shared],
        };
      }
      case "window":
        return { label: "Window actions", actions: [duplicate, move], more: shared };
      case "component":
        return { label: "Furniture actions", actions: [move, { id: "rotate", label: "↻ 90°", onSelect: run("rotate") }, { id: "mirror", label: "Mirror", onSelect: run("flip") }, duplicate], more: shared };
      case "stair":
        return { label: "Stair actions", actions: [{ id: "reverse", label: "Reverse", onSelect: () => commit(patchHouseObject(project, selection, { reversed: "toggle" })) }, { id: "rotate", label: "↻ 90°", onSelect: run("rotate") }, duplicate], more: [move, ...shared] };
      case "column":
        return { label: "Column actions", actions: [move, { id: "rotate", label: "↻ 90°", onSelect: () => commit(patchHouseObject(project, selection, { rotation: ((project.structuralColumns.find((item) => item.id === selection.id)?.rotation ?? 0) + 90) % 360 })) }, duplicate], more: shared };
      default:
        return { label: "Actions", actions: [{ id: "delete", label: "Delete", onSelect: run("delete") }], more: shared.slice(1) };
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
        setLibraryFor(null);
        setPlacing(null);
        escapeRef.current = now;
        return;
      }
      case "finish": setActiveTool("select"); setDraftStart(null); return;
      case "delete": deleteSelection(); return;
      case "copy": {
        const copyable = selections.filter((selection) => selection.kind !== "room");
        if (copyable.length !== selections.length) toast.info("Rooms cannot be copied. Use the Room tool to draw another.");
        clipboard.current = copyable.length ? { sourceProjectId: project.id, selections: copyable } : null;
        return;
      }
      case "cut": {
        // A room is a shared-wall space, not an independent object that can be
        // moved by the clipboard. Refuse Cut too: otherwise Paste cannot restore it.
        if (selections.some((selection) => selection.kind === "room")) {
          toast.info("Rooms cannot be cut or copied. Use Delete to remove a room.");
          return;
        }
        clipboard.current = { sourceProjectId: project.id, selections: [...selections] };
        deleteSelection();
        return;
      }
      case "paste": {
        if (!clipboard.current || clipboard.current.sourceProjectId !== project.id) return;
        const copyable = clipboard.current.selections.filter((selection) => selection.kind !== "room");
        if (!copyable.length) { toast.info("Rooms cannot be copied. Use the Room tool to draw another."); return; }
        applyMutation(duplicateHouseSelections(project, copyable, 250)); return;
      }
      case "duplicate": {
        const copyable = selections.filter((selection) => selection.kind !== "room");
        if (copyable.length !== selections.length) toast.info("Rooms cannot be copied. Use the Room tool to draw another.");
        if (copyable.length) applyMutation(duplicateHouseSelections(project, copyable));
        return;
      }
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

  const sheetFor = tab === "plan" && selectMode && selected && selected.kind !== "level" && !proposals && !mergeFrom && !activePinId && selections.length === 1 ? selected : null;
  const wallGroup = tab === "plan" && selectMode && !proposals && !mergeFrom && !activePinId
    ? selections.filter((item) => item.kind === "wall") : [];
  const groupQuick = wallGroup.length > 1 ? {
    label: `${wallGroup.length} walls selected`,
    actions: [
      { id: "move", label: `Move ${wallGroup.length} selected walls`, onSelect: () => sheetAction("move") },
      { id: "delete", label: "Delete selected walls", onSelect: deleteSelection },
    ] as QuickAction[],
    more: [
      { id: "lock", label: "Lock selected walls", onSelect: () => commit(pinHouseSelections(project, wallGroup, true)) },
      { id: "clear", label: "Clear selection", onSelect: () => setSelections([]) },
    ] as QuickAction[],
  } : null;
  const quick = sheetFor ? quickActions(sheetFor) : groupQuick;
  const splitRoomTarget = splitDraft ? project.rooms.find((room) => room.id === splitDraft.roomId) : null;
  const splitGuide = (() => {
    if (!splitDraft || !splitRoomTarget) return null;
    const xs = splitRoomTarget.boundary.map((point) => point.x);
    const ys = splitRoomTarget.boundary.map((point) => point.y);
    const box = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    const span = splitDraft.axis === "vertical" ? box.maxX - box.minX : box.maxY - box.minY;
    const at = (splitDraft.axis === "vertical" ? box.minX : box.minY) + splitDraft.first;
    return { span, line: splitDraft.axis === "vertical" ? { start: { x: at, y: box.minY }, end: { x: at, y: box.maxY } } : { start: { x: box.minX, y: at }, end: { x: box.maxX, y: at } } };
  })();
  const activePin = pins.find((pin) => pin.id === activePinId) ?? null;
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
        {project.freehandSketch ? <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <span>{project.freehandSketch.calibrated ? "Sketch scale set; verify remaining measurements." : "Approximate freehand dimensions and areas — calibrate before estimating costs."}</span>
          {project.walls.length === 4 && project.rooms.length === 1 ? <button type="button" className="rounded border px-2 py-1 font-semibold" onClick={() => {
            const width = window.prompt("Rectangle width in metres (wall centrelines)", "4.00"); if (width === null) return;
            const depth = window.prompt("Rectangle length in metres (wall centrelines)", "5.00"); if (depth === null) return;
            try { commit(dimensionRectangle(project, Number(width)*1000, Number(depth)*1000)); } catch (error) { toast.error(error instanceof Error ? error.message : "Check dimensions"); }
          }}>Set rectangle dimensions</button> : null}
        </div> : null}

        {tab === "plan" ? (
          <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-2">
              {analysis && showAnalysis ? <p className="flex items-start gap-2 rounded-xl border border-brand/25 bg-brand/5 p-2.5 text-xs">{analysis}<button type="button" onClick={() => setShowAnalysis(false)} aria-label="Dismiss" className="ml-auto shrink-0 text-muted-foreground">✕</button></p> : null}
              <PlanToolbar activeTool={activeTool} onTool={chooseTool} onUndo={undo} canUndo={past.length > 0} />
              <div className="relative h-[75dvh] min-h-[520px] min-w-0 overflow-hidden rounded-xl border bg-slate-200 sm:h-[78dvh] lg:h-[min(760px,75dvh)] dark:bg-background">
                {activeLevel ? <HousePlanSelectionOverlay project={project} levelId={activeLevelId} activeTool={activeTool} selections={selections} draftStart={draftStart} snapEnabled={snapEnabled} showGrid={gridVisible} chain={toolSettings.chain} viewRevision={viewRevision} roomShape={roomShape} sketch={outlineSketch} onCancelDraft={() => { setDraftStart(null); setOutlineSketch([]); }} proposals={proposals?.levelId === activeLevelId ? proposals.items : null} chosenProposal={proposals?.chosen ?? null} onProposalChoose={(id) => setProposals((current) => current && { ...current, chosen: id })} onProposalMove={(id, x, y) => setProposals((current) => current && { ...current, items: current.items.map((item) => item.id === id ? { ...item, x, y } : item) })} onMoveSelection={(selection, dx, dy) => {
                  // Dragging one wall or several selected walls uses the
                  // same atomic move command: a group is not reduced to the
                  // wall touched when starting the drag. Furniture snapping
                  // remains a single-object feature.
                  const targets: HouseSelection[] = "kind" in selection ? [selection] : [...selection];
                  const item = targets.length === 1 && targets[0]?.kind === "component"
                    ? project.components.find((entry) => entry.id === targets[0]?.id)
                    : null;
                  const to = item ? snapToFurniture(project, activeLevelId, { ...item, x: item.x + dx, y: item.y + dy }, { ignore: item.id }) : null;
                  applyMutation(moveHouseSelections(project, targets, to && item ? to.x - item.x : dx, to && item ? to.y - item.y : dy, { footprintEditable: true }));
                  if (activeTool === "move") setActiveTool("select");
                }} onDraftStart={(point) => { if (chainEnded.current) { chainEnded.current = false; setDraftStart(null); return; } setDraftStart(point); }} onDraft={draftObject} onSelect={chooseMany} onSelectionMenu={() => undefined} onDimensionChange={(selection, patch) => { const conflict = lockConflict(project, selection); if (conflict) { toast.info(conflict); return; } commit(patchHouseObject(project, selection, patch)); }} onGuidance={() => undefined} pins={pins.filter((pin) => pin.source.kind === "plan" && pin.source.level === activeLevelId)} onPinTap={(id) => setActivePinId(id)} focus={planFocus}
                  onWallExtend={(selection, end, delta) => wallEdit(selection, () => extendWall(project, selection.id, end, delta))}
                  onWallEnd={(selection, end, to) => wallEdit(selection, () => moveWallEnd(project, selection.id, end, to))}
                  onWallLength={(selection, end, length) => wallEdit(selection, () => {
                    try {
                      if (project.freehandSketch && !project.freehandSketch.calibrated) return {project:calibrateFromWall(project,selection.id,length),selections:[selection],blocked:[]};
                      const result=setWallLength(project,selection.id,end,length);
                      return {...result,project:rememberWallLength(result.project,selection.id)};
                    } catch(error) {return {project,selections:[selection],blocked:[error instanceof Error ? error.message : "Check dimension"]};}
                  })}
                  onWallDistance={(selection, neighbourId, distance) => wallEdit(selection, () => setWallDistance(project, selection.id, neighbourId, distance))}
                  actionBar={quick && (!sheetFor || propertiesFor !== sheetFor.id) ? <QuickActionBar key={sheetFor ? `${sheetFor.id}:${roomSplit ?? ""}` : `group:${wallGroup.map((wall) => wall.id).join(",")}`} label={quick.label} actions={quick.actions} more={quick.more} /> : null}
                  guide={splitGuide ? { ...splitGuide.line, label: `${shortMm(splitDraft!.first, project.displayUnits ?? "mm")} | ${shortMm(splitGuide.span - splitDraft!.first, project.displayUnits ?? "mm")}` } : null}
                  ghost={placing && (activeTool === "furniture" || activeTool === "stair" || activeTool === "column") ? placingGhost : null}
                /> : null}
                <span className="pointer-events-none absolute left-2 top-2 rounded-full border bg-background/90 px-2.5 py-1 text-[11px] font-medium">{activeLevel?.name} · {project.displayUnits ?? "mm"}</span>
                {activeTool === "room" && !draftStart ? <div role="radiogroup" aria-label="Room shape" className="absolute left-1/2 top-10 z-10 flex -translate-x-1/2 gap-1 rounded-xl border bg-card/95 p-1 text-xs shadow-sm backdrop-blur">
                  {([["rectangle", "Rectangle"], ["l-shape", "L shape"]] as const).map(([shape, label]) => <button key={shape} type="button" role="radio" aria-checked={roomShape === shape} onClick={() => setRoomShape(shape)} className={cn("min-h-9 rounded-lg px-3", roomShape === shape ? "bg-brand/15 text-brand" : "text-muted-foreground hover:bg-muted")}>{label}</button>)}
                  <button type="button" onClick={() => chooseTool("wall")} className="min-h-9 rounded-lg px-3 text-muted-foreground hover:bg-muted">Free draw</button>
                </div> : null}
                {libraryFor ? <ObjectLibrarySheet key={`${libraryFor}:${stairSpace?.x ?? ""}:${stairSpace?.y ?? ""}`} kind={libraryFor} floorHeight={activeLevel?.floorToFloorHeight ?? 3000} space={stairSpace} onChoose={chooseFromLibrary} onClose={() => setLibraryFor(null)} onDrawSpace={() => { setLibraryFor(null); setDrawingSpace(true); setRoomShape("rectangle"); setActiveTool("room"); setDraftStart(null); toast.info("Drag across the space for the stair"); }} /> : null}
                {activeTool === "move" ? <p className="pointer-events-none absolute inset-x-2 top-10 z-10 rounded-lg bg-brand px-3 py-2 text-center text-xs font-medium text-brand-foreground">Tap the new position</p> : null}
                {mergeFrom ? <p className="pointer-events-none absolute inset-x-2 top-10 z-10 rounded-lg bg-brand px-3 py-2 text-center text-xs font-medium text-brand-foreground">Tap the room to merge with</p> : null}
                {proposals && proposals.levelId === activeLevelId ? <HouseColumnSuggestions items={proposals.items} chosen={proposals.chosen} maxSpan={proposals.maxSpan} onSpan={suggest} onRegenerate={() => suggest(proposals.maxSpan)} onAccept={acceptProposals} onRemove={(item) => setProposals({ ...proposals, items: proposals.items.filter((entry) => entry !== item), chosen: null })} onClear={() => setProposals(null)} /> : null}
                {sheetFor && propertiesFor === sheetFor.id ? <SelectionSheet key={sheetFor.id} project={project} selection={sheetFor} showActions={false} autoFocus={sheetFor.kind === "room" ? "Name" : undefined} onPatch={(patch) => { const conflict = lockConflict(project, sheetFor); if (conflict) { toast.info(conflict); return; } commit(patchHouseObject(project, sheetFor, patch)); }} onAction={sheetAction} onClose={() => setPropertiesFor(null)} /> : null}
                {splitDraft && splitGuide ? (
                  <form aria-label="Split" onSubmit={(event) => { event.preventDefault(); applyMutation(splitRoom(project, splitDraft.roomId, splitDraft.axis, splitDraft.first)); setSplitDraft(null); setActiveTool("select"); }} className="absolute inset-x-1.5 top-10 z-20 flex flex-wrap items-center gap-1 rounded-xl border bg-card/95 p-1.5 text-xs shadow-lg backdrop-blur">
                    <button type="button" onClick={() => setSplitDraft({ ...splitDraft, first: Math.round(splitGuide.span / 2) })} aria-pressed={Math.abs(splitDraft.first - splitGuide.span / 2) < 1} className="min-h-10 rounded-lg border px-2.5 font-medium aria-pressed:bg-brand/15 aria-pressed:text-brand">50 / 50</button>
                    <label className="flex items-center gap-1"><span className="sr-only">First part</span><input aria-label="First part" key={splitDraft.first} type="number" inputMode="decimal" defaultValue={displayLength(splitDraft.first, project.displayUnits ?? "mm")} onBlur={(event) => { const value = modelLength(Number(event.target.value), project.displayUnits ?? "mm"); if (value > 0 && value < splitGuide.span) setSplitDraft({ ...splitDraft, first: value }); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} className="min-h-10 w-20 rounded-lg border bg-background px-2 text-right text-sm" /><span className="text-muted-foreground">| {shortMm(splitGuide.span - splitDraft.first, project.displayUnits ?? "mm")}</span></label>
                    <button type="button" onClick={() => { const axis = splitDraft.axis === "vertical" ? "horizontal" : "vertical"; const xs = splitRoomTarget!.boundary.map((point) => point.x); const ys = splitRoomTarget!.boundary.map((point) => point.y); setSplitDraft({ ...splitDraft, axis, first: Math.round((axis === "vertical" ? Math.max(...xs) - Math.min(...xs) : Math.max(...ys) - Math.min(...ys)) / 2) }); }} aria-label="Other way" className="min-h-10 rounded-lg border px-2.5">{splitDraft.axis === "vertical" ? "│" : "─"} ⇄</button>
                    <button type="submit" className="ml-auto min-h-10 rounded-lg bg-brand px-3 font-semibold text-brand-foreground">Split</button>
                    <button type="button" onClick={() => setSplitDraft(null)} aria-label="Cancel split" className="min-h-10 rounded-lg px-2 text-muted-foreground">✕</button>
                  </form>
                ) : null}
              </div>
              {(activeTool && activeTool !== "select" || placing || draftStart || splitDraft) ? (
                <div role="region" aria-label="Active drawing controls" className="flex items-center justify-between gap-2 rounded-xl border bg-card p-2 text-sm">
                  <span className="min-w-0 truncate text-muted-foreground">Drawing mode active</span>
                  <button type="button" onClick={() => { setDraftStart(null); setOutlineSketch([]); setPlacing(null); setLibraryFor(null); setSplitDraft(null); setRoomSplit(null); setActiveTool("select"); }} className="min-h-11 rounded-lg border px-4 font-semibold">Cancel</button>
                </div>
              ) : null}
              <PlanSecondaryBar canRedo={future.length > 0} onRedo={redo} snap={snapEnabled} onSnap={() => setSnapEnabled((value) => !value)} grid={gridVisible} onGrid={() => setGridVisible((value) => !value)} more={moreTools} />
              <HouseMeasurementsDrawer project={project} levelId={activeLevelId} onSelect={(selection) => { setActiveTool("select"); setSelections([selection]); }} onSendToAgenda={link ? (text) => void sendMeasurements(text) : undefined} />
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
        ) : !link ? (
          <ProjectSectionPlaceholder tab={tab} linked={false} onSave={onSave} />
        ) : tab === "sketch" ? (
          <HouseSketchPanel project={project} levelId={activeLevelId} link={link} userId={userId} pins={pins} onPinsChanged={reloadPins} request={sketchRequest} onOpenFiles={() => onTab("files")} onPin={(pin) => setActivePinId(pin.id)} onAddToAgenda={addPinToAgenda} />
        ) : tab === "files" ? (
          <HouseFilesPanel projectId={link.projectId} userId={userId} onSketch={(source) => { onTab("sketch"); setSketchRequest({ source, nonce: Date.now() }); }} />
        ) : (
          <HouseAgendaPanel link={link} pins={pins} statuses={statuses} onOpen={openPin} where={whereOf} />
        )}
        {activePin && link ? (
          <div className="fixed inset-x-2 bottom-2 z-[60] max-h-[70dvh] overflow-y-auto sm:left-auto sm:w-[420px]">
            <HousePinSheet key={activePin.id} pin={activePin} userId={userId} projectId={link.projectId} planId={link.planId} taskStatus={activePin.taskId ? statuses[activePin.taskId] : undefined} where={whereOf(activePin)} onClose={() => setActivePinId(null)} onChange={async (patch) => { const result = await updatePin(createClient(), activePin.id, patch); if (result.error) toast.error(result.error); await reloadPins(); }} onAddToAgenda={() => addPinToAgenda(activePin)} onShow={tab === "agenda" || tab === "files" ? () => openPin(activePin) : undefined} />
          </div>
        ) : null}
        {pinDialog ? <HousePinDialog initial={pinDialog.initial} onCancel={() => setPinDialog(null)} onSave={(details) => void placePlanPin(pinDialog.at, details)} /> : null}
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


/** A length as the plan's labels show it: 3.20 (m), 320 (cm), 3200 (mm). */
function shortMm(mm: number, unit: DisplayUnits) {
  return unit === "m" ? (mm / 1000).toFixed(2) : unit === "cm" ? String(Math.round(mm / 10)) : String(Math.round(mm));
}
