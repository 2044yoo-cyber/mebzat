import type { SpaceAnalysis } from "@/lib/ai/vision.types";

import {
  buildFacadeElements,
  facadeSettingsForStyle,
  houseStyles,
  type HouseFacadeAlternative,
  type HouseFacadeSettings,
  type HouseProject,
  type HouseStyle,
} from "../types/project";

const alternativeNames: Record<HouseStyle, string> = {
  modern: "Modern Clean",
  contemporary: "Warm Contemporary",
  minimal: "Minimal Calm",
  classic: "Classic Balanced",
  "neo-classical": "Neo-Classical",
  mediterranean: "Mediterranean Warmth",
  "ethiopian-inspired": "Ethiopian Contemporary",
  "custom-reference": "Reference Interpretation",
};

/** Change appearance while preserving every verified plan coordinate. */
export function applyFacadeStyle(
  project: HouseProject,
  style: HouseStyle,
  source: HouseFacadeSettings["source"] = "style",
): HouseProject {
  const facade = { ...facadeSettingsForStyle(style, source === "reference"), source };
  return applyFacade(project, facade, `Applied ${alternativeNames[style]} façade`);
}

export function patchFacade(
  project: HouseProject,
  patch: Partial<HouseFacadeSettings>,
): HouseProject {
  const facade = { ...project.facade, ...patch };
  return applyFacade(project, facade, "Updated façade materials and colours");
}

export function applyFacadeReference(
  project: HouseProject,
  sourceImageId: string,
  analysis: SpaceAnalysis,
): HouseProject {
  const style = referenceStyle(analysis, project.designStyle);
  const profile = facadeSettingsForStyle(style, true);
  const wallMaterials = analysis.surfaces
    .filter((surface) => /wall|facade|stone|render|plaster/i.test(`${surface.element} ${surface.material}`))
    .map((surface) => surface.material);
  const facade: HouseFacadeSettings = {
    ...profile,
    source: "reference",
    wallMaterial: wallMaterials[0] || profile.wallMaterial,
    windowStyle: readableCue(analysis.windows, profile.windowStyle),
    entranceStyle: readableCue(analysis.doors, profile.entranceStyle),
  };
  const next = applyFacade(project, facade, "Applied analysed façade reference");
  return {
    ...next,
    facadeReferenceAnalysis: {
      sourceImageId,
      analysedAt: new Date().toISOString(),
      currentStyle: analysis.currentStyle,
      summary: analysis.summary,
      walls: analysis.walls,
      windows: analysis.windows,
      doors: analysis.doors,
      materials: [...new Set(analysis.surfaces.map((surface) => surface.material).filter(Boolean))],
    },
  };
}

export function generateFacadeAlternatives(project: HouseProject, count: 2 | 3 | 4): HouseProject {
  const styles = alternativeStyles(project.designStyle).slice(0, count);
  const now = new Date().toISOString();
  const alternatives: HouseFacadeAlternative[] = styles.map((style) => {
    const facade = facadeSettingsForStyle(style, false);
    return {
      id: crypto.randomUUID(),
      name: alternativeNames[style],
      style,
      facade,
      facadeElements: buildFacadeElements(project.walls, project.levels, facade),
      createdAt: now,
    };
  });
  return {
    ...project,
    designAlternatives: alternatives,
    revisions: [...project.revisions, { id: crypto.randomUUID(), createdAt: now, note: `Generated ${count} plan-safe façade alternatives` }],
  };
}

export function activateFacadeAlternative(project: HouseProject, alternativeId: string): HouseProject {
  const alternative = project.designAlternatives.find((item) => item.id === alternativeId);
  if (!alternative) return project;
  return applyFacade(project, alternative.facade, `Activated ${alternative.name}`);
}

export function ensurePhaseThreeProject(project: HouseProject): HouseProject {
  if (project.facadeElements.length > 0) return project;
  return applyFacadeStyle(project, project.designStyle, project.referenceImages.some((image) => image.kind === "facade") ? "reference" : "style");
}

function applyFacade(project: HouseProject, facade: HouseFacadeSettings, note: string): HouseProject {
  const roofType = facade.style === "classic" || facade.style === "neo-classical" || facade.style === "mediterranean" || facade.style === "ethiopian-inspired"
    ? "hip"
    : facade.style === "contemporary"
      ? "gable"
      : "flat";
  const now = new Date().toISOString();
  return {
    ...project,
    designStyle: facade.style,
    facade,
    walls: project.walls.map((wall) => ({ ...wall, material: facade.wallMaterial })),
    windows: project.windows.map((window) => ({ ...window, style: facade.windowStyle, material: "Aluminium" })),
    doors: project.doors.map((door) => ({ ...door, style: facade.entranceStyle, material: door.type === "passage" ? door.material : "Timber" })),
    roofs: project.roofs.map((roof) => ({
      ...roof,
      type: roofType,
      slope: roofType === "flat" ? 0 : roof.type === "flat" ? 25 : Math.max(15, roof.slope),
      height: roofType === "flat" ? Math.min(450, roof.height) : Math.max(900, roof.height),
      material: facade.roofMaterial,
    })),
    facadeElements: buildFacadeElements(project.walls, project.levels, facade),
    materials: [...new Set([...project.materials, facade.wallMaterial, facade.roofMaterial])],
    metadata: { ...project.metadata, updatedAt: now },
    revisions: [...project.revisions, { id: crypto.randomUUID(), createdAt: now, note }],
  };
}

function alternativeStyles(current: HouseStyle): HouseStyle[] {
  const preferred: HouseStyle[] = ["modern", "contemporary", "minimal", "neo-classical", "classic", "mediterranean", "ethiopian-inspired", "custom-reference"];
  return preferred.filter((style) => style !== current && houseStyles.includes(style));
}

function referenceStyle(analysis: SpaceAnalysis, fallback: HouseStyle): HouseStyle {
  const candidates = [analysis.currentStyle, ...analysis.suggestedStyles]
    .map((value) => value.toLowerCase());
  for (const candidate of candidates) {
    if (candidate.includes("neo") && candidate.includes("classic")) return "neo-classical";
    if (candidate.includes("ethiop")) return "ethiopian-inspired";
    if (candidate.includes("mediterr")) return "mediterranean";
    if (candidate.includes("contempor")) return "contemporary";
    if (candidate.includes("minimal")) return "minimal";
    if (candidate.includes("classic")) return "classic";
    if (candidate.includes("modern")) return "modern";
  }
  return fallback === "custom-reference" ? "custom-reference" : fallback;
}

function readableCue(value: string, fallback: string) {
  const cue = value.trim();
  return cue && !/not clear/i.test(cue) ? cue.slice(0, 120) : fallback;
}
