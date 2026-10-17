/**
 * Portable Native P5 projection of the accepted Web authority presentation.
 * No transport, browser, React, Next, fixture data, API route or platform runtime.
 * The App owns rendering, header-bearing events, binary downloads and lifecycle.
 */
import type {
  MultiTaxiElectronicReceipt,
  PassengerReceiptResponse,
  PassengerRideAuthorityView,
  PassengerRideSseEventEnvelope,
} from "@drts/contracts";
import type {
  PassengerCertificatePresentation,
  PassengerCertificateRow,
  PassengerPaymentPresentation,
  PassengerRideFixture,
  PassengerScreenId,
} from "./view-model";

/** Existing wire anomaly context; these fields do not create a requote API. */
export type NativePassengerRideAuthority = PassengerRideAuthorityView & {
  quoteAnomalyCode?: string | null;
  fareQuoteAnomaly?: string | null;
  order: PassengerRideAuthorityView["order"] & {
    fareQuoteAnomaly?: string | null;
  };
};
export type NativePassengerRideAuthorityInput =
  | NativePassengerRideAuthority
  | { ride: NativePassengerRideAuthority };

function unwrapNativePassengerRideAuthority(
  input: NativePassengerRideAuthorityInput,
): NativePassengerRideAuthority {
  return "ride" in input ? input.ride : input;
}

