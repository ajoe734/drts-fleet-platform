"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import {
  formatPlatformUiError,
  toPlatformErrorMessage,
} from "@/lib/error-copy";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";
import type {
  FeatureFlag,
  FeatureFlagSummary,
  PlatformAdminTenantRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTheme,
} from "@drts/ui-web";

type ActionIntent = "toggle" | "override";

type ActionDescriptor = {
  intent: ActionIntent | "history";
  riskLevel: "low" | "high";
  requiresReason: boolean;
};

type ToggleDraft = {
  intent: "toggle";
  key: string;
  tenantId: string | null;
  description: string;
  currentEnabled: boolean;
  nextEnabled: boolean;
  scopeLabel: string;
};

type OverrideDraft = {
  intent: "override";
  key: string;
  tenantId: string;
  description: string;
  enabled: boolean;
};

type PendingAction = ToggleDraft | OverrideDraft;

type AuditReceipt = {
  id: string;
  intent: ActionIntent;
  key: string;
  scopeLabel: string;
  reason: string;
  requestedAt: string;
  summary: string;
};

type FlagTableRow = {
  key: string;
  description: string;
  enabled: boolean;
  tenantId: string | null;
  scopeLabel: string;
  scopeTone: "accent" | "neutral";
  rolloutLabel: "mid_rollout" | "rolled_out" | "deprecated";
  rolloutTone: "warn" | "success" | "danger";
  updatedAt: string;
  updatedBy: string;
} & Record<string, unknown>;

type RolloutFilter =
  | "all"
  | "mid_rollout"
  | "rolled_out"
  | "deprecated"
  | "tenant_overrides";

type RolloutFilterOption = {
  value: RolloutFilter;
  label: string;
  count: number;
};

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const actionDescriptors: Record<ActionDescriptor["intent"], ActionDescriptor> =
  {
    toggle: {
      intent: "toggle",
      riskLevel: "high",
      requiresReason: true,
    },
    override: {
      intent: "override",
      riskLevel: "high",
      requiresReason: true,
    },
    history: {
      intent: "history",
      riskLevel: "low",
      requiresReason: false,
    },
  };

const bodyStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const toolbarStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "minmax(220px, 320px) minmax(0, 1fr)",
  alignItems: "end",
} satisfies CSSProperties;

const utilityBarStyle = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
} satisfies CSSProperties;

const filterRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
} satisfies CSSProperties;

const tableHeaderStackStyle = {
  display: "grid",
  gap: 12,
  marginBottom: 16,
} satisfies CSSProperties;

