import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Star } from "lucide-react";

import { AVATAR_PLACEHOLDER } from "@/lib/constants/placeholders";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { ReviewRow } from "@/lib/data/reviews";

/** The five stars, filled to a rating. */
export function Stars({
  rating,
  className,
}: {
  rating: number;
  className?: string;
}) {
  return (
    <span
      className={cn("flex items-center gap-0.5", className)}
      role="img"
      aria-label={`${rating} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            "size-3.5",
            star <= Math.round(rating)
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}

export function ReviewCard({ review }: { review: ReviewRow }) {
  const author = review.author;
  const name =
    author?.company_name ?? author?.full_name ?? author?.username ?? "A member";

  return (
    <article className="flex h-full flex-col rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2.5">
        <Image
          src={author?.avatar_url || AVATAR_PLACEHOLDER}
          alt=""
          width={36}
          height={36}
          className="size-9 shrink-0 rounded-full object-cover"
        />
        <div className="min-w-0 flex-1">
          {author?.username ? (
            <Link
              href={`/u/${author.username}`}
              className="block truncate text-sm font-medium hover:underline"
            >
              {name}
            </Link>
          ) : (
            <span className="block truncate text-sm font-medium">{name}</span>
          )}
          <span className="block text-xs text-muted-foreground">
            {formatRelativeTime(review.created_at)}
          </span>
        </div>
        {review.verified && (
          <span
            className="flex shrink-0 items-center gap-1 text-xs text-brand"
            title="This reviewer transacted through Medosha"
          >
            <BadgeCheck className="size-3.5" />
            Verified
          </span>
        )}
      </div>

      <Stars rating={review.rating} className="mt-3" />

      {review.title && <h3 className="mt-2 font-medium">{review.title}</h3>}
      {review.body && (
        <p className="mt-1 line-clamp-5 flex-1 text-sm text-muted-foreground">
          {review.body}
        </p>
      )}

      {review.reply && (
        <div className="mt-3 rounded-xl border-l-2 border-brand bg-muted/50 p-3">
          <p className="text-xs font-medium">Reply from the seller</p>
          <p className="mt-0.5 line-clamp-3 text-sm text-muted-foreground">
            {review.reply}
          </p>
        </div>
      )}
    </article>
  );
}
