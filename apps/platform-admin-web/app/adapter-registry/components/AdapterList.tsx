import React, { useState, useEffect } from "react";
import { PlatformAdapter, UpdatePlatformAdapterCommand } from "@drts/contracts";
import { EditAdapterModal } from "./EditAdapterModal";
import { ApiClient } from "@drts/api-client";
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
  StatusChip,
  Td,
  Tr,
} from "@drts/ui-web";

const apiClient = new ApiClient({
  baseUrl: "",
});

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

function isAttentionAdapter(adapter: PlatformAdapter) {
  return (
    adapter.warn === true ||
    adapter.draft === true ||
    adapter.healthStatus.status !== "HEALTHY" ||
    adapter.credentialStatus !== "VALID" ||
    adapter.rolloutStatus === "FAILED"
  );
}

export function AdapterList() {
  const { t, locale } = useTranslation();
  const [adapters, setAdapters] = useState<PlatformAdapter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AdapterFilter>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAdapter, setSelectedAdapter] =
    useState<PlatformAdapter | null>(null);

  useEffect(() => {
    const fetchAdapters = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const fetchedAdapters = await apiClient.listPlatformAdapters();
        setAdapters(fetchedAdapters);
      } catch (err: any) {
        console.error("Error fetching adapters:", err);
        setError(err?.message || t("adapterRegistry.errors.fetchFailed"));
      } finally {
        setIsLoading(false);
      }
    };

    fetchAdapters();
  }, []);

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
          actions: "操作",
        };

  const filteredAdapters = adapters.filter((adapter) => {
    switch (filter) {
      case "forwarded":
        return adapter.isForwarded;
      case "enabled":
        return adapter.config.isEnabled;
      case "attention":
        return isAttentionAdapter(adapter);
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
      count: adapters.filter(isAttentionAdapter).length,
      tone: "danger",
    },
  ] as const satisfies readonly {
    value: AdapterFilter;
    label: string;
    count: number;
    tone: "neutral" | "warning" | "success" | "danger";
  }[];

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
  ) => {
    if (!selectedAdapter) return;

    try {
      const updatedAdapter = await apiClient.updatePlatformAdapter(
        selectedAdapter.id,
        updatedData,
      );
      setAdapters((prevAdapters) =>
        prevAdapters.map((adapter) =>
          adapter.id === selectedAdapter.id ? updatedAdapter : adapter,
        ),
      );
    } catch (err: any) {
      console.error("Error updating adapter:", err);
      setError(err?.message || t("adapterRegistry.errors.updateFailed"));
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
      {isLoading && (
        <div className="admin-empty">{t("adapterRegistry.loading")}</div>
      )}
      {error && (
        <div
          className="admin-card"
          style={{ borderColor: "rgba(239,68,68,0.3)" }}
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
          minWidth={980}
          columns={[
            { label: t("adapterRegistry.col.name"), width: "22%" },
            { label: t("adapterRegistry.col.environment"), width: "14%" },
            { label: copy.enabled, width: "18%" },
            { label: copy.authority, width: "16%" },
            { label: copy.rollout, width: "20%" },
            {
              label: copy.actions,
              width: "10%",
              align: "right",
            },
          ]}
        >
          {filteredAdapters.map((adapter) => (
            <Tr key={adapter.id} highlighted={isAttentionAdapter(adapter)}>
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
                  primary={formatPlatformCodeLabel(locale, adapter.environment)}
                  secondary={`${t("adapterRegistry.col.version")} ${adapter.version}`}
                  tertiary={`${t("adapterRegistry.col.rolloutStatus")} · ${formatPlatformCodeLabel(
                    locale,
                    adapter.rolloutStage,
                  )}`}
                />
              </Td>
              <Td density="compact">
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
                    tone={statusToneForHealth(adapter.healthStatus.status)}
                    label={formatPlatformCodeLabel(
                      locale,
                      adapter.healthStatus.status,
                    )}
                    authorityLabel={copy.health}
                  />
                  <StatusChip
                    tone={statusToneForBoolean(
                      adapter.webhookStatus?.isEnabled,
                    )}
                    label={
                      adapter.webhookStatus?.isEnabled
                        ? t("common.enabled")
                        : adapter.webhookStatus?.isEnabled === false
                          ? t("common.disabled")
                          : t("common.na")
                    }
                    authorityLabel={copy.webhook}
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
                    tone={statusToneForCredential(adapter.credentialStatus)}
                    label={formatPlatformCodeLabel(
                      locale,
                      adapter.credentialStatus,
                    )}
                    authorityLabel={copy.financeTag}
                  />
                </div>
              </Td>
              <Td density="compact" align="right">
                <button
                  onClick={() => handleEditClick(adapter)}
                  className="admin-btn admin-btn--secondary admin-btn--sm"
                >
                  {t("common.edit")}
                </button>
              </Td>
            </Tr>
          ))}
        </DataTable>
      ) : (
        !isLoading &&
        !error && (
          <div className="admin-empty">
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
