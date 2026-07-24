import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

type ScreenContract = {
  id: string;
  productionRoute: string;
  routeSources: string[];
  surfaceSource: string;
  surfaceMarker: string;
  apiSource: string;
  apiMarker: string;
};

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

const multiTaxiController =
  "apps/api/src/modules/multi-taxi/multi-taxi.controller.ts";
const authorizationRoute =
  "apps/platform-admin-web/app/multi-taxi-authorizations/page.tsx";
const queueController =
  "apps/api/src/modules/owned-mobility/owned-mobility.controller.ts";
const queueDetailRoute =
  "apps/ops-console-web/app/dispatch/queue/[queueEntryId]/page.tsx";
const fareController =
  "apps/api/src/modules/product-rule/fare-anomaly.controller.ts";
const fareSurface =
  "apps/platform-admin-web/app/p5-fare-anomalies/fare-anomaly-screen.tsx";
const certificateController =
  "apps/api/src/modules/certificate-support/certificate-support.controller.ts";
const certificateSurface =
  "apps/platform-admin-web/app/multi-taxi-certificates/certificate-support-screen.tsx";
const recordsSurface =
  "apps/platform-admin-web/app/platform-admin/p5/records/records-operations-console.tsx";

const SCREEN_CONTRACTS: ScreenContract[] = [
  {
    id: "MTX-AUTH-UI-01",
    productionRoute: "/multi-taxi-authorizations",
    routeSources: [authorizationRoute],
    surfaceSource: authorizationRoute,
    surfaceMarker: 'data-screen-id="MTX-AUTH-UI-01"',
    apiSource: multiTaxiController,
    apiMarker: '@Get("platform-admin/multi-taxi/authorizations")',
  },
  {
    id: "MTX-AUTH-UI-02",
    productionRoute: "/multi-taxi-authorizations (detail surface)",
    routeSources: [authorizationRoute],
    surfaceSource: authorizationRoute,
    surfaceMarker: 'data-screen-id="MTX-AUTH-UI-02"',
    apiSource: multiTaxiController,
    apiMarker:
      '@Get("platform-admin/multi-taxi/authorizations/:authorizationId")',
  },
  {
    id: "MTX-AUTH-UI-03",
    productionRoute: "/multi-taxi-authorizations (draft surface)",
    routeSources: [authorizationRoute],
    surfaceSource: authorizationRoute,
    surfaceMarker: 'data-screen-id="MTX-AUTH-UI-03"',
    apiSource: multiTaxiController,
    apiMarker: '@Post("platform-admin/multi-taxi/authorizations")',
  },
  {
    id: "MTX-AUTH-UI-04",
    productionRoute: "/multi-taxi-authorizations (lifecycle dialog)",
    routeSources: [authorizationRoute],
    surfaceSource: authorizationRoute,
    surfaceMarker: 'data-screen-id="MTX-AUTH-UI-04"',
    apiSource: multiTaxiController,
    apiMarker:
      '@Post("platform-admin/multi-taxi/authorizations/:authorizationId/activate")',
  },
  {
    id: "MTX-AUTH-UI-05",
    productionRoute: "/multi-taxi-authorizations (vehicles surface)",
    routeSources: [authorizationRoute],
    surfaceSource: authorizationRoute,
    surfaceMarker: 'data-screen-id="MTX-AUTH-UI-05"',
    apiSource: multiTaxiController,
    apiMarker:
      '@Get("platform-admin/multi-taxi/authorizations/:authorizationId/vehicles")',
  },
  {
    id: "MTX-AUTH-UI-06",
    productionRoute: "/multi-taxi-authorizations (failure-state surface)",
    routeSources: [authorizationRoute],
    surfaceSource: authorizationRoute,
    surfaceMarker: 'data-screen-id="MTX-AUTH-UI-06"',
    apiSource: multiTaxiController,
    apiMarker:
      '@Put("platform-admin/multi-taxi/authorizations/:authorizationId")',
  },
  {
    id: "MTX-QUEUE-UI-01",
    productionRoute: "/dispatch/queue",
    routeSources: ["apps/ops-console-web/app/dispatch/queue/page.tsx"],
    surfaceSource: "apps/ops-console-web/app/dispatch/queue/page.tsx",
    surfaceMarker: 'data-screen-id="MTX-QUEUE-UI-01"',
    apiSource: queueController,
    apiMarker: '@Get("dispatch/queue")',
  },
  {
    id: "MTX-QUEUE-UI-02",
    productionRoute: "/dispatch/queue/[queueEntryId]",
    routeSources: [queueDetailRoute],
    surfaceSource: queueDetailRoute,
    surfaceMarker: 'data-screen-id="MTX-QUEUE-UI-02"',
    apiSource: queueController,
    apiMarker: '@Get("dispatch/queue/:queueEntryId")',
  },
  {
    id: "MTX-QUEUE-UI-03",
    productionRoute: "/dispatch/queue/[queueEntryId] (denial surface)",
    routeSources: [queueDetailRoute],
    surfaceSource: queueDetailRoute,
    surfaceMarker: 'data-screen-id="MTX-QUEUE-UI-03"',
    apiSource: queueController,
    apiMarker: '@Get("dispatch/queue/:queueEntryId")',
  },
  {
    id: "P5-RATE-UI-01",
    productionRoute: "/p5-ratings",
    routeSources: ["apps/platform-admin-web/app/p5-ratings/page.tsx"],
    surfaceSource:
      "apps/platform-admin-web/app/p5-ratings/components/rating-review-queue.tsx",
    surfaceMarker: 'screenId="P5-RATE-UI-01"',
    apiSource: multiTaxiController,
    apiMarker: '@Get("platform-admin/multi-taxi-ratings")',
  },
  {
    id: "P5-RATE-UI-02",
    productionRoute: "/p5-ratings/[ratingId]",
    routeSources: [
      "apps/platform-admin-web/app/p5-ratings/[ratingId]/page.tsx",
    ],
    surfaceSource:
      "apps/platform-admin-web/app/p5-ratings/components/rating-review-detail.tsx",
    surfaceMarker: 'screenId="P5-RATE-UI-02"',
    apiSource: multiTaxiController,
    apiMarker: '@Get("platform-admin/multi-taxi-ratings/:ratingId")',
  },
  {
    id: "P5-RATE-UI-03",
    productionRoute: "/p5-ratings/drivers/[driverId]",
    routeSources: [
      "apps/platform-admin-web/app/p5-ratings/drivers/[driverId]/page.tsx",
    ],
    surfaceSource:
      "apps/platform-admin-web/app/p5-ratings/components/driver-rating-authority.tsx",
    surfaceMarker: 'screenId="P5-RATE-UI-03"',
    apiSource: multiTaxiController,
    apiMarker: '@Get("platform-admin/multi-taxi-rating-authorities/:driverId")',
  },
  {
    id: "P5-COM-UI-01",
    productionRoute:
      "/p5-fare-anomalies and /p5-fare-anomalies/[quoteSnapshotId]",
    routeSources: [
      "apps/platform-admin-web/app/p5-fare-anomalies/page.tsx",
      "apps/platform-admin-web/app/p5-fare-anomalies/[quoteSnapshotId]/page.tsx",
    ],
    surfaceSource: fareSurface,
    surfaceMarker: 'data-screen-id="P5-COM-UI-01"',
    apiSource: fareController,
    apiMarker: '@Controller("product-rule/fare-anomalies")',
  },
  {
    id: "P5-COM-UI-02",
    productionRoute: "/payments/[orderId]",
    routeSources: ["apps/platform-admin-web/app/payments/[orderId]/page.tsx"],
    surfaceSource:
      "apps/platform-admin-web/app/payments/[orderId]/payment-exception-detail.tsx",
    surfaceMarker: 'data-screen-id="P5-COM-UI-02"',
    apiSource:
      "apps/api/src/modules/billing-settlement/billing-settlement.controller.ts",
    apiMarker: '@Get("payment-exceptions/:orderId")',
  },
  {
    id: "P5-COM-UI-03",
    productionRoute:
      "/multi-taxi-certificates and /multi-taxi-certificates/[certificateId]",
    routeSources: [
      "apps/platform-admin-web/app/multi-taxi-certificates/page.tsx",
      "apps/platform-admin-web/app/multi-taxi-certificates/[certificateId]/page.tsx",
    ],
    surfaceSource: certificateSurface,
    surfaceMarker: 'data-screen-id="P5-COM-UI-03"',
    apiSource: certificateController,
    apiMarker: '@Controller("platform-admin/multi-taxi/certificates")',
  },
  {
    id: "P5-COM-UI-04",
    productionRoute: "/platform-admin/p5/records",
    routeSources: [
      "apps/platform-admin-web/app/platform-admin/p5/records/page.tsx",
    ],
    surfaceSource: recordsSurface,
    surfaceMarker: 'data-screen-id="P5-COM-UI-04"',
    apiSource: multiTaxiController,
    apiMarker: '@Get("platform-admin/multi-taxi-trip-records")',
  },
  {
    id: "P5-COM-UI-05",
    productionRoute: "/platform-admin/p5/records (export/retention surface)",
    routeSources: [
      "apps/platform-admin-web/app/platform-admin/p5/records/page.tsx",
    ],
    surfaceSource: recordsSurface,
    surfaceMarker: 'data-screen-id="P5-COM-UI-05"',
    apiSource: multiTaxiController,
    apiMarker:
      '@Post("platform-admin/multi-taxi-trip-records/export-jobs/preview")',
  },
];

