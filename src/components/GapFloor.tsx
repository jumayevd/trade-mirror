"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { fmtUSD } from "@/lib/format";
import { parseAmount } from "@/lib/amount";

/**
 * Minimum-gap control for the ranked lists.
 *
 * The $100,000 floors that used to sit inside the engine are gone, and rightly:
 * at HS6 they removed three quarters of the lines both countries actually
 * reported. But the score that ranks what is left is scale-free — G ranks the
 * gap RATE and P counts persistence, neither of which looks at size — so a
 * channel trading a few thousand dollars can sit beside one trading hundreds of
 * millions. This puts that judgement where it belongs: with the reader, on the
 * screen, per view, rather than baked into the totals.
 *
 * It defaults to All, so nothing is hidden until someone chooses to narrow, and
 * it never moves a headline: the KPI band is computed from the pre-screen
 * channels, so raising the floor thins the list without restating the totals
 * above it.
 *
 * NOTE ON WHAT THIS IS NOT. The old engine floor tested each channel-YEAR
 * before the gap was computed, so a dropped year never contributed and a
 * channel built from many modest years did not exist at all. This tests the
 * finished total over every year both books reported. The two give different
 * counts on purpose — at HS6, 6,427 under the old rule against 12,773 here at
 * the same $100,000 — and no setting of this control reproduces the old number,
 * because the difference is the per-year floor rather than this threshold.
 */
const STEPS = [
  0, 1e4, 2.5e4, 5e4, 1e5, 2.5e5, 5e5, 1e6, 2.5e6, 5e6, 1e7, 2.5e7, 5e7, 1e8,
] as const;

const input =
  "h-[33px] w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1.5 text-[13px] tabular text-foreground outline-none focus:border-[var(--color-primary)]";
const select =
  "rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] h-[33px] px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-[var(--color-primary)]";

export default function GapFloor({
  value, onChange, shown, total,
}: {
  value: number;
  onChange: (v: number) => void;
  /** Rows surviving the floor, and the total before it — shown when both are given. */
  shown?: number;
  total?: number;
}) {
  const { t } = useI18n();
  const isPreset = (STEPS as readonly number[]).includes(value);
  /*
   * Both pieces of local state are derived rather than synchronised. A value
   * off the ladder can only have been typed, so it opens the field on its own —
   * which is what makes a shared ?min=370000 link land with its value visible.
   * `wantsCustom` only records the one thing the value cannot say: that the
   * reader opened the field while the filter still sits on a preset.
   */
  const [wantsCustom, setWantsCustom] = useState(false);
  const custom = wantsCustom || !isPreset;
  /*
   * null means "show the filter's own value". The draft exists only between a
   * keystroke and the commit, so a value arriving from elsewhere — the URL, a
   * reset, another control — is picked up without an effect to copy it across.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? (value ? String(value) : "");
  const box = useRef<HTMLInputElement>(null);

  const commit = () => {
    const parsed = draft == null ? null : parseAmount(draft);
    setDraft(null);
    if (parsed != null && parsed !== value) onChange(parsed);
  };

  return (
    <div className="flex flex-col gap-1" title={t("filter.minGap.tip")}>
      <span className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">
        {t("filter.minGap")}
      </span>
      <div className="flex items-center gap-2">
        <select
          className={select}
          aria-label={t("filter.minGap")}
          /* the select is a mode switch, so it keeps saying Custom while the
             field is open — snapping back to the preset the moment Custom was
             chosen read as the control refusing the choice */
          value={custom ? "custom" : String(value)}
          onChange={(e) => {
            if (e.target.value === "custom") {
              setWantsCustom(true);
              requestAnimationFrame(() => box.current?.focus());
              return;
            }
            setWantsCustom(false);
            setDraft(null);
            onChange(Number(e.target.value));
          }}
        >
          {STEPS.map((g) => (
            <option key={g} value={g}>
              {g === 0 ? t("filter.minGapAll") : `≥ ${fmtUSD(g)}`}
            </option>
          ))}
          <option value="custom">{t("filter.minGapCustom")}</option>
        </select>

        {custom && (
          <input
            ref={box}
            className={input}
            type="text"
            inputMode="decimal"
            aria-label={t("filter.minGapCustom")}
            placeholder={t("filter.minGapPlaceholder")}
            value={text}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "Escape") { setDraft(null); box.current?.blur(); }
            }}
          />
        )}

        {shown != null && total != null && shown !== total && (
          <span className="tabular text-[12px] whitespace-nowrap text-faint">
            {t("filter.minGapCount")
              .split("{shown}").join(shown.toLocaleString())
              .split("{total}").join(total.toLocaleString())}
          </span>
        )}
      </div>
    </div>
  );
}
