import type { CSSProperties } from "react";
import type { TenantCostCenterRecord } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const codePrimaryStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatUpdated(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
}

function getActiveTone(activeFlag: boolean): CanvasTone {
  return activeFlag ? "success" : "neutral";
}

function getActiveLabel(activeFlag: boolean) {
  return activeFlag ? "active" : "disabled";
}

function compareCostCenters(
  a: TenantCostCenterRecord,
  b: TenantCostCenterRecord,
) {
  if (a.activeFlag !== b.activeFlag) {
    return a.activeFlag ? -1 : 1;
  }
  return a.code.localeCompare(b.code);
}

type CostCentersPageData = {
  costCenters: TenantCostCenterRecord[];
  errors: string[];
};

async function loadCostCentersData(): Promise<CostCentersPageData> {
  const client = getTenantClient();
  const errors: string[] = [];
  let costCenters: TenantCostCenterRecord[] = [];
  try {
    const result = await client.listCostCenters();
    costCenters = [...result].sort(compareCostCenters);
  } catch (error) {
    errors.push(`成本中心目錄: ${toErrorMessage(error)}`);
  }
  return { costCenters, errors };
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

type CostCenterRow = TenantCostCenterRecord & Record<string, unknown>;

export default async function CostCentersPage() {
  const { costCenters, errors } = await loadCostCentersData();

  const columns: CanvasTableColumn<CostCenterRow>[] = [
    {
      h: "CODE",
      k: "code",
      w: 140,
      mono: true,
      r: (row) => <span style={codePrimaryStyle}>{row.code}</span>,
    },
    {
      h: "NAME",
      k: "name",
      w: 200,
    },
    {
      h: "OWNER",
      k: "ownerName",
      w: 160,
      r: (row) => row.ownerName ?? "—",
    },
    {
      h: "STATE",
      w: 110,
      r: (row) => (
        <CanvasPill theme={th} tone={getActiveTone(row.activeFlag)} dot>
          {getActiveLabel(row.activeFlag)}
        </CanvasPill>
      ),
    },
    {
      h: "UPDATED",
      w: 160,
      mono: true,
      r: (row) => formatUpdated(row.updatedAt),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="成本中心目錄"
        subtitle="active · disabled — 配額分組與報表歸屬"
        actions={
          <CanvasBtn theme={th} variant="primary" icon="plus" size="sm">
            新增成本中心
          </CanvasBtn>
        }
      />

      <div style={pageBodyStyle}>
        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="無法載入完整目錄"
            body={errors.join(" · ")}
          />
        ) : null}

        <CanvasCard theme={th} padding={0}>
          {costCenters.length > 0 ? (
            <CanvasTable<CostCenterRow>
              theme={th}
              columns={columns}
              rows={costCenters as CostCenterRow[]}
            />
          ) : (
            <div
              style={{
                padding: 24,
                color: th.textMuted,
                fontSize: 12.5,
                textAlign: "center",
              }}
            >
              尚無成本中心，請新增第一個成本中心。
            </div>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
