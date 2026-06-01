"use client";

import Link from "next/link";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import {
  EMPTY_ENTRY_FORM,
  buildPartnerReadinessItems,
  toPartnerCreateCommand,
  type EntryFormState,
} from "@/components/partner-governance-shared";
import {
  BUSINESS_DISPATCH_SUBTYPES,
  PARTNER_ENTRY_AUTH_MODES,
  PARTNER_ENTRY_STATUSES,
  PARTNER_ELIGIBILITY_MODES,
  type PartnerChannelEntryRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasIcon,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
} from "@drts/ui-web";

type PartnerFilter = "all" | "active" | "inactive" | "revoked" | "attention";
type PartnerTableRow = PartnerChannelEntryRecord & Record<string, unknown>;

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const pageStackStyle = {
  display: "grid",
  gap: 24,
  padding: 24,
} satisfies CSSProperties;

const pillsRowStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0 14px",
} satisfies CSSProperties;

const entryCellStyle = {
  display: "flex",
  alignItems: "center",
  gap: 9,
} satisfies CSSProperties;

const entryAccentStyle = (accent: string): CSSProperties => ({
  width: 28,
  height: 28,
  borderRadius: 6,
  background: accent,
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 700,
  flexShrink: 0,
});

const monoSubtleStyle = {
  fontSize: 11,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
} satisfies CSSProperties;

const entryLinkStyle = {
  color: theme.text,
  fontWeight: 600,
  textDecoration: "none",
} satisfies CSSProperties;

const iconLinkStyle = {
  width: 22,
  height: 22,
  borderRadius: 6,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: theme.textDim,
  textDecoration: "none",
} satisfies CSSProperties;

const pillButtonStyle = {
  border: "none",
  background: "transparent",
  padding: 0,
  cursor: "pointer",
} satisfies CSSProperties;

const inputBaseStyle = (mono = false): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontFamily: mono ? theme.monoFamily : theme.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
});

const submitButtonStyle = (disabled: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 14px",
  minHeight: 34,
  fontSize: 13,
  fontWeight: 600,
  background: theme.accent,
  color: "#fff",
  border: `1px solid ${theme.accent}`,
  borderRadius: 7,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
  fontFamily: theme.fontFamily,
});

function buildPlatformNav(locale: string): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          health: "Platform Health",
          tenantGov: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partner entry",
          users: "Platform staff",
          fleetGov: "Fleet & Compliance",
          fleet: "Fleet & compliance",
          switchboard: "Public info & placards",
          pricingGov: "Pricing & Settlement",
          pricing: "Pricing",
          payments: "Settlement governance",
          platformLayer: "Platform Layer",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
          adapters: "Adapter registry",
        }
      : {
          workspace: "工作面",
          home: "工作首頁",
          health: "平台健康",
          tenantGov: "租戶治理",
          tenants: "租戶",
          partners: "合作夥伴 entry",
          users: "平台人員",
          fleetGov: "車隊與法遵",
          fleet: "車隊與合規",
          switchboard: "法定資訊與牌貼",
          pricingGov: "計價與結算",
          pricing: "計價",
          payments: "結算治理",
          platformLayer: "平台層",
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
      badge: "2",
      badgeTone: "warn",
    },
    { divider: labels.tenantGov },
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
    { divider: labels.fleetGov },
    { key: "fleet", href: "/fleet", icon: "fleet", label: labels.fleet },
    {
      key: "switchboard",
      href: "/switchboard",
      icon: "switchboard",
      label: labels.switchboard,
    },
    { divider: labels.pricingGov },
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
      badge: "3",
      badgeTone: "danger",
    },
    { divider: labels.platformLayer },
    {
      key: "notices",
      href: "/notices",
      icon: "notices",
      label: labels.notices,
    },
    { key: "audit", href: "/audit", icon: "audit", label: labels.audit },
    {
      key: "flags",
      href: "/feature-flags",
      icon: "flags",
      label: labels.flags,
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      icon: "adapters",
      label: labels.adapters,
    },
  ];
}

function statusTone(
  status: PartnerChannelEntryRecord["status"],
): "success" | "warn" | "danger" | "neutral" {
  switch (status) {
    case "active":
      return "success";
    case "inactive":
      return "warn";
    case "revoked":
      return "danger";
    default:
      return "neutral";
  }
}

