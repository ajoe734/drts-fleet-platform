import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";
import { getServerOpsClient } from "@/lib/api-client.server";
import {
  filterQueueEntries,
  parseQueueFilters,
  readQueueEntries,
  type OpsQueueEntryRecord,
  type QueueListPayload,
} from "@/lib/queue-operations";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  formatQueueTimestamp,
  QueueEligibilityPill,
  QueueModePill,
  runtimeProfileLabel,
} from "./queue-view";

type QueueOverviewPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type QueueLoadResult = {
  entries: OpsQueueEntryRecord[];
  failed: boolean;
};

type QueueRow = Record<string, unknown> & {
  entry: OpsQueueEntryRecord;
  entryId: ReactNode;
  driver: ReactNode;
  vehicle: ReactNode;
  profile: ReactNode;
  mode: ReactNode;
  site: ReactNode;
  area: ReactNode;
  authorization: ReactNode;
  eligibility: ReactNode;
  checkedIn: ReactNode;
  updated: ReactNode;
  action: ReactNode;
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

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
  alignItems: "end",
};

const controlStyle: CSSProperties = {
  width: "100%",
  minHeight: 34,
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  color: theme.text,
  padding: "6px 9px",
  fontFamily: theme.fontFamily,
  fontSize: 12,
  boxSizing: "border-box",
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

async function loadQueueEntries(): Promise<QueueLoadResult> {
  const client = await getServerOpsClient();

  try {
    const payload = await client.get<QueueListPayload>("/api/dispatch/queue");
    return {
      entries: readQueueEntries(payload),
      failed: false,
    };
  } catch {
    return {
      entries: [],
      failed: true,
    };
  }
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span
        style={{
          color: theme.textMuted,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

export default async function QueueOverviewPage({
  searchParams,
}: QueueOverviewPageProps) {
  const [locale, params, loadResult] = await Promise.all([
    getServerLocale(),
    searchParams ?? Promise.resolve({}),
    loadQueueEntries(),
  ]);
  const filters = parseQueueFilters(params);
  const entries = filterQueueEntries(loadResult.entries, filters);

  const rows: QueueRow[] = entries.map((entry) => ({
    entry,
    entryId: (
      <span style={{ display: "grid", gap: 2 }}>
        <span style={{ fontFamily: theme.monoFamily }}>
          {entry.queueEntryId}
        </span>
        <span style={{ color: theme.textDim }}>
          {t(`opsCode.${entry.status}`, locale)}
        </span>
      </span>
    ),
    driver: (
      <span style={{ display: "grid", gap: 2 }}>
        <span style={{ fontWeight: 650 }}>
          {valueOrUnavailable(entry.driverName, locale)}
        </span>
        <span style={{ color: theme.textDim, fontFamily: theme.monoFamily }}>
          {valueOrUnavailable(entry.driverId, locale)}
        </span>
      </span>
    ),
    vehicle: (
      <span style={{ display: "grid", gap: 2 }}>
        <span style={{ fontWeight: 650 }}>
          {valueOrUnavailable(entry.vehiclePlateNo, locale)}
        </span>
        <span style={{ color: theme.textDim, fontFamily: theme.monoFamily }}>
          {entry.vehicleId}
        </span>
      </span>
    ),
    profile: (
      <span style={{ display: "grid", gap: 2 }}>
        <span>{runtimeProfileLabel(entry.runtimeProfileCode, locale)}</span>
        <span style={{ color: theme.textDim, fontFamily: theme.monoFamily }}>
          {entry.runtimeProfileCode ?? "unknown"}
        </span>
      </span>
    ),
    mode: <QueueModePill entry={entry} locale={locale} theme={theme} />,
    site: (
      <span style={{ fontFamily: theme.monoFamily }}>
        {valueOrUnavailable(entry.siteId, locale)}
      </span>
    ),
    area: valueOrUnavailable(entry.serviceAreaCode, locale),
    authorization: (
      <span style={{ fontFamily: theme.monoFamily }}>
        {valueOrUnavailable(entry.operatingAuthorizationId, locale)}
      </span>
    ),
    eligibility: (
      <QueueEligibilityPill entry={entry} locale={locale} theme={theme} />
    ),
    checkedIn: formatQueueTimestamp(entry.checkedInAt, locale),
    updated: formatQueueTimestamp(
      entry.lastUpdatedAt ?? entry.checkedOutAt ?? entry.checkedInAt,
      locale,
    ),
    action: (
      <Link
        href={`/dispatch/queue/${encodeURIComponent(entry.queueEntryId)}`}
        style={actionLinkStyle}
      >
        {t("dispatch.queue.action.openDetail", locale)}
      </Link>
    ),
  }));

  const columns: CanvasTableColumn<QueueRow>[] = [
    {
      h: t("dispatch.queue.column.entry", locale),
      k: "entryId",
      w: 190,
    },
    {
      h: t("dispatch.queue.column.driver", locale),
      k: "driver",
      w: 170,
    },
    {
      h: t("dispatch.queue.column.vehicle", locale),
      k: "vehicle",
      w: 150,
    },
    {
      h: t("dispatch.queue.column.profile", locale),
      k: "profile",
      w: 170,
    },
    { h: t("dispatch.queue.mode", locale), k: "mode", w: 185 },
    { h: t("dispatch.queue.site", locale), k: "site", w: 170 },
    { h: t("dispatch.queue.column.area", locale), k: "area", w: 100 },
    {
      h: t("dispatch.queue.column.authorization", locale),
      k: "authorization",
      w: 180,
    },
    {
      h: t("dispatch.queue.column.eligibility", locale),
      k: "eligibility",
      w: 120,
    },
    {
      h: t("dispatch.queue.column.checkedIn", locale),
      k: "checkedIn",
      w: 170,
    },
    {
      h: t("dispatch.queue.column.updated", locale),
      k: "updated",
      w: 170,
    },
    { h: "", k: "action", w: 100 },
  ];

  return (
    <div data-screen-id="MTX-QUEUE-UI-01">
      <PageHeader
        theme={theme}
        title={t("dispatch.queue.operationsTitle", locale)}
        subtitle={`MTX-QUEUE-UI-01 · ${t("dispatch.queue.operationsSubtitle", locale)}`}
        actions={
          <Link href="/dispatch" style={actionLinkStyle}>
            {t("dispatch.queue.action.backToDispatch", locale)}
          </Link>
        }
      />

      <div style={bodyStyle}>
        {loadResult.failed ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={t("dispatch.queue.unavailableTitle", locale)}
            body={t("dispatch.queue.unavailableBody", locale)}
          />
        ) : null}

        <Card theme={theme} title={t("dispatch.queue.filtersTitle", locale)}>
          <form method="get" style={filterGridStyle}>
            <FilterField label={t("dispatch.queue.mode", locale)}>
              <select
                name="mode"
                defaultValue={filters.mode}
                style={controlStyle}
              >
                <option value="all">{t("common.all", locale)}</option>
                <option value="virtual_matching">
                  {t("dispatch.queue.virtualMatchingText", locale)}
                </option>
                <option value="physical_rank">
                  {t("dispatch.queue.physicalRankText", locale)}
                </option>
                <option value="taxi_stand">
                  {t("dispatch.queue.taxiStandText", locale)}
                </option>
              </select>
            </FilterField>
            <FilterField label={t("dispatch.queue.column.profile", locale)}>
              <select
                name="profile"
                defaultValue={filters.profile}
                style={controlStyle}
              >
                <option value="all">{t("common.all", locale)}</option>
                <option value="multi_taxi_direct">
                  {t("opsCode.multi_taxi_direct", locale)}
                </option>
                <option value="ordinary_taxi">
                  {t("opsCode.ordinary_taxi", locale)}
                </option>
                <option value="business_dispatch">
                  {t("opsCode.business_dispatch", locale)}
                </option>
              </select>
            </FilterField>
            <FilterField label={t("dispatch.queue.column.area", locale)}>
              <input
                name="area"
                defaultValue={filters.area}
                style={controlStyle}
              />
            </FilterField>
            <FilterField label={t("dispatch.queue.site", locale)}>
              <input
                name="site"
                defaultValue={filters.site}
                style={controlStyle}
              />
            </FilterField>
            <FilterField label={t("dispatch.queue.column.eligibility", locale)}>
              <select
                name="eligibility"
                defaultValue={filters.eligibility}
                style={controlStyle}
              >
                <option value="all">{t("common.all", locale)}</option>
                <option value="eligible">
                  {t("dispatch.queue.eligibility.eligible", locale)}
                </option>
                <option value="denied">
                  {t("dispatch.queue.eligibility.denied", locale)}
                </option>
                <option value="unknown">
                  {t("dispatch.queue.eligibility.unknown", locale)}
                </option>
              </select>
            </FilterField>
            <FilterField label={t("dispatch.queue.filter.search", locale)}>
              <input
                name="q"
                defaultValue={filters.query}
                style={controlStyle}
              />
            </FilterField>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" style={actionLinkStyle}>
                {t("dispatch.queue.action.applyFilters", locale)}
              </button>
              <Link href="/dispatch/queue" style={actionLinkStyle}>
                {t("common.clear", locale)}
              </Link>
            </div>
          </form>
        </Card>

        <Card
          theme={theme}
          padding={0}
          title={
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              {t("dispatch.queue.resultsTitle", locale)}
              <Pill theme={theme} tone="neutral">
                {entries.length}
              </Pill>
            </span>
          }
        >
          {!loadResult.failed && rows.length > 0 ? (
            <Table theme={theme} columns={columns} rows={rows} />
          ) : !loadResult.failed ? (
            <div
              style={{
                padding: 24,
                color: theme.textMuted,
                textAlign: "center",
              }}
            >
              {t("dispatch.queue.emptyBody", locale)}
            </div>
          ) : (
            <div style={{ padding: 24, color: theme.textMuted }}>
              {t("dispatch.queue.readOnlyUnavailable", locale)}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
