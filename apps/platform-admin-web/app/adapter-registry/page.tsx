"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type { PlatformAdapter } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

const theme = buildCanvasTheme({
  dark: true,
  surface: "platform",
  density: "compact",
});

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

const metadataGridStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  marginTop: 12,
} satisfies CSSProperties;

const metadataBlockStyle = {
  display: "grid",
  gap: 6,
  padding: 12,
  border: `1px solid ${theme.border}`,
  borderRadius: 12,
  background: theme.surface,
} satisfies CSSProperties;

const metadataLabelStyle = {
  margin: 0,
  color: theme.textDim,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
} satisfies CSSProperties;

const metadataValueStyle = {
  margin: 0,
  color: theme.text,
  fontSize: 12.5,
  lineHeight: 1.5,
} satisfies CSSProperties;

const metadataSubValueStyle = {
  margin: 0,
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.5,
} satisfies CSSProperties;

const tokenRowStyle = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
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
  webhookTitle: string;
  financeMode: string;
  serviceBuckets: string;
  featureFlags: string;
  supportedActions: string;
  operationalPause: string;
  noPause: string;
  pauseUnknown: string;
  authorityPa: string;
  authorityOps: string;
  governedActionInfo: string;
  opsActionInfo: string;
  editConfig: string;
  editCredential: string;
  rotateCredential: string;
  enableAdapter: string;
  disableAdapter: string;
  pauseTraffic: string;
  retryCallback: string;
  queueGoverned: (
    label: string,
    adapter: PlatformAdapter,
    reason?: string,
  ) => string;
  queueOps: (label: string, adapter: PlatformAdapter) => string;
  toggleSuccess: (
    adapter: PlatformAdapter,
    enabled: boolean,
    reason?: string,
  ) => string;
  toggleError: string;
  showUnsupportedOpsAction: string;
  webhookNotConfigured: string;
  lastCheck: string;
  reasonRequired: string;
  disableConfirm: (adapter: PlatformAdapter) => string;
  enableConfirm: (adapter: PlatformAdapter) => string;
  disableReasonPrompt: (adapter: PlatformAdapter) => string;
  auditReceiptPrefix: string;
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

