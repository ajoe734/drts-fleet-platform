"use client";

import type { BookingRecord } from "@drts/contracts";
import { ApiClientError } from "@drts/api-client";
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
import { enterpriseTenant } from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { useTranslation } from "@/lib/i18n";

type GatewayState = "quota-blocked" | "no-supply" | "degraded";

function gatewayHref(error: unknown): string | null {
  if (!(error instanceof ApiClientError)) return "/degraded";
  const code = error.code.toLowerCase();
  if (code.includes("quota") || code.includes("policy"))
    return "/quota-blocked";
  if (code.includes("supply") || code.includes("vehicle_unavailable"))
    return "/no-supply";
  return error.statusCode >= 500 ? "/degraded" : null;
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
        setState(
          (gatewayHref(error)?.slice(1) as GatewayState | undefined) ??
            "degraded",
        ),
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
        setState(
          (gatewayHref(error)?.slice(1) as GatewayState | undefined) ??
            "degraded",
        ),
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
      setState(
        (gatewayHref(error)?.slice(1) as GatewayState | undefined) ??
          "degraded",
      );
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
