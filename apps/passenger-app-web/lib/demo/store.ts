import type { FareVersion, ResolvedAddressPayload } from "@drts/contracts";
import type { DemoComplaint, DemoReceipt, DemoRide, DemoState } from "./types";

export const DEMO_OTP_CODE = "123456";
export const DEMO_STORAGE_KEY = "drts.passenger.functional-demo.v1";
export const DEMO_CHANGE_EVENT = "drts-passenger-demo-change";

export const DEMO_FARE: FareVersion = {
  version: "demo-tariff-v1",
  effectiveAt: "2026-01-01T00:00:00+08:00",
  baseFare: 100,
  baseDistanceMeters: 1000,
  distanceRate: 20,
  distanceIncrementMeters: 1000,
  delayRate: 5,
  delayIncrementSeconds: 60,
  nightSurcharge: 20,
  nightSurchargeWindowStart: "23:00",
  nightSurchargeWindowEnd: "06:00",
  additionalFees: {},
};

/** These labels are fictional meeting points, not provider geocoding results. */
export const DEMO_ADDRESSES: ResolvedAddressPayload[] = [
  {
    address: "示意起點：台北中央廣場",
    lat: 25.0478,
    lng: 121.517,
    addressId: "demo-central",
  },
  {
    address: "示意目的地：信義展示中心",
    lat: 25.0338,
    lng: 121.5645,
    addressId: "demo-exhibition",
  },
  {
    address: "示意地點：河畔公園入口",
    lat: 25.064,
    lng: 121.539,
    addressId: "demo-park",
  },
].map((address) => ({
  ...address,
  coordinateSource: "provider_candidate" as const,
  geocodeConfidence: "approximate" as const,
  geocodeProvider: "demo",
  providerCandidateId: address.addressId,
  surface: "passenger_entry" as const,
  resolvedAt: "2026-01-01T00:00:00Z",
}));

let browserMemory: DemoState | null = null;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function demoId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function initialState(): DemoState {
  return {
    version: 1,
    enabled: true,
    loggedIn: false,
    account: {
      drtsPassengerId: demoId("demo-passenger"),
      displayName: "示範乘客",
      contactPhone: "0900000000",
      contactPhoneVerified: false,
      status: "active",
      createdAt: new Date().toISOString(),
    },
    identities: [],
    paymentMethods: [],
    bindingMethods: {},
    rides: [],
    quotes: [],
    otp: null,
    oauth: null,
    requestRides: {},
  };
}

function publish(state: DemoState) {
  if (typeof window === "undefined") throw new Error("demo_requires_browser");
  // One persisted record contains both the enable flag and the journey. A
  // failed write must not report success or enable a half-written demo.
  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  browserMemory = clone(state);
  window.dispatchEvent(new Event(DEMO_CHANGE_EVENT));
}

export function isDemoMode(): boolean {
  return getDemoState()?.enabled === true;
}

/** Reading or server rendering never creates a demo session. */
export function getDemoState(): DemoState | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (saved) {
      const state = JSON.parse(saved) as DemoState;
      if (state.version === 1 && Array.isArray(state.rides) && state.account) {
        state.bindingMethods ??= {};
        browserMemory = state;
        return clone(state);
      }
      return null;
    }
    browserMemory = null;
    return null;
  } catch {
    // A transient read failure retains the established mode of this tab.
  }
  return browserMemory ? clone(browserMemory) : null;
}

export function startDemo(): DemoState {
  if (typeof window === "undefined") throw new Error("demo_requires_browser");
  const state = getDemoState() ?? initialState();
  state.enabled = true;
  publish(state);
  return clone(state);
}

export function stopDemo(): void {
  const state = getDemoState();
  if (state) {
    state.enabled = false;
    publish(state);
  }
}

export function resetDemo(): DemoState {
  const state = initialState();
  publish(state);
  return clone(state);
}

export function updateDemoState<T>(change: (state: DemoState) => T): T {
  const state = getDemoState();
  if (!state || !isDemoMode()) throw new Error("demo_mode_inactive");
  const result = change(state);
  publish(state);
  return result;
}

