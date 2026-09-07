"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Copy, Pencil, Trash2 } from "lucide-react";

import { deleteCalculation, duplicateCalculation, renameCalculation } from "@/lib/actions/calculations";
import { calculatorBySlug } from "@/lib/calculators/registry";
import type { SavedCalculation } from "@/lib/calculators/saved";

/**
 * The list, with the four things you can do to a saved calculation.
 *
 * Each row optimistically drops out of the list on delete rather than waiting
 * for a round trip and a revalidation, because the alternative is a row that
 * sits there looking undeleted for a second and gets tapped again.
 */
/**
 * The link back into a saved calculation, carrying its inputs.
 *
 * What was stored is the inputs, not the answer — so reopening one has to put
 * those inputs back in the form, or "Save" saves nothing anybody can use. Each
 * field goes as `<id>=<value>`, and a length also sends `<id>.unit`, because a
 * thickness saved as 150 mm coming back as 150 m is not a rounding error.
 */
function restoreHref(row: SavedCalculation): string {
  const params = new URLSearchParams();
  for (const [id, entry] of Object.entries(row.inputs ?? {})) {
    if (!entry || typeof entry.raw !== "string" || entry.raw === "") continue;
    params.set(id, entry.raw);
    if (typeof entry.unit === "string" && entry.unit) params.set(`${id}.unit`, entry.unit);
  }
  const query = params.toString();
  return query ? `/calculators/${row.slug}?${query}` : `/calculators/${row.slug}`;
}

export function SavedList({ saved }: { saved: SavedCalculation[] }) {
  const [rows, setRows] = useState(saved);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();

  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const spec = calculatorBySlug(row.slug);
        return (
          <li key={row.id} className="rounded-2xl border p-4">
            {editing === row.id ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = draft.trim();
                  if (!name) return;
                  setRows((prev) => prev.map((one) => (one.id === row.id ? { ...one, name } : one)));
                  setEditing(null);
                  start(async () => {
                    await renameCalculation(row.id, name);
                  });
                }}
                className="flex flex-wrap gap-2"
              >
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  autoFocus
                  aria-label="New name"
                  className="h-10 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm"
                />
                <button type="submit" className="h-10 rounded-xl border px-3 text-sm font-medium hover:bg-muted">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="h-10 rounded-xl px-3 text-sm text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={restoreHref(row)}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {row.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {spec?.title.replace(" Calculator", "") ?? row.slug}
                    {row.headline ? ` · ${row.headline}` : ""}
                    {" · "}
                    {new Date(row.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(row.id);
                      setDraft(row.name);
                    }}
                    aria-label={`Rename ${row.name}`}
                    className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const result = await duplicateCalculation(row.id);
                        if (result.ok) {
                          setRows((prev) => [
                            { ...row, id: result.id, name: `${row.name} (copy)` },
                            ...prev,
                          ]);
                        }
                      })
                    }
                    aria-label={`Duplicate ${row.name}`}
                    className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Copy className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRows((prev) => prev.filter((one) => one.id !== row.id));
                      start(async () => {
                        await deleteCalculation(row.id);
                      });
                    }}
                    aria-label={`Delete ${row.name}`}
                    className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
