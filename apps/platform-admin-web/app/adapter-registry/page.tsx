"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type { PlatformAdapter } from "@drts/contracts";
import {
  Banner as CanvasBanner,
  Btn as CanvasBtn,
  Card as CanvasCard,
  DL as CanvasDL,
  PageHeader as CanvasPageHeader,
  Pill as CanvasPill,
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

const metaRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 12,
  alignItems: "center",
} satisfies CSSProperties;

const actionSectionStyle = {
  marginTop: 12,
  paddingTop: 12,
  borderTop: `1px solid ${theme.border}`,
  display: "grid",
  gap: 10,
} satisfies CSSProperties;

const sectionLabelStyle = {
  margin: 0,
  color: theme.textDim,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
} satisfies CSSProperties;

const authorityGroupStyle = {
  display: "grid",
  gap: 8,
} satisfies CSSProperties;

const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
} satisfies CSSProperties;

const authorityGridStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
} satisfies CSSProperties;

const authorityDividerStyle = {
  height: 1,
  background: theme.border,
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
  governedActionInfo: string;
  opsActionInfo: string;
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
  metricRollout: string;
  kindForwarder: string;
  kindValue: (adapter: PlatformAdapter) => string;
  adapterTitle: (adapter: PlatformAdapter) => string;
  sourceStatus: (adapter: PlatformAdapter) => string;
  authorityPa: string;
  authorityOps: string;
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

function financeTone(
  mode: PlatformAdapter["policies"]["financeAuthorityMode"],
): CanvasTone {
  switch (mode) {
    case "OWNED":
      return "success";
    case "SHADOW":
      return "warn";
    default:
      return "info";
  }
}

function rolloutTone(status: PlatformAdapter["rolloutStatus"]): CanvasTone {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "IN_PROGRESS":
      return "info";
    case "FAILED":
      return "danger";
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

function normalizeRegistryError(message: string, unavailable: string) {
  return /\b404\b/.test(message) ? unavailable : message;
}

function formatRolloutValue(locale: LabelLocale, adapter: PlatformAdapter) {
  return `${formatPlatformCodeLabel(locale, adapter.rolloutStatus)} · ${formatPlatformCodeLabel(
    locale,
    adapter.rolloutStage,
  )}`;
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
            governedActionInfo:
              "Credential changes remain governed Platform Admin actions and require the formal high-risk flow.",
            opsActionInfo:
              "Traffic pause and retry remain ops-console actions and are intentionally separated from Platform Admin governance.",
            loading: "Loading adapter registry...",
            empty:
              "No adapters are registered yet. Register the first governed adapter to open this registry.",
            unavailable:
              "Adapter registry data is temporarily unavailable. Check the Platform Admin adapter API and retry this page.",
            bannerFallbackTitle: "Credential rotation review remains active",
            bannerFallbackBody:
              "No immediate expiry alert is active, but registration and credential rotation remain governed high-risk actions on this route.",
            bannerTitle: (adapter) =>
              `${adapter.platformCode.toLowerCase()} requires credential review`,
            bannerBody: (adapter) =>
              `${adapter.name} is ${formatPlatformCodeLabel(locale, adapter.credentialStatus).toLowerCase()} with ${adapter.healthStatus.status.toLowerCase()} health. Review and rotate before production impact expands.`,
            rotateNow: "Rotate now",
            statusHealthy: "healthy",
            statusDegraded: "degraded",
            statusUnhealthy: "unhealthy",
            metricLatency: "LATENCY",
            metricLastEvent: "LAST EVENT",
            metricOrders: "ORDERS 24H",
            metricOrdersPending: "telemetry pending",
            metricRollout: "ROLLOUT",
            kindForwarder: "forwarder",
            kindValue: (adapter) =>
              adapter.isForwarded
                ? "forwarder"
                : formatPlatformCodeLabel(locale, adapter.adapterType),
            adapterTitle: (adapter) => adapter.platformCode.toLowerCase(),
            sourceStatus: (adapter) =>
              adapter.isForwarded
                ? "forwarded source"
                : "platform-owned source",
            authorityPa: "Platform Admin authority",
            authorityOps: "Ops authority",
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
            governedActionInfo:
              "credential 變更仍屬 Platform Admin 高風險治理動作，需走正式流程。",
            opsActionInfo:
              "流量暫停與 retry 仍屬 ops console 動作，刻意與 Platform Admin 治理分開。",
            loading: "載入 adapter registry 中...",
            empty:
              "目前尚未註冊任何 adapter。請先建立第一筆受治理的 adapter 登錄。",
            unavailable:
              "Adapter registry 資料暫時不可用，請檢查 Platform Admin adapter API 後再重新整理。",
            bannerFallbackTitle: "Credential rotation review 仍在治理中",
            bannerFallbackBody:
              "目前沒有即將到期的 credential 警報，但註冊與 credential 輪替仍是這個 route 的高風險治理動作。",
            bannerTitle: (adapter) =>
              `${adapter.platformCode.toLowerCase()} 需要 credential 治理檢查`,
            bannerBody: (adapter) =>
              `${adapter.name} 目前 credential 為 ${formatPlatformCodeLabel(locale, adapter.credentialStatus)}，健康狀態為 ${adapter.healthStatus.status.toLowerCase()}。請在 production 受影響前完成治理檢查與輪替。`,
            rotateNow: "立即輪替",
            statusHealthy: "healthy",
            statusDegraded: "degraded",
            statusUnhealthy: "unhealthy",
            metricLatency: "LATENCY",
            metricLastEvent: "LAST EVENT",
            metricOrders: "ORDERS 24H",
            metricOrdersPending: "telemetry pending",
            metricRollout: "ROLLOUT",
            kindForwarder: "forwarder",
            kindValue: (adapter) =>
              adapter.isForwarded
                ? "forwarder"
                : formatPlatformCodeLabel(locale, adapter.adapterType),
            adapterTitle: (adapter) => adapter.platformCode.toLowerCase(),
            sourceStatus: (adapter) =>
              adapter.isForwarded
                ? "forwarded source"
                : "platform-owned source",
            authorityPa: "Platform Admin authority",
            authorityOps: "Ops authority",
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
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        sticky={false}
        actions={
          <CanvasBtn
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
          </CanvasBtn>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
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
              <CanvasBtn
                theme={theme}
                variant="primary"
                danger
                icon="refresh"
                onClick={() =>
                  queueGovernedAction(copy.rotateCredential, bannerAdapter)
                }
              >
                {copy.rotateNow}
              </CanvasBtn>
            ) : undefined
          }
        />

        {flash ? (
          <div style={flashStyle(flash.tone)}>{flash.message}</div>
        ) : null}
        {error ? <div style={flashStyle("danger")}>{error}</div> : null}

        {loading ? (
          <CanvasCard theme={theme}>
            <div style={emptyCardStyle}>{copy.loading}</div>
          </CanvasCard>
        ) : showUnavailableState ? (
          <CanvasCard theme={theme}>
            <div style={emptyCardStyle}>{copy.unavailable}</div>
          </CanvasCard>
        ) : sortedAdapters.length === 0 ? (
          <CanvasCard theme={theme}>
            <div style={emptyCardStyle}>{copy.empty}</div>
          </CanvasCard>
        ) : (
          <div style={cardGridStyle}>
            {sortedAdapters.map((adapter) => {
              const opsPauseSupported =
                adapter.isForwarded && hasSupportedAction(adapter, "accept");

              return (
                <CanvasCard
                  key={adapter.id}
                  theme={theme}
                  title={
                    <span style={cardTitleStyle}>
                      {copy.adapterTitle(adapter)}
                      <CanvasPill theme={theme} tone={adapterKindTone(adapter)}>
                        {copy.kindValue(adapter)}
                      </CanvasPill>
                    </span>
                  }
                  subtitle={adapter.id}
                  actions={
                    <CanvasPill
                      theme={theme}
                      tone={healthTone(adapter.healthStatus.status)}
                      dot
                    >
                      {formatHealthLabel(copy, adapter.healthStatus.status)}
                    </CanvasPill>
                  }
                >
                  <CanvasDL
                    theme={theme}
                    cols={3}
                    items={[
                      {
                        k: copy.metricLatency,
                        v: `${adapter.policies.acceptTimeoutSeconds}s`,
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
                      {
                        k: copy.metricRollout,
                        v: formatRolloutValue(locale, adapter),
                      },
                    ]}
                  />

                  <div style={metaRowStyle}>
                    <CanvasPill theme={theme} tone="neutral">
                      {copy.sourceStatus(adapter)}
                    </CanvasPill>
                    <CanvasPill
                      theme={theme}
                      tone={credentialTone(adapter.credentialStatus)}
                    >
                      {formatPlatformCodeLabel(
                        locale,
                        adapter.credentialStatus,
                      )}
                    </CanvasPill>
                    <CanvasPill
                      theme={theme}
                      tone={financeTone(adapter.policies.financeAuthorityMode)}
                    >
                      {formatPlatformCodeLabel(
                        locale,
                        adapter.policies.financeAuthorityMode,
                      )}
                    </CanvasPill>
                    <CanvasPill
                      theme={theme}
                      tone={rolloutTone(adapter.rolloutStatus)}
                    >
                      {formatPlatformCodeLabel(locale, adapter.rolloutStatus)}
                    </CanvasPill>
                    <CanvasPill
                      theme={theme}
                      tone={adapter.config.isEnabled ? "success" : "neutral"}
                    >
                      {adapter.config.isEnabled
                        ? copy.enableAdapter
                        : copy.disableAdapter}
                    </CanvasPill>
                  </div>

                  <div style={actionSectionStyle}>
                    <div style={authorityGridStyle}>
                      <div style={authorityGroupStyle}>
                        <p style={sectionLabelStyle}>{copy.authorityPa}</p>
                        <div style={actionRowStyle}>
                          <CanvasBtn
                            theme={theme}
                            size="xs"
                            icon="apiKeys"
                            onClick={() =>
                              queueGovernedAction(copy.editCredential, adapter)
                            }
                          >
                            {copy.editCredential}
                          </CanvasBtn>
                          <CanvasBtn
                            theme={theme}
                            size="xs"
                            icon="refresh"
                            onClick={() =>
                              queueGovernedAction(
                                copy.rotateCredential,
                                adapter,
                              )
                            }
                          >
                            {copy.rotateCredential}
                          </CanvasBtn>
                          <CanvasBtn
                            theme={theme}
                            size="xs"
                            danger={adapter.config.isEnabled}
                            disabled={pendingId === adapter.id}
                            onClick={() => void toggleEnabled(adapter)}
                          >
                            {adapter.config.isEnabled
                              ? copy.disableAdapter
                              : copy.enableAdapter}
                          </CanvasBtn>
                        </div>
                      </div>

                      <span style={authorityDividerStyle} aria-hidden="true" />

                      <div style={authorityGroupStyle}>
                        <p style={sectionLabelStyle}>{copy.authorityOps}</p>
                        <div style={actionRowStyle}>
                          <CanvasBtn
                            theme={theme}
                            size="xs"
                            disabled={!opsPauseSupported}
                            onClick={() =>
                              opsPauseSupported
                                ? queueOpsAction(copy.pauseTraffic, adapter)
                                : showInfo(copy.showUnsupportedOpsAction)
                            }
                          >
                            {copy.pauseTraffic}
                          </CanvasBtn>
                        </div>
                      </div>
                    </div>
                  </div>
                </CanvasCard>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
