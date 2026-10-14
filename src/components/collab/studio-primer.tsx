"use client";

import { useState } from "react";

import { primeSignedUrls } from "./files";

/** Hands the links the server signed for the first screen to the browser's cache, once. */
export function StudioPrimer({ urls }: { urls: Record<string, string> }) {
  useState(() => { primeSignedUrls(urls); return true; });
  return null;
}
