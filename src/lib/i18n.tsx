"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { DICT, type Lang, type LocaleKey } from "@/lib/locales";
import { readLang, serverLang, subscribeLang, writeLang } from "@/lib/lang-store";
import { setLabelLang } from "@/lib/labels";

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: LocaleKey) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribeLang, readLang, serverLang);
  // Data-derived labels are translated inside plain functions with no access to
  // context, so the language is pushed to that layer here — before any consumer
  // renders, since the provider is their ancestor.
  setLabelLang(lang);
  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang: writeLang,
      t: (key) => DICT[lang][key] ?? DICT.en[key] ?? key,
    }),
    [lang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
