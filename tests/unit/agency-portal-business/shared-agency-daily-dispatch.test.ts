import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { maskOpaqueToken } from "../../../apps/api/src/common/sensitive-data-policy";
import {
  paginate,
  projectAgencyDailyDispatchRecord,
  projectAgencyTripRecord,
} from "../../../apps/api/src/modules/agency-access/agency-projections";
import type {
  DispatchDailyRecord,
  MultiTaxiTripOperationalAdminView,
} from "@drts/contracts";
import {
  COPY,
  formatMinorLocale,
  nullZeroAndTime,
  resolveNullZeroSubcase,
  verifyLocaleDetail,
} from "../../e2e/agency-portal-business/shared-dev-locale.mjs";
import {
  check,
  parseFixtureInput,
  selfTest,
  taipeiTime,
  validateFixture,
} from "../../e2e/agency-portal-business/shared-dev-trip-record.mjs";

const AGENCY_ID = "agency_1f1710fc6d5041e785f9ed529d2fcdd0";
const SERVICE_DATE = "2026-11-20";

const SHARED_A_FIXTURE = {
  agencyId: AGENCY_ID,
  recordId: "mtr-580e0ebf-c1e6-41c4-93dc-449bd92a010f",
  orderId: "580e0ebf-c1e6-41c4-93dc-449bd92a010f",
  tripId: "85f7a59f-ee43-4734-869a-42f2aa1031ae",
  serviceDate: SERVICE_DATE,
};

const SHARED_B_FIXTURE = {
  agencyId: AGENCY_ID,
  recordId: "mtr-98e6e9fd-c986-4985-8339-3b00ee977e92",
  orderId: "98e6e9fd-c986-4985-8339-3b00ee977e92",
  tripId: "f034e18a-ac90-421a-9163-6f02ff8bf071",
  serviceDate: SERVICE_DATE,
};

function buildTripAdminRecord(
  overrides: Partial<MultiTaxiTripOperationalAdminView> = {},
): MultiTaxiTripOperationalAdminView {
  return {
    recordId: SHARED_A_FIXTURE.recordId,
    orderId: SHARED_A_FIXTURE.orderId,
    tripId: SHARED_A_FIXTURE.tripId,
    orderNo: "ORD-20261120-A00117",
    plateNo: "TDA-2208",
    reservedAt: "2026-11-19T21:01:00.000Z",
    pickupAt: "2026-11-19T21:01:33.223Z",
    dropoffAt: "2026-11-19T21:03:21.281Z",
    route: {
      routeSummary: "Taipei Main Station -> Songshan Airport",
      source: "driver_gps",
      distanceMeters: 4820,
      durationSeconds: 108,
    },
    payableFareMinor: 25000,
    actualFareMinor: 25000,
    collectedFareMinor: 25000,
    paymentStatus: "captured",
    tollMinor: 0,
    tollSource: "none",
    currency: "TWD",
    farePolicyVersion: "v1",
    chargingMode: "platform_quote",
    generatedAt: "2026-11-19T21:03:22.000Z",
    retainUntil: "2028-11-19T21:03:22.000Z",
    legalHold: {
      state: "none",
      subjectType: "order",
      subjectId: SHARED_A_FIXTURE.orderId,
      activeHoldCount: 0,
      activeHolds: [],
    },
    ...overrides,
  };
}

function buildDispatchDailyRecord(
  overrides: Partial<DispatchDailyRecord> = {},
): DispatchDailyRecord {
  return {
    serviceDate: SERVICE_DATE,
    orderId: SHARED_A_FIXTURE.orderId,
    orderNo: "ORD-20261120-A00117",
    orderSource: "third_party_platform",
    tenantId: "tenant_referral_demo",
    partnerId: null,
    serviceProductCode: "multi_taxi_direct",
    requestedAt: "2026-11-19T20:58:51.684Z",
    reservationTime: "2026-11-19T21:01:00.000Z",
    pickupAddressSnapshot: "臺北市中正區北平西路3號",
    dropoffAddressSnapshot: "臺北市松山區敦化北路340之9號",
    firstDispatchAt: "2026-11-19T21:00:25.000Z",
    firstAssignedAt: "2026-11-19T21:00:27.767Z",
    finalDriverId: "drv_demo_001",
    finalVehicleId: "veh_demo_001",
    finalPlateNo: "TDA-2208",
    etaSecondsAtAssignment: 180,
    arrivedPickupAt: "2026-11-19T21:01:10.000Z",
    tripStartedAt: "2026-11-19T21:01:33.223Z",
    tripCompletedAt: "2026-11-19T21:03:21.281Z",
    finalStatus: "completed",
    redispatchCount: 0,
    cancellationReason: null,
    complaintCount: 0,
    generatedAt: "2026-11-19T21:03:25.000Z",
    ...overrides,
  };
}

