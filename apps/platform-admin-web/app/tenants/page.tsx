"use client";

import Link from "next/link";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { usePlatformAdminAssistantPage } from "@/components/assistant/route-context";
import type { PageContextSnapshot } from "@/components/assistant/assistant-types";
import {
  formatPlatformUiError,
  toPlatformErrorMessage,
} from "@/lib/error-copy";
import {
  EMPTY_TENANT_FORM,
  createTenantModuleLabels,
  parseQuota,
  tenantStageTone,
  toggleTenantModule,
  type TenantFormState,
} from "@/components/tenant-governance-shared";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type {
  CreatePlatformTenantCommand,
  PlatformAdminTenantRecord,
  PlatformTenantGateStatus,
} from "@drts/contracts";
import {
  PLATFORM_TENANT_INTEGRATION_MODES,
  PLATFORM_TENANT_MODULES,
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
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type TenantFilter =
  | "all"
  | "sandbox"
  | "pilot"
  | "production"
  | "rollback_hold";

type TenantStageValue = Exclude<TenantFilter, "all">;
type TenantRow = PlatformAdminTenantRecord & Record<string, unknown>;

const TENANT_FILTER_VALUES = new Set<TenantFilter>([
  "all",
  "sandbox",
  "pilot",
  "production",
  "rollback_hold",
]);

function isTenantFilter(value: string): value is TenantFilter {
  return TENANT_FILTER_VALUES.has(value as TenantFilter);
}

const th = buildCanvasTheme({
  surface: "platform",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const tabNodeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  cursor: "pointer",
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 6, 16, 0.62)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "56px 24px",
  overflowY: "auto",
  zIndex: 60,
};

const modalPanelStyle: CSSProperties = {
  width: "min(1000px, 100%)",
};

const loadingStateStyle: CSSProperties = {
  padding: 28,
  color: th.textMuted,
  fontFamily: th.fontFamily,
  fontSize: 12.5,
  textAlign: "center",
};

const emptyStateStyle: CSSProperties = {
  padding: 28,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const createPanelStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
  alignItems: "start",
};

const createGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 14,
};

const quotaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
};

const moduleGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: th.text,
  fontSize: 12.5,
  fontWeight: 600,
};

const sectionHintStyle: CSSProperties = {
  margin: "4px 0 0",
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const inputStyle: CSSProperties = {
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

const monoInputStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: th.monoFamily,
};

const createActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 4,
};

const submitButtonStyle = (disabled: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 132,
  height: 28,
  padding: "5px 10px",
  borderRadius: 7,
  border: `1px solid ${th.accent}`,
  background: th.accent,
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 500,
  lineHeight: 1,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
});

const headerActionsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const tenantLinkStyle: CSSProperties = {
  display: "inline-flex",
  flexDirection: "column",
  gap: 2,
  color: th.text,
  textDecoration: "none",
};

const tenantNameStyle: CSSProperties = {
  fontWeight: 600,
  color: th.text,
};

const tenantMetaStyle: CSSProperties = {
  fontSize: 11,
  color: th.textDim,
  fontFamily: th.monoFamily,
};

const tenantLifecycleMetaStyle: CSSProperties = {
  fontSize: 11,
  color: th.textMuted,
  fontFamily: th.fontFamily,
};

const tableToolbarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 12,
  flexWrap: "wrap",
};

const searchFieldStyle: CSSProperties = {
  minWidth: 260,
  width: "min(420px, 100%)",
};

const tenantSummaryStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
};

function toCanvasTone(
  tone: ReturnType<typeof tenantStageTone>,
): Exclude<CanvasTone, "warn"> | "warn" {
  return tone === "warning" ? "warn" : tone;
}

function formatLocaleNumber(locale: string, value: number) {
  return value.toLocaleString(locale === "en" ? "en-US" : "zh-TW");
}

function getFilterTone(value: TenantFilter, active: boolean): CanvasTone {
  if (active) {
    return "accent";
  }
  if (value === "rollback_hold") {
    return "danger";
  }
  return "neutral";
}

