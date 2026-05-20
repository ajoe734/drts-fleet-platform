/**
 * Audit Trail Page
 * Platform audit log with filtering and record inspection.
 */

"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  usePlatformAdminClient,
  formatDateTime,
  truncate,
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
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";

type TFn = (key: string, params?: Record<string, string | number>) => string;

type TabKey = "log" | "policies" | "holds" | "exceptions";

type AuditRow = AuditLogRecord & Record<string, unknown>;
type PolicyRow = EvidenceRetentionPolicyRecord & Record<string, unknown>;
type HoldRow = EvidenceLegalHoldRecord & Record<string, unknown>;
type ExceptionRow = EvidenceDeletionExceptionRecord & Record<string, unknown>;

const th = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};

const pillRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 16,
};

const filterLabelStyle: CSSProperties = {
  fontSize: 11,
  color: th.textMuted,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  marginRight: 4,
};

const pillButtonStyle: CSSProperties = {
  background: "transparent",
  border: 0,
  padding: 0,
  cursor: "pointer",
  fontFamily: "inherit",
};

const emptyStateStyle: CSSProperties = {
  padding: "32px 16px",
  textAlign: "center",
  color: th.textMuted,
  fontSize: 12.5,
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
};

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
  const [filterModule, setFilterModule] = useState<string>("");
  const [filterActorType, setFilterActorType] = useState<string>("");
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("log");

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
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const moduleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of records) {
      if (!r.moduleName) continue;
      counts.set(r.moduleName, (counts.get(r.moduleName) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [records]);

  const actorTypes = useMemo(
    () => [...new Set(records.map((r) => r.actorType).filter(Boolean))],
    [records],
  );

  const filtered = useMemo(
    () =>
      records.filter((r) => {
        if (filterModule && r.moduleName !== filterModule) return false;
        if (filterActorType && r.actorType !== filterActorType) return false;
        return true;
      }),
    [records, filterModule, filterActorType],
  );

  const activeLegalHolds = useMemo(
    () => legalHolds.filter((hold) => hold.status === "active"),
    [legalHolds],
  );
  const activeDeletionExceptions = useMemo(
    () => deletionExceptions.filter((e) => e.status === "active"),
    [deletionExceptions],
  );
  const signedDownloadFamilies = useMemo(
    () =>
      policies.filter(
        (policy) => policy.downloadControl?.mode === "signed_url",
      ),
    [policies],
  );

  const tabLabels: Record<TabKey, string> = {
    log: locale === "en" ? "Audit log" : "Audit log",
    policies: locale === "en" ? "Retention policies" : "Retention policies",
    holds: locale === "en" ? "Legal holds" : "Legal holds",
    exceptions: locale === "en" ? "Deletion exceptions" : "Deletion exceptions",
  };
  const tabKeys: TabKey[] = ["log", "policies", "holds", "exceptions"];
  const tabs = tabKeys.map((key) => (
    <button
      key={key}
      type="button"
      onClick={() => setActiveTab(key)}
      style={{
        ...pillButtonStyle,
        color: activeTab === key ? th.text : th.textMuted,
      }}
    >
      {tabLabels[key]}
    </button>
  ));
  const activeTabNode = tabs[tabKeys.indexOf(activeTab)];

  const subtitle = loading
    ? t("audit.loading")
    : t("audit.subtitle", { count: records.length });

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        sticky={false}
        title={t("audit.title")}
        subtitle={subtitle}
        tabs={tabs}
        activeTab={activeTabNode}
        actions={
          <>
            <CanvasBtn
              theme={th}
              variant="secondary"
              size="sm"
              icon="refresh"
              onClick={() => void loadRecords()}
            >
              {t("common.refresh")}
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="secondary"
              size="sm"
              icon="export"
              disabled
            >
              {locale === "en" ? "Export CSV" : "匯出 CSV"}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title={`${getPlatformLabel(locale, "error")}: ${error}`}
            body={
              locale === "en"
                ? "Failed to load audit and governance records."
                : "稽核或治理資料載入失敗。"
            }
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label={t("audit.metrics.policyFamilies")}
            value={String(policies.length)}
          />
          <CanvasKPI
            theme={th}
            label={t("audit.metrics.signedDownload")}
            value={String(signedDownloadFamilies.length)}
          />
          <CanvasKPI
            theme={th}
            label={t("audit.metrics.activeHolds")}
            value={String(activeLegalHolds.length)}
          />
          <CanvasKPI
            theme={th}
            label={t("audit.metrics.activeExceptions")}
            value={String(activeDeletionExceptions.length)}
          />
        </div>

        {activeTab === "log" ? (
          <AuditLogPanel
            t={t}
            locale={locale}
            loading={loading}
            records={records}
            filtered={filtered}
            moduleCounts={moduleCounts}
            actorTypes={actorTypes}
            filterModule={filterModule}
            filterActorType={filterActorType}
            onFilterModule={setFilterModule}
            onFilterActorType={setFilterActorType}
            expandedAuditId={expandedAuditId}
            onToggleExpand={(id) =>
              setExpandedAuditId((current) => (current === id ? null : id))
            }
          />
        ) : null}

        {activeTab === "policies" ? (
          <PoliciesPanel t={t} locale={locale} policies={policies} />
        ) : null}

        {activeTab === "holds" ? (
          <HoldsPanel t={t} locale={locale} holds={activeLegalHolds} />
        ) : null}

        {activeTab === "exceptions" ? (
          <ExceptionsPanel
            t={t}
            locale={locale}
            exceptions={activeDeletionExceptions}
          />
        ) : null}
      </div>
    </div>
  );
}

function AuditLogPanel({
  t,
  locale,
  loading,
  records,
  filtered,
  moduleCounts,
  actorTypes,
  filterModule,
  filterActorType,
  onFilterModule,
  onFilterActorType,
  expandedAuditId,
  onToggleExpand,
}: {
  t: TFn;
  locale: "en" | "zh";
  loading: boolean;
  records: AuditLogRecord[];
  filtered: AuditLogRecord[];
  moduleCounts: Array<[string, number]>;
  actorTypes: string[];
  filterModule: string;
  filterActorType: string;
  onFilterModule: (value: string) => void;
  onFilterActorType: (value: string) => void;
  expandedAuditId: string | null;
  onToggleExpand: (id: string) => void;
}) {
  const columns: CanvasTableColumn<AuditRow>[] = [
    {
      h: locale === "en" ? "WHEN" : "時間",
      w: 170,
      mono: true,
      r: (row) => formatDateTime(row.createdAt) || "—",
    },
    {
      h: locale === "en" ? "ACTOR TYPE" : "操作者類型",
      w: 110,
      mono: true,
      r: (row) => (
        <CanvasPill theme={th} tone="neutral">
          {formatPlatformCodeLabel(locale, row.actorType)}
        </CanvasPill>
      ),
    },
    {
      h: locale === "en" ? "ACTOR" : "操作者",
      w: 220,
      r: (row) => (
        <span
          style={{ color: th.text, fontFamily: th.monoFamily, fontSize: 11.5 }}
        >
          {row.actorId
            ? truncate(row.actorId, 28)
            : formatPlatformCodeLabel(locale, "system")}
        </span>
      ),
    },
    {
      h: locale === "en" ? "MODULE" : "模組",
      w: 140,
      mono: true,
      r: (row) => formatPlatformCodeLabel(locale, row.moduleName),
    },
    {
      h: locale === "en" ? "ACTION" : "動作",
      w: 180,
      mono: true,
      r: (row) => (
        <span
          style={{
            color: th.accent,
            fontFamily: th.monoFamily,
            fontSize: 11,
          }}
        >
          {formatPlatformCodeLabel(locale, row.actionName)}
        </span>
      ),
    },
    {
      h: locale === "en" ? "RESOURCE" : "資源",
      w: 200,
      mono: true,
      r: (row) => (
        <span style={{ fontFamily: th.monoFamily, fontSize: 11.5 }}>
          {formatPlatformCodeLabel(locale, row.resourceType) || "—"}
          {row.resourceId ? `:${truncate(row.resourceId, 10)}` : ""}
        </span>
      ),
    },
    {
      h: locale === "en" ? "TENANT" : "租戶",
      w: 120,
      mono: true,
      r: (row) => row.tenantId ?? "—",
    },
    {
      h: locale === "en" ? "REQUEST" : "請求",
      w: 160,
      mono: true,
      r: (row) =>
        row.requestId ? (
          <span style={{ color: th.textMuted, fontSize: 11.5 }}>
            {truncate(row.requestId, 18)}
          </span>
        ) : (
          <span style={{ color: th.textDim }}>—</span>
        ),
    },
    {
      h: locale === "en" ? "DETAILS" : "詳情",
      w: 110,
      r: (row) =>
        row.oldValuesSummary || row.newValuesSummary ? (
          <CanvasBtn
            theme={th}
            variant="ghost"
            size="xs"
            onClick={() => onToggleExpand(row.auditId)}
          >
            {expandedAuditId === row.auditId
              ? t("audit.collapse")
              : t("audit.expand")}
          </CanvasBtn>
        ) : (
          <span style={{ color: th.textDim, fontSize: 11.5 }}>—</span>
        ),
    },
  ];

  const allPillTone = !filterModule ? "accent" : "neutral";
  const totalLabel = locale === "en" ? "All" : "全部";

  return (
    <>
      <div style={pillRowStyle}>
        <button
          type="button"
          onClick={() => onFilterModule("")}
          style={pillButtonStyle}
          aria-pressed={!filterModule}
        >
          <CanvasPill theme={th} tone={allPillTone} dot>
            {`${totalLabel} ${records.length}`}
          </CanvasPill>
        </button>
        {moduleCounts.map(([moduleName, count]) => {
          const selected = filterModule === moduleName;
          return (
            <button
              key={moduleName}
              type="button"
              onClick={() => onFilterModule(selected ? "" : moduleName)}
              style={pillButtonStyle}
              aria-pressed={selected}
            >
              <CanvasPill theme={th} tone={selected ? "accent" : "neutral"} dot>
                {`${formatPlatformCodeLabel(locale, moduleName)} ${count}`}
              </CanvasPill>
            </button>
          );
        })}
      </div>

      {actorTypes.length > 0 ? (
        <div style={filterRowStyle}>
          <span style={filterLabelStyle}>{t("audit.actorLabel")}</span>
          <div style={pillRowStyle}>
            <button
              type="button"
              onClick={() => onFilterActorType("")}
              style={pillButtonStyle}
              aria-pressed={!filterActorType}
            >
              <CanvasPill
                theme={th}
                tone={!filterActorType ? "accent" : "neutral"}
              >
                {t("common.all")}
              </CanvasPill>
            </button>
            {actorTypes.map((actorType) => {
              const selected = filterActorType === actorType;
              return (
                <button
                  key={actorType}
                  type="button"
                  onClick={() => onFilterActorType(selected ? "" : actorType)}
                  style={pillButtonStyle}
                  aria-pressed={selected}
                >
                  <CanvasPill theme={th} tone={selected ? "accent" : "neutral"}>
                    {formatPlatformCodeLabel(locale, actorType)}
                  </CanvasPill>
                </button>
              );
            })}
          </div>
          <span
            style={{ marginLeft: "auto", fontSize: 12, color: th.textMuted }}
          >
            {t("audit.showingOf", {
              shown: filtered.length,
              total: records.length,
            })}
          </span>
        </div>
      ) : null}

      <CanvasCard theme={th} padding={0}>
        {loading ? (
          <div style={emptyStateStyle}>{t("audit.loading")}</div>
        ) : filtered.length === 0 ? (
          <div style={emptyStateStyle}>{t("audit.empty")}</div>
        ) : (
          <>
            <CanvasTable<AuditRow>
              theme={th}
              columns={columns}
              rows={filtered as AuditRow[]}
            />
            {expandedAuditId ? (
              <ExpandedDetailRow
                record={filtered.find((r) => r.auditId === expandedAuditId)}
                t={t}
              />
            ) : null}
          </>
        )}
      </CanvasCard>
    </>
  );
}

function ExpandedDetailRow({
  record,
  t,
}: {
  record: AuditLogRecord | undefined;
  t: TFn;
}) {
  if (!record) return null;
  return (
    <div
      style={{
        padding: 14,
        borderTop: `1px solid ${th.border}`,
        background: th.surfaceLo,
      }}
    >
      <div style={detailGridStyle}>
        <AuditValueCard
          title={t("audit.oldValues")}
          payload={record.oldValuesSummary}
          t={t}
        />
        <AuditValueCard
          title={t("audit.newValues")}
          payload={record.newValuesSummary}
          t={t}
        />
      </div>
    </div>
  );
}

function PoliciesPanel({
  t,
  locale,
  policies,
}: {
  t: TFn;
  locale: "en" | "zh";
  policies: EvidenceRetentionPolicyRecord[];
}) {
  const columns: CanvasTableColumn<PolicyRow>[] = [
    {
      h: t("audit.policies.family"),
      w: 220,
      r: (row) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 600 }}>
            {formatPlatformCodeLabel(locale, row.family)}
          </span>
          {row.description ? (
            <span style={{ fontSize: 11.5, color: th.textMuted }}>
              {row.description}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      h: t("audit.policies.authority"),
      w: 160,
      mono: true,
      r: (row) => formatPlatformCodeLabel(locale, row.authorityModule),
    },
    {
      h: t("audit.policies.retention"),
      w: 140,
      mono: true,
      r: (row) =>
        `${row.hotRetentionDays}d / ${
          row.archiveRetentionDays ? `${row.archiveRetentionDays}d` : "—"
        }`,
    },
    {
      h: t("audit.policies.download"),
      w: 200,
      r: (row) =>
        row.downloadControl?.mode === "signed_url" ? (
          <CanvasPill theme={th} tone="info" dot>
            {t("audit.policies.signedDownloadTtl", {
              minutes: row.downloadControl.ttlMinutes ?? 0,
            })}
          </CanvasPill>
        ) : (
          <span style={{ color: th.textMuted, fontSize: 12 }}>
            {t("audit.policies.noDownload")}
          </span>
        ),
    },
    {
      h: t("audit.policies.legalHold"),
      w: 140,
      r: (row) => (
        <CanvasPill
          theme={th}
          tone={row.legalHold.supported ? "success" : "neutral"}
          dot
        >
          {row.legalHold.supported
            ? t("audit.policies.holdEnabled")
            : t("audit.policies.holdDisabled")}
        </CanvasPill>
      ),
    },
  ];

  return (
    <CanvasCard
      theme={th}
      title={t("audit.policies.title")}
      subtitle={t("audit.policies.subtitle")}
      padding={0}
    >
      {policies.length === 0 ? (
        <div style={emptyStateStyle}>—</div>
      ) : (
        <CanvasTable<PolicyRow>
          theme={th}
          columns={columns}
          rows={policies as PolicyRow[]}
        />
      )}
    </CanvasCard>
  );
}

function HoldsPanel({
  t,
  locale,
  holds,
}: {
  t: TFn;
  locale: "en" | "zh";
  holds: EvidenceLegalHoldRecord[];
}) {
  const columns: CanvasTableColumn<HoldRow>[] = [
    {
      h: t("audit.holds.family"),
      w: 180,
      r: (row) => formatPlatformCodeLabel(locale, row.family),
    },
    {
      h: t("audit.holds.subject"),
      w: 200,
      mono: true,
      r: (row) => row.subjectId,
    },
    {
      h: t("audit.holds.case"),
      w: 180,
      mono: true,
      r: (row) => row.caseNumber,
    },
    {
      h: t("audit.holds.status"),
      w: 120,
      r: (row) => (
        <CanvasPill theme={th} tone="warn" dot>
          {formatPlatformCodeLabel(locale, row.status)}
        </CanvasPill>
      ),
    },
  ];

  return (
    <CanvasCard theme={th} title={t("audit.holds.title")} padding={0}>
      {holds.length === 0 ? (
        <div style={emptyStateStyle}>{t("audit.holds.empty")}</div>
      ) : (
        <CanvasTable<HoldRow>
          theme={th}
          columns={columns}
          rows={holds as HoldRow[]}
        />
      )}
    </CanvasCard>
  );
}

function ExceptionsPanel({
  t,
  locale,
  exceptions,
}: {
  t: TFn;
  locale: "en" | "zh";
  exceptions: EvidenceDeletionExceptionRecord[];
}) {
  const columns: CanvasTableColumn<ExceptionRow>[] = [
    {
      h: t("audit.exceptions.family"),
      w: 180,
      r: (row) => formatPlatformCodeLabel(locale, row.family),
    },
    {
      h: t("audit.exceptions.subject"),
      w: 200,
      mono: true,
      r: (row) => row.subjectId,
    },
    {
      h: t("audit.exceptions.reason"),
      w: 200,
      r: (row) => (
        <CanvasPill theme={th} tone="info" dot>
          {formatPlatformCodeLabel(locale, row.reasonCode)}
        </CanvasPill>
      ),
    },
    {
      h: t("audit.exceptions.expiresAt"),
      w: 180,
      mono: true,
      r: (row) => formatDateTime(row.expiresAt),
    },
  ];

  return (
    <CanvasCard theme={th} title={t("audit.exceptions.title")} padding={0}>
      {exceptions.length === 0 ? (
        <div style={emptyStateStyle}>{t("audit.exceptions.empty")}</div>
      ) : (
        <CanvasTable<ExceptionRow>
          theme={th}
          columns={columns}
          rows={exceptions as ExceptionRow[]}
        />
      )}
    </CanvasCard>
  );
}

function AuditValueCard({
  title,
  payload,
  t,
}: {
  title: ReactNode;
  payload: Record<string, unknown> | undefined;
  t: TFn;
}) {
  return (
    <div
      style={{
        border: `1px solid ${th.border}`,
        borderRadius: 8,
        padding: 12,
        background: th.surface,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 12 }}>
        {title}
      </div>
      {payload ? (
        <pre
          style={{
            margin: 0,
            fontFamily: th.monoFamily,
            fontSize: 11.5,
            color: th.text,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {JSON.stringify(payload, null, 2)}
        </pre>
      ) : (
        <span style={{ fontSize: 11.5, color: th.textMuted }}>
          {t("common.noValues")}
        </span>
      )}
    </div>
  );
}
