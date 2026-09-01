"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Coins,
  Eraser,
  ImagePlus,
  Loader2,
  Paperclip,
  Pencil,
  Sparkles,
  Square,
  X,
} from "lucide-react";

import { Markdown } from "@/components/ai/markdown";
import {
  composeAiPrompt,
  routeRequest,
  QUICK_ACTIONS,
  type RoutedRequest,
} from "@/lib/ai/intent";
import { formatCredits } from "@/lib/billing/metering";
import { boundsOf, publishHighlight } from "@/lib/map/ai-highlight";
import { openPropertyId } from "@/lib/ai/open-property";
import { cn } from "@/lib/utils";

/**
 * Medosha AI.
 *
 * One conversation. You type, you attach a photograph if you have one, and the
 * assistant works out what you asked for — a render, a material swap, a cost
 * estimate, a question about cement. There is no mode to choose and nothing to
 * select first, which is the entire point: the complexity belongs in the
 * routing, not in a list of fifteen applications the member has to learn.
 *
 * ## How a turn works
 *
 * `routeRequest` decides, from the words and whether an image is attached,
 * whether this is a job for the text model or the image model, and calls the
 * endpoint that already existed for that. Nothing new was built underneath —
 * `/api/ai/chat` and `/api/ai/image` are the same two routes the studio has
 * always used, and both re-derive the routing server-side, because a client
 * that decided what it was charged for would be a client that could decide to
 * be charged nothing.
 *
 * ## Why the last image carries forward
 *
 * The conversation in the brief — "make this modern", then "change the stone to
 * darker gray", then "add warm lighting" — only works if each answer becomes
 * the next question's input. So the most recent image in the thread, whether
 * uploaded or generated, is what the next edit acts on until somebody attaches
 * a new one. That is the difference between a chat and a tool you have to
 * re-upload into.
 */

type Attachment = { url: string; name: string };

type Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** What the member attached, or what the assistant produced. */
  images?: string[];
  /** Shown only when the routing was uncertain enough to be worth stating. */
  reading?: string;
  sources?: { kind: string; id: string; title: string; href: string }[];
  credits?: number;
  pending?: boolean;
};