function getTenantStageValue(
  tenant: PlatformAdminTenantRecord,
): TenantStageValue {
  return tenant.status === "rollback_hold"
    ? "rollback_hold"
    : tenant.rollout.stage;
}

function getStageTone(stage: TenantStageValue): CanvasTone {
  if (stage === "rollback_hold") {
    return "danger";
  }
  return toCanvasTone(tenantStageTone(stage));
}

function getTenantGateStatus(
  tenant: PlatformAdminTenantRecord,
): PlatformTenantGateStatus {
  if (tenant.status === "rollback_hold") {
    return "blocked";
  }

  if (tenant.rollout.stage === "production") {
    return tenant.rollout.productionStatus;
  }

  if (tenant.rollout.stage === "pilot") {
    return tenant.rollout.pilotStatus;
  }

  return tenant.rollout.sandboxStatus;
}

function getGateTone(gate: PlatformTenantGateStatus): CanvasTone {
  if (gate === "approved") {
    return "success";
  }
  if (gate === "ready") {
    return "info";
  }
  if (gate === "blocked") {
    return "danger";
  }
  return "warn";
}

function formatQuotaSummary(locale: string, tenant: PlatformAdminTenantRecord) {
  return locale === "en"
    ? `${formatLocaleNumber(locale, tenant.quotas.monthlyBookings)}/mo`
    : `${formatLocaleNumber(locale, tenant.quotas.monthlyBookings)}/月`;
}

function formatShortDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().slice(0, 10);
}

