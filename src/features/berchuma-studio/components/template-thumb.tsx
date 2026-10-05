"use client";

import { useMemo } from "react";

import { FrontDrawing, frontDrawing } from "./front-drawing";
import type { DesignSpec } from "../types/spec";

/** A template's front view, worked out once per design rather than per render. */
export function TemplateThumb({ spec, className }: { spec: DesignSpec; className?: string }) {
  const drawing = useMemo(() => frontDrawing(spec), [spec]);
  return <FrontDrawing drawing={drawing} className={className} />;
}
