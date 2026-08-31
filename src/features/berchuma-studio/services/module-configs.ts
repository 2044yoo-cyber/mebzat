import type { Bay, BayFitting } from "../types/spec";

/**
 * The module configurations somebody picks from a list.
 *
 * Part 5 names seven, and Part 6 singles one out: hanging at the top, a shelf
 * across the middle, two drawers at the bottom. That one is the reason the
 * `stack` fitting exists — the model could previously say a bay was hanging,
 * *or* shelves, *or* drawers, and the commonest wardrobe module in Ethiopia is
 * all three at once.
 *
 * Client-safe: the picker renders this list and there is nothing secret in it.
 *
 * ## The shares
 *
 * Proportions rather than millimetres, so a configuration applied to a 2.4 m
 * bay and a 1.8 m bay both look right. The numbers come from how the things
 * are actually used: hanging needs a metre or so of drop for a coat, a drawer
 * front is around 200 mm, and a shelf takes whatever is between them.
 */

export type ModuleConfig = {
  id: string;
  label: string;
  /** One line under the label in the picker. */
  blurb: string;
  fitting: BayFitting;
};

export const MODULE_CONFIGS: ModuleConfig[] = [
  {
    id: "hanging",
    label: "Hanging",
    blurb: "A single full-height rail.",
    fitting: { kind: "hanging", rails: 1, shelfAbove: true },
  },
  {
    id: "double-hanging",
    label: "Double hanging",
    blurb: "Two rails, one above the other. Shirts and jackets.",
    fitting: { kind: "hanging", rails: 2, shelfAbove: true },
  },
  {
    id: "shelves",
    label: "Shelves",
    blurb: "Five adjustable shelves.",
    fitting: { kind: "shelves", count: 5, adjustable: true },
  },
  {
    id: "drawers",
    label: "Drawers",
    blurb: "Four drawers, each with its own front.",
    fitting: { kind: "drawers", count: 4 },
  },
  {
    id: "drawers-shelves",
    label: "Drawers + shelves",
    blurb: "Shelves above, three drawers below.",
    fitting: {
      kind: "stack",
      sections: [
        { id: "shelves", kind: "shelves", share: 6, count: 3 },
        { id: "drawers", kind: "drawers", share: 4, drawers: 3 },
      ],
    },
  },
  {
    id: "hanging-shelves",
    label: "Hanging + shelves",
    blurb: "A rail above, shelves below.",
    fitting: {
      kind: "stack",
      sections: [
        { id: "hanging", kind: "hanging", share: 6, rails: 1 },
        { id: "shelves", kind: "shelves", share: 4, count: 3 },
      ],
    },
  },
  {
    /**
     * The one Part 6 asks for by name.
     *
     * Shares: the hanging section keeps roughly a metre of drop in a 2.1 m
     * interior, the shelf section is a single generous opening, and the drawer
     * band is two fronts of about 200 mm each. The proportions hold when the
     * wardrobe is taller or shorter, which is the point of using shares.
     */
    id: "two-drawers-shelf-hanging",
    label: "2 drawers + shelf + hanging",
    blurb: "Hanging at the top, a shelf across, two drawers at the bottom.",
    fitting: {
      kind: "stack",
      sections: [
        { id: "hanging", kind: "hanging", share: 10, rails: 1 },
        { id: "shelf", kind: "shelves", share: 4, count: 1 },
        { id: "drawers", kind: "drawers", share: 4, drawers: 2 },
      ],
    },
  },
  {
    id: "open",
    label: "Open",
    blurb: "Nothing inside. Fit it out later.",
    fitting: { kind: "open" },
  },
];

export function moduleConfig(id: string): ModuleConfig | undefined {
  return MODULE_CONFIGS.find((entry) => entry.id === id);
}

/**
 * Applies a configuration to a bay.
 *
 * The bay keeps its id and its width — a configuration says what is *inside* a
 * module, not how wide it is, and swapping the contents of a 900 mm bay should
 * not resize it. The section ids are made unique to the bay so two bays with
 * the same configuration do not collide.
 */
export function applyConfig(bay: Bay, config: ModuleConfig): Bay {
  const fitting =
    config.fitting.kind === "stack"
      ? {
          ...config.fitting,
          sections: config.fitting.sections.map((section) => ({
            ...section,
            id: `${bay.id}-${section.id}`,
          })),
        }
      : config.fitting;

  return { ...bay, fitting };
}

/**
 * Which configuration a bay currently matches, if any.
 *
 * Compared on shape rather than on a stored id, because a bay that has been
 * edited by hand — a drawer added, a share dragged — is no longer the preset
 * even though it started as one. The picker shows nothing selected in that
 * case, which is honest: it is a custom module now.
 */
export function matchConfig(bay: Bay): ModuleConfig | null {
  for (const config of MODULE_CONFIGS) {
    if (config.fitting.kind !== bay.fitting.kind) continue;

    if (config.fitting.kind === "stack" && bay.fitting.kind === "stack") {
      const a = config.fitting.sections;
      const b = bay.fitting.sections;
      if (a.length !== b.length) continue;

      const same = a.every((section, index) => {
        const other = b[index];
        return (
          other !== undefined &&
          other.kind === section.kind &&
          other.share === section.share &&
          (other.count ?? null) === (section.count ?? null) &&
          (other.rails ?? null) === (section.rails ?? null) &&
          (other.drawers ?? null) === (section.drawers ?? null)
        );
      });

      if (same) return config;
      continue;
    }

    if (
      config.fitting.kind === "shelves" &&
      bay.fitting.kind === "shelves" &&
      config.fitting.count === bay.fitting.count
    ) {
      return config;
    }

    if (
      config.fitting.kind === "hanging" &&
      bay.fitting.kind === "hanging" &&
      config.fitting.rails === bay.fitting.rails
    ) {
      return config;
    }

    if (
      config.fitting.kind === "drawers" &&
      bay.fitting.kind === "drawers" &&
      config.fitting.count === bay.fitting.count
    ) {
      return config;
    }

    if (config.fitting.kind === "open" && bay.fitting.kind === "open") {
      return config;
    }
  }

  return null;
}
