"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, FolderOpen, Lock } from "lucide-react";

/**
 * "Agenda not found."
 *
 * A client component because `not-found.tsx` receives no route params — the
 * project id has to come from the path, which is the one place it is
 * guaranteed to be. Falling back to the projects list keeps the button useful
 * even if the path is not what this expects.
 *
 * The wording is careful. This page is reached both when a project genuinely
 * does not exist and when the reader is not a member of its Agenda, and those
 * must look identical: a page that said "you are not a member" would confirm
 * to a stranger that a private record exists and is worth asking about.
 */
export default function AgendaNotFound() {
  const pathname = usePathname();
  const projectId = pathname?.match(/^\/projects\/([^/]+)/)?.[1] ?? null;

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <div className="space-y-3 rounded-2xl border p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl border bg-muted">
          <Lock className="size-5 text-muted-foreground" />
        </span>

        <h1 className="text-xl font-semibold tracking-tight">
          Agenda not found
        </h1>

        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          This project has no Agenda you can open. A project&rsquo;s Agenda is
          private to its members — if you should be on it, ask the client to
          invite you and it will appear here.
        </p>

        <div className="flex flex-wrap justify-center gap-2 pt-1">
          {projectId && (
            <Link
              href={`/projects/${projectId}`}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
            >
              <ArrowLeft className="size-4" />
              Return to the project
            </Link>
          )}
          <Link
            href="/projects"
            className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors hover:border-brand"
          >
            <FolderOpen className="size-4" />
            All projects
          </Link>
        </div>
      </div>
    </div>
  );
}
