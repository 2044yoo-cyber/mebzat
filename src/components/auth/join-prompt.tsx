"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Join Medosha to do this."
 *
 * What a visitor gets instead of a redirect when they click something that
 * needs an account. The difference matters more than it looks: a redirect
 * throws away the page they were reading, the scroll position they had, and
 * whatever half-formed intent brought them there. A small dialog keeps all
 * three, and closing it puts them back exactly where they were.
 *
 * The wording names the action rather than the rule. "Join Medosha to like
 * posts" tells somebody what they get; "Authentication required" tells them
 * they have done something wrong.
 *
 * ## Where they come back to
 *
 * Both buttons carry the current path as `next`, so signing in returns them to
 * the property they were looking at. Sending somebody to a dashboard after they
 * asked to save a specific listing is how a sign-up is abandoned halfway.
 */

type PromptState = { open: boolean; message: string };

const JoinPromptContext = createContext<{
  prompt: (message: string) => void;
} | null>(null);

/**
 * Wraps the app once. Anything below it can ask for the prompt without
 * threading state through every component in between.
 */
export function JoinPromptProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PromptState>({ open: false, message: "" });
  const pathname = usePathname();

  const prompt = useCallback((message: string) => {
    setState({ open: true, message });
  }, []);

  const next = encodeURIComponent(pathname || "/");

  return (
    <JoinPromptContext.Provider value={{ prompt }}>
      {children}

      <Dialog
        open={state.open}
        onOpenChange={(open) => setState((s) => ({ ...s, open }))}
      >
        {/* Deliberately small. This interrupts reading, so it should take up
            as little of the screen as it can and be dismissable by tapping
            anywhere outside — which on a phone is most of the screen. */}
        <DialogContent className="max-w-xs rounded-2xl p-5 text-center sm:max-w-sm">
          <DialogTitle className="text-base font-semibold">
            {state.message}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            It takes a moment, and you can keep browsing without one.
          </DialogDescription>

          {/* Create account first: somebody being prompted is, by definition,
              somebody who does not have one yet. Log in stays available for
              the returning visitor who was simply signed out. */}
          <div className="mt-2 flex flex-col gap-2">
            {/* Links rather than buttons: this navigates, so it should be
                something a visitor can middle-click, and it works before
                hydration. */}
            <Link
              href={`/signup?next=${next}`}
              className={cn(buttonVariants(), "w-full")}
            >
              Create account
            </Link>
            <Link
              href={`/login?next=${next}`}
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              Log in
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </JoinPromptContext.Provider>
  );
}

/**
 * Ask for the prompt from anywhere below the provider.
 *
 * Returns a no-op rather than throwing when the provider is absent. A missing
 * provider should not crash a page a visitor is reading — the action quietly
 * does nothing, which is bad, while a white screen is worse.
 */
export function useJoinPrompt() {
  const context = useContext(JoinPromptContext);
  return context?.prompt ?? (() => {});
}

/**
 * The common case, as one hook.
 *
 * `gate(action)` returns a handler that runs the action when somebody is signed
 * in and shows the prompt when they are not — so a Like button is written once
 * and behaves correctly for both.
 */
export function useAuthGate(signedIn: boolean) {
  const prompt = useJoinPrompt();

  return useCallback(
    (message: string, action: () => void) =>
      (event?: { preventDefault?: () => void }) => {
        if (!signedIn) {
          event?.preventDefault?.();
          prompt(message);
          return;
        }
        action();
      },
    [signedIn, prompt],
  );
}
