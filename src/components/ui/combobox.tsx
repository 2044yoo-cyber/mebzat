"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A text field that suggests as you type.
 *
 * Built here rather than reached for, because the thing this replaces is a
 * `<select>` with 133 options in it and the requirement is specific: typing
 * three letters has to narrow it, and a name the list has never heard of has
 * to be addable anyway. A plain listbox does the first and refuses the second;
 * a plain text input does the second and gives no help with the first.
 *
 * Filtering is the caller's job. This component renders the options it is
 * handed for the query it reports, which keeps the ranking — the part with
 * actual rules in it — testable without a DOM.
 *
 * ## Why pointerdown and not click
 *
 * The list closes on blur, and blur fires before click. Selecting an option
 * with the mouse therefore closed the list and selected nothing. `pointerdown`
 * with `preventDefault` stops the input losing focus at all, which is also
 * what keeps the on-screen keyboard up on a phone between one selection and
 * the next.
 */

export type ComboboxOption = {
  value: string;
  label: string;
  /** Shown dimmed after the label — a sub-city, a region, a language's script. */
  hint?: string | null;
};

export function Combobox({
  query,
  onQueryChange,
  options,
  onSelect,
  onAddCustom,
  selected,
  placeholder,
  emptyText = "No match",
  id,
  className,
  autoFocus,
  clearOnSelect = false,
  "aria-labelledby": ariaLabelledBy,
}: {
  query: string;
  onQueryChange: (next: string) => void;
  options: ComboboxOption[];
  onSelect: (option: ComboboxOption) => void;
  /** Offered when the query matches nothing the list knows. */
  onAddCustom?: ((value: string) => void) | null;
  /** Values already chosen, ticked in the list. */
  selected?: readonly string[];
  placeholder?: string;
  emptyText?: string;
  id?: string;
  className?: string;
  autoFocus?: boolean;
  /** A multi-select empties the box after each pick; a single-select keeps it. */
  clearOnSelect?: boolean;
  "aria-labelledby"?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-list`;

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const chosen = new Set(selected ?? []);
  const known = options.some(
    (option) => option.label.toLowerCase() === query.trim().toLowerCase(),
  );
  const canAdd = Boolean(onAddCustom) && query.trim().length > 0 && !known;
  const rows = canAdd ? options.length + 1 : options.length;

  /**
   * The highlighted row, clamped as it is read rather than corrected after the
   * fact.
   *
   * The list changes under the highlight on every keystroke, and pointing at
   * row 7 of a three-row list selects nothing on Enter. Doing this in an effect
   * would mean one render where the highlight is out of range and `choose`
   * could run against it, on top of the cascading render the effect costs.
   */
  const active = highlight >= rows ? 0 : highlight;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function choose(index: number) {
    if (canAdd && index === options.length) {
      onAddCustom?.(query.trim());
    } else {
      const option = options[index];
      if (!option) return;
      onSelect(option);
    }
    if (clearOnSelect) onQueryChange("");
    setOpen(false);
    setHighlight(0);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (rows === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((current) => ((current >= rows ? 0 : current) + step + rows) % rows);
      return;
    }
    if (event.key === "Enter" && open && rows > 0) {
      event.preventDefault();
      choose(active);
      return;
    }
    if (event.key === "Escape" && open) {
      // Not `stopPropagation`: a combobox inside a dialog should close the
      // list first and leave the dialog alone, and that is what this does —
      // but only because the dialog listens on the document and this handler
      // runs first.
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-labelledby={ariaLabelledBy}
          aria-activedescendant={
            open && rows > 0 ? `${inputId}-option-${active}` : undefined
          }
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={query}
          placeholder={placeholder}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-h-11 w-full rounded-lg border border-input bg-transparent px-3 pr-9 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand sm:text-sm"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          data-no-press
          onPointerDown={(event) => {
            event.preventDefault();
            setOpen((current) => !current);
          }}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground"
        >
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
          />
        </button>
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto overscroll-contain rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${inputId}-option-${index}`}
              role="option"
              aria-selected={chosen.has(option.value)}
              onPointerDown={(event) => {
                event.preventDefault();
                choose(index);
              }}
              onPointerEnter={() => setHighlight(index)}
              className={cn(
                "flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2.5 text-sm",
                index === active && "bg-accent text-accent-foreground",
              )}
            >
              <Check
                className={cn(
                  "size-4 shrink-0",
                  chosen.has(option.value) ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.hint && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {option.hint}
                </span>
              )}
            </li>
          ))}

          {canAdd && (
            <li
              id={`${inputId}-option-${options.length}`}
              role="option"
              aria-selected={false}
              onPointerDown={(event) => {
                event.preventDefault();
                choose(options.length);
              }}
              onPointerEnter={() => setHighlight(options.length)}
              className={cn(
                "flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2.5 text-sm",
                active === options.length && "bg-accent text-accent-foreground",
              )}
            >
              <span className="truncate">
                Add <span className="font-medium">{query.trim()}</span>
              </span>
            </li>
          )}

          {options.length === 0 && !canAdd && (
            <li className="px-2.5 py-2 text-sm text-muted-foreground">
              {emptyText}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
