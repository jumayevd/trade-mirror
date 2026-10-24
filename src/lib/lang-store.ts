/**
 * The selected language, as a tiny external store.
 *
 * It lives outside React because two consumers need it: the I18nProvider, which
 * exposes it to components through `useSyncExternalStore`, and the label layer,
 * which translates data-derived text from deep inside plain functions that have
 * no access to a hook.
 */
import { LANGS, type Lang } from "@/lib/locales";

/** The dashboard is read in Uzbek first; English and Russian are one click away. */
export const DEFAULT_LANG: Lang = "uz";

let override: Lang | null = null;
let listeners: Array<() => void> = [];

export const readLang = (): Lang => {
  if (override) return override;
  let saved: string | null = null;
  try { saved = localStorage.getItem("tm-lang"); } catch { /* server, or storage denied */ }
  return (LANGS as readonly string[]).includes(saved ?? "") ? (saved as Lang) : DEFAULT_LANG;
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

/** Server render is in the default language; the client corrects after hydration. */
export const serverLang = (): Lang => DEFAULT_LANG;

/*
 * Pages are prerendered — figures included — in the default language, the one
 * the build can know. A reader who saved another would otherwise watch the main
 * area read in Uzbek until scripts load and switch it. This runs in the <head>
 * before first paint and, for them, keeps <main> hidden (globals.css,
 * html[data-prelang]) until I18nProvider has rendered in their language.
 */
export const LANG_BOOTSTRAP =
  `(function(){try{var l=localStorage.getItem("tm-lang");if(${LANGS.filter((l) => l !== DEFAULT_LANG).map((l) => `l===${JSON.stringify(l)}`).join("||")})document.documentElement.dataset.prelang=l;}catch(e){}})();`;
