/**
 * What a profession is asked, over and above what everybody is asked.
 *
 * ## The failure this ends
 *
 * One profile form served everybody. An architect was asked for a crew size
 * and a list of plant; an electrician was asked for a BIM capability and a
 * portfolio of visualisations; a carpenter was asked for a maximum project
 * value in birr. All three answered honestly by leaving the boxes empty, and
 * all three were then told their profile was incomplete — by a bar that used
 * the same denominator for every trade, so the professions with the most to
 * say scored highest and the ones with least were permanently unfinished.
 *
 * The rule here is the opposite: **a profession's bar is built from that
 * profession's own required fields.** A contractor fills in fifteen and is at
 * 100%. An architect fills in nine and is at 100%. An electrician fills in six
 * and is at 100%. All three are equally complete, because complete means "you
 * have told us everything we ask of somebody who does what you do".
 *
 * ## One configuration, not a page per trade
 *
 * There is no `ContractorProfileForm`. There is this file, a renderer that
 * walks it, and the existing profile form the renderer sits inside. Adding a
 * trade is an entry here; it is never a route, a component or a migration.
 *
 * ## Where the answers live
 *
 * `profiles.profession_details`, a jsonb column added by 0098, keyed by field
 * id. Not columns: eighty columns that are null for everybody but one trade is
 * a table nobody can read, and each new trade would be a migration — the exact
 * reason the trade list itself is text and not an enum.
 *
 * The key space is flat and deliberately shared. `software_used` means the
 * same thing to an architect and to a structural engineer, so somebody who is
 * both answers it once. Ids are therefore written to be true on their own —
 * `crew_size`, not `size` — because a key that only makes sense next to one
 * profession is a key that means something else next to the next one.
 *
 * ## Changing trade never deletes anything
 *
 * Nothing in here removes a key. A carpenter who becomes a contractor stops
 * being *shown* the carpenter's questions, and their answers stay in the
 * column; going back finds them where they were. `detailsToWrite` merges over
 * what is stored rather than replacing it, which is what makes that true.
 *
 * ## Two professions at once
 *
 * Not built, not blocked. Everything below takes a *list* of professions and
 * the callers pass a list of one. The day `profiles.profession` becomes more
 * than one answer, `fieldsFor` already unions the sets and de-duplicates by
 * id, and the shared key space means the two never fight over an answer.
 */

import type { Profile } from "@/types/database.types";

export type ProfessionFieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "multi"
  | "boolean";

export type ProfessionField = {
  /** The key in `profession_details`. Stable; renaming one loses answers. */
  id: string;
  label: string;
  type: ProfessionFieldType;
  /** Counts towards this profession's completion. */
  required?: boolean;
  /** For `select` and `multi`. */
  options?: readonly string[];
  help?: string;
  placeholder?: string;
};

/** A stored answer. `multi` holds a list; `boolean` a tick; the rest text. */
export type FieldValue = string | number | boolean | string[] | null;

export type ProfessionDetails = Record<string, FieldValue>;

// ---------------------------------------------------------------------------
// Option sets used by more than one trade
// ---------------------------------------------------------------------------
//
// Named once so "Residential" is spelled the same way in seven places. A
// filter that matches on these strings is one release away, and seven
// spellings would be seven bugs in it.

const SECTORS = [
  "Residential",
  "Commercial",
  "Industrial",
  "Institutional",
  "Infrastructure",
] as const;

const CAD = [
  "AutoCAD",
  "Revit",
  "ArchiCAD",
  "SketchUp",
  "Rhino",
  "3ds Max",
  "Lumion",
  "Enscape",
] as const;

const PROJECT_VALUES = [
  "Under 500,000 ETB",
  "500,000 – 2 million ETB",
  "2 – 10 million ETB",
  "10 – 50 million ETB",
  "Over 50 million ETB",
] as const;

const CAPACITY = [
  "Taking on work now",
  "Limited capacity",
  "Fully committed",
] as const;

// ---------------------------------------------------------------------------
// Everybody, whatever they do
// ---------------------------------------------------------------------------
//
// These are columns on `profiles` and are asked by the profile form as it
// always has. They are listed here so that "what is a professional asked?" has
// one answer rather than two halves in two files, and so the completion rule
// can weigh the common half against the specific half in one place.
//
// `filled` reads the profile row; the profession fields below read the jsonb.
// That difference is the only reason these are a separate shape.

export type CommonField = {
  id: string;
  label: string;
  required: boolean;
  weight: number;
  filled: (profile: Profile) => boolean;
};

const text = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0;

