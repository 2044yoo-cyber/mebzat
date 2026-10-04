import type { Metadata } from "next";
import { ConversationList } from "@/components/messages/conversation-list";
import { InboxEmpty } from "@/components/messages/inbox-empty";
import { getConversations } from "@/lib/data/messages";
import { requireViewer } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Messages" };

/**
 * The inbox.
 *
 * This route was a "Messaging is on the way" card while `/messages/[id]` was a
 * finished real-time chat with attachments, read receipts and a conversation
 * list beside it. The feature was built and the front door was never replaced,
 * so the only way in was a link from somebody's profile — and anybody who
 * clicked Messages in the navigation was told it did not exist yet.
 *
 * ## Why the list is the whole page here, and a column on the thread route
 *
 * Because that is what a phone needs. On mobile the inbox is one full-width
 * screen and opening a conversation replaces it; on desktop the same list sits
 * in a 22rem column beside the thread. Both routes render the same
 * `ConversationList`, so the search box, the unread dots and the ordering
 * cannot drift apart between the two.
 */
export default async function MessagesPage() {
  // The account area, not a public page. A visitor with no account is asked to
  // join rather than shown an empty inbox.
  await requireViewer("/messages");

  const conversations = await getConversations();

  return (
    <div className="mx-auto flex h-[calc(100dvh-10rem)] w-full max-w-5xl min-h-0 flex-col overflow-hidden rounded-2xl border bg-card">
      {conversations.length === 0 ? (
        <InboxEmpty />
      ) : (
        <ConversationList conversations={conversations} />
      )}
    </div>
  );
}
