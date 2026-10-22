import { expect, it } from "vitest";
import { displayOrderNo } from "../../../apps/referral-embed-web/lib/order-display";

it("shortens an owned-mobility O-<uuid> order number to its first eight hex digits", () => {
  expect(displayOrderNo("O-e05fb26b-4fc8-40c7-8cdb-cf66110c79aa")).toBe(
    "O-E05FB26B",
  );
});

it("leaves any other order number format as it is", () => {
  for (const orderNo of [
    "PT-9F20K7",
    "DRTS-20261009-001",
    "N-UNIT",
    "O-e05fb26b",
    "e05fb26b-4fc8-40c7-8cdb-cf66110c79aa",
  ])
    expect(displayOrderNo(orderNo)).toBe(orderNo);
});
