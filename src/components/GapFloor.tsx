"use client";

import { Segmented } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { fmtUSD } from "@/lib/format";

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
 * The ladder matches the one the unexplained-discrepancy section already uses,
 * so the same thresholds mean the same thing in both places.
 */
export const GAP_STEPS = [0, 1e5, 1e6, 1e7] as const;

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
  return (
    <div className="flex flex-col gap-1" title={t("filter.minGap.tip")}>
      <span className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">
        {t("filter.minGap")}
      </span>
      <div className="flex items-center gap-2">
        <Segmented
          value={String(value)}
          ariaLabel={t("filter.minGap")}
          onChange={(v) => onChange(Number(v))}
          options={GAP_STEPS.map((g) => ({
            key: String(g),
            label: g === 0 ? t("filter.minGapAll") : `≥ ${fmtUSD(g)}`,
          }))}
        />
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
