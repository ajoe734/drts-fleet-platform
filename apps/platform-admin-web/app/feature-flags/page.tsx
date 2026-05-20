"use client";

import React, {
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
  type CanvasTone,
} from "@drts/ui-web";

type FlagFilter = "all" | "enabled" | "disabled" | "overrides";

type GroupedFeatureFlag = {
  key: string;
  global: FeatureFlag | null;
  overrides: FeatureFlag[];
  all: FeatureFlag[];
};

type PendingToggle = {
  key: string;
  nextEnabled: boolean;
  overrideCount: number;
};

type FlagTableRow = {
  key: string;
  description: string;
  globalEnabled: boolean | null;
  overrideCount: number;
  overrideTenantIds: string[];
  latestUpdatedAt: string;
} & Record<string, unknown>;

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const pageBodyStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
} satisfies CSSProperties;

const splitGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
} satisfies CSSProperties;

const filterRowStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
} satisfies CSSProperties;

const pillButtonStyle = {
  border: "none",
  background: "transparent",
  padding: 0,
  cursor: "pointer",
} satisfies CSSProperties;

const selectStyle = (th: CanvasTheme, mono = false): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontFamily: mono ? th.monoFamily : th.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
});

const loadingStateStyle = {
  color: theme.textMuted,
  fontSize: 12.5,
  padding: "4px 0",
} satisfies CSSProperties;

const emptyStateStyle = {
  color: theme.textMuted,
  fontSize: 12.5,
  textAlign: "center",
  padding: "32px 16px",
} satisfies CSSProperties;

const noteListStyle = {
  margin: 0,
  paddingInlineStart: 18,
  display: "grid",
  gap: 6,
  color: theme.textMuted,
  fontSize: 12.5,
  lineHeight: 1.45,
} satisfies CSSProperties;

const keyCellStyle = {
  display: "grid",
  gap: 4,
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

const secondaryTextStyle = {
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
  whiteSpace: "normal",
} satisfies CSSProperties;

const monoMutedStyle = {
  color: theme.textDim,
  fontFamily: theme.monoFamily,
  fontSize: 11,
} satisfies CSSProperties;

const stateCellStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  minWidth: 0,
} satisfies CSSProperties;