export function MedoshaAi({
  initialPrompt,
  initialBalance,
  agent,
}: {
  initialPrompt?: string;
  initialBalance: number | null;
  /** Set when arriving from a Construction link, to pin one assistant. */
  agent?: string;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState(initialPrompt ?? "");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(initialBalance);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The listing the assistant is open beside, read from the route. See
  // `open-property.ts` — there is no prop between this panel and that page.
  const pathname = usePathname();
  const propertyId = openPropertyId(pathname);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns]);

  /**
   * The image the next instruction acts on.
   *
   * A fresh attachment wins; otherwise the most recent image anywhere in the
   * thread, which is what makes "now make it darker" mean anything.
   */
  const carriedImage = useCallback((): string | null => {
    if (attachment) return attachment.url;
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      const images = turns[i]?.images;
      if (images && images.length > 0) return images[images.length - 1] ?? null;
    }
    return null;
  }, [attachment, turns]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;

      const image = carriedImage();
      const route = routeRequest({ text: question, hasImage: Boolean(image) });

      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setError(null);
      setDraft("");
      setAttachment(null);

      const answerId = `a-${crypto.randomUUID()}`;
      const history = turns;

      setTurns([
        ...history,
        {
          id: `q-${crypto.randomUUID()}`,
          role: "user",
          content: question,
          images: attachment ? [attachment.url] : undefined,
        },
        {
          id: answerId,
          role: "assistant",
          content: "",
          pending: true,
          // Said out loud only when the read was marginal. A confident route
          // acts silently — narrating every turn is noise, and narrating none
          // of them makes a wrong guess impossible to correct.
          reading: route.confidence < 0.6 ? route.reading : undefined,
        },
      ]);

      try {
        if (route.task === "image") {
          await runImage(question, image, route, answerId, controller);
        } else {
          await runChat(question, history, route, answerId, controller);
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof Error ? caught.message : "Something went wrong.",
          );
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
        setTurns((prev) =>
          prev.map((t) => (t.id === answerId ? { ...t, pending: false } : t)),
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, turns, attachment, carriedImage],
  );

  /** Words. The same streaming endpoint the assistant has always used. */
  async function runChat(
    question: string,
    history: Turn[],
    route: RoutedRequest,
    answerId: string,
    controller: AbortController,
  ) {
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        question,
        agent,
        capability: route.capability,
        propertyId,
        history: history
          .filter((t) => t.content)
          .map((t) => ({ role: t.role, content: t.content })),
      }),
    });

    if (!response.ok || !response.body) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(payload?.error ?? "Medosha AI is unavailable.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const raw of frames) {
        const eventLine = raw.split("\n").find((l) => l.startsWith("event:"));
        const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
        if (!eventLine || !dataLine) continue;

        const event = eventLine.slice(6).trim();
        const data = JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>;

        if (event === "meta") {
          const sources = data.sources as Turn["sources"];
          setTurns((prev) =>
            prev.map((t) => (t.id === answerId ? { ...t, sources } : t)),
          );

          // The rows the search returned, handed to the map so it shows the
          // same listings the answer is about. Only when there are some —
          // clearing on an unrelated turn would wipe a search still on screen.
          const listings = (data.listings ?? []) as {
            id: string;
            latitude: number;
            longitude: number;
          }[];
          if (listings.length > 0) {
            publishHighlight({
              ids: listings.map((listing) => listing.id),
              bounds: boundsOf(listings),
              label: `${listings.length} ${listings.length === 1 ? "match" : "matches"} from Medosha AI`,
            });
          }
        } else if (event === "delta") {
          const text = String(data.text ?? "");
          setTurns((prev) =>
            prev.map((t) =>
              t.id === answerId ? { ...t, content: t.content + text } : t,
            ),
          );
        } else if (event === "done") {
          const credits = Number(data.credits);
          if (typeof data.balance === "number") setBalance(data.balance);
          setTurns((prev) =>
            prev.map((t) =>
              t.id === answerId
                ? { ...t, credits: Number.isFinite(credits) ? credits : undefined }
                : t,
            ),
          );
        } else if (event === "error") {
          setError(String(data.message ?? "Something went wrong."));
        }
      }
    }
  }

  /** Pictures. The prompt carries the geometry clause when it applies. */
  async function runImage(
    question: string,
    image: string | null,
    route: RoutedRequest,
    answerId: string,
    controller: AbortController,
  ) {
    const response = await fetch("/api/ai/image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        prompt: composeAiPrompt(question, route),
        intent: route.intent,
        capability: route.capability,
        image: image ?? undefined,
        count: 1,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          images?: { url: string }[];
          error?: string;
          credits?: number;
          balance?: number | null;
        }
      | null;

    if (!response.ok || !payload?.images?.length) {
      throw new Error(payload?.error ?? "The image could not be generated.");
    }

    if (typeof payload.balance === "number") setBalance(payload.balance);

    setTurns((prev) =>
      prev.map((t) =>
        t.id === answerId
          ? {
              ...t,
              content: route.preserveGeometry
                ? "I kept the building exactly as it is and changed only what you asked for."
                : "Here it is.",
              images: payload.images?.map((entry) => entry.url) ?? [],
              credits: payload.credits,
            }
          : t,
      ),
    );
  }

  function attach(file: File) {
    // Read to a data URL rather than uploading. Somebody's photograph of their
    // own house is not something to publish to storage so that a model can look
    // at it — it goes to the provider and nowhere else.
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? "");
      if (url.startsWith("data:image/")) {
        setAttachment({ url, name: file.name });
      } else {
        setError("That file is not an image.");
      }
    };
    reader.readAsDataURL(file);
  }

  const empty = turns.length === 0;
  const carried = carriedImage();

  /**
   * One composer, rendered in one of two places.
   *
   * Before the first message it sits in the middle of the screen with the
   * greeting above it; afterwards it is pinned to the bottom and the
   * conversation scrolls behind it. Assigning it once and placing it twice is
   * what keeps that a single component — two copies in two branches is two
   * places to fix the next time the attach button changes.
   *
   * It remounts when the branch flips, which happens exactly once, on the turn
   * the conversation starts. The draft is state up here and survives it.
   */
  const composer = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void send(draft);
      }}
      className="mx-auto w-full max-w-3xl px-4 py-3"
    >
      {/* Shortcuts, not modes. Each drops a phrase the router would have
          understood anyway, so nothing here is reachable only by chip. */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {QUICK_ACTIONS.filter(
          (action) => !action.needsImage || Boolean(carried),
        ).map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => setDraft(action.phrase)}
            className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
          >
            {action.label}
          </button>
        ))}
      </div>

      {attachment && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border bg-muted/40 px-2 py-1.5">
          <Image
            src={attachment.url}
            alt=""
            width={40}
            height={40}
            unoptimized
            className="size-10 rounded-lg object-cover"
          />
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {attachment.name}
          </span>
          <button
            type="button"
            onClick={() => setAttachment(null)}
            aria-label="Remove attachment"
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {!attachment && carried && (
        <p className="mb-2 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
          <ImagePlus className="size-3" />
          Editing the last image. Attach another to start from a new one.
        </p>
      )}

      <div className="flex items-end gap-2 rounded-2xl border bg-card px-3 py-2 shadow-sm">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) attach(file);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Attach an image"
          className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Paperclip className="size-4" />
        </button>

        <textarea
          value={draft}
          rows={1}
          placeholder="Tell Medosha AI what you want…"
          onChange={(event) => {
            setDraft(event.target.value);
            const el = event.target;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(draft);
            }
          }}
          onPaste={(event) => {
            // Pasting a screenshot is how people actually attach a plan.
            const file = event.clipboardData.files[0];
            if (file?.type.startsWith("image/")) {
              event.preventDefault();
              attach(file);
            }
          }}
          className="max-h-44 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />

        {turns.length > 0 && !busy && (
          <button
            type="button"
            onClick={() => {
              setTurns([]);
              setError(null);
              setAttachment(null);
            }}
            aria-label="Clear conversation"
            className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Eraser className="size-4" />
          </button>
        )}

        {busy ? (
          <button
            type="button"
            onClick={() => {
              abortRef.current?.abort();
              setBusy(false);
            }}
            aria-label="Stop"
            className="flex size-9 items-center justify-center rounded-xl bg-muted text-foreground transition-colors hover:bg-muted/70"
          >
            {turns.some((t) => t.pending) ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Square className="size-3.5 fill-current" />
            )}
          </button>
        ) : (
          <button
            type="submit"
            disabled={draft.trim().length === 0}
            aria-label="Send"
            className={cn(
              "flex size-9 items-center justify-center rounded-xl transition-all",
              "bg-primary text-primary-foreground hover:bg-primary/85",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            <ArrowUp className="size-4" />
          </button>
        )}
      </div>

      <p className="pt-2 text-center text-[11px] text-muted-foreground">
        Medosha AI gives planning guidance, not certified engineering sign-off.
      </p>
    </form>
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col">
      {/* ---- Balance ---------------------------------------------------- */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-4">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="size-4 text-brand" />
          Medosha AI
        </p>
        <Link
          href="/billing"
          className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
        >
          <Coins className="size-3.5" />
          {balance === null ? "—" : formatCredits(balance)} credits
        </Link>
      </div>

      {/*
        Empty, the greeting and the composer sit together in the middle of the
        screen — slightly above true centre, because a block centred exactly
        reads as low once the header is accounted for. After the first message
        the composer drops to the bottom and the conversation takes the space.
      */}
      {empty ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center pb-[8vh]">
          <div className="mx-auto w-full max-w-2xl px-4 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border bg-muted/40 text-brand">
              <Sparkles className="size-5" />
            </div>
            <p className="mt-4 text-lg font-medium">How can I help you today?</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Describe what you want, or upload a photo, sketch or plan. Medosha
              works out the rest — no tool to pick.
            </p>

            {/*
              The three things people arrive wanting. Sketch → 3D Render is a
              workspace of its own because it has a panel of settings behind it;
              the other two are questions, so they go straight in the box.
            */}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link
                href="/ai?mode=render"
                className="flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/5 px-3.5 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/10"
              >
                <Sparkles className="size-3.5" />
                AI Sketch → 3D Render
              </Link>
              <button
                type="button"
                onClick={() => setDraft("Estimate the construction cost of ")}
                className="rounded-full border px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
              >
                Estimate Cost
              </button>
              <button
                type="button"
                onClick={() => setDraft("Create a bill of quantities for ")}
                className="rounded-full border px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
              >
                BOQ
              </button>
            </div>
          </div>

          <div className="mt-5">{composer}</div>
        </div>
      ) : (
        <>
      <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
            {turns.map((turn) =>
              turn.role === "user" ? (
                <div key={turn.id} className="flex flex-col items-end gap-2">
                  {turn.images?.map((url) => (
                    <Image
                      key={url}
                      src={url}
                      alt="Attached"
                      width={320}
                      height={240}
                      unoptimized
                      className="max-h-56 w-auto rounded-2xl border object-cover"
                    />
                  ))}
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                    {turn.content}
                  </div>
                </div>
              ) : (
                <div key={turn.id} className="space-y-2">
                  {turn.reading && (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-brand">
                      <Sparkles className="size-3" />
                      {turn.reading}
                    </p>
                  )}

                  {turn.content ? (
                    <Markdown content={turn.content} />
                  ) : turn.pending ? (
                    <div className="flex gap-1 py-2">
                      {[0, 150, 300].map((delay) => (
                        <span
                          key={delay}
                          className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
                          style={{ animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </div>
                  ) : null}

                  {turn.images?.map((url) => (
                    <div key={url} className="space-y-1.5">
                      <Image
                        src={url}
                        alt="Generated"
                        width={768}
                        height={512}
                        unoptimized
                        className="w-full rounded-2xl border"
                      />
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Pencil className="size-3" />
                        Keep going — say what to change and it edits this image.
                      </p>
                    </div>
                  ))}

                  {turn.sources && turn.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {turn.sources.slice(0, 6).map((source) => (
                        <Link
                          key={`${source.kind}-${source.id}`}
                          href={source.href}
                          className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
                        >
                          {source.title}
                        </Link>
                      ))}
                    </div>
                  )}

                  {turn.credits !== undefined && turn.credits > 0 && (
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      −{formatCredits(turn.credits)} credits
                    </p>
                  )}
                </div>
              ),
            )}
            <div ref={bottomRef} />
          </div>
      </div>

      {error && (
        <div className="mx-auto w-full max-w-3xl px-4">
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        </div>
      )}

      {composer}
        </>
      )}
    </div>
  );
}
