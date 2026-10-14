import type { Metadata } from "next";

import { JoinStudio } from "@/components/collab/join-studio";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Join a project · Agenda",
  // The token is after `#` and never reaches the server, but nothing on this
  // page should tell another site where its visitor came from either.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

/**
 * Where an invitation link lands: /agenda/join#<token>. The page is open to
 * anybody; the link is read in the browser and checked by the database once
 * the visitor is signed in.
 */
export default async function JoinPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return <JoinStudio signedIn={Boolean(user)} />;
}
