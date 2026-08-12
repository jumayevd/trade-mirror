/**
 * The selected language, as a tiny external store.
 *
 * It lives outside React because two consumers need it: the I18nProvider, which
 * exposes it to components through `useSyncExternalStore`, and the label layer,
 * which translates data-derived text from deep inside plain functions that have
 * no access to a hook.
 */
import { LANGS, type Lang } from "@/lib/locales";

let override: Lang | null = null;
let listeners: Array<() => void> = [];

export const readLang = (): Lang => {
  if (override) return override;
  let saved: string | null = null;
  try { saved = localStorage.getItem("tm-lang"); } catch { /* server, or storage denied */ }
  return (LANGS as readonly string[]).includes(saved ?? "") ? (saved as Lang) : "en";
};

export const writeLang = (l: Lang) => {
  override = l;
  try { localStorage.setItem("tm-lang", l); } catch { /* storage denied */ }
  for (const fn of listeners) fn();
};

export const subscribeLang = (fn: () => void) => {
  listeners.push(fn);
  return () => { listeners = listeners.filter((x) => x !== fn); };
};

/** Server render is always English; the client corrects after hydration. */
export const serverLang = (): Lang => "en";