function toCsvCell(value: string | number) {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export default function TenantsPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const tableSectionRef = useRef<HTMLDivElement | null>(null);
  const [tenants, setTenants] = useState<PlatformAdminTenantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<TenantFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [createForm, setCreateForm] =
    useState<TenantFormState>(EMPTY_TENANT_FORM);

  // Live v2 context snapshot (page/form/table/action mesh). Held in a ref so the
  // bridge object stays stable while the assistant always reads current state at
  // send-time. Populated below once derived page state exists.
  const assistantSnapshotRef = useRef<PageContextSnapshot>({});

  const assistantBridge = useMemo(
    () => ({
      pageId: "tenants",
      filters: {
        rollout_stage: {
          apply(value: unknown) {
            if (typeof value !== "string" || !isTenantFilter(value)) {
              return {
                ok: false,
                code: "invalid_filter_value",
                message: t("tenants.list.assistant.invalidFilter"),
              } as const;
            }
            setFilter(value as TenantFilter);
            return {
              ok: true,
              code: "filter_applied",
              message: t("tenants.list.assistant.filterApplied", { value }),
              payload: { filterId: "rollout_stage", value },
            } as const;
          },
        },
      },
      getContextSnapshot: () => assistantSnapshotRef.current,
    }),
    [t],
  );

  usePlatformAdminAssistantPage(assistantBridge);

  const copy = useMemo(
    () => ({
      title: t("tenants.list.pageTitle"),
      subtitle: t("tenants.list.pageSubtitle"),
      filterAction: t("tenants.list.filterAction"),
      exportAction: t("tenants.list.exportAction"),
      createTitle: t("tenants.list.createTitle"),
      createSubtitle: t("tenants.list.createSubtitle"),
      createSummaryTitle: t("tenants.list.createSummaryTitle"),
      createSummarySubtitle: t("tenants.list.createSummarySubtitle"),
      errorTitle: t("tenants.list.errorTitle"),
      columns: {
        tenant: t("tenants.list.col.tenant"),
        stage: t("tenants.list.col.stage"),
        gate: t("tenants.list.col.gate"),
        modules: t("tenants.list.col.modules"),
        quotas: t("tenants.list.col.quotasPerMonth"),
        integration: t("tenants.list.col.integration"),
        updated: t("tenants.list.col.updated"),
      },
      filters: {
        all: t("common.all"),
        production: t("tenants.list.filter.production"),
        pilot: t("tenants.list.filter.pilot"),
        sandbox: t("tenants.list.filter.sandbox"),
        rollback_hold: t("tenants.list.filter.rollbackHold"),
      },
      gate: {
        ready: t("tenants.list.gate.ready"),
        pending: t("tenants.list.gate.pending"),
        blocked: t("tenants.list.gate.blocked"),
        approved: t("tenants.list.gate.approved"),
      },
      lifecycle: {
        status: t("tenants.list.lifecycle.status"),
        cutover: t("tenants.list.lifecycle.cutover"),
        rollback: t("tenants.list.lifecycle.rollback"),
        unassigned: t("tenants.list.lifecycle.unassigned"),
      },
      search: {
        label: t("tenants.list.search.label"),
        placeholder: t("tenants.list.search.placeholder"),
        clear: t("tenants.list.search.clear"),
      },
      moduleState: {
        enabled: t("tenants.list.moduleState.enabled"),
        disabled: t("tenants.list.moduleState.disabled"),
      },
      bootstrap: {
        modules: t("tenants.list.bootstrap.modules"),
        quota: t("tenants.list.bootstrap.quota"),
        api: t("tenants.list.bootstrap.api"),
        status: t("tenants.list.bootstrap.status"),
        integration: t("tenants.list.bootstrap.integration"),
        admin: t("tenants.list.bootstrap.admin"),
        sandbox: t("tenants.list.bootstrap.sandbox"),
        empty: "—",
      },
      hints: {
        quota: t("tenants.list.quotaHint"),
        modules: t("tenants.list.modulesHint"),
        onboarding: t("tenants.list.onboardingHint"),
      },
      kpiSub: {
        modules: t("tenants.list.kpi.modulesSub"),
        bookings: t("tenants.list.kpi.bookingsSub"),
        api: t("tenants.list.kpi.apiSub"),
      },
      placeholders: {
        name: t("tenants.list.placeholder.name"),
        code: t("tenants.list.placeholder.code"),
        adminEmail: t("tenants.list.placeholder.adminEmail"),
        sandboxBaseUrl: t("tenants.list.placeholder.sandboxBaseUrl"),
      },
    }),
    [t],
  );

  const moduleLabels = useMemo(() => createTenantModuleLabels(t), [t]);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listPlatformTenants();
      setTenants(result ?? []);
    } catch (e: unknown) {
      setError(
        formatPlatformUiError(
          locale,
          toPlatformErrorMessage(e),
          locale === "en" ? "Tenant list unavailable" : "租戶清單暫時無法載入",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  const counts = useMemo(
    () => ({
      all: tenants.length,
      sandbox: tenants.filter((tenant) => tenant.rollout.stage === "sandbox")
        .length,
      pilot: tenants.filter((tenant) => tenant.rollout.stage === "pilot")
        .length,
      production: tenants.filter(
        (tenant) =>
          tenant.rollout.stage === "production" &&
          tenant.status !== "rollback_hold",
      ).length,
      rollback_hold: tenants.filter(
        (tenant) => tenant.status === "rollback_hold",
      ).length,
    }),
    [tenants],
  );

  const visibleTenants = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const filtered =
      filter === "rollback_hold"
        ? tenants.filter((tenant) => tenant.status === "rollback_hold")
        : filter === "all"
          ? tenants
          : tenants.filter(
              (tenant) =>
                tenant.status !== "rollback_hold" &&
                tenant.rollout.stage === filter,
            );

    const searched = query
      ? filtered.filter((tenant) =>
          [tenant.name, tenant.code, tenant.id]
            .join(" ")
            .toLowerCase()
            .includes(query),
        )
      : filtered;

    return [...searched].sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    );
  }, [filter, searchTerm, tenants]);

  // Context mesh v2 snapshot: the visible tenant table, the create-tenant form
  // (when open), and the actions this view exposes. Page-owned plain data only.
  const assistantSnapshot = useMemo<PageContextSnapshot>(() => {
    const formDirty =
      JSON.stringify(createForm) !== JSON.stringify(EMPTY_TENANT_FORM);

    return {
      tables: [
        {
          tableId: "tenants",
          title: copy.title,
          totalRowCount: tenants.length,
          visibleRowCount: visibleTenants.length,
          activeFilter: searchTerm.trim()
            ? `${filter} / ${searchTerm.trim()}`
            : filter,
          rowEntityKind: "tenant",
          columns: [
            { key: "tenant", label: copy.columns.tenant },
            { key: "stage", label: copy.columns.stage },
            { key: "gate", label: copy.columns.gate },
            { key: "modules", label: copy.columns.modules },
            { key: "quotas", label: copy.columns.quotas },
            { key: "integration", label: copy.columns.integration },
            { key: "updated", label: copy.columns.updated },
          ],
          sampleRows: visibleTenants.slice(0, 5).map((tenant) => ({
            kind: "tenant",
            id: tenant.code,
            label: tenant.name,
            source: "page-selection",
          })),
        },
      ],
      forms: showCreate
        ? [
            {
              formId: "tenant-create-form",
              title: copy.createTitle,
              dirty: formDirty,
              submitting: creating,
              fields: [
                {
                  name: "name",
                  kind: "text",
                  required: true,
                  filled: createForm.name.trim().length > 0,
                  ...(createForm.name ? { valuePreview: createForm.name } : {}),
                },
                {
                  name: "code",
                  kind: "text",
                  required: true,
                  filled: createForm.code.trim().length > 0,
                  ...(createForm.code ? { valuePreview: createForm.code } : {}),
                },
                {
                  name: "status",
                  kind: "select",
                  filled: true,
                  valuePreview: createForm.status,
                },
                {
                  name: "enabledModules",
                  kind: "multiselect",
                  filled: createForm.enabledModules.length > 0,
                  ...(createForm.enabledModules.length > 0
                    ? { valuePreview: createForm.enabledModules.join(", ") }
                    : {}),
                },
                {
                  name: "integrationMode",
                  kind: "select",
                  filled: true,
                  valuePreview: createForm.integrationMode,
                },
                {
                  name: "bootstrapAdminEmail",
                  kind: "text",
                  filled: createForm.bootstrapAdminEmail.trim().length > 0,
                  ...(createForm.bootstrapAdminEmail
                    ? { valuePreview: createForm.bootstrapAdminEmail }
                    : {}),
                },
              ],
              validationErrors: [],
            },
          ]
        : [],
      availableActions: [
        {
          id: "create_tenant",
          label: copy.createTitle,
          risk: "medium",
          enabled: !creating,
          requiresConfirmation: true,
        },
        {
          id: "export_tenants",
          label: copy.exportAction,
          risk: "low",
          enabled: visibleTenants.length > 0,
          ...(visibleTenants.length === 0
            ? { disabledReasonCode: "no_visible_rows" }
            : {}),
        },
      ],
    };
  }, [
    copy,
    tenants.length,
    visibleTenants,
    filter,
    searchTerm,
    showCreate,
    createForm,
    creating,
  ]);

  assistantSnapshotRef.current = assistantSnapshot;

  const exportVisibleTenants = useCallback(() => {
    if (visibleTenants.length === 0) {
      return;
    }

    const header = [
      copy.columns.tenant,
      copy.columns.stage,
      copy.columns.gate,
      copy.columns.modules,
      copy.columns.quotas,
      copy.columns.integration,
      copy.columns.updated,
    ];

    const rows = visibleTenants.map((tenant) => [
      `${tenant.name} (${tenant.code})`,
      formatPlatformCodeLabel(locale, getTenantStageValue(tenant)),
      copy.gate[getTenantGateStatus(tenant)],
      `${tenant.enabledModules.length}/${PLATFORM_TENANT_MODULES.length}`,
      formatQuotaSummary(locale, tenant),
      formatPlatformCodeLabel(locale, tenant.integrationPackage.mode),
      formatDateTime(tenant.updatedAt),
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map(toCsvCell).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `platform-tenants-${filter}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [copy.columns, copy.gate, filter, locale, visibleTenants]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const command: CreatePlatformTenantCommand = {
        name: createForm.name,
        code: createForm.code,
        status: createForm.status,
        enabledModules: createForm.enabledModules,
        quotas: {
          activeDrivers: parseQuota(createForm.activeDrivers),
          monthlyBookings: parseQuota(createForm.monthlyBookings),
          monthlyApiCalls: parseQuota(createForm.monthlyApiCalls),
        },
        integrationMode: createForm.integrationMode,
        ...(createForm.bootstrapAdminEmail.trim()
          ? { bootstrapAdminEmail: createForm.bootstrapAdminEmail.trim() }
          : {}),
        ...(createForm.sandboxBaseUrl.trim()
          ? { sandboxBaseUrl: createForm.sandboxBaseUrl.trim() }
          : {}),
      };
      await client.createPlatformTenant(command);
      setCreateForm(EMPTY_TENANT_FORM);
      setShowCreate(false);
      await loadTenants();
    } catch (e: unknown) {
      setError(
        formatPlatformUiError(
          locale,
          toPlatformErrorMessage(e),
          locale === "en" ? "Tenant creation failed" : "租戶建立失敗",
        ),
      );
    } finally {
      setCreating(false);
    }
  };

  const columns = useMemo<CanvasTableColumn<TenantRow>[]>(
    () => [
      {
        h: copy.columns.tenant,
        w: 240,
        r: (tenant) => (
          <Link href={`/tenants/${tenant.id}`} style={tenantLinkStyle}>
            <span style={tenantNameStyle}>{tenant.name}</span>
            <span style={tenantMetaStyle}>
              {tenant.code} · {tenant.id}
            </span>
            <span style={tenantLifecycleMetaStyle}>
              {copy.lifecycle.status}:{" "}
              {formatPlatformCodeLabel(locale, tenant.status)} ·{" "}
              {copy.lifecycle.cutover}:{" "}
              {tenant.rollout.cutoverOwner ?? copy.lifecycle.unassigned} ·{" "}
              {copy.lifecycle.rollback}:{" "}
              {tenant.rollout.rollbackOwner ?? copy.lifecycle.unassigned}
            </span>
          </Link>
        ),
      },
      {
        h: copy.columns.stage,
        w: 130,
        r: (tenant) => {
          const stage = getTenantStageValue(tenant);

          return (
            <CanvasPill theme={th} tone={getStageTone(stage)} dot>
              {formatPlatformCodeLabel(locale, stage)}
            </CanvasPill>
          );
        },
      },
      {
        h: copy.columns.gate,
        w: 130,
        r: (tenant) => {
          const gate = getTenantGateStatus(tenant);

          return (
            <CanvasPill theme={th} tone={getGateTone(gate)}>
              {copy.gate[gate]}
            </CanvasPill>
          );
        },
      },
      {
        h: copy.columns.modules,
        w: 100,
        mono: true,
        r: (tenant) => (
          <span
            title={tenant.enabledModules
              .map((moduleCode) => moduleLabels[moduleCode])
              .join(" · ")}
          >
            {tenant.enabledModules.length}/{PLATFORM_TENANT_MODULES.length}
          </span>
        ),
      },
      {
        h: copy.columns.quotas,
        w: 120,
        mono: true,
        r: (tenant) => (
          <span
            title={t("tenants.list.quotasTooltip", {
              drivers: formatLocaleNumber(locale, tenant.quotas.activeDrivers),
              api: formatLocaleNumber(locale, tenant.quotas.monthlyApiCalls),
            })}
          >
            {formatQuotaSummary(locale, tenant)}
          </span>
        ),
      },
      {
        h: copy.columns.integration,
        w: 160,
        mono: true,
        r: (tenant) => (
          <span title={tenant.integrationPackage.sandboxBaseUrl ?? ""}>
            {formatPlatformCodeLabel(locale, tenant.integrationPackage.mode)}
          </span>
        ),
      },
      {
        h: copy.columns.updated,
        w: 120,
        mono: true,
        r: (tenant) => formatShortDate(tenant.updatedAt),
      },
    ],
    [copy.columns, copy.gate, copy.lifecycle, locale, moduleLabels, t],
  );

  const filterOptions = [
    { value: "all" as const, label: copy.filters.all, count: counts.all },
    {
      value: "production" as const,
      label: copy.filters.production,
      count: counts.production,
    },
    { value: "pilot" as const, label: copy.filters.pilot, count: counts.pilot },
    {
      value: "sandbox" as const,
      label: copy.filters.sandbox,
      count: counts.sandbox,
    },
    {
      value: "rollback_hold" as const,
      label: copy.filters.rollback_hold,
      count: counts.rollback_hold,
    },
  ];

  const tabNodes = filterOptions.map((option) => {
    const active = filter === option.value;
    return (
      <span
        key={option.value}
        role="button"
        tabIndex={0}
        aria-pressed={active}
        style={tabNodeStyle}
        onClick={() => setFilter(option.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setFilter(option.value);
          }
        }}
      >
        {option.label}
        <CanvasPill theme={th} tone={getFilterTone(option.value, active)}>
          {formatLocaleNumber(locale, option.count)}
        </CanvasPill>
      </span>
    );
  });
  const activeTabNode =
    tabNodes[filterOptions.findIndex((option) => option.value === filter)] ??
    tabNodes[0];

  const createDisabled =
    creating || !createForm.name.trim() || !createForm.code.trim();

  return (
    <>
      <CanvasPageHeader
        theme={th}
        title={copy.title}
        subtitle={copy.subtitle}
        tabs={tabNodes}
        activeTab={activeTabNode}
        actions={
          <div style={headerActionsStyle}>
            <CanvasBtn
              theme={th}
              variant="secondary"
              icon="filter"
              onClick={() =>
                tableSectionRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "nearest",
                })
              }
            >
              {copy.filterAction}
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="secondary"
              icon="reports"
              onClick={exportVisibleTenants}
              disabled={loading || visibleTenants.length === 0}
            >
              {copy.exportAction}
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="primary"
              icon={showCreate ? "x" : "plus"}
              onClick={() => setShowCreate((current) => !current)}
            >
              {showCreate ? t("common.cancel") : t("tenants.newTenant")}
            </CanvasBtn>
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title={copy.errorTitle}
            body={error}
          />
        ) : null}

        {showCreate ? (
          <div
            style={modalOverlayStyle}
            role="dialog"
            aria-modal="true"
            aria-label={copy.createTitle}
            onClick={() => setShowCreate(false)}
          >
            <div
              style={modalPanelStyle}
              onClick={(event) => event.stopPropagation()}
            >
              <div style={createPanelStyle}>
                <CanvasCard
                  theme={th}
                  title={copy.createTitle}
                  subtitle={copy.createSubtitle}
                >
                  <form onSubmit={handleCreate}>
                    <div style={createGridStyle}>
                      <div style={fieldGridStyle}>
                        <CanvasField
                          theme={th}
                          label={t("tenants.form.name")}
                          required
                        >
                          <input
                            value={createForm.name}
                            onChange={(event) =>
                              setCreateForm((current) => ({
                                ...current,
                                name: event.target.value,
                              }))
                            }
                            required
                            placeholder={copy.placeholders.name}
                            style={inputStyle}
                          />
                        </CanvasField>
                        <CanvasField
                          theme={th}
                          label={t("tenants.form.code")}
                          required
                        >
                          <input
                            value={createForm.code}
                            onChange={(event) =>
                              setCreateForm((current) => ({
                                ...current,
                                code: event.target.value,
                              }))
                            }
                            required
                            placeholder={copy.placeholders.code}
                            style={monoInputStyle}
                          />
                        </CanvasField>
                        <CanvasField
                          theme={th}
                          label={t("tenants.form.status")}
                        >
                          <select
                            value={createForm.status}
                            onChange={(event) =>
                              setCreateForm((current) => ({
                                ...current,
                                status: event.target.value as
                                  | "active"
                                  | "inactive",
                              }))
                            }
                            style={inputStyle}
                          >
                            <option value="active">{t("common.active")}</option>
                            <option value="inactive">
                              {t("common.inactive")}
                            </option>
                          </select>
                        </CanvasField>
                      </div>

                      <div>
                        <h3 style={sectionTitleStyle}>
                          {t("tenants.quotaAllocation")}
                        </h3>
                        <p style={sectionHintStyle}>{copy.hints.quota}</p>
                        <div style={quotaGridStyle}>
                          <CanvasField
                            theme={th}
                            label={t("tenants.form.activeDrivers")}
                          >
                            <input
                              type="number"
                              min={0}
                              value={createForm.activeDrivers}
                              onChange={(event) =>
                                setCreateForm((current) => ({
                                  ...current,
                                  activeDrivers: event.target.value,
                                }))
                              }
                              style={monoInputStyle}
                            />
                          </CanvasField>
                          <CanvasField
                            theme={th}
                            label={t("tenants.form.monthlyBookings")}
                          >
                            <input
                              type="number"
                              min={0}
                              value={createForm.monthlyBookings}
                              onChange={(event) =>
                                setCreateForm((current) => ({
                                  ...current,
                                  monthlyBookings: event.target.value,
                                }))
                              }
                              style={monoInputStyle}
                            />
                          </CanvasField>
                          <CanvasField
                            theme={th}
                            label={t("tenants.form.monthlyApiCalls")}
                          >
                            <input
                              type="number"
                              min={0}
                              value={createForm.monthlyApiCalls}
                              onChange={(event) =>
                                setCreateForm((current) => ({
                                  ...current,
                                  monthlyApiCalls: event.target.value,
                                }))
                              }
                              style={monoInputStyle}
                            />
                          </CanvasField>
                        </div>
                      </div>

                      <div>
                        <h3 style={sectionTitleStyle}>
                          {t("tenants.form.modules")}
                        </h3>
                        <p style={sectionHintStyle}>{copy.hints.modules}</p>
                        <div style={moduleGridStyle}>
                          {PLATFORM_TENANT_MODULES.map((moduleCode) => {
                            const active =
                              createForm.enabledModules.includes(moduleCode);

                            return (
                              <button
                                key={moduleCode}
                                type="button"
                                onClick={() =>
                                  setCreateForm((current) =>
                                    toggleTenantModule(current, moduleCode),
                                  )
                                }
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 10,
                                  padding: "10px 12px",
                                  borderRadius: 8,
                                  border: `1px solid ${
                                    active ? th.accentBorder : th.border
                                  }`,
                                  background: active
                                    ? th.accentBg
                                    : th.surfaceLo,
                                  color: th.text,
                                  cursor: "pointer",
                                }}
                              >
                                <CanvasPill
                                  theme={th}
                                  tone={active ? "accent" : "neutral"}
                                >
                                  {moduleLabels[moduleCode]}
                                </CanvasPill>
                                <span
                                  style={{
                                    fontSize: 11.5,
                                    color: th.textMuted,
                                  }}
                                >
                                  {active
                                    ? copy.moduleState.enabled
                                    : copy.moduleState.disabled}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <h3 style={sectionTitleStyle}>
                          {t("tenants.section.onboarding")}
                        </h3>
                        <p style={sectionHintStyle}>{copy.hints.onboarding}</p>
                        <div style={fieldGridStyle}>
                          <CanvasField
                            theme={th}
                            label={t("tenants.form.integrationMode")}
                          >
                            <select
                              value={createForm.integrationMode}
                              onChange={(event) =>
                                setCreateForm((current) => ({
                                  ...current,
                                  integrationMode: event.target
                                    .value as (typeof PLATFORM_TENANT_INTEGRATION_MODES)[number],
                                }))
                              }
                              style={inputStyle}
                            >
                              {PLATFORM_TENANT_INTEGRATION_MODES.map((mode) => (
                                <option key={mode} value={mode}>
                                  {formatPlatformCodeLabel(locale, mode)}
                                </option>
                              ))}
                            </select>
                          </CanvasField>
                          <CanvasField
                            theme={th}
                            label={t("tenants.form.bootstrapAdminEmail")}
                          >
                            <input
                              value={createForm.bootstrapAdminEmail}
                              onChange={(event) =>
                                setCreateForm((current) => ({
                                  ...current,
                                  bootstrapAdminEmail: event.target.value,
                                }))
                              }
                              placeholder={copy.placeholders.adminEmail}
                              style={inputStyle}
                            />
                          </CanvasField>
                          <CanvasField
                            theme={th}
                            label={t("tenants.form.sandboxBaseUrl")}
                          >
                            <input
                              value={createForm.sandboxBaseUrl}
                              onChange={(event) =>
                                setCreateForm((current) => ({
                                  ...current,
                                  sandboxBaseUrl: event.target.value,
                                }))
                              }
                              placeholder={copy.placeholders.sandboxBaseUrl}
                              style={monoInputStyle}
                            />
                          </CanvasField>
                        </div>
                      </div>

                      <div style={createActionsStyle}>
                        <CanvasBtn
                          theme={th}
                          variant="secondary"
                          onClick={() => setShowCreate(false)}
                        >
                          {t("common.cancel")}
                        </CanvasBtn>
                        <button
                          type="submit"
                          disabled={createDisabled}
                          style={submitButtonStyle(createDisabled)}
                        >
                          {creating
                            ? t("common.creating")
                            : t("tenants.createTenant")}
                        </button>
                      </div>
                    </div>
                  </form>
                </CanvasCard>

                <CanvasCard
                  theme={th}
                  title={copy.createSummaryTitle}
                  subtitle={copy.createSummarySubtitle}
                >
                  <div style={createGridStyle}>
                    <div style={tenantSummaryStyle}>
                      <CanvasKPI
                        theme={th}
                        label={copy.bootstrap.modules}
                        value={`${createForm.enabledModules.length}/${PLATFORM_TENANT_MODULES.length}`}
                        sub={copy.kpiSub.modules}
                      />
                      <CanvasKPI
                        theme={th}
                        label={copy.bootstrap.quota}
                        value={createForm.monthlyBookings || "0"}
                        sub={copy.kpiSub.bookings}
                      />
                      <CanvasKPI
                        theme={th}
                        label={copy.bootstrap.api}
                        value={createForm.monthlyApiCalls || "0"}
                        sub={copy.kpiSub.api}
                      />
                    </div>
                    <CanvasDL
                      theme={th}
                      cols={1}
                      items={[
                        {
                          k: copy.bootstrap.status,
                          v: formatPlatformCodeLabel(locale, createForm.status),
                        },
                        {
                          k: copy.bootstrap.integration,
                          v: formatPlatformCodeLabel(
                            locale,
                            createForm.integrationMode,
                          ),
                        },
                        {
                          k: copy.bootstrap.admin,
                          v:
                            createForm.bootstrapAdminEmail.trim() ||
                            copy.bootstrap.empty,
                          mono: true,
                        },
                        {
                          k: copy.bootstrap.sandbox,
                          v:
                            createForm.sandboxBaseUrl.trim() ||
                            copy.bootstrap.empty,
                          mono: true,
                        },
                      ]}
                    />
                  </div>
                </CanvasCard>
              </div>
            </div>
          </div>
        ) : null}

        <div ref={tableSectionRef} style={createGridStyle}>
          <div style={tableToolbarStyle}>
            <CanvasField theme={th} label={copy.search.label}>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={copy.search.placeholder}
                style={{ ...inputStyle, ...searchFieldStyle }}
              />
            </CanvasField>
            {searchTerm.trim() ? (
              <CanvasBtn
                theme={th}
                variant="secondary"
                icon="x"
                onClick={() => setSearchTerm("")}
              >
                {copy.search.clear}
              </CanvasBtn>
            ) : null}
          </div>
          <CanvasCard theme={th} padding={0}>
            {loading ? (
              <div style={loadingStateStyle}>{t("tenants.loading")}</div>
            ) : visibleTenants.length > 0 ? (
              <CanvasTable<TenantRow>
                theme={th}
                columns={columns}
                rows={visibleTenants as TenantRow[]}
              />
            ) : (
              <div style={emptyStateStyle}>{t("tenants.empty")}</div>
            )}
          </CanvasCard>
        </div>
      </div>
    </>
  );
}
