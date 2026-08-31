import {
  Armchair,
  BadgePercent,
  Banknote,
  BarChart3,
  Bell,
  Bot,
  Boxes,
  Briefcase,
  Building,
  Building2,
  CalendarDays,
  Calculator,
  ClipboardList,
  Compass,
  Contact,
  CreditCard,
  FileSpreadsheet,
  FileText,
  Gavel,
  HardHat,
  Hammer,
  Home,
  Landmark,
  LineChart,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  type LucideIcon,
  MapPinned,
  MessageSquare,
  MessagesSquare,
  Package,
  PlayCircle,
  Receipt,
  Repeat,
  Ruler,
  ScrollText,
  Store,
  Sparkles,
  TrendingUp,
  Trees,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";

/**
 * The workspace navigation manifest.
 *
 * One list drives the sidebar, the breadcrumb trail, the command palette, the
 * tab bar's labels and the pinned-workspace picker. Four surfaces that must
 * agree about what exists, so they read from the same array rather than each
 * keeping a copy that drifts.
 *
 * `href` is deliberately optional. An item without one is a module that is
 * specified but not yet built; the sidebar renders it as a disabled row with a
 * "Soon" chip rather than a link that goes nowhere. Adding the module later
 * means filling in one field here — every surface picks it up at once.
 */

export type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Absent while the module is unbuilt. Rendered as a disabled row. */
  href?: string;
  /** Extra terms the command palette should match on. */
  keywords?: string[];
  /** Requires a signed-in viewer; the palette dims these when signed out. */
  private?: boolean;
  /** Short line shown in the palette under the label. */
  hint?: string;
};

