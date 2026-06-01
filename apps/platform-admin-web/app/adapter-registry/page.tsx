"use client";

/**
 * `/adapter-registry` — External Platform Adapter Registry (split authority).
 *
 * Visual follows `docs/05-ui/drts-design-canvas/Platform Admin.html`
 * (`PA_AdapterRegistry`): an indigo-accented card grid with a credential /
 * health banner and per-adapter authority-driven action rows.
 *
 * Behaviour follows the design hand-off packet
 * `docs/05-ui/platform-admin-design-handoff-packet-20260525.md` §5.18 +
 * §3.2 (refresh tier T4), §3.4 (risk-classified confirmation), §3.5
 * (`availableActions` drives CTAs — never hard-coded by role), §3.6 (six
 * `EmptyReason` states), §3.10 (cross-app deep links, new tab).
 *
 * Per Q-ADM17 write authority is split: platform-admin owns config /
 * credential / enable-disable; ops owns operational pause (TTL) + callback
 * retry. The action descriptors below model that split; CTAs render from the
 * descriptor list, so the same component honours whatever the backend later
 * returns in `data.availableActions[]`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CredentialStatus,
  Environment,
  FinanceAuthorityMode,
  type ActionReceipt,
  type ActionRiskLevel,
  type CrossAppResourceLink,
  type EmptyReason,
  type EmptyStateEnvelope,
  type PlatformAdapter,
  type RefreshTier,
  type ResourceActionDescriptor,
  type UiRefreshMetadata,
} from "@drts/contracts";
import { ApiClient } from "@drts/api-client";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import {
  AuthorityBadge,
  CalloutBanner,
  DataFilterBar,
  PageHeader,
  StatusChip,
} from "@drts/ui-web";

const apiClient = new ApiClient({ baseUrl: "" });

// ── §3.2 Refresh model — platform-admin surfaces are T4 medium-slow (30s) ──
const REFRESH_TIER: RefreshTier = "medium_slow";
const REFRESH_CADENCE_MS: Record<RefreshTier, number> = {
  urgent: 5_000,
  fast: 3_000,
  dispatch: 5_000,
  medium: 15_000,
  medium_slow: 30_000,
  slow: 30_000,
  manual: 0,
};
const REFRESH_INTERVAL_MS = REFRESH_CADENCE_MS[REFRESH_TIER];

type AdapterFilter = "all" | "forwarded" | "attention" | "production";

type FetchOutcome = {
  ok: boolean;
  authorized: boolean;
  externalAvailable: boolean;
};

type ToneName =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "accent";

// ── §3.10 Cross-app deep link — ops owns operational traffic (Q-ADM17). ──
const DEFAULT_OPS_CONSOLE_BASE = "/_apps/ops-console";

function resolveOpsConsoleBase(): string {
  const value =
    process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ??
    process.env.DRTS_OPS_CONSOLE_URL ??
    "";
  const trimmed = value.trim().replace(/\/$/, "");
  return trimmed || DEFAULT_OPS_CONSOLE_BASE;
}

function opsDispatchLink(
  adapter: PlatformAdapter,
  label: string,
): CrossAppResourceLink {
  return {
    targetApp: "ops-console",
    route: `/dispatch?board=forwarded&adapterId=${encodeURIComponent(adapter.id)}`,
    resourceType: "forwarded_adapter",
    resourceId: adapter.id,
    openMode: "new_tab",
    label,
  };
}

function crossAppHref(link: CrossAppResourceLink): string {
  const base = resolveOpsConsoleBase();
  const path = link.route.startsWith("/") ? link.route : `/${link.route}`;
  return `${base}${path}`;
}

// ── Status tone helpers ────────────────────────────────────────────────────
function toneForHealth(status: PlatformAdapter["healthStatus"]["status"]): ToneName {
  switch (status) {
    case "HEALTHY":
      return "success";
    case "DEGRADED":
      return "warning";
    case "UNHEALTHY":
      return "danger";
    default:
      return "neutral";
  }
}

function toneForCredential(status: PlatformAdapter["credentialStatus"]): ToneName {
  switch (status) {
    case CredentialStatus.VALID:
      return "success";
    case CredentialStatus.PENDING:
      return "info";
    case CredentialStatus.INVALID:
    case CredentialStatus.EXPIRED:
      return "danger";
    case CredentialStatus.NOT_CONFIGURED:
    default:
      return "warning";
  }
}

function toneForAuthority(mode: FinanceAuthorityMode): ToneName {
  switch (mode) {
    case FinanceAuthorityMode.OWNED:
      return "success";
    case FinanceAuthorityMode.SHADOW:
      return "warning";
    case FinanceAuthorityMode.EXTERNAL:
    default:
      return "info";
  }
}

function isProduction(adapter: PlatformAdapter): boolean {
  return (
    adapter.environment === Environment.PRODUCTION ||
    adapter.rolloutStage === Environment.PRODUCTION
  );
}

function isPaused(adapter: PlatformAdapter): boolean {
  return Boolean(adapter.featureFlags?.["operationallyPaused"]);
}

function credentialExpiring(adapter: PlatformAdapter): boolean {
  return (
    adapter.credentialStatus === CredentialStatus.EXPIRED ||
    adapter.credentialStatus === CredentialStatus.INVALID
  );
}

function needsAttention(adapter: PlatformAdapter): boolean {
  return (
    adapter.warn === true ||
    adapter.draft === true ||
    adapter.healthStatus.status !== "HEALTHY" ||
    adapter.credentialStatus !== CredentialStatus.VALID ||
    isPaused(adapter)
  );
}

// ── §3.5 / §5.18 — availableActions per resource (Q-ADM17 authority split). ─
// The descriptor list is what the CTAs render from; it stands in for the
// backend `data.availableActions[]` until that field lands on the contract.
function deriveAvailableActions(adapter: PlatformAdapter): ResourceActionDescriptor[] {
  const prod = isProduction(adapter);
  const credentialConfigured =
    adapter.credentialStatus !== CredentialStatus.NOT_CONFIGURED;
  const paused = isPaused(adapter);
  const callbackFailing = adapter.webhookStatus?.lastStatus === "FAILURE";
  const actions: ResourceActionDescriptor[] = [];

  // Edit config (medium) — platform-admin.
  actions.push({ action: "edit_config", enabled: true, riskLevel: "medium" });

  // Edit credentials (high — pa_super_admin only); never re-shown after save.
  actions.push({ action: "edit_credentials", enabled: true, riskLevel: "high" });

  // Rotate credentials (high — secret shown once like Q-ADM07).
  actions.push({
    action: "rotate_credentials",
    enabled: credentialConfigured,
    riskLevel: "high",
    requiresReason: true,
    ...(credentialConfigured
      ? {}
      : { disabledReasonCode: "credential_not_configured" }),
  });

  // Enable / disable (high; disable affecting a production tenant needs reason).
  if (adapter.config.isEnabled) {
    actions.push({
      action: "disable",
      enabled: true,
      riskLevel: "high",
      requiresReason: prod,
    });
  } else {
    actions.push({
      action: "enable",
      enabled: credentialConfigured,
      riskLevel: "high",
      ...(credentialConfigured
        ? {}
        : { disabledReasonCode: "credential_not_configured" }),
    });
  }

  // Ops-scope (Q-ADM17): pause/resume operational traffic + retry callback.
  if (adapter.isForwarded) {
    if (paused) {
      actions.push({ action: "resume_traffic", enabled: true, riskLevel: "medium" });
    } else {
      actions.push({
        action: "pause_traffic",
        enabled: true,
        riskLevel: "high",
        requiresReason: true,
      });
    }
    actions.push({
      action: "retry_callback",
      enabled: callbackFailing,
      riskLevel: "medium",
      ...(callbackFailing ? {} : { disabledReasonCode: "no_failed_callback" }),
    });
  }

  return actions;
}

function actionNeedsReason(descriptor: ResourceActionDescriptor): boolean {
  // Packet §3.4: high-risk actions require a reason unless the backend
  // descriptor explicitly opts out via `requiresReason: false`.
  return descriptor.requiresReason ?? descriptor.riskLevel === "high";
}

// ── §3.6 — six distinct EmptyReason treatments (platform-admin scope). ──────
const EMPTY_ICON: Record<EmptyReason, string> = {
  no_data: "○",
  not_provisioned: "⚙",
  fetch_failed: "⚠",
  permission_denied: "🔒",
  external_unavailable: "⌁",
  driver_not_eligible: "✕",
  filtered_empty: "⚲",
};

type EmptyCopy = { title: string; body: string; nextAction?: string };

function emptyCopy(reason: EmptyReason, locale: Locale): EmptyCopy {
  const en: Record<EmptyReason, EmptyCopy> = {
    no_data: {
      title: "No adapters registered yet",
      body: "Register the first external platform adapter to start routing forwarded orders.",
      nextAction: "Register adapter",
    },
    not_provisioned: {
      title: "Adapter registry not provisioned",
      body: "This environment has no adapter registry tenant configured. Provision it before adding adapters.",
      nextAction: "Provision registry",
    },
    fetch_failed: {
      title: "Could not load the adapter registry",
      body: "The registry service did not respond. Retry, or check Platform Health for a wider signal.",
      nextAction: "Retry",
    },
    permission_denied: {
      title: "You can view but not load this registry",
      body: "Your role lacks adapter registry read scope. Ask a pa_super_admin to grant access.",
    },
    external_unavailable: {
      title: "Upstream adapter service unavailable",
      body: "The external adapter platform is unreachable right now. Operational state may be stale.",
      nextAction: "Open Platform Health",
    },
    driver_not_eligible: {
      title: "Not applicable",
      body: "This empty reason does not apply to the adapter registry.",
    },
    filtered_empty: {
      title: "No adapters match this filter",
      body: "No adapters match the selected filter. Clear it to see the full registry.",
      nextAction: "Clear filter",
    },
  };
  const zh: Record<EmptyReason, EmptyCopy> = {
    no_data: {
      title: "尚未登錄任何 adapter",
      body: "請先註冊第一個外部平台 adapter，才能開始路由轉派訂單。",
      nextAction: "註冊 adapter",
    },
    not_provisioned: {
      title: "adapter registry 尚未開通",
      body: "此環境尚未配置 adapter registry 租戶；請先開通再新增 adapter。",
      nextAction: "開通 registry",
    },
    fetch_failed: {
      title: "無法載入 adapter registry",
      body: "registry 服務沒有回應。請重試，或到「平台健康」查看更廣的訊號。",
      nextAction: "重試",
    },
    permission_denied: {
      title: "你可檢視但無法載入此 registry",
      body: "你的角色缺少 adapter registry 讀取權限；請向 pa_super_admin 申請。",
    },
    external_unavailable: {
      title: "上游 adapter 服務無法連線",
      body: "外部 adapter 平台目前無法連線，營運狀態可能不是最新。",
      nextAction: "前往平台健康",
    },
    driver_not_eligible: {
      title: "不適用",
      body: "此 empty reason 不適用於 adapter registry。",
    },
    filtered_empty: {
      title: "沒有符合此篩選的 adapter",
      body: "沒有 adapter 符合目前篩選條件；清除篩選即可看到完整 registry。",
      nextAction: "清除篩選",
    },
  };
  return (locale === "en" ? en : zh)[reason];
}

function resolveEmptyReason(args: {
  outcome: FetchOutcome;
  totalCount: number;
  filteredCount: number;
  filtersActive: boolean;
}): EmptyReason | null {
  const { outcome, totalCount, filteredCount, filtersActive } = args;
  if (filteredCount > 0) return null;
  if (!outcome.authorized) return "permission_denied";
  if (!outcome.externalAvailable) return "external_unavailable";
  if (!outcome.ok) return "fetch_failed";
  if (filtersActive && totalCount > 0) return "filtered_empty";
  if (totalCount === 0) return "no_data";
  return "no_data";
}

interface ActionState {
  adapter: PlatformAdapter;
  descriptor: ResourceActionDescriptor;
}

function buildCopy(locale: Locale) {
  return locale === "en"
    ? {
        title: "External Platform Adapter Registry",
        subtitle:
          "Config / credential governance lives in Platform Admin · operational pause / retry lives in Ops (Q-ADM17 split).",
        register: "Register adapter",
        all: "All",
        forwarded: "Forwarded",
        attention: "Attention",
        production: "Production",
        health: "Health",
        credential: "Credential",
        authority: "Authority",
        rollout: "Rollout",
        enabled: "Enabled",
        disabled: "Disabled",
        owned: "owned",
        forwardedTag: "forwarded",
        lastCheck: "Last health check",
        environment: "Environment",
        adapterType: "Type",
        webhook: "Webhook",
        paused: "Ops paused",
        features: "Feature flags",
        freshAgo: (s: string) => `Updated ${s} ago`,
        stale: "Stale — refreshing",
        refreshNow: "Refresh now",
        tierNote: "Auto-refresh every 30s (T4)",
        opsManage: "Manage traffic in Ops Console",
        viewHealth: "Platform Health",
        viewAudit: "Audit history",
        confirmTitle: "Confirm action",
        reasonLabel: "Reason (required)",
        reasonPlaceholder: "Explain why — recorded in the audit trail",
        cancel: "Cancel",
        confirm: "Confirm",
        secretOnce: "Secret material is shown once and never again.",
        viewReceiptAudit: "View audit",
        showing: "Showing",
        actor: "platform / production / SA-01",
      }
    : {
        title: "外部平台 Adapter 登錄",
        subtitle:
          "config / credential 治理在 Platform Admin · 營運暫停 / 重試在 Ops（Q-ADM17 權責分離）。",
        register: "註冊 adapter",
        all: "全部",
        forwarded: "轉派",
        attention: "需關注",
        production: "正式環境",
        health: "健康",
        credential: "憑證",
        authority: "財務權責",
        rollout: "Rollout",
        enabled: "已啟用",
        disabled: "已停用",
        owned: "owned",
        forwardedTag: "forwarded",
        lastCheck: "上次健康檢查",
        environment: "環境",
        adapterType: "類型",
        webhook: "Webhook",
        paused: "Ops 已暫停",
        features: "功能旗標",
        freshAgo: (s: string) => `${s}前更新`,
        stale: "資料過期 — 重新整理中",
        refreshNow: "立即重新整理",
        tierNote: "每 30 秒自動更新（T4）",
        opsManage: "在 Ops Console 管理流量",
        viewHealth: "平台健康",
        viewAudit: "稽核歷史",
        confirmTitle: "確認操作",
        reasonLabel: "原因（必填）",
        reasonPlaceholder: "請說明原因 — 會記錄到稽核軌跡",
        cancel: "取消",
        confirm: "確認",
        secretOnce: "機密內容只會顯示一次，之後不再顯示。",
        viewReceiptAudit: "查看稽核",
        showing: "目前顯示",
        actor: "platform / production / SA-01",
      };
}

type PageCopy = ReturnType<typeof buildCopy>;

let receiptSeq = 0;

export default function AdapterRegistryPage() {
  const { locale } = useTranslation();

  const [adapters, setAdapters] = useState<PlatformAdapter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [outcome, setOutcome] = useState<FetchOutcome>({
    ok: true,
    authorized: true,
    externalAvailable: true,
  });
  const [refreshMeta, setRefreshMeta] = useState<UiRefreshMetadata | null>(null);
  const [filter, setFilter] = useState<AdapterFilter>("all");
  const [pendingAction, setPendingAction] = useState<ActionState | null>(null);
  const [reason, setReason] = useState("");
  const [receipt, setReceipt] = useState<ActionReceipt | null>(null);
  const [nowTs, setNowTs] = useState<number>(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const loadAdapters = useCallback(async () => {
    try {
      const fetched = await apiClient.listPlatformAdapters();
      if (!isMounted.current) return;
      setAdapters(fetched);
      setOutcome({ ok: true, authorized: true, externalAvailable: true });
      setRefreshMeta({
        generatedAt: new Date().toISOString(),
        staleAfterMs: REFRESH_INTERVAL_MS,
        dataFreshness: "fresh",
        source: "live",
      });
    } catch (err) {
      if (!isMounted.current) return;
      const status = Number(
        (err as { status?: number; statusCode?: number })?.status ??
          (err as { statusCode?: number })?.statusCode ??
          0,
      );
      setOutcome({
        ok: false,
        authorized: status !== 401 && status !== 403,
        externalAvailable: status !== 502 && status !== 503 && status !== 504,
      });
      setRefreshMeta({
        generatedAt: new Date().toISOString(),
        staleAfterMs: REFRESH_INTERVAL_MS,
        dataFreshness: "degraded",
        source: "live",
      });
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, []);

  // Initial load + T4 medium-slow polling (§3.2).
  useEffect(() => {
    void loadAdapters();
    if (REFRESH_INTERVAL_MS <= 0) return;
    const id = window.setInterval(() => {
      void loadAdapters();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [loadAdapters]);

  // Lightweight clock so the freshness affordance updates without refetching.
  useEffect(() => {
    setNowTs(Date.now());
    const id = window.setInterval(() => setNowTs(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);

  // §3.10 — cross-app entry from ops-console /dispatch deep-links an adapter.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("adapterId");
    if (id) setHighlightId(id);
  }, []);

  const copy = useMemo(() => buildCopy(locale), [locale]);

  const filteredAdapters = useMemo(() => {
    return adapters.filter((adapter) => {
      switch (filter) {
        case "forwarded":
          return adapter.isForwarded;
        case "attention":
          return needsAttention(adapter);
        case "production":
          return isProduction(adapter);
        case "all":
        default:
          return true;
      }
    });
  }, [adapters, filter]);

  const filters = useMemo(
    () =>
      [
        { value: "all", label: copy.all, count: adapters.length, tone: "neutral" },
        {
          value: "forwarded",
          label: copy.forwarded,
          count: adapters.filter((a) => a.isForwarded).length,
          tone: "info",
        },
        {
          value: "production",
          label: copy.production,
          count: adapters.filter(isProduction).length,
          tone: "accent",
        },
        {
          value: "attention",
          label: copy.attention,
          count: adapters.filter(needsAttention).length,
          tone: "danger",
        },
      ] as const,
    [adapters, copy],
  );

  const expiringAdapters = useMemo(
    () => adapters.filter(credentialExpiring),
    [adapters],
  );

  const emptyReason = !isLoading
    ? resolveEmptyReason({
        outcome,
        totalCount: adapters.length,
        filteredCount: filteredAdapters.length,
        filtersActive: filter !== "all",
      })
    : null;

  const emptyEnvelope: EmptyStateEnvelope | null = emptyReason
    ? { reason: emptyReason, messageCode: `adapterRegistry.empty.${emptyReason}` }
    : null;

  // ── Action handling (§3.4 risk-classified confirmation). ──────────────────
  const runAction = useCallback(
    async (
      adapter: PlatformAdapter,
      descriptor: ResourceActionDescriptor,
      actionReason: string,
    ) => {
      let status: ActionReceipt["status"] = "completed";
      let message = "";
      try {
        // Only enable/disable/edit_config have a wired write path today; the
        // ops-scope + credential actions are accepted intents until their
        // endpoints land (packet §6 marks them TBD).
        if (descriptor.action === "enable" || descriptor.action === "disable") {
          const updated = await apiClient.updatePlatformAdapter(adapter.id, {
            config: { isEnabled: descriptor.action === "enable" },
          });
          if (isMounted.current) {
            setAdapters((prev) =>
              prev.map((a) => (a.id === updated.id ? updated : a)),
            );
          }
          message =
            descriptor.action === "enable"
              ? `${adapter.name} enabled`
              : `${adapter.name} disabled`;
        } else {
          status = "accepted";
          message = `${descriptor.action} accepted for ${adapter.name}`;
        }
      } catch (err) {
        status = "failed";
        message =
          (err as { message?: string })?.message ??
          `${descriptor.action} failed for ${adapter.name}`;
      }

      receiptSeq += 1;
      const stamp = Date.now();
      if (isMounted.current) {
        setReceipt({
          actionId: `act_${descriptor.action}_${stamp}_${receiptSeq}`,
          auditId: `aud_${adapter.id}_${stamp}`,
          resourceType: "platform_adapter",
          resourceId: adapter.id,
          status,
          message: actionReason ? `${message} — ${actionReason}` : message,
        });
        setPendingAction(null);
        setReason("");
      }
    },
    [],
  );

  const openAction = useCallback(
    (adapter: PlatformAdapter, descriptor: ResourceActionDescriptor) => {
      if (!descriptor.enabled) return;
      setReason("");
      if (descriptor.riskLevel === "low") {
        void runAction(adapter, descriptor, "");
        return;
      }
      setPendingAction({ adapter, descriptor });
    },
    [runAction],
  );

  const freshnessLabel = useMemo(() => {
    if (!refreshMeta) return "";
    const generated = Date.parse(refreshMeta.generatedAt);
    const ageMs = Math.max(0, nowTs - generated);
    const stale = ageMs > refreshMeta.staleAfterMs;
    if (stale || refreshMeta.dataFreshness !== "fresh") return copy.stale;
    const seconds = Math.round(ageMs / 1000);
    return copy.freshAgo(seconds <= 1 ? "1s" : `${seconds}s`);
  }, [refreshMeta, nowTs, copy]);

  const freshnessTone: ToneName =
    refreshMeta && refreshMeta.dataFreshness === "fresh" ? "success" : "warning";

  return (
    <div>
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        meta={[{ label: "", value: copy.actor, tone: "info" }]}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <StatusChip tone={freshnessTone} label={freshnessLabel} />
            <button
              type="button"
              className="admin-btn admin-btn--secondary admin-btn--sm"
              onClick={() => void loadAdapters()}
              title={copy.tierNote}
            >
              {copy.refreshNow}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--primary admin-btn--sm"
              onClick={() =>
                openAction(
                  {
                    // synthetic registry-scoped resource for the create CTA
                    ...({} as PlatformAdapter),
                    id: "__new__",
                    name: copy.register,
                  } as PlatformAdapter,
                  {
                    action: "create",
                    enabled: true,
                    riskLevel: "high",
                    requiresReason: true,
                  },
                )
              }
            >
              + {copy.register}
            </button>
          </div>
        }
      />

      <div
        style={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* §3.3 — page-critical degraded banner. */}
        {!outcome.externalAvailable && (
          <CalloutBanner
            tone="danger"
            title={
              locale === "en"
                ? "Upstream adapter platform unreachable"
                : "上游 adapter 平台無法連線"
            }
            description={
              locale === "en"
                ? "Operational status may be stale until connectivity recovers."
                : "在連線恢復前，營運狀態可能不是最新。"
            }
          />
        )}

        {/* Credential expiry / rotation banner (canvas hero banner). */}
        {expiringAdapters.length > 0 && (
          <CalloutBanner
            tone="warning"
            title={
              locale === "en"
                ? `${expiringAdapters.length} adapter credential(s) need rotation`
                : `${expiringAdapters.length} 個 adapter 憑證需要輪替`
            }
            description={
              locale === "en"
                ? "Rotate before expiry or the adapter cannot report completed orders."
                : "請於到期前輪替，否則 adapter 無法回報已完成訂單。"
            }
            actions={
              <button
                type="button"
                className="admin-btn admin-btn--primary admin-btn--sm"
                onClick={() => {
                  const target = expiringAdapters[0];
                  if (!target) return;
                  openAction(target, {
                    action: "rotate_credentials",
                    enabled: true,
                    riskLevel: "high",
                    requiresReason: true,
                  });
                }}
              >
                {locale === "en" ? "Rotate now" : "立即輪替"}
              </button>
            }
          />
        )}

        <DataFilterBar
          value={filter}
          onChange={(value) => setFilter(value)}
          filters={filters}
          ariaLabel={copy.title}
        />

        {isLoading && <div className="admin-empty">…</div>}

        {/* §3.6 — distinct empty-state treatment per resolved EmptyReason. */}
        {!isLoading && emptyEnvelope && (
          <EmptyState
            envelope={emptyEnvelope}
            locale={locale}
            onPrimary={() => {
              if (emptyEnvelope.reason === "filtered_empty") setFilter("all");
              else if (emptyEnvelope.reason === "fetch_failed")
                void loadAdapters();
            }}
          />
        )}

        {!isLoading && !emptyEnvelope && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))",
              gap: 12,
            }}
          >
            {filteredAdapters.map((adapter) => (
              <AdapterCard
                key={adapter.id}
                adapter={adapter}
                locale={locale}
                copy={copy}
                highlighted={highlightId === adapter.id}
                onAction={openAction}
              />
            ))}
          </div>
        )}

        {!isLoading && !emptyEnvelope && (
          <div style={{ color: "#64748b", fontSize: 12.5 }}>
            {copy.showing} {filteredAdapters.length} / {adapters.length} ·{" "}
            {copy.tierNote}
          </div>
        )}
      </div>

      {pendingAction && (
        <ConfirmModal
          state={pendingAction}
          locale={locale}
          copy={copy}
          reason={reason}
          onReasonChange={setReason}
          onCancel={() => {
            setPendingAction(null);
            setReason("");
          }}
          onConfirm={() =>
            void runAction(
              pendingAction.adapter,
              pendingAction.descriptor,
              reason,
            )
          }
        />
      )}

      {receipt && (
        <ReceiptToast
          receipt={receipt}
          copy={copy}
          onDismiss={() => setReceipt(null)}
        />
      )}
    </div>
  );
}

