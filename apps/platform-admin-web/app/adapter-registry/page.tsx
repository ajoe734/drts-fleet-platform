"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import {
  AdapterType,
  CredentialStatus,
  Environment,
  FinanceAuthorityMode,
  RolloutStatus,
  type PlatformAdapter,
  type UpdatePlatformAdapterCommand,
} from "@drts/contracts";
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
import {
  ADAPTER_REGISTRY_REFRESH_INTERVAL_MS,
  fetchPlatformAdapters,
  registerPlatformAdapterCommand,
  updatePlatformAdapterCommand,
} from "./adapter-registry-client";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const ENVIRONMENT_OPTIONS = Object.values(Environment);
const ADAPTER_TYPE_OPTIONS = Object.values(AdapterType);
const ROLLOUT_STATUS_OPTIONS = Object.values(RolloutStatus);
const FINANCE_AUTHORITY_MODE_OPTIONS = Object.values(FinanceAuthorityMode);

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

const modalBackdropStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.55)",
  display: "grid",
  placeItems: "center",
  padding: 20,
  zIndex: 50,
} satisfies CSSProperties;

const modalCardStyle = {
  width: "min(680px, 100%)",
  maxHeight: "90vh",
  overflowY: "auto",
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 14,
  padding: 20,
  display: "grid",
  gap: 14,
} satisfies CSSProperties;

const formGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
} satisfies CSSProperties;

const fieldLabelStyle = {
  display: "grid",
  gap: 4,
  fontSize: 12,
  color: theme.text,
  fontWeight: 600,
} satisfies CSSProperties;

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  color: theme.text,
  fontSize: 12.5,
} satisfies CSSProperties;

const checkboxLabelStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12.5,
  color: theme.text,
  fontWeight: 600,
} satisfies CSSProperties;

type FlashState = {
  tone: CanvasTone;
  message: string;
} | null;

type LabelLocale = Parameters<typeof formatPlatformCodeLabel>[0];

type RegisterAdapterFormState = {
  id: string;
  platformCode: string;
  name: string;
  description: string;
  version: string;
  environment: PlatformAdapter["environment"];
  rolloutStage: PlatformAdapter["rolloutStage"];
  adapterType: PlatformAdapter["adapterType"];
  isForwarded: boolean;
  isEnabled: boolean;
  credentialReference: string;
  credentialExpiresAt: string;
  serviceBuckets: string;
  maxCandidates: string;
  acceptTimeoutSeconds: string;
  manualFallbackThresholdSeconds: string;
  financeAuthorityMode: PlatformAdapter["policies"]["financeAuthorityMode"];
  webhookEnabled: boolean;
  webhookUrl: string;
};

type ConfigModalFormState = {
  isEnabled: boolean;
  rolloutStatus: PlatformAdapter["rolloutStatus"];
  rolloutStage: PlatformAdapter["rolloutStage"];
  serviceBuckets: string;
  maxCandidates: string;
  acceptTimeoutSeconds: string;
  manualFallbackThresholdSeconds: string;
  financeAuthorityMode: PlatformAdapter["policies"]["financeAuthorityMode"];
  webhookEnabled: boolean;
  webhookUrl: string;
  featureFlags: string;
  reason: string;
};

type CredentialModalFormState = {
  clearExpiry: boolean;
  reference: string;
  expiresAt: string;
  reason: string;
};

type Copy = {
  title: string;
  subtitle: string;
  registerAction: string;
  registerInfo: string;
  loading: string;
  empty: string;
  unavailable: string;
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
  credentialExpiryLabel: string;
};

function createInitialRegisterForm(): RegisterAdapterFormState {
  return {
    id: "",
    platformCode: "yoxi",
    name: "",
    description: "",
    version: "1.0.0",
    environment: Environment.SANDBOX,
    rolloutStage: Environment.SANDBOX,
    adapterType: AdapterType.EXTERNAL_REST,
    isForwarded: true,
    isEnabled: false,
    credentialReference: "",
    credentialExpiresAt: "",
    serviceBuckets: "standard_taxi",
    maxCandidates: "3",
    acceptTimeoutSeconds: "30",
    manualFallbackThresholdSeconds: "90",
    financeAuthorityMode: FinanceAuthorityMode.EXTERNAL,
    webhookEnabled: false,
    webhookUrl: "",
  };
}

function createConfigFormFromAdapter(
  adapter: PlatformAdapter,
): ConfigModalFormState {
  const serializedFlags = Object.entries(adapter.featureFlags)
    .map(([key, value]) => `${key}=${value ? "on" : "off"}`)
    .join(", ");
  return {
    isEnabled: adapter.config.isEnabled,
    rolloutStatus: adapter.rolloutStatus,
    rolloutStage: adapter.rolloutStage,
    serviceBuckets: adapter.policies.serviceBuckets.join(", "),
    maxCandidates: String(adapter.policies.maxCandidates),
    acceptTimeoutSeconds: String(adapter.policies.acceptTimeoutSeconds),
    manualFallbackThresholdSeconds: String(
      adapter.policies.manualFallbackThresholdSeconds,
    ),
    financeAuthorityMode: adapter.policies.financeAuthorityMode,
    webhookEnabled: Boolean(adapter.webhookStatus?.isEnabled),
    webhookUrl: adapter.webhookStatus?.url ?? "",
    featureFlags: serializedFlags,
    reason: "",
  };
}

