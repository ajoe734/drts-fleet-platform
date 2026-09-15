/**
 * Passenger Web Push service worker (SR-PUSH-WEBPUSH-20260915).
 *
 * Displays a notification for a push received while the passenger's ride
 * tab is closed/backgrounded, and focuses (or opens) that ride's page on
 * click. The push payload's shape is produced by
 * `apps/api/src/modules/multi-taxi/web-push.transport.ts` and is always
 * plaintext-JSON *after* the browser decrypts the aes128gcm envelope — this
 * worker never sees ciphertext.
 */

const EVENT_TYPE_LABELS = {
  assignment_disclosure_ready: "已為您指派車輛",
  assignment_replaced: "已為您重新指派車輛",
  eta_changed: "預計抵達時間已更新",
  driver_arrived: "司機已抵達上車地點",
  receipt_ready: "電子乘車證明已產生",
};

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const eventType = typeof data.eventType === "string" ? data.eventType : null;
  const orderId = typeof data.orderId === "string" ? data.orderId : null;
  const title = (eventType && EVENT_TYPE_LABELS[eventType]) || "行程狀態更新";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: "點按查看最新行程狀態",
      tag: orderId ? `drts-ride-${orderId}` : "drts-ride-update",
      // Collapses repeated updates for the same ride into one notification
      // instead of stacking a growing pile the passenger has to dismiss one
      // by one.
      renotify: true,
      data: { orderId },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      // The push payload deliberately carries no ride access token (the
      // server only ever persists that token's digest, never the raw
      // value, so it cannot be replayed into a deep link here). The best
      // this worker can do without one is refocus an already-open ride
      // tab; it cannot open a fresh `/ride/[token]` URL it was never given.
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const rideTab = clientsList.find((client) => client.url.includes("/ride/"));
      await (rideTab ?? clientsList[0])?.focus();
    })(),
  );
});