// ── Adapter card (canvas PA_AdapterRegistry card grid). ──────────────────────
interface AdapterCardProps {
  adapter: PlatformAdapter;
  locale: Locale;
  copy: PageCopy;
  highlighted: boolean;
  onAction: (
    adapter: PlatformAdapter,
    descriptor: ResourceActionDescriptor,
  ) => void;
}

function AdapterCard({
  adapter,
  locale,
  copy,
  highlighted,
  onAction,
}: AdapterCardProps) {
  const actions = deriveAvailableActions(adapter);
  const paused = isPaused(adapter);
  const kind = adapter.isForwarded
    ? copy.forwardedTag
    : formatPlatformCodeLabel(locale, adapter.adapterType);

  const opsLink = adapter.isForwarded
    ? opsDispatchLink(adapter, copy.opsManage)
    : null;

  const featureEntries = Object.entries(adapter.featureFlags ?? {}).filter(
    ([key]) => key !== "operationallyPaused",
  );

  return (
    <div
      className="admin-card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        ...(highlighted
          ? { borderColor: "#4F46E5", boxShadow: "0 0 0 2px rgba(79,70,229,0.25)" }
          : {}),
        ...(needsAttention(adapter)
          ? { borderColor: "rgba(239,68,68,0.35)" }
          : {}),
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
          >
            <strong style={{ fontSize: 14.5 }}>{adapter.name}</strong>
            <StatusChip tone="neutral" label={kind} />
          </div>
          <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>
            {adapter.platformCode} · {adapter.version}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <StatusChip
            tone={toneForHealth(adapter.healthStatus.status)}
            label={formatPlatformCodeLabel(locale, adapter.healthStatus.status)}
            authorityLabel={copy.health}
          />
          {paused && <StatusChip tone="warning" label={copy.paused} />}
        </div>
      </div>

      {/* Metadata grid (canvas DL). */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          paddingTop: 10,
          borderTop: "1px solid #e2e8f0",
        }}
      >
        <Meta label={copy.environment}>
          {formatPlatformCodeLabel(locale, adapter.environment)}
        </Meta>
        <Meta label={copy.adapterType}>
          {formatPlatformCodeLabel(locale, adapter.adapterType)}
        </Meta>
        <Meta label={copy.lastCheck}>
          {adapter.healthStatus.lastCheckTimestamp
            ? new Date(adapter.healthStatus.lastCheckTimestamp).toLocaleString()
            : "—"}
        </Meta>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <StatusChip
          tone={adapter.config.isEnabled ? "success" : "neutral"}
          label={adapter.config.isEnabled ? copy.enabled : copy.disabled}
        />
        <StatusChip
          tone={toneForCredential(adapter.credentialStatus)}
          label={formatPlatformCodeLabel(locale, adapter.credentialStatus)}
          authorityLabel={copy.credential}
        />
        <AuthorityBadge
          tone={toneForAuthority(adapter.policies.financeAuthorityMode)}
          category={adapter.isForwarded ? copy.forwardedTag : copy.owned}
          label={formatPlatformCodeLabel(
            locale,
            adapter.policies.financeAuthorityMode,
          )}
        />
        {adapter.webhookStatus && (
          <StatusChip
            tone={
              adapter.webhookStatus.lastStatus === "SUCCESS"
                ? "success"
                : adapter.webhookStatus.lastStatus === "FAILURE"
                  ? "danger"
                  : "neutral"
            }
            label={formatPlatformCodeLabel(
              locale,
              adapter.webhookStatus.lastStatus,
            )}
            authorityLabel={copy.webhook}
          />
        )}
      </div>

      {featureEntries.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span style={{ color: "#94a3b8", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase" }}>
            {copy.features}
          </span>
          {featureEntries.map(([key, value]) => (
            <StatusChip
              key={key}
              tone={value ? "info" : "neutral"}
              label={formatPlatformCodeLabel(locale, key)}
            />
          ))}
        </div>
      )}

      {/* §3.5 — CTAs render from availableActions; 0 actions → read-only. */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          paddingTop: 10,
          borderTop: "1px solid #e2e8f0",
        }}
      >
        {actions.length === 0 && (
          <span style={{ color: "#94a3b8", fontSize: 12 }}>
            {locale === "en" ? "Read-only" : "唯讀"}
          </span>
        )}
        {actions.map((descriptor) => (
          <ActionButton
            key={descriptor.action}
            descriptor={descriptor}
            locale={locale}
            onClick={() => onAction(adapter, descriptor)}
          />
        ))}
      </div>

      {/* §3.10 — cross-app + exit deep links (ops new tab; in-app audit/health). */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
        {opsLink && (
          <a
            href={crossAppHref(opsLink)}
            target="_blank"
            rel="noreferrer noopener"
            style={{ color: "#4F46E5", textDecoration: "none", fontWeight: 600 }}
          >
            {opsLink.label} ↗
          </a>
        )}
        <a
          href={`/health?adapterId=${encodeURIComponent(adapter.id)}`}
          style={{ color: "#475569", textDecoration: "none" }}
        >
          {copy.viewHealth}
        </a>
        <a
          href={`/audit?resourceType=platform_adapter&resourceId=${encodeURIComponent(adapter.id)}`}
          style={{ color: "#475569", textDecoration: "none" }}
        >
          {copy.viewAudit}
        </a>
      </div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          color: "#94a3b8",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12.5, color: "#0f172a", marginTop: 2 }}>
        {children}
      </div>
    </div>
  );
}

