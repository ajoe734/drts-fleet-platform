import { expect, it, vi } from "vitest";
import { bookingResponseDiagnostic } from "../../e2e/pax-review-shared-order/booking-diagnostic";

it.each([
  [
    409,
    { error: { code: "MULTI_TAXI_AUTHORIZATION_AMBIGUOUS" } },
    "MULTI_TAXI_AUTHORIZATION_AMBIGUOUS",
  ],
  [
    409,
    { error: { code: "SERVICE_PRODUCT_INACTIVE" } },
    "SERVICE_PRODUCT_INACTIVE",
  ],
  [409, { error: { code: "pending_payment_block" } }, "pending_payment_block"],
  [403, { error: "CSRF_CHECK_FAILED" }, "CSRF_CHECK_FAILED"],
  [409, { error: { code: "synthetic_secret" } }, "unclassified"],
  [409, { error: "synthetic_secret" }, "unclassified"],
  [409, { error: { code: { secret: "synthetic_secret" } } }, "unclassified"],
  [409, null, "unclassified"],
] as const)(
  "reports only fixed public code for HTTP %s",
  async (status, payload, code) => {
    const body = payload && {
      ...payload,
      message: "synthetic_secret",
      details: { authorization: "synthetic_secret" },
    };
    expect(
      await bookingResponseDiagnostic({
        status: () => status,
        json: async () => body,
      }),
    ).toBe(`Passenger booking status=${status} code=${code}`);
  },
);

it("preserves the HTTP failure when its response is not JSON", async () => {
  expect(
    await bookingResponseDiagnostic({
      status: () => 502,
      json: async () => {
        throw new Error("synthetic_secret");
      },
    }),
  ).toBe("Passenger booking status=502 code=unclassified");
});

it("does not inspect successful booking responses", async () => {
  const json = vi.fn();
  expect(await bookingResponseDiagnostic({ status: () => 201, json })).toBe(
    "Passenger booking status=201 code=unclassified",
  );
  expect(json).not.toHaveBeenCalled();
});
