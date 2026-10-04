"use client";

import Image from "next/image";

/**
 * A small picture of one room.
 *
 * Two code paths, for one reason. A cleared panorama is a public file and goes
 * through `next/image`, which matters more here than almost anywhere else in
 * the app: the source is 4096 pixels wide and is being shown at ninety-six, so
 * unoptimised it would pull two or three megabytes to draw a thumbnail.
 *
 * A panorama still in review is not public. It is reached through a signed URL
 * that expires within the hour, and `next/image` would defeat that twice over:
 * its host allowlist rejects the /object/sign/ path outright, and widening the
 * allowlist would put the optimised copy in Next's image cache, served from
 * /_next/image with no auth and outliving the signature meant to protect it.
 * So a pending room gets a plain <img>: no optimiser, no cache, nothing left
 * behind once the link expires.
 */
export function SceneThumbnail({
  src,
  pending,
  sizes,
  className,
}: {
  src: string;
  pending?: boolean;
  sizes: string;
  className?: string;
}) {
  if (pending) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- deliberate; see above
      <img src={src} alt="" className={className ?? "absolute inset-0 size-full object-cover"} />
    );
  }

  return <Image src={src} alt="" fill sizes={sizes} className={className ?? "object-cover"} />;
}
