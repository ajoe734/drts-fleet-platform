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
  DataCellStack,
  DataTable,
  DataViewCard,
  PageHeader,
  StatusChip,
  Td,
  Tr,
} from "@drts/ui-web";

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
  const manualReviewCount = reviewQueue.filter(
    (item) => item.verificationStatus === "manual_review",
  ).length;

  return (
    <>
      <PageHeader
        title={t("contracts.title", locale)}
        subtitle={t("contracts.subtitle", locale, { count: contracts.length })}
      />

      {error && (
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #fca5a5",
            borderRadius: "8px",
            padding: "12px 16px",
            color: "#b91c1c",
            fontSize: "13.5px",
            marginBottom: "20px",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "grid", gap: "1rem" }}>
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
          tone="info"
          density="compact"
          summary={t("contracts.registrySummary", locale, {
            active: activeContracts,
            draft: draftContracts,
            attention: reviewQueue.length,
          })}
        >
          <DataTable
            density="compact"
            tone="info"
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
    </>
  );
}
