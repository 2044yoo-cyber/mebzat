"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteAccount } from "@/app/(dashboard)/settings/delete-account-actions";
import { I18nText } from "@/components/i18n/i18n-text";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * The one irreversible button on this page, kept on its own away from
 * everything else somebody might click by accident.
 *
 * Two confirmations, not one: opening the dialog is not agreeing to
 * anything, and the delete button inside it stays disabled until the
 * checkbox — which states plainly that this is permanent and what it takes
 * with it — is ticked on purpose. A single "Delete account" button with no
 * dialog at all is the shape of every accidental-deletion report this
 * pattern exists to avoid.
 */
export function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [pending, start] = useTransition();

  function confirm() {
    start(async () => {
      const result = await deleteAccount();
      // A successful call redirects and never returns here — reaching this
      // line at all means it did not, which is the failure path.
      if (result.error) {
        toast.error(result.error);
        setOpen(false);
        setUnderstood(false);
      }
    });
  }

  return (
    <section className="space-y-3 rounded-2xl border border-destructive/30 p-4 sm:p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-destructive">
          <I18nText textKey="legal.deleteAccount" />
        </h2>
        <p className="text-sm text-muted-foreground">
          <I18nText textKey="legal.deleteAccountWarning" />
        </p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button type="button" variant="destructive" />}>
          <Trash2 className="size-4" />
          <I18nText textKey="legal.deleteAccount" />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <I18nText textKey="legal.deleteAccount" />
            </DialogTitle>
            <DialogDescription>
              <I18nText textKey="legal.deleteAccountWarning" />
            </DialogDescription>
          </DialogHeader>

          {/* Files already uploaded — photos, documents, 360 frames — are not
              yet removed by this action, only the database records are. Said
              here rather than left for somebody to discover later: the same
              honesty the privacy policy's retention section promises. */}
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            Your profile, projects, listings, messages and other records are
            permanently deleted. Some previously uploaded files may take
            longer to be fully removed from storage.
          </p>

          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              checked={understood}
              onCheckedChange={(value) => setUnderstood(value === true)}
              className="mt-0.5"
            />
            <span>
              <I18nText textKey="legal.deleteAccountConfirm" />
            </span>
          </label>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!understood || pending}
              onClick={confirm}
            >
              {pending ? "Deleting…" : <I18nText textKey="legal.deleteAccountConfirm" />}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
