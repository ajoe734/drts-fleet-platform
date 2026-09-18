import {
  getIamActorScopePreset,
  getIamScopeDefinition,
  type MultiTaxiTripOperationalAdminView,
  type MultiTaxiTripOperationalRecordQuery,
} from "@drts/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { BootstrapAuthGuard } from "../../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { MultiTaxiController } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.controller";
import type { MultiTaxiService } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import {
  buildRecordsQueryPath,
  getApiErrorMessage,
  getVisibleRetentionCoverage,
  isPermissionError,
} from "../../../../apps/platform-admin-web/app/platform-admin/p5/records/records-operations-model";
import { ApiClient, ApiClientError } from "../../../../packages/api-client/src";
import { issueControlPlaneRequestAuth } from "../../../../packages/control-plane-auth/src";

// Controlled transport evidence only: no deployed IAP identity, database, or
// completed live trip is represented by these explicit regression resource IDs.
const RECORD_ID = "sr-admin-verify-p5-record-001";
const ORDER_ID = "sr-admin-verify-p5-order-001";
const REQUEST_ID = "sr-admin-verify-p5-request-001";
const BASE_URL = "https://sr-admin-verify-p5.test";

function operationalRecord(
  overrides: Partial<MultiTaxiTripOperationalAdminView> = {},
): MultiTaxiTripOperationalAdminView {
  return {
    recordId: RECORD_ID,
    orderId: ORDER_ID,
    orderNo: "SR-ADMIN-VERIFY-P5-001",
    tripId: "sr-admin-verify-p5-trip-001",
    assignmentId: null,
    vehicleId: "sr-admin-verify-p5-vehicle-001",
    plateNo: "TEST-P5-001",
    reservedAt: "2026-09-06T00:00:00.000Z",
    pickupAt: "2026-09-06T00:10:00.000Z",
    dropoffAt: "2026-09-06T00:30:00.000Z",
    route: {
      encodedPolyline: null,
      pointCount: 0,
      distanceMeters: 10000,
      durationSeconds: 1200,
      source: "driver_gps",
    },
    payableFareMinor: 35000,
    actualFareMinor: 35000,
    tollMinor: 0,
    currency: "TWD",
    farePolicyVersion: "sr-admin-verify-p5-fare-001",
    chargingMode: "meter",
    generatedAt: "2026-09-06T00:30:00.000Z",
    retainUntil: "2028-09-05T00:30:00.000Z",
    legalHold: {
      state: "none",
      family: "proof_bundle",
      subjectId: ORDER_ID,
      activeHoldCount: 0,
      activeHolds: [],
    },
    ...overrides,
  };
}

function installRecordsTransport(
  records: MultiTaxiTripOperationalAdminView[],
  scopes = ["foundation:read", "multi_taxi_records:read"],
) {
  const listTripOperationalRecords = vi
    .fn<
      (
        query: MultiTaxiTripOperationalRecordQuery,
      ) => Promise<MultiTaxiTripOperationalAdminView[]>
    >()
    .mockResolvedValue(records);
  const controller = new MultiTaxiController({
    listTripOperationalRecords,
  } as unknown as MultiTaxiService);
  const reflector = {
    getAllAndOverride: <T>(key: string, targets: object[]): T | undefined => {
      for (const target of targets) {
        const value = Reflect.getMetadata(key, target) as T | undefined;
        if (value !== undefined) return value;
      }
      return undefined;
    },
  };
  const guard = new BootstrapAuthGuard(
    reflector as ConstructorParameters<typeof BootstrapAuthGuard>[0],
  );
  const transport = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe(BASE_URL);
    expect(url.pathname).toBe("/api/platform-admin/multi-taxi-trip-records");
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const request = {
      method: init?.method,
      originalUrl: url.pathname + url.search,
      headers,
    };
    try {
      // This HTTP-only test context implements the methods used by the guard.
      // RPC, WebSocket, and argument-list adapters are outside this transport.
      await guard.canActivate({
        getClass: () => MultiTaxiController,
        getHandler: () => controller.listTripOperationalRecords,
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as Parameters<BootstrapAuthGuard["canActivate"]>[0]);
      const envelope = await controller.listTripOperationalRecords(
        Object.fromEntries(url.searchParams.entries()),
        headers["x-request-id"],
      );
      return Response.json(envelope);
    } catch (error) {
      if (!(error instanceof ApiRequestError)) throw error;
      return Response.json(error.getResponse(), { status: error.getStatus() });
    }
  });
  vi.stubGlobal("fetch", transport);
  const auth = issueControlPlaneRequestAuth({
    actorType: "platform_admin",
    requestId: REQUEST_ID,
  });
  const client = new ApiClient({
    baseUrl: BASE_URL,
    defaultHeaders: {
      ...auth.headers,
      "x-scopes": scopes.join(","),
      "x-request-id": REQUEST_ID,
    },
  });
  return { client, listTripOperationalRecords, transport };
}

