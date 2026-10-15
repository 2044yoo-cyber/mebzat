"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RotateCcw, Settings2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { buildConstructionModel } from "../construction/model";
import { buildLearningHouseProject, DEFAULT_LEARNING_PARAMS, normalizeParams, type LearningHouseParams } from "../construction/learning-house";
import { STAGES, STAGE_BY_ID, ENGINEERING_DISCLAIMER } from "../construction/stages";
import {
  DEFAULT_OPTIONS, DEFAULT_RULES, DEFAULT_VIEW, STAGE_IDS,
  type AppMode, type ConstructionModel, type CutawayMode, type EstimatingRules, type FrameView, type ModelOptions, type StageId, type ViewState,
} from "../construction/types";
import { indexModel, resetView, setStage, stepStage } from "../construction/view";
import type { HouseProject } from "../types/project";
import { layoutLabels } from "../construction/label-layout";
import type { CameraPreset, ScreenLabel } from "./construction-scene";
import { EstimatePanel, InspectorPanel, LayersPanel, LessonPanel, PartsPanel, QuantitiesPanel, Section, Segmented, stageCounts } from "./construction-panels";

// Like the 3D tab, three.js loads only when somebody opens this one.
const ConstructionScene = dynamic(() => import("./construction-scene").then((m) => m.ConstructionScene), {
  ssr: false,
  loading: () => <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" /> Loading 3D…</div>,
});

type Source = "sample" | "project";
type Tab = "lesson" | "selected" | "parts" | "layers" | "quantities" | "estimate" | "settings";

const MODE_TABS: Record<AppMode, { id: Tab; label: string }[]> = {
  learn: [{ id: "lesson", label: "Lesson" }, { id: "selected", label: "Selected part" }, { id: "layers", label: "Layers" }],
  inspect: [{ id: "selected", label: "Selected part" }, { id: "parts", label: "Parts" }, { id: "layers", label: "Layers" }],
  quantities: [{ id: "quantities", label: "Quantities" }, { id: "selected", label: "Selected part" }, { id: "layers", label: "Layers" }],
  estimate: [{ id: "estimate", label: "Estimate" }],
};
const MODES: { id: AppMode; label: string }[] = [
  { id: "learn", label: "Learn" },
  { id: "inspect", label: "Inspect" },
  { id: "quantities", label: "Prepare quantities" },
  { id: "estimate", label: "Estimate cost" },
];

