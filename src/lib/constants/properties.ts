import type {
  Furnishing,
  ListingKind,
  PlaceKind,
  PropertyMediaKind,
  PropertyStatus,
  PropertyType,
} from "@/types/database.types";

/** Labels and options for the property module. Safe to import on the client. */

export const PROPERTY_TYPE: Record<
  PropertyType,
  { label: string; group: "residential" | "commercial" | "industrial" | "land" }
> = {
  apartment: { label: "Apartment", group: "residential" },
  villa: { label: "Villa", group: "residential" },
  house: { label: "House", group: "residential" },
  commercial: { label: "Commercial", group: "commercial" },
  office: { label: "Office", group: "commercial" },
  shop: { label: "Shop", group: "commercial" },
  hotel: { label: "Hotel", group: "commercial" },
  restaurant: { label: "Restaurant", group: "commercial" },
  warehouse: { label: "Warehouse", group: "industrial" },
  factory: { label: "Factory", group: "industrial" },
  industrial: { label: "Industrial", group: "industrial" },
  land: { label: "Land", group: "land" },
  farm: { label: "Farm", group: "land" },
  mixed_use: { label: "Mixed use", group: "commercial" },
};

export const PROPERTY_TYPES = Object.keys(PROPERTY_TYPE) as PropertyType[];

export function isPropertyType(value: unknown): value is PropertyType {
  return typeof value === "string" && value in PROPERTY_TYPE;
}

/** Grouped for the picker, so fourteen options stay scannable. */
export const PROPERTY_TYPE_GROUPS: {
  label: string;
  types: PropertyType[];
}[] = [
  { label: "Residential", types: ["apartment", "villa", "house"] },
  {
    label: "Commercial",
    types: ["office", "shop", "commercial", "hotel", "restaurant", "mixed_use"],
  },
  { label: "Industrial", types: ["warehouse", "factory", "industrial"] },
  { label: "Land", types: ["land", "farm"] },
];

/** Types measured by plot rather than built area, and with no bedrooms. */
export const LAND_TYPES: PropertyType[] = ["land", "farm"];

export function isLandType(type: PropertyType): boolean {
  return LAND_TYPES.includes(type);
}

export const LISTING_KIND: Record<ListingKind, string> = {
  sale: "For sale",
  rent: "For rent",
  lease: "For lease",
  auction: "Auction",
};

export function isListingKind(value: unknown): value is ListingKind {
  return typeof value === "string" && value in LISTING_KIND;
}

export const PROPERTY_STATUS: Record<PropertyStatus, string> = {
  draft: "Draft",
  available: "Available",
  under_offer: "Under offer",
  sold: "Sold",
  rented: "Rented",
  withdrawn: "Withdrawn",
};

export const FURNISHING: Record<Furnishing, string> = {
  unfurnished: "Unfurnished",
  semi_furnished: "Semi-furnished",
  furnished: "Furnished",
};

export const PLACE_KIND: Record<PlaceKind, { label: string; colour: string }> = {
  school: { label: "School", colour: "#3b82f6" },
  university: { label: "University", colour: "#3b82f6" },
  hospital: { label: "Hospital", colour: "#ef4444" },
  clinic: { label: "Clinic", colour: "#ef4444" },
  pharmacy: { label: "Pharmacy", colour: "#ec4899" },
  supermarket: { label: "Supermarket", colour: "#f59e0b" },
  market: { label: "Market", colour: "#f59e0b" },
  bank: { label: "Bank", colour: "#10b981" },
  restaurant: { label: "Restaurant", colour: "#f97316" },
  cafe: { label: "Café", colour: "#f97316" },
  hotel: { label: "Hotel", colour: "#8b5cf6" },
  park: { label: "Park", colour: "#22c55e" },
  gym: { label: "Gym", colour: "#06b6d4" },
  place_of_worship: { label: "Place of worship", colour: "#a855f7" },
  bus_stop: { label: "Bus stop", colour: "#64748b" },
  transport_hub: { label: "Transport", colour: "#64748b" },
  fuel: { label: "Fuel", colour: "#64748b" },
  police: { label: "Police", colour: "#1d4ed8" },
  government: { label: "Government", colour: "#1d4ed8" },
};

/** The categories the "what's nearby" panel groups into. */
export const NEARBY_GROUPS: { label: string; kinds: PlaceKind[] }[] = [
  { label: "Schools", kinds: ["school", "university"] },
  { label: "Healthcare", kinds: ["hospital", "clinic", "pharmacy"] },
  { label: "Shopping", kinds: ["supermarket", "market"] },
  { label: "Services", kinds: ["bank", "fuel", "police", "government"] },
  { label: "Leisure", kinds: ["park", "gym", "restaurant", "cafe", "hotel"] },
  { label: "Transport", kinds: ["bus_stop", "transport_hub"] },
];

/**
 * Media kinds and whether a viewer exists for them yet.
 *
 * The schema accepts all of these. `ready: false` means the upload is stored
 * and returned but not rendered — listed here so nothing silently disappears
 * and the roadmap is legible from the code.
 */
export const PROPERTY_MEDIA_KIND: Record<
  PropertyMediaKind,
  { label: string; ready: boolean }
> = {
  photo: { label: "Photo", ready: true },
  floor_plan: { label: "Floor plan", ready: true },
  site_plan: { label: "Site plan", ready: true },
  video: { label: "Video", ready: true },
  panorama_360: { label: "360° panorama", ready: false },
  drone_video: { label: "Drone video", ready: false },
  street_view: { label: "Street view", ready: false },
  virtual_tour: { label: "Virtual tour", ready: false },
  ar_model: { label: "AR model", ready: false },
};

export const AMENITIES = [
  "Parking",
  "Lift",
  "Generator",
  "Water tank",
  "Borehole",
  "Security",
  "CCTV",
  "Garden",
  "Balcony",
  "Terrace",
  "Swimming pool",
  "Gym",
  "Servant quarters",
  "Store room",
  "Air conditioning",
  "Solar water heater",
  "Fitted kitchen",
  "Fibre internet",
  "Wheelchair access",
  "Gated compound",
] as const;

export const BEDROOM_OPTIONS = [1, 2, 3, 4, 5] as const;

/** Price buckets for the homepage quick search, in ETB. */
export const PRICE_BANDS: { label: string; min?: number; max?: number }[] = [
  { label: "Any price" },
  { label: "Under 3M", max: 3_000_000 },
  { label: "3M – 8M", min: 3_000_000, max: 8_000_000 },
  { label: "8M – 15M", min: 8_000_000, max: 15_000_000 },
  { label: "15M – 30M", min: 15_000_000, max: 30_000_000 },
  { label: "Over 30M", min: 30_000_000 },
];

export const AREA_BANDS: { label: string; min?: number }[] = [
  { label: "Any size" },
  { label: "50 m²+", min: 50 },
  { label: "100 m²+", min: 100 },
  { label: "200 m²+", min: 200 },
  { label: "400 m²+", min: 400 },
  { label: "1000 m²+", min: 1000 },
];

/** Compact money for map pins, where "ETB 22,000,000" will not fit. */
export function shortPrice(
  amount: number | null,
  currency = "ETB",
  period?: string | null,
): string {
  if (amount === null) return "On request";

  const suffix = period ? `/${period.slice(0, 2)}` : "";
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    return `${currency} ${millions % 1 === 0 ? millions : millions.toFixed(1)}M${suffix}`;
  }
  if (amount >= 1_000) {
    return `${currency} ${Math.round(amount / 1_000)}K${suffix}`;
  }
  return `${currency} ${amount}${suffix}`;
}
