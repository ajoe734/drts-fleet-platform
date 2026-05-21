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

type GroupedFeatureFlag = {
  key: string;
  global: FeatureFlag | null;
  overrides: FeatureFlag[];
  all: FeatureFlag[];
};

type PendingToggle = {
  key: string;
  nextEnabled: boolean;
};

type FlagTableRow = {
  key: string;
  description: string;
  globalEnabled: boolean | null;
  overrideCount: number;
  overrideTenantIds: string[];
  latestUpdatedAt: string;
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

const fieldHintStyle = {
  marginTop: 6,
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
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
  whiteSpace: "normal",
} satisfies CSSProperties;

const inlinePillRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
} satisfies CSSProperties;

const stateCellStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  minWidth: 0,
} satisfies CSSProperties;

const stateMetaStyle = {
  display: "grid",
  gap: 4,
  minWidth: 0,
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
    updatedBy: "Contract not exposed",
  };
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

  const groupedFlags = useMemo(() => groupFeatureFlags(flags), [flags]);
  const rows = useMemo(() => groupedFlags.map(toFlagTableRow), [groupedFlags]);
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
  const missingGlobalCount = groupedFlags.filter(
    (group) => !group.global,
  ).length;

  const copy =
    locale === "en"
      ? {
          pageTitle: t("flags.title"),
          pageSubtitle: t("flags.subtitle", {
            total: groupedFlags.length,
            enabled: enabledGlobalCount,
          }),
          breadcrumbParent: "Platform Layer",
          refresh: t("common.refresh"),
          refreshing: "Refreshing…",
          guardrailTitle:
            "Only the platform default is mutable in this surface.",
          guardrailBody:
            "Tenant override rows stay visible for blast-radius review, but changes here only affect the global default toggle.",
          scopeCardTitle: "Flag scope",
          scopeCardSubtitle:
            "The canvas handoff stays focused on key, scope, state, updater, and recency.",
          scopeField: "Tenant scope",
          scopeHint:
            "Choose a tenant to inspect its override rows beside the platform default record.",
          scopeLoading: "Loading tenant list…",
          scopeDefault: "Platform defaults only",
          scopeSummary: "Current scope",
          scopeSummaryValue: selectedTenant
            ? `${selectedTenant.name} (${selectedTenant.code})`
            : "Platform defaults only",
          notesTitle: "Contract notes",
          notesFallback:
            "Current API notes remain visible here without changing the underlying fetch contract.",
          notesValue: `${notes.length} note(s)`,
          updatedByLabel: "Updated by",
          updatedByValue: "Contract not exposed",
          stateLabel: "Mutable state",
          stateValue: "Global default only",
          noGlobal: "No global record",
          noGlobalBody:
            "This key currently exists only through tenant overrides, so the platform default cannot be toggled here.",
          confirmTitle: "Confirm platform default toggle",
          confirmBody:
            "This changes the platform-issued default for the selected key. Existing tenant overrides remain intact.",
          stageEnable: "Stage enable",
          stageDisable: "Stage disable",
          tableTitle: "Feature flag registry",
          tableSubtitle:
            "KEY, SCOPE, STATE, UPDATED BY, and AT align to the PA_Flags handoff while preserving current data sources.",
          colScope: "Scope",
          colUpdatedBy: "Updated by",
          platformDefault: "Platform default",
          overridesLabel: "override(s)",
          noDescription: "No description provided",
          overrideVisible: "Override visibility retained",
          globalOnly: "Platform default only",
          empty: t("flags.empty"),
          loading: t("flags.loading"),
        }
      : {
          pageTitle: t("flags.title"),
          pageSubtitle: t("flags.subtitle", {
            total: groupedFlags.length,
            enabled: enabledGlobalCount,
          }),
          breadcrumbParent: "平台層",
          refresh: t("common.refresh"),
          refreshing: "重新整理中…",
          guardrailTitle: "這個頁面只允許變更平台預設值。",
          guardrailBody:
            "Tenant override 只保留可見性，方便先看清 blast radius；這裡的切換只會影響全域預設 toggle。",
          scopeCardTitle: "旗標範圍",
          scopeCardSubtitle:
            "畫布 handoff 聚焦在 key、scope、state、updated by 與時間，不改動既有資料來源。",
          scopeField: "Tenant scope",
          scopeHint:
            "選擇 tenant 後，會把該 tenant 的 override 與平台預設一起載入。",
          scopeLoading: "載入 tenant 清單中…",
          scopeDefault: "只看平台預設",
          scopeSummary: "目前檢視範圍",
          scopeSummaryValue: selectedTenant
            ? `${selectedTenant.name} (${selectedTenant.code})`
            : "只看平台預設",
          notesTitle: "Contract 備註",
          notesFallback:
            "保留目前 API notes，可檢視但不變更既有 fetch contract。",
          notesValue: `${notes.length} 筆`,
          updatedByLabel: "Updated by",
          updatedByValue: "目前 contract 未提供",
          stateLabel: "可變更狀態",
          stateValue: "僅限平台預設",
          noGlobal: "沒有 global record",
          noGlobalBody:
            "這個 key 目前只透過 tenant override 出現，所以這裡不能切換平台預設狀態。",
          confirmTitle: "確認切換平台預設狀態",
          confirmBody:
            "這會變更所選 key 的平台預設值；既有 tenant override 會保留不變。",
          stageEnable: "準備啟用",
          stageDisable: "準備停用",
          tableTitle: "Feature flag registry",
          tableSubtitle:
            "依 PA_Flags handoff 對齊 KEY、SCOPE、STATE、UPDATED BY、AT，同時保留現有資料 contract。",
          colScope: "範圍",
          colUpdatedBy: "Updated by",
          platformDefault: "平台預設",
          overridesLabel: "筆 override",
          noDescription: "尚未提供描述",
          overrideVisible: "保留 override 可見性",
          globalOnly: "僅平台預設",
          empty: t("flags.empty"),
          loading: t("flags.loading"),
        };

  const columns: CanvasTableColumn<FlagTableRow>[] = [
    {
      h: t("flags.col.flag"),
      w: 280,
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
      h: copy.colScope,
      w: 220,
      r: (row) => (
        <div style={keyCellStyle}>
          <div style={inlinePillRowStyle}>
            <CanvasPill theme={theme} tone="neutral">
              {copy.platformDefault}
            </CanvasPill>
            {row.overrideCount > 0 ? (
              <CanvasPill theme={theme} tone="warn">
                {row.overrideCount} {copy.overridesLabel}
              </CanvasPill>
            ) : null}
          </div>
          <div style={secondaryTextStyle}>
            {row.overrideCount > 0
              ? row.overrideTenantIds.join(", ")
              : copy.globalOnly}
          </div>
        </div>
      ),
    },
    {
      h: t("flags.col.status"),
      w: 230,
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
      h: copy.colUpdatedBy,
      w: 170,
      r: (row) => (
        <div style={keyCellStyle}>
          <span style={secondaryTextStyle}>
            {locale === "en" ? row.updatedBy : copy.updatedByValue}
          </span>
          <span style={monoMutedStyle}>
            {row.overrideCount > 0 ? copy.overrideVisible : copy.globalOnly}
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

      <div style={bodyStyle}>
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
                label={locale === "en" ? "Flag keys" : "Flag keys"}
                value={groupedFlags.length}
                sub={copy.platformDefault}
              />
              <CanvasKPI
                theme={theme}
                label={t("common.enabled")}
                value={enabledGlobalCount}
                delta={`${disabledGlobalCount} ${locale === "en" ? "disabled" : "停用"}`}
                deltaTone={enabledGlobalCount > 0 ? "up" : "neutral"}
                sub={copy.stateValue}
              />
              <CanvasKPI
                theme={theme}
                label={
                  locale === "en" ? "Keys with overrides" : "含 override 的 key"
                }
                value={overrideGroupCount}
                delta={`${missingGlobalCount} ${locale === "en" ? "override-only" : "僅 override"}`}
                deltaTone={overrideGroupCount > 0 ? "neutral" : "up"}
                sub={copy.guardrailTitle}
              />
              <CanvasKPI
                theme={theme}
                label={copy.notesTitle}
                value={notes.length}
                sub={selectedTenant?.code ?? copy.scopeDefault}
                hint={copy.updatedByValue}
              />
            </div>

            <div style={topGridStyle}>
              <CanvasCard
                theme={theme}
                title={copy.scopeCardTitle}
                subtitle={copy.scopeCardSubtitle}
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
                      {
                        label: copy.stateLabel,
                        value: copy.stateValue,
                      },
                      {
                        label: copy.updatedByLabel,
                        value: copy.updatedByValue,
                      },
                      {
                        label: copy.notesTitle,
                        value: copy.notesValue,
                      },
                    ]}
                  />
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={copy.notesTitle}
                subtitle={copy.guardrailTitle}
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