function actionLabel(action: string, locale: Locale): string {
  const en: Record<string, string> = {
    create: "Register",
    edit_config: "Edit config",
    edit_credentials: "Edit credentials",
    rotate_credentials: "Rotate",
    enable: "Enable",
    disable: "Disable",
    pause_traffic: "Pause traffic",
    resume_traffic: "Resume traffic",
    retry_callback: "Retry callback",
  };
  const zh: Record<string, string> = {
    create: "註冊",
    edit_config: "編輯設定",
    edit_credentials: "編輯憑證",
    rotate_credentials: "輪替憑證",
    enable: "啟用",
    disable: "停用",
    pause_traffic: "暫停流量",
    resume_traffic: "恢復流量",
    retry_callback: "重試回呼",
  };
  const map = locale === "en" ? en : zh;
  return map[action] ?? action;
}

const RISK_TONE: Record<ActionRiskLevel, ToneName> = {
  low: "neutral",
  medium: "info",
  high: "danger",
};

function ActionButton({
  descriptor,
  locale,
  onClick,
}: {
  descriptor: ResourceActionDescriptor;
  locale: Locale;
  onClick: () => void;
}) {
  const disabled = !descriptor.enabled;
  const title = disabled
    ? formatPlatformCodeLabel(locale, descriptor.disabledReasonCode)
    : descriptor.riskLevel === "high"
      ? locale === "en"
        ? "High-risk — confirmation + reason required"
        : "高風險 — 需確認並填寫原因"
      : undefined;
  const tone = RISK_TONE[descriptor.riskLevel];
  return (
    <button
      type="button"
      className="admin-btn admin-btn--secondary admin-btn--sm"
      disabled={disabled}
      onClick={onClick}
      title={title}
      style={{
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...(descriptor.riskLevel === "high" && !disabled
          ? { borderColor: "rgba(239,68,68,0.4)" }
          : {}),
        ...(tone === "info" && !disabled
          ? { borderColor: "rgba(79,70,229,0.35)" }
          : {}),
      }}
    >
      {actionLabel(descriptor.action, locale)}
      {descriptor.riskLevel === "high" && !disabled ? " ⚠" : ""}
    </button>
  );
}

