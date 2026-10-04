"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { Search, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { findForTeam, saveAdminMember, type CandidateResult } from "@/app/admin/team/actions";
import { AreaCheckboxes } from "@/components/admin/area-checkboxes";
import { AVATAR_PLACEHOLDER } from "@/lib/constants/placeholders";
import type { AdminArea } from "@/types/database.types";

/**
 * Bringing somebody in.
 *
 * Two steps, deliberately: find the person, then decide what they hold. One
 * step would mean an account becomes an administrator the moment it is picked,
 * with whatever the form happened to be showing, and the moment between
 * picking and choosing is exactly the moment somebody clicks the wrong row.
 *
 * Nothing is granted until Add is pressed, and Add refuses an empty tick list
 * — an administrator who can do nothing is a row that reads as access and
 * grants none.
 */
export function AddAdmin() {
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<{ term: string; items: CandidateResult[] } | null>(null);
  const [picked, setPicked] = useState<CandidateResult | null>(null);
  const [areas, setAreas] = useState<AdminArea[]>([]);
  const [busy, start] = useTransition();

  const query = term.trim();

  // What is on screen is derived from which term the answer belongs to, rather
  // than cleared on every keystroke. Storing "the results" and emptying them
  // means a render where the box still says Abebe and the list below it is
  // somebody else's — and clearing from inside the effect is a cascading
  // render besides.
  const results = found && found.term === query ? found.items : [];
  const answered = found?.term === query;

  // Searches as the owner types, a beat behind. Without the wait, a six-letter
  // name is six queries and the answer that lands last is not always the
  // answer to the last thing typed.
  useEffect(() => {
    if (picked || query.length < 2) return;

    let live = true;
    const timer = setTimeout(() => {
      findForTeam(query)
        .then((items) => {
          if (live) setFound({ term: query, items });
        })
        .catch(() => {
          if (live) setFound({ term: query, items: [] });
        });
    }, 250);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, picked]);

  function add() {
    if (!picked) return;
    start(async () => {
      const result = await saveAdminMember(picked.id, areas);
      if (result.ok) {
        toast.success(`${picked.fullName ?? picked.username ?? "They"} can now help.`);
        setPicked(null);
        setAreas([]);
        setTerm("");
        setFound(null);
      } else {
        toast.error(result.message);
      }
    });
  }

  if (picked) {
    return (
      <div className="space-y-3 rounded-2xl border p-4">
        <div className="flex items-center gap-3">
          <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-muted">
            <Image
              src={picked.avatarUrl || AVATAR_PLACEHOLDER}
              alt=""
              fill
              sizes="40px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {picked.fullName ?? picked.username ?? "Someone"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {picked.username ? `@${picked.username}` : "Choose what they can do"}
            </p>
          </div>
        </div>

        <AreaCheckboxes
          value={areas}
          onChange={setAreas}
          disabled={busy}
          idPrefix="new-admin"
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={add}
            disabled={busy || areas.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 text-xs font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <UserPlus className="size-3.5" />
            Add to the team
          </button>
          <button
            type="button"
            onClick={() => {
              setPicked(null);
              setAreas([]);
            }}
            disabled={busy}
            className="rounded-lg border px-4 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border p-4">
      <div>
        <h2 className="text-sm font-medium">Add an administrator</h2>
        <p className="text-xs text-muted-foreground">
          Search for somebody with a Medosha account.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Name or handle"
          aria-label="Search for somebody to add"
          className="w-full rounded-xl border bg-background py-2 pl-9 pr-3 text-sm"
        />
      </div>

      {results.length > 0 && (
        <ul className="space-y-1">
          {results.map((one) => (
            <li key={one.id}>
              <button
                type="button"
                onClick={() => setPicked(one)}
                disabled={one.alreadyAdmin}
                className="flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <div className="relative size-8 shrink-0 overflow-hidden rounded-full bg-muted">
                  <Image
                    src={one.avatarUrl || AVATAR_PLACEHOLDER}
                    alt=""
                    fill
                    sizes="32px"
                    className="object-cover"
                  />
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {one.fullName ?? one.username ?? "Someone"}
                  </span>
                  {one.username && (
                    <span className="block truncate text-xs text-muted-foreground">
                      @{one.username}
                    </span>
                  )}
                </span>
                {one.alreadyAdmin && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Already on the team
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.length >= 2 && answered && results.length === 0 && (
        <p className="text-xs text-muted-foreground">Nobody matches that.</p>
      )}
    </div>
  );
}
