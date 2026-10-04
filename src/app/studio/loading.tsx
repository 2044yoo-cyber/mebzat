/**
 * The studio's skeleton.
 *
 * The page fetches supplier rates before it renders, and on a slow connection
 * that is a second or two of nothing. A shape that matches what arrives is
 * better than a blank column.
 */
export default function StudioLoading() {
  return (
    <div className="flex h-full animate-pulse flex-col gap-3 p-3">
      <div className="h-8 w-full rounded-lg bg-muted" />
      <div className="grid min-h-0 flex-1 gap-3 @4xl/ws:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <div className="rounded-xl bg-muted/60" />
        <div className="hidden rounded-xl bg-muted/60 @4xl/ws:block" />
      </div>
    </div>
  );
}
