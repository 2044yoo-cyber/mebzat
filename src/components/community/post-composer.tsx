"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Hash, Send } from "lucide-react";
import { toast } from "sonner";

import { AiField } from "@/components/ai/writing/ai-field";
import { createPost } from "@/app/community/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { POST_KIND, POST_KINDS } from "@/lib/constants/community";
import { cn } from "@/lib/utils";
import type { PostKind } from "@/types/database.types";

/** Writes a post. Hashtags are picked out of the text by the database. */
export function PostComposer({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<PostKind>("post");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Shown live so the writer can see what the trigger will pick up.
  const tags = [...new Set(
    [...`${title} ${body}`.matchAll(/#([A-Za-z0-9_]{2,50})/g)].map((match) =>
      match[1]?.toLowerCase() ?? "",
    ),
  )];

  if (!signedIn) {
    return (
      <div className="rounded-2xl border border-dashed p-6 text-center">
        <p className="font-medium">Join the conversation</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to post questions, tips and photos from your sites.
        </p>
        <Button
          className="mt-4"
          onClick={() => router.push("/login?redirect=/community")}
        >
          Sign in
        </Button>
      </div>
    );
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createPost({ kind, title, body });
      if (result.error) {
        setError(result.error);
        return;
      }
      setTitle("");
      setBody("");
      toast.success("Posted");
      if (result.id) router.push(`/community/${result.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap gap-1.5">
        {POST_KINDS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            aria-pressed={kind === value}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
              kind === value
                ? "border-brand bg-brand text-brand-foreground"
                : "hover:border-brand hover:bg-brand/5",
            )}
          >
            {POST_KIND[value].label}
          </button>
        ))}
      </div>

      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={
          kind === "question" ? "What is your question?" : "Title (optional)"
        }
        maxLength={200}
        aria-label="Post title"
        className="mt-3 h-10 text-base"
      />

      <AiField
        // A question is edited differently from a showcase: one is made easier
        // to answer, the other is made easier to read.
        surface={kind === "question" ? "question" : "comment"}
        context={title ? `Post title: ${title}` : undefined}
        value={body}
        onValueChange={(next) => {
          setBody(next);
          setError(null);
        }}
        placeholder={`${POST_KIND[kind].blurb}. Use #tags so people can find it.`}
        maxLength={20000}
        aria-label="Post body"
        className="mt-2 min-h-28"
      />

      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-0.5 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand"
            >
              <Hash className="size-3" />
              {tag}
            </span>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {body.length.toLocaleString()} / 20,000
        </span>
        <Button type="submit" disabled={pending || body.trim().length < 2}>
          <Send className="size-4" />
          {pending ? "Posting…" : "Post"}
        </Button>
      </div>
    </form>
  );
}
