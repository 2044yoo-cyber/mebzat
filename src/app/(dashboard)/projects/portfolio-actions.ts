"use server";

import { decodeCursor, encodeCursor, isSectionId, PAGE_SIZE, type PortfolioCard } from "@/lib/portfolio/model";
import { readSectionPage } from "@/lib/portfolio/sources";
import { createClient } from "@/lib/supabase/server";

export type PortfolioPage =
  | { ok: true; cards: PortfolioCard[]; cursor: string | null; done: boolean }
  | { ok: false; error: string };

/**
 * The next page of one section of the signed-in person's own portfolio.
 *
 * Whose portfolio is never a parameter: it is whoever is signed in, so the
 * browser cannot ask for somebody else's drafts by naming them — and row-level
 * security would refuse them anyway.
 */
export async function loadPortfolioPage(section: string, cursor: string | null, limit: number = PAGE_SIZE): Promise<PortfolioPage> {
  if (!isSectionId(section)) return { ok: false, error: "That section does not exist." };
  const size = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 24) : PAGE_SIZE;
  const after = cursor === null ? null : decodeCursor(cursor);
  if (cursor !== null && !after) return { ok: false, error: "That page is not valid. Reload to start again." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to see your work." };

  try {
    const page = await readSectionPage(supabase, user.id, section, after, size);
    return { ok: true, cards: page.cards, cursor: encodeCursor(page.next), done: page.done };
  } catch {
    return { ok: false, error: "Your work could not be loaded. Check the connection and try again." };
  }
}
