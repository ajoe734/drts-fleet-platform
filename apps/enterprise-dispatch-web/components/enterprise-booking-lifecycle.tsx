"use client";

import type { BookingRecord } from "@drts/contracts";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  EBtnContent,
  ECard,
  EPill,
  ERow,
  entBtnStyle,
} from "@/components/ent-kit";
import { EntRoute } from "@/components/ent-screen-bits";
import { EntPageHead } from "@/components/enterprise-shell";
import { getEnterpriseDispatchTenantClient } from "@/lib/api-client";
import {
  createEnterpriseBookingDraftFromRecord,
  serializeEnterpriseBookingDraft,
} from "@/lib/enterprise-booking-draft";
import {
  enterpriseTenant,
  type BookingGatewayState,
  resolveBookingGatewayState,
  bookingGatewayHref,
} from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { useTranslation } from "@/lib/i18n";

export type GatewayState = BookingGatewayState;

export { resolveBookingGatewayState };

export function gatewayHref(error: unknown): string | null {
  return bookingGatewayHref(error);
}

function actionAllowed(record: BookingRecord, action: "edit" | "cancel") {
  const cutoff =
    action === "edit" ? record.modifiableUntil : record.cancelableUntil;
  return Boolean(
    cutoff &&
    new Date(cutoff).getTime() > Date.now() &&
    record.status !== "cancelled",
  );
}

function bookingState(record: BookingRecord) {
  if (record.status === "cancelled")
    return { label: "已取消", tone: "neutral" as const };
  if (record.orderStatus === "no_supply")
    return { label: "暫無可派車輛", tone: "danger" as const };
  if (record.approvalState === "pending")
    return { label: "待審批", tone: "warn" as const };
  return {
    label: record.orderStatus ?? record.status,
    tone: "primary" as const,
  };
}

function errorContent(
  state: GatewayState,
  tr: ReturnType<typeof useTranslation>["t"],
) {
  if (state === "not-found") {
    const isZh = tr("bookingLifecycle.history.empty") === "目前沒有預約。";
    return (
      <ECard t={t} accent={t.muted}>
        <div
          data-testid="enterprise-booking-not-found"
          data-testid-api-state="not-found"
        >
          <strong
            style={{
              display: "block",
              fontSize: 16,
              marginBottom: 8,
              color: t.ink,
            }}
          >
            {isZh ? "查無此預約（404）" : "Booking not found (404)"}
          </strong>
          <p style={{ color: t.muted, lineHeight: 1.6, marginBottom: 14 }}>
            {isZh
              ? "找不到指定的預約記錄。此預約可能不存在或已被刪除，不可作為暫時故障重試。"
              : "The requested booking does not exist or has been removed. This is not a temporary system fault and should not be retried."}
          </p>
          <Link href="/bookings" style={entBtnStyle(t, { variant: "default" })}>
            <EBtnContent iconR="arrow">
              {isZh ? "返回預約列表" : "Return to bookings"}
            </EBtnContent>
          </Link>
        </div>
      </ECard>
    );
  }

  const href = `/${state}`;
  return (
    <ECard t={t} accent={state === "no-supply" ? t.danger : t.warn}>
      <div data-testid="enterprise-booking-api-state">
        <strong>
          {state === "quota-blocked"
            ? "額度或政策限制"
            : state === "no-supply"
              ? "目前無法派車"
              : "服務暫時不穩定"}
        </strong>
        <p style={{ color: t.muted, lineHeight: 1.6 }}>
          {tr("bookingLifecycle.gateway.body")}
        </p>
        <Link href={href} style={entBtnStyle(t, { variant: "default" })}>
          <EBtnContent>{tr("bookingLifecycle.gateway.action")}</EBtnContent>
        </Link>
      </div>
    </ECard>
  );
}