export const COMMON_FIELDS: readonly CommonField[] = [
  {
    id: "name",
    label: "Name or company name",
    required: true,
    weight: 10,
    filled: (p) => text(p.full_name) || text(p.company_name),
  },
  {
    id: "avatar",
    label: "Profile photo or logo",
    required: true,
    weight: 10,
    filled: (p) => text(p.avatar_url),
  },
  {
    id: "profession",
    label: "Profession",
    required: true,
    weight: 10,
    filled: (p) => text(p.profession),
  },
  {
    id: "location",
    label: "Where you are",
    required: true,
    weight: 10,
    filled: (p) => text(p.location_city) || text(p.base_area),
  },
  {
    id: "service_areas",
    label: "Where you can work",
    required: true,
    weight: 10,
    // `serves_entire_city` is an answer to this question, and a complete one.
    // Without this clause somebody who works anywhere in Addis was told they
    // had not said where they work.
    filled: (p) =>
      p.serves_entire_city === true ||
      text(p.base_area) ||
      text(p.location_city),
  },
  {
    id: "years_experience",
    label: "Years of experience",
    required: true,
    weight: 10,
    filled: (p) =>
      p.years_experience !== null && p.years_experience !== undefined,
  },
  {
    id: "bio",
    label: "About you",
    required: true,
    weight: 10,
    filled: (p) => text(p.bio),
  },
  {
    id: "contact",
    label: "Contact details",
    required: true,
    weight: 10,
    filled: (p) => text(p.phone),
  },
  {
    id: "availability",
    label: "Availability",
    required: true,
    weight: 5,
    filled: (p) => text(p.work_status),
  },
  {
    id: "portfolio",
    label: "Portfolio or past projects",
    required: false,
    weight: 5,
    filled: (p) => text(p.portfolio_link),
  },
];

// ---------------------------------------------------------------------------
// The trades
// ---------------------------------------------------------------------------

/**
 * A contractor's profile is the longest here, and that is the point.
 *
 * Somebody choosing between two builders for a four-storey block is deciding
 * on crew size, plant, capacity and what the firm has actually finished. Every
 * one of those questions is refusing to appear on an architect's form below.
 */
const CONTRACTOR: readonly ProfessionField[] = [
  {
    id: "contractor_type",
    label: "Type of contractor",
    type: "select",
    required: true,
    options: [
      "General contractor",
      "Building contractor",
      "Civil works contractor",
      "Finishing contractor",
      "MEP contractor",
      "Specialist subcontractor",
    ],
  },
  {
    id: "sectors",
    label: "Sectors you build in",
    type: "multi",
    required: true,
    options: SECTORS,
  },
  {
    id: "work_types",
    label: "Kinds of work",
    type: "multi",
    required: true,
    options: [
      "New construction",
      "Renovation",
      "Extension",
      "Finishing",
      "Fit-out",
      "Demolition",
    ],
  },
  {
    id: "engagement",
    label: "How you take work on",
    type: "multi",
    required: true,
    options: [
      "Labour only",
      "Labour and materials",
      "Turnkey",
      "Management contracting",
    ],
  },
  {
    id: "crew_size",
    label: "Crew size",
    type: "number",
    required: true,
    help: "People you can put on site.",
  },
  {
    id: "max_project_value",
    label: "Largest project you take",
    type: "select",
    required: true,
    options: PROJECT_VALUES,
  },
  {
    id: "equipment",
    label: "Plant and equipment",
    type: "textarea",
    required: true,
    placeholder:
      "Concrete mixer, scaffolding for 4 floors, one pickup, vibrator…",
  },
  {
    id: "current_capacity",
    label: "Capacity right now",
    type: "select",
    required: true,
    options: CAPACITY,
  },
  {
    id: "completed_projects",
    label: "Projects completed",
    type: "number",
    required: true,
  },
  {
    id: "active_projects",
    label: "Projects running now",
    type: "number",
    required: true,
  },
  {
    id: "licence_grade",
    label: "Licence grade",
    type: "text",
    required: true,
    placeholder: "GC-7, BC-5, RC-3…",
  },
  {
    id: "certifications",
    label: "Licences and certificates",
    type: "textarea",
    required: true,
  },
  {
    id: "subcontracting",
    label: "Subcontracting",
    type: "select",
    required: true,
    options: [
      "We subcontract parts out",
      "We take subcontracts",
      "Both",
      "Neither",
    ],
  },
  {
    id: "years_in_business",
    label: "Years in business",
    type: "number",
    required: true,
  },
  {
    id: "references_available",
    label: "References available on request",
    type: "boolean",
    required: true,
  },
  { id: "insurance", label: "Insurance", type: "text" },
  { id: "safety_record", label: "Safety record or policy", type: "textarea" },
  { id: "notable_projects", label: "Notable projects", type: "textarea" },
];

