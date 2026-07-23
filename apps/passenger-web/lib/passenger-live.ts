import type {
  ApiSuccessEnvelope,
  PassengerRideAuthorityView,
  PassengerRideSseEventEnvelope,
} from "@drts/contracts";

import type {
  PassengerRideFixture,
  PassengerScreenId,
} from "./passenger-fixtures";

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
  const listener = (event: Event) => {
    try {
      const envelope = camelizeKeys(
        JSON.parse((event as MessageEvent<string>).data),
      ) as PassengerRideSseEventEnvelope;
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

export function mapPassengerRideAuthorityToFixture(
  view: PassengerRideAuthorityView,
  token: string,
): PassengerRideFixture {
  const assignment = view.assignment;
  const screenId = resolveScreenId(view);
  const fareMinor = assignment?.routeFare.estimatedFareMinor ?? null;
  const distanceMeters = assignment?.routeFare.estimatedDistanceMeters ?? null;
  const durationSeconds =
    assignment?.routeFare.estimatedDurationSeconds ?? null;
  const receiptRows = view.receipt
    ? [
        { label: "乘車證明編號", value: view.receipt.receiptNo, mono: true },
        {
          label: "實付金額",
          value: formatMoney(view.receipt.amountMinor),
        },
        {
          label: "開立時間",
          value: formatDateTime(view.receipt.issuedAt),
        },
      ]
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
      fareMinor === null
        ? "依計費表實際金額收費"
        : `預估 ${formatMoney(fareMinor)}`,
    ...(assignment?.routeFare.fareChangeRuleDisplayText
      ? {
          routeFareHint: assignment.routeFare.fareChangeRuleDisplayText,
        }
      : {}),
    pickupLabel: view.order.pickup.address,
    dropoffLabel: view.order.dropoff.address,
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
    canContact: view.actions.canContact,
    ...(view.actions.canCancel
      ? {
          cancelNote: "取消條件依目前訂單狀態計算",
          actionLabel: "取消行程",
        }
      : {}),
    seatbeltNotice: ["arrived_pickup", "on_trip"].includes(view.order.status),
    ...(receiptRows ? { receiptRows } : {}),
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

function resolveScreenId(view: PassengerRideAuthorityView): PassengerScreenId {
  if (view.receipt) return "P5-10";
  if (view.order.status === "completed") return view.rating ? "P5-09" : "P5-08";
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
