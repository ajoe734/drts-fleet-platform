import type {
  PartnerChannelEntryRecord,
  PartnerEligibilityReviewQueueItem,
  VehicleContractRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { t } from "@/lib/translations";
import { PageHeader } from "@drts/ui-web";
import { StatCard } from "@drts/ui-web";
import { Card, CardBody } from "@drts/ui-web";
import { DataTable, Tr, Td } from "@drts/ui-web";
import { Badge } from "@drts/ui-web";

function contractStatusVariant(status: string) {
  if (status === "active") return "green" as const;
  if (status === "terminated" || status === "expired") return "red" as const;
  if (status === "pending") return "yellow" as const;
  return "gray" as const;
}

function eligibilityStatusVariant(
  status: PartnerEligibilityReviewQueueItem["verificationStatus"],
) {
  if (status === "manual_review") return "yellow" as const;
  if (status === "ineligible") return "red" as const;
  return "gray" as const;
}

function formatRequestedBy(
  item: PartnerEligibilityReviewQueueItem,
  locale: "en" | "zh",
) {
  if (!item.manualFallback.required) {
    return t("contracts.reviewRequestedBy.none", locale);
  }

  if (item.manualFallback.requestedBy === "system:auto_fallback") {
    return t(
      "contracts.reviewRequestedBy.system:auto_fallback",
      locale,
    );
  }

  return item.manualFallback.requestedBy ?? t("common.dash", locale);
}

function formatContext(
  item: PartnerEligibilityReviewQueueItem,
  locale: "en" | "zh",
) {
  const parts: string[] = [];
  if (item.requestHints.cardLast4) {
    parts.push(t("contracts.reviewContext.cardLast4", locale, {
      value: item.requestHints.cardLast4,
    }));
  }
  if (item.requestHints.flightNo) {
    parts.push(t("contracts.reviewContext.flightNo", locale, {
      value: item.requestHints.flightNo,
    }));
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

  return (
    <>
      <PageHeader
        title={t("contracts.title", locale)}
        subtitle={t("contracts.subtitle", locale, { count: contracts.length })}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        <StatCard
          label={t("contracts.reviewTitle", locale)}
          value={String(reviewQueue.length)}
          sub={t("contracts.reviewSubtitle", locale, {
            count: reviewQueue.length,
          })}
          accent="#b45309"
        />
      </div>

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

      <Card style={{ marginBottom: "20px" }}>
        <CardBody>
          {reviewQueue.length > 0 && (
            <div
              style={{
                background: "#fff7ed",
                border: "1px solid #fdba74",
                borderRadius: "8px",
                padding: "12px 16px",
                color: "#9a3412",
                fontSize: "13.5px",
                marginBottom: "16px",
              }}
            >
              {t("contracts.reviewAlert", locale, {
                count: reviewQueue.length,
              })}
            </div>
          )}
          <DataTable
            columns={[
              { label: t("contracts.reviewCol.partnerEntry", locale) },
              { label: t("contracts.reviewCol.reason", locale) },
              { label: t("contracts.reviewCol.status", locale) },
              { label: t("contracts.reviewCol.attempts", locale) },
              { label: t("contracts.reviewCol.requestedAt", locale) },
              { label: t("contracts.reviewCol.requestContext", locale) },
            ]}
            empty={t("contracts.reviewEmpty", locale)}
          >
                  {reviewQueue.map((item) => (
                    <Tr key={item.eligibilityVerificationId}>
                      <Td>
                        <div style={{ fontWeight: 600 }}>
                          {partnerNameBySlug.get(item.partnerEntrySlug) ??
                            item.partnerEntrySlug}
                        </div>
                        <div
                          style={{
                            color: "#64748b",
                            fontSize: "12px",
                            marginTop: "4px",
                          }}
                        >
                          {item.partnerEntrySlug}
                        </div>
                      </Td>
                      <Td>
                        <div>
                          {formatOpsCodeLabel(locale, item.verificationReasonCode)}
                        </div>
                        <div
                          style={{
                            color: "#64748b",
                            fontSize: "12px",
                            marginTop: "4px",
                          }}
                        >
                          {item.manualFallback.reasonCode ??
                            item.latestAttemptReasonCode ??
                            t("common.dash", locale)}
                        </div>
                      </Td>
                <Td>
                  <Badge variant={eligibilityStatusVariant(item.verificationStatus)}>
                    {t(
                      `contracts.reviewStatus.${item.verificationStatus}`,
                      locale,
                    )}
                  </Badge>
                </Td>
                <Td>
                  <div>{item.attemptCount}</div>
                  <div
                    style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}
                  >
                    {item.latestAttemptStatus
                      ? formatOpsCodeLabel(locale, item.latestAttemptStatus)
                      : t("common.dash", locale)}
                  </div>
                </Td>
                <Td>
                  <div>
                    {formatDateTime(item.manualFallback.requestedAt, locale)}
                  </div>
                  <div
                    style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}
                  >
                    {formatRequestedBy(item, locale)} ·{" "}
                    {formatDateTime(item.verifiedAt, locale)}
                  </div>
                </Td>
                <Td>{formatContext(item, locale)}</Td>
              </Tr>
            ))}
          </DataTable>
        </CardBody>
      </Card>

      <Card>
        <DataTable
          columns={[
            { label: t("contracts.col.contractId", locale) },
            { label: t("contracts.col.vehicle", locale) },
            { label: t("contracts.col.partner", locale) },
            { label: t("contracts.col.type", locale) },
            { label: t("contracts.col.status", locale) },
          ]}
          empty={t("contracts.empty", locale)}
        >
          {contracts.map((c) => (
            <Tr key={c.contractId}>
              <Td mono>{c.contractId}</Td>
              <Td mono>{c.vehicleId}</Td>
              <Td mono>{c.partnerId}</Td>
              <Td>{formatOpsCodeLabel(locale, c.contractType)}</Td>
              <Td>
                <Badge variant={contractStatusVariant(c.status)}>
                  {formatOpsCodeLabel(locale, c.status)}
                </Badge>
              </Td>
            </Tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}
