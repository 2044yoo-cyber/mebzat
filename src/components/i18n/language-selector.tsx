"use client";

import { Globe2 } from "lucide-react";

import { useLanguage } from "@/components/i18n/language-provider";
import { LANGUAGES, type Language } from "@/lib/i18n/translations";

const NAMES: Record<Language, string> = {
  en: "English",
  am: "አማርኛ",
  om: "Afaan Oromo",
};

export function LanguageSelector() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <label className="relative flex h-8 min-w-0 items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
      <Globe2 className="pointer-events-none absolute left-2 size-4" aria-hidden />
      <span className="sr-only">{t("language.label")}</span>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
        aria-label={t("language.label")}
        className="h-8 max-w-24 cursor-pointer appearance-none bg-transparent pr-2 pl-7 text-xs outline-none sm:max-w-32 sm:text-sm"
      >
        {LANGUAGES.map((code) => (
          <option key={code} value={code} className="bg-background text-foreground">
            {NAMES[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
