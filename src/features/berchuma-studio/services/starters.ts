/**
 * Openers shown on an empty studio.
 *
 * Their own file rather than living beside the system prompt, because this
 * list is rendered in the browser and the system prompt must not be. Importing
 * one from the other would ship Berchuma's entire instruction set — the
 * catalogue, the rules, the worked example — inside the client bundle, where
 * anyone can read it and anyone can work out how to talk around it.
 *
 * They are written the way a customer talks: a room, a wall, a measurement
 * they half know. Not a list of parameters.
 */

export const STARTER_BRIEFS: { label: string; brief: string }[] = [
  {
    label: "Bedroom wardrobe",
    brief:
      "A 2400 mm wide fitted wardrobe for a bedroom in Addis, floor to ceiling, hanging on both sides and drawers in the middle. Walnut.",
  },
  {
    label: "Kitchen run",
    brief:
      "A 3600 mm kitchen: base units with a sink and a bank of four drawers, wall cupboards above them, a tall oven housing and a fridge space at one end. White melamine, profile handles.",
  },
  {
    label: "TV unit",
    brief:
      "A low TV unit 1800 long and 450 high, floating, with two drawers and open shelving either side. Oak.",
  },
  {
    label: "Shop shelving",
    brief:
      "Open shelving for a hardware shop, 3000 wide and 2100 high, five shelves per bay, no doors, chipboard.",
  },
  {
    label: "Bathroom vanity",
    brief:
      "A 1200 mm wall-hung double vanity, 500 deep, two drawers under each basin, moisture-resistant board.",
  },
  {
    label: "Office storage",
    brief:
      "Office storage 2000 wide by 1800 high with lockable doors at the bottom and open filing above.",
  },
];
