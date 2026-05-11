import React, { useCallback, useEffect, useState } from "react";
import { CredentialStatus } from "@drts/contracts";
import {
  actionButtonStyle,
  emptyStateStyle,
  surfaceCardStyle,
} from "@/components/platform-ui";
import type {
  AdapterHealthRecord,
  PlatformAdapter,
  UpdatePlatformAdapterCommand,
} from "@drts/contracts";
import { EditAdapterModal } from "./EditAdapterModal";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import {
  AuthorityBadge,
  DataCellStack,
  DataFilterBar,
  DataTable,
  DataViewCard,
  KpiCard,
  KpiRow,
  StatusChip,
  Td,
  Tr,
} from "@drts/ui-web";

type AdapterFilter = "all" | "forwarded" | "enabled" | "attention";

function statusToneForBoolean(enabled: boolean | undefined) {
  return enabled ? "success" : "neutral";
}

function statusToneForHealth(
  status: PlatformAdapter["healthStatus"]["status"],
) {
  switch (status) {
    case "HEALTHY":
      return "success";
    case "DEGRADED":
      return "warning";
    case "UNHEALTHY":
      return "danger";
  }
}

function statusToneForRollout(status: PlatformAdapter["rolloutStatus"]) {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "IN_PROGRESS":
      return "info";
    case "FAILED":
      return "danger";
    case "NOT_STARTED":
    default:
      return "neutral";
  }
}

function statusToneForCredential(status: PlatformAdapter["credentialStatus"]) {
  switch (status) {
    case "VALID":
      return "success";
    case "PENDING":
      return "info";
    case "INVALID":
    case "EXPIRED":
      return "danger";
    case "NOT_CONFIGURED":
    default:
      return "warning";
  }
}

function resolveCredentialStatus(
  adapter: PlatformAdapter,
  liveRecord?: AdapterHealthRecord,
): PlatformAdapter["credentialStatus"] {
  switch (liveRecord?.credentialStatus) {
    case "valid":
      return CredentialStatus.VALID;
    case "invalid":
      return CredentialStatus.INVALID;
    case "expired":
      return CredentialStatus.EXPIRED;
    case "not_configured":
      return CredentialStatus.NOT_CONFIGURED;
    default:
      return adapter.credentialStatus;
  }
}

