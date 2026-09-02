import Link from "next/link";

import { SuggestedAuthors } from "@/components/feed/discovery-rail";
import { Feed } from "@/components/feed/feed";
import { FeedComposer } from "@/components/feed/feed-composer";
import { GlobalSearch } from "@/components/search/global-search";
import {
  getFeedPage,
  getSuggestedAuthors,
} from "@/lib/data/feed";
import { getNavProfile } from "@/lib/nav-profile";

/**
 * The Medosha homepage: the Smart Discovery Feed.
 *
 * This used to be twelve fixed sections — featured products, featured
 * companies, featured projects, and so on down the page. That is a shop
 * window: identical every visit, nothing to come back for tomorrow, and every
 * band of it an advertisement for something the visitor did not ask about.
 *
 * It is now one ranked, endless feed. A slab pour in Ayat, a cement price
 * that moved this week, a free BOQ template, a question somebody needs
 * answered, a villa for sale in CMC — mixed, so the next card is never
 * predictable and is usually worth the scroll.
 *
 * Built for a phone. One column at the width a thumb reads, cards that run
 * edge to edge below `sm`, and navigation at the bottom of the screen where
 * the thumb already is. The desktop layout is the same feed with a rail
 * beside it, not a different page.
 *
 * The first page is rendered here on the server so the homepage paints
 * content rather than a spinner; the infinite scroll takes over from there.
 */

export const dynamic = "force-dynamic";

export default async function Home() {
  const [profile, page, authors] = await Promise.all([
    getNavProfile(),
    getFeedPage({ limit: 12 }),
    getSuggestedAuthors(8),
  ]);

  const signedIn = Boolean(profile);
  const viewer = profile
    ? { name: profile.fullName ?? "You", avatarUrl: profile.avatarUrl }
    : null;

  return (
    // Everything here sizes off `@…/ws` — the workspace column — rather than
    // the viewport. Collapse the rail or close the context panel and this page
    // widens into the space; open them and it narrows back. Viewport
    // breakpoints cannot do that, because the viewport has not changed.
    <div className="mx-auto flex w-full max-w-[1500px] justify-center gap-6 px-0 py-3 @lg/ws:px-4 @2xl/ws:py-5">
      {/* ---- The feed ------------------------------------------------- */}
      <div className="min-w-0 flex-1 @5xl/ws:max-w-[820px] @7xl/ws:max-w-[960px]">
        {/* Search sits above the feed on a phone, because someone who arrived
            looking for one specific thing should not have to find the header
            first. */}
        <div className="mb-3 px-3 @lg/ws:px-0">
          <GlobalSearch />
        </div>

        <FeedComposer signedIn={signedIn} viewer={viewer} />

        {/* Narrow, the rail has nowhere to go, so the people row is injected
            into the stream where a reader will actually meet it. */}
        <div className="mb-3">
          <SuggestedAuthors authors={authors.slice(0, 6)} signedIn={signedIn} />
        </div>

        <Feed initial={page} signedIn={signedIn} viewer={viewer} />

        {/* The rail carried these and it is gone. They live under the feed
            instead, because it was the only place in the whole application
            linking About, Privacy and Terms — removing the rail without this
            would leave those pages reachable only by typing the URL. One
            wrapping row, not a footer block. */}
        <nav className="px-4 py-6 text-xs text-muted-foreground">
          <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
            {[
              ["/about", "About"],
              ["/help", "Help"],
              ["/careers", "Careers"],
              ["/contact", "Contact"],
              ["/privacy", "Privacy"],
              ["/terms", "Terms"],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="hover:text-foreground">
                  {label}
                </Link>
              </li>
            ))}
            <li>© {new Date().getFullYear()} Medosha</li>
          </ul>
        </nav>
      </div>

    </div>
  );
}
