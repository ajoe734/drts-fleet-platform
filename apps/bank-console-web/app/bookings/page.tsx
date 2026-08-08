import { DataTable, Td, Tr, CanvasPill } from "@drts/ui-web";
import type { CSSProperties } from "react";
import Link from "next/link";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import {
  getBankProgramSeedLabel,
  getBankTenantName,
  resolveBankDemoTenant,
  resolveLocale,
} from "@/lib/demo-tenants";
import { loadBankBookingsData } from "@/lib/bank-dev-read-models";
import { getBankConsoleSession, bankConsoleHref } from "@/lib/session";
import { tenantDisplayText } from "@/lib/tenant-display";
import {
  deriveBookingPeriods,
  filterBookingItems,
  type BookingDirection,
  type BookingState,
} from "@/lib/bookings";
import { t } from "@/lib/translations";

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

const STATE_TAB_ORDER: BookingState[] = [
  "assigned",
  "en_route",
  "completed",
  "cancelled",
];

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
  const locale = resolveLocale(resolvedSearchParams.locale);
  const tenant = resolveBankDemoTenant(resolvedSearchParams.bank);
  const session = getBankConsoleSession(
    tenant,
    locale,
    resolvedSearchParams.role,
  );
  const bookingData = await loadBankBookingsData(tenant.tenantId, session.role);
  const issuerBrand = tenant.template;
  const baseQuery = {
    bank: tenant.code,
    locale,
    role: session.role,
  };
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
  const bookings = filterBookingItems(bookingData.data.bookings, filters);
  const activeCount = bookings.filter(
    (item) => item.state === "assigned" || item.state === "en_route",
  ).length;
  const completedCount = bookings.filter(
    (item) => item.state === "completed",
  ).length;
  const bookingPeriods = deriveBookingPeriods(bookingData.data.bookings);
  const currentPeriod = filters.period ?? bookingPeriods[0] ?? "2026-06";

  // Counts for the state tabs ignore the state filter but keep every other
  // active filter, so each tab badge reflects the current scope.
  const baseFilters = {
    ...(programCode ? { programCode } : {}),
    ...(direction ? { direction } : {}),
    ...(period ? { period } : {}),
    ...(cardholder ? { cardholder } : {}),
  };
  const scopedBookings = filterBookingItems(bookingData.data.bookings, baseFilters);
  const stateTabHref = (tabState?: BookingState) => {
    const params = new URLSearchParams();
    params.set("bank", baseQuery.bank);
    params.set("locale", baseQuery.locale);
    params.set("role", baseQuery.role);
    if (programCode) params.set("program", programCode);
    if (direction) params.set("direction", direction);
    if (period) params.set("period", period);
    if (cardholder) params.set("cardholder", cardholder);
    if (tabState) params.set("state", tabState);
    return `/bookings?${params.toString()}`;
  };

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
        eyebrow={t("bookings.eyebrow", locale)}
        title={
          <span className="bank-title-block">
            {t("bookings.title", locale)}
            <span className="issuer-chip">
              {getBankTenantName(tenant, locale)} ·{" "}
              {getBankProgramSeedLabel(tenant, "premium", locale)}
            </span>
          </span>
        }
        description={t("bookings.purpose", locale)}
      />

      <section className="issuer-strip">
        <div>
          <span className="eyebrow">{t("bookings.scopeLabel", locale)}</span>
          <strong>{getBankTenantName(tenant, locale)}</strong>
        </div>
        <div>
          <span className="eyebrow">{t("bookings.periodLabel", locale)}</span>
          <strong>{formatPeriod(currentPeriod)}</strong>
        </div>
        <div>
          <span className="eyebrow">{t("bookings.maskingLabel", locale)}</span>
          <strong>{t("bookings.maskingValue", locale)}</strong>
        </div>
      </section>

      <CalloutPanel
        title={t("bookings.readonlyTitle", locale)}
        description={t("bookings.readonlyBody", locale)}
      />
      {bookingData.degradedMessage ? (
        <CalloutPanel
          title="API degraded"
          description={bookingData.degradedMessage}
          tone="warning"
        />
      ) : null}

      <nav
        aria-label={t("bookings.filters.state", locale)}
        className="users-filter-tabs"
      >
        <Link
          aria-current={!state ? "page" : undefined}
          className={`users-filter-tab${!state ? " is-active" : ""}`}
          href={stateTabHref()}
        >
          <span>{t("common.all", locale)}</span>
          <span className="users-filter-badge">{scopedBookings.length}</span>
        </Link>
        {STATE_TAB_ORDER.map((tabState) => {
          const isActive = state === tabState;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={`users-filter-tab${isActive ? " is-active" : ""}`}
              href={stateTabHref(tabState)}
              key={tabState}
            >
              <span>{t(stateLabelKey[tabState], locale)}</span>
              <span className="users-filter-badge">
                {
                  scopedBookings.filter((item) => item.state === tabState)
                    .length
                }
              </span>
            </Link>
          );
        })}
      </nav>

      <section className="surface-card bookings-filter-card">
        <div className="bank-section-head">
          <div>
            <span className="surface-kicker">
              {t("bookings.filters.kicker", locale)}
            </span>
            <h3>{t("bookings.filters.title", locale)}</h3>
            <p>{t("bookings.filters.description", locale)}</p>
          </div>
          <a
            className="filters-reset"
            href={bankConsoleHref("/bookings", tenant, locale, session.role)}
          >
            {t("bookings.filters.reset", locale)}
          </a>
        </div>

        <form className="filters-form" method="get">
          <input name="bank" type="hidden" value={baseQuery.bank} />
          <input name="locale" type="hidden" value={baseQuery.locale} />
          <input name="role" type="hidden" value={baseQuery.role} />
          <label className="filter-field">
            <span>{t("bookings.filters.program", locale)}</span>
            <select name="program" defaultValue={filters.programCode ?? ""}>
              <option value="">{t("common.all", locale)}</option>
              {bookingData.data.programs.map((program) => (
                <option key={program.code} value={program.code}>
                  {tenantDisplayText(program.label, tenant)}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>{t("bookings.filters.direction", locale)}</span>
            <select name="direction" defaultValue={filters.direction ?? ""}>
              <option value="">{t("common.all", locale)}</option>
              <option value="outbound">
                {t(directionLabelKey.outbound, locale)}
              </option>
              <option value="inbound">
                {t(directionLabelKey.inbound, locale)}
              </option>
            </select>
          </label>

          <input name="state" type="hidden" value={filters.state ?? ""} />

          <label className="filter-field">
            <span>{t("bookings.filters.period", locale)}</span>
            <select name="period" defaultValue={filters.period ?? ""}>
              <option value="">{t("common.all", locale)}</option>
              {bookingPeriods.map((period) => (
                <option key={period} value={period}>
                  {formatPeriod(period)}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>{t("bookings.filters.cardholder", locale)}</span>
            <input
              name="cardholder"
              defaultValue={filters.cardholder ?? ""}
              placeholder={t("bookings.filters.cardholderPlaceholder", locale)}
            />
          </label>

          <button className="filters-submit" type="submit">
            {t("bookings.filters.apply", locale)}
          </button>
        </form>
      </section>

      <section className="surface-grid">
        <SurfaceCard
          kicker={t("bookings.metrics.kicker", locale)}
          title={String(bookings.length)}
          description={t("bookings.metrics.total", locale)}
        />
        <SurfaceCard
          kicker={t("bookings.metrics.kicker", locale)}
          title={String(activeCount)}
          description={t("bookings.metrics.active", locale)}
        />
        <SurfaceCard
          kicker={t("bookings.metrics.kicker", locale)}
          title={String(completedCount)}
          description={t("bookings.metrics.completed", locale)}
        />
      </section>

      <section className="surface-card bookings-table-card">
        <div className="bank-section-head">
          <div>
            <span className="surface-kicker">
              {t("bookings.table.kicker", locale)}
            </span>
            <h3>{t("bookings.table.title", locale)}</h3>
            <p>{t("bookings.table.description", locale)}</p>
          </div>
        </div>

        <DataTable
          density="compact"
          tone="tenant"
          minWidth={1180}
          empty={t("bookings.empty", locale)}
          columns={[
            { label: t("bookings.columns.order", locale), width: "136px" },
            {
              label: t("bookings.columns.cardholder", locale),
              width: "138px",
            },
            { label: t("bookings.columns.program", locale), width: "176px" },
            { label: t("bookings.columns.direction", locale), width: "96px" },
            { label: t("bookings.columns.flight", locale), width: "124px" },
            { label: t("bookings.columns.route", locale), width: "260px" },
            { label: t("bookings.columns.window", locale), width: "150px" },
            { label: t("bookings.columns.state", locale), width: "108px" },
            { label: t("bookings.columns.benefit", locale), width: "136px" },
          ]}
        >
          {bookings.map((item) => (
            <Tr key={item.orderId}>
              <Td mono>
                <div className="cell-stack">
                  <Link
                    className="text-link"
                    href={bankConsoleHref(
                      `/bookings/${item.orderId}`,
                      tenant,
                      locale,
                      session.role,
                    )}
                  >
                    {item.orderNo}
                  </Link>
                  <span>{tenantDisplayText(item.orderId, tenant)}</span>
                </div>
              </Td>
              <Td mono>{item.cardholderRefMasked}</Td>
              <Td>
                <div className="cell-stack">
                  <strong>
                    {tenantDisplayText(item.programLabel, tenant)}
                  </strong>
                  <span>{item.programCode}</span>
                </div>
              </Td>
              <Td>{t(directionLabelKey[item.direction], locale)}</Td>
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
                  {t(stateLabelKey[item.state], locale)}
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
