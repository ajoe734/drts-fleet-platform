/**
 * /audit — Audit & Evidence Governance (platform-admin)
 *
 * Rebuilt to the `Platform Admin.html` canvas artboard `PA_Audit` and the
 * design hand-off packet §5.16. Behaviour is driven by the cross-cutting
 * `@drts/contracts` ui-runtime envelopes:
 *   - refresh tier T6 (manual) per packet §3.2
 *   - `availableActions[]` (ResourceActionDescriptor) drives every CTA per §3.5
 *   - risk-classified confirmation (low/medium/high) per §3.4
 *   - six distinct `EmptyReason` treatments per §3.6
 *   - cross-app deep links (CrossAppResourceLink) per §3.10 — audit rows exit
 *     to the owning resource (in-app, or cross-app in a new tab), action
 *     receipts surface a "View audit" deep link.
 *
 * Q-ADM16: audit rows carry legal-hold / deletion-exception badges.
 */

"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
import {
  EVIDENCE_RETENTION_FAMILIES,
  EVIDENCE_LEGAL_HOLD_REASON_CODES,
  EVIDENCE_DELETION_EXCEPTION_REASON_CODES,
} from "@drts/contracts";
import type {
  AuditLogRecord,
  EvidenceDeletionExceptionRecord,
  EvidenceLegalHoldRecord,
  EvidenceRetentionPolicyRecord,
  EvidenceRetentionFamily,
  EvidenceLegalHoldReasonCode,
  EvidenceDeletionExceptionReasonCode,
  ResourceActionDescriptor,
  EmptyReason,
  RefreshTier,
  UiRefreshMetadata,
  CrossAppResourceLink,
  ActionReceipt,
} from "@drts/contracts";

type TFn = (key: string, params?: Record<string, string | number>) => string;
type Locale = "en" | "zh";
type TabId = "log" | "policies" | "holds" | "exceptions";

// ── Refresh model (packet §3.2 / Q-X02) ──────────────────────────────────────
// /audit is the only platform-admin surface on the manual tier (T6); no polling.
const REFRESH_TIER: RefreshTier = "manual";
const REFRESH_CADENCE_MS: Record<RefreshTier, number | null> = {
  urgent: 5000,
  fast: 3000,
  dispatch: 5000,
  medium: 15000,
  medium_slow: 30000,
  slow: 30000,
  manual: null,
};

// ── EmptyReason → distinct treatment (packet §3.6 / Q-X15) ────────────────────
// Six platform-admin reasons (the driver-only `driver_not_eligible` is N/A here).
type PlatformEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

interface EmptyTreatment {
  glyph: string;
  tone: "neutral" | "info" | "warning" | "danger";
  action?: "retry" | "clear_filters";
}

const EMPTY_TREATMENTS: Record<PlatformEmptyReason, EmptyTreatment> = {
  no_data: { glyph: "🗂", tone: "neutral" },
  not_provisioned: { glyph: "🧩", tone: "info" },
  fetch_failed: { glyph: "⚠️", tone: "danger", action: "retry" },
  permission_denied: { glyph: "🔒", tone: "warning" },
  external_unavailable: { glyph: "🛰", tone: "warning", action: "retry" },
  filtered_empty: { glyph: "🔍", tone: "neutral", action: "clear_filters" },
};

const EMPTY_TONE_COLOR: Record<EmptyTreatment["tone"], string> = {
  neutral: "#cbd5e1",
  info: "#3b82f6",
  warning: "#f59e0b",
  danger: "#ef4444",
};

// ── Cross-app resource routing (packet §3.10 / Q-X03) ─────────────────────────
// Maps an audit record's owning module to the app that owns the resource view.
// Platform-owned modules resolve in-app (same tab); other realms deep-link out
// in a new tab. (Cross-app deployed base URLs are env-wired downstream — TBD per
// packet §6; here we emit the canonical route + open mode.)
const MODULE_APP_MAP: Record<
  string,
  { app: CrossAppResourceLink["targetApp"]; routeFor: (id: string) => string }
> = {
  dispatch: { app: "ops-console", routeFor: (id) => `/dispatch?orderId=${id}` },
  incident: { app: "ops-console", routeFor: (id) => `/incidents/${id}` },
  complaint: { app: "ops-console", routeFor: (id) => `/complaints/${id}` },
  booking: { app: "tenant-console", routeFor: (id) => `/bookings/${id}` },
  tenant: { app: "platform-admin", routeFor: (id) => `/tenants/${id}` },
  partner: { app: "platform-admin", routeFor: (id) => `/partners/${id}` },
  adapter: {
    app: "platform-admin",
    routeFor: (id) => `/adapter-registry?adapter=${id}`,
  },
  reconciliation: {
    app: "platform-admin",
    routeFor: (id) => `/payments?issue=${id}`,
  },
};

function resolveResourceLink(
  record: AuditLogRecord,
  label: string,
): CrossAppResourceLink | null {
  if (!record.resourceId) return null;
  const mapping = MODULE_APP_MAP[record.moduleName];
  if (!mapping) return null;
  return {
    targetApp: mapping.app,
    route: mapping.routeFor(record.resourceId),
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    openMode: mapping.app === "platform-admin" ? "same_tab" : "new_tab",
    label,
  };
}

// ── availableActions helpers (packet §3.5 / Q-X13) ────────────────────────────
// Backend will eventually decorate these records with `availableActions[]`.
// Until then we derive the descriptor set the packet §5.16 brief mandates, but
// rendering always reads from a descriptor array so CTAs are authority-driven,
// never hard-coded by role.
function readActions<T>(
  record: T,
  derived: ResourceActionDescriptor[],
): ResourceActionDescriptor[] {
  const provided = (record as { availableActions?: ResourceActionDescriptor[] })
    .availableActions;
  return Array.isArray(provided) ? provided : derived;
}

const AUDIT_ROW_ACTIONS: ResourceActionDescriptor[] = [
  {
    action: "place_legal_hold",
    enabled: true,
    requiresReason: true,
    riskLevel: "high",
  },
  {
    action: "register_deletion_exception",
    enabled: true,
    requiresReason: true,
    riskLevel: "high",
  },
];

