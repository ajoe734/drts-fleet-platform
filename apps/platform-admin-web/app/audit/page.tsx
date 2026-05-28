"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";
import {
  EVIDENCE_DELETION_EXCEPTION_REASON_CODES,
  EVIDENCE_LEGAL_HOLD_REASON_CODES,
  EVIDENCE_RETENTION_FAMILIES,
  type ActionReceipt,
  type AuditLogRecord,
  type EmptyReason,
  type EvidenceDeletionExceptionRecord,
  type EvidenceLegalHoldRecord,
  type EvidenceRetentionFamily,
  type EvidenceRetentionPolicyRecord,
  type ResourceActionDescriptor,
} from "@drts/contracts";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";

type AuditTab = "log" | "policy" | "hold" | "exception";
type TimeRange = "all" | "24h" | "7d" | "30d";
type ReceiptState = ActionReceipt & { href: string };
type AuditEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

type AuditRecordWithActions = AuditLogRecord & {
  availableActions?: ResourceActionDescriptor[];
  ownerApp?: "platform-admin" | "ops-console" | "tenant-console";
};

type HoldRecordWithActions = EvidenceLegalHoldRecord & {
  availableActions?: ResourceActionDescriptor[];
};

type ExceptionRecordWithActions = EvidenceDeletionExceptionRecord & {
  availableActions?: ResourceActionDescriptor[];
};

type GovernanceBadge = {
  owner: string;
  expiresAt?: string | null;
  reason?: string | null;
};

type AuditRow = AuditRecordWithActions &
  Record<string, unknown> & {
    legalHold?: GovernanceBadge | null;
    deletionException?: GovernanceBadge | null;
  };

type ModalState =
  | {
      kind: "create-hold";
      descriptor: ResourceActionDescriptor;
      seed?: Partial<CreateHoldForm>;
    }
  | {
      kind: "release-hold";
      descriptor: ResourceActionDescriptor;
      hold: HoldRecordWithActions;
    }
  | {
      kind: "create-exception";
      descriptor: ResourceActionDescriptor;
      seed?: Partial<CreateExceptionForm>;
    }
  | {
      kind: "resolve-exception";
      descriptor: ResourceActionDescriptor;
      exception: ExceptionRecordWithActions;
    };

type CreateHoldForm = {
  family: EvidenceRetentionFamily;
  subjectId: string;
  caseNumber: string;
  tenantId: string;
  manifestHash: string;
  reasonCode: string;
  reasonNote: string;
};

type CreateExceptionForm = {
  family: EvidenceRetentionFamily;
  subjectId: string;
  sourceResourceType: string;
  sourceResourceId: string;
  reviewerActorId: string;
  expiresAt: string;
  tenantId: string;
  manifestHash: string;
  reasonCode: string;
  reasonNote: string;
};

type PageCopy = {
  title: string;
  subtitle: string;
  refresh: string;
  refreshing: string;
  refreshTier: string;
  filters: {
    search: string;
    module: string;
    actor: string;
    resource: string;
    time: string;
    all: string;
  };
  tabs: Record<AuditTab, string>;
  cards: {
    records: string;
    holds: string;
    exceptions: string;
    policies: string;
  };
  sections: {
    log: string;
    policies: string;
    holds: string;
    exceptions: string;
    detail: string;
  };
  actions: {
    expand: string;
    collapse: string;
    openResource: string;
    openOwningApp: string;
    grantHold: string;
    liftHold: string;
    grantException: string;
    revokeException: string;
    viewAudit: string;
    apply: string;
    cancel: string;
  };
  empty: Record<Exclude<EmptyReason, "driver_not_eligible">, string>;
  emptyHint: Record<Exclude<EmptyReason, "driver_not_eligible">, string>;
  banner: {
    error: string;
    receipt: string;
    descriptorFallback: string;
  };
  table: {
    when: string;
    actorType: string;
    actor: string;
    module: string;
    action: string;
    resource: string;
    request: string;
    actions: string;
  };
};

const th = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const PAGE_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
};

const BODY_STYLE: React.CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const KPI_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};

const FILTER_GRID_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const TAB_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const PANEL_GRID_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
};

const DETAIL_GRID_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const FILTER_INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  fontSize: 12.5,
};

const FILTER_LABEL_STYLE: React.CSSProperties = {
  display: "grid",
  gap: 6,
  color: th.textMuted,
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: "uppercase",
};

const EMPTY_STYLE: React.CSSProperties = {
  display: "grid",
  gap: 14,
  padding: 28,
  borderRadius: 10,
  background: th.surfaceLo,
  border: `1px dashed ${th.border}`,
  textAlign: "center",
};

const MODAL_OVERLAY_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.52)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 40,
};

const MODAL_CARD_STYLE: React.CSSProperties = {
  width: "min(720px, 100%)",
  maxHeight: "90vh",
  overflow: "auto",
  background: th.bg,
  border: `1px solid ${th.border}`,
  borderRadius: 12,
  boxShadow: th.shadow,
  padding: 20,
  display: "grid",
  gap: 16,
};

const OWN_APP_ROUTE_TYPES = new Set([
  "tenant",
  "platform_tenant",
  "platform_notice",
  "platform_adapter",
  "feature_flag",
  "reconciliation_issue",
  "reimbursement_batch",
  "evidence_legal_hold",
  "evidence_deletion_exception",
  "audit_event",
  "audit_log",
  "partner_channel_entry",
  "platform_partner_entry",
  "platform_user",
]);

const OPS_ROUTE_TYPES = new Set([
  "incident",
  "dispatch_job",
  "dispatch_item",
  "order",
  "driver",
  "vehicle",
  "call_session",
  "complaint_case",
  "maintenance_job",
]);

const TENANT_ROUTE_TYPES = new Set([
  "tenant_user",
  "tenant_booking",
  "tenant_report",
]);

