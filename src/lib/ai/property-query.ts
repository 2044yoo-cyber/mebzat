/**
 * Reading a property question, in whatever language it arrives in.
 *
 * Medosha's users write three ways and switch mid-sentence:
 *
 *   English            "3 bedroom apartments in Bole under 50,000"
 *   Amharic            "ቦሌ ውስጥ 3 መኝታ ቤት ከ50 ሺህ ብር በታች አሳየኝ"
 *   Latin Amharic      "bole lay 3 bedroom rent 50k laye"
 *
 * The third is the common one on a phone, because the Amharic keyboard is slow
 * and everybody's browser autocorrects it into nonsense. All three have to work
 * without anybody choosing a language, so there is no language detection step
 * here at all: every pattern is tried against the raw string, and a question is
 * simply whatever matched.
 *
 * ## Why this is regular expressions and not the model
 *
 * The model could extract these. It would cost a second round trip, it would
 * cost tokens on every property question, and it would occasionally return
 * `maxPrice: 50` for "50k" — which silently returns nothing and looks like an
 * empty database rather than a parse failure. Bedrooms and a price cap are
 * three regexes. The model's job starts after the rows are on the table.
 *
 * No `server-only` guard: there are no secrets here and the check script
 * imports it under plain Node.
 */

/** No client, no clock, no network — everything below is a pure function. */
export type PropertyQuery = {
  /** Rent, sale, or unstated. Unstated searches both. */
  kind: "rent" | "sale" | null;
  bedrooms: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  /** Neighbourhood or sub-city, as written in the gazetteer. */
  place: string | null;
  /** Words left after the structured parts were removed, for text search. */
  terms: string[];
  /** True when anything at all was recognised. */
  matched: boolean;
};

/* -------------------------------------------------------------------------- */
/* Script handling                                                            */
/* -------------------------------------------------------------------------- */

/** Ethiopic block. Used to decide whether to run the Amharic patterns at all. */
const ETHIOPIC = /[ሀ-፿]/;

export function hasAmharic(text: string): boolean {
  return ETHIOPIC.test(text);
}

/**
 * Amharic digits, which people mix with Latin ones freely.
 *
 * ፩ is one, and ፲ is ten — the Ge'ez numerals are not positional, so a general
 * converter would be wrong. Only the units are mapped, which covers "፫ መኝታ"
 * (three bedrooms) and leaves anything larger to the Latin digits people
 * actually use for prices.
 */
const ETHIOPIC_DIGITS: Record<string, string> = {
  "፩": "1", "፪": "2", "፫": "3", "፬": "4", "፭": "5",
  "፮": "6", "፯": "7", "፰": "8", "፱": "9",
};

export function normalise(text: string): string {
  let out = text;
  for (const [glyph, digit] of Object.entries(ETHIOPIC_DIGITS)) {
    out = out.split(glyph).join(digit);
  }
  // Thousands separators, so "50,000" is one number rather than two.
  out = out.replace(/(\d),(\d{3})\b/g, "$1$2");
  return out.toLowerCase().trim();
}

/* -------------------------------------------------------------------------- */
/* Rent or sale                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Words that mean the listing is let rather than sold.
 *
 * "kiray" and "kray" are both how people spell ኪራይ in Latin script, and
 * "lease" is what an office listing says. "laye" is not here: it is the
 * postposition "on/above", and it turns up in "bole lay" meaning "in Bole",
 * where treating it as rent would be wrong.
 */
const RENT_WORDS = [
  "rent", "rental", "rents", "renting", "to let", "for rent", "lease",
  "kiray", "kray", "kiraye", "kirayi",
  "ኪራይ", "የሚከራይ", "ተከራይ", "ልከራይ", "ኪራዩ",
];

const SALE_WORDS = [
  "buy", "sale", "for sale", "selling", "sell", "purchase",
  "shitet", "yemishet", "lemshet",
  "ሽያጭ", "ይሸጣል", "የሚሸጥ", "ልገዛ", "መግዛት",
];

