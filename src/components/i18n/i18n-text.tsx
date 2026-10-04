"use client";

import { useLanguage } from "@/components/i18n/language-provider";
import { translate } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

export function I18nText({
  textKey,
  secondary = false,
  className,
  secondaryClassName,
}: {
  textKey: string;
  secondary?: boolean;
  className?: string;
  secondaryClassName?: string;
}) {
  const { language, t } = useLanguage();
  if (language !== "en" || !secondary || textKey.startsWith("navigation.")) {
    return <span data-i18n-managed className={className}>{t(textKey)}</span>;
  }

  return (
    <span data-i18n-managed className={cn("inline-flex min-w-0 flex-col leading-tight", className)}>
      <span>{t(textKey)}</span>
      <span className={cn("text-[0.72em] font-normal text-muted-foreground", secondaryClassName)}>
        {translate("am", textKey)}
      </span>
    </span>
  );
}
