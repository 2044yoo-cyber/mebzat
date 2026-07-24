export type MaterialCategory = {
  label: string;
  emoji: string;
  materials: string[];
};

export const MATERIAL_CATEGORIES: MaterialCategory[] = [
  {
    label: "Structural",
    emoji: "🧱",
    materials: [
      "Concrete",
      "Cement",
      "Rebar",
      "Steel",
      "Blocks",
      "Bricks",
      "Sand",
      "Gravel",
      "Aggregate",
      "Asphalt",
    ],
  },
  {
    label: "Roofing",
    emoji: "🏠",
    materials: [
      "Corrugated Sheet",
      "Tile Roof",
      "Metal Roof",
      "Waterproof Membrane",
      "Insulation",
      "Roof Truss",
    ],
  },
  {
    label: "Doors & Windows",
    emoji: "🪟",
    materials: [
      "Aluminum",
      "uPVC",
      "Glass",
      "Tempered Glass",
      "Wooden Door",
      "Steel Door",
      "Sliding Door",
    ],
  },
  {
    label: "Wood & Carpentry",
    emoji: "🪵",
    materials: [
      "Plywood",
      "MDF",
      "Hardwood",
      "Softwood",
      "Laminate",
      "Veneer",
      "Timber",
    ],
  },
  {
    label: "Finishes",
    emoji: "🎨",
    materials: [
      "Paint",
      "Primer",
      "Wallpaper",
      "Plaster",
      "Gypsum Board",
      "Ceiling Board",
      "Decorative Stone",
    ],
  },
  {
    label: "Flooring",
    emoji: "🛁",
    materials: [
      "Ceramic Tile",
      "Porcelain Tile",
      "Marble",
      "Granite",
      "Vinyl",
      "SPC Flooring",
      "Hardwood Flooring",
      "Epoxy Floor",
    ],
  },
  {
    label: "Plumbing",
    emoji: "🚿",
    materials: [
      "PVC Pipe",
      "PPR Pipe",
      "HDPE Pipe",
      "Water Tank",
      "Toilet",
      "Wash Basin",
      "Shower",
      "Faucet",
    ],
  },
  {
    label: "Electrical",
    emoji: "⚡",
    materials: [
      "Cable",
      "Switch",
      "Socket",
      "LED Light",
      "Distribution Board",
      "Breaker",
      "Solar Panel",
      "Inverter",
    ],
  },
  {
    label: "HVAC",
    emoji: "❄️",
    materials: [
      "Air Conditioner",
      "Ventilation",
      "Duct",
      "Exhaust Fan",
      "Heat Pump",
    ],
  },
  {
    label: "Exterior",
    emoji: "🌳",
    materials: [
      "Fence",
      "Gate",
      "Interlocking Block",
      "Landscaping",
      "Artificial Grass",
      "Natural Stone",
    ],
  },
];
