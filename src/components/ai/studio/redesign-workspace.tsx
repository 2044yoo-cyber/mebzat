"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Calculator,
  ClipboardList,
  Download,
  HardHat,
  Layers,
  Loader2,
  Maximize2,
  Ruler,
  ScanSearch,
  ShoppingBag,
  Sparkles,
  Sun,
  Upload,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { BeforeAfter } from "@/components/ai/studio/before-after";
import { ConfigPanel } from "@/components/ai/studio/config-panel";
import { QueuePanel } from "@/components/ai/studio/queue-panel";
import {
  DESIGN_STYLES,
  EDIT_TARGETS,
  OPTION_VARIANTS,
  findStyle,
  furnitureHref,
  isShoppable,
  marketplaceHref,
  matchMaterial,
  replacePrompt,
  restylePrompt,
  tradeHref,
  TRADES,
  variantPrompt,
  type EditTarget,
} from "@/lib/ai/design";
import { enqueue, useQueue } from "@/lib/ai/image-queue";
import type { ImageProviderName } from "@/lib/ai/image-models";
import type { ProviderHealth } from "@/lib/ai/provider-status";
import type { SpaceAnalysis } from "@/lib/ai/vision.types";
import { cn } from "@/lib/utils";

/**
 * The AI Design Assistant.
 *
 * The premise: the image is the user's actual property, and the output is that
 * space redesigned — not a stock picture of a space like it. Everything here
 * follows from that. The upload comes first and there is no way past it. The
 * survey runs on the real photograph. The prompts name what to hold as loudly
 * as what to change. The result is shown under a wiper against the original,
 * because "is this still my room?" is the only question that matters.
 *
 * Generation goes through the same queue and the same fallback chain as the
 * rest of the studio — this is a workflow over that machinery, not a second
 * copy of it.
 */

type Stage = "upload" | "ready";