export default function AuditPage() {
  const { locale } = useTranslation();
  const copy = useMemo(() => getCopy(locale), [locale]);
  const client = usePlatformAdminClient();
  const searchParams = useSearchParams();
  const [records, setRecords] = useState<AuditRecordWithActions[]>([]);
  const [policies, setPolicies] = useState<EvidenceRetentionPolicyRecord[]>([]);
  const [legalHolds, setLegalHolds] = useState<HoldRecordWithActions[]>([]);
  const [deletionExceptions, setDeletionExceptions] = useState<
    ExceptionRecordWithActions[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptState | null>(null);
  const [selectedTab, setSelectedTab] = useState<AuditTab>("log");
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [filterModule, setFilterModule] = useState("");
  const [filterActorType, setFilterActorType] = useState("");
  const [filterResourceType, setFilterResourceType] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [searchText, setSearchText] = useState("");
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const deferredSearch = useDeferredValue(searchText);

  useEffect(() => {
    const auditId = searchParams.get("auditId");
    const resourceId = searchParams.get("resourceId");
    const resourceType = searchParams.get("resourceType");
    if (auditId) {
      setSearchText(auditId);
    }
    if (resourceId) {
      setSearchText(resourceId);
    }
    if (resourceType) {
      setFilterResourceType(resourceType);
    }
  }, [searchParams]);

  async function loadPageData() {
    setLoading(true);
    setError(null);
    try {
      const [auditList, policyList, holdList, exceptionList] =
        await Promise.all([
          client.listAuditLogs(),
          client.listEvidencePolicies(),
          client.listEvidenceLegalHolds(),
          client.listEvidenceDeletionExceptions(),
        ]);

      const normalizedRecords = (auditList as AuditRecordWithActions[]).map(
        (record) => ({
          ...record,
          ownerApp: inferOwnerApp(record.resourceType, record.moduleName),
        }),
      );

      setRecords(normalizedRecords);
      setPolicies(policyList);
      setLegalHolds(holdList as HoldRecordWithActions[]);
      setDeletionExceptions(exceptionList as ExceptionRecordWithActions[]);
      return {
        records: normalizedRecords,
        policies: policyList,
        holds: holdList as HoldRecordWithActions[],
        exceptions: exceptionList as ExceptionRecordWithActions[],
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPageData();
  }, []);

  const holdBySubject = useMemo(() => {
    const map = new Map<string, HoldRecordWithActions>();
    for (const hold of legalHolds) {
      if (hold.status === "active") {
        map.set(hold.subjectId, hold);
      }
    }
    return map;
  }, [legalHolds]);

  const exceptionBySubject = useMemo(() => {
    const map = new Map<string, ExceptionRecordWithActions>();
    for (const exception of deletionExceptions) {
      if (exception.status === "active") {
        map.set(exception.subjectId, exception);
      }
      map.set(exception.sourceResourceId, exception);
    }
    return map;
  }, [deletionExceptions]);

  const enrichedRows = useMemo<AuditRow[]>(() => {
    return records.map((record) => {
      const hold = record.resourceId
        ? holdBySubject.get(record.resourceId)
        : null;
      const exception = record.resourceId
        ? exceptionBySubject.get(record.resourceId)
        : null;
      return {
        ...record,
        legalHold: hold
          ? {
              owner: hold.placedByActorId,
              expiresAt: null,
            }
          : null,
        deletionException: exception
          ? {
              owner: exception.reviewerActorId,
              reason: exception.reasonNote ?? exception.reasonCode,
            }
          : null,
      };
    });
  }, [exceptionBySubject, holdBySubject, records]);

  const moduleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of records) {
      counts.set(row.moduleName, (counts.get(row.moduleName) ?? 0) + 1);
    }
    return counts;
  }, [records]);

  const modules = useMemo(
    () =>
      Array.from(new Set(records.map((row) => row.moduleName))).filter(Boolean),
    [records],
  );
  const actorTypes = useMemo(
    () =>
      Array.from(new Set(records.map((row) => row.actorType))).filter(Boolean),
    [records],
  );
  const resourceTypes = useMemo(
    () =>
      Array.from(new Set(records.map((row) => row.resourceType))).filter(
        Boolean,
      ),
    [records],
  );

  const filteredRows = useMemo(() => {
    const now = Date.now();
    const lowered = deferredSearch.trim().toLowerCase();
    return enrichedRows.filter((row) => {
      if (filterModule && row.moduleName !== filterModule) {
        return false;
      }
      if (filterActorType && row.actorType !== filterActorType) {
        return false;
      }
      if (filterResourceType && row.resourceType !== filterResourceType) {
        return false;
      }
      if (timeRange !== "all") {
        const createdAt = new Date(row.createdAt).getTime();
        const age = now - createdAt;
        const limit =
          timeRange === "24h"
            ? 24 * 60 * 60 * 1000
            : timeRange === "7d"
              ? 7 * 24 * 60 * 60 * 1000
              : 30 * 24 * 60 * 60 * 1000;
        if (Number.isFinite(createdAt) && age > limit) {
          return false;
        }
      }
      if (!lowered) {
        return true;
      }
      return [
        row.auditId,
        row.requestId,
        row.actorId ?? "",
        row.moduleName,
        row.actionName,
        row.resourceType,
        row.resourceId ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(lowered);
    });
  }, [
    deferredSearch,
    enrichedRows,
    filterActorType,
    filterModule,
    filterResourceType,
    timeRange,
  ]);

  const emptyReason = useMemo<AuditEmptyReason>(() => {
    const forced = searchParams.get("emptyReason") as EmptyReason | null;
    if (forced && forced !== "driver_not_eligible") {
      return forced;
    }
    if (error) {
      return inferEmptyReason(error);
    }
    if (
      filterModule ||
      filterActorType ||
      filterResourceType ||
      timeRange !== "all" ||
      deferredSearch.trim()
    ) {
      return "filtered_empty";
    }
    return "no_data";
  }, [
    deferredSearch,
    error,
    filterActorType,
    filterModule,
    filterResourceType,
    records.length,
    searchParams,
    timeRange,
  ]);

  const holdCount = legalHolds.filter(
    (hold) => hold.status === "active",
  ).length;
  const exceptionCount = deletionExceptions.filter(
    (exception) => exception.status === "active",
  ).length;

  const tableColumns = useMemo<CanvasTableColumn<AuditRow>[]>(() => {
    return [
      {
        h: copy.table.when,
        w: 170,
        mono: true,
        r: (row) => formatDateTime(row.createdAt),
      },
      {
        h: copy.table.actorType,
        w: 120,
        r: (row) => (
          <CanvasPill theme={th} tone={actorTone(row.actorType)} dot>
            {formatPlatformCodeLabel(locale, row.actorType)}
          </CanvasPill>
        ),
      },
      {
        h: copy.table.actor,
        w: 180,
        r: (row) => row.actorId || getPlatformLabel(locale, "system"),
      },
      {
        h: copy.table.module,
        w: 130,
        mono: true,
        r: (row) => formatPlatformCodeLabel(locale, row.moduleName),
      },
      {
        h: copy.table.action,
        w: 180,
        mono: true,
        r: (row) => (
          <span style={{ color: th.accent }}>
            {formatPlatformCodeLabel(locale, row.actionName)}
          </span>
        ),
      },
      {
        h: copy.table.resource,
        w: 260,
        r: (row) => (
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontFamily: th.monoFamily, fontSize: 11.5 }}>
              {row.resourceType}
              {row.resourceId ? `:${row.resourceId}` : ""}
            </span>
            {row.legalHold ? (
              <span
                title={`${row.legalHold.owner} · ${row.legalHold.expiresAt ?? ""}`}
              >
                <CanvasPill theme={th} tone="danger">
                  HOLD
                </CanvasPill>
              </span>
            ) : null}
            {row.deletionException ? (
              <span
                title={`${row.deletionException.owner} · ${row.deletionException.reason ?? ""}`}
              >
                <CanvasPill theme={th} tone="warn">
                  EXEMPT
                </CanvasPill>
              </span>
            ) : null}
          </div>
        ),
      },
      {
        h: copy.table.request,
        w: 180,
        mono: true,
        r: (row) => row.requestId,
      },
      {
        h: copy.table.actions,
        w: 220,
        r: (row) => {
          const grantHold = getActionDescriptor(
            row.availableActions,
            "grant_legal_hold",
          );
          const grantException = getActionDescriptor(
            row.availableActions,
            "grant_deletion_exception",
          );
          const hasGovernanceActions = Boolean(grantHold || grantException);
          return (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <CanvasBtn
                theme={th}
                size="sm"
                variant="secondary"
                onClick={() =>
                  setExpandedAuditId((current) =>
                    current === row.auditId ? null : row.auditId,
                  )
                }
              >
                {expandedAuditId === row.auditId
                  ? copy.actions.collapse
                  : copy.actions.expand}
              </CanvasBtn>
              {renderActionButton(grantHold, copy.actions.grantHold, () =>
                grantHold
                  ? setModalState({
                      kind: "create-hold",
                      descriptor: grantHold,
                      seed: {
                        subjectId: row.resourceId ?? row.auditId,
                        tenantId: row.tenantId ?? "",
                      },
                    })
                  : undefined,
              )}
              {renderActionButton(
                grantException,
                copy.actions.grantException,
                () =>
                  grantException
                    ? setModalState({
                        kind: "create-exception",
                        descriptor: grantException,
                        seed: {
                          subjectId: row.resourceId ?? row.auditId,
                          sourceResourceType: row.resourceType,
                          sourceResourceId: row.resourceId ?? row.auditId,
                          tenantId: row.tenantId ?? "",
                        },
                      })
                    : undefined,
              )}
              {!hasGovernanceActions && row.availableActions ? (
                <CanvasPill theme={th} tone="neutral">
                  read-only
                </CanvasPill>
              ) : null}
              {renderResourceLink(copy, row)}
            </div>
          );
        },
      },
    ];
  }, [copy, expandedAuditId, locale]);

  async function runMutation(action: () => Promise<ReceiptState | null>) {
    setMutating(true);
    setError(null);
    try {
      const nextReceipt = await action();
      if (nextReceipt) {
        setReceipt(nextReceipt);
      }
      setModalState(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
    } finally {
      setMutating(false);
    }
  }

  if (loading) {
    return (
      <div style={PAGE_STYLE}>
        <CanvasPageHeader
          theme={th}
          sticky={false}
          title={copy.title}
          subtitle={copy.subtitle}
          actions={
            <CanvasBtn theme={th} variant="secondary" size="sm" disabled>
              {copy.refreshing}
            </CanvasBtn>
          }
        />
        <div style={BODY_STYLE}>
          <CanvasCard theme={th}>
            <div style={EMPTY_STYLE}>{copy.refreshing}</div>
          </CanvasCard>
        </div>
      </div>
    );
  }

  return (
    <div style={PAGE_STYLE}>
      <CanvasPageHeader
        theme={th}
        sticky={false}
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <>
            <CanvasPill theme={th} tone="neutral">
              {copy.refreshTier}
            </CanvasPill>
            <CanvasBtn
              theme={th}
              variant="secondary"
              size="sm"
              onClick={() => void loadPageData()}
            >
              {copy.refresh}
            </CanvasBtn>
          </>
        }
      />

      <div style={BODY_STYLE}>
        {error ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title={copy.banner.error}
            body={error}
          />
        ) : null}

        {receipt ? (
          <CanvasBanner
            theme={th}
            tone={receipt.status === "failed" ? "danger" : "success"}
            icon={receipt.status === "failed" ? "warn" : "check"}
            title={copy.banner.receipt}
            body={
              <span>
                {receipt.message}{" "}
                <Link href={receipt.href} style={{ color: th.accent }}>
                  {copy.actions.viewAudit}
                </Link>
              </span>
            }
          />
        ) : null}

        <CanvasBanner
          theme={th}
          tone="info"
          icon="info"
          body={copy.banner.descriptorFallback}
        />

        <div style={KPI_STYLE}>
          <CanvasKPI
            theme={th}
            label={copy.cards.records}
            value={records.length.toLocaleString(locale)}
            sub={`${filteredRows.length.toLocaleString(locale)} visible`}
          />
          <CanvasKPI
            theme={th}
            label={copy.cards.holds}
            value={holdCount.toLocaleString(locale)}
            sub={copy.tabs.hold}
          />
          <CanvasKPI
            theme={th}
            label={copy.cards.exceptions}
            value={exceptionCount.toLocaleString(locale)}
            sub={copy.tabs.exception}
          />
          <CanvasKPI
            theme={th}
            label={copy.cards.policies}
            value={policies.length.toLocaleString(locale)}
            sub={copy.tabs.policy}
          />
        </div>

        <CanvasCard theme={th}>
          <div style={TAB_ROW_STYLE}>
            {(
              [
                ["log", filteredRows.length],
                ["policy", policies.length],
                ["hold", holdCount],
                ["exception", exceptionCount],
              ] as const
            ).map(([tab, count]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setSelectedTab(tab)}
                style={{
                  appearance: "none",
                  border: 0,
                  background: "transparent",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <CanvasPill
                  theme={th}
                  tone={selectedTab === tab ? "accent" : "neutral"}
                  dot={tab !== "policy"}
                >
                  {copy.tabs[tab]} {count.toLocaleString(locale)}
                </CanvasPill>
              </button>
            ))}
          </div>
        </CanvasCard>

        <CanvasCard theme={th}>
          <div style={FILTER_GRID_STYLE}>
            <label style={FILTER_LABEL_STYLE}>
              {copy.filters.search}
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                style={FILTER_INPUT_STYLE}
                placeholder="auditId / requestId / resourceId"
              />
            </label>
            <label style={FILTER_LABEL_STYLE}>
              {copy.filters.module}
              <select
                value={filterModule}
                onChange={(event) => setFilterModule(event.target.value)}
                style={FILTER_INPUT_STYLE}
              >
                <option value="">{copy.filters.all}</option>
                {modules.map((value) => (
                  <option key={value} value={value}>
                    {formatPlatformCodeLabel(locale, value)}
                  </option>
                ))}
              </select>
            </label>
            <label style={FILTER_LABEL_STYLE}>
              {copy.filters.actor}
              <select
                value={filterActorType}
                onChange={(event) => setFilterActorType(event.target.value)}
                style={FILTER_INPUT_STYLE}
              >
                <option value="">{copy.filters.all}</option>
                {actorTypes.map((value) => (
                  <option key={value} value={value}>
                    {formatPlatformCodeLabel(locale, value)}
                  </option>
                ))}
              </select>
            </label>
            <label style={FILTER_LABEL_STYLE}>
              {copy.filters.resource}
              <select
                value={filterResourceType}
                onChange={(event) => setFilterResourceType(event.target.value)}
                style={FILTER_INPUT_STYLE}
              >
                <option value="">{copy.filters.all}</option>
                {resourceTypes.map((value) => (
                  <option key={value} value={value}>
                    {formatPlatformCodeLabel(locale, value)}
                  </option>
                ))}
              </select>
            </label>
            <label style={FILTER_LABEL_STYLE}>
              {copy.filters.time}
              <select
                value={timeRange}
                onChange={(event) =>
                  setTimeRange(event.target.value as TimeRange)
                }
                style={FILTER_INPUT_STYLE}
              >
                <option value="all">{copy.filters.all}</option>
                <option value="24h">24h</option>
                <option value="7d">7d</option>
                <option value="30d">30d</option>
              </select>
            </label>
          </div>
          <div
            style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}
          >
            <CanvasPill theme={th} tone="accent" dot>
              {copy.filters.all} {records.length.toLocaleString(locale)}
            </CanvasPill>
            {modules.slice(0, 5).map((moduleName) => (
              <CanvasPill key={moduleName} theme={th} tone="neutral" dot>
                {formatPlatformCodeLabel(locale, moduleName)}{" "}
                {(moduleCounts.get(moduleName) ?? 0).toLocaleString(locale)}
              </CanvasPill>
            ))}
          </div>
        </CanvasCard>

        {selectedTab === "log" ? (
          <>
            <CanvasCard theme={th} title={copy.sections.log} padding={0}>
              {filteredRows.length > 0 ? (
                <>
                  <CanvasTable<AuditRow>
                    theme={th}
                    columns={tableColumns}
                    rows={filteredRows}
                  />
                  {expandedAuditId ? (
                    <div
                      style={{
                        padding: 16,
                        borderTop: `1px solid ${th.border}`,
                      }}
                    >
                      {renderExpandedDetails(
                        filteredRows.find(
                          (row) => row.auditId === expandedAuditId,
                        ) ?? null,
                        copy,
                      )}
                    </div>
                  ) : null}
                </>
              ) : (
                <EmptyReasonCard copy={copy} reason={emptyReason} />
              )}
            </CanvasCard>

            <div style={PANEL_GRID_STYLE}>
              <CanvasCard
                theme={th}
                title={`${copy.sections.holds} · ${holdCount.toLocaleString(locale)}`}
              >
                {holdCount > 0 ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    {legalHolds
                      .filter((hold) => hold.status === "active")
                      .map((hold) => {
                        const releaseHold = getActionDescriptor(
                          hold.availableActions,
                          "lift_legal_hold",
                        );
                        return (
                          <GovernanceCard
                            key={hold.holdId}
                            title={`${hold.family} · ${hold.subjectId}`}
                            items={[
                              { k: "OWNER", v: hold.placedByActorId },
                              { k: "CASE", v: hold.caseNumber, mono: true },
                              {
                                k: "AT",
                                v: formatDateTime(hold.placedAt),
                                mono: true,
                              },
                              {
                                k: "REASON",
                                v: hold.reasonNote ?? hold.reasonCode,
                              },
                            ]}
                            actions={renderActionButton(
                              releaseHold,
                              copy.actions.liftHold,
                              () =>
                                releaseHold
                                  ? setModalState({
                                      kind: "release-hold",
                                      descriptor: releaseHold,
                                      hold,
                                    })
                                  : undefined,
                            )}
                          />
                        );
                      })}
                  </div>
                ) : (
                  <EmptyReasonCard copy={copy} reason="no_data" compact />
                )}
              </CanvasCard>

              <CanvasCard
                theme={th}
                title={`${copy.sections.exceptions} · ${exceptionCount.toLocaleString(locale)}`}
              >
                {exceptionCount > 0 ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    {deletionExceptions
                      .filter((exception) => exception.status === "active")
                      .map((exception) => {
                        const revokeException = getActionDescriptor(
                          exception.availableActions,
                          "revoke_deletion_exception",
                        );
                        return (
                          <GovernanceCard
                            key={exception.exceptionId}
                            title={`${exception.family} · ${exception.subjectId}`}
                            items={[
                              { k: "OWNER", v: exception.reviewerActorId },
                              {
                                k: "EXPIRES",
                                v: formatDateTime(exception.expiresAt),
                                mono: true,
                              },
                              {
                                k: "RESOURCE",
                                v: exception.sourceResourceType,
                              },
                              {
                                k: "REASON",
                                v: exception.reasonNote ?? exception.reasonCode,
                              },
                            ]}
                            actions={renderActionButton(
                              revokeException,
                              copy.actions.revokeException,
                              () =>
                                revokeException
                                  ? setModalState({
                                      kind: "resolve-exception",
                                      descriptor: revokeException,
                                      exception,
                                    })
                                  : undefined,
                            )}
                          />
                        );
                      })}
                  </div>
                ) : (
                  <EmptyReasonCard copy={copy} reason="no_data" compact />
                )}
              </CanvasCard>
            </div>

            <CanvasCard theme={th} title={copy.sections.policies} padding={0}>
              {policies.length > 0 ? (
                <CanvasTable<Record<string, unknown>>
                  theme={th}
                  columns={policyColumns(locale)}
                  rows={policies as unknown as Record<string, unknown>[]}
                />
              ) : (
                <EmptyReasonCard copy={copy} reason="no_data" compact />
              )}
            </CanvasCard>
          </>
        ) : null}

        {selectedTab === "policy" ? (
          <CanvasCard theme={th} title={copy.sections.policies} padding={0}>
            {policies.length > 0 ? (
              <CanvasTable<Record<string, unknown>>
                theme={th}
                columns={policyColumns(locale)}
                rows={policies as unknown as Record<string, unknown>[]}
              />
            ) : (
              <EmptyReasonCard copy={copy} reason="no_data" />
            )}
          </CanvasCard>
        ) : null}

        {selectedTab === "hold" ? (
          <CanvasCard theme={th} title={copy.sections.holds}>
            {holdCount > 0 ? (
              <div style={{ display: "grid", gap: 12 }}>
                {legalHolds
                  .filter((hold) => hold.status === "active")
                  .map((hold) => {
                    const releaseHold = getActionDescriptor(
                      hold.availableActions,
                      "lift_legal_hold",
                    );
                    return (
                      <GovernanceCard
                        key={hold.holdId}
                        title={`${hold.family} · ${hold.subjectId}`}
                        items={[
                          { k: "OWNER", v: hold.placedByActorId },
                          { k: "CASE", v: hold.caseNumber, mono: true },
                          {
                            k: "AT",
                            v: formatDateTime(hold.placedAt),
                            mono: true,
                          },
                          {
                            k: "REASON",
                            v: hold.reasonNote ?? hold.reasonCode,
                          },
                        ]}
                        actions={renderActionButton(
                          releaseHold,
                          copy.actions.liftHold,
                          () =>
                            releaseHold
                              ? setModalState({
                                  kind: "release-hold",
                                  descriptor: releaseHold,
                                  hold,
                                })
                              : undefined,
                        )}
                      />
                    );
                  })}
              </div>
            ) : (
              <EmptyReasonCard copy={copy} reason="no_data" />
            )}
          </CanvasCard>
        ) : null}

        {selectedTab === "exception" ? (
          <CanvasCard theme={th} title={copy.sections.exceptions}>
            {exceptionCount > 0 ? (
              <div style={{ display: "grid", gap: 12 }}>
                {deletionExceptions
                  .filter((exception) => exception.status === "active")
                  .map((exception) => {
                    const revokeException = getActionDescriptor(
                      exception.availableActions,
                      "revoke_deletion_exception",
                    );
                    return (
                      <GovernanceCard
                        key={exception.exceptionId}
                        title={`${exception.family} · ${exception.subjectId}`}
                        items={[
                          { k: "OWNER", v: exception.reviewerActorId },
                          {
                            k: "EXPIRES",
                            v: formatDateTime(exception.expiresAt),
                            mono: true,
                          },
                          { k: "RESOURCE", v: exception.sourceResourceType },
                          {
                            k: "REASON",
                            v: exception.reasonNote ?? exception.reasonCode,
                          },
                        ]}
                        actions={renderActionButton(
                          revokeException,
                          copy.actions.revokeException,
                          () =>
                            revokeException
                              ? setModalState({
                                  kind: "resolve-exception",
                                  descriptor: revokeException,
                                  exception,
                                })
                              : undefined,
                        )}
                      />
                    );
                  })}
              </div>
            ) : (
              <EmptyReasonCard copy={copy} reason="no_data" />
            )}
          </CanvasCard>
        ) : null}
      </div>

      {modalState ? (
        <ActionModal
          copy={copy}
          locale={locale}
          modalState={modalState}
          mutating={mutating}
          onCancel={() => setModalState(null)}
          onConfirm={() => {
            switch (modalState.kind) {
              case "create-hold":
                return runMutation(async () => {
                  const form = readHoldForm();
                  const record = await client.placeEvidenceLegalHold({
                    family: form.family,
                    subjectId: form.subjectId,
                    caseNumber: form.caseNumber,
                    tenantId: form.tenantId || null,
                    manifestHash: form.manifestHash || null,
                    reasonCode:
                      form.reasonCode as (typeof EVIDENCE_LEGAL_HOLD_REASON_CODES)[number],
                    reasonNote: form.reasonNote,
                  });
                  const reloaded = await loadPageData();
                  return findReceipt(
                    reloaded?.records ?? records,
                    "place_evidence_legal_hold",
                    "evidence_legal_hold",
                    record.holdId,
                  );
                });
              case "release-hold":
                return runMutation(async () => {
                  const reason = readTextField("releaseReason");
                  await client.releaseEvidenceLegalHold(
                    modalState.hold.holdId,
                    {
                      releaseReason: reason,
                    },
                  );
                  const reloaded = await loadPageData();
                  return findReceipt(
                    reloaded?.records ?? records,
                    "release_evidence_legal_hold",
                    "evidence_legal_hold",
                    modalState.hold.holdId,
                  );
                });
              case "create-exception":
                return runMutation(async () => {
                  const form = readExceptionForm();
                  const record = await client.registerEvidenceDeletionException(
                    {
                      family: form.family,
                      subjectId: form.subjectId,
                      sourceResourceType: form.sourceResourceType,
                      sourceResourceId: form.sourceResourceId,
                      reviewerActorId: form.reviewerActorId,
                      expiresAt: new Date(form.expiresAt).toISOString(),
                      reasonCode:
                        form.reasonCode as (typeof EVIDENCE_DELETION_EXCEPTION_REASON_CODES)[number],
                      reasonNote: form.reasonNote,
                      tenantId: form.tenantId || null,
                      manifestHash: form.manifestHash || null,
                    },
                  );
                  const reloaded = await loadPageData();
                  return findReceipt(
                    reloaded?.records ?? records,
                    "register_evidence_deletion_exception",
                    "evidence_deletion_exception",
                    record.exceptionId,
                  );
                });
              case "resolve-exception":
                return runMutation(async () => {
                  const resolutionNote = readTextField("resolutionNote");
                  await client.resolveEvidenceDeletionException(
                    modalState.exception.exceptionId,
                    { resolutionNote },
                  );
                  const reloaded = await loadPageData();
                  return findReceipt(
                    reloaded?.records ?? records,
                    "resolve_evidence_deletion_exception",
                    "evidence_deletion_exception",
                    modalState.exception.exceptionId,
                  );
                });
            }
          }}
        />
      ) : null}
    </div>
  );
}

