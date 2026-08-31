"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Calculator,
  ClipboardList,
  Download,
  ImagePlus,
  Layers,
  Loader2,
  Settings2,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ConfigPanel } from "@/components/ai/studio/config-panel";
import {
  ASPECT_RATIOS,
  CAPABILITY_LABEL,
  COST_LABEL,
  IMAGE_MODELS,
  IMAGE_PROVIDERS,
  MAX_IMAGES,
  QUALITY_LEVELS,
  QUALITY_MODES,
  autoPick,
  findModel,
  type AspectRatio,
  type ImageProviderName,
  type QualityLevel,
  type QualityMode,
} from "@/lib/ai/image-models";
import { QueuePanel } from "@/components/ai/studio/queue-panel";
import { cancel as cancelJob, enqueue, useQueue } from "@/lib/ai/image-queue";
import type { ProviderHealth } from "@/lib/ai/provider-status";
import {
  PROMPT_LIBRARY,
  REPLACEABLE_ELEMENTS,
  STYLE_PRESETS,
  composePrompt,
  materialPrompt,
  type ReplaceableElement,
  type StudioTool,
} from "@/lib/ai/studio";
import { cn } from "@/lib/utils";

/**
 * The image half of the studio.
 *
 * One component serves every image tool. What changes between them is the
 * tool's intent, the capability its model must have, and whether a source
 * image is required — all read from the tool manifest, so adding a tool never
 * touches this file.
 */

type Result = { url: string; width?: number; height?: number };