export function ConstructionLab({ project }: { project: HouseProject }) {
  const [source, setSource] = useState<Source>("sample");
  const [params, setParams] = useState<Partial<LearningHouseParams>>({});
  const [options, setOptions] = useState<ModelOptions>(DEFAULT_OPTIONS);
  const [rules, setRules] = useState<EstimatingRules>(DEFAULT_RULES);
  const [view, setView] = useState<ViewState>({ ...DEFAULT_VIEW });
  const [tab, setTab] = useState<Tab>("lesson");
  const [preset, setPreset] = useState<CameraPreset>("orbit");
  const [resetKey, setResetKey] = useState(0);
  const [focusKey, setFocusKey] = useState(0);
  const [labels, setLabels] = useState<ScreenLabel[]>([]);
  const [showLabels, setShowLabels] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [ready, setReady] = useState(false);

  // Let the tab paint before the first, heavier, build.
  useEffect(() => { const t = setTimeout(() => setReady(true), 30); return () => clearTimeout(t); }, []);

  const paramsKey = JSON.stringify(params);
  const normalized = useMemo(() => normalizeParams(params), [paramsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const { blockType, floorFinish } = options;
  const built = useMemo<{ model: ConstructionModel; source: HouseProject } | null>(() => {
    if (!ready) return null;
    const buildOptions: ModelOptions = { ...DEFAULT_OPTIONS, blockType, floorFinish };
    if (source === "sample") {
      const sample = buildLearningHouseProject(JSON.parse(paramsKey) as Partial<LearningHouseParams>);
      return { model: buildConstructionModel(sample.project, buildOptions, rules), source: sample.project };
    }
    return { model: buildConstructionModel(project, buildOptions, rules), source: project };
  }, [ready, source, paramsKey, blockType, floorFinish, rules, project]);
  const model = built?.model ?? null;
  const index = useMemo(() => (model ? indexModel(model) : null), [model]);
  const counts = useMemo(() => (model ? stageCounts(model) : null), [model]);

  // The options the learner can flip without rebuilding live in the view.
  const viewWithOptions = useMemo<ViewState>(() => ({ ...view, options }), [view, options]);
  const patch = useCallback((p: Partial<ViewState>) => setView((v) => ({ ...v, ...p })), []);
  const patchOptions = useCallback((p: Partial<ModelOptions>) => setOptions((o) => ({ ...o, ...p })), []);
  const pick = useCallback((id: string, instance: number | null) => {
    setView((v) => ({ ...v, selectedId: id, selectedInstance: instance }));
    setTab("selected");
  }, []);
  const pickById = useCallback((id: string) => { pick(id, null); setFocusKey((k) => k + 1); }, [pick]);
  const clearSelection = useCallback(() => setView((v) => ({ ...v, selectedId: null, selectedInstance: null })), []);
  const chooseMode = (mode: AppMode) => { setView((v) => ({ ...v, mode })); setTab(MODE_TABS[mode][0]!.id); setSettingsOpen(false); };
  const goStage = (stage: StageId) => setView((v) => setStage(v, stage));

  const noPlan = !!model && model.components.length === 0;
  const stageDef = STAGE_BY_ID[view.stage];
  const tabs = MODE_TABS[view.mode];
  const activeTab: Tab = settingsOpen ? "settings" : tabs.some((t) => t.id === tab) ? tab : tabs[0]!.id;

  return (
    <div className="min-w-0 space-y-2" data-testid="construction-lab">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Source> label="What to study" value={source} onChange={setSource} options={[{ id: "sample", label: "Sample house" }, { id: "project", label: "My project" }]} />
        <button type="button" onClick={() => setSettingsOpen((o) => !o)} aria-pressed={settingsOpen} data-testid="settings-toggle" className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium", settingsOpen && "border-brand bg-brand/10 text-brand")}><Settings2 className="size-4" />Dimensions and options</button>
      </div>
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950" data-testid="disclaimer">
        <p><strong>Illustrative learning model.</strong> {noteOpen ? ENGINEERING_DISCLAIMER : "Dimensions, reinforcement and services are examples for teaching the order of work — not a design, and not safe or ready to build."} <button type="button" onClick={() => setNoteOpen(!noteOpen)} className="underline">{noteOpen ? "Less" : "More"}</button></p>
      </div>
      <Segmented<AppMode> label="Mode" value={view.mode} onChange={chooseMode} options={MODES} />

      {/* Timeline */}
      <div className="rounded-xl border bg-card p-2" data-testid="timeline">
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Previous stage" data-testid="stage-prev" disabled={view.stage === 1} onClick={() => setView((v) => stepStage(v, -1))} className="flex size-10 shrink-0 items-center justify-center rounded-lg border disabled:opacity-40"><ChevronLeft className="size-5" /></button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">Stage {view.stage} of {STAGES.length}</p>
            <p className="truncate text-sm font-semibold" data-testid="stage-title">{stageDef.title}</p>
          </div>
          <button type="button" aria-label="Next stage" data-testid="stage-next" disabled={view.stage === 18} onClick={() => setView((v) => stepStage(v, 1))} className="flex size-10 shrink-0 items-center justify-center rounded-lg border disabled:opacity-40"><ChevronRight className="size-5" /></button>
        </div>
        <div role="tablist" aria-label="Construction stages" className="relative mt-2 flex gap-1 overflow-x-auto pb-1">
          {STAGE_IDS.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={s === view.stage} data-stage={s} title={STAGE_BY_ID[s].title} onClick={() => goStage(s)} className={cn("flex min-h-10 min-w-[3.6rem] shrink-0 flex-col items-center justify-center rounded-lg border px-1.5 text-[10px] leading-tight", s === view.stage ? "border-brand bg-brand text-brand-foreground" : s < view.stage ? "bg-muted text-foreground" : "text-muted-foreground")}>
              <span className="text-xs font-semibold">{s}</span>
              <span className="max-w-[4.5rem] truncate">{STAGE_BY_ID[s].short}</span>
              {counts ? <span className="sr-only">{counts[s]} components</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-2">
          {/* The model */}
          <div className="relative h-[46dvh] min-h-[300px] w-full min-w-0 overflow-hidden rounded-xl border bg-muted/25 lg:h-[min(640px,66dvh)]" data-testid="construction-viewer" data-stage={view.stage} data-exploded={view.explode.amount > 0 ? "true" : "false"}>
            {model && index && !noPlan ? (
              <ConstructionScene model={model} view={viewWithOptions} preset={preset} resetKey={resetKey} focusKey={focusKey} onPick={pick} onMiss={clearSelection} onLabels={setLabels} />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground" data-testid="viewer-empty">
                {!ready || (!model && source) ? <span className="inline-flex items-center"><Loader2 className="mr-2 size-4 animate-spin" />Building the model…</span> : <span>{model?.warnings[0] ?? "Nothing to show yet."}</span>}
              </div>
            )}
            {showLabels && model && !noPlan ? <LabelLayer labels={labels} onPick={pickById} /> : null}
            <div className="pointer-events-none absolute left-2 right-2 top-2 flex items-start justify-between gap-2">
              <div className="pointer-events-auto flex w-max max-w-full overflow-x-auto rounded-full border bg-background/90 p-1 shadow-sm backdrop-blur" role="radiogroup" aria-label="Camera view">
                {([["orbit", "Orbit"], ["top", "Top"], ["front", "Front"], ["side", "Side"]] as const).map(([id, label]) => (
                  <button key={id} type="button" role="radio" aria-checked={preset === id} onClick={() => { setPreset(id); setResetKey((k) => k + 1); }} className={cn("min-h-9 rounded-full px-3 text-xs", preset === id ? "bg-brand text-brand-foreground" : "text-muted-foreground")}>{label}</button>
                ))}
              </div>
            </div>
            <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap justify-end gap-1.5">
              <button type="button" data-testid="reset-camera" onClick={() => { setPreset("orbit"); setResetKey((k) => k + 1); }} className="pointer-events-auto min-h-9 rounded-full border bg-background/90 px-3 text-xs shadow-sm backdrop-blur">Reset camera</button>
              <button type="button" data-testid="reset-model" onClick={() => setView((v) => ({ ...resetView(options), stage: v.stage }))} className="pointer-events-auto inline-flex min-h-9 items-center gap-1 rounded-full border bg-background/90 px-3 text-xs shadow-sm backdrop-blur"><RotateCcw className="size-3.5" />Reset model</button>
            </div>
          </div>

          {/* Controls */}
          <ViewControls view={viewWithOptions} showLabels={showLabels} onLabels={setShowLabels} onView={patch} />
        </div>

        <aside className="min-w-0 space-y-2" aria-label="Details">
          <div role="tablist" aria-label="Panels" className="relative flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={activeTab === t.id} onClick={() => { setTab(t.id); setSettingsOpen(false); }} data-tab={t.id} className={cn("min-h-9 shrink-0 flex-1 rounded-lg px-3 text-xs font-semibold", activeTab === t.id ? "bg-background text-brand shadow-sm" : "text-muted-foreground")}>{t.id === "selected" && view.selectedId ? "Selected part •" : t.label}</button>
            ))}
          </div>
          <div className="min-w-0 lg:max-h-[calc(66dvh+9rem)] lg:overflow-y-auto lg:pr-1" data-testid="panel-body">
            {!model || !index ? <p className="rounded-xl border p-4 text-sm text-muted-foreground">Building the model…</p>
              : noPlan ? <p className="rounded-xl border p-4 text-sm" data-testid="empty-project">{model.warnings[0] ?? "This project has nothing to build yet."} Switch to the sample house to explore every stage.</p>
              : activeTab === "lesson" ? (
                <LessonPanel stage={view.stage} model={model} index={index} view={viewWithOptions} onPick={pickById}>
                  <StageControls view={viewWithOptions} model={model} index={index} onView={patch} onOptions={patchOptions} />
                </LessonPanel>
              )
              : activeTab === "selected" ? <InspectorPanel model={model} view={viewWithOptions} onClear={clearSelection} onIsolate={(id) => patch({ isolateId: id })} onHide={(id) => { patch({ hiddenIds: [...view.hiddenIds, id], selectedId: null, selectedInstance: null }); }} onFocus={() => setFocusKey((k) => k + 1)} onSelect={pickById} />
              : activeTab === "parts" ? <PartsPanel model={model} view={viewWithOptions} selectedId={view.selectedId} onPick={pickById} hiddenIds={view.hiddenIds} onToggleHidden={(id) => patch({ hiddenIds: view.hiddenIds.includes(id) ? view.hiddenIds.filter((x) => x !== id) : [...view.hiddenIds, id] })} />
              : activeTab === "layers" ? <LayersPanel model={model} view={viewWithOptions} onView={patch} />
              : activeTab === "quantities" ? <QuantitiesPanel model={model} view={viewWithOptions} rules={rules} onRules={setRules} onHighlight={(ids) => patch({ highlightIds: ids })} onPick={pickById} />
              : activeTab === "estimate" ? <EstimatePanel model={model} view={viewWithOptions} />
              : <SettingsPanel source={source} params={normalized.params} issues={normalized.issues} onParams={(p) => setParams((old) => ({ ...old, ...p }))} onReset={() => setParams({})} options={options} onOptions={patchOptions} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Labels with leader lines ------------------------------------------------------ */

function LabelLayer({ labels, onPick }: { labels: ScreenLabel[]; onPick: (id: string) => void }) {
  const width = labels[0]?.width ?? 0;
  const height = labels[0]?.height ?? 0;
  const boxes = useMemo(() => layoutLabels(labels.filter((l) => l.x >= 0 && l.y >= 0 && l.x <= width && l.y <= height), width, height), [labels, width, height]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" data-testid="label-layer">
      <svg className="absolute inset-0 size-full" aria-hidden>
        {boxes.map((l) => (
          <g key={l.id}>
            <line x1={l.x} y1={l.y} x2={Math.min(Math.max(l.x, l.bx), l.bx + l.w)} y2={l.by + l.h / 2} stroke="#1473e6" strokeWidth="1.2" />
            <circle cx={l.x} cy={l.y} r="3" fill="#1473e6" />
          </g>
        ))}
      </svg>
      {boxes.map((l) => (
        <button key={l.id} type="button" data-label-for={l.id} onClick={() => onPick(l.id)} style={{ left: l.bx, top: l.by, width: l.w, height: l.h }} className="pointer-events-auto absolute truncate rounded-md border border-brand/40 bg-background/95 px-2 text-left text-[11px] font-medium leading-[20px] shadow-sm">{l.text}</button>
      ))}
    </div>
  );
}

/** Controls under the model ----------------------------------------------------------- */

function ViewControls({ view, showLabels, onLabels, onView }: { view: ViewState; showLabels: boolean; onLabels: (on: boolean) => void; onView: (p: Partial<ViewState>) => void }) {
  const ex = view.explode;
  const setEx = (p: Partial<ViewState["explode"]>) => onView({ explode: { ...ex, ...p } });
  return (
    <div className="space-y-2 rounded-xl border bg-card p-3" data-testid="view-controls">
      <div className="flex items-center gap-2">
        <label htmlFor="explode-amount" className="shrink-0 text-xs font-semibold">Assemble ↔ Explode</label>
        <input id="explode-amount" data-testid="explode-slider" type="range" min={0} max={1} step={0.01} value={ex.amount} onChange={(e) => setEx({ amount: Number(e.target.value) })} className="h-10 min-w-0 flex-1" aria-valuetext={ex.amount === 0 ? "assembled" : `${Math.round(ex.amount * 100)}% exploded`} />
        <button type="button" data-testid="assemble" onClick={() => setEx({ amount: 0 })} disabled={ex.amount === 0} className="min-h-9 shrink-0 rounded-lg border px-3 text-xs disabled:opacity-40">Assemble</button>
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs" role="group" aria-label="What to separate">
        {([["floors", "Floors"], ["categories", "Categories"], ["layers", "Layers"]] as const).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={ex[key]} data-explode-toggle={key} onClick={() => setEx({ [key]: !ex[key] })} className={cn("min-h-9 rounded-lg border px-3", ex[key] ? "border-brand bg-brand/10 text-brand" : "text-muted-foreground")}>{label}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs">Cut-away
          <select aria-label="Cut-away" data-testid="cutaway-mode" value={view.cutaway.mode} onChange={(e) => onView({ cutaway: { ...view.cutaway, mode: e.target.value as CutawayMode } })} className="min-h-9 rounded-lg border bg-background px-2 text-xs">
            <option value="off">Off</option><option value="level">Floor level</option><option value="section-x">Section across</option><option value="section-y">Section along</option>
          </select>
        </label>
        {view.cutaway.mode !== "off" ? <input aria-label="Cut-away position" data-testid="cutaway-position" type="range" min={0} max={1} step={0.01} value={view.cutaway.position} onChange={(e) => onView({ cutaway: { ...view.cutaway, position: Number(e.target.value) } })} className="h-10 min-w-24 flex-1" /> : null}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <label className="flex min-h-9 items-center gap-1.5"><input type="checkbox" checked={view.onlyThisStage} onChange={(e) => onView({ onlyThisStage: e.target.checked })} />Only this stage</label>
        <label className="flex min-h-9 items-center gap-1.5"><input type="checkbox" checked={view.transparentContext} onChange={(e) => onView({ transparentContext: e.target.checked })} />Transparent context</label>
        <label className="flex min-h-9 items-center gap-1.5"><input type="checkbox" checked={view.ghostFuture} onChange={(e) => onView({ ghostFuture: e.target.checked })} />Later stages as ghosts</label>
        <label className="flex min-h-9 items-center gap-1.5"><input type="checkbox" checked={showLabels} onChange={(e) => onLabels(e.target.checked)} />Labels</label>
      </div>
      {view.isolateId || view.hiddenIds.length || view.highlightIds.length ? (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {view.isolateId ? <button type="button" onClick={() => onView({ isolateId: null })} className="min-h-9 rounded-lg border px-3">Stop isolating</button> : null}
          {view.hiddenIds.length ? <button type="button" onClick={() => onView({ hiddenIds: [] })} className="min-h-9 rounded-lg border px-3">Show {view.hiddenIds.length} hidden part{view.hiddenIds.length === 1 ? "" : "s"}</button> : null}
          {view.highlightIds.length ? <button type="button" onClick={() => onView({ highlightIds: [] })} className="min-h-9 rounded-lg border px-3">Clear highlight</button> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Stage-specific controls ------------------------------------------------------------- */

const FRAME_VIEWS: { id: FrameView; label: string }[] = [
  { id: "complete", label: "Complete" }, { id: "reinforcement", label: "Reinforcement only" }, { id: "formwork", label: "Formwork only" }, { id: "placement", label: "Placement sequence" }, { id: "completed", label: "Completed" },
];

function StageControls({ view, model, index, onView, onOptions }: { view: ViewState; model: ConstructionModel; index: ReturnType<typeof indexModel>; onView: (p: Partial<ViewState>) => void; onOptions: (p: Partial<ModelOptions>) => void }) {
  const s = view.stage;
  const blocks: React.ReactNode[] = [];
  if (s === 3 || s === 5) {
    const step = Math.min(view.pourStep, index.maxPour);
    blocks.push(
      <Section key="frame" title="Show the work as" testId="frame-views">
        <Segmented<FrameView> label="Frame view" value={view.frameView} onChange={(frameView) => onView({ frameView, pourStep: frameView === "placement" ? 0 : 99 })} options={FRAME_VIEWS} />
        {view.frameView === "placement" ? (
          <div className="space-y-1" data-testid="placement-controls">
            <p className="text-xs">Concrete poured up to placement {step} of {index.maxPour}.</p>
            <input type="range" aria-label="Placement step" min={0} max={index.maxPour} step={1} value={step} onChange={(e) => onView({ pourStep: Number(e.target.value) })} className="h-10 w-full" />
            <div className="flex gap-1.5"><button type="button" onClick={() => onView({ pourStep: Math.max(0, step - 1) })} className="min-h-9 rounded-lg border px-3 text-xs">Back one</button><button type="button" onClick={() => onView({ pourStep: Math.min(index.maxPour, step + 1) })} className="min-h-9 rounded-lg border px-3 text-xs">Pour next</button></div>
          </div>
        ) : null}
      </Section>,
    );
  }
  if (s === 7) {
    blocks.push(
      <Section key="masonry" title="Blockwork" testId="masonry-controls">
        <Segmented<ModelOptions["blockType"]> label="Block type" value={view.options.blockType} onChange={(blockType) => onOptions({ blockType })} options={[{ id: "hollow", label: "Hollow block" }, { id: "solid", label: "Solid block" }, { id: "brick", label: "Brick" }]} />
        <label className="block text-xs">Wall built: {Math.round(view.wallProgress * 100)}%
          <input type="range" aria-label="Wall progress" data-testid="wall-progress" min={0} max={1} step={0.01} value={view.wallProgress} onChange={(e) => onView({ wallProgress: Number(e.target.value) })} className="h-10 w-full" />
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => onView({ wallProgress: 0.35 })} className="min-h-9 rounded-lg border px-3 text-xs">Partial wall</button>
          <button type="button" onClick={() => onView({ wallProgress: 1 })} className="min-h-9 rounded-lg border px-3 text-xs">Full wall</button>
          <button type="button" data-testid="explode-wall" onClick={() => onView({ wallProgress: 1, explode: { amount: 0.8, floors: false, categories: false, layers: true }, categoriesOff: model.components.some((c) => c.category === "masonry") ? ["site", "earthworks", "substructure", "frame", "stairs"] : [] })} className="min-h-9 rounded-lg border px-3 text-xs">Exploded wall</button>
        </div>
        <p className="text-xs text-muted-foreground">Tap a single block in the model to see which course and wall it belongs to.</p>
      </Section>,
    );
  }
  if (s === 8) {
    blocks.push(
      <Section key="roof" title="Roof alternative" testId="roof-controls">
        <Segmented<ModelOptions["roofType"]> label="Roof type" value={view.options.roofType} onChange={(roofType) => onOptions({ roofType })} options={[{ id: "flat", label: "Flat concrete roof" }, { id: "pitched", label: "Pitched timber roof" }]} />
        <p className="text-xs text-muted-foreground">Both sit on the same roof slab. Quantities count only the one shown.</p>
      </Section>,
    );
  }
  if (s === 9 || s === 10 || s === 11) {
    blocks.push(
      <Section key="mep" title="Services view" testId="mep-controls">
        <Segmented<ModelOptions["mepView"]> label="Services view" value={view.options.mepView} onChange={(mepView) => onOptions({ mepView })} options={[{ id: "finished", label: "Finished" }, { id: "concealed", label: "See through walls" }, { id: "visible", label: "Keep visible" }]} />
        <p className="text-xs text-muted-foreground">Once the plaster is on, finished buildings hide conduits and pipes inside the walls. See-through shows them anyway.</p>
      </Section>,
    );
  }
  if (s === 13) {
    blocks.push(
      <Section key="floor" title="Floor finish" testId="floor-controls">
        <Segmented<ModelOptions["floorFinish"]> label="Floor finish" value={view.options.floorFinish} onChange={(floorFinish) => onOptions({ floorFinish })} options={[{ id: "porcelain", label: "Porcelain" }, { id: "ceramic", label: "Ceramic" }, { id: "stone", label: "Natural stone" }]} />
      </Section>,
    );
  }
  if (s === 16) {
    blocks.push(
      <Section key="joinery" title="Kitchen and wardrobes" testId="joinery-controls">
        <p className="text-xs text-muted-foreground">These panels are Berchuma&apos;s real cutting parts. Explode the layers to see the carcass, fronts, drawers and hardware apart.</p>
        <button type="button" onClick={() => onView({ explode: { amount: 0.7, floors: false, categories: false, layers: true } })} className="min-h-9 rounded-lg border px-3 text-xs">Explode the cabinets</button>
      </Section>,
    );
  }
  return blocks.length ? <>{blocks}</> : null;
}

/** Sample house dimensions --------------------------------------------------------------- */

const FIELDS: { key: keyof LearningHouseParams; label: string; min: number; max: number; step: number }[] = [
  { key: "floorToFloor", label: "Floor to floor height", min: 2600, max: 4500, step: 50 },
  { key: "slabThickness", label: "Suspended slab thickness", min: 120, max: 350, step: 10 },
  { key: "groundSlabThickness", label: "Ground slab thickness", min: 100, max: 300, step: 10 },
  { key: "externalWall", label: "External wall thickness", min: 100, max: 350, step: 10 },
  { key: "internalWall", label: "Internal wall thickness", min: 75, max: 250, step: 5 },
  { key: "columnSize", label: "Column size (square)", min: 200, max: 600, step: 25 },
  { key: "beamWidth", label: "Beam width", min: 150, max: 450, step: 25 },
  { key: "beamDepth", label: "Beam depth", min: 250, max: 800, step: 25 },
  { key: "footingSize", label: "Pad footing size", min: 900, max: 3000, step: 100 },
  { key: "footingThickness", label: "Pad footing thickness", min: 250, max: 800, step: 25 },
  { key: "doorWidth", label: "Door width", min: 700, max: 1200, step: 50 },
  { key: "doorHeight", label: "Door height", min: 1900, max: 2400, step: 50 },
  { key: "windowWidth", label: "Window width", min: 600, max: 2400, step: 100 },
  { key: "windowHeight", label: "Window height", min: 600, max: 1800, step: 100 },
  { key: "windowSill", label: "Window sill height", min: 300, max: 1400, step: 50 },
];

function SettingsPanel({ source, params, issues, onParams, onReset, options, onOptions }: { source: Source; params: LearningHouseParams; issues: { field: string; message: string }[]; onParams: (p: Partial<LearningHouseParams>) => void; onReset: () => void; options: ModelOptions; onOptions: (p: Partial<ModelOptions>) => void }) {
  const [gridX, setGridX] = useState(params.gridX.join(", "));
  const [gridY, setGridY] = useState(params.gridY.join(", "));
  const parse = (text: string) => text.split(/[ ,;]+/).map(Number).filter((n) => Number.isFinite(n));
  return (
    <div className="space-y-2" data-testid="settings-panel">
      {source === "project" ? (
        <div className="rounded-xl border bg-card p-3 text-sm">Your project&apos;s own dimensions are used as drawn. Change them on the Plan tab; this view only reads them and never changes your house.</div>
      ) : (
        <>
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">These sizes are examples for learning. The sample is built in memory only: it is never saved over your own houses. Do not use it as a design.</div>
          {issues.length ? (
            <ul className="space-y-1 rounded-xl border border-orange-300 bg-orange-50 p-3 text-xs text-orange-950" data-testid="param-issues">{issues.map((i) => <li key={i.field + i.message}>{i.message}</li>)}</ul>
          ) : null}
          <Section title="Dimensions (millimetres)">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <label key={f.key} className="block text-xs">{f.label}
                  <input type="number" inputMode="decimal" data-field={f.key} min={f.min} max={f.max} step={f.step} value={params[f.key] as number} onChange={(e) => onParams({ [f.key]: e.target.value === "" ? undefined : Number(e.target.value) } as Partial<LearningHouseParams>)} className="mt-1 min-h-11 w-full rounded-lg border bg-background px-2 text-sm" />
                </label>
              ))}
            </div>
          </Section>
          <Section title="Structural grid (millimetres)" defaultOpen={false}>
            <label className="block text-xs">Lines across (5, increasing, at least 1500 apart)
              <input data-field="gridX" value={gridX} onChange={(e) => { setGridX(e.target.value); onParams({ gridX: parse(e.target.value) }); }} className="mt-1 min-h-11 w-full rounded-lg border bg-background px-2 text-sm" />
            </label>
            <label className="block text-xs">Lines deep (3)
              <input data-field="gridY" value={gridY} onChange={(e) => { setGridY(e.target.value); onParams({ gridY: parse(e.target.value) }); }} className="mt-1 min-h-11 w-full rounded-lg border bg-background px-2 text-sm" />
            </label>
          </Section>
          <button type="button" onClick={() => { onReset(); setGridX(DEFAULT_LEARNING_PARAMS.gridX.join(", ")); setGridY(DEFAULT_LEARNING_PARAMS.gridY.join(", ")); }} className="min-h-10 rounded-xl border px-4 text-sm">Back to the example dimensions</button>
        </>
      )}
      <Section title="Build options">
        <Segmented<ModelOptions["blockType"]> label="Block type" value={options.blockType} onChange={(blockType) => onOptions({ blockType })} options={[{ id: "hollow", label: "Hollow block" }, { id: "solid", label: "Solid block" }, { id: "brick", label: "Brick" }]} />
        <Segmented<ModelOptions["floorFinish"]> label="Floor finish" value={options.floorFinish} onChange={(floorFinish) => onOptions({ floorFinish })} options={[{ id: "porcelain", label: "Porcelain" }, { id: "ceramic", label: "Ceramic" }, { id: "stone", label: "Stone" }]} />
        <Segmented<ModelOptions["roofType"]> label="Roof" value={options.roofType} onChange={(roofType) => onOptions({ roofType })} options={[{ id: "flat", label: "Flat" }, { id: "pitched", label: "Pitched" }]} />
      </Section>
    </div>
  );
}