function createCredentialFormFromAdapter(
  adapter: PlatformAdapter,
): CredentialModalFormState {
  return {
    clearExpiry: false,
    reference: adapter.credentialExpiry?.reference ?? "",
    expiresAt: adapter.credentialExpiry?.expiresAt ?? "",
    reason: "",
  };
}

function parseFeatureFlagsInput(
  raw: string,
  fallback: Record<string, boolean>,
): Record<string, boolean> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ...fallback };
  }
  const next: Record<string, boolean> = {};
  for (const segment of trimmed.split(",")) {
    const pair = segment.trim();
    if (!pair) continue;
    const [rawKey, rawValue] = pair.split("=");
    const key = rawKey?.trim();
    if (!key) continue;
    const normalizedValue = rawValue?.trim().toLowerCase();
    next[key] =
      normalizedValue === "true" ||
      normalizedValue === "1" ||
      normalizedValue === "on" ||
      normalizedValue === "yes";
  }
  return Object.keys(next).length > 0 ? next : { ...fallback };
}

function isPositiveFiniteNumber(raw: string): boolean {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0;
}

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

function isCredentialExpiryConcerning(adapter: PlatformAdapter) {
  const state = adapter.credentialExpiryWarning?.state;
  return state === "warning" || state === "expired";
}

function findAttentionAdapter(adapters: PlatformAdapter[]) {
  return adapters.find(
    (adapter) =>
      adapter.credentialStatus !== "VALID" ||
      adapter.healthStatus.status !== "HEALTHY" ||
      adapter.warn === true ||
      isCredentialExpiryConcerning(adapter),
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
  const [rawError, setRawError] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashState>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Governance modal states
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState<RegisterAdapterFormState>(
    createInitialRegisterForm,
  );
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerSubmitting, setRegisterSubmitting] = useState(false);

  const [configTarget, setConfigTarget] = useState<PlatformAdapter | null>(
    null,
  );
  const [configForm, setConfigForm] = useState<ConfigModalFormState | null>(
    null,
  );
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSubmitting, setConfigSubmitting] = useState(false);

  const [credentialTarget, setCredentialTarget] =
    useState<PlatformAdapter | null>(null);
  const [credentialForm, setCredentialForm] =
    useState<CredentialModalFormState | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [credentialSubmitting, setCredentialSubmitting] = useState(false);

  // Deduplication, ordering, and unmount tracking refs for T4 refresh
  const mountedRef = useRef(true);
  const inFlightRefreshRef = useRef<Promise<PlatformAdapter[] | null> | null>(
    null,
  );
  const requestSeqRef = useRef(0);
  const latestAppliedSeqRef = useRef(0);

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
        credentialExpiryLabel: t("audit.exceptions.expiresAt"),
      }) satisfies Copy,
    [locale, t],
  );

  const loadAdapters = useCallback(
    async (
      mode: "initial" | "refresh",
      options?: { force?: boolean; suppressErrorBanner?: boolean },
    ): Promise<PlatformAdapter[] | null> => {
      if (!options?.force && inFlightRefreshRef.current) {
        return inFlightRefreshRef.current;
      }

      const seq = ++requestSeqRef.current;
      if (mode === "initial") {
        setLoading(true);
        setRawError(null);
      }

      let promise: Promise<PlatformAdapter[] | null> | null = null;
      promise = (async () => {
        try {
          const response = await fetchPlatformAdapters(client);
          if (mountedRef.current && seq >= latestAppliedSeqRef.current) {
            latestAppliedSeqRef.current = seq;
            setAdapters(response);
            setRawError(null);
          }
          return response;
        } catch (caught) {
          if (
            mountedRef.current &&
            seq >= latestAppliedSeqRef.current &&
            !options?.suppressErrorBanner
          ) {
            const message =
              caught instanceof Error ? caught.message : String(caught);
            setRawError(message);
          }
          return null;
        } finally {
          if (inFlightRefreshRef.current === promise) {
            inFlightRefreshRef.current = null;
          }
          if (mode === "initial" && mountedRef.current) {
            setLoading(false);
          }
        }
      })();

      inFlightRefreshRef.current = promise;
      return promise;
    },
    [client],
  );

  useEffect(() => {
    mountedRef.current = true;
    inFlightRefreshRef.current = null;

    void loadAdapters("initial");

    const intervalId = window.setInterval(() => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      void loadAdapters("refresh");
    }, ADAPTER_REGISTRY_REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        void loadAdapters("refresh");
      }
    };

    const handleWindowFocus = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      void loadAdapters("refresh");
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      mountedRef.current = false;
      inFlightRefreshRef.current = null;
      window.clearInterval(intervalId);
      if (typeof document !== "undefined") {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
      }
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [loadAdapters]);

  const error = useMemo(
    () => (rawError ? normalizeRegistryError(rawError, copy.unavailable) : null),
    [rawError, copy.unavailable],
  );

  const attentionAdapter = useMemo(
    () => findAttentionAdapter(adapters),
    [adapters],
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

  function upsertLocalAdapter(updated: PlatformAdapter) {
    latestAppliedSeqRef.current = ++requestSeqRef.current;
    setAdapters((current) => {
      const index = current.findIndex((item) => item.id === updated.id);
      if (index === -1) {
        return [...current, updated];
      }
      return current.map((item) => (item.id === updated.id ? updated : item));
    });
  }

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
      const updated = await updatePlatformAdapterCommand(client, adapter.id, {
        config: { isEnabled: nextEnabled },
        ...(adapter.revision !== undefined
          ? { expectedRevision: adapter.revision }
          : {}),
        ...(reason ? { reason } : {}),
      });
      upsertLocalAdapter(updated);
      void loadAdapters("refresh", {
        force: true,
        suppressErrorBanner: true,
      });
      setFlash({
        tone: "success",
        message: copy.toggleSuccess(updated, nextEnabled, reason),
      });
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : "";
      setFlash({
        tone: "danger",
        message: detail ? `${copy.toggleError} (${detail})` : copy.toggleError,
      });
    } finally {
      setPendingId(null);
    }
  }

  function openRegisterModal() {
    setRegisterForm(createInitialRegisterForm());
    setRegisterError(null);
    setRegisterModalOpen(true);
  }

  async function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRegisterError(null);

    const id = registerForm.id.trim();
    const platformCode = registerForm.platformCode.trim();
    const name = registerForm.name.trim();
    const version = registerForm.version.trim();
    if (!id || !platformCode || !name || !version) {
      setRegisterError(t("adapterRegistry.validation.idRequired"));
      return;
    }

    if (
      !isPositiveFiniteNumber(registerForm.maxCandidates) ||
      !isPositiveFiniteNumber(registerForm.acceptTimeoutSeconds) ||
      !isPositiveFiniteNumber(registerForm.manualFallbackThresholdSeconds)
    ) {
      setRegisterError(t("adapterRegistry.validation.policyNumbers"));
      return;
    }

    if (registerForm.webhookEnabled && !registerForm.webhookUrl.trim()) {
      setRegisterError(t("adapterRegistry.validation.webhookUrlRequired"));
      return;
    }

    const credRef = registerForm.credentialReference.trim();
    const credExpiresAt = registerForm.credentialExpiresAt.trim();
    if (credExpiresAt && !credRef) {
      setRegisterError(t("adapterRegistry.validation.credReferenceRequired"));
      return;
    }

    const nowIso = new Date().toISOString();
    const payload: PlatformAdapter = {
      id,
      platformCode: platformCode as PlatformAdapter["platformCode"],
      name,
      description: registerForm.description.trim(),
      version,
      environment: registerForm.environment,
      rolloutStage: registerForm.rolloutStage,
      adapterType: registerForm.adapterType,
      isForwarded: registerForm.isForwarded,
      config: { isEnabled: registerForm.isEnabled },
      rolloutStatus: RolloutStatus.NOT_STARTED,
      credentialStatus: credRef
        ? CredentialStatus.VALID
        : CredentialStatus.NOT_CONFIGURED,
      credentialExpiry: credRef
        ? {
            reference: credRef,
            expiresAt: credExpiresAt || null,
          }
        : null,
      webhookStatus:
        registerForm.webhookEnabled || registerForm.webhookUrl.trim()
          ? {
              url: registerForm.webhookUrl.trim() || null,
              isEnabled: registerForm.webhookEnabled,
              lastEventTimestamp: null,
              lastStatus: "UNKNOWN",
            }
          : null,
      healthStatus: {
        lastCheckTimestamp: null,
        status: "HEALTHY",
        message: null,
      },
      policies: {
        serviceBuckets: registerForm.serviceBuckets
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        maxCandidates: Number(registerForm.maxCandidates),
        acceptTimeoutSeconds: Number(registerForm.acceptTimeoutSeconds),
        manualFallbackThresholdSeconds: Number(
          registerForm.manualFallbackThresholdSeconds,
        ),
        financeAuthorityMode: registerForm.financeAuthorityMode,
      },
      featureFlags: {},
      supportedActions: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setRegisterSubmitting(true);
    try {
      const created = await registerPlatformAdapterCommand(client, payload);
      upsertLocalAdapter(created);
      await loadAdapters("refresh", {
        force: true,
        suppressErrorBanner: true,
      });
      setRegisterModalOpen(false);
      setFlash({
        tone: "success",
        message: t("adapterRegistry.registerSuccess", {
          name: created.name,
          id: created.id,
          revision: created.revision ?? 1,
        }),
      });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : copy.toggleError;
      setRegisterError(message);
      setFlash({ tone: "danger", message });
    } finally {
      setRegisterSubmitting(false);
    }
  }

  function openConfigModal(adapter: PlatformAdapter) {
    setConfigTarget(adapter);
    setConfigForm(createConfigFormFromAdapter(adapter));
    setConfigError(null);
  }

  async function handleConfigSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configTarget || !configForm) {
      return;
    }
    setConfigError(null);

    const reason = configForm.reason.trim();
    if (!reason) {
      setConfigError(t("adapterRegistry.validation.reasonRequired"));
      return;
    }

    if (
      !isPositiveFiniteNumber(configForm.maxCandidates) ||
      !isPositiveFiniteNumber(configForm.acceptTimeoutSeconds) ||
      !isPositiveFiniteNumber(configForm.manualFallbackThresholdSeconds)
    ) {
      setConfigError(t("adapterRegistry.validation.policyNumbers"));
      return;
    }

    if (configForm.webhookEnabled && !configForm.webhookUrl.trim()) {
      setConfigError(t("adapterRegistry.validation.webhookUrlRequired"));
      return;
    }

    const command: UpdatePlatformAdapterCommand = {
      ...(configTarget.revision !== undefined
        ? { expectedRevision: configTarget.revision }
        : {}),
      reason,
      config: {
        ...configTarget.config,
        isEnabled: configForm.isEnabled,
      },
      rolloutStatus: configForm.rolloutStatus,
      rolloutStage: configForm.rolloutStage,
      policies: {
        ...configTarget.policies,
        serviceBuckets: configForm.serviceBuckets
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        maxCandidates: Number(configForm.maxCandidates),
        acceptTimeoutSeconds: Number(configForm.acceptTimeoutSeconds),
        manualFallbackThresholdSeconds: Number(
          configForm.manualFallbackThresholdSeconds,
        ),
        financeAuthorityMode: configForm.financeAuthorityMode,
      },
      featureFlags: parseFeatureFlagsInput(
        configForm.featureFlags,
        configTarget.featureFlags,
      ),
      webhookStatus: {
        url: configForm.webhookUrl.trim() || null,
        isEnabled: configForm.webhookEnabled,
        lastEventTimestamp:
          configTarget.webhookStatus?.lastEventTimestamp ?? null,
        lastStatus: configTarget.webhookStatus?.lastStatus ?? "UNKNOWN",
      },
    };

    setConfigSubmitting(true);
    try {
      const updated = await updatePlatformAdapterCommand(
        client,
        configTarget.id,
        command,
      );
      upsertLocalAdapter(updated);
      await loadAdapters("refresh", {
        force: true,
        suppressErrorBanner: true,
      });
      setConfigTarget(null);
      setConfigForm(null);
      setFlash({
        tone: "success",
        message: t("adapterRegistry.configSuccess", {
          auditPrefix: copyAuditPrefix(copy.auditReceiptPrefix),
          name: updated.name,
          revision: updated.revision ?? 1,
          reasonClause: ` ${t("adapterRegistry.toggleSuccess.reasonClause", { reason })}`,
        }),
      });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : copy.toggleError;
      setConfigError(message);
      setFlash({ tone: "danger", message });
    } finally {
      setConfigSubmitting(false);
    }
  }

  function openCredentialModal(adapter: PlatformAdapter) {
    setCredentialTarget(adapter);
    setCredentialForm(createCredentialFormFromAdapter(adapter));
    setCredentialError(null);
  }

  async function handleCredentialSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!credentialTarget || !credentialForm) {
      return;
    }
    setCredentialError(null);

    const reason = credentialForm.reason.trim();
    if (!reason) {
      setCredentialError(t("adapterRegistry.validation.reasonRequired"));
      return;
    }

    const reference = credentialForm.reference.trim();
    const expiresAt = credentialForm.expiresAt.trim();
    if (!credentialForm.clearExpiry && !reference) {
      setCredentialError(t("adapterRegistry.validation.credReferenceRequired"));
      return;
    }

    const command: UpdatePlatformAdapterCommand = {
      ...(credentialTarget.revision !== undefined
        ? { expectedRevision: credentialTarget.revision }
        : {}),
      reason,
      credentialExpiry: credentialForm.clearExpiry
        ? null
        : {
            reference,
            expiresAt: expiresAt || null,
          },
    };

    setCredentialSubmitting(true);
    try {
      const updated = await updatePlatformAdapterCommand(
        client,
        credentialTarget.id,
        command,
      );
      upsertLocalAdapter(updated);
      await loadAdapters("refresh", {
        force: true,
        suppressErrorBanner: true,
      });
      setCredentialTarget(null);
      setCredentialForm(null);
      setFlash({
        tone: "success",
        message: t("adapterRegistry.credentialSuccess", {
          auditPrefix: copyAuditPrefix(copy.auditReceiptPrefix),
          name: updated.name,
          revision: updated.revision ?? 1,
          reasonClause: ` ${t("adapterRegistry.toggleSuccess.reasonClause", { reason })}`,
        }),
      });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : copy.toggleError;
      setCredentialError(message);
      setFlash({ tone: "danger", message });
    } finally {
      setCredentialSubmitting(false);
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
            onClick={openRegisterModal}
          >
            {copy.registerAction}
          </CanvasBtn>
        }
      />

      <div style={pageBodyStyle}>
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
                  queueGovernedAction(copy.rotateCredential, attentionAdapter)
                }
              >
                {copy.rotateNow}
              </CanvasBtn>
            }
          />
        ) : null}

        {flash ? (
          <div style={flashStyle(flash.tone)}>{flash.message}</div>
        ) : null}
        {error && adapters.length > 0 ? (
          <div
            data-testid="adapter-refresh-error-banner"
            style={flashStyle("danger")}
          >
            {t("adapterRegistry.refreshErrorBanner", { message: error })}
          </div>
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
                <div
                  key={adapter.id}
                  data-testid={`adapter-card-${adapter.id}`}
                >
                  <CanvasCard
                    theme={theme}
                    title={
                      <span style={cardTitleStyle}>
                        {copy.adapterTitle(adapter)}
                        <CanvasPill
                          theme={theme}
                          tone={adapterKindTone(adapter)}
                        >
                          {adapter.isForwarded
                            ? t("adapterRegistry.forwarderPill")
                            : formatPlatformCodeLabel(
                                locale as LabelLocale,
                                adapter.adapterType,
                              )}
                        </CanvasPill>
                        <CanvasPill theme={theme} tone="neutral">
                          {t("adapterRegistry.revisionPill", {
                            revision: adapter.revision ?? 1,
                          })}
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
                        <p style={metadataLabelStyle}>
                          {copy.operationalPause}
                        </p>
                        <p style={metadataValueStyle}>{copy.noPause}</p>
                        <p style={metadataSubValueStyle}>{copy.pauseUnknown}</p>
                      </div>
                      <div style={metadataBlockStyle}>
                        <p style={metadataLabelStyle}>
                          {copy.credentialExpiryLabel}
                        </p>
                        <p
                          data-testid="adapter-expiry-state"
                          style={metadataValueStyle}
                        >
                          {adapter.credentialExpiryWarning
                            ? formatPlatformCodeLabel(
                                locale as LabelLocale,
                                adapter.credentialExpiryWarning.state,
                              )
                            : copy.notConfigured}
                        </p>
                        <p style={metadataSubValueStyle}>
                          {adapter.credentialExpiry?.expiresAt
                            ? formatDateTime(adapter.credentialExpiry.expiresAt)
                            : copy.notConfigured}
                        </p>
                        {adapter.credentialExpiry?.reference ? (
                          <p style={metadataSubValueStyle}>
                            {t("adapterRegistry.credentialReferenceLabel")}:{" "}
                            {adapter.credentialExpiry.reference}
                          </p>
                        ) : null}
                        {adapter.credentialExpiryWarning?.evaluatedAt ? (
                          <p
                            data-testid="adapter-expiry-evaluated-at"
                            style={metadataSubValueStyle}
                          >
                            {t("adapterRegistry.expiryEvaluatedAtLabel")}:{" "}
                            {adapter.credentialExpiryWarning.evaluatedAt}
                          </p>
                        ) : null}
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
                            onClick={() => openConfigModal(adapter)}
                          >
                            {copy.editConfig}
                          </CanvasBtn>
                          <CanvasBtn
                            theme={theme}
                            size="xs"
                            variant="secondary"
                            icon="apiKeys"
                            onClick={() => openCredentialModal(adapter)}
                          >
                            {copy.editCredential}
                          </CanvasBtn>
                          <CanvasBtn
                            theme={theme}
                            size="xs"
                            variant="secondary"
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
                        {adapter.lastMutationAudit ? (
                          <p
                            data-testid={`adapter-audit-evidence-${adapter.id}`}
                            style={helperTextStyle}
                          >
                            {t("adapterRegistry.lastMutationSummary", {
                              auditId: adapter.lastMutationAudit.auditId,
                              previousRevision:
                                adapter.lastMutationAudit.previousRevision,
                              newRevision:
                                adapter.lastMutationAudit.newRevision,
                              actorId:
                                adapter.lastMutationAudit.actorId ??
                                copy.notConfigured,
                              reason: adapter.lastMutationAudit.reason,
                            })}
                          </p>
                        ) : null}
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
                            {formatHealthLabel(
                              copy,
                              adapter.healthStatus.status,
                            )}
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
                </div>
              );
            })}
          </div>
        )}
      </div>

      {registerModalOpen ? (
        <div
          data-testid="adapter-register-modal"
          role="dialog"
          aria-modal="true"
          style={modalBackdropStyle}
        >
          <form onSubmit={(e) => void handleRegisterSubmit(e)} style={modalCardStyle}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, color: theme.text }}>
                {t("adapterRegistry.registerModal.title")}
              </h2>
              <p style={{ ...helperTextStyle, marginTop: 4 }}>
                {t("adapterRegistry.registerModal.subtitle")}
              </p>
            </div>

            {registerError ? (
              <div
                data-testid="adapter-register-error"
                style={flashStyle("danger")}
              >
                {registerError}
              </div>
            ) : null}

            <div style={formGridStyle}>
              <label style={fieldLabelStyle}>
                {t("adapterRegistry.registerModal.id")}
                <input
                  data-testid="register-adapter-id"
                  style={inputStyle}
                  value={registerForm.id}
                  placeholder={t("adapterRegistry.registerModal.idPlaceholder")}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({ ...prev, id: e.target.value }))
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.registerModal.platformCode")}
                <input
                  data-testid="register-adapter-platform-code"
                  style={inputStyle}
                  value={registerForm.platformCode}
                  placeholder={t(
                    "adapterRegistry.registerModal.platformCodePlaceholder",
                  )}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      platformCode: e.target.value,
                    }))
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.modal.name")}
                <input
                  data-testid="register-adapter-name"
                  style={inputStyle}
                  value={registerForm.name}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.modal.version")}
                <input
                  data-testid="register-adapter-version"
                  style={inputStyle}
                  value={registerForm.version}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      version: e.target.value,
                    }))
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.registerModal.description")}
                <input
                  data-testid="register-adapter-description"
                  style={inputStyle}
                  value={registerForm.description}
                  placeholder={t(
                    "adapterRegistry.registerModal.descriptionPlaceholder",
                  )}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.registerModal.environment")}
                <select
                  data-testid="register-adapter-environment"
                  style={inputStyle}
                  value={registerForm.environment}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      environment:
                        e.target.value as PlatformAdapter["environment"],
                    }))
                  }
                >
                  {ENVIRONMENT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {formatPlatformCodeLabel(locale as LabelLocale, option)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.registerModal.rolloutStage")}
                <select
                  data-testid="register-adapter-rollout-stage"
                  style={inputStyle}
                  value={registerForm.rolloutStage}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      rolloutStage:
                        e.target.value as PlatformAdapter["rolloutStage"],
                    }))
                  }
                >
                  {ENVIRONMENT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {formatPlatformCodeLabel(locale as LabelLocale, option)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.registerModal.adapterType")}
                <select
                  data-testid="register-adapter-type"
                  style={inputStyle}
                  value={registerForm.adapterType}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      adapterType:
                        e.target.value as PlatformAdapter["adapterType"],
                    }))
                  }
                >
                  {ADAPTER_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {formatPlatformCodeLabel(locale as LabelLocale, option)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.registerModal.credReference")}
                <input
                  data-testid="register-adapter-cred-reference"
                  style={inputStyle}
                  value={registerForm.credentialReference}
                  placeholder={t(
                    "adapterRegistry.registerModal.credReferencePlaceholder",
                  )}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      credentialReference: e.target.value,
                    }))
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.registerModal.credExpiresAt")}
                <input
                  data-testid="register-adapter-cred-expires-at"
                  style={inputStyle}
                  value={registerForm.credentialExpiresAt}
                  placeholder={t(
                    "adapterRegistry.registerModal.credExpiresAtPlaceholder",
                  )}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      credentialExpiresAt: e.target.value,
                    }))
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.modal.serviceBuckets")}
                <input
                  data-testid="register-adapter-service-buckets"
                  style={inputStyle}
                  value={registerForm.serviceBuckets}
                  placeholder={t(
                    "adapterRegistry.registerModal.serviceBucketsPlaceholder",
                  )}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      serviceBuckets: e.target.value,
                    }))
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.modal.maxCandidates")}
                <input
                  data-testid="register-adapter-max-candidates"
                  style={inputStyle}
                  value={registerForm.maxCandidates}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      maxCandidates: e.target.value,
                    }))
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.modal.acceptTimeoutSeconds")}
                <input
                  data-testid="register-adapter-accept-timeout-seconds"
                  style={inputStyle}
                  value={registerForm.acceptTimeoutSeconds}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      acceptTimeoutSeconds: e.target.value,
                    }))
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.modal.manualFallbackThresholdSeconds")}
                <input
                  data-testid="register-adapter-manual-fallback-seconds"
                  style={inputStyle}
                  value={registerForm.manualFallbackThresholdSeconds}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      manualFallbackThresholdSeconds: e.target.value,
                    }))
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.registerModal.financeAuthorityMode")}
                <select
                  data-testid="register-adapter-finance-mode"
                  style={inputStyle}
                  value={registerForm.financeAuthorityMode}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      financeAuthorityMode:
                        e.target.value as PlatformAdapter["policies"]["financeAuthorityMode"],
                    }))
                  }
                >
                  {FINANCE_AUTHORITY_MODE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {formatPlatformCodeLabel(locale as LabelLocale, option)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.modal.webhookUrl")}
                <input
                  data-testid="register-adapter-webhook-url"
                  style={inputStyle}
                  value={registerForm.webhookUrl}
                  placeholder={t("adapterRegistry.modal.webhookPlaceholder")}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      webhookUrl: e.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div style={actionRowStyle}>
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  data-testid="register-adapter-is-forwarded"
                  checked={registerForm.isForwarded}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      isForwarded: e.target.checked,
                    }))
                  }
                />
                {t("adapterRegistry.registerModal.isForwarded")}
              </label>

              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  data-testid="register-adapter-is-enabled"
                  checked={registerForm.isEnabled}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      isEnabled: e.target.checked,
                    }))
                  }
                />
                {t("adapterRegistry.modal.enabled")}
              </label>

              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  data-testid="register-adapter-webhook-enabled"
                  checked={registerForm.webhookEnabled}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      webhookEnabled: e.target.checked,
                    }))
                  }
                />
                {t("adapterRegistry.modal.webhookEnabled")}
              </label>
            </div>

            <div style={{ ...actionRowStyle, justifyContent: "flex-end" }}>
              <button
                type="button"
                data-testid="register-adapter-cancel"
                style={inputStyle}
                onClick={() => setRegisterModalOpen(false)}
              >
                {t("adapterRegistry.modal.cancel")}
              </button>
              <button
                type="submit"
                data-testid="register-adapter-submit"
                disabled={registerSubmitting}
                style={{
                  ...inputStyle,
                  fontWeight: 700,
                }}
              >
                {registerSubmitting
                  ? t("adapterRegistry.registerModal.submitting")
                  : t("adapterRegistry.registerModal.submit")}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {configTarget && configForm ? (
        <div
          data-testid="adapter-config-modal"
          role="dialog"
          aria-modal="true"
          style={modalBackdropStyle}
        >
          <form onSubmit={(e) => void handleConfigSubmit(e)} style={modalCardStyle}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, color: theme.text }}>
                {t("adapterRegistry.configModal.title", {
                  name: configTarget.name,
                })}
              </h2>
              <p style={{ ...helperTextStyle, marginTop: 4 }}>
                {t("adapterRegistry.configModal.subtitle", {
                  revision: configTarget.revision ?? 1,
                })}
              </p>
            </div>

            {configError ? (
              <div
                data-testid="adapter-config-error"
                style={flashStyle("danger")}
              >
                {configError}
              </div>
            ) : null}

            <div style={formGridStyle}>
              <label style={fieldLabelStyle}>
                {t("adapterRegistry.modal.rolloutStatus")}
                <select
                  data-testid="config-rollout-status"
                  style={inputStyle}
                  value={configForm.rolloutStatus}
                  onChange={(e) =>
                    setConfigForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            rolloutStatus:
                              e.target.value as PlatformAdapter["rolloutStatus"],
                          }
                        : prev,
                    )
                  }
                >
                  {ROLLOUT_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {formatPlatformCodeLabel(locale as LabelLocale, option)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.registerModal.rolloutStage")}
                <select
                  data-testid="config-rollout-stage"
                  style={inputStyle}
                  value={configForm.rolloutStage}
                  onChange={(e) =>
                    setConfigForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            rolloutStage:
                              e.target.value as PlatformAdapter["rolloutStage"],
                          }
                        : prev,
                    )
                  }
                >
                  {ENVIRONMENT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {formatPlatformCodeLabel(locale as LabelLocale, option)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.modal.serviceBuckets")}
                <input
                  data-testid="config-service-buckets"
                  style={inputStyle}
                  value={configForm.serviceBuckets}
                  onChange={(e) =>
                    setConfigForm((prev) =>
                      prev ? { ...prev, serviceBuckets: e.target.value } : prev,
                    )
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.modal.maxCandidates")}
                <input
                  data-testid="config-max-candidates"
                  style={inputStyle}
                  value={configForm.maxCandidates}
                  onChange={(e) =>
                    setConfigForm((prev) =>
                      prev ? { ...prev, maxCandidates: e.target.value } : prev,
                    )
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.modal.acceptTimeoutSeconds")}
                <input
                  data-testid="config-accept-timeout-seconds"
                  style={inputStyle}
                  value={configForm.acceptTimeoutSeconds}
                  onChange={(e) =>
                    setConfigForm((prev) =>
                      prev
                        ? { ...prev, acceptTimeoutSeconds: e.target.value }
                        : prev,
                    )
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.modal.manualFallbackThresholdSeconds")}
                <input
                  data-testid="config-manual-fallback-seconds"
                  style={inputStyle}
                  value={configForm.manualFallbackThresholdSeconds}
                  onChange={(e) =>
                    setConfigForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            manualFallbackThresholdSeconds: e.target.value,
                          }
                        : prev,
                    )
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.registerModal.financeAuthorityMode")}
                <select
                  data-testid="config-finance-mode"
                  style={inputStyle}
                  value={configForm.financeAuthorityMode}
                  onChange={(e) =>
                    setConfigForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            financeAuthorityMode:
                              e.target.value as PlatformAdapter["policies"]["financeAuthorityMode"],
                          }
                        : prev,
                    )
                  }
                >
                  {FINANCE_AUTHORITY_MODE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {formatPlatformCodeLabel(locale as LabelLocale, option)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.modal.webhookUrl")}
                <input
                  data-testid="config-webhook-url"
                  style={inputStyle}
                  value={configForm.webhookUrl}
                  placeholder={t("adapterRegistry.modal.webhookPlaceholder")}
                  onChange={(e) =>
                    setConfigForm((prev) =>
                      prev ? { ...prev, webhookUrl: e.target.value } : prev,
                    )
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.configModal.featureFlags")}
                <input
                  data-testid="config-feature-flags"
                  style={inputStyle}
                  value={configForm.featureFlags}
                  placeholder={t(
                    "adapterRegistry.configModal.featureFlagsPlaceholder",
                  )}
                  onChange={(e) =>
                    setConfigForm((prev) =>
                      prev ? { ...prev, featureFlags: e.target.value } : prev,
                    )
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.configModal.reason")}
                <input
                  data-testid="config-reason"
                  style={inputStyle}
                  value={configForm.reason}
                  placeholder={t(
                    "adapterRegistry.configModal.reasonPlaceholder",
                  )}
                  onChange={(e) =>
                    setConfigForm((prev) =>
                      prev ? { ...prev, reason: e.target.value } : prev,
                    )
                  }
                />
              </label>
            </div>

            <div style={actionRowStyle}>
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  data-testid="config-is-enabled"
                  checked={configForm.isEnabled}
                  onChange={(e) =>
                    setConfigForm((prev) =>
                      prev ? { ...prev, isEnabled: e.target.checked } : prev,
                    )
                  }
                />
                {t("adapterRegistry.modal.enabled")}
              </label>

              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  data-testid="config-webhook-enabled"
                  checked={configForm.webhookEnabled}
                  onChange={(e) =>
                    setConfigForm((prev) =>
                      prev
                        ? { ...prev, webhookEnabled: e.target.checked }
                        : prev,
                    )
                  }
                />
                {t("adapterRegistry.modal.webhookEnabled")}
              </label>
            </div>

            <div style={{ ...actionRowStyle, justifyContent: "flex-end" }}>
              <button
                type="button"
                data-testid="config-cancel"
                style={inputStyle}
                onClick={() => {
                  setConfigTarget(null);
                  setConfigForm(null);
                }}
              >
                {t("adapterRegistry.modal.cancel")}
              </button>
              <button
                type="submit"
                data-testid="config-submit"
                disabled={configSubmitting}
                style={{
                  ...inputStyle,
                  fontWeight: 700,
                }}
              >
                {configSubmitting
                  ? t("adapterRegistry.configModal.submitting")
                  : t("adapterRegistry.configModal.submit")}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {credentialTarget && credentialForm ? (
        <div
          data-testid="adapter-credential-modal"
          role="dialog"
          aria-modal="true"
          style={modalBackdropStyle}
        >
          <form
            onSubmit={(e) => void handleCredentialSubmit(e)}
            style={modalCardStyle}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 16, color: theme.text }}>
                {t("adapterRegistry.credentialModal.title", {
                  name: credentialTarget.name,
                })}
              </h2>
              <p style={{ ...helperTextStyle, marginTop: 4 }}>
                {t("adapterRegistry.credentialModal.subtitle", {
                  revision: credentialTarget.revision ?? 1,
                })}
              </p>
            </div>

            <div style={flashStyle("info")}>
              {t("adapterRegistry.credentialModal.nonSecretNotice")}
            </div>

            {credentialError ? (
              <div
                data-testid="adapter-credential-error"
                style={flashStyle("danger")}
              >
                {credentialError}
              </div>
            ) : null}

            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                data-testid="credential-clear-expiry"
                checked={credentialForm.clearExpiry}
                onChange={(e) =>
                  setCredentialForm((prev) =>
                    prev ? { ...prev, clearExpiry: e.target.checked } : prev,
                  )
                }
              />
              {t("adapterRegistry.credentialModal.clearExpiry")}
            </label>

            <div style={formGridStyle}>
              <label style={fieldLabelStyle}>
                {t("adapterRegistry.registerModal.credReference")}
                <input
                  data-testid="credential-reference"
                  style={inputStyle}
                  disabled={credentialForm.clearExpiry}
                  value={credentialForm.reference}
                  placeholder={t(
                    "adapterRegistry.registerModal.credReferencePlaceholder",
                  )}
                  onChange={(e) =>
                    setCredentialForm((prev) =>
                      prev ? { ...prev, reference: e.target.value } : prev,
                    )
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.registerModal.credExpiresAt")}
                <input
                  data-testid="credential-expires-at"
                  style={inputStyle}
                  disabled={credentialForm.clearExpiry}
                  value={credentialForm.expiresAt}
                  placeholder={t(
                    "adapterRegistry.registerModal.credExpiresAtPlaceholder",
                  )}
                  onChange={(e) =>
                    setCredentialForm((prev) =>
                      prev ? { ...prev, expiresAt: e.target.value } : prev,
                    )
                  }
                />
              </label>

              <label style={fieldLabelStyle}>
                {t("adapterRegistry.configModal.reason")}
                <input
                  data-testid="credential-reason"
                  style={inputStyle}
                  value={credentialForm.reason}
                  placeholder={t(
                    "adapterRegistry.configModal.reasonPlaceholder",
                  )}
                  onChange={(e) =>
                    setCredentialForm((prev) =>
                      prev ? { ...prev, reason: e.target.value } : prev,
                    )
                  }
                />
              </label>
            </div>

            <div style={{ ...actionRowStyle, justifyContent: "flex-end" }}>
              <button
                type="button"
                data-testid="credential-cancel"
                style={inputStyle}
                onClick={() => {
                  setCredentialTarget(null);
                  setCredentialForm(null);
                }}
              >
                {t("adapterRegistry.modal.cancel")}
              </button>
              <button
                type="submit"
                data-testid="credential-submit"
                disabled={credentialSubmitting}
                style={{
                  ...inputStyle,
                  fontWeight: 700,
                }}
              >
                {credentialSubmitting
                  ? t("adapterRegistry.credentialModal.submitting")
                  : t("adapterRegistry.credentialModal.submit")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
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
