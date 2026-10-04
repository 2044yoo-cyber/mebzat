"use client";

import { MessageSquarePlus } from "lucide-react";

import { useLanguage } from "@/components/i18n/language-provider";

/**
 * What an inbox with nothing in it says.
 *
 * A client component for one reason: translation in this codebase is
 * `useLanguage()`, a context hook, so a string that has to exist in Amharic and
 * Afaan Oromo cannot be written in a server component. The page around it stays
 * on the server, where the conversations are fetched.
 */
export function InboxEmpty() {
  const { t } = useLanguage();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <MessageSquarePlus className="size-10 text-muted-foreground" />
      <div className="space-y-1">
        <p className="font-medium">{t("messages.emptyTitle")}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          {t("messages.emptyBody")}
        </p>
      </div>
    </div>
  );
}
