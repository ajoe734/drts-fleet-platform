/**
 * Audit Trail Page
 * Append-only audit evidence governance and log review surface.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  formatDateTime,
  truncate,
  usePlatformAdminClient,
} from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import type {
  AuditLogRecord,
  EvidenceDeletionExceptionRecord,
  EvidenceLegalHoldRecord,
  EvidenceRetentionPolicyRecord,
} from "@drts/contracts";
import {
  CalloutBanner,
  DataCellStack,
  DataTable,
  DataViewCard,
  DetailMetadataGrid,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
} from "@drts/ui-web";

const AUDIT_ACTOR_TYPES = [
  "system",
  "platform_admin",
  "tenant_admin",
  "ops_user",
  "partner_api_key",
] as const satisfies readonly AuditLogRecord["actorType"][];

function normalizeActorType(value: unknown): AuditLogRecord["actorType"] {
  return typeof value === "string" &&
    (AUDIT_ACTOR_TYPES as readonly string[]).includes(value)
    ? (value as AuditLogRecord["actorType"])
    : "system";
}

export default function AuditPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [records, setRecords] = useState<AuditLogRecord[]>([]);
  const [policies, setPolicies] = useState<EvidenceRetentionPolicyRecord[]>([]);
  const [legalHolds, setLegalHolds] = useState<EvidenceLegalHoldRecord[]>([]);
  const [deletionExceptions, setDeletionExceptions] = useState<
    EvidenceDeletionExceptionRecord[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterModule, setFilterModule] = useState("");
  const [filterActorType, setFilterActorType] = useState("");
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, policyList, holdList, deletionExceptionList] =
        await Promise.all([
          client.listAuditLogs(),
          client.listEvidencePolicies(),
          client.listEvidenceLegalHolds(),
          client.listEvidenceDeletionExceptions(),
        ]);

      const recordsList: AuditLogRecord[] =
        (result as Array<Record<string, unknown>>).map((record) => {
          const normalized: AuditLogRecord = {
            auditId: String(record.auditId ?? record.id ?? ""),
            actorId: typeof record.actorId === "string" ? record.actorId : null,
            actorType: normalizeActorType(record.actorType),
            tenantId:
              typeof record.tenantId === "string" ? record.tenantId : null,
            moduleName:
              typeof record.moduleName === "string"
                ? record.moduleName
                : typeof record.module === "string"
                  ? record.module
                  : "",
            actionName:
              typeof record.actionName === "string"
                ? record.actionName
                : typeof record.action === "string"
                  ? record.action
                  : "",
            resourceType:
              typeof record.resourceType === "string"
                ? record.resourceType
                : "",
            resourceId:
              typeof record.resourceId === "string" ? record.resourceId : null,
            requestId:
              typeof record.requestId === "string" ? record.requestId : "",
            createdAt:
              typeof record.createdAt === "string" ? record.createdAt : "",
          };

          if (
            record.oldValuesSummary &&
            typeof record.oldValuesSummary === "object" &&
            !Array.isArray(record.oldValuesSummary)
          ) {
            normalized.oldValuesSummary = record.oldValuesSummary as Record<
              string,
              unknown
            >;
          }

          if (
            record.newValuesSummary &&
            typeof record.newValuesSummary === "object" &&
            !Array.isArray(record.newValuesSummary)
          ) {
            normalized.newValuesSummary = record.newValuesSummary as Record<
              string,
              unknown
            >;
          }

          return normalized;
        }) ?? [];

      setRecords(recordsList);
      setPolicies(policyList);
      setLegalHolds(holdList);
      setDeletionExceptions(deletionExceptionList);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const filteredRecords = records.filter((record) => {
    if (filterModule && record.moduleName !== filterModule) {
      return false;
    }
    if (filterActorType && record.actorType !== filterActorType) {
      return false;
    }
    return true;
  });

  const modules = [
    ...new Set(records.map((record) => record.moduleName).filter(Boolean)),
  ];
  const actorTypes = [
    ...new Set(records.map((record) => record.actorType).filter(Boolean)),
  ];
  const activeLegalHolds = legalHolds.filter(
    (hold) => hold.status === "active",
  );
  const activeDeletionExceptions = deletionExceptions.filter(
    (exception) => exception.status === "active",
  );
  const signedDownloadFamilies = policies.filter(
    (policy) => policy.downloadControl?.mode === "signed_url",
  );

  const copy =
    locale === "en"
      ? {
          eyebrow: "Evidence governance",
          subtitle:
            "Append-only audit review, retention policy visibility, and active hold/exception context in one governance surface.",
          bannerTitle: "Audit remains append-only from the frontend.",
          bannerDescription:
            "This page reviews evidence policy, active legal holds, deletion exceptions, and immutable audit history. Governance writes stay with their dedicated backend workflows.",
          governanceTitle: "Retention and evidence controls",
          governanceSubtitle:
            "Retention families, download posture, and legal-hold capability remain backend-owned policy truth.",
          governanceSummary:
            "Legal hold placement and deletion-exception writes are intentionally not issued from this page in this slice.",
          holdsTitle: "Active legal holds",
          holdsSubtitle:
            "Only currently active holds are surfaced here for audit review context.",
          exceptionsTitle: "Active deletion exceptions",
          exceptionsSubtitle:
            "These exceptions explain temporary deviations from automated evidence retention handling.",
          ledgerTitle: "Audit ledger",
          ledgerSubtitle:
            "Filter by module and actor type while keeping request ID, tenant context, and old/new value summaries available.",
          ledgerSummary:
            "Request visibility is shown inline so operators can correlate governance actions back to upstream control-plane requests.",
          request: "Request",
          noRequest: "No request id",
          noTenant: "No tenant",
          noResource: "No resource id",
          noActor: "System",
        }
      : {
          eyebrow: "證據治理",
          subtitle:
            "把 append-only audit review、retention policy 與 active hold/exception context 放進同一個治理頁。",
          bannerTitle: "前端只能檢視 append-only audit。",
          bannerDescription:
            "本頁負責審視 evidence policy、active legal hold、deletion exception 與不可變更的 audit history；治理寫入仍留在各自的 backend workflow。",
          governanceTitle: "Retention 與 evidence controls",
          governanceSubtitle:
            "Retention family、download posture 與 legal-hold capability 都以 backend policy truth 為主。",
          governanceSummary:
            "Legal hold 與 deletion exception 的建立/解除在這個 slice 中刻意不由本頁發出。",
          holdsTitle: "生效中的 legal hold",
          holdsSubtitle:
            "這裡只顯示 active hold，提供 audit review 的即時治理脈絡。",
          exceptionsTitle: "生效中的 deletion exception",
          exceptionsSubtitle:
            "這些 exception 用來說明 evidence retention 流程的暫時偏離。",
          ledgerTitle: "Audit 台帳",
          ledgerSubtitle:
            "可依 module 與 actor type 篩選，同時保留 request ID、tenant context 與 old/new value summary。",
          ledgerSummary:
            "Request visibility 直接顯示在表格中，方便把治理動作回扣到上游 control-plane request。",
          request: "Request",
          noRequest: "沒有 request id",
          noTenant: "沒有 tenant",
          noResource: "沒有 resource id",
          noActor: "系統",
        };

  if (loading) {
    return <div className="admin-empty">{t("audit.loading")}</div>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader
        eyebrow={copy.eyebrow}
        title={t("audit.title")}
        subtitle={copy.subtitle}
        meta={[
          { label: t("audit.metrics.policyFamilies"), value: policies.length },
          {
            label: t("audit.metrics.activeHolds"),
            value: activeLegalHolds.length,
          },
          {
            label: t("audit.metrics.activeExceptions"),
            value: activeDeletionExceptions.length,
          },
        ]}
        actions={
          <button
            className="admin-btn admin-btn--secondary"
            onClick={() => void loadRecords()}
          >
            {t("common.refresh")}
          </button>
        }
      />

      {error ? (
        <CalloutBanner
          tone="danger"
          title={`${getPlatformLabel(locale, "error")}: ${error}`}
        />
      ) : null}

      <CalloutBanner
        tone="info"
        eyebrow={copy.eyebrow}
        title={copy.bannerTitle}
        description={copy.bannerDescription}
      />

      <KpiRow minWidth="180px">
        <KpiCard
          label={t("audit.metrics.policyFamilies")}
          value={policies.length}
          detail={copy.governanceTitle}
          tone="neutral"
        />
        <KpiCard
          label={t("audit.metrics.signedDownload")}
          value={signedDownloadFamilies.length}
          detail={t("audit.policies.signedDownloadTtl", { minutes: 0 }).replace(
            "0",
            "…",
          )}
          tone={signedDownloadFamilies.length > 0 ? "info" : "neutral"}
        />
        <KpiCard
          label={t("audit.metrics.activeHolds")}
          value={activeLegalHolds.length}
          detail={copy.holdsSubtitle}
          tone={activeLegalHolds.length > 0 ? "warning" : "success"}
        />
        <KpiCard
          label={t("audit.metrics.activeExceptions")}
          value={activeDeletionExceptions.length}
          detail={copy.exceptionsSubtitle}
          tone={activeDeletionExceptions.length > 0 ? "warning" : "success"}
        />
      </KpiRow>

      <DataViewCard
        title={copy.governanceTitle}
        subtitle={copy.governanceSubtitle}
        tone="info"
        summary={copy.governanceSummary}
        footer={`${policies.length} ${locale === "en" ? "policy families" : "個 policy family"}`}
      >
        <DataTable
          tone="info"
          minWidth={980}
          columns={[
            { label: t("audit.policies.family"), width: "28%" },
            { label: t("audit.policies.authority"), width: "18%" },
            { label: t("audit.policies.retention"), width: "16%" },
            { label: t("audit.policies.download"), width: "20%" },
            { label: t("audit.policies.legalHold"), width: "18%" },
          ]}
          empty={t("audit.empty")}
        >
          {policies.map((policy) => (
            <Tr key={policy.family}>
              <Td>
                <DataCellStack
                  primary={
                    <strong>
                      {formatPlatformCodeLabel(locale, policy.family)}
                    </strong>
                  }
                  secondary={policy.description}
                />
              </Td>
              <Td>{formatPlatformCodeLabel(locale, policy.authorityModule)}</Td>
              <Td muted>
                {policy.hotRetentionDays}d /{" "}
                {policy.archiveRetentionDays
                  ? `${policy.archiveRetentionDays}d`
                  : "—"}
              </Td>
              <Td muted>
                {policy.downloadControl?.mode === "signed_url"
                  ? t("audit.policies.signedDownloadTtl", {
                      minutes: policy.downloadControl.ttlMinutes ?? 0,
                    })
                  : t("audit.policies.noDownload")}
              </Td>
              <Td>
                <StatusChip
                  tone={policy.legalHold.supported ? "success" : "neutral"}
                  label={
                    policy.legalHold.supported
                      ? t("audit.policies.holdEnabled")
                      : t("audit.policies.holdDisabled")
                  }
                />
              </Td>
            </Tr>
          ))}
        </DataTable>
      </DataViewCard>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        }}
      >
        <DataViewCard
          title={copy.holdsTitle}
          subtitle={copy.holdsSubtitle}
          tone="warning"
          footer={`${activeLegalHolds.length} ${locale === "en" ? "active holds" : "筆 active hold"}`}
        >
          <DataTable
            tone="warning"
            minWidth={640}
            empty={t("audit.holds.empty")}
            columns={[
              { label: t("audit.holds.family"), width: "22%" },
              { label: t("audit.holds.subject"), width: "28%" },
              { label: t("audit.holds.case"), width: "28%" },
              { label: t("audit.holds.status"), width: "22%" },
            ]}
          >
            {activeLegalHolds.map((hold) => (
              <Tr key={hold.holdId ?? `${hold.family}-${hold.subjectId}`}>
                <Td>{formatPlatformCodeLabel(locale, hold.family)}</Td>
                <Td mono>{hold.subjectId}</Td>
                <Td>{hold.caseNumber}</Td>
                <Td>
                  <StatusChip
                    tone={hold.status === "active" ? "warning" : "neutral"}
                    label={formatPlatformCodeLabel(locale, hold.status)}
                  />
                </Td>
              </Tr>
            ))}
          </DataTable>
        </DataViewCard>

        <DataViewCard
          title={copy.exceptionsTitle}
          subtitle={copy.exceptionsSubtitle}
          tone="warning"
          footer={`${activeDeletionExceptions.length} ${locale === "en" ? "active exceptions" : "筆 active exception"}`}
        >
          <DataTable
            tone="warning"
            minWidth={700}
            empty={t("audit.exceptions.empty")}
            columns={[
              { label: t("audit.exceptions.family"), width: "22%" },
              { label: t("audit.exceptions.subject"), width: "22%" },
              { label: t("audit.exceptions.reason"), width: "28%" },
              { label: t("audit.exceptions.expiresAt"), width: "28%" },
            ]}
          >
            {activeDeletionExceptions.map((exception) => (
              <Tr
                key={
                  exception.exceptionId ??
                  `${exception.family}-${exception.subjectId}`
                }
              >
                <Td>{formatPlatformCodeLabel(locale, exception.family)}</Td>
                <Td mono>{exception.subjectId}</Td>
                <Td>{formatPlatformCodeLabel(locale, exception.reasonCode)}</Td>
                <Td muted>{formatDateTime(exception.expiresAt)}</Td>
              </Tr>
            ))}
          </DataTable>
        </DataViewCard>
      </div>

      <DataViewCard
        title={copy.ledgerTitle}
        subtitle={copy.ledgerSubtitle}
        tone="neutral"
        summary={copy.ledgerSummary}
        filters={
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            <div>
              <label
                htmlFor="filter-module"
                style={{
                  display: "block",
                  marginBottom: 4,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {t("audit.moduleLabel")}
              </label>
              <select
                id="filter-module"
                value={filterModule}
                onChange={(event) => setFilterModule(event.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 13,
                }}
              >
                <option value="">{t("common.all")}</option>
                {modules.map((moduleName) => (
                  <option key={moduleName} value={moduleName}>
                    {formatPlatformCodeLabel(locale, moduleName)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="filter-actor"
                style={{
                  display: "block",
                  marginBottom: 4,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {t("audit.actorLabel")}
              </label>
              <select
                id="filter-actor"
                value={filterActorType}
                onChange={(event) => setFilterActorType(event.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 13,
                }}
              >
                <option value="">{t("common.all")}</option>
                {actorTypes.map((actorType) => (
                  <option key={actorType} value={actorType}>
                    {formatPlatformCodeLabel(locale, actorType)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        }
        footer={t("audit.showingOf", {
          shown: filteredRecords.length,
          total: records.length,
        })}
      >
        <DataTable
          tone="neutral"
          minWidth={1180}
          empty={t("audit.empty")}
          columns={[
            { label: getPlatformLabel(locale, "id"), width: "10%" },
            { label: t("audit.col.actor"), width: "16%" },
            { label: t("audit.col.module"), width: "16%" },
            { label: t("audit.col.resource"), width: "18%" },
            { label: copy.request, width: "18%" },
            { label: t("audit.col.timestamp"), width: "14%" },
            { label: t("audit.col.details"), width: "8%", align: "right" },
          ]}
        >
          {filteredRecords.map((record) => (
            <React.Fragment key={record.auditId}>
              <Tr highlighted={expandedAuditId === record.auditId}>
                <Td mono>{truncate(record.auditId, 12)}</Td>
                <Td>
                  <DataCellStack
                    primary={truncate(record.actorId || copy.noActor, 18)}
                    secondary={
                      <StatusChip
                        tone="neutral"
                        label={formatPlatformCodeLabel(
                          locale,
                          record.actorType,
                        )}
                      />
                    }
                  />
                </Td>
                <Td>
                  <DataCellStack
                    primary={formatPlatformCodeLabel(locale, record.moduleName)}
                    secondary={
                      <StatusChip
                        tone="info"
                        label={formatPlatformCodeLabel(
                          locale,
                          record.actionName,
                        )}
                      />
                    }
                  />
                </Td>
                <Td>
                  <DataCellStack
                    primary={formatPlatformCodeLabel(
                      locale,
                      record.resourceType,
                    )}
                    secondary={
                      record.resourceId
                        ? `${record.resourceType}:${truncate(record.resourceId, 10)}`
                        : copy.noResource
                    }
                  />
                </Td>
                <Td>
                  <DataCellStack
                    primary={
                      record.requestId
                        ? truncate(record.requestId, 16)
                        : copy.noRequest
                    }
                    secondary={`${t("audit.col.tenant")}: ${record.tenantId || copy.noTenant}`}
                  />
                </Td>
                <Td muted>{formatDateTime(record.createdAt)}</Td>
                <Td align="right">
                  {record.oldValuesSummary || record.newValuesSummary ? (
                    <button
                      className="admin-btn admin-btn--secondary admin-btn--sm"
                      type="button"
                      onClick={() =>
                        setExpandedAuditId((current) =>
                          current === record.auditId ? null : record.auditId,
                        )
                      }
                    >
                      {expandedAuditId === record.auditId
                        ? t("audit.collapse")
                        : t("audit.expand")}
                    </button>
                  ) : (
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>—</span>
                  )}
                </Td>
              </Tr>
              {expandedAuditId === record.auditId ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{ padding: 12, background: "#f8fafc" }}
                  >
                    <DetailMetadataGrid
                      minColumnWidth="260px"
                      items={[
                        {
                          id: `${record.auditId}-old`,
                          label: t("audit.oldValues"),
                          value: (
                            <AuditPayload
                              payload={record.oldValuesSummary}
                              t={t}
                            />
                          ),
                          tone: "neutral",
                        },
                        {
                          id: `${record.auditId}-new`,
                          label: t("audit.newValues"),
                          value: (
                            <AuditPayload
                              payload={record.newValuesSummary}
                              t={t}
                            />
                          ),
                          tone: "neutral",
                        },
                      ]}
                    />
                  </td>
                </tr>
              ) : null}
            </React.Fragment>
          ))}
        </DataTable>
      </DataViewCard>
    </div>
  );
}

function AuditPayload({
  payload,
  t,
}: {
  payload: Record<string, unknown> | undefined;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  if (!payload) {
    return <span style={{ color: "#94a3b8" }}>{t("common.noValues")}</span>;
  }

  return (
    <pre
      style={{
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontSize: 12,
        lineHeight: 1.55,
      }}
    >
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}