export type NavSection = {
  id: string;
  label: string;
  emoji: string;
  icon: LucideIcon;
  /** Set when the section header itself is a destination. */
  href?: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "home",
    label: "Home",
    emoji: "🏠",
    icon: Home,
    href: "/",
    items: [],
  },

  // Medosha AI first, and now as one row rather than thirteen.
  //
  // This section used to list every design capability separately — Facade
  // Designer, Interior Designer, Material Replacer, Background Remover, and ten
  // more. Each was a real workspace and each still works; what they were not is
  // a decision anybody should have to make before typing. Somebody with a photo
  // of their building does not know whether they want "Redesign My Space" or
  // "AI Image Editor" or "Material Replacer", and being asked is the point at
  // which they close the tab.
  //
  // The capabilities moved inside Medosha AI, which reads the request and picks
  // one. Nothing was deleted: /ai?tool=facade and every other tool link still
  // opens the workspace it always did, and the command palette still finds them
  // through the keywords below.
  {
    id: "ai",
    label: "AI",
    emoji: "🤖",
    icon: Bot,
    items: [
      {
        id: "ai-home",
        label: "Medosha AI",
        icon: Sparkles,
        href: "/ai",
        private: true,
        hint: "One AI for construction, property and design",
        keywords: [
          // Everything the removed rows used to be findable by. The palette is
          // how somebody who learned the old names gets to the new place.
          "chat", "ask", "assistant", "studio",
          "redesign", "interior", "facade", "elevation", "furniture",
          "material", "replace", "sketch", "render", "floor plan",
          "landscape", "lighting", "product", "background", "upscale",
          "image", "generate", "edit photo",
          "cost", "estimate", "boq", "supplier", "document",
        ],
      },
    ],
  },

  // Berchuma Studio is its own section rather than a row under AI. It is a
  // different kind of thing from a conversation — a parametric editor with
  // saved projects and a gallery — and burying it in a list of AI tools
  // undersold it.
  {
    id: "berchuma",
    label: "Berchuma Studio",
    emoji: "🪑",
    icon: Armchair,
    items: [
      {
        id: "berchuma-studio",
        label: "Design Studio",
        icon: Armchair,
        href: "/studio",
        private: true,
        hint: "Design fitted furniture and get a price",
        keywords: [
          "furniture", "wardrobe", "kitchen", "joinery", "cabinet",
          "berchuma", "cut list",
        ],
      },
      {
        id: "berchuma-projects",
        label: "My Projects",
        icon: HardHat,
        // Not /projects — that is the construction portfolio module and is
        // already a row under Marketplace. Two rows pointing at one route is a
        // duplicate navigation item, and the one that would have been wrong is
        // this one: a Berchuma project is a design, not a build.
        href: "/designs?mine=1",
        private: true,
        hint: "Everything you have designed",
        keywords: ["my designs", "saved", "drafts"],
      },
      {
        id: "berchuma-gallery",
        label: "Gallery",
        icon: Boxes,
        href: "/designs",
        hint: "Published designs you can remix",
        keywords: ["designs", "gallery", "remix", "templates"],
      },
    ],
  },

  // Property second: buying, selling and renting is what most visitors arrive
  // for, and it was previously five sections down.
  {
    id: "property",
    label: "Property",
    emoji: "🏡",
    icon: Building,
    items: [
      {
        id: "city",
        label: "3D City Map",
        icon: MapPinned,
        href: "/city",
        hint: "Explore listings on the map",
        keywords: ["map", "medosha city", "3d", "explore"],
      },
      {
        id: "buy",
        label: "Buy",
        icon: Home,
        href: "/city?kind=sale",
        hint: "Properties for sale",
      },
      {
        id: "rent",
        label: "Rent",
        icon: Repeat,
        href: "/city?kind=rent",
        hint: "Properties to rent",
      },
      {
        id: "sell",
        label: "Sell Your Property",
        icon: BadgePercent,
        href: "/property/new",
        private: true,
        hint: "List it — photos first, exact pin stays private",
        keywords: ["list", "sell", "advertise", "post property"],
      },
      {
        id: "land",
        label: "Land & Plots",
        icon: Trees,
        href: "/city?type=land,farm",
        hint: "Plots and farmland",
      },
      {
        id: "commercial",
        label: "Commercial",
        icon: Warehouse,
        href: "/city?type=commercial,office,shop,hotel,restaurant,mixed_use",
        hint: "Offices, shops and mixed use",
      },
      {
        id: "developers",
        label: "Developers",
        icon: Building2,
        href: "/companies?category=developer",
        hint: "Property developers",
      },
      {
        id: "agencies",
        label: "Agencies",
        icon: Contact,
        href: "/companies?category=real+estate",
        hint: "Estate agencies and brokers",
      },
    ],
  },

  // Material Exchange third, promoted out of Construction. Prices are the
  // reason a lot of people open this site twice a week.
  {
    id: "material-exchange",
    label: "Material Exchange",
    emoji: "🧱",
    icon: TrendingUp,
    items: [
      {
        id: "price-exchange",
        label: "Price Exchange",
        icon: TrendingUp,
        href: "/price-exchange",
        hint: "Live material prices and bids",
        keywords: ["prices", "market", "quotes", "rates", "exchange"],
      },
      {
        id: "cost-database",
        label: "Best Rates",
        icon: FileSpreadsheet,
        href: "/price-exchange?sort=lowest",
        hint: "Lowest price by material",
        keywords: ["cheapest", "benchmark", "unit cost"],
      },
      {
        id: "materials",
        label: "Buy Materials",
        icon: Boxes,
        href: "/marketplace?category=construction-materials",
        hint: "Cement, steel, blocks, aggregates",
        keywords: ["cement", "rebar", "hcb", "sand", "aggregate"],
      },
      {
        id: "sell-material",
        label: "Sell Materials",
        icon: Package,
        href: "/products/new",
        private: true,
        hint: "List stock for sale",
        keywords: ["supply", "list product", "sell"],
      },
    ],
  },

  {
    id: "marketplace",
    label: "Marketplace",
    emoji: "🛒",
    icon: Store,
    items: [
      {
        id: "products",
        label: "Products",
        icon: Package,
        href: "/marketplace",
        hint: "Every product on Medosha",
        keywords: ["shop", "buy", "catalogue", "supplies"],
      },
      {
        id: "services",
        label: "Services",
        icon: Hammer,
        href: "/services",
        hint: "Hire a trade or a specialist",
        keywords: ["trades", "contractors", "hire"],
      },
      {
        id: "furniture",
        label: "Furniture",
        icon: Armchair,
        href: "/marketplace?category=furniture",
        hint: "Furniture category",
      },
      {
        id: "equipment",
        label: "Equipment Rental",
        icon: Truck,
        href: "/equipment",
        hint: "Plant and machinery to rent",
        keywords: ["rental", "hire", "machinery", "plant", "excavator"],
      },
      {
        id: "companies",
        label: "Companies",
        icon: Building2,
        href: "/companies",
        hint: "Suppliers, contractors and consultancies",
      },
      {
        id: "professionals",
        label: "Professionals",
        icon: Users,
        href: "/directory/individual",
        private: true,
        hint: "Architects, engineers, designers",
      },
      {
        id: "projects",
        label: "Projects",
        icon: HardHat,
        href: "/projects",
        private: true,
        hint: "Work in progress and completed builds",
      },
    ],
  },

  {
    id: "construction",
    label: "Construction",
    emoji: "🏗",
    icon: HardHat,
    items: [
      // These five are Medosha AI pinned to one assistant, not five separate
      // products. Each opens the same conversation with that specialist
      // answering — and the same request typed into Medosha AI without opening
      // anything reaches the same place. The rows exist because somebody who
      // knows they want a BOQ should not have to describe their way to one.
      {
        id: "estimations",
        label: "Cost Estimator",
        icon: Calculator,
        href: "/ai?agent=cost",
        private: true,
        hint: "Budget a build with stated assumptions",
        keywords: ["estimate", "budget", "cost"],
      },
      {
        id: "takeoff",
        label: "Takeoff from a model",
        icon: Ruler,
        href: "/takeoff",
        private: true,
        hint: "Import IFC or DXF and measure it",
        keywords: ["ifc", "dxf", "bim", "import", "quantities", "measure", "model"],
      },
      {
        id: "boq",
        label: "BOQ Generator",
        icon: ClipboardList,
        href: "/ai?agent=boq",
        private: true,
        hint: "Draft a bill of quantities",
        keywords: ["bill of quantities", "takeoff"],
      },
      {
        id: "material-advisor",
        label: "Material Advisor",
        icon: Layers,
        href: "/ai?agent=materials",
        private: true,
        hint: "Compare materials and specifications",
        keywords: ["specification", "compare", "which material"],
      },
      {
        id: "supplier-finder",
        label: "Supplier Finder",
        icon: Store,
        href: "/ai?agent=marketplace",
        private: true,
        hint: "Find products and suppliers on Medosha",
        keywords: ["who sells", "stockist", "vendor"],
      },
      {
        id: "document-reader",
        label: "AI Document Reader",
        icon: FileText,
        href: "/ai?agent=drawings",
        private: true,
        hint: "Drawing sets, specs and what they should contain",
        keywords: ["drawings", "specification", "tender", "contract"],
      },
      {
        id: "jobs",
        label: "Jobs",
        icon: Briefcase,
        href: "/jobs",
        hint: "Site and office roles",
        keywords: ["vacancy", "hiring", "careers", "work", "apply"],
      },
      {
        id: "post-job",
        label: "Post a Job",
        icon: HardHat,
        href: "/jobs/new",
        private: true,
        hint: "Hire an engineer, a foreman, a trade",
        keywords: ["hire", "recruit", "vacancy", "advertise"],
      },
      {
        id: "methods",
        label: "Construction Methods",
        icon: ScrollText,
        keywords: ["techniques", "how to build"],
      },
      {
        id: "codes",
        label: "Building Codes",
        icon: Gavel,
        keywords: ["ebcs", "regulation", "standards", "compliance"],
      },
    ],
  },

  {
    id: "community",
    label: "Community",
    emoji: "💬",
    icon: MessagesSquare,
    items: [
      {
        id: "posts",
        label: "Posts",
        icon: MessagesSquare,
        href: "/community",
        hint: "The feed",
      },
      {
        id: "questions",
        label: "Questions",
        icon: LifeBuoy,
        href: "/community?kind=question",
        hint: "Ask the industry",
      },
      {
        id: "knowledge",
        label: "Knowledge",
        icon: FileText,
        href: "/community?kind=tip",
        hint: "Tips and field notes",
      },
      { id: "tutorials", label: "Tutorials", icon: Compass },
      { id: "videos", label: "Videos", icon: PlayCircle },
      {
        id: "events",
        label: "Events",
        icon: CalendarDays,
        href: "/events",
        hint: "Trade shows, training, site visits",
      },
    ],
  },

  {
    id: "business",
    label: "Business",
    emoji: "💼",
    icon: Briefcase,
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        href: "/dashboard",
        private: true,
      },
      {
        id: "my-jobs",
        label: "Hiring",
        icon: Briefcase,
        href: "/jobs/manage",
        private: true,
        hint: "Your postings and the people who applied",
        keywords: ["jobs", "applicants", "applications", "shortlist", "hire"],
      },
      {
        id: "my-applications",
        label: "My Applications",
        icon: ClipboardList,
        href: "/jobs/applications",
        private: true,
        hint: "Jobs you applied for, and where each one stands",
        keywords: ["applied", "interviews", "hired"],
      },
      {
        id: "quotations",
        label: "Quotations",
        icon: FileSpreadsheet,
        href: "/hire",
        private: true,
        hint: "Briefs and the bids on them",
        keywords: ["quotes", "bids", "tender", "rfq"],
      },
      {
        id: "messages",
        label: "Messages",
        icon: MessageSquare,
        href: "/messages",
        private: true,
      },
      {
        id: "notifications",
        label: "Notifications",
        icon: Bell,
        href: "/notifications",
        private: true,
      },
      { id: "orders", label: "Orders", icon: Package },
      { id: "followers", label: "Followers", icon: Users },
      { id: "analytics", label: "Analytics", icon: BarChart3 },
      { id: "marketing", label: "Marketing", icon: Landmark },
      { id: "crm", label: "CRM", icon: Contact },
      { id: "invoices", label: "Invoices", icon: Receipt },
      { id: "payments", label: "Payments", icon: Banknote },
      { id: "subscriptions", label: "Subscriptions", icon: CreditCard },
    ],
  },

  // Investment last, deliberately. It is the module people should reach after
  // they understand the rest of the platform, not the first thing a stranger
  // is offered — and every project in it is a demonstration.
  {
    id: "invest",
    label: "Investment",
    emoji: "💰",
    icon: Landmark,
    items: [
      {
        id: "invest",
        label: "Opportunities",
        icon: Landmark,
        href: "/invest",
        hint: "Development projects raising capital",
        keywords: ["investment", "funding", "roi", "developer", "capital"],
      },
      {
        id: "portfolio",
        label: "Investors",
        icon: LineChart,
        href: "/invest/investors",
        hint: "Investor profiles and portfolios",
        keywords: ["portfolio", "holdings", "track record"],
      },
    ],
  },
];

