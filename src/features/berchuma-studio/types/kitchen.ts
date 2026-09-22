import { z } from "zod";

const appliancePosition = z.object({ runId: z.string(), offset: z.number().nonnegative(), width: z.number().min(450).max(1200) });
export const kitchenDetailsSchema = z.object({
  baseDepth: z.number().min(500).max(700), upperDepth: z.number().min(250).max(400),
  baseHeight: z.number().min(800).max(950), plinthHeight: z.number().min(50).max(150),
  upperBottom: z.number().min(1400).max(1800), fridgeHeight: z.number().min(1400).max(2200),
  fridge: appliancePosition, sink: appliancePosition, stove: appliancePosition,
});
export type KitchenDetails = z.infer<typeof kitchenDetailsSchema>;
export const REFERENCE_KITCHEN_DETAILS: KitchenDetails = {
  baseDepth: 550, upperDepth: 300, baseHeight: 890, plinthHeight: 70,
  upperBottom: 1500, fridgeHeight: 1800,
  fridge: { runId: "kitchen-back", offset: 0, width: 700 },
  sink: { runId: "kitchen-back", offset: 700, width: 800 },
  stove: { runId: "kitchen-back", offset: 1500, width: 600 },
};

export const kitchenSetupSchema = z.object({
  placementMode: z.enum(["auto", "plan"]).default("auto"),
  fridgePlacement: z.enum(["left", "right", "custom"]).default("left"),
  shape: z.enum(["straight", "l_shaped", "u_shaped", "g_shaped", "island"]),
  roomWidth: z.number().min(1800).max(12000),
  roomDepth: z.number().min(1800).max(12000),
  roomHeight: z.number().min(2100).max(5000),
  wallCabinets: z.boolean(),
  wallHeight: z.number().min(400).max(1200),
  topHeight: z.number().min(0).max(1000),
  islandWidth: z.number().min(600).max(4000),
  details: kitchenDetailsSchema.optional(),
});
export type KitchenSetup = z.infer<typeof kitchenSetupSchema>;
export const DEFAULT_KITCHEN_SETUP: KitchenSetup = {
  placementMode: "auto", fridgePlacement: "left",
  shape: "l_shaped", roomWidth: 4200, roomDepth: 3600, roomHeight: 2800,
  wallCabinets: true, wallHeight: 720, topHeight: 400, islandWidth: 1200,
};

export function kitchenSetupError(input: KitchenSetup): string | null {
  const parsed = kitchenSetupSchema.safeParse(input);
  if (!parsed.success) return "Enter valid room and cabinet dimensions.";
  if (input.wallCabinets && (input.details?.upperBottom ?? 1450) + input.wallHeight + input.topHeight > input.roomHeight)
    return "The upper cabinets exceed the ceiling. Reduce either upper row height.";
  if (["u_shaped", "g_shaped"].includes(input.shape) && input.roomWidth < 2400)
    return "This shape needs at least 240 cm room width for the opposing cabinet runs.";
  if (input.shape === "g_shaped" && input.roomWidth - 1220 - input.islandWidth < 900)
    return "Shorten the peninsula or widen the room to leave a 90 cm entrance.";
  if (input.shape === "island" && (input.roomWidth - input.islandWidth < 1800 || input.roomDepth < 3040))
    return "Allow at least 90 cm around the island: increase the room size or shorten the island.";
  if (input.details) {
    const d = placeFridgeAtRunEdge(input).details!;
    const runs = kitchenRunChoices(input);
    const intervals = [d.fridge, d.sink, d.stove];
    for (const [index, appliance] of intervals.entries()) {
      const run = runs.find((r) => r.id === appliance.runId);
      if (!run || appliance.offset + appliance.width > run.length) return "An appliance is outside its cabinet run. Choose a wall and position that fit.";
      if (index === 0 && /island|peninsula/.test(appliance.runId)) return "Place the fridge against a wall.";
      for (const other of intervals.slice(index + 1)) if (other.runId === appliance.runId && appliance.offset < other.offset + other.width && other.offset < appliance.offset + appliance.width) return "The fridge, sink and stove spaces must not overlap.";
    }
    for (const run of runs) {
      let end = 0;
      for (const item of intervals.filter((a) => a.runId === run.id).sort((a, b) => a.offset - b.offset)) {
        if (item.offset > end && item.offset - end < 200) return "Leave at least 20 cm for a cabinet between appliance spaces, or place them directly beside each other.";
        end = item.offset + item.width;
      }
      if (run.length > end && run.length - end < 200) return "Leave at least 20 cm for the last cabinet, or extend the appliance space to the run end.";
    }
    if (d.fridgeHeight + 218 > d.upperBottom + input.wallHeight) return "Increase the upper row height to leave at least 20 cm storage above the fridge opening.";
  }
  return null;
}