function policyColumns(
  locale: Locale,
): CanvasTableColumn<Record<string, unknown>>[] {
  return [
    {
      h: "FAMILY",
      w: 150,
      r: (row) => formatPlatformCodeLabel(locale, String(row.family ?? "")),
    },
    {
      h: "AUTHORITY",
      w: 140,
      r: (row) =>
        formatPlatformCodeLabel(locale, String(row.authorityModule ?? "")),
    },
    {
      h: "RETENTION",
      w: 130,
      r: (row) =>
        `${String(row.hotRetentionDays ?? "—")}d / ${String(row.archiveRetentionDays ?? "—")}d`,
    },
    {
      h: "DOWNLOAD",
      w: 180,
      r: (row) => {
        const control = row.downloadControl as
          | { mode?: string; ttlMinutes?: number }
          | null
          | undefined;
        if (control?.mode === "signed_url") {
          return `signed_url · ${control.ttlMinutes ?? 0}m`;
        }
        return "no_direct_download";
      },
    },
    {
      h: "LEGAL HOLD",
      w: 120,
      r: (row) => {
        const legalHold = row.legalHold as { supported?: boolean } | undefined;
        return (
          <CanvasPill
            theme={th}
            tone={legalHold?.supported ? "accent" : "neutral"}
          >
            {legalHold?.supported ? "supported" : "unsupported"}
          </CanvasPill>
        );
      },
    },
  ];
}