const EXPECTED_SCREEN_IDS = [
  "MTX-AUTH-UI-01",
  "MTX-AUTH-UI-02",
  "MTX-AUTH-UI-03",
  "MTX-AUTH-UI-04",
  "MTX-AUTH-UI-05",
  "MTX-AUTH-UI-06",
  "MTX-QUEUE-UI-01",
  "MTX-QUEUE-UI-02",
  "MTX-QUEUE-UI-03",
  "P5-RATE-UI-01",
  "P5-RATE-UI-02",
  "P5-RATE-UI-03",
  "P5-COM-UI-01",
  "P5-COM-UI-02",
  "P5-COM-UI-03",
  "P5-COM-UI-04",
  "P5-COM-UI-05",
] as const;

describe("E2E-MTX-UI-FULL-001 route and contract census", () => {
  it("registers exactly the 17 approved Screen IDs", () => {
    const ids = SCREEN_CONTRACTS.map(({ id }) => id);

    expect(ids).toEqual(EXPECTED_SCREEN_IDS);
    expect(new Set(ids).size).toBe(17);
  });

  it("maps every Screen ID to production route, surface, and API source", () => {
    for (const screen of SCREEN_CONTRACTS) {
      expect(screen.productionRoute.length, screen.id).toBeGreaterThan(0);
      for (const routeSource of screen.routeSources) {
        expect(
          existsSync(join(root, routeSource)),
          `${screen.id} ${routeSource}`,
        ).toBe(true);
      }
      expect(read(screen.surfaceSource), screen.id).toContain(
        screen.surfaceMarker,
      );
      expect(read(screen.apiSource), screen.id).toContain(screen.apiMarker);
    }
  });

  it("does not expose queue bypass, manual fare, or mark-paid controls", () => {
    const queueSource = [
      read("apps/ops-console-web/app/dispatch/queue/page.tsx"),
      read(queueDetailRoute),
      read("apps/ops-console-web/app/dispatch/queue/queue-view.tsx"),
    ].join("\n");
    for (const forbidden of [
      "/api/dispatch/queue/bypass",
      "forceCheckIn",
      "force-check-in",
      "overrideEligibility",
      "override-eligibility",
    ]) {
      expect(queueSource).not.toContain(forbidden);
    }

    const fareSource = read(fareSurface);
    expect(fareSource).not.toMatch(/type=["']number["']/);
    expect(fareSource).not.toContain("manualFare");
    expect(fareSource).not.toContain("fareOverride");

    const paymentSource = read(
      "apps/platform-admin-web/app/payments/[orderId]/payment-exception-detail.tsx",
    );
    expect(paymentSource).not.toContain("markPaid");
    expect(paymentSource).not.toContain("mark_paid");
    expect(paymentSource).not.toContain("mark-paid");
  });

  it("keeps legal-hold create and release visibly disabled without a mutation call", () => {
    const source = read(recordsSurface);

    expect(source).toMatch(
      /<CanvasBtn[^>]*disabled>\s*\{t\("hold\.create"\)\}/s,
    );
    expect(source).toMatch(
      /<CanvasBtn[^>]*disabled>\s*\{t\("hold\.release"\)\}/s,
    );
    expect(source).not.toContain("createLegalHold");
    expect(source).not.toContain("placeLegalHold");
    expect(source).not.toContain("releaseLegalHold");
    expect(source).not.toContain("/legal-holds");
  });

  it("keeps fare, payment, and S3 schema migrations in V0059/V0060/V0061 order", () => {
    const migrations = readdirSync(join(root, "infra/migrations")).sort();
    const expected = [
      "V0059__fare_quote_anomaly_authority.sql",
      "V0060__multi_taxi_payment_exception_read_authority.sql",
      "V0061__s3_attachment_scan_and_alert_latency.sql",
    ];
    const start = migrations.indexOf(expected[0]!);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(migrations.slice(start, start + expected.length)).toEqual(expected);
  });
});
