"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type { PlatformAdapter } from "../../../../packages/contracts/src/platform-adapter-registry";
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

function formatLastEvent(
  t: (key: string, params?: Record<string, string | number>) => string,
  adapter: PlatformAdapter,
) {
  if (adapter.webhookStatus?.lastEventTimestamp) {
    return formatDateTime(adapter.webhookStatus.lastEventTimestamp);
  }
  if (adapter.healthStatus.lastCheckTimestamp) {
    return formatDateTime(adapter.healthStatus.lastCheckTimestamp);
  }
  return t("adapterRegistry.notConfigured");
}

function formatLatency(adapter: PlatformAdapter) {
  return `${adapter.policies.acceptTimeoutSeconds}s`;
}

function formatWebhookValue(
  t: (key: string, params?: Record<string, string | number>) => string,
  adapter: PlatformAdapter,
) {
  if (!adapter.webhookStatus?.url) {
    return t("adapterRegistry.webhookNotConfigured");
  }

  const status = adapter.webhookStatus.lastStatus.toLowerCase();
  const code = adapter.webhookStatus.lastStatusCode
    ? ` · ${adapter.webhookStatus.lastStatusCode}`
    : "";
  return `${status}${code}`;
}

function formatServiceBuckets(
  t: (key: string, params?: Record<string, string | number>) => string,
  adapter: PlatformAdapter,
) {
  return adapter.policies.serviceBuckets.length > 0
    ? adapter.policies.serviceBuckets.join(" / ")
    : t("adapterRegistry.notConfigured");
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

  const unavailableCopy = t("adapterRegistry.unavailable");

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
          setError(normalizeRegistryError(message, unavailableCopy));
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
  }, [client, unavailableCopy]);

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
          ? t("adapterRegistry.enableConfirm", { name: adapter.name })
          : t("adapterRegistry.disableConfirm", { name: adapter.name }),
      )
    ) {
      return;
    }

    let reason: string | undefined;
    if (needsReason) {
      const input = window
        .prompt(
          t("adapterRegistry.disableReasonPrompt", { name: adapter.name }),
        )
        ?.trim();
      if (!input) {
        setFlash({
          tone: "danger",
          message: t("adapterRegistry.reasonRequired"),
        });
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
        message: t("adapterRegistry.toggleSuccess", {
          name: updated.name,
          status: nextEnabled
            ? t("adapterRegistry.toggleSuccess.enabled")
            : t("adapterRegistry.toggleSuccess.disabled"),
          reason: reason
            ? t("adapterRegistry.toggleSuccessReason", { reason })
            : "",
        }),
      });
    } catch {
      setFlash({ tone: "danger", message: t("adapterRegistry.toggleError") });
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
      message: t("adapterRegistry.queueGoverned", {
        label,
        name: adapter.name,
        reason: reason
          ? t("adapterRegistry.queueGovernedReason", { reason })
          : "",
      }),
    });
  }

  function queueOpsAction(label: string, adapter: PlatformAdapter) {
    setFlash({
      tone: "info",
      message: t("adapterRegistry.queueOps", { label, name: adapter.name }),
    });
  }

  return (
    <>
      <PageHeader
        theme={theme}
        title={t("adapterRegistry.pageTitle")}
        subtitle={t("adapterRegistry.pageSubtitle")}
        sticky={false}
        actions={
          <Btn
            theme={theme}
            variant="primary"
            icon="plus"
            onClick={() =>
              setFlash({
                tone: "info",
                message: t("adapterRegistry.registerInfo"),
              })
            }
          >
            {t("adapterRegistry.registerAction")}
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
              ? t("adapterRegistry.bannerTitle", {
                  platformCode: bannerAdapter.platformCode.toLowerCase(),
                })
              : t("adapterRegistry.bannerFallbackTitle")
          }
          body={
            bannerAdapter && attentionAdapter
              ? t("adapterRegistry.bannerBody", {
                  name: bannerAdapter.name,
                  credentialStatus: formatPlatformCodeLabel(
                    locale,
                    bannerAdapter.credentialStatus,
                  ).toLowerCase(),
                  healthStatus: t(
                    `adapterRegistry.status.${bannerAdapter.healthStatus.status.toLowerCase()}`,
                  ),
                })
              : t("adapterRegistry.bannerFallbackBody")
          }
          actions={
            bannerAdapter ? (
              <Btn
                theme={theme}
                variant="primary"
                danger
                icon="refresh"
                onClick={() =>
                  queueGovernedAction(
                    t("adapterRegistry.rotateCredential"),
                    bannerAdapter,
                  )
                }
              >
                {t("adapterRegistry.rotateNow")}
              </Btn>
            ) : undefined
          }
        />

        {flash ? (
          <div style={flashStyle(flash.tone)}>{flash.message}</div>
        ) : null}
        {error && adapters.length > 0 ? (
          <div style={flashStyle("danger")}>{unavailableCopy}</div>
        ) : null}

        {loading ? (
          <Card theme={theme}>
            <div style={emptyCardStyle}>{t("adapterRegistry.loading")}</div>
          </Card>
        ) : showUnavailableState ? (
          <Card theme={theme}>
            <div style={emptyCardStyle}>{unavailableCopy}</div>
          </Card>
        ) : sortedAdapters.length === 0 ? (
          <Card theme={theme}>
            <div style={emptyCardStyle}>{t("adapterRegistry.empty")}</div>
          </Card>
        ) : (
          <div style={cardGridStyle}>
            {sortedAdapters.map((adapter) => {
              const opsPauseSupported =
                adapter.isForwarded && hasSupportedAction(adapter, "accept");
              const retrySupported = hasSupportedAction(adapter, "retry");
              const featureFlags = getFeatureFlagEntries(adapter);
              const supportedActions = adapter.supportedActions;

              return (
                <Card
                  key={adapter.id}
                  theme={theme}
                  title={
                    <span style={cardTitleStyle}>
                      {adapter.name}
                      <Pill theme={theme} tone={adapterKindTone(adapter)}>
                        {adapter.isForwarded
                          ? t("adapterRegistry.forwarder")
                          : formatPlatformCodeLabel(
                              locale as LabelLocale,
                              adapter.adapterType,
                            )}
                      </Pill>
                    </span>
                  }
                  subtitle={adapter.id}
                  actions={
                    <Pill
                      theme={theme}
                      tone={healthTone(adapter.healthStatus.status)}
                      dot
                    >
                      {formatHealthLabel(t, adapter.healthStatus.status)}
                    </Pill>
                  }
                >
                  <DL
                    theme={theme}
                    cols={3}
                    items={[
                      {
                        k: t("adapterRegistry.metric.latency"),
                        v: formatLatency(adapter),
                        mono: true,
                      },
                      {
                        k: t("adapterRegistry.metric.lastEvent"),
                        v: formatLastEvent(t, adapter),
                        mono: true,
                      },
                      {
                        k: t("adapterRegistry.metric.orders"),
                        v: t("adapterRegistry.metric.ordersPending"),
                        mono: true,
                      },
                    ]}
                  />

                  <div style={metadataGridStyle}>
                    <div style={metadataBlockStyle}>
                      <p style={metadataLabelStyle}>
                        {t("adapterRegistry.webhookTitle")}
                      </p>
                      <p style={metadataValueStyle}>
                        {formatWebhookValue(t, adapter)}
                      </p>
                      <p style={metadataSubValueStyle}>
                        {adapter.webhookStatus?.url ??
                          t("adapterRegistry.webhookNotConfigured")}
                      </p>
                    </div>
                    <div style={metadataBlockStyle}>
                      <p style={metadataLabelStyle}>
                        {t("adapterRegistry.financeMode")}
                      </p>
                      <p style={metadataValueStyle}>
                        {formatPlatformCodeLabel(
                          locale as LabelLocale,
                          adapter.policies.financeAuthorityMode,
                        )}
                      </p>
                      <p style={metadataSubValueStyle}>
                        {t("adapterRegistry.lastCheck")}:{" "}
                        {adapter.healthStatus.lastCheckTimestamp
                          ? formatDateTime(
                              adapter.healthStatus.lastCheckTimestamp,
                            )
                          : t("adapterRegistry.notConfigured")}
                      </p>
                    </div>
                    <div style={metadataBlockStyle}>
                      <p style={metadataLabelStyle}>
                        {t("adapterRegistry.serviceBuckets")}
                      </p>
                      <p style={metadataValueStyle}>
                        {formatServiceBuckets(t, adapter)}
                      </p>
                      <p style={metadataSubValueStyle}>
                        {t("adapterRegistry.maxCandidatesManualFallback", {
                          maxCandidates: adapter.policies.maxCandidates,
                          seconds:
                            adapter.policies.manualFallbackThresholdSeconds,
                        })}
                      </p>
                    </div>
                    <div style={metadataBlockStyle}>
                      <p style={metadataLabelStyle}>
                        {t("adapterRegistry.operationalPause")}
                      </p>
                      <p style={metadataValueStyle}>
                        {t("adapterRegistry.noPause")}
                      </p>
                      <p style={metadataSubValueStyle}>
                        {t("adapterRegistry.pauseUnknown")}
                      </p>
                    </div>
                  </div>

                  <div style={authoritySplitStyle}>
                    <div style={authorityColumnStyle}>
                      <p style={authorityLabelStyle}>
                        {t("adapterRegistry.authorityPa")}
                      </p>
                      <div style={actionRowStyle}>
                        <Btn
                          theme={theme}
                          size="xs"
                          variant="secondary"
                          onClick={() =>
                            queueGovernedAction(
                              t("adapterRegistry.editConfig"),
                              adapter,
                            )
                          }
                        >
                          {t("adapterRegistry.editConfig")}
                        </Btn>
                        <Btn
                          theme={theme}
                          size="xs"
                          variant="secondary"
                          icon="apiKeys"
                          onClick={() =>
                            queueGovernedAction(
                              t("adapterRegistry.editCredential"),
                              adapter,
                            )
                          }
                        >
                          {t("adapterRegistry.editCredential")}
                        </Btn>
                        <Btn
                          theme={theme}
                          size="xs"
                          variant="secondary"
                          icon="refresh"
                          onClick={() =>
                            queueGovernedAction(
                              t("adapterRegistry.rotateCredential"),
                              adapter,
                            )
                          }
                        >
                          {t("adapterRegistry.rotateCredential")}
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
                            ? t("adapterRegistry.disableAdapter")
                            : t("adapterRegistry.enableAdapter")}
                        </Btn>
                      </div>
                      <p style={helperTextStyle}>
                        {t("adapterRegistry.governedActionInfo")}
                      </p>
                      <div style={tokenRowStyle}>
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
                        <Pill
                          theme={theme}
                          tone={booleanTone(adapter.config.isEnabled)}
                        >
                          {adapter.config.isEnabled
                            ? t("adapterRegistry.enableAdapter")
                            : t("adapterRegistry.disableAdapter")}
                        </Pill>
                      </div>
                      <div style={tokenRowStyle}>
                        {featureFlags.length > 0 ? (
                          featureFlags.map(([key, value]) => (
                            <Pill
                              key={key}
                              theme={theme}
                              tone={value ? "success" : "neutral"}
                            >
                              {key}:
                              {value
                                ? t("adapterRegistry.featureFlagState.on")
                                : t("adapterRegistry.featureFlagState.off")}
                            </Pill>
                          ))
                        ) : (
                          <Pill theme={theme} tone="neutral">
                            {t("adapterRegistry.featureFlags")}:{" "}
                            {t("adapterRegistry.notConfigured")}
                          </Pill>
                        )}
                      </div>
                    </div>

                    <div style={authorityColumnStyle}>
                      <p style={authorityLabelStyle}>
                        {t("adapterRegistry.authorityOps")}
                      </p>
                      <div style={actionRowStyle}>
                        <Btn
                          theme={theme}
                          size="xs"
                          variant="ghost"
                          disabled={!opsPauseSupported}
                          onClick={() =>
                            opsPauseSupported
                              ? queueOpsAction(
                                  t("adapterRegistry.pauseTraffic"),
                                  adapter,
                                )
                              : setFlash({
                                  tone: "info",
                                  message: t(
                                    "adapterRegistry.showUnsupportedOpsAction",
                                  ),
                                })
                          }
                        >
                          {t("adapterRegistry.pauseTraffic")}
                        </Btn>
                        <Btn
                          theme={theme}
                          size="xs"
                          variant="ghost"
                          disabled={!retrySupported}
                          onClick={() =>
                            retrySupported
                              ? queueOpsAction(
                                  t("adapterRegistry.retryCallback"),
                                  adapter,
                                )
                              : setFlash({
                                  tone: "info",
                                  message: t(
                                    "adapterRegistry.showUnsupportedOpsAction",
                                  ),
                                })
                          }
                        >
                          {t("adapterRegistry.retryCallback")}
                        </Btn>
                      </div>
                      <p style={helperTextStyle}>
                        {t("adapterRegistry.opsActionInfo")}
                      </p>
                      <div style={tokenRowStyle}>
                        {supportedActions.length > 0 ? (
                          supportedActions.map((action) => (
                            <Pill
                              key={action.name}
                              theme={theme}
                              tone="neutral"
                            >
                              {action.name}
                            </Pill>
                          ))
                        ) : (
                          <Pill theme={theme} tone="neutral">
                            {t("adapterRegistry.supportedActions")}:{" "}
                            {t("adapterRegistry.notConfigured")}
                          </Pill>
                        )}
                      </div>
                      <div style={tokenRowStyle}>
                        <Pill
                          theme={theme}
                          tone={healthTone(adapter.healthStatus.status)}
                        >
                          {formatHealthLabel(t, adapter.healthStatus.status)}
                        </Pill>
                        <Pill theme={theme} tone="neutral">
                          {formatPlatformCodeLabel(
                            locale as LabelLocale,
                            adapter.rolloutStatus,
                          )}
                        </Pill>
                        <Pill theme={theme} tone="neutral">
                          {formatPlatformCodeLabel(
                            locale as LabelLocale,
                            adapter.rolloutStage,
                          )}
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
