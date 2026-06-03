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
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTheme,
} from "@drts/ui-web";

type FlagTableRow = {
  id: string;
  key: string;
  description: string;
  enabled: boolean;
  tenantId: string | null;
  scopeLabel: string;
  mutable: boolean;
  updatedAt: string;
  updatedBy: string;
} & Record<string, unknown>;

type PendingToggle = {
  key: string;
  rowId: string;
  scopeLabel: string;
  nextEnabled: boolean;
  reason: string;
};

type OverrideDraft = {
  key: string;
  tenantId: string;
  enabled: boolean;
  reason: string;
};

type Receipt = {
  tone: "accent" | "warn" | "danger" | "success" | "info";
  title: string;
  body: string;
};

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const bodyStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const tableCardStyle = {
  overflow: "hidden",
} satisfies CSSProperties;

const lowerGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
} satisfies CSSProperties;

const secondaryStackStyle = {
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const emptyStateStyle = {
  color: theme.textMuted,
  fontSize: 12.5,
  textAlign: "center",
  padding: "32px 16px",
} satisfies CSSProperties;

const loadingStateStyle = {
  color: theme.textMuted,
  fontSize: 12.5,
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

const mutedMonoStyle = {
  color: theme.textDim,
  fontFamily: theme.monoFamily,
  fontSize: 11,
  lineHeight: 1.4,
  whiteSpace: "normal",
} satisfies CSSProperties;

const inlinePillRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
} satisfies CSSProperties;

const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
} satisfies CSSProperties;

const detailsStyle = {
  border: `1px solid ${theme.border}`,
  borderRadius: 12,
  background: theme.bgRaised,
  padding: 14,
} satisfies CSSProperties;

const summaryStyle = {
  cursor: "pointer",
  listStyle: "none",
  fontSize: 12.5,
  fontWeight: 600,
  color: theme.text,
} satisfies CSSProperties;

const noteListStyle = {
  margin: "12px 0 0",
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

const textareaStyle = (th: CanvasTheme): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontFamily: th.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  resize: "vertical",
  outline: "none",
});

const selectStyle = (th: CanvasTheme): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontFamily: th.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
});

function sortFlags(flags: FeatureFlag[]) {
  return [...flags].sort((left, right) => {
    if (left.key !== right.key) {
      return left.key.localeCompare(right.key);
    }
    if (Boolean(left.tenantId) !== Boolean(right.tenantId)) {
      return left.tenantId ? 1 : -1;
    }
    return (left.tenantId ?? "").localeCompare(right.tenantId ?? "");
  });
}

function formatTenantScopeLabel(
  tenantId: string,
  tenants: PlatformAdminTenantRecord[],
  fallbackLabel: string,
) {
  const tenant = tenants.find((item) => item.id === tenantId);
  if (!tenant) {
    return `${fallbackLabel} · ${tenantId}`;
  }
  return `${tenant.name} (${tenant.code})`;
}

