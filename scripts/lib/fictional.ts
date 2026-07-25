// Fictional, Ethiopian-style demo data generators. FOR DEVELOPMENT/DEMO ONLY.
// No real people, emails, phone numbers, addresses, or photos are used:
// - Names combine common Ethiopian given names + patronymics into fictional
//   persons (not any specific real individual).
// - Emails use the reserved @medosha.test domain.
// - Avatars/logos/photos are generated placeholders (DiceBear / picsum.photos).

import { chance, intBetween, makeRng, pick, pickSome, type Rng } from "./rng";

// --- Pools -----------------------------------------------------------------

const GIVEN_NAMES = [
  "Abebe", "Bekele", "Dawit", "Kebede", "Girma", "Haile", "Mulugeta", "Solomon",
  "Tesfaye", "Yohannes", "Alemu", "Getachew", "Tadesse", "Mekonnen", "Desta",
  "Fikadu", "Biruk", "Elias", "Nahom", "Robel", "Samuel", "Yonas", "Henok",
  "Hanna", "Selam", "Meron", "Tigist", "Bethlehem", "Sara", "Rahel", "Lidya",
  "Marta", "Genet", "Aster", "Eden", "Helen", "Kidist", "Feven", "Mahlet",
  "Saba", "Yordanos", "Bezawit", "Hiwot", "Rediet", "Semira", "Meaza",
];

const FAMILY_NAMES = [
  "Tessema", "Wolde", "Gebre", "Assefa", "Bekele", "Tadesse", "Mekonnen",
  "Alemu", "Kebede", "Haile", "Girma", "Desta", "Abera", "Negash", "Teshome",
  "Fekadu", "Tola", "Gemechu", "Bedada", "Diriba", "Hailu", "Worku", "Belay",
  "Zeleke", "Mengistu", "Regassa", "Sisay", "Getahun", "Tafesse", "Amare",
];

export const CITIES = [
  "Addis Ababa", "Adama", "Bahir Dar", "Hawassa", "Mekelle", "Dire Dawa",
  "Gondar", "Jimma", "Dessie", "Bishoftu", "Harar", "Shashamane", "Nekemte",
  "Debre Birhan", "Sodo", "Arba Minch",
];

export const COUNTRY = "Ethiopia";

const LANGUAGES = ["Amharic", "English", "Afaan Oromo", "Tigrinya", "Somali"];

export const PROFESSIONS = [
  "Architect", "Interior Designer", "Structural Engineer", "Civil Engineer",
  "Contractor", "Quantity Surveyor", "Electrician", "Plumber",
  "Furniture Designer", "Landscape Architect",
] as const;

export type Profession = (typeof PROFESSIONS)[number];

// Map a profession to the app's account_type enum.
export function professionAccountType(p: Profession) {
  if (p === "Contractor") return "contractor" as const;
  return "individual" as const;
}

const SKILLS_BY_PROFESSION: Record<Profession, string[]> = {
  Architect: ["Concept Design", "BIM", "Revit", "Site Planning", "3D Modeling"],
  "Interior Designer": ["Space Planning", "Lighting", "Materials", "Styling", "Rendering"],
  "Structural Engineer": ["RC Design", "Steel Design", "Seismic", "Foundations", "ETABS"],
  "Civil Engineer": ["Roads", "Drainage", "Surveying", "Estimation", "Site Supervision"],
  Contractor: ["Project Management", "Cost Control", "Scheduling", "Procurement", "QA/QC"],
  "Quantity Surveyor": ["BOQ", "Cost Estimation", "Tendering", "Valuation", "Contracts"],
  Electrician: ["Wiring", "Panels", "Solar", "Lighting", "Maintenance"],
  Plumber: ["Pipework", "Drainage", "Fixtures", "Water Systems", "Fittings"],
  "Furniture Designer": ["Joinery", "Cabinetry", "CNC", "Upholstery", "Finishing"],
  "Landscape Architect": ["Planting", "Hardscape", "Irrigation", "Grading", "Site Design"],
};

