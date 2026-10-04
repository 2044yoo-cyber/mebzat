/**
 * Years of experience: a number in, "5 yrs." out.
 *
 * The field was a `type="number"` whose value was passed on as typed, and what
 * came back out was whatever had been put in — "5 years", "five", "5+", "since
 * 2019". Three of those four are not numbers and none of them can be sorted,
 * filtered or compared, which is the only reason to store the figure at all.
 *
 * So there are two functions and they are not the same one. `parseYears` is the
 * boundary: it takes anything and returns a number or null. `formatYears` is the
 * display: it takes the number and produces the one wording the whole site uses.
 * Nowhere should be building that string itself — it was being built three
 * different ways, which is how "5 years" and "5 yrs." end up on the same screen.
 */

export const MAX_YEARS = 80;

/**
 * The number of years a value means, or null.
 *
 * Digits are pulled out rather than the whole string rejected, because "5
 * years" is somebody answering the question correctly in the wrong box, and
 * throwing it away to make a point helps nobody. "five" has no digits and is
 * null: guessing at words is how a profile ends up claiming a number nobody
 * typed.
 *
 * Null for empty is the point of the whole function — `Number("")` is 0, and a
 * clamp then turns a blank field into "0 yrs.", which reads as a claim rather
 * than as an unanswered question. That exact bug has already been fixed once in
 * this repository, in the studio's drawer heights.
 */
export function parseYears(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;

  const digits = text.match(/\d+/);
  if (!digits) return null;

  const years = Number.parseInt(digits[0], 10);
  if (!Number.isFinite(years)) return null;
  return Math.min(Math.max(years, 0), MAX_YEARS);
}

/**
 * What the field should hold as somebody types into it.
 *
 * Two digits, because 80 is the ceiling and a third digit can only be a typo or
 * a joke. Leading zeros go, so "007" does not become a profile claiming seven
 * years in a way that looks like a bug.
 */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 2);
}

/**
 * How the figure is written, everywhere it appears.
 *
 * "1 yr." rather than "1 yrs." — the abbreviation still has a singular, and a
 * new joiner's profile saying "1 yrs." is the sort of thing that makes a site
 * look unfinished.
 */
export function formatYears(years: number | null | undefined): string | null {
  if (years === null || years === undefined) return null;
  if (!Number.isFinite(years) || years < 0) return null;
  const whole = Math.floor(years);
  return `${whole} ${whole === 1 ? "yr." : "yrs."}`;
}
