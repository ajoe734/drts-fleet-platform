"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type {
  PlatformAdapter,
  UpdatePlatformAdapterCommand,
} from "@drts/contracts";
import { ApiClient } from "@drts/api-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import { EditAdapterModal } from "./components/EditAdapterModal";
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
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTone,
} from "@drts/ui-web";

type AdapterFilter = "all" | "forwarded" | "enabled" | "attention";

const apiClient = new ApiClient({
  baseUrl: "",
});

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const shellViewportStyle = {
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
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const adapterGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const controlGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 220px) minmax(0, 1fr)",
  gap: 14,
  alignItems: "start",
} satisfies CSSProperties;

const cardStackStyle = {
  display: "grid",
  gap: 14,
} satisfies CSSProperties;

const pillsRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
} satisfies CSSProperties;

const fieldGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
} satisfies CSSProperties;

const descriptionStyle = {
  margin: 0,
  color: theme.textMuted,
  fontSize: 12.5,
  lineHeight: 1.5,
} satisfies CSSProperties;

const footerRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
} satisfies CSSProperties;

const monoMetaStyle = {
  color: theme.textDim,
  fontFamily: theme.monoFamily,
  fontSize: 11,
} satisfies CSSProperties;

const fieldValueListStyle = {
  display: "grid",
  gap: 8,
} satisfies CSSProperties;

const inlineSelectStyle = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontFamily: theme.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
} satisfies CSSProperties;

const emptyStateStyle = {
  padding: "24px 18px",
  color: theme.textMuted,
  fontSize: 12.5,
  textAlign: "center",
} satisfies CSSProperties;

function buildPlatformNav(locale: string): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          health: "Platform Health",
          tenantGov: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partner entry",
          users: "Platform staff",
          fleetGov: "Fleet & Compliance",
          fleet: "Fleet & compliance",
          switchboard: "Public info & placards",
          pricingGov: "Pricing & Settlement",
          pricing: "Pricing",
          payments: "Settlement governance",
          platformLayer: "Platform Layer",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
          adapters: "Adapter registry",
        }
      : {
          workspace: "工作面",
          home: "工作首頁",
          health: "平台健康",
          tenantGov: "租戶治理",
          tenants: "租戶",
          partners: "合作夥伴 entry",
          users: "平台人員",
          fleetGov: "車隊與法遵",
          fleet: "車隊與合規",
          switchboard: "法定資訊與牌貼",
          pricingGov: "計價與結算",
          pricing: "計價",
          payments: "結算治理",
          platformLayer: "平台層",
          notices: "公告與維護",
          audit: "稽核與證據",
          flags: "功能旗標",
          adapters: "介接登錄",
        };

  return [
    { divider: labels.workspace },
    { key: "home", href: "/", icon: "home", label: labels.home },
    {
      key: "health",
      href: "/health",
      icon: "health",
      label: labels.health,
      badge: "2",
      badgeTone: "warn",
    },
    { divider: labels.tenantGov },
    {
      key: "tenants",
      href: "/tenants",
      icon: "tenants",
      label: labels.tenants,
    },
    {
      key: "partners",
      href: "/partners",
      icon: "partners",
      label: labels.partners,
    },
    { key: "users", href: "/users", icon: "users", label: labels.users },
    { divider: labels.fleetGov },
    { key: "fleet", href: "/fleet", icon: "fleet", label: labels.fleet },
    {
      key: "switchboard",
      href: "/switchboard",
      icon: "switchboard",
      label: labels.switchboard,
    },
    { divider: labels.pricingGov },
    {
      key: "pricing",
      href: "/pricing",
      icon: "pricing",
      label: labels.pricing,
    },
    {
      key: "payments",
      href: "/payments",
      icon: "payments",
      label: labels.payments,
      badge: "3",
      badgeTone: "danger",
    },
    { divider: labels.platformLayer },
    {
      key: "notices",
      href: "/notices",
      icon: "notices",
      label: labels.notices,
    },
    { key: "audit", href: "/audit", icon: "audit", label: labels.audit },
    {
      key: "flags",
      href: "/feature-flags",
      icon: "flags",
      label: labels.flags,
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      icon: "adapters",
      label: labels.adapters,
    },
  ];
}

