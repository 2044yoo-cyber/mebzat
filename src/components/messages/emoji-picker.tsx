"use client";

import { useState } from "react";
import { Smile } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// A curated set rather than a full emoji dependency: it keeps the bundle small
// and every glyph here renders on the platforms Medosha targets.
const GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: "Smileys",
    emojis: [
      "😀", "😃", "😄", "😁", "😅", "😂", "🙂", "😉", "😊", "😍",
      "😘", "😎", "🤩", "🤔", "🙃", "😌", "😴", "🥳", "😇", "🤝",
    ],
  },
  {
    label: "Gestures",
    emojis: [
      "👍", "👎", "👌", "🙌", "👏", "🙏", "💪", "✍️", "👋", "🤞",
    ],
  },
  {
    label: "Work",
    emojis: [
      "🏗️", "🏢", "🏠", "🧱", "🔨", "🪛", "🧰", "📐", "📏", "🚧",
      "🛠️", "⚙️", "🪜", "🔧", "📦", "🚚", "🗺️", "📋", "📎", "🗂️",
    ],
  },
  {
    label: "Status",
    emojis: [
      "✅", "❌", "⚠️", "❗", "❓", "⏰", "📅", "💡", "🔥", "⭐",
      "💯", "🎯", "📈", "💰", "🤙", "🎉",
    ],
  },
];

export function EmojiPicker({
  onSelect,
  disabled,
}: {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label="Insert emoji"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground",
          "transition-colors outline-none hover:bg-muted hover:text-foreground",
          "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        <Smile className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-2">
        <div className="max-h-64 overflow-y-auto">
          {GROUPS.map((group) => (
            <div key={group.label} className="mb-2 last:mb-0">
              <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">
                {group.label}
              </p>
              <div className="grid grid-cols-8 gap-0.5">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onSelect(emoji);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md text-lg",
                      "transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                    )}
                    aria-label={`Insert ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
