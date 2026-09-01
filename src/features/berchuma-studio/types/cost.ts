/**
 * What a design costs, and where every birr of it came from.
 *
 * The breakdown is not a total with a tooltip. Every line records the quantity,
 * the rate, and — this is the part that matters — whether that rate came from a
 * live supplier listing or from a fallback constant. A customer shown "ETB
 * 84,000" is entitled to know which half of it is priced and which half is
 * guessed, and a quote that cannot answer that is not a quote.
 */

export type RateSource = "listing" | "fallback";

export type CostLine = {
  id: string;
  /** Which section of the panel this belongs under. */
  group: CostGroup;
  label: string;
  quantity: number;
  unit: string;
  /** ETB per unit. */
  rate: number;
  amount: number;
  source: RateSource;
  /** Set when the rate came from a listing, so the panel can link to it. */
  listingId?: string;
  note?: string;
};

export const costGroups = [
  "material",
  "edge_band",
  "hardware",
  "labour",
  "finishing",
  "installation",
  "transport",
] as const;

export type CostGroup = (typeof costGroups)[number];

export type CostBreakdown = {
  currency: string;
  lines: CostLine[];
  /** Sum per group, in the order above. */
  subtotals: Record<CostGroup, number>;
  /** Everything before waste, margin and tax. */
  directCost: number;
  waste: { percent: number; amount: number };
  /** Direct plus waste. What it costs to make. */
  productionCost: number;
  margin: { percent: number; amount: number };
  /** What the customer is quoted, before tax. */
  price: number;
  /** Sheets of each board, and how much of the last one is offcut. */
  sheets: { boardId: string; label: string; count: number; utilisation: number }[];
  /** Working days, from the labour model. */
  productionDays: number;
  /**
   * How much of the price rests on live rates.
   *
   * 100 means every line was priced from a supplier listing. A low number is
   * not a bug — it is the honest state of a young price table — but it must be
   * visible, because it is the difference between a quote and an estimate.
   */
  confidence: number;
  assumptions: string[];
};

/** A rate looked up from `price_listings`, passed in by the caller. */
export type MarketRate = {
  /** Matched against a material's `priceKey`. */
  key: string;
  unit: string;
  amount: number;
  currency: string;
  listingId: string;
};

/**
 * The shop's own numbers.
 *
 * These are the figures that vary between one joinery and the next — how fast
 * they work, what they charge for a day, what margin they take. Defaults are
 * provided because a first-time user has none, and every one of them appears
 * in `assumptions` when it is used unchanged.
 */
export type ShopRates = {
  /** ETB for one joiner for one day. */
  labourDayRate: number;
  /**
   * Minutes of shop time per panel — cut, edged, drilled and handled.
   *
   * Thirty is measured against a full-height wardrobe gable, which is a
   * two-person lift onto the saw. A first pass at twelve produced 1.6
   * person-days for a three-bay wardrobe, which is roughly a third of what
   * such a job actually takes.
   */
  minutesPerPart: number;
  /** Extra minutes per door leaf — hinge boring, hanging, adjustment. */
  minutesPerDoor: number;
  /** Extra minutes per drawer — box assembly, runners, front alignment. */
  minutesPerDrawer: number;
  /** Joiners on the job. Halves the calendar time, not the cost. */
  crewSize: number;
  /** Hours in a working day. */
  hoursPerDay: number;
  /** Board offcut as a share of the area used. Replaced by real nesting later. */
  wastePercent: number;
  /** ETB per m² of sprayed finish, zero for foil and melamine. */
  finishingRatePerSqm: number;
  /** Fitting on site, as a share of production cost. */
  installationPercent: number;
  /** Delivery within the city. */
  transportFlat: number;
  marginPercent: number;
};

export const DEFAULT_SHOP_RATES: ShopRates = {
  labourDayRate: 1200,
  minutesPerPart: 30,
  minutesPerDoor: 45,
  minutesPerDrawer: 60,
  crewSize: 2,
  hoursPerDay: 8,
  wastePercent: 15,
  finishingRatePerSqm: 0,
  installationPercent: 8,
  transportFlat: 2500,
  marginPercent: 25,
};
