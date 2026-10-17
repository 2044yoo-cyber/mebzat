"use client";

import { useRef, useState } from "react";
import { Download, FileDown, FileUp, FolderOpen, Save, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

import type { PriceBook } from "../construction/price-book";
import type { Report } from "../construction/report";
import { reportPdf } from "../construction/report-pdf";
import { reportWorkbook } from "../construction/report-xlsx";
import { deleteStudy, fileStem, listStudies, parseStudyFile, saveStudy, serializeStudy, type StorageLike, type Study } from "../construction/study";

/** What a study is saved to: the browser's own storage, when it will give it. */
function browserStore(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Hands bytes to the browser as a file to save. */
export function download(bytes: Uint8Array | string, filename: string, mime: string): void {
  const blob = new Blob([typeof bytes === "string" ? bytes : bytes.slice().buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** The two documents of a report, as downloads. */
export function downloadReport(kind: "xlsx" | "pdf", report: Report, book: PriceBook, name: string): void {
  const stem = fileStem(name);
  if (kind === "xlsx") download(reportWorkbook(report, book), `${stem}_estimate.xlsx`, XLSX);
  else download(reportPdf(report), `${stem}_estimate.pdf`, "application/pdf");
}

export function ExportButtons({ onExport, disabled, className }: { onExport: (kind: "xlsx" | "pdf") => void; disabled?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)} data-testid="export-buttons">
      <button type="button" data-testid="export-xlsx" disabled={disabled} onClick={() => onExport("xlsx")} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-medium disabled:opacity-50"><Download className="size-4" />Excel</button>
      <button type="button" data-testid="export-pdf" disabled={disabled} onClick={() => onExport("pdf")} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-medium disabled:opacity-50"><FileDown className="size-4" />PDF</button>
    </div>
  );
}

/** Saving a study, opening it again, and the documents made from it. */
export function StudyPanel({ title, name, onName, hasStudy, studyId, onSnapshot, onOpen, onExport, exportDisabled, ownProject }: {
  /** The name the study is offered under: the building's own. */
  title: string;
  /** The name typed, kept by the lab so that it is still there when the panel is closed and opened again. */
  name: string;
  onName: (name: string) => void;
  hasStudy: boolean;
  studyId: string | null;
  /** The study as it is now, under a name (and an id, to replace one saved before). */
  onSnapshot: (name: string, id: string | null) => Study;
  onOpen: (study: Study) => void;
  onExport: (kind: "xlsx" | "pdf") => void;
  exportDisabled: boolean;
  /** A project of the learner's own, which is saved in the editor and not here. */
  ownProject: boolean;
}) {
  // The panel opens after the page has loaded, so the browser's storage can be read as it first renders.
  const [studies, setStudies] = useState<Study[]>(() => { const store = browserStore(); return store ? listStudies(store) : []; });
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [stored] = useState(() => browserStore() !== null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const say = (text: string, ok = true) => setMessage({ text, ok });
  const shownName = name.trim() || title;

  const save = (asNew: boolean) => {
    const store = browserStore();
    const study = onSnapshot(shownName, asNew ? null : studyId);
    if (!store) { say("This browser will not keep studies. Download the study as a file instead.", false); return; }
    const result = saveStudy(store, study);
    if (!result.ok) { say(result.reason, false); return; }
    setStudies(result.studies);
    say(`Saved “${study.name}”. It opens again exactly as it is now: the building, the rules, the prices.`);
  };
  const open = (study: Study) => { onOpen(study); onName(study.name); say(`Opened “${study.name}”.`); };
  const remove = (study: Study) => {
    const store = browserStore();
    if (!store) return;
    const result = deleteStudy(store, study.id);
    if (result.ok) { setStudies(result.studies); say(`Deleted “${study.name}”.`); } else say(result.reason, false);
  };
  const toFile = () => {
    const study = onSnapshot(shownName, studyId);
    download(serializeStudy(study), `${fileStem(study.name)}_study.json`, "application/json");
    say(`Downloaded “${study.name}” as a file.`);
  };
  const fromFile = async (file: File | undefined) => {
    if (!file) return;
    const parsed = parseStudyFile(await file.text());
    if (!parsed.ok) { say(parsed.reason, false); return; }
    open(parsed.study);
  };

  return (
    <div className="space-y-3" data-testid="study-panel">
      <section className="space-y-2 rounded-xl border bg-card p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Save this study</h3>
        {ownProject ? (
          <p className="text-xs text-muted-foreground" data-testid="study-own-project">You are looking at a project of your own: it is saved in the editor, not here. Its bill and cost can still be downloaded below.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">A study keeps what you have set: the building and its size, the structure, the rules the quantities follow, every price and the costs on top. Opening it works the bill and the estimate out again from those.</p>
            <label className="block text-xs">Name
              <input value={name} onChange={(e) => onName(e.target.value)} placeholder={title} aria-label="Study name" data-testid="study-name" maxLength={80} className="mt-0.5 min-h-10 w-full rounded-xl border bg-background px-3 text-sm" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="study-save" disabled={!hasStudy} onClick={() => save(false)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border bg-brand px-3 text-sm font-semibold text-brand-foreground disabled:opacity-50"><Save className="size-4" />{studyId ? "Save changes" : "Save"}</button>
              {studyId ? <button type="button" data-testid="study-save-new" onClick={() => save(true)} className="min-h-10 rounded-xl border px-3 text-sm font-medium">Save as a new study</button> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="study-to-file" onClick={toFile} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-medium"><Download className="size-4" />Download as a file</button>
              <button type="button" data-testid="study-from-file" onClick={() => fileInput.current?.click()} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-medium"><FileUp className="size-4" />Open a file</button>
              <input ref={fileInput} type="file" accept="application/json,.json" aria-label="Open a study file" data-testid="study-file-input" className="sr-only" onChange={(e) => { void fromFile(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          </>
        )}
        {!stored ? <p className="text-xs text-amber-900">This browser will not keep studies; use the file instead.</p> : null}
        {message ? <p role="status" data-testid="study-message" data-ok={message.ok ? "true" : "false"} className={cn("rounded-lg border p-2 text-xs", message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900")}>{message.text}</p> : null}
      </section>

      {!ownProject ? (
        <section className="space-y-1.5 rounded-xl border bg-card p-3" data-testid="study-list">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saved studies ({studies.length})</h3>
          {studies.length === 0 ? <p className="text-xs text-muted-foreground">None yet.</p> : (
            <ul className="space-y-1">
              {studies.map((s) => (
                <li key={s.id} data-study-id={s.id} className={cn("flex items-center gap-2 rounded-lg border p-2", s.id === studyId && "border-brand bg-brand/5")}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" data-testid="study-item-name">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground">{s.building.template} · {s.building.floors} floors · {s.building.length / 1000} × {s.building.width / 1000} m · {s.savedAt.slice(0, 10)}</p>
                  </div>
                  <button type="button" aria-label={`Open ${s.name}`} data-testid="study-open" onClick={() => open(s)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-xs"><FolderOpen className="size-3.5" />Open</button>
                  <button type="button" aria-label={`Delete ${s.name}`} data-testid="study-delete" onClick={() => remove(s)} className="flex size-9 items-center justify-center rounded-lg border"><Trash2 className="size-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="space-y-2 rounded-xl border bg-card p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Download the bill and the cost</h3>
        <p className="text-xs text-muted-foreground">The workbook has a sheet for the bill by section, floor, stage and category, the priced bill, the cost by group, the rates used and the whole price book. The PDF has the same tables to read and print. Both say what is an example and what is missing.</p>
        <ExportButtons onExport={onExport} disabled={exportDisabled} />
        {exportDisabled ? <p className="text-xs text-muted-foreground">Wait for the model to finish updating.</p> : null}
      </section>
    </div>
  );
}