/**
 * An architect is asked nine things, and none of them is a crew size.
 *
 * This is the comparison the brief draws and the one this file exists to make
 * true: an architect at 100% has answered nine questions, a contractor at 100%
 * has answered fifteen, and neither is more complete than the other.
 */
const ARCHITECT: readonly ProfessionField[] = [
  {
    id: "sectors",
    label: "Sectors you design for",
    type: "multi",
    required: true,
    options: [...SECTORS, "Hospitality"],
  },
  {
    id: "design_services",
    label: "Services you offer",
    type: "multi",
    required: true,
    options: [
      "Concept design",
      "Detailed design",
      "Permit drawings",
      "3D visualisation",
      "BIM services",
      "Site supervision",
      "Interior design",
    ],
  },
  {
    id: "software_used",
    label: "Software you work in",
    type: "multi",
    required: true,
    options: CAD,
  },
  {
    id: "licence_number",
    label: "Licence number",
    type: "text",
    required: true,
  },
  {
    id: "professional_body",
    label: "Professional body",
    type: "text",
    required: true,
    placeholder: "Association of Ethiopian Architects",
  },
  {
    id: "remote_consultation",
    label: "Available for remote consultation",
    type: "boolean",
    required: true,
  },
  {
    id: "portfolio_types",
    label: "What you have built",
    type: "multi",
    required: true,
    options: [
      "Villas",
      "Apartment blocks",
      "Offices",
      "Hotels",
      "Schools",
      "Retail",
      "Mixed-use",
      "Interiors",
    ],
  },
  {
    id: "typical_project_size",
    label: "Typical project size",
    type: "select",
    required: true,
    options: PROJECT_VALUES,
  },
  {
    id: "design_lead_time",
    label: "Lead time for a concept",
    type: "select",
    required: true,
    options: ["Under 2 weeks", "2 – 4 weeks", "1 – 2 months", "Over 2 months"],
  },
  { id: "awards", label: "Awards or publications", type: "textarea" },
];

/**
 * An electrical engineer is asked about power, not about plant or elevations.
 *
 * The three lists below — sectors, services, systems — are the questions a
 * client actually asks, and the contractor's crew size and the architect's
 * visualisation software are both absent on purpose.
 */
const ELECTRICAL_ENGINEER: readonly ProfessionField[] = [
  {
    id: "sectors",
    label: "Sectors you work in",
    type: "multi",
    required: true,
    options: SECTORS,
  },
  {
    id: "engineering_services",
    label: "Services you offer",
    type: "multi",
    required: true,
    options: [
      "Electrical design",
      "Installation",
      "Supervision",
      "Testing and commissioning",
      "Energy audit",
    ],
  },
  {
    id: "electrical_systems",
    label: "Systems you handle",
    type: "multi",
    required: true,
    options: [
      "Power systems",
      "Lighting",
      "Low-voltage and data",
      "Solar and renewable",
      "Generators",
      "Earthing and lightning protection",
      "Fire alarm",
    ],
  },
  {
    id: "software_used",
    label: "Software and tools",
    type: "multi",
    required: true,
    options: ["AutoCAD", "DIALux", "ETAP", "Revit MEP", "EasyPower", "Excel"],
  },
  {
    id: "licence_number",
    label: "Licence number",
    type: "text",
    required: true,
  },
  {
    id: "professional_body",
    label: "Professional body",
    type: "text",
    required: true,
  },
  {
    id: "max_load_handled",
    label: "Largest installation you have designed",
    type: "select",
    required: true,
    options: [
      "Up to 100 kVA",
      "100 – 500 kVA",
      "500 kVA – 2 MVA",
      "Over 2 MVA",
    ],
  },
  {
    id: "portfolio_types",
    label: "What you have worked on",
    type: "multi",
    required: true,
    options: [
      "Villas",
      "Apartment blocks",
      "Offices",
      "Factories",
      "Hospitals",
      "Solar installations",
    ],
  },
  {
    id: "remote_consultation",
    label: "Available for remote consultation",
    type: "boolean",
  },
];

