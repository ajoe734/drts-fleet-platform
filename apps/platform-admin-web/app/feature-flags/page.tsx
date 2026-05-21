"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type { FeatureFlag, FeatureFlagSummary } from "@drts/contracts";
import {
  CanvasCard,
  CanvasPageHeader,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTheme,
} from "@drts/ui-web";

type FlagTableRow = FeatureFlag & {
  rowId: string;
  scopeLabel: string;
  isTenantOverride: boolean;
  updatedBy: string;
} & Record<string, unknown>;

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const bodyStyle = {
  padding: 24,
} satisfies CSSProperties;

const loadingStateStyle = {
  color: theme.textMuted,
  fontSize: 12.5,
  padding: 24,
} satisfies CSSProperties;

const errorStateStyle = {
  color: theme.danger,
  fontSize: 12.5,
  padding: 24,
} satisfies CSSProperties;

const emptyStateStyle = {
  color: theme.textMuted,
  fontSize: 12.5,
  textAlign: "center",
  padding: "32px 16px",
} satisfies CSSProperties;

const monoTextStyle = {
  color: theme.text,
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
  lineHeight: 1.45,
} satisfies CSSProperties;

const updatedByTextStyle = {
  color: theme.text,
  fontSize: 11.5,
  lineHeight: 1.45,
} satisfies CSSProperties;

const stateCellStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
} satisfies CSSProperties;

function toggleButtonStyle(
  th: CanvasTheme,
  enabled: boolean,
  disabled: boolean,
): CSSProperties {
  return {
    width: 42,
    height: 24,
    borderRadius: 999,
    border: `1px solid ${enabled ? th.accent : th.border}`,
    background: enabled ? th.accent : th.surfaceLo,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: enabled ? "flex-end" : "flex-start",
    padding: 2,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    transition: "all 120ms ease",
    flexShrink: 0,
  };
}

const toggleKnobStyle = {
  width: 18,
  height: 18,
  borderRadius: "50%",
  background: "#ffffff",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.25)",
  flexShrink: 0,
} satisfies CSSProperties;

function buildPlatformNav(locale: string): CanvasShellNavItem[] {
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
    { key: "home", href: "/", label: labels.home, icon: "dashboard" },
    { key: "health", href: "/health", label: labels.health, icon: "health" },
    { divider: labels.tenantGroup },
    {
      key: "tenants",
      href: "/tenants",
      label: labels.tenants,
      icon: "tenants",
    },
    {
      key: "partners",
      href: "/partners",
      label: labels.partners,
      icon: "partners",
    },
    { key: "users", href: "/users", label: labels.users, icon: "users" },
    { divider: labels.fleetGroup },
    { key: "fleet", href: "/fleet", label: labels.fleet, icon: "fleet" },
    {
      key: "switchboard",
      href: "/switchboard",
      label: labels.switchboard,
      icon: "switchboard",
    },
    { divider: labels.pricingGroup },
    {
      key: "pricing",
      href: "/pricing",
      label: labels.pricing,
      icon: "pricing",
    },
    {
      key: "payments",
      href: "/payments",
      label: labels.payments,
      icon: "payments",
    },
    { divider: labels.platformGroup },
    {
      key: "notices",
      href: "/notices",
      label: labels.notices,
      icon: "notices",
    },
    { key: "audit", href: "/audit", label: labels.audit, icon: "audit" },
    {
      key: "flags",
      href: "/feature-flags",
      label: labels.flags,
      icon: "flags",
      matchPaths: ["/feature-flags"],
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      label: labels.adapters,
      icon: "adapters",
    },
  ];
}

function sortFlags(flags: FeatureFlag[]) {
  return [...flags].sort((left, right) => {
    const keyDelta = left.key.localeCompare(right.key);
    if (keyDelta !== 0) {
      return keyDelta;
    }
    return (left.tenantId ?? "").localeCompare(right.tenantId ?? "");
  });
}

