"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  WriteAction,
  WriteLanguage,
  WriteSurface,
  WriteTone,
} from "@/lib/ai/writing";

/**
 * Streams one edit from /api/ai/write.
 *
 * Nothing here touches the field being edited. The hook produces a *proposal*
 * — the user's text is not modified until they accept it, which is the whole
 * safety model of this feature stated in one sentence.
 *
 * A second request cancels the first. Someone who clicks Improve and then
 * Shorten wants the second answer, and leaving both running would deliver
 * whichever finished last.
 */

export type WriterRequest = {
  text: string;
  action: WriteAction;
  surface: WriteSurface;
  tone?: WriteTone;
  language?: WriteLanguage;
  context?: string;
};

export type WriterState = {
  /** Text streamed so far. Empty until the first delta arrives. */
  draft: string;
  /** Set once the stream completes; this is the text Accept applies. */
  result: string | null;
  action: WriteAction | null;
  busy: boolean;
  error: string | null;
  /** Wall-clock time of the completed edit, for the "in 0.9s" note. */
  latencyMs: number | null;
};

const IDLE: WriterState = {
  draft: "",
  result: null,
  action: null,
  busy: false,
  error: null,
  latencyMs: null,
};

export function useWriter() {
  const [state, setState] = useState<WriterState>(IDLE);
  const abortRef = useRef<AbortController | null>(null);

  // A request outliving its component would setState after unmount and, worse,
  // keep a provider call alive that nobody is waiting for.
  useEffect(() => () => abortRef.current?.abort(), []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(IDLE);
  }, []);

  const run = useCallback(async (request: WriterRequest) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      draft: "",
      result: null,
      action: request.action,
      busy: true,
      error: null,
      latencyMs: null,
    });

    try {
      const response = await fetch("/api/ai/write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        // Errors before the stream starts arrive as ordinary JSON.
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setState({
          ...IDLE,
          action: request.action,
          error: payload?.error ?? `Request failed (${response.status}).`,
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamed = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Frames are separated by a blank line; a partial one stays buffered.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const raw of frames) {
          const event = raw.match(/^event: (.+)$/m)?.[1];
          const data = raw.match(/^data: (.+)$/m)?.[1];
          if (!event || !data) continue;

          let payload: unknown;
          try {
            payload = JSON.parse(data);
          } catch {
            continue;
          }

          if (event === "delta") {
            streamed += (payload as { text: string }).text;
            const shown = streamed;
            setState((previous) => ({ ...previous, draft: shown }));
          } else if (event === "done") {
            const finished = payload as { text: string; latencyMs: number };
            setState((previous) => ({
              ...previous,
              // The server's cleaned text supersedes what was streamed: code
              // fences can only be stripped once the last token has landed.
              draft: finished.text,
              result: finished.text,
              busy: false,
              latencyMs: finished.latencyMs,
            }));
          } else if (event === "error") {
            const failure = payload as { message: string };
            setState({
              ...IDLE,
              action: request.action,
              error: failure.message,
            });
          }
        }
      }

      // The stream ended without a done frame — a dropped connection rather
      // than a refusal. Whatever arrived is not trustworthy as a whole edit.
      setState((previous) =>
        previous.busy
          ? {
              ...IDLE,
              action: request.action,
              error: "The connection dropped. Your text is unchanged.",
            }
          : previous,
      );
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      setState({
        ...IDLE,
        action: request.action,
        error:
          error instanceof Error
            ? error.message
            : "Something went wrong. Your text is unchanged.",
      });
    }
  }, []);

  return { state, run, cancel };
}
