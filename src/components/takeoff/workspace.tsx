"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, FileUp, Layers, Ruler, Table2 } from "lucide-react";

import dynamic from "next/dynamic";

import { PlanView, type PlanEntity } from "@/components/takeoff/plan-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildBoq, itemFromQuantity, type Boq } from "@/lib/takeoff/boq";
import { elementsFromDxf, parseDxf, type DxfModel } from "@/lib/takeoff/dxf/parse";
import { elementsFromIfc, lengthScale } from "@/lib/takeoff/ifc/elements";
import { geometryFromIfc, type Mesh as IfcMesh } from "@/lib/takeoff/ifc/geometry";
import { parseIfc } from "@/lib/takeoff/ifc/parse";
import { grossArea, netArea, volume, type Quantity } from "@/lib/takeoff/measure";
import {
  ElementIndex,
  sourceLabel,
  type BuildingElement,
  type DataSource,
} from "@/lib/takeoff/model";
import {
  applyEdit,
  computeLine,
  refreshCandidates,
  resetPrice,
  totalEstimate,
  type EstimateChange,
  type EstimateLine,
} from "@/lib/pricing/estimate";
import type { PriceCandidate } from "@/lib/pricing/resolve";
import { cn } from "@/lib/utils";

/**
 * Three.js and the whole viewer stay out of the first load.
 *
 * Somebody arriving at this page has not chosen a file yet, and most of them
 * never open an IFC at all — shipping a 3D renderer to them costs a slower page
 * for nothing. It arrives when a model with drawable geometry does.
 */
const ModelView = dynamic(
  () => import("@/components/takeoff/model-view").then((m) => m.ModelView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center rounded-xl border text-sm text-muted-foreground">
        Loading the viewer…
      </div>
    ),
  },
);

/**
 * The takeoff workspace.
 *
 * Drop an IFC or a DXF and get the chain: elements, measurements with their
 * working shown, a bill, and a cost you can argue with. Everything runs in the
 * browser — the parsers are pure functions and the file never leaves the
 * machine, which is the right default for somebody's unpublished drawings.
 *
 * ## The three panes are one thing
 *
 * Selecting a wall in the plan filters the takeoff and lights its bill lines.
 * Selecting a bill line lights every element behind it, including the openings
 * deducted from them. That is `elementIds` threaded from measurement to item,
 * used as a highlight set in both directions — the traceability requirement,
 * made visible rather than described.
 */

type Loaded = {
  name: string;
  format: "ifc" | "dxf";
  elements: BuildingElement[];
  /** Vector geometry, from a DXF. */
  plan: PlanEntity[];
  /** Solids, from an IFC's swept shapes. */
  meshes: IfcMesh[];
  warnings: string[];
  levels: string[];
};

type Tab = "model" | "takeoff" | "boq";

/** A default rate per unit, so a bill arrives priced rather than empty. */
const STARTING_RATES: Record<string, number> = { "m²": 850, "m³": 7800, m: 400, pc: 250 };