beforeEach(() => {
  vi.stubEnv("DRTS_ENV", "test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("SR-ADMIN-VERIFY-001 P5 current authority and API boundary", () => {
  it("keeps the merged P5 read/export scopes grantable only to the platform preset", () => {
    for (const scope of [
      "multi_taxi_records:read",
      "multi_taxi_records:export",
    ]) {
      expect(getIamScopeDefinition(scope)?.allowedRealms).toEqual([
        "system",
        "platform",
      ]);
      expect(getIamActorScopePreset("platform_admin")).toContain(scope);
      expect(getIamActorScopePreset("ops_user")).not.toContain(scope);
      expect(getIamActorScopePreset("tenant_admin")).not.toContain(scope);
      expect(
        issueControlPlaneRequestAuth({ actorType: "platform_admin" }).identity
          .scopes,
      ).toContain(scope);
    }
  });

  it("queries with read authority and unwraps the real controller list envelope", async () => {
    const record = operationalRecord();
    const { client, listTripOperationalRecords, transport } =
      installRecordsTransport([record]);
    const path = buildRecordsQueryPath({
      month: " 2026-09 ",
      q: ` ${ORDER_ID} `,
      legalHold: "none",
    });
    const response = await client.getEnvelope<{
      items: MultiTaxiTripOperationalAdminView[];
    }>(path);

    expect(response.meta.requestId).toBe(REQUEST_ID);
    expect(response.data.items).toEqual([record]);
    expect(response.data).toMatchObject({
      pageInfo: { totalItems: 1, totalPages: 1 },
    });
    expect(listTripOperationalRecords).toHaveBeenCalledExactlyOnceWith({
      month: "2026-09",
      q: ORDER_ID,
      legalHold: "none",
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(getVisibleRetentionCoverage(response.data.items, true)).toEqual({
      covered: 1,
      total: 1,
      percent: 100,
    });
  });

  it("loads a genuine empty response as zero rows without inventing 100% coverage", async () => {
    const { client } = installRecordsTransport([]);
    const response = await client.get<{
      items: MultiTaxiTripOperationalAdminView[];
    }>(buildRecordsQueryPath({}));

    expect(response.items).toEqual([]);
    expect(response).toMatchObject({
      pageInfo: { totalItems: 0, totalPages: 0 },
    });
    expect(getVisibleRetentionCoverage(response.items, true)).toBeNull();
  });

  it("rejects foundation-only authority before querying records and preserves the permission error", async () => {
    const { client, listTripOperationalRecords } = installRecordsTransport(
      [operationalRecord()],
      ["foundation:read"],
    );
    const error = await client
      .get(buildRecordsQueryPath({}))
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ statusCode: 403, code: "AUTH_SCOPE_DENIED" });
    expect(isPermissionError(error)).toBe(true);
    expect(getApiErrorMessage(error, "fallback")).not.toBe("fallback");
    expect(listTripOperationalRecords).not.toHaveBeenCalled();
    expect(
      getVisibleRetentionCoverage([operationalRecord()], false),
    ).toBeNull();
  });

  it("keeps authority source failure distinct from permission or a successful empty list", async () => {
    const { client, listTripOperationalRecords } = installRecordsTransport([]);
    listTripOperationalRecords.mockRejectedValueOnce(
      new ApiRequestError(
        503,
        "P5_SOURCE_UNAVAILABLE",
        "Operational record source unavailable.",
      ),
    );
    const error = await client
      .get(buildRecordsQueryPath({}))
      .catch((value: unknown) => value);

    expect(error).toMatchObject({
      statusCode: 503,
      code: "P5_SOURCE_UNAVAILABLE",
    });
    expect(isPermissionError(error)).toBe(false);
    expect(getApiErrorMessage(error, "fallback")).toBe(
      "Operational record source unavailable.",
    );
    expect(getVisibleRetentionCoverage([], false)).toBeNull();
  });
});

describe("SR-ADMIN-VERIFY-001 P5 visible retention truth", () => {
  it("suppresses stale coverage while the current query or authority is unavailable", () => {
    // The console supplies availability from canAttemptRead, loading, and error.
    // A previous successful query must not supply a percentage for this state.
    expect(
      getVisibleRetentionCoverage([operationalRecord()], false),
    ).toBeNull();
    expect(getVisibleRetentionCoverage([], false)).toBeNull();
  });

  it("derives coverage from current record dates, including the exact 730-day boundary", () => {
    const compliant = operationalRecord();
    const short = operationalRecord({
      retainUntil: "2028-09-05T00:29:59.999Z",
    });
    const unknown = operationalRecord({ generatedAt: "unavailable" });

    expect(
      getVisibleRetentionCoverage([compliant, short, unknown], true),
    ).toEqual({ covered: 1, total: 3, percent: 33 });
    expect(getVisibleRetentionCoverage([short, unknown], true)).toEqual({
      covered: 0,
      total: 2,
      percent: 0,
    });
  });
});
