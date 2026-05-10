import type { CSSProperties } from "react";
import type {
  PartnerChannelEntryRecord,
  PartnerEligibilityReviewQueueItem,
  VehicleContractRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { t } from "@/lib/translations";
import {
  CalloutBanner,
  DataCellStack,
  DataFilterBar,
  DataTable,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
} from "@drts/ui-web";

const pageLayoutStyle: CSSProperties = {
  display: "grid",
  gap: "20px",
};

function contractStatusTone(status: string) {
  if (status === "active") return "success" as const;
  if (status === "terminated" || status === "expired") return "danger" as const;
  if (status === "pending" || status === "draft") return "warning" as const;
  return "neutral" as const;
}

function eligibilityStatusTone(
  status: PartnerEligibilityReviewQueueItem["verificationStatus"],
) {
  if (status === "manual_review") return "warning" as const;
  if (status === "ineligible") return "danger" as const;
  return "neutral" as const;
}

function formatRequestedBy(
  item: PartnerEligibilityReviewQueueItem,
  locale: "en" | "zh",
) {
  if (!item.manualFallback.required) {
    return t("contracts.reviewRequestedBy.none", locale);
  }

  if (item.manualFallback.requestedBy === "system:auto_fallback") {
    return t("contracts.reviewRequestedBy.system:auto_fallback", locale);
  }

  return item.manualFallback.requestedBy ?? t("common.dash", locale);
}

function formatContext(
  item: PartnerEligibilityReviewQueueItem,
  locale: "en" | "zh",
) {
  const parts: string[] = [];
  if (item.requestHints.cardLast4) {
    parts.push(
      t("contracts.reviewContext.cardLast4", locale, {
        value: item.requestHints.cardLast4,
      }),
    );
  }
  if (item.requestHints.flightNo) {
    parts.push(
      t("contracts.reviewContext.flightNo", locale, {
        value: item.requestHints.flightNo,
      }),
    );
  }
  return parts.join(" · ") || t("contracts.reviewContext.none", locale);
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

export default async function ContractsPage() {
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);
  let contracts: VehicleContractRecord[] = [];
  let partnerEntries: PartnerChannelEntryRecord[] = [];
  let reviewQueue: PartnerEligibilityReviewQueueItem[] = [];
  let error: string | null = null;

  try {
    [contracts, partnerEntries, reviewQueue] = await Promise.all([
      client.listContracts(),
      client.listPartnerEntries(),
      client.listPartnerEligibilityReviewQueue(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : t("common.unknown", locale);
  }
  const partnerNameBySlug = new Map(
    partnerEntries.map((entry) => [entry.entrySlug, entry.displayName]),
  );
  const activeContracts = contracts.filter(
    (contract) => contract.status === "active",
  ).length;
  const draftContracts = contracts.filter(
    (contract) => contract.status === "draft",
  ).length;
  const expiringContracts = contracts.filter(
    (contract) => contract.lifecycleStatus === "expired",
  ).length;
  const manualReviewCount = reviewQueue.filter(
    (item) => item.verificationStatus === "manual_review",
  ).length;
  const ineligibleReviewCount = reviewQueue.filter(
    (item) => item.verificationStatus === "ineligible",
  ).length;

  return (
    <div style={pageLayoutStyle}>
      <PageHeader
        eyebrow={locale === "en" ? "Master data" : "主資料"}
        title={t("contracts.title", locale)}
        subtitle={
          locale === "en"
            ? "Vehicle contracts, partner relationships, and manual review debt in one control surface."
            : "把車輛合約、partner 關係與人工審核債務集中在同一個管理頁面。"
        }
        meta={[
          {
            label: locale === "en" ? "Contracts" : "合約數",
            value: contracts.length,
          },
          {
            label: locale === "en" ? "Partners" : "合作通道",
            value: partnerEntries.length,
          },
          {
            label: locale === "en" ? "Manual review" : "人工審核",
            value: manualReviewCount,
            tone: manualReviewCount > 0 ? "warning" : "success",
          },
        ]}
      />

      <KpiRow minWidth="170px">
        <KpiCard
          label={locale === "en" ? "Active contracts" : "生效合約"}
          value={activeContracts}
          detail={
            locale === "en"
              ? `${draftContracts} drafts still pending`
              : `${draftContracts} 份草稿仍待落地`
          }
          tone="success"
        />
        <KpiCard
          label={locale === "en" ? "Manual review queue" : "人工審核隊列"}
          value={manualReviewCount}
          detail={
            locale === "en"
              ? `${reviewQueue.length} partner eligibility items`
              : `共有 ${reviewQueue.length} 筆 partner eligibility 項目`
          }
          tone={manualReviewCount > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label={locale === "en" ? "Ineligible" : "不符資格"}
          value={ineligibleReviewCount}
          detail={
            locale === "en"
              ? "Require partner or policy follow-up"
              : "需要 partner 或政策層 follow-up"
          }
          tone={ineligibleReviewCount > 0 ? "danger" : "success"}
        />
        <KpiCard
          label={locale === "en" ? "Expired contracts" : "已到期"}
          value={expiringContracts}
          detail={
            locale === "en"
              ? "Registry rows that should not drift into operations"
              : "避免漂入日常營運的到期合約列"
          }
          tone={expiringContracts > 0 ? "warning" : "neutral"}
        />
      </KpiRow>

      {error ? (
        <CalloutBanner
          tone="danger"
          title={t("contracts.title", locale)}
          description={error}
        />
      ) : manualReviewCount > 0 ? (
        <CalloutBanner
          tone="warning"
          title={
            locale === "en"
              ? `${manualReviewCount} items are waiting on manual partner review`
              : `${manualReviewCount} 筆項目正在等待人工 partner 審核`
          }
          description={
            locale === "en"
              ? "Keep the queue visible to operations so fallback requests do not disappear behind contract data."
              : "讓營運持續看見這條 queue，避免 fallback request 被合約名冊淹沒。"
          }
        />
      ) : null}

      <DataViewCard
        title={t("contracts.reviewTitle", locale)}
        subtitle={t("contracts.reviewSubtitle", locale, {
          count: reviewQueue.length,
        })}
        tone="warning"
        density="compact"
        summary={t("contracts.reviewRegistrySummary", locale, {
          total: reviewQueue.length,
          manual: manualReviewCount,
        })}
        filters={
          <DataFilterBar
            ariaLabel={locale === "en" ? "Review queue views" : "審核佇列檢視"}
            value="all"
            filters={[
              {
                value: "all",
                label: locale === "en" ? "All" : "全部",
                count: reviewQueue.length,
                tone: "warning",
              },
              {
                value: "manual",
                label: locale === "en" ? "Manual" : "人工",
                count: manualReviewCount,
                tone: manualReviewCount > 0 ? "warning" : "neutral",
              },
              {
                value: "ineligible",
                label: locale === "en" ? "Ineligible" : "不符資格",
                count: ineligibleReviewCount,
                tone: ineligibleReviewCount > 0 ? "danger" : "neutral",
              },
            ]}
          />
        }
      >
        <DataTable
          density="compact"
          tone="warning"
          columns={[
            {
              label: t("contracts.reviewCol.partnerEntry", locale),
              width: "220px",
            },
            {
              label: t("contracts.reviewCol.reason", locale),
              width: "220px",
            },
            {
              label: t("contracts.reviewCol.status", locale),
              width: "130px",
            },
            {
              label: t("contracts.reviewCol.attempts", locale),
              width: "130px",
            },
            {
              label: t("contracts.reviewCol.requestedAt", locale),
              width: "190px",
            },
            { label: t("contracts.reviewCol.requestContext", locale) },
          ]}
          empty={t("contracts.reviewEmpty", locale)}
        >
          {reviewQueue.map((item) => (
            <Tr key={item.eligibilityVerificationId}>
              <Td density="compact">
                <DataCellStack
                  primary={
                    <strong>
                      {partnerNameBySlug.get(item.partnerEntrySlug) ??
                        item.partnerEntrySlug}
                    </strong>
                  }
                  secondary={item.partnerEntrySlug}
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={formatOpsCodeLabel(
                    locale,
                    item.verificationReasonCode,
                  )}
                  secondary={
                    item.manualFallback.reasonCode ??
                    item.latestAttemptReasonCode ??
                    t("common.dash", locale)
                  }
                />
              </Td>
              <Td density="compact">
                <StatusChip
                  tone={eligibilityStatusTone(item.verificationStatus)}
                  authorityLabel={locale === "zh" ? "判定" : "decision"}
                  label={t(
                    `contracts.reviewStatus.${item.verificationStatus}`,
                    locale,
                  )}
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={String(item.attemptCount)}
                  secondary={
                    item.latestAttemptStatus
                      ? formatOpsCodeLabel(locale, item.latestAttemptStatus)
                      : t("common.dash", locale)
                  }
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={formatDateTime(
                    item.manualFallback.requestedAt,
                    locale,
                  )}
                  secondary={formatRequestedBy(item, locale)}
                  tertiary={formatDateTime(item.verifiedAt, locale)}
                />
              </Td>
              <Td density="compact" muted>
                {formatContext(item, locale)}
              </Td>
            </Tr>
          ))}
        </DataTable>
      </DataViewCard>

      <DataViewCard
        title={t("contracts.title", locale)}
        subtitle={t("contracts.subtitle", locale, {
          count: contracts.length,
        })}
        tone="ops"
        density="compact"
        summary={t("contracts.registrySummary", locale, {
          active: activeContracts,
          draft: draftContracts,
          attention: reviewQueue.length,
        })}
        filters={
          <DataFilterBar
            ariaLabel={locale === "en" ? "Contract views" : "合約檢視"}
            value="all"
            filters={[
              {
                value: "all",
                label: locale === "en" ? "All" : "全部",
                count: contracts.length,
                tone: "ops",
              },
              {
                value: "active",
                label: locale === "en" ? "Active" : "生效",
                count: activeContracts,
                tone: "success",
              },
              {
                value: "draft",
                label: locale === "en" ? "Draft" : "草稿",
                count: draftContracts,
                tone: draftContracts > 0 ? "warning" : "neutral",
              },
              {
                value: "expired",
                label: locale === "en" ? "Expired" : "到期",
                count: expiringContracts,
                tone: expiringContracts > 0 ? "warning" : "neutral",
              },
            ]}
          />
        }
      >
        <DataTable
          density="compact"
          tone="ops"
          columns={[
            { label: t("contracts.col.contractId", locale), width: "220px" },
            { label: t("contracts.col.vehicle", locale), width: "140px" },
            { label: t("contracts.col.partner", locale), width: "180px" },
            { label: t("contracts.col.type", locale), width: "180px" },
            { label: t("contracts.col.status", locale), width: "140px" },
          ]}
          empty={t("contracts.empty", locale)}
        >
          {contracts.map((contract) => (
            <Tr key={contract.contractId}>
              <Td density="compact">
                <DataCellStack
                  primary={<strong>{contract.contractId}</strong>}
                  secondary={contract.serviceScope}
                  tertiary={
                    contract.operatingAreaId ?? t("common.dash", locale)
                  }
                />
              </Td>
              <Td density="compact" mono>
                {contract.vehicleId}
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={contract.partnerId}
                  secondary={formatOpsCodeLabel(locale, contract.partnerType)}
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={formatOpsCodeLabel(locale, contract.contractType)}
                  secondary={formatOpsCodeLabel(
                    locale,
                    contract.lifecycleStatus,
                  )}
                />
              </Td>
              <Td density="compact">
                <StatusChip
                  tone={contractStatusTone(contract.status)}
                  authorityLabel={locale === "zh" ? "狀態" : "status"}
                  label={formatOpsCodeLabel(locale, contract.status)}
                />
              </Td>
            </Tr>
          ))}
        </DataTable>
      </DataViewCard>
    </div>
  );
}
