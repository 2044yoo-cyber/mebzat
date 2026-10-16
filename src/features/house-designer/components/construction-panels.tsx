"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Focus, Search, Target } from "lucide-react";

import { sectionTitle } from "@/lib/takeoff/boq";
import { cn } from "@/lib/utils";

import { buildBill, groupBill, type BillGrouping } from "../construction/boq";
import { auditBill } from "../construction/boq-audit";
import { CATEGORY_COLORS, SERVICE_LEGEND, materialOf } from "../construction/catalogue";
import { describeComponent } from "../construction/inspect";
import { aggregateQuantities, missingData, toBoqDraft } from "../construction/quantities";
import { constructionTakeoffPackage } from "../construction/takeoff-handoff";
import { HOUSE_TAKEOFF_SESSION_KEY } from "../services/takeoff-adapter";
import { STAGE_BY_ID } from "../construction/stages";
import {
  CATEGORY_LABELS, LAYER_IDS, LAYER_LABELS, PROVENANCE_LABELS, SERVICE_VIEWS, SERVICE_VIEW_LABELS, STAGE_IDS,
  type CategoryId, type ComponentRecord, type ConstructionModel, type EstimatingRules, type LayerId, type Provenance, type ServiceView, type StageId, type ViewState,
} from "../construction/types";
import { applyServiceView, isolateLayer, toggleIn, type ModelIndex } from "../construction/view";

const LAYER_ORDER_NOTE = "Hide layers to look inside the building, or choose Only this to see one kind of work on its own, such as reinforcement or glass.";

/** Small shared pieces ---------------------------------------------------- */

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (id: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex min-w-0 flex-wrap gap-1 rounded-xl bg-muted p-1">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value} onClick={() => onChange(o.id)} className={cn("min-h-9 flex-1 rounded-lg px-2.5 text-xs font-medium", o.id === value ? "bg-background text-brand shadow-sm" : "text-muted-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, children, defaultOpen = true, testId }: { title: string; children: React.ReactNode; defaultOpen?: boolean; testId?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border bg-card" data-testid={testId}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-10 w-full items-center justify-between gap-2 px-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
      </button>
      {open ? <div className="space-y-2 border-t p-3 text-sm">{children}</div> : null}
    </section>
  );
}

const STATUS_STYLE: Record<Provenance, string> = {
  measured: "border-emerald-300 bg-emerald-50 text-emerald-800",
  calculated: "border-sky-300 bg-sky-50 text-sky-800",
  assumed: "border-amber-300 bg-amber-50 text-amber-900",
  review: "border-orange-300 bg-orange-50 text-orange-900",
  missing: "border-red-300 bg-red-50 text-red-800",
};

export function StatusBadge({ status }: { status: Provenance }) {
  return <span title={PROVENANCE_LABELS[status]} data-status={status} className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", STATUS_STYLE[status])}>{status}</span>;
}

const f = (n: number | null, digits = 2) => (n === null ? "—" : n.toLocaleString("en", { maximumFractionDigits: digits, minimumFractionDigits: n % 1 === 0 ? 0 : Math.min(digits, 2) }));

/** Lesson ------------------------------------------------------------------ */

