import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  ResourceActionDescriptor,
  TenantIntegrationReadinessItem,
  TenantIntegrationReadinessSummary,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { getServerLocale } from "@/lib/server-locale";
import { type Locale, t } from "@/lib/translations";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const PLATFORM_ADMIN_URL = process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL;
const OPS_CONSOLE_URL = process.env.NEXT_PUBLIC_OPS_CONSOLE_URL;

const monoStyle: CSSProperties = {
  fontFamily: th.monoFamily,
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const boardStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
};

const secondaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
};

const emptyGalleryStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const mutedCopyStyle: CSSProperties = {
  margin: 0,
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.55,
};

const subtleCopyStyle: CSSProperties = {
  color: th.textDim,
  fontSize: 10.5,
  lineHeight: 1.5,
};

const actionStripStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const tileHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
};

const tileFooterStyle: CSSProperties = {
  marginTop: 10,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const pillToneByStatus: Record<
  TenantIntegrationReadinessItem["status"],
  CanvasTone
> = {
  ready: "success",
  partial: "warn",
  blocked: "danger",
  not_provisioned: "neutral",
};

const subsystemOrder: TenantIntegrationReadinessItem["subSystem"][] = [
  "api_keys",
  "webhooks",
  "notifications",
  "sla",
  "reports",
  "modules",
  "partner_entries",
];

type QuickActionDisplay = ResourceActionDescriptor & {
  href: string;
  source: string;
};

const subSystemMeta: Record<
  TenantIntegrationReadinessItem["subSystem"],
  {
    labelKey: string;
    code: string;
    href: string;
    fallbackDetailKey: string;
    emptyReason?: EmptyReason;
    emptyBodyKey?: string;
  }
> = {
  api_keys: {
    labelKey: "integrationGovernance.subsystem.apiKeys.label",
    code: "api_keys",
    href: "/api-keys",
    fallbackDetailKey: "integrationGovernance.subsystem.apiKeys.fallback",
  },
  webhooks: {
    labelKey: "integrationGovernance.subsystem.webhooks.label",
    code: "webhooks",
    href: "/webhooks",
    fallbackDetailKey: "integrationGovernance.subsystem.webhooks.fallback",
  },
  notifications: {
    labelKey: "integrationGovernance.subsystem.notifications.label",
    code: "notifications",
    href: "/settings#notifications",
    fallbackDetailKey: "integrationGovernance.subsystem.notifications.fallback",
  },
  sla: {
    labelKey: "integrationGovernance.subsystem.sla.label",
    code: "sla_profile",
    href: "/settings#sla",
    fallbackDetailKey: "integrationGovernance.subsystem.sla.fallback",
  },
  reports: {
    labelKey: "integrationGovernance.subsystem.reports.label",
    code: "reports",
    href: "/reports",
    fallbackDetailKey: "integrationGovernance.subsystem.reports.fallback",
  },
  modules: {
    labelKey: "integrationGovernance.subsystem.modules.label",
    code: "modules",
    href: "/settings",
    fallbackDetailKey: "integrationGovernance.subsystem.modules.fallback",
  },
  partner_entries: {
    labelKey: "integrationGovernance.subsystem.partnerEntries.label",
    code: "partner_entries",
    href: "/partner",
    fallbackDetailKey:
      "integrationGovernance.subsystem.partnerEntries.fallback",
    emptyReason: "not_provisioned",
    emptyBodyKey: "integrationGovernance.subsystem.partnerEntries.emptyBody",
  },
};

const emptyReasonMeta: Record<
  EmptyReason,
  {
    titleKey: string;
    bodyKey: string;
    glyph: string;
    tone: CanvasTone;
    href: string;
    actionLabelKey: string;
  }
> = {
  no_data: {
    titleKey: "integrationGovernance.empty.noData.title",
    bodyKey: "integrationGovernance.empty.noData.body",
    glyph: "00",
    tone: "neutral",
    href: "/api-keys",
    actionLabelKey: "integrationGovernance.empty.noData.action",
  },
  not_provisioned: {
    titleKey: "integrationGovernance.empty.notProvisioned.title",
    bodyKey: "integrationGovernance.empty.notProvisioned.body",
    glyph: "NP",
    tone: "warn",
    href: "/webhooks",
    actionLabelKey: "integrationGovernance.empty.notProvisioned.action",
  },
  fetch_failed: {
    titleKey: "integrationGovernance.empty.fetchFailed.title",
    bodyKey: "integrationGovernance.empty.fetchFailed.body",
    glyph: "FF",
    tone: "danger",
    href: "/integration-governance",
    actionLabelKey: "integrationGovernance.empty.fetchFailed.action",
  },
  permission_denied: {
    titleKey: "integrationGovernance.empty.permissionDenied.title",
    bodyKey: "integrationGovernance.empty.permissionDenied.body",
    glyph: "PD",
    tone: "danger",
    href: "/users",
    actionLabelKey: "integrationGovernance.empty.permissionDenied.action",
  },
  external_unavailable: {
    titleKey: "integrationGovernance.empty.externalUnavailable.title",
    bodyKey: "integrationGovernance.empty.externalUnavailable.body",
    glyph: "EX",
    tone: "warn",
    href: "/webhooks",
    actionLabelKey: "integrationGovernance.empty.externalUnavailable.action",
  },
  filtered_empty: {
    titleKey: "integrationGovernance.empty.filteredEmpty.title",
    bodyKey: "integrationGovernance.empty.filteredEmpty.body",
    glyph: "FX",
    tone: "info",
    href: "/integration-governance",
    actionLabelKey: "integrationGovernance.empty.filteredEmpty.action",
  },
  driver_not_eligible: {
    titleKey: "integrationGovernance.empty.driverNotEligible.title",
    bodyKey: "integrationGovernance.empty.driverNotEligible.body",
    glyph: "DN",
    tone: "neutral",
    href: "/integration-governance",
    actionLabelKey: "integrationGovernance.empty.driverNotEligible.action",
  },
};

type PageData = {
  summary: TenantIntegrationReadinessSummary | null;
  errors: string[];
};

function normalizeQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isEmptyReason(value: string | undefined): value is EmptyReason {
  return Boolean(
    value && value in emptyReasonMeta && value !== "driver_not_eligible",
  );
}

function toErrorMessage(error: unknown, locale: Locale) {
  return error instanceof Error
    ? error.message
    : t("integrationGovernance.error.unknown", locale);
}

async function loadPageData(locale: Locale): Promise<PageData> {
  const client = getTenantClient();

  try {
    return {
      summary:
        (await client.getTenantIntegrationReadinessSummary()) as TenantIntegrationReadinessSummary,
      errors: [],
    };
  } catch (error) {
    return {
      summary: null,
      errors: [toErrorMessage(error, locale)],
    };
  }
}

function getSubSystemMeta(
  subSystem: TenantIntegrationReadinessItem["subSystem"],
) {
  return subSystemMeta[subSystem]!;
}

function getEmptyReasonMeta(reason: EmptyReason) {
  return emptyReasonMeta[reason]!;
}

function getStatusTone(
  status: TenantIntegrationReadinessItem["status"],
): CanvasTone {
  return pillToneByStatus[status] ?? "neutral";
}

function getStatusLabel(
  status: TenantIntegrationReadinessItem["status"],
  locale: Locale,
) {
  switch (status) {
    case "ready":
      return t("integrationGovernance.status.ready", locale);
    case "partial":
      return t("integrationGovernance.status.partial", locale);
    case "blocked":
      return t("integrationGovernance.status.blocked", locale);
    case "not_provisioned":
      return t("integrationGovernance.status.notProvisioned", locale);
    default:
      return String(status).replaceAll("_", " ");
  }
}

function getStatusAccent(status: TenantIntegrationReadinessItem["status"]) {
  switch (status) {
    case "ready":
      return { glyph: "OK", background: th.successBg, color: th.success };
    case "partial":
      return { glyph: "!", background: th.warnBg, color: th.warn };
    case "blocked":
      return { glyph: "X", background: th.dangerBg, color: th.danger };
    case "not_provisioned":
    default:
      return { glyph: "?", background: th.surfaceLo, color: th.textMuted };
  }
}

function getActionHref(action: string, fallbackHref: string) {
  switch (action) {
    case "issue_api_key":
      return "/api-keys";
    case "create_webhook_endpoint":
      return "/webhooks";
    case "update_notifications":
      return "/settings#notifications";
    case "update_sla_profile":
      return "/settings#sla";
    case "create_report_job":
      return "/reports";
    default:
      return fallbackHref;
  }
}

function getActionLabel(action: string, locale: Locale) {
  switch (action) {
    case "issue_api_key":
      return t("integrationGovernance.action.issueApiKey", locale);
    case "create_webhook_endpoint":
      return t("integrationGovernance.action.createWebhook", locale);
    case "update_notifications":
      return t("integrationGovernance.action.updateNotifications", locale);
    case "update_sla_profile":
      return t("integrationGovernance.action.updateSla", locale);
    case "create_report_job":
      return t("integrationGovernance.action.createReport", locale);
    default:
      return action.replaceAll("_", " ");
  }
}

function actionButtonStyle(enabled: boolean, emphasis = false): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 30,
    padding: "6px 12px",
    borderRadius: 999,
    border: `1px solid ${enabled ? (emphasis ? th.accentBorder : th.accent) : th.border}`,
    background: enabled ? (emphasis ? th.accent : "transparent") : th.surface,
    color: enabled ? (emphasis ? "#ffffff" : th.accentHi) : th.textMuted,
    textDecoration: "none",
    fontSize: 11.5,
    fontWeight: 600,
    pointerEvents: enabled ? "auto" : "none",
    opacity: enabled ? 1 : 0.72,
  };
}

