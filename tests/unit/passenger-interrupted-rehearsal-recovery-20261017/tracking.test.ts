import { EventEmitter } from "node:events";
import type { Page, TestInfo } from "@playwright/test";
import { expect, it, vi } from "vitest";
import { trackInterruptedRehearsal } from "../../e2e/pax-review-shared-order/interrupted-rehearsal-finalizer";

it("waits for the new booking acknowledgement and never finalizes history or refused bookings", async () => {
  const emitter = new EventEmitter();
  const offline = vi.fn();
  const page = Object.assign(emitter, {
    context: () => ({ setOffline: offline }),
  }) as unknown as Page;
  const attach = vi.fn();
  const info = {
    outputDir: "/unused-local-browser-output",
    attach,
  } as unknown as TestInfo;
  const id = "1534dbdf-1048-430d-b84a-0f1e7fb3619c";
  const operations = {
    read: vi
      .fn()
      .mockResolvedValue({ order: { orderId: id, status: "cancelled" } }),
    cancel: vi.fn(),
  };
  const finish = trackInterruptedRehearsal(
    page,
    info,
    "https://passenger.invalid",
    operations,
  );
  const response = (
    method: string,
    status: number,
    pathname: string,
    body: unknown,
  ) => ({
    request: () => ({ method: () => method }),
    status: () => status,
    url: () => `https://passenger.invalid${pathname}`,
    json: async () => body,
  });
  emitter.emit(
    "response",
    response("GET", 200, "/api/passenger-app/rides", {
      data: { ride: { order: { orderId: "historical" } } },
    }),
  );
  emitter.emit(
    "response",
    response("POST", 409, "/api/passenger-app/rides", {
      data: { ride: { order: { orderId: "refused" } } },
    }),
  );
  emitter.emit(
    "response",
    response("POST", 201, "/api/passenger-app/rides", {
      data: { ride: { order: { order_id: id } } },
    }),
  );
  await finish();
  expect(offline).toHaveBeenCalledWith(false);
  expect(operations.read).toHaveBeenCalledExactlyOnceWith(id);
  expect(operations.cancel).not.toHaveBeenCalled();
  expect(JSON.parse(attach.mock.calls[0]![1].body)).toMatchObject({
    originalJourneyStillFailed: true,
    onlyNewOrdersCreatedByThisJourney: [id],
    recordsDeleted: false,
    unknownAcknowledgements: 0,
  });
});
