"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { can, type Level } from "@/lib/collab/model";
import {
  readComments, readStudioTasks, toAnnotation, toBoard, toComment, toItem, toThread,
  type Annotation, type Asset, type Board, type Comment, type Item, type StudioMember, type StudioTask, type Thread,
} from "@/lib/collab/queries";
import { createClient } from "@/lib/supabase/client";
import { readAssets } from "@/lib/collab/queries";

import { markRead as markReadAction } from "@/app/(dashboard)/agenda/projects/[projectId]/collaborate/actions";

/**
 * Everything the Studio's four areas share: the project, who I am and what I
 * may do, the team, the files, the discussions and their comments, the tasks
 * — and the one realtime channel that keeps it all in step with everybody
 * else on the project.
 *
 * One channel per open Studio, removed when the Studio closes. Its changes
 * arrive filtered by project and are still subject to row-level security:
 * a row somebody may not read is not sent to them.
 */

export type Presence = { userId: string; name: string; tab: string; boardId: string | null; cursor: { x: number; y: number } | null; at: number };

type Listener<T> = (row: T) => void;

type Studio = {
  projectId: string;
  me: { id: string; name: string };
  level: Level;
  members: StudioMember[];
  member: (id: string | null | undefined) => StudioMember | undefined;
  boards: Board[];
  upsertBoard: (board: Board) => void;
  removeBoard: (id: string) => void;
  assets: Asset[];
  refreshAssets: () => Promise<void>;
  threads: Thread[];
  upsertThread: (thread: Thread) => void;
  comments: (threadId: string) => Comment[] | undefined;
  loadComments: (threadId: string) => Promise<void>;
  addComment: (comment: Comment) => void;
  unread: Set<string>;
  markRead: (threadId: string) => void;
  tasks: StudioTask[];
  /** `also`: tasks just linked, which the thread list may not show until the next render. */
  refreshTasks: (also?: readonly string[]) => Promise<void>;
  /** Which thread the side panel shows, anywhere in the Studio. */
  openThreadId: string | null;
  openThread: (id: string | null) => void;
  onItem: (listener: Listener<Item>) => () => void;
  onAnnotation: (listener: Listener<Annotation>) => () => void;
  presence: Presence[];
  announce: (state: Partial<Omit<Presence, "userId" | "name" | "at">>) => void;
  online: boolean;
  /** Whether this person may approve on the project (0108's `agenda_can_approve`). */
  mayApprove: boolean;
};

const StudioContext = createContext<Studio | null>(null);

export function useStudio(): Studio {
  const studio = useContext(StudioContext);
  if (!studio) throw new Error("useStudio outside the Studio");
  return studio;
}

export function useCan() {
  const { level } = useStudio();
  return { view: can.view(level), comment: can.comment(level), edit: can.edit(level), manage: can.manage(level) };
}