function booleanTone(value: boolean): CanvasTone {
  return value ? "success" : "neutral";
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

function formatWebhookValue(copy: Copy, adapter: PlatformAdapter) {
  if (!adapter.webhookStatus?.url) {
    return copy.webhookNotConfigured;
  }

  const status = adapter.webhookStatus.lastStatus.toLowerCase();
  const code = adapter.webhookStatus.lastStatusCode
    ? ` · ${adapter.webhookStatus.lastStatusCode}`
    : "";
  return `${status}${code}`;
}

function formatServiceBuckets(copy: Copy, adapter: PlatformAdapter) {
  return adapter.policies.serviceBuckets.length > 0
    ? adapter.policies.serviceBuckets.join(" / ")
    : copy.notConfigured;
}

function getFeatureFlagEntries(adapter: PlatformAdapter) {
  return Object.entries(adapter.featureFlags).sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

function normalizeRegistryError(message: string, unavailable: string) {
  return /404|not found/i.test(message) ? unavailable : message;
}

export default function AdapterRegistryPage() {
  const client = usePlatformAdminClient();
  const { locale, t } = useTranslation();
  const [adapters, setAdapters] = useState<PlatformAdapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashState>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const copy: Copy = useMemo(
    () =>
      ({
        title: t("adapterRegistry.title"),
        subtitle: t("adapterRegistry.subtitle"),
        registerAction: t("adapterRegistry.registerAction"),
        registerInfo: t("adapterRegistry.registerInfo"),
        loading: t("adapterRegistry.loading"),
        empty: t("adapterRegistry.empty"),
        unavailable: t("adapterRegistry.unavailable"),
        bannerFallbackTitle: t("adapterRegistry.banner.fallbackTitle"),
        bannerFallbackBody: t("adapterRegistry.banner.fallbackBody"),
        bannerTitle: (adapter) =>
          t("adapterRegistry.banner.title", {
            platformCode: adapter.platformCode.toLowerCase(),
          }),
        bannerBody: (adapter) =>
          t("adapterRegistry.banner.body", {
            name: adapter.name,
            credentialStatus: formatPlatformCodeLabel(
              locale,
              adapter.credentialStatus,
            ).toLowerCase(),
            healthStatus: healthStatusText(
              t,
              adapter.healthStatus.status,
            ).toLowerCase(),
          }),
        rotateNow: t("adapterRegistry.rotateNow"),
        statusHealthy: t("adapterRegistry.status.healthy"),
        statusDegraded: t("adapterRegistry.status.degraded"),
        statusUnhealthy: t("adapterRegistry.status.unhealthy"),
        metricLatency: t("adapterRegistry.metric.latency"),
        metricLastEvent: t("adapterRegistry.metric.lastEvent"),
        metricOrders: t("adapterRegistry.metric.orders24h"),
        metricOrdersPending: t("adapterRegistry.metric.ordersPending"),
        adapterTitle: (adapter) => adapter.name,
        sourceValue: (adapter) => adapter.id,
        webhookTitle: t("adapterRegistry.webhook"),
        financeMode: t("adapterRegistry.financeMode"),
        serviceBuckets: t("adapterRegistry.serviceBuckets"),
        featureFlags: t("adapterRegistry.featureFlags"),
        supportedActions: t("adapterRegistry.supportedActions"),
        operationalPause: t("adapterRegistry.operationalPause"),
        noPause: t("adapterRegistry.noPause"),
        pauseUnknown: t("adapterRegistry.pauseUnknown"),
        authorityPa: t("adapterRegistry.authority.platformAdmin"),
        authorityOps: t("adapterRegistry.authority.ops"),
        governedActionInfo: t("adapterRegistry.governedActionInfo"),
        opsActionInfo: t("adapterRegistry.opsActionInfo"),
        editConfig: t("adapterRegistry.editConfig"),
        editCredential: t("adapterRegistry.editCredential"),
        rotateCredential: t("adapterRegistry.rotateCredential"),
        enableAdapter: t("adapterRegistry.enableAdapter"),
        disableAdapter: t("adapterRegistry.disableAdapter"),
        pauseTraffic: t("adapterRegistry.pauseTraffic"),
        retryCallback: t("adapterRegistry.retryCallback"),
        queueGoverned: (label, adapter, reason) =>
          t("adapterRegistry.queueGoverned", {
            label,
            name: adapter.name,
            reasonClause: reason
              ? ` ${t("adapterRegistry.queueGoverned.reasonClause", { reason })}`
              : "",
          }),
        queueOps: (label, adapter) =>
          t("adapterRegistry.queueOps", {
            label,
            name: adapter.name,
          }),
        toggleSuccess: (adapter, enabled, reason) =>
          t("adapterRegistry.toggleSuccess", {
            auditPrefix: copyAuditPrefix(
              t("adapterRegistry.auditReceiptPrefix"),
            ),
            name: adapter.name,
            status: enabled
              ? t("adapterRegistry.toggleSuccess.enabled")
              : t("adapterRegistry.toggleSuccess.disabled"),
            reasonClause: reason
              ? ` ${t("adapterRegistry.toggleSuccess.reasonClause", { reason })}`
              : "",
          }),
        toggleError: t("adapterRegistry.toggleError"),
        showUnsupportedOpsAction: t("adapterRegistry.unsupportedOpsAction"),
        webhookNotConfigured: t("adapterRegistry.notConfigured"),
        lastCheck: t("adapterRegistry.lastCheck"),
        reasonRequired: t("adapterRegistry.reasonRequired"),
        disableConfirm: (adapter) =>
          t("adapterRegistry.disableConfirm", {
            name: adapter.name,
          }),
        enableConfirm: (adapter) =>
          t("adapterRegistry.enableConfirm", {
            name: adapter.name,
          }),
        disableReasonPrompt: (adapter) =>
          t("adapterRegistry.disableReasonPrompt", {
            name: adapter.name,
          }),
        auditReceiptPrefix: t("adapterRegistry.auditReceiptPrefix"),
        notConfigured: t("adapterRegistry.notConfigured"),
      }) satisfies Copy,
    [locale, t],
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
    const needsReason =
      adapter.environment === "PRODUCTION" && adapter.config.isEnabled;

    if (
      !window.confirm(
        nextEnabled
          ? copy.enableConfirm(adapter)
          : copy.disableConfirm(adapter),
      )
    ) {
      return;
    }

    let reason: string | undefined;
    if (needsReason) {
      const input = window.prompt(copy.disableReasonPrompt(adapter))?.trim();
      if (!input) {
        setFlash({ tone: "danger", message: copy.reasonRequired });
        return;
      }
      reason = input;
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
        message: copy.toggleSuccess(updated, nextEnabled, reason),
      });
    } catch {
      setFlash({ tone: "danger", message: copy.toggleError });
    } finally {
      setPendingId(null);
    }
  }

  function queueGovernedAction(
    label: string,
    adapter: PlatformAdapter,
    reason?: string,
  ) {
    setFlash({
      tone: "info",
      message: copy.queueGoverned(label, adapter, reason),
    });
  }

  function queueOpsAction(label: string, adapter: PlatformAdapter) {
    setFlash({ tone: "info", message: copy.queueOps(label, adapter) });
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
        {error && adapters.length > 0 ? (
          <div style={flashStyle("danger")}>{copy.unavailable}</div>
        ) : null}

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
              const retrySupported = hasSupportedAction(adapter, "retry");
              const featureFlags = getFeatureFlagEntries(adapter);
              const supportedActions = adapter.supportedActions;

              return (
                <CanvasCard
                  key={adapter.id}
                  theme={theme}
                  title={
                    <span style={cardTitleStyle}>
                      {copy.adapterTitle(adapter)}
                      <CanvasPill theme={theme} tone={adapterKindTone(adapter)}>
                        {adapter.isForwarded
                          ? t("adapterRegistry.forwarderPill")
                          : formatPlatformCodeLabel(
                              locale as LabelLocale,
                              adapter.adapterType,
                            )}
                      </CanvasPill>
                    </span>
                  }
                  subtitle={copy.sourceValue(adapter)}
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

                  <div style={metadataGridStyle}>
                    <div style={metadataBlockStyle}>
                      <p style={metadataLabelStyle}>{copy.webhookTitle}</p>
                      <p style={metadataValueStyle}>
                        {formatWebhookValue(copy, adapter)}
                      </p>
                      <p style={metadataSubValueStyle}>
                        {adapter.webhookStatus?.url ??
                          copy.webhookNotConfigured}
                      </p>
                    </div>
                    <div style={metadataBlockStyle}>
                      <p style={metadataLabelStyle}>{copy.financeMode}</p>
                      <p style={metadataValueStyle}>
                        {formatPlatformCodeLabel(
                          locale as LabelLocale,
                          adapter.policies.financeAuthorityMode,
                        )}
                      </p>
                      <p style={metadataSubValueStyle}>
                        {copy.lastCheck}:{" "}
                        {adapter.healthStatus.lastCheckTimestamp
                          ? formatDateTime(
                              adapter.healthStatus.lastCheckTimestamp,
                            )
                          : copy.notConfigured}
                      </p>
                    </div>
                    <div style={metadataBlockStyle}>
                      <p style={metadataLabelStyle}>{copy.serviceBuckets}</p>
                      <p style={metadataValueStyle}>
                        {formatServiceBuckets(copy, adapter)}
                      </p>
                      <p style={metadataSubValueStyle}>
                        {t("adapterRegistry.serviceBuckets.meta", {
                          maxCandidates: adapter.policies.maxCandidates,
                          manualFallbackSeconds:
                            adapter.policies.manualFallbackThresholdSeconds,
                        })}
                      </p>
                    </div>
                    <div style={metadataBlockStyle}>
                      <p style={metadataLabelStyle}>{copy.operationalPause}</p>
                      <p style={metadataValueStyle}>{copy.noPause}</p>
                      <p style={metadataSubValueStyle}>{copy.pauseUnknown}</p>
                    </div>
                  </div>

                  <div style={authoritySplitStyle}>
                    <div style={authorityColumnStyle}>
                      <p style={authorityLabelStyle}>{copy.authorityPa}</p>
                      <div style={actionRowStyle}>
                        <CanvasBtn
                          theme={theme}
                          size="xs"
                          variant="secondary"
                          onClick={() =>
                            queueGovernedAction(copy.editConfig, adapter)
                          }
                        >
                          {copy.editConfig}
                        </CanvasBtn>
                        <CanvasBtn
                          theme={theme}
                          size="xs"
                          variant="secondary"
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
                          variant="secondary"
                          icon="refresh"
                          onClick={() =>
                            queueGovernedAction(copy.rotateCredential, adapter)
                          }
                        >
                          {copy.rotateCredential}
                        </CanvasBtn>
                        <CanvasBtn
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
                        </CanvasBtn>
                      </div>
                      <p style={helperTextStyle}>{copy.governedActionInfo}</p>
                      <div style={tokenRowStyle}>
                        <CanvasPill
                          theme={theme}
                          tone={credentialTone(adapter.credentialStatus)}
                        >
                          {formatPlatformCodeLabel(
                            locale as LabelLocale,
                            adapter.credentialStatus,
                          )}
                        </CanvasPill>
                        <CanvasPill theme={theme} tone="neutral">
                          {formatPlatformCodeLabel(
                            locale as LabelLocale,
                            adapter.environment,
                          )}
                        </CanvasPill>
                        <CanvasPill theme={theme} tone="neutral">
                          {adapter.version}
                        </CanvasPill>
                        <CanvasPill
                          theme={theme}
                          tone={booleanTone(adapter.config.isEnabled)}
                        >
                          {adapter.config.isEnabled
                            ? copy.enableAdapter
                            : copy.disableAdapter}
                        </CanvasPill>
                      </div>
                      <div style={tokenRowStyle}>
                        {featureFlags.length > 0 ? (
                          featureFlags.map(([key, value]) => (
                            <CanvasPill
                              key={key}
                              theme={theme}
                              tone={value ? "success" : "neutral"}
                            >
                              {key}:
                              {value
                                ? t("adapterRegistry.featureFlag.on")
                                : t("adapterRegistry.featureFlag.off")}
                            </CanvasPill>
                          ))
                        ) : (
                          <CanvasPill theme={theme} tone="neutral">
                            {copy.featureFlags}: {copy.notConfigured}
                          </CanvasPill>
                        )}
                      </div>
                    </div>

                    <div style={authorityColumnStyle}>
                      <p style={authorityLabelStyle}>{copy.authorityOps}</p>
                      <div style={actionRowStyle}>
                        <CanvasBtn
                          theme={theme}
                          size="xs"
                          variant="ghost"
                          disabled={!opsPauseSupported}
                          onClick={() =>
                            opsPauseSupported
                              ? queueOpsAction(copy.pauseTraffic, adapter)
                              : setFlash({
                                  tone: "info",
                                  message: copy.showUnsupportedOpsAction,
                                })
                          }
                        >
                          {copy.pauseTraffic}
                        </CanvasBtn>
                        <CanvasBtn
                          theme={theme}
                          size="xs"
                          variant="ghost"
                          disabled={!retrySupported}
                          onClick={() =>
                            retrySupported
                              ? queueOpsAction(copy.retryCallback, adapter)
                              : setFlash({
                                  tone: "info",
                                  message: copy.showUnsupportedOpsAction,
                                })
                          }
                        >
                          {copy.retryCallback}
                        </CanvasBtn>
                      </div>
                      <p style={helperTextStyle}>{copy.opsActionInfo}</p>
                      <div style={tokenRowStyle}>
                        {supportedActions.length > 0 ? (
                          supportedActions.map((action) => (
                            <CanvasPill
                              key={action.name}
                              theme={theme}
                              tone="neutral"
                            >
                              {action.name}
                            </CanvasPill>
                          ))
                        ) : (
                          <CanvasPill theme={theme} tone="neutral">
                            {copy.supportedActions}: {copy.notConfigured}
                          </CanvasPill>
                        )}
                      </div>
                      <div style={tokenRowStyle}>
                        <CanvasPill
                          theme={theme}
                          tone={healthTone(adapter.healthStatus.status)}
                        >
                          {formatHealthLabel(copy, adapter.healthStatus.status)}
                        </CanvasPill>
                        <CanvasPill theme={theme} tone="neutral">
                          {formatPlatformCodeLabel(
                            locale as LabelLocale,
                            adapter.rolloutStatus,
                          )}
                        </CanvasPill>
                        <CanvasPill theme={theme} tone="neutral">
                          {formatPlatformCodeLabel(
                            locale as LabelLocale,
                            adapter.rolloutStage,
                          )}
                        </CanvasPill>
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

function copyAuditPrefix(label: string) {
  return `${label} · `;
}

function healthStatusText(
  t: (key: string, params?: Record<string, string | number>) => string,
  status: PlatformAdapter["healthStatus"]["status"],
) {
  switch (status) {
    case "HEALTHY":
      return t("adapterRegistry.status.healthy");
    case "DEGRADED":
      return t("adapterRegistry.status.degraded");
    default:
      return t("adapterRegistry.status.unhealthy");
  }
}
