"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { SHOW_UNEXPLAINED } from "@/lib/flags";
import type { LocaleKey } from "@/lib/locales";

/*
 * Line icons on a 24-unit grid, drawn in the text colour and sized in em so
 * they follow the reader's text-size setting. One path each.
 */
const ICONS = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7l1-8z",
  trade: "M7 4 3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7",
  overview: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  gauge: "M4 18a9 9 0 1 1 16 0M12 14l4-5",
  analysis: "M3 3v18h18M7 15l4-4 3 3 6-6",
  orgs: "M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4",
  book: "M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z",
  globe: "M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9M12 3C9.5 5.6 8.2 8.6 8.2 12s1.3 6.4 3.8 9",
  box: "M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  alert: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
  search: "M4 11a7 7 0 1 0 14 0 7 7 0 1 0-14 0M21 21l-5-5",
  shield: "M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6zM9 12l2 2 4-4",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M5 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  chevron: "M9 6l6 6-6 6",
} as const;
type IconName = keyof typeof ICONS;

function Icon({ name, size = "size-[1.2em]", className = "" }: { name: IconName; size?: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round"
      strokeLinejoin="round" aria-hidden className={`${size} shrink-0 ${className}`}>
      <path d={ICONS[name]} />
    </svg>
  );
}

interface NavLink { href: string; label: LocaleKey; icon: IconName }
interface NavGroup { id: string; title: LocaleKey; icon: IconName; links: NavLink[] }

/**
 * The Mirror Trade navigation, as the CBU Analytics portal carries it: one
 * group that opens and closes. This standalone site is the portal's trade
 * section on its own — the same pages under the same /savdo/ addresses — so
 * the portal's front page, its Shadow Economy group and its sign-in are left
 * out. Links carry the trailing slash the static export serves them under.
 */
const GROUPS: NavGroup[] = [
  {
    id: "trade",
    title: "portal.trade",
    icon: "trade",
    links: [
      { href: "/savdo/", label: "nav.overview", icon: "overview" },
      { href: "/savdo/partners/", label: "nav.partners", icon: "globe" },
      { href: "/savdo/products/", label: "nav.products", icon: "box" },
      { href: "/savdo/risk/", label: "nav.queue", icon: "alert" },
      // still being worked on; see src/lib/flags.ts to switch it on locally
      ...(SHOW_UNEXPLAINED ? [{ href: "/savdo/unexplained/", label: "nav.anomaly" as LocaleKey, icon: "search" as IconName }] : []),
      { href: "/savdo/methodology/", label: "nav.methodology", icon: "book" },
      { href: "/savdo/quality/", label: "nav.quality", icon: "shield" },
    ],
  },
];

/** Section roots match only themselves; every other link also owns its subpages
 *  (a partner profile is under Countries, a region page under the overview). */
const SECTION_ROOT_CHILDREN: Record<string, string[]> = {
  "/savdo/": ["/savdo/channels"],
};

function useActive() {
  const raw = usePathname();
  const path = raw.endsWith("/") ? raw : `${raw}/`;
  return (href: string) => {
    if (href === "/") return path === "/";
    if (SECTION_ROOT_CHILDREN[href]) return path === href || SECTION_ROOT_CHILDREN[href].some((c) => path.startsWith(c));
    return path.startsWith(href);
  };
}

/**
 * Which groups are open. The group holding the current page opens by itself,
 * also after a move into it from another section; a click on a group's header
 * opens or closes it, and groups opened that way stay open across pages.
 */
function useOpenGroups(current: string | undefined) {
  const [state, setState] = useState(() => ({
    current,
    open: (current ? { [current]: true } : {}) as Record<string, boolean>,
  }));
  if (state.current !== current) {
    setState({ current, open: current ? { ...state.open, [current]: true } : state.open });
  }
  const toggle = useCallback(
    (id: string) => setState((s) => ({ ...s, open: { ...s.open, [id]: !s.open[id] } })),
    [],
  );
  return [state.open, toggle] as const;
}

const FOCUS = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-gold)]";
const ITEM_BOX = `relative flex items-center gap-2.5 rounded-md px-2.5 fs-13.5 transition-colors ${FOCUS}`;
const ITEM_OFF = "font-medium text-[rgba(255,255,255,0.7)] hover:bg-[rgba(255,255,255,0.06)] hover:text-white";
const ITEM_ON = "bg-[rgba(255,255,255,0.1)] font-semibold text-white";

/**
 * A link in the navigation. Inside a group the active marker sits on the
 * group's guide line, so the line itself points at the page you are on.
 */
