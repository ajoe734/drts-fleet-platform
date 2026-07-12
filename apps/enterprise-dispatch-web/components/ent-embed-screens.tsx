// ent-embed-screens.tsx — S2 App-embed compact booking flow.
// "同一套 page composition,僅外殼密度不同 (VQ-1)": same content as the S1 web
// screens, reflowed single-column inside the compact phone webview chrome.

import Link from "next/link";
import type { ReactNode } from "react";
import {
  EBanner,
  EBtnContent,
  ECard,
  EField,
  EIcon,
  EInput,
  EPill,
  ERow,
  EStepper,
  entBtnStyle,
  type EBtnVariant,
} from "@/components/ent-kit";
import {
  EntParty,
  EntProgressRail,
  EntRoute,
} from "@/components/ent-screen-bits";
import { EnterpriseEmbedShell } from "@/components/enterprise-shell";
import {
  enterpriseDriver,
  enterpriseQuotaSummary,
  getBookingStateMeta,
  getEnterpriseBooking,
  getEnterpriseBookingDraft,
  getEnterpriseBookings,
  getEnterpriseTenant,
  getEnterpriseUser,
} from "@/lib/enterprise-fixtures";
import { enterpriseThemeCompact as tc } from "@/lib/enterprise-theme";
import {
  type Locale,
  type TranslationKey,
  t as translate,
} from "@/lib/translations";

