"use client";

import { useState } from "react";
import { Camera, Upload } from "lucide-react";

import { PanoramaCapture } from "@/components/tour/panorama-capture";
import {
  PanoramaInput,
  type DraftScene,
} from "@/components/tour/panorama-input";
import { cn } from "@/lib/utils";

/**
 * Two ways to get a room in: upload one, or turn around in it.
 *
 * Both end in the same place — a `DraftScene` the builder adds to the tour —
 * so nothing downstream has to know which happened. That is the point of
 * putting the choice here rather than building a second, parallel scene
 * pipeline for captured panoramas.
 *
 * Upload is first and is the default, because it is the one that already
 * worked and the one somebody with a Ricoh or an Insta360 wants. Capture is
 * the new thing, and it is offered rather than imposed.
 */
export function RoomSource({
  userId,
  scenes,
  onChange,
}: {
  userId: string;
  scenes: DraftScene[];
  onChange: (scenes: DraftScene[]) => void;
}) {
  const [mode, setMode] = useState<"upload" | "capture">("upload");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("upload")}
          aria-pressed={mode === "upload"}
          className={cn(
            "flex min-h-12 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors",
            mode === "upload"
              ? "border-brand bg-brand text-brand-foreground"
              : "hover:bg-muted",
          )}
        >
          <Upload className="size-4" /> Upload 360 Photo
        </button>
        <button
          type="button"
          onClick={() => setMode("capture")}
          aria-pressed={mode === "capture"}
          className={cn(
            "flex min-h-12 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors",
            mode === "capture"
              ? "border-brand bg-brand text-brand-foreground"
              : "hover:bg-muted",
          )}
        >
          <Camera className="size-4" /> Create 360°
        </button>
      </div>

      {mode === "upload" ? (
        <PanoramaInput userId={userId} scenes={scenes} onChange={onChange} />
      ) : (
        <PanoramaCapture
          userId={userId}
          onCancel={() => setMode("upload")}
          onSaved={(panorama) => {
            onChange([
              ...scenes,
              {
                key: crypto.randomUUID(),
                title: `Room ${scenes.length + 1}`,
                panoramaUrl: panorama.url,
                width: panorama.width,
                height: panorama.height,
                // Captured panoramas are 2:1 by construction — the compositor
                // builds them that way — so there is nothing uncertain to warn
                // about, unlike a file somebody found on their phone.
                kind: "equirectangular",
                ratioLabel: "2.00:1",
              },
            ]);
            setMode("upload");
          }}
        />
      )}
    </div>
  );
}
