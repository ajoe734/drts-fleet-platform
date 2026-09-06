import Link from "next/link";
import {
  EAvatar,
  EBtnContent,
  ECard,
  EEmpty,
  EPill,
  entBtnStyle,
} from "@/components/ent-kit";
import { EntProgressRail, EntRoute } from "@/components/ent-screen-bits";
import { EntPageHead } from "@/components/enterprise-shell";
import {
  adaptBookingRecordToEnterpriseBooking,
  fetchAuthoritativeEnterpriseBooking,
  fetchAuthoritativeEnterpriseBookings,
  resolveEnterpriseTripDriverContact,
} from "@/lib/dispatch-fixture-adapter";
import { getEnterpriseTenant } from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { getServerLocale } from "@/lib/server-locale";
import { type TranslationKey, t as translate } from "@/lib/translations";
import type { BookingRecord } from "@drts/contracts";

export default async function TripPage({
  searchParams,
}: {
  searchParams?: Promise<{ bookingId?: string }>;
}) {
  const locale = await getServerLocale();
  const tr = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(key, params, locale);
  const tenant = getEnterpriseTenant(locale);
  const resolvedParams = searchParams ? await searchParams : undefined;
  const requestedBookingId = resolvedParams?.bookingId?.trim();

  let targetRecord: BookingRecord | null = null;
  let isNotFound = false;

  if (requestedBookingId) {
    const lookup = await fetchAuthoritativeEnterpriseBooking(requestedBookingId);
    if (lookup.isNotFound || !lookup.booking) {
      isNotFound = true;
    } else {
      targetRecord = lookup.booking;
    }
  } else {
    const allRecords = await fetchAuthoritativeEnterpriseBookings();
    if (allRecords.length > 0) {
      targetRecord =
        allRecords.find((r) =>
          [
            "enroute_pickup",
            "arrived_pickup",
            "on_trip",
            "driver_accepted",
            "assigned",
          ].includes(r.orderStatus),
        ) ??
        allRecords.find((r) => r.status === "active") ??
        allRecords[0] ??
        null;
    }
  }

  // 1. Not found (404) condition ("404不可說可重試暫時故障；不存在就合理空/404。")
  if (isNotFound && requestedBookingId) {
    return (
      <>
        <EntPageHead
          title={tr("trip.notFound.title")}
          sub="查無此預約編號 · 非系統暫時故障"
        />
        <div
          style={{ maxWidth: 760, margin: "0 auto" }}
          data-testid="trip-not-found-container"
        >
          <ECard t={t} accent={t.warn}>
            <EEmpty
              t={t}
              icon="ban"
              title={`查無預約 (${requestedBookingId})`}
              body="權威系統查無此預約紀錄（404 Not Found），該預約可能不存在或已被取消。此狀態為確定性資源不存在，非系統暫時不穩定，請返回預約列表查看既有預約。"
              action={
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    justifyContent: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <Link
                    href="/bookings"
                    style={entBtnStyle(t, { variant: "primary" })}
                    data-testid="trip-return-list-btn"
                  >
                    <EBtnContent iconR="arrow">{tr("trip.notFound.returnList")}</EBtnContent>
                  </Link>
                  <Link
                    href="/"
                    style={entBtnStyle(t, { variant: "default" })}
                    data-testid="trip-return-home-btn"
                  >
                    <EBtnContent>{tr("trip.notFound.returnHome")}</EBtnContent>
                  </Link>
                </div>
              }
            />
          </ECard>
        </div>
      </>
    );
  }

  // 2. Empty condition ("合理空")
  if (!targetRecord) {
    return (
      <>
        <EntPageHead title={tr("trip.title")} sub={tr("trip.subtitle")} />
        <div
          style={{ maxWidth: 760, margin: "0 auto" }}
          data-testid="trip-empty-container"
        >
          <ECard t={t}>
            <EEmpty
              t={t}
              icon="car"
              title={tr("trip.empty.title")}
              body="您目前沒有正在進行或即將出發的接送行程。您可以至預約列表查看歷史紀錄，或立即為同仁建立新預約。"
              action={
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    justifyContent: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <Link
                    href="/bookings"
                    style={entBtnStyle(t, { variant: "default" })}
                    data-testid="trip-empty-to-bookings-btn"
                  >
                    <EBtnContent>{tr("trip.empty.viewAll")}</EBtnContent>
                  </Link>
                  <Link
                    href="/bookings/new"
                    style={entBtnStyle(t, { variant: "primary" })}
                    data-testid="trip-empty-to-new-btn"
                  >
                    <EBtnContent icon="plus">{tr("trip.empty.createNew")}</EBtnContent>
                  </Link>
                </div>
              }
            />
          </ECard>
        </div>
      </>
    );
  }

  // 3. Existing booking found!
  const trip = adaptBookingRecordToEnterpriseBooking(targetRecord, locale);
  const driverContact = resolveEnterpriseTripDriverContact(targetRecord);

  let activeStage = 1;
  if (trip.state === "completed") {
    activeStage = 5;
  } else if (targetRecord.orderStatus === "on_trip") {
    activeStage = 4;
  } else if (targetRecord.orderStatus === "arrived_pickup") {
    activeStage = 3;
  } else if (
    trip.state === "enroute" ||
    targetRecord.orderStatus === "enroute_pickup"
  ) {
    activeStage = 2;
  } else {
    activeStage = 1;
  }

  return (
    <>
      <EntPageHead
        title={tr("trip.title")}
        sub={`${tr("trip.subtitle")} · 預約編號 ${trip.id}`}
      />
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <ECard t={t} accent={t.primary}>
          <div style={{ padding: "6px 6px 4px" }}>
            <EntProgressRail
              t={t}
              active={activeStage}
              stages={[
                { t: tr("trip.stage.assigned"), icon: "car" },
                { t: tr("trip.stage.enroute"), icon: "route" },
                { t: tr("trip.stage.arrived"), icon: "pin" },
                { t: tr("trip.stage.inprogress"), icon: "bolt" },
                { t: tr("trip.stage.completed"), icon: "check" },
              ]}
            />
          </div>
          <div
            style={{ height: 1, background: t.lineSoft, margin: "22px 0 18px" }}
          />
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 13,
                flex: 1,
                minWidth: 220,
              }}
            >
              <EAvatar
                t={t}
                name={
                  driverContact.assigned
                    ? driverContact.name.slice(0, 1)
                    : "車"
                }
                size={50}
              />
              <div>
                <div
                  style={{ fontSize: 15.5, fontWeight: 700 }}
                  data-testid="trip-driver-name"
                >
                  {driverContact.name}
                  {driverContact.rating ? ` · ${driverContact.rating}` : ""}
                </div>
                <div
                  style={{ fontSize: 12, color: t.muted, fontFamily: t.mono }}
                  data-testid="trip-driver-vehicle"
                >
                  {driverContact.vehicle}
                </div>
                <div style={{ marginTop: 5 }}>
                  <EPill
                    t={t}
                    tone={driverContact.statusTone}
                    dot
                    data-testid="trip-driver-status"
                  >
                    {driverContact.statusDescription}
                  </EPill>
                </div>
              </div>
            </div>
            <div
              style={{
                textAlign: "center",
                background: t.primaryBg,
                border: "1px solid " + t.primaryBd,
                borderRadius: 14,
                padding: "12px 22px",
              }}
            >
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 800,
                  fontFamily: t.mono,
                  color: t.primary,
                  lineHeight: 1,
                }}
                data-testid="trip-eta-value"
              >
                {trip.etaMinutes ?? "—"}
              </div>
              <div style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>
                {trip.etaMinutes !== null
                  ? tr("trip.etaArrival")
                  : "系統估計中"}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 18 }}>
            <EntRoute
              t={t}
              from={trip.from}
              to={trip.to}
              win={trip.window}
              airportLabel={
                trip.flight ? `${trip.flight} · ${trip.terminal}` : undefined
              }
            />
          </div>
          <div
            style={{
              marginTop: 18,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {/* 1. Contact Driver Button */}
            {driverContact.assigned &&
            driverContact.phoneAuthorized &&
            driverContact.phone ? (
              <a
                href={`tel:${driverContact.phone}`}
                style={{
                  ...entBtnStyle(t, { variant: "default", block: true }),
                  textDecoration: "none",
                  flex: 1,
                  minWidth: 140,
                }}
                data-testid="trip-contact-driver-btn"
                data-action="call-driver"
                title={`撥打司機電話 ${driverContact.phone}`}
              >
                <EBtnContent icon="phone">{tr("trip.contactDriver")}</EBtnContent>
              </a>
            ) : (
              <button
                type="button"
                disabled
                style={{
                  ...entBtnStyle(t, {
                    variant: "default",
                    block: true,
                    disabled: true,
                  }),
                  flex: 1,
                  minWidth: 140,
                }}
                data-testid="trip-contact-driver-btn"
                data-action="disabled"
                title={
                  driverContact.assigned
                    ? "司機通話資訊未經授權露出，請透過企業客服轉接"
                    : "尚未指派司機，無法通話"
                }
              >
                <EBtnContent icon="phone">
                  {driverContact.assigned
                    ? "聯絡司機 (未授權露出)"
                    : "尚未指派司機"}
                </EBtnContent>
              </button>
            )}

            {/* 2. Contact Support Button */}
            <a
              href={`tel:${tenant.supportPhone}`}
              style={{
                ...entBtnStyle(t, { variant: "default", block: true }),
                textDecoration: "none",
                flex: 1,
                minWidth: 140,
              }}
              data-testid="trip-contact-support-btn"
              data-action="call-support"
              title={`撥打企業客服電話 ${tenant.supportPhone}`}
            >
              <EBtnContent icon="brief">{tr("trip.contactSupport")}</EBtnContent>
            </a>

            {/* 3. Detail Link */}
            <Link
              href={`/bookings/${encodeURIComponent(trip.id)}`}
              style={{
                ...entBtnStyle(t, { variant: "primary", block: true }),
                textDecoration: "none",
                flex: 1,
                minWidth: 140,
              }}
              data-testid="trip-detail-link"
            >
              <EBtnContent iconR="arrow">{tr("trip.detail")}</EBtnContent>
            </Link>
          </div>

          <div style={{ marginTop: 10, textAlign: "center" }}>
            <Link
              href="/help"
              style={{ fontSize: 12, color: t.primary, textDecoration: "none" }}
              data-testid="trip-help-center-link"
            >
              {tr("trip.helpCenter.link")}
            </Link>
          </div>

          {driverContact.contactNotice && (
            <div
              style={{
                fontSize: 11.5,
                color: t.warn,
                marginTop: 8,
                textAlign: "center",
              }}
              data-testid="trip-driver-notice"
            >
              {driverContact.contactNotice}
            </div>
          )}

          <div
            style={{
              fontSize: 11,
              color: t.faint,
              marginTop: 10,
              textAlign: "center",
            }}
          >
            {tr("trip.etaNote")}
          </div>
        </ECard>
      </div>
    </>
  );
}
