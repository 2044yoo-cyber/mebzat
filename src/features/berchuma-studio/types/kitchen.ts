import { z } from "zod";

export const kitchenSetupSchema = z.object({
  shape: z.enum(["straight", "l_shaped", "u_shaped", "g_shaped", "island"]),
  roomWidth: z.number().min(1800).max(12000),
  roomDepth: z.number().min(1800).max(12000),
  roomHeight: z.number().min(2100).max(5000),
  wallCabinets: z.boolean(),
  wallHeight: z.number().min(400).max(1200),
  topHeight: z.number().min(0).max(1000),
  islandWidth: z.number().min(600).max(4000),
});
export type KitchenSetup = z.infer<typeof kitchenSetupSchema>;
export const DEFAULT_KITCHEN_SETUP: KitchenSetup = {
  shape: "l_shaped", roomWidth: 4200, roomDepth: 3600, roomHeight: 2800,
  wallCabinets: true, wallHeight: 720, topHeight: 400, islandWidth: 1200,
};

export function kitchenSetupError(input: KitchenSetup): string | null {
  const parsed = kitchenSetupSchema.safeParse(input);
  if (!parsed.success) return "Enter valid room and cabinet dimensions.";
  if (input.wallCabinets && 1450 + input.wallHeight + input.topHeight > input.roomHeight)
    return "The upper cabinets exceed the ceiling. Reduce either upper row height.";
  if (["u_shaped", "g_shaped"].includes(input.shape) && input.roomWidth < 2400)
    return "This shape needs at least 240 cm room width for the opposing cabinet runs.";
  if (input.shape === "g_shaped" && input.roomWidth - 1220 - input.islandWidth < 900)
    return "Shorten the peninsula or widen the room to leave a 90 cm entrance.";
  if (input.shape === "island" && (input.roomWidth - input.islandWidth < 1800 || input.roomDepth < 3040))
    return "Allow at least 90 cm around the island: increase the room size or shorten the island.";
  return null;
}
