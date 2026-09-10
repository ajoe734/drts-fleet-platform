import type { ReactNode } from "react";
import {
  CanvasCard,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTheme,
} from "@drts/ui-web";
import type { HostVehicleCaseItem } from "@drts/contracts";
import { HOST_CASE_CATEGORY_LABEL, HOST_CASE_STATUS_TONE } from "@/app/host/lib/host-format";
import type { Locale } from "@/lib/translations";
import { trHost } from "@/app/host/translations";

// De-identified: reporter identity is never present on HostVehicleCaseItem
// (host-view.types.ts extractResolutionSummary strips it server-side) — this
// table only ever renders category/status/resolution summary, and has no
// reply/attachment affordance (Host has zero write scope by contract).
export function HostCasesTable({
  theme,
  locale,
  rows,
  footer,
}: {
  theme: CanvasTheme;
  locale: Locale;
  rows: HostVehicleCaseItem[];
  footer?: ReactNode;
}) {
  const columns: CanvasTableColumn<HostVehicleCaseItem>[] = [
    { h: "CASE", k: "caseId", w: 110, mono: true },
    {
      h: "CATEGORY",
      w: 100,
      r: (r) => (
        <CanvasPill theme={theme} tone="neutral">
          {HOST_CASE_CATEGORY_LABEL[r.category] ?? r.category}
        </CanvasPill>
      ),
    },
    {
      h: "STATUS",
      w: 120,
      r: (r) => (
        <CanvasPill theme={theme} tone={HOST_CASE_STATUS_TONE[r.status] ?? "neutral"} dot>
          {r.status}
        </CanvasPill>
      ),
    },
    { h: "REPORTED", k: "reportedAt", w: 110, mono: true },
    { h: "RESOLVED", w: 110, mono: true, r: (r) => r.resolvedAt ?? "—" },
    {
      h: "RESOLUTION · 結論摘要",
      w: 240,
      r: (r) =>
        r.resolutionSummary ?? (
          <span style={{ color: theme.textDim }}>
            {trHost("casesNoResolution", locale)}
          </span>
        ),
    },
  ];

  return (
    <CanvasCard
      theme={theme}
      title={trHost("casesCardTitle", locale)}
      subtitle="僅呈現案件分類與處理結論摘要；不揭露報案人身分，無回覆 / 附件入口（車主唯讀）"
      padding={0}
    >
      <CanvasTable theme={theme} columns={columns} rows={rows} />
      {footer}
    </CanvasCard>
  );
}
