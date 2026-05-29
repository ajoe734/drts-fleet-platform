import Link from "next/link";
import type {
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
  VehicleContractRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  Timeline,
  buildCanvasTheme,
  type CanvasTone,
  type CanvasDLItem,
  type TimelineItem,
} from "@drts/ui-web";
import {
  ContractActionBar,
  ContractRefreshIndicator,
} from "./contract-detail-controls";

type ContractDetailPageProps = {
  params: Promise<{ contractId: string }>;
};

type ContractVersionHistoryEntry = {
  version: string;
  publishedAt: string;
  status: "active" | "retired" | "pending";
  actor: string | null;
  actorRealm: "platform" | "ops" | "tenant" | "driver" | null;
  note: string | null;
};

type ContractOperationalView = VehicleContractRecord & {
  refreshTier?: RefreshTier;
  availableActions?: ResourceActionDescriptor[];
  operationalTerms?: {
    modifiableWindow?: string;
    proofRequirements?: string;
    waitingRule?: string;
    noShowRule?: string;
    slaProfile?: string;
    currentEffectiveVersion?: string;
    partnerProgram?: string;
    authMode?: string;
  };
  tenantLinkage?: {
    tenantId?: string;
    tenantDisplayName?: string;
    partnerEntrySlug?: string;
    programId?: string;
  };
  pendingVersion?: {
    version: string;
    effectiveAt: string;
    note?: string;
  } | null;
  versionHistory?: ContractVersionHistoryEntry[];
  counterpartyDisplayName?: string;
  platformAdminUrl?: string;
};

const PLATFORM_ADMIN_BASE_URL = "https://platform-admin.drts.io";
const CONTRACT_REFRESH_TIER: RefreshTier = "medium";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

function formatDateRange(
  locale: Locale,
  start: string,
  end: string | null | undefined,
) {
  const startLabel = formatDate(locale, start);
  const endLabel = end ? formatDate(locale, end) : t("common.dash", locale);
  return `${startLabel} → ${endLabel}`;
}

function formatDate(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return t("common.dash", locale);
  }
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return t("common.dash", locale);
  }
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function contractStatusTone(
  status: VehicleContractRecord["status"],
): CanvasTone {
  if (status === "active") return "success";
  if (status === "terminated") return "danger";
  return "warn";
}

function actionLinkStyle(
  variant: "primary" | "secondary" | "ghost" = "secondary",
) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    height: "28px",
    padding: "5px 10px",
    borderRadius: "7px",
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: 1,
    textDecoration: "none",
  } as const;
  if (variant === "primary") {
    return {
      ...base,
      background: theme.accent,
      color: "#ffffff",
      border: `1px solid ${theme.accent}`,
    } as const;
  }
  if (variant === "ghost") {
    return {
      ...base,
      background: "transparent",
      color: theme.textMuted,
      border: "1px solid transparent",
    } as const;
  }
  return {
    ...base,
    background: theme.surface,
    color: theme.text,
    border: `1px solid ${theme.border}`,
  } as const;
}

function refreshTierLabel(locale: Locale, tier: RefreshTier) {
  return t(`contractDetail.refreshTier.${tier}` as never, locale);
}

function refreshTierCadenceLabel(tier: RefreshTier) {
  const cadence: Record<RefreshTier, string> = {
    urgent: "5s",
    fast: "3s",
    dispatch: "5s",
    medium: "15s",
    medium_slow: "30s",
    slow: "30s",
    manual: "manual",
  };
  return cadence[tier];
}

