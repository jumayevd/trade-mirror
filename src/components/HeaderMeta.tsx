"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { DATA_VERSION } from "@/lib/dataset";

/** Slim header meta: data version + "How to interpret". Language switching lives in the filter bar. */
export default function HeaderMeta() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3.5">
      <span className="tabular hidden text-[10.5px] text-[rgba(32,30,29,0.55)] sm:inline"
        title={`${t("meta.dataVersion")}: ${DATA_VERSION}`}>
        {t("header.dataAsOf")} {DATA_VERSION}
      </span>
      <Link href="/methodology" className="text-[12px] font-extrabold text-[#ae1800] hover:underline">
        {t("header.howto")}
      </Link>
    </div>
  );
}
