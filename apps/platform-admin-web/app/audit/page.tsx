/**
 * Audit & Evidence Governance
 *
 * Platform Admin canvas body parity (PA_Audit, Q-ADM16). Append-only audit log
 * with actor-type pills, inline HOLD / EXEMPT resource badges, filter pill row
 * with counts, retention policies, and legal hold / deletion exception summary
 * cards. Refresh tier is T6 manual, surfaced as an explicit refresh action.
 */

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
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
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type AuditTabId = "log" | "policy" | "hold" | "except";

type AuditTableRow = AuditLogRecord & {
  hold: EvidenceLegalHoldRecord | undefined;
  exempt: EvidenceDeletionExceptionRecord | undefined;
} & Record<string, unknown>;

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const bodyStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const pillRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
} satisfies CSSProperties;

const summaryGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
} satisfies CSSProperties;

const tabButtonStyle = {
  appearance: "none",
  background: "transparent",
  border: "none",
  padding: 0,
  margin: 0,
  font: "inherit",
  color: "inherit",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
} satisfies CSSProperties;

const pillButtonStyle = {
  appearance: "none",
  background: "transparent",
  border: "none",
  padding: 0,
  margin: 0,
  cursor: "pointer",
  display: "inline-flex",
} satisfies CSSProperties;

const resourceCellStyle = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
} satisfies CSSProperties;

const monoCellStyle = {
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
  color: theme.text,
} satisfies CSSProperties;

const actionCellStyle = {
  fontFamily: theme.monoFamily,
  fontSize: 11,
  color: theme.accent,
} satisfies CSSProperties;

const stateStyle = {
  color: theme.textMuted,
  fontSize: 12.5,
  padding: "32px 16px",
  textAlign: "center",
} satisfies CSSProperties;

function actorTone(actorType: AuditLogRecord["actorType"]): CanvasTone {
  switch (actorType) {
    case "platform_admin":
      return "accent";
    case "tenant_admin":
      return "info";
    case "ops_user":
      return "success";
    case "partner_api_key":
      return "warn";
    default:
      return "neutral";
  }
}

