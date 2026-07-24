"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";

export function ProductGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl border bg-muted text-muted-foreground">
        <ImageOff className="size-10" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-2xl border bg-muted">
        <Image
          src={images[active]}
          alt={alt}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover"
        />
      </div>
      {images.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View image ${i + 1}`}
              aria-current={i === active}
              className={cn(
                "relative size-16 overflow-hidden rounded-lg border-2 transition-colors",
                i === active ? "border-brand" : "border-transparent",
              )}
            >
              <Image
                src={url}
                alt=""
                fill
                sizes="64px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
