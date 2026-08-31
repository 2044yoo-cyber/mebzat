import type { Metadata } from "next";
import Link from "next/link";
import { Hash, MessagesSquare } from "lucide-react";

import { PostCard } from "@/components/community/post-card";
import { PostComposer } from "@/components/community/post-composer";
import { Pagination } from "@/components/ui/pagination";
import {
  POST_KIND,
  POST_KINDS,
  POST_SORTS,
  isPostKind,
  isPostSort,
  type PostSortKey,
} from "@/lib/constants/community";
import {
  PAGE_SIZE,
  getPosts,
  getTrendingHashtags,
} from "@/lib/data/community";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { PostKind } from "@/types/database.types";

export const metadata: Metadata = {
  title: "Community — Questions, tips and discussions",
  description:
    "Ask questions, share construction tips, and see what professionals across Ethiopia are working on.",
};

export const dynamic = "force-dynamic";

export default async function CommunityPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const get = (key: string) => (Array.isArray(sp[key]) ? sp[key][0] : sp[key]);

  const kindParam = get("kind");
  const kind: PostKind | undefined = isPostKind(kindParam)
    ? kindParam
    : undefined;
  const tag = get("tag") ?? "";
  const sortParam = get("sort");
  const sort: PostSortKey = isPostSort(sortParam) ? sortParam : "recent";
  const page = Math.max(1, Number(get("page")) || 1);

  const supabase = await createClient();
  const [result, trending, { data: auth }] = await Promise.all([
    getPosts({ kind, tag: tag || undefined, sort, page }),
    getTrendingHashtags(14),
    supabase.auth.getUser(),
  ]);

  function makeHref(nextPage: number) {
    const params = new URLSearchParams();
    if (kind) params.set("kind", kind);
    if (tag) params.set("tag", tag);
    if (sort !== "recent") params.set("sort", sort);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/community?${qs}` : "/community";
  }

  function filterHref(next: { kind?: PostKind | null; sort?: PostSortKey }) {
    const params = new URLSearchParams();
    const nextKind = next.kind === undefined ? kind : next.kind;
    if (nextKind) params.set("kind", nextKind);
    if (tag) params.set("tag", tag);
    const nextSort = next.sort ?? sort;
    if (nextSort !== "recent") params.set("sort", nextSort);
    const qs = params.toString();
    return qs ? `/community?${qs}` : "/community";
  }

  return (
    <div className="container-page py-10">
      <header className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessagesSquare className="size-4" /> Community
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {tag ? `#${tag}` : "The Medosha community"}
        </h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          {tag
            ? `Posts tagged #${tag}.`
            : "Questions, tips and discussions from people building in Ethiopia."}
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <PostComposer signedIn={auth.user !== null} />

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={filterHref({ kind: null })}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                !kind
                  ? "border-brand bg-brand text-brand-foreground"
                  : "hover:border-brand hover:bg-brand/5",
              )}
            >
              All
            </Link>
            {POST_KINDS.map((value) => (
              <Link
                key={value}
                href={filterHref({ kind: kind === value ? null : value })}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  kind === value
                    ? "border-brand bg-brand text-brand-foreground"
                    : "hover:border-brand hover:bg-brand/5",
                )}
              >
                {POST_KIND[value].label}
              </Link>
            ))}

            <span className="ml-auto flex items-center gap-1.5">
              {(Object.keys(POST_SORTS) as PostSortKey[]).map((value) => (
                <Link
                  key={value}
                  href={filterHref({ sort: value })}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-sm transition-colors",
                    sort === value
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {POST_SORTS[value]}
                </Link>
              ))}
            </span>
          </div>

          {!result.available ? (
            <Empty
              title="The community is not set up yet"
              description="Apply migration 0010_community_social.sql, then posts will appear here."
            />
          ) : result.posts.length === 0 ? (
            <Empty
              title={tag ? `Nothing tagged #${tag} yet` : "No posts yet"}
              description="Be the first to ask a question or share a tip."
            />
          ) : (
            <>
              <div className="space-y-4">
                {result.posts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={result.total}
                makeHref={makeHref}
              />
            </>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border p-4">
            <h2 className="flex items-center gap-2 font-medium">
              <Hash className="size-4 text-brand" />
              Trending tags
            </h2>
            {trending.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No tags yet. Add #tags to your posts.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {trending.map((hashtag) => (
                  <Link
                    key={hashtag.id}
                    href={`/community?tag=${hashtag.tag}`}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-sm transition-colors",
                      tag === hashtag.tag
                        ? "border-brand bg-brand text-brand-foreground"
                        : "hover:border-brand hover:bg-brand/5",
                    )}
                  >
                    #{hashtag.tag}
                    <span className="ml-1 text-xs opacity-60">
                      {hashtag.post_count}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border p-4">
            <h2 className="font-medium">Elsewhere on Medosha</h2>
            <ul className="mt-2 space-y-1.5 text-sm">
              {[
                { href: "/jobs", label: "Construction jobs" },
                { href: "/events", label: "Events and training" },
                { href: "/price-exchange", label: "Live material prices" },
                { href: "/equipment", label: "Equipment for hire" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Empty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed p-16 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
