"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function GoogleButton({ next = "/onboarding" }: { next?: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
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