/** Every item that has somewhere to go, flattened, with its section attached. */
export const NAV_ITEMS: (NavItem & { section: NavSection })[] =
  NAV_SECTIONS.flatMap((section) =>
    section.items.map((item) => ({ ...item, section })),
  );

/**
 * Nav items that actually go somewhere.
 *
 * The predicate narrows the type rather than just filtering, so `href` is a
 * string on every element here — which is what lets the callers below drop
 * their non-null assertions. An assertion is a promise the compiler cannot
 * check; this is the same promise, checked.
 */
export const LINKED_NAV_ITEMS: (NavItem & {
  href: string;
  section: NavSection;
})[] = NAV_ITEMS.filter(
  (item): item is NavItem & { href: string; section: NavSection } =>
    typeof item.href === "string" && item.href.length > 0,
);

/** Sections whose header is itself a destination — Home, today. */
export const NAV_ROOTS = NAV_SECTIONS.filter((section) => section.href);

export function findSection(id: string): NavSection | undefined {
  return NAV_SECTIONS.find((section) => section.id === id);
}

export function findItem(id: string) {
  return NAV_ITEMS.find((item) => item.id === id);
}

/**
 * Which sidebar row is highlighted for a given URL.
 *
 * Scored rather than matched, because several rows share a pathname and differ
 * only by query — /city, /city?kind=sale and /city?type=land are three
 * destinations on one route. The row whose query is fully present in the URL
 * and is the most specific wins; a bare /city URL falls back to the row with
 * no query at all.
 */
