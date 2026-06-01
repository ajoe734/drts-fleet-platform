/**
 * /audit — Audit & Evidence Governance
 *
 * Rebuilt to the Platform Admin.html canvas artboard (`PA_Audit`, Q-ADM16) and
 * behaviour from packet `docs/05-ui/platform-admin-design-handoff-packet-20260525.md`
 * §5.16. Implements:
 *   - canvas visual (CanvasShell + tabs + module pills + audit table + hold/
 *     exception governance cards) using @drts/ui-web canvas primitives
 *   - refresh tier T6 (manual): no polling, manual refresh affordance + freshness
 *   - `availableActions`-driven CTAs (Q-X13) via ResourceActionDescriptor, never
 *     hard-coded by role; high-risk actions open a confirm modal that collects a
 *     required reason (Q-X09/Q-X10)
 *   - six distinct EmptyReason treatments (Q-X15)
 *   - cross-app deep links (Q-X03): inbound query-param filtering + outbound
 *     resource links that open another app's view in a new tab
 */

"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import {
  formatDateTime,
  truncate,
  usePlatformAdminClient,
} from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import {
  EVIDENCE_DELETION_EXCEPTION_REASON_CODES,
  EVIDENCE_LEGAL_HOLD_REASON_CODES,
  EVIDENCE_RETENTION_FAMILIES,
  type AuditLogRecord,
  type CreateEvidenceDeletionExceptionCommand,
  type CreateEvidenceLegalHoldCommand,
  type EvidenceDeletionExceptionRecord,
  type EvidenceLegalHoldRecord,
  type EvidenceRetentionPolicyRecord,
  type ReleaseEvidenceLegalHoldCommand,
  type ResolveEvidenceDeletionExceptionCommand,
} from "@drts/contracts";
import type {
  CrossAppResourceLink,
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

// ─────────────────────────────────────────────────────────────────────────────
// Theme + static styles (mirrors the platform sibling pages)
// ─────────────────────────────────────────────────────────────────────────────

const th = buildCanvasTheme({
  surface: "platform",
  dark: true,
  density: "compact",
});

// Per packet §3.2 the /audit surface is the single T6 (manual) tier: no polling.
const REFRESH_TIER: RefreshTier = "manual";
const STALE_AFTER_MS = 5 * 60 * 1000;

const shellStyle: CSSProperties = {
  height: "calc(100vh - 64px)",
  minHeight: "calc(100vh - 64px)",
  borderRadius: 24,
  overflow: "hidden",
  border: `1px solid ${th.border}`,
  boxShadow: "0 24px 60px rgba(2, 6, 23, 0.28)",
  gridTemplateColumns: "0 minmax(0, 1fr)",
  gridTemplateRows: "46px minmax(0, 1fr)",
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const headerActionsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
  alignItems: "center",
};

const pillRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const filterBarStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-end",
  flexWrap: "wrap",
};

const cardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
  gap: 16,
};

const kpiRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const selectStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontSize: 12.5,
  fontFamily: th.fontFamily,
};

const inputStyle: CSSProperties = {
  ...selectStyle,
};

const monoInputStyle: CSSProperties = {
  ...selectStyle,
  fontFamily: th.monoFamily,
};

const textareaStyle: CSSProperties = {
  ...selectStyle,
  minHeight: 72,
  resize: "vertical",
  lineHeight: 1.5,
};

const tabButtonStyle: CSSProperties = {
  border: 0,
  background: "transparent",
  padding: 0,
  margin: 0,
  font: "inherit",
  color: "inherit",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const filterButtonStyle: CSSProperties = {
  border: 0,
  padding: 0,
  background: "transparent",
  cursor: "pointer",
};

const detailPanelStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 16,
};

const valueCardStyle: CSSProperties = {
  border: `1px solid ${th.border}`,
  borderRadius: 8,
  padding: 12,
  background: th.surfaceLo,
};

const preStyle: CSSProperties = {
  margin: 0,
  fontSize: 11.5,
  fontFamily: th.monoFamily,
  color: th.text,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 6, 23, 0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 40,
};

const modalCardStyle: CSSProperties = {
  width: "min(560px, 100%)",
  maxHeight: "calc(100vh - 96px)",
  overflowY: "auto",
  background: th.surface,
  border: `1px solid ${th.border}`,
  borderRadius: 14,
  boxShadow: "0 32px 80px rgba(2, 6, 23, 0.45)",
};

const modalHeaderStyle: CSSProperties = {
  padding: "16px 18px",
  borderBottom: `1px solid ${th.border}`,
};

const modalBodyStyle: CSSProperties = {
  padding: 18,
  display: "grid",
  gap: 6,
};

const modalFooterStyle: CSSProperties = {
  padding: "14px 18px",
  borderTop: `1px solid ${th.border}`,
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};

const emptyStateWrapStyle: CSSProperties = {
  padding: "40px 28px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
  textAlign: "center",
};