function makeTr(locale: Locale) {
  return (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(key, params, locale);
}

const pageGap = {
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 13,
} as const;

function FootLink({
  href,
  variant = "primary",
  icon,
  iconR,
  size = "md",
  children,
}: {
  href: string;
  variant?: EBtnVariant;
  icon?: string;
  iconR?: string;
  size?: "md" | "sm";
  children: ReactNode;
}) {
  return (
    <Link href={href} style={entBtnStyle(tc, { variant, block: true, size })}>
      <EBtnContent icon={icon} iconR={iconR} size={size}>
        {children}
      </EBtnContent>
    </Link>
  );
}

// ── 1. home — 嗨,要去哪裡 ─────────────────────────────────────────────────────
export function EmbedHome({ locale }: { locale: Locale }) {
  const tr = makeTr(locale);
  const bookings = getEnterpriseBookings(locale);
  const stateMeta = getBookingStateMeta(locale);
  const user = getEnterpriseUser(locale);
  const tenant = getEnterpriseTenant(locale);
  const active = bookings.find(
    (b) => b.state === "enroute" || b.state === "assigned",
  );
  const upcoming = bookings
    .filter((b) =>
      ["assigned", "enroute", "approval", "reserved"].includes(b.state),
    )
    .slice(0, 2);
  return (
    <EnterpriseEmbedShell
      state="live"
      footer={
        <FootLink href="/embed/new" icon="plus">
          {tr("home.cta.create")}
        </FootLink>
      }
    >
      <div style={pageGap}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>
            {tr("home.title", { name: user.name })}
          </div>
          <div style={{ fontSize: 12.5, color: tc.muted, marginTop: 4 }}>
            {tr("home.subtitle", { tenant: tenant.name })}
          </div>
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <div
            style={{
              background: tc.surface,
              border: "1px solid " + tc.line,
              borderRadius: tc.radius,
              padding: 13,
            }}
          >
            <div style={{ fontSize: 11, color: tc.muted, fontWeight: 600 }}>
              {tr("home.kpi.quota")}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                fontFamily: tc.mono,
                color: tc.ink,
                marginTop: 3,
              }}
            >
              {enterpriseQuotaSummary.rides}
            </div>
          </div>
          <div
            style={{
              background: tc.surface,
              border: "1px solid " + tc.line,
              borderRadius: tc.radius,
              padding: 13,
            }}
          >
            <div style={{ fontSize: 11, color: tc.muted, fontWeight: 600 }}>
              {tr("home.kpi.approval")}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                fontFamily: tc.mono,
                color: tc.warn,
                marginTop: 3,
              }}
            >
              {tr("home.kpi.approvalValue")}
            </div>
          </div>
        </div>
        {active && (
          <ECard
            t={tc}
            accent={tc.primary}
            title={tr("home.activeTrip.title")}
            sub={tr("home.activeTrip.sub")}
          >
            <EntParty
              t={tc}
              passenger={active.passenger}
              passengerLabel={tr("party.passenger")}
              compact
              subline={
                active.self ? (
                  <div style={{ fontSize: 12, color: tc.muted, marginTop: 1 }}>
                    {tr("party.self")}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: tc.warn, marginTop: 1 }}>
                    {tr("party.delegate", { name: active.bookedBy })}
                  </div>
                )
              }
            />
            <div
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <EPill t={tc} tone={stateMeta[active.state].tone} dot>
                {stateMeta[active.state].label}
              </EPill>
              <span style={{ fontSize: 12, color: tc.muted }}>
                <b
                  style={{
                    fontFamily: tc.mono,
                    color: tc.primary,
                    fontSize: 16,
                  }}
                >
                  {active.etaMinutes ?? "—"}
                </b>{" "}
                {tr("home.activeTrip.etaSuffix")}
              </span>
            </div>
            <div style={{ marginTop: 12 }}>
              <Link
                href="/embed/trip"
                style={entBtnStyle(tc, {
                  variant: "soft",
                  block: true,
                  size: "sm",
                })}
              >
                <EBtnContent iconR="arrow" size="sm">
                  {tr("home.activeTrip.cta")}
                </EBtnContent>
              </Link>
            </div>
          </ECard>
        )}
        <ECard
          t={tc}
          title={tr("home.upcoming.title")}
          sub={tr("home.upcoming.sub", { count: upcoming.length })}
          pad={0}
        >
          {upcoming.map((b, i) => (
            <Link
              key={b.id}
              href={`/embed/booking/${b.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 15px",
                borderTop: i ? "1px solid " + tc.lineSoft : "none",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {b.passenger}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: tc.muted,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {b.from} → {b.to}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 11.5,
                    fontFamily: tc.mono,
                    color: tc.ink2,
                  }}
                >
                  {b.window}
                </div>
                <div style={{ marginTop: 3 }}>
                  <EPill t={tc} tone={stateMeta[b.state].tone} dot>
                    {stateMeta[b.state].label}
                  </EPill>
                </div>
              </div>
            </Link>
          ))}
        </ECard>
      </div>
    </EnterpriseEmbedShell>
  );
}

// ── 2. new booking ───────────────────────────────────────────────────────────
export function EmbedNew({ locale }: { locale: Locale }) {
  const tr = makeTr(locale);
  const draft = getEnterpriseBookingDraft(locale);
  return (
    <EnterpriseEmbedShell
      state="live"
      footer={
        <FootLink href="/embed/review" iconR="arrow">
          {tr("new.next.review")}
        </FootLink>
      }
    >
      <div style={pageGap}>
        <EStepper
          t={tc}
          steps={[
            tr("new.step.fill"),
            tr("new.step.confirm"),
            tr("new.step.submit"),
          ]}
          active={0}
        />
        <ECard
          t={tc}
          pad={15}
          title={tr("new.field.passenger")}
          sub={tr("card.sub.passenger")}
        >
          <EField t={tc} label={tr("new.passenger.choose")} req>
            <EInput t={tc} icon="search" value={draft.passenger} />
          </EField>
        </ECard>
        <ECard
          t={tc}
          pad={15}
          title={tr("new.card.booking")}
          sub={tr("card.sub.pickupDropoff")}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <EField t={tc} label={tr("new.field.pickup")} req>
              <EInput t={tc} icon="pin" value={draft.pickup} />
            </EField>
            <EField t={tc} label={tr("new.field.dropoff")} req>
              <EInput t={tc} icon="pin" value={draft.dropoff} />
            </EField>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <EField t={tc} label={tr("new.field.window")} req>
                <EInput t={tc} icon="cal" value="06-13" mono />
              </EField>
              <EField t={tc} label=" ">
                <EInput t={tc} icon="clock" value="15:20" mono />
              </EField>
            </div>
          </div>
        </ECard>
        <ECard
          t={tc}
          pad={15}
          title={tr("new.field.costCenter")}
          sub={tr("card.sub.costCenter")}
        >
          <EInput t={tc} icon="building" value={draft.costCenter} />
        </ECard>
      </div>
    </EnterpriseEmbedShell>
  );
}

// ── 3. review ────────────────────────────────────────────────────────────────
export function EmbedReview({ locale }: { locale: Locale }) {
  const tr = makeTr(locale);
  const draft = getEnterpriseBookingDraft(locale);
  return (
    <EnterpriseEmbedShell
      state="live"
      footer={
        <FootLink href="/embed/submitted" icon="check">
          {tr("review.submit")}
        </FootLink>
      }
    >
      <div style={pageGap}>
        <EStepper
          t={tc}
          steps={[
            tr("new.step.fill"),
            tr("new.step.confirm"),
            tr("new.step.submit"),
          ]}
          active={1}
        />
        <ECard
          t={tc}
          pad={15}
          accent={tc.primary}
          title={tr("review.card.approval")}
          sub={tr("card.sub.costApproval")}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              background: tc.primaryBg,
              border: "1px solid " + tc.primaryBd,
              borderRadius: 10,
              marginBottom: 12,
            }}
          >
            <EIcon name="building" size={18} style={{ color: tc.primary }} />
            <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>
              {draft.costCenter}
            </div>
            <EPill t={tc} tone="success" dot>
              {tr("new.check.valid")}
            </EPill>
          </div>
          <ERow
            t={tc}
            k={tr("new.check.fare")}
            v={tr("new.check.fareValue")}
            mono
          />
          <ERow
            t={tc}
            k={tr("new.policy.approval")}
            v={
              <EPill t={tc} tone="warn" dot>
                {tr("review.approval.needs")}
              </EPill>
            }
            last
          />
          <div style={{ marginTop: 12 }}>
            <EBanner
              t={tc}
              tone="warn"
              icon="shield"
              body={tr("review.banner.body")}
            />
          </div>
        </ECard>
        <ECard
          t={tc}
          pad={15}
          title={tr("review.card.summary")}
          sub={tr("card.sub.passengerVsBookedBy")}
        >
          <EntParty
            t={tc}
            passenger={draft.passenger}
            passengerLabel={tr("party.passenger")}
            subline={
              <div style={{ fontSize: 12, color: tc.warn, marginTop: 1 }}>
                {tr("party.delegate", { name: draft.bookedBy })}
              </div>
            }
          />
          <div style={{ marginTop: 12 }}>
            <EntRoute
              t={tc}
              from={draft.pickup}
              to={draft.dropoff}
              win={draft.reservationWindow}
              airportLabel={`${draft.flight} · ${draft.terminal}`}
            />
          </div>
        </ECard>
      </div>
    </EnterpriseEmbedShell>
  );
}

// ── 4. submitted ─────────────────────────────────────────────────────────────
export function EmbedSubmitted({ locale }: { locale: Locale }) {
  const tr = makeTr(locale);
  const draft = getEnterpriseBookingDraft(locale);
  return (
    <EnterpriseEmbedShell
      state="warn"
      footer={
        <>
          <FootLink href="/embed/booking/EB-7K2E1D" iconR="arrow">
            {tr("submitted.bookings")}
          </FootLink>
          <FootLink href="/embed/home" variant="ghost" size="sm">
            {tr("home.cta.backHome")}
          </FootLink>
        </>
      }
    >
      <div style={pageGap}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 9,
            padding: "16px 0 4px",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              background: tc.warnBg,
              color: tc.warn,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <EIcon name="shield" size={27} />
          </div>
          <div style={{ fontSize: 16.5, fontWeight: 800 }}>
            {tr("submitted.title")}
          </div>
          <EPill t={tc} tone="warn" dot>
            {tr("submitted.subtitle")}
          </EPill>
        </div>
        <p
          style={{
            fontSize: 12.5,
            color: tc.muted,
            lineHeight: 1.6,
            textAlign: "center",
            margin: 0,
          }}
        >
          {tr("submitted.banner.body")}
        </p>
        <ECard t={tc} pad={15}>
          <ERow t={tc} k={tr("submitted.card.summary")} v="EB-7K2E1D" mono />
          <ERow
            t={tc}
            k={tr("review.card.summary")}
            v={`${draft.passenger} · ${draft.bookedBy}`}
          />
          <ERow t={tc} k={tr("new.field.costCenter")} v="CC-PRD-07" mono />
          <ERow
            t={tc}
            k={tr("submitted.summary.estimatedResult")}
            v={
              <EPill t={tc} tone="warn" dot>
                {tr("submitted.pending")}
              </EPill>
            }
            last
          />
        </ECard>
      </div>
    </EnterpriseEmbedShell>
  );
}

// ── 5. trip ──────────────────────────────────────────────────────────────────
export function EmbedTrip({ locale }: { locale: Locale }) {
  const tr = makeTr(locale);
  const bookings = getEnterpriseBookings(locale);
  const trip =
    bookings.find((b) => b.state === "enroute" || b.state === "assigned") ??
    bookings[0];
  if (!trip) return null;
  return (
    <EnterpriseEmbedShell
      state="live"
      footer={
        <FootLink href={`/embed/booking/${trip.id}`} iconR="arrow">
          {tr("trip.detail")}
        </FootLink>
      }
    >
      <div style={pageGap}>
        <ECard
          t={tc}
          pad={15}
          accent={tc.primary}
          title={tr("trip.title")}
          sub={tr("trip.subtitle")}
        >
          <div style={{ padding: "4px 0 2px" }}>
            <EntProgressRail
              t={tc}
              active={1}
              stages={[
                { t: tr("trip.stage.assigned"), icon: "car" },
                { t: tr("trip.stage.enroute"), icon: "route" },
                { t: tr("trip.stage.arrived"), icon: "pin" },
                { t: tr("trip.stage.completed"), icon: "check" },
              ]}
            />
          </div>
          <div
            style={{
              height: 1,
              background: tc.lineSoft,
              margin: "16px 0 12px",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>
                {enterpriseDriver.name}
              </div>
              <div
                style={{ fontSize: 11.5, color: tc.muted, fontFamily: tc.mono }}
              >
                {enterpriseDriver.vehicle}
              </div>
            </div>
            <div
              style={{
                textAlign: "center",
                background: tc.primaryBg,
                border: "1px solid " + tc.primaryBd,
                borderRadius: 12,
                padding: "8px 16px",
              }}
            >
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  fontFamily: tc.mono,
                  color: tc.primary,
                  lineHeight: 1,
                }}
              >
                {trip.etaMinutes ?? "—"}
              </div>
              <div style={{ fontSize: 10.5, color: tc.muted, marginTop: 2 }}>
                {tr("trip.etaArrival")}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <EntRoute
              t={tc}
              from={trip.from}
              to={trip.to}
              win={trip.window}
              airportLabel={
                trip.flight ? `${trip.flight} · ${trip.terminal}` : undefined
              }
            />
          </div>
        </ECard>
      </div>
    </EnterpriseEmbedShell>
  );
}

// ── 6. detail ────────────────────────────────────────────────────────────────
export function EmbedDetail({
  locale,
  bookingId,
}: {
  locale: Locale;
  bookingId: string;
}) {
  const tr = makeTr(locale);
  const booking =
    getEnterpriseBooking(bookingId, locale) ?? getEnterpriseBookings(locale)[0];
  if (!booking) return null;
  const stateMeta = getBookingStateMeta(locale);
  return (
    <EnterpriseEmbedShell
      state="live"
      footer={
        <FootLink href="/embed/home" variant="default" iconR="arrow">
          {tr("home.cta.backHome")}
        </FootLink>
      }
    >
      <div style={pageGap}>
        <div>
          <div style={{ fontSize: 16.5, fontWeight: 800, fontFamily: tc.mono }}>
            {booking.id}
          </div>
          <div
            style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}
          >
            <EPill t={tc} tone={stateMeta[booking.state].tone} dot>
              {stateMeta[booking.state].label}
            </EPill>
            <EPill t={tc} tone="neutral">
              {booking.passenger}
            </EPill>
          </div>
        </div>
        <ECard
          t={tc}
          pad={15}
          title={tr("detail.card.trip")}
          sub={tr("card.sub.trip")}
        >
          <EntRoute
            t={tc}
            from={booking.from}
            to={booking.to}
            win={booking.window}
            airportLabel={
              booking.flight
                ? `${booking.flight} · ${booking.terminal}`
                : undefined
            }
          />
        </ECard>
        <ECard
          t={tc}
          pad={15}
          title={tr("detail.card.cost")}
          sub={tr("card.sub.costApproval")}
        >
          <ERow t={tc} k={tr("new.field.costCenter")} v={booking.costCenter} />
          <ERow
            t={tc}
            k={tr("new.check.fare")}
            v={tr("new.check.fareValue")}
            mono
          />
          <ERow
            t={tc}
            k={tr("detail.approval")}
            v={
              <EPill t={tc} tone="success" dot>
                {tr("detail.approval.approved")}
              </EPill>
            }
            last
          />
        </ECard>
      </div>
    </EnterpriseEmbedShell>
  );
}