const CITY_WORDS = [
  "Habesha", "Blue Nile", "Abay", "Sheba", "Rift Valley", "Entoto", "Lalibela",
  "Axum", "Simien", "Zagwe", "Sidama", "Adwa", "Tana", "Awash",
];

const COMPANY_TRADES = [
  "Construction", "Builders", "Engineering", "Contractors", "Developers",
  "Interiors", "Furniture", "Steel", "Cement", "Building Materials", "Design",
  "Architects", "Real Estate", "Trading",
];

const COMPANY_SUFFIX = ["PLC", "Plc", "Group", "Enterprise", "Trading", "& Co."];

const BRANDS = [
  "Habesha", "Sheba", "Abay", "RiftPro", "NileTech", "Sidama", "Zagwe",
  "Entoto", "AxumX", "Simien", "Tana", "Awash",
];

const PROJECT_STYLES = [
  "Modern", "Luxury", "Minimalist", "Contemporary", "Traditional", "Commercial",
] as const;

const BUILDING_TYPES = [
  "residential", "commercial", "industrial", "hospitality", "institutional",
  "mixed_use", "landscape", "interior", "renovation", "other",
] as const;

const PROJECT_NOUNS = [
  "Villa", "Residence", "Apartments", "Tower", "Plaza", "Complex", "House",
  "Lodge", "Office", "Showroom", "Mall", "Pavilion", "Estate",
];

const MATERIALS = [
  "Concrete", "Cement", "Rebar", "Steel", "Glass", "Timber", "Marble",
  "Granite", "Ceramic Tile", "Aluminum", "Gypsum Board", "Paint", "Bricks",
  "Stone", "HCB", "Plywood",
];

// Product name templates per seeded category slug.
const PRODUCTS_BY_CATEGORY: Record<string, string[]> = {
  furniture: ["Oak Dining Table", "Lounge Sofa Set", "Office Desk", "Bookshelf", "Bed Frame", "Accent Chair"],
  kitchen: ["Modular Kitchen Cabinet", "Granite Countertop", "Stainless Sink", "Kitchen Island", "Pantry Unit"],
  bathroom: ["Ceramic Wash Basin", "Rain Shower Set", "Wall-Hung Toilet", "Vanity Cabinet", "Bath Mixer"],
  lighting: ["LED Panel Light", "Pendant Lamp", "Track Light Kit", "Chandelier", "Outdoor Wall Light"],
  doors: ["Solid Wood Door", "Aluminum Sliding Door", "Steel Security Door", "uPVC Door", "Glass Door"],
  windows: ["uPVC Casement Window", "Aluminum Sliding Window", "Tempered Glass Panel", "Double-Glazed Window"],
  roofing: ["Corrugated Steel Sheet", "Clay Roof Tile", "Waterproof Membrane", "Roof Truss", "Insulation Roll"],
  paint: ["Interior Emulsion Paint", "Exterior Weather Paint", "Wood Primer", "Anti-Rust Coating", "Wall Putty"],
  flooring: ["Porcelain Floor Tile", "Marble Slab", "SPC Vinyl Plank", "Hardwood Flooring", "Epoxy Floor Coating"],
  electrical: ["Copper Cable Roll", "Distribution Board", "Wall Socket Set", "Circuit Breaker", "Solar Panel"],
  "construction-materials": ["Portland Cement", "Deformed Rebar", "Hollow Concrete Block", "River Sand", "Aggregate"],
};

const UNITS_BY_CATEGORY: Record<string, string> = {
  furniture: "per piece",
  kitchen: "per unit",
  bathroom: "per set",
  lighting: "per piece",
  doors: "per unit",
  windows: "per m²",
  roofing: "per m²",
  paint: "per 20L",
  flooring: "per m²",
  electrical: "per unit",
  "construction-materials": "per unit",
};

