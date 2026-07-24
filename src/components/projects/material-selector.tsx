"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MATERIAL_CATEGORIES } from "@/lib/constants/materials";
import { cn } from "@/lib/utils";

/** Selected materials round-trip through a hidden comma-joined input so the
 * existing server action (which splits on commas) is unchanged. */
export function MaterialSelector({
  name = "materials",
  defaultValue = [],
}: {
  name?: string;
  defaultValue?: string[];
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    defaultValue.map((m) => m.trim()).filter(Boolean),
  );
  const [query, setQuery] = useState("");
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>(
    {},
  );

  const q = query.trim().toLowerCase();

  function has(material: string) {
    return selected.some((m) => m.toLowerCase() === material.toLowerCase());
  }

  function add(raw: string) {
    const material = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();
    if (!material || has(material)) return;
    setSelected((prev) => [...prev, material]);
  }

  function remove(material: string) {
    setSelected((prev) =>
      prev.filter((m) => m.toLowerCase() !== material.toLowerCase()),
    );
  }

  function toggle(material: string) {
    if (has(material)) remove(material);
    else add(material);
  }

  function addCustom() {
    if (!query.trim()) return;
    add(query);
    setQuery("");
  }

  // Suggestions filtered by the search query, categories with no match hidden.
  const filteredCategories = useMemo(() => {
    return MATERIAL_CATEGORIES.map((category) => ({
      ...category,
      matches: q
        ? category.materials.filter((m) => m.toLowerCase().includes(q))
        : category.materials,
    })).filter((category) => category.matches.length > 0);
  }, [q]);

  const isKnown = MATERIAL_CATEGORIES.some((c) =>
    c.materials.some((m) => m.toLowerCase() === q),
  );
  const showAddCustom = q.length > 0 && !isKnown && !has(query.trim());

  function isOpen(label: string, index: number) {
    // While searching, expand every category that still has matches.
    if (q) return true;
    return openOverrides[label] ?? index === 0;
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={selected.join(", ")} />

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((material) => (
            <Badge key={material} variant="secondary" className="gap-1 pr-1">
              {material}
              <button
                type="button"
                onClick={() => remove(material)}
                aria-label={`Remove ${material}`}
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Search materials, or type your own and press Enter"
          aria-label="Search or add a material"
        />

        {showAddCustom && (
          <button
            type="button"
            onClick={addCustom}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm transition-colors hover:border-brand hover:bg-brand/5"
          >
            <Plus className="size-4 text-brand" />
            Add <span className="font-medium">&ldquo;{query.trim()}&rdquo;</span>
          </button>
        )}
      </div>

      {filteredCategories.length > 0 ? (
        <div className="divide-y rounded-xl border">
          {filteredCategories.map((category, index) => {
            const open = isOpen(category.label, index);
            return (
              <div key={category.label}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() =>
                    setOpenOverrides((prev) => ({
                      ...prev,
                      [category.label]: !open,
                    }))
                  }
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium"
                >
                  <span className="flex items-center gap-2">
                    <span aria-hidden>{category.emoji}</span>
                    {category.label}
                    <span className="text-xs font-normal text-muted-foreground">
                      {category.matches.length}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      open && "rotate-180",
                    )}
                  />
                </button>
                {open && (
                  <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                    {category.matches.map((material) => {
                      const active = has(material);
                      return (
                        <button
                          key={material}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggle(material)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                            active
                              ? "border-brand bg-brand text-brand-foreground"
                              : "border-border hover:border-brand hover:bg-brand/5",
                          )}
                        >
                          {active && <Check className="size-3" />}
                          {material}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          No matching materials. Press Enter to add &ldquo;{query.trim()}&rdquo;
          as a custom material.
        </p>
      )}
    </div>
  );
}
