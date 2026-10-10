import type {
  ApiSuccessEnvelope,
  MultiTaxiElectronicReceipt,
  PassengerRideAuthorityView,
  PassengerRideSseEventEnvelope,
} from "@drts/contracts";

import type {
  PassengerCertificatePresentation,
  PassengerPaymentPresentation,
  PassengerRideFixture,
  PassengerScreenId,
} from "@drts/passenger-client";

import { passengerClient } from "@/lib/client";

const PASSENGER_PROXY_BASE = "/api/passenger-app/rides";

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
      `${PASSENGER_PROXY_BASE}/${encodeURIComponent(idOrToken)}`,
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
    return payload.data;
  } else {
    try {
      const res = await passengerClient.getRide(idOrToken);
      return res.ride;
    } catch (e: any) {
      throw new PassengerAuthorityError(500, e.message);
    }
  }
}

export async function requestPassengerRideAction<T>(
  idOrToken: string,
  action: "cancel" | "ratings" | "contact" | "complaints",
  body?: Record<string, unknown>,
  isToken: boolean = false,
) {
  if (isToken) {
    const routeAction = action === "complaints" ? "complaints" : action;
    const response = await fetch(
      `/api/passenger-rides/${encodeURIComponent(idOrToken)}/${routeAction}`,
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
    return camelizeKeys(await response.json()) as T;
  } else {
    if (action === "cancel") {
      return (await passengerClient.cancelRide(
        idOrToken,
        body as Parameters<typeof passengerClient.cancelRide>[1],
      )) as unknown as T;
    } else if (action === "ratings") {
      return (await passengerClient.rateRide(
        idOrToken,
        body as Parameters<typeof passengerClient.rateRide>[1],
      )) as unknown as T;
    } else if (action === "complaints") {
      return (await passengerClient.createComplaint(
        idOrToken,
        body as Parameters<typeof passengerClient.createComplaint>[1],
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
) {
  const url = isToken
    ? `/api/passenger-rides/${encodeURIComponent(idOrToken)}/events`
    : `/api/passenger-app/rides/${encodeURIComponent(idOrToken)}/events`;
  const es = new EventSource(url);
  
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
      const parsed = camelizeKeys(JSON.parse(msg.data)) as PassengerRideSseEventEnvelope;
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

  es.onerror = (err) => {
    console.error("SSE error", err);
    // Let browser's native EventSource reconnect.
  };

  return () => es.close();
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
    return payload.data as { receiptUrl: string };
  } else {
    try {
      return await passengerClient.getReceipt(idOrToken);
    } catch (e: any) {
      throw new PassengerAuthorityError(500, e.message);
    }
  }
}

export function mapPassengerRideAuthorityToFixture(
  view: PassengerRideAuthorityView,
  token: string,
  kind: "ride" | "fares" | "receipt" = "ride",
): PassengerRideFixture {
  const assignment = view.assignment;
  const screenId = resolveScreenId(view, kind);
  const fareMinor = assignment?.routeFare.estimatedFareMinor ?? null;
  const payableFareMinor = assignment?.routeFare.payableFareMinor ?? null;
  const distanceMeters = assignment?.routeFare.estimatedDistanceMeters ?? null;
  const durationSeconds =
    assignment?.routeFare.estimatedDurationSeconds ?? null;
  const payment = mapPassengerPayment(view.payment);
  const certificate =
    view.order.status === "completed" || view.receipt
      ? mapPassengerCertificate(view.receipt, view.actions.canReadReceipt)
      : undefined;

  return {
    token,
    orderNo: view.order.orderNo,
    screenId,
    title: screenTitle(screenId),
    status: statusLabel(view.order.status),
    ...(view.order.status === "created"
      ? { statusSubline: "系統正在安排可派車輛" }
      : {}),
    ...(view.order.requestedPickupAt
      ? { requestedPickupText: `預約時間 ${formatDateTime(view.order.requestedPickupAt)}` }
      : {}),
    ...(assignment?.eta.minutes === null ||
    assignment?.eta.minutes === undefined
      ? {}
      : { etaMain: `預計 ${assignment.eta.minutes} 分鐘抵達` }),
    ...(assignment?.eta.calculatedAt
      ? { etaSub: `更新於 ${formatDateTime(assignment.eta.calculatedAt)}` }
      : {}),
    ...(distanceMeters === null
      ? {}
      : { routeDistanceKm: `約 ${(distanceMeters / 1000).toFixed(1)} 公里` }),
    ...(durationSeconds === null
      ? {}
      : {
          routeDurationMinutes: `約 ${Math.ceil(durationSeconds / 60)} 分鐘`,
        }),
    routeFareMode: "range",
    routeFareText:
      payableFareMinor !== null
        ? `應付 ${formatMoney(payableFareMinor)}`
        : fareMinor === null
          ? "依計費表實際金額收費"
          : `預估 ${formatMoney(fareMinor)}`,
    ...(assignment?.routeFare.fareChangeRuleDisplayText
      ? {
          routeFareHint: assignment.routeFare.fareChangeRuleDisplayText,
        }
      : {}),
    pickupLabel:
      assignment?.routeFare.pickup.address || view.order.pickup.address,
    dropoffLabel:
      assignment?.routeFare.dropoff.address || view.order.dropoff.address,
    mapState:
      assignment?.eta.locationFreshness === "fresh"
        ? "fresh"
        : assignment
          ? "stale"
          : "missing",
    actionMode: view.actions.canContact
      ? "driver_contact_ready"
      : "support_only",
    canCancel: view.actions.canCancel,
    canRate: view.actions.canRate,
    canContact: view.actions.canContact,
    canReadReceipt: view.actions.canReadReceipt,
    ...(view.actions.canCancel
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
                chips: ["態度親切", "車內整潔", "平穩安全", "準時抵達", "熟悉路線"],
              },
        }
      : {}),
    driver: {
      name: assignment?.driver.displayName || "尚未指派",
      vehicle: assignment
        ? `${assignment.vehicle.make} ${assignment.vehicle.model}`
        : "尚未指派",
      plateNo: assignment?.vehicle.plateNo || "尚未指派",
      color: assignment?.vehicle.color || "未提供",
      registrationMaskedDisplay:
        assignment?.driver.registrationMaskedDisplay || "尚未提供",
      registrationEffectiveUntil:
        assignment?.driver.registrationEffectiveUntil || "尚未提供",
      ratingState: assignment?.rating.displayState || "unavailable",
    },
    assignment,
    timeline: [],
  };
}

export function mapPassengerPayment(
  payment: PassengerRideAuthorityView["payment"],
): PassengerPaymentPresentation | undefined {
  if (!payment) {
    return undefined;
  }
  const presentations = {
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
  } as const;
  const presentation = presentations[payment.status];
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

  const record = receipt.record;
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
    { label: "車牌", value: plateNo, mono: true },
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
  ];

  // Optional fields that might be missing in contract but requested in UI
  const driverRegistrationNo = readText(record, "driverRegistrationNo");
  if (driverRegistrationNo) {
    rows.push({ label: "遮罩執登號", value: driverRegistrationNo, mono: true });
  }
  const fareBaseMinor = readNonNegativeNumber(record, "fareBaseMinor");
  if (fareBaseMinor !== null) {
    rows.push({ label: "起程", value: formatMoney(fareBaseMinor), mono: true });
  }
  const fareDistanceMinor = readNonNegativeNumber(record, "fareDistanceMinor");
  if (fareDistanceMinor !== null) {
    rows.push({ label: "續程", value: formatMoney(fareDistanceMinor), mono: true });
  }
  const fareTimeMinor = readNonNegativeNumber(record, "fareTimeMinor");
  if (fareTimeMinor !== null) {
    rows.push({ label: "延滯", value: formatMoney(fareTimeMinor), mono: true });
  }
  const fareNightMinor = readNonNegativeNumber(record, "fareNightMinor");
  if (fareNightMinor !== null) {
    rows.push({ label: "夜間明細", value: formatMoney(fareNightMinor), mono: true });
  }
  const paymentMethod = readText(record, "paymentMethod");
  if (paymentMethod) {
    rows.push({ label: "支付方式", value: paymentMethod });
  }

  return {
    state: "available",
    receiptNo: receipt.receiptNo,
    rows,
    htmlUrl: htmlUrl ?? undefined,
    pdfUrl: pdfUrl ?? undefined,
  };
}

function resolveScreenId(
  view: PassengerRideAuthorityView,
  kind: "ride" | "fares" | "receipt",
): PassengerScreenId {
  if (kind === "receipt") return "P5-10";
  if (view.order.status === "cancelled") return "P5-12";
  if (view.order.status === "completed") return view.rating ? "P5-09" : "P5-08";
  if (view.receipt) return "P5-10";
  if (view.order.status === "on_trip") return "P5-07";
  if (view.order.status === "arrived_pickup") return "P5-06";
  if (view.order.status === "redispatch_required") return "P5-04";
  if (!view.assignment) {
    if (["assigned", "driver_accepted", "enroute_pickup"].includes(view.order.status)) return "P5-11";
    if (view.order.timingMode === "scheduled" && view.order.status === "created") return "A04";
    return "P5-01";
  }
  if (view.assignment.assignmentVersion > 1) return "P5-05";
  return view.assignment.rating.displayState === "new_driver"
    ? "P5-03"
    : "P5-02";
}

function screenTitle(screenId: PassengerScreenId) {
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
