import Link from "next/link";
import type { CSSProperties } from "react";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getServerOpsClient } from "@/lib/api-client.server";
import {
  getQueueNavigationHref,
  getSafeQueueNavigationActions,
  hasUnresolvedMultiTaxiQueueConflict,
  isServerStatutoryQueueDenial,
  readQueueEntry,
  type OpsQueueEntryRecord,
} from "@/lib/queue-operations";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  formatQueueTimestamp,
  QueueEligibilityPill,
  QueueModePill,
  runtimeProfileLabel,
} from "../queue-view";

type QueueEntryDetailPageProps = {
  params: Promise<{
    queueEntryId: string;
  }>;
};

type QueueEntryLoadResult = {
  entry: OpsQueueEntryRecord | null;
  failed: boolean;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const bodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 14,
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 14,
  alignItems: "start",
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const actionLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 28,
  padding: "4px 9px",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  color: theme.text,
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 600,
};

function valueOrUnavailable(
  value: string | null | undefined,
  locale: Locale,
): string {
  return value?.trim() || t("common.notAvailable", locale);
}

function queueActionLabel(action: string, locale: Locale): string {
  return t(`dispatch.queue.action.${action}`, locale);
}

async function loadQueueEntry(
  queueEntryId: string,
): Promise<QueueEntryLoadResult> {
  const client = await getServerOpsClient();

  try {
    const payload = await client.get<unknown>(
      `/api/dispatch/queue/${encodeURIComponent(queueEntryId)}`,
    );
    const entry = readQueueEntry(payload);
    return {
      entry,
      failed: entry === null,
    };
  } catch {
    return {
      entry: null,
      failed: true,
    };
  }
}

