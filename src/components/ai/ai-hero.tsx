"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";

import { SUGGESTED_PROMPTS } from "@/lib/ai/quick-actions";
import { cn } from "@/lib/utils";

/**
 * Landing hero for Medosha AI.
 *
 * The input does not stream here — it hands the question to /ai, which owns
 * the conversation. That keeps one chat implementation instead of two, and
 * means an answer survives the navigation.
 */
export function AiHero() {
  const router = useRouter();
  const [draft, setDraft] = useState("");

  function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;
    router.push(`/ai?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <section className="relative isolate overflow-hidden border-b">
      {/* Brand wash and blueprint grid, layered behind the content. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_75%_60%_at_50%_-10%,color-mix(in_oklch,var(--brand)_28%,transparent),transparent)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-20 opacity-[0.05] [background-image:linear-gradient(to_right,var(--foreground)_1px,transparent_1px),linear-gradient(to_bottom,var(--foreground)_1px,transparent_1px)] [background-size:48px_48px]"
      />
      {/* Two slow-drifting glows. Purely decorative, and disabled for anyone
          who has asked for reduced motion. */}
      <div
        aria-hidden
        className="absolute -top-24 -left-24 -z-10 size-96 rounded-full bg-brand/20 blur-3xl motion-safe:animate-pulse"
      />
      <div
        aria-hidden
        className="absolute -right-24 -bottom-32 -z-10 size-96 rounded-full bg-brand/10 blur-3xl motion-safe:animate-pulse [animation-delay:1.5s]"
      />

      <div className="container-page py-20 sm:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="size-3 text-brand" />
            Medosha AI
          </span>

          <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Build Smarter with Medosha AI
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-muted-foreground">
            Your AI construction assistant for architecture, interior design,
            engineering, cost estimation, materials, suppliers, and project
            planning.
          </p>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              ask(draft);
            }}
            className="mx-auto mt-8 max-w-2xl"
          >
            <div className="flex items-end gap-2 rounded-2xl border bg-background/80 p-2 shadow-lg backdrop-blur-xl transition-shadow focus-within:shadow-xl">
              <textarea
                value={draft}
                rows={1}
                placeholder="Estimate the cost of a 200m² villa in Addis Ababa…"
                onChange={(event) => {
                  setDraft(event.target.value);
                  const el = event.target;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    ask(draft);
                  }
                }}
                className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={draft.trim().length === 0}
                aria-label="Ask Medosha AI"
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-xl",
                  "bg-primary text-primary-foreground shadow-md",
                  "transition-transform hover:scale-105 active:scale-95",
                  "disabled:pointer-events-none disabled:opacity-40",
                )}
              >
                <ArrowUp className="size-5" />
              </button>
            </div>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => ask(prompt)}
                className="rounded-full border bg-background/60 px-3 py-1.5 text-sm text-muted-foreground backdrop-blur transition-colors hover:border-brand hover:text-foreground"
              >
                {prompt}
              </button>
            ))}
          </div>

          <p className="mt-6 text-sm text-muted-foreground">
            Or{" "}
            <Link href="/marketplace" className="underline underline-offset-2">
              browse the marketplace
            </Link>{" "}
            directly.
          </p>
        </div>
      </div>
    </section>
  );
}
