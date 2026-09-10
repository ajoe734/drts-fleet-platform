// Pagination footer for Host list panels. Local composition (mirrors
// fleet-host.jsx's HostPageFooter) binding the real ApiListData.pageInfo
// shape returned by the typed client — no shared Pagination primitive exists
// anywhere in this app yet. Prev/Next are real `next/link` navigation (not
// the static-canvas disabled Btn), since this is the live product, not a
// design gallery: functioning drill-down is part of the task's acceptance
// bar ("長清單...篩選与下鑽保留自車scope").

import Link from "next/link";
import type { CanvasTheme } from "@drts/ui-web";
import type { ApiListData } from "@drts/contracts";

function buildHref(basePath: string, params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  if (page <= 1) {
    next.delete("page");
  } else {
    next.set("page", String(page));
  }
  const qs = next.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function HostPageFooter<T>({
  theme,
  pageInfo,
  basePath,
  extraParams,
}: {
  theme: CanvasTheme;
  pageInfo: ApiListData<T>["pageInfo"];
  basePath: string;
  extraParams?: Record<string, string | undefined>;
}) {
  const { page, totalPages, totalItems } = pageInfo;
  const params = new URLSearchParams();
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value) params.set(key, value);
    }
  }

  const navLinkStyle = {
    fontSize: 11.5,
    fontWeight: 600,
    textDecoration: "none",
    padding: "4px 9px",
    borderRadius: 6,
    border: `1px solid ${theme.border}`,
  } as const;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        borderTop: `1px solid ${theme.border}`,
        fontSize: 11.5,
        color: theme.textMuted,
      }}
    >
      <span>
        {totalItems} 筆 · 第 {page} / {Math.max(totalPages, 1)} 頁
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        {page <= 1 ? (
          <span style={{ ...navLinkStyle, color: theme.textDim }}>
            上一頁
          </span>
        ) : (
          <Link
            href={buildHref(basePath, params, page - 1)}
            style={{ ...navLinkStyle, color: theme.text }}
          >
            上一頁
          </Link>
        )}
        {page >= totalPages ? (
          <span style={{ ...navLinkStyle, color: theme.textDim }}>
            下一頁
          </span>
        ) : (
          <Link
            href={buildHref(basePath, params, page + 1)}
            style={{ ...navLinkStyle, color: theme.text }}
          >
            下一頁
          </Link>
        )}
      </div>
    </div>
  );
}
