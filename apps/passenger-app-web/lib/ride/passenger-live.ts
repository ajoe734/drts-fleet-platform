import type {
  ApiSuccessEnvelope,
  MultiTaxiElectronicReceipt,
  PassengerRideAuthorityView,
  PassengerRideSseEventEnvelope,
} from "@drts/contracts";

import type {
  PassengerCertificatePresentation,
  PassengerCertificateRow,
  PassengerPaymentPresentation,
  PassengerRideFixture,
  PassengerScreenId,
} from "@drts/passenger-client";

import { passengerClient } from "../../lib/client";

export class PassengerAuthorityError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "PassengerAuthorityError";
  }
}

function camelizeKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map((v) => camelizeKeys(v));
  } else if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = key.replace(/([-_][a-z])/g, (group) =>
        group.toUpperCase().replace("-", "").replace("_", ""),
      );
      result[camelKey] = camelizeKeys(obj[key]);
      return result;
    }, {} as any);
  }
  return obj;
}

export async function fetchPassengerRideAuthority(
  idOrToken: string,
  isToken: boolean = false,
): Promise<PassengerRideAuthorityView> {
  if (isToken) {
    const response = await fetch(
      `/api/passenger-rides/${encodeURIComponent(idOrToken)}`,
      { cache: "no-store" },
    );
    const payload = camelizeKeys(await response.json()) as
      | ApiSuccessEnvelope<PassengerRideAuthorityView>
      | { error?: { code?: string } };
    if (!response.ok || !("data" in payload)) {
      throw new PassengerAuthorityError(
        response.status,
        "error" in payload
          ? payload.error?.code || "PASSENGER_AUTHORITY_REQUEST_FAILED"
          : "PASSENGER_AUTHORITY_REQUEST_FAILED",
      );
    }
    const data = (payload as any).data;
    return (data?.ride ? data.ride : data) as PassengerRideAuthorityView;
  } else {
    try {
      const res = await passengerClient.getRide(idOrToken);
      return res.ride;
    } catch (e: unknown) {
      const errCode =
        (e as any)?.code ||
        (e instanceof Error ? e.message : "PASSENGER_AUTHORITY_REQUEST_FAILED");
      const errStatus = (e as any)?.status || 500;
      throw new PassengerAuthorityError(errStatus, errCode);
    }
  }
}