const loadingStateStyle: CSSProperties = {
  padding: 28,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

// ─────────────────────────────────────────────────────────────────────────────
// Domain helpers
// ─────────────────────────────────────────────────────────────────────────────

type TabId = "log" | "policy" | "hold" | "except";
type Locale = "zh" | "en";

type GovernanceAction =
  | "grant_legal_hold"
  | "lift_legal_hold"
  | "grant_deletion_exception"
  | "revoke_deletion_exception";

type PendingAction =
  | { kind: "grant_legal_hold"; descriptor: ResourceActionDescriptor }
  | {
      kind: "lift_legal_hold";
      descriptor: ResourceActionDescriptor;
      hold: EvidenceLegalHoldRecord;
    }
  | { kind: "grant_deletion_exception"; descriptor: ResourceActionDescriptor }
  | {
      kind: "revoke_deletion_exception";
      descriptor: ResourceActionDescriptor;
      exception: EvidenceDeletionExceptionRecord;
    };

const ACTOR_TYPE_TONE: Record<AuditLogRecord["actorType"], CanvasTone> = {
  platform_admin: "accent",
  ops_user: "info",
  tenant_admin: "success",
  partner_api_key: "warn",
  system: "neutral",
};

// Q-X03: which app owns each resource type. Resources owned by platform-admin
// open in-app; everything else is a cross-app deep link opened in a new tab.
type TargetApp = CrossAppResourceLink["targetApp"];

function resolveResourceOwner(resourceType: string): TargetApp {
  const type = resourceType.toLowerCase();
  if (
    type.includes("order") ||
    type.includes("dispatch") ||
    type.includes("driver") ||
    type.includes("vehicle") ||
    type.includes("complaint") ||
    type.includes("incident")
  ) {
    return "ops-console";
  }
  if (
    type.includes("booking") ||
    type.includes("passenger") ||
    type.includes("invoice") ||
    type.includes("cost_center")
  ) {
    return "tenant-console";
  }
  return "platform-admin";
}

function buildResourceLink(
  record: AuditLogRecord,
  locale: Locale,
): CrossAppResourceLink | null {
  if (!record.resourceId) {
    return null;
  }
  const targetApp = resolveResourceOwner(record.resourceType);
  const label =
    locale === "en"
      ? `Open ${record.resourceType} in ${targetApp}`
      : `在 ${targetApp} 開啟 ${record.resourceType}`;
  const route = `/audit?resourceType=${encodeURIComponent(
    record.resourceType,
  )}&resourceId=${encodeURIComponent(record.resourceId)}`;
  return {
    targetApp,
    route,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    openMode: targetApp === "platform-admin" ? "same_tab" : "new_tab",
    label,
  };
}

function computeFreshness(
  loadedAt: string | null,
  hasError: boolean,
): UiRefreshMetadata["dataFreshness"] {
  if (hasError) {
    return "degraded";
  }
  if (!loadedAt) {
    return "unknown";
  }
  return Date.now() - new Date(loadedAt).getTime() > STALE_AFTER_MS
    ? "stale"
    : "fresh";
}

function inferEmptyReason(
  error: string | null,
  filtersActive: boolean,
): EmptyReason {
  if (error) {
    const lowered = error.toLowerCase();
    if (
      lowered.includes("403") ||
      lowered.includes("forbidden") ||
      lowered.includes("permission") ||
      lowered.includes("unauthor")
    ) {
      return "permission_denied";
    }
    if (
      lowered.includes("network") ||
      lowered.includes("fetch") ||
      lowered.includes("timeout") ||
      lowered.includes("503") ||
      lowered.includes("unavailable")
    ) {
      return "external_unavailable";
    }
    return "fetch_failed";
  }
  return filtersActive ? "filtered_empty" : "no_data";
}

function formatTime(loadedAt: string | null, locale: Locale): string {
  if (!loadedAt) {
    return locale === "en" ? "never" : "尚未載入";
  }
  const date = new Date(loadedAt);
  if (Number.isNaN(date.getTime())) {
    return loadedAt;
  }
  return date.toLocaleTimeString(locale === "en" ? "en-US" : "zh-TW");
}

// ─────────────────────────────────────────────────────────────────────────────
// availableActions → CTA renderer (Q-X13 + Q-X09/Q-X10)
// ─────────────────────────────────────────────────────────────────────────────

function DescriptorButton({
  descriptor,
  label,
  size = "sm",
  variant = "secondary",
  disabledReasonLabel,
  onInvoke,
}: {
  descriptor: ResourceActionDescriptor;
  label: string;
  size?: "xs" | "sm" | "md";
  variant?: "primary" | "secondary" | "ghost";
  disabledReasonLabel?: string;
  onInvoke: () => void;
}) {
  // Per packet §3.5 a disabled descriptor stays visible (with a reason
  // tooltip), never hidden. High-risk actions get a danger treatment.
  const title = descriptor.enabled
    ? descriptor.requiresReason
      ? "requires reason"
      : undefined
    : disabledReasonLabel ?? descriptor.disabledReasonCode;
  return (
    <span title={title}>
      <CanvasBtn
        theme={th}
        size={size}
        variant={variant}
        danger={descriptor.enabled && descriptor.riskLevel === "high"}
        disabled={!descriptor.enabled}
        onClick={onInvoke}
      >
        {label}
      </CanvasBtn>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const { t, locale } = useTranslation() as {
    t: (key: string, params?: Record<string, string | number>) => string;
    locale: Locale;
  };
  const client = usePlatformAdminClient();

  const [records, setRecords] = useState<AuditLogRecord[]>([]);
  const [policies, setPolicies] = useState<EvidenceRetentionPolicyRecord[]>([]);
  const [legalHolds, setLegalHolds] = useState<EvidenceLegalHoldRecord[]>([]);
  const [deletionExceptions, setDeletionExceptions] = useState<
    EvidenceDeletionExceptionRecord[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  const [tab, setTab] = useState<TabId>("log");
  const [filterModule, setFilterModule] = useState("");
  const [filterActorType, setFilterActorType] = useState("");
  const [filterResourceType, setFilterResourceType] = useState("");
  const [filterSince, setFilterSince] = useState("");
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const copy = useMemo(() => buildCopy(locale), [locale]);

  const loadAll = useCallback(async () => {
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
      setRecords(normalizeAuditRecords(auditList));
      setPolicies(policyList ?? []);
      setLegalHolds(holdList ?? []);
      setDeletionExceptions(exceptionList ?? []);
      setLoadedAt(new Date().toISOString());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  // T6 manual tier (Q-X02): load once on mount; no polling interval.
  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Q-X03 inbound deep link: other apps link into /audit filtered by a
  // specific resource / audit id / module. Read once on mount (client-only,
  // so no Suspense boundary is required for the search params).
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const moduleParam = params.get("module");
    const resourceTypeParam = params.get("resourceType");
    if (moduleParam) {
      setFilterModule(moduleParam);
    }
    if (resourceTypeParam) {
      setFilterResourceType(resourceTypeParam);
    }
  }, []);

  const modules = useMemo(
    () => [...new Set(records.map((r) => r.moduleName).filter(Boolean))].sort(),
    [records],
  );
  const actorTypes = useMemo(
    () => [...new Set(records.map((r) => r.actorType).filter(Boolean))].sort(),
    [records],
  );
  const resourceTypes = useMemo(
    () =>
      [...new Set(records.map((r) => r.resourceType).filter(Boolean))].sort(),
    [records],
  );

  const moduleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of records) {
      if (!record.moduleName) {
        continue;
      }
      counts.set(record.moduleName, (counts.get(record.moduleName) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [records]);

  const sinceMs = useMemo(() => {
    if (!filterSince) {
      return null;
    }
    const ms = new Date(filterSince).getTime();
    return Number.isNaN(ms) ? null : ms;
  }, [filterSince]);

  const filtersActive = Boolean(
    filterModule || filterActorType || filterResourceType || sinceMs,
  );

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      if (filterModule && record.moduleName !== filterModule) {
        return false;
      }
      if (filterActorType && record.actorType !== filterActorType) {
        return false;
      }
      if (filterResourceType && record.resourceType !== filterResourceType) {
        return false;
      }
      if (sinceMs) {
        const created = new Date(record.createdAt).getTime();
        if (Number.isNaN(created) || created < sinceMs) {
          return false;
        }
      }
      return true;
    });
  }, [records, filterModule, filterActorType, filterResourceType, sinceMs]);

  const activeLegalHolds = useMemo(
    () => legalHolds.filter((hold) => hold.status === "active"),
    [legalHolds],
  );
  const activeDeletionExceptions = useMemo(
    () =>
      deletionExceptions.filter((exception) => exception.status === "active"),
    [deletionExceptions],
  );
  const signedDownloadFamilies = useMemo(
    () =>
      policies.filter((policy) => policy.downloadControl?.mode === "signed_url"),
    [policies],
  );

  // Q-ADM16 decoration: map subjectId → active hold / exception so an audit row
  // whose resource is under governance renders the HOLD / EXEMPT badge.
  const heldSubjects = useMemo(() => {
    const map = new Map<string, EvidenceLegalHoldRecord>();
    for (const hold of activeLegalHolds) {
      map.set(hold.subjectId, hold);
    }
    return map;
  }, [activeLegalHolds]);
  const exemptSubjects = useMemo(() => {
    const map = new Map<string, EvidenceDeletionExceptionRecord>();
    for (const exception of activeDeletionExceptions) {
      map.set(exception.subjectId, exception);
      map.set(exception.sourceResourceId, exception);
    }
    return map;
  }, [activeDeletionExceptions]);

  const freshness = computeFreshness(loadedAt, Boolean(error));

  // availableActions descriptors (Q-X13). These mirror the backend
  // `data.availableActions[]` shape; CTAs render off the descriptor risk +
  // enabled flags rather than being hard-coded by role.
  const grantHoldDescriptor: ResourceActionDescriptor = {
    action: "grant_legal_hold",
    enabled: true,
    riskLevel: "high",
    requiresReason: true,
  };
  const grantExceptionDescriptor: ResourceActionDescriptor = {
    action: "grant_deletion_exception",
    enabled: true,
    riskLevel: "high",
    requiresReason: true,
  };
  const holdRowActions = (
    hold: EvidenceLegalHoldRecord,
  ): ResourceActionDescriptor => ({
    action: "lift_legal_hold",
    enabled: hold.status === "active",
    ...(hold.status === "active"
      ? {}
      : { disabledReasonCode: "already_released" }),
    riskLevel: "high",
    requiresReason: true,
  });
  const exceptionRowActions = (
    exception: EvidenceDeletionExceptionRecord,
  ): ResourceActionDescriptor => ({
    action: "revoke_deletion_exception",
    enabled: exception.status === "active",
    ...(exception.status === "active"
      ? {}
      : { disabledReasonCode: "not_active" }),
    riskLevel: "high",
    requiresReason: true,
  });

  const openAction = (next: PendingAction) => {
    setActionError(null);
    setForm(buildInitialForm(next));
    setPending(next);
  };

  const closeAction = () => {
    setPending(null);
    setForm({});
    setActionError(null);
  };

  const submitAction = async () => {
    if (!pending) {
      return;
    }
    setSubmitting(true);
    setActionError(null);
    const fv = (key: string) => (form[key] ?? "").trim();
    try {
      let auditId = "";
      if (pending.kind === "grant_legal_hold") {
        const command: CreateEvidenceLegalHoldCommand = {
          family: fv("family") as CreateEvidenceLegalHoldCommand["family"],
          subjectId: fv("subjectId"),
          caseNumber: fv("caseNumber"),
          reasonCode:
            fv("reasonCode") as CreateEvidenceLegalHoldCommand["reasonCode"],
          ...(fv("reasonNote") ? { reasonNote: fv("reasonNote") } : {}),
          ...(fv("tenantId") ? { tenantId: fv("tenantId") } : {}),
        };
        const result = await client.placeEvidenceLegalHold(command);
        auditId = result.holdId;
      } else if (pending.kind === "lift_legal_hold") {
        const command: ReleaseEvidenceLegalHoldCommand = {
          releaseReason: fv("reason"),
        };
        const result = await client.releaseEvidenceLegalHold(
          pending.hold.holdId,
          command,
        );
        auditId = result.holdId;
      } else if (pending.kind === "grant_deletion_exception") {
        const command: CreateEvidenceDeletionExceptionCommand = {
          family:
            fv("family") as CreateEvidenceDeletionExceptionCommand["family"],
          subjectId: fv("subjectId"),
          sourceResourceType: fv("sourceResourceType"),
          sourceResourceId: fv("sourceResourceId"),
          reviewerActorId: fv("reviewerActorId"),
          expiresAt: new Date(fv("expiresAt")).toISOString(),
          reasonCode:
            fv("reasonCode") as CreateEvidenceDeletionExceptionCommand["reasonCode"],
          ...(fv("reasonNote") ? { reasonNote: fv("reasonNote") } : {}),
          ...(fv("tenantId") ? { tenantId: fv("tenantId") } : {}),
        };
        const result = await client.registerEvidenceDeletionException(command);
        auditId = result.exceptionId;
      } else {
        const command: ResolveEvidenceDeletionExceptionCommand = {
          resolutionNote: fv("reason"),
        };
        const result = await client.resolveEvidenceDeletionException(
          pending.exception.exceptionId,
          command,
        );
        auditId = result.exceptionId;
      }
      // Q-X09: action receipt with audit reference.
      setToast(`${copy.actions[pending.kind]} · ${copy.receipt} ${auditId}`);
      closeAction();
      await loadAll();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const navItems = useMemo<CanvasShellNavItem[]>(() => buildNav(copy), [copy]);

  const tabDefs: { id: TabId; label: string; badge?: number }[] = [
    { id: "log", label: copy.tabs.log },
    { id: "policy", label: copy.tabs.policy, badge: policies.length },
    { id: "hold", label: copy.tabs.hold, badge: activeLegalHolds.length },
    {
      id: "except",
      label: copy.tabs.except,
      badge: activeDeletionExceptions.length,
    },
  ];

  const tabNodes = tabDefs.map((def) => (
    <button
      key={def.id}
      type="button"
      style={tabButtonStyle}
      onClick={() => setTab(def.id)}
      aria-pressed={tab === def.id}
    >
      {def.label}
      {def.badge ? (
        <CanvasPill theme={th} tone={def.id === "log" ? "neutral" : "warn"}>
          {def.badge}
        </CanvasPill>
      ) : null}
    </button>
  ));
  const activeTabNode = tabNodes[tabDefs.findIndex((def) => def.id === tab)];

  const resetFilters = () => {
    setFilterModule("");
    setFilterActorType("");
    setFilterResourceType("");
    setFilterSince("");
  };

  const auditColumns = useMemo<CanvasTableColumn<AuditRow>[]>(
    () => [
      {
        h: copy.columns.when,
        w: 168,
        mono: true,
        r: (row) => formatDateTime(row.createdAt),
      },
      {
        h: copy.columns.actorType,
        w: 132,
        r: (row) => (
          <CanvasPill theme={th} tone={ACTOR_TYPE_TONE[row.actorType]} dot>
            {formatPlatformCodeLabel(locale, row.actorType)}
          </CanvasPill>
        ),
      },
      {
        h: copy.columns.actor,
        w: 200,
        mono: true,
        r: (row) =>
          row.actorId
            ? truncate(row.actorId, 26)
            : formatPlatformCodeLabel(locale, "system"),
      },
      {
        h: copy.columns.module,
        w: 132,
        mono: true,
        r: (row) => formatPlatformCodeLabel(locale, row.moduleName),
      },
      {
        h: copy.columns.action,
        w: 188,
        r: (row) => (
          <span
            style={{
              color: th.accent,
              fontFamily: th.monoFamily,
              fontSize: 11.5,
            }}
          >
            {row.actionName}
          </span>
        ),
      },
      {
        h: copy.columns.resource,
        w: 252,
        r: (row) => {
          const hold = row.resourceId
            ? heldSubjects.get(row.resourceId)
            : undefined;
          const exempt = row.resourceId
            ? exemptSubjects.get(row.resourceId)
            : undefined;
          const link = buildResourceLink(row, locale);
          return (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <ResourceCell link={link} record={row} locale={locale} />
              {hold ? (
                <span
                  title={`legal hold · ${hold.placedByActorId} · ${hold.caseNumber}`}
                >
                  <CanvasPill theme={th} tone="danger">
                    {copy.holdBadge}
                  </CanvasPill>
                </span>
              ) : null}
              {exempt ? (
                <span
                  title={`deletion exception · ${exempt.reviewerActorId} · ${formatPlatformCodeLabel(
                    locale,
                    exempt.reasonCode,
                  )}`}
                >
                  <CanvasPill theme={th} tone="warn">
                    {copy.exemptBadge}
                  </CanvasPill>
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        h: copy.columns.request,
        w: 140,
        mono: true,
        r: (row) => truncate(row.requestId, 14),
      },
      {
        h: copy.columns.detail,
        w: 96,
        r: (row) =>
          row.oldValuesSummary || row.newValuesSummary ? (
            <CanvasBtn
              theme={th}
              size="xs"
              variant="ghost"
              onClick={() =>
                setExpandedAuditId((current) =>
                  current === row.auditId ? null : row.auditId,
                )
              }
            >
              {expandedAuditId === row.auditId ? copy.collapse : copy.expand}
            </CanvasBtn>
          ) : (
            <span style={{ color: th.textDim }}>—</span>
          ),
      },
    ],
    [copy, locale, heldSubjects, exemptSubjects, expandedAuditId],
  );

  const expandedRecord = filteredRecords.find(
    (record) => record.auditId === expandedAuditId,
  );

  const emptyReason = inferEmptyReason(error, filtersActive);

  return (
    <CanvasShell
      theme={th}
      nav={navItems}
      active="audit"
      currentPath="/audit"
      breadcrumb={copy.breadcrumb}
      brandLabel="DRTS Fleet"
      brandSubLabel="Platform Admin"
      brandMark="PA"
      avatarLabel="PA"
      env="production"
      searchPlaceholder={copy.searchPlaceholder}
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={th}
        title={copy.title}
        subtitle={copy.subtitle}
        tabs={tabNodes}
        activeTab={activeTabNode}
        actions={
          <div style={headerActionsStyle}>
            <CanvasPill
              theme={th}
              tone={
                freshness === "fresh"
                  ? "success"
                  : freshness === "degraded"
                    ? "danger"
                    : "warn"
              }
              dot
            >
              {copy.tierManual} · {copy.freshness[freshness]} ·{" "}
              {formatTime(loadedAt, locale)}
            </CanvasPill>
            <CanvasBtn
              theme={th}
              variant="secondary"
              icon="reports"
              onClick={() => exportAuditCsv(filteredRecords, copy, locale)}
              disabled={loading || filteredRecords.length === 0}
            >
              {copy.exportCsv}
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="primary"
              icon="check"
              onClick={() => void loadAll()}
              disabled={loading}
            >
              {copy.refresh}
            </CanvasBtn>
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {toast ? (
          <CanvasBanner
            theme={th}
            tone="success"
            icon="ok"
            title={copy.actionDone}
            body={toast}
            actions={
              <CanvasBtn
                theme={th}
                size="xs"
                variant="ghost"
                onClick={() => setToast(null)}
              >
                {copy.dismiss}
              </CanvasBtn>
            }
          />
        ) : null}

        {error ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title={copy.errorTitle}
            body={error}
            actions={
              <CanvasBtn
                theme={th}
                size="xs"
                variant="secondary"
                onClick={() => void loadAll()}
              >
                {copy.retry}
              </CanvasBtn>
            }
          />
        ) : null}

        {tab === "log" ? (
          <>
            <div style={pillRowStyle}>
              <CanvasPill theme={th} tone="accent" dot>
                {copy.allRecords} {records.length.toLocaleString()}
              </CanvasPill>
              {moduleCounts.slice(0, 6).map(([moduleName, count]) => (
                <button
                  key={moduleName}
                  type="button"
                  style={filterButtonStyle}
                  onClick={() =>
                    setFilterModule((current) =>
                      current === moduleName ? "" : moduleName,
                    )
                  }
                  aria-pressed={filterModule === moduleName}
                >
                  <CanvasPill
                    theme={th}
                    tone={filterModule === moduleName ? "accent" : "neutral"}
                    dot
                  >
                    {formatPlatformCodeLabel(locale, moduleName)} {count}
                  </CanvasPill>
                </button>
              ))}
            </div>

            <CanvasCard theme={th} title={copy.filters.title}>
              <div style={filterBarStyle}>
                <CanvasField theme={th} label={copy.filters.module}>
                  <select
                    value={filterModule}
                    onChange={(event) => setFilterModule(event.target.value)}
                    style={selectStyle}
                  >
                    <option value="">{copy.filters.all}</option>
                    {modules.map((moduleName) => (
                      <option key={moduleName} value={moduleName}>
                        {formatPlatformCodeLabel(locale, moduleName)}
                      </option>
                    ))}
                  </select>
                </CanvasField>
                <CanvasField theme={th} label={copy.filters.actorType}>
                  <select
                    value={filterActorType}
                    onChange={(event) => setFilterActorType(event.target.value)}
                    style={selectStyle}
                  >
                    <option value="">{copy.filters.all}</option>
                    {actorTypes.map((actorType) => (
                      <option key={actorType} value={actorType}>
                        {formatPlatformCodeLabel(locale, actorType)}
                      </option>
                    ))}
                  </select>
                </CanvasField>
                <CanvasField theme={th} label={copy.filters.resourceType}>
                  <select
                    value={filterResourceType}
                    onChange={(event) =>
                      setFilterResourceType(event.target.value)
                    }
                    style={selectStyle}
                  >
                    <option value="">{copy.filters.all}</option>
                    {resourceTypes.map((resourceType) => (
                      <option key={resourceType} value={resourceType}>
                        {formatPlatformCodeLabel(locale, resourceType)}
                      </option>
                    ))}
                  </select>
                </CanvasField>
                <CanvasField theme={th} label={copy.filters.since}>
                  <input
                    type="datetime-local"
                    value={filterSince}
                    onChange={(event) => setFilterSince(event.target.value)}
                    style={inputStyle}
                  />
                </CanvasField>
                <CanvasBtn
                  theme={th}
                  variant="ghost"
                  icon="x"
                  onClick={resetFilters}
                  disabled={!filtersActive}
                >
                  {copy.filters.reset}
                </CanvasBtn>
              </div>
            </CanvasCard>

            <CanvasCard theme={th} padding={0}>
              {loading ? (
                <div style={loadingStateStyle}>{copy.loading}</div>
              ) : filteredRecords.length > 0 ? (
                <CanvasTable<AuditRow>
                  theme={th}
                  columns={auditColumns}
                  rows={filteredRecords as AuditRow[]}
                />
              ) : (
                <EmptyState
                  reason={emptyReason}
                  copy={copy}
                  onReset={filtersActive ? resetFilters : undefined}
                  onRetry={error ? () => void loadAll() : undefined}
                />
              )}
            </CanvasCard>

            {expandedRecord ? (
              <CanvasCard
                theme={th}
                title={`${copy.detailTitle} · ${truncate(expandedRecord.auditId, 18)}`}
                actions={
                  <CanvasBtn
                    theme={th}
                    size="xs"
                    variant="ghost"
                    onClick={() => setExpandedAuditId(null)}
                  >
                    {copy.collapse}
                  </CanvasBtn>
                }
              >
                <div style={detailPanelStyle}>
                  <ValueCard
                    title={copy.oldValues}
                    payload={expandedRecord.oldValuesSummary}
                    emptyLabel={copy.noValues}
                  />
                  <ValueCard
                    title={copy.newValues}
                    payload={expandedRecord.newValuesSummary}
                    emptyLabel={copy.noValues}
                  />
                </div>
              </CanvasCard>
            ) : null}
          </>
        ) : null}

        {tab === "policy" ? (
          <>
            <div style={kpiRowStyle}>
              <CanvasKPI
                theme={th}
                label={copy.metrics.policyFamilies}
                value={String(policies.length)}
              />
              <CanvasKPI
                theme={th}
                label={copy.metrics.signedDownload}
                value={String(signedDownloadFamilies.length)}
              />
              <CanvasKPI
                theme={th}
                label={copy.metrics.activeHolds}
                value={String(activeLegalHolds.length)}
              />
              <CanvasKPI
                theme={th}
                label={copy.metrics.activeExceptions}
                value={String(activeDeletionExceptions.length)}
              />
            </div>
            <CanvasCard
              theme={th}
              title={copy.policies.title}
              subtitle={copy.policies.subtitle}
              padding={0}
            >
              {loading ? (
                <div style={loadingStateStyle}>{copy.loading}</div>
              ) : policies.length > 0 ? (
                <CanvasTable<PolicyRow>
                  theme={th}
                  columns={[
                    {
                      h: copy.policies.family,
                      w: 240,
                      r: (policy) => (
                        <div>
                          <div style={{ fontWeight: 600, color: th.text }}>
                            {formatPlatformCodeLabel(locale, policy.family)}
                          </div>
                          <div
                            style={{ fontSize: 11, color: th.textMuted }}
                          >
                            {policy.description}
                          </div>
                        </div>
                      ),
                    },
                    {
                      h: copy.policies.authority,
                      w: 160,
                      r: (policy) =>
                        formatPlatformCodeLabel(locale, policy.authorityModule),
                    },
                    {
                      h: copy.policies.retention,
                      w: 150,
                      mono: true,
                      r: (policy) =>
                        `${policy.hotRetentionDays}d / ${
                          policy.archiveRetentionDays
                            ? `${policy.archiveRetentionDays}d`
                            : "—"
                        }`,
                    },
                    {
                      h: copy.policies.download,
                      w: 160,
                      r: (policy) =>
                        policy.downloadControl?.mode === "signed_url" ? (
                          <CanvasPill theme={th} tone="info">
                            {copy.policies.signedTtl.replace(
                              "{m}",
                              String(policy.downloadControl.ttlMinutes ?? 0),
                            )}
                          </CanvasPill>
                        ) : (
                          <CanvasPill theme={th} tone="neutral">
                            {copy.policies.noDownload}
                          </CanvasPill>
                        ),
                    },
                    {
                      h: copy.policies.legalHold,
                      w: 130,
                      r: (policy) =>
                        policy.legalHold.supported ? (
                          <CanvasPill theme={th} tone="success">
                            {copy.policies.holdOn}
                          </CanvasPill>
                        ) : (
                          <CanvasPill theme={th} tone="neutral">
                            {copy.policies.holdOff}
                          </CanvasPill>
                        ),
                    },
                  ]}
                  rows={policies as PolicyRow[]}
                />
              ) : (
                // Q-X15: an empty policy catalog means evidence governance is
                // not provisioned for this realm — a distinct state.
                <EmptyState reason="not_provisioned" copy={copy} />
              )}
            </CanvasCard>
          </>
        ) : null}

        {tab === "hold" ? (
          <CanvasCard
            theme={th}
            title={copy.holds.title}
            subtitle={copy.holds.subtitle}
            actions={
              <DescriptorButton
                descriptor={grantHoldDescriptor}
                label={copy.actions.grant_legal_hold}
                variant="primary"
                onInvoke={() =>
                  openAction({
                    kind: "grant_legal_hold",
                    descriptor: grantHoldDescriptor,
                  })
                }
              />
            }
            padding={0}
          >
            {loading ? (
              <div style={loadingStateStyle}>{copy.loading}</div>
            ) : activeLegalHolds.length > 0 ? (
              <CanvasTable<HoldRow>
                theme={th}
                columns={[
                  {
                    h: copy.holds.family,
                    w: 150,
                    r: (hold) => formatPlatformCodeLabel(locale, hold.family),
                  },
                  { h: copy.holds.subject, w: 200, mono: true, k: "subjectId" },
                  { h: copy.holds.case, w: 140, mono: true, k: "caseNumber" },
                  {
                    h: copy.holds.reason,
                    w: 180,
                    r: (hold) =>
                      formatPlatformCodeLabel(locale, hold.reasonCode),
                  },
                  {
                    h: copy.holds.owner,
                    w: 180,
                    mono: true,
                    r: (hold) => truncate(hold.placedByActorId, 22),
                  },
                  {
                    h: copy.holds.placedAt,
                    w: 168,
                    mono: true,
                    r: (hold) => formatDateTime(hold.placedAt),
                  },
                  {
                    h: copy.columns.actions,
                    w: 110,
                    r: (hold) => {
                      const descriptor = holdRowActions(hold);
                      return (
                        <DescriptorButton
                          descriptor={descriptor}
                          label={copy.actions.lift_legal_hold}
                          disabledReasonLabel={copy.disabled.alreadyReleased}
                          onInvoke={() =>
                            openAction({
                              kind: "lift_legal_hold",
                              descriptor,
                              hold,
                            })
                          }
                        />
                      );
                    },
                  },
                ]}
                rows={activeLegalHolds as HoldRow[]}
              />
            ) : (
              <EmptyState reason="no_data" copy={copy} variant="holds" />
            )}
          </CanvasCard>
        ) : null}

        {tab === "except" ? (
          <CanvasCard
            theme={th}
            title={copy.exceptions.title}
            subtitle={copy.exceptions.subtitle}
            actions={
              <DescriptorButton
                descriptor={grantExceptionDescriptor}
                label={copy.actions.grant_deletion_exception}
                variant="primary"
                onInvoke={() =>
                  openAction({
                    kind: "grant_deletion_exception",
                    descriptor: grantExceptionDescriptor,
                  })
                }
              />
            }
            padding={0}
          >
            {loading ? (
              <div style={loadingStateStyle}>{copy.loading}</div>
            ) : activeDeletionExceptions.length > 0 ? (
              <CanvasTable<ExceptionRow>
                theme={th}
                columns={[
                  {
                    h: copy.exceptions.family,
                    w: 150,
                    r: (exception) =>
                      formatPlatformCodeLabel(locale, exception.family),
                  },
                  {
                    h: copy.exceptions.subject,
                    w: 200,
                    mono: true,
                    k: "subjectId",
                  },
                  {
                    h: copy.exceptions.reason,
                    w: 180,
                    r: (exception) =>
                      formatPlatformCodeLabel(locale, exception.reasonCode),
                  },
                  {
                    h: copy.exceptions.owner,
                    w: 180,
                    mono: true,
                    r: (exception) => truncate(exception.reviewerActorId, 22),
                  },
                  {
                    h: copy.exceptions.expiresAt,
                    w: 168,
                    mono: true,
                    r: (exception) => formatDateTime(exception.expiresAt),
                  },
                  {
                    h: copy.columns.actions,
                    w: 110,
                    r: (exception) => {
                      const descriptor = exceptionRowActions(exception);
                      return (
                        <DescriptorButton
                          descriptor={descriptor}
                          label={copy.actions.revoke_deletion_exception}
                          disabledReasonLabel={copy.disabled.notActive}
                          onInvoke={() =>
                            openAction({
                              kind: "revoke_deletion_exception",
                              descriptor,
                              exception,
                            })
                          }
                        />
                      );
                    },
                  },
                ]}
                rows={activeDeletionExceptions as ExceptionRow[]}
              />
            ) : (
              <EmptyState reason="no_data" copy={copy} variant="exceptions" />
            )}
          </CanvasCard>
        ) : null}
      </div>

      {pending ? (
        <GovernanceModal
          pending={pending}
          form={form}
          setForm={setForm}
          submitting={submitting}
          error={actionError}
          copy={copy}
          locale={locale}
          onClose={closeAction}
          onSubmit={() => void submitAction()}
        />
      ) : null}
    </CanvasShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

type AuditRow = AuditLogRecord & Record<string, unknown>;
type PolicyRow = EvidenceRetentionPolicyRecord & Record<string, unknown>;
type HoldRow = EvidenceLegalHoldRecord & Record<string, unknown>;
type ExceptionRow = EvidenceDeletionExceptionRecord & Record<string, unknown>;

function ResourceCell({
  link,
  record,
  locale,
}: {
  link: CrossAppResourceLink | null;
  record: AuditLogRecord;
  locale: Locale;
}) {
  const label = (
    <span style={{ fontFamily: th.monoFamily, fontSize: 11.5 }}>
      {formatPlatformCodeLabel(locale, record.resourceType)}
      {record.resourceId ? `:${truncate(record.resourceId, 8)}` : ""}
    </span>
  );
  if (!link || !record.resourceId) {
    return label;
  }
  if (link.openMode === "same_tab") {
    return (
      <Link
        href={link.route}
        title={link.label}
        style={{ color: th.accent, textDecoration: "none" }}
      >
        {label}
      </Link>
    );
  }
  // Q-X03: cross-app target opens in a new tab.
  return (
    <a
      href={link.route}
      target="_blank"
      rel="noreferrer"
      title={`${link.label} (${link.targetApp})`}
      style={{
        color: th.accent,
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {label}
      <span style={{ fontSize: 10, color: th.textDim }}>↗</span>
    </a>
  );
}

function ValueCard({
  title,
  payload,
  emptyLabel,
}: {
  title: string;
  payload: Record<string, unknown> | undefined;
  emptyLabel: string;
}) {
  return (
    <div style={valueCardStyle}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: th.text }}>
        {title}
      </div>
      {payload ? (
        <pre style={preStyle}>{JSON.stringify(payload, null, 2)}</pre>
      ) : (
        <span style={{ fontSize: 12, color: th.textDim }}>{emptyLabel}</span>
      )}
    </div>
  );
}

// Q-X15: six distinct empty-state treatments.
const EMPTY_STATE_TONE: Record<EmptyReason, CanvasTone> = {
  no_data: "neutral",
  not_provisioned: "info",
  fetch_failed: "danger",
  permission_denied: "warn",
  external_unavailable: "warn",
  driver_not_eligible: "neutral",
  filtered_empty: "accent",
};

const EMPTY_STATE_ICON: Record<EmptyReason, string> = {
  no_data: "○",
  not_provisioned: "◇",
  fetch_failed: "✕",
  permission_denied: "⊘",
  external_unavailable: "⚠",
  driver_not_eligible: "○",
  filtered_empty: "⊜",
};

function EmptyState({
  reason,
  copy,
  variant,
  onReset,
  onRetry,
}: {
  reason: EmptyReason;
  copy: Copy;
  variant?: "holds" | "exceptions" | undefined;
  onReset?: (() => void) | undefined;
  onRetry?: (() => void) | undefined;
}) {
  const message =
    variant === "holds"
      ? copy.empty.noHolds
      : variant === "exceptions"
        ? copy.empty.noExceptions
        : copy.empty[reason];
  return (
    <div style={emptyStateWrapStyle}>
      <CanvasPill theme={th} tone={EMPTY_STATE_TONE[reason]} dot>
        {EMPTY_STATE_ICON[reason]} {formatEmptyReasonLabel(reason, copy)}
      </CanvasPill>
      <div style={{ color: th.textMuted, fontSize: 12.5, maxWidth: 420 }}>
        {message}
      </div>
      {onReset ? (
        <CanvasBtn theme={th} size="sm" variant="secondary" onClick={onReset}>
          {copy.filters.reset}
        </CanvasBtn>
      ) : null}
      {onRetry ? (
        <CanvasBtn theme={th} size="sm" variant="secondary" onClick={onRetry}>
          {copy.retry}
        </CanvasBtn>
      ) : null}
    </div>
  );
}

function formatEmptyReasonLabel(reason: EmptyReason, copy: Copy): string {
  return copy.emptyReason[reason] ?? reason;
}

function GovernanceModal({
  pending,
  form,
  setForm,
  submitting,
  error,
  copy,
  locale,
  onClose,
  onSubmit,
}: {
  pending: PendingAction;
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  submitting: boolean;
  error: string | null;
  copy: Copy;
  locale: Locale;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const set = (key: string) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const requiresReason = pending.descriptor.requiresReason ?? false;
  const valid = isFormValid(pending, form);

  return (
    <div style={modalOverlayStyle} role="dialog" aria-modal="true">
      <div style={modalCardStyle}>
        <div style={modalHeaderStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CanvasPill theme={th} tone="danger" dot>
              {pending.descriptor.riskLevel.toUpperCase()}
            </CanvasPill>
            <h2 style={{ margin: 0, fontSize: 15, color: th.text }}>
              {copy.actions[pending.kind]}
            </h2>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: th.textMuted }}>
            {copy.confirmReasonHint}
          </p>
        </div>

        <div style={modalBodyStyle}>
          {pending.kind === "grant_legal_hold" ? (
            <>
              <div style={fieldGridStyle}>
                <CanvasField theme={th} label={copy.form.family} required>
                  <select
                    value={form.family}
                    onChange={set("family")}
                    style={selectStyle}
                  >
                    {EVIDENCE_RETENTION_FAMILIES.map((family) => (
                      <option key={family} value={family}>
                        {formatPlatformCodeLabel(locale, family)}
                      </option>
                    ))}
                  </select>
                </CanvasField>
                <CanvasField theme={th} label={copy.form.reasonCode} required>
                  <select
                    value={form.reasonCode}
                    onChange={set("reasonCode")}
                    style={selectStyle}
                  >
                    {EVIDENCE_LEGAL_HOLD_REASON_CODES.map((code) => (
                      <option key={code} value={code}>
                        {formatPlatformCodeLabel(locale, code)}
                      </option>
                    ))}
                  </select>
                </CanvasField>
              </div>
              <div style={fieldGridStyle}>
                <CanvasField theme={th} label={copy.form.subjectId} required>
                  <input
                    value={form.subjectId}
                    onChange={set("subjectId")}
                    style={monoInputStyle}
                    placeholder="inc_0214"
                  />
                </CanvasField>
                <CanvasField theme={th} label={copy.form.caseNumber} required>
                  <input
                    value={form.caseNumber}
                    onChange={set("caseNumber")}
                    style={monoInputStyle}
                    placeholder="CASE-2026-0042"
                  />
                </CanvasField>
              </div>
              <CanvasField theme={th} label={copy.form.tenantId}>
                <input
                  value={form.tenantId}
                  onChange={set("tenantId")}
                  style={monoInputStyle}
                  placeholder="tenant-001"
                />
              </CanvasField>
              <CanvasField theme={th} label={copy.form.reasonNote} required>
                <textarea
                  value={form.reasonNote}
                  onChange={set("reasonNote")}
                  style={textareaStyle}
                  placeholder={copy.form.reasonNotePlaceholder}
                />
              </CanvasField>
            </>
          ) : null}

          {pending.kind === "grant_deletion_exception" ? (
            <>
              <div style={fieldGridStyle}>
                <CanvasField theme={th} label={copy.form.family} required>
                  <select
                    value={form.family}
                    onChange={set("family")}
                    style={selectStyle}
                  >
                    {EVIDENCE_RETENTION_FAMILIES.map((family) => (
                      <option key={family} value={family}>
                        {formatPlatformCodeLabel(locale, family)}
                      </option>
                    ))}
                  </select>
                </CanvasField>
                <CanvasField theme={th} label={copy.form.reasonCode} required>
                  <select
                    value={form.reasonCode}
                    onChange={set("reasonCode")}
                    style={selectStyle}
                  >
                    {EVIDENCE_DELETION_EXCEPTION_REASON_CODES.map((code) => (
                      <option key={code} value={code}>
                        {formatPlatformCodeLabel(locale, code)}
                      </option>
                    ))}
                  </select>
                </CanvasField>
              </div>
              <div style={fieldGridStyle}>
                <CanvasField theme={th} label={copy.form.subjectId} required>
                  <input
                    value={form.subjectId}
                    onChange={set("subjectId")}
                    style={monoInputStyle}
                  />
                </CanvasField>
                <CanvasField theme={th} label={copy.form.reviewerActorId} required>
                  <input
                    value={form.reviewerActorId}
                    onChange={set("reviewerActorId")}
                    style={monoInputStyle}
                    placeholder="pa_ops_risk_gov.user"
                  />
                </CanvasField>
              </div>
              <div style={fieldGridStyle}>
                <CanvasField
                  theme={th}
                  label={copy.form.sourceResourceType}
                  required
                >
                  <input
                    value={form.sourceResourceType}
                    onChange={set("sourceResourceType")}
                    style={monoInputStyle}
                    placeholder="webhook_delivery"
                  />
                </CanvasField>
                <CanvasField
                  theme={th}
                  label={copy.form.sourceResourceId}
                  required
                >
                  <input
                    value={form.sourceResourceId}
                    onChange={set("sourceResourceId")}
                    style={monoInputStyle}
                    placeholder="wh_01"
                  />
                </CanvasField>
              </div>
              <div style={fieldGridStyle}>
                <CanvasField theme={th} label={copy.form.expiresAt} required>
                  <input
                    type="datetime-local"
                    value={form.expiresAt}
                    onChange={set("expiresAt")}
                    style={inputStyle}
                  />
                </CanvasField>
                <CanvasField theme={th} label={copy.form.tenantId}>
                  <input
                    value={form.tenantId}
                    onChange={set("tenantId")}
                    style={monoInputStyle}
                  />
                </CanvasField>
              </div>
              <CanvasField theme={th} label={copy.form.reasonNote} required>
                <textarea
                  value={form.reasonNote}
                  onChange={set("reasonNote")}
                  style={textareaStyle}
                  placeholder={copy.form.reasonNotePlaceholder}
                />
              </CanvasField>
            </>
          ) : null}

          {(pending.kind === "lift_legal_hold" ||
            pending.kind === "revoke_deletion_exception") &&
          requiresReason ? (
            <CanvasField theme={th} label={copy.form.reason} required>
              <textarea
                value={form.reason}
                onChange={set("reason")}
                style={textareaStyle}
                placeholder={copy.form.reasonPlaceholder}
              />
            </CanvasField>
          ) : null}

          {error ? (
            <CanvasBanner
              theme={th}
              tone="danger"
              icon="warn"
              title={copy.actionFailed}
              body={error}
            />
          ) : null}
        </div>

        <div style={modalFooterStyle}>
          <CanvasBtn theme={th} variant="ghost" onClick={onClose}>
            {copy.cancel}
          </CanvasBtn>
          <CanvasBtn
            theme={th}
            variant="primary"
            danger
            disabled={submitting || !valid}
            onClick={onSubmit}
          >
            {submitting ? copy.submitting : copy.confirm}
          </CanvasBtn>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeAuditRecords(result: unknown): AuditLogRecord[] {
  if (!Array.isArray(result)) {
    return [];
  }
  return result.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      auditId: String(r.auditId ?? r.id ?? ""),
      actorId: (r.actorId as string | null) ?? null,
      actorType:
        (r.actorType as AuditLogRecord["actorType"]) ?? ("system" as const),
      tenantId: (r.tenantId as string | null) ?? null,
      moduleName: String(r.moduleName ?? r.module ?? ""),
      actionName: String(r.actionName ?? r.action ?? ""),
      resourceType: String(r.resourceType ?? ""),
      resourceId: (r.resourceId as string | null) ?? null,
      ...(r.oldValuesSummary
        ? { oldValuesSummary: r.oldValuesSummary as Record<string, unknown> }
        : {}),
      ...(r.newValuesSummary
        ? { newValuesSummary: r.newValuesSummary as Record<string, unknown> }
        : {}),
      requestId: String(r.requestId ?? ""),
      createdAt: String(r.createdAt ?? ""),
    } satisfies AuditLogRecord;
  });
}

function buildInitialForm(pending: PendingAction): Record<string, string> {
  if (pending.kind === "grant_legal_hold") {
    return {
      family: EVIDENCE_RETENTION_FAMILIES[0],
      reasonCode: EVIDENCE_LEGAL_HOLD_REASON_CODES[0],
      subjectId: "",
      caseNumber: "",
      tenantId: "",
      reasonNote: "",
    };
  }
  if (pending.kind === "grant_deletion_exception") {
    return {
      family: EVIDENCE_RETENTION_FAMILIES[0],
      reasonCode: EVIDENCE_DELETION_EXCEPTION_REASON_CODES[0],
      subjectId: "",
      reviewerActorId: "",
      sourceResourceType: "",
      sourceResourceId: "",
      expiresAt: "",
      tenantId: "",
      reasonNote: "",
    };
  }
  return { reason: "" };
}

function isFormValid(
  pending: PendingAction,
  form: Record<string, string>,
): boolean {
  if (pending.kind === "grant_legal_hold") {
    return Boolean(
      form.subjectId?.trim() &&
        form.caseNumber?.trim() &&
        form.reasonNote?.trim(),
    );
  }
  if (pending.kind === "grant_deletion_exception") {
    return Boolean(
      form.subjectId?.trim() &&
        form.reviewerActorId?.trim() &&
        form.sourceResourceType?.trim() &&
        form.sourceResourceId?.trim() &&
        form.expiresAt?.trim() &&
        form.reasonNote?.trim(),
    );
  }
  return Boolean(form.reason?.trim());
}

function exportAuditCsv(
  rows: AuditLogRecord[],
  copy: Copy,
  locale: Locale,
): void {
  if (typeof window === "undefined" || rows.length === 0) {
    return;
  }
  const header = [
    copy.columns.when,
    copy.columns.actorType,
    copy.columns.actor,
    copy.columns.module,
    copy.columns.action,
    copy.columns.resource,
    copy.columns.request,
  ];
  const escape = (value: string) =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const lines = rows.map((row) =>
    [
      row.createdAt,
      row.actorType,
      row.actorId ?? "system",
      row.moduleName,
      row.actionName,
      `${row.resourceType}${row.resourceId ? `:${row.resourceId}` : ""}`,
      row.requestId,
    ]
      .map((cell) => escape(String(cell)))
      .join(","),
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `platform-audit-${locale}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildNav(copy: Copy): CanvasShellNavItem[] {
  return [
    { divider: copy.nav.workspace },
    { key: "home", href: "/", icon: "home", label: copy.nav.home },
    { key: "health", href: "/health", icon: "health", label: copy.nav.health },
    { divider: copy.nav.governance },
    { key: "tenants", href: "/tenants", icon: "tenants", label: copy.nav.tenants },
    {
      key: "partners",
      href: "/partners",
      icon: "partners",
      label: copy.nav.partners,
    },
    { key: "users", href: "/users", icon: "users", label: copy.nav.users },
    { divider: copy.nav.fleet },
    { key: "fleet", href: "/fleet", icon: "fleet", label: copy.nav.fleetPage },
    {
      key: "switchboard",
      href: "/switchboard",
      icon: "switchboard",
      label: copy.nav.switchboard,
    },
    { divider: copy.nav.pricing },
    {
      key: "pricing",
      href: "/pricing",
      icon: "pricing",
      label: copy.nav.pricingPage,
    },
    {
      key: "payments",
      href: "/payments",
      icon: "payments",
      label: copy.nav.payments,
    },
    { divider: copy.nav.platform },
    { key: "notices", href: "/notices", icon: "notices", label: copy.nav.notices },
    { key: "audit", href: "/audit", icon: "audit", label: copy.nav.audit },
    { key: "flags", href: "/feature-flags", icon: "flags", label: copy.nav.flags },
    {
      key: "adapters",
      href: "/adapter-registry",
      icon: "adapters",
      label: copy.nav.adapters,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Copy (zh-TW primary / en secondary per Q-X17)
// ─────────────────────────────────────────────────────────────────────────────

type Copy = ReturnType<typeof buildCopy>;

function buildCopy(locale: Locale) {
  const en = locale === "en";
  return {
    title: "Audit & Evidence Governance",
    subtitle: en
      ? "Append-only audit trail · legal hold + deletion exception surfaced via badge (Q-ADM16)."
      : "Append-only 稽核軌跡 · legal hold 與 deletion exception 透過 badge 顯示 (Q-ADM16)。",
    searchPlaceholder: en
      ? "Search tenants, partners, users, audit events…"
      : "搜尋租戶、合作夥伴、人員、稽核事件…",
    breadcrumb: en
      ? ["Platform Ops", "Audit & Evidence"]
      : ["平台維運", "稽核與證據"],
    tierManual: en ? "manual · T6" : "manual · T6",
    refresh: en ? "Refresh" : "重新整理",
    exportCsv: en ? "Export CSV" : "匯出 csv",
    retry: en ? "Retry" : "重試",
    dismiss: en ? "Dismiss" : "關閉",
    loading: en ? "Loading audit trail…" : "載入稽核軌跡中…",
    allRecords: en ? "All records" : "全部",
    errorTitle: en ? "Unable to load audit data" : "無法載入稽核資料",
    actionDone: en ? "Action recorded" : "動作已記錄",
    actionFailed: en ? "Action failed" : "動作失敗",
    receipt: en ? "audit ref" : "稽核參照",
    detailTitle: en ? "Record detail" : "紀錄明細",
    oldValues: en ? "Old values" : "變更前",
    newValues: en ? "New values" : "變更後",
    noValues: en ? "No values captured" : "未擷取值",
    expand: en ? "Detail" : "明細",
    collapse: en ? "Hide" : "收合",
    holdBadge: "HOLD",
    exemptBadge: "EXEMPT",
    cancel: en ? "Cancel" : "取消",
    confirm: en ? "Confirm" : "確認",
    submitting: en ? "Submitting…" : "送出中…",
    confirmReasonHint: en
      ? "High-risk action — a reason is required and recorded to the audit trail."
      : "高風險動作 — 需填寫原因，並寫入稽核軌跡。",
    freshness: {
      fresh: en ? "fresh" : "最新",
      stale: en ? "stale" : "過期",
      degraded: en ? "degraded" : "降級",
      unknown: en ? "unknown" : "未知",
    } as Record<UiRefreshMetadata["dataFreshness"], string>,
    tabs: {
      log: en ? "Audit log" : "稽核紀錄",
      policy: en ? "Retention policies" : "保留政策",
      hold: en ? "Active legal holds" : "Legal holds",
      except: en ? "Deletion exceptions" : "刪除例外",
    },
    columns: {
      when: "WHEN",
      actorType: en ? "ACTOR TYPE" : "ACTOR TYPE",
      actor: "ACTOR",
      module: "MODULE",
      action: "ACTION",
      resource: "RESOURCE",
      request: "REQUEST",
      detail: en ? "DETAIL" : "明細",
      actions: en ? "ACTIONS" : "動作",
    },
    filters: {
      title: en ? "Filters" : "篩選",
      all: en ? "All" : "全部",
      module: en ? "Module" : "模組",
      actorType: en ? "Actor type" : "操作者類型",
      resourceType: en ? "Resource type" : "資源類型",
      since: en ? "Since" : "起始時間",
      reset: en ? "Clear filters" : "清除篩選",
    },
    metrics: {
      policyFamilies: en ? "Policy families" : "政策家族",
      signedDownload: en ? "Signed download" : "簽章下載",
      activeHolds: en ? "Active holds" : "生效中 holds",
      activeExceptions: en ? "Active exceptions" : "生效中例外",
    },
    policies: {
      title: en ? "Evidence retention policies" : "證據保留政策",
      subtitle: en
        ? "Per-family retention authority, download control, and legal-hold support."
        : "各家族的保留授權、下載控制與 legal-hold 支援。",
      family: en ? "FAMILY" : "家族",
      authority: en ? "AUTHORITY" : "授權模組",
      retention: en ? "HOT / ARCHIVE" : "熱 / 封存",
      download: en ? "DOWNLOAD" : "下載",
      legalHold: en ? "LEGAL HOLD" : "LEGAL HOLD",
      signedTtl: en ? "signed · {m}m" : "簽章 · {m}分",
      noDownload: en ? "no download" : "不可下載",
      holdOn: en ? "supported" : "支援",
      holdOff: en ? "n/a" : "不支援",
    },
    holds: {
      title: en ? "Active legal holds" : "生效中 legal holds",
      subtitle: en
        ? "Records under hold cannot be deleted (Q-ADM16)."
        : "Hold 中的紀錄不可刪除 (Q-ADM16)。",
      family: en ? "FAMILY" : "家族",
      subject: en ? "SUBJECT" : "對象",
      case: en ? "CASE" : "案號",
      reason: en ? "REASON" : "原因",
      owner: en ? "OWNER" : "持有者",
      placedAt: en ? "GRANTED AT" : "設定時間",
    },
    exceptions: {
      title: en ? "Deletion exceptions" : "刪除例外",
      subtitle: en
        ? "Records exempted from normal retention rules (Q-ADM16)."
        : "豁免一般 retention 規則的紀錄 (Q-ADM16)。",
      family: en ? "FAMILY" : "家族",
      subject: en ? "SUBJECT" : "對象",
      reason: en ? "REASON" : "原因",
      owner: en ? "OWNER" : "審核者",
      expiresAt: en ? "EXPIRES" : "到期",
    },
    actions: {
      grant_legal_hold: en ? "Grant legal hold" : "設定 legal hold",
      lift_legal_hold: en ? "Lift hold" : "解除 hold",
      grant_deletion_exception: en
        ? "Grant deletion exception"
        : "設定刪除例外",
      revoke_deletion_exception: en ? "Revoke exception" : "撤銷例外",
    } as Record<GovernanceAction, string>,
    disabled: {
      alreadyReleased: en ? "Hold already released" : "Hold 已解除",
      notActive: en ? "Exception not active" : "例外非生效中",
    },
    form: {
      family: en ? "Family" : "家族",
      reasonCode: en ? "Reason code" : "原因代碼",
      subjectId: en ? "Subject id" : "對象 id",
      caseNumber: en ? "Case number" : "案號",
      tenantId: en ? "Tenant id (optional)" : "租戶 id (選填)",
      reviewerActorId: en ? "Reviewer actor id" : "審核者 id",
      sourceResourceType: en ? "Source resource type" : "來源資源類型",
      sourceResourceId: en ? "Source resource id" : "來源資源 id",
      expiresAt: en ? "Expires at" : "到期時間",
      reasonNote: en ? "Reason" : "原因說明",
      reasonNotePlaceholder: en
        ? "Why this evidence must be preserved…"
        : "說明為何需保留此證據…",
      reason: en ? "Reason" : "原因",
      reasonPlaceholder: en
        ? "Reason for this change (recorded to audit)…"
        : "本次變更原因 (寫入稽核)…",
    },
    emptyReason: {
      no_data: en ? "No data" : "尚無資料",
      not_provisioned: en ? "Not provisioned" : "未配置",
      fetch_failed: en ? "Fetch failed" : "讀取失敗",
      permission_denied: en ? "Permission denied" : "權限不足",
      external_unavailable: en ? "External unavailable" : "外部不可用",
      driver_not_eligible: en ? "Not eligible" : "不適用",
      filtered_empty: en ? "No matches" : "無符合項目",
    } as Record<EmptyReason, string>,
    empty: {
      no_data: en
        ? "No audit events have been recorded yet."
        : "尚未記錄任何稽核事件。",
      not_provisioned: en
        ? "Evidence governance has not been provisioned for this environment."
        : "此環境尚未配置證據治理政策。",
      fetch_failed: en
        ? "The audit read model could not be loaded. Try again."
        : "無法載入稽核讀取模型，請重試。",
      permission_denied: en
        ? "You do not have audit read scope for this surface."
        : "你沒有此頁面的稽核讀取權限。",
      external_unavailable: en
        ? "The audit service is temporarily unavailable."
        : "稽核服務暫時不可用。",
      driver_not_eligible: en ? "Not applicable." : "不適用。",
      filtered_empty: en
        ? "No audit events match the current filters."
        : "目前篩選條件下沒有符合的稽核事件。",
      noHolds: en
        ? "No active legal holds."
        : "目前沒有生效中的 legal hold。",
      noExceptions: en
        ? "No active deletion exceptions."
        : "目前沒有生效中的刪除例外。",
    } as Record<EmptyReason | "noHolds" | "noExceptions", string>,
    nav: {
      workspace: en ? "Workspace" : "工作面",
      governance: en ? "Tenant Governance" : "租戶治理",
      fleet: en ? "Fleet & Compliance" : "車隊與法遵",
      pricing: en ? "Pricing & Settlement" : "計價與結算",
      platform: en ? "Platform Layer" : "平台層",
      home: en ? "Home" : "工作首頁",
      health: en ? "Platform Health" : "平台健康",
      tenants: en ? "Tenants" : "租戶",
      partners: en ? "Partner Entry" : "合作夥伴 entry",
      users: en ? "Platform Staff" : "平台人員",
      fleetPage: en ? "Fleet & Compliance" : "車隊與合規",
      switchboard: en ? "Public Info & Placards" : "法定資訊與牌貼",
      pricingPage: en ? "Pricing" : "計價",
      payments: en ? "Settlement Governance" : "結算治理",
      notices: en ? "Notices & Maintenance" : "公告與維護",
      audit: en ? "Audit & Evidence" : "稽核與證據",
      flags: en ? "Feature Flags" : "功能旗標",
      adapters: en ? "Adapter Registry" : "介接登錄",
    },
  };
}
