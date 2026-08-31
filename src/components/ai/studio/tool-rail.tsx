"use client";

import { STUDIO_TOOLS, type StudioTool } from "@/lib/ai/studio";
import { cn } from "@/lib/utils";

/**
 * The studio's left rail.
 *
 * Chat sits at the top and is the default, because the assistant that already
 * existed is still the thing most people came for. The image tools follow, and
 * the four that are the existing chat under another name are grouped at the
 * bottom under a heading that says so.
 */
export function ToolRail({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (tool: StudioTool) => void;
}) {
  // Redesign leads: the point of the studio is the user's own space, and a
  // generic text-to-image tool sitting above it says the opposite.
  const image = STUDIO_TOOLS.filter((tool) => tool.kind === "image").sort(
    (a, b) =>
      (b.id === "redesign" ? 1 : 0) - (a.id === "redesign" ? 1 : 0),
  );
  const assistants = STUDIO_TOOLS.filter(
    (tool) => tool.kind === "chat" && tool.id !== "chat",
  );
  const chat = STUDIO_TOOLS.find((tool) => tool.id === "chat")!;

  return (
    <nav
      aria-label="AI tools"
      className="flex h-full flex-col gap-4 overflow-y-auto p-2"
    >
      <Row tool={chat} active={active === chat.id} onSelect={onSelect} />

      <Group label="Design from a photo">
        {image.map((tool) => (
          <Row
            key={tool.id}
            tool={tool}
            active={active === tool.id}
            onSelect={onSelect}
          />
        ))}
      </Group>

      <Group label="Assistants">
        {assistants.map((tool) => (
          <Row
            key={tool.id}
            tool={tool}
            active={active === tool.id}
            onSelect={onSelect}
          />
        ))}
      </Group>
    </nav>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  );
}

function Row({
  tool,
  active,
  onSelect,
}: {
  tool: StudioTool;
  active: boolean;
  onSelect: (tool: StudioTool) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(tool)}
        aria-current={active ? "page" : undefined}
        title={tool.blurb}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
          active
            ? "bg-brand/12 font-medium text-brand"
            : "text-foreground/75 hover:bg-muted hover:text-foreground",
        )}
      >
        <span aria-hidden className="shrink-0 text-base leading-none">
          {tool.emoji}
        </span>
        <span className="min-w-0 flex-1 truncate">{tool.label}</span>
      </button>
    </li>
  );
}
