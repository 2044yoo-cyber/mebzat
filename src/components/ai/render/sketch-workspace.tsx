"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  ImagePlus,
  Loader2,
  Lock,
  Maximize2,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  SplitSquareHorizontal,
  Upload,
  X,
} from "lucide-react";

import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  CREATIVE_LABELS,
  CREATIVE_LEVELS,
  DEFAULT_SETTINGS,
  MULTI_SELECT,
  RENDER_PRESETS,
  applyPreset,
  optionsIn,
  type OptionCategory,
  type RenderSettings,
} from "@/lib/ai/rendering/options";
import { cn } from "@/lib/utils";

/**
 * AI Sketch → 3D Render.
 *
 * Upload a SketchUp screenshot, pick from a list of words, get an architectural
 * render. The client never writes a rendering prompt and never sees one — the
 * words map to paragraphs of technical instruction on the server, in
 * `lib/ai/rendering/knowledge.ts`, which this file cannot import because it is
 * marked `server-only` and this is a client component. That is the mechanism
 * rather than the intention: the hidden instructions cannot reach the browser
 * because importing them here would not build.
 *
 * ## What this workspace is not
 *
 * There is no furniture in it. No drawers, no shelves, no cabinets, no legs.
 * When a render turns out to be something somebody wants to *build*, the button
 * says "Open in Berchuma Studio" and that is the whole of the relationship —
 * Medosha AI understands and renders, Studio edits geometry, and the reason to
 * keep them apart is that a screen which does both does neither well.
 */

type Result = {
  url: string;
  path?: string;
  knowledgeVersion?: string;
  /** How it was drawn. See the route — these are different products. */
  renderPath?: "image-to-image" | "described";
  fidelity?: { ok: boolean; differences: string[] } | null;
};

