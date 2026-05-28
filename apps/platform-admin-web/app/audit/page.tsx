"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { useSearchParams } from "next/navigation";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type { Locale } from "@/lib/translations";
import type {
  AuditLogRecord,
  CreateEvidenceDeletionExceptionCommand,
  CreateEvidenceLegalHoldCommand,
  EvidenceDeletionExceptionRecord,
  EvidenceLegalHoldRecord,
  EvidenceRetentionFamily,
  EvidenceRetentionPolicyRecord,
  EmptyReason,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  EVIDENCE_DELETION_EXCEPTION_REASON_CODES,
  EVIDENCE_LEGAL_HOLD_REASON_CODES,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasShell,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
  type CanvasShellNavItem,
} from "@drts/ui-web";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });
const DEFAULT_REVIEWER_ACTOR_ID = "platform-admin.audit";

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

type FilterState = {
  moduleName: string;
  actorType: string;
  resourceType: string;
  timeRange: string;
  query: string;
};

type CrossLink = {
  href: string;
  label: string;
  app: "platform-admin" | "ops-console" | "tenant-console";
  openInNewTab: boolean;
};

type ActionableAuditLogRecord = AuditLogRecord & {
  availableActions?: ResourceActionDescriptor[];
};

type ActionableEvidenceLegalHoldRecord = EvidenceLegalHoldRecord & {
  availableActions?: ResourceActionDescriptor[];
};

type ActionableEvidenceDeletionExceptionRecord =
  EvidenceDeletionExceptionRecord & {
    availableActions?: ResourceActionDescriptor[];
  };

type ActionModalState =
  | { action: "grant_legal_hold"; record: AuditLogRecord }
  | { action: "lift_legal_hold"; hold: EvidenceLegalHoldRecord }
  | { action: "grant_deletion_exception"; record: AuditLogRecord }
  | {
      action: "revoke_deletion_exception";
      exception: EvidenceDeletionExceptionRecord;
    }
  | null;

type ActionFeedback = {
  tone: "success" | "info";
  title: string;
  body: string;
};

const pageStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const sectionGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.8fr) minmax(280px, 0.9fr)",
  gap: 16,
  alignItems: "start",
} satisfies CSSProperties;

const pillRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
} satisfies CSSProperties;

const statGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const topGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.9fr)",
  alignItems: "start",
} satisfies CSSProperties;

const filterGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const inputStyle = {
  width: "100%",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  padding: "8px 10px",
  fontFamily: theme.fontFamily,
  fontSize: 13,
} satisfies CSSProperties;

const monoStyle = {
  fontFamily: theme.monoFamily,
  fontSize: 12,
} satisfies CSSProperties;

const subTextStyle = {
  color: theme.textDim,
  fontSize: 12,
  lineHeight: 1.5,
} satisfies CSSProperties;

const tableWrapStyle = {
  overflowX: "auto",
} satisfies CSSProperties;

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
} satisfies CSSProperties;

const thStyle = {
  padding: "10px 12px",
  borderBottom: `1px solid ${theme.border}`,
  textAlign: "left",
  color: theme.textDim,
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
} satisfies CSSProperties;

const tdStyle = {
  padding: "12px",
  borderBottom: `1px solid ${theme.border}`,
  verticalAlign: "top",
} satisfies CSSProperties;

const emptyStateStyle = {
  border: `1px dashed ${theme.border}`,
  borderRadius: 16,
  padding: 24,
  background: theme.surface,
  display: "grid",
  gap: 10,
  justifyItems: "start",
} satisfies CSSProperties;

const actionRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
} satisfies CSSProperties;

const sidebarStackStyle = {
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const clusterListStyle = {
  display: "grid",
  gap: 10,
} satisfies CSSProperties;

const appLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: `1px solid ${theme.border}`,
  borderRadius: 999,
  padding: "4px 10px",
  background: "#fff",
  color: theme.text,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
} satisfies CSSProperties;

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.54)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 1000,
} satisfies CSSProperties;

const modalStyle = {
  width: "min(640px, 100%)",
  background: "#fff",
  borderRadius: 18,
  border: `1px solid ${theme.border}`,
  boxShadow: "0 24px 72px rgba(15, 23, 42, 0.24)",
  padding: 20,
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

function text(locale: Locale, en: string, zh: string) {
  return locale === "en" ? en : zh;
}

function buildPlatformNav(locale: Locale): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          health: "Platform Health",
          tenantGroup: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partner entry",
          users: "Platform staff",
          fleetGroup: "Fleet & Compliance",
          fleet: "Fleet & compliance",
          switchboard: "Public info & placards",
          pricingGroup: "Pricing & Settlement",
          pricing: "Pricing",
          payments: "Settlement governance",
          platformGroup: "Platform Layer",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
          adapters: "Adapter registry",
        }
      : {
          workspace: "工作面",
          home: "工作首頁",
          health: "平台健康",
          tenantGroup: "租戶治理",
          tenants: "租戶",
          partners: "合作夥伴 entry",
          users: "平台人員",
          fleetGroup: "車隊與法遵",
          fleet: "車隊與合規",
          switchboard: "法定資訊與牌貼",
          pricingGroup: "計價與結算",
          pricing: "計價",
          payments: "結算治理",
          platformGroup: "平台層",
          notices: "公告與維護",
          audit: "稽核與證據",
          flags: "功能旗標",
          adapters: "介接登錄",
        };

  return [
    { divider: labels.workspace },
    { key: "home", href: "/", icon: "home", label: labels.home },
    {
      key: "health",
      href: "/health",
      icon: "health",
      label: labels.health,
    },
    { divider: labels.tenantGroup },
    {
      key: "tenants",
      href: "/tenants",
      icon: "tenants",
      label: labels.tenants,
    },
    {
      key: "partners",
      href: "/partners",
      icon: "partners",
      label: labels.partners,
    },
    { key: "users", href: "/users", icon: "users", label: labels.users },
    { divider: labels.fleetGroup },
    { key: "fleet", href: "/fleet", icon: "fleet", label: labels.fleet },
    {
      key: "switchboard",
      href: "/switchboard",
      icon: "switchboard",
      label: labels.switchboard,
    },
    { divider: labels.pricingGroup },
    {
      key: "pricing",
      href: "/pricing",
      icon: "pricing",
      label: labels.pricing,
    },
    {
      key: "payments",
      href: "/payments",
      icon: "payments",
      label: labels.payments,
    },
    { divider: labels.platformGroup },
    { key: "notices", href: "/notices", icon: "notice", label: labels.notices },
    {
      key: "audit",
      href: "/audit",
      icon: "audit",
      label: labels.audit,
      badgeTone: "warn",
    },
    {
      key: "flags",
      href: "/feature-flags",
      icon: "flags",
      label: labels.flags,
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      icon: "registry",
      label: labels.adapters,
    },
  ];
}

function toneForEmpty(reason: EmptyReason) {
  switch (reason) {
    case "permission_denied":
    case "fetch_failed":
      return "danger";
    case "external_unavailable":
      return "warn";
    case "filtered_empty":
      return "accent";
    case "not_provisioned":
      return "info";
    default:
      return "neutral";
  }
}

function deriveEmptyReasonFromError(error: string | null): EmptyReason | null {
  const errorText = error?.toLowerCase() ?? "";
  if (errorText.includes("403") || errorText.includes("forbidden")) {
    return "permission_denied";
  }
  if (
    errorText.includes("503") ||
    errorText.includes("unavailable") ||
    errorText.includes("timeout")
  ) {
    return "external_unavailable";
  }
  if (error) {
    return "fetch_failed";
  }
  return null;
}

function inferTimeRange(iso: string, timeRange: string) {
  if (!timeRange) return true;
  const createdAt = new Date(iso).getTime();
  if (Number.isNaN(createdAt)) return true;
  const hours = Number(timeRange);
  return createdAt >= Date.now() - hours * 60 * 60 * 1000;
}

function mapRecordFamily(record: AuditLogRecord): EvidenceRetentionFamily {
  const joined =
    `${record.resourceType} ${record.moduleName} ${record.actionName}`.toLowerCase();
  if (joined.includes("webhook")) return "webhook_delivery";
  if (joined.includes("eligibility")) return "eligibility_verification";
  if (joined.includes("filing")) return "filing_package";
  if (joined.includes("report") || joined.includes("export"))
    return "report_artifact";
  if (joined.includes("call")) return "call_recording";
  if (joined.includes("audit")) return "audit_log";
  return "proof_bundle";
}

function buildSubjectCandidates(record: AuditLogRecord) {
  return [
    record.auditId,
    record.resourceId,
    record.requestId,
    record.tenantId,
  ].filter((value): value is string => Boolean(value));
}

function matchesSubject(record: AuditLogRecord, subjectId: string) {
  return buildSubjectCandidates(record).includes(subjectId);
}

