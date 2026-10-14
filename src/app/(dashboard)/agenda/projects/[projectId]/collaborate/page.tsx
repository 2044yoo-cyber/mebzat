import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DatabaseZap } from "lucide-react";

import { StudioProvider } from "@/components/collab/studio-context";
import { StudioWorkspace, type Tab } from "@/components/collab/studio-workspace";
import { StudioPrimer } from "@/components/collab/studio-primer";
import { readAssets, readBoards, readMembers, readStudioTasks, readThreads, readUnread } from "@/lib/collab/queries";
import { AGENDA_FILES_BUCKET } from "@/lib/agenda/files";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Collaborative Studio · Agenda" };

const TABS = new Set<Tab>(["board", "canvas", "review", "discuss", "team"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The project's Collaborative Studio.
 *
 * Everything is read here under the viewer's own session, so row-level
 * security decides what arrives: somebody not on the project gets the same
 * not-found the rest of the project gives them. If the Studio's migration
 * has not been run, that is said plainly rather than shown as "no access".
 */
export default async function CollaboratePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  if (!UUID.test(projectId)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/agenda/projects/${projectId}/collaborate`);

  const level = await supabase.rpc("collab_level", { target_project: projectId });
  if (level.error) {
    const missing = /collab_level|function .* does not exist|PGRST202|schema cache/i.test(`${level.error.message} ${level.error.code}`);
    return (
      <div className="mx-auto max-w-lg space-y-3 p-6 text-sm">
        <DatabaseZap className="size-8 text-brand" />
        <h2 className="text-lg font-semibold">{missing ? "The Collaborative Studio is not installed yet" : "The Studio could not be opened"}</h2>
        <p className="text-muted-foreground">{missing ? "The database is missing migration 0105_collab_studio.sql. Whoever runs Medosha's database needs to apply it; nothing on this project is affected meanwhile." : "The database did not answer. Try again in a moment."}</p>
      </div>
    );
  }
  if (!level.data) notFound();

  const [members, boards, assets, threads, profile] = await Promise.all([
    readMembers(supabase, projectId),
    readBoards(supabase, projectId),
    readAssets(supabase, projectId),
    readThreads(supabase, projectId),
    supabase.from("profiles").select("full_name, company_name, username").eq("id", user.id).maybeSingle(),
  ]);
  const [unread, tasks] = await Promise.all([
    readUnread(supabase, projectId, user.id, threads),
    readStudioTasks(supabase, projectId, threads.flatMap((thread) => (thread.taskId ? [thread.taskId] : []))),
  ]);

  // Signed once here for the first screen; the browser signs again as they run out.
  const paths = [...new Set(assets.flatMap((asset) => asset.revisions.map((revision) => revision.storagePath)))].slice(0, 300);
  const signed: Record<string, string> = {};
  if (paths.length) {
    const { data } = await supabase.storage.from(AGENDA_FILES_BUCKET).createSignedUrls(paths, 3600);
    for (const entry of data ?? []) if (entry.path && entry.signedUrl) signed[entry.path] = entry.signedUrl;
  }

  const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : null);
  const tab = TABS.has(one(query.tab) as Tab) ? (one(query.tab) as Tab) : one(query.thread) ? "discuss" : "board";
  const idOrNull = (value: string | null) => (value && UUID.test(value) ? value : null);
  const threadId = idOrNull(one(query.thread));
  const name = profile.data?.full_name || profile.data?.company_name || profile.data?.username || "You";

  // Somebody on the project whose membership row is still "invited" has not
  // accepted; they are not in `members` and cannot be assigned work yet.
  return (
    <StudioProvider
      projectId={projectId}
      me={{ id: user.id, name }}
      level={level.data}
      members={members}
      initialBoards={boards}
      initialAssets={assets}
      initialThreads={threads}
      initialUnread={[...unread]}
      initialTasks={tasks}
      initialThreadId={threadId && threads.some((thread) => thread.id === threadId) ? threadId : null}
    >
      <StudioPrimer urls={signed} />
      <StudioWorkspace
        initial={{
          tab: threadId && threads.find((thread) => thread.id === threadId)?.anchorKind === "drawing" && !one(query.tab) ? "review" : tab,
          boardId: idOrNull(one(query.board)),
          canvasId: idOrNull(one(query.canvas)),
          drawingId: idOrNull(one(query.drawing)) ?? (threadId ? threads.find((thread) => thread.id === threadId)?.drawingId ?? null : null),
        }}
      />
    </StudioProvider>
  );
}
