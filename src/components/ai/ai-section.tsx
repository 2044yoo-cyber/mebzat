"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowUp,
  Building2,
  Calculator,
  ClipboardList,
  HardHat,
  Layers,
  Sparkles,
  Users,
  Wand2,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { AiAgentName } from "@/types/database.types";

/**
 * The Medosha AI band that sits in the middle of the homepage.
 *
 * One premium section among the marketplace content, not a landing page: the
 * assistant is a feature of the platform, so it gets a section, not the hero.
 * The input hands off to /ai rather than streaming here, which keeps a single
 * chat implementation and lets an answer survive the navigation.
 */

type Action = {
  label: string;
  agent: AiAgentName;
  prompt: string;
  icon: LucideIcon;
};

const ACTIONS: Action[] = [
  {
    label: "Estimate Building Cost",
    agent: "cost",
    prompt: "Estimate the cost of a 200m² villa in Addis Ababa to a standard finish.",
    icon: Calculator,
  },
  {
    label: "Generate BOQ",
    agent: "boq",
    prompt: "Generate a preliminary BOQ for a 150m² two-storey residential house.",
    icon: ClipboardList,
  },
  {
    label: "Find Materials",
    agent: "materials",
    prompt: "Recommend flooring materials for a high-traffic commercial space.",
    icon: Layers,
  },
  {
    label: "Find Companies",
    agent: "companies",
    prompt: "Find construction companies in Addis Ababa.",
    icon: Building2,
  },
  {
    label: "Find Professionals",
    agent: "professionals",
    prompt: "Find architects who work on residential villas.",
    icon: Users,
  },
  {
    label: "Construction Advice",
    agent: "construction",
    prompt: "What should I check before pouring a ground-floor slab?",
    icon: HardHat,
  },
  {
    label: "Rendering Assistant",
    agent: "render",
    prompt: "Write a rendering prompt for a modern Ethiopian villa at golden hour.",
    icon: Wand2,
  },
];

const SUGGESTED = [
  "Estimate the cost of a 200m² villa",
  "Compare UPVC vs aluminium windows",
  "Find flooring suppliers in Addis Ababa",
  "Generate a construction schedule",
];

export function AiSection() {
  const router = useRouter();
  const [draft, setDraft] = useState("");

  function ask(question: string, agent?: AiAgentName) {
    const trimmed = question.trim();
    if (!trimmed) return;
    const params = new URLSearchParams({ q: trimmed });
    if (agent) params.set("agent", agent);
    router.push(`/ai?${params}`);
  }

  return (
    <section className="relative isolate overflow-hidden border-y bg-muted/30">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,color-mix(in_oklch,var(--brand)_18%,transparent),transparent)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.04] [background-image:linear-gradient(to_right,var(--foreground)_1px,transparent_1px),linear-gradient(to_bottom,var(--foreground)_1px,transparent_1px)] [background-size:44px_44px]"
      />

      <div className="container-page py-16 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="size-3 text-brand" />
            Medosha AI
          </span>

          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Ask Medosha AI
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-balance text-muted-foreground">
            Cost estimates, bills of quantities, materials and suppliers —
            answered from the Medosha catalogue.
          </p>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              ask(draft);
            }}
            className="mx-auto mt-7 max-w-2xl"
          >
            <div className="flex items-end gap-2 rounded-2xl border bg-background/80 p-2 shadow-lg backdrop-blur-xl transition-shadow focus-within:shadow-xl">
              <textarea
                value={draft}
                rows={1}
                placeholder="Ask about costs, materials, suppliers, schedules…"
                onChange={(event) => {
                  setDraft(event.target.value);
                  const el = event.target;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    ask(draft);
                  }
                }}
                className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={draft.trim().length === 0}
                aria-label="Ask Medosha AI"
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl",
                  "bg-primary text-primary-foreground shadow-md",
                  "transition-transform hover:scale-105 active:scale-95",
                  "disabled:pointer-events-none disabled:opacity-40",
                )}
              >
                <ArrowUp className="size-5" />
              </button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {SUGGESTED.map((prompt) => (
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
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => ask(action.prompt, action.agent)}
              className="group flex flex-col items-center gap-2 rounded-xl border bg-background/70 p-4 text-center backdrop-blur transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-md"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-brand/10 text-brand transition-colors group-hover:bg-brand/15">
                <action.icon className="size-4" />
              </span>
              <span className="text-xs font-medium leading-tight">
                {action.label}
              </span>
            </button>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          <Link href="/ai" className="underline underline-offset-2 hover:text-foreground">
            Open Medosha AI
          </Link>{" "}
          for the full assistant.
        </p>
      </div>
    </section>
  );
}