export function SketchWorkspace({
  initialBalance,
}: {
  initialBalance: number | null;
}) {
  const [source, setSource] = useState<{ url: string; name: string } | null>(null);
  const [settings, setSettings] = useState<RenderSettings>(DEFAULT_SETTINGS);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const [balance, setBalance] = useState(initialBalance);

  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * What the next render works from.
   *
   * The generated image once there is one, the upload before that. This is what
   * makes "now make it warmer" mean something: each result becomes the next
   * request's source, so a conversation about one building stays about that
   * building.
   */
  const editingSource = result?.url ?? source?.url ?? null;

  const read = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload a supported image.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? "");
      if (url.startsWith("data:image/")) {
        setSource({ url, name: file.name });
        // A new upload starts a new subject. Keeping the previous render on
        // screen beside a different building is how somebody ends up comparing
        // two unrelated things.
        setResult(null);
        setError(null);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  async function generate() {
    if (!editingSource || busy) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ image: editingSource, ...settings }),
      });

      const payload = (await response.json().catch(() => null)) as {
        images?: { url: string; path?: string }[];
        error?: string;
        balance?: number | null;
        knowledgeVersion?: string;
        renderPath?: "image-to-image" | "described";
        fidelity?: { ok: boolean; differences: string[] } | null;
      } | null;

      if (!response.ok || !payload?.images?.length) {
        setError(payload?.error ?? "Medosha AI could not generate the image. Please try again.");
        return;
      }

      const first = payload.images[0]!;
      setResult({
        url: first.url,
        path: first.path,
        knowledgeVersion: payload.knowledgeVersion,
        renderPath: payload.renderPath,
        fidelity: payload.fidelity ?? null,
      });
      setCompare(false);
      if (typeof payload.balance === "number") setBalance(payload.balance);

      // The instruction has been carried out. Leaving it in the box means the
      // next Regenerate silently applies it a second time.
      setSettings((current) => ({ ...current, instruction: "" }));
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Medosha AI could not generate the image. Please try again.",
        );
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  const pick = (category: OptionCategory, id: string) => {
    setSettings((current) => {
      const existing = current.selections[category] ?? [];
      const multi = MULTI_SELECT.includes(category);

      const next = multi
        ? existing.includes(id)
          ? existing.filter((entry) => entry !== id)
          : [...existing, id]
        : [id];

      return { ...current, selections: { ...current.selections, [category]: next } };
    });
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col">
      {/* ---- Header ------------------------------------------------------ */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-4">
        <div className="flex items-center gap-2">
          <Link
            href="/ai"
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Medosha AI</span>
          </Link>
          <span className="text-muted-foreground">/</span>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="size-4 text-brand" />
            AI Sketch → 3D Render
          </p>
        </div>
        <Link
          href="/billing"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {balance === null ? "—" : Math.round(balance)} credits
        </Link>
      </div>

      {/*
        Desktop: the picture on the left, the choices on the right, the
        instruction across the bottom. Mobile: the same three, stacked, in the
        same order — which is the order somebody does them in.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* ---- Left: the image ----------------------------------------- */}
          <div className="space-y-3">
            {!source ? (
              <UploadArea onFile={read} onBrowse={() => fileRef.current?.click()} />
            ) : (
              <div className="space-y-3">
                <div className="flex gap-3">
                  {/*
                    The original never leaves the screen.
                    
                    It is the reference the whole strict mode is about, and a
                    client checking whether their building survived should not
                    have to toggle between two views to do it. Small, because
                    the render is what they came for.
                  */}
                  {result ? (
                    <div className="w-24 shrink-0 space-y-1 sm:w-32">
                      <p className="text-[10px] font-medium text-muted-foreground">
                        ORIGINAL
                      </p>
                      <button
                        type="button"
                        onClick={() => setEnlarged(true)}
                        title="Click to enlarge"
                        className="block w-full overflow-hidden rounded-lg border transition-colors hover:border-brand"
                      >
                        <Image
                          src={source.url}
                          alt="Your original model"
                          width={256}
                          height={192}
                          unoptimized
                          className="h-auto w-full object-contain"
                        />
                      </button>
                    </div>
                  ) : null}

                  <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border bg-muted/30">
                  {compare && result ? (
                    <CompareView before={source.url} after={result.url} />
                  ) : (
                    <Image
                      src={result?.url ?? source.url}
                      alt={result ? "Generated render" : "Your sketch"}
                      width={1024}
                      height={768}
                      unoptimized
                      className="h-auto w-full object-contain"
                    />
                  )}

                  {busy ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-sm">
                      <Loader2 className="size-6 animate-spin text-brand" />
                      <p className="text-sm font-medium">Rendering…</p>
                      <p className="text-xs text-muted-foreground">
                        Reading your image, then drawing it.
                      </p>
                    </div>
                  ) : null}
                  </div>
                </div>

                {/*
                  Says which mode is running, in the place somebody looks after
                  pressing Generate and before trusting the result.
                */}
                {settings.preserveDesign ? (
                  <p className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-2 py-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                    <Lock className="size-3" aria-hidden />
                    Original Geometry Protected
                    {result?.renderPath === "described" ? (
                      <span className="font-normal opacity-80">
                        · redrawn from the original, not edited pixel-for-pixel
                      </span>
                    ) : result?.renderPath === "image-to-image" ? (
                      <span className="font-normal opacity-80">
                        · edited from your image
                      </span>
                    ) : null}
                  </p>
                ) : null}

                {/*
                  The fidelity check, when it found something. Advisory, and
                  worded as such — it is a second opinion from the same kind of
                  model that drew the picture, not a measurement.
                */}
                {result?.fidelity && !result.fidelity.ok ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-900 dark:text-amber-200">
                    <p className="font-medium">
                      This render may have changed the building.
                    </p>
                    {result.fidelity.differences.length > 0 ? (
                      <ul className="mt-1 list-inside list-disc opacity-90">
                        {result.fidelity.differences.map((difference, index) => (
                          <li key={`${index}-${difference}`}>{difference}</li>
                        ))}
                      </ul>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void generate()}
                      className="mt-1.5 rounded border border-amber-500/50 px-2 py-0.5 font-medium transition-colors hover:bg-amber-500/10"
                    >
                      Try again
                    </button>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-1.5">
                  <SmallAction
                    icon={ImagePlus}
                    label="Replace"
                    onClick={() => fileRef.current?.click()}
                  />
                  <SmallAction
                    icon={X}
                    label="Remove"
                    onClick={() => {
                      setSource(null);
                      setResult(null);
                    }}
                  />

                  {result ? (
                    <>
                      <SmallAction
                        icon={SplitSquareHorizontal}
                        label={compare ? "Show render" : "Compare"}
                        onClick={() => setCompare((value) => !value)}
                      />
                      <SmallAction
                        icon={Maximize2}
                        label="View original"
                        onClick={() => setEnlarged(true)}
                      />
                      <SmallAction
                        icon={RefreshCw}
                        label="Regenerate"
                        onClick={() => void generate()}
                      />
                      <a
                        href={result.url}
                        download="medosha-render.jpg"
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
                      >
                        <Download className="size-3.5" />
                        Download
                      </a>
                      <Link
                        href="/studio/content"
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
                      >
                        <Share2 className="size-3.5" />
                        Create post
                      </Link>
                      {/*
                        A handoff and nothing more. Studio is where geometry is
                        edited; this workspace does not gain a drawer editor
                        because somebody rendered a kitchen.
                      */}
                      <Link
                        href="/studio"
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
                      >
                        Open in Berchuma Studio
                      </Link>
                    </>
                  ) : null}
                </div>

                {result?.knowledgeVersion ? (
                  <p className="text-[10px] text-muted-foreground">
                    Rendering knowledge v{result.knowledgeVersion}
                  </p>
                ) : null}
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) read(file);
                event.target.value = "";
              }}
            />
          </div>

          {/* ---- Right: the choices -------------------------------------- */}
          <div className="space-y-3">
            <Presets
              onApply={(preset) =>
                setSettings((current) => applyPreset(current, preset))
              }
            />

            <div className="space-y-2 rounded-xl border p-3">
              <Toggle
                label="🔒 Preserve Original Architecture"
                hint={
                  settings.preserveDesign
                    ? "Architecture locked — only visual appearance and requested changes will be applied."
                    : "AI may reinterpret architectural geometry."
                }
                on={settings.preserveDesign}
                onChange={(on) =>
                  setSettings((current) => ({ ...current, preserveDesign: on }))
                }
              />

              <div>
                <p className="mb-1 text-[11px] font-medium">Creative freedom</p>
                <div className="flex gap-1">
                  {CREATIVE_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      aria-pressed={settings.creative === level}
                      title={CREATIVE_LABELS[level].hint}
                      onClick={() =>
                        setSettings((current) => ({ ...current, creative: level }))
                      }
                      className={cn(
                        "flex-1 rounded-md border px-1.5 py-1 text-[11px] transition-colors",
                        settings.creative === level
                          ? "border-brand bg-brand text-brand-foreground"
                          : "text-muted-foreground hover:border-brand/50",
                      )}
                    >
                      {CREATIVE_LABELS[level].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {CATEGORY_ORDER.map((category) => (
              <OptionGroup
                key={category}
                category={category}
                selected={settings.selections[category] ?? []}
                onPick={(id) => pick(category, id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* The original, full size, when somebody wants to look properly. */}
      {enlarged && source ? (
        <button
          type="button"
          aria-label="Close"
          onClick={() => setEnlarged(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
        >
          <Image
            src={source.url}
            alt="Your original model"
            width={1600}
            height={1200}
            unoptimized
            className="max-h-full w-auto rounded-lg object-contain"
          />
        </button>
      ) : null}

      {/* ---- Bottom: what you want, and Generate ------------------------- */}
      <div className="shrink-0 border-t bg-background/80 p-3 backdrop-blur">
        <div className="mx-auto max-w-6xl">
          {error ? (
            <p className="mb-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex items-end gap-2">
            <textarea
              rows={1}
              value={settings.instruction}
              placeholder={
                result
                  ? "Now change something — “make the stone darker”…"
                  : "Tell Medosha AI what you want…"
              }
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  instruction: event.target.value,
                }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void generate();
                }
              }}
              className="min-h-9 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={!editingSource || busy}
              onClick={() => void generate()}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-xl px-4 text-sm font-medium transition-colors",
                !editingSource || busy
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-brand text-brand-foreground hover:opacity-90",
              )}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {result ? "Apply" : "Generate"}
            </button>
          </div>

          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {editingSource
              ? "Your settings are applied automatically — you do not need to repeat them here."
              : "Upload a sketch, screenshot or photo to begin."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function UploadArea({
  onFile,
  onBrowse,
}: {
  onFile: (file: File) => void;
  onBrowse: () => void;
}) {
  const [over, setOver] = useState(false);

  return (
    <button
      type="button"
      onClick={onBrowse}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const file = event.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors",
        over ? "border-brand bg-brand/5" : "hover:border-brand/50",
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-2xl border bg-muted/40 text-brand">
        <Upload className="size-5" />
      </div>
      <div>
        <p className="text-base font-medium">Upload your architectural sketch</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          A SketchUp or Revit screenshot, a CAD export, a hand sketch, an
          elevation, an existing render, or a photograph of the building.
        </p>
      </div>
      <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
        Click, or drop a file here
      </span>
    </button>
  );
}

function OptionGroup({
  category,
  selected,
  onPick,
}: {
  category: OptionCategory;
  selected: string[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border p-2.5">
      <p className="mb-1.5 text-[11px] font-medium">{CATEGORY_LABELS[category]}</p>
      <div className="flex flex-wrap gap-1">
        {optionsIn(category).map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected.includes(option.id)}
            title={option.hint}
            onClick={() => onPick(option.id)}
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[11px] transition-colors",
              selected.includes(option.id)
                ? "border-brand bg-brand text-brand-foreground"
                : "text-muted-foreground hover:border-brand/50",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Presets({
  onApply,
}: {
  onApply: (preset: (typeof RENDER_PRESETS)[number]) => void;
}) {
  return (
    <div className="rounded-xl border p-2.5">
      <p className="mb-1.5 text-[11px] font-medium">Presets</p>
      <div className="flex flex-wrap gap-1">
        {RENDER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            title={preset.blurb}
            onClick={() => onApply(preset)}
            className="rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        A starting point. Every setting stays editable.
      </p>
    </div>
  );
}

/**
 * Before and after, on one slider.
 *
 * Side by side halves both pictures on a phone. A wipe keeps the render at full
 * width and lets somebody check one part of the facade against the original,
 * which is what people actually do with these.
 */
function CompareView({ before, after }: { before: string; after: string }) {
  const [at, setAt] = useState(50);

  return (
    <div className="relative">
      <Image
        src={after}
        alt="Generated render"
        width={1024}
        height={768}
        unoptimized
        className="h-auto w-full object-contain"
      />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - at}% 0 0)` }}
      >
        <Image
          src={before}
          alt="Your original"
          width={1024}
          height={768}
          unoptimized
          className="h-auto w-full object-contain"
        />
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/80 shadow"
        style={{ left: `${at}%` }}
      />
      <input
        type="range"
        min={0}
        max={100}
        value={at}
        aria-label="Compare original and render"
        onChange={(event) => setAt(Number(event.target.value))}
        className="absolute inset-x-0 bottom-2 mx-auto w-[90%] cursor-ew-resize"
      />
    </div>
  );
}

function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-2 text-left"
    >
      <span>
        <span className="block text-[11px] font-medium">{label}</span>
        <span className="block text-[10px] text-muted-foreground">{hint}</span>
      </span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          on ? "bg-brand" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white transition-transform",
            on ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

function SmallAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Upload;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}