const HOLD_ROW_ACTIONS: ResourceActionDescriptor[] = [
  {
    action: "release_legal_hold",
    enabled: true,
    requiresReason: true,
    riskLevel: "high",
  },
];

const EXCEPTION_ROW_ACTIONS: ResourceActionDescriptor[] = [
  {
    action: "resolve_deletion_exception",
    enabled: true,
    requiresReason: true,
    riskLevel: "high",
  },
];

// ── Action workflow modelling ─────────────────────────────────────────────────
type ActionKind =
  | "place_legal_hold"
  | "release_legal_hold"
  | "register_deletion_exception"
  | "resolve_deletion_exception";

interface ActiveAction {
  kind: ActionKind;
  descriptor: ResourceActionDescriptor;
  record?: AuditLogRecord;
  hold?: EvidenceLegalHoldRecord;
  exception?: EvidenceDeletionExceptionRecord;
}

interface ToastState {
  receipt: ActionReceipt;
  ok: boolean;
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
  const [refreshMeta, setRefreshMeta] = useState<UiRefreshMetadata | null>(
    null,
  );

  const [activeTab, setActiveTab] = useState<TabId>("log");
  const [filterModule, setFilterModule] = useState<string>("");
  const [filterActorType, setFilterActorType] = useState<string>("");
  const [filterResourceType, setFilterResourceType] = useState<string>("");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");
  const [focusAuditId, setFocusAuditId] = useState<string>("");
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);

  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Cross-app entry: receipts deep-link in via ?auditId / ?resourceType /
  // ?module / ?actorType (packet §3.10). Read client-side to stay build-safe.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const auditId = p.get("auditId");
    if (auditId) {
      setFocusAuditId(auditId);
      setExpandedAuditId(auditId);
    }
    if (p.get("module")) setFilterModule(p.get("module") as string);
    if (p.get("actorType")) setFilterActorType(p.get("actorType") as string);
    if (p.get("resourceType")) {
      setFilterResourceType(p.get("resourceType") as string);
    }
  }, []);

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
          availableActions: r.availableActions,
        })) || [];
      setRecords(recordsList);
      setPolicies(policyList);
      setLegalHolds(holdList);
      setDeletionExceptions(deletionExceptionList);
      setRefreshMeta({
        generatedAt: new Date().toISOString(),
        staleAfterMs: REFRESH_CADENCE_MS[REFRESH_TIER] ?? 0,
        dataFreshness: "fresh",
        source: "live",
      });
    } catch (e: any) {
      setError(e?.message || String(e));
      setRefreshMeta({
        generatedAt: new Date().toISOString(),
        staleAfterMs: 0,
        dataFreshness: "unknown",
        source: "live",
      });
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // Manual tier: no polling timer. Other tiers would schedule here.
  useEffect(() => {
    const cadence = REFRESH_CADENCE_MS[REFRESH_TIER];
    if (!cadence) return;
    const id = setInterval(loadRecords, cadence);
    return () => clearInterval(id);
  }, [loadRecords]);

  const activeLegalHolds = useMemo(
    () => legalHolds.filter((h) => h.status === "active"),
    [legalHolds],
  );
  const activeDeletionExceptions = useMemo(
    () => deletionExceptions.filter((e) => e.status === "active"),
    [deletionExceptions],
  );

  // Q-ADM16 badge indexes: subjectId → active governance record.
  const holdBySubject = useMemo(() => {
    const m = new Map<string, EvidenceLegalHoldRecord>();
    activeLegalHolds.forEach((h) => m.set(h.subjectId, h));
    return m;
  }, [activeLegalHolds]);
  const exceptionBySubject = useMemo(() => {
    const m = new Map<string, EvidenceDeletionExceptionRecord>();
    activeDeletionExceptions.forEach((e) => m.set(e.subjectId, e));
    return m;
  }, [activeDeletionExceptions]);

  const filtersActive =
    Boolean(filterModule) ||
    Boolean(filterActorType) ||
    Boolean(filterResourceType) ||
    Boolean(filterFrom) ||
    Boolean(filterTo) ||
    Boolean(focusAuditId);

  const filtered = useMemo(() => {
    const fromMs = filterFrom ? new Date(filterFrom).getTime() : null;
    const toMs = filterTo ? new Date(filterTo).getTime() : null;
    return records.filter((r) => {
      if (focusAuditId && r.auditId !== focusAuditId) return false;
      if (filterModule && r.moduleName !== filterModule) return false;
      if (filterActorType && r.actorType !== filterActorType) return false;
      if (filterResourceType && r.resourceType !== filterResourceType)
        return false;
      if (fromMs !== null || toMs !== null) {
        const ts = r.createdAt ? new Date(r.createdAt).getTime() : NaN;
        if (Number.isNaN(ts)) return false;
        if (fromMs !== null && ts < fromMs) return false;
        if (toMs !== null && ts > toMs) return false;
      }
      return true;
    });
  }, [
    records,
    focusAuditId,
    filterModule,
    filterActorType,
    filterResourceType,
    filterFrom,
    filterTo,
  ]);

  const moduleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    records.forEach((r) => {
      if (!r.moduleName) return;
      counts.set(r.moduleName, (counts.get(r.moduleName) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [records]);

  const actorTypes = useMemo(
    () => [...new Set(records.map((r) => r.actorType).filter(Boolean))],
    [records],
  );
  const resourceTypes = useMemo(
    () => [...new Set(records.map((r) => r.resourceType).filter(Boolean))],
    [records],
  );

  const auditEmptyReason: PlatformEmptyReason = error
    ? "fetch_failed"
    : filtersActive
      ? "filtered_empty"
      : "no_data";

  const clearFilters = useCallback(() => {
    setFilterModule("");
    setFilterActorType("");
    setFilterResourceType("");
    setFilterFrom("");
    setFilterTo("");
    setFocusAuditId("");
  }, []);

  const exportCsv = useCallback(() => {
    const header = [
      "auditId",
      "createdAt",
      "actorType",
      "actorId",
      "moduleName",
      "actionName",
      "resourceType",
      "resourceId",
      "tenantId",
      "requestId",
    ];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = filtered.map((r) =>
      [
        r.auditId,
        r.createdAt,
        r.actorType,
        r.actorId,
        r.moduleName,
        r.actionName,
        r.resourceType,
        r.resourceId,
        r.tenantId,
        r.requestId,
      ]
        .map(escape)
        .join(","),
    );
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  async function runAction(
    kind: ActionKind,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      let auditId = "";
      let resourceType = "";
      let resourceId = "";
      if (kind === "place_legal_hold") {
        const res = await client.placeEvidenceLegalHold(payload as any);
        auditId = res.holdId;
        resourceType = "evidence_legal_hold";
        resourceId = res.subjectId;
      } else if (kind === "release_legal_hold") {
        const { holdId, ...cmd } = payload as { holdId: string } & Record<
          string,
          unknown
        >;
        const res = await client.releaseEvidenceLegalHold(holdId, cmd as any);
        auditId = res.holdId;
        resourceType = "evidence_legal_hold";
        resourceId = res.subjectId;
      } else if (kind === "register_deletion_exception") {
        const res = await client.registerEvidenceDeletionException(
          payload as any,
        );
        auditId = res.exceptionId;
        resourceType = "evidence_deletion_exception";
        resourceId = res.subjectId;
      } else {
        const { exceptionId, ...cmd } = payload as {
          exceptionId: string;
        } & Record<string, unknown>;
        const res = await client.resolveEvidenceDeletionException(
          exceptionId,
          cmd as any,
        );
        auditId = res.exceptionId;
        resourceType = "evidence_deletion_exception";
        resourceId = res.subjectId;
      }
      setToast({
        ok: true,
        receipt: {
          actionId: kind,
          auditId,
          resourceType,
          resourceId,
          status: "completed",
          message: t(`audit.actions.${kind}`),
        },
      });
      setActiveAction(null);
      await loadRecords();
    } catch (e: any) {
      setToast({
        ok: false,
        receipt: {
          actionId: kind,
          auditId: "",
          resourceType: "",
          resourceId: "",
          status: "failed",
          message: e?.message || String(e),
        },
      });
    }
  }

  if (loading && records.length === 0) {
    return <div className="admin-empty">{t("audit.loading")}</div>;
  }

  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: "log", label: t("audit.tabs.log") },
    { id: "policies", label: t("audit.tabs.policies") },
    {
      id: "holds",
      label: t("audit.tabs.holds"),
      badge: activeLegalHolds.length,
    },
    {
      id: "exceptions",
      label: t("audit.tabs.exceptions"),
      badge: activeDeletionExceptions.length,
    },
  ];

  return (
    <div>
      <div
        className="admin-page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1>{t("audit.header.title")}</h1>
          <p>{t("audit.header.subtitle")}</p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <RefreshIndicator meta={refreshMeta} t={t} />
          <button
            className="admin-btn admin-btn--secondary"
            onClick={loadRecords}
            type="button"
          >
            {t("audit.refresh.manual")}
          </button>
          <button
            className="admin-btn admin-btn--secondary"
            onClick={exportCsv}
            type="button"
          >
            {t("audit.export")}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="admin-card"
          style={{ borderColor: "rgba(239,68,68,0.3)" }}
        >
          <p style={{ color: "#dc2626", margin: 0 }}>
            {getPlatformLabel(locale, "error")}: {error}
          </p>
        </div>
      )}

      {/* Tabs (canvas PA_Audit) */}
      <div
        className="admin-toggle-group"
        role="tablist"
        style={{ marginBottom: 16 }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`admin-toggle-btn${activeTab === tab.id ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
            {tab.badge ? (
              <span
                className="admin-badge admin-badge--warning"
                style={{ marginLeft: 6, fontSize: 10 }}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {activeTab === "log" && (
        <AuditLogTab
          t={t}
          locale={locale}
          records={records}
          filtered={filtered}
          moduleCounts={moduleCounts}
          actorTypes={actorTypes}
          resourceTypes={resourceTypes}
          filterModule={filterModule}
          setFilterModule={setFilterModule}
          filterActorType={filterActorType}
          setFilterActorType={setFilterActorType}
          filterResourceType={filterResourceType}
          setFilterResourceType={setFilterResourceType}
          filterFrom={filterFrom}
          setFilterFrom={setFilterFrom}
          filterTo={filterTo}
          setFilterTo={setFilterTo}
          filtersActive={filtersActive}
          clearFilters={clearFilters}
          emptyReason={auditEmptyReason}
          onRetry={loadRecords}
          expandedAuditId={expandedAuditId}
          setExpandedAuditId={setExpandedAuditId}
          holdBySubject={holdBySubject}
          exceptionBySubject={exceptionBySubject}
          onAction={(kind, record) =>
            setActiveAction({
              kind,
              descriptor: AUDIT_ROW_ACTIONS.find((a) => a.action === kind)!,
              record,
            })
          }
        />
      )}

      {activeTab === "policies" && (
        <PoliciesTab
          t={t}
          locale={locale}
          policies={policies}
          emptyReason={error ? "fetch_failed" : "no_data"}
          onRetry={loadRecords}
        />
      )}

      {activeTab === "holds" && (
        <HoldsTab
          t={t}
          locale={locale}
          holds={activeLegalHolds}
          emptyReason={error ? "fetch_failed" : "no_data"}
          onRetry={loadRecords}
          onGrant={() =>
            setActiveAction({
              kind: "place_legal_hold",
              descriptor: AUDIT_ROW_ACTIONS[0]!,
            })
          }
          onRelease={(hold) =>
            setActiveAction({
              kind: "release_legal_hold",
              descriptor: HOLD_ROW_ACTIONS[0]!,
              hold,
            })
          }
        />
      )}

      {activeTab === "exceptions" && (
        <ExceptionsTab
          t={t}
          locale={locale}
          exceptions={activeDeletionExceptions}
          emptyReason={error ? "fetch_failed" : "no_data"}
          onRetry={loadRecords}
          onGrant={() =>
            setActiveAction({
              kind: "register_deletion_exception",
              descriptor: AUDIT_ROW_ACTIONS[1]!,
            })
          }
          onResolve={(exception) =>
            setActiveAction({
              kind: "resolve_deletion_exception",
              descriptor: EXCEPTION_ROW_ACTIONS[0]!,
              exception,
            })
          }
        />
      )}

      {activeAction && (
        <ActionModal
          t={t}
          locale={locale}
          active={activeAction}
          onCancel={() => setActiveAction(null)}
          onSubmit={runAction}
        />
      )}

      {toast && (
        <ReceiptToast toast={toast} t={t} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh indicator (packet §3.2 — stale + freshness affordance)
// ─────────────────────────────────────────────────────────────────────────────
function RefreshIndicator({
  meta,
  t,
}: {
  meta: UiRefreshMetadata | null;
  t: TFn;
}) {
  const freshness = meta?.dataFreshness ?? "unknown";
  const tone: StatusToneLite =
    freshness === "fresh"
      ? "success"
      : freshness === "degraded"
        ? "danger"
        : freshness === "stale"
          ? "warning"
          : "neutral";
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
      title={t("audit.refresh.tierLabel")}
    >
      <span
        className="admin-badge admin-badge--neutral"
        style={{ fontSize: 11 }}
      >
        {t("audit.refresh.tier")}
      </span>
      <Badge tone={tone}>{t(`audit.refresh.freshness.${freshness}`)}</Badge>
      <span style={{ fontSize: 12, color: "#6b7280" }}>
        {meta
          ? t("audit.refresh.lastRefreshed", {
              time: formatDateTime(meta.generatedAt),
            })
          : ""}
      </span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit log tab
// ─────────────────────────────────────────────────────────────────────────────
function AuditLogTab(props: {
  t: TFn;
  locale: Locale;
  records: AuditLogRecord[];
  filtered: AuditLogRecord[];
  moduleCounts: [string, number][];
  actorTypes: string[];
  resourceTypes: string[];
  filterModule: string;
  setFilterModule: (v: string) => void;
  filterActorType: string;
  setFilterActorType: (v: string) => void;
  filterResourceType: string;
  setFilterResourceType: (v: string) => void;
  filterFrom: string;
  setFilterFrom: (v: string) => void;
  filterTo: string;
  setFilterTo: (v: string) => void;
  filtersActive: boolean;
  clearFilters: () => void;
  emptyReason: PlatformEmptyReason;
  onRetry: () => void;
  expandedAuditId: string | null;
  setExpandedAuditId: React.Dispatch<React.SetStateAction<string | null>>;
  holdBySubject: Map<string, EvidenceLegalHoldRecord>;
  exceptionBySubject: Map<string, EvidenceDeletionExceptionRecord>;
  onAction: (kind: ActionKind, record: AuditLogRecord) => void;
}) {
  const { t, locale } = props;

  return (
    <>
      {/* Module filter pills with counts (canvas) */}
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}
      >
        <FilterPill
          active={!props.filterModule}
          onClick={() => props.setFilterModule("")}
          label={t("audit.allModules", { count: props.records.length })}
        />
        {props.moduleCounts.map(([mod, count]) => (
          <FilterPill
            key={mod}
            active={props.filterModule === mod}
            onClick={() =>
              props.setFilterModule(props.filterModule === mod ? "" : mod)
            }
            label={`${formatPlatformCodeLabel(locale, mod)} ${count}`}
          />
        ))}
      </div>

      {/* Filter toolbar */}
      <div className="admin-toolbar" style={{ flexWrap: "wrap", gap: 12 }}>
        <FilterSelect
          id="filter-actor"
          label={t("audit.actorLabel")}
          value={props.filterActorType}
          onChange={props.setFilterActorType}
          allLabel={t("common.all")}
          options={props.actorTypes.map((a) => ({
            value: a,
            label: formatPlatformCodeLabel(locale, a),
          }))}
        />
        <FilterSelect
          id="filter-resource"
          label={t("audit.resourceLabel")}
          value={props.filterResourceType}
          onChange={props.setFilterResourceType}
          allLabel={t("common.all")}
          options={props.resourceTypes.map((r) => ({
            value: r,
            label: formatPlatformCodeLabel(locale, r),
          }))}
        />
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            {t("audit.fromLabel")}
          </span>
          <input
            type="datetime-local"
            value={props.filterFrom}
            onChange={(e) => props.setFilterFrom(e.target.value)}
            style={filterInputStyle}
          />
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            {t("audit.toLabel")}
          </span>
          <input
            type="datetime-local"
            value={props.filterTo}
            onChange={(e) => props.setFilterTo(e.target.value)}
            style={filterInputStyle}
          />
        </label>
        {props.filtersActive && (
          <button
            className="admin-btn admin-btn--secondary admin-btn--sm"
            onClick={props.clearFilters}
            type="button"
          >
            {t("audit.clearFilters")}
          </button>
        )}
        <span style={{ fontSize: 13, color: "#6b7280", marginLeft: "auto" }}>
          {t("audit.showingOf", {
            shown: props.filtered.length,
            total: props.records.length,
          })}
        </span>
      </div>

      {props.filtered.length === 0 ? (
        <EmptyState
          reason={props.emptyReason}
          t={t}
          onRetry={props.onRetry}
          onClearFilters={props.clearFilters}
        />
      ) : (
        <div className="admin-card" style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("audit.col.timestamp")}</th>
                <th>{t("audit.col.actorType")}</th>
                <th>{t("audit.col.actor")}</th>
                <th>{t("audit.col.module")}</th>
                <th>{t("audit.col.action")}</th>
                <th>{t("audit.col.resource")}</th>
                <th>{t("audit.col.request")}</th>
                <th>{t("audit.col.details")}</th>
              </tr>
            </thead>
            <tbody>
              {props.filtered.map((r) => {
                const hold = r.resourceId
                  ? props.holdBySubject.get(r.resourceId)
                  : undefined;
                const exception = r.resourceId
                  ? props.exceptionBySubject.get(r.resourceId)
                  : undefined;
                const link = resolveResourceLink(r, t("audit.viewResource"));
                const expandable = Boolean(
                  r.oldValuesSummary || r.newValuesSummary,
                );
                const actions = readActions(r, AUDIT_ROW_ACTIONS);
                return (
                  <React.Fragment key={r.auditId}>
                    <tr>
                      <td style={{ fontSize: 12 }}>
                        {formatDateTime(r.createdAt)}
                      </td>
                      <td>
                        <Badge tone={actorTone(r.actorType)}>
                          {formatPlatformCodeLabel(locale, r.actorType)}
                        </Badge>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {truncate(
                          r.actorId ||
                            formatPlatformCodeLabel(locale, "system"),
                          18,
                        )}
                      </td>
                      <td>{formatPlatformCodeLabel(locale, r.moduleName)}</td>
                      <td>
                        <span
                          style={{
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                            fontSize: 11,
                            color: "#1d4ed8",
                          }}
                        >
                          {r.actionName}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          {link ? (
                            <a
                              href={link.route}
                              target={
                                link.openMode === "new_tab"
                                  ? "_blank"
                                  : undefined
                              }
                              rel={
                                link.openMode === "new_tab"
                                  ? "noopener noreferrer"
                                  : undefined
                              }
                              style={{
                                color: "#1d4ed8",
                                textDecoration: "underline",
                              }}
                              title={
                                link.openMode === "new_tab"
                                  ? `${link.targetApp} ↗`
                                  : link.targetApp
                              }
                            >
                              {formatPlatformCodeLabel(locale, r.resourceType)}
                              {r.resourceId
                                ? `:${truncate(r.resourceId, 8)}`
                                : ""}
                            </a>
                          ) : (
                            <span>
                              {formatPlatformCodeLabel(locale, r.resourceType)}
                              {r.resourceId
                                ? `:${truncate(r.resourceId, 8)}`
                                : ""}
                            </span>
                          )}
                          {hold && (
                            <span
                              title={t("audit.badge.holdTip", {
                                owner: hold.placedByActorId,
                                case: hold.caseNumber,
                              })}
                            >
                              <Badge tone="danger">
                                {t("audit.badge.hold")}
                              </Badge>
                            </span>
                          )}
                          {exception && (
                            <span
                              title={t("audit.badge.exemptTip", {
                                owner: exception.requestedByActorId,
                                reason: formatPlatformCodeLabel(
                                  locale,
                                  exception.reasonCode,
                                ),
                              })}
                            >
                              <Badge tone="warning">
                                {t("audit.badge.exempt")}
                              </Badge>
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        style={{
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                          fontSize: 11,
                        }}
                      >
                        {truncate(r.requestId, 12)}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          {expandable && (
                            <button
                              className="admin-btn admin-btn--secondary admin-btn--sm"
                              type="button"
                              onClick={() =>
                                props.setExpandedAuditId((cur) =>
                                  cur === r.auditId ? null : r.auditId,
                                )
                              }
                            >
                              {props.expandedAuditId === r.auditId
                                ? t("audit.collapse")
                                : t("audit.expand")}
                            </button>
                          )}
                          {r.resourceId &&
                            actions.map((d) => (
                              <ActionCTA
                                key={d.action}
                                descriptor={d}
                                size="sm"
                                label={t(`audit.actions.${d.action}`)}
                                onClick={() =>
                                  props.onAction(d.action as ActionKind, r)
                                }
                              />
                            ))}
                          {!expandable && !r.resourceId && (
                            <span style={{ fontSize: 12, color: "#9ca3af" }}>
                              —
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {props.expandedAuditId === r.auditId && (
                      <tr>
                        <td colSpan={8} style={{ background: "#fafafa" }}>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(auto-fit, minmax(240px, 1fr))",
                              gap: 12,
                            }}
                          >
                            <AuditValueCard
                              title={t("audit.oldValues")}
                              payload={r.oldValuesSummary}
                              t={t}
                            />
                            <AuditValueCard
                              title={t("audit.newValues")}
                              payload={r.newValuesSummary}
                              t={t}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Retention policies tab
// ─────────────────────────────────────────────────────────────────────────────
function PoliciesTab({
  t,
  locale,
  policies,
  emptyReason,
  onRetry,
}: {
  t: TFn;
  locale: Locale;
  policies: EvidenceRetentionPolicyRecord[];
  emptyReason: PlatformEmptyReason;
  onRetry: () => void;
}) {
  const signedDownloadFamilies = policies.filter(
    (p) => p.downloadControl?.mode === "signed_url",
  );
  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <MetricCard
          label={t("audit.metrics.policyFamilies")}
          value={String(policies.length)}
        />
        <MetricCard
          label={t("audit.metrics.signedDownload")}
          value={String(signedDownloadFamilies.length)}
        />
      </div>
      {policies.length === 0 ? (
        <EmptyState reason={emptyReason} t={t} onRetry={onRetry} />
      ) : (
        <div className="admin-card" style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("audit.policies.family")}</th>
                <th>{t("audit.policies.authority")}</th>
                <th>{t("audit.policies.retention")}</th>
                <th>{t("audit.policies.download")}</th>
                <th>{t("audit.policies.legalHold")}</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <tr key={policy.family}>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {formatPlatformCodeLabel(locale, policy.family)}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {policy.description}
                    </div>
                  </td>
                  <td>
                    {formatPlatformCodeLabel(locale, policy.authorityModule)}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {policy.hotRetentionDays}d /{" "}
                    {policy.archiveRetentionDays
                      ? `${policy.archiveRetentionDays}d`
                      : "—"}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {policy.downloadControl?.mode === "signed_url"
                      ? t("audit.policies.signedDownloadTtl", {
                          minutes: policy.downloadControl.ttlMinutes ?? 0,
                        })
                      : t("audit.policies.noDownload")}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {policy.legalHold.supported
                      ? t("audit.policies.holdEnabled")
                      : t("audit.policies.holdDisabled")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Active legal holds tab
// ─────────────────────────────────────────────────────────────────────────────
function HoldsTab({
  t,
  locale,
  holds,
  emptyReason,
  onRetry,
  onGrant,
  onRelease,
}: {
  t: TFn;
  locale: Locale;
  holds: EvidenceLegalHoldRecord[];
  emptyReason: PlatformEmptyReason;
  onRetry: () => void;
  onGrant: () => void;
  onRelease: (hold: EvidenceLegalHoldRecord) => void;
}) {
  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <ActionCTA
          descriptor={HOLD_GRANT_DESCRIPTOR}
          tone="primary"
          label={t("audit.actions.place_legal_hold")}
          onClick={onGrant}
        />
      </div>
      {holds.length === 0 ? (
        <EmptyState reason={emptyReason} t={t} onRetry={onRetry} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 12,
          }}
        >
          {holds.map((hold) => {
            const actions = readActions(hold, HOLD_ROW_ACTIONS);
            return (
              <div className="admin-card" key={hold.holdId}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <Badge tone="danger">{t("audit.badge.hold")}</Badge>
                  {actions.map((d) => (
                    <ActionCTA
                      key={d.action}
                      descriptor={d}
                      size="sm"
                      label={t(`audit.actions.${d.action}`)}
                      onClick={() => onRelease(hold)}
                    />
                  ))}
                </div>
                <DefinitionList
                  items={[
                    [
                      t("audit.holds.family"),
                      formatPlatformCodeLabel(locale, hold.family),
                    ],
                    [t("audit.holds.subject"), hold.subjectId],
                    [t("audit.holds.case"), hold.caseNumber],
                    [t("audit.holds.owner"), hold.placedByActorId],
                    [t("audit.holds.placedAt"), formatDateTime(hold.placedAt)],
                    [
                      t("audit.holds.reason"),
                      formatPlatformCodeLabel(locale, hold.reasonCode),
                    ],
                    ...(hold.reasonNote
                      ? [
                          [t("audit.holds.note"), hold.reasonNote] as [
                            string,
                            string,
                          ],
                        ]
                      : []),
                  ]}
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Deletion exceptions tab
// ─────────────────────────────────────────────────────────────────────────────
function ExceptionsTab({
  t,
  locale,
  exceptions,
  emptyReason,
  onRetry,
  onGrant,
  onResolve,
}: {
  t: TFn;
  locale: Locale;
  exceptions: EvidenceDeletionExceptionRecord[];
  emptyReason: PlatformEmptyReason;
  onRetry: () => void;
  onGrant: () => void;
  onResolve: (exception: EvidenceDeletionExceptionRecord) => void;
}) {
  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <ActionCTA
          descriptor={EXCEPTION_GRANT_DESCRIPTOR}
          tone="primary"
          label={t("audit.actions.register_deletion_exception")}
          onClick={onGrant}
        />
      </div>
      {exceptions.length === 0 ? (
        <EmptyState reason={emptyReason} t={t} onRetry={onRetry} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 12,
          }}
        >
          {exceptions.map((exception) => {
            const actions = readActions(exception, EXCEPTION_ROW_ACTIONS);
            return (
              <div className="admin-card" key={exception.exceptionId}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <Badge tone="warning">{t("audit.badge.exempt")}</Badge>
                  {actions.map((d) => (
                    <ActionCTA
                      key={d.action}
                      descriptor={d}
                      size="sm"
                      label={t(`audit.actions.${d.action}`)}
                      onClick={() => onResolve(exception)}
                    />
                  ))}
                </div>
                <DefinitionList
                  items={[
                    [
                      t("audit.exceptions.family"),
                      formatPlatformCodeLabel(locale, exception.family),
                    ],
                    [t("audit.exceptions.subject"), exception.subjectId],
                    [
                      t("audit.exceptions.owner"),
                      exception.requestedByActorId,
                    ],
                    [
                      t("audit.exceptions.reason"),
                      formatPlatformCodeLabel(locale, exception.reasonCode),
                    ],
                    [
                      t("audit.exceptions.expiresAt"),
                      formatDateTime(exception.expiresAt),
                    ],
                    ...(exception.reasonNote
                      ? [
                          [
                            t("audit.exceptions.note"),
                            exception.reasonNote,
                          ] as [string, string],
                        ]
                      : []),
                  ]}
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Action modal — risk-classified confirmation (packet §3.4)
// ─────────────────────────────────────────────────────────────────────────────
function ActionModal({
  t,
  locale,
  active,
  onCancel,
  onSubmit,
}: {
  t: TFn;
  locale: Locale;
  active: ActiveAction;
  onCancel: () => void;
  onSubmit: (kind: ActionKind, payload: Record<string, unknown>) => void;
}) {
  const { kind, descriptor } = active;
  const [reason, setReason] = useState("");
  const [family, setFamily] = useState<EvidenceRetentionFamily>(
    active.record?.moduleName === "audit"
      ? "audit_log"
      : EVIDENCE_RETENTION_FAMILIES[0],
  );
  const [subjectId, setSubjectId] = useState(active.record?.resourceId ?? "");
  const [caseNumber, setCaseNumber] = useState("");
  const [holdReasonCode, setHoldReasonCode] =
    useState<EvidenceLegalHoldReasonCode>(EVIDENCE_LEGAL_HOLD_REASON_CODES[0]);
  const [exceptionReasonCode, setExceptionReasonCode] =
    useState<EvidenceDeletionExceptionReasonCode>(
      EVIDENCE_DELETION_EXCEPTION_REASON_CODES[0],
    );
  const [sourceResourceType, setSourceResourceType] = useState(
    active.record?.resourceType ?? "",
  );
  const [sourceResourceId, setSourceResourceId] = useState(
    active.record?.resourceId ?? "",
  );
  const [reviewerActorId, setReviewerActorId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const requiresReason = descriptor.requiresReason ?? false;
  const reasonValid = !requiresReason || reason.trim().length > 0;

  function submit() {
    if (kind === "place_legal_hold") {
      if (!subjectId.trim() || !caseNumber.trim() || !reasonValid) return;
      onSubmit(kind, {
        family,
        subjectId: subjectId.trim(),
        caseNumber: caseNumber.trim(),
        reasonCode: holdReasonCode,
        reasonNote: reason.trim() || null,
      });
    } else if (kind === "release_legal_hold") {
      if (!reasonValid || !active.hold) return;
      onSubmit(kind, {
        holdId: active.hold.holdId,
        releaseReason: reason.trim(),
      });
    } else if (kind === "register_deletion_exception") {
      if (
        !subjectId.trim() ||
        !sourceResourceType.trim() ||
        !sourceResourceId.trim() ||
        !reviewerActorId.trim() ||
        !expiresAt ||
        !reasonValid
      )
        return;
      onSubmit(kind, {
        family,
        subjectId: subjectId.trim(),
        sourceResourceType: sourceResourceType.trim(),
        sourceResourceId: sourceResourceId.trim(),
        reviewerActorId: reviewerActorId.trim(),
        expiresAt: new Date(expiresAt).toISOString(),
        reasonCode: exceptionReasonCode,
        reasonNote: reason.trim() || null,
      });
    } else {
      if (!reasonValid || !active.exception) return;
      onSubmit(kind, {
        exceptionId: active.exception.exceptionId,
        resolutionNote: reason.trim(),
      });
    }
  }

  const isGrantHold = kind === "place_legal_hold";
  const isGrantException = kind === "register_deletion_exception";

  return (
    <div style={modalOverlayStyle} role="dialog" aria-modal="true">
      <div style={modalStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge tone={riskTone(descriptor.riskLevel)}>
            {t(`audit.risk.${descriptor.riskLevel}`)}
          </Badge>
          <h2 style={{ margin: 0, fontSize: 18 }}>
            {t(`audit.actions.${kind}`)}
          </h2>
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {(isGrantHold || isGrantException) && (
            <ModalField label={t("audit.modal.family")}>
              <select
                value={family}
                onChange={(e) =>
                  setFamily(e.target.value as EvidenceRetentionFamily)
                }
                style={modalInputStyle}
              >
                {EVIDENCE_RETENTION_FAMILIES.map((f) => (
                  <option key={f} value={f}>
                    {formatPlatformCodeLabel(locale, f)}
                  </option>
                ))}
              </select>
            </ModalField>
          )}
          {(isGrantHold || isGrantException) && (
            <ModalField label={t("audit.modal.subjectId")}>
              <input
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                style={modalInputStyle}
              />
            </ModalField>
          )}
          {isGrantHold && (
            <>
              <ModalField label={t("audit.modal.caseNumber")}>
                <input
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  style={modalInputStyle}
                />
              </ModalField>
              <ModalField label={t("audit.modal.reasonCode")}>
                <select
                  value={holdReasonCode}
                  onChange={(e) =>
                    setHoldReasonCode(
                      e.target.value as EvidenceLegalHoldReasonCode,
                    )
                  }
                  style={modalInputStyle}
                >
                  {EVIDENCE_LEGAL_HOLD_REASON_CODES.map((c) => (
                    <option key={c} value={c}>
                      {formatPlatformCodeLabel(locale, c)}
                    </option>
                  ))}
                </select>
              </ModalField>
            </>
          )}
          {isGrantException && (
            <>
              <ModalField label={t("audit.modal.sourceResourceType")}>
                <input
                  value={sourceResourceType}
                  onChange={(e) => setSourceResourceType(e.target.value)}
                  style={modalInputStyle}
                />
              </ModalField>
              <ModalField label={t("audit.modal.sourceResourceId")}>
                <input
                  value={sourceResourceId}
                  onChange={(e) => setSourceResourceId(e.target.value)}
                  style={modalInputStyle}
                />
              </ModalField>
              <ModalField label={t("audit.modal.reviewer")}>
                <input
                  value={reviewerActorId}
                  onChange={(e) => setReviewerActorId(e.target.value)}
                  style={modalInputStyle}
                />
              </ModalField>
              <ModalField label={t("audit.modal.expiresAt")}>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  style={modalInputStyle}
                />
              </ModalField>
              <ModalField label={t("audit.modal.reasonCode")}>
                <select
                  value={exceptionReasonCode}
                  onChange={(e) =>
                    setExceptionReasonCode(
                      e.target.value as EvidenceDeletionExceptionReasonCode,
                    )
                  }
                  style={modalInputStyle}
                >
                  {EVIDENCE_DELETION_EXCEPTION_REASON_CODES.map((c) => (
                    <option key={c} value={c}>
                      {formatPlatformCodeLabel(locale, c)}
                    </option>
                  ))}
                </select>
              </ModalField>
            </>
          )}
          {requiresReason && (
            <ModalField
              label={`${t("audit.modal.reason")} ${t("audit.modal.required")}`}
            >
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                style={{ ...modalInputStyle, resize: "vertical" }}
                placeholder={t("audit.modal.reasonPlaceholder")}
              />
            </ModalField>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 20,
          }}
        >
          <button
            className="admin-btn admin-btn--secondary"
            onClick={onCancel}
            type="button"
          >
            {t("common.cancel")}
          </button>
          <button
            className="admin-btn admin-btn--primary"
            onClick={submit}
            disabled={!reasonValid}
            type="button"
          >
            {t("audit.modal.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Receipt toast — ActionReceipt with "View audit" deep link (packet §3.4)
// ─────────────────────────────────────────────────────────────────────────────
function ReceiptToast({
  toast,
  t,
  onClose,
}: {
  toast: ToastState;
  t: TFn;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 60,
        maxWidth: 360,
        background: "#ffffff",
        border: `1px solid ${
          toast.ok ? "rgba(22,163,74,0.4)" : "rgba(239,68,68,0.4)"
        }`,
        borderRadius: 12,
        boxShadow: "0 10px 30px rgba(15,23,42,0.18)",
        padding: 16,
      }}
      role="status"
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <strong style={{ fontSize: 14 }}>
          {toast.ok ? t("audit.receipt.title") : t("audit.receipt.failed")}
        </strong>
        <button
          onClick={onClose}
          type="button"
          aria-label={t("common.close")}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontSize: 16,
          }}
        >
          ×
        </button>
      </div>
      <p style={{ margin: "0 0 8px", fontSize: 13, color: "#475569" }}>
        {toast.receipt.message}
      </p>
      {toast.ok && toast.receipt.auditId && (
        <a
          href={`/audit?auditId=${encodeURIComponent(toast.receipt.auditId)}`}
          style={{
            color: "#1d4ed8",
            textDecoration: "underline",
            fontSize: 13,
          }}
        >
          {t("audit.receipt.viewAudit")}
        </a>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state — six distinct EmptyReason treatments (packet §3.6)
// ─────────────────────────────────────────────────────────────────────────────
function EmptyState({
  reason,
  t,
  onRetry,
  onClearFilters,
}: {
  reason: PlatformEmptyReason;
  t: TFn;
  onRetry?: () => void;
  onClearFilters?: () => void;
}) {
  const treatment = EMPTY_TREATMENTS[reason];
  const accent = EMPTY_TONE_COLOR[treatment.tone];
  return (
    <div
      className="admin-card admin-empty"
      style={{
        borderLeft: `4px solid ${accent}`,
        textAlign: "center",
        padding: "40px 24px",
      }}
      data-empty-reason={reason}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>{treatment.glyph}</div>
      <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>
        {t(`audit.empty.${reason}.title`)}
      </h3>
      <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
        {t(`audit.empty.${reason}.body`)}
      </p>
      {treatment.action === "retry" && onRetry && (
        <button
          className="admin-btn admin-btn--secondary"
          style={{ marginTop: 16 }}
          onClick={onRetry}
          type="button"
        >
          {t("audit.empty.retry")}
        </button>
      )}
      {treatment.action === "clear_filters" && onClearFilters && (
        <button
          className="admin-btn admin-btn--secondary"
          style={{ marginTop: 16 }}
          onClick={onClearFilters}
          type="button"
        >
          {t("audit.clearFilters")}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small shared primitives
// ─────────────────────────────────────────────────────────────────────────────
type StatusToneLite = "success" | "warning" | "info" | "neutral" | "danger";

const TONE_STYLES: Record<
  StatusToneLite,
  { background: string; color: string }
> = {
  success: { background: "rgba(22,163,74,0.12)", color: "#166534" },
  warning: { background: "rgba(245,158,11,0.16)", color: "#92400e" },
  info: { background: "rgba(59,130,246,0.12)", color: "#1d4ed8" },
  neutral: { background: "rgba(100,116,139,0.12)", color: "#475569" },
  danger: { background: "rgba(239,68,68,0.14)", color: "#991b1b" },
};

function Badge({
  tone,
  children,
}: {
  tone: StatusToneLite;
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
        ...TONE_STYLES[tone],
      }}
    >
      {children}
    </span>
  );
}

function actorTone(actorType: string): StatusToneLite {
  switch (actorType) {
    case "platform_admin":
      return "info";
    case "ops_user":
      return "warning";
    case "tenant_admin":
      return "success";
    case "partner_api_key":
      return "danger";
    default:
      return "neutral";
  }
}

function riskTone(risk: ResourceActionDescriptor["riskLevel"]): StatusToneLite {
  return risk === "high" ? "danger" : risk === "medium" ? "warning" : "neutral";
}

function FilterPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        appearance: "none",
        cursor: "pointer",
        border: active ? "1px solid #1d4ed8" : "1px solid #cbd5e1",
        background: active ? "#1d4ed8" : "#ffffff",
        color: active ? "#ffffff" : "#1e293b",
        borderRadius: 999,
        padding: "4px 12px",
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 500 }}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={filterInputStyle}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ActionCTA({
  descriptor,
  label,
  onClick,
  tone = "secondary",
  size = "md",
}: {
  descriptor: ResourceActionDescriptor;
  label: string;
  onClick: () => void;
  tone?: "primary" | "secondary";
  size?: "md" | "sm";
}) {
  const disabled = !descriptor.enabled;
  const cls = [
    "admin-btn",
    tone === "primary" ? "admin-btn--primary" : "admin-btn--secondary",
    size === "sm" ? "admin-btn--sm" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      className={cls}
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={
        disabled
          ? descriptor.disabledReasonCode
          : `risk:${descriptor.riskLevel}`
      }
      style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
    >
      {descriptor.riskLevel === "high" ? "⚠ " : ""}
      {label}
    </button>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-card">
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function DefinitionList({ items }: { items: [string, string][] }) {
  return (
    <dl
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: "6px 16px",
        margin: 0,
        fontSize: 13,
      }}
    >
      {items.map(([k, v], i) => (
        <React.Fragment key={`${k}-${i}`}>
          <dt
            style={{
              color: "#6b7280",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {k}
          </dt>
          <dd style={{ margin: 0, color: "#0f172a", wordBreak: "break-word" }}>
            {v}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function ModalField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function AuditValueCard({
  title,
  payload,
  t,
}: {
  title: string;
  payload?: Record<string, unknown>;
  t: TFn;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
        {title}
      </div>
      {payload ? (
        <pre
          style={{
            margin: 0,
            fontSize: 11,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {JSON.stringify(payload, null, 2)}
        </pre>
      ) : (
        <span style={{ fontSize: 12, color: "#9ca3af" }}>
          {t("audit.noValue")}
        </span>
      )}
    </div>
  );
}

// ── Static descriptors for grant CTAs (authority-driven; §3.5) ────────────────
const HOLD_GRANT_DESCRIPTOR: ResourceActionDescriptor = {
  action: "place_legal_hold",
  enabled: true,
  requiresReason: true,
  riskLevel: "high",
};
const EXCEPTION_GRANT_DESCRIPTOR: ResourceActionDescriptor = {
  action: "register_deletion_exception",
  enabled: true,
  requiresReason: true,
  riskLevel: "high",
};

// ── Shared styles ─────────────────────────────────────────────────────────────
const filterInputStyle: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  fontSize: 13,
};

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
  padding: 16,
};

const modalStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 16,
  padding: 24,
  width: "min(520px, 100%)",
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 20px 60px rgba(15,23,42,0.3)",
};

const modalInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 13,
  boxSizing: "border-box",
};
