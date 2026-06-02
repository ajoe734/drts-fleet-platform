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

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const bodyStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const gridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
} satisfies CSSProperties;

const cardTitleStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

const cardDescriptionStyle = {
  margin: "0 0 12px",
  color: theme.textMuted,
  fontSize: 12.5,
  lineHeight: 1.5,
} satisfies CSSProperties;

const inlineRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
} satisfies CSSProperties;

const sectionLabelStyle = {
  margin: 0,
  color: theme.textDim,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
} satisfies CSSProperties;

const actionGroupStyle = {
  display: "grid",
  gap: 8,
  paddingTop: 12,
  borderTop: `1px solid ${theme.border}`,
} satisfies CSSProperties;

const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
} satisfies CSSProperties;

const flagListStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 12,
} satisfies CSSProperties;

const emptyStateStyle = {
  display: "grid",
  placeItems: "center",
  minHeight: 220,
  textAlign: "center",
  color: theme.textMuted,
  fontSize: 12.5,
} satisfies CSSProperties;

const feedbackStyle = (tone: CanvasTone): CSSProperties => ({
  color:
    tone === "danger"
      ? theme.danger
      : tone === "success"
        ? theme.success
        : theme.textMuted,
  fontSize: 12,
  lineHeight: 1.5,
});

type FlashState = {
  tone: CanvasTone;
  message: string;
} | null;

