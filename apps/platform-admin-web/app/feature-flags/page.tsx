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
import { getPlatformLabel } from "@/lib/localized-labels";
import type {
  FeatureFlag,
  FeatureFlagSummary,
  PlatformAdminTenantRecord,
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
  type CanvasTheme,
} from "@drts/ui-web";

type PendingToggle = {
  key: string;
  nextEnabled: boolean;
};

type FlagTableRow = FeatureFlag & {
  scopeLabel: string;
  tenantLabel: string;
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
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
} satisfies CSSProperties;

const topGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
} satisfies CSSProperties;

const loadingStateStyle = {
  color: theme.textMuted,
  fontSize: 12.5,
} satisfies CSSProperties;

const emptyStateStyle = {
  color: theme.textMuted,
  fontSize: 12.5,
  textAlign: "center",
  padding: "32px 16px",
} satisfies CSSProperties;

const secondaryTextStyle = {
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
  whiteSpace: "normal",
} satisfies CSSProperties;

const monoTextStyle = {
  color: theme.text,
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
  lineHeight: 1.45,
} satisfies CSSProperties;

const codeStyle = {
  display: "inline-flex",
  width: "fit-content",
  padding: "2px 7px",
  borderRadius: 6,
  background: theme.surfaceLo,
  border: `1px solid ${theme.border}`,
  color: theme.text,
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
  lineHeight: 1.35,
} satisfies CSSProperties;

const keyCellStyle = {
  display: "grid",
  gap: 4,
} satisfies CSSProperties;

const scopeCellStyle = {
  display: "grid",
  gap: 6,
} satisfies CSSProperties;

const pillRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
} satisfies CSSProperties;

const noteListStyle = {
  margin: 0,
  paddingInlineStart: 18,
  display: "grid",
  gap: 6,
  color: theme.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
} satisfies CSSProperties;

const fieldHintStyle = {
  marginTop: 6,
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
} satisfies CSSProperties;

const stateCellStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  minWidth: 0,
} satisfies CSSProperties;

const selectStyle = (th: CanvasTheme): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontFamily: th.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
});

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

function toTableRows(
  flags: FeatureFlag[],
  tenants: PlatformAdminTenantRecord[],
  locale: string,
): FlagTableRow[] {
  const tenantLookup = new Map(tenants.map((tenant) => [tenant.id, tenant]));

  return sortFlags(flags).map((flag) => {
    const tenant = flag.tenantId ? tenantLookup.get(flag.tenantId) : null;
    const isTenantOverride = Boolean(flag.tenantId);
    const tenantLabel = tenant
      ? `${tenant.name} (${tenant.code})`
      : (flag.tenantId ?? (locale === "en" ? "Platform default" : "平台預設"));

    return {
      ...flag,
      scopeLabel: isTenantOverride
        ? locale === "en"
          ? "Tenant override"
          : "Tenant override"
        : locale === "en"
          ? "Global"
          : "Global",
      tenantLabel,
      isTenantOverride,
      updatedBy:
        locale === "en" ? "Contract not exposed" : "目前 contract 未提供",
    };
  });
}

