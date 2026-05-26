import Link from "next/link";
import type {
  CrossAppResourceLink,
  EmptyReason,
  OpsContractDetailRecord,
  OpsContractVersionHistoryEntry,
  RefreshTier,
  UiHealthEnvelope,
  UiRefreshMetadata,
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
  type CanvasDLItem,
  type CanvasTone,
  type TimelineItem,
} from "@drts/ui-web";
import {
  ContractActionBar,
  ContractRefreshIndicator,
  type ContractActionLinkTarget,
  type ContractPrimaryLinkTarget,
} from "./contract-detail-controls";

type ContractDetailPageProps = {
  params: Promise<{ contractId: string }>;
};

type LoadContractDetailResult =
  | {
      status: "ok";
      detail: OpsContractDetailRecord;
      refresh: UiRefreshMetadata;
      health: UiHealthEnvelope;
    }
  | { status: "not_found" }
  | { status: "fetch_failed" }
  | { status: "permission_denied" }
  | { status: "external_unavailable" };

const PLATFORM_ADMIN_BASE_URL = "https://platform-admin.drts.io";
const TENANT_CONSOLE_BASE_URL = "https://tenant-console.drts.io";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

function resolveAppBaseUrl(targetApp: CrossAppResourceLink["targetApp"]) {
  if (targetApp === "tenant-console") {
    return TENANT_CONSOLE_BASE_URL;
  }
  if (targetApp === "platform-admin") {
    return PLATFORM_ADMIN_BASE_URL;
  }
  return "";
}

function resolveCrossAppHref(link: CrossAppResourceLink) {
  return `${resolveAppBaseUrl(link.targetApp)}${link.route}`;
}