function GovernanceCard({
  title,
  items,
  actions,
}: {
  title: string;
  items: Array<{ k: string; v: React.ReactNode; mono?: boolean }>;
  actions?: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: `1px solid ${th.border}`,
        borderRadius: 10,
        background: th.surfaceLo,
        padding: 14,
        display: "grid",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        {actions}
      </div>
      <CanvasDL theme={th} cols={1} items={items} />
    </div>
  );
}

function EmptyReasonCard({
  copy,
  reason,
  compact,
}: {
  copy: PageCopy;
  reason: AuditEmptyReason;
  compact?: boolean;
}) {
  const tone = emptyReasonTone(reason);
  return (
    <div
      style={{
        ...EMPTY_STYLE,
        background: tone.background,
        border: `1px dashed ${tone.border}`,
        padding: compact ? 20 : 28,
      }}
    >
      <div
        style={{
          fontSize: compact ? 14 : 16,
          fontWeight: 700,
          color: tone.title,
        }}
      >
        {copy.empty[reason]}
      </div>
      <div style={{ color: tone.body, lineHeight: 1.5 }}>
        {copy.emptyHint[reason]}
      </div>
      <CanvasPill theme={th} tone={tone.pill}>
        {reason}
      </CanvasPill>
    </div>
  );
}

