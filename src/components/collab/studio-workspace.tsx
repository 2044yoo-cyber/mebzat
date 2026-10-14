"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Columns3, Copy, Layers, Loader2, Maximize2, MessageSquarePlus, MessagesSquare, Minimize2, MoreHorizontal, Pencil, PenTool, Plus, ScanEye, Shapes, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";

import { mentionedIn } from "@/lib/collab/model";
import { readItem, type Board, type Item, type Thread } from "@/lib/collab/queries";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { archiveBoard, createBoard, duplicateBoard, openThread, updateBoard } from "@/app/(dashboard)/agenda/projects/[projectId]/collaborate/actions";

import { BoardView } from "./board-view";
import { CanvasView } from "./canvas-view";
import { PresenceStack, ThreadStatusChip, when } from "./chrome";
import { DiscussionView } from "./discussion-view";
import { ReviewView } from "./review-view";
import { useCan, useStudio } from "./studio-context";
import { TeamView } from "./team-view";
import { ThreadPanel } from "./thread-panel";

export type Tab = "board" | "canvas" | "review" | "discuss" | "team";
const TABS: { value: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "board", label: "Board", icon: Columns3 },
  { value: "canvas", label: "Canvas", icon: PenTool },
  { value: "review", label: "Review", icon: ScanEye },
  { value: "discuss", label: "Discussion", icon: MessagesSquare },
  { value: "team", label: "Team", icon: Users },
];

/**
 * The Collaborative Studio: Board, Canvas, Review, Discussion and Team on
 * one project, one set of files and one team — moving between them never
 * leaves the project, and the address says where you are so it can be
 * shared or reopened exactly there.
 */
