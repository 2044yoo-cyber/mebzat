"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

/**
 * Several of something, as chips, chosen by typing.
 *
 * The thing this replaces is a text input whose help said "separate with
 * commas". That is a parser people have to run in their heads, and it fails
 * quietly in both directions: a trailing comma stores an empty language, and a
 * name with a comma in it stores two. Chips make the stored list the list on
 * the screen.
 *
 * The chosen values are posted as one hidden field, still comma-joined,
 * because that is what the server action already parses and changing both ends
 * at once would mean the form and the action could disagree while only one of
 * them was deployed. What goes into that string is now controlled — no chip
 * can contain a comma — which is the part that was actually broken.
 */
export function TokenPicker({
  name,
  value,
  onChange,
  search,
  placeholder,
  emptyText,
  allowCustom = true,
  max = 20,
  labelledBy,
}: {
  name: string;
  value: string[];
  onChange: (next: string[]) => void;
  /**
   * Suggestions for what has been typed so far.
   *
   * A function rather than a ready-made list, because the query lives in this
   * component and lifting it out only to hand it straight back left the
   * caller holding a piece of state it never set.
   */
  search: (query: string) => ComboboxOption[];
  placeholder?: string;
  emptyText?: string;
  allowCustom?: boolean;
  max?: number;
  labelledBy?: string;
}) {
  const [query, setQuery] = useState("");
  const options = search(query);

  function add(entry: string) {
    const clean = entry.replace(/,/g, " ").replace(/\s+/g, " ").trim();
    if (!clean) return;
    if (value.length >= max) return;
    if (value.some((item) => item.toLowerCase() === clean.toLowerCase())) return;
    onChange([...value, clean]);
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={value.join(", ")} />

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((item) => (
            <li key={item}>
              <span
                className={cn(
                  "flex min-h-8 items-center gap-1 rounded-full border border-brand/40 bg-brand/10 py-1 pr-1 pl-2.5 text-sm",
                )}
              >
                {item}
                <button
                  type="button"
                  aria-label={`Remove ${item}`}
                  onClick={() =>
                    onChange(value.filter((entry) => entry !== item))
                  }
                  className="flex size-6 items-center justify-center rounded-full text-muted-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {value.length < max && (
        <Combobox
          query={query}
          onQueryChange={setQuery}
          options={options}
          selected={value}
          clearOnSelect
          onSelect={(option) => add(option.label)}
          onAddCustom={allowCustom ? (entry) => add(entry) : null}
          placeholder={placeholder}
          emptyText={emptyText ?? "No match"}
          aria-labelledby={labelledBy}
        />
      )}
    </div>
  );
}