export function EnterpriseBookingHistory() {
  const { t: tr } = useTranslation();
  const [bookings, setBookings] = useState<BookingRecord[] | null>(null);
  const [state, setState] = useState<GatewayState | null>(null);

  useEffect(() => {
    getEnterpriseDispatchTenantClient(enterpriseTenant.id)
      .listBookings()
      .then(setBookings)
      .catch((error: unknown) =>
        setState(resolveBookingGatewayState(error)),
      );
  }, []);

  if (state) return errorContent(state, tr);

  return (
    <>
      <EntPageHead
        title={tr("bookings.title")}
        sub="從 tenant booking API 讀取；不以 fixture 補值"
        actions={
          <Link
            href="/bookings/new"
            style={entBtnStyle(t, { variant: "primary" })}
          >
            <EBtnContent icon="plus">{tr("bookings.create")}</EBtnContent>
          </Link>
        }
      />
      <ECard t={t} pad={0}>
        {bookings === null ? (
          <div style={{ padding: 18, color: t.muted }}>
            {tr("bookingLifecycle.history.loading")}
          </div>
        ) : bookings.length === 0 ? (
          <div style={{ padding: 18, color: t.muted }}>
            {tr("bookingLifecycle.history.empty")}
          </div>
        ) : (
          bookings.map((booking, index) => {
            const display = bookingState(booking);
            return (
              <Link
                key={booking.bookingId}
                href={`/bookings/${encodeURIComponent(booking.bookingId)}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr auto",
                  gap: 14,
                  alignItems: "center",
                  padding: "14px 18px",
                  borderTop: index ? `1px solid ${t.lineSoft}` : "none",
                  textDecoration: "none",
                  color: t.ink,
                }}
              >
                <span style={{ fontFamily: t.mono, color: t.primary }}>
                  {booking.bookingId}
                </span>
                <span>
                  <strong>{booking.passenger.name}</strong>
                  <small style={{ display: "block", color: t.muted }}>
                    {booking.pickup.address} → {booking.dropoff.address}
                  </small>
                </span>
                <EPill t={t} tone={display.tone} dot>
                  {display.label}
                </EPill>
              </Link>
            );
          })
        )}
      </ECard>
    </>
  );
}

export function EnterpriseBookingDetail({ bookingId }: { bookingId: string }) {
  const { t: tr } = useTranslation();
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [state, setState] = useState<GatewayState | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    getEnterpriseDispatchTenantClient(enterpriseTenant.id)
      .getBooking(bookingId)
      .then(setBooking)
      .catch((error: unknown) =>
        setState(resolveBookingGatewayState(error)),
      );
  }, [bookingId]);

  const editHref = useMemo(
    () =>
      booking
        ? `/bookings/new?${serializeEnterpriseBookingDraft(createEnterpriseBookingDraftFromRecord(booking)).toString()}&bookingId=${encodeURIComponent(booking.bookingId)}`
        : "#",
    [booking],
  );
  if (state) return errorContent(state, tr);
  if (!booking)
    return (
      <ECard t={t}>
        <span style={{ color: t.muted }}>
          {tr("bookingLifecycle.detail.loading")}
        </span>
      </ECard>
    );
  const display = bookingState(booking);
  const canEdit = actionAllowed(booking, "edit");
  const canCancel = actionAllowed(booking, "cancel");

  async function cancel() {
    if (!canCancel || isCancelling) return;
    const bookingToCancel = booking;
    if (!bookingToCancel) return;
    setIsCancelling(true);
    try {
      const result = await getEnterpriseDispatchTenantClient(
        enterpriseTenant.id,
      ).cancelBooking(bookingToCancel.bookingId, {
        reason: "Cancelled from Enterprise Dispatch",
      });
      setBooking(result);
    } catch (error) {
      setState(resolveBookingGatewayState(error));
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <>
      <EntPageHead
        back="我的預約"
        title={
          <span>
            {booking.bookingId} {tr("bookingLifecycle.detail.enterpriseTag")}{" "}
            <EPill t={t} tone={display.tone} dot>
              {display.label}
            </EPill>
          </span>
        }
        sub={`${booking.pickup.address} → ${booking.dropoff.address}`}
        actions={
          <>
            <Link
              href={editHref}
              aria-disabled={!canEdit}
              style={entBtnStyle(t, { variant: "default", disabled: !canEdit })}
            >
              <EBtnContent icon="edit">
                {tr("bookingLifecycle.detail.edit")}
              </EBtnContent>
            </Link>
            <button
              type="button"
              data-testid="enterprise-booking-cancel"
              data-drt-operation="enterprise-cancel"
              disabled={!canCancel || isCancelling}
              onClick={cancel}
              style={entBtnStyle(t, {
                variant: "danger",
                disabled: !canCancel || isCancelling,
              })}
            >
              <EBtnContent icon="ban">
                {isCancelling ? "取消中…" : "取消預約"}
              </EBtnContent>
            </button>
          </>
        }
      />
      <div
        style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }}
      >
        <ECard
          t={t}
          title={tr("bookingLifecycle.detail.tripTitle")}
          sub="tenant booking record"
        >
          <EntRoute
            t={t}
            from={booking.pickup.address}
            to={booking.dropoff.address}
            win={booking.reservationWindowStart}
            airportLabel={
              booking.flightNo
                ? `${booking.flightNo} · ${booking.terminal ?? ""}`
                : undefined
            }
          />
        </ECard>
        <ECard
          t={t}
          title={tr("bookingLifecycle.detail.contactTitle")}
          sub="persisted values"
        >
          <ERow t={t} k="乘客" v={booking.passenger.name} />
          <ERow t={t} k="下單人" v={booking.bookedBy?.name ?? "—"} />
          <ERow t={t} k="成本中心" v={booking.costCenter ?? "—"} mono />
          <ERow
            t={t}
            k="現場聯絡"
            v={booking.onsiteContact?.phone ?? "—"}
            mono
            last
          />
        </ECard>
      </div>
    </>
  );
}