export function matchNavItem(
  pathname: string,
  searchParams?: URLSearchParams | null,
): (NavItem & { section: NavSection }) | undefined {
  let best: (NavItem & { section: NavSection }) | undefined;
  let bestScore = -1;

  for (const item of LINKED_NAV_ITEMS) {
    const [itemPath = "", itemQuery = ""] = item.href.split("?");

    // Exact route, or a child of it: /marketplace matches /marketplace/abc,
    // but /city must not claim /companies.
    const pathMatches =
      pathname === itemPath ||
      (itemPath !== "/" && pathname.startsWith(`${itemPath}/`));
    if (!pathMatches) continue;

    const wanted = new URLSearchParams(itemQuery);
    let query = 0;
    let satisfied = true;
    for (const [key, value] of wanted) {
      if (searchParams?.get(key) !== value) {
        satisfied = false;
        break;
      }
      query += 1;
    }
    if (!satisfied) continue;

    // Longer path beats shorter; more matched query keys beats fewer.
    const score = itemPath.length * 10 + query * 100;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return best;
}

/**
 * The breadcrumb trail for a URL: section, item, then any trailing route
 * segments (a product id, a company slug) that the manifest cannot name.
 */
export type Crumb = { label: string; href?: string };

export function breadcrumbsFor(
  pathname: string,
  searchParams?: URLSearchParams | null,
  leafLabel?: string,
): Crumb[] {
  const crumbs: Crumb[] = [{ label: "Home", href: "/" }];
  if (pathname === "/") return crumbs;

  const item = matchNavItem(pathname, searchParams);
  if (!item) {
    // A route outside the manifest — settings, profile, auth callbacks. Show
    // its segments so the trail is never just "Home".
    for (const segment of pathname.split("/").filter(Boolean)) {
      crumbs.push({ label: titleCase(segment) });
    }
    return crumbs;
  }

  crumbs.push({ label: item.section.label, href: item.section.href });
  crumbs.push({ label: item.label, href: item.href });

  // Anything past the item's own path is a record: /marketplace/<id>.
  const [itemPath = ""] = (item.href ?? "").split("?");
  if (pathname.startsWith(`${itemPath}/`)) {
    const rest = pathname.slice(itemPath.length + 1).split("/").filter(Boolean);
    rest.forEach((segment, index) => {
      const isLeaf = index === rest.length - 1;
      crumbs.push({
        label: isLeaf && leafLabel ? leafLabel : titleCase(segment),
      });
    });
  }

  return crumbs;
}

function titleCase(segment: string): string {
  const decoded = decodeURIComponent(segment);
  // Ids and slugs are shown as-is rather than mangled into fake words.
  if (/^[0-9a-f-]{20,}$/i.test(decoded)) return "Detail";
  return decoded
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
