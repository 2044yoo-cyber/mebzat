"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Languages } from "lucide-react";
import { useWriter } from "@/components/ai/writing/use-writer";
import { useLanguage } from "@/components/i18n/language-provider";
import { translatedText, translationSlot } from "@/lib/i18n/post-translation";
import type { FeedPost } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

export function PostText({ post, signedIn, onOpen }: {
  post: FeedPost; signedIn: boolean; onOpen: () => void;
}) {
  const { language } = useLanguage();
  // A language/source change unmounts the old request and cannot display its result.
  return <Translation key={JSON.stringify([post.id, post.title, post.body, language])} post={post} signedIn={signedIn} onOpen={onOpen} />;
}

function Translation({ post, signedIn, onOpen }: {
  post: FeedPost; signedIn: boolean; onOpen: () => void;
}) {
  const { language, phrase } = useLanguage();
  const { run } = useWriter();
  const root = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const started = useRef(false);
  const [translated, setTranslated] = useState<{ title: string; body: string } | null>(null);
  const [original, setOriginal] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const translate = useCallback(async () => {
    if (!signedIn || started.current) return;
    started.current = true;
    setBusy(true); setFailed(false);
    try {
      const result = await translationSlot(async () => {
        const request = async (text: string) => {
          if (!alive.current) throw new Error("Cancelled");
          return run({ text, action: "translate", surface: "generic", language });
        };
        const title = await translatedText(post.title, language, request);
        const body = await translatedText(post.body ?? "", language, request);
        return { title, body };
      });
      if (alive.current) { setTranslated(result); setOriginal(false); }
    } catch { if (alive.current) setFailed(true); }
    finally { if (alive.current) { setBusy(false); started.current = false; } }
  }, [language, post.title, post.body, run, signedIn]);

  useEffect(() => {
    if (language === "en" || !signedIn || !root.current) return;
    // Only visible posts trigger automatic translation, never the entire feed.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { observer.disconnect(); void translate(); }
    }, { threshold: 0.1 });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [language, signedIn, translate]);

  const text = translated && !original ? translated : post;
  const long = (text.body?.length ?? 0) > 220;
  return <div ref={root} className="px-3 pb-2" data-i18n-managed>
    <h2 className="text-[15px] leading-snug font-semibold text-foreground">
      {post.linkHref ? <Link href={post.linkHref} onClick={onOpen} className="hover:underline">{text.title}</Link> : text.title}
    </h2>
    {text.body && <p className={cn("mt-1 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground", !expanded && long && "line-clamp-5")}>{text.body}</p>}
    {long && <button type="button" onClick={() => setExpanded(!expanded)} className="mt-1 min-h-10 text-sm font-medium text-brand">{phrase(expanded ? "Show less" : "Show more")}</button>}
    <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground" aria-live="polite">
      {busy ? <span className="py-2">{phrase("Translating…")}</span> : translated ? <>
        <span title={phrase("Translation may contain mistakes.")}>{phrase("Automatically translated")}</span>
        <button type="button" className="min-h-10 text-brand" onClick={() => setOriginal(!original)}>{phrase(original ? "Show translation" : "Show original")}</button>
      </> : signedIn ? <button type="button" className="flex min-h-10 items-center gap-1 text-brand" onClick={() => void translate()}><Languages className="size-3.5" />{phrase("See translation")}</button> : language !== "en" ? <Link className="py-2 text-brand" href={`/login?redirect=${encodeURIComponent(`/p/${post.id}`)}`}>{phrase("Sign in to translate posts")}</Link> : null}
      {failed && <span role="status">{phrase("Translation unavailable. Try again.")}</span>}
    </div>
  </div>;
}
