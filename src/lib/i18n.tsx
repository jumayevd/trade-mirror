"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { DICT, LANGS, type Lang, type LocaleKey } from "@/lib/locales";

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: LocaleKey) => string;
}

const Ctx = createContext<I18n | null>(null);

/* The language lives in localStorage, exposed to React as a tiny external
   store: the server snapshot is "en" and the client corrects on hydration.
   `override` keeps the UI switchable even where localStorage writes fail. */
let override: Lang | null = null;
let listeners: Array<() => void> = [];
const readLang = (): Lang => {
  if (override) return override;
  let saved: string | null = null;
  try { saved = localStorage.getItem("tm-lang"); } catch { /* ignore */ }
  return (LANGS as readonly string[]).includes(saved ?? "") ? (saved as Lang) : "en";
};
const writeLang = (l: Lang) => {
  override = l;
  try { localStorage.setItem("tm-lang", l); } catch { /* ignore */ }
  for (const fn of listeners) fn();
};
const subscribeLang = (fn: () => void) => {
  listeners.push(fn);
  return () => { listeners = listeners.filter((x) => x !== fn); };
};
const serverLang = (): Lang => "en";

export function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribeLang, readLang, serverLang);
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
