/**
 * Passenger Web Push subscription lifecycle (SR-PUSH-WEBPUSH-20260915).
 *
 * The subscription is bound to the ride's own access token: it is created
 * only after the passenger explicitly grants notification permission on
 * their `/ride/[token]` page, registered server-side against that same
 * token (`MultiTaxiService.registerPassengerPushSubscription`), and its
 * validity follows that token's own expiry — there is no separate device
 * registration step and no external push vendor involved.
 */

const PASSENGER_PROXY_BASE = "/control-plane-proxy";
const SERVICE_WORKER_URL = "/sw.js";

export type PassengerPushSubscribeResult =
  | { status: "subscribed" }
  | { status: "unsupported" }
  | { status: "permission_denied" }
  | { status: "vapid_unavailable" }
  | { status: "error"; message: string };

export function isWebPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Converts a base64url VAPID public key into the Uint8Array PushManager expects. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

async function fetchVapidPublicKey(): Promise<string | null> {
  const response = await fetch(
    `${PASSENGER_PROXY_BASE}/multi-taxi/push/vapid-public-key`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as {
    data?: { publicKey?: string | null };
  };
  return payload.data?.publicKey ?? null;
}

/**
 * Requests notification permission (must be called from a user gesture),
 * subscribes to Web Push, and registers the subscription against the ride
 * access token. Idempotent: re-subscribing on an already-subscribed browser
 * simply replaces the server-side record with the current subscription.
 */
export async function subscribePassengerPush(
  token: string,
): Promise<PassengerPushSubscribeResult> {
  if (!isWebPushSupported()) {
    return { status: "unsupported" };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { status: "permission_denied" };
    }

    const vapidPublicKey = await fetchVapidPublicKey();
    if (!vapidPublicKey) {
      return { status: "vapid_unavailable" };
    }

    const registration = await navigator.serviceWorker.register(
      SERVICE_WORKER_URL,
    );
    await navigator.serviceWorker.ready;

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));

    const subscriptionJson = subscription.toJSON();
    const endpoint = subscriptionJson.endpoint;
    const p256dh = subscriptionJson.keys?.p256dh;
    const auth = subscriptionJson.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return {
        status: "error",
        message: "PASSENGER_PUSH_SUBSCRIPTION_MALFORMED",
      };
    }

    const response = await fetch(
      `${PASSENGER_PROXY_BASE}/passenger-rides/${encodeURIComponent(token)}/push-subscriptions`,
      {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint, keys: { p256dh, auth } }),
      },
    );
    if (!response.ok) {
      return {
        status: "error",
        message: `PASSENGER_PUSH_SUBSCRIPTION_REQUEST_FAILED_${response.status}`,
      };
    }
    return { status: "subscribed" };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "PASSENGER_PUSH_SUBSCRIPTION_FAILED",
    };
  }
}

export async function unsubscribePassengerPush(token: string): Promise<void> {
  if (!isWebPushSupported()) {
    return;
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration(
      SERVICE_WORKER_URL,
    );
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } finally {
    await fetch(
      `${PASSENGER_PROXY_BASE}/passenger-rides/${encodeURIComponent(token)}/push-subscriptions`,
      { method: "DELETE", cache: "no-store" },
    ).catch(() => undefined);
  }
}
