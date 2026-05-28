import type { ReactNode } from "react";
import Link from "next/link";
import type {
  PartnerChannelEntryRecord,
  UiHealthEnvelope,
  UiRefreshMetadata,
  VehicleContractRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import {
  DataCellStack,
  DataViewCard,
  PageHeader,
  StatusChip,
} from "@drts/ui-web";

type ContractDetailPageProps = {
  params: Promise<{ contractId: string }>;
};

type LoadResult =
  | {
      status: "ok";
      contract: VehicleContractRecord;
      partnerName: string | null;
      refresh: UiRefreshMetadata | null;
      health: UiHealthEnvelope | null;
    }
  | { status: "not_found" }
  | { status: "fetch_failed"; message: string };

const PLATFORM_ADMIN_BASE_URL = "https://platform-admin.drts.io";

function copy(locale: "en" | "zh", en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function formatDateTime(value: string | null | undefined, locale: "en" | "zh") {
  if (!value) return copy(locale, "Not available", "無資料");
  return new Date(value).toLocaleString(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatDateRange(
  locale: "en" | "zh",
  startAt: string,
  endAt: string | null | undefined,
) {
  return `${formatDateTime(startAt, locale)} -> ${formatDateTime(endAt, locale)}`;
}

function statusTone(status: VehicleContractRecord["status"]) {
  if (status === "active") return "success" as const;
  if (status === "terminated") return "danger" as const;
  return "warning" as const;
}

function cardStyle() {
  return { display: "grid", gap: "12px" } as const;
}

function labelStyle() {
  return {
    fontSize: "12px",
    color: "#64748b",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    fontWeight: 700,
  };
}

function valueStyle() {
  return { fontSize: "14px", color: "#0f172a", lineHeight: 1.6 } as const;
}

async function loadContractDetail(contractId: string): Promise<LoadResult> {
  try {
    const client = await getServerOpsClient();
    const [contracts, partnerEntries] = await Promise.all([
      client.listContracts(),
      client
        .listPartnerEntries()
        .catch(() => [] as PartnerChannelEntryRecord[]),
    ]);

    const contract = contracts.find((entry) => entry.contractId === contractId);
    if (!contract) {
      return { status: "not_found" };
    }

    const partnerName =
      partnerEntries.find((entry) => entry.entrySlug === contract.partnerId)
        ?.displayName ?? null;

    return {
      status: "ok",
      contract,
      partnerName,
      refresh: null,
      health: null,
    };
  } catch (error) {
    return {
      status: "fetch_failed",
      message:
        error instanceof Error
          ? error.message
          : "Unable to load contract detail",
    };
  }
}

export default async function ContractDetailPage({
  params,
}: ContractDetailPageProps) {
  const [{ contractId }, locale] = await Promise.all([
    params,
    getServerLocale(),
  ]);
  const result = await loadContractDetail(contractId);

  if (result.status === "not_found") {
    return (
      <>
        <PageHeader
          title={copy(locale, "Contract detail", "合約詳情")}
          subtitle={contractId}
        />
        <DataViewCard
          title={copy(locale, "Contract not available", "目前無法取得合約")}
          subtitle={copy(
            locale,
            "The contract is not visible in the current ops registry snapshot.",
            "這筆合約尚未出現在目前營運可見的 registry snapshot。",
          )}
          tone="warning"
          density="compact"
        >
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link href="/contracts">
              {copy(locale, "Back to contracts", "返回合約列表")}
            </Link>
          </div>
        </DataViewCard>
      </>
    );
  }

  if (result.status === "fetch_failed") {
    return (
      <>
        <PageHeader
          title={copy(locale, "Contract detail", "合約詳情")}
          subtitle={contractId}
        />
        <DataViewCard
          title={copy(
            locale,
            "Contract detail unavailable",
            "合約詳情暫時無法取得",
          )}
          subtitle={result.message}
          tone="danger"
          density="compact"
        >
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link href="/contracts">
              {copy(locale, "Back to contracts", "返回合約列表")}
            </Link>
          </div>
        </DataViewCard>
      </>
    );
  }

  const { contract, partnerName } = result;
  const ownerHref = `${PLATFORM_ADMIN_BASE_URL}/partners/${encodeURIComponent(contract.partnerId)}`;

  return (
    <>
      <PageHeader
        title={copy(locale, "Contract detail", "合約詳情")}
        subtitle={`${contract.contractId} · ${copy(
          locale,
          "ops read-only detail",
          "營運唯讀視圖",
        )}`}
      />

      <div style={{ display: "grid", gap: "16px" }}>
        <DataViewCard
          title={copy(locale, "Authority guardrail", "權限護欄")}
          subtitle={copy(
            locale,
            "Ops can review the contract here, but all mutations stay in the owner app.",
            "營運可在此查閱合約，但所有異動仍必須回 owner app。",
          )}
          tone="info"
          density="compact"
        >
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link href="/contracts">
              {copy(locale, "Back to contracts", "返回合約列表")}
            </Link>
            <Link href={`/vehicles/${encodeURIComponent(contract.vehicleId)}`}>
              {copy(locale, "Open vehicle detail", "查看車輛詳情")}
            </Link>
            <Link href={ownerHref} target="_blank" rel="noreferrer">
              {copy(locale, "Open owner app", "打開 owner app")}
            </Link>
          </div>
        </DataViewCard>

        <div
          style={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns: "minmax(0, 1.45fr) minmax(280px, 0.85fr)",
          }}
        >
          <DataViewCard
            title={copy(locale, "Registry snapshot", "合約主檔快照")}
            subtitle={copy(
              locale,
              "Detail derived from the current listContracts() envelope.",
              "目前 detail 由 listContracts() envelope 組成。",
            )}
            tone="neutral"
            density="compact"
          >
            <div style={cardStyle()}>
              <DetailRow
                label={copy(locale, "Status", "狀態")}
                value={
                  <StatusChip
                    tone={statusTone(contract.status)}
                    authorityLabel={copy(locale, "contract", "合約")}
                    label={formatOpsCodeLabel(locale, contract.status)}
                  />
                }
              />
              <DetailRow
                label={copy(locale, "Lifecycle", "Lifecycle")}
                value={formatOpsCodeLabel(locale, contract.lifecycleStatus)}
              />
              <DetailRow
                label={copy(locale, "Contract type", "合約類型")}
                value={contract.contractType}
              />
              <DetailRow
                label={copy(locale, "Service scope", "服務範圍")}
                value={contract.serviceScope}
              />
              <DetailRow
                label={copy(locale, "Operating area", "營運區域")}
                value={
                  contract.operatingAreaId ?? copy(locale, "Not set", "未設定")
                }
              />
              <DetailRow
                label={copy(locale, "Active range", "有效期間")}
                value={formatDateRange(
                  locale,
                  contract.startAt,
                  contract.endAt,
                )}
              />
              <DetailRow
                label={copy(locale, "Approved by", "核准者")}
                value={
                  contract.approvedBy ?? copy(locale, "Not available", "無資料")
                }
              />
              <DetailRow
                label={copy(locale, "Approved at", "核准時間")}
                value={formatDateTime(contract.approvedAt, locale)}
              />
              <DetailRow
                label={copy(locale, "Created", "建立時間")}
                value={formatDateTime(contract.createdAt, locale)}
              />
              <DetailRow
                label={copy(locale, "Updated", "最後更新")}
                value={formatDateTime(contract.updatedAt, locale)}
              />
            </div>
          </DataViewCard>

          <DataViewCard
            title={copy(locale, "Operational linkage", "營運關聯")}
            subtitle={copy(
              locale,
              "Cross-links that an ops reviewer can follow without mutating the contract.",
              "營運 reviewer 可沿著這些 deep links 追查，但不能在此修改合約。",
            )}
            tone="info"
            density="compact"
          >
            <div style={cardStyle()}>
              <DetailRow
                label={copy(locale, "Vehicle", "車輛")}
                value={
                  <Link
                    href={`/vehicles/${encodeURIComponent(contract.vehicleId)}`}
                  >
                    {contract.vehicleId}
                  </Link>
                }
              />
              <DetailRow
                label={copy(locale, "Partner", "Partner")}
                value={
                  <DataCellStack
                    primary={partnerName ?? contract.partnerId}
                    secondary={contract.partnerId}
                  />
                }
              />
              <DetailRow
                label={copy(locale, "Owner app route", "Owner app route")}
                value={
                  <Link href={ownerHref} target="_blank" rel="noreferrer">
                    {ownerHref}
                  </Link>
                }
              />
              <DetailRow
                label={copy(locale, "Ops note", "營運備註")}
                value={copy(
                  locale,
                  "The canonical contract detail envelope is not published in the current repo contracts package, so this page intentionally reuses the listContracts() registry snapshot.",
                  "目前 repo contracts package 尚未發布專用 contract detail envelope，所以此頁刻意沿用 listContracts() registry snapshot。",
                )}
              />
            </div>
          </DataViewCard>
        </div>
      </div>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: "4px" }}>
      <div style={labelStyle()}>{label}</div>
      <div style={valueStyle()}>{value}</div>
    </div>
  );
}