const stateMetaStyle = {
  display: "grid",
  gap: 4,
  minWidth: 0,
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

function groupFeatureFlags(flags: FeatureFlag[]): GroupedFeatureFlag[] {
  const groups = new Map<string, GroupedFeatureFlag>();

  for (const flag of flags) {
    const group: GroupedFeatureFlag = groups.get(flag.key) ?? {
      key: flag.key,
      global: null,
      overrides: [],
      all: [],
    };

    group.all.push(flag);
    if (flag.tenantId) {
      group.overrides.push(flag);
    } else {
      group.global = flag;
    }

    groups.set(flag.key, group);
  }

  return [...groups.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
}

function getLatestUpdatedAt(group: GroupedFeatureFlag) {
  return [...group.all].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )[0]?.updatedAt;
}

function toFlagTableRow(group: GroupedFeatureFlag): FlagTableRow {
  const effectiveRecord = group.global ?? group.overrides[0] ?? null;

  return {
    key: group.key,
    description: effectiveRecord?.description || "—",
    globalEnabled: group.global?.enabled ?? null,
    overrideCount: group.overrides.length,
    overrideTenantIds: group.overrides
      .map((flag) => flag.tenantId)
      .filter((value): value is string => Boolean(value)),
    latestUpdatedAt:
      getLatestUpdatedAt(group) ?? effectiveRecord?.updatedAt ?? "",
  };
}

function filterTone(filter: FlagFilter, active: boolean): CanvasTone {
  if (active) return "accent";
  if (filter === "enabled") return "success";
  if (filter === "overrides") return "warn";
  return "neutral";
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
  const [filter, setFilter] = useState<FlagFilter>("all");
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

  const groupedFlags = useMemo(() => groupFeatureFlags(flags), [flags]);
  const selectedTenant =
    tenants.find((tenant) => tenant.id === selectedTenantId) ?? null;

  const enabledGlobalCount = groupedFlags.filter(
    (group) => group.global?.enabled,
  ).length;
  const disabledGlobalCount = groupedFlags.filter(
    (group) => group.global && !group.global.enabled,
  ).length;
  const overrideGroupCount = groupedFlags.filter(
    (group) => group.overrides.length > 0,
  ).length;
  const overrideRowCount = groupedFlags.reduce(
    (count, group) => count + group.overrides.length,
    0,
  );

  const filteredGroups = useMemo(
    () =>
      groupedFlags.filter((group) => {
        switch (filter) {
          case "enabled":
            return group.global?.enabled === true;
          case "disabled":
            return group.global?.enabled === false;
          case "overrides":
            return group.overrides.length > 0;
          case "all":
          default:
            return true;
        }
      }),
    [filter, groupedFlags],
  );

  const rows = useMemo(
    () => filteredGroups.map(toFlagTableRow),
    [filteredGroups],
  );

  const copy =
    locale === "en"
      ? {
          pageTitle: t("flags.title"),
          pageSubtitle:
            "Feature flags stay editable at the platform default layer while tenant overrides remain visible for blast-radius review.",
          breadcrumbParent: "Platform Layer",
          refresh: t("common.refresh"),
          refreshing: "Refreshing…",
          guardrailTitle:
            "Only the platform default is mutable in this surface.",
          guardrailBody:
            "Tenant override rows stay read-only here. Use this registry to inspect scope and existing exceptions before changing the default toggle state.",
          scopeField: "Tenant scope",
          scopeHint:
            "Choose a tenant to inspect its override rows beside platform defaults.",
          scopeLoading: "Loading tenant list…",
          scopeDefault: "Platform defaults only",
          summaryTitle: "Review context",
          summarySubtitle:
            "Canvas parity keeps the flags view focused on key, scope, state, and recency.",
          selectedScope: "Scope",
          selectedScopeValue: selectedTenant
            ? `${selectedTenant.name} (${selectedTenant.code})`
            : "Platform defaults only",
          notesLabel: "Contract notes",
          notesValue: `${notes.length} note(s)`,
          updatedByLabel: "Updated by",
          updatedByValue: "Not exposed by current contract",
          toggleStateLabel: "State",
          toggleStateValue: "Global default only",
          tableTitle: "Flag registry",
          tableSubtitle:
            "KEY, SCOPE, STATE, UPDATED BY, and AT stay aligned with the canvas handoff while preserving current data sources.",
          overrideTitle: "Override visibility",
          overrideBody:
            "When a key has tenant overrides, they remain visible in the scope cell and in the summary notes but cannot be edited here.",
          confirmTitle: "Confirm platform default toggle",
          confirmBody:
            "This changes the platform-issued default for the selected key. Existing tenant overrides remain intact.",
          stageEnable: "Stage enable",
          stageDisable: "Stage disable",
          noGlobal: "No global record",
          noGlobalBody:
            "This key currently exists only through tenant overrides, so there is no editable platform default here.",
          noDescription: "No description provided",
          empty: t("flags.empty"),
          loading: t("flags.loading"),
        }
      : {
          pageTitle: t("flags.title"),
          pageSubtitle:
            "平台預設層仍可編輯功能旗標，tenant override 維持可見但唯讀，方便先評估 blast radius。",
          breadcrumbParent: "平台層",
          refresh: t("common.refresh"),
          refreshing: "重新整理中…",
          guardrailTitle: "這個頁面只允許變更平台預設值。",
          guardrailBody:
            "Tenant override 在這裡只保留可見性，不提供編輯。先看清 scope 與既有例外，再決定是否切換全域狀態。",
          scopeField: "Tenant scope",
          scopeHint:
            "選擇 tenant 後，會把該 tenant 的 override 與平台預設一起載入。",
          scopeLoading: "載入 tenant 清單中…",
          scopeDefault: "只看平台預設",
          summaryTitle: "檢視上下文",
          summarySubtitle:
            "這個 canvas 版面聚焦在 key、scope、state 與更新時間，不改動目前資料來源。",
          selectedScope: "檢視範圍",
          selectedScopeValue: selectedTenant
            ? `${selectedTenant.name} (${selectedTenant.code})`
            : "只看平台預設",
          notesLabel: "Contract 備註",
          notesValue: `${notes.length} 筆`,
          updatedByLabel: "Updated by",
          updatedByValue: "目前 contract 未提供",
          toggleStateLabel: "State",
          toggleStateValue: "僅限平台預設",
          tableTitle: "Flag registry",
          tableSubtitle:
            "依 canvas handoff 對齊 KEY、SCOPE、STATE、UPDATED BY、AT，同時保留現有資料 contract。",
          overrideTitle: "Override 可視範圍",
          overrideBody:
            "若某個 key 有 tenant override，會在 scope 欄與摘要資訊中呈現，但此頁面不提供修改。",
          confirmTitle: "確認切換平台預設狀態",
          confirmBody:
            "這會變更所選 key 的平台預設值；既有 tenant override 會保留不變。",
          stageEnable: "準備啟用",
          stageDisable: "準備停用",
          noGlobal: "沒有 global record",
          noGlobalBody:
            "這個 key 目前只透過 tenant override 出現，所以這裡沒有可編輯的平台預設值。",
          noDescription: "尚未提供描述",
          empty: t("flags.empty"),
          loading: t("flags.loading"),
        };

  const filters = [
    {
      value: "all" as const,
      label: t("common.all"),
      count: groupedFlags.length,
    },
    {
      value: "enabled" as const,
      label: t("common.enabled"),
      count: enabledGlobalCount,
    },
    {
      value: "disabled" as const,
      label: t("common.disabled"),
      count: disabledGlobalCount,
    },
    {
      value: "overrides" as const,
      label: locale === "en" ? "Overrides" : "含 override",
      count: overrideGroupCount,
    },
  ];

  const columns: CanvasTableColumn<FlagTableRow>[] = [
    {
      h: t("flags.col.flag"),
      w: 270,
      r: (row) => (
        <div style={keyCellStyle}>
          <code style={codeStyle}>{row.key}</code>
          <div style={secondaryTextStyle}>
            {row.description === "—" ? copy.noDescription : row.description}
          </div>
        </div>
      ),
    },
    {
      h: t("flags.col.tenantOverride"),
      w: 220,
      r: (row) => (
        <div style={keyCellStyle}>
          <div>
            <CanvasPill
              theme={theme}
              tone={row.overrideCount > 0 ? "warn" : "neutral"}
            >
              {row.overrideCount > 0
                ? `${row.overrideCount} ${locale === "en" ? "override(s)" : "筆 override"}`
                : t("flags.global")}
            </CanvasPill>
          </div>
          <div style={secondaryTextStyle}>
            {row.overrideCount > 0
              ? row.overrideTenantIds.slice(0, 3).join(", ")
              : locale === "en"
                ? "Platform default record"
                : "平台預設紀錄"}
          </div>
          {row.overrideCount > 3 ? (
            <div style={monoMutedStyle}>
              {locale === "en"
                ? `+${row.overrideCount - 3} more`
                : `另有 ${row.overrideCount - 3} 筆`}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      h: t("flags.col.status"),
      w: 220,
      r: (row) => (
        <div style={stateCellStyle}>
          <div style={stateMetaStyle}>
            {row.globalEnabled === null ? (
              <>
                <CanvasPill theme={theme} tone="warn">
                  {copy.noGlobal}
                </CanvasPill>
                <span style={secondaryTextStyle}>{copy.noGlobalBody}</span>
              </>
            ) : (
              <>
                <CanvasPill
                  theme={theme}
                  tone={row.globalEnabled ? "success" : "neutral"}
                  dot
                >
                  {row.globalEnabled
                    ? t("common.enabled")
                    : t("common.disabled")}
                </CanvasPill>
                <span style={secondaryTextStyle}>
                  {row.globalEnabled ? copy.stageDisable : copy.stageEnable}
                </span>
              </>
            )}
          </div>
          {row.globalEnabled !== null ? (
            <button
              type="button"
              aria-label={`${row.globalEnabled ? copy.stageDisable : copy.stageEnable} ${row.key}`}
              onClick={() =>
                setPendingToggle({
                  key: row.key,
                  nextEnabled: !row.globalEnabled,
                  overrideCount: row.overrideCount,
                })
              }
              disabled={updating === row.key}
              style={toggleButtonStyle(
                theme,
                row.globalEnabled,
                updating === row.key,
              )}
            >
              <span style={toggleKnobStyle} />
            </button>
          ) : null}
        </div>
      ),
    },
    {
      h: locale === "en" ? "Updated by" : "更新來源",
      w: 160,
      r: (row) => (
        <div style={keyCellStyle}>
          <span style={secondaryTextStyle}>{copy.updatedByValue}</span>
          <span style={monoMutedStyle}>
            {row.overrideCount > 0
              ? locale === "en"
                ? "Override visibility retained"
                : "保留 override 可見性"
              : locale === "en"
                ? "Platform default only"
                : "僅平台預設"}
          </span>
        </div>
      ),
    },
    {
      h: t("flags.col.updated"),
      w: 160,
      mono: true,
      r: (row) => formatDateTime(row.latestUpdatedAt),
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
      breadcrumb={[copy.breadcrumbParent, copy.pageTitle]}
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
        title={copy.pageTitle}
        subtitle={copy.pageSubtitle}
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

      <div style={pageBodyStyle}>
        {loading && flags.length === 0 ? (
          <CanvasCard
            theme={theme}
            title={copy.pageTitle}
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
                          ? copy.stageEnable
                          : copy.stageDisable}
                    </CanvasBtn>
                  </>
                }
              />
            ) : null}

            <div style={kpiGridStyle}>
              <CanvasKPI
                theme={theme}
                label={locale === "en" ? "Flag groups" : "Flag 群組"}
                value={groupedFlags.length}
                sub={copy.overrideTitle}
              />
              <CanvasKPI
                theme={theme}
                label={t("common.enabled")}
                value={enabledGlobalCount}
                delta={`${disabledGlobalCount} ${locale === "en" ? "disabled" : "停用"}`}
                deltaTone={enabledGlobalCount > 0 ? "up" : "neutral"}
                sub={copy.toggleStateValue}
              />
              <CanvasKPI
                theme={theme}
                label={
                  locale === "en" ? "Keys with overrides" : "含 override 的 key"
                }
                value={overrideGroupCount}
                delta={`${overrideRowCount} ${locale === "en" ? "rows" : "筆"}`}
                deltaTone={overrideGroupCount > 0 ? "neutral" : "up"}
                sub={copy.overrideBody}
              />
              <CanvasKPI
                theme={theme}
                label={copy.notesLabel}
                value={notes.length}
                sub={copy.updatedByValue}
                hint={
                  selectedTenant?.code ??
                  (locale === "en" ? "global" : "global")
                }
              />
            </div>

            <div style={splitGridStyle}>
              <CanvasCard
                theme={theme}
                title={copy.summaryTitle}
                subtitle={copy.summarySubtitle}
              >
                <CanvasField theme={theme} label={copy.scopeField}>
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

                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      label: copy.selectedScope,
                      value: tenantLoading
                        ? copy.scopeLoading
                        : copy.selectedScopeValue,
                    },
                    {
                      label: copy.toggleStateLabel,
                      value: copy.toggleStateValue,
                    },
                    {
                      label: copy.updatedByLabel,
                      value: copy.updatedByValue,
                    },
                    {
                      label: copy.notesLabel,
                      value: copy.notesValue,
                    },
                  ]}
                />
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={copy.notesLabel}
                subtitle={copy.overrideTitle}
              >
                {notes.length > 0 ? (
                  <ul style={noteListStyle}>
                    {notes.map((note, index) => (
                      <li key={`${note}-${index}`}>{note}</li>
                    ))}
                  </ul>
                ) : (
                  <div style={secondaryTextStyle}>{copy.overrideBody}</div>
                )}
              </CanvasCard>
            </div>

            <CanvasCard
              theme={theme}
              title={copy.tableTitle}
              subtitle={copy.tableSubtitle}
              actions={
                <div style={filterRowStyle}>
                  {filters.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setFilter(item.value)}
                      style={pillButtonStyle}
                    >
                      <CanvasPill
                        theme={theme}
                        tone={filterTone(item.value, filter === item.value)}
                        dot={filter === item.value}
                      >
                        {item.label} ({item.count})
                      </CanvasPill>
                    </button>
                  ))}
                </div>
              }
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