export function kitchenRunChoices(input: KitchenSetup): { id: string; label: string; length: number }[] {
  const depth = input.details?.baseDepth ?? 600;
  const back = { id: "kitchen-back", label: "Back wall", length: input.roomWidth - (input.shape === "l_shaped" ? depth : ["u_shaped", "g_shaped"].includes(input.shape) ? 2 * depth : 0) };
  const side = (name: string) => ({ id: `kitchen-${name}`, label: `${name === "left" ? "Left" : "Right"} wall`, length: input.roomDepth - depth });
  const runs = [back];
  if (["u_shaped", "g_shaped"].includes(input.shape)) runs.push(side("left"));
  if (["l_shaped", "u_shaped", "g_shaped"].includes(input.shape)) runs.push(side("right"));
  if (["island", "g_shaped"].includes(input.shape)) runs.push({ id: input.shape === "island" ? "kitchen-island" : "kitchen-peninsula", label: input.shape === "island" ? "Island" : "Peninsula", length: input.islandWidth });
  return runs;
}

/** Keep the fridge at an outer terminal, away from L/U/G inside corners. */
export function placeFridgeAtRunEdge(input: KitchenSetup): KitchenSetup {
  if (!input.details) return input;
  const d = input.details;
  const lengths = new Map(kitchenRunChoices(input).map((run) => [run.id, run.length]));
  // Plan mode owns explicit appliance anchors. Only an end choice is resolved;
  // a custom position is never silently moved after the user placed it.
  if (input.placementMode === "plan") {
    if (input.fridgePlacement === "custom") return input;
    const length = lengths.get(d.fridge.runId);
    if (length !== undefined) {
      return {
        ...input,
        details: {
          ...d,
          fridge: {
            ...d.fridge,
            offset: input.fridgePlacement === "right"
              ? Math.max(0, length - d.fridge.width)
              : 0,
          },
        },
      };
    }
  }
  const end = (runId: string) => ({ runId, offset: (lengths.get(runId) ?? 0) - d.fridge.width });
  const candidates = input.shape === "l_shaped"
    ? [{ runId: "kitchen-back", offset: 0 }, end("kitchen-right")]
    : input.shape === "u_shaped"
      ? [end("kitchen-left"), end("kitchen-right")]
      : input.shape === "g_shaped"
        ? [end("kitchen-right")]
        : [{ runId: "kitchen-back", offset: 0 }, end("kitchen-back")];
  const clear = candidates.filter((candidate) => {
    const length = lengths.get(candidate.runId) ?? 0;
    if (candidate.offset < 0 || candidate.offset + d.fridge.width > length) return false;
    return [d.sink, d.stove].every((item) =>
      item.runId !== candidate.runId ||
      candidate.offset + d.fridge.width <= item.offset ||
      item.offset + item.width <= candidate.offset,
    );
  });
  clear.sort((a, b) => {
    const distance = (candidate: typeof a) =>
      candidate.runId === d.fridge.runId
        ? Math.abs(candidate.offset - d.fridge.offset)
        : Number.MAX_SAFE_INTEGER;
    return distance(a) - distance(b);
  });
  const chosen = clear[0];
  if (!chosen) return input;
  return {
    ...input,
    details: { ...d, fridge: { ...d.fridge, ...chosen } },
  };
}
