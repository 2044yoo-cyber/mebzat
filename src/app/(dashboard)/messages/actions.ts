"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  MAX_MESSAGE_LENGTH,
  isAllowedAttachmentType,
} from "@/lib/constants/messaging";
import { searchPeople, type DirectorySearchResult } from "@/lib/data/messages";
import { createClient } from "@/lib/supabase/server";
import type { MessageContext } from "@/types/database.types";

export type ActionResult = { error?: string };

/** Attachment already uploaded by the client, awaiting a message row. */
export type PendingAttachment = {
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

// 0032 added "job", so a conversation started from a posting carries the job
// it is about and the thread header can say which one.
const CONTEXTS: MessageContext[] = [
  "project",
  "product",
  "company",
  "profile",
  "job",
];

function parseContext(value: FormDataEntryValue | null): MessageContext | null {
  return typeof value === "string" && CONTEXTS.includes(value as MessageContext)
    ? (value as MessageContext)
    : null;
}

function parseUuid(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" &&
    /^[0-9a-f-]{36}$/i.test(value)
    ? value
    : null;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/**
 * Opens the conversation with another member, creating it on first contact.
 * Used by every "Message" button, so it always lands on one thread per pair.
 */
export async function openDirectConversation(formData: FormData) {
  const { supabase } = await requireUser();

  const otherUserId = parseUuid(formData.get("userId"));
  if (!otherUserId) redirect("/messages");

  const { data, error } = await supabase.rpc("start_direct_conversation", {
    other_user_id: otherUserId,
    context_type: parseContext(formData.get("contextType")),
    context_id: parseUuid(formData.get("contextId")),
    subject:
      typeof formData.get("subject") === "string"
        ? (formData.get("subject") as string).slice(0, 200)
        : null,
  });

  if (error || !data) redirect("/messages");
  revalidatePath("/messages");
  redirect(`/messages/${data}`);
}

/** Opens the conversation with a company, creating it on first contact. */
export async function openCompanyConversation(formData: FormData) {
  const { supabase } = await requireUser();

  const companyId = parseUuid(formData.get("companyId"));
  if (!companyId) redirect("/messages");

  const { data, error } = await supabase.rpc("start_company_conversation", {
    target_company_id: companyId,
    context_type: parseContext(formData.get("contextType")),
    context_id: parseUuid(formData.get("contextId")),
    subject:
      typeof formData.get("subject") === "string"
        ? (formData.get("subject") as string).slice(0, 200)
        : null,
  });

  if (error || !data) redirect("/messages");
  revalidatePath("/messages");
  redirect(`/messages/${data}`);
}

/**
 * Persists a message. Attachments are uploaded by the client first (straight
 * to Storage under the conversation folder, which its RLS policy restricts to
 * participants); this validates them and links them to the new row.
 */
export async function sendMessage(
  conversationId: string,
  body: string,
  attachments: PendingAttachment[] = [],
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const text = body.trim();
  if (!text && attachments.length === 0) {
    return { error: "Write a message or attach a file." };
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    return { error: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.` };
  }
  if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return { error: `Up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.` };
  }

  for (const file of attachments) {
    if (!isAllowedAttachmentType(file.mimeType)) {
      return { error: `${file.fileName}: that file type isn't supported.` };
    }
    if (file.sizeBytes > MAX_ATTACHMENT_BYTES) {
      return { error: `${file.fileName} is too large.` };
    }
    // Objects live under <conversation_id>/…; reject anything pointing elsewhere.
    if (!file.storagePath.startsWith(`${conversationId}/`)) {
      return { error: "Attachment rejected." };
    }
  }

  // Membership is enforced by RLS on insert; checking here turns a policy
  // violation into a readable message.
  const { data: member } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return { error: "You're not part of this conversation." };

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: text,
    })
    .select("id")
    .single();

  if (error || !message) return { error: "Could not send that message." };

  if (attachments.length > 0) {
    const { error: attachmentError } = await supabase
      .from("message_attachments")
      .insert(
        attachments.map((file) => ({
          message_id: message.id,
          storage_path: file.storagePath,
          file_name: file.fileName.slice(0, 200),
          mime_type: file.mimeType,
          size_bytes: file.sizeBytes,
        })),
      );
    if (attachmentError) {
      return { error: "Message sent, but the attachment failed to save." };
    }
  }

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);
  return {};
}

/** Clears the unread badge for a conversation the viewer is reading. */
export async function markConversationRead(
  conversationId: string,
): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("mark_conversation_read", {
    target_conversation_id: conversationId,
  });
  if (error) return { error: "Could not update read state." };
  revalidatePath("/messages");
  return {};
}

/** Advances delivery receipts once the recipient's client is connected. */
export async function markDelivered(): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("mark_conversations_delivered");
  return error ? { error: "Could not update delivery state." } : {};
}

/** Soft-deletes the viewer's own message, keeping thread order intact. */
export async function deleteMessage(
  messageId: string,
  conversationId: string,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("messages")
    .update({ body: "", deleted_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("sender_id", user.id);

  if (error) return { error: "Could not delete that message." };

  revalidatePath(`/messages/${conversationId}`);
  return {};
}

/** Signed upload target for one attachment, scoped to the conversation. */
export async function createAttachmentUploadPath(
  conversationId: string,
  fileName: string,
): Promise<{ path?: string; error?: string }> {
  const { supabase, user } = await requireUser();

  const { data: member } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return { error: "You're not part of this conversation." };

  const safeName = fileName
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-80);

  return {
    path: `${conversationId}/${user.id}-${Date.now()}-${safeName}`,
  };
}


/** People search for the "new conversation" dialog. */
export async function searchPeopleAction(
  query: string,
): Promise<DirectorySearchResult[]> {
  const { user } = await requireUser();
  return searchPeople(query, user.id);
}
