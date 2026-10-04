"use client";

import { useRef, useState } from "react";
import { ImageUp, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";

import type { DesignErrorResponse, DesignResponse } from "../types/api";
import type { DesignSpec } from "../types/spec";

/**
 * Upload a photograph, get something you can edit.
 *
 * The result is a normal design — the same object the chat produces and the
 * category picker produces — so the moment it lands, every control in the
 * studio works on it. That is the whole point of doing this through the spec
 * rather than through an image model: an image in and an image out is a
 * dead end, and nobody can price, cut or change a picture.
 *
 * The photograph is resized in the browser before it is sent. A modern phone
 * takes a 12 MB picture and no model needs 4000 pixels to count the doors on a
 * wardrobe; sending the original would cost the customer their data allowance
 * and buy nothing.
 */

/** Longest edge, in pixels, after resizing. */
const MAX_EDGE = 1280;
const QUALITY = 0.82;

export function ImageToDesign({
  onDesign,
  compact = false,
}: {
  onDesign: (spec: DesignSpec, reply: string) => void;
  /** Sits inside the start panel rather than standing on its own. */
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [depth, setDepth] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    try {
      setPreview(await shrink(file));
    } catch {
      setError("That image could not be read. Try a JPEG or PNG.");
    }
  }

  async function send() {
    if (!preview) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/studio/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image: preview,
          brief: note.trim() || undefined,
          dimensions: {
            width: numberOr(width),
            height: numberOr(height),
            depth: numberOr(depth),
          },
        }),
      });

      const payload = (await response.json()) as
        | DesignResponse
        | DesignErrorResponse;

      if (!response.ok || "error" in payload) {
        setError(
          "error" in payload
            ? payload.error
            : "The picture could not be read. Try a straighter, better-lit photograph.",
        );
        return;
      }

      if (!payload.spec) {
        setError(payload.reply || "No furniture could be seen in that picture.");
        return;
      }

      onDesign(payload.spec, payload.reply);
    } catch {
      setError("The connection dropped before the design came back. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("space-y-3", !compact && "rounded-xl border p-4")}>
      {preview ? (
        <div className="relative overflow-hidden rounded-lg border">
          {/* A plain img rather than next/image: the source is a data URL that
              exists for the length of this interaction, and the optimiser has
              nothing to optimise and no host to allow. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="The furniture you uploaded"
            className="max-h-56 w-full object-contain"
          />
          <button
            type="button"
            aria-label="Remove the photograph"
            onClick={() => setPreview(null)}
            className="absolute right-1.5 top-1.5 rounded-full bg-background/80 p-1 backdrop-blur"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed p-6 text-center transition-colors hover:border-brand hover:bg-brand/5"
        >
          <ImageUp className="size-6 text-brand" aria-hidden />
          <span className="text-sm font-medium">Upload a photograph</span>
          <span className="text-[11px] text-muted-foreground">
            A wardrobe, a kitchen, a cabinet — whatever you want built
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={choose}
      />

      {preview ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Measure label="Width" value={width} onChange={setWidth} />
            <Measure label="Height" value={height} onChange={setHeight} />
            <Measure label="Depth" value={depth} onChange={setDepth} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Measurements are optional, and they win. Anything you leave blank is
            estimated from the picture and listed as an assumption.
          </p>

          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={300}
            placeholder="Anything else? “In walnut, and no drawers.”"
            className="h-9 w-full rounded-md border bg-background/60 px-3 text-sm"
          />

          <button
            type="button"
            disabled={busy}
            onClick={send}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Reading the photograph…
              </>
            ) : (
              <>
                <ImageUp className="size-4" aria-hidden />
                Build this in 3D
              </>
            )}
          </button>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Measure({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] text-muted-foreground">{label} (mm)</span>
      <input
        type="number"
        min={100}
        max={12000}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="—"
        className="h-8 w-full rounded-md border bg-background/60 px-2 text-sm tabular-nums"
      />
    </label>
  );
}

function numberOr(value: string): number | undefined {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Shrinks a photograph to something worth sending.
 *
 * Drawn through a canvas rather than sent as taken. A phone photograph is 3000
 * pixels on the long edge and eight to twelve megabytes; the model needs to
 * count doors and judge proportions, which 1280 pixels does perfectly well.
 * The difference is most of somebody's data bundle.
 */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // JPEG, not PNG: a photograph as PNG is four times the size for no visible
  // gain, and the size is the whole reason this function exists.
  return canvas.toDataURL("image/jpeg", QUALITY);
}
