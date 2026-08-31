import { Skeleton } from "@/components/ui/skeleton";

/**
 * What the feed looks like while it is loading.
 *
 * Shaped like a real card — avatar, two lines of header, a title, a 4:3 media
 * box and an action row — so the layout does not jump when the content
 * arrives. A generic spinner would reserve no space and every card would push
 * the page down as it landed.
 */
export function FeedCardSkeleton() {
  return (
    <div className="overflow-hidden border-b border-border bg-background @lg/ws:rounded-2xl @lg/ws:border">
      <div className="flex items-start gap-2.5 px-3 pt-3 pb-2">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="flex-1 space-y-1.5 pt-0.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-44" />
        </div>
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>

      <div className="space-y-2 px-3 pb-3">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>

      <Skeleton className="aspect-4/3 w-full rounded-none" />

      <div className="flex items-center gap-2 px-3 py-3">
        <Skeleton className="h-8 w-14 rounded-full" />
        <Skeleton className="h-8 w-14 rounded-full" />
        <Skeleton className="h-8 w-14 rounded-full" />
      </div>
    </div>
  );
}

export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, index) => (
        <FeedCardSkeleton key={index} />
      ))}
    </div>
  );
}
