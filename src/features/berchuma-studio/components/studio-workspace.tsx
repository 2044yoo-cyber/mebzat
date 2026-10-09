"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { ChevronUp, FilePlus2, FileSpreadsheet, MessageSquare, Plus, Ruler, Trash2, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";

import { DesignChat, type ChatMessage } from "./chat/design-chat";
import { CostPanel } from "./pricing/cost-panel";
import { DesignEditor } from "./editor/design-editor";
import { TemplateThumb } from "./template-thumb";
import { PublishBar } from "./publish-bar";
import { SendToCalculator } from "./send-to-calculator";
import { StartPanel } from "./start-panel";
import { useDesign } from "../hooks/use-design";
import { startingDesign } from "../services/starting-designs";
import { addProjectDesign, projectDesigns, removeProjectDesign, updateProjectDesign } from "../services/cabinet-project";
import { buildParts } from "../services/geometry";
import { buildCutList, sheetCountsOf } from "../services/cutlist";
import { calculateCost } from "../services/costing";
import type { DesignCard } from "../services/designs";
import {
  differsFrom,
  draftKey,
  readDraft,
  savedAgo,
  writeDraft,
  clearDraft,
  type StudioDraft,
} from "../services/draft";
import type { DesignKind, DesignSpec } from "../types/spec";
import type { MarketRate } from "../types/cost";
import type {
  DesignErrorResponse,
  DesignRequestBody,
  DesignResponse,
} from "../types/api";

/**
 * Berchuma Studio.
 *
 * Three views of one object. The chat writes the spec, the rail edits it, the
 * panel prices it — and because all three are reading the same `useDesign`
 * state, there is no version of this screen where the drawing shows four bays
 * and the quote charges for three.
 *
 * On a phone they are tabs, because 90% of Medosha's traffic is a phone and
 * three columns on a 390 px screen is three unusable columns. On a wide
 * workspace they sit side by side. The switch is a container query on the
 * workspace column, not the viewport, so collapsing the sidebar widens this
 * page the same way it widens every other one.
 */

type Tab = "chat" | "design" | "cost";

/**
 * How long the design has to stand still before it is written down.
 *
 * Long enough that a drag writes once at the end of it rather than on every
 * frame, short enough that a back gesture a second after an edit still finds
 * the edit. Serialising a whole design is not free, and doing it sixty times a
 * second would make the drag it is protecting stutter.
 */
const DRAFT_WRITE_MS = 800;

/** A draft does not change under this tab: this tab is what writes it. */
function noSubscription(): () => void {
  return () => {};
}

/** localStorage throws on access in Safari's private mode, not only on write. */
function safeRead(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

const TABS: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: "design", label: "Cabinet Design", icon: Ruler },
  { id: "cost", label: "Price", icon: Wallet },
];

