"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type { PlatformAdapter } from "@drts/contracts";
import {
  Banner,
  Btn,
  Card,
  DL,
  PageHeader,
  Pill,
} from "../../../../packages/ui-web/src/canvas-primitives";
import {
  buildCanvasTheme,
  type CanvasTone,
} from "../../../../packages/ui-web/src/canvas-tokens";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageBodyStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const cardGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
} satisfies CSSProperties;

const cardTitleStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

const flashStyle = (tone: CanvasTone): CSSProperties =>
  ({
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${
      tone === "danger"
        ? theme.danger
        : tone === "success"
          ? theme.success
          : theme.border
    }`,
    background:
      tone === "danger"
        ? "rgba(185, 28, 28, 0.08)"
        : tone === "success"
          ? "rgba(6, 95, 70, 0.08)"
          : "rgba(59, 130, 246, 0.08)",
    color:
      tone === "danger"
        ? theme.danger
        : tone === "success"
          ? theme.success
          : theme.text,
    fontSize: 12.5,
    lineHeight: 1.5,
  }) satisfies CSSProperties;

const emptyCardStyle = {
  minHeight: 220,
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  color: theme.textMuted,
  fontSize: 12.5,
} satisfies CSSProperties;

const authoritySplitStyle = {
  marginTop: 12,
  paddingTop: 12,
  borderTop: `1px solid ${theme.border}`,
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
} satisfies CSSProperties;

const authorityColumnStyle = {
  display: "grid",
  gap: 8,
} satisfies CSSProperties;

const authorityLabelStyle = {
  margin: 0,
  color: theme.textDim,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
} satisfies CSSProperties;

const actionRowStyle = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
} satisfies CSSProperties;

const helperTextStyle = {
  margin: 0,
  color: theme.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
} satisfies CSSProperties;

type FlashState = {
  tone: CanvasTone;
  message: string;
} | null;

type LabelLocale = Parameters<typeof formatPlatformCodeLabel>[0];

type Copy = {
  title: string;
  subtitle: string;
  registerAction: string;
  registerInfo: string;
  loading: string;
  empty: string;
  unavailable: string;
  bannerFallbackTitle: string;
  bannerFallbackBody: string;
  bannerTitle: (adapter: PlatformAdapter) => string;
  bannerBody: (adapter: PlatformAdapter) => string;
  rotateNow: string;
  statusHealthy: string;
  statusDegraded: string;
  statusUnhealthy: string;
  metricLatency: string;
  metricLastEvent: string;
  metricOrders: string;
  metricOrdersPending: string;
  adapterTitle: (adapter: PlatformAdapter) => string;
  sourceValue: (adapter: PlatformAdapter) => string;
  authorityPa: string;
  authorityOps: string;
  governedActionInfo: string;
  opsActionInfo: string;
  editCredential: string;
  rotateCredential: string;
  enableAdapter: string;
  disableAdapter: string;
  pauseTraffic: string;
  queueGoverned: (label: string, adapter: PlatformAdapter) => string;
  queueOps: (label: string, adapter: PlatformAdapter) => string;
  toggleSuccess: (adapter: PlatformAdapter, enabled: boolean) => string;
  toggleError: string;
  showUnsupportedOpsAction: string;
  notConfigured: string;
};

function healthTone(
  status: PlatformAdapter["healthStatus"]["status"],
): CanvasTone {
  switch (status) {
    case "HEALTHY":
      return "success";
    case "DEGRADED":
      return "warn";
    default:
      return "danger";
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
    default:
      return "warn";
  }
}

function adapterKindTone(adapter: PlatformAdapter): CanvasTone {
  if (adapter.isForwarded) {
    return "info";
  }
  switch (adapter.adapterType) {
    case "EXTERNAL_COMBINED":
      return "accent";
    case "EXTERNAL_REST":
    case "EXTERNAL_WEBHOOK":
      return "info";
    default:
      return "neutral";
  }
}

function findAttentionAdapter(adapters: PlatformAdapter[]) {
  return adapters.find(
    (adapter) =>
      adapter.credentialStatus !== "VALID" ||
      adapter.healthStatus.status !== "HEALTHY" ||
      adapter.warn === true,
  );
}

function hasSupportedAction(adapter: PlatformAdapter, actionName: string) {
  return adapter.supportedActions.some(
    (action: { name: string }) =>
      action.name.toLowerCase() === actionName.toLowerCase(),
  );
}

function formatHealthLabel(
  copy: Copy,
  status: PlatformAdapter["healthStatus"]["status"],
) {
  switch (status) {
    case "HEALTHY":
      return copy.statusHealthy;
    case "DEGRADED":
      return copy.statusDegraded;
    default:
      return copy.statusUnhealthy;
  }
}

function formatLastEvent(copy: Copy, adapter: PlatformAdapter) {
  if (adapter.webhookStatus?.lastEventTimestamp) {
    return formatDateTime(adapter.webhookStatus.lastEventTimestamp);
  }
  if (adapter.healthStatus.lastCheckTimestamp) {
    return formatDateTime(adapter.healthStatus.lastCheckTimestamp);
  }
  return copy.notConfigured;
}

function formatLatency(adapter: PlatformAdapter) {
  return `${adapter.policies.acceptTimeoutSeconds}s`;
}

function normalizeRegistryError(message: string, unavailable: string) {
  return /\b404\b/.test(message) ? unavailable : message;
}

export default function AdapterRegistryPage() {
  const client = usePlatformAdminClient();
  const { locale } = useTranslation();
  const [adapters, setAdapters] = useState<PlatformAdapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashState>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const copy: Copy = useMemo(
    () =>
      locale === "en"
        ? {
            title: "External Platform Adapter Registry",
            subtitle:
              "config / credential governance stays in platform-admin while operational pause / retry stays in ops (Q-ADM17 split authority).",
            registerAction: "Register adapter",
            registerInfo:
              "Adapter registration remains a governed high-risk flow and is not opened inline on this route.",
            loading: "Loading adapter registry...",
            empty:
              "No adapters are registered yet. Register the first governed adapter to open this registry.",
            unavailable:
              "Adapter registry data is temporarily unavailable. Check the Platform Admin adapter API and retry this page.",
            bannerFallbackTitle: "Credential rotation review remains active",
            bannerFallbackBody:
              "No immediate expiry alert is active, but token rotation remains a governed high-risk action on this route.",
            bannerTitle: (adapter) =>
              `${adapter.platformCode.toLowerCase()} token expiry review required`,
            bannerBody: (adapter) =>
              `${adapter.name} is ${formatPlatformCodeLabel(locale, adapter.credentialStatus).toLowerCase()} with ${adapter.healthStatus.status.toLowerCase()} health. Review token rotation before production traffic is impacted.`,
            rotateNow: "Rotate now",
            statusHealthy: "healthy",
            statusDegraded: "degraded",
            statusUnhealthy: "unhealthy",
            metricLatency: "LATENCY",
            metricLastEvent: "LAST EVENT",
            metricOrders: "ORDERS 24H",
            metricOrdersPending: "telemetry pending",
            adapterTitle: (adapter) => adapter.name,
            sourceValue: (adapter) => adapter.id,
            authorityPa: "Platform Admin authority",
            authorityOps: "Ops authority",
            governedActionInfo:
              "Credential changes and enablement stay in the governed Platform Admin flow.",
            opsActionInfo:
              "Operational pause and retry stay in the ops console and are intentionally separated.",
            editCredential: "Edit credential",
            rotateCredential: "Rotate",
            enableAdapter: "Enable",
            disableAdapter: "Disable",
            pauseTraffic: "ops pause (TTL)",
            queueGoverned: (label, adapter) =>
              `${label} for ${adapter.name} stays in the governed Platform Admin flow. Plaintext-once secret material is not shown again here.`,
            queueOps: (label, adapter) =>
              `${label} for ${adapter.name} remains an ops-authority action on the ops console.`,
            toggleSuccess: (adapter, enabled) =>
              `${adapter.name} ${enabled ? "enabled" : "disabled"} successfully.`,
            toggleError: "Failed to update adapter state.",
            showUnsupportedOpsAction:
              "ops pause is only available for forwarded adapters.",
            notConfigured: "not configured",
          }
        : {
            title: "External Platform Adapter Registry",
            subtitle:
              "config / credential 治理在 platform-admin，operational pause / retry 在 ops（Q-ADM17 split authority）。",
            registerAction: "註冊 adapter",
            registerInfo:
              "註冊 adapter 仍屬高風險治理流程，這個 route 不直接展開 inline 建立。",
            loading: "載入 adapter registry 中...",
            empty:
              "目前尚未註冊任何 adapter。請先建立第一筆受治理的 adapter 登錄。",
            unavailable:
              "Adapter registry 資料暫時不可用，請檢查 Platform Admin adapter API 後再重新整理。",
            bannerFallbackTitle: "Credential rotation review 仍在治理中",
            bannerFallbackBody:
              "目前沒有即將到期的 credential 警報，但 token 輪替仍是這個 route 的高風險治理動作。",
            bannerTitle: (adapter) =>
              `${adapter.platformCode.toLowerCase()} · token 距到期治理檢查`,
            bannerBody: (adapter) =>
              `${adapter.name} 目前 credential 為 ${formatPlatformCodeLabel(locale, adapter.credentialStatus)}，健康狀態為 ${adapter.healthStatus.status.toLowerCase()}。請在 production 受影響前完成 token 治理檢查與輪替。`,
            rotateNow: "立即輪替",
            statusHealthy: "healthy",
            statusDegraded: "degraded",
            statusUnhealthy: "unhealthy",
            metricLatency: "LATENCY",
            metricLastEvent: "LAST EVENT",
            metricOrders: "ORDERS 24H",
            metricOrdersPending: "telemetry pending",
            adapterTitle: (adapter) => adapter.name,
            sourceValue: (adapter) => adapter.id,
            authorityPa: "Platform Admin authority",
            authorityOps: "Ops authority",
            governedActionInfo:
              "credential 變更與 adapter 啟停仍屬 Platform Admin 治理流程。",
            opsActionInfo:
              "operational pause 與 retry 仍屬 ops console，刻意與 Platform Admin 分權。",
            editCredential: "編輯 credential",
            rotateCredential: "輪替",
            enableAdapter: "啟用",
            disableAdapter: "停用",
            pauseTraffic: "ops pause (TTL)",
            queueGoverned: (label, adapter) =>
              `${adapter.name} 的「${label}」仍需走 Platform Admin 治理流程；plaintext-once secret 不會在這裡再次顯示。`,
            queueOps: (label, adapter) =>
              `${adapter.name} 的「${label}」仍屬 ops authority，請在 ops console 執行。`,
            toggleSuccess: (adapter, enabled) =>
              `${adapter.name} 已${enabled ? "啟用" : "停用"}。`,
            toggleError: "更新 adapter 狀態失敗。",
            showUnsupportedOpsAction: "ops pause 僅提供給 forwarded adapter。",
            notConfigured: "未設定",
          },
    [locale],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await client.listPlatformAdapters();
        if (!cancelled) {
          setAdapters(response);
        }
      } catch (caught) {
        if (!cancelled) {
          const message =
            caught instanceof Error ? caught.message : String(caught);
          setError(normalizeRegistryError(message, copy.unavailable));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [client, copy.unavailable]);

  const attentionAdapter = useMemo(
    () => findAttentionAdapter(adapters),
    [adapters],
  );

  const bannerAdapter = useMemo(
    () => attentionAdapter ?? adapters[0] ?? null,
    [adapters, attentionAdapter],
  );

  const sortedAdapters = useMemo(
    () =>
      [...adapters].sort((left, right) => {
        const leftAttention = Number(left.id === attentionAdapter?.id);
        const rightAttention = Number(right.id === attentionAdapter?.id);
        if (leftAttention !== rightAttention) {
          return rightAttention - leftAttention;
        }
        return left.platformCode.localeCompare(right.platformCode);
      }),
    [adapters, attentionAdapter],
  );

  const showUnavailableState =
    !loading && Boolean(error) && adapters.length === 0;

  async function toggleEnabled(adapter: PlatformAdapter) {
    const nextEnabled = !adapter.config.isEnabled;
    const confirmMessage =
      locale === "en"
        ? `Confirm ${nextEnabled ? "enable" : "disable"} for ${adapter.name}?`
        : `確認要${nextEnabled ? "啟用" : "停用"} ${adapter.name} 嗎？`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setPendingId(adapter.id);
    setFlash(null);
    try {
      const updated = await client.updatePlatformAdapter(adapter.id, {
        config: { isEnabled: nextEnabled },
      });
      setAdapters((current) =>
        current.map((entry) => (entry.id === adapter.id ? updated : entry)),
      );
      setFlash({
        tone: "success",
        message: copy.toggleSuccess(updated, nextEnabled),
      });
    } catch {
      setFlash({ tone: "danger", message: copy.toggleError });
    } finally {
      setPendingId(null);
    }
  }

  function queueGovernedAction(label: string, adapter: PlatformAdapter) {
    setFlash({ tone: "info", message: copy.queueGoverned(label, adapter) });
  }

  function queueOpsAction(label: string, adapter: PlatformAdapter) {
    setFlash({ tone: "info", message: copy.queueOps(label, adapter) });
  }

  function showInfo(message: string) {
    setFlash({ tone: "info", message });
  }

  return (
    <>
      <PageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        sticky={false}
        actions={
          <Btn
            theme={theme}
            variant="primary"
            icon="plus"
            onClick={() =>
              setFlash({
                tone: "info",
                message: copy.registerInfo,
              })
            }
          >
            {copy.registerAction}
          </Btn>
        }
      />

      <div style={pageBodyStyle}>
        <Banner
          theme={theme}
          tone="danger"
          icon="warn"
          title={
            bannerAdapter && attentionAdapter
              ? copy.bannerTitle(bannerAdapter)
              : copy.bannerFallbackTitle
          }
          body={
            bannerAdapter && attentionAdapter
              ? copy.bannerBody(bannerAdapter)
              : copy.bannerFallbackBody
          }
          actions={
            bannerAdapter ? (
              <Btn
                theme={theme}
                variant="primary"
                danger
                icon="refresh"
                onClick={() =>
                  queueGovernedAction(copy.rotateCredential, bannerAdapter)
                }
              >
                {copy.rotateNow}
              </Btn>
            ) : undefined
          }
        />

        {flash ? (
          <div style={flashStyle(flash.tone)}>{flash.message}</div>
        ) : null}
        {error && adapters.length > 0 ? (
          <div style={flashStyle("danger")}>{copy.unavailable}</div>
        ) : null}

        {loading ? (
          <Card theme={theme}>
            <div style={emptyCardStyle}>{copy.loading}</div>
          </Card>
        ) : showUnavailableState ? (
          <Card theme={theme}>
            <div style={emptyCardStyle}>{copy.unavailable}</div>
          </Card>
        ) : sortedAdapters.length === 0 ? (
          <Card theme={theme}>
            <div style={emptyCardStyle}>{copy.empty}</div>
          </Card>
        ) : (
          <div style={cardGridStyle}>
            {sortedAdapters.map((adapter) => {
              const opsPauseSupported =
                adapter.isForwarded && hasSupportedAction(adapter, "accept");

              return (
                <Card
                  key={adapter.id}
                  theme={theme}
                  title={
                    <span style={cardTitleStyle}>
                      {copy.adapterTitle(adapter)}
                      <Pill theme={theme} tone={adapterKindTone(adapter)}>
                        {adapter.isForwarded
                          ? "forwarder"
                          : formatPlatformCodeLabel(
                              locale as LabelLocale,
                              adapter.adapterType,
                            )}
                      </Pill>
                    </span>
                  }
                  subtitle={copy.sourceValue(adapter)}
                  actions={
                    <Pill
                      theme={theme}
                      tone={healthTone(adapter.healthStatus.status)}
                      dot
                    >
                      {formatHealthLabel(copy, adapter.healthStatus.status)}
                    </Pill>
                  }
                >
                  <DL
                    theme={theme}
                    cols={3}
                    items={[
                      {
                        k: copy.metricLatency,
                        v: formatLatency(adapter),
                        mono: true,
                      },
                      {
                        k: copy.metricLastEvent,
                        v: formatLastEvent(copy, adapter),
                        mono: true,
                      },
                      {
                        k: copy.metricOrders,
                        v: copy.metricOrdersPending,
                        mono: true,
                      },
                    ]}
                  />

                  <div style={authoritySplitStyle}>
                    <div style={authorityColumnStyle}>
                      <p style={authorityLabelStyle}>{copy.authorityPa}</p>
                      <div style={actionRowStyle}>
                        <Btn
                          theme={theme}
                          size="xs"
                          variant="secondary"
                          icon="apiKeys"
                          onClick={() =>
                            queueGovernedAction(copy.editCredential, adapter)
                          }
                        >
                          {copy.editCredential}
                        </Btn>
                        <Btn
                          theme={theme}
                          size="xs"
                          variant="secondary"
                          icon="refresh"
                          onClick={() =>
                            queueGovernedAction(copy.rotateCredential, adapter)
                          }
                        >
                          {copy.rotateCredential}
                        </Btn>
                        <Btn
                          theme={theme}
                          size="xs"
                          variant="secondary"
                          danger={adapter.config.isEnabled}
                          disabled={pendingId === adapter.id}
                          onClick={() => void toggleEnabled(adapter)}
                        >
                          {adapter.config.isEnabled
                            ? copy.disableAdapter
                            : copy.enableAdapter}
                        </Btn>
                      </div>
                      <p style={helperTextStyle}>{copy.governedActionInfo}</p>
                      <div style={actionRowStyle}>
                        <Pill
                          theme={theme}
                          tone={credentialTone(adapter.credentialStatus)}
                        >
                          {formatPlatformCodeLabel(
                            locale as LabelLocale,
                            adapter.credentialStatus,
                          )}
                        </Pill>
                        <Pill theme={theme} tone="neutral">
                          {formatPlatformCodeLabel(
                            locale as LabelLocale,
                            adapter.environment,
                          )}
                        </Pill>
                        <Pill theme={theme} tone="neutral">
                          {adapter.version}
                        </Pill>
                      </div>
                    </div>

                    <div style={authorityColumnStyle}>
                      <p style={authorityLabelStyle}>{copy.authorityOps}</p>
                      <div style={actionRowStyle}>
                        <Btn
                          theme={theme}
                          size="xs"
                          variant="ghost"
                          disabled={!opsPauseSupported}
                          onClick={() =>
                            opsPauseSupported
                              ? queueOpsAction(copy.pauseTraffic, adapter)
                              : showInfo(copy.showUnsupportedOpsAction)
                          }
                        >
                          {copy.pauseTraffic}
                        </Btn>
                      </div>
                      <p style={helperTextStyle}>{copy.opsActionInfo}</p>
                      <div style={actionRowStyle}>
                        <Pill
                          theme={theme}
                          tone={
                            adapter.config.isEnabled ? "success" : "neutral"
                          }
                        >
                          {adapter.config.isEnabled
                            ? copy.enableAdapter
                            : copy.disableAdapter}
                        </Pill>
                        <Pill theme={theme} tone="neutral">
                          {formatPlatformCodeLabel(
                            locale as LabelLocale,
                            adapter.rolloutStatus,
                          )}
                        </Pill>
                        <Pill theme={theme} tone="neutral">
                          {formatDateTime(adapter.updatedAt)}
                        </Pill>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
