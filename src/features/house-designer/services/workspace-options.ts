import type { HouseProject } from "../types/project";

export type DisplayUnits = "mm" | "cm" | "m";
export type ModelingOptions = NonNullable<HouseProject["modelingOptions"]>;
export const unitScale = (unit: DisplayUnits) => unit === "m" ? 1000 : unit === "cm" ? 10 : 1;
export const displayLength = (mm: number, unit: DisplayUnits) => Number((mm / unitScale(unit)).toFixed(6));
export const modelLength = (value: number, unit: DisplayUnits) => value * unitScale(unit);

export function modelingPreset(mode: ModelingOptions["mode"]): ModelingOptions {
  const house = mode === "house";
  return { mode, structure: house, foundations: house, roof: house, stairs: house, site: house, floors: true, ceilings: true };
}

export function applyModelingOptions(project: HouseProject, options: ModelingOptions): HouseProject {
  return { ...project, modelingOptions: options,
    structuralColumns: options.structure ? project.structuralColumns : [],
    structuralBeams: options.structure ? project.structuralBeams : [],
    structuralGrid: options.structure ? project.structuralGrid : [],
    foundations: options.foundations ? project.foundations : [],
    roofs: options.roof ? project.roofs : [],
    stairs: options.stairs ? project.stairs : [],
    site: options.site ? project.site : null,
    balconies: options.site ? project.balconies : [],
    verandas: options.site ? project.verandas : [],
    facadeElements: options.site ? project.facadeElements : [],
    slabs: options.floors ? project.slabs : [],
    ceilings: options.ceilings ? project.ceilings : [],
  };
}