export function mapNativePassengerRideAuthorityToFixture(
  rawView: NativePassengerRideAuthorityInput,
  token: string,
  kind: "ride" | "fares" | "receipt" = "ride",
  quoteAnomalyCode?: string | null,
): PassengerRideFixture {
  const view = unwrapNativePassengerRideAuthority(rawView);
  const assignment =
    view.order.status === "dispatch_timeout" ? null : view.assignment;
  const screenId = resolveNativePassengerScreenId(view, kind, quoteAnomalyCode);
  const showPickupEta = [
    "assigned",
    "driver_accepted",
    "enroute_pickup",
  ].includes(view.order.status);
  const pickupEta =
    view.tracking === undefined ? assignment?.eta : view.tracking?.pickupEta;
  const fareMinor = assignment?.routeFare?.estimatedFareMinor ?? null;
  const payableFareMinor = assignment?.routeFare?.payableFareMinor ?? null;
  const distanceMeters = assignment?.routeFare?.estimatedDistanceMeters ?? null;
  const durationSeconds =
    assignment?.routeFare?.estimatedDurationSeconds ?? null;
  const payment = mapNativePassengerPayment(view.payment);
  const certificate =
    view.order?.status === "completed" || view.receipt
      ? mapNativePassengerCertificate(
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
        : nativePassengerScreenTitle(screenId),
    status: statusLabel(view.order.status),
    ...(view.tracking !== undefined
      ? {
          tracking: ["cancelled", "completed", "dispatch_timeout"].includes(
            view.order.status,
          )
            ? null
            : view.tracking,
        }
      : {}),
    ...(quoteAnomalyCode && screenId === "A04" ? { quoteAnomalyCode } : {}),
    ...(view.order.status === "created"
      ? { statusSubline: "系統正在安排可派車輛" }
      : {}),
    ...(view.order.status === "dispatch_timeout"
      ? {
          statusSubline:
            "尚未有司機完成接單，請等待調度重新安排車輛，或取消行程。",
        }
      : {}),
    ...(view.order.requestedPickupAt
      ? {
          requestedPickupText: `預約時間 ${formatDateTime(view.order.requestedPickupAt)}`,
        }
      : {}),
    ...(view.order.status === "cancelled" && view.order.cancelledAt
      ? { cancelledAtText: formatDateTime(view.order.cancelledAt) }
      : {}),
    ...(!showPickupEta ||
    pickupEta?.minutes === null ||
    pickupEta?.minutes === undefined
      ? {}
      : { etaMain: `預計 ${pickupEta.minutes} 分鐘抵達` }),
    ...(!showPickupEta ||
    !pickupEta?.calculatedAt ||
    !Number.isFinite(Date.parse(pickupEta.calculatedAt))
      ? {}
      : { etaSub: `更新於 ${formatDateTime(pickupEta.calculatedAt)}` }),
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
    mapState: ["cancelled", "dispatch_timeout"].includes(view.order.status)
      ? "missing"
      : view.tracking !== undefined
        ? !view.tracking?.location ||
          view.tracking.locationFreshness === "missing"
          ? "missing"
          : view.tracking.locationFreshness === "fresh"
            ? "fresh"
            : "stale"
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

export function mapNativePassengerPayment(
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

export function mapNativePassengerCertificate(
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
  if (!record || typeof record !== "object") {
    return {
      state: "pending",
      ...(receipt.receiptNo ? { receiptNo: receipt.receiptNo } : {}),
      ...("receiptUrl" in receipt && typeof receipt.receiptUrl === "string"
        ? { htmlUrl: receipt.receiptUrl }
        : {}),
      ...("htmlUrl" in receipt && typeof receipt.htmlUrl === "string"
        ? { htmlUrl: receipt.htmlUrl }
        : {}),
      ...("pdfUrl" in receipt && typeof receipt.pdfUrl === "string"
        ? { pdfUrl: receipt.pdfUrl }
        : {}),
    };
  }
  const e04 = record.e04Snapshot;
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

export const NATIVE_P5_QUOTE_ANOMALY_ERROR_CODES = [
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

export function resolveNativePassengerScreenId(
  rawView: NativePassengerRideAuthorityInput,
  kind: "ride" | "fares" | "receipt",
  quoteAnomalyCode?: string | null,
): PassengerScreenId {
  const view = unwrapNativePassengerRideAuthority(rawView);
  if (!view || !view.order) return "P5-01";
  if (kind === "fares") return "A03";
  if (kind === "receipt") return "P5-10";
  if (view.order.status === "cancelled") {
    return "P5-01";
  }
  if (view.order.status === "completed") return view.rating ? "P5-09" : "P5-08";
  const effectiveAnomaly =
    quoteAnomalyCode ||
    view.quoteAnomalyCode ||
    view.order.fareQuoteAnomaly ||
    view.fareQuoteAnomaly;

  if (
    effectiveAnomaly &&
    NATIVE_P5_QUOTE_ANOMALY_ERROR_CODES.includes(
      effectiveAnomaly as (typeof NATIVE_P5_QUOTE_ANOMALY_ERROR_CODES)[number],
    )
  ) {
    return "A04";
  }
  if (view.receipt) return "P5-10";
  if (view.order.status === "on_trip") return "P5-07";
  if (view.order.status === "arrived_pickup") return "P5-06";
  if (view.order.status === "dispatch_timeout") return "P5-01";
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

export function nativePassengerScreenTitle(screenId: PassengerScreenId) {
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
    dispatch_timeout: "派車逾時",
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

export function retainNativePassengerQuoteAnomaly(
  fixture: PassengerRideFixture,
  errorCode: string = "P5_QUOTE_PROVIDER_UNAVAILABLE",
): PassengerRideFixture {
  return {
    ...fixture,
    screenId: "A04",
    title: nativePassengerScreenTitle("A04"),
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

export type NativePassengerConnectionState =
  | "connecting"
  | "connected"
  | "disconnected";

export interface NativePassengerLocationPresentation {
  state: "fresh" | "stale" | "missing";
  calculatedAtMs: number;
  elapsedSeconds: number | null;
}

/** Prefer the actual GPS observation time. Older producers retain their
 * captured assignment fallback; stream receipt time never renews a GPS fix. */
export function getPassengerLocationRecordedAt(
  fixture: PassengerRideFixture,
): string | null {
  if (["行程已取消", "行程已完成"].includes(fixture.status)) return null;
  return fixture.tracking === undefined
    ? (fixture.assignment?.eta.calculatedAt ?? null)
    : (fixture.tracking?.location?.recordedAt ?? null);
}

/** Age the location observation rather than the transport receipt. */
export function getNativePassengerLocationPresentation(
  fixture: PassengerRideFixture,
  nowMs: number,
  connectionState: NativePassengerConnectionState,
): NativePassengerLocationPresentation {
  if (fixture.status === "行程已取消" || fixture.mapState === "missing") {
    return { state: "missing", calculatedAtMs: 0, elapsedSeconds: null };
  }
  const rawTime = getPassengerLocationRecordedAt(fixture);
  const parsedTime = rawTime ? Date.parse(rawTime) : NaN;
  const calculatedAtMs = Number.isFinite(parsedTime) ? parsedTime : 0;
  const elapsedSeconds =
    calculatedAtMs > 0
      ? Math.max(0, Math.floor((nowMs - calculatedAtMs) / 1000))
      : null;
  const fresh =
    fixture.mapState === "fresh" &&
    calculatedAtMs > 0 &&
    elapsedSeconds !== null &&
    elapsedSeconds < 60 &&
    connectionState === "connected";
  return {
    state: fresh ? "fresh" : "stale",
    calculatedAtMs,
    elapsedSeconds,
  };
}

/** Join only explicit existing download URLs onto captured receipt facts. */
export function joinNativePassengerReceiptDownloads(
  receipt: MultiTaxiElectronicReceipt | null,
  downloads: PassengerReceiptResponse | null,
): MultiTaxiElectronicReceipt | null {
  if (!receipt || !downloads) return receipt;
  return {
    ...receipt,
    record: {
      ...receipt.record,
      ...(downloads.htmlUrl || downloads.receiptUrl
        ? { htmlUrl: downloads.htmlUrl || downloads.receiptUrl }
        : {}),
      ...(downloads.pdfUrl ? { pdfUrl: downloads.pdfUrl } : {}),
    },
  };
}

export interface NativePassengerRidePresentation {
  fixture: PassengerRideFixture;
  /** CancelledCard/CancelledActions replace active trip content in accepted Web. */
  contentKind: "cancelled_terminal" | "p5_screen";
  showActiveTripContent: boolean;
  location: NativePassengerLocationPresentation;
  receiptFormats: Array<"html" | "pdf">;
}

export interface NativePassengerRidePresentationOptions {
  nowMs: number;
  connectionState: NativePassengerConnectionState;
  kind?: "ride" | "fares" | "receipt";
  quoteAnomalyCode?: string | null;
  receiptDownloads?: PassengerReceiptResponse | null;
}

export function mapNativePassengerRidePresentation(
  rawView: NativePassengerRideAuthorityInput,
  token: string,
  options: NativePassengerRidePresentationOptions,
): NativePassengerRidePresentation {
  const view = unwrapNativePassengerRideAuthority(rawView);
  const receipt = joinNativePassengerReceiptDownloads(
    view.receipt,
    options.receiptDownloads || null,
  );
  const fixture = mapNativePassengerRideAuthorityToFixture(
    { ...view, receipt },
    token,
    options.kind || "ride",
    options.quoteAnomalyCode,
  );
  const cancelled = view.order.status === "cancelled";
  const certificate = fixture.certificate;
  const receiptFormats: Array<"html" | "pdf"> = [];
  if (!cancelled && certificate?.state === "available") {
    if (certificate.htmlUrl) receiptFormats.push("html");
    if (certificate.pdfUrl) receiptFormats.push("pdf");
  }
  return {
    fixture,
    contentKind: cancelled ? "cancelled_terminal" : "p5_screen",
    showActiveTripContent: !cancelled,
    location: getNativePassengerLocationPresentation(
      fixture,
      options.nowMs,
      options.connectionState,
    ),
    receiptFormats,
  };
}

export interface NativePassengerRideEventState {
  /** Reset after the authority read for a new connection or ride/account change. */
  lastEventVersion: number;
  presentation: NativePassengerRidePresentation | null;
}

/** Assignment generations and event timestamps do not order the passenger stream. */
export function reduceNativePassengerRideEvent(
  previous: NativePassengerRideEventState,
  event: PassengerRideSseEventEnvelope,
  token: string,
  options: NativePassengerRidePresentationOptions,
): NativePassengerRideEventState {
  if (
    !Number.isFinite(event.eventVersion) ||
    event.eventVersion <= previous.lastEventVersion
  ) {
    return previous;
  }
  return {
    lastEventVersion: event.eventVersion,
    presentation: mapNativePassengerRidePresentation(
      event.data,
      token,
      options,
    ),
  };
}