// --- Helpers ---------------------------------------------------------------

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function avatarUrl(seed: string) {
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seed)}&radius=50&backgroundType=gradientLinear`;
}

export function photoUrl(seed: string, w: number, h: number) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
}

// --- Records ---------------------------------------------------------------

export type DemoUser = {
  key: string;
  fullName: string;
  username: string;
  email: string;
  password: string;
  profession: Profession;
  accountType: "individual" | "contractor";
  bio: string;
  city: string;
  country: string;
  yearsExperience: number;
  languages: string[];
  skills: string[];
  companyName: string | null;
  avatarUrl: string;
  coverUrl: string;
  verified: boolean;
};

export function makeUsers(count: number): DemoUser[] {
  const rng = makeRng(1001);
  const users: DemoUser[] = [];
  const usernames = new Set<string>();

  for (let i = 0; i < count; i++) {
    const first = pick(rng, GIVEN_NAMES);
    const last = pick(rng, FAMILY_NAMES);
    const fullName = `${first} ${last}`;
    const profession = pick(rng, PROFESSIONS);
    const num = String(i + 1).padStart(2, "0");

    let username = slugify(`${first}-${last}`);
    while (usernames.has(username)) username = `${username}-${intBetween(rng, 1, 99)}`;
    usernames.add(username);

    const city = pick(rng, CITIES);
    const years = intBetween(rng, 1, 25);
    users.push({
      key: `user-${num}`,
      fullName,
      username,
      email: `demo${num}@medosha.test`,
      password: "medosha-demo-1234",
      profession,
      accountType: professionAccountType(profession),
      bio: `${profession} based in ${city} with ${years} years of experience delivering ${pick(rng, ["residential", "commercial", "mixed-use", "hospitality"])} projects across Ethiopia.`,
      city,
      country: COUNTRY,
      yearsExperience: years,
      languages: pickSome(rng, LANGUAGES, intBetween(rng, 2, 3)),
      skills: pickSome(rng, SKILLS_BY_PROFESSION[profession], intBetween(rng, 3, 5)),
      companyName: chance(rng, 0.4)
        ? `${pick(rng, CITY_WORDS)} ${pick(rng, COMPANY_TRADES)} ${pick(rng, COMPANY_SUFFIX)}`
        : null,
      avatarUrl: avatarUrl(fullName),
      coverUrl: photoUrl(`cover-${username}`, 1200, 400),
      verified: chance(rng, 0.35),
    });
  }
  return users;
}

export type DemoCompany = {
  externalRef: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  city: string;
  country: string;
  address: string;
  website: string;
  email: string;
  phone: string;
  employeesCount: number;
  projectsCompleted: number;
  followersCount: number;
  rating: number;
  verified: boolean;
  claimed: boolean;
  logoUrl: string;
  coverUrl: string;
};

export function makeCompanies(count: number): DemoCompany[] {
  const rng = makeRng(2002);
  const companies: DemoCompany[] = [];
  const slugs = new Set<string>();

  for (let i = 0; i < count; i++) {
    const num = String(i + 1).padStart(2, "0");
    const trade = pick(rng, COMPANY_TRADES);
    const name = `${pick(rng, CITY_WORDS)} ${trade} ${pick(rng, COMPANY_SUFFIX)}`;
    let slug = slugify(name);
    while (slugs.has(slug)) slug = `${slug}-${num}`;
    slugs.add(slug);

    const city = pick(rng, CITIES);
    const claimed = chance(rng, 0.4);
    companies.push({
      externalRef: `company-${num}`,
      name,
      slug,
      category: trade,
      description: `${name} is a ${trade.toLowerCase()} business operating out of ${city}, serving clients across Ethiopia with quality workmanship and reliable delivery.`,
      city,
      country: COUNTRY,
      address: `${intBetween(rng, 1, 300)} ${pick(rng, ["Bole", "Kazanchis", "Piassa", "CMC", "Sarbet", "Megenagna"])} Road`,
      website: `https://${slug}.medosha.test`,
      email: `info@${slug}.medosha.test`,
      phone: `+2519${intBetween(rng, 10000000, 99999999)}`,
      employeesCount: intBetween(rng, 3, 400),
      projectsCompleted: intBetween(rng, 0, 180),
      followersCount: intBetween(rng, 0, 5000),
      rating: Math.round((3 + rng() * 2) * 10) / 10,
      verified: claimed && chance(rng, 0.7),
      claimed,
      logoUrl: photoUrl(`logo-${slug}`, 200, 200),
      coverUrl: photoUrl(`ccover-${slug}`, 1200, 400),
    });
  }
  return companies;
}