const INTERIOR_DESIGNER: readonly ProfessionField[] = [
  {
    id: "sectors",
    label: "Sectors you design for",
    type: "multi",
    required: true,
    options: ["Residential", "Offices", "Hospitality", "Retail", "Healthcare"],
  },
  {
    id: "design_services",
    label: "Services you offer",
    type: "multi",
    required: true,
    options: [
      "Concept design",
      "Space planning",
      "Furniture selection",
      "Lighting design",
      "Fit-out supervision",
      "3D visualisation",
    ],
  },
  {
    id: "software_used",
    label: "Software you work in",
    type: "multi",
    required: true,
    options: CAD,
  },
  {
    id: "typical_project_size",
    label: "Typical project size",
    type: "select",
    required: true,
    options: PROJECT_VALUES,
  },
  {
    id: "portfolio_types",
    label: "What you have fitted out",
    type: "multi",
    required: true,
    options: [
      "Villas",
      "Apartments",
      "Offices",
      "Cafés and restaurants",
      "Hotels",
      "Shops",
    ],
  },
  {
    id: "styles",
    label: "Styles you work in",
    type: "text",
    required: true,
    placeholder: "Minimal, traditional Ethiopian, industrial…",
  },
  {
    id: "remote_consultation",
    label: "Available for remote consultation",
    type: "boolean",
    required: true,
  },
  {
    id: "supplier_network",
    label: "Suppliers and makers you work with",
    type: "textarea",
  },
];

const STRUCTURAL_ENGINEER: readonly ProfessionField[] = [
  {
    id: "sectors",
    label: "Sectors you work in",
    type: "multi",
    required: true,
    options: SECTORS,
  },
  {
    id: "engineering_services",
    label: "Services you offer",
    type: "multi",
    required: true,
    options: [
      "Structural design",
      "Analysis",
      "Detailing",
      "Site supervision",
      "Assessment of existing buildings",
    ],
  },
  {
    id: "structure_types",
    label: "Structures you design",
    type: "multi",
    required: true,
    options: ["RC frame", "Steel", "Masonry", "Composite", "Precast", "Timber"],
  },
  {
    id: "software_used",
    label: "Software you work in",
    type: "multi",
    required: true,
    options: [
      "ETABS",
      "SAP2000",
      "SAFE",
      "Prokon",
      "Tekla",
      "AutoCAD",
      "Revit",
    ],
  },
  {
    id: "max_storeys",
    label: "Tallest building you have designed",
    type: "select",
    required: true,
    options: [
      "Up to 3 storeys",
      "4 – 8 storeys",
      "9 – 15 storeys",
      "Over 15 storeys",
    ],
  },
  {
    id: "licence_number",
    label: "Licence number",
    type: "text",
    required: true,
  },
  {
    id: "professional_body",
    label: "Professional body",
    type: "text",
    required: true,
  },
  {
    id: "design_codes",
    label: "Codes you design to",
    type: "text",
    placeholder: "EBCS, Eurocode, ACI…",
  },
];

const CIVIL_ENGINEER: readonly ProfessionField[] = [
  {
    id: "sectors",
    label: "Sectors you work in",
    type: "multi",
    required: true,
    options: SECTORS,
  },
  {
    id: "engineering_services",
    label: "Services you offer",
    type: "multi",
    required: true,
    options: [
      "Design",
      "Site supervision",
      "Quantity take-off",
      "Project management",
      "Testing",
    ],
  },
  {
    id: "works_types",
    label: "Works you handle",
    type: "multi",
    required: true,
    options: [
      "Roads",
      "Drainage",
      "Water supply",
      "Earthworks",
      "Foundations",
      "Bridges",
      "Retaining structures",
    ],
  },
  {
    id: "software_used",
    label: "Software you work in",
    type: "multi",
    required: true,
    options: ["AutoCAD", "Civil 3D", "ETABS", "Prokon", "Excel", "Primavera"],
  },
  {
    id: "licence_number",
    label: "Licence number",
    type: "text",
    required: true,
  },
  {
    id: "professional_body",
    label: "Professional body",
    type: "text",
    required: true,
  },
];

const MECHANICAL_ENGINEER: readonly ProfessionField[] = [
  {
    id: "sectors",
    label: "Sectors you work in",
    type: "multi",
    required: true,
    options: SECTORS,
  },
  {
    id: "engineering_services",
    label: "Services you offer",
    type: "multi",
    required: true,
    options: [
      "Design",
      "Installation supervision",
      "Testing and commissioning",
      "Maintenance",
    ],
  },
  {
    id: "mechanical_systems",
    label: "Systems you handle",
    type: "multi",
    required: true,
    options: [
      "HVAC",
      "Plumbing",
      "Fire protection",
      "Lifts and escalators",
      "Compressed air",
      "Cold rooms",
    ],
  },
  {
    id: "software_used",
    label: "Software you work in",
    type: "multi",
    required: true,
    options: ["AutoCAD", "Revit MEP", "HAP", "Pipe Flow", "Excel"],
  },
  {
    id: "licence_number",
    label: "Licence number",
    type: "text",
    required: true,
  },
  { id: "professional_body", label: "Professional body", type: "text" },
];

