"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Archive, Check, CircleAlert, Trash2 } from "lucide-react";

import {
  addOffcutAction,
  changeOffcutStatusAction,
  deleteOffcutAction,
} from "@/app/studio/offcuts/actions";
import type { OffcutRecord, OffcutStatus } from "../services/offcuts";

const statusLabels: Record<OffcutStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  used: "Used",
  discarded: "Discarded",
};

function mm(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function areaM2(item: Pick<OffcutRecord, "length_mm" | "width_mm" | "quantity">): number {
  return item.length_mm * item.width_mm * item.quantity / 1_000_000;
}

export function OffcutInventory({ initialItems }: { initialItems: OffcutRecord[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, startTransition] = useTransition();


  const available = useMemo(() => items.filter((item) => item.status === "available"), [items]);
  const availableArea = available.reduce((sum, item) => sum + areaM2(item), 0);
  const availablePieces = available.reduce((sum, item) => sum + item.quantity, 0);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const result = await addOffcutAction(data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      form.reset();
      setSuccess("Offcut saved to your inventory.");
      router.refresh();
    });
  }

  function changeStatus(id: string, status: OffcutStatus) {
    setError("");
    setSuccess("");
    startTransition(async () => {
      const result = await changeOffcutStatusAction(id, status);
      if (!result.ok) setError(result.error);
      else {
        setItems((current) => current.map((item) => item.id === id ? { ...item, status } : item));
        setSuccess("Inventory status updated.");
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    if (!window.confirm("Remove this offcut from your inventory?")) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      const result = await deleteOffcutAction(id);
      if (!result.ok) setError(result.error);
      else {
        setItems((current) => current.filter((item) => item.id !== id));
        setSuccess("Offcut removed.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Available pieces</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{availablePieces}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Available area</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{availableArea.toFixed(2)} m²</p>
        </div>
        <div className="col-span-2 rounded-xl border p-4 sm:col-span-1">
          <p className="text-sm text-muted-foreground">Tracked remnants</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{items.length}</p>
        </div>
      </section>

      <section className="rounded-xl border p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Archive className="size-5" aria-hidden="true" />
          <h2 className="font-semibold">Add measured offcut</h2>
        </div>
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={submit}>
          <label className="grid gap-1.5 text-sm">
            <span>Board / material name *</span>
            <input name="boardLabel" required maxLength={120} placeholder="e.g. MDF UV white" className="min-h-11 rounded-lg border bg-background px-3" />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span>Board ID (optional)</span>
            <input name="boardId" maxLength={120} placeholder="Match catalogue ID" className="min-h-11 rounded-lg border bg-background px-3" />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span>Thickness (mm) *</span>
            <input name="thicknessMm" type="number" min="0.01" step="any" required placeholder="18" className="min-h-11 rounded-lg border bg-background px-3" />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span>Length (mm) *</span>
            <input name="lengthMm" type="number" min="0.01" step="any" required placeholder="850.5" className="min-h-11 rounded-lg border bg-background px-3" />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span>Width (mm) *</span>
            <input name="widthMm" type="number" min="0.01" step="any" required placeholder="420.25" className="min-h-11 rounded-lg border bg-background px-3" />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span>Quantity *</span>
            <input name="quantity" type="number" min="1" max="100000" step="1" defaultValue="1" required className="min-h-11 rounded-lg border bg-background px-3" />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span>Storage location</span>
            <input name="location" maxLength={160} placeholder="e.g. Workshop rack B2" className="min-h-11 rounded-lg border bg-background px-3" />
          </label>
          <label className="grid gap-1.5 text-sm sm:col-span-2">
            <span>Notes</span>
            <input name="notes" maxLength={500} placeholder="Finish, grain direction, edge damage…" className="min-h-11 rounded-lg border bg-background px-3" />
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-primary px-5 font-medium text-primary-foreground disabled:opacity-50">
              {pending ? "Saving…" : "Save offcut"}
            </button>
          </div>
        </form>
        {error ? <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</p> : null}
        {success ? <p role="status" className="mt-3 flex items-start gap-2 text-sm text-emerald-700"><Check className="mt-0.5 size-4 shrink-0" />{success}</p> : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Workshop inventory</h2>
          <span className="text-sm text-muted-foreground">{items.length} records</span>
        </div>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <Archive className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 font-medium">No offcuts saved yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add measured remnants here so they stay available when you open another project or device.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => (
              <article key={item.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{item.board_label}</h3>
                    <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                      {mm(item.length_mm)} × {mm(item.width_mm)} × {mm(item.thickness_mm)} mm · Qty {item.quantity}
                    </p>
                    <p className="mt-1 text-sm">{areaM2(item).toFixed(3)} m² total surface area</p>
                    {item.location ? <p className="mt-1 text-sm text-muted-foreground">Location: {item.location}</p> : null}
                    {item.notes ? <p className="mt-1 text-sm text-muted-foreground">{item.notes}</p> : null}
                    {item.source_sheet_number ? <p className="mt-1 text-xs text-muted-foreground">From sheet {item.source_sheet_number}</p> : null}
                  </div>
                  <button type="button" aria-label={"Remove " + item.board_label + " offcut"} onClick={() => remove(item.id)} disabled={pending} className="rounded-lg border p-2 text-muted-foreground hover:text-destructive disabled:opacity-50">
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                  <label className="text-sm text-muted-foreground" htmlFor={"offcut-status-" + item.id}>Status</label>
                  <select id={"offcut-status-" + item.id} value={item.status} disabled={pending} onChange={(event) => changeStatus(item.id, event.target.value as OffcutStatus)} className="min-h-10 rounded-lg border bg-background px-3 text-sm">
                    {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <span className="text-xs text-muted-foreground">Measured dimensions are kept to 0.01 mm.</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
