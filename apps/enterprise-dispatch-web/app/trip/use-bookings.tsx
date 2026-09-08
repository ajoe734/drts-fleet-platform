"use client";

import type { BookingRecord } from "@drts/contracts";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getEnterpriseDispatchTenantClient } from "../../lib/api-client";
import { enterpriseTenant } from "../../lib/enterprise-fixtures";
import { ECard, entBtnStyle } from "../../components/ent-kit";
import { enterpriseTheme as t } from "../../lib/enterprise-theme";
import { useTranslation } from "../../lib/i18n";
import { bookingReadError, readTrip, type BookingReadError } from "./booking-data";

type State = { key: string | undefined; data: BookingRecord[] | null; error: BookingReadError | null };

export function useBookings(mode: "home" | "trip", bookingId?: string) {
  const key = `${mode}:${bookingId ?? ""}`;
  const [state, setState] = useState<State>({ key: undefined, data: null, error: null });
  useEffect(() => {
    let current = true;
    const client = getEnterpriseDispatchTenantClient(enterpriseTenant.id);
    const request = mode === "home" ? client.listBookings() : readTrip(client, bookingId).then((b) => b ? [b] : []);
    request.then((data) => {
      if (current) setState({ key, data, error: null });
    }).catch((error: unknown) => {
      if (current) setState({ key, data: null, error: bookingReadError(error) });
    });
    return () => { current = false; };
  }, [key, mode, bookingId]);
  return state.key === key ? state : { data: null, error: null };
}

export function BookingReadState({ error, empty = false }: { error?: BookingReadError | null; empty?: boolean }) {
  const { locale } = useTranslation();
  const zh = locale === "zh";
  const message = error === "not-found" ? (zh ? "找不到這筆預約。請回預約列表確認。" : "Booking not found. Return to the booking list.")
    : error === "unauthorized" ? (zh ? "登入已失效，請重新登入。" : "Your session has expired. Sign in again.")
    : error === "forbidden" ? (zh ? "你沒有權限查看這筆預約。" : "You do not have permission to view this booking.")
    : error === "rejected" ? (zh ? "無法讀取這筆預約，請回列表確認。" : "This booking cannot be read. Return to the list.")
    : error ? (zh ? "目前無法載入預約，請稍後再試。" : "Bookings are unavailable. Please try again later.")
    : empty ? (zh ? "目前沒有進行中的行程。" : "No active trip.")
    : (zh ? "正在載入預約…" : "Loading bookings…");
  return <ECard t={t}>
    <p role={error ? "alert" : "status"}>{message}</p>
    {(error || empty) && <Link href={error === "unauthorized" ? "/auth-required" : "/bookings"} style={entBtnStyle(t, { variant: "default" })}>
      {error === "unauthorized" ? (zh ? "登入說明" : "Sign-in help") : (zh ? "預約列表" : "Bookings")}
    </Link>}
  </ECard>;
}
