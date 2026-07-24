"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SpecRow = { key: string; value: string };

/** Key/value specification rows serialized to a hidden JSON input named
 * "specs"; the server action parses this into a jsonb column. */
export function SpecsInput({
  defaultValue = {},
}: {
  defaultValue?: Record<string, string>;
}) {
  const initial = Object.entries(defaultValue).map(([key, value]) => ({
    key,
    value,
  }));
  const [rows, setRows] = useState<SpecRow[]>(
    initial.length > 0 ? initial : [{ key: "", value: "" }],
  );

  function update(index: number, patch: Partial<SpecRow>) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addRow() {
    setRows((prev) => [...prev, { key: "", value: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [{ key: "", value: "" }];
    });
  }

  const serialized = rows.filter((r) => r.key.trim() && r.value.trim());

  return (
    <div className="space-y-2">
      <input type="hidden" name="specs" value={JSON.stringify(serialized)} />
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={row.key}
            onChange={(e) => update(i, { key: e.target.value })}
            placeholder="Attribute (e.g. Material)"
            aria-label="Specification name"
          />
          <Input
            value={row.value}
            onChange={(e) => update(i, { value: e.target.value })}
            placeholder="Value (e.g. Oak)"
            aria-label="Specification value"
          />
          <button
            type="button"
            onClick={() => removeRow(i)}
            aria-label="Remove specification"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="size-4" /> Add specification
      </Button>
    </div>
  );
}