export type DemoProject = {
  key: string;
  title: string;
  slug: string;
  description: string;
  buildingType: string;
  style: string;
  city: string;
  country: string;
  budget: number;
  budgetCurrency: string;
  materials: string[];
  completionDate: string;
  views: number;
  images: string[];
};

export function makeProjects(count: number): DemoProject[] {
  const rng = makeRng(3003);
  const projects: DemoProject[] = [];

  for (let i = 0; i < count; i++) {
    const num = String(i + 1).padStart(3, "0");
    const style = pick(rng, PROJECT_STYLES);
    const noun = pick(rng, PROJECT_NOUNS);
    const city = pick(rng, CITIES);
    const title = `${style} ${noun} in ${city}`;
    const slug = slugify(`${title}-${num}`);
    const year = intBetween(rng, 2016, 2025);
    const imageCount = intBetween(rng, 2, 4);
    projects.push({
      key: `project-${num}`,
      title,
      slug,
      description: `A ${style.toLowerCase()} ${noun.toLowerCase()} completed in ${city}. The design balances function and aesthetics using durable, locally-sourced materials.`,
      buildingType: pick(rng, BUILDING_TYPES),
      style,
      city,
      country: COUNTRY,
      budget: intBetween(rng, 5, 400) * 100000,
      budgetCurrency: pick(rng, ["ETB", "USD"]),
      materials: pickSome(rng, MATERIALS, intBetween(rng, 3, 6)),
      completionDate: `${year}-${String(intBetween(rng, 1, 12)).padStart(2, "0")}-15`,
      views: intBetween(rng, 0, 4000),
      images: Array.from({ length: imageCount }, (_, k) =>
        photoUrl(`proj-${num}-${k}`, 1200, 900),
      ),
    });
  }
  return projects;
}

export type DemoProduct = {
  key: string;
  title: string;
  slug: string;
  categorySlug: string;
  brand: string;
  description: string;
  price: number;
  currency: string;
  unit: string;
  stockStatus: "in_stock" | "made_to_order" | "out_of_stock";
  city: string;
  country: string;
  deliveryAvailable: boolean;
  specs: Record<string, string>;
  images: string[];
};

const CATEGORY_SLUGS = Object.keys(PRODUCTS_BY_CATEGORY);

export function makeProducts(count: number): DemoProduct[] {
  const rng = makeRng(4004);
  const products: DemoProduct[] = [];
  const slugs = new Set<string>();

  for (let i = 0; i < count; i++) {
    const num = String(i + 1).padStart(3, "0");
    const categorySlug = pick(rng, CATEGORY_SLUGS);
    const base = pick(rng, PRODUCTS_BY_CATEGORY[categorySlug]);
    const brand = pick(rng, BRANDS);
    const title = `${brand} ${base}`;
    let slug = slugify(`${title}-${num}`);
    while (slugs.has(slug)) slug = `${slug}-x`;
    slugs.add(slug);

    const imageCount = intBetween(rng, 1, 3);
    products.push({
      key: `product-${num}`,
      title,
      slug,
      categorySlug,
      brand,
      description: `${title} — a quality ${base.toLowerCase()} suitable for residential and commercial projects. Sourced and supplied across Ethiopia.`,
      price: intBetween(rng, 50, 40000),
      currency: pick(rng, ["ETB", "USD"]),
      unit: UNITS_BY_CATEGORY[categorySlug] ?? "per unit",
      stockStatus: pick(rng, ["in_stock", "in_stock", "made_to_order", "out_of_stock"] as const),
      city: pick(rng, CITIES),
      country: COUNTRY,
      deliveryAvailable: chance(rng, 0.6),
      specs: {
        Brand: brand,
        Origin: "Ethiopia",
        Warranty: pick(rng, ["6 months", "1 year", "2 years", "None"]),
        Material: pick(rng, MATERIALS),
      },
      images: Array.from({ length: imageCount }, (_, k) =>
        photoUrl(`prod-${num}-${k}`, 800, 800),
      ),
    });
  }
  return products;
}

export type { Rng };