function toWireTripDetail(record: MultiTaxiTripOperationalAdminView) {
  const projected = projectAgencyTripRecord(record);
  return {
    record_id: projected.recordId,
    order_id: projected.orderId,
    trip_id: projected.tripId,
    order_no_masked: projected.orderNoMasked,
    plate_no: projected.plateNo,
    plate_no_masked: projected.plateNoMasked,
    reserved_at: projected.reservedAt,
    pickup_at: projected.pickupAt,
    dropoff_at: projected.dropoffAt,
    route: {
      route_summary: projected.route.routeSummary,
      source: projected.route.source,
      distance_meters: projected.route.distanceMeters,
      duration_seconds: projected.route.durationSeconds,
    },
    payable_fare_minor: projected.payableFareMinor,
    actual_fare_minor: projected.actualFareMinor,
    collected_fare_minor: projected.collectedFareMinor,
    payment_status: projected.paymentStatus,
    toll_minor: projected.tollMinor,
    toll_source: projected.tollSource,
    currency: projected.currency,
    fare_policy_version: projected.farePolicyVersion,
    charging_mode: projected.chargingMode,
    generated_at: projected.generatedAt,
    retain_until: projected.retainUntil,
    legal_hold: { state: projected.legalHold.state },
  };
}

function toWireDailyDispatch(record: DispatchDailyRecord) {
  const projected = projectAgencyDailyDispatchRecord(record);
  return {
    service_date: projected.serviceDate,
    order_no_masked: projected.orderNoMasked,
    order_source: projected.orderSource,
    service_product_code: projected.serviceProductCode,
    requested_at: projected.requestedAt,
    reservation_time: projected.reservationTime,
    pickup_address_masked: projected.pickupAddressMasked,
    dropoff_address_masked: projected.dropoffAddressMasked,
    first_dispatch_at: projected.firstDispatchAt,
    first_assigned_at: projected.firstAssignedAt,
    final_driver_id_masked: projected.finalDriverIdMasked,
    final_plate_no_masked: projected.finalPlateNoMasked,
    eta_seconds_at_assignment: projected.etaSecondsAtAssignment,
    arrived_pickup_at: projected.arrivedPickupAt,
    trip_started_at: projected.tripStartedAt,
    trip_completed_at: projected.tripCompletedAt,
    final_status: projected.finalStatus,
    redispatch_count: projected.redispatchCount,
    cancellation_reason: projected.cancellationReason,
    complaint_count: projected.complaintCount,
  };
}

type WireDailyRow = ReturnType<typeof toWireDailyDispatch>;

