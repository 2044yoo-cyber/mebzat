/**
 * The Agenda while it loads.
 *
 * Shaped like the page that follows — header, four stat tiles, tab row, list —
 * so the layout does not jump when the real thing arrives. The Agenda loads
 * nine queries in parallel, which on a slow connection is long enough that a
 * blank screen reads as a broken link.
 */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy aria-label="Loading the Agenda">
      <div className="space-y-3">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full max-w-lg animate-pulse rounded bg-muted" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-20 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>

      <div className="flex gap-1 border-b pb-px">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div key={index} className="h-9 w-24 animate-pulse rounded bg-muted/60" />
        ))}
      </div>

      <div className="space-y-2">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-16 animate-pulse rounded-2xl border bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
