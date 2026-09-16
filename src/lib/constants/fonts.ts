/**
 * Which face Medosha is read in.
 *
 * ## The default was not a default
 *
 * `globals.css` declared `--font-sans: var(--font-sans)` inside `@theme
 * inline` and nothing anywhere defined `--font-sans` itself. A custom property
 * that refers only to itself is invalid at computed-value time, so
 * `font-family: var(--font-sans)` resolved to nothing and `html { @apply
 * font-sans }` did nothing — the whole site rendered in whatever the browser
 * falls back to. Geist was downloaded on every page load and never used.
 *
 * ## Ge'ez is the reason the stack has an order
 *
 * A browser picks a face per character, not per element: the first family in
 * the list that has a glyph for this character wins. So the Latin face goes
 * first and the Ethiopic faces follow, and Amharic, Tigrinya and Afaan Oromo
 * written in Fidel get a face that actually has the syllables while English
 * keeps the one the site was designed in. Putting the Ethiopic font first
 * instead — the obvious way to "support Amharic" — renders every Latin letter
 * in its Latin glyphs, which is a different and worse-looking bug.
 *
 * `Noto Sans Ethiopic` is loaded from Google Fonts rather than hoped for,
 * because the alternatives are all somebody else's operating system: Nyala
 * ships on Windows, Kefa on macOS and iOS, Noto on Android, and a machine with
 * none of them shows boxes. The local names stay in the stack after it as a
 * fallback for a load that fails.
 */

export const FONT_CHOICES = [
  {
    value: "default",
    label: "Medosha",
    description:
      "The face the site is designed in, with Fidel handled by Noto Sans Ethiopic.",
  },
  {
    value: "system",
    label: "Your device",
    description:
      "Whatever your phone or computer uses for its own menus. The fastest to load.",
  },
  {
    value: "serif",
    label: "Reading serif",
    description: "Serifs, for long descriptions and specifications.",
  },
] as const;

export type FontChoice = (typeof FONT_CHOICES)[number]["value"];

export const DEFAULT_FONT: FontChoice = "default";

/** Where the choice is kept for a signed-out reader, and for the first paint. */
export const FONT_STORAGE_KEY = "medosha_font";

export function isFontChoice(value: unknown): value is FontChoice {
  return (
    typeof value === "string" &&
    FONT_CHOICES.some((choice) => choice.value === value)
  );
}

/**
 * The choice, or the default.
 *
 * Null is the default rather than an error: `profiles.font_preference` is null
 * for everybody who has never opened the setting, which is almost everybody.
 */
export function toFontChoice(value: unknown): FontChoice {
  return isFontChoice(value) ? value : DEFAULT_FONT;
}