export default async function QueueEntryDetailPage({
  params,
}: QueueEntryDetailPageProps) {
  const [{ queueEntryId }, locale] = await Promise.all([
    params,
    getServerLocale(),
  ]);
  const loadResult = await loadQueueEntry(queueEntryId);
  const entry = loadResult.entry;

  if (!entry) {
    return (
      <div data-screen-id="MTX-QUEUE-UI-02">
        <PageHeader
          theme={theme}
          title={t("dispatch.queue.detailTitle", locale)}
          subtitle={`MTX-QUEUE-UI-02 · ${queueEntryId}`}
          actions={
            <Link href="/dispatch/queue" style={actionLinkStyle}>
              {t("dispatch.queue.action.backToQueue", locale)}
            </Link>
          }
        />
        <div style={bodyStyle}>
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={t("dispatch.queue.unavailableTitle", locale)}
            body={t("dispatch.queue.detailUnavailableBody", locale)}
          />
        </div>
      </div>
    );
  }

  const statutoryDenial = isServerStatutoryQueueDenial(entry);
  const unresolvedConflict = hasUnresolvedMultiTaxiQueueConflict(entry);
  const platformAdminBaseUrl =
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ??
    process.env.PLATFORM_ADMIN_WEB_URL ??
    null;
  const safeActionLinks = getSafeQueueNavigationActions(entry).flatMap(
    (descriptor) => {
      const href = getQueueNavigationHref(descriptor.action, entry, {
        platformAdminBaseUrl,
      });
      return href ? [{ descriptor, href }] : [];
    },
  );

  return (
    <div data-screen-id="MTX-QUEUE-UI-02">
      <PageHeader
        theme={theme}
        title={
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <span>{t("dispatch.queue.detailTitle", locale)}</span>
            <QueueModePill entry={entry} locale={locale} theme={theme} />
          </span>
        }
        subtitle={`MTX-QUEUE-UI-02 · ${entry.queueEntryId}`}
        actions={
          <Link href="/dispatch/queue" style={actionLinkStyle}>
            {t("dispatch.queue.action.backToQueue", locale)}
          </Link>
        }
      />

      <div style={bodyStyle}>
        {statutoryDenial ? (
          <section
            data-screen-id="MTX-QUEUE-UI-03"
            aria-labelledby="queue-legal-denial-title"
            style={{
              border: `2px solid ${theme.danger}`,
              borderRadius: 14,
              overflow: "hidden",
              background: theme.surface,
            }}
          >
            <div
              style={{
                padding: "11px 16px",
                background: theme.danger,
                color: theme.invert,
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              {t("dispatch.queue.denial.legalBoundary", locale)}
            </div>
            <div style={{ padding: 18, display: "grid", gap: 12 }}>
              <div>
                <div
                  id="queue-legal-denial-title"
                  style={{
                    color: theme.text,
                    fontSize: 17,
                    fontWeight: 800,
                    lineHeight: 1.5,
                  }}
                >
                  {entry.queueMode === "taxi_stand"
                    ? t("dispatch.queue.denial.taxiStandBody", locale)
                    : t("dispatch.queue.denial.physicalRankBody", locale)}
                </div>
                <div
                  style={{
                    marginTop: 7,
                    color: theme.textMuted,
                    fontSize: 12,
                  }}
                >
                  {t("dispatch.queue.denial.serverAuthority", locale)}
                </div>
              </div>
              <Banner
                theme={theme}
                tone="info"
                icon="lock"
                body={t("dispatch.queue.denial.noBypassBody", locale)}
              />
              {entry.eligibility?.reasonCode ? (
                <div
                  style={{
                    color: theme.textDim,
                    fontFamily: theme.monoFamily,
                    fontSize: 10.5,
                  }}
                >
                  {t("dispatch.queue.denial.auditCode", locale)}:{" "}
                  {entry.eligibility.reasonCode}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {unresolvedConflict ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="lock"
            title={t("dispatch.queue.conflictTitle", locale)}
            body={t("dispatch.queue.conflictBody", locale)}
          />
        ) : null}

        <div style={detailGridStyle}>
          <Card theme={theme} title={t("dispatch.queue.runtimeTitle", locale)}>
            <DL
              theme={theme}
              cols={2}
              items={[
                {
                  k: t("dispatch.queue.column.profile", locale),
                  v: (
                    <span style={{ display: "grid", gap: 2 }}>
                      <span>
                        {runtimeProfileLabel(entry.runtimeProfileCode, locale)}
                      </span>
                      <span
                        style={{
                          color: theme.textDim,
                          fontFamily: theme.monoFamily,
                          fontSize: 11,
                        }}
                      >
                        {entry.runtimeProfileCode ?? "unknown"}
                      </span>
                    </span>
                  ),
                },
                {
                  k: t("dispatch.queue.mode", locale),
                  v: (
                    <QueueModePill
                      entry={entry}
                      locale={locale}
                      theme={theme}
                    />
                  ),
                },
                {
                  k: t("dispatch.queue.column.authorization", locale),
                  v: valueOrUnavailable(entry.operatingAuthorizationId, locale),
                  mono: true,
                },
                {
                  k: t("dispatch.queue.column.eligibility", locale),
                  v: (
                    <QueueEligibilityPill
                      entry={entry}
                      locale={locale}
                      theme={theme}
                    />
                  ),
                },
              ]}
            />
          </Card>

          <Card theme={theme} title={t("dispatch.queue.locationTitle", locale)}>
            <DL
              theme={theme}
              cols={2}
              items={[
                {
                  k: t("dispatch.queue.column.area", locale),
                  v: valueOrUnavailable(entry.serviceAreaCode, locale),
                  mono: true,
                },
                {
                  k: t("dispatch.queue.site", locale),
                  v: valueOrUnavailable(entry.siteId, locale),
                  mono: true,
                },
                {
                  k: t("dispatch.queue.column.checkedIn", locale),
                  v: formatQueueTimestamp(entry.checkedInAt, locale),
                  mono: true,
                },
                {
                  k: t("dispatch.queue.column.updated", locale),
                  v: formatQueueTimestamp(
                    entry.lastUpdatedAt ??
                      entry.checkedOutAt ??
                      entry.checkedInAt,
                    locale,
                  ),
                  mono: true,
                },
              ]}
            />
          </Card>

          <Card theme={theme} title={t("dispatch.queue.supplyTitle", locale)}>
            <DL
              theme={theme}
              cols={2}
              items={[
                {
                  k: t("dispatch.queue.column.driver", locale),
                  v: `${valueOrUnavailable(entry.driverName, locale)} · ${valueOrUnavailable(entry.driverId, locale)}`,
                },
                {
                  k: t("dispatch.queue.column.vehicle", locale),
                  v: `${valueOrUnavailable(entry.vehiclePlateNo, locale)} · ${entry.vehicleId}`,
                },
                {
                  k: t("common.status", locale),
                  v: (
                    <Pill
                      theme={theme}
                      tone={
                        entry.status === "checked_in" ? "success" : "neutral"
                      }
                      dot
                    >
                      {t(`opsCode.${entry.status}`, locale)}
                    </Pill>
                  ),
                },
                {
                  k: t("dispatch.queue.column.position", locale),
                  v: String(entry.position),
                  mono: true,
                },
              ]}
            />
          </Card>
        </div>

        <Card
          theme={theme}
          title={t("dispatch.queue.safeActionsTitle", locale)}
        >
          {safeActionLinks.length > 0 ? (
            <div style={actionRowStyle}>
              {safeActionLinks.map(({ descriptor, href }) => (
                <Link
                  key={descriptor.action}
                  href={href}
                  style={actionLinkStyle}
                >
                  {queueActionLabel(descriptor.action, locale)}
                </Link>
              ))}
            </div>
          ) : (
            <div style={{ color: theme.textMuted, fontSize: 12 }}>
              {t("dispatch.queue.noSafeActions", locale)}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
