import "server-only";

import { createClient } from "@/lib/supabase/server";
import { ATTACHMENT_BUCKET } from "@/lib/constants/messaging";
import type {
  ConversationSummary,
  MessageContext,
} from "@/types/database.types";

/** How long a signed attachment URL stays valid. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Messages fetched per conversation view. */
export const MESSAGE_PAGE_SIZE = 50;

export type ChatAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Signed URL, or null when the object could not be signed. */
  url: string | null;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  attachments: ChatAttachment[];
};

export type ConversationHeader = {
  id: string;
  kind: "direct" | "company";
  subject: string | null;
  contextType: MessageContext | null;
  contextId: string | null;
  title: string;
  href: string | null;
  avatarUrl: string | null;
  /** The other participant, when this is a direct conversation. */
  otherUserId: string | null;
  /** Every participant except the viewer — used for delivery/read state. */
  counterpartIds: string[];
  /** Latest read watermark across counterparts. */
  othersLastReadAt: string | null;
  /** Latest delivery watermark across counterparts. */
  othersLastDeliveredAt: string | null;
};

/** Inbox for the signed-in user, newest activity first. */
export async function getConversations(): Promise<ConversationSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_conversations");
  if (error) return [];
  return (data ?? []) as ConversationSummary[];
}

/** Total unread messages, for the navbar badge. */
export async function getUnreadCount(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unread_message_count");
  if (error) return 0;
  return typeof data === "number" ? data : 0;
}

/**
 * Conversation header for the chat pane. Returns null when the conversation
 * does not exist or the viewer is not a participant — RLS already hides other
 * people's threads, so an empty result is an access failure.
 */
export async function getConversationHeader(
  conversationId: string,
  viewerId: string,
): Promise<ConversationHeader | null> {
  const supabase = await createClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, kind, subject, context_type, context_id, company_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return null;

  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("user_id, last_read_at, last_delivered_at")
    .eq("conversation_id", conversationId);

  const others = (participants ?? []).filter((p) => p.user_id !== viewerId);
  const counterpartIds = others.map((p) => p.user_id);

  const latest = (values: string[]) =>
    values.length ? values.slice().sort().at(-1) ?? null : null;

  let title = "Conversation";
  let href: string | null = null;
  let avatarUrl: string | null = null;
  let otherUserId: string | null = null;

  if (conversation.kind === "company" && conversation.company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("name, slug, logo_url")
      .eq("id", conversation.company_id)
      .maybeSingle();
    title = company?.name ?? "Company";
    href = company?.slug ? `/companies/${company.slug}` : null;
    avatarUrl = company?.logo_url ?? null;
  } else if (counterpartIds.length > 0) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .eq("id", counterpartIds[0] ?? "")
      .maybeSingle();
    otherUserId = profile?.id ?? null;
    title = profile?.full_name ?? profile?.username ?? "Medosha member";
    href = profile?.username ? `/u/${profile.username}` : null;
    avatarUrl = profile?.avatar_url ?? null;
  }

  return {
    id: conversation.id,
    kind: conversation.kind,
    subject: conversation.subject,
    contextType: conversation.context_type,
    contextId: conversation.context_id,
    title,
    href,
    avatarUrl,
    otherUserId,
    counterpartIds,
    othersLastReadAt: latest(others.map((p) => p.last_read_at)),
    othersLastDeliveredAt: latest(others.map((p) => p.last_delivered_at)),
  };
}

/** Signs attachment paths in bulk so a thread costs one signing round-trip. */
async function signAttachments(
  paths: string[],
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  if (paths.length === 0) return signed;

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
  }
  return signed;
}

/** Most recent messages in a conversation, oldest first for rendering. */
export async function getMessages(
  conversationId: string,
  limit = MESSAGE_PAGE_SIZE,
): Promise<ChatMessage[]> {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, body, created_at, edited_at, deleted_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !rows) return [];

  const ordered = rows.slice().reverse();
  const ids = ordered.map((m) => m.id);

  const { data: attachmentRows } = ids.length
    ? await supabase
        .from("message_attachments")
        .select("id, message_id, storage_path, file_name, mime_type, size_bytes")
        .in("message_id", ids)
    : { data: [] };

  const attachments = attachmentRows ?? [];
  const signed = await signAttachments(attachments.map((a) => a.storage_path));

  const byMessage = new Map<string, ChatAttachment[]>();
  for (const a of attachments) {
    const list = byMessage.get(a.message_id) ?? [];
    list.push({
      id: a.id,
      fileName: a.file_name,
      mimeType: a.mime_type,
      sizeBytes: a.size_bytes,
      url: signed.get(a.storage_path) ?? null,
    });
    byMessage.set(a.message_id, list);
  }

  return ordered.map((m) => ({
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    body: m.body,
    createdAt: m.created_at,
    editedAt: m.edited_at,
    deletedAt: m.deleted_at,
    attachments: byMessage.get(m.id) ?? [],
  }));
}

export type DirectorySearchResult = {
  id: string;
  fullName: string;
  username: string | null;
  avatarUrl: string | null;
  accountType: string | null;
};

/** People the viewer can start a conversation with. */
export async function searchPeople(
  query: string,
  viewerId: string,
  limit = 10,
): Promise<DirectorySearchResult[]> {
  const term = query.replace(/[,()%]/g, " ").trim();
  if (term.length < 2) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url, account_type")
    .or(`full_name.ilike.%${term}%,username.ilike.%${term}%`)
    .neq("id", viewerId)
    .limit(limit);

  return (data ?? []).map((p) => ({
    id: p.id,
    fullName: p.full_name ?? p.username ?? "Medosha member",
    username: p.username,
    avatarUrl: p.avatar_url,
    accountType: p.account_type,
  }));
}
