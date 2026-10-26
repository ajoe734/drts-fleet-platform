"use client";

import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";

export function Pager({
  basePath,
  query,
  page,
  pageSize,
  total,
  locale: explicitLocale,
}: {
  basePath: string;
  query: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
  locale?: Locale;
}) {
  const { t } = useTranslation(explicitLocale);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value);
    }
    params.set("page", String(target));
    return `${basePath}?${params.toString()}`;
  };
  return (
    <p style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13 }}>
      <span>{t("common.pager.summary", { total, page, pages })}</span>
      {page > 1 ? <a href={href(page - 1)}>{t("common.pager.prev")}</a> : null}
      {page < pages ? (
        <a href={href(page + 1)}>{t("common.pager.next")}</a>
      ) : null}
    </p>
  );
}
