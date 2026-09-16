"use client";

import { useState, useTransition } from "react";
import { Ban, Flag, MoreVertical, ShieldOff } from "lucide-react";
import { toast } from "sonner";

import { useLanguage } from "@/components/i18n/language-provider";
import {
  blockUser,
  reportUser,
  unblockUser,
} from "@/app/(dashboard)/messages/block-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Block and report, on the conversation they are about.
 *
 * Both call an RPC that enforces the rule itself. Nothing here decides
 * anything: hiding the Block item from somebody who should not see it would be
 * a courtesy, and the reason blocking works is the policy in 0088 that refuses
 * the insert, not this menu.
 *
 * The blocked state comes from the server with the page rather than being
 * fetched here, and is held locally afterwards so the label flips the moment
 * it is pressed. A menu that says "Block" for another second after you blocked
 * somebody invites a second press, which would read as an error.
 */
export function ConversationMenu({
  otherUserId,
  initiallyBlocked,
}: {
  otherUserId: string;
  initiallyBlocked: boolean;
}) {
  const { t } = useLanguage();
  const [blocked, setBlocked] = useState(initiallyBlocked);
  const [, startTransition] = useTransition();

  function toggleBlock() {
    if (!blocked && !window.confirm(t("messages.blockConfirm"))) return;

    const next = !blocked;
    setBlocked(next);

    startTransition(async () => {
      const result = next
        ? await blockUser(otherUserId)
        : await unblockUser(otherUserId);

      if (result.error) {
        // Put back what the server refused, rather than leaving the menu
        // claiming a block that does not exist.
        setBlocked(!next);
        toast.error(result.error);
        return;
      }
      toast.success(
        next ? t("messages.blockDone") : t("messages.unblockDone"),
      );
    });
  }

  function report() {
    if (!window.confirm(t("messages.reportConfirm"))) return;

    startTransition(async () => {
      const result = await reportUser(otherUserId, "harassment");
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t("messages.reportDone"));
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("navigation.more")}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand"
      >
        <MoreVertical className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={toggleBlock}>
          {blocked ? (
            <>
              <ShieldOff className="size-4" /> {t("messages.unblock")}
            </>
          ) : (
            <>
              <Ban className="size-4" /> {t("messages.block")}
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={report}>
          <Flag className="size-4" /> {t("messages.report")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
