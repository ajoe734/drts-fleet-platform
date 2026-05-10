/**
 * Feature Flags Page
 * Platform-issued flag governance with explicit override visibility.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { actionButtonStyle, emptyStateStyle } from "@/components/platform-ui";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { getPlatformLabel } from "@/lib/localized-labels";
import type {
  FeatureFlag,
  FeatureFlagSummary,
  PlatformAdminTenantRecord,
} from "@drts/contracts";
import {
  CalloutBanner,
  DataCellStack,
  DataFilterBar,
  DataTable,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
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

function groupFeatureFlags(flags: FeatureFlag[]): GroupedFeatureFlag[] {
  const groups = new Map<string, GroupedFeatureFlag>();
  for (const flag of flags) {
    const existing = groups.get(flag.key) ?? {
      key: flag.key,
      global: null,
      overrides: [],
      all: [],
    };
    existing.all.push(flag);
    if (flag.tenantId) {
      existing.overrides.push(flag);
    } else {
      existing.global = flag;
    }
    groups.set(flag.key, existing);
  }
  return [...groups.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
}

function latestUpdatedAt(group: GroupedFeatureFlag) {
  return [...group.all].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )[0]?.updatedAt;
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, selectedTenantId]);

  const loadTenants = useCallback(async () => {
    setTenantLoading(true);
    try {
      const result = await client.listPlatformTenants();
      setTenants(result ?? []);
    } catch (err: unknown) {
      setError(
        (previous) =>
          previous ?? (err instanceof Error ? err.message : String(err)),
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdating(null);
    }
  }

  const copy =
    locale === "en"
      ? {
          eyebrow: "Scope-safe governance",
          subtitle:
            "Global flags remain editable here; tenant overrides are visible for review but stay read-only in this slice.",
          guardrailTitle:
            "Global toggles require an explicit confirmation step.",
          guardrailDescription:
            "This surface treats the global flag as the only editable record. Tenant overrides remain visible so operators can understand blast radius before changing platform defaults.",
          tenantScopeTitle: "Tenant scope",
          tenantScopeHint:
            "Choose a tenant to inspect its override rows alongside platform defaults.",
          tenantScopeLoading: "Loading tenant list…",
          tenantScopeDefault: "Platform default only",
          tenantScopeSummary: "Viewing override context for",
          overrideTitle: "Tenant overrides stay read-only",
          overrideDescription:
            "Override rows are grouped under the same key. This page does not issue override edits or owner metadata because those fields are not in the current contract.",
          stagedEnable: "Stage enable",
          stagedDisable: "Stage disable",
          confirmTitle: "Confirm global flag change",
          confirmDescription:
            "The action below changes the platform-issued default for this key. Existing tenant overrides remain intact and visible after the update.",
          noGlobalRecord: "No editable global record",
          noGlobalDetail:
            "This key currently appears only through tenant overrides, so there is no platform-wide toggle to mutate here.",
          ownerGap:
            "Owner metadata is not exposed by the current contract; description and update time remain the available governance context.",
          groups: "Flag groups",
          enabledGlobals: "Enabled globals",
          overrideGroups: "Keys with overrides",
          overrideRows: "Override rows",
          tableTitle: "Flag registry",
          tableSubtitle:
            "Rows are grouped by key so scope, global state, and tenant exceptions can be reviewed together.",
          tableSummary:
            "Tenant override editing is intentionally out of scope here. Use this view to review scope clarity before changing the global default.",
          filtersLabel: "Flag registry filters",
          allFlags: "All flags",
          withOverrides: "With overrides",
          scopeGlobal: "Global default",
          scopeOverride: "Tenant override",
          contractNotes: "Contract notes",
          noDescription: "No description provided",
        }
      : {
          eyebrow: "Scope-safe 治理",
          subtitle:
            "這裡只允許編輯 global flag；tenant override 只做檢視，方便先評估 blast radius。",
          guardrailTitle: "全域切換必須先經過明確確認步驟。",
          guardrailDescription:
            "這個頁面只把 global flag 當成可編輯紀錄；tenant override 只保留可見性，讓 operator 在變更平台預設前先看清影響範圍。",
          tenantScopeTitle: "Tenant scope",
          tenantScopeHint:
            "選擇 tenant 後，會把該 tenant 的 override 與平台預設一起載入檢視。",
          tenantScopeLoading: "載入 tenant 清單中…",
          tenantScopeDefault: "只看平台預設",
          tenantScopeSummary: "目前檢視的 override scope",
          overrideTitle: "Tenant override 維持唯讀",
          overrideDescription:
            "同一個 key 的 override 會一起分組顯示。這個 slice 不負責 override 編輯，也無法顯示 contract 尚未提供的 owner metadata。",
          stagedEnable: "準備啟用",
          stagedDisable: "準備停用",
          confirmTitle: "確認全域 flag 變更",
          confirmDescription:
            "下方動作會改變這個 key 的平台預設值；既有 tenant override 會保留，並在更新後持續可見。",
          noGlobalRecord: "沒有可編輯的 global record",
          noGlobalDetail:
            "這個 key 目前只透過 tenant override 出現，因此此處沒有平台層級的 toggle 可以修改。",
          ownerGap:
            "目前 contract 沒有提供 owner metadata；治理判斷只能依 description 與 updated time。",
          groups: "Flag 群組",
          enabledGlobals: "已啟用全域值",
          overrideGroups: "含 override 的 key",
          overrideRows: "Override 筆數",
          tableTitle: "Flag registry",
          tableSubtitle:
            "以 key 為單位分組，讓 scope、global state 與 tenant 例外可以一起檢視。",
          tableSummary:
            "Tenant override 編輯刻意不放在這個頁面；先用這裡確認 scope，再決定是否修改 global default。",
          filtersLabel: "Flag registry 篩選",
          allFlags: "全部 flag",
          withOverrides: "含 override",
          scopeGlobal: "全域預設",
          scopeOverride: "Tenant override",
          contractNotes: "Contract 備註",
          noDescription: "尚未提供描述",
        };

  const groupedFlags = groupFeatureFlags(flags);
  const selectedTenant =
    tenants.find((tenant) => tenant.id === selectedTenantId) ?? null;
  const enabledGlobalCount = groupedFlags.filter(
    (group) => group.global?.enabled,
  ).length;
  const groupsWithOverrides = groupedFlags.filter(
    (group) => group.overrides.length > 0,
  ).length;
  const overrideRowCount = groupedFlags.reduce(
    (count, group) => count + group.overrides.length,
    0,
  );

  const filters = [
    {
      value: "all",
      label: copy.allFlags,
      count: groupedFlags.length,
      tone: "neutral",
    },
    {
      value: "enabled",
      label: t("common.enabled"),
      count: enabledGlobalCount,
      tone: "success",
    },
    {
      value: "disabled",
      label: t("common.disabled"),
      count: groupedFlags.filter(
        (group) => group.global && !group.global.enabled,
      ).length,
      tone: "neutral",
    },
    {
      value: "overrides",
      label: copy.withOverrides,
      count: groupsWithOverrides,
      tone: "warning",
    },
  ] as const;

  const filteredFlags = groupedFlags.filter((group) => {
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
  });

  if (loading) {
    return <div style={emptyStateStyle}>{t("flags.loading")}</div>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader
        eyebrow={copy.eyebrow}
        title={t("flags.title")}
        subtitle={copy.subtitle}
        meta={[
          { label: copy.groups, value: groupedFlags.length },
          { label: copy.enabledGlobals, value: enabledGlobalCount },
          { label: copy.overrideGroups, value: groupsWithOverrides },
          { label: copy.overrideRows, value: overrideRowCount },
        ]}
        actions={
          <button
            style={actionButtonStyle({ tone: "secondary" })}
            onClick={() => void loadFlags()}
          >
            {t("common.refresh")}
          </button>
        }
      />

      {error ? (
        <CalloutBanner
          tone="danger"
          title={`${getPlatformLabel(locale, "error")}: ${error}`}
        />
      ) : null}

      <CalloutBanner
        tone="warning"
        eyebrow={copy.eyebrow}
        title={copy.guardrailTitle}
        description={copy.guardrailDescription}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <StatusChip tone="success" label={copy.scopeGlobal} />
            <StatusChip tone="info" label={copy.scopeOverride} />
            <StatusChip tone="neutral" label={copy.ownerGap} />
          </div>
          <div
            style={{
              display: "grid",
              gap: 6,
              gridTemplateColumns: "minmax(220px, 320px)",
            }}
          >
            <strong style={{ fontSize: 13 }}>{copy.tenantScopeTitle}</strong>
            <select
              value={selectedTenantId}
              onChange={(event) => setSelectedTenantId(event.target.value)}
              disabled={tenantLoading}
              style={{
                minHeight: 40,
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.45)",
                padding: "0 12px",
                background: "#fff",
              }}
            >
              <option value="">{copy.tenantScopeDefault}</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} ({tenant.code})
                </option>
              ))}
            </select>
            <span style={{ fontSize: 12.5, color: "#475569" }}>
              {tenantLoading
                ? copy.tenantScopeLoading
                : selectedTenant
                  ? `${copy.tenantScopeSummary} ${selectedTenant.name} (${selectedTenant.code})`
                  : copy.tenantScopeHint}
            </span>
          </div>
          {notes.length > 0 ? (
            <div style={{ display: "grid", gap: 6 }}>
              <strong style={{ fontSize: 13 }}>{copy.contractNotes}</strong>
              <ul
                style={{ margin: 0, paddingInlineStart: 18, color: "#475569" }}
              >
                {notes.map((note, index) => (
                  <li
                    key={`${note}-${index}`}
                    style={{ fontSize: 12.5, lineHeight: 1.5 }}
                  >
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </CalloutBanner>

      {pendingToggle ? (
        <CalloutBanner
          tone={pendingToggle.nextEnabled ? "warning" : "danger"}
          eyebrow={pendingToggle.key}
          title={copy.confirmTitle}
          description={copy.confirmDescription}
          actions={
            <>
              <button
                style={actionButtonStyle({ tone: "secondary" })}
                onClick={() => setPendingToggle(null)}
                disabled={updating === pendingToggle.key}
              >
                {t("common.cancel")}
              </button>
              <button
                style={actionButtonStyle({ tone: "primary" })}
                onClick={() => void handleConfirmToggle()}
                disabled={updating === pendingToggle.key}
              >
                {updating === pendingToggle.key
                  ? t("common.updating")
                  : pendingToggle.nextEnabled
                    ? copy.stagedEnable
                    : copy.stagedDisable}
              </button>
            </>
          }
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <StatusChip
              tone={pendingToggle.nextEnabled ? "warning" : "danger"}
              label={`${copy.scopeGlobal} · ${pendingToggle.key}`}
            />
            <StatusChip
              tone={pendingToggle.overrideCount > 0 ? "warning" : "neutral"}
              label={`${copy.scopeOverride} · ${pendingToggle.overrideCount}`}
            />
          </div>
        </CalloutBanner>
      ) : null}

      <KpiRow minWidth="180px">
        <KpiCard
          label={copy.groups}
          value={groupedFlags.length}
          detail={copy.overrideTitle}
          tone="neutral"
        />
        <KpiCard
          label={copy.enabledGlobals}
          value={enabledGlobalCount}
          detail={
            locale === "en"
              ? "Editable platform defaults"
              : "可編輯的平台預設值"
          }
          tone={enabledGlobalCount > 0 ? "success" : "neutral"}
        />
        <KpiCard
          label={copy.overrideGroups}
          value={groupsWithOverrides}
          detail={copy.overrideDescription}
          tone={groupsWithOverrides > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label={copy.contractNotes}
          value={notes.length}
          detail={copy.ownerGap}
          tone={notes.length > 0 ? "info" : "neutral"}
        />
      </KpiRow>

      <DataViewCard
        title={copy.tableTitle}
        subtitle={copy.tableSubtitle}
        tone="warning"
        summary={copy.tableSummary}
        filters={
          <DataFilterBar
            value={filter}
            onChange={(value) => setFilter(value as FlagFilter)}
            ariaLabel={copy.filtersLabel}
            filters={filters}
          />
        }
        footer={`${filteredFlags.length} / ${groupedFlags.length} ${locale === "en" ? "flag groups shown" : "個 flag 群組已顯示"}`}
      >
        <DataTable
          tone="warning"
          minWidth={1060}
          empty={t("flags.empty")}
          columns={[
            { label: t("flags.col.flag"), width: "24%" },
            { label: t("flags.col.status"), width: "12%" },
            { label: t("flags.col.tenantOverride"), width: "20%" },
            { label: t("flags.col.description"), width: "24%" },
            { label: t("flags.col.updated"), width: "12%" },
            { label: t("flags.col.actions"), width: "8%", align: "right" },
          ]}
        >
          {filteredFlags.map((group) => {
            const effectiveRecord = group.global ?? group.overrides[0] ?? null;
            const overrideTenantList = group.overrides.map(
              (flag) => flag.tenantId,
            );
            const latestUpdated =
              latestUpdatedAt(group) ?? effectiveRecord?.updatedAt ?? "";
            return (
              <Tr
                key={group.key}
                highlighted={
                  group.overrides.length > 0 || group.global?.enabled === true
                }
              >
                <Td>
                  <DataCellStack
                    primary={
                      <code
                        style={{
                          fontSize: 12.5,
                          padding: "2px 6px",
                          borderRadius: 6,
                          background: "#f8fafc",
                        }}
                      >
                        {group.key}
                      </code>
                    }
                    secondary={
                      group.overrides.length > 0
                        ? `${group.overrides.length} ${locale === "en" ? "tenant overrides" : "個 tenant override"}`
                        : copy.scopeGlobal
                    }
                    tertiary={
                      group.global ? copy.scopeGlobal : copy.noGlobalRecord
                    }
                  />
                </Td>
                <Td>
                  {group.global ? (
                    <StatusChip
                      tone={group.global.enabled ? "success" : "neutral"}
                      label={
                        group.global.enabled
                          ? t("common.enabled")
                          : t("common.disabled")
                      }
                    />
                  ) : (
                    <StatusChip tone="warning" label={copy.noGlobalRecord} />
                  )}
                </Td>
                <Td>
                  <DataCellStack
                    primary={
                      group.overrides.length > 0
                        ? `${copy.scopeOverride} · ${group.overrides.length}`
                        : copy.scopeGlobal
                    }
                    secondary={
                      group.overrides.length > 0
                        ? overrideTenantList.slice(0, 3).join(", ")
                        : t("flags.global")
                    }
                    tertiary={
                      group.overrides.length > 3
                        ? locale === "en"
                          ? `+${group.overrides.length - 3} more tenants`
                          : `另有 ${group.overrides.length - 3} 個 tenant`
                        : undefined
                    }
                  />
                </Td>
                <Td muted>
                  <DataCellStack
                    primary={effectiveRecord?.description || copy.noDescription}
                    secondary={copy.ownerGap}
                  />
                </Td>
                <Td muted>{formatDateTime(latestUpdated)}</Td>
                <Td align="right">
                  {group.global ? (
                    <button
                      style={actionButtonStyle({
                        tone: "secondary",
                        size: "sm",
                      })}
                      onClick={() =>
                        setPendingToggle({
                          key: group.key,
                          nextEnabled: !group.global!.enabled,
                          overrideCount: group.overrides.length,
                        })
                      }
                    >
                      {group.global.enabled
                        ? copy.stagedDisable
                        : copy.stagedEnable}
                    </button>
                  ) : (
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>
                      {copy.noGlobalRecord}
                    </span>
                  )}
                </Td>
              </Tr>
            );
          })}
        </DataTable>
      </DataViewCard>
    </div>
  );
}
