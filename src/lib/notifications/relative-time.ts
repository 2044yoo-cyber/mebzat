/**
 * "2 min ago", in whichever language the reader is in.
 *
 * `Intl.RelativeTimeFormat` rather than a hand-rolled ladder of ifs, because
 * the ladder has to be written again for every language and gets the plural
 * rules wrong in most of them. Amharic and Afaan Oromo are not exceptions to
 * that; they are the reason for it.
 *
 * The unit is chosen here rather than left to the formatter, which has no
 * opinion: 90 seconds should read as "1 minute ago" and not "90 seconds ago",
 * and 40 days as "1 month ago" and not "40 days ago".
 */

const MINUTE = 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const WEEK = DAY * 7;
const MONTH = DAY * 30;
const YEAR = DAY * 365;

/**
 * The locale each supported language formats in.
 *
 * Kept as a map rather than passing the language straight through, because the
 * two sets are allowed to diverge: a language tag Medosha uses internally is
 * not required to be one ICU knows, and a structurally invalid tag makes
 * `Intl.RelativeTimeFormat` throw rather than fall back.
 *
 * This and the try/catch below guard the same hazard from two sides, so no
 * single change to either can be caught by a test — deleting one leaves the
 * other holding. Both stay: the map is the intent, the catch is the net, and a
 * runtime shipped without data for a locale is a real thing that this map
 * alone would not survive.
 */
const LOCALES: Record<string, string> = { en: "en", am: "am", om: "om" };

export function relativeTime(
  iso: string,
  language: string,
  now: Date = new Date(),
): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  // A browser clock a few seconds ahead of the server would otherwise produce
  // "in 3 seconds" for something that has already happened, which reads as a
  // bug rather than as clock skew.
  const elapsed = Math.max(
    Math.round((now.getTime() - then.getTime()) / 1000),
    0,
  );

  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] =
    elapsed < MINUTE
      ? [elapsed, "second"]
      : elapsed < HOUR
        ? [Math.floor(elapsed / MINUTE), "minute"]
        : elapsed < DAY
          ? [Math.floor(elapsed / HOUR), "hour"]
          : elapsed < WEEK
            ? [Math.floor(elapsed / DAY), "day"]
            : elapsed < MONTH
              ? [Math.floor(elapsed / WEEK), "week"]
              : elapsed < YEAR
                ? [Math.floor(elapsed / MONTH), "month"]
                : [Math.floor(elapsed / YEAR), "year"];

  let formatter: Intl.RelativeTimeFormat;
  try {
    // `numeric: "auto"` gives "yesterday" rather than "1 day ago" where the
    // language has a word for it, and the number where it does not.
    formatter = new Intl.RelativeTimeFormat(LOCALES[language] ?? "en", {
      numeric: "auto",
      style: "short",
    });
  } catch {
    // A runtime without data for this locale throws on construction. A
    // timestamp in English beats a blank line where a timestamp should be.
    formatter = new Intl.RelativeTimeFormat("en", {
      numeric: "auto",
      style: "short",
    });
  }

  return formatter.format(-value, unit);
}
