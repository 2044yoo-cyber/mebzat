"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { chooseRole } from "@/app/(dashboard)/welcome/actions";
import { ROLES } from "@/lib/profile/roles";
import { cn } from "@/lib/utils";
import type { MedoshaRole } from "@/types/database.types";

/**
 * How will you use Medosha?
 *
 * One question, five answers, no skip. A skip would leave an account with no
 * role and the screen gone — and the next thing it does is decide which
 * profile the person is asked to fill in, so there is no useful default to
 * skip to.
 *
 * It says plainly that the answer is not permanent, because the commonest
 * reason somebody stalls on a question like this is not knowing whether it is.
 */
export function RolePicker({
  greeting,
  failed,
}: {
  greeting: string | null;
  failed: boolean;
}) {
  const [chosen, setChosen] = useState<MedoshaRole | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      action={(formData) => start(() => chooseRole(formData))}
      className="space-y-6"
    >
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting ? `Welcome, ${greeting}.` : "Welcome to Medosha."}
        </h1>
        <p className="text-muted-foreground">How will you use Medosha?</p>
      </header>

      {failed && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-center text-sm text-destructive"
        >
          That did not save. Try again.
        </p>
      )}

      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">How will you use Medosha?</legend>
        {ROLES.map((role) => {
          const Icon = role.icon;
          const selected = chosen === role.value;
          return (
            <label
              key={role.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
                selected
                  ? "border-brand bg-brand/5 ring-2 ring-brand/30"
                  : "hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="role"
                value={role.value}
                checked={selected}
                onChange={() => setChosen(role.value)}
                className="sr-only"
              />
              <Icon
                className={cn(
                  "mt-0.5 size-5 shrink-0",
                  selected ? "text-brand" : "text-muted-foreground",
                )}
              />
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-medium">{role.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {role.blurb}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="space-y-3 text-center">
        <button
          type="submit"
          disabled={!chosen || pending}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Continue
        </button>
        <p className="text-xs text-muted-foreground">
          You can change this later, or add another. Nothing here is permanent.
        </p>
      </div>
    </form>
  );
}
