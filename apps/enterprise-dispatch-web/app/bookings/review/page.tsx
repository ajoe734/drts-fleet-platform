import Link from "next/link";
import { BookingSubmitButton } from "@/components/booking-submit-button";
import {
  EBanner,
  EBtnContent,
  ECard,
  EIcon,
  EPill,
  ERow,
  EStepper,
  entBtnStyle,
} from "@/components/ent-kit";
import { EntParty, EntRoute } from "@/components/ent-screen-bits";
import { EntPageHead } from "@/components/enterprise-shell";
import {
  enterpriseDriver,
  getEnterpriseBookingDraft,
} from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { getServerLocale } from "@/lib/server-locale";
import { type TranslationKey, t as translate } from "@/lib/translations";

export default async function ReviewBookingPage() {
  const locale = await getServerLocale();
  const tr = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(key, params, locale);
  const draft = getEnterpriseBookingDraft(locale);

  return (
    <>
      <EntPageHead
        back={tr("review.back")}
        title={tr("review.title")}
        sub={tr("review.subtitle")}
      />
      <div style={{ marginBottom: 20 }}>
        <EStepper
          t={t}
          steps={[
            tr("new.step.fill"),
            tr("new.step.confirm"),
            tr("new.step.submit"),
          ]}
          active={1}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.1fr",
          gap: 18,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ECard
            t={t}
            accent={t.primary}
            title={tr("review.card.approval")}
            sub={tr("card.sub.costOwnershipApproval")}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                background: t.primaryBg,
                border: "1px solid " + t.primaryBd,
                borderRadius: 12,
                marginBottom: 14,
              }}
            >
              <span style={{ color: t.primary }}>
                <EIcon name="building" size={22} />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {draft.costCenter}
                </div>
                <div style={{ fontSize: 12, color: t.muted, marginTop: 1 }}>
                  {tr("review.approval.costNote", {
                    remain: "NT$ 31,000 / 60,000",
                  })}
                </div>
              </div>
              <EPill t={t} tone="success" dot>
                {tr("new.check.valid")}
              </EPill>
            </div>
            <ERow
              t={t}
              k={tr("new.check.fare")}
              v={tr("new.check.fareValue")}
              mono
            />
            <ERow
              t={t}
              k={tr("review.approval.quotaImpact")}
              v={tr("review.approval.quotaImpactValue")}
            />
            <ERow
              t={t}
              k={tr("new.policy.approval")}
              v={
                <EPill t={t} tone="warn" dot>
                  {tr("review.approval.needs")}
                </EPill>
              }
              last
            />
            <div style={{ marginTop: 12 }}>
              <EBanner
                t={t}
                tone="warn"
                icon="shield"
                title={tr("review.banner.title")}
                body={tr("review.banner.body")}
              />
            </div>
          </ECard>

          <ECard
            t={t}
            title={tr("review.card.summary")}
            sub={tr("card.sub.passengerVsBookedBy")}
          >
            <EntParty
              t={t}
              passenger={draft.passenger}
              passengerLabel={tr("party.passenger")}
              subline={
                <div
                  style={{
                    fontSize: 12,
                    color: t.warn,
                    marginTop: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <EIcon name="users" size={13} />
                  {tr("party.delegate", { name: draft.bookedBy })}
                </div>
              }
            />
            <div
              style={{
                marginTop: 14,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div
                style={{
                  background: t.surfaceLo,
                  border: "1px solid " + t.line,
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 11, color: t.muted, marginBottom: 3 }}>
                  {tr("review.summary.contact")}
                </div>
                <div
                  style={{ fontSize: 13, fontWeight: 600, fontFamily: t.mono }}
                >
                  {draft.onsiteContact}
                </div>
              </div>
              <div
                style={{
                  background: t.surfaceLo,
                  border: "1px solid " + t.line,
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 11, color: t.muted, marginBottom: 3 }}>
                  {tr("review.summary.placard")}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {enterpriseDriver.placard}
                </div>
              </div>
            </div>
          </ECard>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ECard
            t={t}
            title={tr("detail.card.trip")}
            sub={tr("card.sub.trip")}
          >
            <EntRoute
              t={t}
              from={draft.pickup}
              to={draft.dropoff}
              win={draft.reservationWindow}
              airportLabel={`${draft.flight} · ${draft.terminal}`}
            />
            <div style={{ marginTop: 16 }}>
              <ERow t={t} k={tr("new.policy.vehicle")} v={draft.vehicle} />
              <ERow t={t} k={tr("new.airport.luggage")} v={draft.luggage} />
              <ERow t={t} k={tr("new.field.notes")} v={draft.notes} last />
            </div>
          </ECard>
          <ECard
            t={t}
            title={tr("new.card.policy")}
            sub={tr("card.sub.enterprisePolicy")}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  gap: 9,
                  fontSize: 12.5,
                  color: t.ink2,
                  lineHeight: 1.5,
                }}
              >
                <EIcon
                  name="clock"
                  size={15}
                  style={{ color: t.muted, flexShrink: 0 }}
                />
                {tr("review.policy.cancel")}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 9,
                  fontSize: 12.5,
                  color: t.ink2,
                  lineHeight: 1.5,
                }}
              >
                <EIcon
                  name="info"
                  size={15}
                  style={{ color: t.muted, flexShrink: 0 }}
                />
                {tr("review.policy.command")}
              </div>
            </div>
          </ECard>
          <div style={{ display: "flex", gap: 12 }}>
            <Link
              href="/bookings/new"
              style={entBtnStyle(t, { variant: "default", block: true })}
            >
              <EBtnContent>{tr("review.back")}</EBtnContent>
            </Link>
            <BookingSubmitButton />
          </div>
        </div>
      </div>
    </>
  );
}
