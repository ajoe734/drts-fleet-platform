import Link from "next/link";
import { notFound } from "next/navigation";
import {
  EAvatar,
  EBtn,
  EBtnContent,
  ECard,
  EPill,
  ERow,
  ETimeline,
  entBtnStyle,
  type ETimelineEvent,
} from "@/components/ent-kit";
import { EntRoute } from "@/components/ent-screen-bits";
import { EntPageHead } from "@/components/enterprise-shell";
import {
  enterpriseDriver,
  getBookingStateMeta,
  getEnterpriseBooking,
} from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { getServerLocale } from "@/lib/server-locale";
import { type TranslationKey, t as translate } from "@/lib/translations";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const locale = await getServerLocale();
  const tr = (key: TranslationKey, params2?: Record<string, string | number>) =>
    translate(key, params2, locale);
  const booking = getEnterpriseBooking(bookingId, locale);
  if (!booking) {
    notFound();
  }
  const stateMeta = getBookingStateMeta(locale);
  const canEdit = booking.availableActions.includes("cancel");
  const canCancel = booking.availableActions.includes("cancel");
  const canReceipt = booking.availableActions.includes("view_receipt");

  const timeline: ETimelineEvent[] = [
    {
      at: "06-13 14:48",
      tone: "primary",
      t: tr("detail.timeline.created"),
      body: tr("detail.timeline.createdBody"),
    },
    {
      at: "06-13 14:48",
      tone: "success",
      t: tr("detail.timeline.approved"),
      body: tr("detail.timeline.approvedBody"),
    },
    {
      at: "06-13 14:50",
      tone: "success",
      t: tr("detail.timeline.accepted"),
      body: "POST /bookings/commands/create · accepted",
    },
    {
      at: "06-13 14:52",
      tone: "success",
      t: tr("detail.timeline.assigned"),
      body: tr("detail.timeline.assignedBody"),
    },
    {
      tone: "info",
      t: tr("detail.timeline.enroute"),
      body: tr("detail.timeline.enrouteBody"),
      current: true,
    },
  ];

  return (
    <>
      <EntPageHead
        back={tr("detail.back")}
        title={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 11 }}
          >
            {booking.id} · {tr("app.title")}
            <EPill t={t} tone={stateMeta[booking.state].tone} dot>
              {stateMeta[booking.state].label}
            </EPill>
          </span>
        }
        sub={`${booking.from} → ${booking.to} · ${booking.window}`}
        meta={
          <>
            <EPill t={t} tone="neutral">
              {booking.passenger}
            </EPill>
            {!booking.self && (
              <EPill t={t} tone="warn">
                {tr("party.delegate", { name: booking.bookedBy })}
              </EPill>
            )}
            <EPill t={t} tone="neutral">
              {booking.costCenter}
            </EPill>
          </>
        }
        actions={
          <>
            {canEdit && (
              <EBtn t={t} variant="default" icon="edit">
                {tr("detail.action.edit")}
              </EBtn>
            )}
            {canCancel && (
              <EBtn t={t} variant="danger" icon="ban">
                {tr("detail.action.cancel")}
              </EBtn>
            )}
            {canReceipt && (
              <Link
                href={`/receipts/${booking.id}`}
                style={entBtnStyle(t, { variant: "primary" })}
              >
                <EBtnContent icon="receipt">
                  {tr("detail.action.receipt")}
                </EBtnContent>
              </Link>
            )}
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 18,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ECard
            t={t}
            title={tr("detail.card.progress")}
            sub={tr("card.sub.timelineCrossActor")}
          >
            <ETimeline t={t} events={timeline} />
          </ECard>
          <ECard
            t={t}
            title={tr("detail.card.trip")}
            sub={tr("card.sub.trip")}
          >
            <EntRoute
              t={t}
              from={booking.from}
              to={booking.to}
              win={booking.window}
              airportLabel={
                booking.flight
                  ? `${booking.flight} · ${booking.terminal}`
                  : undefined
              }
            />
            <div
              style={{
                marginTop: 16,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0 24px",
              }}
            >
              <ERow t={t} k={tr("new.policy.vehicle")} v={booking.vehicle} />
              <ERow
                t={t}
                k={tr("new.field.contact")}
                v={booking.onsiteContact ?? "—"}
                mono
                last
              />
            </div>
          </ECard>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ECard
            t={t}
            title={tr("detail.card.driver")}
            sub={tr("card.sub.assigned")}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
              <EAvatar t={t} name="張" size={48} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {enterpriseDriver.name}
                </div>
                <div
                  style={{ fontSize: 12, color: t.muted, fontFamily: t.mono }}
                >
                  {enterpriseDriver.vehicle}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    fontFamily: t.mono,
                    color: t.primary,
                  }}
                >
                  {booking.etaMinutes ?? "—"}
                </div>
                <div style={{ fontSize: 10.5, color: t.muted }}>
                  {tr("trip.etaUnit")}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 9 }}>
              <EBtn t={t} variant="default" block icon="phone">
                {tr("trip.contactDriver")}
              </EBtn>
              <EBtn t={t} variant="default" block icon="route">
                {tr("detail.action.track")}
              </EBtn>
            </div>
          </ECard>
          <ECard
            t={t}
            title={tr("detail.card.cost")}
            sub={tr("card.sub.costApproval")}
          >
            <ERow t={t} k={tr("new.field.costCenter")} v={booking.costCenter} />
            <ERow
              t={t}
              k={tr("new.check.fare")}
              v={tr("new.check.fareValue")}
              mono
            />
            <ERow
              t={t}
              k={tr("detail.approval")}
              v={
                <EPill t={t} tone="success" dot>
                  {tr("detail.approval.approved")}
                </EPill>
              }
              last
            />
          </ECard>
          <ECard
            t={t}
            title={tr("detail.card.actions")}
            sub={tr("card.sub.availableActions")}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <EBtn
                t={t}
                variant="default"
                block
                icon="edit"
                disabled={!canEdit}
              >
                {tr("detail.action.edit")}
              </EBtn>
              <EBtn
                t={t}
                variant="danger"
                block
                icon="ban"
                disabled={!canCancel}
              >
                {tr("detail.action.cancel")}
              </EBtn>
              <EBtn
                t={t}
                variant="default"
                block
                icon="receipt"
                disabled={!canReceipt}
              >
                {tr("detail.action.receipt")}
              </EBtn>
            </div>
            <div
              style={{
                fontSize: 11,
                color: t.faint,
                marginTop: 11,
                lineHeight: 1.5,
              }}
            >
              {tr("detail.actions.note")}
            </div>
          </ECard>
        </div>
      </div>
    </>
  );
}
