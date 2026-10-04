import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Who is here, if anyone.
 *
 * Medosha is public first. Somebody arriving from a TikTok link should see the
 * property, the price and the photographs without an account — and that is not
 * a concession, it is how anybody finds the platform at all. An account unlocks
 * *participation*: liking, saving, messaging, listing. Not reading.
 *
 * These two functions exist so the difference is stated on every page rather
 * than inherited from a layout. A blanket gate on a route group is how
 * `/products` — the marketplace, the most shareable page on the site — ended up
 * behind a login wall: nobody decided that, it was simply in the wrong folder.
 */

export type Viewer = {
  id: string;
  email: string | null;
};

/**
 * The visitor, or null.
 *
 * The normal case. A page calling this renders for everybody and decides for
 * itself what to show differently when somebody is signed in.
 */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return { id: user.id, email: user.email ?? null };
}

/**
 * The visitor, or send them to sign in and bring them back.
 *
 * For pages that genuinely cannot render without an account — a private
 * message thread, somebody's own saved list, an edit form. Not for reading.
 *
 * `next` carries where they were going, so signing in returns them there
 * instead of dumping them on a dashboard. Somebody who clicked "edit my
 * listing" and had to log in should land back on that listing.
 */
export async function requireViewer(next?: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (viewer) return viewer;

  redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
}

/**
 * Whether this viewer owns that row.
 *
 * Ownership is checked in the database by row-level security, which is the
 * boundary that actually holds. This is for deciding what to *render* — an
 * Edit button on your own listing and not on somebody else's. A page that
 * relied on this alone for access would be one policy change away from a leak.
 */
export function owns(viewer: Viewer | null, ownerId: string | null): boolean {
  return Boolean(viewer && ownerId && viewer.id === ownerId);
}