export function LessonPanel({ stage, model, index, view, onPick, children }: { stage: StageId; model: ConstructionModel; index: ModelIndex; view: ViewState; onPick: (id: string) => void; children?: React.ReactNode }) {
  const def = STAGE_BY_ID[stage];
  const parts = useMemo(() => model.components.filter((c) => c.stage === stage && (!c.variant || (c.variant.group === "roof" && view.options.roofType === c.variant.value))), [model, stage, view.options.roofType]);
  const [listOpen, setListOpen] = useState(false);
  void index;
  return (
    <div className="space-y-2" data-testid="lesson-panel">
      <div className="rounded-xl border bg-card p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">Stage {def.id} of 18</p>
        <h2 className="text-base font-semibold leading-tight">{def.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{def.summary}</p>
      </div>
      {children}
      <Section title="What to look for">
        <ul className="list-disc space-y-1.5 pl-4 text-sm">{def.learn.map((l) => <li key={l}>{l}</li>)}</ul>
      </Section>
      <Section title="Sequence of work" defaultOpen={false}>
        <ol className="list-decimal space-y-1 pl-5 text-sm">{def.sequence.map((s) => <li key={s}>{s}</li>)}</ol>
      </Section>
      <Section title="Quality checks" defaultOpen={false}>
        <ul className="list-disc space-y-1 pl-4 text-sm">{def.qualityChecks.map((s) => <li key={s}>{s}</li>)}</ul>
      </Section>
      <Section title="Safety" defaultOpen={false}>
        <ul className="list-disc space-y-1 pl-4 text-sm">{def.safety.map((s) => <li key={s}>{s}</li>)}</ul>
      </Section>
      <Section title="Quantities at this stage" defaultOpen={false}>
        <p className="text-sm">{def.quantityNote}</p>
      </Section>
      <Section title={`Parts added in this stage (${parts.length})`} defaultOpen={false}>
        <button type="button" onClick={() => setListOpen(!listOpen)} className="min-h-9 rounded-lg border px-3 text-xs font-medium">{listOpen ? "Hide the list" : "Show the list"}</button>
        {listOpen ? (
          <ul className="max-h-64 space-y-0.5 overflow-y-auto text-xs">
            {parts.slice(0, 200).map((c) => (
              <li key={c.id}><button type="button" onClick={() => onPick(c.id)} className="w-full truncate rounded px-2 py-1.5 text-left hover:bg-muted">{c.name}</button></li>
            ))}
            {parts.length > 200 ? <li className="px-2 py-1 text-muted-foreground">…and {parts.length - 200} more. Use the Parts tab to search.</li> : null}
          </ul>
        ) : null}
      </Section>
    </div>
  );
}

/** Inspector ---------------------------------------------------------------- */

export function InspectorPanel({ model, view, onClear, onIsolate, onHide, onFocus, onSelect, className }: { model: ConstructionModel; view: ViewState; onClear: () => void; onIsolate: (id: string | null) => void; onHide: (id: string) => void; onFocus: () => void; onSelect: (id: string) => void; className?: string }) {
  const info = view.selectedId ? describeComponent(model, view.selectedId, view.selectedInstance) : null;
  if (!info) {
    return (
      <div className={cn("rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground", className)} data-testid="inspector-empty">
        Tap or click any part of the model, or pick one from the Parts list, to see what it is, how it is built and where its quantities come from.
      </div>
    );
  }
  const isolated = view.isolateId === info.id;
  return (
    <div className={cn("space-y-2", className)} data-testid="inspector" data-component-id={info.id}>
      <div className="rounded-xl border bg-card p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">{info.category}{info.subcategory ? ` · ${info.subcategory}` : ""}</p>
            <h3 className="text-base font-semibold leading-tight" data-testid="inspector-name">{info.instance ? `${info.instance.name} — ` : ""}{info.name}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{info.knowledge.title}</p>
          </div>
          <StatusBadge status={info.status} />
        </div>
        <p className="mt-2 text-sm">{info.knowledge.summary}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => onIsolate(isolated ? null : info.id)} aria-pressed={isolated} className={cn("inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium", isolated && "border-brand bg-brand/10 text-brand")}><Target className="size-3.5" />{isolated ? "Show everything" : "Isolate"}</button>
          <button type="button" onClick={() => onHide(info.id)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium"><EyeOff className="size-3.5" />Hide</button>
          <button type="button" onClick={onFocus} className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium"><Focus className="size-3.5" />Focus</button>
          <button type="button" onClick={onClear} className="min-h-9 rounded-lg border px-2.5 text-xs font-medium">Clear</button>
        </div>
      </div>

      <Section title="Where it is" testId="inspector-where">
        <dl className="grid grid-cols-[7.5rem_1fr] gap-x-2 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Storey</dt><dd>{info.storey}</dd>
          <dt className="text-muted-foreground">Room</dt><dd>{info.room ?? "—"}</dd>
          <dt className="text-muted-foreground">Grid</dt><dd>{info.grid ?? "—"}</dd>
          <dt className="text-muted-foreground">Stage</dt><dd>{info.stage.id}. {info.stage.title}</dd>
          <dt className="text-muted-foreground">Order in stage</dt><dd>{info.sequence}</dd>
          <dt className="text-muted-foreground">Layer</dt><dd>{info.layer}</dd>
          <dt className="text-muted-foreground">Material</dt><dd>{info.material}</dd>
          <dt className="text-muted-foreground">Parent</dt><dd>{info.parent ? <button type="button" className="text-left text-brand underline" onClick={() => onSelect(info.parent!.id)}>{info.parent.name}</button> : "—"}</dd>
          {info.removedAfter ? <><dt className="text-muted-foreground">Removed after</dt><dd>Stage {info.removedAfter.id}</dd></> : null}
        </dl>
        {info.children.length ? (
          <div className="pt-1"><p className="text-xs text-muted-foreground">Connected parts</p><ul className="mt-1 flex flex-wrap gap-1">{info.children.map((c) => <li key={c.id}><button type="button" onClick={() => onSelect(c.id)} className="max-w-52 truncate rounded-full border px-2 py-1 text-[11px]">{c.name}</button></li>)}</ul></div>
        ) : null}
      </Section>

      {info.service ? (
        <Section title="Installation" testId="inspector-service">
          <dl className="grid grid-cols-[7.5rem_1fr] gap-x-2 gap-y-1 text-sm">
            <dt className="text-muted-foreground">System</dt><dd className="flex items-center gap-1.5"><span aria-hidden className="inline-block size-3 rounded-full border" style={{ backgroundColor: info.service.colour }} />{info.service.system}</dd>
            <dt className="text-muted-foreground">What it is</dt><dd>{info.service.role}</dd>
            <dt className="text-muted-foreground">Level</dt><dd>{info.service.level}</dd>
            <dt className="text-muted-foreground">From</dt><dd data-testid="service-from">{info.service.from}</dd>
            <dt className="text-muted-foreground">To</dt><dd data-testid="service-to">{info.service.to}</dd>
            <dt className="text-muted-foreground">Fixed to</dt><dd>{info.service.route}</dd>
            <dt className="text-muted-foreground">Cover</dt><dd>{info.service.covered}</dd>
          </dl>
          {info.note ? <p className="rounded-lg bg-muted p-2 text-xs">Installation: {info.note}</p> : null}
        </Section>
      ) : null}

      <Section title="Dimensions and source" testId="inspector-dims">
        <p className="text-xs" data-testid="geometry-label">{info.geometryLabel}</p>
        {info.sourceRef ? <p className="text-[11px] text-muted-foreground">Project object: {info.sourceRef}</p> : null}
        {info.dims.length ? (
          <table className="w-full text-sm"><tbody>{info.dims.map((d) => (
            <tr key={d.key} className="border-t first:border-t-0">
              <td className="py-1 pr-2 text-muted-foreground">{d.label}</td>
              <td className="py-1 pr-2 tabular-nums">{f(d.dim.value, 3)} {d.dim.unit}</td>
              <td className="py-1 text-right"><StatusBadge status={d.dim.status} /></td>
            </tr>
          ))}</tbody></table>
        ) : <p className="text-xs text-muted-foreground">No dimensions are stated for this part.</p>}
        {info.dims.filter((d) => d.dim.note).map((d) => <p key={d.key} className="text-[11px] text-muted-foreground">{d.label}: {d.dim.note}</p>)}
        {info.note ? <p className="rounded-lg bg-muted p-2 text-xs">{info.note}</p> : null}
        {info.loose ? <p className="text-xs text-muted-foreground">Loose furniture: kept apart from the building works.</p> : null}
        {info.concealed ? <p className="text-xs text-muted-foreground">Hidden inside the finished building.</p> : null}
      </Section>

      <Section title={`Quantities (${info.quantities.length})`} testId="inspector-quantities">
        <p className="text-xs text-muted-foreground">{info.quantityMethod}</p>
        {info.quantities.length === 0 ? <p className="text-xs text-muted-foreground">This part has no quantity of its own.</p> : null}
        <ul className="space-y-2">
          {info.quantities.map((q) => (
            <li key={q.id} className="rounded-lg border p-2" data-quantity-status={q.status}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">{q.description}</p>
                  <p className="text-[11px] text-muted-foreground">{sectionTitle(q.section)} · {q.workItem}{q.room ? ` · ${q.room}` : ""}</p>
                </div>
                <div className="shrink-0 text-right"><p className="text-sm font-semibold tabular-nums">{q.value === null ? "no figure" : `${f(q.value, 3)} ${q.unit}`}</p><StatusBadge status={q.status} /></div>
              </div>
              <p className="mt-1 break-words text-[11px]">{q.formula}</p>
              {q.allowance ? <p className="text-[11px] text-muted-foreground">Allowance kept separate: {q.allowance.percent === null ? "set elsewhere" : `${q.allowance.percent}%`} — {q.allowance.rule}</p> : null}
              {q.assumptions.length ? <p className="text-[11px] text-muted-foreground">Assumes: {q.assumptions.join(" ")}</p> : null}
              {q.exclusions.length ? <p className="text-[11px] text-muted-foreground">Excludes: {q.exclusions.join(", ")}</p> : null}
              <p className="text-[11px] text-muted-foreground">Source: {q.sourceGeometry}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="How it is built" defaultOpen={false}>
        <ol className="list-decimal space-y-1 pl-5 text-sm">{info.knowledge.installation.map((s) => <li key={s}>{s}</li>)}</ol>
        <p className="text-xs"><span className="font-semibold">Made of: </span>{info.knowledge.materials}</p>
        <p className="text-xs"><span className="font-semibold">Joined to: </span>{info.knowledge.connections}</p>
      </Section>
      <Section title="Quality, defects, safety, maintenance" defaultOpen={false}>
        <Bullets title="Quality checks" items={info.knowledge.qualityChecks} />
        <Bullets title="Common defects" items={info.knowledge.commonDefects} />
        <Bullets title="Safety" items={info.knowledge.safety} />
        <Bullets title="Maintenance" items={info.knowledge.maintenance} />
      </Section>
    </div>
  );
}

/** The six ways of looking at the installation, and what each colour in them stands for. */
export function ServiceViewPanel({ view, model, onView, rules, onRules }: { view: ViewState; model: ConstructionModel; onView: (patch: Partial<ViewState>) => void; rules: EstimatingRules; onRules: (rules: EstimatingRules) => void }) {
  const set = (patch: Partial<EstimatingRules["services"]>) => onRules({ ...rules, services: { ...rules.services, ...patch } });
  const setFall = (key: "waste" | "soil" | "drain", value: number) => set({ fall: { ...rules.services.fall, [key]: value } });
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of model.components) if (c.service && c.service.role === "route") { const id = legendOf(c); map.set(id, (map.get(id) ?? 0) + 1); }
    return map;
  }, [model]);
  return (
    <Section title="Installation views" testId="service-views">
      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Installation view">
        {SERVICE_VIEWS.map((mode: ServiceView) => (
          <button key={mode} type="button" data-testid={`service-view-${mode}`} aria-pressed={view.serviceView === mode} onClick={() => onView(applyServiceView(view, mode))}
            className={cn("min-h-10 rounded-lg border px-2 text-left text-xs font-medium", view.serviceView === mode ? "border-brand bg-brand/10 text-brand" : "bg-card")}>
            {SERVICE_VIEW_LABELS[mode].label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground" data-testid="service-view-hint">{SERVICE_VIEW_LABELS[view.serviceView].hint}</p>
      <ul className="space-y-1" data-testid="service-legend" aria-label="Legend">
        {SERVICE_LEGEND.map((e) => (
          <li key={e.id} className="flex items-center gap-2 text-xs" data-legend={e.id}>
            <span aria-hidden className="inline-block h-3 w-6 rounded-sm border" style={{ backgroundColor: materialOf(e.materialId).color }} />
            <span className="min-w-0 flex-1">{e.label}</span>
            <span className="tabular-nums text-muted-foreground">{counts.get(e.id) ?? 0}</span>
          </li>
        ))}
      </ul>
      <details className="rounded-lg border p-2 text-xs" data-testid="service-settings">
        <summary className="cursor-pointer font-medium">Routing settings</summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {([["waste", "Waste fall, 1 in"], ["soil", "Soil pipe fall, 1 in"], ["drain", "Drain fall, 1 in"]] as const).map(([key, label]) => (
            <label key={key} className="block">{label}<input type="number" min={20} max={200} step={5} value={rules.services.fall[key]} data-testid={`fall-${key}`} onChange={(e) => setFall(key, Number(e.target.value))} className="mt-0.5 h-9 w-full rounded border px-2" /></label>
          ))}
          {([["coldHeight", "Cold lane height, mm"], ["hotHeight", "Hot lane height, mm"], ["switchHeight", "Switch height, mm"], ["socketHeight", "Socket height, mm"], ["boardHeight", "Board height, mm"]] as const).map(([key, label]) => (
            <label key={key} className="block">{label}<input type="number" min={100} max={2200} step={10} value={rules.services[key]} data-testid={`setting-${key}`} onChange={(e) => set({ [key]: Number(e.target.value) })} className="mt-0.5 h-9 w-full rounded border px-2" /></label>
          ))}
        </div>
        <p className="mt-1 text-muted-foreground">Falls are kept between 1 in 20 and 1 in 200. The model is redrawn from these.</p>
      </details>
      <p className="text-xs text-muted-foreground">Tap any pipe, conduit or fitting to see its system, where it starts and ends, and how it is fixed. Use the cut-away to look inside a wall.</p>
    </Section>
  );
}

function legendOf(c: ComponentRecord): string {
  const entry = SERVICE_LEGEND.find((e) => e.kinds?.includes(c.kind)) ?? SERVICE_LEGEND.find((e) => c.service && e.systems.includes(c.service.system));
  return entry?.id ?? "cold";
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold">{title}</p>
      <ul className="list-disc pl-4 text-sm">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}

/** Parts list --------------------------------------------------------------- */

export function PartsPanel({ model, view, selectedId, onPick, hiddenIds, onToggleHidden }: { model: ConstructionModel; view: ViewState; selectedId: string | null; onPick: (id: string) => void; hiddenIds: string[]; onToggleHidden: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [onlyStage, setOnlyStage] = useState(true);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return model.components
      .filter((c) => (!c.variant || (c.variant.group === "roof" && view.options.roofType === c.variant.value)) && (onlyStage ? c.stage <= view.stage && (c.removedAfter === undefined || c.removedAfter >= view.stage) : true))
      .filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.kind.includes(needle) || (c.room ?? "").toLowerCase().includes(needle) || (c.grid ?? "").toLowerCase() === needle || c.id.toLowerCase().includes(needle));
  }, [model, q, onlyStage, view.stage, view.options.roofType]);
  return (
    <div className="space-y-2" data-testid="parts-panel">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search parts, rooms, grid lines" aria-label="Search parts" className="min-h-11 w-full rounded-xl border bg-background pl-9 pr-3 text-sm" />
      </label>
      <label className="flex min-h-9 items-center gap-2 text-xs"><input type="checkbox" checked={onlyStage} onChange={(e) => setOnlyStage(e.target.checked)} /> Only what is built by this stage</label>
      <p className="text-xs text-muted-foreground" data-testid="parts-count">{rows.length} part{rows.length === 1 ? "" : "s"}{rows.length > 120 ? " (first 120 shown — search to narrow)" : ""}</p>
      <ul className="max-h-[50dvh] space-y-0.5 overflow-y-auto" role="listbox" aria-label="Parts">
        {rows.slice(0, 120).map((c) => (
          <li key={c.id} role="option" aria-selected={selectedId === c.id} className={cn("flex items-center gap-1 rounded-lg", selectedId === c.id && "bg-brand/10")}>
            <button type="button" onClick={() => onPick(c.id)} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 px-2 text-left text-xs">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_COLORS[c.category] }} />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">S{c.stage}</span>
            </button>
            <button type="button" aria-label={hiddenIds.includes(c.id) ? `Show ${c.name}` : `Hide ${c.name}`} onClick={() => onToggleHidden(c.id)} className="flex size-10 shrink-0 items-center justify-center text-muted-foreground">{hiddenIds.includes(c.id) ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Layers, categories, storeys ----------------------------------------------- */

export function LayersPanel({ model, view, onView }: { model: ConstructionModel; view: ViewState; onView: (patch: Partial<ViewState>) => void }) {
  const categories = useMemo(() => { const seen = new Set<CategoryId>(); model.components.forEach((c) => seen.add(c.category)); return [...seen]; }, [model]);
  const layers = useMemo(() => { const seen = new Set<LayerId>(); model.components.forEach((c) => seen.add(c.layer)); return LAYER_IDS.filter((l) => seen.has(l)); }, [model]);
  return (
    <div className="space-y-2" data-testid="layers-panel">
      <Section title="Floors">
        <div className="flex flex-wrap gap-1.5">
          {model.storeys.map((s) => {
            const off = view.storeysOff.includes(s.id);
            return <button key={s.id} type="button" aria-pressed={!off} data-storey={s.id} onClick={() => onView({ storeysOff: toggleIn(view.storeysOff, s.id) })} className={cn("min-h-9 rounded-lg border px-3 text-xs font-medium", off ? "text-muted-foreground line-through" : "border-brand bg-brand/10 text-brand")}>{s.name}</button>;
          })}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <button type="button" onClick={() => onView({ storeysOff: [] })} className="min-h-9 rounded-lg border px-3 text-xs">All floors</button>
          {model.storeys.map((s) => (
            <button key={s.id} type="button" onClick={() => onView({ storeysOff: model.storeys.filter((x) => x.index > s.index).map((x) => x.id) })} className="min-h-9 rounded-lg border px-3 text-xs">Up to {s.name}</button>
          ))}
        </div>
      </Section>
      <Section title="Categories">
        <ul className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
          {categories.map((c) => {
            const off = view.categoriesOff.includes(c);
            return (
              <li key={c}><label className="flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm hover:bg-muted"><input type="checkbox" checked={!off} data-category={c} onChange={() => onView({ categoriesOff: toggleIn(view.categoriesOff, c) })} /><span className="size-2.5 rounded-full" style={{ background: CATEGORY_COLORS[c] }} />{CATEGORY_LABELS[c]}</label></li>
            );
          })}
        </ul>
      </Section>
      <Section title="Layers" defaultOpen={false}>
        <p className="text-xs text-muted-foreground">{LAYER_ORDER_NOTE}</p>
        <ul className="space-y-0.5">
          {layers.map((l) => {
            const off = view.layersOff.includes(l);
            return (
              <li key={l} className="flex items-center gap-1">
                <label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-sm hover:bg-muted"><input type="checkbox" checked={!off} data-layer={l} onChange={() => onView({ layersOff: toggleIn(view.layersOff, l) })} />{LAYER_LABELS[l]}</label>
                <button type="button" onClick={() => onView(isolateLayer(view, l))} className="min-h-9 shrink-0 rounded-lg border px-2.5 text-xs">Only this</button>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={() => onView({ layersOff: [], categoriesOff: [], storeysOff: [], hiddenIds: [], isolateId: null, showEmbedded: false })} className="min-h-9 rounded-lg border px-3 text-xs">Show everything</button>
      </Section>
    </div>
  );
}

/** Hands the net quantities to the existing takeoff page, unpriced. */
export function SendToTakeoff({ model, view }: { model: ConstructionModel; view: ViewState }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <button
        type="button"
        data-testid="send-to-takeoff"
        onClick={() => {
          try {
            window.sessionStorage.setItem(HOUSE_TAKEOFF_SESSION_KEY, JSON.stringify(constructionTakeoffPackage(model, view.options)));
            window.location.href = "/takeoff?source=house-design";
          } catch {
            setError("Could not prepare the quantities. Nothing was changed.");
          }
        }}
        className="min-h-11 w-full rounded-xl border bg-brand px-4 text-sm font-semibold text-brand-foreground"
      >Open these quantities in the takeoff page</button>
      <p className="text-[11px] text-muted-foreground">Net quantities with their working and allowances kept apart. No prices are sent; lines with no figure are listed as missing.</p>
      {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

/** Quantities ------------------------------------------------------------------ */

const GROUPINGS: { id: BillGrouping; label: string }[] = [
  { id: "section", label: "By section" },
  { id: "floor", label: "By floor" },
  { id: "stage", label: "By stage" },
  { id: "category", label: "By category" },
];

const BASIS_LABELS: Record<EstimatingRules["reinforcement"]["basis"], string> = {
  ratio: "Estimate from kg of steel per m³ of concrete",
  schedule: "Only an approved bar schedule (no estimate)",
};

const kgOrTonnes = (kg: number) => (kg >= 10000 ? `${f(kg / 1000, 2)} t` : `${f(kg, 0)} kg`);

export function QuantitiesPanel({ model, view, rules, onRules, onHighlight, onPick }: { model: ConstructionModel; view: ViewState; rules: EstimatingRules; onRules: (rules: EstimatingRules) => void; onHighlight: (ids: string[]) => void; onPick: (id: string) => void }) {
  const [scope, setScope] = useState<"stage" | "all" | "loose">("stage");
  const [by, setBy] = useState<BillGrouping>("section");
  const [q, setQ] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const billScope = scope === "loose" ? "loose" : "building";
  const bill = useMemo(() => buildBill(model, view.options, billScope, scope === "stage" ? (c: ComponentRecord) => c.stage <= view.stage : undefined), [model, view.options, billScope, scope, view.stage]);
  const audit = useMemo(() => auditBill(model, view.options, billScope), [model, view.options, billScope]);
  const lines = bill.lines;
  const groups = useMemo(() => groupBill(bill, by), [bill, by]);
  const needle = q.trim().toLowerCase();
  const shownGroups = useMemo(
    () => groups.map((g) => ({ ...g, rows: g.rows.filter((r) => (!missingOnly || r.net === null || r.line.missingItems > 0) && (!needle || `${r.line.ref} ${r.line.description} ${r.line.workItem}`.toLowerCase().includes(needle))) })).filter((g) => g.rows.length > 0),
    [groups, missingOnly, needle],
  );
  const shownLines = useMemo(() => [...new Map(shownGroups.flatMap((g) => g.rows.map((r) => [r.line.ref, r.line] as const))).values()], [shownGroups]);
  const missing = missingData(lines);
  const copyCsv = () => {
    const rows = [["Ref", "Section", "Work item", "Description", "Net quantity", "Unit", "Status", "Allowance %", "Allowance quantity", "Components", "Formula"], ...shownLines.map((l) => [l.ref, l.section, l.workItem, l.description, l.net ?? "", l.unit, l.status, l.allowancePercent ?? "", l.allowanceQuantity ?? "", l.componentIds.length, l.formulas[0] ?? ""])];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    void navigator.clipboard?.writeText(csv);
  };
  const setRatio = (workItem: string, value: number) => onRules({ ...rules, reinforcement: { ...rules.reinforcement, ratios: { ...rules.reinforcement.ratios, [workItem]: value } } });
  return (
    <div className="space-y-2" data-testid="quantities-panel">
      <div className="rounded-xl border bg-card p-3 text-xs text-muted-foreground">
        Read off the model: change the building and every line follows. Net quantities only; allowances for waste are kept in their own column, and no price appears here. Each line says where it comes from, and a line with no figure says what is missing.
      </div>
      <Segmented label="Quantity scope" value={scope} onChange={setScope} options={[{ id: "stage", label: "Up to this stage" }, { id: "all", label: "Whole building" }, { id: "loose", label: "Loose furniture" }]} />
      <Segmented label="Group the bill" value={by} onChange={setBy} options={GROUPINGS} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter quantities" placeholder="Filter lines" className="min-h-10 w-full rounded-xl border bg-background pl-9 pr-3 text-sm" /></label>
        <label className="flex min-h-10 items-center gap-1.5 text-xs"><input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />Missing data only</label>
      </div>
      <details className="rounded-xl border bg-card p-3 text-xs" data-testid="quantity-rules">
        <summary className="cursor-pointer font-semibold">Rules the quantities follow</summary>
        <div className="mt-2 space-y-2">
          <label className="flex flex-wrap items-center gap-2">Openings in wall areas:
            <select aria-label="Opening deduction rule" value={rules.openingDeduction} onChange={(e) => onRules({ ...rules, openingDeduction: e.target.value as EstimatingRules["openingDeduction"] })} className="min-h-9 rounded-lg border bg-background px-2 text-xs">
              <option value="over-threshold">deduct those over {rules.openingThresholdM2} m²</option>
              <option value="all">deduct all</option>
              <option value="none">deduct none</option>
            </select>
          </label>
          <label className="flex flex-wrap items-center gap-2">Reinforcement:
            <select aria-label="Reinforcement rule" value={rules.reinforcement.basis} onChange={(e) => onRules({ ...rules, reinforcement: { ...rules.reinforcement, basis: e.target.value as EstimatingRules["reinforcement"]["basis"] } })} className="min-h-9 min-w-0 max-w-full rounded-lg border bg-background px-2 text-xs">
              {(Object.keys(BASIS_LABELS) as (keyof typeof BASIS_LABELS)[]).map((b) => <option key={b} value={b}>{BASIS_LABELS[b]}</option>)}
            </select>
          </label>
          {rules.reinforcement.basis === "ratio" ? (
            <div data-testid="steel-ratios">
              <p className="mb-1 text-muted-foreground">kg of steel for each m³ of concrete (examples: the structural design replaces them)</p>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
                {Object.entries(rules.reinforcement.ratios).map(([workItem, ratio]) => (
                  <li key={workItem}><label className="flex items-center justify-between gap-2">{workItem.replace("concrete.", "")}<input type="number" min={0} max={400} step={5} value={ratio} data-testid={`ratio-${workItem.replace("concrete.", "")}`} onChange={(e) => setRatio(workItem, Math.max(0, Number(e.target.value) || 0))} className="h-8 w-16 rounded border px-1.5 text-right" /></label></li>
                ))}
              </ul>
            </div>
          ) : <p className="text-muted-foreground">Steel stays without a figure until a bar schedule is approved.</p>}
        </div>
      </details>
      <div className={cn("rounded-xl border p-3 text-xs", audit.ok ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-red-300 bg-red-50 text-red-950")} data-testid="bill-audit" data-ok={audit.ok ? "true" : "false"} data-omissions={audit.omissions.length} data-duplicates={audit.duplicates.length}>
        <p className="font-semibold">{audit.ok ? "Checked against the model: nothing left out, nothing counted twice" : "The bill does not agree with the model"}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>{audit.counted} components checked: {audit.omissions.length} left out of the bill, {audit.duplicates.length} counted twice, {audit.exempt.length} not bought (props, setting-out marks, temporary works).</li>
          <li>Concrete: {f(audit.concrete.counted, 2)} m³ billed of {f(audit.concrete.drawn, 2)} m³ drawn{audit.concrete.overlap > 0.005 ? `; ${f(audit.concrete.overlap, 2)} m³ is where members overlap, billed once` : ""}.</li>
          <li>{audit.reinforcement.basis === "ratio" ? `Steel: ${kgOrTonnes(audit.reinforcement.counted)} billed${audit.reinforcement.expected !== null ? ` against ${kgOrTonnes(audit.reinforcement.expected)} from the rule` : ""}; ${audit.reinforcement.unreinforced.length} members without steel.` : `Steel: ${audit.reinforcement.withoutFigure} line items wait for an approved bar schedule.`}</li>
        </ul>
        {!audit.ok ? <ul className="mt-1 list-disc space-y-0.5 pl-4">{[...audit.omissions.slice(0, 4).map((o) => `Left out: ${o.name} (${o.kind})`), ...audit.duplicates.slice(0, 4).map((d) => `Twice: ${d.description}`), ...audit.concrete.over.slice(0, 3).map((o) => `More concrete than drawn: ${o.componentId}`)].map((t) => <li key={t}>{t}</li>)}</ul> : null}
      </div>
      {missing.length ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900" data-testid="missing-data">
          <p className="font-semibold">{missing.length} line{missing.length === 1 ? "" : "s"} cannot be quantified yet</p>
          <ul className="mt-1 list-disc pl-4">{missing.slice(0, 6).map((l) => <li key={l.workItem}>{l.description}: {l.formulas[0]}</li>)}</ul>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground" data-testid="quantity-count">{shownLines.length} line{shownLines.length === 1 ? "" : "s"} from {new Set(shownLines.flatMap((l) => l.componentIds)).size} components</p>
      {shownGroups.map((group) => (
        <section key={group.key} className="rounded-xl border bg-card" data-section={by === "section" ? group.key : undefined} data-group={group.key} data-grouping={by}>
          <h3 className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h3>
          <ul>
            {group.rows.map((row) => {
              const l = row.line;
              const key = `${group.key}|${l.ref}`;
              const isOpen = open === key;
              const partOnly = by !== "section";
              return (
                <li key={key} className="border-b last:border-b-0" data-work-item={l.workItem} data-status={row.status} data-ref={l.ref}>
                  <button type="button" onClick={() => { setOpen(isOpen ? null : key); onHighlight(isOpen ? [] : row.componentIds); }} aria-expanded={isOpen} className="flex min-h-12 w-full items-start gap-2 px-3 py-2 text-left">
                    <span className="min-w-0 flex-1"><span className="block text-sm leading-tight"><span className="mr-1.5 font-mono text-[11px] text-muted-foreground">{l.ref}</span>{l.description}</span><span className="block text-[11px] text-muted-foreground">{row.parts.length} item{row.parts.length === 1 ? "" : "s"} · {row.componentIds.length} component{row.componentIds.length === 1 ? "" : "s"}{partOnly && row.net !== l.net ? ` · ${f(l.net, 3)} ${l.unit} in all` : ""}</span></span>
                    <span className="shrink-0 text-right"><span className="block text-sm font-semibold tabular-nums">{row.net === null ? "no figure" : `${f(row.net, 3)} ${l.unit}`}</span>{row.allowance !== null ? <span className="block text-[10px] text-muted-foreground">+ allowance {l.allowancePercent !== null ? `${l.allowancePercent}% ` : ""}{f(row.allowance, 3)}</span> : null}<StatusBadge status={row.status} /></span>
                  </button>
                  {isOpen ? (
                    <div className="space-y-1.5 px-3 pb-3 text-xs">
                      {l.formulas.map((fm) => <p key={fm} className="break-words rounded bg-muted p-1.5">{fm}</p>)}
                      {l.rooms.length ? <p><span className="font-semibold">Rooms: </span>{l.rooms.slice(0, 12).join(", ")}{l.rooms.length > 12 ? "…" : ""}</p> : null}
                      <p><span className="font-semibold">Floors: </span>{[...new Set(row.parts.map((p) => bill.floors.find((fl) => fl.key === p.floor)?.name ?? p.floor))].join(", ")}</p>
                      <p><span className="font-semibold">Stages: </span>{[...new Set(row.parts.map((p) => p.stage))].sort((a, b) => a - b).map((s) => `${s}. ${STAGE_BY_ID[s].short}`).join(", ")}</p>
                      <p><span className="font-semibold">Material: </span>{l.materialSpecs.slice(0, 4).join(", ")}</p>
                      {l.allowanceRules.length ? <p><span className="font-semibold">Allowance: </span>{l.allowanceRules.join("; ")}</p> : null}
                      {l.assumptions.length ? <p><span className="font-semibold">Assumes: </span>{l.assumptions.join(" ")}</p> : null}
                      {l.exclusions.length ? <p><span className="font-semibold">Excludes: </span>{l.exclusions.join(", ")}</p> : null}
                      <p className="text-muted-foreground">Prices are on the Estimate tab.</p>
                      <div className="flex flex-wrap gap-1">{row.componentIds.slice(0, 6).map((id) => <button key={id} type="button" onClick={() => onPick(id)} className="max-w-48 truncate rounded-full border px-2 py-1 text-[11px]">{model.components.find((c) => c.id === id)?.name ?? id}</button>)}{row.componentIds.length > 6 ? <span className="px-1 py-1 text-[11px] text-muted-foreground">+{row.componentIds.length - 6} more lit up in 3D</span> : null}</div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <button type="button" onClick={copyCsv} className="min-h-10 rounded-xl border px-4 text-sm font-medium">Copy these lines as CSV</button>
      <SendToTakeoff model={model} view={view} />
    </div>
  );
}

/** Estimate: the foundation only ------------------------------------------------ */

export function EstimatePanel({ model, view }: { model: ConstructionModel; view: ViewState }) {
  const lines = useMemo(() => aggregateQuantities(model, view.options), [model, view.options]);
  const draft = useMemo(() => toBoqDraft(lines), [lines]);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2" data-testid="estimate-panel">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
        <p className="font-semibold">Cost estimating is not built yet</p>
        <p className="mt-1 text-xs">This mode shows what is ready for it. There are no rates, no totals and no prices here, and none are guessed.</p>
      </div>
      <Section title="What is ready">
        <ul className="list-disc space-y-1 pl-4 text-sm">
          <li>{draft.length} bill lines have a net quantity, a formula, a source and the components behind them.</li>
          <li>{lines.length - draft.length} line{lines.length - draft.length === 1 ? "" : "s"} still have no figure (reinforcement needs an approved bar schedule).</li>
          <li>Every item carries empty fields for unit material, labour and equipment cost, currency, price source and price date.</li>
          <li>Allowances are separate from net quantities, so waste can be priced on its own.</li>
        </ul>
      </Section>
      <Section title="What is still to build" defaultOpen={false}>
        <ul className="list-disc space-y-1 pl-4 text-sm">
          <li>A price book with a source and date for each rate.</li>
          <li>Rate build-ups for labour, equipment and overheads.</li>
          <li>Totals, contingency and tax, kept visibly apart from net work.</li>
          <li>Supplier quotations and approved bar schedules.</li>
        </ul>
      </Section>
      <button type="button" disabled className="min-h-11 w-full rounded-xl border bg-muted px-4 text-sm font-medium text-muted-foreground">Price this bill (not available yet)</button>
      <button
        type="button"
        onClick={() => { void navigator.clipboard?.writeText(JSON.stringify(draft, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
        className="min-h-11 w-full rounded-xl border px-4 text-sm font-medium"
      >{copied ? "Copied" : "Copy the unpriced draft bill (JSON)"}</button>
      <SendToTakeoff model={model} view={view} />
    </div>
  );
}

export function stageCounts(model: ConstructionModel): Record<StageId, number> {
  const counts = Object.fromEntries(STAGE_IDS.map((s) => [s, 0])) as Record<StageId, number>;
  model.components.forEach((c) => { counts[c.stage] += 1; });
  return counts;
}