function createRows(
  flags: FeatureFlag[],
  tenants: PlatformAdminTenantRecord[],
  platformDefaultLabel: string,
  tenantOverrideLabel: string,
) {
  return sortFlags(flags).map<FlagTableRow>((flag) => ({
    id: `${flag.key}::${flag.tenantId ?? "global"}`,
    key: flag.key,
    description: flag.description || "—",
    enabled: flag.enabled,
    tenantId: flag.tenantId ?? null,
    scopeLabel: flag.tenantId
      ? formatTenantScopeLabel(flag.tenantId, tenants, tenantOverrideLabel)
      : platformDefaultLabel,
    mutable: !flag.tenantId,
    updatedAt: flag.updatedAt,
    updatedBy: "Contract not exposed",
  }));
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
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [pendingToggle, setPendingToggle] = useState<PendingToggle | null>(
    null,
  );
  const [showOverrideComposer, setShowOverrideComposer] = useState(false);
  const [overrideDraft, setOverrideDraft] = useState<OverrideDraft>({
    key: "",
    tenantId: "",
    enabled: true,
    reason: "",
  });
  const [inspectedRowId, setInspectedRowId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const copy =
    locale === "en"
      ? {
          title: "Feature Flags · WRITE authority",
          subtitle:
            "Only this route writes platform defaults. Ops / tenant / driver surfaces stay read-only via GET filters.",
          writableOnlyHere: "writable · only here",
          refresh: t("common.refresh"),
          refreshing: "Refreshing…",
          addOverride: "Add tenant override",
          allTab: "All keys",
          enabledTab: "Enabled",
          overrideTab: "Overrides visible",
          tableTitle: "Feature flag registry",
          tableSubtitle:
            "Table-first parity: key, scope, state, updated by, at, and high-risk actions stay in one compact registry.",
          scopeLabel: "Scope",
          updatedByLabel: "Updated by",
          atLabel: "At",
          actionsLabel: "Actions",
          platformDefault: "Platform default",
          tenantOverride: "Tenant override",
          mutable: "Writable",
          readOnly: "Read-only",
          noDescription: "No description provided",
          history: "History",
          toggle: "Toggle",
          stateEnabled: t("common.enabled"),
          stateDisabled: t("common.disabled"),
          pendingEnable: "Stage enable",
          pendingDisable: "Stage disable",
          toggleTitle: "Confirm high-risk toggle",
          toggleSubtitle:
            "Platform default changes require an explicit reason before the write is sent.",
          toggleReason: "Reason",
          toggleReasonHint:
            "This text is required by the UI high-risk gate and is echoed back in the audit receipt banner.",
          confirm: "Confirm",
          cancel: t("common.cancel"),
          overrideTitle: "Prepare tenant override",
          overrideSubtitle:
            "The canvas requires a visible override action. The current admin contract does not yet expose the write endpoint.",
          overrideKey: "Flag key",
          overrideTenant: "Tenant",
          overrideState: "Desired state",
          overrideReason: "Reason",
          overrideUnavailable:
            "Tenant override write remains blocked until the admin API exposes a POST/PATCH override endpoint.",
          overrideUnavailableTitle: "Override write path unavailable",
          overrideUnavailableBody:
            "The composer remains visible so operators can capture key, tenant, desired state, and reason without pretending the write succeeded.",
          overrideRiskTitle: "High-risk override review",
          overrideRiskSubtitle:
            "Reason, tenant, and desired state must all be present before the UI exposes the blocked write path.",
          overrideReasonRequired:
            "Reason, key, and tenant are required before override review is complete.",
          overrideReceiptTitle: "Override review staged",
          overrideReceiptBody:
            "Reason captured. Final write stays blocked until the admin API exposes the override mutation.",
          currentViewTitle: "Current view",
          currentViewSubtitle:
            "Scope and guardrails stay compact so the registry remains the default focus.",
          scopeField: "Tenant filter",
          scopeHint:
            "Choose a tenant to display its override rows beside platform defaults.",
          scopeLoading: "Loading tenant list…",
          scopeDefault: "Platform defaults only",
          currentScope: "Current scope",
          currentState: "Mutable surface",
          currentStateValue: "Global default toggle only",
          notesTitle: "Extended notes",
          notesSummary: "Show contract notes and route guardrails",
          notesFallback:
            "No API notes returned. Extended notes remain out of the default path.",
          notesCount: `${notes.length} note(s)`,
          notesCardSubtitle:
            "Collapsed by default so the registry table remains the primary surface.",
          receiptEnabled: "Platform default enabled",
          receiptDisabled: "Platform default disabled",
          receiptBody: "Reason captured",
          empty: t("flags.empty"),
          loading: t("flags.loading"),
        }
      : {
          title: "Feature Flags · WRITE authority",
          subtitle:
            "僅此 route 可寫入平台預設值；ops / tenant / driver 其他介面都只走 GET 過濾唯讀。",
          writableOnlyHere: "writable · only here",
          refresh: t("common.refresh"),
          refreshing: "重新整理中…",
          addOverride: "新增 tenant override",
          allTab: "全部 key",
          enabledTab: "已啟用",
          overrideTab: "可見 override",
          tableTitle: "Feature flag registry",
          tableSubtitle:
            "改成 table-first：key、scope、state、updated by、at 與高風險操作都集中在同一張緊湊表格。",
          scopeLabel: "範圍",
          updatedByLabel: "Updated by",
          atLabel: "時間",
          actionsLabel: "操作",
          platformDefault: "平台預設",
          tenantOverride: "Tenant override",
          mutable: "可寫入",
          readOnly: "唯讀",
          noDescription: "尚未提供描述",
          history: "歷史",
          toggle: "切換",
          stateEnabled: t("common.enabled"),
          stateDisabled: t("common.disabled"),
          pendingEnable: "準備啟用",
          pendingDisable: "準備停用",
          toggleTitle: "確認高風險切換",
          toggleSubtitle: "變更平台預設值前必須先填寫原因，才會送出寫入。",
          toggleReason: "原因",
          toggleReasonHint:
            "這個欄位是前端 high-risk gate 必填，送出成功後也會回顯到 receipt banner。",
          confirm: "確認",
          cancel: t("common.cancel"),
          overrideTitle: "準備 tenant override",
          overrideSubtitle:
            "Canvas 要求保留 override CTA，但目前 admin contract 還沒有 exposed 對應寫入 endpoint。",
          overrideKey: "旗標 key",
          overrideTenant: "Tenant",
          overrideState: "目標狀態",
          overrideReason: "原因",
          overrideUnavailable:
            "Tenant override 寫入仍受阻於 admin API 尚未提供 POST/PATCH override endpoint。",
          overrideUnavailableTitle: "Override 寫入路徑尚未開放",
          overrideUnavailableBody:
            "保留 composer 讓操作員能先填 key、tenant、目標狀態與原因，但不假裝這個寫入已成功。",
          overrideRiskTitle: "高風險 override 檢查",
          overrideRiskSubtitle:
            "Reason、tenant 與目標狀態都必須完整，前端才會顯示仍被阻擋的寫入路徑。",
          overrideReasonRequired:
            "完成 override 檢查前，必須先填好原因、key 與 tenant。",
          overrideReceiptTitle: "已暫存 override 檢查",
          overrideReceiptBody:
            "原因已記錄；最終寫入仍要等 admin API 開放 override mutation。",
          currentViewTitle: "目前檢視",
          currentViewSubtitle:
            "把範圍與 guardrail 壓縮到次要區，讓 registry table 維持預設焦點。",
          scopeField: "Tenant 篩選",
          scopeHint:
            "選擇 tenant 後，表格會把該 tenant 的 override 與平台預設一起顯示。",
          scopeLoading: "載入 tenant 清單中…",
          scopeDefault: "只看平台預設",
          currentScope: "目前範圍",
          currentState: "可變更範圍",
          currentStateValue: "僅全域預設 toggle",
          notesTitle: "Extended notes",
          notesSummary: "顯示 contract 備註與 route guardrail",
          notesFallback: "API 沒有返回 notes；extended notes 維持在非預設區。",
          notesCount: `${notes.length} 筆`,
          notesCardSubtitle: "預設收合，避免搶走 registry table 的主視覺焦點。",
          receiptEnabled: "已啟用平台預設",
          receiptDisabled: "已停用平台預設",
          receiptBody: "已記錄原因",
          empty: t("flags.empty"),
          loading: t("flags.loading"),
        };

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
    () => createRows(flags, tenants, copy.platformDefault, copy.tenantOverride),
    [copy.platformDefault, copy.tenantOverride, flags, tenants],
  );

  const enabledCount = rows.filter((row) => row.enabled).length;
  const overrideCount = rows.filter((row) => row.tenantId).length;
  const overrideReviewReady = Boolean(
    overrideDraft.key && overrideDraft.tenantId && overrideDraft.reason.trim(),
  );
  const selectedTenant =
    tenants.find((tenant) => tenant.id === selectedTenantId) ?? null;
  const inspectedRow =
    rows.find((row) => row.id === inspectedRowId) ?? rows[0] ?? null;

  const columns: CanvasTableColumn<FlagTableRow>[] = [
    {
      h: t("flags.col.flag"),
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
      h: copy.scopeLabel,
      w: 230,
      r: (row) => (
        <div style={keyCellStyle}>
          <div style={inlinePillRowStyle}>
            <CanvasPill theme={theme} tone={row.mutable ? "accent" : "warn"}>
              {row.tenantId ? copy.tenantOverride : copy.platformDefault}
            </CanvasPill>
            <CanvasPill
              theme={theme}
              tone={row.mutable ? "success" : "neutral"}
            >
              {row.mutable ? copy.mutable : copy.readOnly}
            </CanvasPill>
          </div>
          <div style={secondaryTextStyle}>{row.scopeLabel}</div>
        </div>
      ),
    },
    {
      h: t("flags.col.status"),
      w: 140,
      r: (row) => (
        <div style={keyCellStyle}>
          <CanvasPill
            theme={theme}
            tone={row.enabled ? "success" : "neutral"}
            dot
          >
            {row.enabled ? copy.stateEnabled : copy.stateDisabled}
          </CanvasPill>
          <div style={secondaryTextStyle}>
            {row.enabled ? copy.pendingDisable : copy.pendingEnable}
          </div>
        </div>
      ),
    },
    {
      h: copy.updatedByLabel,
      w: 150,
      r: (row) => (
        <div style={keyCellStyle}>
          <div style={secondaryTextStyle}>
            {locale === "en" ? row.updatedBy : "目前 contract 未提供"}
          </div>
          <div style={mutedMonoStyle}>{row.id}</div>
        </div>
      ),
    },
    {
      h: copy.atLabel,
      w: 150,
      mono: true,
      r: (row) => formatDateTime(row.updatedAt),
    },
    {
      h: copy.actionsLabel,
      w: 190,
      r: (row) => (
        <div style={actionRowStyle}>
          <CanvasBtn
            theme={theme}
            size="xs"
            variant="secondary"
            disabled={!row.mutable || updating === row.id}
            onClick={() =>
              setPendingToggle({
                key: row.key,
                rowId: row.id,
                scopeLabel: row.scopeLabel,
                nextEnabled: !row.enabled,
                reason: "",
              })
            }
          >
            {copy.toggle}
          </CanvasBtn>
          <CanvasBtn
            theme={theme}
            size="xs"
            variant="ghost"
            onClick={() => setInspectedRowId(row.id)}
          >
            {copy.history}
          </CanvasBtn>
        </div>
      ),
    },
  ];

  async function handleConfirmToggle() {
    if (!pendingToggle || !pendingToggle.reason.trim()) return;

    setUpdating(pendingToggle.rowId);
    setError(null);
    try {
      await client.updateFeatureFlag(
        pendingToggle.key,
        pendingToggle.nextEnabled,
      );
      setReceipt({
        tone: pendingToggle.nextEnabled ? "warn" : "danger",
        title: pendingToggle.nextEnabled
          ? copy.receiptEnabled
          : copy.receiptDisabled,
        body: `${copy.receiptBody}: ${pendingToggle.reason.trim()}`,
      });
      setPendingToggle(null);
      await loadFlags();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUpdating(null);
    }
  }

  const headerTabs = [
    `${copy.allTab} · ${rows.length}`,
    `${copy.enabledTab} · ${enabledCount}`,
    `${copy.overrideTab} · ${overrideCount}`,
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        tabs={headerTabs}
        activeTab={headerTabs[0]}
        actions={
          <>
            <CanvasBtn
              theme={theme}
              variant="secondary"
              onClick={() => {
                setReceipt(null);
                void loadFlags();
              }}
            >
              {loading && flags.length > 0 ? copy.refreshing : copy.refresh}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="primary"
              onClick={() => setShowOverrideComposer((current) => !current)}
            >
              {copy.addOverride}
            </CanvasBtn>
          </>
        }
      />

      <div style={bodyStyle}>
        {loading && flags.length === 0 ? (
          <CanvasCard theme={theme} title={copy.title} subtitle={copy.loading}>
            <div style={loadingStateStyle}>{copy.loading}</div>
          </CanvasCard>
        ) : (
          <>
            {error ? (
              <CanvasBanner
                theme={theme}
                tone="danger"
                title={`${getPlatformLabel(locale, "error")}: ${error}`}
                body={copy.subtitle}
              />
            ) : null}

            <CanvasBanner
              theme={theme}
              tone="warn"
              icon="flags"
              title={copy.writableOnlyHere}
              body={copy.subtitle}
            />

            {receipt ? (
              <CanvasBanner
                theme={theme}
                tone={receipt.tone}
                title={receipt.title}
                body={receipt.body}
              />
            ) : null}

            <CanvasCard
              theme={theme}
              title={copy.tableTitle}
              subtitle={copy.tableSubtitle}
              style={tableCardStyle}
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

            <div style={lowerGridStyle}>
              <div style={secondaryStackStyle}>
                {pendingToggle ? (
                  <CanvasCard
                    theme={theme}
                    title={copy.toggleTitle}
                    subtitle={copy.toggleSubtitle}
                  >
                    <CanvasDL
                      theme={theme}
                      cols={2}
                      items={[
                        {
                          label: t("flags.col.flag"),
                          value: pendingToggle.key,
                        },
                        {
                          label: copy.scopeLabel,
                          value: pendingToggle.scopeLabel,
                        },
                        {
                          label: t("flags.col.status"),
                          value: pendingToggle.nextEnabled
                            ? copy.stateEnabled
                            : copy.stateDisabled,
                        },
                        {
                          label: copy.actionsLabel,
                          value: pendingToggle.nextEnabled
                            ? copy.pendingEnable
                            : copy.pendingDisable,
                        },
                      ]}
                    />
                    <div style={{ marginTop: 16 }}>
                      <CanvasField theme={theme} label={copy.toggleReason}>
                        <textarea
                          rows={3}
                          value={pendingToggle.reason}
                          onChange={(event) =>
                            setPendingToggle((current) =>
                              current
                                ? { ...current, reason: event.target.value }
                                : current,
                            )
                          }
                          style={textareaStyle(theme)}
                        />
                      </CanvasField>
                      <div style={fieldHintStyle}>{copy.toggleReasonHint}</div>
                    </div>
                    <div style={{ ...actionRowStyle, marginTop: 16 }}>
                      <CanvasBtn
                        theme={theme}
                        variant="secondary"
                        onClick={() => setPendingToggle(null)}
                        disabled={updating === pendingToggle.rowId}
                      >
                        {copy.cancel}
                      </CanvasBtn>
                      <CanvasBtn
                        theme={theme}
                        variant="primary"
                        onClick={() => void handleConfirmToggle()}
                        disabled={
                          updating === pendingToggle.rowId ||
                          !pendingToggle.reason.trim()
                        }
                      >
                        {copy.confirm}
                      </CanvasBtn>
                    </div>
                  </CanvasCard>
                ) : null}

                {showOverrideComposer ? (
                  <CanvasCard
                    theme={theme}
                    title={copy.overrideTitle}
                    subtitle={copy.overrideSubtitle}
                  >
                    <div style={lowerGridStyle}>
                      <CanvasField theme={theme} label={copy.overrideKey}>
                        <select
                          value={overrideDraft.key}
                          onChange={(event) =>
                            setOverrideDraft((current) => ({
                              ...current,
                              key: event.target.value,
                            }))
                          }
                          style={selectStyle(theme)}
                        >
                          <option value="">{copy.allTab}</option>
                          {[...new Set(rows.map((row) => row.key))].map(
                            (key) => (
                              <option key={key} value={key}>
                                {key}
                              </option>
                            ),
                          )}
                        </select>
                      </CanvasField>

                      <CanvasField theme={theme} label={copy.overrideTenant}>
                        <select
                          value={overrideDraft.tenantId}
                          onChange={(event) =>
                            setOverrideDraft((current) => ({
                              ...current,
                              tenantId: event.target.value,
                            }))
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
                    </div>

                    <div style={{ ...lowerGridStyle, marginTop: 16 }}>
                      <CanvasField theme={theme} label={copy.overrideState}>
                        <select
                          value={overrideDraft.enabled ? "enabled" : "disabled"}
                          onChange={(event) =>
                            setOverrideDraft((current) => ({
                              ...current,
                              enabled: event.target.value === "enabled",
                            }))
                          }
                          style={selectStyle(theme)}
                        >
                          <option value="enabled">{copy.stateEnabled}</option>
                          <option value="disabled">{copy.stateDisabled}</option>
                        </select>
                      </CanvasField>

                      <CanvasField theme={theme} label={copy.overrideReason}>
                        <textarea
                          rows={3}
                          value={overrideDraft.reason}
                          onChange={(event) =>
                            setOverrideDraft((current) => ({
                              ...current,
                              reason: event.target.value,
                            }))
                          }
                          style={textareaStyle(theme)}
                        />
                      </CanvasField>
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <CanvasBanner
                        theme={theme}
                        tone={overrideReviewReady ? "warn" : "danger"}
                        title={
                          overrideReviewReady
                            ? copy.overrideReceiptTitle
                            : copy.overrideReasonRequired
                        }
                        body={
                          overrideReviewReady
                            ? copy.overrideReceiptBody
                            : copy.overrideRiskSubtitle
                        }
                      />
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <CanvasCard
                        theme={theme}
                        title={copy.overrideRiskTitle}
                        subtitle={copy.overrideRiskSubtitle}
                      >
                        <CanvasDL
                          theme={theme}
                          cols={2}
                          items={[
                            {
                              label: copy.overrideKey,
                              value: overrideDraft.key || "—",
                            },
                            {
                              label: copy.overrideTenant,
                              value: overrideDraft.tenantId
                                ? formatTenantScopeLabel(
                                    overrideDraft.tenantId,
                                    tenants,
                                    copy.tenantOverride,
                                  )
                                : copy.scopeDefault,
                            },
                            {
                              label: copy.overrideState,
                              value: overrideDraft.enabled
                                ? copy.stateEnabled
                                : copy.stateDisabled,
                            },
                            {
                              label: copy.overrideReason,
                              value: overrideDraft.reason.trim() || "—",
                            },
                          ]}
                        />
                      </CanvasCard>
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <CanvasBanner
                        theme={theme}
                        tone="warn"
                        title={copy.overrideUnavailableTitle}
                        body={copy.overrideUnavailableBody}
                      />
                    </div>
                    <div style={{ ...actionRowStyle, marginTop: 16 }}>
                      <CanvasBtn
                        theme={theme}
                        variant="secondary"
                        onClick={() => setShowOverrideComposer(false)}
                      >
                        {copy.cancel}
                      </CanvasBtn>
                      <CanvasBtn
                        theme={theme}
                        variant="primary"
                        disabled={!overrideReviewReady}
                      >
                        {copy.overrideUnavailable}
                      </CanvasBtn>
                    </div>
                  </CanvasCard>
                ) : null}
              </div>

              <CanvasCard
                theme={theme}
                title={copy.currentViewTitle}
                subtitle={copy.currentViewSubtitle}
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
                        label: copy.currentScope,
                        value: selectedTenant
                          ? `${selectedTenant.name} (${selectedTenant.code})`
                          : copy.scopeDefault,
                      },
                      {
                        label: copy.currentState,
                        value: copy.currentStateValue,
                      },
                      {
                        label: copy.updatedByLabel,
                        value:
                          locale === "en"
                            ? "Contract not exposed"
                            : "目前 contract 未提供",
                      },
                      {
                        label: copy.notesTitle,
                        value: copy.notesCount,
                      },
                    ]}
                  />
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={copy.history}
                subtitle={inspectedRow?.key ?? copy.tableTitle}
              >
                {inspectedRow ? (
                  <CanvasDL
                    theme={theme}
                    cols={2}
                    items={[
                      { label: t("flags.col.flag"), value: inspectedRow.key },
                      {
                        label: copy.scopeLabel,
                        value: inspectedRow.scopeLabel,
                      },
                      {
                        label: t("flags.col.status"),
                        value: inspectedRow.enabled
                          ? copy.stateEnabled
                          : copy.stateDisabled,
                      },
                      {
                        label: copy.atLabel,
                        value: formatDateTime(inspectedRow.updatedAt),
                      },
                    ]}
                  />
                ) : (
                  <div style={secondaryTextStyle}>{copy.empty}</div>
                )}
              </CanvasCard>
            </div>

            <CanvasCard
              theme={theme}
              title={copy.notesTitle}
              subtitle={copy.notesCardSubtitle}
            >
              <details style={detailsStyle}>
                <summary style={summaryStyle}>{copy.notesSummary}</summary>
                {notes.length > 0 ? (
                  <ul style={noteListStyle}>
                    {notes.map((note, index) => (
                      <li key={`${note}-${index}`}>{note}</li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ ...secondaryTextStyle, marginTop: 12 }}>
                    {copy.notesFallback}
                  </div>
                )}
              </details>
            </CanvasCard>
          </>
        )}
      </div>
    </>
  );
}