function inferCrossLink(
  record: AuditLogRecord,
  locale: Locale,
): CrossLink | null {
  const resourceType = record.resourceType.toLowerCase();
  const moduleName = record.moduleName.toLowerCase();
  const resourceId = record.resourceId ?? record.auditId;
  const platformOrigin =
    typeof window === "undefined" ? "" : window.location.origin;
  const opsOrigin =
    process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ||
    process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN ||
    "";
  const tenantOrigin =
    process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ||
    process.env.NEXT_PUBLIC_TENANT_CONSOLE_ORIGIN ||
    "";

  if (resourceType.includes("tenant") && record.resourceId) {
    return {
      href: `/tenants/${encodeURIComponent(record.resourceId)}`,
      label: text(locale, "Tenant detail", "租戶詳情"),
      app: "platform-admin",
      openInNewTab: false,
    };
  }

  if (
    resourceType.includes("reconciliation") ||
    resourceType.includes("invoice") ||
    resourceType.includes("statement") ||
    resourceType.includes("reimbursement") ||
    moduleName.includes("payments")
  ) {
    return {
      href: `/payments?resourceId=${encodeURIComponent(resourceId)}`,
      label: text(locale, "Settlement governance", "結算治理"),
      app: "platform-admin",
      openInNewTab: false,
    };
  }

  if (resourceType.includes("adapter") || moduleName.includes("adapter")) {
    return {
      href: `/adapter-registry?resourceId=${encodeURIComponent(resourceId)}`,
      label: text(locale, "Adapter registry", "介接登錄"),
      app: "platform-admin",
      openInNewTab: false,
    };
  }

  if (resourceType.includes("notice") || moduleName.includes("notice")) {
    return {
      href: `/notices?resourceId=${encodeURIComponent(resourceId)}`,
      label: text(locale, "Notices", "公告與維護"),
      app: "platform-admin",
      openInNewTab: false,
    };
  }

  if (
    record.actorType === "ops_user" ||
    moduleName.includes("dispatch") ||
    moduleName.includes("ops")
  ) {
    const hrefBase = opsOrigin || platformOrigin;
    return {
      href: `${hrefBase}/audit?auditId=${encodeURIComponent(record.auditId)}`,
      label: text(locale, "Open in Ops Console", "在 Ops Console 開啟"),
      app: "ops-console",
      openInNewTab: true,
    };
  }

  if (moduleName.includes("tenant") && tenantOrigin) {
    return {
      href: `${tenantOrigin}/audit?auditId=${encodeURIComponent(record.auditId)}`,
      label: text(locale, "Open in Tenant Console", "在 Tenant Console 開啟"),
      app: "tenant-console",
      openInNewTab: true,
    };
  }

  return null;
}

function fallbackAuditActions(
  selectedRecord: AuditLogRecord | null,
  governance: {
    hold: EvidenceLegalHoldRecord | null;
    deletionException: EvidenceDeletionExceptionRecord | null;
  },
): ResourceActionDescriptor[] {
  if (!selectedRecord) {
    return [
      {
        action: "refresh",
        enabled: true,
        riskLevel: "low",
      },
    ];
  }

  return [
    {
      action: "refresh",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "grant_legal_hold",
      enabled: Boolean(selectedRecord) && !governance.hold,
      disabledReasonCode: !selectedRecord
        ? "select_audit_record"
        : governance.hold
          ? "already_on_hold"
          : undefined,
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "lift_legal_hold",
      enabled: Boolean(governance.hold),
      disabledReasonCode: governance.hold ? undefined : "no_active_hold",
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "grant_deletion_exception",
      enabled: Boolean(selectedRecord) && !governance.deletionException,
      disabledReasonCode: !selectedRecord
        ? "select_audit_record"
        : governance.deletionException
          ? "already_has_exception"
          : undefined,
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "revoke_deletion_exception",
      enabled: Boolean(governance.deletionException),
      disabledReasonCode: governance.deletionException
        ? undefined
        : "no_active_exception",
      requiresReason: true,
      riskLevel: "high",
    },
  ];
}

function fallbackHoldActions(
  hold: EvidenceLegalHoldRecord,
): ResourceActionDescriptor[] {
  return [
    {
      action: "lift_legal_hold",
      enabled: hold.status === "active",
      disabledReasonCode:
        hold.status === "active" ? undefined : "hold_not_active",
      requiresReason: true,
      riskLevel: "high",
    },
  ];
}

function fallbackExceptionActions(
  exception: EvidenceDeletionExceptionRecord,
): ResourceActionDescriptor[] {
  return [
    {
      action: "revoke_deletion_exception",
      enabled: exception.status === "active",
      disabledReasonCode:
        exception.status === "active" ? undefined : "exception_not_active",
      requiresReason: true,
      riskLevel: "high",
    },
  ];
}