function buildEmptyStateContent(
  locale: Locale,
  reason: EmptyReason,
): {
  tone: Exclude<CanvasTone, "neutral">;
  icon: "info" | "warn" | "check" | "x" | "audit";
  title: string;
  body: string;
  cta?: { href: string; label: string; newTab?: boolean };
} {
  if (reason === "no_data") {
    return {
      tone: "info",
      icon: "info",
      title: t("contractDetail.empty.no_data.title", locale),
      body: t("contractDetail.empty.no_data.body", locale),
    };
  }
  if (reason === "not_provisioned") {
    return {
      tone: "warn",
      icon: "warn",
      title: t("contractDetail.empty.not_provisioned.title", locale),
      body: t("contractDetail.empty.not_provisioned.body", locale),
      cta: {
        href: `${PLATFORM_ADMIN_BASE_URL}/partners`,
        label: t("contractDetail.empty.not_provisioned.cta", locale),
        newTab: true,
      },
    };
  }
  if (reason === "fetch_failed") {
    return {
      tone: "danger",
      icon: "warn",
      title: t("contractDetail.empty.fetch_failed.title", locale),
      body: t("contractDetail.empty.fetch_failed.body", locale),
    };
  }
  if (reason === "permission_denied") {
    return {
      tone: "warn",
      icon: "warn",
      title: t("contractDetail.empty.permission_denied.title", locale),
      body: t("contractDetail.empty.permission_denied.body", locale),
    };
  }
  if (reason === "external_unavailable") {
    return {
      tone: "warn",
      icon: "warn",
      title: t("contractDetail.empty.external_unavailable.title", locale),
      body: t("contractDetail.empty.external_unavailable.body", locale),
    };
  }
  if (reason === "driver_not_eligible") {
    return {
      tone: "info",
      icon: "info",
      title: t("contractDetail.empty.driver_not_eligible.title", locale),
      body: t("contractDetail.empty.driver_not_eligible.body", locale),
    };
  }
  return {
    tone: "info",
    icon: "info",
    title: t("contractDetail.empty.filtered_empty.title", locale),
    body: t("contractDetail.empty.filtered_empty.body", locale),
  };
}

function EmptyStatePanel({
  locale,
  reason,
}: {
  locale: Locale;
  reason: EmptyReason;
}) {
  const content = buildEmptyStateContent(locale, reason);
  const cta = content.cta ? (
    <Link
      href={content.cta.href}
      target={content.cta.newTab ? "_blank" : undefined}
      rel={content.cta.newTab ? "noopener noreferrer" : undefined}
      style={actionLinkStyle("primary")}
    >
      <CanvasIcon name="ext" size={12} />
      <span>{content.cta.label}</span>
    </Link>
  ) : null;
  return (
    <div
      data-empty-reason={reason}
      style={{
        padding: 24,
        display: "grid",
        gap: 12,
      }}
    >
      <Banner
        theme={theme}
        tone={content.tone}
        icon={content.icon}
        title={content.title}
        body={content.body}
        actions={cta}
      />
      <div
        style={{
          color: theme.textMuted,
          fontSize: 11.5,
          fontFamily: theme.monoFamily,
        }}
      >
        empty_reason · {reason}
      </div>
    </div>
  );
}

function buildVersionTimeline(
  history: ContractVersionHistoryEntry[],
  locale: Locale,
): TimelineItem[] {
  return [...history]
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    )
    .map((entry) => {
      const tone =
        entry.status === "active"
          ? "success"
          : entry.status === "pending"
            ? "warning"
            : "accent";
      const realmLabel = entry.actorRealm
        ? formatOpsCodeLabel(locale, entry.actorRealm)
        : null;
      const eyebrow =
        entry.actor && realmLabel
          ? `${entry.actor} · ${realmLabel}`
          : (entry.actor ?? realmLabel ?? undefined);
      const item: TimelineItem = {
        id: `${entry.version}-${entry.publishedAt}`,
        title: `${entry.version} · ${formatDate(locale, entry.publishedAt)}`,
        tone,
        detail: entry.note ?? undefined,
      };
      if (eyebrow !== undefined) {
        item.eyebrow = eyebrow;
      }
      return item;
    });
}

function findContractRecord(
  contracts: VehicleContractRecord[],
  contractId: string,
): ContractOperationalView | null {
  const match = contracts.find(
    (contract) => contract.contractId === contractId,
  );
  return match ? (match as ContractOperationalView) : null;
}

async function loadContracts(
  client: Awaited<ReturnType<typeof getServerOpsClient>>,
): Promise<
  | { status: "ok"; items: VehicleContractRecord[] }
  | { status: "fetch_failed" }
  | { status: "permission_denied" }
  | { status: "external_unavailable" }
> {
  try {
    const items = await client.listContracts();
    return { status: "ok", items };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/403|forbidden|permission/i.test(message)) {
      return { status: "permission_denied" };
    }
    if (/503|unavailable|adapter/i.test(message)) {
      return { status: "external_unavailable" };
    }
    return { status: "fetch_failed" };
  }
}