function translationOrFallback(
  translated: string,
  key: string,
  fallback: string,
) {
  return translated === key ? fallback : translated;
}

function healthTone(
  status: PlatformAdapter["healthStatus"]["status"],
): Exclude<CanvasTone, "neutral"> {
  switch (status) {
    case "HEALTHY":
      return "success";
    case "DEGRADED":
      return "warn";
    case "UNHEALTHY":
      return "danger";
    default:
      return "warn";
  }
}

function statusToneForBoolean(enabled: boolean | undefined): CanvasTone {
  return enabled ? "success" : "neutral";
}

function rolloutTone(status: PlatformAdapter["rolloutStatus"]): CanvasTone {
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

function credentialTone(
  status: PlatformAdapter["credentialStatus"],
): CanvasTone {
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
      return "warn";
  }
}

function authorityTone(
  mode: PlatformAdapter["policies"]["financeAuthorityMode"],
): CanvasTone {
  switch (mode) {
    case "OWNED":
      return "success";
    case "SHADOW":
      return "warn";
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

export default function AdapterRegistryPage() {
  const { t, locale } = useTranslation();
  const [adapters, setAdapters] = useState<PlatformAdapter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AdapterFilter>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAdapter, setSelectedAdapter] =
    useState<PlatformAdapter | null>(null);

  const copy =
    locale === "en"
      ? {
          pageTitle: "Adapter Registry",
          pageSubtitle:
            "Platform adapter inventory · auth / forwarder / filing",
          registrySubtitle:
            "Review adapter readiness, ownership, and rollout posture across the platform.",
          loading: translationOrFallback(
            t("adapterRegistry.loading"),
            "adapterRegistry.loading",
            "Loading adapters...",
          ),
          empty: translationOrFallback(
            t("adapterRegistry.empty"),
            "adapterRegistry.empty",
            "No adapters found.",
          ),
          title: translationOrFallback(
            t("adapterRegistry.title"),
            "adapterRegistry.title",
            "Adapter Registry",
          ),
          filterLabel: "Scope",
          filterHint: "Filter the grid without leaving the inventory overview.",
          filters: {
            all: "All adapters",
            forwarded: "Forwarded only",
            enabled: "Enabled only",
            attention: "Needs attention",
          },
          searchPlaceholder: "Search adapters, platforms, or surfaces",
          register: "Register adapter",
          refresh: translationOrFallback(
            t("common.refresh"),
            "common.refresh",
            "Refresh",
          ),
          edit: translationOrFallback(t("common.edit"), "common.edit", "Edit"),
          attentionBannerTitle: "Adapters need follow-up",
          attentionBannerBody: (count: number) =>
            `${count} adapter${count === 1 ? "" : "s"} currently need rollout, health, or credential review.`,
          totalKpi: "Total adapters",
          enabledKpi: "Enabled",
          forwardedKpi: "Forwarded",
          attentionKpi: "Attention",
          enabledSub: "Config-enabled adapters",
          forwardedSub: "Externally forwarded entries",
          attentionSub: "Health, credentials, or rollout risk",
          forwardedTag: "forwarded",
          ownedTag: "owned",
          draftTag: "draft",
          serviceBuckets: "Service buckets",
          supportedActions: "Supported actions",
          environment: translationOrFallback(
            t("adapterRegistry.col.environment"),
            "adapterRegistry.col.environment",
            "Environment",
          ),
          version: translationOrFallback(
            t("adapterRegistry.col.version"),
            "adapterRegistry.col.version",
            "Version",
          ),
          rollout: translationOrFallback(
            t("adapterRegistry.col.rolloutStatus"),
            "adapterRegistry.col.rolloutStatus",
            "Rollout",
          ),
          lastCheck: "Last check",
          lastUpdated: "Last updated",
          health: "Health",
          webhook: "Webhook",
          authority: "Authority",
          credentials: "Credentials",
          actionsCount: "Actions",
          notAvailable: translationOrFallback(
            t("common.na"),
            "common.na",
            "N/A",
          ),
          enabled: translationOrFallback(
            t("common.enabled"),
            "common.enabled",
            "Enabled",
          ),
          disabled: translationOrFallback(
            t("common.disabled"),
            "common.disabled",
            "Disabled",
          ),
          enabledOnly: "Enabled config",
          rolloutStage: "Rollout stage",
          footerPrefix: "Showing",
        }
      : {
          pageTitle: "介接登錄",
          pageSubtitle: "平台 adapter inventory · auth / forwarder / filing",
          registrySubtitle:
            "檢視各 adapter 的 readiness、責任歸屬與 rollout 狀態。",
          loading: translationOrFallback(
            t("adapterRegistry.loading"),
            "adapterRegistry.loading",
            "載入 adapter 中...",
          ),
          empty: translationOrFallback(
            t("adapterRegistry.empty"),
            "adapterRegistry.empty",
            "目前沒有 adapter。",
          ),
          title: translationOrFallback(
            t("adapterRegistry.title"),
            "adapterRegistry.title",
            "介接登錄",
          ),
          filterLabel: "篩選範圍",
          filterHint: "不離開 inventory 畫面就能切換查看範圍。",
          filters: {
            all: "全部 adapter",
            forwarded: "只看 forwarded",
            enabled: "只看已啟用",
            attention: "需要關注",
          },
          searchPlaceholder: "搜尋 adapter、平台代碼或流程面",
          register: "註冊 adapter",
          refresh: translationOrFallback(
            t("common.refresh"),
            "common.refresh",
            "重新整理",
          ),
          edit: translationOrFallback(t("common.edit"), "common.edit", "編輯"),
          attentionBannerTitle: "有 adapter 需要後續處理",
          attentionBannerBody: (count: number) =>
            `目前有 ${count} 筆 adapter 需要追蹤 rollout、健康或憑證狀態。`,
          totalKpi: "Adapter 總數",
          enabledKpi: "已啟用",
          forwardedKpi: "轉派中",
          attentionKpi: "需關注",
          enabledSub: "config 啟用中的 adapter",
          forwardedSub: "走外部 forwarded 流程的項目",
          attentionSub: "健康、憑證或 rollout 風險",
          forwardedTag: "forwarded",
          ownedTag: "owned",
          draftTag: "draft",
          serviceBuckets: "服務桶",
          supportedActions: "支援動作",
          environment: translationOrFallback(
            t("adapterRegistry.col.environment"),
            "adapterRegistry.col.environment",
            "環境",
          ),
          version: translationOrFallback(
            t("adapterRegistry.col.version"),
            "adapterRegistry.col.version",
            "版本",
          ),
          rollout: translationOrFallback(
            t("adapterRegistry.col.rolloutStatus"),
            "adapterRegistry.col.rolloutStatus",
            "Rollout",
          ),
          lastCheck: "最近檢查",
          lastUpdated: "最近更新",
          health: "健康",
          webhook: "Webhook",
          authority: "Authority",
          credentials: "憑證",
          actionsCount: "動作數",
          notAvailable: translationOrFallback(
            t("common.na"),
            "common.na",
            "無",
          ),
          enabled: translationOrFallback(
            t("common.enabled"),
            "common.enabled",
            "已啟用",
          ),
          disabled: translationOrFallback(
            t("common.disabled"),
            "common.disabled",
            "已停用",
          ),
          enabledOnly: "Config 啟用",
          rolloutStage: "Rollout stage",
          footerPrefix: "目前顯示",
        };

  const loadAdapters = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedAdapters = await apiClient.listPlatformAdapters();
      setAdapters(fetchedAdapters);
    } catch (err: any) {
      console.error("Error fetching adapters:", err);
      setError(
        err?.message ||
          translationOrFallback(
            t("adapterRegistry.errors.fetchFailed"),
            "adapterRegistry.errors.fetchFailed",
            locale === "en"
              ? "Unable to load adapters."
              : "無法載入 adapter 清單。",
          ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [locale, t]);

  useEffect(() => {
    void loadAdapters();
  }, [loadAdapters]);

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

  const forwardedCount = adapters.filter(
    (adapter) => adapter.isForwarded,
  ).length;
  const enabledCount = adapters.filter(
    (adapter) => adapter.config.isEnabled,
  ).length;
  const attentionCount = adapters.filter(isAttentionAdapter).length;

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
      setError(
        err?.message ||
          translationOrFallback(
            t("adapterRegistry.errors.updateFailed"),
            "adapterRegistry.errors.updateFailed",
            locale === "en"
              ? "Unable to update adapter."
              : "無法更新 adapter。",
          ),
      );
    }
  };

  return (
    <div style={shellViewportStyle}>
      <CanvasShell
        theme={theme}
        nav={buildPlatformNav(locale)}
        active="adapters"
        brandLabel={t("app.name")}
        brandSubLabel={t("app.sub")}
        breadcrumb={[
          locale === "en" ? "Platform Layer" : "平台層",
          copy.pageTitle,
        ]}
        env={t("app.env")}
        versionLabel="canvas"
        searchPlaceholder={copy.searchPlaceholder}
        avatarLabel={locale === "en" ? "PA" : "平台"}
        style={{ height: "100%" }}
      >
        <CanvasPageHeader
          theme={theme}
          title={copy.pageTitle}
          subtitle={copy.pageSubtitle}
          actions={
            <>
              <CanvasBtn theme={theme} onClick={() => void loadAdapters()}>
                {copy.refresh}
              </CanvasBtn>
              <CanvasBtn theme={theme} variant="primary" icon="plus" disabled>
                {copy.register}
              </CanvasBtn>
            </>
          }
        />

        <div style={pageBodyStyle}>
          {error ? (
            <CanvasBanner
              theme={theme}
              tone="danger"
              title={`${getPlatformLabel(locale, "error")}: ${error}`}
              body={copy.registrySubtitle}
            />
          ) : null}

          {!error && attentionCount > 0 ? (
            <CanvasBanner
              theme={theme}
              tone="warn"
              title={copy.attentionBannerTitle}
              body={copy.attentionBannerBody(attentionCount)}
            />
          ) : null}

          <div style={kpiGridStyle}>
            <CanvasKPI
              theme={theme}
              label={copy.totalKpi}
              value={String(adapters.length)}
              sub={copy.registrySubtitle}
            />
            <CanvasKPI
              theme={theme}
              label={copy.enabledKpi}
              value={String(enabledCount)}
              sub={copy.enabledSub}
            />
            <CanvasKPI
              theme={theme}
              label={copy.forwardedKpi}
              value={String(forwardedCount)}
              sub={copy.forwardedSub}
            />
            <CanvasKPI
              theme={theme}
              label={copy.attentionKpi}
              value={String(attentionCount)}
              delta={
                attentionCount > 0
                  ? locale === "en"
                    ? "review"
                    : "待檢視"
                  : locale === "en"
                    ? "healthy"
                    : "穩定"
              }
              deltaTone={attentionCount > 0 ? "down" : "up"}
              sub={copy.attentionSub}
            />
          </div>

          <CanvasCard
            theme={theme}
            title={copy.title}
            subtitle={copy.filterHint}
            actions={
              <span style={monoMetaStyle}>
                {copy.footerPrefix} {filteredAdapters.length} /{" "}
                {adapters.length}
              </span>
            }
          >
            <div style={controlGridStyle}>
              <CanvasField theme={theme} label={copy.filterLabel}>
                <select
                  value={filter}
                  onChange={(event) =>
                    setFilter(event.target.value as AdapterFilter)
                  }
                  style={inlineSelectStyle}
                >
                  <option value="all">{copy.filters.all}</option>
                  <option value="forwarded">{copy.filters.forwarded}</option>
                  <option value="enabled">{copy.filters.enabled}</option>
                  <option value="attention">{copy.filters.attention}</option>
                </select>
              </CanvasField>

              <div style={pillsRowStyle}>
                <CanvasPill theme={theme} tone="neutral">
                  {copy.filters.all} · {adapters.length}
                </CanvasPill>
                <CanvasPill theme={theme} tone="info">
                  {copy.filters.forwarded} · {forwardedCount}
                </CanvasPill>
                <CanvasPill theme={theme} tone="success">
                  {copy.filters.enabled} · {enabledCount}
                </CanvasPill>
                <CanvasPill theme={theme} tone="warn">
                  {copy.filters.attention} · {attentionCount}
                </CanvasPill>
              </div>
            </div>
          </CanvasCard>

          <div style={adapterGridStyle}>
            {isLoading ? (
              <CanvasCard
                theme={theme}
                title={copy.title}
                subtitle={copy.loading}
              >
                <div style={emptyStateStyle}>{copy.loading}</div>
              </CanvasCard>
            ) : filteredAdapters.length > 0 ? (
              filteredAdapters.map((adapter) => {
                const attention = isAttentionAdapter(adapter);
                const lastCheck =
                  adapter.healthStatus.lastCheckTimestamp ?? adapter.updatedAt;
                const attentionCardStyle = attention
                  ? {
                      borderColor: theme.warn,
                      boxShadow: `0 0 0 1px ${theme.warn}`,
                    }
                  : null;

                return (
                  <CanvasCard
                    key={adapter.id}
                    theme={theme}
                    title={adapter.name}
                    subtitle={`${adapter.platformCode} · ${formatPlatformCodeLabel(
                      locale,
                      adapter.adapterType,
                    )}`}
                    actions={
                      <CanvasPill
                        theme={theme}
                        tone={healthTone(adapter.healthStatus.status)}
                        dot
                      >
                        {formatPlatformCodeLabel(
                          locale,
                          adapter.healthStatus.status,
                        )}
                      </CanvasPill>
                    }
                    {...(attentionCardStyle
                      ? { style: attentionCardStyle }
                      : {})}
                  >
                    <div style={cardStackStyle}>
                      <p style={descriptionStyle}>{adapter.description}</p>

                      <div style={pillsRowStyle}>
                        <CanvasPill
                          theme={theme}
                          tone={statusToneForBoolean(adapter.config.isEnabled)}
                        >
                          {copy.enabledOnly}:{" "}
                          {adapter.config.isEnabled
                            ? copy.enabled
                            : copy.disabled}
                        </CanvasPill>
                        <CanvasPill
                          theme={theme}
                          tone={authorityTone(
                            adapter.policies.financeAuthorityMode,
                          )}
                        >
                          {adapter.isForwarded
                            ? copy.forwardedTag
                            : copy.ownedTag}
                          {" · "}
                          {formatPlatformCodeLabel(
                            locale,
                            adapter.policies.financeAuthorityMode,
                          )}
                        </CanvasPill>
                        <CanvasPill
                          theme={theme}
                          tone={credentialTone(adapter.credentialStatus)}
                        >
                          {copy.credentials}:{" "}
                          {formatPlatformCodeLabel(
                            locale,
                            adapter.credentialStatus,
                          )}
                        </CanvasPill>
                        <CanvasPill
                          theme={theme}
                          tone={statusToneForBoolean(
                            adapter.webhookStatus?.isEnabled,
                          )}
                        >
                          {copy.webhook}:{" "}
                          {adapter.webhookStatus?.isEnabled === undefined
                            ? copy.notAvailable
                            : adapter.webhookStatus.isEnabled
                              ? copy.enabled
                              : copy.disabled}
                        </CanvasPill>
                        <CanvasPill
                          theme={theme}
                          tone={rolloutTone(adapter.rolloutStatus)}
                        >
                          {copy.rollout}:{" "}
                          {formatPlatformCodeLabel(
                            locale,
                            adapter.rolloutStatus,
                          )}
                        </CanvasPill>
                        {adapter.draft ? (
                          <CanvasPill theme={theme} tone="accent">
                            {copy.draftTag}
                          </CanvasPill>
                        ) : null}
                      </div>

                      {attention && adapter.healthStatus.message ? (
                        <CanvasBanner
                          theme={theme}
                          tone={healthTone(adapter.healthStatus.status)}
                          title={copy.attentionBannerTitle}
                          body={adapter.healthStatus.message}
                        />
                      ) : null}

                      <CanvasDL
                        theme={theme}
                        cols={3}
                        items={[
                          {
                            k: copy.environment,
                            v: formatPlatformCodeLabel(
                              locale,
                              adapter.environment,
                            ),
                          },
                          { k: copy.version, v: adapter.version, mono: true },
                          {
                            k: copy.actionsCount,
                            v: String(adapter.supportedActions.length),
                            mono: true,
                          },
                          {
                            k: copy.rolloutStage,
                            v: formatPlatformCodeLabel(
                              locale,
                              adapter.rolloutStage,
                            ),
                          },
                          {
                            k: copy.lastCheck,
                            v: lastCheck
                              ? lastCheck
                                  .replace("T", " ")
                                  .replace(".000Z", "Z")
                              : copy.notAvailable,
                            mono: true,
                          },
                          {
                            k: copy.lastUpdated,
                            v: adapter.updatedAt
                              ? adapter.updatedAt
                                  .replace("T", " ")
                                  .replace(".000Z", "Z")
                              : copy.notAvailable,
                            mono: true,
                          },
                        ]}
                      />

                      <div style={fieldGridStyle}>
                        <CanvasField theme={theme} label={copy.serviceBuckets}>
                          <div style={pillsRowStyle}>
                            {adapter.policies.serviceBuckets.length > 0 ? (
                              adapter.policies.serviceBuckets.map(
                                (bucket: string) => (
                                  <CanvasPill
                                    key={bucket}
                                    theme={theme}
                                    tone="neutral"
                                  >
                                    {bucket}
                                  </CanvasPill>
                                ),
                              )
                            ) : (
                              <span style={monoMetaStyle}>
                                {copy.notAvailable}
                              </span>
                            )}
                          </div>
                        </CanvasField>

                        <CanvasField
                          theme={theme}
                          label={copy.supportedActions}
                        >
                          <div style={fieldValueListStyle}>
                            {adapter.supportedActions.length > 0 ? (
                              adapter.supportedActions.map(
                                (
                                  action: PlatformAdapter["supportedActions"][number],
                                ) => (
                                  <div key={action.name}>
                                    <div
                                      style={{
                                        fontWeight: 600,
                                        color: theme.text,
                                      }}
                                    >
                                      {action.name}
                                    </div>
                                    <div
                                      style={{
                                        color: theme.textMuted,
                                        fontSize: 11.5,
                                      }}
                                    >
                                      {action.description}
                                    </div>
                                  </div>
                                ),
                              )
                            ) : (
                              <span style={monoMetaStyle}>
                                {copy.notAvailable}
                              </span>
                            )}
                          </div>
                        </CanvasField>
                      </div>

                      <div style={footerRowStyle}>
                        <span style={monoMetaStyle}>{adapter.id}</span>
                        <CanvasBtn
                          theme={theme}
                          variant="secondary"
                          size="sm"
                          onClick={() => handleEditClick(adapter)}
                        >
                          {copy.edit}
                        </CanvasBtn>
                      </div>
                    </div>
                  </CanvasCard>
                );
              })
            ) : (
              <CanvasCard
                theme={theme}
                title={copy.title}
                subtitle={copy.registrySubtitle}
              >
                <div style={emptyStateStyle}>{copy.empty}</div>
              </CanvasCard>
            )}
          </div>
        </div>

        <EditAdapterModal
          adapter={selectedAdapter}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onSave={handleSaveAdapter}
        />
      </CanvasShell>
    </div>
  );
}
