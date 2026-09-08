import Image from "next/image";
import Link from "next/link";
import { ImageIcon } from "lucide-react";

import { PROJECT_PLACEHOLDER } from "@/lib/constants/placeholders";
import type { ProfileWork } from "@/lib/data/professional-profile";

/**
 * Finished work.
 *
 * These are the photographs the watermark exists for, so each one links back
 * to the service it belongs to. Attribution is the other half of the
 * protection: a mark says who took it, and a link says where to find them.
 */
export function ProfilePortfolio({
  portfolio,
  name,
}: {
  portfolio: ProfileWork[];
  name: string;
}) {
  if (portfolio.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        <ImageIcon className="mx-auto mb-2 size-5" />
        {name} has not added any finished work yet.
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {portfolio.map((work) => (
        <li key={work.id}>
          <Link
            href={`/services/${work.serviceId}`}
            className="group block overflow-hidden rounded-xl border"
          >
            <div className="relative aspect-[4/3] bg-muted">
              <Image
                src={work.image_url || PROJECT_PLACEHOLDER}
                alt={work.title ?? work.serviceTitle}
                fill
                sizes="(max-width: 640px) 50vw, 33vw"
                className="object-cover transition-transform group-hover:scale-[1.02]"
              />
            </div>
            <div className="space-y-0.5 p-2">
              <p className="line-clamp-1 text-xs font-medium">
                {work.title || work.serviceTitle}
              </p>
              {work.completed_on && (
                <p className="text-[11px] text-muted-foreground">
                  {new Date(work.completed_on).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                  })}
                </p>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
