import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ChatWindow } from "@/components/messages/chat-window";
import { ConversationList } from "@/components/messages/conversation-list";
import {
  getConversationHeader,
  getConversations,
  getMessages,
} from "@/lib/data/messages";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messages" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const header = await getConversationHeader(id, user.id);
  // RLS hides other people's threads, so a missing header means no access.
  if (!header) notFound();

  const [conversations, messages, { data: profile }] = await Promise.all([
    getConversations(),
    getMessages(id),
    supabase
      .from("profiles")
      .select("full_name, username")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const viewerName =
    profile?.full_name ?? profile?.username ?? "Medosha member";

  return (
    <div className="grid h-[calc(100vh-10rem)] min-h-0 overflow-hidden rounded-2xl border bg-card md:grid-cols-[22rem_1fr]">
      {/* Hidden on mobile: the thread takes the full screen there. */}
      <div className="hidden min-h-0 md:block md:border-r">
        <ConversationList conversations={conversations} activeId={id} />
      </div>

      <ChatWindow
        header={header}
        viewerId={user.id}
        viewerName={viewerName}
        initialMessages={messages}
      />
    </div>
  );
}
