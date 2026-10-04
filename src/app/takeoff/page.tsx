import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TakeoffWorkspace } from "@/components/takeoff/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Takeoff",
  description:
    "Import an IFC or DXF and get quantities, a bill and a cost you can edit — with every number showing where it came from.",
};

/**
 * Takeoff.
 *
 * The page is a shell: it checks there is a session and hands over to a client
 * workspace that does the parsing in the browser. That is deliberate. Somebody's
 * unpublished drawings are the most confidential thing they own, and there is no
 * reason for them to reach a server to be measured — the parsers are pure
 * functions and the arithmetic is arithmetic.
 *
 * It costs nothing in credits for the same reason: nothing here calls a model.
 */
export default async function TakeoffPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/takeoff");

  return (
    <div className="container-page py-6">
      <TakeoffWorkspace />
    </div>
  );
}