const MEP_ENGINEER: readonly ProfessionField[] = [
  {
    id: "sectors",
    label: "Sectors you work in",
    type: "multi",
    required: true,
    options: SECTORS,
  },
  {
    id: "mep_disciplines",
    label: "Disciplines you cover",
    type: "multi",
    required: true,
    options: ["Mechanical", "Electrical", "Plumbing", "Fire", "BMS"],
  },
  {
    id: "engineering_services",
    label: "Services you offer",
    type: "multi",
    required: true,
    options: [
      "Design",
      "Coordination",
      "Installation supervision",
      "Testing and commissioning",
    ],
  },
  {
    id: "software_used",
    label: "Software you work in",
    type: "multi",
    required: true,
    options: ["AutoCAD", "Revit MEP", "Navisworks", "DIALux", "HAP"],
  },
  {
    id: "bim_services",
    label: "BIM coordination offered",
    type: "boolean",
    required: true,
  },
  {
    id: "licence_number",
    label: "Licence number",
    type: "text",
    required: true,
  },
  { id: "professional_body", label: "Professional body", type: "text" },
];

const QUANTITY_SURVEYOR: readonly ProfessionField[] = [
  {
    id: "sectors",
    label: "Sectors you work in",
    type: "multi",
    required: true,
    options: SECTORS,
  },
  {
    id: "qs_services",
    label: "Services you offer",
    type: "multi",
    required: true,
    options: [
      "Bills of quantities",
      "Cost estimating",
      "Valuations and interim payments",
      "Variations and claims",
      "Tender documentation",
      "Final accounts",
    ],
  },
  {
    id: "contract_forms",
    label: "Contract forms you work with",
    type: "multi",
    required: true,
    options: ["FIDIC", "PPA / MoWUD", "Bespoke", "Sub-contract forms"],
  },
  {
    id: "software_used",
    label: "Software you work in",
    type: "multi",
    required: true,
    options: ["CostX", "Candy", "Excel", "Buildsoft", "Primavera"],
  },
  {
    id: "professional_body",
    label: "Professional body",
    type: "text",
    required: true,
  },
  {
    id: "largest_boq",
    label: "Largest contract measured",
    type: "select",
    required: true,
    options: PROJECT_VALUES,
  },
];

const SURVEYOR: readonly ProfessionField[] = [
  {
    id: "survey_types",
    label: "Surveys you carry out",
    type: "multi",
    required: true,
    options: [
      "Topographic",
      "Boundary and cadastral",
      "Setting out",
      "As-built",
      "Volume and earthworks",
    ],
  },
  {
    id: "equipment_owned",
    label: "Instruments you own",
    type: "multi",
    required: true,
    options: [
      "Total station",
      "GPS / RTK",
      "Automatic level",
      "Drone",
      "Laser scanner",
    ],
  },
  {
    id: "deliverables",
    label: "What you hand over",
    type: "multi",
    required: true,
    options: [
      "CAD drawings",
      "Coordinate lists",
      "Contour maps",
      "Volume reports",
      "Point clouds",
    ],
  },
  {
    id: "sectors",
    label: "Sectors you work in",
    type: "multi",
    required: true,
    options: SECTORS,
  },
  {
    id: "licence_number",
    label: "Licence number",
    type: "text",
    required: true,
  },
];

// ---------------------------------------------------------------------------
// The trades, which get short forms
// ---------------------------------------------------------------------------
//
// Three or four questions each. A carpenter is not running a business with a
// capacity plan and a licence grade, and asking him to fill one in to reach
// 100% is the bar-nobody-can-finish bug in its original form.

const CARPENTER: readonly ProfessionField[] = [
  {
    id: "work_types",
    label: "What you make",
    type: "multi",
    required: true,
    options: [
      "Doors and frames",
      "Cabinets",
      "Wardrobes",
      "Roof timber",
      "Formwork",
      "Flooring",
      "Skirting and trim",
    ],
  },
  {
    id: "materials",
    label: "Materials you work in",
    type: "multi",
    required: true,
    options: ["Solid wood", "MDF", "Plywood", "Chipboard", "Veneer"],
  },
  {
    id: "own_workshop",
    label: "I have my own workshop",
    type: "boolean",
    required: true,
  },
  { id: "tools_owned", label: "Tools you bring", type: "text" },
];