export function StudioWorkspace({ initial }: { initial: { tab: Tab; boardId: string | null; canvasId: string | null; drawingId: string | null } }) {
  const studio = useStudio();
  const [tab, setTab] = useState<Tab>(initial.tab);
  const [boardId, setBoardId] = useState(initial.boardId);
  const [canvasId, setCanvasId] = useState(initial.canvasId);
  const [drawingId, setDrawingId] = useState(initial.drawingId);
  const [discussing, setDiscussing] = useState<Item | null>(null);
  const [full, setFull] = useState(false);
  const [lowered, setLowered] = useState(false);

  const boards = studio.boards.filter((board) => board.kind === "board");
  const canvases = studio.boards.filter((board) => board.kind === "canvas");
  const board = boards.find((entry) => entry.id === boardId) ?? boards[0] ?? null;
  const canvas = canvases.find((entry) => entry.id === canvasId) ?? canvases[0] ?? null;

  // The address follows the view.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    for (const [key, value] of [["board", tab === "board" ? board?.id : null], ["canvas", tab === "canvas" ? canvas?.id : null], ["drawing", tab === "review" ? drawingId : null]] as const) {
      if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
    }
    window.history.replaceState(null, "", url);
  }, [tab, board?.id, canvas?.id, drawingId]);

  const { announce } = studio;
  useEffect(() => { announce({ tab }); }, [announce, tab]);
  useEffect(() => {
    if (!full) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !(event.target as HTMLElement).closest("input, textarea")) setFull(false); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [full]);

  /** Opens whatever a comment is anchored to. */
  const locate = useCallback(async (thread: Thread) => {
    if (thread.anchorKind === "drawing" && thread.drawingId) { setDrawingId(thread.drawingId); setTab("review"); return; }
    if (thread.anchorKind === "item" && thread.itemId) {
      const item = await readItem(createClient(), thread.itemId);
      const owner = item ? studio.boards.find((entry) => entry.id === item.boardId) : undefined;
      if (!item || !owner) { toast.info("The item this comment was on has been removed."); return; }
      if (owner.kind === "canvas") { setCanvasId(owner.id); setTab("canvas"); } else { setBoardId(owner.id); setTab("board"); }
      setDiscussing(item);
    }
  }, [studio.boards]);

  const wide = useWide();
  const side = discussing ? <ItemThreads item={discussing} onClose={() => setDiscussing(null)} /> : studio.openThreadId && tab !== "discuss" ? <ThreadPanel key={studio.openThreadId} threadId={studio.openThreadId} onClose={() => studio.openThread(null)} onLocate={(thread) => void locate(thread)} /> : null;

  return (
    <div className={cn("flex min-h-[calc(100dvh-14rem)] flex-col bg-card", full ? "fixed inset-0 z-50 min-h-0" : "-m-4 rounded-b-2xl")}>
      <header className="flex flex-wrap items-center gap-2 border-b px-2 py-1.5">
        <nav className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto" aria-label="Studio">
          {TABS.map((entry) => (
            <button key={entry.value} type="button" aria-current={tab === entry.value ? "page" : undefined} onClick={() => setTab(entry.value)} className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm", tab === entry.value ? "bg-brand/10 font-semibold text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              <entry.icon className="size-4" />{entry.label}
              {entry.value === "discuss" && studio.unread.size ? <span className="rounded-full bg-brand px-1.5 text-[10px] font-semibold text-brand-foreground" aria-label={`${studio.unread.size} unread`}>{studio.unread.size}</span> : null}
            </button>
          ))}
        </nav>
        <PresenceStack presence={studio.presence} />
        {!studio.online ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-300">Offline</span> : null}
        <button type="button" onClick={() => setFull(!full)} aria-label={full ? "Exit full screen" : "Full screen"} title={full ? "Exit full screen (Esc)" : "Full screen"} className="flex size-9 items-center justify-center rounded-lg hover:bg-muted">{full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {tab === "board" || tab === "canvas" ? (
          <BoardList kind={tab} boards={tab === "board" ? boards : canvases} current={tab === "board" ? board : canvas} onSelect={(id) => (tab === "board" ? setBoardId(id) : setCanvasId(id))} />
        ) : null}
        <main className="relative flex min-h-[32rem] min-w-0 flex-1 flex-col lg:min-h-0">
          {tab === "board" ? (board ? <BoardView key={board.id} board={board} onDiscuss={(item) => { studio.openThread(null); setDiscussing(item); }} onReview={(id) => { setDrawingId(id); setTab("review"); }} /> : <EmptyBoards kind="board" />) : null}
          {tab === "canvas" ? (canvas ? <CanvasView key={canvas.id} board={canvas} onDiscuss={(item) => { studio.openThread(null); setDiscussing(item); }} /> : <EmptyBoards kind="canvas" />) : null}
          {tab === "review" ? <ReviewView drawingId={drawingId} onSelectDrawing={setDrawingId} /> : null}
          {tab === "discuss" ? <DiscussionView onLocate={(thread) => void locate(thread)} /> : null}
          {tab === "team" ? <TeamView /> : null}
        </main>
        {side ? (
          wide ? (
            <aside className="flex min-h-0 w-96 shrink-0 flex-col border-l" aria-label="Comments">{side}</aside>
          ) : (
            // On a phone: a sheet over the lower half, the work still visible
            // above it, and lowered to a handle to see all of it.
            <div className={cn("fixed inset-x-0 bottom-0 z-[60] flex flex-col rounded-t-2xl border-t bg-card shadow-2xl", lowered ? "" : "h-[50dvh]")} role="dialog" aria-label="Comments">
              <button type="button" onClick={() => setLowered(!lowered)} aria-expanded={!lowered} aria-label={lowered ? "Raise comments" : "Lower comments"} className="flex min-h-8 shrink-0 items-center justify-center gap-2 text-xs text-muted-foreground">
                <span className="h-1 w-10 rounded-full bg-muted-foreground/40" aria-hidden />{lowered ? "Comments" : null}
              </button>
              {/* Kept mounted while lowered, so a reply being written survives. */}
              <div className={cn("min-h-0 flex-1 flex-col", lowered ? "hidden" : "flex")}>{side}</div>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

// Rendered once, in the place the screen has room for: two copies would each
// load the comments and mark them read, and say everything twice to a reader.
const WIDE = "(min-width: 1024px)";
function useWide() {
  return useSyncExternalStore(
    (changed) => { const query = window.matchMedia(WIDE); query.addEventListener("change", changed); return () => query.removeEventListener("change", changed); },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

function EmptyBoards({ kind }: { kind: "board" | "canvas" }) {
  const allowed = useCan();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
      {kind === "board" ? <Layers className="size-8 text-brand" /> : <Shapes className="size-8 text-brand" />}
      <p>{kind === "board" ? "No boards yet. A board collects images, notes, links, documents and checklists in columns — concept, materials, renders, client feedback." : "No canvas yet. A canvas is an infinite whiteboard for sketching, sticky notes and diagrams."}</p>
      <p>{allowed.edit ? "Create one with the + button." : "When an editor creates one, it appears here."}</p>
    </div>
  );
}

function BoardList({ kind, boards, current, onSelect }: { kind: "board" | "canvas"; boards: Board[]; current: Board | null; onSelect: (id: string) => void }) {
  const studio = useStudio();
  const allowed = useCan();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [starter, setStarter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const create = async () => {
    setBusy(true);
    const result = await createBoard(studio.projectId, { kind, title: name || (kind === "board" ? "Design board" : "Canvas"), starterSections: kind === "board" && starter });
    setBusy(false);
    if (!result.ok) { toast.error(result.error); return; }
    studio.upsertBoard(result.board);
    onSelect(result.board.id);
    setCreating(false);
    setName("");
    setOpen(false);
  };
  const rename = async (board: Board) => {
    const title = window.prompt("Rename", board.title)?.trim();
    if (!title || title === board.title) return;
    const result = await updateBoard(studio.projectId, { id: board.id, revision: board.revision, title });
    if (!result.ok) { toast.error(result.error); return; }
    studio.upsertBoard(result.board);
  };
  const duplicate = async (board: Board) => {
    const result = await duplicateBoard(studio.projectId, board.id);
    if (!result.ok) { toast.error(result.error); return; }
    studio.upsertBoard(result.board);
    onSelect(result.board.id);
  };
  const remove = async (board: Board) => {
    if (!window.confirm(`Delete “${board.title}”? It is archived, not destroyed — ask an administrator if it needs to come back.`)) return;
    const result = await archiveBoard(studio.projectId, board.id, board.revision);
    if (!result.ok) { toast.error(result.error); return; }
    studio.removeBoard(board.id);
    router.refresh();
  };

  return (
    <aside className="border-b lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r" aria-label={kind === "board" ? "Boards" : "Canvases"}>
      <div className="flex items-center gap-1 p-2">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-9 min-w-0 flex-1 items-center gap-1 rounded-lg px-2 text-left text-sm font-semibold lg:pointer-events-none">
          <span className="truncate">{current?.title ?? (kind === "board" ? "Boards" : "Canvases")}</span>
          <span className="text-xs font-normal text-muted-foreground lg:hidden">({boards.length}) ▾</span>
        </button>
        {allowed.edit ? <button type="button" onClick={() => { setCreating(true); setOpen(true); }} aria-label={kind === "board" ? "New board" : "New canvas"} className="flex size-9 items-center justify-center rounded-lg bg-brand text-brand-foreground"><Plus className="size-4" /></button> : null}
      </div>
      <div className={cn("space-y-1 px-2 pb-2", !open && "hidden lg:block")}>
        {creating ? (
          <form className="space-y-2 rounded-lg border p-2" onSubmit={(event) => { event.preventDefault(); void create(); }}>
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder={kind === "board" ? "Kitchen design" : "Site workshop"} aria-label="Name" className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
            {kind === "board" ? <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={starter} onChange={(event) => setStarter(event.target.checked)} className="size-4" />Start with architecture sections</label> : null}
            <div className="flex gap-1">
              <button type="submit" disabled={busy} className="inline-flex min-h-8 items-center gap-1 rounded-md bg-brand px-2.5 text-xs font-semibold text-brand-foreground">{busy ? <Loader2 className="size-3.5 animate-spin" /> : null}Create</button>
              <button type="button" onClick={() => setCreating(false)} className="flex size-8 items-center justify-center rounded-md border" aria-label="Cancel"><X className="size-3.5" /></button>
            </div>
          </form>
        ) : null}
        <ul className="space-y-0.5">
          {boards.map((board) => (
            <li key={board.id} className="relative">
              <div className={cn("flex items-center rounded-lg", current?.id === board.id ? "bg-brand/10" : "hover:bg-muted")}>
                <button type="button" onClick={() => { onSelect(board.id); setOpen(false); }} aria-current={current?.id === board.id} className={cn("min-h-9 min-w-0 flex-1 truncate px-2 text-left text-sm", current?.id === board.id && "font-semibold text-brand")}>{board.title}</button>
                {allowed.edit ? <button type="button" onClick={() => setMenu(menu === board.id ? null : board.id)} aria-label={`${board.title} actions`} className="flex size-8 items-center justify-center rounded-md text-muted-foreground"><MoreHorizontal className="size-4" /></button> : null}
              </div>
              {menu === board.id ? (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenu(null)} aria-hidden />
                  <ul role="menu" className="absolute right-0 top-full z-40 mt-1 w-44 rounded-xl border bg-popover p-1 shadow-xl">
                    <li><button type="button" role="menuitem" onClick={() => { setMenu(null); void rename(board); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted"><Pencil className="size-4" />Rename</button></li>
                    <li><button type="button" role="menuitem" onClick={() => { setMenu(null); void duplicate(board); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted"><Copy className="size-4" />Duplicate</button></li>
                    <li><button type="button" role="menuitem" onClick={() => { setMenu(null); void remove(board); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-destructive hover:bg-muted"><Trash2 className="size-4" />Delete</button></li>
                  </ul>
                </>
              ) : null}
            </li>
          ))}
          {!boards.length && !creating ? <li className="px-2 py-1 text-xs text-muted-foreground">None yet.</li> : null}
        </ul>
      </div>
    </aside>
  );
}

/** The comments on one board card or canvas object. */
function ItemThreads({ item, onClose }: { item: Item; onClose: () => void }) {
  const studio = useStudio();
  const allowed = useCan();
  const threads = studio.threads.filter((thread) => thread.itemId === item.id);
  const [openId, setOpenId] = useState<string | null>(threads.length === 1 ? threads[0]!.id : null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const title = String(item.data.title || item.data.text || item.kind).slice(0, 60);

  if (openId) return <ThreadPanel key={openId} threadId={openId} onClose={() => (threads.length > 1 ? setOpenId(null) : onClose())} />;
  const start = async () => {
    setBusy(true);
    const result = await openThread(studio.projectId, { anchorKind: "item", itemId: item.id, body, title: `On “${title}”`, mentions: mentionedIn(body, studio.members) });
    setBusy(false);
    if (!result.ok) { toast.error(result.error); return; }
    studio.upsertThread(result.thread);
    setOpenId(result.thread.id);
    setBody("");
  };
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={`Comments on ${title}`}>
      <header className="flex items-center gap-2 border-b p-3">
        <h3 className="min-w-0 flex-1 truncate font-semibold">Comments on “{title}”</h3>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-8 items-center justify-center rounded-lg hover:bg-muted"><X className="size-4" /></button>
      </header>
      <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
        {threads.map((thread) => (
          <li key={thread.id}><button type="button" onClick={() => setOpenId(thread.id)} className="flex w-full items-center gap-2 p-3 text-left hover:bg-muted/50"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{thread.title}</span><span className="text-xs text-muted-foreground">{thread.number} · {when(thread.lastActivityAt)}</span></span><ThreadStatusChip status={thread.status} /></button></li>
        ))}
        {!threads.length ? <li className="p-4 text-sm text-muted-foreground">No comments on this yet.</li> : null}
      </ul>
      {allowed.comment ? (
        <form className="space-y-2 border-t p-2" onSubmit={(event) => { event.preventDefault(); if (body.trim()) void start(); }}>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} maxLength={4000} aria-label="New comment" placeholder="Comment on this… use @ to mention" className="w-full rounded-lg border bg-background p-2 text-sm" />
          <button type="submit" disabled={busy || !body.trim()} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-foreground disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : <MessageSquarePlus className="size-4" />}Comment</button>
        </form>
      ) : null}
    </section>
  );
}
