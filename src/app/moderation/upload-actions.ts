"use server";

import { moderate, publishApproved } from "@/lib/moderation/service";
import {
  type ContentKind,
  type ModerationStatus,
  uploadMessage,
} from "@/lib/moderation/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Quarantine → check → publish, for one uploaded image.
 *
 * The client puts the file in `moderation-quarantine`, which is private and
 * folder-scoped to the uploader, and then calls this. Nothing reaches a public
 * bucket until a verdict of `safe` comes back, so there is no window in which
 * an unchecked image is fetchable by URL.
 *
 * Written once and shared: every upload in the app has the same three
 * outcomes and the same failure modes, and eight copies of this logic would
 * be eight chances to forget the blocked case.
 */

export type UploadVerdict = {
  status: ModerationStatus;
  /** Only ever set when status is "safe". */
  publicUrl?: string;
  /** For an appeal, if the author wants one. */
  itemId?: string;
  /** Already phrased for a person. Never carries a score or a rule. */
  message: string;
};

/** What the browser claims is not evidence. These are the first bytes of the
 * formats the quarantine bucket accepts. */
const SIGNATURES: { mime: string; bytes: number[]; offset?: number }[] = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/webp", bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
];

function sniff(buffer: Uint8Array): string | null {
  for (const sig of SIGNATURES) {
    const at = sig.offset ?? 0;
    if (buffer.length < at + sig.bytes.length) continue;
    if (sig.bytes.every((b, i) => buffer[at + i] === b)) return sig.mime;
  }
  return null;
}

export async function moderateQuarantinedImage(input: {
  quarantinePath: string;
  contentType: ContentKind;
  publicBucket: string;
  contentId?: string;
}): Promise<UploadVerdict> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "blocked", message: "Sign in to upload." };
  }

  // The path is supplied by the browser, so it is checked rather than trusted:
  // a caller must not be able to name somebody else's folder and have this
  // publish their file.
  const owner = input.quarantinePath.split("/")[0];
  if (owner !== user.id) {
    return { status: "blocked", message: "That upload could not be verified." };
  }

  const download = await supabase.storage
    .from("moderation-quarantine")
    .download(input.quarantinePath);

  if (download.error || !download.data) {
    return {
      status: "review",
      message: uploadMessage("review"),
    };
  }

  const bytes = new Uint8Array(await download.data.arrayBuffer());
  const actual = sniff(bytes);

  if (!actual) {
    // Not one of the accepted formats whatever the extension says. Remove it
    // rather than leave an unidentified file sitting in quarantine.
    await supabase.storage
      .from("moderation-quarantine")
      .remove([input.quarantinePath]);
    return {
      status: "blocked",
      message: "That file is not an image we can accept.",
    };
  }

  const dataUrl = `data:${actual};base64,${Buffer.from(bytes).toString("base64")}`;

  const outcome = await moderate({
    client: supabase,
    userId: user.id,
    contentType: input.contentType,
    contentId: input.contentId,
    image: dataUrl,
    quarantinePath: input.quarantinePath,
  });

  if (outcome.status !== "safe" || !outcome.itemId) {
    // review and blocked both leave the file where it is: private, scoped to
    // the uploader, unreachable by URL. A moderator can still reach it.
    return {
      status: outcome.status,
      itemId: outcome.itemId,
      message: uploadMessage(outcome.status),
    };
  }

  const publicUrl = await publishApproved(
    supabase,
    outcome.itemId,
    input.quarantinePath,
    input.publicBucket,
  );

  if (!publicUrl) {
    return {
      status: "review",
      itemId: outcome.itemId,
      message: uploadMessage("review"),
    };
  }

  return {
    status: "safe",
    publicUrl,
    itemId: outcome.itemId,
    message: uploadMessage("safe"),
  };
}

/**
 * A short-lived link to a file still in quarantine, for the person who put it
 * there.
 *
 * Something waiting on review has to be visible to its author — they cannot
 * finish a tour around a room they cannot see, and an upload that vanishes is
 * indistinguishable from one that failed. But it must be visible to *only*
 * them, so this signs a URL rather than publishing the file, and refuses any
 * path outside the caller's own folder. The quarantine bucket is private; a
 * signed URL is the only way in, and it expires.
 */
export async function signQuarantinePreview(
  quarantinePath: string,
): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // The same ownership check the publish path makes, for the same reason: the
  // path comes from the browser and naming somebody else's folder must not
  // hand back a link to their file.
  if (quarantinePath.split("/")[0] !== user.id) return null;

  const { data } = await supabase.storage
    .from("moderation-quarantine")
    .createSignedUrl(quarantinePath, 60 * 60);

  return data?.signedUrl ?? null;
}
