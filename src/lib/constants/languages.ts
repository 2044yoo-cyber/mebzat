/**
 * The languages somebody might work in.
 *
 * Ethiopia's own first, in the order a person here would think of them rather
 * than alphabetically — Amharic and Afaan Oromo are what most of this list's
 * users will pick, and burying them between Albanian and Arabic to satisfy a
 * sort is the kind of tidiness that costs a tap. `LANGUAGE_OPTIONS` is what
 * the picker searches; it is sorted, and this grouping is what feeds it.
 *
 * `native` is shown beside the English name because "Afaan Oromo" and "Oromiffa"
 * are the same answer and somebody looking for the second should see the first
 * and recognise it.
 *
 * The list is not exhaustive and is not meant to be — Ethiopia has more than
 * eighty living languages. The picker takes a custom entry for exactly that
 * reason, and a language that turns up often enough in custom entries belongs
 * in this file afterwards.
 */

export type LanguageOption = {
  name: string;
  native?: string;
  /** Ethiopian languages are offered first and marked for the picker's hint. */
  ethiopian?: boolean;
};

const ETHIOPIAN: LanguageOption[] = [
  { name: "Amharic", native: "አማርኛ" },
  { name: "Afaan Oromo", native: "Afaan Oromoo" },
  { name: "Tigrinya", native: "ትግርኛ" },
  { name: "Somali", native: "Soomaali" },
  { name: "Afar", native: "Qafár af" },
  { name: "Sidaamu Afoo", native: "Sidaamu Afoo" },
  { name: "Wolaytta", native: "Wolaytta" },
  { name: "Gurage", native: "ጉራጌ" },
  { name: "Hadiyya", native: "Hadiyyisa" },
  { name: "Kafa", native: "Kafi noono" },
  { name: "Gamo", native: "Gamo" },
  { name: "Gedeo", native: "Gedeuffa" },
  { name: "Kambaata", native: "Kambaatissata" },
  { name: "Silt'e", native: "ስልጥኛ" },
  { name: "Harari", native: "ሀረሪ" },
  { name: "Agaw", native: "Awngi" },
  { name: "Berta", native: "Berta" },
  { name: "Nuer", native: "Thok Nath" },
  { name: "Anuak", native: "Dha-anywaa" },
  { name: "Ge'ez", native: "ግዕዝ" },
];

const OTHER: LanguageOption[] = [
  { name: "English" },
  { name: "Arabic", native: "العربية" },
  { name: "French", native: "Français" },
  { name: "Italian", native: "Italiano" },
  { name: "Mandarin Chinese", native: "中文" },
  { name: "Turkish", native: "Türkçe" },
  { name: "Swahili", native: "Kiswahili" },
  { name: "Hindi", native: "हिन्दी" },
  { name: "Spanish", native: "Español" },
  { name: "German", native: "Deutsch" },
  { name: "Portuguese", native: "Português" },
  { name: "Russian", native: "Русский" },
];

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  ...ETHIOPIAN.map((language) => ({ ...language, ethiopian: true })),
  ...OTHER,
];

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9ሀ-፿]+/g, " ").trim();
}

/**
 * The languages matching what has been typed.
 *
 * Same three tiers as the place search, for the same reason: "am" should offer
 * Amharic before Afaan Oromo, and both before anything that merely contains
 * those two letters. Ethiopian languages break a tie, so an empty box opens on
 * the ones most people here are going to pick.
 */
export function searchLanguages(query: string, limit = 12): LanguageOption[] {
  const text = normalise(query);

  const tier = (language: LanguageOption): number => {
    let best = -1;
    const keep = (value: number) => {
      if (best === -1 || value < best) best = value;
    };
    for (const spelling of [language.name, language.native ?? ""]) {
      const name = normalise(spelling);
      if (!name) continue;
      if (name === text) keep(0);
      else if (name.split(" ").some((word) => word.startsWith(text))) keep(1);
      else if (name.includes(text)) keep(2);
    }
    return best;
  };

  if (!text) return LANGUAGE_OPTIONS.slice(0, limit);

  return LANGUAGE_OPTIONS.map((language) => ({ language, rank: tier(language) }))
    .filter((entry) => entry.rank >= 0)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        Number(Boolean(b.language.ethiopian)) - Number(Boolean(a.language.ethiopian)),
    )
    .slice(0, limit)
    .map((entry) => entry.language);
}

/**
 * The languages a posted field means.
 *
 * Still comma-separated on the wire, because that is what the column and the
 * action have always exchanged and changing both ends at once would let the
 * form and the action disagree while only one of them was deployed. What is
 * new is that this is the only thing that reads that string, so the rules are
 * in one place: blanks dropped, duplicates dropped case-insensitively, each
 * entry trimmed and capped, and the list capped too.
 *
 * A trailing comma used to store an empty language, which then rendered as a
 * stray separator on the public profile and counted towards "languages: filled"
 * in the completion score. That is what `filter(Boolean)` in one caller and not
 * the other buys you.
 */
export function parseLanguages(value: unknown, max = 12): string[] {
  if (typeof value !== "string") return [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const part of value.split(",")) {
    const clean = part.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= max) break;
  }

  return out;
}