export default function AuditPage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [records, setRecords] = useState<AuditLogRecord[]>([]);
  const [policies, setPolicies] = useState<EvidenceRetentionPolicyRecord[]>([]);
  const [legalHolds, setLegalHolds] = useState<EvidenceLegalHoldRecord[]>([]);
  const [deletionExceptions, setDeletionExceptions] = useState<
    EvidenceDeletionExceptionRecord[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AuditTabId>("log");
  const [filterModule, setFilterModule] = useState<string>("");

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
        (result as any[])?.map((r: any) => ({
          auditId: r.auditId || r.id || "",
          actorId: r.actorId || null,
          actorType: r.actorType || "system",
          tenantId: r.tenantId || null,
          moduleName: r.moduleName || r.module || "",
          actionName: r.actionName || r.action || "",
          resourceType: r.resourceType || "",
          resourceId: r.resourceId || null,
          oldValuesSummary: r.oldValuesSummary || undefined,
          newValuesSummary: r.newValuesSummary || undefined,
          requestId: r.requestId || "",
          createdAt: r.createdAt || "",
        })) || [];
      setRecords(recordsList);
      setPolicies(policyList);
      setLegalHolds(holdList);
      setDeletionExceptions(deletionExceptionList);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const activeLegalHolds = useMemo(
    () => legalHolds.filter((hold) => hold.status === "active"),
    [legalHolds],
  );
  const activeDeletionExceptions = useMemo(
    () => deletionExceptions.filter((exception) => exception.status === "active"),
    [deletionExceptions],
  );

  // Resource-keyed lookups so a HOLD / EXEMPT badge can be rendered inline in
  // the audit table resource cell (canvas Q-ADM16 badge-in-resource-cell).
  const holdByResource = useMemo(() => {
    const map = new Map<string, EvidenceLegalHoldRecord>();
    for (const hold of activeLegalHolds) {
      if (hold.subjectId) map.set(hold.subjectId, hold);
    }
    return map;
  }, [activeLegalHolds]);

  const exemptByResource = useMemo(() => {
    const map = new Map<string, EvidenceDeletionExceptionRecord>();
    for (const exception of activeDeletionExceptions) {
      if (exception.subjectId) map.set(exception.subjectId, exception);
      if (exception.sourceResourceId)
        map.set(exception.sourceResourceId, exception);
    }
    return map;
  }, [activeDeletionExceptions]);

  const moduleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of records) {
      if (!record.moduleName) continue;
      counts.set(record.moduleName, (counts.get(record.moduleName) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [records]);

  const filtered = useMemo(
    () =>
      records.filter((r) => !filterModule || r.moduleName === filterModule),
    [records, filterModule],
  );

  const rows = useMemo<AuditTableRow[]>(
    () =>
      filtered.map((record) => ({
        ...record,
        hold: record.resourceId
          ? holdByResource.get(record.resourceId)
          : undefined,
        exempt: record.resourceId
          ? exemptByResource.get(record.resourceId)
          : undefined,
      })),
    [filtered, holdByResource, exemptByResource],
  );

  const copy =
    locale === "en"
      ? {
          title: "Audit & Evidence Governance",
          subtitle:
            "Append-only · legal hold + deletion exception shown via badge (Q-ADM16)",
          refresh: "Refresh (T6 manual)",
          refreshing: "Refreshing…",
          exportCsv: "Export CSV",
          tabLog: "Audit log",
          tabPolicy: "Retention policies",
          tabHold: "Active legal holds",
          tabExcept: "Deletion exceptions",
          all: "All",
          showing: "Showing",
          legalHoldTip: "legal hold",
          deletionExceptionTip: "deletion exception",
          expires: "expires",
          case: "case",
          owner: "owner",
          reason: "reason",
          loading: "Loading audit log…",
          emptyLog: "No audit records match the current filter.",
          emptyPolicy: "No retention policies configured.",
          emptyHold: "No active legal holds.",
          emptyExcept: "No active deletion exceptions.",
          holdsTitle: "Active legal holds",
          exceptTitle: "Deletion exceptions",
          colWhen: "WHEN",
          colActorType: "ACTOR TYPE",
          colActor: "ACTOR",
          colModule: "MODULE",
          colAction: "ACTION",
          colResource: "RESOURCE",
          colRequest: "REQUEST",
          polFamily: "FAMILY",
          polAuthority: "AUTHORITY",
          polRetention: "RETENTION",
          polDownload: "DOWNLOAD",
          polHold: "LEGAL HOLD",
          holdResource: "RESOURCE",
          holdCase: "CASE",
          holdReason: "REASON",
          holdPlacedBy: "PLACED BY",
          holdPlacedAt: "PLACED AT",
          exReason: "REASON",
          exExpires: "EXPIRES",
          signedTtl: (m: number) => `signed url · ${m}m ttl`,
          noDownload: "no download",
          holdEnabled: "supported",
          holdDisabled: "not supported",
          holdSupported: "Legal hold supported",
        }
      : {
          title: "Audit & Evidence Governance",
          subtitle:
            "append-only · legal hold + deletion exception 透過 badge 顯示 (Q-ADM16)",
          refresh: "重新整理 (T6 手動)",
          refreshing: "重新整理中…",
          exportCsv: "匯出 csv",
          tabLog: "Audit log",
          tabPolicy: "Retention policies",
          tabHold: "Active legal holds",
          tabExcept: "Deletion exceptions",
          all: "全部",
          showing: "顯示",
          legalHoldTip: "legal hold",
          deletionExceptionTip: "deletion exception",
          expires: "到期",
          case: "案號",
          owner: "負責人",
          reason: "原因",
          loading: "載入稽核紀錄中…",
          emptyLog: "沒有符合目前篩選的稽核紀錄。",
          emptyPolicy: "尚未設定保留政策。",
          emptyHold: "目前沒有作用中的法定保留。",
          emptyExcept: "目前沒有作用中的刪除例外。",
          holdsTitle: "Active legal holds",
          exceptTitle: "Deletion exceptions",
          colWhen: "WHEN",
          colActorType: "ACTOR TYPE",
          colActor: "ACTOR",
          colModule: "MODULE",
          colAction: "ACTION",
          colResource: "RESOURCE",
          colRequest: "REQUEST",
          polFamily: "FAMILY",
          polAuthority: "AUTHORITY",
          polRetention: "RETENTION",
          polDownload: "DOWNLOAD",
          polHold: "LEGAL HOLD",
          holdResource: "RESOURCE",
          holdCase: "CASE",
          holdReason: "REASON",
          holdPlacedBy: "PLACED BY",
          holdPlacedAt: "PLACED AT",
          exReason: "REASON",
          exExpires: "EXPIRES",
          signedTtl: (m: number) => `signed url · ${m}m ttl`,
          noDownload: "no download",
          holdEnabled: "supported",
          holdDisabled: "not supported",
          holdSupported: "支援法定保留",
        };

  const tabDefs: { id: AuditTabId; label: string; badge?: number }[] = [
    { id: "log", label: copy.tabLog },
    { id: "policy", label: copy.tabPolicy },
    { id: "hold", label: copy.tabHold, badge: activeLegalHolds.length },
    { id: "except", label: copy.tabExcept, badge: activeDeletionExceptions.length },
  ];

  const tabNodes = tabDefs.map((def) => (
    <button
      key={def.id}
      type="button"
      onClick={() => setActiveTab(def.id)}
      style={tabButtonStyle}
    >
      <span>{def.label}</span>
      {def.badge ? (
        <CanvasPill theme={theme} tone="warn">
          {def.badge}
        </CanvasPill>
      ) : null}
    </button>
  ));
  const activeTabNode =
    tabNodes[tabDefs.findIndex((def) => def.id === activeTab)] ?? tabNodes[0];

  const auditColumns: CanvasTableColumn<AuditTableRow>[] = [
    {
      h: copy.colWhen,
      w: 170,
      mono: true,
      r: (row) => formatDateTime(row.createdAt),
    },
    {
      h: copy.colActorType,
      w: 140,
      r: (row) => (
        <CanvasPill theme={theme} tone={actorTone(row.actorType)} dot>
          {formatPlatformCodeLabel(locale, row.actorType)}
        </CanvasPill>
      ),
    },
    {
      h: copy.colActor,
      w: 220,
      r: (row) =>
        truncate(
          row.actorId || formatPlatformCodeLabel(locale, "system"),
          28,
        ),
    },
    {
      h: copy.colModule,
      w: 140,
      r: (row) => (
        <span style={monoCellStyle}>
          {formatPlatformCodeLabel(locale, row.moduleName)}
        </span>
      ),
    },
    {
      h: copy.colAction,
      w: 200,
      r: (row) => <span style={actionCellStyle}>{row.actionName}</span>,
    },
    {
      h: copy.colResource,
      w: 240,
      r: (row) => (
        <div style={resourceCellStyle}>
          <span style={monoCellStyle}>
            {row.resourceType}
            {row.resourceId ? `:${truncate(row.resourceId, 10)}` : ""}
          </span>
          {row.hold ? (
            <span
              title={`${copy.legalHoldTip} · ${copy.case} ${row.hold.caseNumber} · ${copy.owner} ${row.hold.placedByActorId}`}
            >
              <CanvasPill theme={theme} tone="danger">
                HOLD
              </CanvasPill>
            </span>
          ) : null}
          {row.exempt ? (
            <span
              title={`${copy.deletionExceptionTip} · ${formatPlatformCodeLabel(
                locale,
                row.exempt.reasonCode,
              )} · ${copy.expires} ${formatDateTime(row.exempt.expiresAt)}`}
            >
              <CanvasPill theme={theme} tone="warn">
                EXEMPT
              </CanvasPill>
            </span>
          ) : null}
        </div>
      ),
    },
    {
      h: copy.colRequest,
      mono: true,
      r: (row) => row.requestId || "—",
    },
  ];

  const policyColumns: CanvasTableColumn<
    EvidenceRetentionPolicyRecord & Record<string, unknown>
  >[] = [
    {
      h: copy.polFamily,
      w: 240,
      r: (policy) => (
        <div style={{ display: "grid", gap: 3 }}>
          <span style={{ fontWeight: 600, color: theme.text, fontSize: 12.5 }}>
            {formatPlatformCodeLabel(locale, policy.family)}
          </span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {policy.description}
          </span>
        </div>
      ),
    },
    {
      h: copy.polAuthority,
      w: 160,
      r: (policy) => formatPlatformCodeLabel(locale, policy.authorityModule),
    },
    {
      h: copy.polRetention,
      w: 140,
      mono: true,
      r: (policy) =>
        `${policy.hotRetentionDays}d / ${
          policy.archiveRetentionDays ? `${policy.archiveRetentionDays}d` : "—"
        }`,
    },
    {
      h: copy.polDownload,
      w: 170,
      r: (policy) =>
        policy.downloadControl?.mode === "signed_url"
          ? copy.signedTtl(policy.downloadControl.ttlMinutes ?? 0)
          : copy.noDownload,
    },
    {
      h: copy.polHold,
      r: (policy) => (
        <CanvasPill
          theme={theme}
          tone={policy.legalHold.supported ? "success" : "neutral"}
          dot
        >
          {policy.legalHold.supported ? copy.holdEnabled : copy.holdDisabled}
        </CanvasPill>
      ),
    },
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        tabs={tabNodes}
        activeTab={activeTabNode}
        actions={
          <>
            <CanvasBtn theme={theme} variant="secondary" icon="filter">
              {copy.exportCsv}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="secondary"
              icon="arrow"
              onClick={() => void loadRecords()}
            >
              {loading && records.length > 0 ? copy.refreshing : copy.refresh}
            </CanvasBtn>
          </>
        }
      />

      <div style={bodyStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={`${getPlatformLabel(locale, "error")}: ${error}`}
          />
        ) : null}

        {loading && records.length === 0 ? (
          <CanvasCard theme={theme} title={copy.title} subtitle={copy.loading}>
            <div style={stateStyle}>{copy.loading}</div>
          </CanvasCard>
        ) : activeTab === "log" ? (
          <>
            <div style={pillRowStyle}>
              <button
                type="button"
                style={pillButtonStyle}
                onClick={() => setFilterModule("")}
              >
                <CanvasPill
                  theme={theme}
                  tone={filterModule ? "neutral" : "accent"}
                  dot
                >
                  {copy.all} {records.length.toLocaleString()}
                </CanvasPill>
              </button>
              {moduleCounts.map(([moduleName, count]) => (
                <button
                  key={moduleName}
                  type="button"
                  style={pillButtonStyle}
                  onClick={() =>
                    setFilterModule((current) =>
                      current === moduleName ? "" : moduleName,
                    )
                  }
                >
                  <CanvasPill
                    theme={theme}
                    tone={filterModule === moduleName ? "accent" : "neutral"}
                    dot
                  >
                    {formatPlatformCodeLabel(locale, moduleName)} {count}
                  </CanvasPill>
                </button>
              ))}
            </div>

            <CanvasCard theme={theme} padding={0} style={{ overflow: "hidden" }}>
              {rows.length === 0 ? (
                <div style={stateStyle}>{copy.emptyLog}</div>
              ) : (
                <CanvasTable<AuditTableRow>
                  theme={theme}
                  columns={auditColumns}
                  rows={rows}
                />
              )}
            </CanvasCard>

            <div style={summaryGridStyle}>
              <CanvasCard
                theme={theme}
                title={`${copy.holdsTitle} · ${activeLegalHolds.length}`}
              >
                {activeLegalHolds.length === 0 ? (
                  <div style={stateStyle}>{copy.emptyHold}</div>
                ) : (
                  <CanvasDL
                    theme={theme}
                    cols={1}
                    items={(() => {
                      const hold = activeLegalHolds[0]!;
                      return [
                        {
                          k: copy.holdResource,
                          v: `${formatPlatformCodeLabel(locale, hold.family)} · ${hold.subjectId}`,
                          mono: true,
                        },
                        { k: copy.holdCase, v: hold.caseNumber, mono: true },
                        {
                          k: copy.holdPlacedBy,
                          v: hold.placedByActorId,
                        },
                        {
                          k: copy.holdPlacedAt,
                          v: formatDateTime(hold.placedAt),
                          mono: true,
                        },
                        {
                          k: copy.holdReason,
                          v:
                            hold.reasonNote ||
                            formatPlatformCodeLabel(locale, hold.reasonCode),
                        },
                      ];
                    })()}
                  />
                )}
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={`${copy.exceptTitle} · ${activeDeletionExceptions.length}`}
              >
                {activeDeletionExceptions.length === 0 ? (
                  <div style={stateStyle}>{copy.emptyExcept}</div>
                ) : (
                  <CanvasDL
                    theme={theme}
                    cols={1}
                    items={(() => {
                      const exception = activeDeletionExceptions[0]!;
                      return [
                        {
                          k: copy.holdResource,
                          v: `${exception.sourceResourceType} · ${exception.sourceResourceId}`,
                          mono: true,
                        },
                        {
                          k: copy.exExpires,
                          v: formatDateTime(exception.expiresAt),
                          mono: true,
                        },
                        {
                          k: copy.exReason,
                          v:
                            exception.reasonNote ||
                            formatPlatformCodeLabel(
                              locale,
                              exception.reasonCode,
                            ),
                        },
                        {
                          k: "REASON CODE",
                          v: exception.reasonCode,
                          mono: true,
                        },
                      ];
                    })()}
                  />
                )}
              </CanvasCard>
            </div>
          </>
        ) : activeTab === "policy" ? (
          <CanvasCard theme={theme} padding={0} style={{ overflow: "hidden" }}>
            {policies.length === 0 ? (
              <div style={stateStyle}>{copy.emptyPolicy}</div>
            ) : (
              <CanvasTable
                theme={theme}
                columns={policyColumns}
                rows={
                  policies as (EvidenceRetentionPolicyRecord &
                    Record<string, unknown>)[]
                }
              />
            )}
          </CanvasCard>
        ) : activeTab === "hold" ? (
          <div style={summaryGridStyle}>
            {activeLegalHolds.length === 0 ? (
              <CanvasCard theme={theme} title={copy.holdsTitle}>
                <div style={stateStyle}>{copy.emptyHold}</div>
              </CanvasCard>
            ) : (
              activeLegalHolds.map((hold) => (
                <CanvasCard
                  key={hold.holdId}
                  theme={theme}
                  title={hold.caseNumber}
                  subtitle={formatPlatformCodeLabel(locale, hold.family)}
                >
                  <CanvasDL
                    theme={theme}
                    cols={1}
                    items={[
                      { k: copy.holdResource, v: hold.subjectId, mono: true },
                      { k: copy.holdPlacedBy, v: hold.placedByActorId },
                      {
                        k: copy.holdPlacedAt,
                        v: formatDateTime(hold.placedAt),
                        mono: true,
                      },
                      {
                        k: copy.holdReason,
                        v:
                          hold.reasonNote ||
                          formatPlatformCodeLabel(locale, hold.reasonCode),
                      },
                    ]}
                  />
                </CanvasCard>
              ))
            )}
          </div>
        ) : (
          <div style={summaryGridStyle}>
            {activeDeletionExceptions.length === 0 ? (
              <CanvasCard theme={theme} title={copy.exceptTitle}>
                <div style={stateStyle}>{copy.emptyExcept}</div>
              </CanvasCard>
            ) : (
              activeDeletionExceptions.map((exception) => (
                <CanvasCard
                  key={exception.exceptionId}
                  theme={theme}
                  title={`${exception.sourceResourceType} · ${exception.sourceResourceId}`}
                  subtitle={formatPlatformCodeLabel(locale, exception.family)}
                >
                  <CanvasDL
                    theme={theme}
                    cols={1}
                    items={[
                      {
                        k: copy.exExpires,
                        v: formatDateTime(exception.expiresAt),
                        mono: true,
                      },
                      {
                        k: copy.exReason,
                        v:
                          exception.reasonNote ||
                          formatPlatformCodeLabel(locale, exception.reasonCode),
                      },
                      {
                        k: "REASON CODE",
                        v: exception.reasonCode,
                        mono: true,
                      },
                    ]}
                  />
                </CanvasCard>
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}
