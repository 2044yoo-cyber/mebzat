import Link from "next/link";

import { CategoryIcon } from "@/components/products/category-icon";

export function TrendingCategories({
  categories,
}: {
  categories: { id: string; slug: string; name: string }[];
}) {
  if (categories.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {categories.map((category) => (
        <Link
          key={category.id}
          href={`/marketplace?category=${category.slug}`}
          className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-5 text-center transition-colors hover:border-brand hover:bg-brand/5"
        >
          <div className="flex size-11 items-center justify-center rounded-xl bg-brand/10">
            <CategoryIcon slug={category.slug} className="size-5 text-brand" />
          </div>
          <span className="text-sm font-medium">{category.name}</span>
        </Link>
      ))}
    </div>
  );
}