function NavItem({ link, active, nested = false, onNavigate }: {
  link: NavLink; active: boolean; nested?: boolean; onNavigate?: () => void;
}) {
  const { t } = useI18n();
  return (
    <Link href={link.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
      className={`${ITEM_BOX} ${nested ? "py-[6px]" : "py-[7px]"} ${active ? ITEM_ON : ITEM_OFF}`}>
      {active && (
        <span aria-hidden className={`absolute inset-y-1.5 w-[3px] rounded-full bg-[var(--color-gold)] ${nested ? "-left-[10px]" : "left-0"}`} />
      )}
      <Icon name={link.icon} className={active ? "text-[var(--color-gold)]" : ""} />
      <span className="min-w-0">{t(link.label)}</span>
    </Link>
  );
}

/** The navigation itself — the desktop sidebar and the phone/tablet drawer share it. */
function NavPanel({ onNavigate, className = "" }: { onNavigate?: () => void; className?: string }) {
  const { t } = useI18n();
  const isActive = useActive();
  // the root address only forwards to /savdo/, so the trade group is the one shown open there too
  const activeGroup = GROUPS.find((g) => g.links.some((l) => isActive(l.href)))?.id ?? GROUPS[0].id;
  const [open, toggle] = useOpenGroups(activeGroup);
  return (
    <div className={`flex flex-col overflow-y-auto px-2.5 py-5 text-white ${className}`}>
      <Link href="/" onClick={onNavigate} className={`mb-6 flex items-center gap-2.5 rounded-md px-2.5 ${FOCUS}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cbu-logo.png" alt="Central Bank of the Republic of Uzbekistan" className="h-10 w-10 shrink-0 object-contain" />
        <span className="leading-tight">
          <span className="block fs-15 font-semibold tracking-tight text-white">{t("portal.title")}</span>
          <span className="block fs-11.5 text-[rgba(255,255,255,0.55)]">{t("portal.tagline")}</span>
        </span>
      </Link>

      <nav aria-label={t("nav.aria.main")}>
        {GROUPS.map((g) => {
          const isOpen = !!open[g.id];
          const here = g.id === activeGroup;
          return (
            <div key={g.id} className="mt-3">
              {/* a long title wraps; icon and chevron stay level with its first line */}
              <button type="button" onClick={() => toggle(g.id)} aria-expanded={isOpen} aria-controls={`nav-${g.id}`}
                className={`flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left fs-13 font-semibold leading-snug transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-white ${FOCUS} ${here ? "text-white" : "text-[rgba(255,255,255,0.75)]"}`}>
                <Icon name={g.icon} className={`mt-[0.1em] ${here ? "text-[var(--color-gold)]" : ""}`} />
                <span className="min-w-0 flex-1">{t(g.title)}</span>
                <Icon name="chevron" size="size-[1em]"
                  className={`mt-[0.15em] text-[rgba(255,255,255,0.45)] transition-transform duration-200 motion-reduce:transition-none ${isOpen ? "rotate-90" : ""}`} />
              </button>
              {/* rows 0fr → 1fr animates the height without measuring it; inert
                  keeps the hidden links out of the tab order */}
              <div id={`nav-${g.id}`} inert={!isOpen}
                className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="min-h-0 overflow-hidden">
                  {/* the guide line runs under the group's icon */}
                  <ul className="ml-[17px] space-y-0.5 border-l border-[rgba(255,255,255,0.14)] py-1 pl-2">
                    {g.links.map((l) => (
                      <li key={l.href}>
                        <NavItem link={l} active={isActive(l.href)} nested onNavigate={onNavigate} />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * Phones and tablets: a menu button, the current page beside it, and the full
 * navigation in a drawer — a strip of a dozen links scrolled sideways hid most
 * of them and never said which section a page belonged to.
 */
export function MobileNav() {
  const { t } = useI18n();
  const isActive = useActive();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const current = [...GROUPS].reverse()
    .flatMap((g) => g.links.map((l) => ({ ...l, group: g.title as LocaleKey | undefined })))
    .find((l) => isActive(l.href));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    // the page behind the drawer must not scroll with it
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  return (
    <div className="flex min-w-0 items-center gap-2 lg:hidden">
      <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="mobile-nav"
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--color-navy)] px-2.5 py-1.5 fs-13 font-semibold text-white">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        {t("nav.menu")}
      </button>
      {current && (
        <span className="min-w-0 truncate fs-13 text-muted">
          {current.group && <span className="text-faint">{t(current.group)} · </span>}
          <span className="font-semibold text-foreground">{t(current.label)}</span>
        </span>
      )}
      {/* portalled to <body>: the sticky header's backdrop-filter makes it the
          containing block for fixed children, which clipped the drawer to the
          header's height */}
      {open && createPortal(
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t("nav.aria.main")}>
          <button type="button" aria-label={t("nav.close")} onClick={close} className="absolute inset-0 bg-[rgba(8,15,30,0.45)]" />
          <div id="mobile-nav" className="absolute inset-y-0 left-0 flex w-[min(18rem,86vw)] flex-col bg-[var(--color-navy)] shadow-2xl">
            <button type="button" onClick={close} aria-label={t("nav.close")}
              className="absolute right-2 top-2 z-10 rounded-md px-2 py-1 fs-18 leading-none text-[rgba(255,255,255,0.7)] hover:text-white">×</button>
            <NavPanel onNavigate={close} className="h-full" />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default function Sidebar() {
  return (
    <aside className="no-print hidden w-[236px] shrink-0 bg-[var(--color-navy)] lg:block 2xl:w-[256px]">
      <NavPanel className="h-viewport sticky top-0" />
    </aside>
  );
}