const filterButtonStyle = {
  appearance: "none",
  border: 0,
  padding: 0,
  margin: 0,
  background: "transparent",
  cursor: "pointer",
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

const secondaryPanelStyle = {
  display: "grid",
  gap: 12,
} satisfies CSSProperties;

const sectionStackStyle = {
  display: "grid",
  gap: 16,
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

const textareaStyle = (th: CanvasTheme): CSSProperties => ({
  width: "100%",
  minHeight: 108,
  boxSizing: "border-box",
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontFamily: th.fontFamily,
  fontSize: 12.5,
  lineHeight: 1.5,
  padding: "10px 12px",
  resize: "vertical",
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

const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
} satisfies CSSProperties;

const detailsStyle = {
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
  padding: "10px 12px",
} satisfies CSSProperties;

const detailSummaryStyle = {
  cursor: "pointer",
  color: theme.text,
  fontSize: 12.5,
  fontWeight: 600,
  listStyle: "none",
} satisfies CSSProperties;

const noteListStyle = {
  margin: "10px 0 0",
  paddingInlineStart: 18,
  display: "grid",
  gap: 6,
  color: theme.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
} satisfies CSSProperties;

const receiptListStyle = {
  display: "grid",
  gap: 10,
  marginTop: 10,
} satisfies CSSProperties;

const receiptCardStyle = {
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  padding: "10px 12px",
  display: "grid",
  gap: 6,
} satisfies CSSProperties;

const composerSummaryStyle = {
  display: "grid",
  gap: 6,
} satisfies CSSProperties;

const composerLeadStyle = {
  display: "grid",
  gap: 4,
} satisfies CSSProperties;

const secondarySectionStyle = {
  display: "grid",
  gap: 12,
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

function toFlagTableRow(flag: FeatureFlag, locale: Locale): FlagTableRow {
  const isTenantOverride = Boolean(flag.tenantId);
  const deprecated = isDeprecatedFlag(flag);
  const rolloutLabel = deprecated
    ? "deprecated"
    : isTenantOverride
      ? "mid_rollout"
      : flag.enabled
        ? "rolled_out"
        : "mid_rollout";

  return {
    key: flag.key,
    description: flag.description || "—",
    enabled: flag.enabled,
    tenantId: flag.tenantId ?? null,
    scopeLabel: isTenantOverride
      ? locale === "en"
        ? `Tenant override · ${flag.tenantId}`
        : `租戶覆寫 · ${flag.tenantId}`
      : locale === "en"
        ? "Platform default"
        : "平台預設",
    scopeTone: isTenantOverride ? "accent" : "neutral",
    rolloutLabel,
    rolloutTone:
      rolloutLabel === "deprecated"
        ? "danger"
        : rolloutLabel === "rolled_out"
          ? "success"
          : "warn",
    updatedAt: flag.updatedAt,
    updatedBy: locale === "en" ? "Contract not exposed" : "合約尚未提供",
  };
}

function sortFlags(left: FeatureFlag, right: FeatureFlag) {
  const keyOrder = left.key.localeCompare(right.key);
  if (keyOrder !== 0) {
    return keyOrder;
  }

  return (left.tenantId ?? "").localeCompare(right.tenantId ?? "");
}

function isDeprecatedFlag(flag: FeatureFlag) {
  const content = `${flag.key} ${flag.description}`.toLowerCase();
  return (
    content.includes("deprecated") ||
    content.includes("legacy") ||
    content.includes("sunset")
  );
}

export default function FeatureFlagsPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [tenants, setTenants] = useState<PlatformAdminTenantRecord[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [rolloutFilter, setRolloutFilter] = useState<RolloutFilter>("all");
  const [loading, setLoading] = useState(true);
  const [tenantLoading, setTenantLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [actionReason, setActionReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [auditReceipts, setAuditReceipts] = useState<AuditReceipt[]>([]);
  const [historyKey, setHistoryKey] = useState<string | null>(null);

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
      setError(
        formatPlatformUiError(
          locale,
          toPlatformErrorMessage(e),
          locale === "en" ? "Unable to load feature flags" : "無法載入功能旗標",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [client, locale, selectedTenantId]);

  const loadTenants = useCallback(async () => {
    setTenantLoading(true);
    try {
      const result = await client.listPlatformTenants();
      setTenants(result ?? []);
    } catch (e: unknown) {
      setError(
        (previous) =>
          previous ??
          formatPlatformUiError(
            locale,
            toPlatformErrorMessage(e),
            locale === "en" ? "Unable to load tenants" : "無法載入租戶清單",
          ),
      );
    } finally {
      setTenantLoading(false);
    }
  }, [client, locale]);

  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  const rows = useMemo(
    () =>
      [...flags].sort(sortFlags).map((flag) => toFlagTableRow(flag, locale)),
    [flags, locale],
  );
  const rolloutStateByKey = useMemo(() => {
    const grouped = new Map<
      string,
      {
        enabledStates: Set<boolean>;
        hasTenantOverride: boolean;
        deprecated: boolean;
      }
    >();

    for (const flag of flags) {
      const current = grouped.get(flag.key) ?? {
        enabledStates: new Set<boolean>(),
        hasTenantOverride: false,
        deprecated: false,
      };
      current.enabledStates.add(flag.enabled);
      current.hasTenantOverride ||= Boolean(flag.tenantId);
      current.deprecated ||= isDeprecatedFlag(flag);
      grouped.set(flag.key, current);
    }

    return grouped;
  }, [flags]);
  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery = !query || row.key.toLowerCase().includes(query);
      if (!matchesQuery) {
        return false;
      }

      const rolloutState = rolloutStateByKey.get(row.key);
      const isMidRollout =
        Boolean(rolloutState?.hasTenantOverride) ||
        (rolloutState?.enabledStates.size ?? 0) > 1;
      const isDeprecated = Boolean(rolloutState?.deprecated);
      const isRolledOut = row.enabled && !isMidRollout && !isDeprecated;

      switch (rolloutFilter) {
        case "mid_rollout":
          return isMidRollout;
        case "rolled_out":
          return isRolledOut;
        case "deprecated":
          return isDeprecated;
        case "tenant_overrides":
          return Boolean(row.tenantId);
        case "all":
        default:
          return true;
      }
    });
  }, [rolloutFilter, rolloutStateByKey, rows, searchTerm]);
  const selectedTenant =
    tenants.find((tenant) => tenant.id === selectedTenantId) ?? null;
  const overrideCount = rows.filter((row) => row.tenantId).length;
  const platformDefaultCount = rows.filter((row) => !row.tenantId).length;
  const enabledCount = filteredRows.filter((row) => row.enabled).length;
  const disabledCount = filteredRows.length - enabledCount;
  const midRolloutCount = rows.filter((row) => {
    const rolloutState = rolloutStateByKey.get(row.key);
    return (
      Boolean(rolloutState?.hasTenantOverride) ||
      (rolloutState?.enabledStates.size ?? 0) > 1
    );
  }).length;
  const rolledOutCount = rows.filter((row) => {
    const rolloutState = rolloutStateByKey.get(row.key);
    const isMidRollout =
      Boolean(rolloutState?.hasTenantOverride) ||
      (rolloutState?.enabledStates.size ?? 0) > 1;
    return row.enabled && !isMidRollout && !rolloutState?.deprecated;
  }).length;
  const deprecatedCount = rows.filter((row) =>
    Boolean(rolloutStateByKey.get(row.key)?.deprecated),
  ).length;
  const sortedFlagKeys = useMemo(
    () =>
      Array.from(new Set(flags.map((flag) => flag.key))).sort((left, right) =>
        left.localeCompare(right),
      ),
    [flags],
  );
  const visibleAuditReceipts = useMemo(
    () =>
      historyKey
        ? auditReceipts.filter((receipt) => receipt.key === historyKey)
        : auditReceipts,
    [auditReceipts, historyKey],
  );
  const copy =
    locale === "en"
      ? {
          pageTitle: "Feature Flags · WRITE authority",
          pageSubtitle:
            "Writable only here. Ops, tenant, and driver surfaces stay on read-only GET feature flag views.",
          metaPill: "writable only here",
          filterAll: "All",
          filterTenantOverrides: "Tenant overrides",
          refresh: t("common.refresh"),
          refreshing: "Refreshing...",
          addOverride: "Add tenant override",
          addOverrideHint: "Select a tenant scope first to create an override.",
          riskTitle: "High-risk actions require an explicit reason.",
          riskBody:
            "Toggle and tenant override changes stay in this write lane and record a local audit receipt after confirmation.",
          scopeField: "Inspect scope",
          searchField: "Search key",
          searchPlaceholder: "Search by flag key",
          scopeHint:
            "Switch to a tenant to inspect its effective override rows. Default view stays on platform records.",
          scopeDefault: "Platform defaults",
          scopeLoading: "Loading tenant list...",
          currentScope: selectedTenant
            ? `${selectedTenant.name} (${selectedTenant.code})`
            : "Platform defaults",
          summaryPlatformDefault: "Platform defaults",
          summaryTenantOverride: "Tenant overrides",
          tableTitle: "Feature flag registry",
          tableSubtitle:
            "KEY, SCOPE, STATE TOGGLE, UPDATED BY, AT, and ACTIONS stay in the assigned table-first body.",
          filterLabel: "Rollout state",
          filterPill: "table-first layout",
          rolloutMid: "Mid-rollout",
          rolloutFull: "Rolled out",
          rolloutDeprecated: "Deprecated",
          keyHeader: "Key",
          scopeHeader: "Scope",
          stateHeader: "State",
          updatedByHeader: "Updated by",
          updatedAtHeader: "At",
          actionsHeader: "Actions",
          noDescription: "No description provided",
          updatedByValue: "Contract not exposed",
          toggle: "Toggle",
          removeOverride: "Remove override",
          history: "History",
          confirmToggleTitle: "Confirm feature flag toggle",
          confirmToggleBody:
            "This will change the effective feature flag state shown in the current scope.",
          confirmOverrideTitle: "Create tenant override",
          confirmOverrideBody:
            "This writes a tenant-specific override for the selected key and leaves other scopes unchanged.",
          confirmRemoveOverrideTitle: "Remove tenant override",
          confirmRemoveOverrideBody:
            "This removes the tenant-specific override and reverts the tenant back to the platform default.",
          reasonLabel: "High-risk reason",
          reasonPlaceholder:
            "Describe the rollout reason, expected blast radius, and validation plan.",
          reasonRequired:
            "A high-risk reason is required before this action can run.",
          overrideTenantField: "Tenant",
          overrideKeyField: "Flag key",
          overrideStateField: "Override state",
          overrideDescriptionField: "Override description",
          overrideDescriptionHint:
            "Optional. Leave blank to keep the existing flag description.",
          enabled: t("common.enabled"),
          disabled: t("common.disabled"),
          cancel: t("common.cancel"),
          confirming: t("common.updating"),
          confirmEnable: "Enable",
          confirmDisable: "Disable",
          confirmCreate: "Create override",
          confirmRemove: "Remove override",
          noFlags: t("flags.empty"),
          loading: t("flags.loading"),
          scopeMeta: "Inspect scope",
          resultMeta: `${filteredRows.length} visible row(s)`,
          enabledMeta: `${enabledCount} enabled`,
          disabledMeta: `${disabledCount} disabled`,
          overrideMeta: `${overrideCount} tenant override row(s)`,
          notesTitle: "Extended notes",
          notesEmpty:
            "No additional contract notes are exposed for the current scope.",
          historyTitle: "Local audit receipts",
          historyEmpty:
            "No local receipts have been recorded in this session yet.",
          historyHint:
            "Use the History row action to focus receipts for a specific key.",
          historyFocusAll:
            "Showing all receipts recorded in this browser session.",
          historyFocusKey: `Focused on ${historyKey ?? "all keys"}`,
          secondaryPanelTitle: "Change control & extended details",
          secondaryPanelSubtitle:
            "High-risk reason capture, notes, and local history stay below the default table-first body.",
          actionComposerTitle: "Pending high-risk change",
          actionComposerIdle:
            "Toggle and override mutations require an explicit reason before confirmation.",
          actionApplied: "Audit receipt recorded",
          noFlagsInFilter:
            "No feature flags match the current rollout filter and search query.",
          laneMeta: "Writable only here",
          notesMeta: "Extended notes stay outside the default body.",
          receiptsMeta: `${auditReceipts.length} local receipt(s)`,
          showAllReceipts: "Show all receipts",
        }
      : {
          pageTitle: "功能旗標 · 可寫入治理",
          pageSubtitle:
            "只有這裡可寫入。營運端、租戶端與司機端其他頁面都維持功能旗標讀取檢視的唯讀模式。",
          metaPill: "僅此處可寫入",
          filterAll: "全部",
          filterTenantOverrides: "租戶覆寫",
          refresh: t("common.refresh"),
          refreshing: "重新整理中...",
          addOverride: "新增租戶覆寫",
          addOverrideHint: "先切到租戶範圍，才能建立覆寫。",
          riskTitle: "高風險操作必須填寫原因。",
          riskBody:
            "切換與租戶覆寫都維持在這條可寫入治理線上，確認後會留下本地稽核收據。",
          scopeField: "檢視範圍",
          searchField: "搜尋旗標鍵",
          searchPlaceholder: "依旗標鍵搜尋",
          scopeHint:
            "切到租戶後可檢視該租戶生效中的覆寫列；預設仍以平台資料為主。",
          scopeDefault: "平台預設",
          scopeLoading: "載入租戶清單中...",
          currentScope: selectedTenant
            ? `${selectedTenant.name} (${selectedTenant.code})`
            : "平台預設",
          summaryPlatformDefault: "平台預設",
          summaryTenantOverride: "租戶覆寫",
          tableTitle: "功能旗標登錄表",
          tableSubtitle:
            "依畫布交接維持「旗標鍵、範圍、狀態切換、更新者、更新時間、操作」的表格優先主體。",
          filterLabel: "推進狀態",
          filterPill: "表格優先佈局",
          rolloutMid: "進行中推進",
          rolloutFull: "已全面推出",
          rolloutDeprecated: "已淘汰",
          keyHeader: "旗標鍵",
          scopeHeader: "範圍",
          stateHeader: "狀態",
          updatedByHeader: "更新者",
          updatedAtHeader: "更新時間",
          actionsHeader: "操作",
          noDescription: "尚未提供描述",
          updatedByValue: "合約尚未提供",
          toggle: "切換",
          removeOverride: "移除覆寫",
          history: "歷史",
          confirmToggleTitle: "確認切換功能旗標",
          confirmToggleBody: "這會變更目前檢視範圍中的有效功能旗標狀態。",
          confirmOverrideTitle: "建立租戶覆寫",
          confirmOverrideBody:
            "這會為所選旗標鍵建立租戶專屬覆寫，不影響其他範圍。",
          confirmRemoveOverrideTitle: "移除租戶覆寫",
          confirmRemoveOverrideBody:
            "這會移除租戶專屬覆寫，讓該租戶回到平台預設。",
          reasonLabel: "高風險原因",
          reasonPlaceholder: "說明推進原因、預期影響範圍與驗證計畫。",
          reasonRequired: "執行這個高風險操作前必須填寫原因。",
          overrideTenantField: "租戶",
          overrideKeyField: "旗標鍵",
          overrideStateField: "覆寫狀態",
          overrideDescriptionField: "覆寫描述",
          overrideDescriptionHint: "可留白，沿用既有旗標描述。",
          enabled: t("common.enabled"),
          disabled: t("common.disabled"),
          cancel: t("common.cancel"),
          confirming: t("common.updating"),
          confirmEnable: "啟用",
          confirmDisable: "停用",
          confirmCreate: "建立覆寫",
          confirmRemove: "移除覆寫",
          noFlags: t("flags.empty"),
          loading: t("flags.loading"),
          scopeMeta: "目前範圍",
          resultMeta: `可見 ${filteredRows.length} 列`,
          enabledMeta: `啟用 ${enabledCount} 列`,
          disabledMeta: `停用 ${disabledCount} 列`,
          overrideMeta: `租戶覆寫 ${overrideCount} 列`,
          notesTitle: "延伸備註",
          notesEmpty: "目前範圍沒有額外合約備註。",
          historyTitle: "本地稽核收據",
          historyEmpty: "這個瀏覽工作階段尚未記錄任何收據。",
          historyHint: "可用「歷史」操作聚焦特定旗標鍵的收據。",
          historyFocusAll: "目前顯示此瀏覽工作階段的所有收據。",
          historyFocusKey: `目前聚焦 ${historyKey ?? "全部鍵"}`,
          secondaryPanelTitle: "變更控制與延伸細節",
          secondaryPanelSubtitle:
            "高風險原因、延伸備註與本地歷史都收在表格主體下方的次要區塊。",
          actionComposerTitle: "待確認的高風險變更",
          actionComposerIdle: "切換與覆寫變更都必須先填寫原因再確認。",
          actionApplied: "已記錄稽核收據",
          noFlagsInFilter: "目前推進狀態篩選與搜尋條件沒有符合的功能旗標。",
          laneMeta: "僅此處可寫入",
          notesMeta: "延伸備註收在預設主體之外。",
          receiptsMeta: `本地收據 ${auditReceipts.length} 筆`,
          showAllReceipts: "顯示全部收據",
        };

  const filterOptions: RolloutFilterOption[] = [
    {
      value: "all",
      label: copy.filterAll,
      count: rows.length,
    },
    {
      value: "mid_rollout",
      label: copy.rolloutMid,
      count: midRolloutCount,
    },
    {
      value: "rolled_out",
      label: copy.rolloutFull,
      count: rolledOutCount,
    },
    {
      value: "deprecated",
      label: copy.rolloutDeprecated,
      count: deprecatedCount,
    },
    {
      value: "tenant_overrides",
      label: copy.filterTenantOverrides,
      count: overrideCount,
    },
  ];

  const columns: CanvasTableColumn<FlagTableRow>[] = [
    {
      h: copy.keyHeader,
      w: 300,
      r: (row) => (
        <div style={keyCellStyle}>
          <code style={codeStyle}>{row.key}</code>
          <div style={inlinePillRowStyle}>
            <CanvasPill theme={theme} tone={row.rolloutTone}>
              {row.rolloutLabel === "deprecated"
                ? copy.rolloutDeprecated
                : row.rolloutLabel === "rolled_out"
                  ? copy.rolloutFull
                  : copy.rolloutMid}
            </CanvasPill>
          </div>
          <div style={secondaryTextStyle}>
            {row.description === "—" ? copy.noDescription : row.description}
          </div>
        </div>
      ),
    },
    {
      h: copy.scopeHeader,
      w: 220,
      r: (row) => (
        <div style={keyCellStyle}>
          <div style={inlinePillRowStyle}>
            <CanvasPill theme={theme} tone={row.scopeTone}>
              {row.scopeLabel}
            </CanvasPill>
          </div>
          <div style={secondaryTextStyle}>
            {row.tenantId ? row.tenantId : copy.scopeDefault}
          </div>
        </div>
      ),
    },
    {
      h: copy.stateHeader,
      w: 200,
      r: (row) => (
        <div style={stateCellStyle}>
          <CanvasPill
            theme={theme}
            tone={row.enabled ? "success" : "neutral"}
            dot
          >
            {row.enabled ? copy.enabled : copy.disabled}
          </CanvasPill>
          <button
            type="button"
            aria-label={`${copy.toggle} ${row.key}`}
            onClick={() => {
              setActionError(null);
              setActionReason("");
              setPendingAction({
                intent: "toggle",
                key: row.key,
                tenantId: row.tenantId,
                description: row.description === "—" ? "" : row.description,
                currentEnabled: row.enabled,
                nextEnabled: !row.enabled,
                scopeLabel: row.scopeLabel,
              });
            }}
            disabled={updating === row.key}
            style={toggleButtonStyle(theme, row.enabled, updating === row.key)}
          >
            <span style={toggleKnobStyle} />
          </button>
        </div>
      ),
    },
    {
      h: copy.updatedByHeader,
      w: 160,
      r: () => <span style={secondaryTextStyle}>{copy.updatedByValue}</span>,
    },
    {
      h: copy.updatedAtHeader,
      w: 170,
      mono: true,
      r: (row) => formatDateTime(row.updatedAt),
    },
    {
      h: copy.actionsHeader,
      w: 190,
      r: (row) => (
        <div style={actionRowStyle}>
          <CanvasBtn
            theme={theme}
            size="xs"
            variant="secondary"
            onClick={() => {
              setActionError(null);
              setActionReason("");
              setPendingAction({
                intent: "toggle",
                key: row.key,
                tenantId: row.tenantId,
                description: row.description === "—" ? "" : row.description,
                currentEnabled: row.enabled,
                nextEnabled: !row.enabled,
                scopeLabel: row.scopeLabel,
              });
            }}
            disabled={updating === row.key}
          >
            {copy.toggle}
          </CanvasBtn>
          <CanvasBtn
            theme={theme}
            size="xs"
            variant="ghost"
            onClick={() => setHistoryKey(row.key)}
          >
            {copy.history}
          </CanvasBtn>
        </div>
      ),
    },
  ];

  async function handleConfirmAction() {
    if (!pendingAction) {
      return;
    }

    const descriptor = actionDescriptors[pendingAction.intent];
    const reason = actionReason.trim();
    if (descriptor.requiresReason && !reason) {
      setActionError(copy.reasonRequired);
      return;
    }

    if (pendingAction.intent === "override" && !pendingAction.tenantId) {
      setActionError(copy.overrideTenantField);
      return;
    }

    setUpdating(pendingAction.key);
    setError(null);
    setActionError(null);

    try {
      if (pendingAction.intent === "toggle") {
        if (pendingAction.tenantId) {
          await client.post<FeatureFlag>(
            `/api/admin/flags/${encodeURIComponent(
              pendingAction.key,
            )}/tenant-overrides?tenantId=${encodeURIComponent(
              pendingAction.tenantId,
            )}`,
            {
              body: {
                enabled: pendingAction.nextEnabled,
                description: pendingAction.description || undefined,
              },
            },
          );
        } else {
          await client.updateFeatureFlag(
            pendingAction.key,
            pendingAction.nextEnabled,
          );
        }
      } else {
        await client.post<FeatureFlag>(
          `/api/admin/flags/${encodeURIComponent(
            pendingAction.key,
          )}/tenant-overrides?tenantId=${encodeURIComponent(
            pendingAction.tenantId,
          )}`,
          {
            body: {
              enabled: pendingAction.enabled,
              description: pendingAction.description.trim() || undefined,
            },
          },
        );
      }

      const requestedAt = new Date().toISOString();
      const scopeLabel =
        pendingAction.intent === "toggle"
          ? pendingAction.scopeLabel
          : locale === "en"
            ? `Tenant override · ${pendingAction.tenantId}`
            : `租戶覆寫 · ${pendingAction.tenantId}`;
      const summary =
        pendingAction.intent === "toggle"
          ? `${pendingAction.nextEnabled ? copy.confirmEnable : copy.confirmDisable} ${pendingAction.key}`
          : `${copy.confirmCreate} ${pendingAction.key}`;

      setAuditReceipts((previous) => [
        {
          id: `${pendingAction.intent}-${pendingAction.key}-${requestedAt}`,
          intent: pendingAction.intent,
          key: pendingAction.key,
          scopeLabel,
          reason,
          requestedAt,
          summary,
        },
        ...previous,
      ]);
      setHistoryKey(pendingAction.key);

      const nextTenantId =
        pendingAction.intent === "toggle" ? null : pendingAction.tenantId;
      setPendingAction(null);
      setActionReason("");

      if (nextTenantId && nextTenantId !== selectedTenantId) {
        setSelectedTenantId(nextTenantId);
      } else {
        await loadFlags();
      }
    } catch (e: unknown) {
      setError(
        formatPlatformUiError(
          locale,
          toPlatformErrorMessage(e),
          locale === "en"
            ? "Unable to update feature flag"
            : "無法更新功能旗標",
        ),
      );
    } finally {
      setUpdating(null);
    }
  }

  function openOverrideComposer() {
    if (!selectedTenantId) {
      setActionError(copy.addOverrideHint);
      return;
    }

    setActionError(null);
    setActionReason("");
    setPendingAction({
      intent: "override",
      key: sortedFlagKeys[0] ?? "",
      tenantId: selectedTenantId,
      description: "",
      enabled: true,
    });
  }

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={copy.pageTitle}
        subtitle={copy.pageSubtitle}
        actions={
          <>
            <CanvasPill theme={theme} tone="accent" dot>
              {copy.metaPill}
            </CanvasPill>
            <CanvasBtn
              theme={theme}
              variant="secondary"
              icon="arrow"
              onClick={() => void loadFlags()}
            >
              {loading && flags.length > 0 ? copy.refreshing : copy.refresh}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="primary"
              icon="plus"
              onClick={openOverrideComposer}
              disabled={
                sortedFlagKeys.length === 0 ||
                tenantLoading ||
                !selectedTenantId
              }
            >
              {copy.addOverride}
            </CanvasBtn>
          </>
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
                title={error}
                body={copy.riskBody}
              />
            ) : null}

            {auditReceipts.length > 0 ? (
              <CanvasBanner
                theme={theme}
                tone="success"
                title={copy.actionApplied}
                body={`${auditReceipts[0]?.summary} · ${auditReceipts[0]?.scopeLabel} · ${formatDateTime(
                  auditReceipts[0]?.requestedAt ?? "",
                )}`}
              />
            ) : null}

            <div style={sectionStackStyle}>
              <CanvasCard
                theme={theme}
                title={copy.tableTitle}
                subtitle={copy.tableSubtitle}
                style={{ overflow: "hidden" }}
              >
                <div style={tableHeaderStackStyle}>
                  <div style={toolbarStyle}>
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
                    <CanvasField theme={theme} label={copy.searchField}>
                      <input
                        type="search"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder={copy.searchPlaceholder}
                        style={selectStyle(theme)}
                      />
                    </CanvasField>
                  </div>
                  <div style={filterRowStyle}>
                    {filterOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        style={filterButtonStyle}
                        onClick={() => setRolloutFilter(option.value)}
                        aria-pressed={rolloutFilter === option.value}
                      >
                        <CanvasPill
                          theme={theme}
                          tone={
                            rolloutFilter === option.value
                              ? "accent"
                              : "neutral"
                          }
                          dot={rolloutFilter === option.value}
                        >
                          {option.label}: {option.count}
                        </CanvasPill>
                      </button>
                    ))}
                  </div>
                  <div style={utilityBarStyle}>
                    <CanvasPill theme={theme} tone="accent" dot>
                      {copy.laneMeta}
                    </CanvasPill>
                    <CanvasPill theme={theme} tone="neutral">
                      {copy.scopeMeta}: {copy.currentScope}
                    </CanvasPill>
                    <CanvasPill
                      theme={theme}
                      tone={enabledCount > 0 ? "success" : "neutral"}
                    >
                      {copy.enabledMeta}
                    </CanvasPill>
                    <CanvasPill theme={theme} tone="neutral">
                      {copy.disabledMeta}
                    </CanvasPill>
                    <CanvasPill
                      theme={theme}
                      tone={overrideCount > 0 ? "accent" : "neutral"}
                    >
                      {copy.overrideMeta}
                    </CanvasPill>
                    <CanvasPill theme={theme} tone="neutral">
                      {copy.resultMeta}
                    </CanvasPill>
                    <span style={{ flex: 1 }} />
                    <CanvasPill theme={theme} tone="neutral">
                      {copy.filterPill}
                    </CanvasPill>
                  </div>
                </div>

                <div style={fieldHintStyle}>
                  {tenantLoading ? copy.scopeLoading : copy.scopeHint}
                </div>

                {filteredRows.length === 0 ? (
                  <div style={emptyStateStyle}>
                    {searchTerm || rolloutFilter !== "all"
                      ? copy.noFlagsInFilter
                      : copy.noFlags}
                  </div>
                ) : (
                  <CanvasTable<FlagTableRow>
                    theme={theme}
                    columns={columns}
                    rows={filteredRows}
                  />
                )}
              </CanvasCard>

              <div style={secondarySectionStyle}>
                <div style={utilityBarStyle}>
                  <CanvasPill theme={theme} tone="neutral">
                    {copy.summaryPlatformDefault}: {platformDefaultCount}
                  </CanvasPill>
                  <CanvasPill theme={theme} tone="neutral">
                    {copy.summaryTenantOverride}: {overrideCount}
                  </CanvasPill>
                  <CanvasPill theme={theme} tone="neutral">
                    {copy.notesMeta}
                  </CanvasPill>
                  <CanvasPill theme={theme} tone="neutral">
                    {copy.receiptsMeta}
                  </CanvasPill>
                </div>

                <div style={secondaryPanelStyle}>
                  <details
                    style={detailsStyle}
                    open={Boolean(pendingAction || actionError)}
                  >
                    <summary style={detailSummaryStyle}>
                      {copy.actionComposerTitle}
                    </summary>
                    <div style={composerSummaryStyle}>
                      <CanvasBanner
                        theme={theme}
                        tone="warn"
                        title={copy.riskTitle}
                        body={copy.riskBody}
                      />
                      <div style={composerLeadStyle}>
                        <div style={secondaryTextStyle}>
                          {copy.secondaryPanelSubtitle}
                        </div>
                      </div>
                      {pendingAction ? (
                        <>
                          {pendingAction.intent === "override" ? (
                            <>
                              <CanvasField
                                theme={theme}
                                label={copy.overrideTenantField}
                              >
                                <select
                                  value={pendingAction.tenantId}
                                  onChange={(event) =>
                                    setPendingAction((current) =>
                                      current && current.intent === "override"
                                        ? {
                                            ...current,
                                            tenantId: event.target.value,
                                          }
                                        : current,
                                    )
                                  }
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
                              <CanvasField
                                theme={theme}
                                label={copy.overrideKeyField}
                              >
                                <select
                                  value={pendingAction.key}
                                  onChange={(event) =>
                                    setPendingAction((current) =>
                                      current && current.intent === "override"
                                        ? {
                                            ...current,
                                            key: event.target.value,
                                          }
                                        : current,
                                    )
                                  }
                                  style={selectStyle(theme)}
                                >
                                  {sortedFlagKeys.map((key) => (
                                    <option key={key} value={key}>
                                      {key}
                                    </option>
                                  ))}
                                </select>
                              </CanvasField>

                              <CanvasField
                                theme={theme}
                                label={copy.overrideStateField}
                              >
                                <select
                                  value={
                                    pendingAction.enabled
                                      ? "enabled"
                                      : "disabled"
                                  }
                                  onChange={(event) =>
                                    setPendingAction((current) =>
                                      current && current.intent === "override"
                                        ? {
                                            ...current,
                                            enabled:
                                              event.target.value === "enabled",
                                          }
                                        : current,
                                    )
                                  }
                                  style={selectStyle(theme)}
                                >
                                  <option value="enabled">
                                    {copy.enabled}
                                  </option>
                                  <option value="disabled">
                                    {copy.disabled}
                                  </option>
                                </select>
                              </CanvasField>

                              <CanvasField
                                theme={theme}
                                label={copy.overrideDescriptionField}
                              >
                                <textarea
                                  value={pendingAction.description}
                                  onChange={(event) =>
                                    setPendingAction((current) =>
                                      current && current.intent === "override"
                                        ? {
                                            ...current,
                                            description: event.target.value,
                                          }
                                        : current,
                                    )
                                  }
                                  style={textareaStyle(theme)}
                                />
                              </CanvasField>
                              <div style={fieldHintStyle}>
                                {copy.overrideDescriptionHint}
                              </div>
                            </>
                          ) : (
                            <div style={secondaryTextStyle}>
                              <strong>{pendingAction.key}</strong> ·{" "}
                              {pendingAction.scopeLabel} ·{" "}
                              {pendingAction.currentEnabled
                                ? copy.confirmDisable
                                : copy.confirmEnable}
                            </div>
                          )}

                          <CanvasField theme={theme} label={copy.reasonLabel}>
                            <textarea
                              value={actionReason}
                              onChange={(event) =>
                                setActionReason(event.target.value)
                              }
                              placeholder={copy.reasonPlaceholder}
                              style={textareaStyle(theme)}
                            />
                          </CanvasField>

                          {actionError ? (
                            <div
                              style={{
                                ...secondaryTextStyle,
                                color: theme.danger,
                              }}
                            >
                              {actionError}
                            </div>
                          ) : null}

                          <div style={actionRowStyle}>
                            <CanvasBtn
                              theme={theme}
                              variant="secondary"
                              onClick={() => {
                                setPendingAction(null);
                                setActionReason("");
                                setActionError(null);
                              }}
                              disabled={Boolean(updating)}
                            >
                              {copy.cancel}
                            </CanvasBtn>
                            <CanvasBtn
                              theme={theme}
                              variant="primary"
                              onClick={() => void handleConfirmAction()}
                              disabled={Boolean(updating)}
                            >
                              {updating
                                ? copy.confirming
                                : pendingAction.intent === "toggle"
                                  ? pendingAction.nextEnabled
                                    ? copy.confirmEnable
                                    : copy.confirmDisable
                                  : copy.confirmCreate}
                            </CanvasBtn>
                          </div>
                        </>
                      ) : (
                        <div style={secondaryTextStyle}>
                          {actionError ?? copy.actionComposerIdle}
                        </div>
                      )}
                    </div>
                  </details>

                  <details style={detailsStyle}>
                    <summary style={detailSummaryStyle}>
                      {copy.notesTitle}
                    </summary>
                    {notes.length > 0 ? (
                      <ul style={noteListStyle}>
                        {notes.map((note, index) => (
                          <li key={`${note}-${index}`}>{note}</li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ ...secondaryTextStyle, marginTop: 10 }}>
                        {copy.notesEmpty}
                      </div>
                    )}
                  </details>

                  <details style={detailsStyle} open={Boolean(historyKey)}>
                    <summary style={detailSummaryStyle}>
                      {copy.historyTitle}
                    </summary>
                    <div style={{ ...secondaryTextStyle, marginTop: 10 }}>
                      {historyKey ? copy.historyFocusKey : copy.historyFocusAll}
                    </div>
                    <div style={{ ...secondaryTextStyle, marginTop: 6 }}>
                      {copy.historyHint}
                    </div>
                    {visibleAuditReceipts.length > 0 ? (
                      <div style={receiptListStyle}>
                        {visibleAuditReceipts.map((receipt) => (
                          <div key={receipt.id} style={receiptCardStyle}>
                            <div style={inlinePillRowStyle}>
                              <CanvasPill
                                theme={theme}
                                tone={
                                  receipt.intent === "override"
                                    ? "accent"
                                    : "success"
                                }
                              >
                                {receipt.summary}
                              </CanvasPill>
                              <CanvasPill theme={theme} tone="neutral">
                                {receipt.scopeLabel}
                              </CanvasPill>
                            </div>
                            <div style={secondaryTextStyle}>
                              {receipt.reason}
                            </div>
                            <div style={secondaryTextStyle}>
                              {formatDateTime(receipt.requestedAt)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ ...secondaryTextStyle, marginTop: 10 }}>
                        {copy.historyEmpty}
                      </div>
                    )}
                    {historyKey ? (
                      <div style={{ marginTop: 10 }}>
                        <CanvasBtn
                          theme={theme}
                          variant="secondary"
                          size="xs"
                          onClick={() => setHistoryKey(null)}
                        >
                          {copy.showAllReceipts}
                        </CanvasBtn>
                      </div>
                    ) : null}
                  </details>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
