import type { CSSProperties } from "react";
import type { TenantAddressRecord } from "@drts/contracts";
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
  display: "grid",
  gap: 16,
};

const nameCellStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const addressCellStyle: CSSProperties = {
  display: "inline-block",
  whiteSpace: "normal",
  lineHeight: 1.45,
  color: th.text,
};

const tagListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 4,
};

const mutedMonoStyle: CSSProperties = {
  color: th.textMuted,
  fontFamily: th.monoFamily,
};

const ownerAssignedStyle: CSSProperties = {
  color: th.text,
  fontFamily: th.monoFamily,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

type AddressesPageData = {
  addresses: TenantAddressRecord[];
  errors: string[];
};

type AddressTableRow = TenantAddressRecord & Record<string, unknown>;

function compareAddresses(a: TenantAddressRecord, b: TenantAddressRecord) {
  if (a.activeFlag !== b.activeFlag) {
    return a.activeFlag ? -1 : 1;
  }

  return a.addressName.localeCompare(b.addressName, "zh-Hant");
}

async function loadAddressesData(): Promise<AddressesPageData> {
  const client = getTenantClient();

  try {
    const addresses = (await client.listAddresses()) as TenantAddressRecord[];
    return {
      addresses: [...addresses].sort(compareAddresses),
      errors: [],
    };
  } catch (error) {
    return {
      addresses: [],
      errors: [error instanceof Error ? error.message : "未知地址簿讀取錯誤"],
    };
  }
}

function getVisibleAddress(row: TenantAddressRecord) {
  if (row.sensitiveFlag) {
    return row.maskedAddressText ?? row.addressText;
  }

  return row.addressText;
}

function getStateTone(activeFlag: boolean): CanvasTone {
  return activeFlag ? "success" : "neutral";
}

export default async function AddressesPage() {
  const { addresses, errors } = await loadAddressesData();

  const rows: AddressTableRow[] = addresses.map((row) => ({ ...row }));
  const columns: CanvasTableColumn<AddressTableRow>[] = [
    {
      h: "NAME",
      w: 160,
      r: (row) => <span style={nameCellStyle}>{row.addressName}</span>,
    },
    {
      h: "ADDRESS",
      r: (row) => (
        <span style={addressCellStyle}>{getVisibleAddress(row)}</span>
      ),
    },
    {
      h: "TAGS",
      w: 200,
      r: (row) =>
        row.tags.length > 0 ? (
          <div style={tagListStyle}>
            {row.tags.map((tag) => (
              <CanvasPill key={tag} theme={th} tone="info">
                {tag}
              </CanvasPill>
            ))}
          </div>
        ) : (
          <span style={mutedMonoStyle}>—</span>
        ),
    },
    {
      h: "OWNER",
      w: 100,
      mono: true,
      r: (row) =>
        row.ownerPassengerId ? (
          <span style={ownerAssignedStyle}>{row.ownerPassengerId}</span>
        ) : (
          <span style={mutedMonoStyle}>—</span>
        ),
    },
    {
      h: "STATE",
      w: 100,
      r: (row) => (
        <CanvasPill theme={th} tone={getStateTone(row.activeFlag)} dot>
          {row.activeFlag ? "active" : "disabled"}
        </CanvasPill>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="地址簿"
        subtitle="常用地點 · tag · 啟用"
        actions={
          <CanvasBtn theme={th} variant="primary" icon="plus">
            新增地址
          </CanvasBtn>
        }
      />

      <div style={pageBodyStyle}>
        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分地址資料無法載入"
            body={errors.join(" · ")}
          />
        ) : null}

        <CanvasCard theme={th} padding={0}>
          {rows.length > 0 ? (
            <CanvasTable<AddressTableRow>
              theme={th}
              columns={columns}
              rows={rows}
            />
          ) : (
            <div style={emptyStateStyle}>目前沒有任何地址資料。</div>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
