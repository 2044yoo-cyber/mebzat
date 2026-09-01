/**
 * Workspace state that outlives navigation.
 *
 * Deliberately an external store rather than React state. The shell reads it
 * through `useSyncExternalStore`, which lets the server render the defaults
 * and the client swap in what was saved without ever calling setState from an
 * effect — the pattern the React Compiler lint rules exist to prevent.
 *
 * Everything here is layout preference. Nothing here is data, so a corrupt or
 * missing entry costs the user a default width, never a failed render.
 */

export type WorkspaceTab = {
  /** The URL the tab restores, query included. */
  href: string;
  label: string;
};

export type ShellState = {
  navCollapsed: boolean;
  navWidth: number;
  panelCollapsed: boolean;
  /**
   * Whether the panel is open below the desktop breakpoint, where it floats
   * over the workspace instead of sitting beside it. Separate from
   * `panelCollapsed` because the two sizes want opposite defaults: a 400px
   * column is free on a 1600px screen and is the whole screen on a phone.
   */
  panelMobile: boolean;
  panelWidth: number;
  /** Sidebar section ids the user has folded shut. */
  collapsedSections: string[];
  /** Nav item ids pinned to My Workspace. */
  pins: string[];
  tabs: WorkspaceTab[];
  /** Route shown beside the workspace in split view; null when not split. */
  splitHref: string | null;
  splitRatio: number;
  aiOpen: boolean;
};

export const NAV_WIDTH = { min: 260, max: 300, default: 276 } as const;
export const PANEL_WIDTH = { min: 340, max: 420, default: 372 } as const;
export const SPLIT_RATIO = { min: 0.3, max: 0.7, default: 0.5 } as const;

const DEFAULTS: ShellState = {
  navCollapsed: false,
  navWidth: NAV_WIDTH.default,
  panelCollapsed: false,
  panelMobile: false,
  panelWidth: PANEL_WIDTH.default,
  collapsedSections: [],
  pins: ["ai-home", "price-exchange", "projects", "messages", "companies"],
  tabs: [],
  splitHref: null,
  splitRatio: SPLIT_RATIO.default,
  aiOpen: false,
};

const KEY = "medosha:workspace:v1";
const MAX_TABS = 8;

let state: ShellState = DEFAULTS;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): ShellState {
  return state;
}

/**
 * The server always renders the defaults, so the first client render matches
 * the markup byte for byte and `hydrate()` is what applies saved preferences.
 */
export function getServerSnapshot(): ShellState {
  return DEFAULTS;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Trust nothing from storage: a hand-edited entry must not break the shell. */
function sanitize(raw: unknown): ShellState {
  if (!raw || typeof raw !== "object") return DEFAULTS;
  const input = raw as Partial<ShellState>;

  const tabs = Array.isArray(input.tabs)
    ? input.tabs
        .filter(
          (tab): tab is WorkspaceTab =>
            Boolean(tab) &&
            typeof tab.href === "string" &&
            tab.href.startsWith("/") &&
            typeof tab.label === "string",
        )
        .slice(0, MAX_TABS)
    : DEFAULTS.tabs;

  return {
    navCollapsed: input.navCollapsed === true,
    navWidth: Number.isFinite(input.navWidth)
      ? clamp(input.navWidth as number, NAV_WIDTH.min, NAV_WIDTH.max)
      : NAV_WIDTH.default,
    panelCollapsed: input.panelCollapsed === true,
    // Always starts shut on a small screen, for the same reason as the dock.
    panelMobile: false,
    panelWidth: Number.isFinite(input.panelWidth)
      ? clamp(input.panelWidth as number, PANEL_WIDTH.min, PANEL_WIDTH.max)
      : PANEL_WIDTH.default,
    collapsedSections: Array.isArray(input.collapsedSections)
      ? input.collapsedSections.filter((id) => typeof id === "string")
      : [],
    pins: Array.isArray(input.pins)
      ? input.pins.filter((id) => typeof id === "string").slice(0, 12)
      : DEFAULTS.pins,
    tabs,
    splitHref:
      typeof input.splitHref === "string" && input.splitHref.startsWith("/")
        ? input.splitHref
        : null,
    splitRatio: Number.isFinite(input.splitRatio)
      ? clamp(input.splitRatio as number, SPLIT_RATIO.min, SPLIT_RATIO.max)
      : SPLIT_RATIO.default,
    // The AI dock always starts shut. Reopening it on every page load would
    // steal a third of the screen from someone who opened it once, days ago.
    aiOpen: false,
  };
}

/** Called once from the shell on mount. Safe to call again; it no-ops. */
export function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    state = sanitize(JSON.parse(raw));
    emit();
  } catch {
    // Private browsing, a quota error, or malformed JSON. Defaults stand.
  }
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  if (typeof window === "undefined") return;
  // Dragging a resize handle fires on every frame; one write per idle moment.
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked. The session still works, it just forgets.
    }
  }, 200);
}

export function update(patch: Partial<ShellState>) {
  state = { ...state, ...patch };
  persist();
  emit();
}

/** Same shape as a React updater, for changes that read the previous value. */
export function mutate(fn: (previous: ShellState) => Partial<ShellState>) {
  update(fn(state));
}

// ---------------------------------------------------------------------------
// Derived operations. Kept beside the state so every caller applies the same
// rules — tab de-duplication in particular has to be identical everywhere.
// ---------------------------------------------------------------------------

export function openTab(tab: WorkspaceTab) {
  mutate((previous) => {
    const existing = previous.tabs.findIndex((open) => open.href === tab.href);
    if (existing !== -1) {
      // Already open: refresh the label (a detail page learns its title after
      // the tab was created) but keep the position, so tabs do not shuffle.
      const tabs = [...previous.tabs];
      tabs[existing] = tab;
      return { tabs };
    }
    const tabs = [...previous.tabs, tab];
    // Oldest out first, which is also the least recently opened.
    return { tabs: tabs.slice(-MAX_TABS) };
  });
}

export function closeTab(href: string) {
  mutate((previous) => ({
    tabs: previous.tabs.filter((tab) => tab.href !== href),
  }));
}

/**
 * Show the context panel, at whichever size the screen is.
 *
 * Every caller that reveals the panel — the AI launcher, the command palette,
 * a marker click on the map — goes through this rather than setting
 * `panelCollapsed` directly, so none of them has to know about breakpoints.
 */
export function openPanel() {
  update({ panelCollapsed: false, panelMobile: true });
}

export function closePanel() {
  update({ panelCollapsed: true, panelMobile: false, aiOpen: false });
}

export function togglePin(id: string) {
  mutate((previous) => ({
    pins: previous.pins.includes(id)
      ? previous.pins.filter((pin) => pin !== id)
      : [...previous.pins, id].slice(0, 12),
  }));
}

export function toggleSection(id: string) {
  mutate((previous) => ({
    collapsedSections: previous.collapsedSections.includes(id)
      ? previous.collapsedSections.filter((section) => section !== id)
      : [...previous.collapsedSections, id],
  }));
}

export { clamp };
