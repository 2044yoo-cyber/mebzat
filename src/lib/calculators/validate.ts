import type { Field, Values } from "./types";
import { LENGTH_IN_METRES, toMetres, type LengthUnit } from "./units";

/**
 * Turning what somebody typed into numbers a calculator can use.
 *
 * Everything here is about the same thing: **a calculator must never print a
 * number it cannot stand behind.** `NaN`, `Infinity`, a negative thickness and
 * an empty required box all have to stop at this boundary, because past it they
 * become an answer, and an answer is what somebody orders concrete against.
 *
 * The messages are written for the person, not the programmer. "Enter a width"
 * rather than "ValidationError: field width failed constraint required".
 */

export type FieldState = { raw: string; unit: LengthUnit };
export type FormState = Record<string, FieldState>;

/** Whether a field is currently on screen, given the rest of the form. */
export function fieldVisible(field: Field, state: FormState): boolean {
  if (!field.showWhen) return true;
  const controlling = state[field.showWhen.field]?.raw;
  return controlling !== undefined && field.showWhen.equals.includes(controlling);
}

/**
 * The starting state: defaults where a field has one, blank where it does not.
 *
 * `seed` overrides those defaults and is how a design arriving from Berchuma
 * Studio brings its width with it. Only fields the calculator actually declares
 * are taken from it — an unknown key in a hand-edited URL is ignored rather
 * than becoming a phantom value that `compute` never reads.
 */
export function initialState(fields: Field[], seed?: Record<string, string>): FormState {
  const state: FormState = {};
  for (const field of fields) {
    const unit = field.kind === "length" ? (field.defaultUnit ?? "m") : "m";
    let raw = "";
    if (field.kind === "select") raw = field.defaultValue;
    else if (field.defaultValue !== undefined) raw = String(field.defaultValue);

    const supplied = seed?.[field.id];
    if (supplied !== undefined && supplied.trim() !== "") {
      const parsed = Number(supplied);
      // A select takes the value verbatim if it is one of its options; a number
      // field takes it only if it is a usable one. Neither trusts the URL.
      if (field.kind === "select") {
        if (field.options.some((option) => option.value === supplied)) raw = supplied;
      } else if (Number.isFinite(parsed) && parsed >= 0) {
        raw = supplied;
      }
    }

    // The unit travels with the value, under `<field>.unit`.
    //
    // Without it, reopening a saved calculation silently changes the answer:
    // a thickness saved as "150 mm" comes back as 150 in whatever unit the
    // field defaults to, and 150 metres of concrete is not a rounding error.
    // Checked against the unit table rather than trusted, since it arrives in
    // a URL.
    const suppliedUnit = seed?.[`${field.id}.unit`];
    const resolvedUnit =
      field.kind === "length" && suppliedUnit && suppliedUnit in LENGTH_IN_METRES
        ? (suppliedUnit as LengthUnit)
        : unit;

    state[field.id] = { raw, unit: resolvedUnit };
  }
  return state;
}

export type Validation = { values: Values; errors: Record<string, string> };

/**
 * Validate and convert in one pass.
 *
 * Lengths come out in **metres** whatever the reader picked, so `compute` never
 * has to know about feet. Hidden fields are skipped entirely: a width that is
 * not on screen because the shape is circular must not block the form for being
 * empty.
 */
export function validate(fields: Field[], state: FormState): Validation {
  const values: Values = {};
  const errors: Record<string, string> = {};

  for (const field of fields) {
    if (!fieldVisible(field, state)) continue;

    const entry = state[field.id];
    const raw = (entry?.raw ?? "").trim();

    if (field.kind === "select") {
      values[field.id] = raw || field.defaultValue;
      continue;
    }

    if (raw === "") {
      if (field.optional) {
        values[field.id] = field.defaultValue ?? 0;
      } else {
        errors[field.id] = `Enter a ${field.label.toLowerCase()}.`;
      }
      continue;
    }

    const parsed = Number(raw);

    // `Number("")` is 0 and `Number("12abc")` is NaN — the empty case is handled
    // above, so anything unparseable here is genuinely not a number.
    if (Number.isNaN(parsed)) {
      errors[field.id] = "That is not a number.";
      continue;
    }
    if (!Number.isFinite(parsed)) {
      errors[field.id] = "That number is too large to use.";
      continue;
    }
    if (parsed < 0) {
      errors[field.id] = "This cannot be negative.";
      continue;
    }

    if (field.kind === "number") {
      if (field.integer && !Number.isInteger(parsed)) {
        errors[field.id] = "This has to be a whole number.";
        continue;
      }
      if (field.min !== undefined && parsed < field.min) {
        errors[field.id] = `This has to be at least ${field.min}.`;
        continue;
      }
      if (field.max !== undefined && parsed > field.max) {
        errors[field.id] = `This cannot be more than ${field.max}.`;
        continue;
      }
      values[field.id] = parsed;
      continue;
    }

    if (field.kind === "money") {
      values[field.id] = parsed;
      continue;
    }

    // Length: convert to metres here, once.
    values[field.id] = toMetres(parsed, entry?.unit ?? "m");
  }

  return { values, errors };
}

/**
 * A last guard on the way out.
 *
 * Every number a calculator prints goes through here. If arithmetic managed to
 * produce a `NaN` or an `Infinity` despite validated inputs — a division by a
 * quantity that validated as zero, say — this catches it and prints a dash
 * instead of the word "NaN", which is the one thing a reader must never see.
 */
export function safeText(value: string): string {
  if (value === "NaN" || value === "Infinity" || value === "-Infinity") return "—";
  if (value.includes("NaN") || value.includes("Infinity")) return "—";
  return value;
}