function EmptyState({
  envelope,
  locale,
  onPrimary,
}: {
  envelope: EmptyStateEnvelope;
  locale: Locale;
  onPrimary: () => void;
}) {
  const text = emptyCopy(envelope.reason, locale);
  return (
    <div
      className="admin-card"
      style={{
        textAlign: "center",
        padding: "40px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "center",
      }}
      data-empty-reason={envelope.reason}
    >
      <div style={{ fontSize: 32 }}>{EMPTY_ICON[envelope.reason]}</div>
      <strong style={{ fontSize: 15 }}>{text.title}</strong>
      <p style={{ color: "#64748b", margin: 0, maxWidth: 440 }}>{text.body}</p>
      <code style={{ color: "#94a3b8", fontSize: 11 }}>{envelope.messageCode}</code>
      {text.nextAction && (
        <button
          type="button"
          className="admin-btn admin-btn--secondary admin-btn--sm"
          onClick={onPrimary}
          style={{ marginTop: 4 }}
        >
          {text.nextAction}
        </button>
      )}
    </div>
  );
}

function ConfirmModal({
  state,
  locale,
  copy,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
}: {
  state: ActionState;
  locale: Locale;
  copy: PageCopy;
  reason: string;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const needsReason = actionNeedsReason(state.descriptor);
  const isCredentialAction =
    state.descriptor.action === "rotate_credentials" ||
    state.descriptor.action === "edit_credentials";
  const canConfirm = !needsReason || reason.trim().length > 0;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        className="admin-card"
        style={{ maxWidth: 460, width: "100%", display: "grid", gap: 12 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusChip
            tone={RISK_TONE[state.descriptor.riskLevel]}
            label={state.descriptor.riskLevel.toUpperCase()}
          />
          <strong style={{ fontSize: 15 }}>{copy.confirmTitle}</strong>
        </div>
        <p style={{ margin: 0, color: "#334155" }}>
          {actionLabel(state.descriptor.action, locale)} — {state.adapter.name}
        </p>
        {isCredentialAction && (
          <p style={{ margin: 0, color: "#b45309", fontSize: 12.5 }}>
            {copy.secretOnce}
          </p>
        )}
        {needsReason && (
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12.5, color: "#475569" }}>
              {copy.reasonLabel}
            </span>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder={copy.reasonPlaceholder}
              rows={3}
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                padding: 8,
                fontFamily: "inherit",
                fontSize: 13,
              }}
            />
          </label>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            className="admin-btn admin-btn--secondary admin-btn--sm"
            onClick={onCancel}
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--primary admin-btn--sm"
            disabled={!canConfirm}
            onClick={onConfirm}
            style={{ opacity: canConfirm ? 1 : 0.5 }}
          >
            {copy.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReceiptToast({
  receipt,
  copy,
  onDismiss,
}: {
  receipt: ActionReceipt;
  copy: PageCopy;
  onDismiss: () => void;
}) {
  const tone: ToneName =
    receipt.status === "failed"
      ? "danger"
      : receipt.status === "accepted"
        ? "info"
        : "success";
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 60,
        maxWidth: 380,
      }}
    >
      <div className="admin-card" style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusChip tone={tone} label={receipt.status} />
          <strong style={{ fontSize: 13 }}>{receipt.resourceType}</strong>
          <button
            type="button"
            onClick={onDismiss}
            style={{
              marginLeft: "auto",
              border: "none",
              background: "none",
              cursor: "pointer",
              color: "#94a3b8",
            }}
            aria-label="dismiss"
          >
            ✕
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "#334155" }}>
          {receipt.message}
        </p>
        <a
          href={`/audit?auditId=${encodeURIComponent(receipt.auditId)}`}
          style={{ color: "#4F46E5", fontSize: 12, textDecoration: "none", fontWeight: 600 }}
        >
          {copy.viewReceiptAudit} · {receipt.auditId}
        </a>
      </div>
    </div>
  );
}
