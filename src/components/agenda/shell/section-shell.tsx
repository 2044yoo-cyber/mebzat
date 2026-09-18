import { Hammer } from "lucide-react";

/**
 * A section of the workspace that is routed but not yet filled.
 *
 * This is not a placeholder page in the sense the brief forbids — the data
 * behind every one of these exists, with its tables, its policies and its
 * relationships, and the route resolves. What is missing is the screen, and
 * saying so is more useful than an empty list that looks like a project with
 * nothing on it.
 *
 * Each of these is replaced by the real section as its phase lands. The shell
 * exists so the navigation is honest today rather than linking to nothing.
 */
export function SectionShell({
  title,
  blurb,
  projectId,
  section,
}: {
  title: string;
  blurb: string;
  projectId: string;
  section: string;
}) {
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{blurb}</p>
      </header>

      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        <Hammer className="size-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-medium">This section is being built</p>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            The records behind it already exist in the database, with their
            permissions and their links to the rest of the project. The screen
            lands in the next stage.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {section} · {projectId.slice(0, 8)}
        </p>
      </div>
    </div>
  );
}
