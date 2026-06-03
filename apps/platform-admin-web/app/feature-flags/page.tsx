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

type ActionIntent = "toggle" | "override" | "removeOverride";

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

type RemoveOverrideDraft = {
  intent: "removeOverride";
  key: string;
  tenantId: string;
  description: string;
  enabled: boolean;
  scopeLabel: string;
};

type PendingAction = ToggleDraft | OverrideDraft | RemoveOverrideDraft;

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
  updatedAt: string;
  updatedBy: string;
} & Record<string, unknown>;

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
    removeOverride: {
      intent: "removeOverride",
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
  marginBottom: 16,
} satisfies CSSProperties;

const toolbarMetaStyle = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 8,
  minHeight: 38,
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
  gap: 16,
} satisfies CSSProperties;

const secondaryCardBodyStyle = {
  display: "grid",
  gap: 12,
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
  marginTop: 10,
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

function toFlagTableRow(flag: FeatureFlag): FlagTableRow {
  const isTenantOverride = Boolean(flag.tenantId);

  return {
    key: flag.key,
    description: flag.description || "—",
    enabled: flag.enabled,
    tenantId: flag.tenantId ?? null,
    scopeLabel: isTenantOverride
      ? `Tenant override · ${flag.tenantId}`
      : "Platform default",
    scopeTone: isTenantOverride ? "accent" : "neutral",
    updatedAt: flag.updatedAt,
    updatedBy: "Contract not exposed",
  };
}

function sortFlags(left: FeatureFlag, right: FeatureFlag) {
  const keyOrder = left.key.localeCompare(right.key);
  if (keyOrder !== 0) {
    return keyOrder;
  }

  return (left.tenantId ?? "").localeCompare(right.tenantId ?? "");
}

export default function FeatureFlagsPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [tenants, setTenants] = useState<PlatformAdminTenantRecord[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
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

  const rows = useMemo(
    () => [...flags].sort(sortFlags).map(toFlagTableRow),
    [flags],
  );
  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return rows;
    }

    return rows.filter((row) => row.key.toLowerCase().includes(query));
  }, [rows, searchTerm]);
  const selectedTenant =
    tenants.find((tenant) => tenant.id === selectedTenantId) ?? null;
  const overrideCount = rows.filter((row) => row.tenantId).length;
  const platformDefaultCount = rows.filter((row) => !row.tenantId).length;
  const enabledCount = filteredRows.filter((row) => row.enabled).length;
  const disabledCount = filteredRows.length - enabledCount;
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
          summaryEnabled: "Enabled in view",
          summaryDisabled: "Disabled in view",
          visibleRows: `${filteredRows.length} visible row(s)`,
          overrideVisible: `${overrideCount} tenant override row(s)`,
          tableTitle: "Feature flag registry",
          tableSubtitle:
            "KEY, SCOPE, STATE TOGGLE, UPDATED BY, AT, and ACTIONS match the canvas handoff.",
          keyHeader: "Key",
          scopeHeader: "Scope",
          stateHeader: "State toggle",
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
        }
      : {
          pageTitle: "Feature Flags · WRITE authority",
          pageSubtitle:
            "只有這裡可寫入。ops、tenant、driver 其他頁面維持 GET feature flag 唯讀檢視。",
          metaPill: "writable only here",
          refresh: t("common.refresh"),
          refreshing: "重新整理中...",
          addOverride: "新增 tenant override",
          addOverrideHint: "先切到 tenant 範圍，才能建立 override。",
          riskTitle: "高風險操作必須填寫原因。",
          riskBody:
            "toggle 與 tenant override 都維持在這條 write lane，確認後會留下本地 audit receipt。",
          scopeField: "檢視範圍",
          searchField: "搜尋 key",
          searchPlaceholder: "依 flag key 搜尋",
          scopeHint:
            "切到 tenant 可檢視該 tenant 的有效 override 列；預設仍以平台資料為主。",
          scopeDefault: "平台預設",
          scopeLoading: "載入 tenant 清單中...",
          currentScope: selectedTenant
            ? `${selectedTenant.name} (${selectedTenant.code})`
            : "平台預設",
          summaryPlatformDefault: "平台預設",
          summaryTenantOverride: "Tenant overrides",
          summaryEnabled: "目前檢視啟用",
          summaryDisabled: "目前檢視停用",
          visibleRows: `可見 ${filteredRows.length} 列`,
          overrideVisible: `tenant override ${overrideCount} 列`,
          tableTitle: "Feature flag registry",
          tableSubtitle:
            "依畫布 handoff 對齊 KEY、SCOPE、STATE TOGGLE、UPDATED BY、AT、ACTIONS。",
          keyHeader: "Key",
          scopeHeader: "Scope",
          stateHeader: "State toggle",
          updatedByHeader: "Updated by",
          updatedAtHeader: "At",
          actionsHeader: "Actions",
          noDescription: "尚未提供描述",
          updatedByValue: "目前 contract 未提供",
          toggle: "切換",
          removeOverride: "移除 override",
          history: "歷史",
          confirmToggleTitle: "確認切換 feature flag",
          confirmToggleBody: "這會變更目前檢視範圍中的有效 feature flag 狀態。",
          confirmOverrideTitle: "建立 tenant override",
          confirmOverrideBody:
            "這會為所選 key 建立 tenant 專屬 override，不影響其他範圍。",
          confirmRemoveOverrideTitle: "移除 tenant override",
          confirmRemoveOverrideBody:
            "這會移除 tenant 專屬 override，讓該 tenant 回到平台預設。",
          reasonLabel: "高風險原因",
          reasonPlaceholder:
            "說明 rollout 原因、預期 blast radius 與驗證計畫。",
          reasonRequired: "執行這個高風險操作前必須填寫原因。",
          overrideTenantField: "Tenant",
          overrideKeyField: "Flag key",
          overrideStateField: "Override 狀態",
          overrideDescriptionField: "Override 描述",
          overrideDescriptionHint: "可留白，沿用既有 flag 描述。",
          enabled: t("common.enabled"),
          disabled: t("common.disabled"),
          cancel: t("common.cancel"),
          confirming: t("common.updating"),
          confirmEnable: "啟用",
          confirmDisable: "停用",
          confirmCreate: "建立 override",
          confirmRemove: "移除 override",
          noFlags: t("flags.empty"),
          loading: t("flags.loading"),
          notesTitle: "延伸備註",
          notesEmpty: "目前範圍沒有額外 contract 備註。",
          historyTitle: "本地 audit receipts",
          historyEmpty: "這個瀏覽 session 尚未記錄任何 receipt。",
          historyHint: "可用 History 列操作聚焦特定 key 的 receipt。",
          historyFocusAll: "目前顯示此瀏覽 session 的所有 receipts。",
          historyFocusKey: `目前聚焦 ${historyKey ?? "全部 key"}`,
          secondaryPanelTitle: "變更控制與延伸細節",
          secondaryPanelSubtitle:
            "高風險原因、延伸備註與本地歷史都收在表格主體下方的次要區塊。",
          actionComposerTitle: "待確認的高風險變更",
          actionComposerIdle: "toggle 與 override 變更都必須先填寫原因再確認。",
          actionApplied: "已記錄 audit receipt",
        };

  const columns: CanvasTableColumn<FlagTableRow>[] = [
    {
      h: copy.keyHeader,
      w: 300,
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
            {row.tenantId ? row.tenantId : copy.currentScope}
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
          {row.tenantId ? (
            <CanvasBtn
              theme={theme}
              size="xs"
              variant="ghost"
              onClick={() => {
                const tenantId = row.tenantId;
                if (!tenantId) {
                  return;
                }
                setActionError(null);
                setActionReason("");
                setPendingAction({
                  intent: "removeOverride",
                  key: row.key,
                  tenantId,
                  description: row.description === "—" ? "" : row.description,
                  enabled: row.enabled,
                  scopeLabel: row.scopeLabel,
                });
              }}
              disabled={updating === row.key}
            >
              {copy.removeOverride}
            </CanvasBtn>
          ) : null}
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

    if (
      (pendingAction.intent === "override" ||
        pendingAction.intent === "removeOverride") &&
      !pendingAction.tenantId
    ) {
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
      } else if (pendingAction.intent === "override") {
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
      } else {
        await client.delete<FeatureFlag>(
          `/api/admin/flags/${encodeURIComponent(
            pendingAction.key,
          )}/tenant-overrides?tenantId=${encodeURIComponent(
            pendingAction.tenantId,
          )}`,
        );
      }

      const requestedAt = new Date().toISOString();
      const scopeLabel =
        pendingAction.intent === "toggle"
          ? pendingAction.scopeLabel
          : `Tenant override · ${pendingAction.tenantId}`;
      const summary =
        pendingAction.intent === "toggle"
          ? `${pendingAction.nextEnabled ? copy.confirmEnable : copy.confirmDisable} ${pendingAction.key}`
          : pendingAction.intent === "override"
            ? `${copy.confirmCreate} ${pendingAction.key}`
            : `${copy.confirmRemove} ${pendingAction.key}`;

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
      setError(e instanceof Error ? e.message : String(e));
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

            <CanvasCard
              theme={theme}
              title={copy.tableTitle}
              subtitle={copy.tableSubtitle}
              style={{ overflow: "hidden" }}
            >
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
              <div style={toolbarMetaStyle}>
                <CanvasPill theme={theme} tone="neutral">
                  {copy.summaryPlatformDefault}: {platformDefaultCount}
                </CanvasPill>
                <CanvasPill
                  theme={theme}
                  tone={overrideCount > 0 ? "accent" : "neutral"}
                >
                  {copy.summaryTenantOverride}: {overrideCount}
                </CanvasPill>
                <CanvasPill
                  theme={theme}
                  tone={enabledCount > 0 ? "success" : "neutral"}
                >
                  {copy.summaryEnabled}: {enabledCount}
                </CanvasPill>
                <CanvasPill theme={theme} tone="neutral">
                  {copy.summaryDisabled}: {disabledCount}
                </CanvasPill>
                <CanvasPill theme={theme} tone="neutral">
                  {copy.currentScope}
                </CanvasPill>
                <CanvasPill theme={theme} tone="neutral">
                  {copy.visibleRows}
                </CanvasPill>
              </div>

              <div style={fieldHintStyle}>
                {tenantLoading ? copy.scopeLoading : copy.scopeHint} ·{" "}
                {copy.overrideVisible}
              </div>

              {filteredRows.length === 0 ? (
                <div style={emptyStateStyle}>{copy.noFlags}</div>
              ) : (
                <CanvasTable<FlagTableRow>
                  theme={theme}
                  columns={columns}
                  rows={filteredRows}
                />
              )}
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={copy.secondaryPanelTitle}
              subtitle={copy.secondaryPanelSubtitle}
            >
              <div style={secondaryCardBodyStyle}>
                <CanvasBanner
                  theme={theme}
                  tone="warn"
                  title={copy.riskTitle}
                  body={copy.riskBody}
                />
                <details
                  style={detailsStyle}
                  open={Boolean(pendingAction || actionError)}
                >
                  <summary style={detailSummaryStyle}>
                    {copy.actionComposerTitle}
                  </summary>
                  {pendingAction ? (
                    <div style={composerSummaryStyle}>
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
                                    ? { ...current, key: event.target.value }
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
                                pendingAction.enabled ? "enabled" : "disabled"
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
                              <option value="enabled">{copy.enabled}</option>
                              <option value="disabled">{copy.disabled}</option>
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
                      ) : pendingAction.intent === "removeOverride" ? (
                        <div style={secondaryTextStyle}>
                          <strong>{pendingAction.key}</strong> ·{" "}
                          {pendingAction.scopeLabel} · {copy.confirmRemove}
                        </div>
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
                          style={{ ...secondaryTextStyle, color: theme.danger }}
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
                              : pendingAction.intent === "override"
                                ? copy.confirmCreate
                                : copy.confirmRemove}
                        </CanvasBtn>
                      </div>
                    </div>
                  ) : (
                    <div style={{ ...secondaryTextStyle, marginTop: 10 }}>
                      {actionError ?? copy.actionComposerIdle}
                    </div>
                  )}
                </details>

                <div style={secondaryPanelStyle}>
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
                  </details>
                </div>
              </div>
            </CanvasCard>
          </>
        )}
      </div>
    </>
  );
}
