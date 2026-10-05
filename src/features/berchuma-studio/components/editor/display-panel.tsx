"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, Copy, DoorClosed, Lightbulb, PanelsTopLeft, Plus, Sparkles, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { LengthInput } from "../ui/length-field";
import { Elevation } from "../viewer/elevation";
import {
  accentFor,
  convertDisplay,
  displayRecommendations,
  displayTypeOf,
  facadeVariations,
  mainWardrobe,
  planOf,
  type DisplayType,
} from "../../services/display-ideas";
import {
  addPartialOpening,
  addSideDisplay,
  addZone,
  displayRectOf,
  duplicateBay,
  moveBay,
  moveZone,
  removeCabinet,
  removeNiche,
  removeZone,
  resizeCabinet,
  setBayDisplay,
  setBayWidth,
  setInternalDrawerOptions,
  setSideDisplaySide,
  setZoneCount,
  setZoneHeight,
  setZoneKind,
  sideDisplayOf,
  updateDisplay,
  zoneHeightsOf,
  zoneKindOf,
  type DisplayRef,
  type ZoneKind,
} from "../../services/operations";
import { BOARDS } from "../../types/catalogue";
import { displayLightings, type Bay, type Cabinet, type DesignSpec } from "../../types/spec";

/**
 * Open displays in the panel: editing one, dividing a bay into zones,
 * adding open shelves beside the wardrobe, and the ideas Medosha has for it.
 *
 * Every control goes through an operation, so what is set here is what the
 * cut list cuts — the shelves, the backs, the side panels, the LED strip.
 */

type Change = (next: DesignSpec) => void;

const TYPES: { id: DisplayType; label: string }[] = [
  { id: "side", label: "Side Shelves" },
  { id: "niche", label: "Center Niche" },
  { id: "partial", label: "Partial Opening" },
];

const LIGHTS: Record<(typeof displayLightings)[number], string> = { off: "Off", top: "Top LED", shelf: "Shelf LED", vertical: "Vertical LED" };

/** Boards an open display can be made in: the 18 mm sheets. */
const ACCENTS = BOARDS.filter((board) => board.thickness === 18);

function Chip({ active, onClick, children, label }: { active?: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-1 text-[11px] transition-colors",
        active ? "border-brand bg-brand text-brand-foreground" : "text-muted-foreground hover:border-brand/50",
      )}
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">{children}</div>
    </div>
  );
}

function Panel({ title, icon: Icon, defaultOpen = false, children }: { title: string; icon: typeof Plus; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section aria-label={title} className="rounded-xl border border-white/10 bg-card/50">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <Icon className="size-3.5 text-brand" aria-hidden />
        <span className="flex-1 text-xs font-medium uppercase tracking-wide">{title}</span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? <div className="space-y-2 px-3 pb-3">{children}</div> : null}
    </section>
  );
}

function Action({ icon: Icon, label, onClick, disabled, tone }: { icon: typeof Plus; label: string; onClick: () => void; disabled?: boolean; tone?: "danger" }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[11px] transition-colors disabled:opacity-40",
        tone === "danger" ? "hover:border-destructive hover:text-destructive" : "hover:border-brand hover:bg-brand/5",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </button>
  );
}

function Millimetres({ label, value, onChange, min = 1, max = 99999, disabled }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; disabled?: boolean }) {
  return (
    <Row label={label}>
      <LengthInput label={label} value={value} min={min} max={max} step={10} disabled={disabled} onChange={onChange} />
      <span className="text-[11px] text-muted-foreground">mm</span>
    </Row>
  );
}

function MaterialPicker({ spec, value, onChange, label = "Material" }: { spec: DesignSpec; value: string | undefined; onChange: (boardId: string | null) => void; label?: string }) {
  return (
    <Row label={label}>
      <select
        aria-label={label}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        className="h-8 max-w-[11rem] rounded-md border bg-background/60 px-1.5 text-[11px]"
      >
        <option value="">Same as wardrobe</option>
        {ACCENTS.map((board) => (
          <option key={board.id} value={board.id}>{board.label.replace(/^18 mm /, "")}{board.id === accentFor(spec) ? " (accent)" : ""}</option>
        ))}
      </select>
    </Row>
  );
}

// ---------------------------------------------------------------------------
// OPEN DISPLAY — the selected one
// ---------------------------------------------------------------------------

