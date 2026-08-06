"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DICT, type Lang, type LocaleKey } from "@/lib/locales";

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: LocaleKey) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? (localStorage.getItem("tm-lang") as Lang | null) : null;
    if (saved === "en" || saved === "ru") setLang(saved);
  }, []);
  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang: (l) => {
        setLang(l);
        try { localStorage.setItem("tm-lang", l); } catch { /* ignore */ }
      },
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