function toTableRows(flags: FeatureFlag[], locale: string): FlagTableRow[] {
  const updatedBy =
    locale === "en" ? "Contract not exposed" : "目前 contract 未提供";

  return sortFlags(flags).map((flag) => {
    const isTenantOverride = Boolean(flag.tenantId);

    return {
      ...flag,
      rowId: flag.tenantId ? `${flag.key}::${flag.tenantId}` : flag.key,
      scopeLabel: isTenantOverride ? `tenant/${flag.tenantId}` : "global",
      isTenantOverride,
      updatedBy,
    };
  });
}

export default function FeatureFlagsPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const copy = {
    breadcrumbParent: locale === "en" ? "Platform Layer" : "平台層",
    headerSubtitle: "global / tenant override switch governance",
    loading: t("flags.loading"),
    empty: t("flags.empty"),
    enable: t("flags.enable"),
    disable: t("flags.disable"),
  };

  const loadFlags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const summary: FeatureFlagSummary = await client.getFeatureFlags();
      setFlags(summary.flags ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

  const rows = useMemo(() => toTableRows(flags, locale), [flags, locale]);

  const handleToggle = useCallback(
    async (row: FlagTableRow) => {
      if (row.isTenantOverride) {
        return;
      }

      setUpdating(row.rowId);
      setError(null);
      try {
        await client.updateFeatureFlag(row.key, !row.enabled);
        await loadFlags();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setUpdating(null);
      }
    },
    [client, loadFlags],
  );

  const columns = useMemo<CanvasTableColumn<FlagTableRow>[]>(
    () => [
      {
        h: "KEY",
        k: "key",
        w: 380,
        mono: true,
        r: (row) => <span style={monoTextStyle}>{row.key}</span>,
      },
      {
        h: "SCOPE",
        k: "scopeLabel",
        w: 160,
        mono: true,
        r: (row) => <span style={monoTextStyle}>{row.scopeLabel}</span>,
      },
      {
        h: "STATE",
        w: 80,
        r: (row) => {
          const isDisabled = row.isTenantOverride || updating === row.rowId;

          return (
            <div style={stateCellStyle}>
              <button
                type="button"
                aria-label={`${row.enabled ? copy.disable : copy.enable} ${row.key}`}
                onClick={() => void handleToggle(row)}
                disabled={isDisabled}
                style={toggleButtonStyle(theme, row.enabled, isDisabled)}
              >
                <span style={toggleKnobStyle} />
              </button>
            </div>
          );
        },
      },
      {
        h: "UPDATED BY",
        k: "updatedBy",
        w: 200,
        r: (row) => <span style={updatedByTextStyle}>{row.updatedBy}</span>,
      },
      {
        h: "AT",
        k: "updatedAt",
        w: 180,
        mono: true,
        r: (row) => formatDateTime(row.updatedAt),
      },
    ],
    [copy.disable, copy.enable, handleToggle, updating],
  );

  return (
    <CanvasShell
      theme={theme}
      nav={buildPlatformNav(locale)}
      active="flags"
      brandLabel={t("app.name")}
      brandSubLabel={t("app.sub")}
      breadcrumb={[copy.breadcrumbParent, t("flags.title")]}
      env="production"
      versionLabel="canvas"
      searchPlaceholder={
        locale === "en"
          ? "Search keys or tenant scope…"
          : "搜尋 key 或 tenant scope…"
      }
      avatarLabel={locale === "en" ? "PA" : "平台"}
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title={t("flags.title")}
        subtitle={copy.headerSubtitle}
      />

      <div style={bodyStyle}>
        <CanvasCard theme={theme} padding={0} style={{ overflow: "hidden" }}>
          {loading ? (
            <div style={loadingStateStyle}>{copy.loading}</div>
          ) : error ? (
            <div style={errorStateStyle}>{error}</div>
          ) : rows.length === 0 ? (
            <div style={emptyStateStyle}>{copy.empty}</div>
          ) : (
            <CanvasTable<FlagTableRow>
              theme={theme}
              columns={columns}
              rows={rows}
            />
          )}
        </CanvasCard>
      </div>
    </CanvasShell>
  );
}