export default function FeatureFlagsPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [tenants, setTenants] = useState<PlatformAdminTenantRecord[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [loading, setLoading] = useState(true);
  const [tenantLoading, setTenantLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingToggle, setPendingToggle] = useState<PendingToggle | null>(
    null,
  );
  const [updating, setUpdating] = useState<string | null>(null);

  const loadFlags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const summary: FeatureFlagSummary = await client.getFeatureFlags(
        selectedTenantId ? { tenantId: selectedTenantId } : undefined,
      );
      setFlags(summary.flags || []);
      setNotes(summary.notes || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client, selectedTenantId]);

  const loadTenants = useCallback(async () => {
    setTenantLoading(true);
    try {
      const result = await client.listPlatformTenants();
      setTenants(result ?? []);
    } catch (e: unknown) {
      setError(
        (previous) => previous ?? (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setTenantLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  const selectedTenant =
    tenants.find((tenant) => tenant.id === selectedTenantId) ?? null;
  const rows = useMemo(
    () => toTableRows(flags, tenants, locale),
    [flags, locale, tenants],
  );
  const totalCount = rows.length;
  const enabledCount = rows.filter((row) => row.enabled).length;
  const globalCount = rows.filter((row) => !row.isTenantOverride).length;
  const overrideCount = rows.filter((row) => row.isTenantOverride).length;

  const copy =
    locale === "en"
      ? {
          breadcrumbParent: "Platform Layer",
          headerSubtitle: "global / tenant override switch governance",
          refresh: t("common.refresh"),
          refreshing: "Refreshing…",
          loading: t("flags.loading"),
          empty: t("flags.empty"),
          scopeLabel: "Tenant scope",
          scopeHint:
            "Choose a tenant to inspect tenant-targeted rows with the current fetch contract.",
          scopeLoading: "Loading tenant list…",
          scopeDefault: "Platform defaults only",
          scopeSummary: "Current scope",
          scopeSummaryValue: selectedTenant
            ? `${selectedTenant.name} (${selectedTenant.code})`
            : "Platform defaults only",
          toggleTitle: "Global toggles only",
          toggleValue: "Tenant overrides stay read-only here",
          notesTitle: "Contract notes",
          notesFallback:
            "Current API notes remain visible here without changing the fetch contract.",
          guardrailTitle: "Only global defaults are mutable in this surface.",
          guardrailBody:
            "Tenant override rows remain visible for governance review, but toggles here only update platform defaults.",
          confirmTitle: "Confirm global flag change",
          confirmBody:
            "This updates the platform-issued default. Tenant overrides remain unchanged.",
          tableTitle: "Feature flag registry",
          tableSubtitle:
            "KEY, SCOPE, STATE, UPDATED BY, and AT are aligned to the PA_Flags handoff.",
          scopeCol: "Scope",
          updatedByCol: "Updated by",
          atCol: "AT",
          globalScope: "Global",
          tenantScope: "Tenant override",
          tenantPill: "Tenant",
          globalPill: "Global",
          readOnly: "Read-only",
          noDescription: "No description provided",
          stateEnable: "Stage enable",
          stateDisable: "Stage disable",
          updatedByValue: "Contract not exposed",
          kpiRows: "Rows",
          kpiEnabled: "Enabled",
          kpiGlobal: "Global rows",
          kpiOverrides: "Tenant rows",
        }
      : {
          breadcrumbParent: "平台層",
          headerSubtitle: "global / tenant override switch governance",
          refresh: t("common.refresh"),
          refreshing: "重新整理中…",
          loading: t("flags.loading"),
          empty: t("flags.empty"),
          scopeLabel: "Tenant scope",
          scopeHint:
            "選擇 tenant 後，以目前 fetch contract 檢視 tenant 定向 rows。",
          scopeLoading: "載入 tenant 清單中…",
          scopeDefault: "只看平台預設",
          scopeSummary: "目前檢視範圍",
          scopeSummaryValue: selectedTenant
            ? `${selectedTenant.name} (${selectedTenant.code})`
            : "只看平台預設",
          toggleTitle: "只允許切換 global 預設",
          toggleValue: "Tenant override 在這裡維持唯讀",
          notesTitle: "Contract 備註",
          notesFallback:
            "保留目前 API notes，可檢視但不改動既有 fetch contract。",
          guardrailTitle: "這個頁面只允許變更 global 預設值。",
          guardrailBody:
            "Tenant override rows 只保留治理檢視用途；這裡的 toggle 只會更新平台預設。",
          confirmTitle: "確認切換 global 旗標",
          confirmBody: "這會更新平台發佈的預設值；tenant override 會維持不變。",
          tableTitle: "Feature flag registry",
          tableSubtitle:
            "依 PA_Flags handoff 對齊 KEY、SCOPE、STATE、UPDATED BY、AT。",
          scopeCol: "範圍",
          updatedByCol: "Updated by",
          atCol: "AT",
          globalScope: "Global",
          tenantScope: "Tenant override",
          tenantPill: "Tenant",
          globalPill: "Global",
          readOnly: "唯讀",
          noDescription: "尚未提供描述",
          stateEnable: "準備啟用",
          stateDisable: "準備停用",
          updatedByValue: "目前 contract 未提供",
          kpiRows: "Rows",
          kpiEnabled: "Enabled",
          kpiGlobal: "Global rows",
          kpiOverrides: "Tenant rows",
        };

  const columns: CanvasTableColumn<FlagTableRow>[] = [
    {
      h: t("flags.col.flag"),
      w: 360,
      r: (row) => (
        <div style={keyCellStyle}>
          <code style={codeStyle}>{row.key}</code>
          <div style={secondaryTextStyle}>
            {row.description || copy.noDescription}
          </div>
        </div>
      ),
    },
    {
      h: copy.scopeCol,
      w: 180,
      mono: true,
      r: (row) => (
        <div style={scopeCellStyle}>
          <div style={pillRowStyle}>
            <CanvasPill
              theme={theme}
              tone={row.isTenantOverride ? "warn" : "neutral"}
            >
              {row.isTenantOverride ? copy.tenantPill : copy.globalPill}
            </CanvasPill>
          </div>
          <span style={monoTextStyle}>{row.scopeLabel}</span>
          <span style={secondaryTextStyle}>{row.tenantLabel}</span>
        </div>
      ),
    },
    {
      h: t("flags.col.status"),
      w: 128,
      r: (row) => {
        const isReadOnly = row.isTenantOverride || updating === row.key;

        return (
          <div style={stateCellStyle}>
            <CanvasPill
              theme={theme}
              tone={row.enabled ? "success" : "neutral"}
              dot
            >
              {row.enabled ? t("common.enabled") : t("common.disabled")}
            </CanvasPill>
            <button
              type="button"
              aria-label={`${row.enabled ? copy.stateDisable : copy.stateEnable} ${row.key}`}
              onClick={() =>
                !row.isTenantOverride &&
                setPendingToggle({
                  key: row.key,
                  nextEnabled: !row.enabled,
                })
              }
              disabled={isReadOnly}
              style={toggleButtonStyle(theme, row.enabled, isReadOnly)}
            >
              <span style={toggleKnobStyle} />
            </button>
          </div>
        );
      },
    },
    {
      h: copy.updatedByCol,
      w: 180,
      r: (row) => (
        <div style={keyCellStyle}>
          <span style={secondaryTextStyle}>{row.updatedBy}</span>
          <span style={secondaryTextStyle}>
            {row.isTenantOverride ? copy.readOnly : copy.globalScope}
          </span>
        </div>
      ),
    },
    {
      h: copy.atCol,
      w: 180,
      mono: true,
      r: (row) => formatDateTime(row.updatedAt),
    },
  ];

  async function handleConfirmToggle() {
    if (!pendingToggle) return;

    setUpdating(pendingToggle.key);
    setError(null);
    try {
      await client.updateFeatureFlag(
        pendingToggle.key,
        pendingToggle.nextEnabled,
      );
      setPendingToggle(null);
      await loadFlags();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUpdating(null);
    }
  }

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
        actions={
          <CanvasBtn
            theme={theme}
            variant="secondary"
            icon="arrow"
            onClick={() => void loadFlags()}
          >
            {loading && flags.length > 0 ? copy.refreshing : copy.refresh}
          </CanvasBtn>
        }
      />

      <div style={bodyStyle}>
        {loading && flags.length === 0 ? (
          <CanvasCard
            theme={theme}
            title={t("flags.title")}
            subtitle={copy.loading}
          >
            <div style={loadingStateStyle}>{copy.loading}</div>
          </CanvasCard>
        ) : (
          <>
            {error ? (
              <CanvasBanner
                theme={theme}
                tone="danger"
                title={`${getPlatformLabel(locale, "error")}: ${error}`}
                body={copy.guardrailBody}
              />
            ) : null}

            <CanvasBanner
              theme={theme}
              tone="warn"
              icon="flags"
              title={copy.guardrailTitle}
              body={copy.guardrailBody}
            />

            {pendingToggle ? (
              <CanvasBanner
                theme={theme}
                tone={pendingToggle.nextEnabled ? "warn" : "danger"}
                icon="warn"
                title={copy.confirmTitle}
                body={`${copy.confirmBody} ${pendingToggle.key}`}
                actions={
                  <>
                    <CanvasBtn
                      theme={theme}
                      variant="secondary"
                      onClick={() => setPendingToggle(null)}
                      disabled={updating === pendingToggle.key}
                    >
                      {t("common.cancel")}
                    </CanvasBtn>
                    <CanvasBtn
                      theme={theme}
                      variant="primary"
                      onClick={() => void handleConfirmToggle()}
                      disabled={updating === pendingToggle.key}
                    >
                      {updating === pendingToggle.key
                        ? t("common.updating")
                        : pendingToggle.nextEnabled
                          ? copy.stateEnable
                          : copy.stateDisable}
                    </CanvasBtn>
                  </>
                }
              />
            ) : null}

            <div style={kpiGridStyle}>
              <CanvasKPI
                theme={theme}
                label={copy.kpiRows}
                value={totalCount}
                sub={selectedTenant?.code ?? copy.scopeDefault}
              />
              <CanvasKPI
                theme={theme}
                label={copy.kpiEnabled}
                value={enabledCount}
                delta={`${totalCount - enabledCount} ${locale === "en" ? "disabled" : "停用"}`}
                deltaTone={enabledCount > 0 ? "up" : "neutral"}
                sub={copy.toggleTitle}
              />
              <CanvasKPI
                theme={theme}
                label={copy.kpiGlobal}
                value={globalCount}
                delta={`${overrideCount} ${locale === "en" ? "tenant rows" : "tenant rows"}`}
                deltaTone="neutral"
                sub={copy.globalScope}
              />
              <CanvasKPI
                theme={theme}
                label={copy.kpiOverrides}
                value={overrideCount}
                sub={copy.toggleValue}
                hint={copy.updatedByValue}
              />
            </div>

            <div style={topGridStyle}>
              <CanvasCard
                theme={theme}
                title={copy.scopeLabel}
                subtitle={copy.headerSubtitle}
              >
                <CanvasField theme={theme} label={copy.scopeLabel}>
                  <select
                    value={selectedTenantId}
                    onChange={(event) =>
                      setSelectedTenantId(event.target.value)
                    }
                    disabled={tenantLoading}
                    style={selectStyle(theme)}
                  >
                    <option value="">{copy.scopeDefault}</option>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name} ({tenant.code})
                      </option>
                    ))}
                  </select>
                </CanvasField>
                <div style={fieldHintStyle}>
                  {tenantLoading ? copy.scopeLoading : copy.scopeHint}
                </div>
                <div style={{ marginTop: 16 }}>
                  <CanvasDL
                    theme={theme}
                    cols={2}
                    items={[
                      {
                        label: copy.scopeSummary,
                        value: copy.scopeSummaryValue,
                      },
                      { label: copy.toggleTitle, value: copy.toggleValue },
                      { label: copy.notesTitle, value: `${notes.length}` },
                      { label: copy.updatedByCol, value: copy.updatedByValue },
                    ]}
                  />
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={copy.notesTitle}
                subtitle={copy.tableSubtitle}
              >
                {notes.length > 0 ? (
                  <ul style={noteListStyle}>
                    {notes.map((note, index) => (
                      <li key={`${note}-${index}`}>{note}</li>
                    ))}
                  </ul>
                ) : (
                  <div style={secondaryTextStyle}>{copy.notesFallback}</div>
                )}
              </CanvasCard>
            </div>

            <CanvasCard
              theme={theme}
              title={copy.tableTitle}
              subtitle={copy.tableSubtitle}
              padding={0}
              style={{ overflow: "hidden" }}
            >
              {rows.length === 0 ? (
                <div style={emptyStateStyle}>{copy.empty}</div>
              ) : (
                <CanvasTable<FlagTableRow>
                  theme={theme}
                  columns={columns}
                  rows={rows}
                />
              )}
            </CanvasCard>
          </>
        )}
      </div>
    </CanvasShell>
  );
}
