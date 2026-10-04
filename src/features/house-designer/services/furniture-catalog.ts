/**
 * Basic furniture for spatial planning: a name and a footprint, nothing more.
 *
 * Deliberately not Berchuma's furniture modelling. A bed here answers "does it
 * fit, and is there room to walk round it"; a wardrobe or a kitchen designed
 * properly is Berchuma's job later, against the wall it will stand on.
 * Sizes are common defaults in millimetres; each is editable once placed.
 */
export type FurnitureItem = {
  id: string;
  name: string;
  width: number;
  depth: number;
  height: number;
};

export const FURNITURE_CATALOG: readonly FurnitureItem[] = [
  { id: "bed", name: "Bed", width: 1600, depth: 2000, height: 500 },
  { id: "single-bed", name: "Single bed", width: 900, depth: 2000, height: 500 },
  { id: "sofa", name: "Sofa", width: 2000, depth: 900, height: 850 },
  { id: "chair", name: "Chair", width: 500, depth: 500, height: 900 },
  { id: "table", name: "Table", width: 1600, depth: 900, height: 750 },
  { id: "wardrobe", name: "Wardrobe", width: 1800, depth: 600, height: 2200 },
  { id: "kitchen-counter", name: "Kitchen counter", width: 2400, depth: 600, height: 900 },
  { id: "refrigerator", name: "Refrigerator", width: 700, depth: 700, height: 1800 },
  { id: "sink", name: "Sink", width: 800, depth: 600, height: 900 },
  { id: "toilet", name: "Toilet", width: 400, depth: 700, height: 800 },
  { id: "shower", name: "Shower", width: 900, depth: 900, height: 2100 },
  { id: "cabinet", name: "Cabinet", width: 800, depth: 400, height: 900 },
];

export function furnitureItem(id: string): FurnitureItem {
  return FURNITURE_CATALOG.find((item) => item.id === id) ?? FURNITURE_CATALOG[0]!;
}
