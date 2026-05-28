import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import type {
  CrossAppResourceLink,
  PartnerChannelEntryRecord,
  RefreshTier,
  UiRefreshMetadata,
  VehicleContractRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { DataViewCard, PageHeader, StatCard, StatusChip } from "@drts/ui-web";

type ContractDetailPageProps = {
  params: Promise<{
    contractId: string;
  }>;
};

type RuntimePartnerChannelEntryRecord = PartnerChannelEntryRecord & {
  ownerLinks?: CrossAppResourceLink[];
};

const REFRESH_TIER: RefreshTier = "medium";
const REFRESH_TIER_MS = 15_000;

const gridStyle: CSSProperties = {
  display: "grid",
  gap: "18px",
};

function copyText(locale: "en" | "zh", en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function buttonStyle({
  emphasis = "secondary",
}: {
  emphasis?: "primary" | "secondary" | "ghost";
}) {
  const styles =
    emphasis === "primary"
      ? {
          border: "1px solid #dc2626",
          background: "#dc2626",
          color: "#ffffff",
        }
      : emphasis === "ghost"
        ? {
            border: "1px solid transparent",
            background: "transparent",
            color: "#475569",
          }
        : {
            border: "1px solid #fecaca",
            background: "#fff7f7",
            color: "#b91c1c",
          };

  return {
    ...styles,
    borderRadius: "999px",
    padding: "8px 12px",
    fontSize: "12px",
    fontWeight: 600,
    lineHeight: 1.2,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: "nowrap" as const,
  };
}

function cardSurfaceStyle(tone: "neutral" | "warn" | "danger" | "info") {
  switch (tone) {
    case "warn":
      return {
        background: "#fff7ed",
        border: "1px solid #fdba74",
        color: "#9a3412",
      };
    case "danger":
      return {
        background: "#fef2f2",
        border: "1px solid #fca5a5",
        color: "#b91c1c",
      };
    case "info":
      return {
        background: "#eff6ff",
        border: "1px solid #93c5fd",
        color: "#1d4ed8",
      };
    default:
      return {
        background: "#f8fafc",
        border: "1px solid #cbd5e1",
        color: "#334155",
      };
  }
}

function buildCrossAppUrl(link: CrossAppResourceLink) {
  const baseByApp = {
    "platform-admin":
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3001",
    "tenant-console":
      process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ?? "http://localhost:3002",
    "ops-console":
      process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003",
  } as const;

  const appKey = link.targetApp as keyof typeof baseByApp;
  return `${baseByApp[appKey]}${link.route}`;
}

function formatDate(value: string | null, locale: "en" | "zh") {
  if (!value) return t("common.dash", locale);
  return new Date(value).toLocaleDateString(
    locale === "zh" ? "zh-TW" : "en-US",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    },
  );
}

function formatDateTime(value: string | null, locale: "en" | "zh") {
  if (!value) return t("common.dash", locale);
  return new Date(value).toLocaleString(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function daysUntil(value: string) {
  const diff = new Date(value).getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function buildRefreshMetadata(updatedAt: string | null): UiRefreshMetadata {
  const generatedAt = updatedAt ?? new Date().toISOString();
  const ageMs = Date.now() - new Date(generatedAt).getTime();
  return {
    generatedAt,
    staleAfterMs: REFRESH_TIER_MS,
    dataFreshness: updatedAt
      ? ageMs > REFRESH_TIER_MS
        ? "stale"
        : "fresh"
      : "unknown",
    source: "live",
  };
}

function describeFreshness(metadata: UiRefreshMetadata, locale: "en" | "zh") {
  if (metadata.dataFreshness === "fresh") {
    return copyText(
      locale,
      "Live snapshot within T3 cadence (15s).",
      "目前為 T3（15 秒）即時快照。",
    );
  }
  if (metadata.dataFreshness === "stale") {
    return copyText(
      locale,
      "Snapshot is stale. Refresh before confirming contract terms.",
      "資料已過舊，確認合約條款前請先重新整理。",
    );
  }
  return copyText(
    locale,
    "Freshness could not be confirmed.",
    "無法確認這份資料的新鮮度。",
  );
}

export default async function ContractDetailPage({
  params,
}: ContractDetailPageProps) {
  const { contractId } = await params;
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);

  let contracts: VehicleContractRecord[];
  try {
    contracts = await client.listContracts();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : t("common.unknown", locale);
    return (
      <>
        <PageHeader
          eyebrow={copyText(locale, "Registry", "主資料")}
          title={copyText(locale, "Contract detail", "合約詳情")}
          subtitle={copyText(
            locale,
            "Contract registry is temporarily unavailable.",
            "合約資料暫時無法讀取。",
          )}
        />
        <div
          style={{
            ...cardSurfaceStyle("danger"),
            borderRadius: "16px",
            padding: "18px",
            display: "grid",
            gap: "10px",
          }}
        >
          <strong>{copyText(locale, "Load failed", "載入失敗")}</strong>
          <div style={{ fontSize: "13px", lineHeight: 1.6 }}>{message}</div>
          <div>
            <Link
              href="/contracts"
              style={buttonStyle({ emphasis: "secondary" })}
            >
              {copyText(locale, "Back to contracts", "返回合約清單")}
            </Link>
          </div>
        </div>
      </>
    );
  }

  const contract = contracts.find((item) => item.contractId === contractId);
  if (!contract) {
    notFound();
  }

  let partnerEntries: RuntimePartnerChannelEntryRecord[] = [];
  let partnerEntriesError: string | null = null;
  try {
    partnerEntries =
      (await client.listPartnerEntries()) as RuntimePartnerChannelEntryRecord[];
  } catch (error) {
    partnerEntriesError =
      error instanceof Error ? error.message : t("common.unknown", locale);
  }

  const linkedEntries = partnerEntries.filter(
    (entry) => entry.partnerId === contract.partnerId,
  );
  const primaryEntry = linkedEntries[0] ?? null;
  const ownerLinks: CrossAppResourceLink[] = primaryEntry
    ? [
        {
          targetApp: "platform-admin",
          route: `/partners/${encodeURIComponent(primaryEntry.entrySlug)}`,
          resourceType: "partner_entry",
          resourceId: primaryEntry.entrySlug,
          openMode: "new_tab",
          label: copyText(locale, "Partner relation", "合作夥伴關聯"),
        },
        ...(primaryEntry.tenantId
          ? [
              {
                targetApp: "tenant-console",
                route: `/tenants/${encodeURIComponent(primaryEntry.tenantId)}`,
                resourceType: "tenant",
                resourceId: primaryEntry.tenantId,
                openMode: "new_tab",
                label: copyText(
                  locale,
                  "Tenant contract context",
                  "Tenant 合約上下文",
                ),
              } satisfies CrossAppResourceLink,
            ]
          : []),
      ]
    : [];
  const expiringSoon =
    contract.status === "active" &&
    daysUntil(contract.endAt) <= 45 &&
    daysUntil(contract.endAt) >= 0;
  const refreshMetadata = buildRefreshMetadata(
    [contract.updatedAt, primaryEntry?.updatedAt ?? null]
      .filter((value): value is string => value !== null)
      .sort((left, right) => right.localeCompare(left))[0] ?? null,
  );

  return (
    <>
      <PageHeader
        eyebrow={copyText(locale, "Registry", "主資料")}
        title={copyText(locale, "Contract detail", "合約詳情")}
        subtitle={copyText(
          locale,
          `Read-only ops detail for ${contract.contractId}.`,
          `${contract.contractId} 的 ops 唯讀詳情。`,
        )}
        actions={
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Link href="/contracts" style={buttonStyle({ emphasis: "ghost" })}>
              {copyText(locale, "Back to list", "返回清單")}
            </Link>
            {ownerLinks.map((link) => (
              <a
                key={`${link.targetApp}-${link.resourceId}`}
                href={buildCrossAppUrl(link)}
                target="_blank"
                rel="noreferrer"
                style={buttonStyle({ emphasis: "secondary" })}
              >
                {link.label}
                <span
                  style={{ marginLeft: "6px", fontSize: "11px", opacity: 0.8 }}
                >
                  {copyText(locale, "new tab", "新分頁")}
                </span>
              </a>
            ))}
          </div>
        }
      />

      <div
        style={{
          ...cardSurfaceStyle(
            refreshMetadata.dataFreshness === "stale" ? "warn" : "info",
          ),
          borderRadius: "16px",
          padding: "16px 18px",
          marginBottom: "18px",
          display: "grid",
          gap: "6px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <strong>
            {copyText(
              locale,
              `Refresh tier ${REFRESH_TIER.toUpperCase()} · 15s`,
              `Refresh tier ${REFRESH_TIER.toUpperCase()} · 15 秒`,
            )}
          </strong>
          <div style={{ fontSize: "12.5px" }}>
            {copyText(locale, "Generated at", "生成時間")}{" "}
            {formatDateTime(refreshMetadata.generatedAt, locale)}
          </div>
        </div>
        <div style={{ fontSize: "13px", lineHeight: 1.55 }}>
          {describeFreshness(refreshMetadata, locale)}
        </div>
      </div>

      {partnerEntriesError ? (
        <div
          style={{
            ...cardSurfaceStyle("warn"),
            borderRadius: "14px",
            padding: "14px 16px",
            marginBottom: "18px",
            display: "grid",
            gap: "6px",
            fontSize: "13px",
            lineHeight: 1.6,
          }}
        >
          <strong>
            {copyText(
              locale,
              "Partner relation context is degraded",
              "合作夥伴關聯上下文目前降級",
            )}
          </strong>
          <div>{partnerEntriesError}</div>
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "12px",
          marginBottom: "18px",
        }}
      >
        <StatCard
          label={copyText(locale, "Contract status", "合約狀態")}
          value={formatOpsCodeLabel(locale, contract.status)}
          sub={formatOpsCodeLabel(locale, contract.lifecycleStatus)}
          accent="#dc2626"
        />
        <StatCard
          label={copyText(locale, "Effective window", "合約效期")}
          value={`${formatDate(contract.startAt, locale)} → ${formatDate(contract.endAt, locale)}`}
          sub={
            expiringSoon
              ? copyText(locale, "Expiring within 45 days", "45 天內到期")
              : copyText(
                  locale,
                  "No immediate expiry alert",
                  "目前沒有到期警示",
                )
          }
          accent={expiringSoon ? "#ea580c" : "#2563eb"}
        />
        <StatCard
          label={copyText(locale, "Vehicle", "車輛")}
          value={contract.vehicleId}
          sub={contract.operatingAreaId ?? t("common.dash", locale)}
          accent="#2563eb"
        />
        <StatCard
          label={copyText(locale, "Partner", "合作夥伴")}
          value={contract.partnerId}
          sub={formatOpsCodeLabel(locale, contract.partnerType)}
          accent="#b45309"
        />
      </div>

      <div style={gridStyle}>
        <DataViewCard
          title={copyText(locale, "Contract terms", "合約條款")}
          subtitle={copyText(
            locale,
            "Must-show ops context for dispatch and billing confirmation.",
            "派遣與結算確認所需的合約上下文。",
          )}
          tone="info"
          density="compact"
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
            }}
          >
            <div style={{ display: "grid", gap: "6px" }}>
              <strong>{copyText(locale, "Contract ID", "合約 ID")}</strong>
              <span>{contract.contractId}</span>
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              <strong>{copyText(locale, "Contract type", "合約類型")}</strong>
              <span>{formatOpsCodeLabel(locale, contract.contractType)}</span>
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              <strong>{copyText(locale, "Service scope", "服務範圍")}</strong>
              <span>{contract.serviceScope}</span>
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              <strong>{copyText(locale, "Approval", "核准資訊")}</strong>
              <span>
                {contract.approvedBy
                  ? `${contract.approvedBy} · ${formatDateTime(contract.approvedAt, locale)}`
                  : t("common.dash", locale)}
              </span>
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              <strong>{copyText(locale, "Created", "建立時間")}</strong>
              <span>{formatDateTime(contract.createdAt, locale)}</span>
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              <strong>{copyText(locale, "Last updated", "最後更新")}</strong>
              <span>{formatDateTime(contract.updatedAt, locale)}</span>
            </div>
          </div>
        </DataViewCard>

        <DataViewCard
          title={copyText(locale, "Relationship snapshot", "合作關係快照")}
          subtitle={copyText(
            locale,
            "Partner program and eligibility context that affect ops decisions.",
            "會影響 ops 判斷的 partner program 與 eligibility 上下文。",
          )}
          tone="warning"
          density="compact"
        >
          {primaryEntry ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "12px",
              }}
            >
              <div style={{ display: "grid", gap: "6px" }}>
                <strong>{copyText(locale, "Display name", "顯示名稱")}</strong>
                <span>{primaryEntry.displayName}</span>
              </div>
              <div style={{ display: "grid", gap: "6px" }}>
                <strong>{copyText(locale, "Entry slug", "入口 slug")}</strong>
                <span>{primaryEntry.entrySlug}</span>
              </div>
              <div style={{ display: "grid", gap: "6px" }}>
                <strong>{copyText(locale, "Program", "方案")}</strong>
                <span>{primaryEntry.programId}</span>
              </div>
              <div style={{ display: "grid", gap: "6px" }}>
                <strong>
                  {copyText(locale, "Eligibility mode", "資格模式")}
                </strong>
                <span>
                  {formatOpsCodeLabel(locale, primaryEntry.eligibilityMode)}
                </span>
              </div>
              <div style={{ display: "grid", gap: "6px" }}>
                <strong>
                  {copyText(locale, "Relation status", "關聯狀態")}
                </strong>
                <div>
                  <StatusChip
                    tone={primaryEntry.activeFlag ? "success" : "warning"}
                    authorityLabel={copyText(locale, "relation", "關聯")}
                    label={formatOpsCodeLabel(locale, primaryEntry.status)}
                  />
                </div>
              </div>
              <div style={{ display: "grid", gap: "6px" }}>
                <strong>{copyText(locale, "Tenant", "Tenant")}</strong>
                <span>{primaryEntry.tenantId || t("common.dash", locale)}</span>
              </div>
            </div>
          ) : (
            <div
              style={{
                ...cardSurfaceStyle("neutral"),
                borderRadius: "14px",
                padding: "16px",
                fontSize: "13px",
                lineHeight: 1.6,
              }}
            >
              {copyText(
                locale,
                "No linked partner relation record was returned for this contract.",
                "目前沒有回傳與此合約相連的合作夥伴關聯記錄。",
              )}
            </div>
          )}
        </DataViewCard>

        <DataViewCard
          title={copyText(locale, "Ops scope", "營運端範圍")}
          subtitle={copyText(
            locale,
            "Ops can confirm terms here, but owner-app mutation stays outside this route.",
            "營運端可在此確認條款，但 owner app 的 mutation 不在這條 route 內執行。",
          )}
          tone="neutral"
          density="compact"
        >
          <div
            style={{
              ...cardSurfaceStyle("neutral"),
              borderRadius: "14px",
              padding: "16px",
              display: "grid",
              gap: "10px",
              fontSize: "13px",
              lineHeight: 1.6,
            }}
          >
            <div>
              {copyText(
                locale,
                "This detail page is read-only. Version changes, partner governance, and tenant-owned workflows continue in the owner apps.",
                "這個詳情頁是唯讀。版本異動、partner governance 與 tenant owner 的流程仍在 owner apps 進行。",
              )}
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {ownerLinks.length > 0 ? (
                ownerLinks.map((link) => (
                  <a
                    key={`scope-${link.targetApp}-${link.resourceId}`}
                    href={buildCrossAppUrl(link)}
                    target="_blank"
                    rel="noreferrer"
                    style={buttonStyle({ emphasis: "secondary" })}
                  >
                    {link.label}
                    <span
                      style={{
                        marginLeft: "6px",
                        fontSize: "11px",
                        opacity: 0.8,
                      }}
                    >
                      {copyText(locale, "new tab", "新分頁")}
                    </span>
                  </a>
                ))
              ) : (
                <Link
                  href="/contracts"
                  style={buttonStyle({ emphasis: "ghost" })}
                >
                  {copyText(locale, "Return to registry", "返回合約清單")}
                </Link>
              )}
            </div>
          </div>
        </DataViewCard>
      </div>
    </>
  );
}