const FURNITURE_MAKER: readonly ProfessionField[] = [
  {
    id: "product_types",
    label: "What you make",
    type: "multi",
    required: true,
    options: [
      "Kitchen units",
      "Wardrobes",
      "Beds",
      "Office furniture",
      "Shop fittings",
      "Chairs and tables",
      "TV units",
    ],
  },
  {
    id: "materials",
    label: "Materials you work in",
    type: "multi",
    required: true,
    options: ["Solid wood", "MDF", "Plywood", "Chipboard", "Metal", "Glass"],
  },
  {
    id: "own_workshop",
    label: "I have my own workshop",
    type: "boolean",
    required: true,
  },
  { id: "finishes", label: "Finishes you offer", type: "text" },
  { id: "made_to_order", label: "I take made-to-order work", type: "boolean" },
];

const WELDER: readonly ProfessionField[] = [
  {
    id: "work_types",
    label: "What you fabricate",
    type: "multi",
    required: true,
    options: [
      "Gates",
      "Handrails",
      "Roof structures",
      "Window frames",
      "Security doors",
      "Steel furniture",
      "Water tank stands",
    ],
  },
  {
    id: "welding_types",
    label: "Welding you do",
    type: "multi",
    required: true,
    options: ["Arc / MMA", "MIG", "TIG", "Gas"],
  },
  {
    id: "own_machine",
    label: "I bring my own machine",
    type: "boolean",
    required: true,
  },
  { id: "materials", label: "Metals you work in", type: "text" },
];

const PLUMBER: readonly ProfessionField[] = [
  {
    id: "work_types",
    label: "What you install",
    type: "multi",
    required: true,
    options: [
      "Bathrooms",
      "Kitchens",
      "Water tanks",
      "Drainage",
      "Pumps",
      "Water heaters",
      "Leak repair",
    ],
  },
  {
    id: "pipe_materials",
    label: "Pipework you use",
    type: "multi",
    required: true,
    options: ["PPR", "PVC", "GI", "Copper", "PEX"],
  },
  {
    id: "emergency_callouts",
    label: "I take emergency call-outs",
    type: "boolean",
    required: true,
  },
  { id: "own_tools", label: "I bring my own tools", type: "boolean" },
];

/**
 * Six questions, and then an electrician is finished.
 *
 * The figure in the brief, and worth stating: six here and fifteen for a
 * contractor both come to 100%, because the denominator is this list and not
 * the longest list in the file.
 */
const ELECTRICIAN: readonly ProfessionField[] = [
  {
    id: "work_types",
    label: "What you install",
    type: "multi",
    required: true,
    options: [
      "House wiring",
      "Distribution boards",
      "Lighting",
      "Generators",
      "Solar",
      "Fault finding",
      "Data and TV points",
    ],
  },
  {
    id: "sectors",
    label: "Where you work",
    type: "multi",
    required: true,
    options: ["Residential", "Commercial", "Industrial"],
  },
  {
    id: "voltage_levels",
    label: "Supplies you work on",
    type: "multi",
    required: true,
    options: ["Single phase", "Three phase"],
  },
  {
    id: "certificate",
    label: "Certificate or licence",
    type: "text",
    required: true,
  },
  {
    id: "own_tools",
    label: "I bring my own tools",
    type: "boolean",
    required: true,
  },
  {
    id: "emergency_callouts",
    label: "I take emergency call-outs",
    type: "boolean",
    required: true,
  },
];

const PAINTER: readonly ProfessionField[] = [
  {
    id: "work_types",
    label: "What you paint",
    type: "multi",
    required: true,
    options: [
      "Interior walls",
      "Exterior walls",
      "Wood finishing",
      "Metal painting",
      "Decorative finishes",
      "Gypsum finishing",
    ],
  },
  {
    id: "paint_types",
    label: "Paints you work with",
    type: "multi",
    required: true,
    options: [
      "Emulsion",
      "Oil-based",
      "Enamel",
      "Textured",
      "Epoxy",
      "Spray finish",
    ],
  },
  {
    id: "own_equipment",
    label: "I bring my own equipment",
    type: "boolean",
    required: true,
  },
  { id: "scaffold_access", label: "I can work at height", type: "boolean" },
];