function ActionModal({
  copy,
  locale,
  modalState,
  mutating,
  onCancel,
  onConfirm,
}: {
  copy: PageCopy;
  locale: Locale;
  modalState: ModalState;
  mutating: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div style={MODAL_OVERLAY_STYLE}>
      <div style={MODAL_CARD_STYLE}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {modalTitle(copy, modalState)}
          </div>
          <div style={{ marginTop: 6, color: th.textMuted, fontSize: 12.5 }}>
            {riskSummary(locale, modalState.descriptor)}
          </div>
        </div>

        {modalState.kind === "create-hold" ? (
          <HoldForm seed={modalState.seed} />
        ) : null}
        {modalState.kind === "release-hold" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <CanvasDL
              theme={th}
              cols={2}
              items={[
                { k: "FAMILY", v: modalState.hold.family },
                { k: "SUBJECT", v: modalState.hold.subjectId, mono: true },
                { k: "CASE", v: modalState.hold.caseNumber, mono: true },
                {
                  k: "PLACED",
                  v: formatDateTime(modalState.hold.placedAt),
                  mono: true,
                },
              ]}
            />
            <label style={FILTER_LABEL_STYLE}>
              REASON
              <textarea
                id="releaseReason"
                style={{
                  ...FILTER_INPUT_STYLE,
                  minHeight: 84,
                  resize: "vertical",
                }}
                required
              />
            </label>
          </div>
        ) : null}
        {modalState.kind === "create-exception" ? (
          <ExceptionForm seed={modalState.seed} />
        ) : null}
        {modalState.kind === "resolve-exception" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <CanvasDL
              theme={th}
              cols={2}
              items={[
                { k: "FAMILY", v: modalState.exception.family },
                { k: "SUBJECT", v: modalState.exception.subjectId, mono: true },
                {
                  k: "EXPIRES",
                  v: formatDateTime(modalState.exception.expiresAt),
                  mono: true,
                },
                {
                  k: "REASON CODE",
                  v: modalState.exception.reasonCode,
                  mono: true,
                },
              ]}
            />
            <label style={FILTER_LABEL_STYLE}>
              REASON
              <textarea
                id="resolutionNote"
                style={{
                  ...FILTER_INPUT_STYLE,
                  minHeight: 84,
                  resize: "vertical",
                }}
                required
              />
            </label>
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <CanvasBtn
            theme={th}
            variant="secondary"
            onClick={onCancel}
            disabled={mutating}
          >
            {copy.actions.cancel}
          </CanvasBtn>
          <CanvasBtn
            theme={th}
            variant="primary"
            onClick={onConfirm}
            disabled={mutating}
          >
            {mutating ? copy.refreshing : copy.actions.apply}
          </CanvasBtn>
        </div>
      </div>
    </div>
  );
}

