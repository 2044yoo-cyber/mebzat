"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SupabaseConfigError, createClient } from "@/lib/supabase/client";

export function GoogleButton({ next = "/dashboard" }: { next?: string }) {
  const [loading, setLoading] = useState(false);

  /**
   * Start Google sign-in.
   *
   * The `finally` is the fix for the reported bug, and it is worth being
   * explicit about why. `createClient()` throws when Supabase is unconfigured,
   * and the throw happened after `setLoading(true)` with nothing to catch it —
   * so `setLoading(false)` never ran and the button stayed `disabled` for the
   * life of the page. Clicking it greyed it out and killed it. The cause was a
   * missing environment variable; the symptom was a dead button on a page that
   * otherwise looked fine.
   *
   * On the success path this deliberately stays loading: the browser is being
   * navigated to Google, and clearing the state would flash the button back to
   * life for the instant before the page goes away.
   */
  async function handleClick() {
    if (loading) return;
    setLoading(true);

    let leaving = false;

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });

      if (error) {
        // Supabase answered and refused. Almost always means Google is not
        // enabled for this project, which is a dashboard setting rather than
        // anything in the code.
        toast.error(
          error.message ||
            "Google sign-in is unavailable. Try email or phone instead.",
        );
        console.error("[auth] Google OAuth refused:", error.message);
        return;
      }

      leaving = true;
    } catch (caught) {
      if (caught instanceof SupabaseConfigError) {
        // Named variables, no values. The anon key and URL are public by
        // design, and a developer staring at a dead button needs to know which
        // one is absent rather than being told "something went wrong".
        console.error(`[auth] ${caught.message}`);
        toast.error(
          process.env.NODE_ENV === "development"
            ? caught.message
            : "Sign-in is unavailable right now. Please try again shortly.",
        );
        return;
      }

      console.error("[auth] Google sign-in failed:", caught);
      toast.error("Could not start Google sign-in. Please try again.");
    } finally {
      // Never leave the button stuck. The one exception is a successful
      // redirect, where the page is about to be replaced anyway.
      if (!leaving) setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={loading}
      onClick={handleClick}
    >
      <svg viewBox="0 0 24 24" className="size-4">
        <path
          fill="#4285F4"
          d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.78-2.4 3.63v3.02h3.89c2.27-2.09 3.56-5.17 3.56-8.84Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.89-3.02c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.94H1.27v3.11C3.25 21.3 7.31 24 12 24Z"
        />
        <path
          fill="#FBBC05"
          d="M5.28 14.29A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.29V6.6H1.27A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.27 5.4l4.01-3.11Z"
        />
        <path
          fill="#EA4335"
          d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.45-3.45C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.6l4.01 3.11c.95-2.83 3.6-4.94 6.72-4.94Z"
        />
      </svg>
      Continue with Google
    </Button>
  );
}