const MASON: readonly ProfessionField[] = [
  {
    id: "work_types",
    label: "What you build",
    type: "multi",
    required: true,
    options: [
      "Block work",
      "Plastering",
      "Concrete",
      "Stone work",
      "Foundations",
      "Screed",
    ],
  },
  {
    id: "materials",
    label: "Materials you work in",
    type: "multi",
    required: true,
    options: ["HCB", "Stone", "Brick", "Concrete"],
  },
  {
    id: "own_tools",
    label: "I bring my own tools",
    type: "boolean",
    required: true,
  },
];

const TILE_INSTALLER: readonly ProfessionField[] = [
  {
    id: "work_types",
    label: "What you tile",
    type: "multi",
    required: true,
    options: [
      "Floors",
      "Walls",
      "Bathrooms",
      "Kitchens",
      "Staircases",
      "External paving",
    ],
  },
  {
    id: "materials",
    label: "Materials you lay",
    type: "multi",
    required: true,
    options: [
      "Ceramic",
      "Porcelain",
      "Granite",
      "Marble",
      "Terrazzo",
      "Mosaic",
    ],
  },
  {
    id: "own_tools",
    label: "I bring my own tools",
    type: "boolean",
    required: true,
  },
];

const GYPSUM_WORKER: readonly ProfessionField[] = [
  {
    id: "work_types",
    label: "What you install",
    type: "multi",
    required: true,
    options: [
      "Ceilings",
      "Partitions",
      "Cornices",
      "Bulkheads",
      "Lighting coves",
      "Wall panelling",
    ],
  },
  {
    id: "finish_types",
    label: "Finishes you offer",
    type: "multi",
    required: true,
    options: ["Plain", "Moulded", "Curved", "Acoustic", "Moisture-resistant"],
  },
  {
    id: "own_tools",
    label: "I bring my own tools",
    type: "boolean",
    required: true,
  },
];

const HVAC_TECHNICIAN: readonly ProfessionField[] = [
  {
    id: "work_types",
    label: "What you work on",
    type: "multi",
    required: true,
    options: [
      "Split units",
      "Ducting",
      "Ventilation",
      "Cold rooms",
      "Chillers",
      "Servicing",
    ],
  },
  {
    id: "sectors",
    label: "Where you work",
    type: "multi",
    required: true,
    options: ["Residential", "Commercial", "Industrial"],
  },
  {
    id: "own_tools",
    label: "I bring my own tools",
    type: "boolean",
    required: true,
  },
  {
    id: "emergency_callouts",
    label: "I take emergency call-outs",
    type: "boolean",
  },
];

const ALUMINIUM_WORKER: readonly ProfessionField[] = [
  {
    id: "work_types",
    label: "What you fabricate",
    type: "multi",
    required: true,
    options: [
      "Windows",
      "Doors",
      "Curtain walling",
      "Partitions",
      "Shopfronts",
      "Sliding systems",
    ],
  },
  {
    id: "materials",
    label: "Systems and glass you use",
    type: "multi",
    required: true,
    options: [
      "Aluminium",
      "uPVC",
      "Single glazing",
      "Double glazing",
      "Tempered glass",
    ],
  },
  {
    id: "own_workshop",
    label: "I have my own workshop",
    type: "boolean",
    required: true,
  },
];

/**
 * Every trade with a configuration, keyed by `profiles.profession`.
 *
 * A trade that is not here — a labourer, a helper, a scaffolder — gets the
 * common fields and nothing else, which is the correct answer and not an
 * omission. Somebody hired by the day has no licence grade and no software.
 */
export const PROFESSION_FIELDS: Record<string, readonly ProfessionField[]> = {
  Contractor: CONTRACTOR,
  Architect: ARCHITECT,
  "Electrical Engineer": ELECTRICAL_ENGINEER,
  "Interior Designer": INTERIOR_DESIGNER,
  "Structural Engineer": STRUCTURAL_ENGINEER,
  "Civil Engineer": CIVIL_ENGINEER,
  "Mechanical Engineer": MECHANICAL_ENGINEER,
  "MEP Engineer": MEP_ENGINEER,
  "Quantity Surveyor": QUANTITY_SURVEYOR,
  Surveyor: SURVEYOR,
  Carpenter: CARPENTER,
  "Furniture Maker": FURNITURE_MAKER,
  Welder: WELDER,
  Plumber: PLUMBER,
  Electrician: ELECTRICIAN,
  Painter: PAINTER,
  Mason: MASON,
  "Tile Installer": TILE_INSTALLER,
  "Gypsum Worker": GYPSUM_WORKER,
  "HVAC Technician": HVAC_TECHNICIAN,
  "Aluminium Worker": ALUMINIUM_WORKER,
};

