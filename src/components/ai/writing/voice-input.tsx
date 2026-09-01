"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, Square } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Dictation, using the browser's own speech recognition.
 *
 * No audio leaves the page through Medosha: recognition happens in the browser
 * (Chrome and Edge send it to Google's service; Safari uses the system one),
 * and only the resulting text reaches the field. Nothing is recorded and
 * nothing is stored.
 *
 * The button renders only where the API exists, rather than appearing and then
 * failing on a browser that cannot do it. What comes back is raw speech — the
 * assistant's Improve action is what turns it into a description, which keeps
 * the transcription and the rewriting as two steps the author controls.
 */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{ transcript: string }> & { isFinal: boolean }
  >;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

function recognitionClass(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const scope = window as SpeechWindow;
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function VoiceInput({
  onTranscript,
  lang = "en-US",
}: {
  onTranscript: (text: string) => void;
  /** BCP-47 tag. "am-ET" for Amharic where the browser supports it. */
  lang?: string;
}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const emit = useRef(onTranscript);

  useEffect(() => {
    emit.current = onTranscript;
  }, [onTranscript]);

  // Feature detection has to happen on the client — the server cannot know.
  // Read as an external value rather than mirrored into state in an effect:
  // the answer never changes for the life of the page, so there is nothing to
  // subscribe to and nothing to synchronise.
  const supported = useSyncExternalStore(
    () => () => {},
    () => recognitionClass() !== null,
    () => false,
  );

  useEffect(() => () => recognition.current?.abort(), []);

  function start() {
    const Recognition = recognitionClass();
    if (!Recognition) return;

    setError(null);
    const instance = new Recognition();
    instance.lang = lang;
    instance.continuous = true;
    instance.interimResults = false;

    instance.onresult = (event) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        // The speech API's result list is index-accessed and, on some Android
        // builds, briefly reports a length ahead of its contents. A missing
        // entry means "nothing transcribed yet", not a reason to throw inside
        // a recognition callback where nothing can catch it.
        const result = event.results[i];
        const alternative = result?.[0];
        if (result?.isFinal && alternative) {
          finalText += alternative.transcript;
        }
      }
      // Only final results are emitted. Interim text would rewrite the field
      // on every syllable, and undoing that is worse than waiting a moment.
      if (finalText.trim()) emit.current(finalText.trim());
    };

    instance.onerror = (event) => {
      setError(
        event.error === "not-allowed"
          ? "Microphone access was blocked. Allow it in your browser's site settings."
          : "Dictation stopped. Try again.",
      );
      setListening(false);
    };

    instance.onend = () => setListening(false);

    recognition.current = instance;
    instance.start();
    setListening(true);
  }

  function stop() {
    recognition.current?.stop();
    setListening(false);
  }

  if (!supported) return null;

  return (
    <>
      <button
        type="button"
        onClick={listening ? stop : start}
        aria-pressed={listening}
        aria-label={listening ? "Stop dictation" : "Dictate"}
        title={listening ? "Stop dictation" : "Dictate instead of typing"}
        className={cn(
          "pointer-events-auto flex h-6 items-center gap-1 rounded-md px-1.5 text-xs font-medium transition-colors",
          listening
            ? "bg-destructive/10 text-destructive"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {listening ? (
          <>
            <Square className="size-3 fill-current" />
            <span className="hidden sm:inline">Stop</span>
          </>
        ) : (
          <Mic className="size-3.5" />
        )}
      </button>

      {error && (
        <span className="pointer-events-auto text-xs text-destructive">
          {error}
        </span>
      )}
    </>
  );
}
