import { BLOCK_TYPES, masonryQuantity, type BlockType } from "@/lib/takeoff/trades";
import { cementSandForVolume, MORTAR_MIXES } from "../mixes";
import { typed } from "../quantity";
import { netWallArea } from "../finishing";
import { num, str, type CalculatorSpec } from "../types";
import { round } from "../units";

const MIX_OPTIONS = MORTAR_MIXES.map((mix) => ({ value: mix.value, label: mix.label }));

const WALL_FIELDS = [
  { kind: "length" as const, id: "length", label: "Wall length", defaultUnit: "m" as const, placeholder: "10" },
  { kind: "length" as const, id: "height", label: "Wall height", defaultUnit: "m" as const, placeholder: "2.8" },
  {
    kind: "number" as const,
    id: "walls",
    label: "How many walls this size",
    suffix: "walls",
    integer: true,
    defaultValue: 1,
    min: 1,
  },
  {
    kind: "number" as const,
    id: "openings",
    label: "Doors and windows to deduct",
    suffix: "m²",
    defaultValue: 0,
    optional: true,
    help: "Total area of every opening. A 0.9 × 2.1 m door is 1.89 m².",
  },
];

export const masonrySpecs: CalculatorSpec[] = [
  {
    slug: "block",
    title: "Block Calculator",
    category: "masonry",
    summary: "Hollow concrete blocks for a wall, with waste and the mortar between them.",
    keywords: ["block", "hcb", "hollow concrete block", "wall", "masonry", "chika"],
    popular: true,
    fields: [
      ...WALL_FIELDS,
      {
        kind: "select",
        id: "block",
        label: "Block size",
        options: BLOCK_TYPES.filter((b) => b.id.startsWith("hcb")).map((b) => ({
          value: b.id,
          label: `${b.label} — ${b.length} × ${b.height} mm face`,
        })),
        defaultValue: "hcb-200",
      },
      {
        kind: "length",
        id: "joint",
        label: "Mortar joint",
        defaultUnit: "mm",
        defaultValue: 10,
        placeholder: "10",
        optional: true,
      },
      { kind: "number", id: "waste", label: "Waste allowance", suffix: "%", defaultValue: 5, optional: true },
    ],
    compute(values) {
      const wall = netWallArea({
        length: num(values, "length"),
        height: num(values, "height"),
        walls: Math.max(1, num(values, "walls", 1)),
        openingArea: num(values, "openings"),
      });

      const block = BLOCK_TYPES.find((b) => b.id === str(values, "block")) ?? BLOCK_TYPES[2]!;
      const jointMm = num(values, "joint", 0.01) * 1000;
      const waste = num(values, "waste", 5);

      const result = masonryQuantity(
        typed("Net wall area", wall.net, "m²", wall.formula.join("; ")),
        block,
        { jointMm, wastePercent: waste, stated: true },
      );

      return {
        headline: { label: "Blocks to order", value: String(result.blocksWithWaste), unit: "blocks" },
        lines: [
          { label: "Net wall area", value: wall.net.toFixed(2), unit: "m²" },
          { label: "Gross wall area", value: wall.gross.toFixed(2), unit: "m²", muted: true },
          { label: "Blocks per m²", value: result.blocksPerM2.toFixed(2), unit: "blocks/m²", muted: true },
          { label: "Blocks before waste", value: String(result.blocks), unit: "blocks" },
          { label: `Waste (${waste}%)`, value: String(result.blocksWithWaste - result.blocks), unit: "blocks", muted: true },
          { label: "Mortar", value: result.mortar.toFixed(3), unit: "m³" },
        ],
        formula: [...wall.formula, result.formula],
        warnings: [...wall.warnings, ...result.notes],
      };
    },
  },

  {
    slug: "brick",
    title: "Brick Calculator",
    category: "masonry",
    summary: "Bricks for a wall from any brick size, with the mortar joint taken into account.",
    keywords: ["brick", "clay brick", "wall", "masonry", "bricks per m2"],
    fields: [
      ...WALL_FIELDS,
      { kind: "number", id: "brickLength", label: "Brick length", suffix: "mm", defaultValue: 230, placeholder: "230" },
      { kind: "number", id: "brickHeight", label: "Brick height", suffix: "mm", defaultValue: 76, placeholder: "76" },
      { kind: "number", id: "brickWidth", label: "Brick width (wall thickness)", suffix: "mm", defaultValue: 110, placeholder: "110" },
      { kind: "length", id: "joint", label: "Mortar joint", defaultUnit: "mm", defaultValue: 10, placeholder: "10", optional: true },
      { kind: "number", id: "waste", label: "Waste allowance", suffix: "%", defaultValue: 5, optional: true },
    ],
    compute(values) {
      const wall = netWallArea({
        length: num(values, "length"),
        height: num(values, "height"),
        walls: Math.max(1, num(values, "walls", 1)),
        openingArea: num(values, "openings"),
      });

      // A brick the reader described, fed through the same function the standard
      // sizes use — so a custom brick is not a different calculation.
      const brick: BlockType = {
        id: "custom",
        label: "Brick as entered",
        length: num(values, "brickLength", 230),
        height: num(values, "brickHeight", 76),
        thickness: num(values, "brickWidth", 110),
      };

      // A brick with no size divides by zero inside masonryQuantity, which is
      // how an empty form reaches the screen as "NaN bricks". Refused here.
      if (brick.length <= 0 || brick.height <= 0) {
        return {
          headline: { label: "Bricks to order", value: "—" },
          lines: [],
          formula: ["Enter the brick length and height."],
          warnings: ["A brick needs a length and a height before it can be counted."],
        };
      }

      const jointMm = num(values, "joint", 0.01) * 1000;
      const waste = num(values, "waste", 5);
      const result = masonryQuantity(
        typed("Net wall area", wall.net, "m²", wall.formula.join("; ")),
        brick,
        { jointMm, wastePercent: waste, stated: true },
      );

      const mortarMixResult = cementSandForVolume(result.mortar, "1:4", 0);

      return {
        headline: { label: "Bricks to order", value: String(result.blocksWithWaste), unit: "bricks" },
        lines: [
          { label: "Net wall area", value: wall.net.toFixed(2), unit: "m²" },
          { label: "Bricks per m²", value: result.blocksPerM2.toFixed(2), unit: "bricks/m²", muted: true },
          { label: "Bricks before waste", value: String(result.blocks), unit: "bricks" },
          { label: `Waste (${waste}%)`, value: String(result.blocksWithWaste - result.blocks), unit: "bricks", muted: true },
          { label: "Mortar volume", value: result.mortar.toFixed(3), unit: "m³" },
          { label: "Cement for that mortar (1:4)", value: String(mortarMixResult.cementBags), unit: "bags" },
          { label: "Sand for that mortar", value: mortarMixResult.sandM3.toFixed(2), unit: "m³" },
        ],
        formula: [...wall.formula, result.formula, ...mortarMixResult.formula],
        warnings: wall.warnings,
      };
    },
  },

  {
    slug: "mortar",
    title: "Mortar Calculator",
    category: "masonry",
    summary: "Cement and sand for a volume of mortar, at any mix ratio.",
    keywords: ["mortar", "cement", "sand", "mix", "ratio", "bags", "1:4", "bedding"],
    fields: [
      {
        kind: "select",
        id: "mode",
        label: "Work from",
        options: [
          { value: "area", label: "A wall area and a joint thickness" },
          { value: "volume", label: "A mortar volume I already know" },
        ],
        defaultValue: "area",
      },
      {
        kind: "number",
        id: "area",
        label: "Wall area",
        suffix: "m²",
        placeholder: "40",
        showWhen: { field: "mode", equals: ["area"] },
      },
      {
        kind: "length",
        id: "thickness",
        label: "Average mortar thickness over the wall",
        defaultUnit: "mm",
        defaultValue: 15,
        placeholder: "15",
        showWhen: { field: "mode", equals: ["area"] },
        help: "Bed and perpend joints averaged across the face — about 15 mm for blockwork.",
      },
      {
        kind: "number",
        id: "volume",
        label: "Mortar volume",
        suffix: "m³",
        placeholder: "0.6",
        showWhen: { field: "mode", equals: ["volume"] },
      },
      { kind: "select", id: "mix", label: "Mix ratio (cement : sand)", options: MIX_OPTIONS, defaultValue: "1:4" },
      { kind: "number", id: "waste", label: "Waste allowance", suffix: "%", defaultValue: 10, optional: true },
    ],
    compute(values) {
      const mode = str(values, "mode", "area");
      const working: string[] = [];
      let wetVolume: number;

      if (mode === "area") {
        const area = num(values, "area");
        const thickness = num(values, "thickness", 0.015);
        wetVolume = area * thickness;
        working.push(
          `${area.toFixed(2)} m² × ${(thickness * 1000).toFixed(0)} mm = ${round(wetVolume, 4).toFixed(4)} m³ of mortar`,
        );
      } else {
        wetVolume = num(values, "volume");
      }

      const result = cementSandForVolume(wetVolume, str(values, "mix", "1:4"), num(values, "waste", 10));

      return {
        headline: { label: "Cement", value: String(result.cementBags), unit: "bags of 50 kg" },
        lines: [
          { label: "Mortar volume", value: result.orderedVolume.toFixed(3), unit: "m³" },
          { label: "Cement", value: `${result.cementBags} bags`, unit: `(${result.cementKg} kg)` },
          { label: "Sand", value: result.sandM3.toFixed(2), unit: "m³" },
          { label: "Dry volume used", value: result.dryVolume.toFixed(3), unit: "m³", muted: true },
        ],
        formula: [...working, ...result.formula],
      };
    },
  },
];
