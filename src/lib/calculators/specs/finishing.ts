import { PAINT_SYSTEMS, paintQuantity } from "@/lib/takeoff/trades";
import { netWallArea, tileQuantity } from "../finishing";
import { cementSandForVolume, MORTAR_MIXES } from "../mixes";
import { typed } from "../quantity";
import { count, num, str, type CalculatorSpec } from "../types";
import { round, volumeFromCubicMetres } from "../units";

const MIX_OPTIONS = MORTAR_MIXES.map((mix) => ({ value: mix.value, label: mix.label }));

export const finishingSpecs: CalculatorSpec[] = [
  {
    slug: "tile",
    title: "Tile Calculator",
    category: "finishing",
    summary: "Tiles and boxes for a floor or wall, including cutting waste and what you will have spare.",
    keywords: ["tile", "tiles", "ceramic", "porcelain", "floor", "wall", "boxes", "grout"],
    popular: true,
    fields: [
      {
        kind: "select",
        id: "surface",
        label: "Tiling",
        options: [
          { value: "floor", label: "A floor" },
          { value: "wall", label: "Walls" },
        ],
        defaultValue: "floor",
      },
      { kind: "length", id: "length", label: "Room length", defaultUnit: "m", placeholder: "4" },
      {
        kind: "length",
        id: "width",
        label: "Room width",
        defaultUnit: "m",
        placeholder: "3.5",
        showWhen: { field: "surface", equals: ["floor"] },
      },
      {
        kind: "length",
        id: "height",
        label: "Wall height to tile",
        defaultUnit: "m",
        placeholder: "2.4",
        showWhen: { field: "surface", equals: ["wall"] },
      },
      {
        kind: "number",
        id: "walls",
        label: "How many walls",
        suffix: "walls",
        integer: true,
        defaultValue: 4,
        min: 1,
        showWhen: { field: "surface", equals: ["wall"] },
      },
      {
        kind: "number",
        id: "openings",
        label: "Openings to deduct",
        suffix: "m²",
        defaultValue: 0,
        optional: true,
      },
      { kind: "number", id: "tileLength", label: "Tile length", suffix: "mm", defaultValue: 600, placeholder: "600" },
      { kind: "number", id: "tileWidth", label: "Tile width", suffix: "mm", defaultValue: 600, placeholder: "600" },
      {
        kind: "number",
        id: "perBox",
        label: "Tiles per box",
        suffix: "tiles",
        integer: true,
        defaultValue: 4,
        min: 1,
        help: "Printed on the box. Four is usual for 600 × 600.",
      },
      {
        kind: "number",
        id: "waste",
        label: "Cutting waste",
        suffix: "%",
        defaultValue: 10,
        optional: true,
        help: "10% for a straight lay; 15% or more for diagonal or patterned work.",
      },
    ],
    compute(values) {
      const surface = str(values, "surface", "floor");
      const openings = num(values, "openings");
      const working: string[] = [];
      let area: number;

      if (surface === "floor") {
        const length = num(values, "length");
        const width = num(values, "width");
        area = Math.max(0, length * width - openings);
        working.push(`${length} × ${width} = ${round(length * width, 3).toFixed(3)} m² of floor`);
        if (openings > 0) working.push(`− ${openings} m² = ${round(area, 3).toFixed(3)} m²`);
      } else {
        const wall = netWallArea({
          length: num(values, "length"),
          height: num(values, "height"),
          walls: count(values, "walls", 4),
          openingArea: openings,
        });
        area = wall.net;
        working.push(...wall.formula);
      }

      const result = tileQuantity({
        area,
        tileLength: num(values, "tileLength", 600) / 1000,
        tileWidth: num(values, "tileWidth", 600) / 1000,
        wastePercent: num(values, "waste", 10),
        perBox: num(values, "perBox", 4),
      });

      return {
        headline: { label: "Boxes to buy", value: String(result.boxes), unit: "boxes" },
        lines: [
          { label: "Area to tile", value: result.area.toFixed(2), unit: "m²" },
          { label: "Tiles the surface needs", value: String(result.tiles), unit: "tiles" },
          { label: "With cutting waste", value: String(result.tilesWithWaste), unit: "tiles" },
          { label: "Tiles in those boxes", value: String(result.boxes * Math.max(1, Math.floor(num(values, "perBox", 4)))), unit: "tiles", muted: true },
          { label: "Spare after laying", value: String(result.spare), unit: "tiles", muted: true },
        ],
        formula: [...working, ...result.formula],
        warnings: result.warnings,
      };
    },
  },

  {
    slug: "paint",
    title: "Paint Calculator",
    category: "finishing",
    summary: "Litres and tins of paint for walls or ceilings, by coats and coverage.",
    keywords: ["paint", "litres", "coats", "emulsion", "coverage", "tins", "gallons"],
    popular: true,
    fields: [
      { kind: "length", id: "length", label: "Wall length", defaultUnit: "m", placeholder: "10" },
      { kind: "length", id: "height", label: "Wall height", defaultUnit: "m", placeholder: "2.8" },
      { kind: "number", id: "walls", label: "How many walls this size", suffix: "walls", integer: true, defaultValue: 4, min: 1 },
      { kind: "number", id: "openings", label: "Doors and windows to deduct", suffix: "m²", defaultValue: 0, optional: true },
      {
        kind: "select",
        id: "system",
        label: "Paint",
        options: PAINT_SYSTEMS.map((s) => ({ value: s.id, label: `${s.label} — ${s.coveragePerLitre} m²/L` })),
        defaultValue: "emulsion-interior",
      },
      { kind: "number", id: "coats", label: "Coats", suffix: "coats", integer: true, defaultValue: 2, min: 1 },
      { kind: "number", id: "waste", label: "Waste allowance", suffix: "%", defaultValue: 5, optional: true },
    ],
    compute(values) {
      const wall = netWallArea({
        length: num(values, "length"),
        height: num(values, "height"),
        walls: count(values, "walls", 4),
        openingArea: num(values, "openings"),
      });

      const system = PAINT_SYSTEMS.find((s) => s.id === str(values, "system")) ?? PAINT_SYSTEMS[0]!;
      const result = paintQuantity(
        typed("Net wall area", wall.net, "m²", wall.formula.join("; ")),
        system,
        { coats: count(values, "coats", 2), wastePercent: num(values, "waste", 5) },
      );

      // A US gallon, for anyone reading a tin that was imported.
      const gallons = result.litresWithWaste / 3.785411784;

      return {
        headline: { label: `${system.tinLitres} L tins to buy`, value: String(result.tins), unit: "tins" },
        lines: [
          { label: "Paintable area", value: wall.net.toFixed(2), unit: "m²" },
          { label: "Area including coats", value: round(wall.net * result.coats, 2).toFixed(2), unit: "m²", muted: true },
          { label: "Paint needed", value: result.litresWithWaste.toFixed(2), unit: "L" },
          { label: "In US gallons", value: round(gallons, 2).toFixed(2), unit: "gal", muted: true },
          { label: "Paint in those tins", value: String(result.tins * system.tinLitres), unit: "L", muted: true },
        ],
        formula: [...wall.formula, result.formula],
        warnings: wall.warnings,
      };
    },
  },

  {
    slug: "plaster",
    title: "Plaster Calculator",
    category: "finishing",
    summary: "Cement and sand for rendering or plastering a wall, at any mix and thickness.",
    keywords: ["plaster", "render", "rendering", "cement", "sand", "skim", "mix"],
    fields: [
      { kind: "length", id: "length", label: "Wall length", defaultUnit: "m", placeholder: "10" },
      { kind: "length", id: "height", label: "Wall height", defaultUnit: "m", placeholder: "2.8" },
      { kind: "number", id: "walls", label: "How many walls this size", suffix: "walls", integer: true, defaultValue: 1, min: 1 },
      { kind: "number", id: "faces", label: "Faces to plaster", suffix: "faces", integer: true, defaultValue: 1, min: 1, help: "Two if the wall is plastered both sides." },
      { kind: "number", id: "openings", label: "Openings to deduct", suffix: "m²", defaultValue: 0, optional: true },
      {
        kind: "length",
        id: "thickness",
        label: "Plaster thickness",
        defaultUnit: "mm",
        defaultValue: 15,
        placeholder: "15",
        help: "12–15 mm internally, 20 mm for external render.",
      },
      { kind: "select", id: "mix", label: "Mix ratio (cement : sand)", options: MIX_OPTIONS, defaultValue: "1:5" },
      { kind: "number", id: "waste", label: "Waste allowance", suffix: "%", defaultValue: 15, optional: true, help: "Plaster is wasteful — it falls off the board and the wall." },
    ],
    compute(values) {
      const wall = netWallArea({
        length: num(values, "length"),
        height: num(values, "height"),
        walls: count(values, "walls", 1),
        openingArea: num(values, "openings"),
      });

      const faces = count(values, "faces", 1);
      const thickness = num(values, "thickness", 0.015);
      const area = wall.net * faces;
      const volume = area * thickness;

      const result = cementSandForVolume(volume, str(values, "mix", "1:5"), num(values, "waste", 15));

      return {
        headline: { label: "Cement", value: String(result.cementBags), unit: "bags of 50 kg" },
        lines: [
          { label: "Area to plaster", value: round(area, 2).toFixed(2), unit: "m²" },
          { label: "Plaster volume", value: result.orderedVolume.toFixed(3), unit: "m³" },
          { label: "Cement", value: `${result.cementBags} bags`, unit: `(${result.cementKg} kg)` },
          { label: "Sand", value: result.sandM3.toFixed(2), unit: "m³" },
        ],
        formula: [
          ...wall.formula,
          `× ${faces} face${faces === 1 ? "" : "s"} = ${round(area, 2).toFixed(2)} m²`,
          `× ${(thickness * 1000).toFixed(0)} mm = ${round(volume, 4).toFixed(4)} m³`,
          ...result.formula,
        ],
        warnings: wall.warnings,
      };
    },
  },

  {
    slug: "screed",
    title: "Screed Calculator",
    category: "finishing",
    summary: "Cement and sand for a floor screed, by area and thickness.",
    keywords: ["screed", "floor", "levelling", "cement", "sand", "topping"],
    fields: [
      { kind: "length", id: "length", label: "Floor length", defaultUnit: "m", placeholder: "5" },
      { kind: "length", id: "width", label: "Floor width", defaultUnit: "m", placeholder: "4" },
      {
        kind: "length",
        id: "thickness",
        label: "Screed thickness",
        defaultUnit: "mm",
        defaultValue: 50,
        placeholder: "50",
        help: "Bonded screed is 25–40 mm; unbonded or floating needs 50–75 mm.",
      },
      { kind: "select", id: "mix", label: "Mix ratio (cement : sand)", options: MIX_OPTIONS, defaultValue: "1:3" },
      { kind: "number", id: "waste", label: "Waste allowance", suffix: "%", defaultValue: 10, optional: true },
    ],
    compute(values) {
      const length = num(values, "length");
      const width = num(values, "width");
      const thickness = num(values, "thickness", 0.05);
      const area = length * width;
      const volume = area * thickness;

      const result = cementSandForVolume(volume, str(values, "mix", "1:3"), num(values, "waste", 10));

      return {
        headline: { label: "Cement", value: String(result.cementBags), unit: "bags of 50 kg" },
        lines: [
          { label: "Floor area", value: round(area, 2).toFixed(2), unit: "m²" },
          { label: "Screed volume", value: result.orderedVolume.toFixed(3), unit: "m³" },
          { label: "In cubic feet", value: round(volumeFromCubicMetres(result.orderedVolume, "ft3"), 2).toFixed(2), unit: "ft³", muted: true },
          { label: "Cement", value: `${result.cementBags} bags`, unit: `(${result.cementKg} kg)` },
          { label: "Sand", value: result.sandM3.toFixed(2), unit: "m³" },
        ],
        formula: [
          `${length} × ${width} = ${round(area, 2).toFixed(2)} m²`,
          `× ${(thickness * 1000).toFixed(0)} mm = ${round(volume, 4).toFixed(4)} m³`,
          ...result.formula,
        ],
      };
    },
  },
];