function statusToneForLiveHealth(status?: AdapterHealthRecord["status"]) {
  switch (status) {
    case "healthy":
      return "success" as const;
    case "degraded":
      return "warning" as const;
    case "down":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

function statusToneForAuth(status?: AdapterHealthRecord["authStatus"]) {
  switch (status) {
    case "authenticated":
      return "success" as const;
    case "reauth_required":
      return "warning" as const;
    case "invalid":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

function statusToneForWebhook(status?: AdapterHealthRecord["webhookStatus"]) {
  switch (status) {
    case "healthy":
      return "success" as const;
    case "failing":
      return "danger" as const;
    case "not_configured":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

function authorityTone(
  mode: PlatformAdapter["policies"]["financeAuthorityMode"],
) {
  switch (mode) {
    case "OWNED":
      return "success";
    case "SHADOW":
      return "warning";
    case "EXTERNAL":
    default:
      return "info";
  }
}

function hasLiveControlAttention(liveRecord?: AdapterHealthRecord) {
  if (!liveRecord) {
    return false;
  }

  return (
    liveRecord.status !== "healthy" ||
    liveRecord.authStatus === "reauth_required" ||
    liveRecord.authStatus === "invalid" ||
    liveRecord.webhookStatus === "failing" ||
    liveRecord.webhookStatus === "not_configured" ||
    liveRecord.credentialStatus === "invalid" ||
    liveRecord.credentialStatus === "expired" ||
    liveRecord.credentialStatus === "not_configured"
  );
}

function isAttentionAdapter(
  adapter: PlatformAdapter,
  liveRecord?: AdapterHealthRecord,
) {
  return (
    adapter.warn === true ||
    adapter.draft === true ||
    adapter.healthStatus.status !== "HEALTHY" ||
    adapter.credentialStatus !== "VALID" ||
    adapter.rolloutStatus === "FAILED" ||
    hasLiveControlAttention(liveRecord)
  );
}

export function AdapterList() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [adapters, setAdapters] = useState<PlatformAdapter[]>([]);
  const [liveHealth, setLiveHealth] = useState<AdapterHealthRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AdapterFilter>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAdapter, setSelectedAdapter] =
    useState<PlatformAdapter | null>(null);

  const loadAdapters = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [fetchedAdapters, fetchedLiveHealth] = await Promise.all([
        client.listPlatformAdapters(),
        client.getForwarderAdaptersHealth() as Promise<AdapterHealthRecord[]>,
      ]);
      setAdapters(fetchedAdapters);
      setLiveHealth(fetchedLiveHealth);
    } catch (err: unknown) {
      console.error("Error fetching adapters:", err);
      setError(
        err instanceof Error
          ? err.message
          : t("adapterRegistry.errors.fetchFailed"),
      );
    } finally {
      setIsLoading(false);
    }
  }, [client, t]);

  useEffect(() => {
    void loadAdapters();
  }, [loadAdapters]);

  const copy =
    locale === "en"
      ? {
          subtitle:
            "Shared data-view baseline for adapter readiness, rollout posture, and finance authority ownership.",
          summary:
            "Compact rows, pill filters, status chips, and owned/forwarded authority badges all come from shared ui-web primitives.",
          showing: "Showing",
          ownedTag: "owned",
          forwardedTag: "forwarded",
          financeTag: "finance",
          health: "Health",
          enabled: "Enabled",
          webhook: "Webhook",
          authority: "Authority",
          rollout: "Rollout",
          all: "All",
          forwarded: "Forwarded",
          enabledFilter: "Enabled",
          attention: "Attention",
          liveReadiness: "Live readiness",
          liveStatus: "Live",
          credentials: "Credentials",
          auth: "Auth",
          registered: "Registered adapters",
          forwardedCount: "Forwarded posture",
          attentionCount: "Needs attention",
          liveIncidents: "Live health incidents",
          healthDetail: "Last live check",
          noIssues: "No active error reported",
          actions: "Actions",
        }
      : {
          subtitle:
            "以共享 data-view primitive 呈現 adapter readiness、rollout posture 與財務 authority 歸屬。",
          summary:
            "這裡的 compact table、filter pills、status chips、owned/forwarded authority badges 都直接走 ui-web 共用層。",
          showing: "目前顯示",
          ownedTag: "owned",
          forwardedTag: "forwarded",
          financeTag: "finance",
          health: "健康",
          enabled: "啟用",
          webhook: "Webhook",
          authority: "Authority",
          rollout: "Rollout",
          all: "全部",
          forwarded: "轉派",
          enabledFilter: "已啟用",
          attention: "需關注",
          liveReadiness: "即時狀態",
          liveStatus: "Live",
          credentials: "憑證",
          auth: "Auth",
          registered: "已註冊 adapter",
          forwardedCount: "轉派 posture",
          attentionCount: "需處理項目",
          liveIncidents: "即時健康異常",
          healthDetail: "最近一次 live check",
          noIssues: "目前沒有回報錯誤",
          actions: "操作",
        };

  const liveHealthByCode = new Map<string, AdapterHealthRecord>(
    liveHealth.map((record) => [record.platformCode, record]),
  );

  const attentionAdapters = adapters.filter((adapter) =>
    isAttentionAdapter(adapter, liveHealthByCode.get(adapter.platformCode)),
  );

  const filteredAdapters = adapters.filter((adapter) => {
    const liveRecord = liveHealthByCode.get(adapter.platformCode);
    switch (filter) {
      case "forwarded":
        return adapter.isForwarded;
      case "enabled":
        return adapter.config.isEnabled;
      case "attention":
        return isAttentionAdapter(adapter, liveRecord);
      case "all":
      default:
        return true;
    }
  });

  const filters = [
    { value: "all", label: copy.all, count: adapters.length, tone: "neutral" },
    {
      value: "forwarded",
      label: copy.forwarded,
      count: adapters.filter((adapter) => adapter.isForwarded).length,
      tone: "warning",
    },
    {
      value: "enabled",
      label: copy.enabledFilter,
      count: adapters.filter((adapter) => adapter.config.isEnabled).length,
      tone: "success",
    },
    {
      value: "attention",
      label: copy.attention,
      count: attentionAdapters.length,
      tone: "danger",
    },
  ] as const satisfies readonly {
    value: AdapterFilter;
    label: string;
    count: number;
    tone: "neutral" | "warning" | "success" | "danger";
  }[];

  const attentionCount = attentionAdapters.length;
  const forwardedCount = adapters.filter(
    (adapter) => adapter.isForwarded,
  ).length;
  const liveIncidentCount = liveHealth.filter(
    (record) => record.status !== "healthy",
  ).length;

  const handleEditClick = (adapter: PlatformAdapter) => {
    setSelectedAdapter(adapter);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedAdapter(null);
  };

  const handleSaveAdapter = async (
    updatedData: UpdatePlatformAdapterCommand,
  ): Promise<void> => {
    if (!selectedAdapter) return;

    try {
      const updatedAdapter = await client.updatePlatformAdapter(
        selectedAdapter.id,
        updatedData,
      );
      setAdapters((prevAdapters) =>
        prevAdapters.map((adapter) =>
          adapter.id === selectedAdapter.id ? updatedAdapter : adapter,
        ),
      );
    } catch (err: unknown) {
      console.error("Error updating adapter:", err);
      const message =
        err instanceof Error
          ? err.message
          : t("adapterRegistry.errors.updateFailed");
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  };

  return (
    <DataViewCard
      title={t("adapterRegistry.title")}
      subtitle={copy.subtitle}
      tone="warning"
      density="compact"
      summary={copy.summary}
      filters={
        <DataFilterBar
          value={filter}
          onChange={setFilter}
          filters={filters}
          ariaLabel={t("adapterRegistry.title")}
        />
      }
      footer={`${copy.showing} ${filteredAdapters.length} / ${adapters.length}`}
    >
      {!isLoading && !error ? (
        <KpiRow minWidth="180px">
          <KpiCard
            label={copy.registered}
            value={adapters.length}
            detail={copy.summary}
            tone="neutral"
          />
          <KpiCard
            label={copy.forwardedCount}
            value={forwardedCount}
            detail={copy.forwarded}
            tone={forwardedCount > 0 ? "warning" : "neutral"}
          />
          <KpiCard
            label={copy.attentionCount}
            value={attentionCount}
            detail={copy.attention}
            tone={attentionCount > 0 ? "danger" : "success"}
          />
          <KpiCard
            label={copy.liveIncidents}
            value={liveIncidentCount}
            detail={copy.healthDetail}
            tone={liveIncidentCount > 0 ? "warning" : "success"}
          />
        </KpiRow>
      ) : null}

      {isLoading && (
        <div style={emptyStateStyle}>{t("adapterRegistry.loading")}</div>
      )}
      {error && (
        <div
          style={{ ...surfaceCardStyle, borderColor: "rgba(239,68,68,0.3)" }}
        >
          <p style={{ color: "#dc2626", margin: 0 }}>
            {getPlatformLabel(locale, "error")}: {error}
          </p>
        </div>
      )}

      {!isLoading && !error && filteredAdapters.length > 0 ? (
        <DataTable
          density="compact"
          tone="warning"
          minWidth={1120}
          columns={[
            { label: t("adapterRegistry.col.name"), width: "20%" },
            { label: t("adapterRegistry.col.environment"), width: "14%" },
            { label: copy.liveReadiness, width: "28%" },
            { label: copy.authority, width: "14%" },
            { label: copy.rollout, width: "16%" },
            {
              label: copy.actions,
              width: "8%",
              align: "right",
            },
          ]}
        >
          {filteredAdapters.map((adapter) => {
            const liveRecord = liveHealthByCode.get(adapter.platformCode);
            const displayedCredentialStatus = resolveCredentialStatus(
              adapter,
              liveRecord,
            );
            const lastLiveCheck =
              liveRecord?.lastCheckedAt ??
              adapter.healthStatus.lastCheckTimestamp;
            const lastLiveError =
              liveRecord?.lastError ?? adapter.healthStatus.message;
            return (
              <Tr
                key={adapter.id}
                highlighted={isAttentionAdapter(adapter, liveRecord)}
              >
                <Td density="compact">
                  <DataCellStack
                    primary={
                      <strong style={{ fontSize: 13.5 }}>{adapter.name}</strong>
                    }
                    secondary={adapter.platformCode}
                    tertiary={`${adapter.version} · ${formatPlatformCodeLabel(
                      locale,
                      adapter.adapterType,
                    )}`}
                  />
                </Td>
                <Td density="compact">
                  <DataCellStack
                    primary={formatPlatformCodeLabel(
                      locale,
                      adapter.environment,
                    )}
                    secondary={`${t("adapterRegistry.col.version")} ${adapter.version}`}
                    tertiary={`${t("adapterRegistry.col.rolloutStatus")} · ${formatPlatformCodeLabel(
                      locale,
                      adapter.rolloutStage,
                    )}`}
                  />
                </Td>
                <Td density="compact">
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <StatusChip
                        tone={statusToneForBoolean(adapter.config.isEnabled)}
                        label={
                          adapter.config.isEnabled
                            ? t("common.enabled")
                            : t("common.disabled")
                        }
                        authorityLabel={copy.enabled}
                      />
                      <StatusChip
                        tone={statusToneForLiveHealth(liveRecord?.status)}
                        label={formatPlatformCodeLabel(
                          locale,
                          liveRecord?.status ?? adapter.healthStatus.status,
                        )}
                        authorityLabel={copy.liveStatus}
                      />
                      <StatusChip
                        tone={statusToneForCredential(
                          displayedCredentialStatus,
                        )}
                        label={formatPlatformCodeLabel(
                          locale,
                          displayedCredentialStatus,
                        )}
                        authorityLabel={copy.credentials}
                      />
                      <StatusChip
                        tone={statusToneForWebhook(liveRecord?.webhookStatus)}
                        label={formatPlatformCodeLabel(
                          locale,
                          liveRecord?.webhookStatus ??
                            (adapter.webhookStatus?.isEnabled
                              ? "healthy"
                              : adapter.webhookStatus?.isEnabled === false
                                ? "not_configured"
                                : "unknown"),
                        )}
                        authorityLabel={copy.webhook}
                      />
                      <StatusChip
                        tone={statusToneForAuth(liveRecord?.authStatus)}
                        label={formatPlatformCodeLabel(
                          locale,
                          liveRecord?.authStatus ?? "unknown",
                        )}
                        authorityLabel={copy.auth}
                      />
                    </div>
                    <DataCellStack
                      primary={`${copy.healthDetail} · ${formatDateTime(lastLiveCheck ?? "")}`}
                      secondary={lastLiveError || copy.noIssues}
                    />
                  </div>
                </Td>
                <Td density="compact">
                  <AuthorityBadge
                    tone={authorityTone(adapter.policies.financeAuthorityMode)}
                    category={
                      adapter.isForwarded ? copy.forwardedTag : copy.ownedTag
                    }
                    label={formatPlatformCodeLabel(
                      locale,
                      adapter.policies.financeAuthorityMode,
                    )}
                  />
                </Td>
                <Td density="compact">
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <StatusChip
                        tone={statusToneForRollout(adapter.rolloutStatus)}
                        label={formatPlatformCodeLabel(
                          locale,
                          adapter.rolloutStatus,
                        )}
                        authorityLabel={copy.rollout}
                      />
                      <StatusChip
                        tone={statusToneForHealth(adapter.healthStatus.status)}
                        label={formatPlatformCodeLabel(
                          locale,
                          adapter.healthStatus.status,
                        )}
                        authorityLabel={copy.health}
                      />
                    </div>
                    <DataCellStack
                      primary={`${t("adapterRegistry.col.version")} ${adapter.version}`}
                      secondary={`${copy.forwardedTag} ${adapter.policies.serviceBuckets.join(", ") || t("common.na")}`}
                    />
                  </div>
                </Td>
                <Td density="compact" align="right">
                  <button
                    onClick={() => handleEditClick(adapter)}
                    style={actionButtonStyle({ tone: "secondary", size: "sm" })}
                  >
                    {t("common.edit")}
                  </button>
                </Td>
              </Tr>
            );
          })}
        </DataTable>
      ) : (
        !isLoading &&
        !error && (
          <div style={emptyStateStyle}>
            <p>{t("adapterRegistry.empty")}</p>
          </div>
        )
      )}

      <EditAdapterModal
        adapter={selectedAdapter}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveAdapter}
      />
    </DataViewCard>
  );
}
