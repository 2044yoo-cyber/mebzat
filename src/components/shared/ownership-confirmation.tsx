"use client";

import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { I18nText } from "@/components/i18n/i18n-text";
import { cn } from "@/lib/utils";

/**
 * "I confirm that I own this content or have permission to upload and share
 * it." — posted as `ownershipConfirmed` whenever this is rendered inside the
 * form it belongs to.
 *
 * Only where publishing makes it somebody else's problem too: a public
 * listing, a portfolio piece, a 360 tour, a digital product. A private
 * project photo a member is keeping to themselves does not need it — the
 * brief is explicit that this must not interrupt an ordinary private upload,
 * and asking permission to look at your own kitchen is exactly that
 * interruption. Each caller decides whether the thing it is attached to is
 * one of the public kinds; this component does not guess.
 *
 * `required` on the checkbox does the enforcement — the surrounding
 * `<form>`'s submit is refused by the browser until it is ticked, which is
 * the same mechanism every other required field on these forms already uses,
 * so there is nothing new to test on the state-management side.
 */
export function OwnershipConfirmation({
  defaultChecked = false,
  className,
}: {
  defaultChecked?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-9 cursor-pointer items-start gap-2.5 text-sm",
        className,
      )}
    >
      <Checkbox
        id={id}
        name="ownershipConfirmed"
        required
        defaultChecked={defaultChecked}
        className="mt-0.5"
      />
      <span className="text-muted-foreground">
        <I18nText textKey="legal.uploadOwnership" />
      </span>
    </label>
  );
}