function bindProbeDailyDispatch() {
  const probeSource = readFileSync(
    new URL(
      "../../e2e/agency-portal-business/shared-dev-trip-record.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  const fnSource = probeSource
    .slice(
      probeSource.indexOf("async function dailyDispatch("),
      probeSource.indexOf("export async function probe("),
    )
    .trim();
  const importLine = 'const { expect } = await import("@playwright/test");';
  expect(fnSource.split(importLine).length).toBe(2);
  return new Function(
    "expect",
    "visit",
    "api",
    "check",
    `return (${fnSource.replace(importLine, "")})`,
  );
}

async function exerciseDailyDispatch({
  allItems,
  pageSize = 1,
  detailRow,
  uiPageItems,
  trackUrl = true,
}: {
  allItems: WireDailyRow[];
  pageSize?: number;
  detailRow: Record<string, unknown>;
  uiPageItems?: Record<number, WireDailyRow[]>;
  trackUrl?: boolean;
}) {
  const reads: number[] = [];
  let currentUrl = new URL("https://fixture.invalid/reports/daily-dispatch");
  const expectStub = (locator: { count?: number; value?: unknown }) => ({
    toHaveCount: async (n: number) => {
      if (locator.count !== n) {
        throw new Error(`ui-row-count-${locator.count}-expected-${n}`);
      }
    },
    toHaveText: async (text: string) => {
      if (locator.value !== text) {
        throw new Error(
          `ui-cell-text-${String(locator.value)}-expected-${String(text)}`,
        );
      }
    },
  });
  const visitStub = async (_page: unknown, path: string) => {
    currentUrl = new URL(path, "https://fixture.invalid/");
    for (const field of ["serviceDateFrom", "serviceDateTo"]) {
      if (!currentUrl.searchParams.has(field)) {
        currentUrl.searchParams.set(field, SERVICE_DATE);
      }
    }
  };
  const apiStub = async (_page: unknown, path: string) => {
    const parsedUrl = new URL(path, "https://fixture.invalid/");
    const pageNo = Number(parsedUrl.searchParams.get("page") || 1);
    reads.push(pageNo);
    const paged = paginate(allItems, pageNo, pageSize);
    return {
      page: paged.page,
      page_size: paged.pageSize,
      total: paged.total,
      items: paged.items,
    };
  };
  const pageStub: Record<string, unknown> = {
    ...(trackUrl ? { url: () => currentUrl.toString() } : {}),
    waitForURL: async (condition: (url: URL) => boolean) => {
      for (const field of ["serviceDateFrom", "serviceDateTo"]) {
        currentUrl.searchParams.set(field, SERVICE_DATE);
      }
      if (!condition(currentUrl)) {
        throw new Error("wait-for-url-failed");
      }
    },
    getByRole: () => ({ count: 0 }),
    locator(selector: string) {
      if (selector !== "main tbody tr") {
        return { fill: async () => {}, click: async () => {} };
      }
      const pageNo = trackUrl
        ? Number(currentUrl.searchParams.get("page") || 1)
        : 1;
      const defaultItems = paginate(allItems, pageNo, pageSize).items;
      const rendered = uiPageItems?.[pageNo] ?? defaultItems;
      return {
        count: rendered.length,
        nth(rowIndex: number) {
          const item = rendered[rowIndex];
          const completedText =
            item?.trip_completed_at &&
            Number.isFinite(Date.parse(item.trip_completed_at))
              ? taipeiTime(item.trip_completed_at, "en")
              : undefined;
          const cells = [
            item?.service_date ?? SERVICE_DATE,
            item?.order_no_masked,
            item?.order_source,
            item?.service_product_code,
            null,
            null,
            null,
            null,
            null,
            item?.final_plate_no_masked,
            null,
            completedText,
          ];
          return {
            locator: () => ({
              nth: (colIndex: number) => ({ value: cells[colIndex] }),
            }),
          };
        },
      };
    },
  };
  const bound = bindProbeDailyDispatch()(expectStub, visitStub, apiStub, check);
  const result = await bound(
    pageStub,
    { fixture: { serviceDate: SERVICE_DATE } },
    detailRow,
  );
  return { result, pagesRead: reads };
}

function createLocaleDetailPageStub(
  recordsById: Record<string, ReturnType<typeof toWireTripDetail>>,
  runtimeSha = "a".repeat(40),
) {
  let currentUrl = new URL(
    `https://fixture.invalid/trip-records/${SHARED_A_FIXTURE.recordId}`,
  );
  let activeLocale: "en" | "zh" = "en";

  const currentRecord = () => {
    const seg = decodeURIComponent(
      currentUrl.pathname.split("/").filter(Boolean).at(-1) ?? "",
    );
    return recordsById[seg] ?? Object.values(recordsById)[0];
  };

  const detailValueFor = (label: string) => {
    const row = currentRecord();
    const copy = COPY[activeLocale];
    if (label === copy.collected) {
      const value = formatMinorLocale(
        row.collected_fare_minor,
        row.currency,
        activeLocale,
      );
      return `${value} (${row.payment_status})`;
    }
    if (label === copy.toll) {
      const value = formatMinorLocale(
        row.toll_minor,
        row.currency,
        activeLocale,
      );
      return `${value} (${row.toll_source})`;
    }
    if (label === copy.reserved) {
      return taipeiTime(row.reserved_at, activeLocale);
    }
    return "";
  };

  const makeCellLocator = (textGetter: () => string) => ({
    __text: textGetter,
  });

  const expectImpl = (target: {
    __text?: () => string;
    __attr?: () => string;
    __heading?: string | RegExp;
  }) => ({
    toContainText: async (expected: string) => {
      const actual = target.__text ? target.__text() : "";
      if (!actual.includes(expected)) {
        throw new Error(`expected "${actual}" to contain "${expected}"`);
      }
    },
    toHaveText: async (expected: string) => {
      const actual = target.__text ? target.__text() : "";
      if (actual !== expected) {
        throw new Error(`expected "${actual}" to equal "${expected}"`);
      }
    },
    toHaveAttribute: async (_attr: string, expected: string) => {
      const actual = target.__attr ? target.__attr() : "";
      if (actual !== expected) {
        throw new Error(`expected attr "${actual}" to equal "${expected}"`);
      }
    },
    toBeVisible: async () => {
      if (!target.__heading) {
        throw new Error("heading-not-visible");
      }
    },
    not: {
      toContainText: async (forbidden: string) => {
        const actual = target.__text ? target.__text() : "";
        if (actual.includes(forbidden)) {
          throw new Error(`expected "${actual}" not to contain "${forbidden}"`);
        }
      },
    },
  });

  const pageStub = {
    url: () => currentUrl.toString(),
    goto: async (targetUrl: string) => {
      currentUrl = new URL(targetUrl);
      return {
        status: () => 200,
        headers: () => ({ "x-drts-candidate-sha": runtimeSha }),
      };
    },
    reload: async () => ({
      status: () => 200,
      headers: () => ({ "x-drts-candidate-sha": runtimeSha }),
    }),
    setViewportSize: async () => {},
    keyboard: {
      press: async () => {},
    },
    evaluate: async () => true,
    getByRole: (
      role: string,
      opts?: { name?: string | RegExp; exact?: boolean },
    ) => {
      if (role === "button") {
        return {
          click: async () => {
            if (opts?.name === "切換語言至 English") activeLocale = "en";
            if (opts?.name === "Switch language to Traditional Chinese")
              activeLocale = "zh";
          },
          focus: async () => {},
          evaluate: async () => ({
            focused: true,
            visible: true,
            inViewport: true,
          }),
        };
      }
      if (role === "heading") {
        return {
          __heading: opts?.name,
        };
      }
      return { count: 0 };
    },
    locator: (selector: string) => {
      if (selector === "html") {
        return {
          getAttribute: async (attr: string) =>
            attr === "lang" ? COPY[activeLocale].lang : null,
          __attr: () => COPY[activeLocale].lang,
        };
      }
      if (selector === "main dt") {
        return {
          filter: ({ hasText }: { hasText: RegExp }) => {
            const copy = COPY[activeLocale];
            const matchedLabel =
              [copy.collected, copy.toll, copy.reserved].find((candidate) =>
                hasText.test(candidate),
              ) ?? "";
            return {
              locator: () =>
                makeCellLocator(() => detailValueFor(matchedLabel)),
            };
          },
        };
      }
      return {};
    },
    setLocale(locale: "en" | "zh") {
      activeLocale = locale;
    },
  };

  return { pageStub, runtimeSha, expectImpl };
}

describe("AGENCY-DAILY-DISPATCH-EXACT-TRIP-PAGING-20261123", () => {
  it("runs the socket-free probe selfTest suite without errors", async () => {
    await expect(selfTest()).resolves.toBeUndefined();
  });

  it("reproduces masked order number collisions and correlates the unique trip across pages", async () => {
    const bookedOrderNo = "ORD-20261120-A00117";
    const collidingOrderNo = "ORD-20261120-B00217";
    const thirdOrderNo = "ORD-20261120-C00435";

    expect(maskOpaqueToken(bookedOrderNo, 3, 2)).toBe("ORD...17");
    expect(maskOpaqueToken(collidingOrderNo, 3, 2)).toBe("ORD...17");

    const tripDetail = toWireTripDetail(
      buildTripAdminRecord({ orderNo: bookedOrderNo }),
    );
    const matchingDaily = toWireDailyDispatch(
      buildDispatchDailyRecord({
        orderId: SHARED_A_FIXTURE.orderId,
        orderNo: bookedOrderNo,
        tripStartedAt: "2026-11-19T21:01:33.223Z",
        tripCompletedAt: "2026-11-19T21:03:21.281Z",
      }),
    );
    const collidingDaily = toWireDailyDispatch(
      buildDispatchDailyRecord({
        orderId: SHARED_B_FIXTURE.orderId,
        orderNo: collidingOrderNo,
        tripStartedAt: "2026-11-19T21:07:00.668Z",
        tripCompletedAt: "2026-11-19T21:07:23.201Z",
      }),
    );
    const otherDaily = toWireDailyDispatch(
      buildDispatchDailyRecord({
        orderId: "33333333-c986-4985-8339-3b00ee977e92",
        orderNo: thirdOrderNo,
        tripStartedAt: "2026-11-19T22:10:00.000Z",
        tripCompletedAt: "2026-11-19T22:25:00.000Z",
      }),
    );

    // 1. Normal single-page unique match
    const singlePage = await exerciseDailyDispatch({
      allItems: [matchingDaily],
      pageSize: 1,
      detailRow: tripDetail,
    });
    expect(singlePage.pagesRead).toEqual([1]);
    expect(singlePage.result).toMatchObject({
      serviceDate: SERVICE_DATE,
      apiStatus: 200,
      rows: 1,
      matchedPage: 1,
      matchedRowIndex: 0,
      maskedCollisionsSkipped: 0,
      uniqueTripMatch: true,
      uiMatchesApi: true,
    });

    // 2. Only a different order sharing the same masked order number -> rejected
    await expect(
      exerciseDailyDispatch({
        allItems: [collidingDaily],
        pageSize: 1,
        detailRow: tripDetail,
      }),
    ).rejects.toThrow("daily-dispatch-masked-order-collision");

    // 3. Correct trip on page 2 after a colliding masked order on page 1 -> accepted on page 2
    const multiPage = await exerciseDailyDispatch({
      allItems: [otherDaily, collidingDaily, matchingDaily],
      pageSize: 2,
      detailRow: tripDetail,
    });
    expect(multiPage.pagesRead).toEqual([1, 2]);
    expect(multiPage.result).toMatchObject({
      serviceDate: SERVICE_DATE,
      apiStatus: 200,
      rows: 3,
      matchedPage: 2,
      matchedRowIndex: 0,
      maskedCollisionsSkipped: 1,
      uniqueTripMatch: true,
      uiMatchesApi: true,
    });

    // 4. Legacy single-page DOM stub (trackUrl=false, like agency-daily-fixture-readback.cjs)
    const legacyHarnessPageTwo = await exerciseDailyDispatch({
      allItems: [otherDaily, matchingDaily],
      pageSize: 1,
      detailRow: tripDetail,
      trackUrl: false,
    });
    expect(legacyHarnessPageTwo.pagesRead).toEqual([1, 2]);
    expect(legacyHarnessPageTwo.result.matchedPage).toBe(2);

    // 5. Duplicate identical trip matches across pages -> rejected
    await expect(
      exerciseDailyDispatch({
        allItems: [matchingDaily, { ...matchingDaily }],
        pageSize: 1,
        detailRow: tripDetail,
      }),
    ).rejects.toThrow("daily-dispatch-duplicate-trip-match");

    // 6. Missing correlation timestamps on daily dispatch candidate -> rejected
    await expect(
      exerciseDailyDispatch({
        allItems: [
          {
            ...matchingDaily,
            trip_started_at: null,
          },
        ],
        pageSize: 1,
        detailRow: tripDetail,
      }),
    ).rejects.toThrow("daily-dispatch-correlation-fields-missing");

    // 7. Missing correlation timestamps on trip detail -> rejected
    await expect(
      exerciseDailyDispatch({
        allItems: [matchingDaily],
        pageSize: 1,
        detailRow: {
          ...tripDetail,
          dropoff_at: null,
        },
      }),
    ).rejects.toThrow("daily-dispatch-trip-correlation-fields-required");

    // 8. UI table mismatch on page 2 -> rejected
    await expect(
      exerciseDailyDispatch({
        allItems: [otherDaily, matchingDaily],
        pageSize: 1,
        detailRow: tripDetail,
        uiPageItems: {
          1: [otherDaily],
          2: [otherDaily],
        },
      }),
    ).rejects.toThrow(/ui-cell-text/);
  });

  it("validates 5-field primary and optional second fixture inputs from the existing workflow parameter", () => {
    expect(validateFixture(JSON.stringify(SHARED_A_FIXTURE))).toEqual(
      SHARED_A_FIXTURE,
    );
    expect(validateFixture(JSON.stringify(SHARED_B_FIXTURE))).toEqual(
      SHARED_B_FIXTURE,
    );
    expect(parseFixtureInput(JSON.stringify(SHARED_A_FIXTURE))).toEqual({
      fixture: SHARED_A_FIXTURE,
      secondFixture: null,
    });

    for (const encoded of [
      JSON.stringify([SHARED_A_FIXTURE, SHARED_B_FIXTURE]),
      JSON.stringify({ ...SHARED_A_FIXTURE, secondFixture: SHARED_B_FIXTURE }),
      JSON.stringify({
        primary: SHARED_A_FIXTURE,
        secondFixture: SHARED_B_FIXTURE,
      }),
      JSON.stringify({
        fixture: SHARED_A_FIXTURE,
        nullCollectedFixture: SHARED_B_FIXTURE,
      }),
    ]) {
      expect(parseFixtureInput(encoded)).toEqual({
        fixture: SHARED_A_FIXTURE,
        secondFixture: SHARED_B_FIXTURE,
      });
    }

    expect(() =>
      parseFixtureInput(JSON.stringify([SHARED_A_FIXTURE, SHARED_A_FIXTURE])),
    ).toThrow("distinct-second-fixture-required");

    expect(() =>
      parseFixtureInput(
        JSON.stringify({ ...SHARED_A_FIXTURE, unexpectedField: "nope" }),
      ),
    ).toThrow("fixture-fields");
  });

  it("preserves the first record's real captured fare while marking null-collected pending or verifying a second null-collected sample", async () => {
    const capturedA = toWireTripDetail(
      buildTripAdminRecord({
        recordId: SHARED_A_FIXTURE.recordId,
        orderId: SHARED_A_FIXTURE.orderId,
        tripId: SHARED_A_FIXTURE.tripId,
        collectedFareMinor: 25000,
        paymentStatus: "captured",
        tollMinor: 0,
      }),
    );
    const capturedB = toWireTripDetail(
      buildTripAdminRecord({
        recordId: SHARED_B_FIXTURE.recordId,
        orderId: SHARED_B_FIXTURE.orderId,
        tripId: SHARED_B_FIXTURE.tripId,
        collectedFareMinor: 31500,
        paymentStatus: "captured",
        tollMinor: 0,
      }),
    );
    const nullCollectedSample = toWireTripDetail(
      buildTripAdminRecord({
        recordId: SHARED_B_FIXTURE.recordId,
        orderId: SHARED_B_FIXTURE.orderId,
        tripId: SHARED_B_FIXTURE.tripId,
        collectedFareMinor: null,
        paymentStatus: "authorized",
        tollMinor: 0,
      }),
    );

    const { pageStub, runtimeSha, expectImpl } = createLocaleDetailPageStub({
      [SHARED_A_FIXTURE.recordId]: capturedA,
      [SHARED_B_FIXTURE.recordId]: nullCollectedSample,
    });
    const cfgSingle = {
      origin: "https://fixture.invalid",
      runtimeSha,
      fixture: SHARED_A_FIXTURE,
    };

    // Primary fixture detail readback in zh and en preserves real numeric collected fare (25000 -> "250 TWD") and zero toll ("0 TWD")
    pageStub.setLocale("zh");
    const primaryDetailZh = await verifyLocaleDetail(
      pageStub,
      cfgSingle,
      capturedA,
      "zh",
      expectImpl,
    );
    expect(primaryDetailZh).toMatchObject({
      locale: "zh",
      recordId: SHARED_A_FIXTURE.recordId,
      collectedFareMinor: 25000,
      tollMinor: 0,
      rawCollectedIsNull: false,
      rawTollIsZero: true,
      collectedText: "250 TWD",
      zeroText: "0 TWD",
      reloadPersisted: true,
    });

    pageStub.setLocale("en");
    const primaryDetailEn = await verifyLocaleDetail(
      pageStub,
      cfgSingle,
      capturedA,
      "en",
      expectImpl,
    );
    expect(primaryDetailEn).toMatchObject({
      locale: "en",
      recordId: SHARED_A_FIXTURE.recordId,
      collectedFareMinor: 25000,
      tollMinor: 0,
      rawCollectedIsNull: false,
      rawTollIsZero: true,
      collectedText: "250 TWD",
      zeroText: "0 TWD",
      reloadPersisted: true,
    });

    // Direct nullZeroAndTime on a captured numeric fare record must fail closed
    await expect(
      nullZeroAndTime(pageStub, cfgSingle, capturedA, "zh", expectImpl),
    ).rejects.toThrow("fixture-needs-null-collected-and-zero-toll");

    // When only the first captured fixture is available, primary real amount is retained and null-collected subcase is marked pending
    const pendingZh = await resolveNullZeroSubcase(
      pageStub,
      cfgSingle,
      capturedA,
      null,
      "zh",
      expectImpl,
    );
    expect(pendingZh).toMatchObject({
      status: "pending",
      subcaseStatus: "pending",
      reason: "second-null-collected-sample-pending",
      locale: "zh",
      primaryRecordId: SHARED_A_FIXTURE.recordId,
      primaryCollectedFareMinor: 25000,
      primaryCollectedText: "250 TWD",
      primaryTollMinor: 0,
      rawCollectedIsNull: false,
      rawTollIsZero: true,
    });

    // When a second fixture with genuine collected_fare_minor === null && toll_minor === 0 is provided, both records are preserved and null-collected subcase is verified in zh and en
    const cfgWithSecond = {
      ...cfgSingle,
      secondFixture: SHARED_B_FIXTURE,
    };
    const verifiedZh = await resolveNullZeroSubcase(
      pageStub,
      cfgWithSecond,
      capturedA,
      nullCollectedSample,
      "zh",
      expectImpl,
    );
    expect(verifiedZh).toMatchObject({
      locale: "zh",
      fixtureSlot: "secondary",
      recordId: SHARED_B_FIXTURE.recordId,
      collectedFareMinor: null,
      tollMinor: 0,
      rawCollectedIsNull: true,
      rawTollIsZero: true,
      nullText: "未提供",
      zeroText: "0 TWD",
      subcaseStatus: "verified",
      primaryRecordId: SHARED_A_FIXTURE.recordId,
      primaryCollectedFareMinor: 25000,
      primaryCollectedText: "250 TWD",
    });

    const verifiedEn = await resolveNullZeroSubcase(
      pageStub,
      cfgWithSecond,
      capturedA,
      nullCollectedSample,
      "en",
      expectImpl,
    );
    expect(verifiedEn).toMatchObject({
      locale: "en",
      fixtureSlot: "secondary",
      recordId: SHARED_B_FIXTURE.recordId,
      collectedFareMinor: null,
      tollMinor: 0,
      rawCollectedIsNull: true,
      rawTollIsZero: true,
      nullText: "Not provided",
      zeroText: "0 TWD",
      subcaseStatus: "verified",
      primaryRecordId: SHARED_A_FIXTURE.recordId,
      primaryCollectedFareMinor: 25000,
      primaryCollectedText: "250 TWD",
    });

    // When both existing controlled orders are captured (shared_A and shared_B), both real amounts are retained and null-collected remains pending
    const bothCapturedEn = await resolveNullZeroSubcase(
      pageStub,
      cfgWithSecond,
      capturedA,
      capturedB,
      "en",
      expectImpl,
    );
    expect(bothCapturedEn).toMatchObject({
      status: "pending",
      subcaseStatus: "pending",
      reason: "second-sample-also-captured-null-collected-sample-pending",
      locale: "en",
      primaryRecordId: SHARED_A_FIXTURE.recordId,
      primaryCollectedFareMinor: 25000,
      primaryCollectedText: "250 TWD",
      secondRecordId: SHARED_B_FIXTURE.recordId,
      secondCollectedFareMinor: 31500,
      secondCollectedText: "315 TWD",
      rawCollectedIsNull: false,
      rawTollIsZero: true,
    });

    // Formatting check for bilingual real amounts vs null vs zero toll
    expect(formatMinorLocale(25000, "TWD", "zh")).toBe("250 TWD");
    expect(formatMinorLocale(25000, "TWD", "en")).toBe("250 TWD");
    expect(formatMinorLocale(null, "TWD", "zh")).toBe("未提供");
    expect(formatMinorLocale(null, "TWD", "en")).toBe("Not provided");
    expect(formatMinorLocale(0, "TWD", "zh")).toBe("0 TWD");
    expect(formatMinorLocale(0, "TWD", "en")).toBe("0 TWD");
  });
});