function HoldForm({ seed }: { seed: Partial<CreateHoldForm> | undefined }) {
  return (
    <div style={FILTER_GRID_STYLE}>
      <label style={FILTER_LABEL_STYLE}>
        FAMILY
        <select
          id="holdFamily"
          defaultValue={seed?.family}
          style={FILTER_INPUT_STYLE}
        >
          {EVIDENCE_RETENTION_FAMILIES.map((value: EvidenceRetentionFamily) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label style={FILTER_LABEL_STYLE}>
        SUBJECT ID
        <input
          id="holdSubjectId"
          defaultValue={seed?.subjectId}
          style={FILTER_INPUT_STYLE}
        />
      </label>
      <label style={FILTER_LABEL_STYLE}>
        CASE NUMBER
        <input id="holdCaseNumber" style={FILTER_INPUT_STYLE} />
      </label>
      <label style={FILTER_LABEL_STYLE}>
        TENANT ID
        <input
          id="holdTenantId"
          defaultValue={seed?.tenantId}
          style={FILTER_INPUT_STYLE}
        />
      </label>
      <label style={FILTER_LABEL_STYLE}>
        MANIFEST HASH
        <input id="holdManifestHash" style={FILTER_INPUT_STYLE} />
      </label>
      <label style={FILTER_LABEL_STYLE}>
        REASON CODE
        <select id="holdReasonCode" style={FILTER_INPUT_STYLE}>
          {EVIDENCE_LEGAL_HOLD_REASON_CODES.map((value: string) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label style={{ ...FILTER_LABEL_STYLE, gridColumn: "1 / -1" }}>
        REASON NOTE
        <textarea
          id="holdReasonNote"
          style={{ ...FILTER_INPUT_STYLE, minHeight: 84, resize: "vertical" }}
          required
        />
      </label>
    </div>
  );
}

function ExceptionForm({
  seed,
}: {
  seed: Partial<CreateExceptionForm> | undefined;
}) {
  return (
    <div style={FILTER_GRID_STYLE}>
      <label style={FILTER_LABEL_STYLE}>
        FAMILY
        <select
          id="exceptionFamily"
          defaultValue={seed?.family}
          style={FILTER_INPUT_STYLE}
        >
          {EVIDENCE_RETENTION_FAMILIES.map((value: EvidenceRetentionFamily) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label style={FILTER_LABEL_STYLE}>
        SUBJECT ID
        <input
          id="exceptionSubjectId"
          defaultValue={seed?.subjectId}
          style={FILTER_INPUT_STYLE}
        />
      </label>
      <label style={FILTER_LABEL_STYLE}>
        RESOURCE TYPE
        <input
          id="exceptionSourceType"
          defaultValue={seed?.sourceResourceType}
          style={FILTER_INPUT_STYLE}
        />
      </label>
      <label style={FILTER_LABEL_STYLE}>
        RESOURCE ID
        <input
          id="exceptionSourceId"
          defaultValue={seed?.sourceResourceId}
          style={FILTER_INPUT_STYLE}
        />
      </label>
      <label style={FILTER_LABEL_STYLE}>
        REVIEWER ACTOR
        <input id="exceptionReviewer" style={FILTER_INPUT_STYLE} />
      </label>
      <label style={FILTER_LABEL_STYLE}>
        EXPIRES AT
        <input
          id="exceptionExpiresAt"
          type="datetime-local"
          style={FILTER_INPUT_STYLE}
        />
      </label>
      <label style={FILTER_LABEL_STYLE}>
        TENANT ID
        <input
          id="exceptionTenantId"
          defaultValue={seed?.tenantId}
          style={FILTER_INPUT_STYLE}
        />
      </label>
      <label style={FILTER_LABEL_STYLE}>
        MANIFEST HASH
        <input id="exceptionManifestHash" style={FILTER_INPUT_STYLE} />
      </label>
      <label style={FILTER_LABEL_STYLE}>
        REASON CODE
        <select id="exceptionReasonCode" style={FILTER_INPUT_STYLE}>
          {EVIDENCE_DELETION_EXCEPTION_REASON_CODES.map((value: string) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label style={{ ...FILTER_LABEL_STYLE, gridColumn: "1 / -1" }}>
        REASON NOTE
        <textarea
          id="exceptionReasonNote"
          style={{ ...FILTER_INPUT_STYLE, minHeight: 84, resize: "vertical" }}
          required
        />
      </label>
    </div>
  );
}

function renderExpandedDetails(row: AuditRow | null, copy: PageCopy) {
  if (!row) {
    return <EmptyReasonCard copy={copy} reason="no_data" compact />;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>
        {copy.sections.detail}
      </div>
      <div style={DETAIL_GRID_STYLE}>
        <CanvasCard theme={th}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
            OLD
          </div>
          <pre
            style={{
              margin: 0,
              fontSize: 11.5,
              fontFamily: th.monoFamily,
              whiteSpace: "pre-wrap",
            }}
          >
            {JSON.stringify(row.oldValuesSummary ?? {}, null, 2)}
          </pre>
        </CanvasCard>
        <CanvasCard theme={th}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
            NEW
          </div>
          <pre
            style={{
              margin: 0,
              fontSize: 11.5,
              fontFamily: th.monoFamily,
              whiteSpace: "pre-wrap",
            }}
          >
            {JSON.stringify(row.newValuesSummary ?? {}, null, 2)}
          </pre>
        </CanvasCard>
      </div>
    </div>
  );
}

function renderActionButton(
  descriptor: ResourceActionDescriptor | null,
  label: string,
  onClick: () => void,
) {
  if (!descriptor) {
    return null;
  }
  const variant =
    descriptor.riskLevel === "high"
      ? "primary"
      : descriptor.riskLevel === "medium"
        ? "primary"
        : "secondary";
  const tooltip = descriptor.enabled
    ? descriptor.requiresReason
      ? "reason required"
      : undefined
    : descriptor.disabledReasonCode;
  return (
    <span title={tooltip}>
      <CanvasBtn
        theme={th}
        size="sm"
        variant={variant}
        disabled={!descriptor.enabled}
        onClick={onClick}
      >
        {label}
      </CanvasBtn>
    </span>
  );
}

function renderResourceLink(copy: PageCopy, row: AuditRecordWithActions) {
  const target = buildResourceTarget(row);
  if (!target) {
    return null;
  }
  if (!target.href) {
    return (
      <CanvasBtn theme={th} size="sm" variant="secondary" disabled>
        {target.external
          ? copy.actions.openOwningApp
          : copy.actions.openResource}
      </CanvasBtn>
    );
  }
  if (target.external) {
    return (
      <a href={target.href} target="_blank" rel="noreferrer">
        <CanvasBtn theme={th} size="sm" variant="secondary">
          {copy.actions.openOwningApp}
        </CanvasBtn>
      </a>
    );
  }
  return (
    <Link href={target.href}>
      <CanvasBtn theme={th} size="sm" variant="secondary">
        {copy.actions.openResource}
      </CanvasBtn>
    </Link>
  );
}

function buildResourceTarget(row: AuditRecordWithActions): {
  href: string | null;
  external: boolean;
} | null {
  const resourceId = row.resourceId;
  if (!resourceId) {
    return null;
  }

  if (row.resourceType === "tenant" || row.resourceType === "platform_tenant") {
    return {
      href: `/tenants/${encodeURIComponent(resourceId)}`,
      external: false,
    };
  }
  if (
    row.resourceType === "partner_channel_entry" ||
    row.resourceType === "platform_partner_entry"
  ) {
    return {
      href: `/partners/${encodeURIComponent(resourceId)}`,
      external: false,
    };
  }
  if (row.resourceType === "reconciliation_issue") {
    return {
      href: `/payments?issueId=${encodeURIComponent(resourceId)}`,
      external: false,
    };
  }
  if (row.resourceType === "reimbursement_batch") {
    return {
      href: `/payments/reimbursements/${encodeURIComponent(resourceId)}`,
      external: false,
    };
  }
  if (row.resourceType === "platform_adapter") {
    return {
      href: `/adapter-registry?adapterId=${encodeURIComponent(resourceId)}`,
      external: false,
    };
  }
  if (row.resourceType === "feature_flag") {
    return {
      href: `/feature-flags?flagKey=${encodeURIComponent(resourceId)}`,
      external: false,
    };
  }
  if (OWN_APP_ROUTE_TYPES.has(row.resourceType)) {
    return {
      href: `/audit?resourceType=${encodeURIComponent(row.resourceType)}&resourceId=${encodeURIComponent(resourceId)}`,
      external: false,
    };
  }

  const origin = OPS_ROUTE_TYPES.has(row.resourceType)
    ? process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN
    : TENANT_ROUTE_TYPES.has(row.resourceType)
      ? process.env.NEXT_PUBLIC_TENANT_CONSOLE_ORIGIN
      : null;

  if (!origin) {
    return { href: null, external: true };
  }

  return {
    href: `${origin}/audit?resourceType=${encodeURIComponent(row.resourceType)}&resourceId=${encodeURIComponent(resourceId)}`,
    external: true,
  };
}

function findReceipt(
  records: AuditRecordWithActions[],
  actionName: string,
  resourceType: string,
  resourceId: string,
): ReceiptState | null {
  const match = [...records]
    .filter(
      (record) =>
        record.actionName === actionName &&
        record.resourceType === resourceType &&
        record.resourceId === resourceId,
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

  if (!match) {
    return null;
  }

  return {
    actionId: match.requestId || match.auditId,
    auditId: match.auditId,
    resourceType,
    resourceId,
    status: "completed",
    message: `${actionName} · ${resourceId}`,
    href: `/audit?auditId=${encodeURIComponent(match.auditId)}`,
  };
}

function getActionDescriptor(
  descriptors: ResourceActionDescriptor[] | undefined,
  action: string,
) {
  return (
    descriptors?.find((descriptor) => descriptor.action === action) ?? null
  );
}

function inferEmptyReason(message: string): AuditEmptyReason {
  const lowered = message.toLowerCase();
  if (
    lowered.includes("403") ||
    lowered.includes("forbidden") ||
    lowered.includes("permission") ||
    lowered.includes("unauthorized")
  ) {
    return "permission_denied";
  }
  if (
    lowered.includes("404") ||
    lowered.includes("501") ||
    lowered.includes("not provisioned") ||
    lowered.includes("not_provisioned") ||
    lowered.includes("not implemented")
  ) {
    return "not_provisioned";
  }
  if (
    lowered.includes("502") ||
    lowered.includes("503") ||
    lowered.includes("504") ||
    lowered.includes("downstream") ||
    lowered.includes("external") ||
    lowered.includes("unavailable")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function emptyReasonTone(reason: AuditEmptyReason) {
  switch (reason) {
    case "not_provisioned":
      return {
        background: th.infoBg,
        border: th.infoBorder,
        title: th.info,
        body: th.textMuted,
        pill: "info" as const,
      };
    case "fetch_failed":
      return {
        background: th.dangerBg,
        border: th.dangerBorder,
        title: th.danger,
        body: th.textMuted,
        pill: "danger" as const,
      };
    case "permission_denied":
    case "external_unavailable":
      return {
        background: th.warnBg,
        border: th.warnBorder,
        title: th.warn,
        body: th.textMuted,
        pill: "warn" as const,
      };
    case "filtered_empty":
      return {
        background: th.surfaceLo,
        border: th.border,
        title: th.text,
        body: th.textMuted,
        pill: "neutral" as const,
      };
    case "no_data":
    default:
      return {
        background: th.surfaceLo,
        border: th.border,
        title: th.text,
        body: th.textMuted,
        pill: "accent" as const,
      };
  }
}

function actorTone(actorType: AuditLogRecord["actorType"]) {
  switch (actorType) {
    case "platform_admin":
      return "accent";
    case "tenant_admin":
      return "info";
    case "ops_user":
      return "info";
    case "partner_api_key":
      return "warn";
    case "system":
    default:
      return "neutral";
  }
}

function inferOwnerApp(
  resourceType: string,
  moduleName: string,
): "platform-admin" | "ops-console" | "tenant-console" {
  if (OPS_ROUTE_TYPES.has(resourceType)) {
    return "ops-console";
  }
  if (TENANT_ROUTE_TYPES.has(resourceType)) {
    return "tenant-console";
  }
  if (moduleName.startsWith("tenant")) {
    return "tenant-console";
  }
  return "platform-admin";
}

function modalTitle(copy: PageCopy, state: ModalState) {
  switch (state.kind) {
    case "create-hold":
      return copy.actions.grantHold;
    case "release-hold":
      return copy.actions.liftHold;
    case "create-exception":
      return copy.actions.grantException;
    case "resolve-exception":
      return copy.actions.revokeException;
  }
}

function riskSummary(locale: Locale, descriptor: ResourceActionDescriptor) {
  return `${formatPlatformCodeLabel(locale, descriptor.riskLevel)} · ${
    descriptor.requiresReason ? "reason required" : "no reason"
  }`;
}

function readTextField(id: string) {
  const value = (
    document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null
  )?.value;
  return value?.trim() ?? "";
}

function readHoldForm(): CreateHoldForm {
  return {
    family: readTextField("holdFamily") as EvidenceRetentionFamily,
    subjectId: readTextField("holdSubjectId"),
    caseNumber: readTextField("holdCaseNumber"),
    tenantId: readTextField("holdTenantId"),
    manifestHash: readTextField("holdManifestHash"),
    reasonCode: readTextField("holdReasonCode"),
    reasonNote: readTextField("holdReasonNote"),
  };
}

function readExceptionForm(): CreateExceptionForm {
  return {
    family: readTextField("exceptionFamily") as EvidenceRetentionFamily,
    subjectId: readTextField("exceptionSubjectId"),
    sourceResourceType: readTextField("exceptionSourceType"),
    sourceResourceId: readTextField("exceptionSourceId"),
    reviewerActorId: readTextField("exceptionReviewer"),
    expiresAt: readTextField("exceptionExpiresAt"),
    tenantId: readTextField("exceptionTenantId"),
    manifestHash: readTextField("exceptionManifestHash"),
    reasonCode: readTextField("exceptionReasonCode"),
    reasonNote: readTextField("exceptionReasonNote"),
  };
}

function getCopy(locale: Locale): PageCopy {
  if (locale === "zh") {
    return {
      title: "Audit & Evidence Governance",
      subtitle:
        "append-only 稽核軌跡，並在同一畫面治理 legal hold、deletion exception 與 retention policy。",
      refresh: "重新整理",
      refreshing: "載入中...",
      refreshTier: "T6 manual refresh",
      filters: {
        search: "搜尋",
        module: "模組",
        actor: "Actor 類型",
        resource: "Resource 類型",
        time: "時間範圍",
        all: "全部",
      },
      tabs: {
        log: "Audit log",
        policy: "Retention policies",
        hold: "Active legal holds",
        exception: "Deletion exceptions",
      },
      cards: {
        records: "Audit records",
        holds: "有效 legal hold",
        exceptions: "有效 deletion exception",
        policies: "證據政策家族",
      },
      sections: {
        log: "Audit log",
        policies: "Evidence retention policies",
        holds: "Active legal holds",
        exceptions: "Active deletion exceptions",
        detail: "Record detail",
      },
      actions: {
        expand: "展開",
        collapse: "收合",
        openResource: "開啟資源",
        openOwningApp: "跨 app 開啟",
        grantHold: "Grant legal hold",
        liftHold: "Lift legal hold",
        grantException: "Grant deletion exception",
        revokeException: "Revoke deletion exception",
        viewAudit: "查看 audit",
        apply: "送出",
        cancel: "取消",
      },
      empty: {
        no_data: "目前沒有稽核資料",
        not_provisioned: "治理能力尚未佈建",
        fetch_failed: "資料讀取失敗",
        permission_denied: "你沒有讀取此治理面板的權限",
        external_unavailable: "外部依賴暫時無法使用",
        filtered_empty: "目前篩選條件沒有結果",
      },
      emptyHint: {
        no_data: "系統尚未產生可顯示的 audit / evidence governance 記錄。",
        not_provisioned:
          "需要先完成後端佈建或 authority 綁定後，治理列表才會出現。",
        fetch_failed:
          "請先手動 refresh；若仍失敗，需檢查 API 或 downstream health。",
        permission_denied:
          "這是 distinct empty state，不等同於 no data，避免誤判成系統正常但無資料。",
        external_unavailable:
          "通常代表 cross-app owner 或 evidence 後端暫時不可用。",
        filtered_empty:
          "保留目前 filter，或清空條件回到完整 append-only 視圖。",
      },
      banner: {
        error: "Audit governance 載入失敗",
        receipt: "Action receipt",
        descriptorFallback:
          "CTA 優先採用 backend `availableActions`；若目前 audit contracts 尚未回傳 descriptor，頁面會以 audit/evidence API 能力做保守 fallback，不硬編角色矩陣。",
      },
      table: {
        when: "WHEN",
        actorType: "ACTOR TYPE",
        actor: "ACTOR",
        module: "MODULE",
        action: "ACTION",
        resource: "RESOURCE",
        request: "REQUEST",
        actions: "ACTIONS",
      },
    };
  }

  return {
    title: "Audit & Evidence Governance",
    subtitle:
      "Append-only audit trail with legal hold, deletion exception, and retention-governance controls on the same surface.",
    refresh: "Refresh",
    refreshing: "Loading...",
    refreshTier: "T6 manual refresh",
    filters: {
      search: "Search",
      module: "Module",
      actor: "Actor type",
      resource: "Resource type",
      time: "Time range",
      all: "All",
    },
    tabs: {
      log: "Audit log",
      policy: "Retention policies",
      hold: "Active legal holds",
      exception: "Deletion exceptions",
    },
    cards: {
      records: "Audit records",
      holds: "Active legal holds",
      exceptions: "Active deletion exceptions",
      policies: "Evidence policy families",
    },
    sections: {
      log: "Audit log",
      policies: "Evidence retention policies",
      holds: "Active legal holds",
      exceptions: "Active deletion exceptions",
      detail: "Record detail",
    },
    actions: {
      expand: "Expand",
      collapse: "Collapse",
      openResource: "Open resource",
      openOwningApp: "Open owning app",
      grantHold: "Grant legal hold",
      liftHold: "Lift legal hold",
      grantException: "Grant deletion exception",
      revokeException: "Revoke deletion exception",
      viewAudit: "View audit",
      apply: "Apply",
      cancel: "Cancel",
    },
    empty: {
      no_data: "No audit evidence yet",
      not_provisioned: "Governance capability not provisioned",
      fetch_failed: "Audit data failed to load",
      permission_denied: "You do not have access to this governance surface",
      external_unavailable: "An external dependency is unavailable",
      filtered_empty: "No results match the current filters",
    },
    emptyHint: {
      no_data:
        "The append-only audit stream has not emitted rows for this slice yet.",
      not_provisioned:
        "Provision the backing governance capability before expecting list results here.",
      fetch_failed:
        "Manual refresh is the only supported refresh tier on this page.",
      permission_denied:
        "This must remain visually distinct from no-data so operators do not misread authority failures.",
      external_unavailable:
        "Use this state when the owning app or evidence subsystem is temporarily unavailable.",
      filtered_empty:
        "Keep the current filters for incident review, or clear them to restore the full trail.",
    },
    banner: {
      error: "Unable to load audit governance data",
      receipt: "Action receipt",
      descriptorFallback:
        "CTAs prefer backend `availableActions`. Where current audit contracts do not yet include descriptors, the page falls back to the supported audit/evidence endpoints without hard-coding role-specific visibility.",
    },
    table: {
      when: "WHEN",
      actorType: "ACTOR TYPE",
      actor: "ACTOR",
      module: "MODULE",
      action: "ACTION",
      resource: "RESOURCE",
      request: "REQUEST",
      actions: "ACTIONS",
    },
  };
}