function kindIn(text: string): "rent" | "sale" | null {
  // Sale is checked first: "for sale" contains no rent word, but "rent to buy"
  // contains both, and a listing somebody wants to buy is a sale.
  const sale = SALE_WORDS.some((word) => text.includes(word));
  const rent = RENT_WORDS.some((word) => text.includes(word));
  if (sale && !rent) return "sale";
  if (rent && !sale) return "rent";
  // Both or neither: not stated clearly enough to filter on. Searching both is
  // recoverable; guessing wrong shows an empty list and reads as no stock.
  return null;
}

/* -------------------------------------------------------------------------- */
/* Bedrooms                                                                   */
/* -------------------------------------------------------------------------- */

const BEDROOM_WORDS = [
  "bedroom", "bedrooms", "bed room", "bdr", "br",
  "menta", "megnta", "megnita", "meta",
  "መኝታ", "መኝታቤት", "መኝታ ቤት",
];

/** Spelled-out counts, English and transliterated Amharic. */
const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  and: 1, hulet: 2, sost: 3, arat: 4, amist: 5, sidist: 6,
};

/**
 * The bedroom count.
 *
 * The number may come before the word ("3 bedroom") or after it
 * ("መኝታ 3"), and in Amharic word order it is usually before. Both directions
 * are tried, nearest first, so "3 bedroom villa 2 bathroom" does not read the
 * bathroom count.
 */
