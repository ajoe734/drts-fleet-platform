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
} from "./passenger-view-model";

const PASSENGER_PROXY_BASE = "/control-plane-proxy";

export class PassengerAuthorityError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "PassengerAuthorityError";
  }
}

export async function fetchPassengerRideAuthority(token: string) {
  const response = await fetch(
    `${PASSENGER_PROXY_BASE}/passenger-rides/${encodeURIComponent(token)}`,
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
}

export async function requestPassengerRideAction<T>(
  token: string,
  action: "cancel" | "ratings" | "contact",
  body?: Record<string, unknown>,
) {
  const response = await fetch(
    `${PASSENGER_PROXY_BASE}/passenger-rides/${encodeURIComponent(token)}/${action}`,
    {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    },
  );
  const payload = camelizeKeys(await response.json()) as
    | ApiSuccessEnvelope<T>
    | { error?: { code?: string } };
  if (!response.ok || !("data" in payload)) {
    throw new PassengerAuthorityError(
      response.status,
      "error" in payload
        ? payload.error?.code || "PASSENGER_ACTION_FAILED"
        : "PASSENGER_ACTION_FAILED",
    );
  }
  return payload.data;
}

export async function fetchPassengerReceipt(token: string) {
  const response = await fetch(
    `${PASSENGER_PROXY_BASE}/passenger-rides/${encodeURIComponent(token)}/receipt`,
    { cache: "no-store" },
  );
  const payload = camelizeKeys(await response.json()) as
    | ApiSuccessEnvelope<MultiTaxiElectronicReceipt>
    | { error?: { code?: string } };
  if (!response.ok || !("data" in payload)) {
    throw new PassengerAuthorityError(
      response.status,
      "error" in payload
        ? payload.error?.code || "PASSENGER_RECEIPT_REQUEST_FAILED"
        : "PASSENGER_RECEIPT_REQUEST_FAILED",
    );
  }
  return payload.data;
}

export function subscribePassengerRideAuthority(
  token: string,
  onView: (view: PassengerRideAuthorityView) => void,
  onError: () => void,
) {
  const source = new EventSource(
    `${PASSENGER_PROXY_BASE}/passenger-rides/${encodeURIComponent(token)}/events`,
  );
  const eventNames = [
    "assignment_disclosure_ready",
    "assignment_replaced",
    "driver_location_updated",
    "eta_changed",
    "driver_arrived",
    "trip_started",
    "trip_completed",
    "trip_cancelled",
    "receipt_ready",
  ];
  // Highest `eventVersion` already applied. The server allocates this strictly
  // increasing per order, so anything at or below it is a replay or a
  // late-arriving earlier event and must not overwrite newer ride state.
  let appliedEventVersion = 0;
  const listener = (event: Event) => {
    try {
      const envelope = camelizeKeys(
        JSON.parse((event as MessageEvent<string>).data),
      ) as PassengerRideSseEventEnvelope;
      if (!isFreshPassengerEvent(envelope, appliedEventVersion)) {
        return;
      }
      appliedEventVersion = envelope.eventVersion;
      onView(envelope.data);
    } catch {
      onError();
    }
  };
  for (const eventName of eventNames) {
    source.addEventListener(eventName, listener);
  }
  source.onerror = onError;
  return () => source.close();
}

/**
 * True only for an envelope that advances the stream. An envelope without a
 * usable numeric version is rejected as well: without an ordering key there is
 * no way to tell it apart from a stale replay.
 */
export function isFreshPassengerEvent(
  envelope: Pick<PassengerRideSseEventEnvelope, "eventVersion">,
  appliedEventVersion: number,
) {
  const version = envelope.eventVersion;
  return (
    typeof version === "number" &&
    Number.isFinite(version) &&
    version > appliedEventVersion
  );
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

  return {
    state: "available",
    receiptNo: receipt.receiptNo,
    rows: [
      { label: "乘車證明編號", value: receipt.receiptNo, mono: true },
      {
        label: "開立時間",
        value: formatDateTime(receipt.issuedAt),
        mono: true,
      },
      { label: "車號", value: plateNo, mono: true },
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
    ],
  };
}

function resolveScreenId(
  view: PassengerRideAuthorityView,
  kind: "ride" | "fares" | "receipt",
): PassengerScreenId {
  if (kind === "receipt") return "P5-10";
  if (view.order.status === "completed") return view.rating ? "P5-09" : "P5-08";
  if (view.receipt) return "P5-10";
  if (view.order.status === "on_trip") return "P5-07";
  if (view.order.status === "arrived_pickup") return "P5-06";
  if (!view.assignment) {
    return ["assigned", "driver_accepted", "enroute_pickup"].includes(
      view.order.status,
    )
      ? "P5-11"
      : "P5-01";
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

function camelizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(camelizeKeys);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      camelizeKeys(child),
    ]),
  );
}
