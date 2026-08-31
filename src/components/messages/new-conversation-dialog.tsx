"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";

import {
  openDirectConversation,
  searchPeopleAction,
} from "@/app/(dashboard)/messages/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { DirectorySearchResult } from "@/lib/data/messages";

const DEBOUNCE_MS = 250;

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function NewConversationDialog({
  trigger,
}: {
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectorySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [starting, startTransition] = useTransition();

  const term = query.trim();
  const tooShort = term.length < 2;

  useEffect(() => {
    if (!open || tooShort) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await searchPeopleAction(term);
      if (cancelled) return;
      setResults(found);
      setSearching(false);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, tooShort, open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setResults([]);
        }
      }}
    >
      <DialogTrigger aria-label="Start a new conversation">
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
          <DialogDescription>
            Search for a professional, supplier, or contractor on Medosha.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearching(event.target.value.trim().length >= 2);
            }}
            placeholder="Search by name or username…"
            aria-label="Search people"
            className="pl-8"
          />
        </div>

        <div className="max-h-72 min-h-24 overflow-y-auto">
          {searching && !tooShort && (
            <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Searching…
            </p>
          )}

          {!searching && !tooShort && results.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              No one matches “{term}”.
            </p>
          )}

          {tooShort && (
            <p className="p-4 text-sm text-muted-foreground">
              Type at least two characters to search.
            </p>
          )}

          <ul>
            {!tooShort &&
              results.map((person) => (
              <li key={person.id}>
                <form
                  action={(formData) =>
                    startTransition(() => {
                      void openDirectConversation(formData);
                    })
                  }
                >
                  <input type="hidden" name="userId" value={person.id} />
                  <button
                    type="submit"
                    disabled={starting}
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted disabled:opacity-60"
                  >
                    <Avatar className="size-9">
                      {person.avatarUrl && (
                        <AvatarImage
                          src={person.avatarUrl}
                          alt={person.fullName}
                        />
                      )}
                      <AvatarFallback>
                        {initials(person.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {person.fullName}
                      </span>
                      {person.username && (
                        <span className="block truncate text-xs text-muted-foreground">
                          @{person.username}
                        </span>
                      )}
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
