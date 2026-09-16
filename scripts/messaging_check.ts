/**
 * The inbox, the tray and the two things that connect them.
 *
 *   npx tsx scripts/messaging_check.ts
 *
 * ## What this is not
 *
 * Not a check that messaging exists. It did: 0007 built conversations,
 * participants, messages, attachments, read watermarks and RLS, and
 * `chat-window.tsx` has been a real-time thread with attachments and read
 * receipts for some time. The assertions here cover what was missing — the
 * front door, the bell, the block — and the joins between them, which is where
 * a feature assembled from working parts actually breaks.
 *
 * The database half is checked where it lives, against real PostgreSQL, in
 * `supabase/tests/message-notifications.sql` and `blocks-and-reports.sql`. This
 * file is the application side, and deliberately stops where SQL starts.
 *
 * Both traps AGENTS.md names apply and are guarded for here: assertions are on
 * call syntax rather than on identifiers that outlive the call, and anything
 * that could be satisfied by a sibling elsewhere in the file is scoped.
 */

import "./lib/allow-server-only.ts";

import { readFileSync } from "node:fs";

import { relativeTime } from "../src/lib/notifications/relative-time.ts";
import { translations, LANGUAGES } from "../src/lib/i18n/translations.ts";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/(^|[\s;,{(=])\/\*[\s\S]*?\*\//g, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

// ---------------------------------------------------------------------------
// 1. The front door
// ---------------------------------------------------------------------------

{
  const inbox = code("src/app/(dashboard)/messages/page.tsx");

  check(
    "the inbox is no longer a placeholder",
    !/ComingSoon/.test(inbox) && !/Messaging is on the way/.test(inbox),
    "the feature was finished and the front door was never replaced",
  );
  check(
    "it renders the conversation list",
    /<ConversationList conversations=\{conversations\} \/>/.test(inbox),
  );
  check(
    "it is the same component the thread route uses",
    /from "@\/components\/messages\/conversation-list"/.test(inbox) &&
      /from "@\/components\/messages\/conversation-list"/.test(
        code("src/app/(dashboard)/messages/[id]/page.tsx"),
      ),
    "two lists would be two places for the search and the unread dots to differ",
  );
  check(
    "it is behind the sign-in gate",
    /await requireViewer\("\/messages"\)/.test(inbox),
  );
  check(
    "an empty inbox says so rather than rendering an empty list",
    /<InboxEmpty \/>/.test(inbox),
  );

  const thread = code("src/app/(dashboard)/messages/[id]/page.tsx");
  check(
    "the thread route still puts the list beside the chat on desktop",
    /md:grid-cols-\[22rem_1fr\]/.test(thread) &&
      /hidden min-h-0 md:block/.test(thread),
    "and hides it on a phone, where the thread is the whole screen",
  );
}

// ---------------------------------------------------------------------------
// 2. The bell opens rather than navigates
// ---------------------------------------------------------------------------

{
  const topbar = code("src/components/shell/topbar.tsx");

  check(
    "the bell is a panel, not a link",
    /<NotificationPanel/.test(topbar) &&
      !/href="\/notifications"/.test(topbar),
    "glancing at what arrived should not mean leaving the page",
  );
  check(
    "it is given the account Realtime filters on",
    /viewerId=\{profile\.id\}/.test(topbar),
  );
  check(
    "and the count the server already counted",
    /initialCount=\{notifications\}/.test(topbar),
    "so the badge is right on first paint rather than after a round trip",
  );

  const panel = code("src/components/notifications/notification-panel.tsx");

  check(
    "the panel is a sheet on a phone and a dropdown from sm up",
    /fixed inset-x-0 bottom-0/.test(panel) &&
      /sm:absolute sm:inset-auto sm:top-full sm:right-0/.test(panel),
  );
  check(
    "it has All and Unread tabs",
    /role="tablist"/.test(panel) &&
      /\(\["all", "unread"\] as const\)\.map/.test(panel),
  );
  check(
    "unread is a visual state, not only a filter",
    /row\.readAt === null && "bg-brand\/5"/.test(panel),
  );
  check(
    "each entry can be marked read on its own",
    /onClick=\{\(\) => readOne\(row\.id\)\}/.test(panel),
  );
  check(
    "and deleted on its own",
    /onClick=\{\(\) => removeOne\(row\.id\)\}/.test(panel),
  );
  check(
    "everything can be marked read at once",
    /onClick=\{readEverything\}/.test(panel),
  );
  check(
    "the mark-all button is disabled when there is nothing to mark",
    /disabled=\{count === 0\}/.test(panel),
  );
  check(
    "clicking an entry opens what it is about",
    /if \(row\.href\) router\.push\(row\.href\);/.test(panel),
  );
  check(
    "and marks it read on the way",
    /if \(row\.readAt === null\) readOne\(row\.id\);/.test(panel),
  );
  check(
    "the badge is recounted from the table rather than tracked as a delta",
    /\.select\("id", \{ count: "exact", head: true \}\)\s*\.is\("read_at", null\)/.test(
      panel,
    ),
    "a delta drifts from what the panel shows; a recount cannot",
  );
  check(
    "Realtime is filtered to the viewer",
    /filter: `user_id=eq\.\$\{viewerId\}`/.test(panel),
    "an unfiltered subscription asks the server for everybody's rows",
  );
  check(
    "a closed panel is not refetched",
    /if \(open\) void load\(\);/.test(panel),
  );
  check(
    "the channel is removed when the panel unmounts",
    /void supabase\.removeChannel\(channel\)/.test(panel),
  );
  check(
    "Escape closes it",
    /event\.key === "Escape"/.test(panel),
  );
  check(
    "the full page is still reachable from it",
    /href="\/notifications"/.test(panel),
    "the panel replaces the trip to the page, not the page",
  );
  check(
    "the rows are fetched because the bell was pressed, not by an effect watching it",
    /if \(!open && rows === null\) void load\(\);/.test(panel),
  );
}

// ---------------------------------------------------------------------------
// 3. The tray helpers go through the functions that check ownership
// ---------------------------------------------------------------------------

{
  const actions = code("src/app/notifications/actions.ts");

  check(
    "marking one read goes through the RPC",
    /rpc\("mark_notification_read", \{\s*target_notification: id,\s*\}\)/.test(
      actions,
    ),
    "the RPC states user_id = auth.uid() itself, so the policy is not the only thing saying it",
  );
  check(
    "deleting one goes through the RPC",
    /rpc\("delete_notification", \{\s*target_notification: id,\s*\}\)/.test(
      actions,
    ),
  );
  check(
    "neither writes the table directly",
    !/from\("notifications"\)\s*\.delete\(\)/.test(actions),
  );
}

// ---------------------------------------------------------------------------
// 4. Block and report
// ---------------------------------------------------------------------------

{
  const actions = code("src/app/(dashboard)/messages/block-actions.ts");

  for (const [what, rpc] of [
    ["blocking", "block_user"],
    ["unblocking", "unblock_user"],
    ["reporting", "report_user"],
  ] as [string, string][]) {
    check(
      `${what} goes through its RPC rather than the table`,
      new RegExp(`rpc\\("${rpc}"`).test(actions),
    );
  }
  check(
    "nothing writes user_blocks directly",
    !/from\("user_blocks"\)\s*\.(insert|delete|upsert)/.test(actions),
    "the RPC is security definer because the block list is one-sided",
  );

  const menu = code("src/components/messages/conversation-menu.tsx");
  check(
    "the menu offers block and report",
    /blockUser\(otherUserId\)/.test(menu) &&
      /unblockUser\(otherUserId\)/.test(menu) &&
      /reportUser\(otherUserId, "harassment"\)/.test(menu),
  );
  check(
    "blocking asks first",
    /!blocked && !window\.confirm\(t\("messages\.blockConfirm"\)\)/.test(menu),
  );
  check(
    "unblocking does not ask",
    !/window\.confirm[\s\S]{0,60}unblockConfirm/.test(menu),
    "undoing something is not a decision that needs confirming",
  );
  check(
    "a refused block is put back rather than left showing",
    /setBlocked\(!next\);/.test(menu),
    "otherwise the menu claims a block the server did not make",
  );

  const chat = code("src/components/messages/chat-window.tsx");
  check(
    "the menu is only on a one-to-one thread",
    /\{header\.otherUserId && \(\s*<ConversationMenu/.test(chat),
    "there is no single account to block in a company conversation",
  );
  check(
    "a blocked thread says so",
    /\{blocked && \(/.test(chat) && /messages\.blockedNotice/.test(chat),
  );

  const thread = code("src/app/(dashboard)/messages/[id]/page.tsx");
  check(
    "the blocked state is read on the server, not fetched in the browser",
    /header\.otherUserId \? isBlocked\(header\.otherUserId\)/.test(thread),
  );
  check(
    "and the history stays visible",
    !/blocked \?[\s\S]{0,80}notFound\(\)/.test(thread),
    "the blocker keeps what was said, which is what they would need to report it",
  );
}

// ---------------------------------------------------------------------------
// 5. "2 min ago", in three languages
// ---------------------------------------------------------------------------

{
  const now = new Date("2026-09-16T12:00:00Z");
  const ago = (iso: string, lang = "en") => relativeTime(iso, lang, now);

  check(
    "seconds read as seconds",
    /\b10\b/.test(ago("2026-09-16T11:59:50Z")),
    ago("2026-09-16T11:59:50Z"),
  );
  check(
    "ninety seconds is a minute, not ninety seconds",
    /\b1\b/.test(ago("2026-09-16T11:58:30Z")),
    ago("2026-09-16T11:58:30Z"),
  );
  check(
    "hours read as hours",
    /\b3\b/.test(ago("2026-09-16T09:00:00Z")),
    ago("2026-09-16T09:00:00Z"),
  );
  check(
    "forty days is a month, not forty days",
    !/\b40\b/.test(ago("2026-08-07T12:00:00Z")),
    ago("2026-08-07T12:00:00Z"),
  );
  check(
    "a clock running ahead does not produce a time in the future",
    !/^in /.test(ago("2026-09-16T12:00:05Z")),
    `${ago("2026-09-16T12:00:05Z")} — clock skew reads as a bug`,
  );
  check(
    "a value that is not a date renders nothing rather than Invalid Date",
    ago("not-a-date") === "",
  );
  check(
    "it says the same thing in Amharic and Afaan Oromo",
    ago("2026-09-16T11:58:00Z", "am") !== ago("2026-09-16T11:58:00Z", "en") &&
      ago("2026-09-16T11:58:00Z", "om") !== ago("2026-09-16T11:58:00Z", "en") &&
      ago("2026-09-16T11:58:00Z", "am").length > 0 &&
      ago("2026-09-16T11:58:00Z", "om").length > 0,
    `am: ${ago("2026-09-16T11:58:00Z", "am")}, om: ${ago("2026-09-16T11:58:00Z", "om")}`,
  );
  check(
    "a language nothing knows falls back rather than throwing",
    ago("2026-09-16T11:58:00Z", "zz").length > 0,
  );
}

// ---------------------------------------------------------------------------
// 6. Every new string exists in all three languages
// ---------------------------------------------------------------------------

{
  const keys = [
    ["notifications", "tabAll"],
    ["notifications", "tabUnread"],
    ["notifications", "markRead"],
    ["notifications", "markAllRead"],
    ["notifications", "remove"],
    ["notifications", "seeAll"],
    ["notifications", "empty"],
    ["notifications", "emptyUnread"],
    ["messages", "emptyTitle"],
    ["messages", "emptyBody"],
    ["messages", "block"],
    ["messages", "unblock"],
    ["messages", "report"],
    ["messages", "blockedNotice"],
    ["messages", "blockConfirm"],
    ["messages", "reportConfirm"],
    ["messages", "blockDone"],
    ["messages", "unblockDone"],
    ["messages", "reportDone"],
  ];

  for (const [group, key] of keys) {
    for (const language of LANGUAGES) {
      const dictionary = translations[language] as Record<
        string,
        Record<string, string>
      >;
      const value = dictionary[group!]?.[key!];
      check(
        `${group}.${key} exists in ${language}`,
        typeof value === "string" && value.trim().length > 0,
      );
    }
  }

  // Each catalogue is compared against English one at a time.
  //
  // "at least two distinct values across the three" was the first version, and
  // it passes with Amharic left in English as long as Afaan Oromo differs —
  // which is exactly the case somebody pasting the English block would create.
  const english = translations.en as Record<string, Record<string, string>>;
  for (const [group, key] of keys) {
    for (const language of LANGUAGES.filter((l) => l !== "en")) {
      const dictionary = translations[language] as Record<
        string,
        Record<string, string>
      >;
      check(
        `${group}.${key} is translated into ${language}, not left in English`,
        dictionary[group!]?.[key!] !== english[group!]?.[key!],
        `${language}: ${dictionary[group!]?.[key!]}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
  console.log(`${GREEN}${passed} passed${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
console.log(`${DIM}messaging: a front door, a bell that opens, and a block that stops${RESET}`);
