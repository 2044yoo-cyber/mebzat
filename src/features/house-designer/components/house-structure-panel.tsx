"use client";

import { useMemo } from "react";
import { Calculator, Download, HardHat, RefreshCw } from "lucide-react";

import { calculateHouseQuantities, quantityCsv } from "../services/quantities";
import { generatePreliminaryStructure } from "../services/structure";
import type { HouseProject } from "../types/project";

export function HouseStructurePanel({ project, onChange }: { project: HouseProject; onChange: (project: HouseProject) => void }) {
  const quantities = useMemo(() => calculateHouseQuantities(project), [project]);
  const concrete = quantities.filter((item) => item.category === "concrete").reduce((sum, item) => sum + item.quantity, 0);
  const masonry = quantities.find((item) => item.code === "MAS-01")?.quantity ?? 0;
  const wallFinish = quantities.find((item) => item.code === "FIN-01")?.quantity ?? 0;

  function downloadQuantities() {
    const blob = new Blob([quantityCsv(project)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug(project.metadata.title) || "house"}-preliminary-boq.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300"><HardHat className="size-4" /></span>
          <div><h3 className="text-sm font-semibold">Preliminary structure + BOQ data</h3><p className="text-[11px] text-muted-foreground">Select columns and beams from the object inspector to edit them.</p></div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onChange(generatePreliminaryStructure(project))} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs hover:bg-muted"><RefreshCw className="size-3.5" /> Regenerate</button>
          <button type="button" onClick={downloadQuantities} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-medium text-brand-foreground"><Download className="size-3.5" /> BOQ data</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric icon={<HardHat className="size-3.5" />} label="Columns / beams" value={`${project.structuralColumns.length} / ${project.structuralBeams.length}`} />
        <Metric icon={<Calculator className="size-3.5" />} label="Concrete" value={`${format(concrete)} m³`} />
        <Metric label="Wall volume" value={`${format(masonry)} m³`} />
        <Metric label="Wall finishes" value={`${format(wallFinish)} m²`} />
      </div>

      <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-2 text-[11px] leading-4 text-amber-800 dark:text-amber-300">
        Preliminary design suggestions and quantities only. A licensed structural engineer and quantity surveyor must verify sizes, reinforcement, loads, soil conditions and construction quantities.
      </p>
    </section>
  );
}

function Metric({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-lg bg-muted/55 p-2"><p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">{icon}{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{value}</p></div>;
}

function format(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);
}

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
