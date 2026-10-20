import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { paymentRuntimeFromEnv } from "../../../apps/api/src/modules/passenger-app/payment/payment-runtime.config";
import { paymentCapturePolicyFromEnv } from "../../../apps/api/src/modules/passenger-app/payment/payment-capture.config";
import { otpOptionsFromEnv } from "../../../apps/api/src/modules/passenger-app/otp/passenger-otp.service";

const profile = JSON.parse(
  readFileSync(
    new URL(
      "../../../apps/api/src/modules/passenger-app/review-demo/simulation-profile.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const publicEnv = Object.fromEntries(
  Object.entries({ ...profile.otp, ...profile.payment }).map(([key, value]) => [
    key,
    typeof value === "string" ? value : JSON.stringify(value),
  ]),
);
const base = {
  NODE_ENV: "production",
  DRTS_ENV: "development",
  PAX_REVIEW_DEMO_ENABLED: "true",
  PSP_PROVIDER: "fake",
  PAX_PAYMENT_CAPTURE_ENABLED: "true",
  PAX_PAYMENT_CAPTURE_POLICY: JSON.stringify({
    retryDelaysMs: [60000],
    retryDefinitiveDeclines: false,
    unknownReadbackDelaysMs: [1000, 3000],
  }),
};

it("an absent optional provider group cannot silently start capture; the explicit public simulation profile satisfies the original readers and stable replica cipher", async () => {
  const unavailable = paymentRuntimeFromEnv(base);
  expect(unavailable.provider.available).toBe(false);
  expect(() => paymentCapturePolicyFromEnv(base, unavailable)).toThrow(
    "payment_capture_configuration_unavailable",
  );
  const selected = { ...base, ...publicEnv };
  const first = paymentRuntimeFromEnv(selected);
  const peer = paymentRuntimeFromEnv(selected);
  expect(paymentCapturePolicyFromEnv(selected, first)?.retryDelaysMs).toEqual([
    60000,
  ]);
  expect(otpOptionsFromEnv(selected).pepper.length).toBeGreaterThanOrEqual(32);
  const bound = await first.provider.bind(
    "synthetic_credential_review_retry_profile",
    "profile-bind",
  );
  expect(bound.status).toBe("completed");
  if (bound.status !== "completed") throw new Error("profile bind failed");
  const encrypted = first.cipher!.encrypt(
    bound.card.token,
    "synthetic-owner",
    "synthetic-method",
  );
  expect(
    peer.cipher!.decrypt(encrypted, "synthetic-owner", "synthetic-method"),
  ).toBe(bound.card.token);
  const capture = {
    token: bound.card.token,
    amountMinor: 8500,
    currency: "TWD" as const,
    idempotencyKey: "profile-order",
  };
  expect(
    await first.provider.capture({ ...capture, attemptCount: 1 }),
  ).toMatchObject({ status: "failed" });
  expect(
    await peer.provider.capture({ ...capture, attemptCount: 2 }),
  ).toMatchObject({ status: "completed" });
  expect(() =>
    paymentRuntimeFromEnv({ ...selected, DRTS_ENV: "production" }),
  ).toThrow();
});