function linkStyle(emphasis = false): CSSProperties {
  return {
    color: emphasis ? th.accentHi : th.accent,
    textDecoration: "none",
    fontSize: emphasis ? 12.5 : 12,
    fontWeight: emphasis ? 600 : 500,
  };
}

function getActionAssistiveCopy(
  action: ResourceActionDescriptor,
  locale: Locale,
) {
  if (!action.enabled && action.disabledReasonCode) {
    return t("integrationGovernance.action.unavailable", locale, {
      reason: action.disabledReasonCode,
    });
  }
  if (!action.enabled) {
    return t("integrationGovernance.action.noData", locale);
  }
  return undefined;
}

function renderActionLink(
  action: ResourceActionDescriptor,
  href: string,
  locale: Locale,
  children: ReactNode,
  emphasis = false,
) {
  const assistiveCopy = getActionAssistiveCopy(action, locale);

  if (!action.enabled) {
    return (
      <span
        aria-disabled="true"
        title={assistiveCopy}
        style={actionButtonStyle(false, emphasis)}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={assistiveCopy}
      style={actionButtonStyle(true, emphasis)}
    >
      {children}
    </Link>
  );
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(parsed)
    .replace(",", "");
}

function buildDisplayItems(
  items: TenantIntegrationReadinessItem[],
  locale: Locale,
) {
  const itemMap = new Map(items.map((item) => [item.subSystem, item]));

  return subsystemOrder.map((subSystem) => {
    const item = itemMap.get(subSystem);
    if (item) {
      return item;
    }

    const meta = getSubSystemMeta(subSystem);
    return {
      subSystem,
      status:
        meta.emptyReason === "not_provisioned" ? "not_provisioned" : "blocked",
      detail:
        meta.emptyReason === "not_provisioned"
          ? t(
              meta.emptyBodyKey ??
                "integrationGovernance.missing.notProvisioned",
              locale,
            )
          : t("integrationGovernance.missing.payload", locale),
    } satisfies TenantIntegrationReadinessItem;
  });
}

function dedupeActions(
  items: TenantIntegrationReadinessItem[],
  locale: Locale,
) {
  const actions = new Map<string, QuickActionDisplay>();

  for (const item of items) {
    if (!item.nextAction) {
      continue;
    }

    const meta = getSubSystemMeta(item.subSystem);
    const candidate = {
      ...item.nextAction,
      href: getActionHref(item.nextAction.action, meta.href),
      source: t(meta.labelKey, locale),
    };
    const existing = actions.get(candidate.action);

    if (!existing || (!existing.enabled && candidate.enabled)) {
      actions.set(candidate.action, candidate);
    }
  }

  return [...actions.values()].sort((left, right) => {
    if (left.enabled !== right.enabled) {
      return left.enabled ? -1 : 1;
    }
    return left.action.localeCompare(right.action, "en");
  });
}

function getStateVariant(
  items: TenantIntegrationReadinessItem[],
  locale: Locale,
) {
  if (items.every((item) => item.status === "ready")) {
    return {
      label: t("integrationGovernance.state.ready.label", locale),
      tone: "success" as CanvasTone,
      body: t("integrationGovernance.state.ready.body", locale),
    };
  }

  if (items.every((item) => item.status === "not_provisioned")) {
    return {
      label: t("integrationGovernance.state.firstSetup.label", locale),
      tone: "warn" as CanvasTone,
      body: t("integrationGovernance.state.firstSetup.body", locale),
    };
  }

  return {
    label: t("integrationGovernance.state.partial.label", locale),
    tone: "info" as CanvasTone,
    body: t("integrationGovernance.state.partial.body", locale),
  };
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  const baseUrl =
    link.targetApp === "platform-admin" ? PLATFORM_ADMIN_URL : OPS_CONSOLE_URL;
  if (!baseUrl) {
    return null;
  }
  return `${baseUrl.replace(/\/$/, "")}${link.route}`;
}

function buildCrossAppLinks(
  tenantId: string,
  items: TenantIntegrationReadinessItem[],
  locale: Locale,
) {
  const links: CrossAppResourceLink[] = [
    {
      targetApp: "platform-admin",
      route: `/tenant-governance?tenantId=${encodeURIComponent(tenantId)}`,
      resourceType: "tenant",
      resourceId: tenantId,
      openMode: "new_tab",
      label: t("integrationGovernance.crossApp.tenantGovernance", locale),
    },
  ];

  const webhookItem = items.find((item) => item.subSystem === "webhooks");
  if (webhookItem && webhookItem.status !== "ready") {
    links.push({
      targetApp: "ops-console",
      route: `/audit?tenantId=${encodeURIComponent(tenantId)}&module=webhooks`,
      resourceType: "tenant_audit",
      resourceId: tenantId,
      openMode: "new_tab",
      label: t("integrationGovernance.crossApp.webhookAudit", locale),
    });
  }

  const partnerItem = items.find(
    (item) => item.subSystem === "partner_entries",
  );
  if (partnerItem && partnerItem.status !== "ready") {
    links.push({
      targetApp: "platform-admin",
      route: `/partners?tenantId=${encodeURIComponent(tenantId)}`,
      resourceType: "tenant_partner_entry",
      resourceId: tenantId,
      openMode: "new_tab",
      label: t("integrationGovernance.crossApp.partnerOwnership", locale),
    });
  }

  return links;
}

function EmptyReasonPreviewCard({
  reason,
  selected,
  locale,
}: {
  reason: EmptyReason;
  selected: boolean;
  locale: Locale;
}) {
  const meta = getEmptyReasonMeta(reason);

  return (
    <CanvasCard
      theme={th}
      style={{
        borderColor: selected ? th.accentBorder : th.border,
        background: selected ? "rgba(15, 118, 110, 0.12)" : th.surface,
      }}
    >
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                meta.tone === "danger"
                  ? th.dangerBg
                  : meta.tone === "warn"
                    ? th.warnBg
                    : meta.tone === "info"
                      ? "rgba(56, 189, 248, 0.12)"
                      : th.surfaceLo,
              color:
                meta.tone === "danger"
                  ? th.danger
                  : meta.tone === "warn"
                    ? th.warn
                    : meta.tone === "info"
                      ? "#38bdf8"
                      : th.textMuted,
              ...monoStyle,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {meta.glyph}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {t(meta.titleKey, locale)}
            </div>
            <div style={{ ...monoStyle, ...subtleCopyStyle }}>{reason}</div>
          </div>
        </div>
        <p style={mutedCopyStyle}>{t(meta.bodyKey, locale)}</p>
        <Link href={`?emptyReason=${reason}`} style={linkStyle(true)}>
          {selected
            ? t("integrationGovernance.preview.current", locale)
            : t("integrationGovernance.preview.preview", locale)}
        </Link>
      </div>
    </CanvasCard>
  );
}

function ReadinessTile({
  item,
  locale,
}: {
  item: TenantIntegrationReadinessItem;
  locale: Locale;
}) {
  const meta = getSubSystemMeta(item.subSystem);
  const accent = getStatusAccent(item.status);
  const action = item.nextAction;
  const actionHref = action
    ? getActionHref(action.action, meta.href)
    : meta.href;

  return (
    <CanvasCard theme={th}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={tileHeaderStyle}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              background: accent.background,
              color: accent.color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              ...monoStyle,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {accent.glyph}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {t(meta.labelKey, locale)}
            </div>
            <div style={{ ...monoStyle, ...subtleCopyStyle }}>{meta.code}</div>
          </div>
          <CanvasPill theme={th} tone={getStatusTone(item.status)} dot>
            {getStatusLabel(item.status, locale)}
          </CanvasPill>
        </div>

        <p style={mutedCopyStyle}>
          {item.detail ?? t(meta.fallbackDetailKey, locale)}
        </p>

        {!action && item.status === "not_provisioned" ? (
          <div style={subtleCopyStyle}>
            {t("integrationGovernance.tile.notProvisionedHint", locale)}
          </div>
        ) : null}

        {!action && item.subSystem === "partner_entries" ? (
          <div style={subtleCopyStyle}>
            {t("integrationGovernance.tile.partnerHint", locale)}
          </div>
        ) : null}

        <div style={tileFooterStyle}>
          <Link href={meta.href} style={linkStyle()}>
            {t("integrationGovernance.tile.openModule", locale)}
          </Link>
          {action ? (
            renderActionLink(
              action,
              actionHref,
              locale,
              `${getActionLabel(action.action, locale)} ->`,
              true,
            )
          ) : (
            <span style={actionButtonStyle(true, false)}>
              {t("integrationGovernance.tile.inspect", locale)}
            </span>
          )}
        </div>

        {action && !action.enabled ? (
          <div style={subtleCopyStyle}>
            {getActionAssistiveCopy(action, locale)}
          </div>
        ) : null}
      </div>
    </CanvasCard>
  );
}

export default async function IntegrationGovernancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getServerLocale();
  const resolvedSearchParams = await searchParams;
  const forcedEmptyReason = normalizeQueryValue(
    resolvedSearchParams.emptyReason,
  );
  const previewEmptyReason = isEmptyReason(forcedEmptyReason)
    ? forcedEmptyReason
    : null;
  const data = previewEmptyReason
    ? { summary: null, errors: [] }
    : await loadPageData(locale);

  const summary = data.summary;
  const hasSnapshot = Boolean(summary && summary.items.length > 0);
  const items = buildDisplayItems(summary?.items ?? [], locale);
  const readyCount = items.filter((item) => item.status === "ready").length;
  const quickActions = dedupeActions(items, locale);
  const crossAppLinks = summary
    ? buildCrossAppLinks(summary.tenantId, items, locale)
    : [];
  const stateVariant = getStateVariant(items, locale);
  const selectedEmptyReason =
    previewEmptyReason ??
    (data.errors.length > 0 ? "fetch_failed" : hasSnapshot ? null : "no_data");
  const selectedEmptyMeta = selectedEmptyReason
    ? getEmptyReasonMeta(selectedEmptyReason)
    : null;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={t("integrationGovernance.header.title", locale)}
        subtitle={t("integrationGovernance.header.subtitle", locale)}
        actions={
          <>
            <CanvasPill theme={th} tone="success" dot>
              {t("integrationGovernance.header.t5", locale)}
            </CanvasPill>
            <CanvasPill
              theme={th}
              tone={hasSnapshot ? stateVariant.tone : "neutral"}
              dot={hasSnapshot}
            >
              {hasSnapshot
                ? t("integrationGovernance.header.readyCount", locale, {
                    ready: readyCount,
                    total: items.length,
                  })
                : t("integrationGovernance.header.noSnapshot", locale)}
            </CanvasPill>
          </>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone="info"
          title={t("integrationGovernance.banner.title", locale)}
          body={t("integrationGovernance.banner.body", locale)}
        />

        {selectedEmptyReason && selectedEmptyMeta ? (
          <>
            <CanvasCard theme={th}>
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 16,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background:
                        selectedEmptyMeta.tone === "danger"
                          ? th.dangerBg
                          : selectedEmptyMeta.tone === "warn"
                            ? th.warnBg
                            : selectedEmptyMeta.tone === "info"
                              ? "rgba(56, 189, 248, 0.12)"
                              : th.surfaceLo,
                      color:
                        selectedEmptyMeta.tone === "danger"
                          ? th.danger
                          : selectedEmptyMeta.tone === "warn"
                            ? th.warn
                            : selectedEmptyMeta.tone === "info"
                              ? "#38bdf8"
                              : th.textMuted,
                      ...monoStyle,
                      fontWeight: 700,
                    }}
                  >
                    {selectedEmptyMeta.glyph}
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                      {t(selectedEmptyMeta.titleKey, locale)}
                    </h2>
                    <p style={{ margin: "6px 0 0", ...mutedCopyStyle }}>
                      {t(selectedEmptyMeta.bodyKey, locale)}
                    </p>
                  </div>
                </div>

                <div style={actionStripStyle}>
                  <Link
                    href={selectedEmptyMeta.href}
                    style={actionButtonStyle(true, true)}
                  >
                    {t(selectedEmptyMeta.actionLabelKey, locale)}
                  </Link>
                  <Link href="/integration-governance" style={linkStyle()}>
                    {t("integrationGovernance.empty.returnLive", locale)}
                  </Link>
                </div>

                {data.errors.length > 0 ? (
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: `1px solid ${th.border}`,
                      background: th.surfaceLo,
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    {data.errors.map((error) => (
                      <div
                        key={error}
                        style={{ ...monoStyle, ...mutedCopyStyle }}
                      >
                        {error}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </CanvasCard>

            <div style={secondaryGridStyle}>
              <CanvasCard theme={th}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {t("integrationGovernance.coverage.title", locale)}
                  </div>
                  <p style={mutedCopyStyle}>
                    {t("integrationGovernance.coverage.body", locale)}
                  </p>
                  <div style={{ ...monoStyle, ...subtleCopyStyle }}>
                    {t("integrationGovernance.coverage.supported", locale)}
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard theme={th}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {t("integrationGovernance.refreshTier.title", locale)}
                  </div>
                  <p style={mutedCopyStyle}>
                    {t("integrationGovernance.refreshTier.emptyBody", locale)}
                  </p>
                  <div style={{ ...monoStyle, ...subtleCopyStyle }}>
                    {t("integrationGovernance.refreshTier.cadence", locale)}
                  </div>
                </div>
              </CanvasCard>
            </div>

            <div style={emptyGalleryStyle}>
              {(
                [
                  "no_data",
                  "not_provisioned",
                  "fetch_failed",
                  "permission_denied",
                  "external_unavailable",
                  "filtered_empty",
                ] as EmptyReason[]
              ).map((reason) => (
                <EmptyReasonPreviewCard
                  key={reason}
                  reason={reason}
                  selected={reason === selectedEmptyReason}
                  locale={locale}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <CanvasCard theme={th}>
              <div style={{ display: "grid", gap: 14 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {t("integrationGovernance.board.title", locale)}
                    </div>
                    <p style={{ marginTop: 6, ...mutedCopyStyle }}>
                      {t("integrationGovernance.board.body", locale)}
                    </p>
                  </div>
                  <div style={actionStripStyle}>
                    <CanvasPill theme={th} tone={stateVariant.tone} dot>
                      {stateVariant.label}
                    </CanvasPill>
                    <CanvasPill theme={th} tone="neutral">
                      {t("integrationGovernance.board.subsystemLanes", locale)}
                    </CanvasPill>
                    <CanvasPill theme={th} tone="neutral">
                      {t("integrationGovernance.board.snapshot", locale, {
                        value: formatDateTime(summary!.computedAt),
                      })}
                    </CanvasPill>
                  </div>
                </div>

                <div style={actionStripStyle}>
                  {quickActions.length > 0 ? (
                    quickActions.map((action) => (
                      <div
                        key={action.action}
                        style={{ display: "grid", gap: 4 }}
                      >
                        {renderActionLink(
                          action,
                          action.href,
                          locale,
                          getActionLabel(action.action, locale),
                          true,
                        )}
                        <span style={subtleCopyStyle}>{action.source}</span>
                      </div>
                    ))
                  ) : (
                    <CanvasPill theme={th} tone="success" dot>
                      {t("integrationGovernance.board.noFollowup", locale)}
                    </CanvasPill>
                  )}
                </div>

                <div style={boardStyle}>
                  {items.map((item) => (
                    <ReadinessTile
                      key={item.subSystem}
                      item={item}
                      locale={locale}
                    />
                  ))}
                </div>
              </div>
            </CanvasCard>

            <div style={secondaryGridStyle}>
              <CanvasCard theme={th}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {t("integrationGovernance.refreshTier.title", locale)}
                  </div>
                  <p style={mutedCopyStyle}>
                    {t(
                      "integrationGovernance.refreshTier.snapshotBody",
                      locale,
                    )}
                  </p>
                  <div style={{ ...monoStyle, ...subtleCopyStyle }}>
                    {t("integrationGovernance.refreshTier.cadence", locale)}
                  </div>
                  <div style={{ ...monoStyle, ...subtleCopyStyle }}>
                    {t("integrationGovernance.refreshTier.computedAt", locale, {
                      value: formatDateTime(summary!.computedAt),
                    })}
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard theme={th}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {t("integrationGovernance.crossApp.title", locale)}
                  </div>
                  <p style={mutedCopyStyle}>
                    {t("integrationGovernance.crossApp.body", locale)}
                  </p>
                  <div style={{ display: "grid", gap: 8 }}>
                    {crossAppLinks.map((link) => {
                      const href = buildCrossAppHref(link);
                      return href ? (
                        <a
                          key={`${link.targetApp}-${link.route}`}
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          style={linkStyle(true)}
                        >
                          {link.label}
                        </a>
                      ) : (
                        <div
                          key={`${link.targetApp}-${link.route}`}
                          style={{ display: "grid", gap: 4 }}
                        >
                          <span style={linkStyle(true)}>{link.label}</span>
                          <span style={subtleCopyStyle}>
                            {t(
                              "integrationGovernance.crossApp.configure",
                              locale,
                              {
                                envVar: `NEXT_PUBLIC_${
                                  link.targetApp === "platform-admin"
                                    ? "PLATFORM_ADMIN"
                                    : "OPS_CONSOLE"
                                }_URL`,
                              },
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard theme={th}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {t("integrationGovernance.qa.title", locale)}
                  </div>
                  <p style={mutedCopyStyle}>
                    {t("integrationGovernance.qa.body", locale)}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(
                      [
                        "no_data",
                        "not_provisioned",
                        "fetch_failed",
                        "permission_denied",
                        "external_unavailable",
                        "filtered_empty",
                      ] as EmptyReason[]
                    ).map((reason) => (
                      <Link
                        key={reason}
                        href={`?emptyReason=${reason}`}
                        style={linkStyle()}
                      >
                        {reason}
                      </Link>
                    ))}
                  </div>
                </div>
              </CanvasCard>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
