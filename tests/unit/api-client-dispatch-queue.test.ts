import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DISPATCH_QUEUE_ELIGIBILITY_DECISIONS,
  DISPATCH_QUEUE_ELIGIBILITY_REASON_CODES,
} from "../../packages/contracts/src";
import { ApiClient } from "../../packages/api-client/src";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MTX-QUEUE-003 dispatch queue API contract", () => {
  it("publishes a closed fail-closed eligibility vocabulary", () => {
    expect(DISPATCH_QUEUE_ELIGIBILITY_DECISIONS).toEqual([
      "eligible",
      "denied",
    ]);
    expect(DISPATCH_QUEUE_ELIGIBILITY_REASON_CODES).toContain(
      "MULTI_TAXI_QUEUE_MODE_FORBIDDEN",
    );
    expect(DISPATCH_QUEUE_ELIGIBILITY_REASON_CODES).toContain(
      "QUEUE_ELIGIBILITY_AUTHORITY_UNAVAILABLE",
    );
  });

  it("uses the canonical authenticated queue list and detail endpoints", async () => {
    const queueEntry = {
      queueEntryId: "queue/entry-001",
      vehicleId: "veh-demo-001",
      siteId: "north-station",
      runtimeProfileCode: "ordinary_taxi",
      queueMode: "physical_rank",
      operatingAuthorizationId: null,
      status: "checked_in",
      position: 1,
      checkedInAt: "2026-07-24T09:00:00.000Z",
      checkedOutAt: null,
      driverId: "drv-demo-001",
      driverName: "Driver One",
      vehiclePlateNo: "TAXI-001",
      serviceAreaCode: "TPE",
      lastUpdatedAt: "2026-07-24T09:00:00.000Z",
      eligibility: {
        decision: "eligible",
        reasonCode: null,
        evaluatedAt: "2026-07-24T09:00:01.000Z",
      },
      availableActions: [],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      const data =
        path === "/api/dispatch/queue" ? { items: [queueEntry] } : queueEntry;
      return {
        ok: true,
        json: async () => ({ data }),
        text: async () => "",
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient({
      baseUrl: "http://localhost:3001",
      defaultHeaders: {
        "x-actor-type": "ops_user",
        "x-actor-id": "ops-queue-001",
        "x-realm": "ops",
        "x-scopes": "dispatch:read",
      },
    });

    await expect(client.listDispatchQueueEntries()).resolves.toEqual([
      queueEntry,
    ]);
    await expect(
      client.getDispatchQueueEntry(queueEntry.queueEntryId),
    ).resolves.toEqual(queueEntry);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3001/api/dispatch/queue",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/api/dispatch/queue/queue%2Fentry-001",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
