"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

import { COLORS, parseItemData, type ItemKind } from "@/lib/collab/model";
import type { Item } from "@/lib/collab/queries";
import { cn } from "@/lib/utils";

/**
 * Editing a card's words: its title, text, link, checklist, labels,
 * description and colour. Validated with the same rules the server applies
 * before anything is saved.
 */
export function CardEditor({ item, onSave, onClose }: { item: Item; onSave: (data: Record<string, unknown>) => void; onClose: () => void }) {
  const data = item.data as Record<string, unknown>;
  const [title, setTitle] = useState(String(data.title ?? ""));
  const [text, setText] = useState(String(data.text ?? ""));
  const [url, setUrl] = useState(String(data.url ?? ""));
  const [caption, setCaption] = useState(String(data.caption ?? ""));
  const [description, setDescription] = useState(String(data.description ?? ""));
  const [labels, setLabels] = useState(((data.labels as string[] | undefined) ?? []).join(", "));
  const [color, setColor] = useState(typeof data.color === "string" ? data.color : "");
  const [lines, setLines] = useState<{ id: string; text: string; done: boolean }[]>(((data.items as { id: string; text: string; done: boolean }[] | undefined) ?? []).map((line) => ({ ...line })));
  const [error, setError] = useState<string | null>(null);
  const kind: ItemKind = item.kind;

  const has = (...kinds: ItemKind[]) => kinds.includes(kind);
  const save = () => {
    const next: Record<string, unknown> = {};
    if (has("note", "image", "document", "link", "checklist", "column", "section", "group") && title.trim()) next.title = title.trim();
    if (has("column", "section")) next.title = title.trim() || "Untitled";
    if (has("text", "note", "sticky")) next.text = text;
    if (has("rect", "ellipse") && text) next.text = text;
    if (has("link")) next.url = url.trim();
    if (has("image", "document") && caption.trim()) next.caption = caption.trim();
    for (const key of ["fileName", "mimeType", "page", "fontSize", "fill", "stroke", "strokeWidth", "points", "from", "to", "arrow"]) if (data[key] !== undefined) next[key] = data[key];
    if (has("checklist")) next.items = lines.filter((line) => line.text.trim());
    if (description.trim()) next.description = description.trim();
    const labelList = labels.split(",").map((label) => label.trim()).filter(Boolean).slice(0, 10);
    if (labelList.length) next.labels = labelList;
    if (color && has("text", "note", "sticky", "column", "section")) next.color = color;
    const parsed = parseItemData(kind, next);
    if (!parsed.ok) { setError(parsed.error); return; }
    onSave(parsed.data);
    onClose();
  };

  const field = "mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm font-normal";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Edit card" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <form className="max-h-[90dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-2xl bg-card p-4 shadow-xl sm:rounded-2xl" onSubmit={(event) => { event.preventDefault(); save(); }}>
        <div className="flex items-center"><h3 className="flex-1 font-semibold">Edit {kind === "column" ? "column" : "card"}</h3><button type="button" onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-lg hover:bg-muted"><X className="size-4" /></button></div>
        {has("note", "image", "document", "link", "checklist", "column", "section", "group") ? <label className="block text-sm font-medium">Title<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={has("column", "section", "group") ? 120 : 200} className={field} /></label> : null}
        {has("text", "note", "sticky", "rect", "ellipse") ? <label className="block text-sm font-medium">Text<textarea autoFocus={!has("note")} value={text} onChange={(event) => setText(event.target.value)} rows={5} maxLength={10000} className={field} /></label> : null}
        {has("link") ? <label className="block text-sm font-medium">Link<input type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" required className={field} /></label> : null}
        {has("image", "document") ? <label className="block text-sm font-medium">Caption<input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={1000} className={field} /></label> : null}
        {has("checklist") ? (
          <fieldset className="space-y-1.5"><legend className="text-sm font-medium">Items</legend>
            {lines.map((line, index) => (
              <div key={line.id} className="flex items-center gap-2">
                <input type="checkbox" aria-label="Done" checked={line.done} onChange={(event) => setLines(lines.map((entry, at) => (at === index ? { ...entry, done: event.target.checked } : entry)))} className="size-4" />
                <input value={line.text} aria-label={`Item ${index + 1}`} onChange={(event) => setLines(lines.map((entry, at) => (at === index ? { ...entry, text: event.target.value } : entry)))} maxLength={500} className="h-9 flex-1 rounded-md border bg-background px-2 text-sm" />
                <button type="button" aria-label="Remove item" onClick={() => setLines(lines.filter((_, at) => at !== index))} className="flex size-8 items-center justify-center rounded-md hover:bg-muted"><Trash2 className="size-3.5" /></button>
              </div>
            ))}
            {lines.length < 100 ? <button type="button" onClick={() => setLines([...lines, { id: crypto.randomUUID().slice(0, 8), text: "", done: false }])} className="inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-xs"><Plus className="size-3.5" />Add item</button> : null}
          </fieldset>
        ) : null}
        {!has("connector", "line", "arrow", "freehand") ? (
          <>
            <label className="block text-sm font-medium">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} maxLength={2000} className={field} /></label>
            <label className="block text-sm font-medium">Labels<input value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="kitchen, finishes" className={field} /><span className="text-xs font-normal text-muted-foreground">Separated by commas, up to 10.</span></label>
          </>
        ) : null}
        {has("text", "note", "sticky", "column", "section") ? (
          <fieldset><legend className="text-sm font-medium">Colour</legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <button type="button" aria-label="No colour" aria-pressed={!color} onClick={() => setColor("")} className={cn("size-8 rounded-full border bg-background", !color && "ring-2 ring-brand")} />
              {COLORS.map((value) => <button key={value} type="button" aria-label={`Colour ${value}`} aria-pressed={color === value} onClick={() => setColor(value)} className={cn("size-8 rounded-full border", color === value && "ring-2 ring-brand")} style={{ background: value }} />)}
            </div>
          </fieldset>
        ) : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <div className="flex gap-2"><button type="submit" className="min-h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground">Save</button><button type="button" onClick={onClose} className="min-h-10 rounded-lg border px-4 text-sm">Cancel</button></div>
      </form>
    </div>
  );
}
