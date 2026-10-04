/**
 * The chat telling the map which listings it just talked about.
 *
 * "Show me rentals in Bole under 50,000" produces an answer in one panel and
 * leaves the map in another showing all of Addis. The two are looking at the
 * same database and disagreeing about what the user asked for.
 *
 * ## Why an event and not a prop
 *
 * The assistant is mounted in the app shell's context panel, on every route.
 * The map is mounted by the property explorer, on one. Neither is an ancestor
 * of the other, so there is no prop to drill and no shared parent to lift into
 * without hoisting map state to the root layout — which would make every page
 * in Medosha re-render when a marker is clicked.
 *
 * A browser event is the smallest thing that crosses that gap. The chat fires
 * and forgets; the map listens when it exists and nothing happens when it does
 * not. There is no store to keep in sync and nothing to clean up on a route
 * change beyond removing the listener.
 *
 * ## What travels
 *
 * Ids and coordinates that came out of the database, in the same request that
 * produced the answer. Never anything parsed from the model's reply: the map
 * must highlight the rows that were searched, not the ones the model chose to
 * mention, and certainly not an id it invented. That is also why this carries
 * no titles or prices — the map already has those for every pin it holds, and
 * a second copy is a second thing to be stale.
 */

export const AI_HIGHLIGHT_EVENT = "medosha:ai-listings";

export type AiHighlight = {
  /** Listing ids the answer is grounded in. Empty clears the highlight. */
  ids: string[];
  /**
   * Where they are, so the map can frame them.
   *
   * A listing outside the current viewport is the common case — somebody
   * looking at Ayat asks about Bole — and highlighting a marker that is not on
   * screen highlights nothing.
   */
  bounds: { south: number; west: number; north: number; east: number } | null;
  /** What was searched for, for the "showing 4 matches" line. */
  label: string;
};

type Pin = { id: string; latitude: number; longitude: number };

/**
 * The box around a set of pins.
 *
 * Null for an empty set rather than a zero-size box at the equator, which is
 * what reducing over nothing with a 0 seed produces — and which would fly the
 * map to the Gulf of Guinea.
 */
export function boundsOf(pins: Pin[]): AiHighlight["bounds"] {
  // A fast path, not the defence. The seeds below are infinite, so an empty
  // list falls through to the same null by way of the finiteness check —
  // which is what also catches a list of pins that all have bad coordinates,
  // and is therefore the line that actually matters.
  if (pins.length === 0) return null;

  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;

  for (const pin of pins) {
    if (!Number.isFinite(pin.latitude) || !Number.isFinite(pin.longitude)) {
      continue;
    }
    south = Math.min(south, pin.latitude);
    north = Math.max(north, pin.latitude);
    west = Math.min(west, pin.longitude);
    east = Math.max(east, pin.longitude);
  }

  if (!Number.isFinite(south) || !Number.isFinite(west)) return null;

  // A single pin is a point, and a point has no box to fit. Padding it by
  // roughly 300 m gives the map something to frame instead of zooming to its
  // maximum on one marker.
  if (south === north && west === east) {
    const pad = 0.003;
    return {
      south: south - pad,
      north: north + pad,
      west: west - pad,
      east: east + pad,
    };
  }

  return { south, west, north, east };
}

/** Fired by the chat. Safe to call on the server, where it does nothing. */
export function publishHighlight(highlight: AiHighlight): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AiHighlight>(AI_HIGHLIGHT_EVENT, { detail: highlight }),
  );
}

/** Subscribed to by the map. Returns the unsubscribe. */
export function onHighlight(
  handler: (highlight: AiHighlight) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const listener = (event: Event) => {
    const detail = (event as CustomEvent<AiHighlight>).detail;
    if (detail && Array.isArray(detail.ids)) handler(detail);
  };

  window.addEventListener(AI_HIGHLIGHT_EVENT, listener);
  return () => window.removeEventListener(AI_HIGHLIGHT_EVENT, listener);
}