export default async function ContractDetailPage({
  params,
}: ContractDetailPageProps) {
  const [{ contractId }, locale, client] = await Promise.all([
    params,
    getServerLocale(),
    getServerOpsClient(),
  ]);

  const fetchResult = await loadContracts(client);

  if (fetchResult.status !== "ok") {
    return (
      <>
        <PageHeader
          theme={theme}
          title={contractId}
          subtitle={t("contractDetail.headerSubtitle.unavailable", locale)}
        />
        <EmptyStatePanel
          locale={locale}
          reason={
            fetchResult.status === "permission_denied"
              ? "permission_denied"
              : fetchResult.status === "external_unavailable"
                ? "external_unavailable"
                : "fetch_failed"
          }
        />
      </>
    );
  }

  const contract = findContractRecord(fetchResult.items, contractId);

  if (!contract) {
    const notProvisioned = fetchResult.items.length === 0;
    return (
      <>
        <PageHeader
          theme={theme}
          title={contractId}
          subtitle={t("contractDetail.headerSubtitle.notFound", locale)}
        />
        <EmptyStatePanel
          locale={locale}
          reason={notProvisioned ? "not_provisioned" : "no_data"}
        />
      </>
    );
  }

  const ops = contract.operationalTerms ?? {};
  const linkage = contract.tenantLinkage ?? {};
  const versionHistory = contract.versionHistory ?? [];
  const availableActions = contract.availableActions ?? [];
  const refreshTier = contract.refreshTier ?? CONTRACT_REFRESH_TIER;
  const counterparty =
    contract.counterpartyDisplayName ?? contract.partnerId ?? "—";
  const partnerProgramLabel =
    ops.partnerProgram ?? formatOpsCodeLabel(locale, contract.partnerType);
  const platformAdminHref =
    contract.platformAdminUrl ??
    `${PLATFORM_ADMIN_BASE_URL}/partners?contractId=${encodeURIComponent(
      contract.contractId,
    )}`;

  const operationalTermItems: CanvasDLItem[] = [
    {
      k: t("contractDetail.terms.modifiableWindow", locale),
      v: ops.modifiableWindow ?? t("contractDetail.pendingBackend", locale),
      mono: Boolean(ops.modifiableWindow),
    },
    {
      k: t("contractDetail.terms.proofRequirements", locale),
      v: ops.proofRequirements ?? t("contractDetail.pendingBackend", locale),
    },
    {
      k: t("contractDetail.terms.waitingRule", locale),
      v: ops.waitingRule ?? t("contractDetail.pendingBackend", locale),
    },
    {
      k: t("contractDetail.terms.noShowRule", locale),
      v: ops.noShowRule ?? t("contractDetail.pendingBackend", locale),
      mono: Boolean(ops.noShowRule),
    },
    {
      k: t("contractDetail.terms.slaProfile", locale),
      v: ops.slaProfile ?? t("contractDetail.pendingBackend", locale),
    },
    {
      k: t("contractDetail.terms.currentEffectiveVersion", locale),
      v:
        ops.currentEffectiveVersion ??
        t("contractDetail.pendingBackend", locale),
      mono: Boolean(ops.currentEffectiveVersion),
    },
    {
      k: t("contractDetail.terms.partnerProgram", locale),
      v: partnerProgramLabel,
    },
    {
      k: t("contractDetail.terms.authMode", locale),
      v: ops.authMode ?? t("contractDetail.pendingBackend", locale),
      mono: Boolean(ops.authMode),
    },
  ];

  const linkageItems: CanvasDLItem[] = [
    {
      k: t("contractDetail.linkage.tenant", locale),
      v: linkage.tenantDisplayName
        ? `${linkage.tenantId ?? "—"} · ${linkage.tenantDisplayName}`
        : (linkage.tenantId ?? t("common.dash", locale)),
      mono: Boolean(linkage.tenantId),
    },
    {
      k: t("contractDetail.linkage.partnerEntry", locale),
      v: linkage.partnerEntrySlug ?? t("common.dash", locale),
      mono: Boolean(linkage.partnerEntrySlug),
    },
    {
      k: t("contractDetail.linkage.programId", locale),
      v: linkage.programId ?? t("common.dash", locale),
      mono: Boolean(linkage.programId),
    },
  ];

  const metaItems: CanvasDLItem[] = [
    {
      k: t("contractDetail.meta.contractType", locale),
      v: formatOpsCodeLabel(locale, contract.contractType),
    },
    {
      k: t("contractDetail.meta.partnerType", locale),
      v: formatOpsCodeLabel(locale, contract.partnerType),
    },
    {
      k: t("contractDetail.meta.vehicleId", locale),
      v: contract.vehicleId,
      mono: true,
    },
    {
      k: t("contractDetail.meta.operatingArea", locale),
      v: contract.operatingAreaId ?? t("common.dash", locale),
      mono: Boolean(contract.operatingAreaId),
    },
    {
      k: t("contractDetail.meta.serviceScope", locale),
      v: contract.serviceScope,
    },
    {
      k: t("contractDetail.meta.term", locale),
      v: formatDateRange(locale, contract.startAt, contract.endAt),
      mono: true,
    },
    {
      k: t("contractDetail.meta.approvedBy", locale),
      v: contract.approvedBy ?? t("common.dash", locale),
    },
    {
      k: t("contractDetail.meta.approvedAt", locale),
      v: formatDateTime(locale, contract.approvedAt),
      mono: Boolean(contract.approvedAt),
    },
  ];

  const headerSubtitle = [
    counterparty,
    formatOpsCodeLabel(locale, contract.contractType),
    formatDateRange(locale, contract.startAt, contract.endAt),
  ].join(" · ");

  const tierLabel = refreshTierLabel(locale, refreshTier);
  const cadenceLabel = refreshTierCadenceLabel(refreshTier);

  const timelineItems = buildVersionTimeline(versionHistory, locale);

  const versionHistoryEmptyReason: EmptyReason =
    versionHistory.length === 0 ? "no_data" : "no_data";

  return (
    <>
      <PageHeader
        theme={theme}
        title={
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span>{contract.contractId}</span>
            <Pill theme={theme} tone={contractStatusTone(contract.status)} dot>
              {formatOpsCodeLabel(locale, contract.status)}
            </Pill>
            <Pill theme={theme} tone="info">
              {t("contractDetail.readOnlyPill", locale)}
            </Pill>
          </span>
        }
        subtitle={
          <span
            style={{
              display: "inline-flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span>{headerSubtitle}</span>
            <ContractRefreshIndicator
              locale={locale}
              tier={refreshTier}
              tierLabel={tierLabel}
              cadenceLabel={cadenceLabel}
              theme={theme}
            />
          </span>
        }
        actions={
          <ContractActionBar
            locale={locale}
            availableActions={availableActions}
            platformAdminHref={platformAdminHref}
            theme={theme}
          />
        }
      />

      {contract.pendingVersion ? (
        <div style={{ padding: "16px 24px 0" }}>
          <Banner
            theme={theme}
            tone="warn"
            icon="warn"
            title={t("contractDetail.transitionBanner.title", locale, {
              version: contract.pendingVersion.version,
            })}
            body={
              contract.pendingVersion.note ??
              t("contractDetail.transitionBanner.body", locale, {
                effective: formatDateTime(
                  locale,
                  contract.pendingVersion.effectiveAt,
                ),
              })
            }
          />
        </div>
      ) : null}

      <div
        style={{
          padding: 24,
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 16,
        }}
      >
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <Card
            theme={theme}
            title={t("contractDetail.operationalTermsTitle", locale)}
            subtitle={t("contractDetail.operationalTermsSubtitle", locale)}
          >
            <DL theme={theme} cols={2} items={operationalTermItems} />
          </Card>
          <Card
            theme={theme}
            title={t("contractDetail.metaTitle", locale)}
            subtitle={t("contractDetail.metaSubtitle", locale)}
          >
            <DL theme={theme} cols={2} items={metaItems} />
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card
            theme={theme}
            title={t("contractDetail.authorityRedirect.title", locale)}
          >
            <Banner
              theme={theme}
              tone="info"
              icon="info"
              title={t("contractDetail.authorityRedirect.bannerTitle", locale)}
              body={t("contractDetail.authorityRedirect.bannerBody", locale)}
              actions={
                <Link
                  href={platformAdminHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={actionLinkStyle("primary")}
                >
                  <CanvasIcon name="ext" size={12} />
                  <span>{t("contractDetail.openInNewTab", locale)}</span>
                </Link>
              }
            />
          </Card>

          <Card theme={theme} title={t("contractDetail.linkage.title", locale)}>
            <DL theme={theme} cols={1} items={linkageItems} />
          </Card>

          <Card
            theme={theme}
            title={t("contractDetail.versionHistoryTitle", locale)}
          >
            {timelineItems.length === 0 ? (
              <EmptyStatePanel
                locale={locale}
                reason={versionHistoryEmptyReason}
              />
            ) : (
              <Timeline
                density="compact"
                items={timelineItems}
                emptyState={t("contractDetail.versionHistoryEmpty", locale)}
              />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
