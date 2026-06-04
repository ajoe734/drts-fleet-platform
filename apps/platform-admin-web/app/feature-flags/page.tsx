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

type ActionIntent = "toggle" | "override";

type ToggleDraft = {
  intent: "toggle";
  key: string;
  tenantId: string | null;
  description: string;
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
  isTenantOverride: boolean;
  rolloutLabel: "mid_rollout" | "rolled_out" | "deprecated";
  rolloutTone: "warn" | "success" | "danger";
  updatedAt: string;
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

function toFlagTableRow(flag: FeatureFlag): FlagTableRow {
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
    description: flag.description?.trim() ?? "",
    enabled: flag.enabled,
    tenantId: flag.tenantId ?? null,
    isTenantOverride,
    rolloutLabel,
    rolloutTone:
      rolloutLabel === "deprecated"
        ? "danger"
        : rolloutLabel === "rolled_out"
          ? "success"
          : "warn",
    updatedAt: flag.updatedAt,
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
  const { t } = useTranslation();
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
  const filterOptions: RolloutFilterOption[] = [
    {
      value: "all",
      label: t("common.all"),
      count: rows.length,
    },
    {
      value: "mid_rollout",
      label: t("featureFlagsAdmin.rolloutMid"),
      count: midRolloutCount,
    },
    {
      value: "rolled_out",
      label: t("featureFlagsAdmin.rolloutFull"),
      count: rolledOutCount,
    },
    {
      value: "deprecated",
      label: t("featureFlagsAdmin.rolloutDeprecated"),
      count: deprecatedCount,
    },
    {
      value: "tenant_overrides",
      label: t("featureFlagsAdmin.summaryTenantOverride"),
      count: overrideCount,
    },
  ];

  const currentScope = selectedTenant
    ? t("featureFlagsAdmin.tenantOptionLabel", {
        name: selectedTenant.name,
        code: selectedTenant.code,
      })
    : t("featureFlagsAdmin.scopePlatformDefault");

  function getRolloutText(rolloutLabel: FlagTableRow["rolloutLabel"]) {
    switch (rolloutLabel) {
      case "deprecated":
        return t("featureFlagsAdmin.rolloutDeprecated");
      case "rolled_out":
        return t("featureFlagsAdmin.rolloutFull");
      case "mid_rollout":
      default:
        return t("featureFlagsAdmin.rolloutMid");
    }
  }

  function getToggleActionText(nextEnabled: boolean) {
    return nextEnabled
      ? t("featureFlagsAdmin.confirmEnable")
      : t("featureFlagsAdmin.confirmDisable");
  }

  function getScopeLabel(row: FlagTableRow) {
    return row.isTenantOverride
      ? t("featureFlagsAdmin.scopeTenantOverride", {
          tenantId: row.tenantId ?? "",
        })
      : t("featureFlagsAdmin.scopePlatformDefault");
  }

  const columns: CanvasTableColumn<FlagTableRow>[] = [
    {
      h: t("featureFlagsAdmin.keyHeader"),
      w: 300,
      r: (row) => (
        <div style={keyCellStyle}>
          <code style={codeStyle}>{row.key}</code>
          <div style={inlinePillRowStyle}>
            <CanvasPill theme={theme} tone={row.rolloutTone}>
              {getRolloutText(row.rolloutLabel)}
            </CanvasPill>
          </div>
          <div style={secondaryTextStyle}>
            {row.description || t("featureFlagsAdmin.noDescription")}
          </div>
        </div>
      ),
    },
    {
      h: t("featureFlagsAdmin.scopeHeader"),
      w: 220,
      r: (row) => (
        <div style={keyCellStyle}>
          <div style={inlinePillRowStyle}>
            <CanvasPill
              theme={theme}
              tone={row.isTenantOverride ? "accent" : "neutral"}
            >
              {getScopeLabel(row)}
            </CanvasPill>
          </div>
          <div style={secondaryTextStyle}>
            {row.tenantId
              ? row.tenantId
              : t("featureFlagsAdmin.scopePlatformDefault")}
          </div>
        </div>
      ),
    },
    {
      h: t("featureFlagsAdmin.stateHeader"),
      w: 200,
      r: (row) => (
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
            aria-label={t("featureFlagsAdmin.toggleAriaLabel", {
              key: row.key,
            })}
            onClick={() => {
              setActionError(null);
              setActionReason("");
              setPendingAction({
                intent: "toggle",
                key: row.key,
                tenantId: row.tenantId,
                description: row.description,
                nextEnabled: !row.enabled,
                scopeLabel: getScopeLabel(row),
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
      h: t("featureFlagsAdmin.updatedByHeader"),
      w: 160,
      r: () => (
        <span style={secondaryTextStyle}>
          {t("featureFlagsAdmin.updatedByValue")}
        </span>
      ),
    },
    {
      h: t("featureFlagsAdmin.updatedAtHeader"),
      w: 170,
      mono: true,
      r: (row) => formatDateTime(row.updatedAt),
    },
    {
      h: t("featureFlagsAdmin.actionsHeader"),
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
                description: row.description,
                nextEnabled: !row.enabled,
                scopeLabel: getScopeLabel(row),
              });
            }}
            disabled={updating === row.key}
          >
            {t("featureFlagsAdmin.toggle")}
          </CanvasBtn>
          <CanvasBtn
            theme={theme}
            size="xs"
            variant="ghost"
            onClick={() => setHistoryKey(row.key)}
          >
            {t("featureFlagsAdmin.history")}
          </CanvasBtn>
        </div>
      ),
    },
  ];

  async function handleConfirmAction() {
    if (!pendingAction) {
      return;
    }

    const reason = actionReason.trim();
    if (!reason) {
      setActionError(t("featureFlagsAdmin.reasonRequired"));
      return;
    }

    if (pendingAction.intent === "override" && !pendingAction.tenantId) {
      setActionError(t("featureFlagsAdmin.overrideTenantRequired"));
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
          : t("featureFlagsAdmin.scopeTenantOverride", {
              tenantId: pendingAction.tenantId,
            });
      const summary =
        pendingAction.intent === "toggle"
          ? t("featureFlagsAdmin.receiptToggleSummary", {
              action: getToggleActionText(pendingAction.nextEnabled),
              key: pendingAction.key,
            })
          : t("featureFlagsAdmin.receiptCreateSummary", {
              key: pendingAction.key,
            });

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
      setActionError(t("featureFlagsAdmin.addOverrideHint"));
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
        title={t("featureFlagsAdmin.pageTitle")}
        subtitle={t("featureFlagsAdmin.pageSubtitle")}
        actions={
          <>
            <CanvasPill theme={theme} tone="accent" dot>
              {t("featureFlagsAdmin.metaPill")}
            </CanvasPill>
            <CanvasBtn
              theme={theme}
              variant="secondary"
              icon="arrow"
              onClick={() => void loadFlags()}
            >
              {loading && flags.length > 0
                ? t("featureFlagsAdmin.refreshing")
                : t("common.refresh")}
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
              {t("featureFlagsAdmin.addOverride")}
            </CanvasBtn>
          </>
        }
      />

      <div style={bodyStyle}>
        {loading && flags.length === 0 ? (
          <CanvasCard
            theme={theme}
            title={t("featureFlagsAdmin.pageTitle")}
            subtitle={t("flags.loading")}
          >
            <div style={loadingStateStyle}>{t("flags.loading")}</div>
          </CanvasCard>
        ) : (
          <>
            {error ? (
              <CanvasBanner
                theme={theme}
                tone="danger"
                title={error}
                body={t("featureFlagsAdmin.errorBody")}
              />
            ) : null}

            {auditReceipts.length > 0 ? (
              <CanvasBanner
                theme={theme}
                tone="success"
                title={t("featureFlagsAdmin.actionApplied")}
                body={t("featureFlagsAdmin.receiptBannerBody", {
                  summary: auditReceipts[0]?.summary ?? "",
                  scope: auditReceipts[0]?.scopeLabel ?? "",
                  requestedAt: formatDateTime(
                    auditReceipts[0]?.requestedAt ?? "",
                  ),
                })}
              />
            ) : null}

            <div style={sectionStackStyle}>
              <CanvasCard
                theme={theme}
                title={t("featureFlagsAdmin.tableTitle")}
                subtitle={t("featureFlagsAdmin.tableSubtitle")}
                style={{ overflow: "hidden" }}
              >
                <div style={tableHeaderStackStyle}>
                  <div style={toolbarStyle}>
                    <CanvasField
                      theme={theme}
                      label={t("featureFlagsAdmin.scopeField")}
                    >
                      <select
                        value={selectedTenantId}
                        onChange={(event) =>
                          setSelectedTenantId(event.target.value)
                        }
                        disabled={tenantLoading}
                        style={selectStyle(theme)}
                      >
                        <option value="">
                          {t("featureFlagsAdmin.scopePlatformDefault")}
                        </option>
                        {tenants.map((tenant) => (
                          <option key={tenant.id} value={tenant.id}>
                            {t("featureFlagsAdmin.tenantOptionLabel", {
                              name: tenant.name,
                              code: tenant.code,
                            })}
                          </option>
                        ))}
                      </select>
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={t("featureFlagsAdmin.searchField")}
                    >
                      <input
                        type="search"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder={t("featureFlagsAdmin.searchPlaceholder")}
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
                      {t("featureFlagsAdmin.laneMeta")}
                    </CanvasPill>
                    <CanvasPill theme={theme} tone="neutral">
                      {t("featureFlagsAdmin.scopeMeta")}: {currentScope}
                    </CanvasPill>
                    <CanvasPill
                      theme={theme}
                      tone={enabledCount > 0 ? "success" : "neutral"}
                    >
                      {t("featureFlagsAdmin.enabledMeta", {
                        count: enabledCount,
                      })}
                    </CanvasPill>
                    <CanvasPill theme={theme} tone="neutral">
                      {t("featureFlagsAdmin.disabledMeta", {
                        count: disabledCount,
                      })}
                    </CanvasPill>
                    <CanvasPill
                      theme={theme}
                      tone={overrideCount > 0 ? "accent" : "neutral"}
                    >
                      {t("featureFlagsAdmin.overrideMeta", {
                        count: overrideCount,
                      })}
                    </CanvasPill>
                    <CanvasPill theme={theme} tone="neutral">
                      {t("featureFlagsAdmin.resultMeta", {
                        count: filteredRows.length,
                      })}
                    </CanvasPill>
                    <span style={{ flex: 1 }} />
                    <CanvasPill theme={theme} tone="neutral">
                      {t("featureFlagsAdmin.filterPill")}
                    </CanvasPill>
                  </div>
                </div>

                <div style={fieldHintStyle}>
                  {tenantLoading
                    ? t("featureFlagsAdmin.scopeLoading")
                    : t("featureFlagsAdmin.scopeHint")}
                </div>

                {filteredRows.length === 0 ? (
                  <div style={emptyStateStyle}>
                    {searchTerm || rolloutFilter !== "all"
                      ? t("featureFlagsAdmin.noFlagsInFilter")
                      : t("flags.empty")}
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
                    {t("featureFlagsAdmin.summaryPlatformDefault")}:{" "}
                    {platformDefaultCount}
                  </CanvasPill>
                  <CanvasPill theme={theme} tone="neutral">
                    {t("featureFlagsAdmin.summaryTenantOverride")}:{" "}
                    {overrideCount}
                  </CanvasPill>
                  <CanvasPill theme={theme} tone="neutral">
                    {t("featureFlagsAdmin.notesMeta")}
                  </CanvasPill>
                  <CanvasPill theme={theme} tone="neutral">
                    {t("featureFlagsAdmin.receiptsMeta", {
                      count: auditReceipts.length,
                    })}
                  </CanvasPill>
                </div>

                <div style={secondaryPanelStyle}>
                  <details
                    style={detailsStyle}
                    open={Boolean(pendingAction || actionError)}
                  >
                    <summary style={detailSummaryStyle}>
                      {t("featureFlagsAdmin.actionComposerTitle")}
                    </summary>
                    <div style={composerSummaryStyle}>
                      <CanvasBanner
                        theme={theme}
                        tone="warn"
                        title={t("featureFlagsAdmin.riskTitle")}
                        body={t("featureFlagsAdmin.riskBody")}
                      />
                      <div style={composerLeadStyle}>
                        <div style={secondaryTextStyle}>
                          {t("featureFlagsAdmin.secondaryPanelSubtitle")}
                        </div>
                      </div>
                      {pendingAction ? (
                        <>
                          {pendingAction.intent === "override" ? (
                            <>
                              <CanvasField
                                theme={theme}
                                label={t(
                                  "featureFlagsAdmin.overrideTenantField",
                                )}
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
                                  <option value="">
                                    {t(
                                      "featureFlagsAdmin.scopePlatformDefault",
                                    )}
                                  </option>
                                  {tenants.map((tenant) => (
                                    <option key={tenant.id} value={tenant.id}>
                                      {t(
                                        "featureFlagsAdmin.tenantOptionLabel",
                                        {
                                          name: tenant.name,
                                          code: tenant.code,
                                        },
                                      )}
                                    </option>
                                  ))}
                                </select>
                              </CanvasField>
                              <CanvasField
                                theme={theme}
                                label={t("featureFlagsAdmin.overrideKeyField")}
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
                                label={t(
                                  "featureFlagsAdmin.overrideStateField",
                                )}
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
                                    {t("common.enabled")}
                                  </option>
                                  <option value="disabled">
                                    {t("common.disabled")}
                                  </option>
                                </select>
                              </CanvasField>

                              <CanvasField
                                theme={theme}
                                label={t(
                                  "featureFlagsAdmin.overrideDescriptionField",
                                )}
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
                                {t("featureFlagsAdmin.overrideDescriptionHint")}
                              </div>
                            </>
                          ) : (
                            <div style={secondaryTextStyle}>
                              {t("featureFlagsAdmin.pendingToggleSummary", {
                                key: pendingAction.key,
                                scope: pendingAction.scopeLabel,
                                action: getToggleActionText(
                                  pendingAction.nextEnabled,
                                ),
                              })}
                            </div>
                          )}

                          <CanvasField
                            theme={theme}
                            label={t("featureFlagsAdmin.reasonLabel")}
                          >
                            <textarea
                              value={actionReason}
                              onChange={(event) =>
                                setActionReason(event.target.value)
                              }
                              placeholder={t(
                                "featureFlagsAdmin.reasonPlaceholder",
                              )}
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
                              {t("common.cancel")}
                            </CanvasBtn>
                            <CanvasBtn
                              theme={theme}
                              variant="primary"
                              onClick={() => void handleConfirmAction()}
                              disabled={Boolean(updating)}
                            >
                              {updating
                                ? t("common.updating")
                                : pendingAction.intent === "toggle"
                                  ? getToggleActionText(
                                      pendingAction.nextEnabled,
                                    )
                                  : t("featureFlagsAdmin.confirmCreate")}
                            </CanvasBtn>
                          </div>
                        </>
                      ) : (
                        <div style={secondaryTextStyle}>
                          {actionError ??
                            t("featureFlagsAdmin.actionComposerIdle")}
                        </div>
                      )}
                    </div>
                  </details>

                  <details style={detailsStyle}>
                    <summary style={detailSummaryStyle}>
                      {t("featureFlagsAdmin.notesTitle")}
                    </summary>
                    {notes.length > 0 ? (
                      <ul style={noteListStyle}>
                        {notes.map((note, index) => (
                          <li key={`${note}-${index}`}>{note}</li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ ...secondaryTextStyle, marginTop: 10 }}>
                        {t("featureFlagsAdmin.notesEmpty")}
                      </div>
                    )}
                  </details>

                  <details style={detailsStyle} open={Boolean(historyKey)}>
                    <summary style={detailSummaryStyle}>
                      {t("featureFlagsAdmin.historyTitle")}
                    </summary>
                    <div style={{ ...secondaryTextStyle, marginTop: 10 }}>
                      {historyKey
                        ? t("featureFlagsAdmin.historyFocusKey", {
                            key: historyKey,
                          })
                        : t("featureFlagsAdmin.historyFocusAll")}
                    </div>
                    <div style={{ ...secondaryTextStyle, marginTop: 6 }}>
                      {t("featureFlagsAdmin.historyHint")}
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
                        {t("featureFlagsAdmin.historyEmpty")}
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
                          {t("featureFlagsAdmin.showAllReceipts")}
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
