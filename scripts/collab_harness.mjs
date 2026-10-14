/**
 * The Collaborative Studio on its own page, for the browser checks.
 *
 * The real Studio components and the real server actions, bundled with
 * esbuild; both Supabase clients are the fake in collab_fake_supabase.ts,
 * styled with the CSS the production build emitted. `?as=owner` (or editor,
 * client, viewer, outsider) signs the tab in as that person; every tab of the
 * browser shares the one fake database and sees the others' changes live.
 *
 *   const harness = await openStudio();   // { browser, url, close, people }
 */
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;

export const PROJECT = "c6000000-0000-4000-8000-00000000000a";
export const OTHER_PROJECT = "c6000000-0000-4000-8000-00000000000b";
export const PEOPLE = {
  owner: { id: "c6000000-0000-4000-8000-000000000001", name: "Hanna Owner", username: "hanna" },
  editor: { id: "c6000000-0000-4000-8000-000000000002", name: "Dawit Designer", username: "dawit" },
  client: { id: "c6000000-0000-4000-8000-000000000003", name: "Sara Client", username: "sara" },
  viewer: { id: "c6000000-0000-4000-8000-000000000004", name: "Yonas Viewer", username: "yonas" },
  outsider: { id: "c6000000-0000-4000-8000-000000000005", name: "Out Sider", username: "outsider" },
  // Not on the project: people an invitation link is sent to.
  guest: { id: "c6000000-0000-4000-8000-000000000006", name: "Gete Guest", username: "gete" },
  latecomer: { id: "c6000000-0000-4000-8000-000000000007", name: "Lemma Late", username: "lemma" },
};

