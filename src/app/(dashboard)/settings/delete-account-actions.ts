"use server";

import { redirect } from "next/navigation";

import { requireViewer } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export type DeleteAccountResult = { error?: string };

/**
 * Deleting an account, for real, and only your own.
 *
 * ## What this actually removes
 *
 * `auth.admin.deleteUser` is called with the caller's own id — read from
 * their own session, never taken from the form, so nobody can pass another
 * id and delete somebody else's account. Deleting the row in `auth.users`
 * cascades through the database: `profiles.id references auth.users (id) on
 * delete cascade`, and every table this platform has added since — projects,
 * listings, products, agent and seller profiles, service areas, messages,
 * reviews, credit wallets, Agenda records — references `profiles.id` the same
 * way. That convention is checked in `scripts/delete_account_check.ts`, so a
 * migration that broke it would fail a check rather than fail silently on
 * somebody's actual deletion.
 *
 * ## What this does not remove
 *
 * Files in Supabase Storage — the avatar, cover photo, uploaded documents,
 * property and product photos, 360 frames, digital product files. Deleting
 * the database row does not delete the object sitting in a bucket under this
 * account's path; storage has no foreign key to cascade through. That is a
 * real, known gap, not a hidden one: it is why the confirmation below says so
 * rather than promising a clean sweep this action cannot yet perform, and it
 * is why this comment names it as the next piece of work rather than letting
 * the account-deletion story quietly stop being complete.
 *
 * ## Why the service-role client
 *
 * Deleting a row from `auth.users` is not something the row-level security on
 * `profiles` can express — RLS governs `public` tables, not the auth schema —
 * and no anon or authenticated key can call `auth.admin.*` at all. The
 * service-role client bypasses RLS by design, which is exactly why the id it
 * acts on is read from the authenticated session and never from anything the
 * browser sent.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const viewer = await requireViewer("/settings");

  const admin = createServiceClient();
  const { error } = await admin.auth.admin.deleteUser(viewer.id);

  if (error) {
    console.error(`[settings] account deletion failed for ${viewer.id}:`, error.message);
    return {
      error:
        "Your account could not be deleted. Nothing was removed — try again, or contact support.",
    };
  }

  // Only once the account is actually gone: a failed deletion must not leave
  // somebody signed out of an account that still exists.
  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect("/");
}
