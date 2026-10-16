"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";

import { saveFeedPreferences } from "@/app/(dashboard)/settings/feed-actions";
import { FEED_TOPICS, TOPIC_LABEL, type FeedTopic } from "@/lib/feed/constants";
import { clearSnapshot } from "@/lib/feed/restore";
import { cn } from "@/lib/utils";

/**
 * Tuning the Home feed: topics to see more of, and whether the feed may learn
 * from what this person does.
 *
 * Nothing is applied until the server says it is saved, and "Saved" is shown
 * only then — the feed reads these when the next reading starts, so a setting
 * that only looked saved would quietly do nothing.
 */
export function FeedPreferencesForm({
  initialTopics,
  initialPersonalised,
}: {
  initialTopics: FeedTopic[];
  initialPersonalised: boolean;
}) {
  const [topics, setTopics] = useState<FeedTopic[]>(initialTopics);
  const [personalised, setPersonalised] = useState(initialPersonalised);
  const [saved, setSaved] = useState<{ topics: FeedTopic[]; personalised: boolean }>({ topics: initialTopics, personalised: initialPersonalised });
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = personalised !== saved.personalised || topics.length !== saved.topics.length || topics.some((topic) => !saved.topics.includes(topic));

  function toggle(topic: FeedTopic) {
    setJustSaved(false);
    setTopics((current) => (current.includes(topic) ? current.filter((one) => one !== topic) : [...current, topic]));
  }

  function save() {
    setError(null);
    const next = { topics, personalised };
    startTransition(async () => {
      const result = await saveFeedPreferences(next);
      if (result.error) {
        setError(result.error);
        return;
      }
      clearSnapshot();
      setSaved(next);
      setJustSaved(true);
    });
  }

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Show me more of</legend>
        <div className="flex flex-wrap gap-2">
          {FEED_TOPICS.map((topic) => {
            const on = topics.includes(topic);
            return (
              <button
                key={topic}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(topic)}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                  on ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {on && <Check className="size-3.5" aria-hidden />}
                {TOPIC_LABEL[topic]}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          The feed still mixes everything; these come up a little more often.
        </p>
      </fieldset>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={personalised}
          onChange={(event) => {
            setJustSaved(false);
            setPersonalised(event.target.checked);
          }}
          className="mt-0.5 size-4 accent-[var(--brand)]"
        />
        <span className="space-y-0.5">
          <span className="block text-sm font-medium">Learn from what I do</span>
          <span className="block text-xs text-muted-foreground">
            What you like, save and open, your role and your city lean the feed
            towards you. Turned off, only the topics above and the people you
            follow do. What you scroll past is never used.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="flex h-10 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-brand-foreground disabled:opacity-50"
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Save feed settings
        </button>
        {justSaved && !dirty && (
          <span role="status" className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
            <Check className="size-4" aria-hidden /> Saved. Your next visit to Home uses these.
          </span>
        )}
        {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
      </div>
    </div>
  );
}
