/**
 * Construction 3D in the phone's menu, in a real browser.
 *
 *   npm run build                                   (for the stylesheet)
 *   node scripts/construction_menu_browser_check.mjs
 *
 * The owner could not find the construction learning mode in the menu. It is a row under Construction now (scripts/navigation_check.ts checks the manifest); this checks
 * what a person sees: the Construction panel of the drawer, the real component laid out with the built stylesheet at 390 px, lists it near the top, big enough to press,
 * in the three languages, and a press goes to the learning view, by way of the sign-in page for somebody who has not signed in. Exits 0 with a SKIP line when Playwright
 * or the stylesheet is missing, as the other browser checks do.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;

let chromium;
try { ({ chromium } = await import("playwright")); } catch { try { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); } catch { console.log("SKIP: needs Playwright"); process.exit(0); } }

const cssFiles = [];
const walk = (dir) => { if (!existsSync(dir)) return; for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) walk(path); else if (name.endsWith(".css")) cssFiles.push(path); } };
walk(join(root, ".next/static"));
if (!cssFiles.length) { console.log("SKIP: run `npm run build` first, for the stylesheet"); process.exit(0); }

const out = mkdtempSync(join(tmpdir(), "construction_menu_"));
// next/link is an anchor here that records where it was asked to go instead of going.
writeFileSync(join(out, "link.tsx"), `
export default function Link({ href, children, onClick, ...rest }: any) {
  return <a href={href} {...rest} onClick={(event) => { event.preventDefault(); (window as any).__went = href; onClick?.(event); }}>{children}</a>;
}
`);
writeFileSync(join(out, "entry.tsx"), `
import { createRoot } from "react-dom/client";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { SectionPanel } from "@/components/shell/section-panel";
const query = new URLSearchParams(location.search);
createRoot(document.getElementById("root")!).render(
  <LanguageProvider initialLanguage={(query.get("lang") ?? "en") as "en" | "am" | "om"}>
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ width: 72 }} />
      <SectionPanel sectionId="construction" pathname="/studio" signedIn={query.get("in") !== "0"} onBack={() => {}} onNavigate={() => { (window as any).__closed = true; }} />
    </div>
  </LanguageProvider>,
);
`);
const { build } = await import(join(root, "node_modules/esbuild/lib/main.js"));
await build({
  absWorkingDir: root, entryPoints: [join(out, "entry.tsx")], bundle: true, outfile: join(out, "app.js"), format: "esm", jsx: "automatic", platform: "browser", logLevel: "error",
  nodePaths: [join(root, "node_modules")], define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "alias", setup(builder) {
    builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: join(out, "link.tsx") }));
    builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(`./src/${args.path.slice(2)}`, { resolveDir: root, kind: args.kind }));
  } }],
});
writeFileSync(join(out, "app.css"), cssFiles.map((file) => readFileSync(file, "utf8")).join("\n"));
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body style="margin:0"><div id="root"></div><script type="module" src="/app.js"></script></body></html>`);
const server = createServer((request, response) => {
  const path = request.url.startsWith("/app.js") ? "app.js" : request.url.startsWith("/app.css") ? "app.css" : "index.html";
  response.writeHead(200, { "content-type": path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html" });
  response.end(readFileSync(join(out, path)));
}).listen(0);
const url = `http://localhost:${server.address().port}/`;
const executablePath = existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined;
const browser = await chromium.launch({ executablePath });

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };

/** The panel's rows, top to bottom, as a reader sees them: the label, the line under it if there is one, where it goes and where it sits. */
async function rows(language, signedIn) {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${url}?lang=${language}&in=${signedIn ? 1 : 0}`);
  await page.waitForSelector("ul li a");
  const found = await page.evaluate(() => [...document.querySelectorAll("ul li")].map((li) => {
    const link = li.querySelector("a");
    const box = (link ?? li).getBoundingClientRect();
    return { text: li.innerText.replace(/\s+/g, " ").trim(), href: link?.getAttribute("href") ?? null, top: box.top, bottom: box.bottom, height: box.height, width: box.width };
  }));
  const heading = await page.evaluate(() => document.querySelector("button")?.innerText.replace(/\s+/g, " ").trim());
  return { page, found, heading, errors };
}

// ---- English, signed in --------------------------------------------------------------------------------------------------------------------------------------
{
  const { page, found, heading, errors } = await rows("en", true);
  ok(/Construction/.test(heading ?? ""), `the panel is the Construction one (${heading})`);
  const at = found.findIndex((row) => /^Construction 3D\b/.test(row.text));
  ok(at >= 0, `Construction 3D is listed: ${found.map((row) => row.text.slice(0, 24)).join(" | ")}`);
  const row = found[at];
  ok(at <= 2, `and near the top: row ${at + 1} of ${found.length}`);
  equal(row.href, "/house-design?tab=learn", "it goes to the learning view");
  ok(/Watch a building go up in 3D, with its BOQ and cost/.test(row.text), `with the line that says what it is: ${row.text}`);
  ok(row.height >= 44, `at least 44 px to press: ${row.height.toFixed(1)}`);
  ok(row.bottom <= 800, `and on the screen without scrolling: it ends at ${row.bottom.toFixed(0)} of 800`);
  ok(row.width >= 150, `and the row is as wide as the panel: ${row.width.toFixed(0)}`);
  ok(found.every((other, index) => index === 0 || other.top >= found[index - 1].bottom - 0.5), "no row is drawn over another");
  ok(found.some((other) => /^AI Cost Estimator\b/.test(other.text)) && found.some((other) => /^Construction Calculators\b/.test(other.text)), "the rows that were there are still there");
  await page.locator("ul li a", { hasText: "Construction 3D" }).click();
  equal(await page.evaluate(() => window.__went), "/house-design?tab=learn", "pressing it goes there");
  ok(await page.evaluate(() => window.__closed === true), "and closes the drawer");
  await page.screenshot({ path: join(out, "construction_panel_en.png") });
  equal(errors, [], "no page error");
  await page.close();
}

// ---- Signed out: by way of the sign-in page, which brings them back ----------------------------------------------------------------------------------------------
{
  const { page, found } = await rows("en", false);
  const row = found.find((one) => /^Construction 3D\b/.test(one.text));
  equal(row?.href, "/login?redirect=%2Fhouse-design%3Ftab%3Dlearn", "signed out, it goes to sign in and back to the learning view");
  await page.close();
}

// ---- The other two languages --------------------------------------------------------------------------------------------------------------------------------
for (const [language, name] of [["am", "የግንባታ 3D"], ["om", "Ijaarsaa 3D"]]) {
  const { page, found } = await rows(language, true);
  const row = found.find((one) => one.href === "/house-design?tab=learn");
  ok(row !== undefined && row.text.startsWith(name), `${language}: named ${name} (${row?.text})`);
  ok(row !== undefined && row.height >= 44, `${language}: still 44 px to press`);
  await page.close();
}

await browser.close();
server.close();
console.log(`Construction 3D in the menu: ${checks} checks passed in a real browser at phone width; a picture of the panel is at ${join(out, "construction_panel_en.png")}`);
