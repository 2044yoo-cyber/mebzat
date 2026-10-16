/**
 * /house-design?tab=learn opens the construction learning view.
 *
 *   npx tsx scripts/construction_lab_link_check.ts
 *
 * The page and the workspace are server and client components that need a
 * signed-in browser, so those are checked by call syntax with comments
 * stripped; the lab itself is rendered.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ConstructionLab } from "../src/features/house-designer/components/construction-lab";
import { buildLearningHouseProject } from "../src/features/house-designer/construction/learning-house";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };

const code = (path: string) => readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// The lab with no plan offers the sample house alone; with one, both.
const alone = renderToStaticMarkup(createElement(ConstructionLab));
ok(/Sample house/.test(alone), "the lab with no plan offers the sample house");
ok(!/My project/.test(alone), "and not a project that is not there");
const withPlan = renderToStaticMarkup(createElement(ConstructionLab, { project: buildLearningHouseProject({}).project }));
ok(/Sample house/.test(withPlan) && /My project/.test(withPlan), "with a plan open it offers both");

// The page passes the tab on only when it is exactly "learn".
const page = code("src/app/house-design/page.tsx");
ok(/const initialTab = params\.tab === "learn" \? "learn" : null;/.test(page), "the page accepts tab=learn and nothing else");
ok(/<HouseDesignerWorkspace[^>]*initialTab=\{initialTab\}/.test(page), "and hands it to the workspace");

// The workspace starts on it, shows it alone when no plan is named, and keeps it when a saved plan opens.
const workspace = code("src/features/house-designer/components/house-designer-workspace.tsx");
ok(/useState<WorkspaceTab>\(initialTab \?\? "plan"\)/.test(workspace), "the workspace starts on the requested tab");
ok(/useState\(initialTab === "learn" && !planId && !projectId\)/.test(workspace), "alone only when no plan or project is named");
ok(/if \(learnAlone && stage === "start"\) \{[\s\S]{0,900}<ConstructionLab \/>/.test(workspace), "the lab is drawn on its own in that case");
ok(/setLearnAlone\(false\); setTab\("plan"\);/.test(workspace), "and Open my house plan leaves it for the plan");
const openLoaded = workspace.slice(workspace.indexOf("function openLoaded"), workspace.indexOf("function openLoaded") + 1500);
ok(/setTab\(initialTab \?\? "plan"\);/.test(openLoaded), "a saved plan opened from the link keeps the learn tab");

console.log(`Construction lab link: ${checks} checks passed.`);