export function StudioProvider({
  projectId, me, level, members, initialBoards, initialAssets, initialThreads, initialUnread, initialTasks, initialThreadId, mayApprove = false, children,
}: {
  projectId: string;
  me: { id: string; name: string };
  level: Level;
  members: StudioMember[];
  initialBoards: Board[];
  initialAssets: Asset[];
  initialThreads: Thread[];
  initialUnread: string[];
  initialTasks: StudioTask[];
  initialThreadId: string | null;
  mayApprove?: boolean;
  children: React.ReactNode;
}) {
  const [boards, setBoards] = useState(initialBoards);
  const [assets, setAssets] = useState(initialAssets);
  const [threads, setThreads] = useState(initialThreads);
  const [commentMap, setCommentMap] = useState(() => new Map<string, Comment[]>());
  const [unread, setUnread] = useState(() => new Set(initialUnread));
  const [tasks, setTasks] = useState(initialTasks);
  const [openThreadId, setOpenThreadId] = useState<string | null>(initialThreadId);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [online, setOnline] = useState(true);
  const itemListeners = useRef(new Set<Listener<Item>>());
  const annotationListeners = useRef(new Set<Listener<Annotation>>());
  const openRef = useRef(openThreadId);
  const threadsRef = useRef(threads);
  const tasksRef = useRef(tasks);
  useEffect(() => { openRef.current = openThreadId; threadsRef.current = threads; tasksRef.current = tasks; }, [openThreadId, threads, tasks]);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const announced = useRef<Omit<Presence, "userId" | "name" | "at">>({ tab: "board", boardId: null, cursor: null });

  const memberMap = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const member = useCallback((id: string | null | undefined) => (id ? memberMap.get(id) : undefined), [memberMap]);

  const upsertBoard = useCallback((board: Board) => setBoards((list) => {
    const others = list.filter((entry) => entry.id !== board.id);
    return [...others, board].sort((a, b) => a.sortOrder - b.sortOrder);
  }), []);
  const removeBoard = useCallback((id: string) => setBoards((list) => list.filter((board) => board.id !== id)), []);
  const upsertThread = useCallback((thread: Thread) => setThreads((list) => {
    const known = list.find((entry) => entry.id === thread.id);
    if (known && known.revision > thread.revision) return list;
    return [thread, ...list.filter((entry) => entry.id !== thread.id)].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  }), []);

  const addComment = useCallback((comment: Comment) => setCommentMap((map) => {
    const list = map.get(comment.threadId);
    if (!list) return map;
    const next = new Map(map);
    next.set(comment.threadId, [...list.filter((entry) => entry.id !== comment.id), comment].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    return next;
  }), []);

  const loadComments = useCallback(async (threadId: string) => {
    const list = await readComments(createClient(), threadId);
    setCommentMap((map) => new Map(map).set(threadId, list));
  }, []);

  const markRead = useCallback((threadId: string) => {
    setUnread((set) => { if (!set.has(threadId)) return set; const next = new Set(set); next.delete(threadId); return next; });
    void markReadAction(projectId, threadId);
  }, [projectId]);

  const refreshAssets = useCallback(async () => { setAssets(await readAssets(createClient(), projectId)); }, [projectId]);
  const refreshTasks = useCallback(async (also: readonly string[] = []) => {
    const ids = new Set([...threadsRef.current.flatMap((thread) => (thread.taskId ? [thread.taskId] : [])), ...also]);
    setTasks(await readStudioTasks(createClient(), projectId, [...ids]));
  }, [projectId]);

  const openThread = useCallback((id: string | null) => {
    setOpenThreadId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("thread", id); else url.searchParams.delete("thread");
    window.history.replaceState(null, "", url);
  }, []);

  // One channel: rows for this project, and who is here.
  useEffect(() => {
    const supabase = createClient();
    const filter = `project_id=eq.${projectId}`;
    const channel = supabase.channel(`studio:${projectId}`, { config: { presence: { key: me.id } } });
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "collab_items", filter }, (payload) => {
        if (!payload.new || !("id" in payload.new)) return;
        const item = toItem(payload.new as Parameters<typeof toItem>[0]);
        for (const listener of itemListeners.current) listener(item);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "collab_annotations", filter }, (payload) => {
        if (!payload.new || !("id" in payload.new)) return;
        const annotation = toAnnotation(payload.new as Parameters<typeof toAnnotation>[0]);
        for (const listener of annotationListeners.current) listener(annotation);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "collab_boards", filter }, (payload) => {
        if (!payload.new || !("id" in payload.new)) return;
        const board = toBoard(payload.new as Parameters<typeof toBoard>[0]);
        if ((payload.new as { archived_at: string | null }).archived_at) removeBoard(board.id); else upsertBoard(board);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "collab_threads", filter }, (payload) => {
        if (!payload.new || !("id" in payload.new)) return;
        const thread = toThread(payload.new as Parameters<typeof toThread>[0]);
        upsertThread(thread);
        // Somebody else made it a task: fetch the task so it shows here too.
        if (thread.taskId && !tasksRef.current.some((task) => task.id === thread.taskId)) void refreshTasks([thread.taskId]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "collab_comments", filter }, (payload) => {
        const comment = toComment(payload.new as Parameters<typeof toComment>[0]);
        addComment(comment);
        if (comment.authorId !== me.id && openRef.current !== comment.threadId) {
          setUnread((set) => new Set(set).add(comment.threadId));
        }
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<Presence>();
        setPresence(Object.values(state).flatMap((entries) => entries.slice(-1)).filter((entry) => entry.userId !== me.id));
      })
      .subscribe((status) => {
        setOnline(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void channel.track({ userId: me.id, name: me.name, ...announced.current, at: Date.now() });
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") toast.info("Live updates paused — your changes still save. Reconnecting…", { id: "studio-live" });
      });
    channelRef.current = channel;
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      channelRef.current = null;
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      void supabase.removeChannel(channel);
    };
  }, [projectId, me.id, me.name, addComment, refreshTasks, removeBoard, upsertBoard, upsertThread]);

  // Presence: at most a few updates a second, however fast the cursor moves.
  const lastSent = useRef(0);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announce = useCallback((state: Partial<Omit<Presence, "userId" | "name" | "at">>) => {
    announced.current = { ...announced.current, ...state };
    const send = () => { lastSent.current = Date.now(); void channelRef.current?.track({ userId: me.id, name: me.name, ...announced.current, at: Date.now() }); };
    if (trailing.current) clearTimeout(trailing.current);
    if (Date.now() - lastSent.current > 120) send(); else trailing.current = setTimeout(send, 120);
  }, [me.id, me.name]);
  useEffect(() => () => { if (trailing.current) clearTimeout(trailing.current); }, []);

  const onItem = useCallback((listener: Listener<Item>) => { itemListeners.current.add(listener); return () => { itemListeners.current.delete(listener); }; }, []);
  const onAnnotation = useCallback((listener: Listener<Annotation>) => { annotationListeners.current.add(listener); return () => { annotationListeners.current.delete(listener); }; }, []);
  const comments = useCallback((threadId: string) => commentMap.get(threadId), [commentMap]);

  const value: Studio = {
    projectId, me, level, members, member, boards, upsertBoard, removeBoard, assets, refreshAssets,
    threads, upsertThread, comments, loadComments, addComment,
    unread, markRead, tasks, refreshTasks, openThreadId, openThread,
    onItem, onAnnotation, presence, announce, online, mayApprove,
  };
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