function bedroomsIn(text: string): number | null {
  for (const word of BEDROOM_WORDS) {
    const index = text.indexOf(word);
    if (index === -1) continue;

    // Look backwards over at most 12 characters — enough for "3 " or "three ",
    // not enough to reach across a clause and pick up a price.
    const before = text.slice(Math.max(0, index - 12), index);
    const digitBefore = before.match(/(\d{1,2})\s*\S{0,4}$/);
    if (digitBefore?.[1]) {
      const value = Number(digitBefore[1]);
      if (value >= 1 && value <= 20) return value;
    }

    const wordBefore = Object.keys(WORD_NUMBERS).find((name) =>
      new RegExp(`\\b${name}\\s*$`).test(before),
    );
    if (wordBefore) return WORD_NUMBERS[wordBefore]!;

    const after = text.slice(index + word.length, index + word.length + 8);
    const digitAfter = after.match(/^\s*(\d{1,2})/);
    if (digitAfter?.[1]) {
      const value = Number(digitAfter[1]);
      if (value >= 1 && value <= 20) return value;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Price                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A money amount, with its multiplier.
 *
 * "50k", "50 ሺህ" and "50 thousand" are the same number; "2m" and "2 ሚሊዮን" are
 * the same number. Getting the multiplier wrong is the failure that looks like
 * an empty database, so every suffix people actually type is listed.
 */
const MULTIPLIERS: { suffix: string; factor: number }[] = [
  { suffix: "million", factor: 1_000_000 },
  { suffix: "mil", factor: 1_000_000 },
  { suffix: "ሚሊዮን", factor: 1_000_000 },
  { suffix: "ሚልዮን", factor: 1_000_000 },
  { suffix: "thousand", factor: 1_000 },
  { suffix: "shi", factor: 1_000 },
  { suffix: "ሺህ", factor: 1_000 },
  { suffix: "ሺ", factor: 1_000 },
  { suffix: "k", factor: 1_000 },
  { suffix: "m", factor: 1_000_000 },
];

type Amount = { value: number; start: number; end: number };

/** Every money-looking number in the text, with where it was found. */
function amountsIn(text: string): Amount[] {
  const found: Amount[] = [];
  const pattern = /(\d+(?:\.\d+)?)\s*([a-zሀ-፿]*)/g;

  for (const match of text.matchAll(pattern)) {
    const raw = Number(match[1]);
    if (!Number.isFinite(raw)) continue;

    const tail = match[2] ?? "";
    const multiplier = MULTIPLIERS.find((entry) =>
      // Longest suffixes are listed first, so "million" wins over "m".
      tail.startsWith(entry.suffix),
    );

    const value = multiplier ? raw * multiplier.factor : raw;
    const start = match.index ?? 0;

    // A bare number under 1000 is a bedroom count, a floor, a year or a street
    // number far more often than it is a price in Birr. Requiring either a
    // multiplier or four digits is what keeps "3 bedroom" from becoming
    // "maxPrice: 3".
    if (!multiplier && value < 1000) continue;

    found.push({
      value,
      start,
      end: start + match[0].length,
    });
  }

  return found;
}

/** Words meaning "at most", either side of the number. */
const UNDER_WORDS = [
  "under", "below", "less than", "at most", "maximum", "max", "up to",
  "cheaper than", "within", "beteche", "betach", "yale",
  "በታች", "ያነሰ", "እስከ", "ከታች",
];

const OVER_WORDS = [
  "over", "above", "more than", "at least", "minimum", "min", "starting from",
  "from", "belay", "belai",
  "በላይ", "የሚበልጥ", "ጀምሮ",
];

/**
 * The price bounds.
 *
 * Amharic wraps the bound around the number — "ከ50 ሺህ ብር በታች" is
 * "from-50-thousand-birr below" — so the qualifier can be on either side. Both
 * windows are checked, and the one that matches decides.
 *
 * With two amounts and no qualifier at all the pair is read as a range, which
 * is what "between 20000 and 50000" and "20k-50k" both mean.
 */
function priceBounds(text: string): { min: number | null; max: number | null } {
  const amounts = amountsIn(text);
  if (amounts.length === 0) return { min: null, max: null };

  let min: number | null = null;
  let max: number | null = null;

  for (const amount of amounts) {
    const before = text.slice(Math.max(0, amount.start - 24), amount.start);
    const after = text.slice(amount.end, amount.end + 24);
    const window = `${before} ${after}`;

    if (UNDER_WORDS.some((word) => window.includes(word))) {
      max = max === null ? amount.value : Math.min(max, amount.value);
    } else if (OVER_WORDS.some((word) => window.includes(word))) {
      min = min === null ? amount.value : Math.max(min, amount.value);
    }
  }

  if (min === null && max === null && amounts.length >= 2) {
    const sorted = [...amounts].sort((a, b) => a.value - b.value);
    min = sorted[0]!.value;
    max = sorted[sorted.length - 1]!.value;
  } else if (min === null && max === null && amounts.length === 1) {
    // One number, no qualifier: "rentals 50k in Bole" means a budget, and a
    // budget is a ceiling. Reading it as an exact price matches nothing.
    max = amounts[0]!.value;
  }

  // "between 50k and 20k" is somebody typing quickly, not an empty range.
  if (min !== null && max !== null && min > max) {
    return { min: max, max: min };
  }

  return { min, max };
}

/* -------------------------------------------------------------------------- */
/* Place                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Amharic and transliterated spellings for the places people search.
 *
 * Only aliases go here. The canonical names come from the gazetteer, which is
 * the same list the map pins against — keeping a second copy of "Bole" here is
 * how the chat and the map would end up disagreeing about where Bole is.
 */
export const PLACE_ALIASES: Record<string, string> = {
  "ቦሌ": "Bole",
  "ሲኤምሲ": "CMC",
  "ሲ ኤም ሲ": "CMC",
  "ሰሚት": "Summit",
  "ሳሪስ": "Saris",
  "ጀሞ": "Jemo",
  "ገርጂ": "Gerji",
  "ሜክሲኮ": "Mexico",
  "ካዛንቺስ": "Kazanchis",
  "መገናኛ": "Megenagna",
  "ፒያሳ": "Piassa",
  "ሽሮ ሜዳ": "Shiro Meda",
  "አያት": "Ayat",
  "ለቡ": "Lebu",
  "ጎፋ": "Gofa",
  "ሳር ቤት": "Sarbet",
  "ሳርቤት": "Sarbet",
  "ኮተቤ": "Kotebe",
  "የካ": "Yeka",
  "ልደታ": "Lideta",
  "ቂርቆስ": "Kirkos",
  "ኡራኤል": "Urael",
  "ሸጎሌ": "Shegole",
  "አዲስ አበባ": "Addis Ababa",
  "አዲስ": "Addis Ababa",
  // Latin spellings that the gazetteer does not carry verbatim.
  "cmc": "CMC",
  "ayat": "Ayat",
  "sarbet": "Sarbet",
  "saris": "Saris",
  "jemo": "Jemo",
  "gerji": "Gerji",
  "megenagna": "Megenagna",
  "piassa": "Piassa",
  "piazza": "Piassa",
  "kazanchis": "Kazanchis",
  "summit": "Summit",
  "bole": "Bole",
};

/**
 * The place named in a question.
 *
 * Longest alias first, so "Bole Medhanialem" is not read as "Bole" — the
 * gazetteer holds both and they are half a kilometre apart.
 */
function placeIn(text: string, gazetteer: readonly string[]): string | null {
  const candidates = [
    ...gazetteer.map((name) => ({ needle: name.toLowerCase(), value: name })),
    ...Object.entries(PLACE_ALIASES).map(([needle, value]) => ({
      needle: needle.toLowerCase(),
      value,
    })),
  ].sort((a, b) => b.needle.length - a.needle.length);

  for (const candidate of candidates) {
    if (text.includes(candidate.needle)) return candidate.value;
  }
  return null;
}

/* -------------------------------------------------------------------------- */

/**
 * Filler that carries no search meaning in any of the three languages.
 *
 * "lay", "laye" and "west" are Amharic postpositions — "on", "in" — and they
 * appear in almost every location phrase. Left in, they become search terms and
 * match nothing.
 */
const NOISE = new Set([
  "show", "me", "find", "get", "list", "search", "want", "need", "looking",
  "for", "a", "an", "the", "in", "at", "on", "near", "around", "with", "and",
  "or", "under", "below", "over", "above", "between", "please", "some", "any",
  "is", "are", "what", "which", "where", "how", "much", "many", "can", "you",
  "i", "my", "birr", "etb", "price", "cost",
  "lay", "laye", "west", "wust", "yale", "ale", "new", "ነው", "ውስጥ", "አሳየኝ",
  "አለ", "ብር", "ያለ", "ማግኘት", "እፈልጋለሁ", "ይኖራል",
]);

/**
 * Reads a property question.
 *
 * `gazetteer` is passed in rather than imported so this module stays free of
 * the location package — the check script runs it with a fixed list, and the
 * server passes the real one.
 */
export function parsePropertyQuery(
  question: string,
  gazetteer: readonly string[] = [],
): PropertyQuery {
  const text = normalise(question);

  const kind = kindIn(text);
  const bedrooms = bedroomsIn(text);
  const { min, max } = priceBounds(text);
  const place = placeIn(text, gazetteer);

  const terms = text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 2 && !NOISE.has(word) && !/^\d+$/.test(word),
    )
    .slice(0, 6);

  return {
    kind,
    bedrooms,
    minPrice: min,
    maxPrice: max,
    place,
    terms,
    matched:
      kind !== null ||
      bedrooms !== null ||
      min !== null ||
      max !== null ||
      place !== null,
  };
}

/**
 * Whether a question is about property at all.
 *
 * Used to decide whether the property tables are worth querying. Deliberately
 * generous: a needless query costs one round trip, and a missed one costs the
 * answer.
 */
const PROPERTY_WORDS = [
  "property", "properties", "house", "houses", "home", "apartment", "apartments",
  "flat", "villa", "condo", "condominium", "studio apartment", "duplex",
  "penthouse", "rent", "rental", "rentals", "listing", "listings", "bedroom",
  "landlord", "tenant", "agent", "broker", "realtor", "estate", "guest house",
  "office space", "shop", "warehouse", "plot", "land for",
  "bet", "kiray", "kray", "menta", "gebi",
  "ቤት", "ኪራይ", "መኝታ", "አፓርታማ", "ቪላ", "ኮንዶሚንየም", "ግቢ", "ቦታ", "ደላላ",
];

export function looksLikeProperty(question: string): boolean {
  const text = normalise(question);
  return PROPERTY_WORDS.some((word) => text.includes(word));
}
