/**
 * Remembers where the user was on the map.
 *
 * Kept in sessionStorage rather than the URL: the camera changes on every
 * gesture, and pushing a route on each one would fight the map for control of
 * the page. The URL still carries filters, so a link is shareable — this only
 * restores the view for the person who left it.
 */

export type MapSession = {
  citySlug: string;
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
  mode: "2d" | "3d";
  selectedId: string | null;
  panelOpen: boolean;
  savedAt: number;
};

const KEY = "medosha:city:session";
/** Older than this and the user has moved on; open on the city default. */
const MAX_AGE_MS = 1000 * 60 * 60 * 6;

export function saveSession(session: Omit<MapSession, "savedAt">) {
  try {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ ...session, savedAt: Date.now() }),
    );
  } catch {
    // Blocked storage is not worth an error; the map opens on the default.
  }
}

export function loadSession(citySlug: string): MapSession | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;

    const session = JSON.parse(raw) as MapSession;

    // A session for another city would drop the user somewhere they did not
    // ask to be.
    if (session.citySlug !== citySlug) return null;
    if (Date.now() - session.savedAt > MAX_AGE_MS) return null;

    // Guard every number: a corrupted entry must not send the camera to NaN,
    // which MapLibre cannot recover from.
    if (
      !Number.isFinite(session.longitude) ||
      !Number.isFinite(session.latitude) ||
      !Number.isFinite(session.zoom) ||
      Math.abs(session.latitude) > 90 ||
      Math.abs(session.longitude) > 180
    ) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}