export function RedesignWorkspace({
  configured,
  health,
  onUseInChat,
}: {
  configured: ImageProviderName[];
  health?: ProviderHealth[];
  onUseInChat: (prompt: string) => void;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<SpaceAnalysis | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  // Which provider is working right now, so a long walk across several of
  // them reads as progress rather than as a hang.
  const [analysisStep, setAnalysisStep] = useState<string | null>(null);
  const [style, setStyle] = useState<string>("modern");
  const [instructions, setInstructions] = useState("");
  const [target, setTarget] = useState<EditTarget | null>(null);
  const [material, setMaterial] = useState("");
  const [compare, setCompare] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const { jobs } = useQueue();

  useEffect(() => () => abortRef.current?.abort(), []);

  const mine = jobs.filter((job) => job.tool === "redesign");
  const busy = mine.some(
    (job) => job.status === "running" || job.status === "queued",
  );
  const done = mine.filter((job) => job.status === "done");
  const options = done.flatMap((job) =>
    job.results.map((result) => ({ url: result.url, label: job.label })),
  );

  const stage: Stage = source ? "ready" : "upload";
  const spaceType = analysis?.spaceType ?? "space";

  // ---- Upload ------------------------------------------------------------
  const analyse = useCallback(async (image: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAnalysing(true);
    setAnalysisError(null);
    setAnalysis(null);
    setAnalysisStep("Analysing image…");

    try {
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Asking for the stream is what turns a silent wait into
          // "Using OpenAI Vision…" and then "Retrying with Gemini Vision…".
          accept: "text/event-stream",
        },
        body: JSON.stringify({ image }),
        signal: controller.signal,
      });

      if (!response.body) {
        setAnalysisError("The image could not be analysed.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let settled = false;
      let tried = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let split = buffer.indexOf("\n\n");
        while (split !== -1) {
          const frame = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          split = buffer.indexOf("\n\n");

          const line = frame.split("\n").find((entry) => entry.startsWith("data:"));
          if (!line) continue;

          let event: {
            type: string;
            label?: string;
            reason?: string;
            error?: string;
            analysis?: SpaceAnalysis;
            cached?: boolean;
          };
          try {
            event = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }

          if (event.type === "cached") {
            setAnalysisStep("Already analysed — reusing the result");
          } else if (event.type === "trying") {
            tried += 1;
            setAnalysisStep(
              tried === 1
                ? `Using ${event.label}…`
                : `Retrying with ${event.label}…`,
            );
          } else if (event.type === "failed") {
            setAnalysisStep(event.reason ?? "Trying another provider…");
          } else if (event.type === "result" && event.analysis) {
            settled = true;
            setAnalysis(event.analysis);
            if (event.analysis.suggestedStyles[0]) {
              setStyle(event.analysis.suggestedStyles[0]);
            }
          } else if (event.type === "error") {
            settled = true;
            setAnalysisError(event.error ?? "The image could not be analysed.");
          }
        }
      }

      if (!settled) {
        setAnalysisError(
          "The connection ended before the survey came back. You can still choose a style and redesign it.",
        );
      }
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      setAnalysisError("The image could not be analysed.");
    } finally {
      if (!controller.signal.aborted) {
        setAnalysing(false);
        setAnalysisStep(null);
      }
    }
  }, []);

  const readFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("That is not an image.");
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        toast.error("Photos must be under 8MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result);
        setSource(url);
        setCompare(null);
        void analyse(url);
      };
      reader.onerror = () => toast.error("Could not read that file.");
      reader.readAsDataURL(file);
    },
    [analyse],
  );

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const file = [...(event.clipboardData?.items ?? [])]
        .find((item) => item.type.startsWith("image/"))
        ?.getAsFile();
      if (file) {
        event.preventDefault();
        readFile(file);
        toast.success("Photo pasted");
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [readFile]);

  // ---- Generating --------------------------------------------------------
  function redesign(count: number) {
    if (!source) return;

    const base = restylePrompt({ spaceType, styleId: style, instructions });

    // Four options are four jobs, not one request for four images: different
    // nudges produce genuinely different directions, and the queue runs them
    // one at a time so a free tier is not asked for four at once.
    for (let index = 0; index < count; index += 1) {
      enqueue({
        prompt: count > 1 ? variantPrompt(base, index) : base,
        modelId: "auto",
        intent: "edit",
        aspect: "4:3",
        quality: "standard",
        mode: "balanced",
        freeMode: false,
        count: 1,
        image: source,
        tool: "redesign",
        label:
          count > 1
            ? `${OPTION_VARIANTS[index]?.label ?? `Option ${index + 1}`} · ${findStyle(style)?.label ?? style}`
            : `${findStyle(style)?.label ?? style} · ${spaceType}`,
      });
    }

    toast.success(count > 1 ? `Generating ${count} options` : "Redesigning…");
  }

  function applyEdit() {
    if (!source || !target) return;

    enqueue({
      prompt: replacePrompt({ target, material: material.trim(), spaceType }),
      modelId: "auto",
      intent: "edit",
      aspect: "4:3",
      quality: "standard",
      mode: "balanced",
      freeMode: false,
      count: 1,
      image: compare ?? source,
      tool: "redesign",
      label: `${target.label}${material.trim() ? ` · ${material.trim()}` : ""}`,
    });

    toast.success("Applying…");
    setTarget(null);
    setMaterial("");
  }

  // ---- Upload stage ------------------------------------------------------
  if (stage === "upload") {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <header>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <span aria-hidden>🏠</span>
            AI Design Assistant
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Upload a photo of your actual space. The assistant surveys it, then
            redesigns that room — not a stock picture of one like it.
          </p>
        </header>

        {configured.length === 0 && (
          <ConfigPanel configured={configured} health={health} />
        )}

        <label
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) readFile(file);
          }}
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed p-16 text-center transition-colors hover:border-brand hover:bg-brand/5"
        >
          <Upload className="size-8 text-muted-foreground" />
          <span className="text-base font-medium">
            Drop a photo, paste, or choose a file
          </span>
          <span className="max-w-md text-sm text-muted-foreground">
            A room, a facade, a construction site, a floor plan, a sketch, or a
            screenshot from Revit, SketchUp or CAD. JPEG or PNG, under 8MB.
          </span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) readFile(file);
            }}
          />
        </label>

        <ul className="grid grid-cols-2 gap-2 text-sm text-muted-foreground sm:grid-cols-4">
          {[
            "Kitchen", "Living room", "Bedroom", "Bathroom",
            "Office", "Restaurant", "Hotel", "Shop",
            "Facade", "Landscape", "Warehouse", "Site photo",
          ].map((label) => (
            <li key={label} className="rounded-lg border px-2.5 py-1.5">
              {label}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // ---- Working stage -----------------------------------------------------
  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <span aria-hidden>🏠</span>
            {analysing ? "Reading your photo…" : (analysis?.spaceType ?? "Your space")}
          </h1>
          {analysis?.estimatedDimensions && (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Ruler className="size-3.5" />
              {analysis.estimatedDimensions}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            abortRef.current?.abort();
            setSource(null);
            setAnalysis(null);
            setCompare(null);
          }}
          className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm transition-colors hover:border-brand"
        >
          <X className="size-3.5" />
          Different photo
        </button>
      </header>

      {/* ---- The photo, or the comparison ------------------------------ */}
      {compare ? (
        <BeforeAfter before={source!} after={compare} />
      ) : (
        <div className="relative overflow-hidden rounded-2xl border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={source!}
            alt="Your space"
            className="max-h-96 w-full object-contain"
          />
          {analysing && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
              <p className="flex items-center gap-2 rounded-full bg-background px-3 py-1.5 text-sm shadow-lg">
                <ScanSearch className="size-4 animate-pulse text-brand" />
                {analysisStep ?? "Surveying the space…"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---- The survey ------------------------------------------------ */}
      {analysisError && (
        <p className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-muted-foreground">
          {analysisError}
        </p>
      )}

      {analysis && (
        <section className="space-y-3 rounded-2xl border p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4 text-brand" />
            What the assistant sees
          </h2>
          <p className="text-sm text-muted-foreground">{analysis.summary}</p>

          <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            <Row icon={<Sun className="size-3.5" />} label="Lighting" value={analysis.lighting} />
            <Row label="Walls" value={analysis.walls} />
            <Row label="Floor" value={analysis.floor} />
            <Row label="Ceiling" value={analysis.ceiling} />
            <Row label="Windows" value={analysis.windows} />
            <Row label="Doors" value={analysis.doors} />
            <Row label="Current style" value={analysis.currentStyle} />
          </dl>

          {/* Every detected material is a link into the marketplace: a survey
              that names "ceramic floor tile" and stops there is trivia. */}
          {analysis.surfaces.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase">
                Materials found
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {analysis.surfaces.map((surface) => {
                  const body = (
                    <>
                      <span className="font-medium">{surface.element}</span>
                      <span className="text-muted-foreground">
                        {surface.material}
                      </span>
                    </>
                  );
                  const key = `${surface.element}-${surface.material}`;

                  // A surface the model could not read gets no shop link: the
                  // survey says "unclear" honestly, and searching for that word
                  // would return nothing and look broken.
                  if (!isShoppable(surface.material)) {
                    return (
                      <li
                        key={key}
                        className="flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-xs"
                      >
                        {body}
                      </li>
                    );
                  }

                  return (
                    <li key={key}>
                      <Link
                        href={marketplaceHref(surface.material)}
                        className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors hover:border-brand hover:bg-brand/5"
                      >
                        <ShoppingBag className="size-3 text-brand" />
                        {body}
                        {matchMaterial(surface.material) && (
                          <span className="text-brand">·&nbsp;shop</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {analysis.furniture.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase">
                Furniture found
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {analysis.furniture.map((item) => (
                  <li key={item.item}>
                    <Link
                      href={furnitureHref(item.item)}
                      className="rounded-full border px-2.5 py-1 text-xs transition-colors hover:border-brand hover:bg-brand/5"
                    >
                      {item.item}
                      {item.position && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {item.position}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.problems.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-600 uppercase dark:text-amber-400">
                <AlertTriangle className="size-3" />
                Worth addressing
              </p>
              <ul className="space-y-0.5 text-sm text-muted-foreground">
                {analysis.problems.map((problem) => (
                  <li key={problem}>· {problem}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ---- Styles ----------------------------------------------------- */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">
          Redesign it in
          {analysis?.suggestedStyles.length ? (
            <span className="ml-1.5 font-normal text-muted-foreground">
              — suggested for this space first
            </span>
          ) : null}
        </h2>

        <div className="flex flex-wrap gap-1.5">
          {[...DESIGN_STYLES]
            .sort((a, b) => {
              // The model returns its suggestions best-first, so rank by
              // position rather than merely hoisting the set — otherwise the
              // selected style is not the leftmost chip, which reads as a bug.
              const suggested = analysis?.suggestedStyles ?? [];
              const rank = (id: string) => {
                const at = suggested.indexOf(id);
                return at === -1 ? Number.MAX_SAFE_INTEGER : at;
              };
              return rank(a.id) - rank(b.id);
            })
            .map((entry) => {
              const suggested = analysis?.suggestedStyles.includes(entry.id);
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setStyle(entry.id)}
                  aria-pressed={style === entry.id}
                  title={entry.blurb}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    style === entry.id
                      ? "border-brand bg-brand/10 font-medium text-brand"
                      : "text-muted-foreground hover:border-brand hover:text-foreground",
                    suggested && style !== entry.id && "border-brand/40",
                  )}
                >
                  {entry.label}
                  {suggested && <span className="ml-1 text-brand">✦</span>}
                </button>
              );
            })}
        </div>

        <input
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder="Anything specific? Keep the sofa, add an island, warmer lighting…"
          className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => redesign(1)}
            disabled={configured.length === 0}
            className="flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wand2 className="size-4" />
            )}
            Redesign this space
          </button>
          <button
            type="button"
            onClick={() => redesign(4)}
            disabled={configured.length === 0}
            className="flex h-10 items-center gap-2 rounded-xl border px-3 text-sm transition-colors hover:border-brand disabled:opacity-40"
          >
            <Layers className="size-4" />
            Give me 4 options
          </button>
        </div>
      </section>

      {/* ---- Element editing -------------------------------------------- */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Or change one thing</h2>
        <div className="flex flex-wrap gap-1.5">
          {EDIT_TARGETS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                setTarget(target?.id === entry.id ? null : entry);
                setMaterial("");
              }}
              aria-pressed={target?.id === entry.id}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                target?.id === entry.id
                  ? "border-brand bg-brand/10 text-brand"
                  : "text-muted-foreground hover:border-brand hover:text-foreground",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {target && (
          <div className="space-y-2 rounded-2xl border p-3">
            {target.options && (
              <div className="flex flex-wrap gap-1.5">
                {target.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMaterial(option)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      material === option
                        ? "border-brand bg-brand/10 text-brand"
                        : "text-muted-foreground hover:border-brand",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <input
                value={material}
                onChange={(event) => setMaterial(event.target.value)}
                placeholder={
                  target.kind === "remove"
                    ? "What to remove…"
                    : target.kind === "add"
                      ? "What to add…"
                      : `New ${target.label.toLowerCase()}…`
                }
                className="h-9 min-w-48 flex-1 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
              />
              <button
                type="button"
                onClick={applyEdit}
                disabled={configured.length === 0}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <Wand2 className="size-3.5" />
                Apply
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Everything else in the photo is held: layout, camera angle,
              lighting and every other surface.
            </p>
          </div>
        )}
      </section>

      <QueuePanel />

      {/* ---- Options ---------------------------------------------------- */}
      {options.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">
            {options.length === 1
              ? "Your redesign"
              : `${options.length} designs — tap one to compare against the original`}
          </h2>

          <div
            className={cn(
              "grid gap-3",
              options.length > 1 ? "sm:grid-cols-2" : "",
            )}
          >
            {options.map((option, index) => (
              <figure
                key={`${option.url}-${index}`}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border bg-muted transition-colors",
                  compare === option.url && "border-brand",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={option.url}
                  alt={option.label}
                  className="aspect-[4/3] w-full object-cover"
                />
                <figcaption className="absolute inset-x-2 bottom-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setCompare(compare === option.url ? null : option.url)
                    }
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-background/90 px-2.5 text-xs font-medium backdrop-blur transition-colors hover:bg-background"
                  >
                    <Maximize2 className="size-3.5" />
                    {compare === option.url ? "Comparing" : "Compare"}
                  </button>
                  <a
                    href={option.url}
                    download={`medosha-design-${index + 1}.png`}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-background/90 px-2.5 text-xs font-medium backdrop-blur transition-colors hover:bg-background"
                  >
                    <Download className="size-3.5" />
                    Download
                  </a>
                </figcaption>
                <span className="absolute top-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] backdrop-blur">
                  {option.label}
                </span>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* ---- Build it --------------------------------------------------- */}
      {options.length > 0 && (
        <section className="space-y-3 rounded-2xl border p-4">
          <div>
            <h2 className="flex items-center gap-2 font-medium">
              <HardHat className="size-4 text-brand" />
              Now build it
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              A picture is the easy part. These carry the design into the rest
              of Medosha.
            </p>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-2">
            <Next
              icon={<Calculator className="size-3.5" />}
              label="Estimate what this costs"
              onClick={() =>
                onUseInChat(
                  `Estimate the cost to renovate a ${spaceType.toLowerCase()} in Addis Ababa to a ${findStyle(style)?.label ?? style} standard.${analysis?.estimatedDimensions ? ` The space is ${analysis.estimatedDimensions}.` : ""}${analysis?.surfaces.length ? ` Existing finishes: ${analysis.surfaces.map((s) => `${s.element} in ${s.material}`).join(", ")}.` : ""}`,
                )
              }
            />
            <Next
              icon={<ClipboardList className="size-3.5" />}
              label="Generate a BOQ"
              onClick={() =>
                onUseInChat(
                  `Generate a preliminary bill of quantities for redesigning a ${spaceType.toLowerCase()} in ${findStyle(style)?.label ?? style} style.${analysis?.estimatedDimensions ? ` Approximately ${analysis.estimatedDimensions}.` : ""}`,
                )
              }
            />
            <Next
              icon={<Layers className="size-3.5" />}
              label="List the materials I need"
              onClick={() =>
                onUseInChat(
                  `List the materials and quantities needed to redesign a ${spaceType.toLowerCase()} in ${findStyle(style)?.label ?? style} style, with Ethiopian market prices where you can.`,
                )
              }
            />
            <Next
              icon={<Building2 className="size-3.5" />}
              label="Find suppliers"
              onClick={() =>
                onUseInChat(
                  `Find Medosha suppliers for a ${findStyle(style)?.label ?? style} ${spaceType.toLowerCase()} renovation.`,
                )
              }
            />
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase">
              <Users className="size-3" />
              Hire someone to do it
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TRADES.map((trade) => (
                <Link
                  key={trade.id}
                  href={tradeHref(trade.query)}
                  className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
                >
                  {trade.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 border-t pt-3 text-xs">
            {[
              { href: "/marketplace", label: "Marketplace" },
              { href: "/price-exchange", label: "Compare prices" },
              { href: "/hire/new", label: "Request quotes" },
              { href: "/projects/new", label: "Create a project" },
              { href: "/companies", label: "Companies" },
              { href: "/city", label: "3D City" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border px-2.5 py-1 text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-2">
      <dt className="flex shrink-0 items-center gap-1 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="min-w-0">{value}</dd>
    </div>
  );
}

function Next({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors hover:border-brand hover:bg-brand/5"
    >
      <span className="text-brand">{icon}</span>
      {label}
    </button>
  );
}