export function DisplayPanel({ spec, display, onChange, onSelectDisplay }: { spec: DesignSpec; display: DisplayRef; onChange: Change; onSelectDisplay: (ref: DisplayRef | null) => void }) {
  const type = displayTypeOf(spec, display);
  const cabinet = spec.cabinets.find((entry) => entry.id === display.cabinetId);
  const bay = cabinet?.bays.find((entry) => entry.id === display.bayId);
  const rect = displayRectOf(spec, display);
  if (!type || !cabinet || !bay || !rect) return null;
  const section = display.sectionId && bay.fitting.kind === "stack" ? bay.fitting.sections.find((entry) => entry.id === display.sectionId) : null;
  const look = section?.display ?? bay.display ?? { back: true, lighting: "off" as const };
  const shelves = section ? (section.count ?? 1) : bay.fitting.kind === "shelves" ? bay.fitting.count : 0;
  const interiorDepth = cabinet.size.depth - spec.carcass.backBoard.thickness;
  const side = type === "side" ? sideDisplayOf(spec, cabinet.id) : null;
  const zones = section ? zoneHeightsOf(spec, cabinet.id, bay.id) : [];
  const zoneIndex = zones.findIndex((zone) => zone.id === section?.id);
  const update = (patch: Parameters<typeof updateDisplay>[2]) => onChange(updateDisplay(spec, display, patch));
  const convert = (next: DisplayType) => {
    const result = convertDisplay(spec, display, next);
    onChange(result.spec);
    onSelectDisplay(result.ref);
  };
  const remove = () => {
    onSelectDisplay(null);
    if (type === "side") onChange(removeCabinet(spec, cabinet.id));
    else if (type === "niche") onChange(bay.id.startsWith("niche-") && cabinet.bays.length > 1 ? removeNiche(spec, cabinet.id, bay.id) : setBayDisplay(spec, cabinet.id, bay.id, null));
    else onChange(setZoneKind(spec, cabinet.id, bay.id, section!.id, "door"));
  };
  const close = () => {
    onSelectDisplay(null);
    onChange(type === "niche" ? setBayDisplay(spec, cabinet.id, bay.id, null) : setZoneKind(spec, cabinet.id, bay.id, section!.id, "door"));
  };
  const duplicate = () => {
    if (type === "niche") onChange(duplicateBay(spec, cabinet.id, bay.id));
    else if (type === "partial") onChange(addZone(spec, cabinet.id, bay.id, "display"));
    else if (side?.wardrobe) onChange(addSideDisplay(spec, side.wardrobe.id, { side: side.side === "left" ? "right" : "left", width: cabinet.size.width, depth: cabinet.size.depth, shelves, boardId: look.boardId, lighting: look.lighting }));
  };

  return (
    <Panel title="Open display" icon={PanelsTopLeft} defaultOpen>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Display type">
        {TYPES.map((entry) => <Chip key={entry.id} active={type === entry.id} onClick={() => convert(entry.id)}>{entry.label}</Chip>)}
      </div>

      {type === "side" ? (
        <>
          <Millimetres label="Width" value={cabinet.size.width} min={300} max={1200} onChange={(width) => onChange(resizeCabinet(spec, cabinet.id, { width }))} />
          <Millimetres label="Height" value={cabinet.size.height} min={600} max={3000} onChange={(height) => onChange(resizeCabinet(spec, cabinet.id, { height }))} />
          <Millimetres label="Depth" value={cabinet.size.depth} min={200} max={side?.wardrobe?.size.depth ?? 900} onChange={(depth) => onChange(resizeCabinet(spec, cabinet.id, { depth }))} />
        </>
      ) : (
        <>
          <Millimetres label="Width" value={bay.width} min={150} onChange={(width) => onChange(setBayWidth(spec, cabinet.id, bay.id, width))} disabled={cabinet.bays.length < 2} />
          {type === "partial" ? (
            <Millimetres label="Height" value={rect.height} min={100} onChange={(height) => onChange(setZoneHeight(spec, cabinet.id, bay.id, section!.id, height))} />
          ) : (
            <Row label="Height"><span className="text-[11px] tabular-nums">{Math.round(rect.height)} mm, full height</span></Row>
          )}
          <Millimetres label="Depth" value={look.depth ?? interiorDepth} min={150} max={cabinet.size.depth} onChange={(depth) => update({ depth: depth >= interiorDepth ? null : depth })} />
        </>
      )}

      <Row label="Shelves">
        <LengthInput label="Shelves" unit="" value={shelves} min={0} max={20} step={1} onChange={(count) => update({ shelves: count })} />
      </Row>
      <Row label="Back panel">
        <Chip active={look.back} onClick={() => update({ back: !look.back })} label="Back panel">{look.back ? "ON" : "OFF"}</Chip>
      </Row>
      <MaterialPicker spec={spec} value={look.boardId} onChange={(boardId) => update({ boardId })} />
      <Row label="Lighting">
        {displayLightings.map((light) => <Chip key={light} active={look.lighting === light} onClick={() => update({ lighting: light })}>{LIGHTS[light]}</Chip>)}
      </Row>

      <Row label="Position">
        {type === "side" ? (
          (["left", "right"] as const).map((end) => <Chip key={end} active={side?.side === end} onClick={() => onChange(setSideDisplaySide(spec, cabinet.id, end))}>{end === "left" ? "Left" : "Right"}</Chip>)
        ) : type === "niche" ? (
          (["left", "center", "right"] as const).map((at) => <Chip key={at} onClick={() => onChange(moveBay(spec, cabinet.id, bay.id, at))}>{at === "left" ? "Left" : at === "center" ? "Center" : "Right"}</Chip>)
        ) : (
          <>
            <Chip label="Move up" onClick={() => onChange(moveZone(spec, cabinet.id, bay.id, section!.id, -1))}><ArrowUp className="size-3" /></Chip>
            <Chip label="Move down" onClick={() => onChange(moveZone(spec, cabinet.id, bay.id, section!.id, 1))}><ArrowDown className="size-3" /></Chip>
          </>
        )}
      </Row>
      {type === "niche" ? (
        <div className="flex gap-1.5">
          <Action icon={ArrowLeft} label="Move left" disabled={cabinet.bays[0]?.id === bay.id} onClick={() => onChange(moveBay(spec, cabinet.id, bay.id, -1))} />
          <Action icon={ArrowRight} label="Move right" disabled={cabinet.bays.at(-1)?.id === bay.id} onClick={() => onChange(moveBay(spec, cabinet.id, bay.id, 1))} />
        </div>
      ) : null}
      {zoneIndex >= 0 ? <p className="text-[10px] text-muted-foreground">Zone {zoneIndex + 1} of {zones.length}, from the top.</p> : null}
      <div className="flex gap-1.5">
        <Action icon={Copy} label="Duplicate" onClick={duplicate} disabled={type === "side" && !side?.wardrobe} />
        {type !== "side" ? <Action icon={DoorClosed} label="Closed door" onClick={close} /> : null}
        <Action icon={Trash2} label="Delete" tone="danger" onClick={remove} />
      </div>
      <p className="text-[10px] text-muted-foreground">Drag the dots on its edges to resize. No door is made over an open display; its shelves, back and light are on the cut list.</p>
      <button type="button" onClick={() => onSelectDisplay(null)} className="w-full rounded-md border px-2 py-1 text-[11px] hover:border-brand">Done</button>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Zones of one bay
// ---------------------------------------------------------------------------

const ZONES: { id: ZoneKind; label: string }[] = [
  { id: "door", label: "Door" },
  { id: "display", label: "Open display" },
  { id: "internal_drawers", label: "Internal drawers" },
  { id: "drawers", label: "Exterior drawers" },
  { id: "shelves", label: "Shelves" },
  { id: "hanging", label: "Hanging" },
  { id: "shoes", label: "Shoe storage" },
];

/** A bay divided top to bottom, each zone its own treatment and height. */
export function ZoneEditor({ spec, cabinet, bay, onChange, onSelectDisplay }: { spec: DesignSpec; cabinet: Cabinet; bay: Bay; onChange: Change; onSelectDisplay: (ref: DisplayRef | null) => void }) {
  if (bay.fitting.kind !== "stack") {
    return (
      <div className="flex gap-1">
        <Action icon={PanelsTopLeft} label="Partial opening" onClick={() => onChange(addPartialOpening(spec, cabinet.id, bay.id))} />
        <Action icon={Plus} label="Divide into zones" onClick={() => onChange(addZone(spec, cabinet.id, bay.id, "door"))} />
      </div>
    );
  }
  const heights = zoneHeightsOf(spec, cabinet.id, bay.id);
  const sections = bay.fitting.sections;
  return (
    <div className="space-y-1" aria-label="Zones">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Zones, top to bottom</span>
      {sections.map((section, index) => {
        const kind = zoneKindOf(section);
        const count = kind === "hanging" ? section.rails ?? 1 : kind === "drawers" || kind === "internal_drawers" ? section.drawers ?? 2 : kind === "door" ? null : section.count ?? 0;
        return (
          <div key={section.id} className="space-y-1 rounded-md border px-1.5 py-1">
            <div className="flex items-center gap-1">
              <select
                aria-label={`Zone ${index + 1}`}
                value={kind}
                onChange={(event) => onChange(setZoneKind(spec, cabinet.id, bay.id, section.id, event.target.value as ZoneKind))}
                className="h-7 min-w-0 flex-1 rounded border bg-background/60 px-1 text-[11px]"
              >
                {ZONES.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
              </select>
              <LengthInput label={`Zone ${index + 1} height`} value={heights[index]?.height ?? 0} min={100} max={99999} onChange={(height) => onChange(setZoneHeight(spec, cabinet.id, bay.id, section.id, height))} className="h-7 w-14 px-1 text-[11px]" />
              <button type="button" aria-label={`Move zone ${index + 1} up`} disabled={index === 0} onClick={() => onChange(moveZone(spec, cabinet.id, bay.id, section.id, -1))} className="text-muted-foreground disabled:opacity-30"><ArrowUp className="size-3" /></button>
              <button type="button" aria-label={`Move zone ${index + 1} down`} disabled={index === sections.length - 1} onClick={() => onChange(moveZone(spec, cabinet.id, bay.id, section.id, 1))} className="text-muted-foreground disabled:opacity-30"><ArrowDown className="size-3" /></button>
              <button type="button" aria-label={`Remove zone ${index + 1}`} onClick={() => onChange(removeZone(spec, cabinet.id, bay.id, section.id))} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3" /></button>
            </div>
            {count !== null || kind === "display" || kind === "internal_drawers" ? (
              <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                {count !== null ? (
                  <>
                    {kind === "hanging" ? "Rails" : kind.includes("drawers") ? "Drawers" : "Shelves"}
                    <LengthInput label={`Zone ${index + 1} count`} unit="" value={count} min={0} max={20} step={1} onChange={(next) => onChange(setZoneCount(spec, cabinet.id, bay.id, section.id, next))} className="h-6 w-10 px-1 text-[10px]" />
                  </>
                ) : null}
                {kind === "display" ? <button type="button" className="ml-auto rounded border px-1.5 py-0.5 hover:border-brand" onClick={() => onSelectDisplay({ cabinetId: cabinet.id, bayId: bay.id, sectionId: section.id })}>Edit display</button> : null}
                {kind === "internal_drawers" ? (
                  <span className="ml-auto flex items-center gap-1">
                    Depth
                    <LengthInput label={`Zone ${index + 1} drawer depth`} value={section.boxDepth ?? 450} min={250} max={700} onChange={(boxDepth) => onChange(setInternalDrawerOptions(spec, { cabinetId: cabinet.id, bayId: bay.id, sectionId: section.id }, { boxDepth }))} className="h-6 w-12 px-1 text-[10px]" />
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {sections.length < 6 ? <Action icon={Plus} label="Add a zone" onClick={() => onChange(addZone(spec, cabinet.id, bay.id))} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Side display, ideas and facade options — for the wardrobe
// ---------------------------------------------------------------------------

export function WardrobeDisplayTools({ spec, cabinet, onChange, onSelect, onSelectDisplay }: { spec: DesignSpec; cabinet: Cabinet; onChange: Change; onSelect: (id: string | null) => void; onSelectDisplay: (ref: DisplayRef | null) => void }) {
  const wardrobe = mainWardrobe(spec, cabinet.id);
  const plan = planOf(spec);
  const [adding, setAdding] = useState(false);
  const [side, setSide] = useState<"left" | "right">(plan.leftEnd === "open" && plan.rightEnd !== "open" ? "left" : "right");
  const [width, setWidth] = useState(450);
  const [depth, setDepth] = useState(wardrobe?.size.depth ?? 600);
  const [shelves, setShelves] = useState(5);
  const ideas = useMemo(() => displayRecommendations(spec, cabinet.id), [spec, cabinet.id]);
  const options = useMemo(() => facadeVariations(spec, cabinet.id), [spec, cabinet.id]);
  const [ideaIndex, setIdeaIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  if (!wardrobe) return null;
  const idea = ideas.length ? ideas[ideaIndex % ideas.length] : null;
  const setPlan = (patch: Partial<typeof plan>) => onChange({ ...spec, wardrobePlan: { ...plan, ...patch } });
  const selectNew = (next: DesignSpec) => {
    onChange(next);
    const added = next.cabinets.find((entry) => !spec.cabinets.some((existing) => existing.id === entry.id));
    if (added) {
      onSelect(added.id);
      onSelectDisplay({ cabinetId: added.id, bayId: added.bays[0]!.id });
    }
  };

  return (
    <>
      {/* The quick option, always in reach: open shelves beside the wardrobe. */}
      <div className="rounded-xl border border-white/10 bg-card/50 p-2">
      {adding ? (
        <div className="space-y-1.5 rounded-lg border p-2" aria-label="Add side display">
          <Row label="Side">
            {(["left", "right"] as const).map((end) => <Chip key={end} active={side === end} onClick={() => setSide(end)}>{end === "left" ? "Left" : "Right"}</Chip>)}
          </Row>
          <Millimetres label="Width" value={width} min={300} max={1200} onChange={setWidth} />
          <Millimetres label="Depth" value={depth} min={200} max={wardrobe.size.depth} onChange={setDepth} />
          <Row label="Shelf count"><LengthInput label="Shelf count" unit="" value={shelves} min={0} max={20} step={1} onChange={setShelves} /></Row>
          <div className="flex gap-1.5">
            <Action icon={Plus} label="Add" onClick={() => { setAdding(false); selectNew(addSideDisplay(spec, wardrobe.id, { side, width, depth, shelves })); }} />
            <Action icon={Trash2} label="Cancel" onClick={() => setAdding(false)} />
          </div>
        </div>
      ) : (
        <Action icon={Plus} label="Add Side Display" onClick={() => setAdding(true)} />
      )}

      </div>

    <Panel title="Open display ideas" icon={Sparkles} defaultOpen={Boolean(spec.wardrobePlan)}>
      <Row label="Design priority">
        {(["storage", "balanced", "decorative"] as const).map((priority) => (
          <Chip key={priority} active={plan.priority === priority} onClick={() => { setPlan({ priority }); setDismissed(false); setIdeaIndex(0); }}>
            {priority === "storage" ? "Maximum Storage" : priority === "balanced" ? "Balanced" : "Decorative"}
          </Chip>
        ))}
      </Row>
      <Row label="Left end">
        {(["wall", "open"] as const).map((end) => <Chip key={end} active={plan.leftEnd === end} onClick={() => setPlan({ leftEnd: end })}>{end === "wall" ? "Wall" : "Open room"}</Chip>)}
      </Row>
      <Row label="Right end">
        {(["wall", "open"] as const).map((end) => <Chip key={end} active={plan.rightEnd === end} onClick={() => setPlan({ rightEnd: end })}>{end === "wall" ? "Wall" : "Open room"}</Chip>)}
      </Row>

      {idea && !dismissed ? (
        <div className="space-y-1.5 rounded-lg border border-brand/40 bg-brand/5 p-2" role="region" aria-label="Recommendation">
          <p className="flex items-center gap-1 text-[12px] font-medium"><Lightbulb className="size-3.5 text-brand" aria-hidden />{idea.question}</p>
          <p className="text-[10px] text-muted-foreground">{idea.detail}</p>
          <div className="h-28 overflow-hidden rounded-md border bg-background" aria-label="Preview"><Elevation spec={idea.spec} /></div>
          <div className="flex gap-1.5">
            <Action icon={Sparkles} label="Apply" onClick={() => { onChange(idea.spec); setIdeaIndex(0); }} />
            <Action icon={ArrowRight} label="Try another" disabled={ideas.length < 2} onClick={() => setIdeaIndex((index) => index + 1)} />
            <Action icon={Trash2} label="No thanks" onClick={() => setDismissed(true)} />
          </div>
        </div>
      ) : plan.priority === "storage" ? (
        <p className="text-[10px] text-muted-foreground">Maximum storage: everything stays behind doors.</p>
      ) : null}

      <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Facade options</span>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((option, index) => (
          <button key={option.id} type="button" title={option.description} onClick={() => onChange(option.spec)} className="space-y-1 rounded-md border p-1 text-left text-[10px] leading-tight transition-colors hover:border-brand">
            <div className="h-16 overflow-hidden rounded bg-background" aria-hidden><Elevation spec={option.spec} /></div>
            <span className="block font-medium">Option {index + 1}</span>
            <span className="block text-muted-foreground">{option.title}</span>
          </button>
        ))}
      </div>
    </Panel>
    </>
  );
}