function toLinkTarget(
  link: CrossAppResourceLink,
): ContractPrimaryLinkTarget & { label: string } {
  return {
    href: resolveCrossAppHref(link),
    openMode: link.openMode,
    label: link.label,
  };
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

function formatDateRange(
  locale: Locale,
  start: string,
  end: string | null | undefined,
) {
  return `${formatDate(locale, start)} → ${end ? formatDate(locale, end) : t("common.dash", locale)}`;
}

function formatModifiableWindow(
  locale: Locale,
  minutes: number | null | undefined,
) {
  if (minutes == null) {
    return t("common.dash", locale);
  }
  return t("contractDetail.values.modifiableWindow", locale, {
    minutes,
  });
}

function formatProofRequirements(
  locale: Locale,
  proof: OpsContractDetailRecord["operationalTerms"]["proofRequirements"],
) {
  if (!proof) {
    return t("common.dash", locale);
  }

  return t("contractDetail.values.proofRequirements", locale, {
    photos: proof.minPhotoCount,
    signoff: proof.signoffRequired
      ? t("contractDetail.values.flag.required", locale)
      : t("contractDetail.values.flag.notRequired", locale),
    expense: proof.expenseProofRequired
      ? t("contractDetail.values.flag.required", locale)
      : t("contractDetail.values.flag.notRequired", locale),
  });
}

function formatWaitingRule(locale: Locale, minutes: number | null | undefined) {
  if (minutes == null) {
    return t("common.dash", locale);
  }
  return t("contractDetail.values.waitingRule", locale, { minutes });
}

function formatNoShowRule(locale: Locale, minutes: number | null | undefined) {
  if (minutes == null) {
    return t("common.dash", locale);
  }
  return t("contractDetail.values.noShowRule", locale, { minutes });
}

function formatSlaProfile(
  locale: Locale,
  slaProfile: OpsContractDetailRecord["operationalTerms"]["slaProfile"],
) {
  if (!slaProfile) {
    return t("common.dash", locale);
  }
  return t("contractDetail.values.slaProfile", locale, {
    wait: slaProfile.waitThresholdMin,
    arrival: slaProfile.arrivalThresholdMin,
    completion: slaProfile.completionThresholdMin,
  });
}

function contractStatusTone(
  status: OpsContractDetailRecord["status"],
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
  history: OpsContractVersionHistoryEntry[],
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

function buildRefreshBanner(
  refresh: UiRefreshMetadata,
  locale: Locale,
): {
  tone: Exclude<CanvasTone, "neutral">;
  icon: "info" | "warn" | "x";
  title: string;
  body: string;
} | null {
  if (refresh.dataFreshness === "fresh") {
    return null;
  }
  if (refresh.dataFreshness === "stale") {
    return {
      tone: "warn",
      icon: "warn",
      title: t("contractDetail.refreshBanner.staleTitle", locale),
      body: t("contractDetail.refreshBanner.staleBody", locale, {
        generatedAt: formatDateTime(locale, refresh.generatedAt),
      }),
    };
  }
  if (refresh.dataFreshness === "degraded") {
    return {
      tone: "danger",
      icon: "warn",
      title: t("contractDetail.refreshBanner.degradedTitle", locale),
      body: t("contractDetail.refreshBanner.degradedBody", locale),
    };
  }
  return {
    tone: "info",
    icon: "info",
    title: t("contractDetail.refreshBanner.unknownTitle", locale),
    body: t("contractDetail.refreshBanner.unknownBody", locale),
  };
}

function buildHealthBanner(
  health: UiHealthEnvelope,
  locale: Locale,
): {
  tone: Exclude<CanvasTone, "neutral">;
  icon: "info" | "warn" | "x";
  title: string;
  body: string;
} | null {
  if (health.status === "healthy") {
    return null;
  }
  if (health.status === "degraded") {
    return {
      tone: "warn",
      icon: "warn",
      title: t("contractDetail.health.degradedTitle", locale),
      body: t("contractDetail.health.degradedBody", locale, {
        services: health.degradedServices
          .map((service) => service.service)
          .join(", "),
      }),
    };
  }
  return {
    tone: "danger",
    icon: "x",
    title: t("contractDetail.health.downTitle", locale),
    body: t("contractDetail.health.downBody", locale),
  };
}

async function loadContractDetail(
  client: Awaited<ReturnType<typeof getServerOpsClient>>,
  contractId: string,
): Promise<LoadContractDetailResult> {
  try {
    const { data, refresh, health } =
      await client.getContractDetail(contractId);
    return {
      status: "ok",
      detail: data,
      refresh,
      health,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/404|CONTRACT_NOT_FOUND/i.test(message)) {
      return { status: "not_found" };
    }
    if (/403|forbidden|permission/i.test(message)) {
      return { status: "permission_denied" };
    }
    if (/503|unavailable|adapter/i.test(message)) {
      return { status: "external_unavailable" };
    }
    return { status: "fetch_failed" };
  }
}

function getOwnerAppLabel(
  locale: Locale,
  targetApp: CrossAppResourceLink["targetApp"],
) {
  if (targetApp === "tenant-console") {
    return t("contractDetail.ownerApp.tenantConsole", locale);
  }
  return t("contractDetail.ownerApp.platformAdmin", locale);
}

function renderReferenceLink(
  locale: Locale,
  label: string,
  link: CrossAppResourceLink | null,
) {
  if (!link) {
    return (
      <span
        style={{
          color: theme.textMuted,
          fontSize: 11.5,
          fontFamily: theme.monoFamily,
        }}
      >
        {t("common.dash", locale)}
      </span>
    );
  }

  const target = toLinkTarget(link);
  return (
    <Link
      href={target.href}
      target={target.openMode === "new_tab" ? "_blank" : undefined}
      rel={target.openMode === "new_tab" ? "noopener noreferrer" : undefined}
      style={actionLinkStyle("secondary")}
    >
      <CanvasIcon name="ext" size={12} />
      <span>{label}</span>
    </Link>
  );
}

export default async function ContractDetailPage({
  params,
}: ContractDetailPageProps) {
  const [{ contractId }, locale, client] = await Promise.all([
    params,
    getServerLocale(),
    getServerOpsClient(),
  ]);

  const detailResult = await loadContractDetail(client, contractId);

  if (detailResult.status !== "ok") {
    const reason: EmptyReason =
      detailResult.status === "permission_denied"
        ? "permission_denied"
        : detailResult.status === "external_unavailable"
          ? "external_unavailable"
          : detailResult.status === "not_found"
            ? "no_data"
            : "fetch_failed";

    return (
      <>
        <PageHeader
          theme={theme}
          title={contractId}
          subtitle={
            detailResult.status === "not_found"
              ? t("contractDetail.headerSubtitle.notFound", locale)
              : t("contractDetail.headerSubtitle.unavailable", locale)
          }
        />
        <EmptyStatePanel locale={locale} reason={reason} />
      </>
    );
  }

  const { detail, refresh, health } = detailResult;
  const refreshBanner = buildRefreshBanner(refresh, locale);
  const healthBanner = buildHealthBanner(health, locale);
  const tierLabel = refreshTierLabel(locale, detail.refreshTier);
  const cadenceLabel = refreshTierCadenceLabel(detail.refreshTier);
  const ownerAppLabel = getOwnerAppLabel(locale, detail.mutationLink.targetApp);
  const actionLinks: ContractActionLinkTarget[] = detail.actionLinks.map(
    ({ action, link }) => ({
      action,
      href: resolveCrossAppHref(link),
      openMode: link.openMode,
    }),
  );
  const mutationLinkTarget = toLinkTarget(detail.mutationLink);

  const operationalTermItems: CanvasDLItem[] = [
    {
      k: t("contractDetail.terms.modifiableWindow", locale),
      v: formatModifiableWindow(
        locale,
        detail.operationalTerms.modifiableWindowMinutes,
      ),
    },
    {
      k: t("contractDetail.terms.proofRequirements", locale),
      v: formatProofRequirements(
        locale,
        detail.operationalTerms.proofRequirements,
      ),
    },
    {
      k: t("contractDetail.terms.waitingRule", locale),
      v: formatWaitingRule(
        locale,
        detail.operationalTerms.waitingThresholdMinutes,
      ),
    },
    {
      k: t("contractDetail.terms.noShowRule", locale),
      v: formatNoShowRule(locale, detail.operationalTerms.noShowGraceMinutes),
    },
    {
      k: t("contractDetail.terms.slaProfile", locale),
      v: formatSlaProfile(locale, detail.operationalTerms.slaProfile),
    },
    {
      k: t("contractDetail.terms.currentEffectiveVersion", locale),
      v: detail.operationalTerms.currentEffectiveVersion,
      mono: true,
    },
    {
      k: t("contractDetail.terms.partnerProgram", locale),
      v: detail.tenantLinkage.programId ?? t("common.dash", locale),
      mono: Boolean(detail.tenantLinkage.programId),
    },
    {
      k: t("contractDetail.terms.authMode", locale),
      v: detail.tenantLinkage.authMode
        ? formatOpsCodeLabel(locale, detail.tenantLinkage.authMode)
        : t("common.dash", locale),
    },
  ];

  const linkageItems: CanvasDLItem[] = [
    {
      k: t("contractDetail.linkage.tenant", locale),
      v: detail.tenantLinkage.tenantDisplayName ?? t("common.dash", locale),
      mono: Boolean(detail.tenantLinkage.tenantId),
    },
    {
      k: t("contractDetail.linkage.partnerEntry", locale),
      v: detail.tenantLinkage.partnerEntrySlug ?? t("common.dash", locale),
      mono: Boolean(detail.tenantLinkage.partnerEntrySlug),
    },
    {
      k: t("contractDetail.linkage.programId", locale),
      v: detail.tenantLinkage.programId ?? t("common.dash", locale),
      mono: Boolean(detail.tenantLinkage.programId),
    },
  ];

  const metaItems: CanvasDLItem[] = [
    {
      k: t("contractDetail.meta.contractType", locale),
      v: formatOpsCodeLabel(locale, detail.contractType),
    },
    {
      k: t("contractDetail.meta.partnerType", locale),
      v: formatOpsCodeLabel(locale, detail.partnerType),
    },
    {
      k: t("contractDetail.meta.vehicleId", locale),
      v: detail.vehicleId,
      mono: true,
    },
    {
      k: t("contractDetail.meta.operatingArea", locale),
      v: detail.operatingAreaId ?? t("common.dash", locale),
      mono: Boolean(detail.operatingAreaId),
    },
    {
      k: t("contractDetail.meta.serviceScope", locale),
      v: detail.serviceScope,
    },
    {
      k: t("contractDetail.meta.term", locale),
      v: formatDateRange(locale, detail.startAt, detail.endAt),
      mono: true,
    },
    {
      k: t("contractDetail.meta.approvedBy", locale),
      v: detail.approvedBy ?? t("common.dash", locale),
    },
    {
      k: t("contractDetail.meta.approvedAt", locale),
      v: formatDateTime(locale, detail.approvedAt),
      mono: Boolean(detail.approvedAt),
    },
  ];

  const headerSubtitle = [
    detail.counterpartyDisplayName ?? detail.partnerId ?? "—",
    formatOpsCodeLabel(locale, detail.contractType),
    formatDateRange(locale, detail.startAt, detail.endAt),
  ].join(" · ");

  const timelineItems = buildVersionTimeline(detail.versionHistory, locale);

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
            <span>{detail.contractId}</span>
            <Pill theme={theme} tone={contractStatusTone(detail.status)} dot>
              {formatOpsCodeLabel(locale, detail.status)}
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
              tier={detail.refreshTier}
              tierLabel={tierLabel}
              cadenceLabel={cadenceLabel}
              initialGeneratedAt={refresh.generatedAt}
              theme={theme}
            />
          </span>
        }
        actions={
          <ContractActionBar
            locale={locale}
            availableActions={detail.availableActions}
            actionLinks={actionLinks}
            primaryLink={{
              href: mutationLinkTarget.href,
              openMode: mutationLinkTarget.openMode,
            }}
            primaryLinkLabel={ownerAppLabel}
            theme={theme}
          />
        }
      />

      {healthBanner ? (
        <div style={{ padding: "16px 24px 0" }}>
          <Banner
            theme={theme}
            tone={healthBanner.tone}
            icon={healthBanner.icon}
            title={healthBanner.title}
            body={healthBanner.body}
          />
        </div>
      ) : null}

      {refreshBanner ? (
        <div style={{ padding: "16px 24px 0" }}>
          <Banner
            theme={theme}
            tone={refreshBanner.tone}
            icon={refreshBanner.icon}
            title={refreshBanner.title}
            body={refreshBanner.body}
          />
        </div>
      ) : null}

      {detail.pendingVersion ? (
        <div style={{ padding: "16px 24px 0" }}>
          <Banner
            theme={theme}
            tone="warn"
            icon="warn"
            title={t("contractDetail.transitionBanner.title", locale, {
              version: detail.pendingVersion.version,
            })}
            body={
              detail.pendingVersion.note ??
              t("contractDetail.transitionBanner.body", locale, {
                effective: formatDateTime(
                  locale,
                  detail.pendingVersion.effectiveAt,
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
              title={t("contractDetail.authorityRedirect.bannerTitle", locale, {
                ownerApp: ownerAppLabel,
              })}
              body={t("contractDetail.authorityRedirect.bannerBody", locale, {
                ownerApp: ownerAppLabel,
              })}
              actions={
                <Link
                  href={mutationLinkTarget.href}
                  target={
                    mutationLinkTarget.openMode === "new_tab"
                      ? "_blank"
                      : undefined
                  }
                  rel={
                    mutationLinkTarget.openMode === "new_tab"
                      ? "noopener noreferrer"
                      : undefined
                  }
                  style={actionLinkStyle("primary")}
                >
                  <CanvasIcon name="ext" size={12} />
                  <span>{ownerAppLabel}</span>
                </Link>
              }
            />
          </Card>

          <Card theme={theme} title={t("contractDetail.linkage.title", locale)}>
            <DL theme={theme} cols={1} items={linkageItems} />
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginTop: 12,
              }}
            >
              {renderReferenceLink(
                locale,
                t("contractDetail.links.openTenant", locale),
                detail.tenantLinkage.tenantLink,
              )}
              {renderReferenceLink(
                locale,
                t("contractDetail.links.openPartner", locale),
                detail.tenantLinkage.partnerLink,
              )}
            </div>
          </Card>

          <Card
            theme={theme}
            title={t("contractDetail.versionHistoryTitle", locale)}
          >
            {timelineItems.length === 0 ? (
              <EmptyStatePanel locale={locale} reason="no_data" />
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