export function ImageWorkspace({
  tool,
  configured,
  health,
  onUseInChat,
}: {
  tool: StudioTool;
  configured: ImageProviderName[];
  health?: ProviderHealth[];
  /** Hands a generated image's prompt to the chat assistant. */
  onUseInChat: (prompt: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [modelId, setModelId] = useState("auto");
  const [aspect, setAspect] = useState<AspectRatio>("4:3");
  const [quality, setQuality] = useState<QualityLevel>("standard");
  const [count, setCount] = useState(1);
  const [styles, setStyles] = useState<string[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [element, setElement] = useState<ReplaceableElement>("floor");
  const [freeOnly, setFreeOnly] = useState(false);
  const [mode, setMode] = useState<QualityMode>("balanced");
  const [showSettings, setShowSettings] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  const dropRef = useRef<HTMLDivElement>(null);

  // Models that can do what this tool needs, and that are actually usable.
  const models = useMemo(() => {
    return IMAGE_MODELS.filter((model) => {
      if (tool.capability && !model.capabilities.includes(tool.capability)) {
        return false;
      }
      if (freeOnly && !model.free) return false;
      return true;
    });
  }, [tool.capability, freeOnly]);

  const { jobs } = useQueue();

  // The queue is the single source of truth for "what is happening". Deriving
  // from it rather than keeping a second copy is what stops the button and the
  // queue row disagreeing about whether a job is still running.
  const mine = jobs.filter((job) => job.tool === tool.id);
  const busy = mine.some(
    (job) => job.status === "running" || job.status === "queued",
  );
  const latestDone = [...mine]
    .reverse()
    .find((job) => job.status === "done");
  const latestFailed = [...mine]
    .reverse()
    .find((job) => job.status === "failed");
  const results: Result[] = latestDone?.results ?? [];
  const error = latestDone ? null : (latestFailed?.error ?? null);
  const needsConfig =
    configured.length === 0 ||
    Boolean(error && error.toLowerCase().includes("api key"));
  const autoModel = tool.intent
    ? autoPick(tool.intent, configured, { mode, freeMode: freeOnly })
    : null;
  const chosenModel = modelId === "auto" ? autoModel : (findModel(modelId) ?? null);
  const utility =
    tool.intent === "upscale" || tool.intent === "background-removal";

  const toolStyles = useMemo(
    () =>
      (tool.styles ?? []).
        map((id) => STYLE_PRESETS.find((preset) => preset.id === id)).
        filter((preset): preset is (typeof STYLE_PRESETS)[number] =>
          Boolean(preset),
        ),
    [tool.styles],
  );

  const templates = useMemo(
    () => PROMPT_LIBRARY.filter((entry) => entry.tool === tool.id),
    [tool.id],
  );

  // Nothing resets state when the tool changes because nothing needs to: the
  // studio keys this component on tool.id, so switching tools remounts it with
  // fresh state. An effect doing the same job would only be a second, slower
  // copy of that rule.

  // ---- Uploading ---------------------------------------------------------
  const readFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("That is not an image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Images must be under 8MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSource(String(reader.result));
    reader.onerror = () => toast.error("Could not read that file.");
    reader.readAsDataURL(file);
  }, []);

  // Paste anywhere in the workspace, which is how a screenshot usually
  // arrives from Revit, SketchUp or a CAD viewer.
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const file = [...(event.clipboardData?.items ?? [])]
        .find((item) => item.type.startsWith("image/"))
        ?.getAsFile();
      if (file) {
        event.preventDefault();
        readFile(file);
        toast.success("Image pasted");
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [readFile]);

  // History hands an image over by event rather than by prop, so the panel on
  // the far side of the workspace needs no reference to it.
  useEffect(() => {
    function onLoad(event: Event) {
      const url = (event as CustomEvent<string>).detail;
      if (typeof url === "string" && url) setSource(url);
    }
    window.addEventListener("medosha:studio:load-image", onLoad);
    return () =>
      window.removeEventListener("medosha:studio:load-image", onLoad);
  }, []);

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) readFile(file);
  }

  // ---- Generating --------------------------------------------------------
  //
  // Submitting adds a job to the queue rather than awaiting a response here.
  // That is what lets four prompts be lined up, paused, retried and cancelled
  // without any of them being lost, and it means a failure keeps the prompt.
  function generate() {
    if (tool.needsImage && !source) {
      toast.error("Add an image first.");
      return;
    }
    if (!utility && !prompt.trim() && tool.id !== "materials") {
      toast.error("Describe what you want.");
      return;
    }

    // The material replacer builds its own instruction, which names what to
    // hold as well as what to change.
    const finalPrompt =
      tool.id === "materials"
        ? materialPrompt(element, prompt.trim() || "a different material")
        : composePrompt(prompt, styles);

    enqueue({
      prompt: finalPrompt,
      negativePrompt: negative.trim() || undefined,
      modelId,
      intent: tool.intent,
      aspect,
      quality,
      mode,
      freeMode: freeOnly,
      count,
      image: source ?? undefined,
      tool: tool.id,
      label: (prompt.trim() || tool.label).slice(0, 70),
    });

    toast.success(
      jobs.some((job) => job.status === "running")
        ? "Queued behind the running job"
        : "Generating…",
    );
  }

  // Deliberately not gated on `busy`: adding a second job while the first
  // runs is what the queue is for.
  const canGenerate =
    (!tool.needsImage || Boolean(source)) &&
    (utility || tool.id === "materials" || prompt.trim().length > 0);

  return (
    <div
      ref={dropRef}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className="flex h-full flex-col overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
        <header>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <span aria-hidden>{tool.emoji}</span>
            {tool.label}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{tool.blurb}</p>
        </header>

        {configured.length === 0 && <ConfigPanel configured={configured} health={health} />}

        {/* ---- Source image ------------------------------------------- */}
        {(tool.needsImage || source) && (
          <section>
            {source ? (
              <div className="relative overflow-hidden rounded-2xl border">
                {/* A data URL cannot go through next/image's optimiser. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={source}
                  alt="Source"
                  className="max-h-72 w-full object-contain bg-muted"
                />
                <button
                  type="button"
                  onClick={() => setSource(null)}
                  aria-label="Remove image"
                  className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-background/90 backdrop-blur transition-colors hover:bg-background"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <label
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-10 text-center transition-colors",
                  "hover:border-brand hover:bg-brand/5",
                )}
              >
                <Upload className="size-6 text-muted-foreground" />
                <span className="text-sm font-medium">
                  Drop an image, paste, or choose a file
                </span>
                <span className="text-xs text-muted-foreground">
                  A photo, a sketch, a floor plan, or a screenshot from Revit,
                  SketchUp or CAD
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
            )}
          </section>
        )}

        {/* ---- Material replacer: which surface ------------------------ */}
        {tool.id === "materials" && (
          <section>
            <p className="mb-2 text-sm font-medium">Which surface?</p>
            <div className="flex flex-wrap gap-1.5">
              {REPLACEABLE_ELEMENTS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setElement(entry.id)}
                  aria-pressed={element === entry.id}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    element === entry.id
                      ? "border-brand bg-brand/10 text-brand"
                      : "text-muted-foreground hover:border-brand hover:text-foreground",
                  )}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ---- Prompt -------------------------------------------------- */}
        {!utility && (
          <section className="space-y-2">
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void generate();
                  }
                }}
                rows={3}
                placeholder={
                  tool.id === "materials"
                    ? "The material to use — polished travertine, oak boards, terrazzo…"
                    : (tool.placeholder ?? "Describe what you want to see…")
                }
                className="w-full resize-y rounded-2xl border bg-transparent p-3 pb-10 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <div className="absolute inset-x-2 bottom-2 flex items-center gap-1">
                {templates.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowLibrary((open) => !open)}
                    className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Sparkles className="size-3" />
                    Templates
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowSettings((open) => !open)}
                  aria-expanded={showSettings}
                  className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Settings2 className="size-3" />
                  Options
                </button>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  ⌘↵ to generate
                </span>
              </div>
            </div>

            {showLibrary && templates.length > 0 && (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {templates.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPrompt(entry.prompt);
                        setShowLibrary(false);
                      }}
                      className="w-full rounded-xl border p-2.5 text-left transition-colors hover:border-brand hover:bg-brand/5"
                    >
                      <span className="block text-sm font-medium">
                        {entry.label}
                      </span>
                      <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
                        {entry.prompt}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {toolStyles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {toolStyles.map((preset) => {
                  const on = styles.includes(preset.id);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        setStyles((current) =>
                          on
                            ? current.filter((id) => id !== preset.id)
                            : [...current, preset.id],
                        )
                      }
                      aria-pressed={on}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        on
                          ? "border-brand bg-brand/10 text-brand"
                          : "text-muted-foreground hover:border-brand hover:text-foreground",
                      )}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ---- Options ------------------------------------------------- */}
        {showSettings && (
          <section className="grid gap-3 rounded-2xl border p-3 sm:grid-cols-2">
            <Field label="Model">
              <div className="space-y-1.5">
                <select
                  value={modelId}
                  onChange={(event) => setModelId(event.target.value)}
                  className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
                >
                  <option value="auto">
                    Auto{autoModel ? ` — ${autoModel.label}` : ""}
                  </option>
                  {models.map((model) => {
                    const ready = configured.includes(model.provider);
                    return (
                      <option key={model.id} value={model.id} disabled={!ready}>
                        {model.label}
                        {model.free ? " · free" : ""}
                        {ready ? "" : ` · needs ${IMAGE_PROVIDERS[model.provider].keyVar}`}
                      </option>
                    );
                  })}
                </select>
                {chosenModel && (
                  <div className="rounded-lg border p-2 text-xs">
                    <p className="text-muted-foreground">{chosenModel.blurb}</p>
                    <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                      <Meter label="Quality" value={chosenModel.quality} />
                      <Meter label="Speed" value={chosenModel.speed} />
                      <div className="flex items-center gap-1">
                        <dt className="text-muted-foreground">Cost</dt>
                        <dd className="font-medium">
                          {COST_LABEL[chosenModel.cost]}
                        </dd>
                      </div>
                    </dl>
                    <ul className="mt-1.5 flex flex-wrap gap-1">
                      {chosenModel.capabilities.map((capability) => (
                        <li
                          key={capability}
                          className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {CAPABILITY_LABEL[capability]}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Field>

            <Field label="Aspect ratio">
              <select
                value={aspect}
                onChange={(event) =>
                  setAspect(event.target.value as AspectRatio)
                }
                className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
              >
                {ASPECT_RATIOS.map((ratio) => (
                  <option key={ratio.value} value={ratio.value}>
                    {ratio.label} · {ratio.value}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Quality">
              <select
                value={quality}
                onChange={(event) =>
                  setQuality(event.target.value as QualityLevel)
                }
                className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
              >
                {QUALITY_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label} — {level.blurb}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Images">
              <select
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
              >
                {Array.from({ length: MAX_IMAGES }, (_, index) => index + 1).map(
                  (value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ),
                )}
              </select>
            </Field>

            <div className="sm:col-span-2">
              <Field label="Negative prompt">
                <input
                  value={negative}
                  onChange={(event) => setNegative(event.target.value)}
                  placeholder="What to avoid — people, text, watermark, clutter…"
                  className="h-8 w-full rounded-lg border bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
                />
              </Field>
            </div>
          </section>
        )}

        {/* ---- Quality mode -------------------------------------------- */}
        {!utility && (
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="radiogroup"
              aria-label="Quality mode"
              className="flex gap-1 rounded-xl border p-1"
            >
              {QUALITY_MODES.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  role="radio"
                  aria-checked={mode === entry.value}
                  onClick={() => setMode(entry.value)}
                  title={entry.blurb}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-colors",
                    mode === entry.value
                      ? "bg-brand/12 font-medium text-brand"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span aria-hidden>{entry.emoji}</span>
                  {entry.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setFreeOnly((on) => !on)}
              aria-pressed={freeOnly}
              title="Prefer models that cost nothing"
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-sm transition-colors",
                freeOnly
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground hover:border-brand hover:text-foreground",
              )}
            >
              Free mode
            </button>

            {/* What the current settings will actually run, said plainly, so
                Auto is never a mystery. */}
            {chosenModel && (
              <p className="text-xs text-muted-foreground">
                {modelId === "auto" ? "Auto picked" : "Using"}{" "}
                <span className="font-medium text-foreground">
                  {chosenModel.label}
                </span>
                {" · "}
                {COST_LABEL[chosenModel.cost]}
                {chosenModel.costPerImage > 0 &&
                  ` · ~$${(chosenModel.costPerImage * count).toFixed(3)}`}
              </p>
            )}
          </div>
        )}

        {/* ---- Generate ------------------------------------------------ */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate}
            className="flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wand2 className="size-4" />
            )}
            {busy ? "Add to queue" : "Generate"}
          </button>

          {busy && (
            <button
              type="button"
              onClick={() => {
                const active = mine.find(
                  (job) => job.status === "running" || job.status === "queued",
                );
                if (active) cancelJob(active.id);
              }}
              className="h-10 rounded-xl border px-3 text-sm transition-colors hover:border-brand"
            >
              Stop
            </button>
          )}

          {!tool.needsImage && !source && (
            <label className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-sm transition-colors hover:border-brand">
              <ImagePlus className="size-4" />
              Add reference
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
          )}
        </div>

        {/* ---- Error --------------------------------------------------- */}
        {error && (
          <div className="space-y-3">
            <p className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-muted-foreground">
              {error}
            </p>
            {needsConfig && <ConfigPanel configured={configured} health={health} />}
          </div>
        )}

        <QueuePanel />

        {/* ---- Results ------------------------------------------------- */}
        {results.length > 0 && (
          <section className="space-y-3">
            <div
              className={cn(
                "grid gap-3",
                results.length > 1 ? "sm:grid-cols-2" : "",
              )}
            >
              {results.map((result, index) => (
                <figure
                  key={`${result.url}-${index}`}
                  className="group relative overflow-hidden rounded-2xl border bg-muted"
                >
                  {result.url.startsWith("data:") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={result.url}
                      alt={prompt}
                      className="w-full object-cover"
                    />
                  ) : (
                    <Image
                      src={result.url}
                      alt={prompt}
                      width={result.width ?? 1024}
                      height={result.height ?? 768}
                      unoptimized
                      className="w-full object-cover"
                    />
                  )}

                  <figcaption className="absolute inset-x-2 bottom-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <a
                      href={result.url}
                      download={`medosha-${tool.id}-${index + 1}.png`}
                      className="flex h-8 items-center gap-1.5 rounded-lg bg-background/90 px-2.5 text-xs font-medium backdrop-blur transition-colors hover:bg-background"
                    >
                      <Download className="size-3.5" />
                      Download
                    </a>
                    <button
                      type="button"
                      onClick={() => setSource(result.url)}
                      className="flex h-8 items-center gap-1.5 rounded-lg bg-background/90 px-2.5 text-xs font-medium backdrop-blur transition-colors hover:bg-background"
                    >
                      <Wand2 className="size-3.5" />
                      Keep editing
                    </button>
                  </figcaption>
                </figure>
              ))}
            </div>

            {/* What a picture is worth on a construction platform: the next
                step. Each of these carries the prompt into a real module. */}
            <div className="rounded-2xl border p-3">
              <p className="mb-2 text-sm font-medium">Take it further</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <Next
                  icon={<Calculator className="size-3.5" />}
                  label="Estimate what this costs"
                  onClick={() =>
                    onUseInChat(
                      `Estimate the cost to build this in Addis Ababa: ${prompt}`,
                    )
                  }
                />
                <Next
                  icon={<ClipboardList className="size-3.5" />}
                  label="Generate a BOQ for it"
                  onClick={() =>
                    onUseInChat(`Generate a preliminary BOQ for: ${prompt}`)
                  }
                />
                <Next
                  icon={<Layers className="size-3.5" />}
                  label="What materials would this need?"
                  onClick={() =>
                    onUseInChat(`List the materials needed for: ${prompt}`)
                  }
                />
                <Next
                  icon={<Building2 className="size-3.5" />}
                  label="Find suppliers for it"
                  onClick={() =>
                    onUseInChat(`Find Medosha suppliers for: ${prompt}`)
                  }
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {[
                  { href: "/marketplace", label: "Marketplace" },
                  { href: "/price-exchange", label: "Material prices" },
                  { href: "/companies", label: "Companies" },
                  { href: "/directory/individual", label: "Professionals" },
                  { href: "/projects/new", label: "Start a project" },
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
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
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

/** A five-dot rating. Reads faster than "4/5" at this size. */
function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd aria-label={`${value} out of 5`} className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            aria-hidden
            className={cn(
              "size-1 rounded-full",
              step <= value ? "bg-foreground" : "bg-muted-foreground/30",
            )}
          />
        ))}
      </dd>
    </div>
  );
}