export async function openStudio() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    try { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); } catch { return null; }
  }
  const cssDir = join(root, ".next/static/chunks");
  const css = existsSync(cssDir) ? readdirSync(cssDir).filter((file) => file.endsWith(".css")) : [];
  assert.ok(css.length, "Run `npm run build` first: the check styles the Studio with the built CSS");

  const out = mkdtempSync(join(tmpdir(), "collab_studio_"));
  writeFileSync(join(out, "entry.tsx"), `
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { StudioProvider } from "@/components/collab/studio-context";
import { StudioWorkspace } from "@/components/collab/studio-workspace";
import { StudioPrimer } from "@/components/collab/studio-primer";
import { JoinStudio } from "@/components/collab/join-studio";
import { readAssets, readBoards, readMembers, readStudioTasks, readThreads, readUnread } from "@/lib/collab/queries";
import { fakeClient } from "${join(root, "scripts/collab_fake_supabase.ts")}";

const PEOPLE = ${JSON.stringify(PEOPLE)};
const PROJECT = "${PROJECT}";
const OTHER = "${OTHER_PROJECT}";
const query = new URLSearchParams(location.search);
// \`?as=\` signs this tab in (\`none\` signs it out); later pages in the tab keep whoever it is.
const remembered = Object.keys(PEOPLE).find((key) => PEOPLE[key].id === sessionStorage.getItem("__collab_user"));
const as = query.get("as") ?? (sessionStorage.getItem("__collab_user") === "" ? "none" : remembered) ?? "owner";
sessionStorage.setItem("__collab_user", as === "none" ? "" : PEOPLE[as].id);

if (!localStorage.getItem("__collab_fake_db")) {
  const at = new Date().toISOString();
  localStorage.setItem("__collab_fake_db", JSON.stringify({
    profiles: Object.values(PEOPLE).map((p) => ({ id: p.id, full_name: p.name, company_name: null, username: p.username, avatar_url: null })),
    agenda_projects: [{ id: PROJECT, owner_id: PEOPLE.owner.id, name: "Kitchen renovation" }, { id: OTHER, owner_id: PEOPLE.outsider.id, name: "Someone else's" }],
    agenda_members: [
      { project_id: PROJECT, user_id: PEOPLE.owner.id, role: "administrator", status: "active" },
      { project_id: PROJECT, user_id: PEOPLE.editor.id, role: "interior_designer", status: "active" },
      { project_id: PROJECT, user_id: PEOPLE.client.id, role: "engineer", status: "active" },
      { project_id: PROJECT, user_id: PEOPLE.viewer.id, role: "supplier", status: "active" },
      { project_id: OTHER, user_id: PEOPLE.outsider.id, role: "administrator", status: "active" },
    ],
    collab_access: [
      { project_id: PROJECT, user_id: PEOPLE.editor.id, level: "editor", updated_at: at },
      { project_id: PROJECT, user_id: PEOPLE.viewer.id, level: "viewer", updated_at: at },
    ],
  }));
}

const parts = location.pathname.split("/");
const routed = parts[1] === "agenda" && parts[2] === "projects" && parts[4] === "collaborate" ? parts[3] : null;
const projectId = routed ?? query.get("project") ?? PROJECT;
const client = fakeClient() as never;
const level = (await (fakeClient().rpc("collab_level", { target_project: projectId }))).data;
const node = document.getElementById("root")!;
if (location.pathname === "/agenda/join") {
  createRoot(node).render(<><JoinStudio signedIn={as !== "none"} /><Toaster /></>);
} else if (!level) {
  node.innerHTML = '<p id="not-found">This page could not be found.</p>';
} else {
  const [members, boards, assets, threads] = await Promise.all([readMembers(client, projectId), readBoards(client, projectId), readAssets(client, projectId), readThreads(client, projectId)]);
  const unread = await readUnread(client, projectId, PEOPLE[as].id, threads);
  const tasks = await readStudioTasks(client, projectId, threads.flatMap((t) => (t.taskId ? [t.taskId] : [])));
  const tab = query.get("tab") ?? "board";
  createRoot(node).render(
    <>
      <StudioProvider projectId={projectId} me={{ id: PEOPLE[as].id, name: PEOPLE[as].name }} level={level} members={members} initialBoards={boards} initialAssets={assets} initialThreads={threads} initialUnread={[...unread]} initialTasks={tasks} initialThreadId={query.get("thread")}>
        <StudioPrimer urls={{}} />
        <StudioWorkspace initial={{ tab, boardId: query.get("board"), canvasId: query.get("canvas"), drawingId: query.get("drawing") }} />
      </StudioProvider>
      <Toaster />
    </>,
  );
}
`);
  writeFileSync(join(out, "cache.ts"), "export const revalidatePath = () => {};\nexport const revalidateTag = () => {};\n");
  writeFileSync(join(out, "navigation.ts"), "export const useRouter = () => ({ refresh() { location.reload(); }, push(url: string) { location.href = url; } });\nexport const notFound = () => { throw new Error('not found'); };\nexport const redirect = (url: string) => { location.href = url; };\n");
  const { build } = await import(join(root, "node_modules/esbuild/lib/main.js"));
  await build({
    absWorkingDir: root, entryPoints: [join(out, "entry.tsx")], bundle: true, outfile: join(out, "app.js"),
    format: "esm", jsx: "automatic", platform: "browser", logLevel: "error", nodePaths: [join(root, "node_modules")],
    define: { "process.env.NODE_ENV": '"development"' }, splitting: false, target: "es2022",
    banner: { js: "globalThis.process ??= { env: {}, versions: {}, emit() {} };" },
    loader: { ".mjs": "js" },
    plugins: [{ name: "alias", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(root, "scripts/collab_fake_supabase.ts") }));
      builder.onResolve({ filter: /^@\/lib\/supabase\/server$/ }, () => ({ path: join(root, "scripts/collab_fake_server.ts") }));
      builder.onResolve({ filter: /^next\/cache$/ }, () => ({ path: join(out, "cache.ts") }));
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: join(out, "navigation.ts") }));
      builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(`./src/${args.path.slice(2)}`, { resolveDir: root, kind: args.kind }));
    } }],
  });
  for (const file of css) copyFileSync(join(cssDir, file), join(out, file));
  writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css.map((file) => `<link rel="stylesheet" href="/${file}">`).join("")}</head>
<body class="bg-background text-foreground"><div style="padding:16px"><div id="root"></div></div><script type="module" src="/app.js"></script></body></html>`);

  const types = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".html": "text/html", ".png": "image/png", ".pdf": "application/pdf" };
  const server = createServer((request, response) => {
    // The app's own addresses all get the one page, which routes itself.
    const route = request.url.split("?")[0];
    const path = route === "/" || route === "/agenda/join" || /^\/agenda\/projects\/[0-9a-f-]{36}\/collaborate$/.test(route) ? "index.html" : decodeURIComponent(route.slice(1));
    try {
      const body = path.startsWith("pdfjs-dist/") ? readFileSync(join(root, "node_modules", path)) : readFileSync(join(out, path));
      const extension = Object.keys(types).find((item) => path.endsWith(item));
      response.writeHead(200, { "content-type": types[extension] ?? "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  }).listen(0);
  const url = `http://localhost:${server.address().port}/`;
  const executablePath = existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined;
  const browser = await chromium.launch({ executablePath });
  return { browser, url, out, people: PEOPLE, async close() { await browser.close(); server.close(); } };
}