type Copy = {
  title: string;
  subtitle: string;
  registerAction: string;
  loading: string;
  empty: string;
  refresh: string;
  platformAdmin: string;
  opsAuthority: string;
  editConfig: string;
  editCredential: string;
  rotateCredential: string;
  enableAdapter: string;
  disableAdapter: string;
  pauseTraffic: string;
  retryCallback: string;
  pendingOpsNote: string;
  healthCheck: string;
  webhookEvent: string;
  updatedAt: string;
  scopeLabel: string;
  rolloutLabel: string;
  authorityLabel: string;
  capabilityLabel: string;
  dangerRotate: string;
  bannerTitle: (adapter: PlatformAdapter) => string;
  bannerBody: (adapter: PlatformAdapter) => string;
  actionQueued: (label: string, adapter: PlatformAdapter) => string;
  toggleSuccess: (adapter: PlatformAdapter, enabled: boolean) => string;
  toggleError: string;
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

function authorityTone(adapter: PlatformAdapter): CanvasTone {
  if (adapter.isForwarded) {
    return "info";
  }
  switch (adapter.policies.financeAuthorityMode) {
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

function adapterTypeTone(type: PlatformAdapter["adapterType"]): CanvasTone {
  switch (type) {
    case "EXTERNAL_COMBINED":
      return "accent";
    case "EXTERNAL_WEBHOOK":
    case "EXTERNAL_REST":
      return "info";
    case "INTERNAL":
      return "neutral";
    default:
      return "success";
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

function buildCapabilityFlags(adapter: PlatformAdapter) {
  return Object.entries(adapter.featureFlags)
    .filter(([, enabled]) => enabled)
    .map(([flag]) => flag);
}

function actionNames(adapter: PlatformAdapter) {
  return adapter.supportedActions.map((action) => action.name.toLowerCase());
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
              "Config and credential governance stays in platform-admin; operational pause and retry stay in ops per Q-ADM17.",
            registerAction: "Register adapter",
            loading: "Loading adapter registry...",
            empty: "No adapters are registered yet.",
            refresh: "Refresh",
            platformAdmin: "Platform Admin authority",
            opsAuthority: "Ops authority",
            editConfig: "Edit config",
            editCredential: "Edit credential",
            rotateCredential: "Rotate",
            enableAdapter: "Enable",
            disableAdapter: "Disable",
            pauseTraffic: "Ops pause (TTL)",
            retryCallback: "Retry callback",
            pendingOpsNote:
              "Ops write path stays in ops-console until the pause/retry API lands.",
            healthCheck: "HEALTH CHECK",
            webhookEvent: "WEBHOOK",
            updatedAt: "UPDATED",
            scopeLabel: "scope",
            rolloutLabel: "rollout",
            authorityLabel: "finance",
            capabilityLabel: "capabilities",
            dangerRotate: "Rotate now",
            bannerTitle: (adapter) =>
              `${adapter.platformCode.toLowerCase()} credential or health needs attention`,
            bannerBody: (adapter) =>
              `${adapter.name} is ${formatPlatformCodeLabel(locale, adapter.credentialStatus).toLowerCase()} with ${adapter.healthStatus.status.toLowerCase()} health. Rotate credentials or review the adapter before production impact expands.`,
            actionQueued: (label, adapter) =>
              `${label} for ${adapter.name} remains a Platform Admin review step. Secret material stays plaintext-once and is not shown here.`,
            toggleSuccess: (adapter, enabled) =>
              `${adapter.name} ${enabled ? "enabled" : "disabled"} successfully.`,
            toggleError: "Failed to update adapter state.",
          }
        : {
            title: "External Platform Adapter Registry",
            subtitle:
              "config / credential 治理留在 platform-admin；operational pause / retry 依 Q-ADM17 仍屬 ops。",
            registerAction: "註冊 adapter",
            loading: "載入 adapter registry 中...",
            empty: "目前尚未註冊任何 adapter。",
            refresh: "重新整理",
            platformAdmin: "Platform Admin authority",
            opsAuthority: "Ops authority",
            editConfig: "編輯設定",
            editCredential: "編輯 credential",
            rotateCredential: "輪替",
            enableAdapter: "啟用",
            disableAdapter: "停用",
            pauseTraffic: "ops pause (TTL)",
            retryCallback: "retry callback",
            pendingOpsNote:
              "ops 寫入仍留在 ops-console，待 pause / retry API 補齊後再接入。",
            healthCheck: "HEALTH CHECK",
            webhookEvent: "WEBHOOK",
            updatedAt: "UPDATED",
            scopeLabel: "scope",
            rolloutLabel: "rollout",
            authorityLabel: "finance",
            capabilityLabel: "capabilities",
            dangerRotate: "立即輪替",
            bannerTitle: (adapter) =>
              `${adapter.platformCode.toLowerCase()} · credential / health 需立即處理`,
            bannerBody: (adapter) =>
              `${adapter.name} 目前 credential 為 ${formatPlatformCodeLabel(locale, adapter.credentialStatus)}，健康狀態為 ${adapter.healthStatus.status.toLowerCase()}。請在影響 production 前完成輪替或治理檢查。`,
            actionQueued: (label, adapter) =>
              `${adapter.name} 的「${label}」仍是 Platform Admin 治理步驟；secret material 不會在這裡再次明文顯示。`,
            toggleSuccess: (adapter, enabled) =>
              `${adapter.name} 已${enabled ? "啟用" : "停用"}。`,
            toggleError: "更新 adapter 狀態失敗。",
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
          setError(caught instanceof Error ? caught.message : String(caught));
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
  }, [client]);

  const attentionAdapter = useMemo(
    () => findAttentionAdapter(adapters),
    [adapters],
  );

  const sortedAdapters = useMemo(
    () =>
      [...adapters].sort((left, right) => {
        const leftAttention = Number(left === attentionAdapter);
        const rightAttention = Number(right === attentionAdapter);
        if (leftAttention !== rightAttention) {
          return rightAttention - leftAttention;
        }
        return left.platformCode.localeCompare(right.platformCode);
      }),
    [adapters, attentionAdapter],
  );

  async function refreshAdapters() {
    setLoading(true);
    setError(null);
    try {
      const response = await client.listPlatformAdapters();
      setAdapters(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

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

  function queuePlatformAction(label: string, adapter: PlatformAdapter) {
    setFlash({ tone: "info", message: copy.actionQueued(label, adapter) });
  }

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        sticky={false}
        actions={
          <>
            <CanvasBtn
              theme={theme}
              icon="refresh"
              onClick={() => void refreshAdapters()}
            >
              {copy.refresh}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="primary"
              icon="plus"
              onClick={() =>
                setFlash({
                  tone: "info",
                  message:
                    locale === "en"
                      ? "Adapter registration remains a high-risk governed flow and is not opened inline yet."
                      : "註冊 adapter 仍屬高風險治理流程，暫不在此頁直接展開 inline 建立。",
                })
              }
            >
              {copy.registerAction}
            </CanvasBtn>
          </>
        }
      />

      <div style={bodyStyle}>
        {attentionAdapter ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={copy.bannerTitle(attentionAdapter)}
            body={copy.bannerBody(attentionAdapter)}
            actions={
              <CanvasBtn
                theme={theme}
                variant="primary"
                danger
                icon="refresh"
                onClick={() =>
                  queuePlatformAction(copy.rotateCredential, attentionAdapter)
                }
              >
                {copy.dangerRotate}
              </CanvasBtn>
            }
          />
        ) : null}

        {flash ? (
          <div style={feedbackStyle(flash.tone)}>{flash.message}</div>
        ) : null}
        {error ? <div style={feedbackStyle("danger")}>{error}</div> : null}

        {loading ? (
          <CanvasCard theme={theme}>
            <div style={emptyStateStyle}>{copy.loading}</div>
          </CanvasCard>
        ) : sortedAdapters.length === 0 ? (
          <CanvasCard theme={theme}>
            <div style={emptyStateStyle}>{copy.empty}</div>
          </CanvasCard>
        ) : (
          <div style={gridStyle}>
            {sortedAdapters.map((adapter) => {
              const capabilities = buildCapabilityFlags(adapter);
              const supportedActionNames = actionNames(adapter);

              return (
                <CanvasCard
                  key={adapter.id}
                  theme={theme}
                  title={
                    <span style={cardTitleStyle}>
                      {adapter.name}
                      <CanvasPill
                        theme={theme}
                        tone={adapterTypeTone(adapter.adapterType)}
                      >
                        {formatPlatformCodeLabel(locale, adapter.adapterType)}
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
                      {adapter.healthStatus.status.toLowerCase()}
                    </CanvasPill>
                  }
                >
                  <p style={cardDescriptionStyle}>{adapter.description}</p>

                  <CanvasDL
                    theme={theme}
                    cols={3}
                    items={[
                      {
                        k: copy.healthCheck,
                        v: formatDateTime(
                          adapter.healthStatus.lastCheckTimestamp ?? "",
                        ),
                        mono: true,
                      },
                      {
                        k: copy.webhookEvent,
                        v: adapter.webhookStatus?.lastEventTimestamp
                          ? formatDateTime(
                              adapter.webhookStatus.lastEventTimestamp,
                            )
                          : locale === "en"
                            ? "not configured"
                            : "未設定",
                        mono: true,
                      },
                      {
                        k: copy.updatedAt,
                        v: formatDateTime(adapter.updatedAt),
                        mono: true,
                      },
                    ]}
                  />

                  <div style={flagListStyle}>
                    <CanvasPill
                      theme={theme}
                      tone={adapter.config.isEnabled ? "success" : "neutral"}
                    >
                      {adapter.config.isEnabled
                        ? locale === "en"
                          ? "enabled"
                          : "enabled"
                        : locale === "en"
                          ? "disabled"
                          : "disabled"}
                    </CanvasPill>
                    <CanvasPill
                      theme={theme}
                      tone={credentialTone(adapter.credentialStatus)}
                    >
                      credential ·{" "}
                      {formatPlatformCodeLabel(
                        locale,
                        adapter.credentialStatus,
                      )}
                    </CanvasPill>
                    <CanvasPill
                      theme={theme}
                      tone={rolloutTone(adapter.rolloutStatus)}
                    >
                      {copy.rolloutLabel} ·{" "}
                      {formatPlatformCodeLabel(locale, adapter.rolloutStatus)}
                    </CanvasPill>
                    <CanvasPill theme={theme} tone={authorityTone(adapter)}>
                      {copy.authorityLabel} ·{" "}
                      {formatPlatformCodeLabel(
                        locale,
                        adapter.policies.financeAuthorityMode,
                      )}
                    </CanvasPill>
                    <CanvasPill theme={theme} tone="neutral">
                      {copy.scopeLabel} ·{" "}
                      {adapter.isForwarded
                        ? locale === "en"
                          ? "forwarded"
                          : "forwarded"
                        : locale === "en"
                          ? "owned"
                          : "owned"}
                    </CanvasPill>
                  </div>

                  <div style={flagListStyle}>
                    {capabilities.length > 0 ? (
                      capabilities.map((flag) => (
                        <CanvasPill key={flag} theme={theme} tone="neutral">
                          {copy.capabilityLabel} · {flag}
                        </CanvasPill>
                      ))
                    ) : (
                      <CanvasPill theme={theme} tone="neutral">
                        {copy.capabilityLabel} · —
                      </CanvasPill>
                    )}
                  </div>

                  <div style={actionGroupStyle}>
                    <p style={sectionLabelStyle}>{copy.platformAdmin}</p>
                    <div style={actionRowStyle}>
                      <CanvasBtn
                        theme={theme}
                        size="xs"
                        icon="more"
                        onClick={() =>
                          queuePlatformAction(copy.editConfig, adapter)
                        }
                      >
                        {copy.editConfig}
                      </CanvasBtn>
                      <CanvasBtn
                        theme={theme}
                        size="xs"
                        icon="copy"
                        onClick={() =>
                          queuePlatformAction(copy.editCredential, adapter)
                        }
                      >
                        {copy.editCredential}
                      </CanvasBtn>
                      <CanvasBtn
                        theme={theme}
                        size="xs"
                        icon="refresh"
                        onClick={() =>
                          queuePlatformAction(copy.rotateCredential, adapter)
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

                  <div style={actionGroupStyle}>
                    <div style={inlineRowStyle}>
                      <p style={sectionLabelStyle}>{copy.opsAuthority}</p>
                      <CanvasPill theme={theme} tone="neutral">
                        {copy.pendingOpsNote}
                      </CanvasPill>
                    </div>
                    <div style={actionRowStyle}>
                      <CanvasBtn
                        theme={theme}
                        size="xs"
                        disabled={!supportedActionNames.includes("accept")}
                      >
                        {copy.pauseTraffic}
                      </CanvasBtn>
                      <CanvasBtn
                        theme={theme}
                        size="xs"
                        disabled={!supportedActionNames.includes("reject")}
                      >
                        {copy.retryCallback}
                      </CanvasBtn>
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
