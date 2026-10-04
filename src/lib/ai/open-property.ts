/**
 * Which listing the user is looking at, read from the URL.
 *
 * The assistant lives in the app shell's context panel, which is mounted once
 * for the whole application and knows nothing about the page beside it. The
 * property page is a server component several layers away. There is no prop
 * between them.
 *
 * The path already carries the answer. `/property/<uuid>` is the page, and the
 * uuid in it is the listing — so the assistant reads the route it is sitting
 * next to rather than having the id threaded down through a layout that would
 * have to become a client component to pass it.
 *
 * Only the id travels. The route fetches the row itself through the ordinary
 * reader, so row-level security and the location redaction both still apply:
 * this is a lookup key, not a claim about what the reader is allowed to see.
 */

/** Matches `/property/<uuid>` and its sub-routes, and nothing else. */
const PROPERTY_PATH =
  /^\/property\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

/**
 * The listing id in a path, or null.
 *
 * `/property/new` and `/property` both return null — the first is a form and
 * the second is the browse page, and neither is a listing. Requiring the uuid
 * shape rather than "whatever is after /property/" is what keeps "new" from
 * being looked up as an id on every keystroke of the create form.
 */
export function openPropertyId(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  return PROPERTY_PATH.exec(pathname)?.[1] ?? null;
}
