import { DEFAULT_FONT, FONT_STORAGE_KEY, type FontChoice } from "@/lib/constants/fonts";

/**
 * Applies the reading face before the page is painted.
 *
 * A server component that renders one blocking script, on purpose. The
 * alternative — an effect — runs after the first paint, so the page arrives in
 * one font and repaints in another on every load. That flash is the reason
 * `next-themes` does the same thing for dark mode two lines further up the
 * tree.
 *
 * Two readers, two sources:
 *
 *   - **signed in**: the root layout has already put `data-font` on `<html>`
 *     from the profile, and the script's job is only to copy it into
 *     `localStorage` so the same browser keeps the choice after signing out.
 *     The account is the authority; a stale value in one browser must not
 *     override what the profile says.
 *   - **signed out**: there is no profile to read, so `localStorage` is the
 *     only record and the script applies it.
 *
 * Everything is inside a try/catch because reading `localStorage` throws
 * outright in a Safari private window, and a settings preference is not worth
 * a blank page.
 */
export function FontPreference({
  serverChoice,
}: {
  serverChoice: FontChoice | null;
}) {
  const script = `
(function () {
  try {
    var root = document.documentElement;
    var server = ${JSON.stringify(serverChoice)};
    if (server) {
      root.setAttribute("data-font", server);
      window.localStorage.setItem(${JSON.stringify(FONT_STORAGE_KEY)}, server);
      return;
    }
    var stored = window.localStorage.getItem(${JSON.stringify(FONT_STORAGE_KEY)});
    if (stored && stored !== ${JSON.stringify(DEFAULT_FONT)}) root.setAttribute("data-font", stored);
  } catch (error) {}
})();
`.trim();

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