export function TakeoffWorkspace() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("model");

  const [selected, setSelected] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<string | null>(null);

  const [lines, setLines] = useState<EstimateLine[]>([]);
  const [history, setHistory] = useState<EstimateChange[]>([]);
  const [pricing, setPricing] = useState(false);
  const [priceNote, setPriceNote] = useState<string | null>(null);

  const index = useMemo(
    () => new ElementIndex(loaded?.elements ?? []),
    [loaded],
  );

  /** Everything measurable, with its working. */
  const quantities = useMemo(() => {
    if (!loaded) return [];

    const out: { element: BuildingElement; quantity: Quantity }[] = [];
    for (const element of loaded.elements) {
      const measurement =
        element.kind === "wall"
          ? netArea(element, index)
          : element.kind === "column" || element.kind === "beam"
            ? volume(element)
            : grossArea(element);

      if (measurement) out.push({ element, quantity: measurement });
    }
    return out;
  }, [loaded, index]);

  const boq: Boq = useMemo(
    () =>
      buildBoq(
        loaded?.name ?? "Takeoff",
        quantities.map(({ element, quantity }) =>
          itemFromQuantity(sectionFor(element.kind), describe(element), quantity, {
            rate: STARTING_RATES[quantity.unit] ?? null,
            drawingRef: element.drawingRef,
          }),
        ),
      ),
    [loaded, quantities],
  );

  const load = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);

    try {
      const text = await file.text();
      const isIfc = /\.ifc$/i.test(file.name) || text.startsWith("ISO-10303-21");

      if (isIfc) {
        const model = parseIfc(text);
        const imported = elementsFromIfc(model);

        // The same unit scale the quantities use. Geometry and quantities
        // disagreeing about the unit is a thousand-fold error that shows up
        // only as a building the wrong size on screen.
        const geometry = geometryFromIfc(model, lengthScale(model) ?? 1, [
          "IFCWALL", "IFCWALLSTANDARDCASE", "IFCSLAB", "IFCCOLUMN",
          "IFCBEAM", "IFCDOOR", "IFCWINDOW", "IFCROOF", "IFCFOOTING",
          "IFCSTAIR", "IFCCOVERING", "IFCCURTAINWALL", "IFCRAILING",
        ]);

        setLoaded({
          name: file.name,
          format: "ifc",
          elements: imported.elements,
          plan: [],
          meshes: geometry.meshes,
          warnings: [...imported.warnings, ...geometry.warnings],
          levels: imported.levels,
        });
      } else {
        const model: DxfModel = parseDxf(text);
        const imported = elementsFromDxf(model);

        // The importer says which entity each element came from. Counting kept
        // entities here instead would have to reproduce its skip conditions
        // exactly — a TEXT on the WALL layer matches the rule but yields no
        // element — and one disagreement shifts every id after it onto the
        // wrong line.
        const elementByEntity = new Map<number, string>();
        for (const [id, position] of Object.entries(imported.entityIndexById)) {
          elementByEntity.set(position, id);
        }

        const plan: PlanEntity[] = model.entities.map((entity, position) => ({
          elementId: elementByEntity.get(position) ?? null,
          entity,
        }));

        setLoaded({
          name: file.name,
          format: "dxf",
          elements: imported.elements,
          plan,
          meshes: [],
          warnings: [...imported.warnings, ...model.warnings],
          levels: [],
        });
      }

      setLines([]);
      setHistory([]);
      setSelected(null);
      setActiveItem(null);
      setTab("model");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `That file could not be read: ${caught.message}`
          : "That file could not be read.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * Prices every line against real marketplace listings.
   *
   * Safe to press at any time, including after somebody has edited half the
   * bill: `refreshCandidates` replaces what the market says and leaves every
   * user override exactly where it was. That is the guarantee the estimate
   * engine exists for, and this is the button that would break it if it did not
   * hold.
   */
  const priceFromMarketplace = useCallback(async (current: EstimateLine[]) => {
    if (current.length === 0) return;

    setPricing(true);
    setPriceNote(null);

    try {
      const response = await fetch("/api/pricing/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: current.map((line) => ({
            key: line.id,
            description: line.description,
            unit: line.unit,
          })),
        }),
      });

      const payload = (await response.json()) as {
        results?: { key: string; candidates: PriceCandidate[]; message: string | null }[];
        error?: string;
      };

      if (!response.ok || !payload.results) {
        setPriceNote(payload.error ?? "The marketplace could not be reached.");
        return;
      }

      const byKey = new Map(payload.results.map((entry) => [entry.key, entry]));

      // Counted here rather than inside the updater below. A state updater has
      // to be pure: React calls it twice in development, and a tally
      // incremented inside it reports "6 of 3 lines priced".
      const matched = current.filter((line) => {
        const result = byKey.get(line.id);
        return result !== undefined && result.candidates.length > 0;
      }).length;

      setLines((previous) =>
        previous.map((line) => {
          const result = byKey.get(line.id);
          if (!result || result.candidates.length === 0) return line;
          // Keeps the AI starting rate underneath, so "reset" still has
          // somewhere to fall back to when the marketplace has nothing.
          return refreshCandidates(line, [
            ...result.candidates,
            ...line.candidates.filter((candidate) => candidate.source === "ai"),
          ]);
        }),
      );

      setPriceNote(
        matched === 0
          ? "No exact Marketplace match for any line. Rates are unchanged — pick a product or type a price."
          : `${matched} of ${current.length} lines priced from the Marketplace. Anything you edited was left alone.`,
      );
    } catch {
      setPriceNote("The marketplace could not be reached. Rates are unchanged.");
    } finally {
      setPricing(false);
    }
  }, []);

  /** Builds editable estimate lines from the bill, once. */
  const startEstimate = useCallback(() => {
    setLines(
      boq.sections.flatMap((section) =>
        section.items.map((item) => ({
          id: item.ref,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          candidates: item.rate
            ? [{ source: "ai" as const, price: item.rate, unit: item.unit }]
            : [],
          elementIds: item.elementIds,
        })),
      ),
    );
    setTab("boq");
  }, [boq]);

  // Both handlers compute from the current `lines` rather than from inside a
  // state updater. Calling `setHistory` within a `setLines` updater is a side
  // effect in a function React is allowed to run twice, which duplicates every
  // entry in the change history under StrictMode.
  const edit = useCallback(
    (id: string, field: "unitPrice" | "quantity", value: number) => {
      const target = lines.find((line) => line.id === id);
      if (!target) return;

      const result = applyEdit(target, { field, value } as never);
      setLines((previous) =>
        previous.map((line) => (line.id === id ? result.line : line)),
      );
      setHistory((entries) => [result.change, ...entries].slice(0, 100));
    },
    [lines],
  );

  const reset = useCallback(
    (id: string) => {
      const target = lines.find((line) => line.id === id);
      if (!target) return;

      const result = resetPrice(target, "ai");
      setLines((previous) =>
        previous.map((line) => (line.id === id ? result.line : line)),
      );
      setHistory((entries) => [result.change, ...entries].slice(0, 100));
    },
    [lines],
  );

  /** Elements lit up: whichever bill line is active. */
  const highlighted = useMemo(() => {
    if (!activeItem) return new Set<string>();
    const item = boq.sections
      .flatMap((section) => section.items)
      .find((entry) => entry.ref === activeItem);
    return new Set(item?.elementIds ?? []);
  }, [activeItem, boq]);

  const totals = useMemo(() => totalEstimate(lines), [lines]);

  if (!loaded) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl border bg-muted/40 text-brand">
          <FileUp className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-medium">Take off from a model</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Drop an IFC or DXF. Quantities come from the file, not from a guess,
            and the file stays on your machine.
          </p>
        </div>

        <label className="cursor-pointer">
          <input
            type="file"
            accept=".ifc,.dxf,.txt"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void load(file);
              event.target.value = "";
            }}
          />
          <span className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
            {busy ? "Reading…" : "Choose a file"}
          </span>
        </label>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <p className="max-w-md text-xs text-muted-foreground">
          Revit (.rvt), AutoCAD (.dwg) and SketchUp (.skp) are closed formats and
          cannot be read without a commercial licence. Export as IFC or DXF.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{loaded.name}</h1>
          <p className="text-sm text-muted-foreground">
            {loaded.elements.length} elements ·{" "}
            {loaded.format === "ifc" ? "IFC" : "DXF"} ·{" "}
            {quantities.length} measured
            {loaded.meshes.length > 0 ? ` · ${loaded.meshes.length} drawn in 3D` : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLoaded(null)}>
          Open another
        </Button>
      </header>

      {loaded.warnings.length > 0 && (
        <div className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
          {loaded.warnings.map((warning) => (
            <p key={warning} className="flex gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
              {warning}
            </p>
          ))}
        </div>
      )}

      <nav className="flex gap-1 border-b">
        {(
          [
            ["model", "Model", Layers],
            ["takeoff", "Takeoff", Ruler],
            ["boq", "BOQ & cost", Table2],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              tab === id
                ? "border-brand font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </nav>

      {tab === "model" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="h-[60vh]">
            {loaded.meshes.length > 0 ? (
              <ModelView
                meshes={loaded.meshes}
                selected={selected}
                highlighted={highlighted}
                onSelect={setSelected}
              />
            ) : (
              <PlanView
                entities={loaded.plan}
                selected={selected}
                highlighted={highlighted}
                onSelect={setSelected}
              />
            )}
          </div>
          <ElementList
            elements={loaded.elements}
            selected={selected}
            highlighted={highlighted}
            onSelect={setSelected}
          />
        </div>
      )}

      {tab === "takeoff" && (
        <TakeoffSheet
          rows={quantities}
          selected={selected}
          onSelect={setSelected}
        />
      )}

      {tab === "boq" && (
        <div className="space-y-4">
          {lines.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">
                {boq.sections.length === 0
                  ? "Nothing measurable in this model yet."
                  : "Build an editable estimate from the bill. Rates start from Medosha's figures and are yours to change."}
              </p>
              {boq.sections.length > 0 && (
                <Button className="mt-3" onClick={startEstimate}>
                  Start estimate
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pricing}
                  onClick={() => void priceFromMarketplace(lines)}
                >
                  {pricing ? "Pricing…" : "Price from Marketplace"}
                </Button>
                {priceNote && (
                  <p className="text-xs text-muted-foreground">{priceNote}</p>
                )}
              </div>

              <EstimateTable
                lines={lines}
                history={history}
                totals={totals}
                activeItem={activeItem}
                onActivate={setActiveItem}
                onEdit={edit}
                onReset={reset}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ElementList({
  elements,
  selected,
  highlighted,
  onSelect,
}: {
  elements: BuildingElement[];
  selected: string | null;
  highlighted: Set<string>;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="max-h-[60vh] overflow-y-auto rounded-xl border">
      <ul className="divide-y">
        {elements.map((element) => (
          <li key={element.id}>
            <button
              type="button"
              onClick={() => onSelect(element.id === selected ? null : element.id)}
              className={cn(
                "w-full px-3 py-2 text-left text-sm transition-colors",
                element.id === selected
                  ? "bg-brand/10"
                  : highlighted.has(element.id)
                    ? "bg-brand/5"
                    : "hover:bg-muted/50",
              )}
            >
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{element.name}</span>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {element.kind}
                </Badge>
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {element.level ? `${element.level} · ` : ""}
                {element.length
                  ? `${Math.round(element.length.value)} mm`
                  : "no dimensions"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TakeoffSheet({
  rows,
  selected,
  onSelect,
}: {
  rows: { element: BuildingElement; quantity: Quantity }[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Element</th>
            <th className="px-3 py-2 font-medium">Location</th>
            <th className="px-3 py-2 font-medium">Calculation</th>
            <th className="px-3 py-2 text-right font-medium">Quantity</th>
            <th className="px-3 py-2 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ element, quantity }) => (
            <tr
              key={element.id}
              onClick={() => onSelect(element.id === selected ? null : element.id)}
              className={cn(
                "cursor-pointer border-t",
                element.id === selected ? "bg-brand/10" : "hover:bg-muted/40",
              )}
            >
              <td className="px-3 py-2">{element.name}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {element.level ?? element.drawingRef ?? "—"}
              </td>
              {/* The whole point of the takeoff sheet: the sum, in the open. */}
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                {quantity.formula}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {quantity.value.toLocaleString()} {quantity.unit}
              </td>
              <td className="px-3 py-2">
                <SourceBadge source={quantity.source} confidence={quantity.confidence} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EstimateTable({
  lines,
  history,
  totals,
  activeItem,
  onActivate,
  onEdit,
  onReset,
}: {
  lines: EstimateLine[];
  history: EstimateChange[];
  totals: ReturnType<typeof totalEstimate>;
  activeItem: string | null;
  onActivate: (id: string | null) => void;
  onEdit: (id: string, field: "unitPrice" | "quantity", value: number) => void;
  onReset: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 text-right font-medium">Quantity</th>
              <th className="px-3 py-2 text-right font-medium">Rate</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const computed = computeLine(line);
              return (
                <tr
                  key={line.id}
                  onClick={() => onActivate(line.id === activeItem ? null : line.id)}
                  className={cn(
                    "cursor-pointer border-t",
                    line.id === activeItem ? "bg-brand/10" : "hover:bg-muted/40",
                  )}
                >
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {line.id}
                    </span>{" "}
                    {line.description}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {computed.quantity.toLocaleString()} {computed.unit}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      value={computed.unitPrice}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        onEdit(line.id, "unitPrice", Number(event.target.value))
                      }
                      className="w-24 rounded-md border bg-background px-2 py-1 text-right text-sm tabular-nums"
                      aria-label={`Rate for ${line.description}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5">
                      <Badge
                        variant={computed.edited ? "default" : "outline"}
                        className="text-[10px]"
                      >
                        {computed.sourceLabel}
                      </Badge>
                      {computed.edited && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onReset(line.id);
                          }}
                          className="text-[11px] text-muted-foreground underline hover:text-foreground"
                        >
                          reset
                        </button>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {computed.sellingPrice.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-medium">
              <td className="px-3 py-2" colSpan={4}>
                Total
                {totals.unpricedLines > 0 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({totals.unpricedLines} unpriced)
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {totals.sellingPrice.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {history.length > 0 && (
        <details className="rounded-xl border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">
            Change history ({history.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {history.map((change, index) => (
              <li key={`${change.at}-${index}`} className="text-xs text-muted-foreground">
                <span className="font-mono">{change.lineId}</span> ·{" "}
                {change.reset ? `reset to ${change.reset}` : change.field} ·{" "}
                {String(change.from)} → {String(change.to)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SourceBadge({
  source,
  confidence,
}: {
  source: DataSource;
  confidence: number;
}) {
  return (
    <Badge
      variant={source === "bim" ? "secondary" : source === "ai" ? "destructive" : "outline"}
      className="text-[10px]"
      title={`Confidence ${Math.round(confidence * 100)}%`}
    >
      {sourceLabel(source)}
    </Badge>
  );
}

function describe(element: BuildingElement): string {
  const material = element.material ? `${element.material} ` : "";
  return `${material}${element.kind} — ${element.name}`;
}

/** Which BOQ section an element kind belongs in. */
function sectionFor(kind: BuildingElement["kind"]) {
  switch (kind) {
    case "wall":
      return "F" as const;
    case "column":
    case "beam":
    case "slab":
    case "foundation":
      return "C" as const;
    case "door":
    case "window":
      return "I" as const;
    case "roof":
      return "H" as const;
    case "ceiling":
      return "N" as const;
    case "room":
    case "floor":
      return "K" as const;
    default:
      return "A" as const;
  }
}