function partnerNeedsAttention(entry: PartnerChannelEntryRecord) {
  return buildPartnerReadinessItems(entry, (key: string) => key).some(
    (item) => !item.ready,
  );
}

function readinessState(
  entry: PartnerChannelEntryRecord,
  t: (key: string) => string,
): {
  missingCount: number;
  label: string;
  tone: "success" | "warn";
} {
  const items = buildPartnerReadinessItems(entry, t);
  const missingCount = items.filter((item) => !item.ready).length;

  return {
    missingCount,
    label:
      missingCount === 0
        ? "ok"
        : `${missingCount} ${missingCount === 1 ? "gap" : "gaps"}`,
    tone: missingCount === 0 ? "success" : "warn",
  };
}

export default function PartnersPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [entries, setEntries] = useState<PartnerChannelEntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<PartnerFilter>("all");
  const [createForm, setCreateForm] =
    useState<EntryFormState>(EMPTY_ENTRY_FORM);

  const copy =
    locale === "en"
      ? {
          title: "Partner entry",
          subtitle:
            "Bank / hotel / enterprise partner entry routing, auth, eligibility, and branding.",
          breadcrumbRoot: "Tenant Governance",
          searchPlaceholder: "Search entries, tenants, credentials...",
          filterAction: "Filter",
          createAction: "Create entry",
          filterTitle: "Entry filters",
          filterSubtitle:
            "Narrow the roster, refresh the dataset, and keep readiness gaps visible before promotion.",
          createTitle: "Create partner entry",
          createSubtitle:
            "Provision routing, auth mode, eligibility mode, and brand metadata before traffic goes live.",
          refresh: "Refresh",
          last30Days: "last 30 days",
          errorTitle: "Unable to load partner entries",
          filters: {
            all: "all",
            active: "active",
            inactive: "inactive",
            attention: "attention",
            revoked: "revoked",
          },
          kpis: {
            active: "Active entries",
            attention: "Needs attention",
            revoked: "Revoked entries",
          },
          detail: {
            selection: "Selected filter",
            visible: "Visible rows",
            latest: "Latest update",
            readiness: "Attention rows",
          },
          openDetail: "Open entry detail",
        }
      : {
          title: "合作夥伴 entry",
          subtitle:
            "銀行 / 飯店 / 企業 partner 入口、auth 模式、eligibility、品牌。",
          breadcrumbRoot: "租戶治理",
          searchPlaceholder: "搜尋 entry、租戶、憑證...",
          filterAction: "篩選",
          createAction: "建立 entry",
          filterTitle: "Entry 篩選",
          filterSubtitle:
            "收斂治理清單、重新整理資料，並在 promotion 前保留 readiness 缺口視角。",
          createTitle: "建立 partner entry",
          createSubtitle:
            "在正式導流前先補齊 routing、auth mode、eligibility mode 與品牌 metadata。",
          refresh: "重新整理",
          last30Days: "近 30 天",
          errorTitle: "無法載入 partner entries",
          filters: {
            all: "全部",
            active: "active",
            inactive: "inactive",
            attention: "待處理",
            revoked: "revoked",
          },
          kpis: {
            active: "啟用 entry",
            attention: "待補 readiness",
            revoked: "已撤銷 entry",
          },
          detail: {
            selection: "目前篩選",
            visible: "可見列數",
            latest: "最近更新",
            readiness: "待處理列數",
          },
          openDetail: "查看 entry 詳情",
        };

  const navItems = useMemo(() => buildPlatformNav(locale), [locale]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listPlatformPartnerEntries();
      setEntries(result ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const counts = useMemo(
    () => ({
      all: entries.length,
      active: entries.filter((entry) => entry.status === "active").length,
      inactive: entries.filter((entry) => entry.status === "inactive").length,
      revoked: entries.filter((entry) => entry.status === "revoked").length,
      attention: entries.filter(partnerNeedsAttention).length,
    }),
    [entries],
  );

  const visibleEntries = useMemo(() => {
    switch (filter) {
      case "attention":
        return entries.filter(partnerNeedsAttention);
      case "active":
      case "inactive":
      case "revoked":
        return entries.filter((entry) => entry.status === filter);
      case "all":
      default:
        return entries;
    }
  }, [entries, filter]);

  const latestUpdatedAt = useMemo(() => {
    if (visibleEntries.length === 0) {
      return null;
    }

    return visibleEntries.reduce<string | null>((latest, entry) => {
      if (!latest) {
        return entry.updatedAt;
      }
      return new Date(entry.updatedAt).getTime() > new Date(latest).getTime()
        ? entry.updatedAt
        : latest;
    }, null);
  }, [visibleEntries]);

  const tableRows = useMemo(
    () => visibleEntries as PartnerTableRow[],
    [visibleEntries],
  );

  const filterPills = useMemo(
    () =>
      [
        {
          value: "all" as const,
          label: `${copy.filters.all} ${counts.all}`,
          tone: "neutral" as const,
        },
        {
          value: "active" as const,
          label: `${copy.filters.active} ${counts.active}`,
          tone: "success" as const,
        },
        {
          value: "inactive" as const,
          label: `${copy.filters.inactive} ${counts.inactive}`,
          tone: "warn" as const,
        },
        {
          value: "attention" as const,
          label: `${copy.filters.attention} ${counts.attention}`,
          tone: "warn" as const,
        },
        {
          value: "revoked" as const,
          label: `${copy.filters.revoked} ${counts.revoked}`,
          tone: "danger" as const,
        },
      ] satisfies Array<{
        value: PartnerFilter;
        label: string;
        tone: "neutral" | "success" | "warn" | "danger";
      }>,
    [copy.filters, counts],
  );

  const selectedFilterLabel =
    filterPills.find((item) => item.value === filter)?.label ?? filter;

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await client.createPlatformPartnerEntry(
        toPartnerCreateCommand(createForm),
      );
      setCreateForm(EMPTY_ENTRY_FORM);
      setShowCreate(false);
      await loadEntries();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const createDisabled =
    creating ||
    !createForm.partnerCode.trim() ||
    !createForm.programId.trim() ||
    !createForm.entrySlug.trim() ||
    !createForm.displayName.trim();

  return (
    <CanvasShell
      theme={theme}
      nav={navItems}
      active="partners"
      currentPath="/partners"
      breadcrumb={[copy.breadcrumbRoot, copy.title]}
      searchPlaceholder={copy.searchPlaceholder}
      avatarLabel="PA"
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        sticky={false}
        actions={
          <>
            <CanvasBtn
              theme={theme}
              icon="filter"
              onClick={() => setShowFilters((current) => !current)}
            >
              {copy.filterAction}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant={showCreate ? "secondary" : "primary"}
              icon={showCreate ? "x" : "plus"}
              onClick={() => setShowCreate((current) => !current)}
            >
              {showCreate ? t("common.cancel") : copy.createAction}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageStackStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={copy.errorTitle}
            body={error}
          />
        ) : null}

        {showFilters ? (
          <CanvasCard
            theme={theme}
            title={copy.filterTitle}
            subtitle={copy.filterSubtitle}
            actions={
              <CanvasBtn theme={theme} onClick={() => void loadEntries()}>
                {copy.refresh}
              </CanvasBtn>
            }
          >
            <div style={{ display: "grid", gap: 14 }}>
              <div style={pillsRowStyle}>
                {filterPills.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    style={pillButtonStyle}
                    onClick={() => setFilter(item.value)}
                  >
                    <CanvasPill
                      theme={theme}
                      tone={filter === item.value ? "accent" : item.tone}
                      dot={item.value !== "all"}
                    >
                      {item.label}
                    </CanvasPill>
                  </button>
                ))}
                <span style={{ flex: 1 }} />
                <CanvasPill theme={theme} tone="neutral">
                  {copy.last30Days}
                </CanvasPill>
              </div>

              <div style={kpiGridStyle}>
                <CanvasKPI
                  theme={theme}
                  label={copy.kpis.active}
                  value={counts.active}
                  sub={`${counts.all} total`}
                />
                <CanvasKPI
                  theme={theme}
                  label={copy.kpis.attention}
                  value={counts.attention}
                  delta={
                    counts.attention > 0 ? `${counts.attention}` : undefined
                  }
                  deltaTone={counts.attention > 0 ? "down" : "neutral"}
                  sub={
                    locale === "en"
                      ? "Branding, routing, support, or credential gaps"
                      : "品牌、routing、support 或 credential 缺口"
                  }
                />
                <CanvasKPI
                  theme={theme}
                  label={copy.kpis.revoked}
                  value={counts.revoked}
                  sub={
                    locale === "en"
                      ? "Still visible for audit lineage"
                      : "仍保留供 audit lineage 追溯"
                  }
                />
              </div>

              <CanvasDL
                theme={theme}
                cols={2}
                items={[
                  {
                    label: copy.detail.selection,
                    value: selectedFilterLabel,
                  },
                  {
                    label: copy.detail.visible,
                    value: `${visibleEntries.length}`,
                    mono: true,
                  },
                  {
                    label: copy.detail.latest,
                    value: latestUpdatedAt
                      ? formatDateTime(latestUpdatedAt)
                      : "—",
                    mono: true,
                  },
                  {
                    label: copy.detail.readiness,
                    value: `${counts.attention}`,
                    mono: true,
                  },
                ]}
              />
            </div>
          </CanvasCard>
        ) : null}

        {showCreate ? (
          <CanvasCard
            theme={theme}
            title={copy.createTitle}
            subtitle={copy.createSubtitle}
          >
            <form onSubmit={handleCreate}>
              <div style={formGridStyle}>
                <CanvasField
                  theme={theme}
                  label={t("partners.form.tenantId")}
                  required
                >
                  <input
                    value={createForm.tenantId}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        tenantId: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.partnerCode")}
                  required
                >
                  <input
                    value={createForm.partnerCode}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        partnerCode: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.partnerType")}
                >
                  <input
                    value={createForm.partnerType}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        partnerType: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.programId")}
                  required
                >
                  <input
                    value={createForm.programId}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        programId: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.programCode")}
                >
                  <input
                    value={createForm.programCode}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        programCode: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField theme={theme} label={t("partners.form.bankCode")}>
                  <input
                    value={createForm.bankCode}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        bankCode: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.entrySlug")}
                  required
                >
                  <input
                    value={createForm.entrySlug}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        entrySlug: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.displayName")}
                  required
                >
                  <input
                    value={createForm.displayName}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        displayName: event.target.value,
                      }))
                    }
                    style={inputBaseStyle()}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.dispatchSubtype")}
                >
                  <select
                    value={createForm.businessDispatchSubtype}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        businessDispatchSubtype: event.target
                          .value as EntryFormState["businessDispatchSubtype"],
                      }))
                    }
                    style={inputBaseStyle(true)}
                  >
                    {BUSINESS_DISPATCH_SUBTYPES.map((value) => (
                      <option key={value} value={value}>
                        {formatPlatformCodeLabel(locale, value)}
                      </option>
                    ))}
                  </select>
                </CanvasField>

                <CanvasField theme={theme} label={t("partners.form.authMode")}>
                  <select
                    value={createForm.authMode}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        authMode: event.target
                          .value as EntryFormState["authMode"],
                      }))
                    }
                    style={inputBaseStyle(true)}
                  >
                    {PARTNER_ENTRY_AUTH_MODES.map((value) => (
                      <option key={value} value={value}>
                        {formatPlatformCodeLabel(locale, value)}
                      </option>
                    ))}
                  </select>
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.eligibilityMode")}
                >
                  <select
                    value={createForm.eligibilityMode}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        eligibilityMode: event.target
                          .value as EntryFormState["eligibilityMode"],
                      }))
                    }
                    style={inputBaseStyle(true)}
                  >
                    {PARTNER_ELIGIBILITY_MODES.map((value) => (
                      <option key={value} value={value}>
                        {formatPlatformCodeLabel(locale, value)}
                      </option>
                    ))}
                  </select>
                </CanvasField>

                <CanvasField theme={theme} label={t("partners.form.entryHost")}>
                  <input
                    value={createForm.entryHost}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        entryHost: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField theme={theme} label={t("partners.form.entryPath")}>
                  <input
                    value={createForm.entryPath}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        entryPath: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.themeAccent")}
                >
                  <input
                    value={createForm.themeAccent}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        themeAccent: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.supportEmail")}
                >
                  <input
                    type="email"
                    value={createForm.supportEmail}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        supportEmail: event.target.value,
                      }))
                    }
                    style={inputBaseStyle()}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.supportPhone")}
                >
                  <input
                    type="tel"
                    value={createForm.supportPhone}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        supportPhone: event.target.value,
                      }))
                    }
                    style={inputBaseStyle()}
                  />
                </CanvasField>

                <CanvasField theme={theme} label={t("partners.form.status")}>
                  <select
                    value={createForm.status}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        status: event.target.value as EntryFormState["status"],
                      }))
                    }
                    style={inputBaseStyle(true)}
                  >
                    {PARTNER_ENTRY_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {formatPlatformCodeLabel(locale, value)}
                      </option>
                    ))}
                  </select>
                </CanvasField>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="submit"
                  disabled={createDisabled}
                  style={submitButtonStyle(createDisabled)}
                >
                  {creating ? t("common.creating") : t("partners.createEntry")}
                </button>
              </div>
            </form>
          </CanvasCard>
        ) : null}

        <CanvasCard theme={theme} padding={0}>
          {loading ? (
            <div
              style={{
                padding: "24px 16px",
                color: theme.textMuted,
                fontSize: 13,
              }}
            >
              {t("partners.loading")}
            </div>
          ) : visibleEntries.length === 0 ? (
            <div
              style={{
                padding: "24px 16px",
                color: theme.textMuted,
                fontSize: 13,
              }}
            >
              {t("partners.empty")}
            </div>
          ) : (
            <CanvasTable<PartnerTableRow>
              theme={theme}
              rows={tableRows}
              columns={[
                {
                  h: "ENTRY",
                  w: 220,
                  r: (entry) => (
                    <div style={entryCellStyle}>
                      <span
                        style={entryAccentStyle(
                          entry.themeAccent?.trim() || theme.accent,
                        )}
                      >
                        {entry.partnerCode.slice(0, 2).toUpperCase() || "PE"}
                      </span>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <Link
                          href={`/partners/${entry.entrySlug}`}
                          style={entryLinkStyle}
                        >
                          {entry.displayName}
                        </Link>
                        <span style={monoSubtleStyle}>/{entry.entrySlug}</span>
                      </div>
                    </div>
                  ),
                },
                {
                  h: "PROGRAM",
                  w: 140,
                  r: (entry) =>
                    entry.programCode
                      ? `${entry.programId} · ${entry.programCode}`
                      : entry.programId,
                },
                {
                  h: "SUBTYPE",
                  w: 140,
                  mono: true,
                  r: (entry) => (
                    <span style={{ fontSize: 11.5 }}>
                      {entry.businessDispatchSubtype}
                    </span>
                  ),
                },
                {
                  h: "AUTH",
                  w: 110,
                  mono: true,
                  k: "authMode",
                },
                {
                  h: "ELIGIBILITY",
                  w: 120,
                  mono: true,
                  k: "eligibilityMode",
                },
                {
                  h: "STATUS",
                  w: 100,
                  r: (entry) => (
                    <CanvasPill
                      theme={theme}
                      tone={statusTone(entry.status)}
                      dot
                    >
                      {entry.status}
                    </CanvasPill>
                  ),
                },
                {
                  h: "READINESS",
                  w: 160,
                  r: (entry) => {
                    const readiness = readinessState(entry, t);
                    return (
                      <CanvasPill
                        theme={theme}
                        tone={readiness.tone}
                        dot={readiness.missingCount > 0}
                      >
                        {readiness.label}
                      </CanvasPill>
                    );
                  },
                },
                {
                  h: "",
                  w: 28,
                  align: "right",
                  r: (entry) => (
                    <Link
                      href={`/partners/${entry.entrySlug}`}
                      aria-label={copy.openDetail}
                      title={copy.openDetail}
                      style={iconLinkStyle}
                    >
                      <CanvasIcon name="more" size={14} />
                    </Link>
                  ),
                },
              ]}
            />
          )}
        </CanvasCard>
      </div>
    </CanvasShell>
  );
}
