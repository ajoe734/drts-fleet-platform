import { BRAND_TEMPLATES } from "@drts/ui-tokens";
import { DataTable, Td, Tr, CanvasPill } from "@drts/ui-web";
import type { CSSProperties } from "react";
import Link from "next/link";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import {
  bookingPeriods,
  bookingPrograms,
  filterBookings,
  type BookingDirection,
  type BookingState,
} from "@/lib/bookings";
import { t } from "@/lib/translations";

const issuerBrand = BRAND_TEMPLATES.CTBC;

const bookingPillTone: Record<
  BookingState,
  "info" | "warn" | "success" | "danger"
> = {
  assigned: "info",
  en_route: "warn",
  completed: "success",
  cancelled: "danger",
};

const directionLabelKey: Record<
  BookingDirection,
  "bookings.direction.outbound" | "bookings.direction.inbound"
> = {
  outbound: "bookings.direction.outbound",
  inbound: "bookings.direction.inbound",
};

const stateLabelKey: Record<
  BookingState,
  | "bookings.state.assigned"
  | "bookings.state.en_route"
  | "bookings.state.completed"
  | "bookings.state.cancelled"
> = {
  assigned: "bookings.state.assigned",
  en_route: "bookings.state.en_route",
  completed: "bookings.state.completed",
  cancelled: "bookings.state.cancelled",
};

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatPeriod(period: string) {
  return `${period.slice(0, 4)} / ${period.slice(5, 7)}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const programCode = one(resolvedSearchParams.program);
  const direction = one(resolvedSearchParams.direction) as
    | BookingDirection
    | undefined;
  const state = one(resolvedSearchParams.state) as BookingState | undefined;
  const period = one(resolvedSearchParams.period);
  const cardholder = one(resolvedSearchParams.cardholder);
  const filters = {
    ...(programCode ? { programCode } : {}),
    ...(direction ? { direction } : {}),
    ...(state ? { state } : {}),
    ...(period ? { period } : {}),
    ...(cardholder ? { cardholder } : {}),
  };
  const bookings = filterBookings(filters);
  const activeCount = bookings.filter(
    (item) => item.state === "assigned" || item.state === "en_route",
  ).length;
  const completedCount = bookings.filter(
    (item) => item.state === "completed",
  ).length;
  const currentPeriod = filters.period ?? bookingPeriods[0] ?? "2026-06";

  return (
    <div
      className="page-shell bank-bookings-page"
      style={
        {
          "--issuer-primary": issuerBrand.primary,
          "--issuer-primary-dark": issuerBrand.primaryDark,
          "--issuer-accent": issuerBrand.accent,
          "--issuer-soft": issuerBrand.tokens.dark.theme.accentSoft,
        } as CSSProperties
      }
    >
      <PageHero
        eyebrow={t("bookings.eyebrow")}
        title={
          <span className="bank-title-block">
            {t("bookings.title")}
            <span className="issuer-chip">
              {issuerBrand.bankName} · {issuerBrand.programName}
            </span>
          </span>
        }
        description={t("bookings.purpose")}
      />

      <section className="issuer-strip">
        <div>
          <span className="eyebrow">{t("bookings.scopeLabel")}</span>
          <strong>{t("bookings.scopeValue")}</strong>
        </div>
        <div>
          <span className="eyebrow">{t("bookings.periodLabel")}</span>
          <strong>{formatPeriod(currentPeriod)}</strong>
        </div>
        <div>
          <span className="eyebrow">{t("bookings.maskingLabel")}</span>
          <strong>{t("bookings.maskingValue")}</strong>
        </div>
      </section>

      <CalloutPanel
        title={t("bookings.readonlyTitle")}
        description={t("bookings.readonlyBody")}
      />

      <section className="surface-card bookings-filter-card">
        <div className="bank-section-head">
          <div>
            <span className="surface-kicker">
              {t("bookings.filters.kicker")}
            </span>
            <h3>{t("bookings.filters.title")}</h3>
            <p>{t("bookings.filters.description")}</p>
          </div>
          <a className="filters-reset" href="/bookings">
            {t("bookings.filters.reset")}
          </a>
        </div>

        <form className="filters-form" method="get">
          <label className="filter-field">
            <span>{t("bookings.filters.program")}</span>
            <select name="program" defaultValue={filters.programCode ?? ""}>
              <option value="">{t("common.all")}</option>
              {bookingPrograms.map((program) => (
                <option key={program.code} value={program.code}>
                  {program.label}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>{t("bookings.filters.direction")}</span>
            <select name="direction" defaultValue={filters.direction ?? ""}>
              <option value="">{t("common.all")}</option>
              <option value="outbound">{t(directionLabelKey.outbound)}</option>
              <option value="inbound">{t(directionLabelKey.inbound)}</option>
            </select>
          </label>

          <label className="filter-field">
            <span>{t("bookings.filters.state")}</span>
            <select name="state" defaultValue={filters.state ?? ""}>
              <option value="">{t("common.all")}</option>
              <option value="assigned">{t(stateLabelKey.assigned)}</option>
              <option value="en_route">{t(stateLabelKey.en_route)}</option>
              <option value="completed">{t(stateLabelKey.completed)}</option>
              <option value="cancelled">{t(stateLabelKey.cancelled)}</option>
            </select>
          </label>

          <label className="filter-field">
            <span>{t("bookings.filters.period")}</span>
            <select name="period" defaultValue={filters.period ?? ""}>
              <option value="">{t("common.all")}</option>
              {bookingPeriods.map((period) => (
                <option key={period} value={period}>
                  {formatPeriod(period)}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>{t("bookings.filters.cardholder")}</span>
            <input
              name="cardholder"
              defaultValue={filters.cardholder ?? ""}
              placeholder={t("bookings.filters.cardholderPlaceholder")}
            />
          </label>

          <button className="filters-submit" type="submit">
            {t("bookings.filters.apply")}
          </button>
        </form>
      </section>

      <section className="surface-grid">
        <SurfaceCard
          kicker={t("bookings.metrics.kicker")}
          title={String(bookings.length)}
          description={t("bookings.metrics.total")}
        />
        <SurfaceCard
          kicker={t("bookings.metrics.kicker")}
          title={String(activeCount)}
          description={t("bookings.metrics.active")}
        />
        <SurfaceCard
          kicker={t("bookings.metrics.kicker")}
          title={String(completedCount)}
          description={t("bookings.metrics.completed")}
        />
      </section>

      <section className="surface-card bookings-table-card">
        <div className="bank-section-head">
          <div>
            <span className="surface-kicker">{t("bookings.table.kicker")}</span>
            <h3>{t("bookings.table.title")}</h3>
            <p>{t("bookings.table.description")}</p>
          </div>
        </div>

        <DataTable
          density="compact"
          tone="tenant"
          minWidth={1180}
          empty={t("bookings.empty")}
          columns={[
            { label: t("bookings.columns.order"), width: "136px" },
            { label: t("bookings.columns.cardholder"), width: "138px" },
            { label: t("bookings.columns.program"), width: "176px" },
            { label: t("bookings.columns.direction"), width: "96px" },
            { label: t("bookings.columns.flight"), width: "124px" },
            { label: t("bookings.columns.route"), width: "260px" },
            { label: t("bookings.columns.window"), width: "150px" },
            { label: t("bookings.columns.state"), width: "108px" },
            { label: t("bookings.columns.benefit"), width: "136px" },
          ]}
        >
          {bookings.map((item) => (
            <Tr key={item.orderId}>
              <Td mono>
                <div className="cell-stack">
                  <Link
                    className="text-link"
                    href={`/bookings/${item.orderId}`}
                  >
                    {item.orderNo}
                  </Link>
                  <span>{item.orderId}</span>
                </div>
              </Td>
              <Td mono>{item.cardholderRefMasked}</Td>
              <Td>
                <div className="cell-stack">
                  <strong>{item.programLabel}</strong>
                  <span>{item.programCode}</span>
                </div>
              </Td>
              <Td>{t(directionLabelKey[item.direction])}</Td>
              <Td>
                <div className="cell-stack">
                  <strong>{item.flightNo}</strong>
                  <span>{item.terminal}</span>
                </div>
              </Td>
              <Td>
                <div className="cell-stack">
                  <strong>{item.pickupLabel}</strong>
                  <span>{item.dropoffLabel}</span>
                </div>
              </Td>
              <Td mono>{formatDateTime(item.scheduledAt)}</Td>
              <Td>
                <CanvasPill tone={bookingPillTone[item.state]} dot>
                  {t(stateLabelKey[item.state])}
                </CanvasPill>
              </Td>
              <Td mono>{item.benefitReferenceMasked}</Td>
            </Tr>
          ))}
        </DataTable>
      </section>
    </div>
  );
}