export function subscribeDemo(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(DEMO_CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(DEMO_CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

function changeRide(id: string, change: (ride: DemoRide) => void): DemoRide {
  return updateDemoState((state) => {
    const ride = state.rides.find((item) => item.id === id);
    if (!ride) throw new Error("demo_ride_not_found");
    change(ride);
    return clone(ride);
  });
}

export function advanceDemoRide(id: string): DemoRide {
  return changeRide(id, (ride) => {
    const stages = [
      "reserved",
      "assigned",
      "arrived",
      "in_progress",
      "completed",
    ] as const;
    const next =
      stages[stages.findIndex((status) => status === ride.status) + 1];
    if (ride.status === "cancelled" || !next) return;
    ride.status = next;
    if (next === "completed") {
      ride.completedAt = new Date().toISOString();
      if (ride.paymentStatus !== "failed") ride.paymentStatus = "paid";
    }
  });
}

export function cancelDemoRide(id: string): DemoRide {
  return changeRide(id, (ride) => {
    if (["in_progress", "completed"].includes(ride.status))
      throw new Error("demo_ride_not_cancelable");
    ride.status = "cancelled";
    ride.cancelledAt ??= new Date().toISOString();
  });
}

export function setDemoPaymentFailure(id: string): DemoRide {
  return changeRide(id, (ride) => {
    if (ride.status !== "completed") throw new Error("demo_ride_not_completed");
    ride.paymentStatus = "failed";
  });
}

export function retryDemoPayment(id: string): DemoRide {
  return changeRide(id, (ride) => {
    if (ride.status !== "completed") throw new Error("demo_ride_not_completed");
    ride.paymentStatus = "paid";
  });
}

export function rateDemoRide(
  id: string,
  rating: number,
  comment = "",
  contactRequested = false,
): DemoRide {
  return changeRide(id, (ride) => {
    if (
      ride.status !== "completed" ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    )
      throw new Error("demo_rating_invalid");
    ride.rating = rating;
    ride.ratingComment = comment;
    ride.contactRequested = contactRequested;
    if (
      rating <= 2 &&
      contactRequested &&
      !ride.complaints.some((item) => item.id === `demo-rating-${ride.id}`)
    )
      ride.complaints.push({
        id: `demo-rating-${ride.id}`,
        category: "service",
        content: comment || "示意低評價協助請求",
        contactConsent: true,
        createdAt: new Date().toISOString(),
        status: "received",
      });
  });
}

export function addDemoComplaint(
  id: string,
  input: Pick<
    DemoComplaint,
    "category" | "content" | "lostItemDescription" | "contactConsent"
  >,
): DemoComplaint {
  if (!input.content.trim()) throw new Error("demo_complaint_empty");
  const complaint: DemoComplaint = {
    ...input,
    id: demoId("demo-complaint"),
    createdAt: new Date().toISOString(),
    status: "received",
  };
  changeRide(id, (ride) => {
    ride.complaints.push(complaint);
  });
  return clone(complaint);
}

export function getDemoReceipt(id: string): DemoReceipt {
  const ride = getDemoState()?.rides.find((item) => item.id === id);
  if (!ride) throw new Error("demo_ride_not_found");
  if (
    ride.status !== "completed" ||
    !ride.completedAt ||
    ride.paymentStatus !== "paid"
  )
    throw new Error("demo_receipt_not_ready");
  return {
    id: `demo-receipt-${ride.id}`,
    rideId: ride.id,
    orderNo: ride.orderNo,
    issuedAt: ride.completedAt,
    operator: ride.operator,
    driverName: ride.driver.name,
    driverCredential: "示意資格 DEMO-***001",
    vehiclePlate: ride.driver.plate,
    pickup: ride.origin.address,
    destination: ride.destination.address,
    scheduledAt: ride.scheduledAt,
    completedAt: ride.completedAt,
    paymentMethod:
      ride.paymentStatus === "paid"
        ? "示意信用卡（模擬付款完成）"
        : "示意信用卡（模擬付款失敗）",
    amount: ride.amount,
    currency: "TWD",
    lines: [
      { label: "示意起跳費", amount: DEMO_FARE.baseFare },
      { label: "示意里程費", amount: ride.amount - DEMO_FARE.baseFare },
      { label: "示意延滯費", amount: 0 },
      { label: "示意夜間加成", amount: 0 },
    ],
    notice:
      "功能示範：全部營運、司機與付款資料均為虛構，未實際派車、扣款或開立正式憑證。",
  };
}