// ---------------------------------------------------------------------------
// Reading the configuration
// ---------------------------------------------------------------------------

/**
 * The fields for one or more professions, de-duplicated by id.
 *
 * Takes a list so the multi-profession day needs no change here. Two trades
 * that ask the same question — an architect and an interior designer both ask
 * for software — contribute one field, and the first spelling of it wins, so
 * the answer is asked once and stored once.
 */
export function fieldsFor(
  professions: readonly (string | null | undefined)[],
): readonly ProfessionField[] {
  const seen = new Set<string>();
  const out: ProfessionField[] = [];
  for (const profession of professions) {
    for (const field of PROFESSION_FIELDS[profession ?? ""] ?? []) {
      if (seen.has(field.id)) continue;
      seen.add(field.id);
      out.push(field);
    }
  }
  return out;
}

/** Whether a trade has questions of its own. */
export function hasProfessionFields(
  profession: string | null | undefined,
): boolean {
  return (PROFESSION_FIELDS[profession ?? ""] ?? []).length > 0;
}

/** The stored answers, as an object, whatever the column happens to hold. */
export function detailsOf(
  profile: Pick<Profile, "profession_details">,
): ProfessionDetails {
  const raw = profile.profession_details;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ProfessionDetails;
}

/**
 * Whether one field has been answered.
 *
 * An empty list and an empty string are both unanswered. `false` on a tick box
 * is not: "I do not take emergency call-outs" is an answer, and treating it as
 * a blank would mean the only way to finish the profile was to say yes.
 */
export function isAnswered(
  field: ProfessionField,
  value: FieldValue | undefined,
): boolean {
  if (value === undefined || value === null) return false;
  if (field.type === "boolean") return typeof value === "boolean";
  if (field.type === "multi") return Array.isArray(value) && value.length > 0;
  if (field.type === "number")
    return typeof value === "number" && Number.isFinite(value);
  return typeof value === "string" ? value.trim().length > 0 : false;
}

/**
 * What to write to `profession_details` after a save.
 *
 * Merged over what is stored, never replacing it. The form posts only the
 * fields the current trade shows, so a carpenter who became a contractor
 * posts no `own_workshop` — and absent has to mean "left alone" or their
 * carpentry answers would be wiped by the act of changing trade.
 *
 * `posted` is only consulted for ids the trade actually shows, so a crafted
 * post cannot put arbitrary keys into the column.
 */
export function detailsToWrite(
  stored: ProfessionDetails,
  shown: readonly ProfessionField[],
  posted: (field: ProfessionField) => FieldValue | undefined,
): ProfessionDetails {
  const next: ProfessionDetails = { ...stored };
  for (const field of shown) {
    const value = posted(field);
    if (value === undefined) continue;
    next[field.id] = value;
  }
  return next;
}

// ---------------------------------------------------------------------------
// The wire format
// ---------------------------------------------------------------------------

/**
 * Posted fields are prefixed, so one namespace cannot collide with another.
 *
 * `detail:crew_size` rather than `crew_size`: the profile form already posts
 * two dozen names of its own, and a trade adding a field called `phone` or
 * `bio` would otherwise quietly overwrite a column.
 */
export const DETAIL_FIELD_PREFIX = "detail:";

export const detailFieldName = (id: string) => `${DETAIL_FIELD_PREFIX}${id}`;

/**
 * One field's answer, read off a posted form.
 *
 * Every option is checked against the field's own list. These end up in a
 * jsonb column with no constraint on it, so this function is the only thing
 * between a crafted post and arbitrary strings being rendered on a public
 * profile as though somebody had chosen them.
 *
 * A blank is `null`, not `undefined`. `undefined` means "the form did not ask",
 * which `detailsToWrite` reads as "leave what is stored alone"; `null` means
 * "asked, and left empty", which has to overwrite a previous answer or a field
 * could be filled in and never cleared.
 */
export function readPostedDetail(
  formData: FormData,
  field: ProfessionField,
): FieldValue {
  const name = detailFieldName(field.id);

  if (field.type === "multi") {
    const allowed = new Set(field.options ?? []);
    return formData
      .getAll(name)
      .map(String)
      .filter((value) => allowed.has(value));
  }

  const raw = String(formData.get(name) ?? "").trim();
  if (raw === "") return null;

  if (field.type === "boolean") {
    return raw === "yes" ? true : raw === "no" ? false : null;
  }
  if (field.type === "number") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
  }
  if (field.type === "select") {
    return (field.options ?? []).includes(raw) ? raw : null;
  }
  return raw.slice(0, 2000);
}