export default function AuditPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const searchParams = useSearchParams();
  const [records, setRecords] = useState<ActionableAuditLogRecord[]>([]);
  const [policies, setPolicies] = useState<EvidenceRetentionPolicyRecord[]>([]);
  const [legalHolds, setLegalHolds] = useState<
    ActionableEvidenceLegalHoldRecord[]
  >([]);
  const [deletionExceptions, setDeletionExceptions] = useState<
    ActionableEvidenceDeletionExceptionRecord[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "audit" | "policies" | "holds" | "exceptions"
  >("audit");
  const [modal, setModal] = useState<ActionModalState>(null);
  const [filters, setFilters] = useState<FilterState>({
    moduleName: searchParams.get("module") ?? "",
    actorType: searchParams.get("actorType") ?? "",
    resourceType: searchParams.get("resourceType") ?? "",
    timeRange: searchParams.get("timeRange") ?? "24",
    query: searchParams.get("auditId") ?? searchParams.get("resourceId") ?? "",
  });
  const [holdForm, setHoldForm] = useState({
    caseNumber: "",
    reasonCode: EVIDENCE_LEGAL_HOLD_REASON_CODES[0],
    reasonNote: "",
  });
  const [exceptionForm, setExceptionForm] = useState({
    reviewerActorId: DEFAULT_REVIEWER_ACTOR_ID,
    reasonCode: EVIDENCE_DELETION_EXCEPTION_REASON_CODES[0],
    reasonNote: "",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16),
  });
  const [releaseReason, setReleaseReason] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);

  const loadData = useCallback(async () => {
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
      setRecords(auditList);
      setPolicies(policyList);
      setLegalHolds(holdList);
      setDeletionExceptions(exceptionList);
      if (!selectedAuditId && auditList[0]?.auditId) {
        setSelectedAuditId(
          searchParams.get("auditId") &&
            auditList.some((r) => r.auditId === searchParams.get("auditId"))
            ? (searchParams.get("auditId") as string)
            : auditList[0].auditId,
        );
      }
    } catch (nextError: any) {
      setError(nextError?.message || String(nextError));
    } finally {
      setLoading(false);
    }
  }, [client, searchParams, selectedAuditId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeLegalHolds = useMemo(
    () => legalHolds.filter((hold) => hold.status === "active"),
    [legalHolds],
  );
  const activeDeletionExceptions = useMemo(
    () =>
      deletionExceptions.filter((exception) => exception.status === "active"),
    [deletionExceptions],
  );
  const modules = useMemo(
    () => [
      ...new Set(records.map((record) => record.moduleName).filter(Boolean)),
    ],
    [records],
  );
  const actorTypes = useMemo(
    () => [
      ...new Set(records.map((record) => record.actorType).filter(Boolean)),
    ],
    [records],
  );
  const resourceTypes = useMemo(
    () =>
      [
        ...new Set(
          records.map((record) => record.resourceType).filter(Boolean),
        ),
      ].sort(),
    [records],
  );

  const filteredRecords = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return records.filter((record) => {
      if (filters.moduleName && record.moduleName !== filters.moduleName)
        return false;
      if (filters.actorType && record.actorType !== filters.actorType)
        return false;
      if (filters.resourceType && record.resourceType !== filters.resourceType)
        return false;
      if (
        filters.timeRange &&
        !inferTimeRange(record.createdAt, filters.timeRange)
      ) {
        return false;
      }
      if (!query) return true;
      return [
        record.auditId,
        record.actorId,
        record.requestId,
        record.resourceId,
        record.resourceType,
        record.moduleName,
        record.actionName,
        record.tenantId,
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [filters, records]);

  useEffect(() => {
    if (filteredRecords.length === 0) {
      setSelectedAuditId(null);
      return;
    }
    if (
      !selectedAuditId ||
      !filteredRecords.some((record) => record.auditId === selectedAuditId)
    ) {
      setSelectedAuditId(filteredRecords[0].auditId);
    }
  }, [filteredRecords, selectedAuditId]);

  const selectedRecord =
    filteredRecords.find((record) => record.auditId === selectedAuditId) ??
    null;
  const selectedCrossLink = selectedRecord
    ? inferCrossLink(selectedRecord, locale)
    : null;

  const selectedGovernance = useMemo(() => {
    if (!selectedRecord) return { hold: null, deletionException: null };
    const hold =
      activeLegalHolds.find((candidate) =>
        matchesSubject(selectedRecord, candidate.subjectId),
      ) ?? null;
    const deletionException =
      activeDeletionExceptions.find((candidate) =>
        matchesSubject(selectedRecord, candidate.subjectId),
      ) ?? null;
    return { hold, deletionException };
  }, [activeDeletionExceptions, activeLegalHolds, selectedRecord]);

  const availableActions = useMemo<ResourceActionDescriptor[]>(() => {
    const resourceActions = selectedRecord?.availableActions;
    if (resourceActions) {
      return resourceActions;
    }
    return fallbackAuditActions(selectedRecord, selectedGovernance);
  }, [selectedGovernance, selectedRecord]);

  const sharedErrorReason = useMemo(
    () => deriveEmptyReasonFromError(error),
    [error],
  );

  const emptyReason = useMemo<EmptyReason>(() => {
    if (sharedErrorReason) return sharedErrorReason;
    if (records.length === 0 && policies.length === 0) return "not_provisioned";
    if (records.length === 0) return "no_data";
    if (filteredRecords.length === 0) return "filtered_empty";
    return "no_data";
  }, [
    filteredRecords.length,
    policies.length,
    records.length,
    sharedErrorReason,
  ]);

  const policyEmptyReason = useMemo<EmptyReason>(() => {
    if (sharedErrorReason) return sharedErrorReason;
    if (policies.length === 0 && records.length === 0) return "not_provisioned";
    if (policies.length === 0) return "no_data";
    return "no_data";
  }, [policies.length, records.length, sharedErrorReason]);

  const holdsEmptyReason = useMemo<EmptyReason>(() => {
    if (sharedErrorReason) return sharedErrorReason;
    return activeLegalHolds.length === 0 ? "no_data" : "no_data";
  }, [activeLegalHolds.length, sharedErrorReason]);

  const exceptionsEmptyReason = useMemo<EmptyReason>(() => {
    if (sharedErrorReason) return sharedErrorReason;
    return activeDeletionExceptions.length === 0 ? "no_data" : "no_data";
  }, [activeDeletionExceptions.length, sharedErrorReason]);

  const emptyAction = useMemo<ResourceActionDescriptor | undefined>(() => {
    switch (emptyReason) {
      case "filtered_empty":
        return { action: "refresh", enabled: true, riskLevel: "low" };
      case "not_provisioned":
        return {
          action: "grant_legal_hold",
          enabled: false,
          disabledReasonCode: "awaiting_backend_seed",
          requiresReason: true,
          riskLevel: "high",
        };
      default:
        return { action: "refresh", enabled: true, riskLevel: "low" };
    }
  }, [emptyReason]);

  const openLink = useCallback((link: CrossLink) => {
    if (link.openInNewTab) {
      window.open(link.href, "_blank", "noopener,noreferrer");
    } else {
      window.location.assign(link.href);
    }
  }, []);

  const handleAction = useCallback(
    (
      descriptor: ResourceActionDescriptor,
      context?: {
        record?: AuditLogRecord | null;
        hold?: EvidenceLegalHoldRecord | null;
        deletionException?: EvidenceDeletionExceptionRecord | null;
      },
    ) => {
      if (descriptor.action === "refresh") {
        void loadData();
        return;
      }
      if (descriptor.action === "grant_legal_hold" && context?.record) {
        setModal({ action: "grant_legal_hold", record: context.record });
        return;
      }
      if (descriptor.action === "lift_legal_hold" && context?.hold) {
        setModal({ action: "lift_legal_hold", hold: context.hold });
        return;
      }
      if (descriptor.action === "grant_deletion_exception" && context?.record) {
        setModal({
          action: "grant_deletion_exception",
          record: context.record,
        });
        return;
      }
      if (
        descriptor.action === "revoke_deletion_exception" &&
        context?.deletionException
      ) {
        setModal({
          action: "revoke_deletion_exception",
          exception: context.deletionException,
        });
      }
    },
    [loadData],
  );

  const submitModal = useCallback(async () => {
    if (!modal) return;
    setSaving(true);
    setError(null);
    try {
      let nextFeedback: ActionFeedback | null = null;
      if (modal.action === "grant_legal_hold") {
        const command: CreateEvidenceLegalHoldCommand = {
          family: mapRecordFamily(modal.record),
          subjectId: modal.record.resourceId || modal.record.auditId,
          caseNumber: holdForm.caseNumber.trim(),
          reasonCode: holdForm.reasonCode,
          reasonNote: holdForm.reasonNote.trim() || null,
          tenantId: modal.record.tenantId,
        };
        const hold = await client.placeEvidenceLegalHold(command);
        nextFeedback = {
          tone: "success",
          title: text(locale, "Legal hold granted", "已建立 legal hold"),
          body: text(
            locale,
            `Subject ${hold.subjectId} is now frozen under case ${hold.caseNumber}.`,
            `主體 ${hold.subjectId} 已依案件 ${hold.caseNumber} 進入保存凍結。`,
          ),
        };
      } else if (modal.action === "lift_legal_hold") {
        const hold = await client.releaseEvidenceLegalHold(modal.hold.holdId, {
          releaseReason: releaseReason.trim(),
        });
        nextFeedback = {
          tone: "info",
          title: text(locale, "Legal hold lifted", "已解除 legal hold"),
          body: text(
            locale,
            `Hold ${hold.holdId} was released and the audit stream will reflect the release.`,
            `Hold ${hold.holdId} 已解除，audit 串流會反映這次釋放。`,
          ),
        };
      } else if (modal.action === "grant_deletion_exception") {
        const command: CreateEvidenceDeletionExceptionCommand = {
          family: mapRecordFamily(modal.record),
          subjectId: modal.record.resourceId || modal.record.auditId,
          sourceResourceType: modal.record.resourceType,
          sourceResourceId: modal.record.resourceId || modal.record.auditId,
          reviewerActorId: exceptionForm.reviewerActorId.trim(),
          reviewerActorType: "platform_admin",
          expiresAt: `${exceptionForm.expiresAt}:00.000Z`,
          reasonCode: exceptionForm.reasonCode,
          reasonNote: exceptionForm.reasonNote.trim() || null,
          tenantId: modal.record.tenantId,
        };
        const exception =
          await client.registerEvidenceDeletionException(command);
        nextFeedback = {
          tone: "success",
          title: text(locale, "Deletion exception granted", "已建立刪除例外"),
          body: text(
            locale,
            `Exception ${exception.exceptionId} is active until ${formatDateTime(exception.expiresAt)}.`,
            `例外 ${exception.exceptionId} 已建立，效期至 ${formatDateTime(exception.expiresAt)}。`,
          ),
        };
      } else if (modal.action === "revoke_deletion_exception") {
        const exception = await client.resolveEvidenceDeletionException(
          modal.exception.exceptionId,
          {
            resolutionNote: resolutionNote.trim(),
          },
        );
        nextFeedback = {
          tone: "info",
          title: text(locale, "Deletion exception revoked", "已撤銷刪除例外"),
          body: text(
            locale,
            `Exception ${exception.exceptionId} is no longer active.`,
            `例外 ${exception.exceptionId} 已不再有效。`,
          ),
        };
      }
      setModal(null);
      setReleaseReason("");
      setResolutionNote("");
      setFeedback(nextFeedback);
      await loadData();
    } catch (nextError: any) {
      setError(nextError?.message || String(nextError));
    } finally {
      setSaving(false);
    }
  }, [
    client,
    exceptionForm.expiresAt,
    exceptionForm.reasonCode,
    exceptionForm.reasonNote,
    exceptionForm.reviewerActorId,
    holdForm.caseNumber,
    holdForm.reasonCode,
    holdForm.reasonNote,
    loadData,
    locale,
    modal,
    releaseReason,
    resolutionNote,
  ]);

  const manualRefreshCopy = text(
    locale,
    "T6 manual refresh. Evidence governance never auto-polls.",
    "T6 手動刷新。證據治理頁不做自動輪詢。",
  );

  const summaryCards = [
    {
      label: text(locale, "Audit records", "稽核記錄"),
      value: records.length.toLocaleString(),
      note: text(locale, "append-only", "append-only"),
    },
    {
      label: text(locale, "Active legal holds", "有效 legal hold"),
      value: activeLegalHolds.length.toLocaleString(),
      note: text(locale, "owner + expiry visible", "顯示 owner 與到期"),
    },
    {
      label: text(locale, "Deletion exceptions", "刪除例外"),
      value: activeDeletionExceptions.length.toLocaleString(),
      note: text(locale, "reason + reviewer visible", "顯示原因與 reviewer"),
    },
    {
      label: text(locale, "Retention families", "保存政策家族"),
      value: policies.length.toLocaleString(),
      note: text(locale, "download controls included", "含下載控制"),
    },
  ];

  const moduleBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    records.forEach((record) => {
      counts.set(record.moduleName, (counts.get(record.moduleName) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [records]);

  const queryContextPills = [
    searchParams.get("auditId")
      ? {
          tone: "info" as const,
          label: text(
            locale,
            "Action receipt audit link",
            "由 action receipt 帶入",
          ),
        }
      : null,
    searchParams.get("resourceId")
      ? {
          tone: "accent" as const,
          label: text(locale, "Scoped to resource context", "已鎖定資源上下文"),
        }
      : null,
    filters.moduleName
      ? {
          tone: "neutral" as const,
          label: formatPlatformCodeLabel(locale, filters.moduleName),
        }
      : null,
  ].filter(Boolean) as Array<{
    tone: "neutral" | "info" | "accent";
    label: string;
  }>;

  return (
    <CanvasShell
      theme={theme}
      nav={buildPlatformNav(locale)}
      active="audit"
      currentPath="/audit"
      breadcrumb={[
        text(locale, "Platform Layer", "平台層"),
        text(locale, "Audit & evidence", "稽核與證據"),
      ]}
      searchPlaceholder={text(
        locale,
        "Search audit, tenant, request, resource…",
        "搜尋 audit、租戶、request、resource…",
      )}
      avatarLabel={locale === "en" ? "PA" : "平台"}
      versionLabel="canvas"
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title={text(locale, "Audit & evidence governance", "稽核與證據治理")}
        subtitle={text(
          locale,
          "Append-only investigation surface with legal hold, deletion exception, and cross-app drill-in.",
          "append-only 調查面，含 legal hold、刪除例外與跨 app drill-in。",
        )}
        tabs={[
          "Audit log",
          "Retention policies",
          "Legal holds",
          "Deletion exceptions",
        ]}
        activeTab={
          activeTab === "audit"
            ? "Audit log"
            : activeTab === "policies"
              ? "Retention policies"
              : activeTab === "holds"
                ? "Legal holds"
                : "Deletion exceptions"
        }
        actions={
          <div style={actionRowStyle}>
            <CanvasBtn
              theme={theme}
              icon="refresh"
              onClick={loadData}
              disabled={loading}
            >
              {loading ? t("audit.loading") : t("common.refresh")}
            </CanvasBtn>
          </div>
        }
      />

      <div style={pageStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={text(
              locale,
              "Audit surface fetch failed",
              "Audit 畫面抓取失敗",
            )}
            body={error}
          />
        ) : null}
        {feedback ? (
          <CanvasBanner
            theme={theme}
            tone={feedback.tone}
            title={feedback.title}
            body={feedback.body}
          />
        ) : null}

        <div style={topGridStyle}>
          <CanvasCard theme={theme}>
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>
                  {text(locale, "Audit governance posture", "證據治理態勢")}
                </div>
                <div style={subTextStyle}>
                  {text(
                    locale,
                    "T6 manual refresh only. High-risk actions require reason capture and resolve back into audit.",
                    "Refresh tier 為 T6 手動刷新。所有高風險動作都必須收集原因並回寫 audit。",
                  )}
                </div>
              </div>

              <div style={pillRowStyle}>
                <CanvasPill theme={theme} tone="accent" dot>
                  {text(locale, "Refresh tier T6", "Refresh tier T6")}
                </CanvasPill>
                <CanvasPill theme={theme} tone="neutral">
                  {manualRefreshCopy}
                </CanvasPill>
                {queryContextPills.map((pill) => (
                  <CanvasPill key={pill.label} theme={theme} tone={pill.tone}>
                    {pill.label}
                  </CanvasPill>
                ))}
              </div>

              <div style={pillRowStyle}>
                {moduleBreakdown.map(([moduleName, count]) => (
                  <CanvasPill key={moduleName} theme={theme} tone="neutral" dot>
                    {formatPlatformCodeLabel(locale, moduleName)} {count}
                  </CanvasPill>
                ))}
              </div>
            </div>
          </CanvasCard>

          <CanvasCard theme={theme}>
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <div style={{ fontWeight: 700 }}>
                  {text(locale, "Cross-app evidence links", "跨 app 證據連結")}
                </div>
                <div style={subTextStyle}>
                  {text(
                    locale,
                    "Use auditId/resource context as the stable handoff between Platform Admin, Ops Console, and Tenant Console.",
                    "以 auditId / resource 上下文作為 Platform Admin、Ops Console、Tenant Console 間的穩定交接點。",
                  )}
                </div>
              </div>
              <div style={pillRowStyle}>
                <button
                  type="button"
                  style={appLinkStyle}
                  onClick={() => window.location.assign("/payments")}
                >
                  {text(locale, "Settlement governance", "結算治理")}
                </button>
                <button
                  type="button"
                  style={appLinkStyle}
                  onClick={() => window.location.assign("/adapter-registry")}
                >
                  {text(locale, "Adapter registry", "介接登錄")}
                </button>
                <button
                  type="button"
                  style={appLinkStyle}
                  onClick={() => window.location.assign("/notices")}
                >
                  {text(locale, "Notices & maintenance", "公告與維護")}
                </button>
              </div>
            </div>
          </CanvasCard>
        </div>

        <div style={statGridStyle}>
          {summaryCards.map((card) => (
            <CanvasCard key={card.label} theme={theme}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={subTextStyle}>{card.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  {card.value}
                </div>
                <div style={subTextStyle}>{card.note}</div>
              </div>
            </CanvasCard>
          ))}
        </div>

        <CanvasCard theme={theme}>
          <div style={{ display: "grid", gap: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>
                  {text(locale, "Evidence filters", "證據篩選")}
                </div>
                <div style={subTextStyle}>
                  {text(
                    locale,
                    "Filter by module, actor, resource type, time range, or free text.",
                    "依模組、操作者、資源類型、時間範圍與文字關鍵字篩選。",
                  )}
                </div>
              </div>
              <div style={actionRowStyle}>
                {(["audit", "policies", "holds", "exceptions"] as const).map(
                  (tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      style={{
                        border: `1px solid ${activeTab === tab ? theme.accent : theme.border}`,
                        borderRadius: 999,
                        background: activeTab === tab ? theme.accent : "#fff",
                        color: activeTab === tab ? "#fff" : theme.text,
                        fontSize: 12,
                        fontWeight: 700,
                        padding: "6px 12px",
                        cursor: "pointer",
                      }}
                    >
                      {tab === "audit"
                        ? text(locale, "Audit log", "Audit log")
                        : tab === "policies"
                          ? text(
                              locale,
                              "Retention policies",
                              "Retention policies",
                            )
                          : tab === "holds"
                            ? text(locale, "Legal holds", "Legal holds")
                            : text(
                                locale,
                                "Deletion exceptions",
                                "Deletion exceptions",
                              )}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div style={filterGridStyle}>
              <FieldLabel label={text(locale, "Module", "模組")}>
                <select
                  value={filters.moduleName}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      moduleName: event.target.value,
                    }))
                  }
                  style={inputStyle}
                >
                  <option value="">
                    {text(locale, "All modules", "全部模組")}
                  </option>
                  {modules.map((value) => (
                    <option key={value} value={value}>
                      {formatPlatformCodeLabel(locale, value)}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <FieldLabel label={text(locale, "Actor type", "操作者類型")}>
                <select
                  value={filters.actorType}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      actorType: event.target.value,
                    }))
                  }
                  style={inputStyle}
                >
                  <option value="">
                    {text(locale, "All actors", "全部操作者")}
                  </option>
                  {actorTypes.map((value) => (
                    <option key={value} value={value}>
                      {formatPlatformCodeLabel(locale, value)}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <FieldLabel label={text(locale, "Resource type", "資源類型")}>
                <select
                  value={filters.resourceType}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      resourceType: event.target.value,
                    }))
                  }
                  style={inputStyle}
                >
                  <option value="">
                    {text(locale, "All resources", "全部資源")}
                  </option>
                  {resourceTypes.map((value) => (
                    <option key={value} value={value}>
                      {formatPlatformCodeLabel(locale, value)}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <FieldLabel label={text(locale, "Time range", "時間範圍")}>
                <select
                  value={filters.timeRange}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      timeRange: event.target.value,
                    }))
                  }
                  style={inputStyle}
                >
                  <option value="24">
                    {text(locale, "Last 24h", "最近 24 小時")}
                  </option>
                  <option value="168">
                    {text(locale, "Last 7d", "最近 7 天")}
                  </option>
                  <option value="720">
                    {text(locale, "Last 30d", "最近 30 天")}
                  </option>
                  <option value="">
                    {text(locale, "All time", "全部時間")}
                  </option>
                </select>
              </FieldLabel>
              <FieldLabel
                label={text(
                  locale,
                  "Audit / request / resource",
                  "Audit / request / 資源",
                )}
              >
                <input
                  value={filters.query}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      query: event.target.value,
                    }))
                  }
                  placeholder={text(
                    locale,
                    "auditId, requestId, resourceId...",
                    "auditId、requestId、resourceId...",
                  )}
                  style={inputStyle}
                />
              </FieldLabel>
            </div>
          </div>
        </CanvasCard>

        {activeTab === "audit" ? (
          <div style={sectionGridStyle}>
            <CanvasCard theme={theme}>
              <div style={{ display: "grid", gap: 14 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {text(locale, "Audit log", "Audit log")}
                    </div>
                    <div style={subTextStyle}>
                      {text(
                        locale,
                        `${filteredRecords.length} / ${records.length} records shown`,
                        `顯示 ${filteredRecords.length} / ${records.length} 筆記錄`,
                      )}
                    </div>
                  </div>
                  <div style={actionRowStyle}>
                    {availableActions.length === 0 ? (
                      <CanvasPill theme={theme} tone="neutral">
                        {text(
                          locale,
                          "Read-only in current scope",
                          "目前範圍唯讀",
                        )}
                      </CanvasPill>
                    ) : (
                      availableActions.map((action) => (
                        <ActionButton
                          key={action.action}
                          locale={locale}
                          descriptor={action}
                          onClick={() =>
                            handleAction(action, {
                              record: selectedRecord,
                              hold: selectedGovernance.hold,
                              deletionException:
                                selectedGovernance.deletionException,
                            })
                          }
                        />
                      ))
                    )}
                  </div>
                </div>

                {filteredRecords.length === 0 ? (
                  <EmptyStateCard
                    locale={locale}
                    reason={emptyReason}
                    nextAction={emptyAction}
                    onAction={() => void loadData()}
                  />
                ) : (
                  <div style={tableWrapStyle}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={thStyle}>
                            {text(locale, "When", "時間")}
                          </th>
                          <th style={thStyle}>
                            {text(locale, "Actor", "操作者")}
                          </th>
                          <th style={thStyle}>
                            {text(locale, "Module", "模組")}
                          </th>
                          <th style={thStyle}>
                            {text(locale, "Action", "動作")}
                          </th>
                          <th style={thStyle}>
                            {text(locale, "Resource", "資源")}
                          </th>
                          <th style={thStyle}>
                            {text(locale, "Governance", "治理")}
                          </th>
                          <th style={thStyle}>
                            {text(locale, "Drill-in", "連結")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRecords.map((record) => {
                          const hold = activeLegalHolds.find((candidate) =>
                            matchesSubject(record, candidate.subjectId),
                          );
                          const deletionException =
                            activeDeletionExceptions.find((candidate) =>
                              matchesSubject(record, candidate.subjectId),
                            );
                          const crossLink = inferCrossLink(record, locale);
                          const expanded = expandedAuditId === record.auditId;
                          const selected = selectedAuditId === record.auditId;
                          return (
                            <React.Fragment key={record.auditId}>
                              <tr
                                style={{
                                  background: selected
                                    ? theme.accentBg
                                    : undefined,
                                  cursor: "pointer",
                                }}
                                onClick={() =>
                                  setSelectedAuditId(record.auditId)
                                }
                              >
                                <td style={tdStyle}>
                                  <div
                                    style={{ ...monoStyle, fontWeight: 600 }}
                                  >
                                    {formatDateTime(record.createdAt)}
                                  </div>
                                  <div style={subTextStyle}>
                                    {record.auditId}
                                  </div>
                                </td>
                                <td style={tdStyle}>
                                  <div style={{ display: "grid", gap: 6 }}>
                                    <CanvasPill theme={theme} tone="neutral">
                                      {formatPlatformCodeLabel(
                                        locale,
                                        record.actorType,
                                      )}
                                    </CanvasPill>
                                    <div style={monoStyle}>
                                      {record.actorId ?? "system"}
                                    </div>
                                  </div>
                                </td>
                                <td style={tdStyle}>
                                  {formatPlatformCodeLabel(
                                    locale,
                                    record.moduleName,
                                  )}
                                </td>
                                <td style={tdStyle}>
                                  <div style={{ display: "grid", gap: 6 }}>
                                    <div
                                      style={{
                                        ...monoStyle,
                                        color: theme.accent,
                                      }}
                                    >
                                      {record.actionName}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setExpandedAuditId((current) =>
                                          current === record.auditId
                                            ? null
                                            : record.auditId,
                                        );
                                      }}
                                      style={{
                                        border: "none",
                                        background: "transparent",
                                        color: theme.accent,
                                        padding: 0,
                                        fontSize: 12,
                                        fontWeight: 700,
                                        cursor: "pointer",
                                        textAlign: "left",
                                      }}
                                    >
                                      {expanded
                                        ? text(
                                            locale,
                                            "Collapse detail",
                                            "收合詳情",
                                          )
                                        : text(
                                            locale,
                                            "Expand detail",
                                            "展開詳情",
                                          )}
                                    </button>
                                  </div>
                                </td>
                                <td style={tdStyle}>
                                  <div style={{ display: "grid", gap: 6 }}>
                                    <div>
                                      {formatPlatformCodeLabel(
                                        locale,
                                        record.resourceType,
                                      )}
                                    </div>
                                    <div style={monoStyle}>
                                      {record.resourceId ?? record.requestId}
                                    </div>
                                  </div>
                                </td>
                                <td style={tdStyle}>
                                  <div style={{ display: "grid", gap: 8 }}>
                                    <div style={pillRowStyle}>
                                      {hold ? (
                                        <CanvasPill theme={theme} tone="warn">
                                          {text(
                                            locale,
                                            "Legal hold",
                                            "Legal hold",
                                          )}
                                        </CanvasPill>
                                      ) : null}
                                      {deletionException ? (
                                        <CanvasPill theme={theme} tone="danger">
                                          {text(
                                            locale,
                                            "Deletion exception",
                                            "刪除例外",
                                          )}
                                        </CanvasPill>
                                      ) : null}
                                      {!hold && !deletionException ? (
                                        <CanvasPill
                                          theme={theme}
                                          tone="neutral"
                                        >
                                          {text(
                                            locale,
                                            "Standard retention",
                                            "標準保存",
                                          )}
                                        </CanvasPill>
                                      ) : null}
                                    </div>
                                    {hold ? (
                                      <div style={subTextStyle}>
                                        {text(locale, "Owner", "Owner")}:{" "}
                                        {hold.placedByActorId}
                                      </div>
                                    ) : null}
                                    {hold?.reasonCode ? (
                                      <div style={subTextStyle}>
                                        {text(
                                          locale,
                                          "Hold reason",
                                          "Hold 原因",
                                        )}
                                        :{" "}
                                        {formatPlatformCodeLabel(
                                          locale,
                                          hold.reasonCode,
                                        )}
                                      </div>
                                    ) : null}
                                    {deletionException ? (
                                      <div style={subTextStyle}>
                                        {text(locale, "Owner", "Owner")}:{" "}
                                        {deletionException.reviewerActorId}
                                      </div>
                                    ) : null}
                                    {deletionException ? (
                                      <div style={subTextStyle}>
                                        {text(locale, "Reason", "原因")}:{" "}
                                        {formatPlatformCodeLabel(
                                          locale,
                                          deletionException.reasonCode,
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                                <td style={tdStyle}>
                                  {crossLink ? (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openLink(crossLink);
                                      }}
                                      style={{
                                        border: "none",
                                        background: "transparent",
                                        color: theme.accent,
                                        fontWeight: 700,
                                        padding: 0,
                                        cursor: "pointer",
                                        textAlign: "left",
                                      }}
                                    >
                                      {crossLink.label}
                                    </button>
                                  ) : (
                                    <span style={subTextStyle}>—</span>
                                  )}
                                </td>
                              </tr>
                              {expanded ? (
                                <tr>
                                  <td
                                    style={{
                                      ...tdStyle,
                                      background: theme.bgRaised,
                                    }}
                                    colSpan={7}
                                  >
                                    <div style={filterGridStyle}>
                                      <PayloadCard
                                        title={text(
                                          locale,
                                          "Old values",
                                          "舊值",
                                        )}
                                        payload={record.oldValuesSummary}
                                        locale={locale}
                                      />
                                      <PayloadCard
                                        title={text(
                                          locale,
                                          "New values",
                                          "新值",
                                        )}
                                        payload={record.newValuesSummary}
                                        locale={locale}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CanvasCard>

            <div style={sidebarStackStyle}>
              <CanvasCard theme={theme}>
                <div style={{ display: "grid", gap: 14 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {text(locale, "Selected evidence", "已選證據")}
                    </div>
                    <div style={subTextStyle}>
                      {text(
                        locale,
                        "Cross-app drill-in and high-risk actions are driven from the selected record's availableActions.",
                        "跨 app 深連結與高風險動作完全由所選記錄的 availableActions 驅動。",
                      )}
                    </div>
                  </div>
                  {!selectedRecord ? (
                    <EmptyStateCard
                      locale={locale}
                      reason={sharedErrorReason ?? emptyReason}
                      nextAction={emptyAction}
                      onAction={() => void loadData()}
                    />
                  ) : (
                    <>
                      <div style={{ display: "grid", gap: 10 }}>
                        <div style={pillRowStyle}>
                          <CanvasPill
                            theme={theme}
                            tone={
                              availableActions.length === 0 ? "neutral" : "info"
                            }
                          >
                            {availableActions.length === 0
                              ? text(
                                  locale,
                                  "No write actions returned",
                                  "後端未回傳可寫動作",
                                )
                              : text(
                                  locale,
                                  `${availableActions.length} actions returned`,
                                  `後端回傳 ${availableActions.length} 個動作`,
                                )}
                          </CanvasPill>
                        </div>
                        <MetadataRow
                          label={text(locale, "Audit ID", "Audit ID")}
                          value={selectedRecord.auditId}
                          mono
                        />
                        <MetadataRow
                          label={text(locale, "Request ID", "Request ID")}
                          value={selectedRecord.requestId}
                          mono
                        />
                        <MetadataRow
                          label={text(locale, "Tenant", "租戶")}
                          value={selectedRecord.tenantId ?? "—"}
                          mono
                        />
                        <MetadataRow
                          label={text(locale, "Actor", "操作者")}
                          value={`${formatPlatformCodeLabel(locale, selectedRecord.actorType)} · ${selectedRecord.actorId ?? "system"}`}
                        />
                        <MetadataRow
                          label={text(locale, "Resource", "資源")}
                          value={`${selectedRecord.resourceType}${selectedRecord.resourceId ? ` · ${selectedRecord.resourceId}` : ""}`}
                        />
                        <MetadataRow
                          label={text(locale, "Evidence family", "證據家族")}
                          value={formatPlatformCodeLabel(
                            locale,
                            mapRecordFamily(selectedRecord),
                          )}
                        />
                      </div>

                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ fontWeight: 700 }}>
                          {text(locale, "Deep-link exits", "離開點")}
                        </div>
                        <div style={pillRowStyle}>
                          <CanvasPill theme={theme} tone="info">
                            {text(
                              locale,
                              "Cross-app action receipt target",
                              "跨 app action receipt 目標",
                            )}
                          </CanvasPill>
                          {selectedCrossLink ? (
                            <button
                              type="button"
                              style={appLinkStyle}
                              onClick={() => openLink(selectedCrossLink)}
                            >
                              {selectedCrossLink.label}
                            </button>
                          ) : (
                            <CanvasPill theme={theme} tone="neutral">
                              {text(
                                locale,
                                "No cross-app exit for this record",
                                "此記錄沒有跨 app 離開點",
                              )}
                            </CanvasPill>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: 10 }}>
                        <GovernanceDetailCard
                          locale={locale}
                          title={text(locale, "Legal hold", "Legal hold")}
                          tone={selectedGovernance.hold ? "warn" : "neutral"}
                          lines={
                            selectedGovernance.hold
                              ? [
                                  `${text(locale, "Owner", "Owner")}: ${selectedGovernance.hold.placedByActorId}`,
                                  `${text(locale, "Case", "案件")}: ${selectedGovernance.hold.caseNumber}`,
                                  `${text(locale, "Placed at", "建立時間")}: ${formatDateTime(selectedGovernance.hold.placedAt)}`,
                                  text(
                                    locale,
                                    "Expiry is policy-bound and not exposed by the current contract.",
                                    "到期由政策決定，現行 contract 未提供欄位。",
                                  ),
                                ]
                              : [
                                  text(
                                    locale,
                                    "No active hold on this subject.",
                                    "此主體沒有有效 hold。",
                                  ),
                                ]
                          }
                        />
                        <GovernanceDetailCard
                          locale={locale}
                          title={text(locale, "Deletion exception", "刪除例外")}
                          tone={
                            selectedGovernance.deletionException
                              ? "danger"
                              : "neutral"
                          }
                          lines={
                            selectedGovernance.deletionException
                              ? [
                                  `${text(locale, "Reviewer", "Reviewer")}: ${selectedGovernance.deletionException.reviewerActorId}`,
                                  `${text(locale, "Reason", "原因")}: ${formatPlatformCodeLabel(locale, selectedGovernance.deletionException.reasonCode)}`,
                                  `${text(locale, "Expires", "到期")}: ${formatDateTime(selectedGovernance.deletionException.expiresAt)}`,
                                ]
                              : [
                                  text(
                                    locale,
                                    "No active deletion exception on this subject.",
                                    "此主體沒有有效刪除例外。",
                                  ),
                                ]
                          }
                        />
                      </div>
                    </>
                  )}
                </div>
              </CanvasCard>

              <GovernanceClusterCard
                locale={locale}
                title={text(locale, "Active legal holds", "有效 legal hold")}
                tone="warn"
                emptyReason={holdsEmptyReason}
                items={activeLegalHolds.slice(0, 4).map((hold) => ({
                  id: hold.holdId,
                  headline: hold.subjectId,
                  eyebrow: formatPlatformCodeLabel(locale, hold.family),
                  lines: [
                    `${text(locale, "Owner", "Owner")}: ${hold.placedByActorId}`,
                    `${text(locale, "Case", "案件")}: ${hold.caseNumber}`,
                    `${text(locale, "Placed", "建立")}: ${formatDateTime(hold.placedAt)}`,
                  ],
                }))}
              />

              <GovernanceClusterCard
                locale={locale}
                title={text(locale, "Deletion exceptions", "刪除例外")}
                tone="danger"
                emptyReason={exceptionsEmptyReason}
                items={activeDeletionExceptions
                  .slice(0, 4)
                  .map((exception) => ({
                    id: exception.exceptionId,
                    headline: exception.subjectId,
                    eyebrow: formatPlatformCodeLabel(locale, exception.family),
                    lines: [
                      `${text(locale, "Reviewer", "Reviewer")}: ${exception.reviewerActorId}`,
                      `${text(locale, "Reason", "原因")}: ${formatPlatformCodeLabel(locale, exception.reasonCode)}`,
                      `${text(locale, "Expires", "到期")}: ${formatDateTime(exception.expiresAt)}`,
                    ],
                  }))}
              />
            </div>
          </div>
        ) : null}

        {activeTab === "policies" ? (
          <PolicyTable
            policies={policies}
            locale={locale}
            emptyReason={policyEmptyReason}
          />
        ) : null}
        {activeTab === "holds" ? (
          <HoldTable
            holds={activeLegalHolds}
            locale={locale}
            emptyReason={holdsEmptyReason}
            onRelease={(hold) =>
              handleAction(
                hold.availableActions?.find(
                  (action: ResourceActionDescriptor) =>
                    action.action === "lift_legal_hold",
                ) ?? fallbackHoldActions(hold)[0],
                { hold },
              )
            }
          />
        ) : null}
        {activeTab === "exceptions" ? (
          <ExceptionTable
            exceptions={activeDeletionExceptions}
            locale={locale}
            emptyReason={exceptionsEmptyReason}
            onResolve={(exception) =>
              handleAction(
                exception.availableActions?.find(
                  (action: ResourceActionDescriptor) =>
                    action.action === "revoke_deletion_exception",
                ) ?? fallbackExceptionActions(exception)[0],
                { deletionException: exception },
              )
            }
          />
        ) : null}
      </div>

      {modal ? (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {modal.action === "grant_legal_hold"
                  ? text(locale, "Grant legal hold", "建立 legal hold")
                  : modal.action === "lift_legal_hold"
                    ? text(locale, "Lift legal hold", "解除 legal hold")
                    : modal.action === "grant_deletion_exception"
                      ? text(locale, "Grant deletion exception", "建立刪除例外")
                      : text(
                          locale,
                          "Revoke deletion exception",
                          "撤銷刪除例外",
                        )}
              </div>
              <div style={subTextStyle}>
                {text(
                  locale,
                  "High-risk action. Reason capture is required; the resulting governance change will be visible in audit after refresh.",
                  "高風險動作必須輸入原因；完成後的治理變更會在刷新後出現在 audit。",
                )}
              </div>
            </div>

            {(modal.action === "grant_legal_hold" ||
              modal.action === "grant_deletion_exception") && (
              <div style={{ ...subTextStyle, ...monoStyle }}>
                {modal.record.auditId} · {modal.record.resourceType} ·{" "}
                {modal.record.resourceId ?? modal.record.requestId}
              </div>
            )}

            {modal.action === "lift_legal_hold" && (
              <div style={{ ...subTextStyle, ...monoStyle }}>
                {modal.hold.holdId} · {modal.hold.caseNumber}
              </div>
            )}

            {modal.action === "revoke_deletion_exception" && (
              <div style={{ ...subTextStyle, ...monoStyle }}>
                {modal.exception.exceptionId} · {modal.exception.subjectId}
              </div>
            )}

            {modal.action === "grant_legal_hold" ? (
              <div style={formGridStyle}>
                <FieldLabel label={text(locale, "Case number", "案件編號")}>
                  <input
                    value={holdForm.caseNumber}
                    onChange={(event) =>
                      setHoldForm((current) => ({
                        ...current,
                        caseNumber: event.target.value,
                      }))
                    }
                    style={inputStyle}
                  />
                </FieldLabel>
                <FieldLabel label={text(locale, "Reason code", "原因代碼")}>
                  <select
                    value={holdForm.reasonCode}
                    onChange={(event) =>
                      setHoldForm((current) => ({
                        ...current,
                        reasonCode: event.target
                          .value as (typeof EVIDENCE_LEGAL_HOLD_REASON_CODES)[number],
                      }))
                    }
                    style={inputStyle}
                  >
                    {EVIDENCE_LEGAL_HOLD_REASON_CODES.map(
                      (
                        value: (typeof EVIDENCE_LEGAL_HOLD_REASON_CODES)[number],
                      ) => (
                        <option key={value} value={value}>
                          {formatPlatformCodeLabel(locale, value)}
                        </option>
                      ),
                    )}
                  </select>
                </FieldLabel>
                <FieldLabel label={text(locale, "Reason note", "補充說明")}>
                  <textarea
                    value={holdForm.reasonNote}
                    onChange={(event) =>
                      setHoldForm((current) => ({
                        ...current,
                        reasonNote: event.target.value,
                      }))
                    }
                    style={{ ...inputStyle, minHeight: 96, resize: "vertical" }}
                  />
                </FieldLabel>
              </div>
            ) : null}

            {modal.action === "lift_legal_hold" ? (
              <FieldLabel label={text(locale, "Release reason", "解除原因")}>
                <textarea
                  value={releaseReason}
                  onChange={(event) => setReleaseReason(event.target.value)}
                  style={{ ...inputStyle, minHeight: 96, resize: "vertical" }}
                />
              </FieldLabel>
            ) : null}

            {modal.action === "grant_deletion_exception" ? (
              <div style={formGridStyle}>
                <FieldLabel
                  label={text(locale, "Reviewer actor ID", "Reviewer Actor ID")}
                >
                  <input
                    value={exceptionForm.reviewerActorId}
                    onChange={(event) =>
                      setExceptionForm((current) => ({
                        ...current,
                        reviewerActorId: event.target.value,
                      }))
                    }
                    style={inputStyle}
                  />
                </FieldLabel>
                <FieldLabel label={text(locale, "Reason code", "原因代碼")}>
                  <select
                    value={exceptionForm.reasonCode}
                    onChange={(event) =>
                      setExceptionForm((current) => ({
                        ...current,
                        reasonCode: event.target
                          .value as (typeof EVIDENCE_DELETION_EXCEPTION_REASON_CODES)[number],
                      }))
                    }
                    style={inputStyle}
                  >
                    {EVIDENCE_DELETION_EXCEPTION_REASON_CODES.map(
                      (
                        value: (typeof EVIDENCE_DELETION_EXCEPTION_REASON_CODES)[number],
                      ) => (
                        <option key={value} value={value}>
                          {formatPlatformCodeLabel(locale, value)}
                        </option>
                      ),
                    )}
                  </select>
                </FieldLabel>
                <FieldLabel label={text(locale, "Expires at", "到期時間")}>
                  <input
                    type="datetime-local"
                    value={exceptionForm.expiresAt}
                    onChange={(event) =>
                      setExceptionForm((current) => ({
                        ...current,
                        expiresAt: event.target.value,
                      }))
                    }
                    style={inputStyle}
                  />
                </FieldLabel>
                <FieldLabel label={text(locale, "Reason note", "補充說明")}>
                  <textarea
                    value={exceptionForm.reasonNote}
                    onChange={(event) =>
                      setExceptionForm((current) => ({
                        ...current,
                        reasonNote: event.target.value,
                      }))
                    }
                    style={{ ...inputStyle, minHeight: 96, resize: "vertical" }}
                  />
                </FieldLabel>
              </div>
            ) : null}

            {modal.action === "revoke_deletion_exception" ? (
              <FieldLabel label={text(locale, "Resolution note", "撤銷說明")}>
                <textarea
                  value={resolutionNote}
                  onChange={(event) => setResolutionNote(event.target.value)}
                  style={{ ...inputStyle, minHeight: 96, resize: "vertical" }}
                />
              </FieldLabel>
            ) : null}

            <div style={{ ...actionRowStyle, justifyContent: "flex-end" }}>
              <CanvasBtn theme={theme} onClick={() => setModal(null)}>
                {t("common.cancel")}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                onClick={() => void submitModal()}
                disabled={
                  saving ||
                  (modal.action === "grant_legal_hold" &&
                    !holdForm.caseNumber.trim()) ||
                  (modal.action === "lift_legal_hold" &&
                    !releaseReason.trim()) ||
                  (modal.action === "grant_deletion_exception" &&
                    (!exceptionForm.reviewerActorId.trim() ||
                      !exceptionForm.expiresAt.trim())) ||
                  (modal.action === "revoke_deletion_exception" &&
                    !resolutionNote.trim())
                }
              >
                {saving
                  ? text(locale, "Saving...", "儲存中...")
                  : t("common.apply")}
              </CanvasBtn>
            </div>
          </div>
        </div>
      ) : null}
    </CanvasShell>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: theme.textDim,
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function ActionButton({
  locale,
  descriptor,
  onClick,
}: {
  locale: Locale;
  descriptor: ResourceActionDescriptor;
  onClick: () => void;
}) {
  const labelMap: Record<string, string> = {
    refresh: text(locale, "Refresh", "刷新"),
    grant_legal_hold: text(locale, "Grant legal hold", "建立 legal hold"),
    lift_legal_hold: text(locale, "Lift legal hold", "解除 legal hold"),
    grant_deletion_exception: text(
      locale,
      "Grant deletion exception",
      "建立刪除例外",
    ),
    revoke_deletion_exception: text(
      locale,
      "Revoke deletion exception",
      "撤銷刪除例外",
    ),
  };
  const label = labelMap[descriptor.action] ?? descriptor.action;
  const disabledTitle = descriptor.enabled
    ? undefined
    : text(
        locale,
        `Unavailable: ${descriptor.disabledReasonCode ?? "not_allowed"}`,
        `目前不可用：${descriptor.disabledReasonCode ?? "not_allowed"}`,
      );
  return (
    <span title={disabledTitle}>
      <CanvasBtn
        theme={theme}
        onClick={onClick}
        disabled={!descriptor.enabled}
        aria-label={label}
      >
        {label}
      </CanvasBtn>
    </span>
  );
}

function EmptyStateCard({
  locale,
  reason,
  nextAction,
  onAction,
  compact = false,
}: {
  locale: Locale;
  reason: EmptyReason;
  nextAction?: ResourceActionDescriptor;
  onAction: () => void;
  compact?: boolean;
}) {
  const copy: Record<EmptyReason, { title: string; body: string }> = {
    no_data: {
      title: text(locale, "No audit records yet", "目前沒有稽核記錄"),
      body: text(
        locale,
        "The audit surface is provisioned, but no events have landed in this scope yet.",
        "此稽核面已開通，但目前範圍內還沒有事件落地。",
      ),
    },
    not_provisioned: {
      title: text(
        locale,
        "Evidence governance is not provisioned",
        "證據治理尚未開通",
      ),
      body: text(
        locale,
        "Policies and list data are both absent. This state is distinct from a normal empty result.",
        "政策與列表資料都不存在，這和一般沒有資料不同。",
      ),
    },
    fetch_failed: {
      title: text(locale, "Fetch failed", "資料抓取失敗"),
      body: text(
        locale,
        "The page could not load the current evidence catalog. Retry manually.",
        "目前無法載入證據治理目錄，請手動重試。",
      ),
    },
    permission_denied: {
      title: text(locale, "Permission denied", "權限不足"),
      body: text(
        locale,
        "This actor does not have audit read scope for the selected slice.",
        "目前身份對所選切面沒有 audit read scope。",
      ),
    },
    external_unavailable: {
      title: text(locale, "External dependency unavailable", "外部依賴不可用"),
      body: text(
        locale,
        "Evidence governance depends on an upstream dependency that is currently unavailable.",
        "證據治理依賴的上游服務目前不可用。",
      ),
    },
    driver_not_eligible: {
      title: text(
        locale,
        "This empty state is not used on Platform Admin",
        "此空狀態不適用於 Platform Admin",
      ),
      body: text(
        locale,
        "Driver eligibility is a driver-app-specific empty reason and should not appear on this surface.",
        "Driver eligibility 屬於 driver app 專用空狀態，不應出現在此畫面。",
      ),
    },
    filtered_empty: {
      title: text(locale, "No results for current filters", "目前篩選沒有結果"),
      body: text(
        locale,
        "Data exists, but nothing matches the selected filters or deep-link context.",
        "系統有資料，但沒有任何記錄符合目前篩選或 deep-link 上下文。",
      ),
    },
  };
  const content = (copy[reason] ?? copy.no_data) as {
    title: string;
    body: string;
  };
  return (
    <div
      style={{
        ...emptyStateStyle,
        padding: compact ? 16 : emptyStateStyle.padding,
      }}
    >
      <CanvasPill theme={theme} tone={toneForEmpty(reason)}>
        {reason}
      </CanvasPill>
      <div style={{ fontSize: compact ? 16 : 18, fontWeight: 700 }}>
        {content.title}
      </div>
      <div style={subTextStyle}>{content.body}</div>
      {nextAction?.action === "refresh" ? (
        <CanvasBtn theme={theme} onClick={onAction} disabled={compact}>
          {text(locale, "Refresh now", "立即刷新")}
        </CanvasBtn>
      ) : nextAction ? (
        <div style={subTextStyle}>
          {text(
            locale,
            `Next action: ${nextAction.action} (${nextAction.disabledReasonCode ?? "pending"})`,
            `下一步動作：${nextAction.action}（${nextAction.disabledReasonCode ?? "pending"}）`,
          )}
        </div>
      ) : null}
    </div>
  );
}

function MetadataRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px minmax(0, 1fr)",
        gap: 10,
      }}
    >
      <div style={subTextStyle}>{label}</div>
      <div style={mono ? monoStyle : undefined}>{value}</div>
    </div>
  );
}

function GovernanceDetailCard({
  locale,
  title,
  tone,
  lines,
}: {
  locale: Locale;
  title: string;
  tone: "warn" | "danger" | "neutral";
  lines: string[];
}) {
  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: 14,
        padding: 14,
        background:
          tone === "warn"
            ? "rgba(245, 158, 11, 0.08)"
            : tone === "danger"
              ? "rgba(239, 68, 68, 0.08)"
              : theme.surface,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <CanvasPill theme={theme} tone={tone}>
          {tone === "neutral"
            ? text(locale, "Inactive", "未啟用")
            : text(locale, "Active", "有效")}
        </CanvasPill>
      </div>
      {lines.map((line) => (
        <div key={line} style={subTextStyle}>
          {line}
        </div>
      ))}
    </div>
  );
}

function PayloadCard({
  title,
  payload,
  locale,
}: {
  title: string;
  payload: Record<string, unknown> | undefined;
  locale: Locale;
}) {
  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        padding: 12,
        background: "#fff",
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ fontWeight: 700 }}>{title}</div>
      {!payload || Object.keys(payload).length === 0 ? (
        <div style={subTextStyle}>{text(locale, "No values", "無資料")}</div>
      ) : (
        Object.entries(payload).map(([key, value]) => (
          <div
            key={key}
            style={{
              display: "grid",
              gridTemplateColumns: "140px minmax(0, 1fr)",
              gap: 10,
              alignItems: "start",
            }}
          >
            <div style={subTextStyle}>{key}</div>
            <div style={monoStyle}>{JSON.stringify(value)}</div>
          </div>
        ))
      )}
    </div>
  );
}

function GovernanceClusterCard({
  locale,
  title,
  tone,
  items,
  emptyReason,
}: {
  locale: Locale;
  title: string;
  tone: "warn" | "danger";
  items: Array<{
    id: string;
    headline: string;
    eyebrow: string;
    lines: string[];
  }>;
  emptyReason: EmptyReason;
}) {
  return (
    <CanvasCard theme={theme}>
      <div style={{ display: "grid", gap: 12 }}>
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
        >
          <div style={{ fontWeight: 700 }}>{title}</div>
          <CanvasPill theme={theme} tone={tone}>
            {items.length}
          </CanvasPill>
        </div>
        {items.length === 0 ? (
          <EmptyStateCard
            locale={locale}
            reason={emptyReason === "filtered_empty" ? "no_data" : emptyReason}
            nextAction={{ action: "refresh", enabled: true, riskLevel: "low" }}
            onAction={() => undefined}
            compact
          />
        ) : (
          <div style={clusterListStyle}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  border: `1px solid ${theme.border}`,
                  borderRadius: 14,
                  padding: 12,
                  background: theme.surface,
                  display: "grid",
                  gap: 6,
                }}
              >
                <div style={subTextStyle}>{item.eyebrow}</div>
                <div style={{ ...monoStyle, fontWeight: 700 }}>
                  {item.headline}
                </div>
                {item.lines.map((line) => (
                  <div key={line} style={subTextStyle}>
                    {line}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </CanvasCard>
  );
}

function PolicyTable({
  policies,
  locale,
  emptyReason,
}: {
  policies: EvidenceRetentionPolicyRecord[];
  locale: Locale;
  emptyReason: EmptyReason;
}) {
  return (
    <CanvasCard theme={theme}>
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700 }}>
            {text(locale, "Retention policies", "保存政策")}
          </div>
          <div style={subTextStyle}>
            {text(
              locale,
              "Retention, download control, and legal-hold defaults per evidence family.",
              "每個證據家族的保存、下載控制與 legal hold 預設。",
            )}
          </div>
        </div>
        {policies.length === 0 ? (
          <EmptyStateCard
            locale={locale}
            reason={emptyReason === "filtered_empty" ? "no_data" : emptyReason}
            nextAction={{ action: "refresh", enabled: true, riskLevel: "low" }}
            onAction={() => undefined}
          />
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>{text(locale, "Family", "家族")}</th>
                  <th style={thStyle}>
                    {text(locale, "Authority", "權威模組")}
                  </th>
                  <th style={thStyle}>{text(locale, "Retention", "保存期")}</th>
                  <th style={thStyle}>{text(locale, "Download", "下載")}</th>
                  <th style={thStyle}>
                    {text(locale, "Legal hold", "Legal hold")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => (
                  <tr key={policy.family}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 700 }}>
                        {formatPlatformCodeLabel(locale, policy.family)}
                      </div>
                      <div style={subTextStyle}>{policy.description}</div>
                    </td>
                    <td style={tdStyle}>
                      {formatPlatformCodeLabel(locale, policy.authorityModule)}
                    </td>
                    <td style={tdStyle}>
                      {policy.hotRetentionDays}d /{" "}
                      {policy.archiveRetentionDays
                        ? `${policy.archiveRetentionDays}d`
                        : "—"}
                    </td>
                    <td style={tdStyle}>
                      {policy.downloadControl?.mode === "signed_url"
                        ? text(locale, "Signed URL", "簽名網址")
                        : text(locale, "No direct download", "不提供直接下載")}
                    </td>
                    <td style={tdStyle}>
                      <CanvasPill
                        theme={theme}
                        tone={policy.legalHold.supported ? "warn" : "neutral"}
                      >
                        {policy.legalHold.supported
                          ? text(locale, "Supported", "支援")
                          : text(locale, "Not supported", "不支援")}
                      </CanvasPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CanvasCard>
  );
}

function HoldTable({
  holds,
  locale,
  emptyReason,
  onRelease,
}: {
  holds: ActionableEvidenceLegalHoldRecord[];
  locale: Locale;
  emptyReason: EmptyReason;
  onRelease: (hold: EvidenceLegalHoldRecord) => void;
}) {
  return (
    <CanvasCard theme={theme}>
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700 }}>
            {text(locale, "Active legal holds", "有效 legal hold")}
          </div>
          <div style={subTextStyle}>
            {text(
              locale,
              "Hold owner and timing stay visible for every active evidence freeze.",
              "每個有效證據凍結都顯示 owner 與時間。",
            )}
          </div>
        </div>
        {holds.length === 0 ? (
          <EmptyStateCard
            locale={locale}
            reason={emptyReason === "filtered_empty" ? "no_data" : emptyReason}
            nextAction={{ action: "refresh", enabled: true, riskLevel: "low" }}
            onAction={() => undefined}
          />
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>{text(locale, "Family", "家族")}</th>
                  <th style={thStyle}>{text(locale, "Subject", "主體")}</th>
                  <th style={thStyle}>{text(locale, "Owner", "Owner")}</th>
                  <th style={thStyle}>{text(locale, "Case", "案件")}</th>
                  <th style={thStyle}>{text(locale, "Placed", "建立")}</th>
                  <th style={thStyle}>{text(locale, "Action", "動作")}</th>
                </tr>
              </thead>
              <tbody>
                {holds.map((hold) => {
                  const rowAction =
                    hold.availableActions?.find(
                      (action: ResourceActionDescriptor) =>
                        action.action === "lift_legal_hold",
                    ) ?? fallbackHoldActions(hold)[0];
                  return (
                    <tr key={hold.holdId}>
                      <td style={tdStyle}>
                        {formatPlatformCodeLabel(locale, hold.family)}
                      </td>
                      <td style={{ ...tdStyle, ...monoStyle }}>
                        {hold.subjectId}
                      </td>
                      <td style={{ ...tdStyle, ...monoStyle }}>
                        {hold.placedByActorId}
                      </td>
                      <td style={tdStyle}>{hold.caseNumber}</td>
                      <td style={tdStyle}>{formatDateTime(hold.placedAt)}</td>
                      <td style={tdStyle}>
                        <ActionButton
                          locale={locale}
                          descriptor={rowAction}
                          onClick={() => onRelease(hold)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CanvasCard>
  );
}

function ExceptionTable({
  exceptions,
  locale,
  emptyReason,
  onResolve,
}: {
  exceptions: ActionableEvidenceDeletionExceptionRecord[];
  locale: Locale;
  emptyReason: EmptyReason;
  onResolve: (exception: EvidenceDeletionExceptionRecord) => void;
}) {
  return (
    <CanvasCard theme={theme}>
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700 }}>
            {text(locale, "Active deletion exceptions", "有效刪除例外")}
          </div>
          <div style={subTextStyle}>
            {text(
              locale,
              "Each exception shows the reviewer, expiry, and governing reason code.",
              "每個例外都顯示 reviewer、到期時間與原因代碼。",
            )}
          </div>
        </div>
        {exceptions.length === 0 ? (
          <EmptyStateCard
            locale={locale}
            reason={emptyReason === "filtered_empty" ? "no_data" : emptyReason}
            nextAction={{ action: "refresh", enabled: true, riskLevel: "low" }}
            onAction={() => undefined}
          />
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>{text(locale, "Family", "家族")}</th>
                  <th style={thStyle}>{text(locale, "Subject", "主體")}</th>
                  <th style={thStyle}>{text(locale, "Reason", "原因")}</th>
                  <th style={thStyle}>
                    {text(locale, "Reviewer", "Reviewer")}
                  </th>
                  <th style={thStyle}>{text(locale, "Expires", "到期")}</th>
                  <th style={thStyle}>{text(locale, "Action", "動作")}</th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map((exception) => {
                  const rowAction =
                    exception.availableActions?.find(
                      (action: ResourceActionDescriptor) =>
                        action.action === "revoke_deletion_exception",
                    ) ?? fallbackExceptionActions(exception)[0];
                  return (
                    <tr key={exception.exceptionId}>
                      <td style={tdStyle}>
                        {formatPlatformCodeLabel(locale, exception.family)}
                      </td>
                      <td style={{ ...tdStyle, ...monoStyle }}>
                        {exception.subjectId}
                      </td>
                      <td style={tdStyle}>
                        {formatPlatformCodeLabel(locale, exception.reasonCode)}
                      </td>
                      <td style={{ ...tdStyle, ...monoStyle }}>
                        {exception.reviewerActorId}
                      </td>
                      <td style={tdStyle}>
                        {formatDateTime(exception.expiresAt)}
                      </td>
                      <td style={tdStyle}>
                        <ActionButton
                          locale={locale}
                          descriptor={rowAction}
                          onClick={() => onResolve(exception)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CanvasCard>
  );
}
