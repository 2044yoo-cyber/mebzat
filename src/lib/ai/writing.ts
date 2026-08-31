/**
 * The AI Writing Assistant's vocabulary.
 *
 * Client-safe on purpose: the toolbar, the command menu and the API route all
 * need the same list of actions, tones and languages, and a list that exists
 * twice is a list that will disagree with itself. No provider access and no
 * database access lives here.
 */

export type WriteAction =
  | "improve"
  | "grammar"
  | "professional"
  | "simplify"
  | "expand"
  | "shorten"
  | "spelling"
  | "terminology"
  | "seo"
  | "translate"
  | "complete"
  | "tags";

export type WriteTone =
  | "professional"
  | "friendly"
  | "technical"
  | "sales"
  | "luxury"
  | "simple"
  | "formal";

export type WriteLanguage = "en" | "am" | "om" | "ti" | "ar" | "fr";

/**
 * A place text is written. The surface tells the model what it is looking at,
 * which is the difference between "improve this paragraph" and "improve this
 * product description".
 */
export type WriteSurface =
  | "product"
  | "service"
  | "project"
  | "property"
  | "comment"
  | "review"
  | "question"
  | "message"
  | "company"
  | "professional"
  | "job"
  | "investment"
  | "price"
  | "knowledge"
  | "generic";

export const WRITE_ACTIONS: Record<
  WriteAction,
  { label: string; hint: string; /** Replaces the text rather than adding to it. */ rewrite: boolean }
> = {
  improve: {
    label: "Improve writing",
    hint: "Clearer wording, same meaning",
    rewrite: true,
  },
  grammar: {
    label: "Fix grammar",
    hint: "Grammar and punctuation only",
    rewrite: true,
  },
  spelling: {
    label: "Correct spelling",
    hint: "Spelling only, nothing else",
    rewrite: true,
  },
  professional: {
    label: "Professional tone",
    hint: "How a firm would write it",
    rewrite: true,
  },
  simplify: {
    label: "Simplify",
    hint: "Plainer words, shorter sentences",
    rewrite: true,
  },
  expand: {
    label: "Expand",
    hint: "More detail, no new facts",
    rewrite: true,
  },
  shorten: {
    label: "Shorten",
    hint: "Same points, fewer words",
    rewrite: true,
  },
  terminology: {
    label: "Construction terms",
    hint: "Correct trade vocabulary",
    rewrite: true,
  },
  seo: {
    label: "Improve for search",
    hint: "Terms buyers actually search",
    rewrite: true,
  },
  translate: {
    label: "Translate",
    hint: "Into another language",
    rewrite: true,
  },
  complete: {
    label: "Draft from my notes",
    hint: "Turn a fragment into a full draft",
    rewrite: true,
  },
  tags: {
    label: "Suggest tags",
    hint: "Categories, keywords, materials",
    rewrite: false,
  },
};

/** Menu order. Deliberately not alphabetical — most-used first. */
export const ACTION_ORDER: WriteAction[] = [
  "improve",
  "professional",
  "expand",
  "shorten",
  "simplify",
  "grammar",
  "spelling",
  "terminology",
  "seo",
  "complete",
  "translate",
  "tags",
];

export const WRITE_TONES: Record<WriteTone, { label: string; hint: string }> = {
  professional: { label: "Professional", hint: "Measured and credible" },
  friendly: { label: "Friendly", hint: "Warm and approachable" },
  technical: { label: "Technical", hint: "Precise, for specialists" },
  sales: { label: "Sales", hint: "Persuasive, benefit-led" },
  luxury: { label: "Luxury", hint: "Restrained and premium" },
  simple: { label: "Simple", hint: "Anyone can follow it" },
  formal: { label: "Formal", hint: "Contracts and tenders" },
};

export const TONE_ORDER: WriteTone[] = [
  "professional",
  "friendly",
  "technical",
  "sales",
  "luxury",
  "simple",
  "formal",
];

export const WRITE_LANGUAGES: Record<
  WriteLanguage,
  { label: string; endonym: string }
> = {
  en: { label: "English", endonym: "English" },
  am: { label: "Amharic", endonym: "አማርኛ" },
  om: { label: "Afaan Oromo", endonym: "Afaan Oromoo" },
  ti: { label: "Tigrinya", endonym: "ትግርኛ" },
  ar: { label: "Arabic", endonym: "العربية" },
  fr: { label: "French", endonym: "Français" },
};

export const LANGUAGE_ORDER: WriteLanguage[] = ["en", "am", "om", "ti", "ar", "fr"];

export const SURFACE_LABEL: Record<WriteSurface, string> = {
  product: "product listing",
  service: "service listing",
  project: "project",
  property: "property listing",
  comment: "comment",
  review: "review",
  question: "question",
  message: "message",
  company: "company profile",
  professional: "professional profile",
  job: "job post",
  investment: "investment project",
  price: "price contribution",
  knowledge: "knowledge article",
  generic: "text",
};

export function isWriteAction(value: unknown): value is WriteAction {
  return typeof value === "string" && value in WRITE_ACTIONS;
}

export function isWriteTone(value: unknown): value is WriteTone {
  return typeof value === "string" && value in WRITE_TONES;
}

export function isWriteLanguage(value: unknown): value is WriteLanguage {
  return typeof value === "string" && value in WRITE_LANGUAGES;
}

export function isWriteSurface(value: unknown): value is WriteSurface {
  return typeof value === "string" && value in SURFACE_LABEL;
}

/** Longest input the assistant will rewrite in one pass. */
export const MAX_WRITE_INPUT = 6000;

/**
 * Below this, a fragment is a note rather than a draft, and "improve" would
 * have to invent to produce anything. The UI offers "Draft from my notes"
 * instead, which is honest about what it is doing.
 */
export const FRAGMENT_THRESHOLD = 40;