export function StudioWorkspace({
  rates,
  opening,
  editing,
  userId,
  recentProjects = [],
}: {
  rates: MarketRate[];
  /**
   * A design to open with, from `/studio?kind=…&width=…`.
   *
   * This is how a furniture calculator hands its unit over: the reader costs a
   * 2400 mm wardrobe, presses "Open in Design Studio", and the studio starts on
   * that wardrobe at that width rather than back at the picker. Absent for a
   * plain visit, which still gets the start panel.
   */
  opening?: { kind: DesignKind; width?: number; template?: string } | null;
  /**
   * A saved design to open for editing, from `/studio?design=<slug>`.
   *
   * Carries the design's id as well as its spec, because the two are one fact:
   * without the id the publish bar starts as though nothing had ever been
   * saved, and pressing Save would write a *second* design rather than a new
   * version of this one.
   */
  editing?: { spec: DesignSpec; designId: string; slug: string } | null;
  /** Who is looking, for the draft key. Null keeps the draft turned off. */
  userId?: string | null;
  /** Most recently edited Cabinet Design projects for the landing page. */
  recentProjects?: DesignCard[];
}) {
  // `rates` arrives from a server component and never changes for the life of
  // the page, but it is an array literal in props — memoised so the cost
  // recalculation is not invalidated on every render.
  const stableRates = useMemo(() => rates, [rates]);

  // Built once, on the first render, from the URL. `startingDesign` validates
  // as it builds, so a design arriving this way is held to the same carpentry
  // rules as one the model wrote.
  const design = useDesign(stableRates, () => {
    // A saved design wins: somebody who pressed "Open in Studio" is looking at
    // a particular design and means that one.
    if (editing) return editing.spec;
    // A template opens the start steps on it, to be sized, not a finished design.
    return opening && opening.kind !== "kitchen" && !opening.template
      ? startingDesign(opening.kind, opening.width ? { width: opening.width } : {})
      : null;
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("design");
  // Every entry in a project remains its own validated DesignSpec, not an
  // incorrectly mixed kitchen/wardrobe geometry. The primary design is always
  // the saved record's root spec; extras live in its projectItems.
  const [activeItemId, setActiveItemId] = useState("primary");
  const [freshProject, setFreshProject] = useState(false);
  const [newCabinetKind, setNewCabinetKind] = useState<DesignKind>("wardrobe");
  const [projectMessage, setProjectMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const projectItems = useMemo(() => design.spec ? projectDesigns(design.spec) : [], [design.spec]);
  const activeItem = projectItems.find(item => item.id === activeItemId) ?? projectItems[0];
  const activeSpec = activeItem?.spec ?? null;
  const activePartCount = useMemo(() => activeSpec ? buildParts(activeSpec).totals.partCount : 0, [activeSpec]);
  const activeCostState = useMemo(() => {
    if (!activeSpec) return null;
    if (activeItemId === "primary")
      return { cost: design.cost, issues: design.issues };
    const parts = buildParts(activeSpec);
    const cut = buildCutList(activeSpec, parts);
    return {
      cost: calculateCost(activeSpec, parts, {
        rates: stableRates, sheetCounts: sheetCountsOf(cut),
        manufacturable: cut.buildable,
      }),
      issues: [],
    };
  }, [activeSpec, activeItemId, design.cost, design.issues, stableRates]);
  const updateActive = useCallback((next: DesignSpec) => {
    if (!design.spec) return;
    design.set(updateProjectDesign(design.spec, activeItemId, next));
  }, [design.spec, design.set, activeItemId]);
  const addAnotherCabinet = () => {
    if (!design.spec) return;
    try {
      const id = crypto.randomUUID();
      design.set(addProjectDesign(design.spec, id, newCabinetKind));
      setActiveItemId(id);
      setProjectMessage("New cabinet added. Edit it here, then Save to keep the whole project.");
    } catch (error) {
      setProjectMessage(error instanceof Error ? error.message : "Could not add cabinet.");
    }
  };
  const downloadCombined = async () => {
    if (!design.spec) return;
    setExporting(true);
    setProjectMessage(null);
    try {
      // Load the XLSX writer only on demand, not with the 3D editor.
      const { buildProjectCutList } = await import("../services/cabinet-project");
      const result = buildProjectCutList(design.spec);
      const blob = new Blob([result.workbook.slice().buffer as ArrayBuffer],
        { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = "medosha-combined-cabinet-cut-list.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
      const saved = result.sheets.reduce((total, board) => total + board.separateSheets - board.sheets, 0);
      setProjectMessage(`Exported ${result.designs} designs and ${result.pieces} cut pieces. Shared sheet nesting saved ${saved} MDF/board sheets versus separate cutting plans.`);
    } catch (error) {
      setProjectMessage(error instanceof Error ? error.message : "Could not generate the combined cut list.");
    } finally {
      setExporting(false);
    }
  };

  // ---- the draft ---------------------------------------------------------
  //
  // An accidental back gesture used to take the whole design with it: the
  // studio held it in React state and nothing else had a copy until Save was
  // pressed. This keeps one in localStorage as the design changes, and offers
  // it back on the next visit.
  const key = userId ? draftKey(userId, freshProject ? null : editing?.designId ?? null) : null;
  const [dismissed, setDismissed] = useState(false);

  // Open to begin with: somebody arriving needs to see what they are looking
  // at and where Save is before they need the extra centimetre of drawing.
  const [headerOpen, setHeaderOpen] = useState(true);

  /**
   * The stored draft, read through `useSyncExternalStore`.
   *
   * localStorage is an external store that this component does not own, and
   * this is the API for reading one. The alternatives are both worse: a
   * `useState` initialiser runs during server rendering, where there is no
   * `localStorage` and the client would then hydrate to a different answer;
   * and an effect that calls `setState` is a render triggered by a render,
   * which is what the rule against it is guarding against.
   *
   * Nothing subscribes, because a draft does not change under this tab while
   * it is open — this tab is the only thing that writes it.
   */
  const stored = useSyncExternalStore(
    noSubscription,
    () => (key ? safeRead(key) : null),
    () => null,
  );

  /**
   * The design as it was when the page opened.
   *
   * Compared against, rather than the live one, so that the offer does not
   * evaporate the moment somebody touches a slider — and so that a draft of
   * the design already on screen is recognised as the same thing rather than
   * offered back as unsaved progress.
   *
   * Held in state rather than a ref because it *is* read during render, which
   * is what a ref is not for. A `useState` initialiser captures the first
   * value and never runs again, which is exactly the meaning wanted here.
   */
  const [openedWith] = useState(design.spec);

  const recovered = useMemo<StudioDraft | null>(() => {
    if (!stored || !key) return null;
    const found = readDraft(window.localStorage, key);
    return found && differsFrom(found, openedWith) ? found : null;
  }, [stored, key, openedWith]);

  // Written on a debounce. A drag produces a spec per animation frame, and
  // serialising a whole design sixty times a second would make the drag itself
  // stutter — which is a worse bug than the one this fixes.
  useEffect(() => {
    if (!key || !design.spec) return;
    const spec = design.spec;
    const timer = setTimeout(() => {
      writeDraft(window.localStorage, key, spec, editing?.designId ?? null);
    }, DRAFT_WRITE_MS);
    return () => clearTimeout(timer);
  }, [key, design.spec, editing?.designId]);

  // The last thing the user actually asked for. Saved as the version note, so
  // the history reads "make it wider" rather than "version 4".
  const lastBrief =
    [...messages].reverse().find((message) => message.role === "user")?.content ??
    null;

  const { replace } = design;

  const send = useCallback(
    async (brief: string) => {
      const outgoing: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: brief,
      };

      // History is taken from the messages already on screen rather than from
      // state read after this update, which would be one turn behind.
      const history = messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      setMessages((previous) => [...previous, outgoing]);
      setBusy(true);
      setError(null);

      try {
        const body: DesignRequestBody = {
          brief,
          history,
          current: activeSpec,
        };

        const response = await fetch("/api/studio/design", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });

        const payload = (await response.json()) as
          | DesignResponse
          | DesignErrorResponse;

        if (!response.ok || "error" in payload) {
          setError(
            "error" in payload ? payload.error : "Berchuma could not answer.",
          );
          return;
        }

        setMessages((previous) => [
          ...previous,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: payload.reply,
            changedDesign: payload.spec !== null,
          },
        ]);

        if (payload.spec) {
          if (design.spec) updateActive(payload.spec);
          else replace(payload.spec, payload.issues);
          // A phone shows one column at a time, and the thing worth seeing
          // after a design lands is the design.
          setTab("design");
        }
      } catch {
        setError(
          "The connection dropped before Berchuma answered. Try again.",
        );
      } finally {
        setBusy(false);
      }
    },
    [design.spec, activeSpec, messages, replace, updateActive],
  );

  const chat = (
    <DesignChat
      messages={messages}
      busy={busy}
      error={error}
      hasDesign={design.spec !== null}
      onSend={send}
    />
  );

  // The design tab is a scrolling page on a phone; the other two are not.
  //
  // Chat and price are fixed-height columns that scroll inside themselves,
  // and they have to be: the chat's message box is pinned to the bottom of
  // its column, and a column as tall as its messages puts that box below the
  // fold — which is exactly where it ended up the first time this was built
  // out of viewport arithmetic.
  //
  // The design tab is the opposite. Its chrome — these tabs, the title, the
  // save buttons — is what was eating the screen, and the only way for it to
  // scroll away is for this column to be taller than the window and for the
  // page to scroll it. `min-h-full` asks for at least a screenful and lets it
  // grow; `h-full` would cap it at one and nothing would ever scroll.
  //
  // Both are `h-full` again at `@4xl/ws`, where all three are side by side
  // and the studio is the fixed-height application it has always been on a
  // desktop.
  const flowing = tab === "design";

  // The rail is for talking about a design. Before one exists it has nothing
  // to do, so it stays off the desktop grid and the picker gets its width —
  // until "Or describe it in your own words" asks for it by name, same as it
  // already does on a phone via the same tab switch.
  const chatVisible = false;

  return (
    <div
      className={cn(
        "flex w-full min-w-0 max-w-full flex-col overflow-x-hidden @4xl/ws:h-full",
        flowing ? "min-h-full" : "h-full",
      )}
    >
      {/* Phone and tablet: one column, three tabs. */}
      <div className="border-b p-2 @4xl/ws:hidden">
        <div
          role="tablist"
          aria-label="Studio view"
          className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
        >
          {TABS.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              type="button"
              aria-selected={tab === entry.id}
              onClick={() => setTab(entry.id)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium",
                tab === entry.id
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              <entry.icon className="size-3.5" aria-hidden />
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {/*
        The draft, offered back rather than put back.

        Restoring silently would be wrong in the case that is hardest to
        recover from: somebody who deliberately started again would find their
        old design in front of them and no obvious way to be rid of it. So it
        says what it has and lets them choose, and "Discard" is a real button
        rather than a link that does nothing until the page is reloaded.
      */}
      {recovered && !dismissed ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {recovered.spec.title}
            </span>{" "}
            was left unsaved {savedAgo(recovered.savedAt)}.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                replace(recovered.spec, []);
                setDismissed(true);
                setTab("design");
              }}
              className="h-7 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground"
            >
              Put it back
            </button>
            <button
              type="button"
              onClick={() => {
                if (key) clearDraft(window.localStorage, key);
                setDismissed(true);
              }}
              className="h-7 rounded-md border px-2.5 text-xs"
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}

      {/*
        Two thresholds, not one.

        Three columns need about 1150 px of workspace to be worth having. Below
        that the middle column — the drawing, the thing people came to look
        at — was squeezed to 250 px while the chat and the price sat at their
        comfortable maximums, which is precisely backwards. So the studio
        widens in two steps: chat beside the design first, with the price
        under the rail where it scrolls with what it is pricing, and only then
        the price as a column of its own.
      */}
      <div
        className={cn(
          "grid w-full min-w-0 max-w-full flex-1 overflow-x-hidden @4xl/ws:min-h-0",
          // Nothing to chat about yet: before a design exists, the picker is
          // the whole point of the screen, so the chat rail stands down and
          // the grid collapses to just the columns still doing something —
          // the design panel alone below @6xl, design and price above it.
          chatVisible
            ? "@4xl/ws:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] @6xl/ws:grid-cols-[minmax(300px,360px)_minmax(0,1fr)_minmax(300px,360px)]"
            : "@6xl/ws:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]",
          // `min-h-0` lets a flex child be shorter than its content so the
          // child can scroll instead. That is right for the two columns that
          // scroll inside themselves and wrong for the one that is meant to
          // make the page long — with it, the design column collapses to the
          // window and the chrome above it has nowhere to scroll to.
          flowing ? "" : "min-h-0",
        )}
      >
        {/* Chat — desktop only once there is a design to discuss; the picker
            still reaches it through StartPanel's onOpenChat, same as a phone. */}
        <div
          className={cn(
            "min-h-0",
            chatVisible ? "@4xl/ws:block @4xl/ws:border-r" : "@4xl/ws:hidden",
            tab === "chat" ? "block" : "hidden",
          )}
        >
          {chat}
        </div>

        {/* The design, and the controls over it */}
        <div
          className={cn(
            "w-full min-w-0 max-w-full flex-col overflow-x-hidden @4xl/ws:flex @4xl/ws:min-h-0",
            tab === "design" ? "flex" : "hidden",
          )}
        >
          {design.spec ? (
            <>
              {/*
                The header folds away, and the drawing takes the room.

                The title, the parts count and the save buttons sat over the
                model and never moved, which on a phone left the drawing a
                strip in the middle of the screen. The controls sheet can
                already be pulled down to a peek; this is the other half of the
                same want — space above as well as below.

                Folded rather than scrolled. Scrolling the column would mean
                the editor is taller than what you can see, and two things in
                it need a known height: the 3D canvas, which sizes its camera
                to its box, and the controls sheet, which is positioned against
                the editor's bottom edge — that edge would sit a header's
                height below the screen, and the sheet's buttons with it.
                Taking the header out of the layout keeps the editor exactly
                the height of what is visible, which is the property both of
                them are built on.
              */}
              {headerOpen ? (
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2">
                  <div className="flex min-w-0 items-baseline gap-1.5">
                    <button
                      type="button"
                      onClick={() => setHeaderOpen(false)}
                      aria-label="Fold this away and give the drawing the room"
                      title="Give the drawing the room"
                      className="-ml-1 flex size-6 shrink-0 items-center justify-center self-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ChevronUp className="size-4" aria-hidden />
                    </button>
                    <div className="min-w-0">
                      <h1 className="truncate text-sm font-semibold">
                        {activeSpec?.title ?? design.spec.title}
                      </h1>
                      <p className="text-[11px] text-muted-foreground">
                        {activePartCount} parts ·{" "}
                        {activeSpec?.carcass.board.label ?? design.spec.carcass.board.label}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/*
                      Start again.
                      
                      There was no way back to the picker once a design was on
                      screen: the only route to a second wardrobe was the back
                      button, which is the gesture the draft was written to
                      survive rather than one to rely on.

                      It asks first, because it throws away whatever is on
                      screen, and it clears the stored draft as well — leaving
                      the draft behind would have the restore bar offer the
                      discarded design back on the next paint, which makes
                      "New project" look broken.
                    */}
                    <button
                      type="button"
                      onClick={() => {
                        const unsaved = Boolean(design.spec);
                        if (
                          unsaved &&
                          !window.confirm(
                            "Start a new project? Anything unsaved in this one is discarded.",
                          )
                        ) {
                          return;
                        }
                        if (key) clearDraft(window.localStorage, key);
                        setDismissed(true);
                        setFreshProject(true);
                        design.clear();
                        setActiveItemId("primary");
                        setProjectMessage(null);
                        setMessages([]);
                      }}
                      className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium"
                    >
                      <FilePlus2 className="size-3.5" aria-hidden />
                      New project
                    </button>

                    <SendToCalculator
                      kind={activeSpec?.kind ?? design.spec.kind}
                      width={activeSpec?.envelope.width ?? design.spec.envelope.width}
                    />
                    <PublishBar
                      key={freshProject ? "new-project" : editing?.designId ?? "unsaved-project"}
                      spec={design.spec}
                      lastBrief={lastBrief}
                      initialSaved={
                        !freshProject && editing ? { id: editing.designId, slug: editing.slug } : null
                      }
                    />
                  </div>
                </div>
              ) : null}

              {/* A single saved project can contain independently editable
                  wardrobes, vanities, kitchens, etc. Each has its own materials
                  and joinery rules; the XLSX combines their production output. */}
              <section aria-label="Cabinets in this project" className="space-y-2 border-b bg-background px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">Cabinets in project ({projectItems.length})</span>
                  <button type="button" onClick={() => void downloadCombined()} disabled={exporting}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium disabled:opacity-50">
                    <FileSpreadsheet className="size-4" aria-hidden />
                    {exporting ? "Preparing…" : "Combined cut list (.xlsx)"}
                  </button>
                </div>
                <div role="tablist" aria-label="Cabinet designs" className="flex gap-2 overflow-x-auto pb-1">
                  {projectItems.map((item, index) => (
                    <button key={item.id} type="button" role="tab" aria-selected={activeItemId === item.id}
                      onClick={() => { setActiveItemId(item.id); setProjectMessage(null); }}
                      className={cn("max-w-[180px] shrink-0 truncate rounded-lg border px-3 py-2 text-xs",
                        activeItemId === item.id ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-muted/30")}>
                      {index + 1}. {item.spec.title}
                    </button>
                  ))}
                </div>
                {projectItems.length > 1 ? (
                  <details className="rounded-lg border bg-muted/10 p-2">
                    <summary className="cursor-pointer select-none py-1 text-xs font-medium">
                      View all cabinets together ({projectItems.length} designs)
                    </summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {projectItems.map((item, index) => (
                        <div key={item.id} className="min-w-0 rounded-lg border bg-background p-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold">{index + 1}. {item.spec.title}</p>
                              <p className="text-[11px] capitalize text-muted-foreground">
                                {item.spec.kind.replace(/_/g, " ")} · {Math.round(item.spec.envelope.width)} ×
                                {Math.round(item.spec.envelope.height)} × {Math.round(item.spec.envelope.depth)} mm
                              </p>
                            </div>
                            <button type="button" onClick={() => {
                              setActiveItemId(item.id);
                              setProjectMessage(null);
                            }} className="shrink-0 rounded-md border px-2 py-1 text-xs font-medium">
                              Edit
                            </button>
                          </div>
                          <TemplateThumb spec={item.spec}
                            className="mt-2 h-28 w-full rounded-md bg-muted/30 p-2 text-foreground" />
                          <p className="mt-1 truncate text-[10px] text-muted-foreground">
                            Material: {item.spec.carcass.board.label}
                          </p>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs">
                    Add
                    <select aria-label="Cabinet design type to add" value={newCabinetKind}
                      onChange={(event) => setNewCabinetKind(event.target.value as DesignKind)}
                      className="min-h-10 rounded-lg border bg-background px-2">
                      <option value="wardrobe">Wardrobe</option>
                      <option value="vanity">Vanity / bathroom</option>
                      <option value="kitchen">Kitchen</option>
                      <option value="tv_unit">TV unit</option>
                      <option value="office_storage">Office cabinet</option>
                      <option value="shelving">Shelves</option>
                      <option value="custom">Custom cabinet</option>
                    </select>
                  </label>
                  <button type="button" onClick={addAnotherCabinet}
                    className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">
                    <Plus className="size-4" aria-hidden /> Add cabinet
                  </button>
                  {activeItemId !== "primary" ? (
                    <button type="button" onClick={() => {
                      if (!design.spec || !window.confirm("Remove this cabinet design from the project? Undo can restore it.")) return;
                      design.set(removeProjectDesign(design.spec, activeItemId));
                      setActiveItemId("primary");
                      setProjectMessage("Cabinet removed from this project. Use Undo to restore it.");
                    }} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-destructive/50 px-2 text-xs text-destructive">
                      <Trash2 className="size-3.5" aria-hidden /> Remove design
                    </button>
                  ) : null}
                </div>
                {projectMessage ? <p role="status" className="text-xs text-muted-foreground">{projectMessage}</p> : null}
                {projectItems.length > 1 ? <p className="text-[11px] text-muted-foreground">
                  Save stores all cabinets together. Excel combines cuts and hardware,
                  and its cutting layout reuses sheets across matching materials
                  when a shared arrangement reduces waste.
                </p> : null}
              </section>

              {/* The editor takes the rest of the column. On a phone that is
                  as much as it wants — the drawing sticks to the top of the
                  page and the controls run past it. */}
              <div className="w-full min-w-0 max-w-full flex-1 overflow-x-hidden @4xl/ws:min-h-0">
                <DesignEditor
                  key={activeItemId}
                  spec={activeSpec ?? design.spec}
                  onChange={updateActive}
                  onUndo={design.undo}
                  onRedo={design.redo}
                  canUndo={design.canUndo}
                  canRedo={design.canRedo}
                  headerHidden={!headerOpen}
                  onShowHeader={() => setHeaderOpen(true)}
                />
              </div>
            </>
          ) : (
            <div className="w-full">
              <div className="mx-auto w-full max-w-2xl px-4 pt-5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h1 className="text-2xl font-semibold">Cabinet Design</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Start a cabinet or continue one of your recent projects.
                    </p>
                  </div>
                  <Link
                    href="/designs?mine=1"
                    className="shrink-0 text-xs font-medium text-primary"
                  >
                    View all
                  </Link>
                </div>
                {recentProjects.length > 0 ? (
                  <section className="mt-5">
                    <h2 className="mb-2 text-sm font-medium">Recently created projects</h2>
                    <div className="grid grid-cols-2 gap-2">
                      {recentProjects.slice(0, 4).map((project) => (
                        // Resume a saved editor with a real navigation on mobile.
                        // Client-side query-only transitions can preserve the
                        // current useDesign controller and leave Start visible.
                        <a
                          key={project.id}
                          href={`/studio?design=${encodeURIComponent(project.slug)}`}
                          aria-label={`Continue design: ${project.title}`}
                          className="block min-w-0 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          <p className="truncate text-sm font-medium">{project.title}</p>
                          <p className="mt-1 text-xs capitalize text-muted-foreground">
                            {project.kind.replace(/_/g, " ")}
                          </p>
                          {project.project?.width ? (
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">
                              {Math.round(project.project.width)} × {Math.round(project.project.height)} × {Math.round(project.project.depth)} mm
                            </p>
                          ) : null}
                          <p className="mt-2 text-xs font-medium text-primary">Continue design →</p>
                        </a>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
              <StartPanel
                initialKind={opening?.kind}
                initialWidth={opening?.width}
                initialTemplate={opening?.template}
                onStart={(spec) => {
                  replace(spec, []);
                  setTab("design");
                }}
              />
            </div>
          )}
        </div>

        {/* Price, once there is room for it to stand alone. */}
        <div
          className={cn(
            "min-h-0 overflow-y-auto overscroll-contain p-3 @4xl/ws:hidden @6xl/ws:block @6xl/ws:border-l",
            tab === "cost" ? "block" : "hidden",
          )}
        >
          {activeCostState?.cost && activeSpec ? (
            <CostPanel
              cost={activeCostState.cost}
              issues={activeCostState.issues}
              assumptions={activeSpec.meta.assumptions}
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              The price appears as soon as there is something to price.
            </p>
          )}
        </div>
      </div>

      {/* A phone hides two of the three columns, so the number that matters
          most stays visible whichever one is open. */}
      {design.cost ? (
        <button
          type="button"
          onClick={() => setTab("cost")}
          className="flex items-center justify-between border-t bg-card px-4 py-2 text-left @6xl/ws:hidden"
        >
          <span className="text-xs text-muted-foreground">Estimated price</span>
          <span className="text-sm font-semibold tabular-nums">
            {design.cost.currency}{" "}
            {Math.round(design.cost.price).toLocaleString("en-US")}
          </span>
        </button>
      ) : null}
    </div>
  );
}