export async function requestPassengerRideAction<T>(
  idOrToken: string,
  action: "cancel" | "ratings" | "contact" | "complaints",
  body?: Record<string, unknown>,
  isToken: boolean = false,
  idempotencyKey?: string,
) {
  if (isToken) {
    if (action === "complaints") {
      throw new PassengerAuthorityError(
        404,
        "PASSENGER_TOKEN_COMPLAINTS_NOT_SUPPORTED",
      );
    }
    const response = await fetch(
      `/api/passenger-rides/${encodeURIComponent(idOrToken)}/${action}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      },
    );
    if (!response.ok) {
      throw new PassengerAuthorityError(
        response.status,
        "PASSENGER_ACTION_FAILED",
      );
    }
    const payload = await response.json();
    return (
      payload.data ? camelizeKeys(payload.data) : camelizeKeys(payload)
    ) as T;
  } else {
    if (action === "cancel") {
      return (await passengerClient.cancelRide(
        idOrToken,
        body as unknown as Parameters<typeof passengerClient.cancelRide>[1],
      )) as unknown as T;
    } else if (action === "ratings") {
      return (await passengerClient.rateRide(
        idOrToken,
        body as unknown as Parameters<typeof passengerClient.rateRide>[1],
      )) as unknown as T;
    } else if (action === "complaints") {
      return (await passengerClient.createComplaint(
        idOrToken,
        body as unknown as Parameters<
          typeof passengerClient.createComplaint
        >[1],
        idempotencyKey,
      )) as unknown as T;
    } else if (action === "contact") {
      return { contactUri: "tel:02-2944-0985" } as unknown as T;
    }
    throw new PassengerAuthorityError(400, "INVALID_ACTION");
  }
}

export function subscribePassengerRideAuthority(
  idOrToken: string,
  onEvent: (event: PassengerRideSseEventEnvelope) => void,
  isToken: boolean = false,
  onStateChange?: (state: "connecting" | "connected" | "disconnected") => void,
) {
  const url = isToken
    ? `/api/passenger-rides/${encodeURIComponent(idOrToken)}/events`
    : `/api/passenger-app/rides/${encodeURIComponent(idOrToken)}/events`;
  const es = new EventSource(url);

  if (onStateChange) onStateChange("connecting");

  const PASSENGER_RIDE_SSE_EVENTS = [
    "assignment_disclosure_ready",
    "assignment_replaced",
    "driver_location_updated",
    "eta_changed",
    "driver_arrived",
    "trip_started",
    "trip_completed",
    "trip_cancelled",
    "receipt_ready",
  ] as const;

  let lastVersion = -1;

  const handleMsg = (msg: MessageEvent) => {
    try {
      const parsed = camelizeKeys(
        JSON.parse(msg.data),
      ) as PassengerRideSseEventEnvelope;
      if (
        typeof parsed.eventVersion !== "number" ||
        !Number.isFinite(parsed.eventVersion)
      ) {
        return; // invalid version
      }
      if (parsed.eventVersion <= lastVersion) {
        return; // replay/out-of-order rejected
      }
      lastVersion = parsed.eventVersion;
      onEvent(parsed);
    } catch (err) {
      console.error("SSE parse error", err);
    }
  };

  for (const eventName of PASSENGER_RIDE_SSE_EVENTS) {
    es.addEventListener(eventName, handleMsg);
  }

  es.onopen = () => {
    // eventVersion is allocated by the serving API process. A new connection
    // starts with a fresh authority snapshot and may land on a restarted peer.
    lastVersion = -1;
    if (onStateChange) onStateChange("connected");
  };

  es.onerror = (err) => {
    console.error("SSE error", err);
    if (onStateChange) onStateChange("disconnected");
    // Let browser's native EventSource reconnect.
  };

  return () => {
    es.close();
    if (onStateChange) onStateChange("disconnected");
  };
}

export async function fetchPassengerReceipt(
  idOrToken: string,
  isToken: boolean = false,
) {
  if (isToken) {
    const response = await fetch(
      `/api/passenger-rides/${encodeURIComponent(idOrToken)}/receipt`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      throw new PassengerAuthorityError(
        response.status,
        "PASSENGER_RECEIPT_FAILED",
      );
    }
    const payload = camelizeKeys(await response.json());
    return ((payload as any)?.data || payload) as any;
  } else {
    try {
      const raw = await passengerClient.getReceipt(idOrToken);
      const rawData = (raw as any)?.data || raw;
      if (!rawData || typeof rawData !== "object") {
        return rawData;
      }
      let receiptUrl = rawData.receiptUrl || rawData.htmlUrl || "";
      let pdfUrl = rawData.pdfUrl || rawData.record?.pdfUrl || undefined;
      let record = rawData.record;
      let receiptId = rawData.receiptId;
      let receiptNo = rawData.receiptNo;
      let issuedAt = rawData.issuedAt;
      let amountMinor = rawData.amountMinor;
      let currency = rawData.currency;

      if (!record || !pdfUrl) {
        try {
          const [rideRes, dlRes] = await Promise.allSettled([
            passengerClient.getRide(idOrToken),
            fetch(
              `/api/passenger-app/rides/${encodeURIComponent(idOrToken)}/receipt/downloads`,
              { cache: "no-store" },
            ),
          ]);

          if (rideRes.status === "fulfilled" && rideRes.value?.ride?.receipt) {
            const official = rideRes.value.ride.receipt;
            if (official.receiptId) receiptId = official.receiptId;
            if (official.receiptNo) receiptNo = official.receiptNo;
            if (official.issuedAt) issuedAt = official.issuedAt;
            if (typeof official.amountMinor === "number")
              amountMinor = official.amountMinor;
            if (official.currency) currency = official.currency;
            if (official.record) {
              record = official.record;
              if (official.record.htmlUrl && !receiptUrl)
                receiptUrl = official.record.htmlUrl;
              if (official.record.pdfUrl && !pdfUrl)
                pdfUrl = official.record.pdfUrl;
            }
          }

          if (dlRes.status === "fulfilled" && dlRes.value.ok) {
            const dlJson = await dlRes.value.json().catch(() => ({}));
            const dlData = dlJson?.data || dlJson;
            if (dlData.htmlUrl && !receiptUrl) receiptUrl = dlData.htmlUrl;
            if (dlData.pdfUrl) pdfUrl = dlData.pdfUrl;
            if (record && pdfUrl && !record.pdfUrl) {
              record = { ...record, pdfUrl };
            }
          }
        } catch {
          // fall through without fabricating
        }
      }

      return {
        ...(receiptId ? { receiptId } : {}),
        ...(receiptNo ? { receiptNo } : {}),
        ...(issuedAt ? { issuedAt } : {}),
        ...(typeof amountMinor === "number" ? { amountMinor } : {}),
        ...(currency ? { currency } : {}),
        receiptUrl,
        htmlUrl: rawData.htmlUrl || receiptUrl || undefined,
        ...(pdfUrl ? { pdfUrl } : {}),
        ...(record ? { record } : {}),
      };
    } catch (e: unknown) {
      throw new PassengerAuthorityError(
        500,
        e instanceof Error ? e.message : "PASSENGER_RECEIPT_FAILED",
      );
    }
  }
}

export function mapPassengerRideAuthorityToFixture(
  rawView: PassengerRideAuthorityView,
  token: string,
  kind: "ride" | "fares" | "receipt" = "ride",
  quoteAnomalyCode?: string | null,
): PassengerRideFixture {
  const view = (rawView as any)?.ride || rawView;
  const assignment = view.assignment;
  const screenId = resolveScreenId(view, kind, quoteAnomalyCode);
  const fareMinor = assignment?.routeFare?.estimatedFareMinor ?? null;
  const payableFareMinor = assignment?.routeFare?.payableFareMinor ?? null;
  const distanceMeters = assignment?.routeFare?.estimatedDistanceMeters ?? null;
  const durationSeconds =
    assignment?.routeFare?.estimatedDurationSeconds ?? null;
  const payment = mapPassengerPayment(view.payment);
  const certificate =
    view.order?.status === "completed" || view.receipt
      ? mapPassengerCertificate(
          view.receipt,
          view.actions?.canReadReceipt || Boolean(view.receipt),
        )
      : undefined;

  return {
    token,
    orderNo: view.order.orderNo,
    screenId,
    title:
      view.order.status === "cancelled"
        ? "Cancelled Ride"
        : screenTitle(screenId),
    status: statusLabel(view.order.status),
    ...(quoteAnomalyCode && screenId === "A04" ? { quoteAnomalyCode } : {}),
    ...(view.order.status === "created"
      ? { statusSubline: "系統正在安排可派車輛" }
      : {}),
    ...(view.order.requestedPickupAt
      ? {
          requestedPickupText: `預約時間 ${formatDateTime(view.order.requestedPickupAt)}`,
        }
      : {}),
    ...(view.order.status === "cancelled" && view.order.cancelledAt
      ? { cancelledAtText: formatDateTime(view.order.cancelledAt) }
      : {}),
    ...(view.order.status === "cancelled" ||
    assignment?.eta.minutes === null ||
    assignment?.eta.minutes === undefined
      ? {}
      : { etaMain: `預計 ${assignment.eta.minutes} 分鐘抵達` }),
    ...(view.order.status === "cancelled" || !assignment?.eta.calculatedAt
      ? {}
      : { etaSub: `更新於 ${formatDateTime(assignment.eta.calculatedAt)}` }),
    ...(distanceMeters === null
      ? {}
      : { routeDistanceKm: `約 ${(distanceMeters / 1000).toFixed(1)} 公里` }),
    ...(durationSeconds === null
      ? {}
      : {
          routeDurationMinutes: `約 ${Math.ceil(durationSeconds / 60)} 分鐘`,
        }),
    routeFareMode: screenId === "A04" ? "anomaly" : "range",
    ...(view.order.status === "cancelled"
      ? {}
      : {
          routeFareText:
            screenId === "A04"
              ? "目前無法取得正式報價"
              : payableFareMinor !== null
                ? `應付 ${formatMoney(payableFareMinor)}`
                : fareMinor === null
                  ? "依計費表實際金額收費"
                  : `預估 ${formatMoney(fareMinor)}`,
        }),
    ...(screenId === "A04"
      ? { routeFareHint: "正式報價完成前不會為您確認訂單" }
      : view.order.status !== "cancelled" &&
          assignment?.routeFare?.fareChangeRuleDisplayText
        ? {
            routeFareHint: assignment.routeFare.fareChangeRuleDisplayText,
          }
        : {}),
    pickupLabel:
      assignment?.routeFare?.pickup?.address ||
      view.order.pickup?.address ||
      "",
    dropoffLabel:
      assignment?.routeFare?.dropoff?.address ||
      view.order.dropoff?.address ||
      "",
    mapState:
      view.order.status === "cancelled"
        ? "missing"
        : assignment?.eta.locationFreshness === "fresh"
          ? "fresh"
          : assignment
            ? "stale"
            : "missing",
    actionMode: view.actions.canContact
      ? "driver_contact_ready"
      : "support_only",
    ...(screenId === "A04"
      ? {
          banner: {
            tone: "warning" as const,
            title: "請稍後重試或聯絡客服",
            detail: "quote_provider_unavailable",
          },
        }
      : {}),
    ...(screenId === "P5-12" || view.actions.canContact === false
      ? {
          contactSafetyNote: "目前無法直接聯絡司機，請改聯絡客服協助轉達。",
        }
      : {}),
    canCancel:
      view.order.status === "cancelled" ? false : view.actions.canCancel,
    canRate: view.order.status === "cancelled" ? false : view.actions.canRate,
    canContact:
      view.order.status === "cancelled" ? false : view.actions.canContact,
    canReadReceipt:
      view.order.status === "cancelled" ? false : view.actions.canReadReceipt,
    ...(view.order.status !== "cancelled" && view.actions.canCancel
      ? {
          cancelNote: "取消條件依目前訂單狀態計算",
          actionLabel: "取消行程",
        }
      : {}),
    seatbeltNotice: ["arrived_pickup", "on_trip"].includes(view.order.status),
    ...(payment ? { payment } : {}),
    ...(certificate ? { certificate } : {}),
    ...(view.order.status === "completed"
      ? {
          ratingSummary: view.rating
            ? {
                state: "rated",
                scoreText: `${view.rating.score} 星`,
                countText: "評價已送出",
              }
            : {
                state: "unavailable",
                countText: "請為本趟服務評分",
                chips: [
                  "車內整潔",
                  "駕駛親切",
                  "路線順暢",
                  "準時到達",
                  "駕駛態度",
                  "車內氣味",
                  "繞路",
                  "遲到",
                  "駕駛違規",
                ],
              },
        }
      : {}),
    driver: {
      name: assignment?.driver?.displayName || "",
      vehicle: assignment?.vehicle
        ? `${assignment.vehicle.make} ${assignment.vehicle.model}`
        : "",
      plateNo: assignment?.vehicle?.plateNo || "",
      color: assignment?.vehicle?.color || "",
      registrationMaskedDisplay:
        assignment?.driver?.registrationMaskedDisplay || "",
      registrationEffectiveUntil:
        assignment?.driver?.registrationEffectiveUntil || "",
      ratingState: assignment?.rating?.displayState || "unavailable",
    },
    assignment,
    timeline: [],
  };
}

function mapPassengerPayment(
  payment: PassengerRideAuthorityView["payment"],
): PassengerPaymentPresentation | undefined {
  if (!payment) return undefined;
  const presentations: Record<
    string,
    {
      label: string;
      detail: string;
      tone: "info" | "success" | "warning" | "danger";
    }
  > = {
    not_selected: {
      label: "尚未選擇付款方式",
      detail: "目前尚無付款方式。",
      tone: "info",
    },
    authorized: {
      label: "已授權，待完成扣款",
      detail: "付款方式已授權，將依行程結果完成扣款。",
      tone: "warning",
    },
    captured: {
      label: "付款完成",
      detail: "款項已完成扣款。",
      tone: "success",
    },
    failed: {
      label: "付款失敗",
      detail: "目前未完成付款；此頁不會自行重試扣款。",
      tone: "danger",
    },
    refunded: {
      label: "已退款",
      detail: "退款狀態已由付款服務確認。",
      tone: "info",
    },
    manual_recovery: {
      label: "請聯絡客服確認付款",
      detail: "付款需要人工確認；此頁不會顯示為已付款。",
      tone: "warning",
    },
  };
  const presentation = presentations[payment.status] || {
    label: "付款處理中",
    detail: "正在確認交易結果。",
    tone: "info" as const,
  };
  return {
    status: payment.status,
    ...presentation,
    ...(payment.amount
      ? { amountText: formatMoney(payment.amount.amountMinor) }
      : {}),
  };
}

export function mapPassengerCertificate(
  receipt: MultiTaxiElectronicReceipt | null,
  canReadReceipt: boolean,
): PassengerCertificatePresentation {
  if (!canReadReceipt) {
    return {
      state: "error",
      errorCode: "PASSENGER_RECEIPT_SCOPE_FORBIDDEN",
    };
  }
  if (!receipt) {
    return { state: "pending" };
  }

  const record = (receipt as any).record;
  if (!record || typeof record !== "object") {
    return {
      state: "pending",
      ...(receipt.receiptNo ? { receiptNo: receipt.receiptNo } : {}),
      ...("receiptUrl" in receipt &&
      typeof (receipt as any).receiptUrl === "string"
        ? { htmlUrl: (receipt as any).receiptUrl }
        : {}),
      ...("htmlUrl" in receipt && typeof (receipt as any).htmlUrl === "string"
        ? { htmlUrl: (receipt as any).htmlUrl }
        : {}),
      ...("pdfUrl" in receipt && typeof (receipt as any).pdfUrl === "string"
        ? { pdfUrl: (receipt as any).pdfUrl }
        : {}),
    };
  }
  const e04 = (record as any).e04Snapshot;
  if (
    !e04 ||
    !e04.fleetOperatorName ||
    !e04.driverSurname ||
    !e04.driverRegistrationMasked ||
    !e04.paymentMethodDisplay ||
    !e04.fareBreakdown ||
    typeof e04.fareBreakdown.startMinor !== "number" ||
    typeof e04.fareBreakdown.distanceMinor !== "number" ||
    typeof e04.fareBreakdown.delayMinor !== "number" ||
    typeof e04.fareBreakdown.nightMinor !== "number"
  ) {
    return {
      state: "error",
      receiptNo: receipt.receiptNo,
      errorCode: "PASSENGER_RECEIPT_LEGAL_FIELDS_MISSING",
    };
  }

  const plateNo = readText(record, "plateNo");
  const pickupAt = readDate(record, "pickupAt");
  const dropoffAt = readDate(record, "dropoffAt");
  const travelDurationSeconds = readNonNegativeNumber(
    record,
    "travelDurationSeconds",
  );
  const routeSummary = readText(record, "routeSummary");
  const distanceMeters = readNonNegativeNumber(record, "distanceMeters");
  const tollMinor = readNonNegativeNumber(record, "tollMinor");
  const consumerServicePhone = readText(record, "consumerServicePhone");
  const authorityComplaintPhone = readText(record, "authorityComplaintPhone");

  const htmlUrl = readText(record, "htmlUrl");
  const pdfUrl = readText(record, "pdfUrl");

  const fleetName = e04.fleetOperatorName || readText(record, "fleetName");
  const driverName = e04.driverSurname || readText(record, "driverName");
  const driverRegistrationNo =
    e04.driverRegistrationMasked || readText(record, "driverRegistrationNo");
  const paymentMethod =
    e04.paymentMethodDisplay || readText(record, "paymentMethod");

  const fareBaseMinor =
    e04.fareBreakdown?.startMinor ??
    readNonNegativeNumber(record, "fareBaseMinor");
  const fareDistanceMinor =
    e04.fareBreakdown?.distanceMinor ??
    readNonNegativeNumber(record, "fareDistanceMinor");
  const fareTimeMinor =
    e04.fareBreakdown?.delayMinor ??
    readNonNegativeNumber(record, "fareTimeMinor");
  const fareNightMinor =
    e04.fareBreakdown?.nightMinor ??
    readNonNegativeNumber(record, "fareNightMinor");

  if (
    !plateNo ||
    !pickupAt ||
    !dropoffAt ||
    travelDurationSeconds === null ||
    !routeSummary ||
    distanceMeters === null ||
    tollMinor === null ||
    !consumerServicePhone ||
    !authorityComplaintPhone
  ) {
    return {
      state: "error",
      receiptNo: receipt.receiptNo,
      errorCode: "PASSENGER_RECEIPT_LEGAL_FIELDS_MISSING",
    };
  }

  const rows: PassengerCertificateRow[] = [
    { label: "乘車證明編號", value: receipt.receiptNo, mono: true },
    {
      label: "開立時間",
      value: formatDateTime(receipt.issuedAt),
      mono: true,
    },
    ...(fleetName ? [{ label: "車隊", value: fleetName }] : []),
    ...(driverName ? [{ label: "駕駛", value: driverName }] : []),
    { label: "車牌", value: plateNo, mono: true },
    ...(driverRegistrationNo
      ? [{ label: "遮罩執登號", value: driverRegistrationNo, mono: true }]
      : []),
    { label: "上車時間", value: formatDateTime(pickupAt), mono: true },
    { label: "下車時間", value: formatDateTime(dropoffAt), mono: true },
    { label: "行駛時間", value: formatDuration(travelDurationSeconds) },
    { label: "路線", value: routeSummary },
    {
      label: "行駛里程",
      value: `${(distanceMeters / 1000).toFixed(1)} 公里`,
      mono: true,
    },
    {
      label: "車資金額",
      value: formatMoney(receipt.amountMinor),
      mono: true,
    },
    { label: "通行費", value: formatMoney(tollMinor), mono: true },
    { label: "客服電話", value: consumerServicePhone, mono: true },
    {
      label: "主管機關申訴電話",
      value: authorityComplaintPhone,
      mono: true,
    },
    ...(paymentMethod ? [{ label: "支付方式", value: paymentMethod }] : []),
  ];

  if (fareBaseMinor !== null && fareBaseMinor !== undefined) {
    rows.push({ label: "起程", value: formatMoney(fareBaseMinor), mono: true });
  }
  if (fareDistanceMinor !== null && fareDistanceMinor !== undefined) {
    rows.push({
      label: "續程",
      value: formatMoney(fareDistanceMinor),
      mono: true,
    });
  }
  if (fareTimeMinor !== null && fareTimeMinor !== undefined) {
    rows.push({ label: "延滯", value: formatMoney(fareTimeMinor), mono: true });
  }
  if (fareNightMinor !== null && fareNightMinor !== undefined) {
    rows.push({
      label: "夜間加成",
      value: formatMoney(fareNightMinor),
      mono: true,
    });
  }

  const result: PassengerCertificatePresentation = {
    state: "available",
    receiptNo: receipt.receiptNo,
    rows,
  };
  if (htmlUrl) result.htmlUrl = htmlUrl;
  if (pdfUrl) result.pdfUrl = pdfUrl;
  return result;
}

export const P5_QUOTE_ANOMALY_ERROR_CODES = [
  "P5_QUOTE_PROVIDER_UNAVAILABLE",
  "P5_QUOTE_OUT_OF_RANGE",
  "P5_ROUTE_SNAPSHOT_UNRESOLVED",
  "P5_FARE_POLICY_MISSING",
  "P5_FARE_CALCULATION_MISMATCH",
  "quote_provider_unavailable",
  "quote_out_of_range",
  "route_unresolved",
  "fare_policy_missing",
  "calculation_mismatch",
] as const;

function resolveScreenId(
  rawView: PassengerRideAuthorityView,
  kind: "ride" | "fares" | "receipt",
  quoteAnomalyCode?: string | null,
): PassengerScreenId {
  const view = (rawView as any)?.ride || rawView;
  if (!view || !view.order) return "P5-01";
  if (kind === "fares") return "A03";
  if (kind === "receipt") return "P5-10";
  if (view.order.status === "cancelled") {
    return "P5-01";
  }
  if (view.order.status === "completed") return view.rating ? "P5-09" : "P5-08";
  const effectiveAnomaly =
    quoteAnomalyCode ||
    (view as any).quoteAnomalyCode ||
    (view.order as any)?.fareQuoteAnomaly ||
    (view as any)?.fareQuoteAnomaly;

  if (
    effectiveAnomaly &&
    P5_QUOTE_ANOMALY_ERROR_CODES.includes(effectiveAnomaly as any)
  ) {
    return "A04";
  }
  if (view.receipt) return "P5-10";
  if (view.order.status === "on_trip") return "P5-07";
  if (view.order.status === "arrived_pickup") return "P5-06";
  if (view.order.status === "redispatch_required") return "P5-04";
  if (!view.assignment) {
    if (
      ["assigned", "driver_accepted", "enroute_pickup"].includes(
        view.order.status,
      )
    )
      return "P5-11";
    return "P5-01";
  }

  if (view.actions?.canContact === false) return "P5-12";

  if (view.assignment.assignmentVersion > 1) return "P5-05";
  return view.assignment.rating?.displayState === "new_driver"
    ? "P5-03"
    : "P5-02";
}

export function screenTitle(screenId: PassengerScreenId) {
  const titles: Partial<Record<PassengerScreenId, string>> = {
    "P5-01": "Awaiting Assignment",
    "P5-02": "Driver En Route",
    "P5-03": "Assigned New Driver",
    "P5-05": "Redispatch Complete",
    "P5-06": "Driver Arrived",
    "P5-07": "Trip In Progress",
    "P5-08": "Rate Completed Trip",
    "P5-09": "Rating Submitted",
    "P5-10": "Electronic Ride Certificate",
    "P5-11": "Disclosure Unavailable",
    "P5-12": "Driver Contact Not Provisioned",
    A04: "Fare Quote Anomaly",
  };
  return titles[screenId] ?? "Passenger Ride";
}

function statusLabel(status: PassengerRideAuthorityView["order"]["status"]) {
  const labels: Partial<
    Record<PassengerRideAuthorityView["order"]["status"], string>
  > = {
    created: "正在安排車輛",
    ready_for_dispatch: "正在安排車輛",
    assigned: "車輛已指派",
    driver_accepted: "司機已接受行程",
    enroute_pickup: "司機正在前往",
    arrived_pickup: "司機已抵達",
    on_trip: "行程進行中",
    completed: "行程已完成",
    cancelled: "行程已取消",
    redispatch_required: "正在為您改派",
    exception_hold: "行程保留處理中",
  };
  return labels[status] ?? "行程狀態更新中";
}

function formatMoney(amountMinor: number) {
  return `NT$ ${Math.round(amountMinor / 100).toLocaleString("zh-TW")}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes} 分鐘` : `${minutes} 分 ${remainder} 秒`;
}

function readText(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readDate(record: Record<string, unknown>, key: string) {
  const value = readText(record, key);
  return value && Number.isFinite(Date.parse(value)) ? value : null;
}

function readNonNegativeNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function createFareQuoteAnomalyFixture(
  token: string,
  errorCode: string = "P5_QUOTE_PROVIDER_UNAVAILABLE",
): PassengerRideFixture {
  const dummyView: PassengerRideAuthorityView = {
    order: {
      orderId: token,
      orderNo: token,
      status: "created",
      timingMode: "scheduled",
      requestedPickupAt: new Date().toISOString(),
      pickup: { address: "" },
      dropoff: { address: "" },
      cancelableUntil: null,
      cancelledAt: null,
      completedAt: null,
    },
    assignment: null,
    rating: null,
    payment: null,
    receipt: null,
    actions: {
      canCancel: false,
      canRate: false,
      canContact: true,
      canReadReceipt: false,
    },
  };
  return mapPassengerRideAuthorityToFixture(
    dummyView,
    token,
    "ride",
    errorCode,
  );
}

export function retainFixtureQuoteAnomaly(
  fixture: PassengerRideFixture,
  errorCode: string = "P5_QUOTE_PROVIDER_UNAVAILABLE",
): PassengerRideFixture {
  return {
    ...fixture,
    screenId: "A04",
    title: screenTitle("A04"),
    routeFareMode: "anomaly",
    routeFareText: "目前無法取得正式報價",
    routeFareHint: "正式報價完成前不會為您確認訂單",
    quoteAnomalyCode: errorCode,
    banner: {
      tone: "warning",
      title: "請稍後重試或聯絡客服",
      detail: errorCode.toLowerCase(),
    },
  };
}
