import { globSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import path from "node:path";
import type { BrowserContext, Locator, Page, Route } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import {
  toApiErrorEnvelope,
  toApiListData,
  toApiSuccessEnvelope,
} from "../../../apps/api/src/common/api-envelope";
import { recordsToCsv } from "../../../apps/api/src/common/csv";
import { resolveRouteAuthPolicy } from "../../../apps/api/src/common/auth/auth.policy";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import { t as translate } from "../../../apps/ops-console-web/lib/translations";
import { ApiClientError } from "../../../packages/api-client/src/index";
import {
  recordsToPdf,
  recordsToXlsx,
} from "../../../apps/api/src/modules/reporting-filing/report-renderers";
import {
  assertDailyReportHttpStatus,
  buildDailyReportFilters,
  adjacentEmptyDayFromSource,
  countCanonicalDailySource,
  validateEmptyDailyReportArtifactDownload,
  requireEmptyDailyReportList,
  EMPTY_DAY_CANDIDATE_OFFSETS,
  EMPTY_DAY_MAX_DISTANCE,
  DAILY_REPORT_FORMATS,
  DAILY_REPORT_MIME_TYPES,
  DailyReportHttpFailure,
  opsReportJobArtifactPathname,
  opsReportJobDetailPathname,
  parseCsvRecords,
  probeOwnedReportJobsWithNonReportRole,
  resolveActiveTripScreenOrder,
  resolveExpectedDailyDispatchRecord,
  runOwnedDailyReportDownloads,
  ownedSupplementalArtifactPaths,
  toTaipeiServiceDate,
  validateDailyPreviewRows,
  validateSupplementalDailyPreviewRows,
  resolveExpectedCancelledDailyDispatchRecord,
  validateDailyReportArtifactDownload,
  type DailyReportDownloadArtifactSummary,
  type DailyReportFormat,
} from "../../e2e/owned-referral-business-journey/daily-report-downloads";
import {
  Evidence,
  hash,
  JourneyFailure,
  requireFact,
  type ObjectData,
} from "../../e2e/owned-referral-business-journey/protocol";

const DEFINITION_SHA = "a".repeat(40);
const RUNTIME_SHA = "b".repeat(40);
const OPS_ORIGIN = "https://ops.example.test";
const FLEET_SUPPLY_TENANT_ID = "10000000-0000-0000-0000-000000000201";
const REFERRAL_TENANT_ID = "tenant-demo-001";
const ENTRY_SLUG = "yuhe-residence";
const PARTNER_ID = "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118";
const ORDER_ID = "f84f8629-1452-415d-b2be-b1817b6376a3";
const CONTROLLED_SIBLING_ORDER_ID = "c0947261-8285-4919-8385-531926384712";
const ORDER_NO = "DRT-20261026-0001";
const DRIVER_ID = "drv_synthetic_owned_001";
const VEHICLE_ID = "veh_synthetic_owned_001";
const PLATE_NO = "SIM-R12A0001";
const PICKUP_ADDRESS = "新北市板橋區縣民大道二段7號";
const DROPOFF_ADDRESS = "臺北市信義區市府路1號";
// ReportingService.rebuildDailyDispatchRecords persistence failure (503).
const REBUILD_FAILED_CODE = "REPORT_REBUILD_FAILED";
const REBUILD_FAILED_MESSAGE = "Daily dispatch records could not be rebuilt.";
const R12_08_FAULTS = [
  "click-throws",
  "no-hit",
  "no-error-ui",
  "success-notice",
  "wrong-route",
  "double-hit",
  "forwarded",
  "unroute-throws",
  "retry-503",
  "retry-changed-filter",
  "retry-missing-ack",
  "retry-foreign-row",
  "retry-row-identity",
] as const;

describe("managed FULL hosted supplemental artifact custody", () => {
  it("selects every controlled format, independent journal and custody while excluding private siblings", async () => {
    const workflow = await readFile(
      new URL("../../../.github/workflows/ci-integ.yml", import.meta.url),
      "utf8",
    );
    // Exercise the actual existing upload block, not a copied allowlist.
    const upload = workflow.match(
      /- name: Preserve only this consumer's allowlisted evidence\n([\s\S]*?)retention-days: 14/,
    )?.[1];
    expect(upload).toBeDefined();
    const paths = upload!.match(/ {10}path: \|\n((?: {12}[^\n]+\n)+)/)?.[1];
    expect(paths).toBeDefined();
    const patterns = paths!
      .trim()
      .split("\n")
      .map((line) => line.trim());
    const root = ".artifacts/owned-referral-business-journey";
    const supplemental = ownedSupplementalArtifactPaths(root);
    const legacy = [
      "runtime-before.json",
      "runtime-after.json",
      "journey-evidence.json",
      "booking-write-journal.json",
      "own-receipt.txt",
      "cancellations/unassigned-facts.json",
      "cancellations/unassigned-booking-write-journal.json",
      "cancellations/results.json",
      "cancellations/unassigned.png",
      ...DAILY_REPORT_FORMATS.map(
        (format) => `daily-reports/daily-dispatch-original.${format}`,
      ),
    ].map((file) => `${root}/${file}`);
    const retained = [
      ...legacy,
      supplemental.custody,
      ...Object.values(supplemental.bookingJournals),
      ...Object.values(supplemental.reportDirectories).flatMap((directory) =>
        DAILY_REPORT_FORMATS.map(
          (format) =>
            `${directory}/daily-reports/daily-dispatch-job-owned.${format}`,
        ),
      ),
    ];
    const excluded = [
      `${root}/TEN03-06/reservation-1/quote.json`,
      `${root}/TEN03-06/reservation-2/cancellation.json`,
      `${root}/TEN03-06/redispatched/assignment-trace.json`,
      `${root}/TEN03-06/redispatched/actions.json`,
      `${root}/TEN03-06/C1-no-dispatch-source.json`,
      `${root}/TEN03-06/reservation-1/order.json`,
      `${root}/TEN03-06/reservation-1/session.json`,
      `${root}/TEN03-06/reservation-1/tokens.json`,
      `${root}/TEN03-06/reservation-1/booking-write-journal.json.tmp`,
      `${root}/TEN03-06/reservation-1/daily-reports/raw-unowned.csv`,
      `${root}/TEN03-06/reservation-1/daily-reports/daily-dispatch-owned.json`,
      `${root}/TEN03-06/reservation-1/private/daily-reports/daily-dispatch-job.csv`,
      `${root}/TEN03-06/unregistered-case/booking-write-journal.json`,
      `${root}/TEN03-06/unregistered-case/daily-reports/daily-dispatch-job.csv`,
      `${root}/session.json`,
      `${root}/order.json`,
    ];
    const directory = await mkdtemp(
      path.join(tmpdir(), "owned-upload-custody-"),
    );
    try {
      // Glob selection has no content knowledge. The original renderer/row
      // orchestration tests below verify that unowned bytes are never written.
      for (const file of [...retained, ...excluded]) {
        const target = path.join(directory, file);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, `fixture:${file}`, { mode: 0o600 });
      }
      const selected = globSync(patterns, { cwd: directory }).sort();
      expect(selected).toEqual([...retained].sort());
      for (const file of excluded) expect(selected).not.toContain(file);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function buildOrderFixture(overrides: Partial<ObjectData> = {}): ObjectData {
  return {
    orderId: ORDER_ID,
    orderNo: ORDER_NO,
    status: "completed",
    orderSource: "portal",
    tenantId: REFERRAL_TENANT_ID,
    partnerId: PARTNER_ID,
    partnerEntrySlug: ENTRY_SLUG,
    serviceBucket: "business_dispatch",
    businessDispatchSubtype: "enterprise_dispatch",
    serviceProductCode: "enterprise_dispatch",
    createdAt: "2026-10-25T18:10:00.000Z", // 2026-10-26 02:10:00 Asia/Taipei
    reservationWindowStart: null,
    pickup: { address: PICKUP_ADDRESS },
    dropoff: { address: DROPOFF_ADDRESS },
    assignedDriverId: DRIVER_ID,
    assignedVehicleId: VEHICLE_ID,
    tripCompletion: {
      completedAt: "2026-10-25T18:30:00.000Z",
    },
    ...overrides,
  };
}

function buildTaskFixture(overrides: Partial<ObjectData> = {}): ObjectData {
  return {
    taskId: "tsk_synthetic_owned_001",
    orderId: ORDER_ID,
    driverId: DRIVER_ID,
    vehicleId: VEHICLE_ID,
    status: "completed",
    arrivedPickupAt: "2026-10-25T18:18:00.000Z",
    startedAt: "2026-10-25T18:20:00.000Z",
    completedAt: "2026-10-25T18:30:00.000Z",
    ...overrides,
  };
}

function buildOwnContext() {
  return {
    entrySlug: ENTRY_SLUG,
    fleetSupplyTenantId: FLEET_SUPPLY_TENANT_ID,
    driverId: DRIVER_ID,
    vehicleId: VEHICLE_ID,
    plateNo: PLATE_NO,
    pickupAddress: PICKUP_ADDRESS,
    dropoffAddress: DROPOFF_ADDRESS,
  };
}

function buildDailyDispatchRow(
  overrides: Partial<ObjectData> = {},
): ObjectData {
  return {
    serviceDate: "2026-10-26",
    orderId: ORDER_ID,
    orderNo: ORDER_NO,
    orderSource: "tenant_portal",
    tenantId: REFERRAL_TENANT_ID,
    partnerId: PARTNER_ID,
    serviceProductCode: "enterprise_dispatch",
    requestedAt: "2026-10-25T18:10:00.000Z",
    reservationTime: null,
    pickupAddressSnapshot: PICKUP_ADDRESS,
    dropoffAddressSnapshot: DROPOFF_ADDRESS,
    firstDispatchAt: "2026-10-25T18:11:00.000Z",
    firstAssignedAt: "2026-10-25T18:12:00.000Z",
    finalDriverId: DRIVER_ID,
    finalVehicleId: VEHICLE_ID,
    finalPlateNo: PLATE_NO,
    etaSecondsAtAssignment: 180,
    arrivedPickupAt: "2026-10-25T18:18:00.000Z",
    tripStartedAt: "2026-10-25T18:20:00.000Z",
    tripCompletedAt: "2026-10-25T18:30:00.000Z",
    finalStatus: "completed",
    redispatchCount: 0,
    cancellationReason: null,
    complaintCount: 1,
    generatedAt: "2026-10-25T18:31:00.000Z",
    ...overrides,
  };
}

function buildJobDetailFixture(
  format: DailyReportFormat,
  jobId: string,
  rows: ObjectData[],
  overrides: Partial<ObjectData> = {},
): ObjectData {
  const expected = resolveExpectedDailyDispatchRecord(
    buildOrderFixture(),
    buildTaskFixture(),
    buildOwnContext(),
  );
  const filters = buildDailyReportFilters(expected);
  return {
    jobId,
    jobType: "daily_dispatch_record",
    format,
    status: "completed",
    filters,
    createdAt: "2026-10-25T18:32:00.000Z",
    updatedAt: "2026-10-25T18:32:01.000Z",
    artifact: {
      artifactId: `art_${jobId}`,
      artifactType: "report",
      downloadUrl: `/reports/${encodeURIComponent(jobId)}/artifact`,
      expiresAt: "2026-10-26T18:32:00.000Z",
      manifestHash: "c".repeat(64),
      immutable: true,
      downloadMetadata: null,
    },
    rows,
    ...overrides,
  };
}

// Preserve the real API success producer and global wire interceptor in the
// socket-free harness; only the browser/transport are simulated below.
function successWireBytes(data: unknown): Buffer {
  return Buffer.from(
    JSON.stringify(
      deepToSnakeCase(
        toApiSuccessEnvelope(data, "b7e78ce8-82c1-46fb-a457-1f90ee7cdf55"),
      ),
    ),
  );
}

async function renderFormatBytes(
  format: DailyReportFormat,
  jobId: string,
  rows: ObjectData[],
): Promise<Buffer> {
  const plainRows = rows as unknown as Record<string, unknown>[];
  if (format === "csv") {
    return Buffer.from(recordsToCsv(plainRows), "utf8");
  }
  if (format === "xlsx") {
    return recordsToXlsx(plainRows, "daily_dispatch_record");
  }
  return recordsToPdf(plainRows, `daily_dispatch_record — ${jobId}`);
}

function cancelledCase() {
  const raw = JSON.stringify({ entrySlug: ENTRY_SLUG, quoteId: "quote-C1" });
  const order = buildOrderFixture({
    status: "cancelled",
    assignedDriverId: null,
    assignedVehicleId: null,
    tripCompletion: null,
    cancelledAt: "2026-10-25T18:11:00.000Z",
    cancelReason: null,
  });
  const expected = resolveExpectedCancelledDailyDispatchRecord(
    order,
    {
      state: "acknowledged",
      orderId: ORDER_ID,
      quoteId: "quote-C1",
      entrySlug: ENTRY_SLUG,
      body: raw,
      bodySha256: hash(Buffer.from(raw)),
    },
    buildOwnContext(),
  );
  const row = buildDailyDispatchRow({
    ...expected,
    firstDispatchAt: null,
    firstAssignedAt: null,
    etaSecondsAtAssignment: null,
    complaintCount: 0,
  });
  delete row.caseKind;
  return { order, expected, row };
}

// A canonical createdAt at 02:10 Asia/Taipei on the given Taipei calendar day.
function taipeiCreatedAt(day: string): string {
  return new Date(`${day}T02:10:00.000+08:00`).toISOString();
}

// Plain UTC calendar arithmetic for expected values only; the selection under
// test always runs through adjacentEmptyDayFromSource itself.
function shiftDay(day: string, offset: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

// The authorized nearest-first bounded order, written out independently.
const NEAREST_FIRST_OFFSETS = Array.from({ length: 31 }, (_, index) => [
  -(index + 1),
  index + 1,
]).flat();

function occupantOn(
  base: ObjectData,
  orderId: string,
  day: string,
  overrides: Partial<ObjectData> = {},
): ObjectData {
  return { ...base, orderId, createdAt: taipeiCreatedAt(day), ...overrides };
}

// R12-10 external API port. Only fetch/env are controlled: the helper, the
// existing operational session verification/probe, the production route auth
// policy and the API envelope/wire producers all stay real. No socket opens.
const NONREPORT_API_ORIGIN = "https://api.example.test";
const NONREPORT_FLEET_SESSION_TOKEN = "synthetic-own-fleet-session-secret";
const NONREPORT_FLEET_IDENTITY = {
  realm: "partner",
  authMode: "jwt_bearer",
  actorType: "partner_api_key",
  actorId: "pk_synthetic_own_fleet",
  principalId: "pk_synthetic_own_fleet",
  sessionId: "sess_synthetic_own_fleet",
  partnerId: "fleet-demo-001",
  tenantId: FLEET_SUPPLY_TENANT_ID,
  scopes: ["billing:read", "partner:read", "partner:write"],
} as const;

type NonReportApiScenario = {
  identity?: Partial<Record<keyof typeof NONREPORT_FLEET_IDENTITY, unknown>>;
  active?: boolean;
  sessionStatus?: number;
  sessionSha?: string;
  reportSha?: string;
  // Replaces the production-policy decision for report routes only.
  report?: (pathname: string) => {
    status: number;
    body?: unknown;
    headers?: Record<string, string>;
  };
  onReport?: (pathname: string) => void;
};

function installNonReportRoleApi(scenario: NonReportApiScenario = {}) {
  const calls: Array<{
    method: string;
    pathname: string;
    redirect: RequestRedirect | undefined;
    authorization: string | null;
  }> = [];
  const identity = { ...NONREPORT_FLEET_IDENTITY, ...scenario.identity };
  const wire = (
    status: number,
    body: unknown,
    sha: string,
    headers: Record<string, string> = {},
  ) =>
    new Response(
      body === undefined ? null : JSON.stringify(deepToSnakeCase(body)),
      {
        status,
        headers: {
          "content-type": "application/json",
          "x-drts-candidate-sha": sha,
          ...headers,
        },
      },
    );
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = (init?.method ?? "GET").toUpperCase();
      const headers = new Headers(init?.headers);
      calls.push({
        method,
        pathname: url.pathname,
        redirect: init?.redirect,
        authorization: headers.get("authorization"),
      });
      if (url.origin !== NONREPORT_API_ORIGIN || method !== "GET")
        throw new TypeError("socket-free harness: unexpected external request");
      const authorized =
        headers.get("authorization") ===
        `Bearer ${NONREPORT_FLEET_SESSION_TOKEN}`;
      if (url.pathname === "/api/auth/session") {
        const sha = scenario.sessionSha ?? RUNTIME_SHA;
        if (!authorized)
          return wire(
            401,
            toApiErrorEnvelope("AUTHENTICATION_REQUIRED", "private-auth"),
            sha,
          );
        if (scenario.sessionStatus !== undefined)
          return wire(
            scenario.sessionStatus,
            toApiErrorEnvelope("SESSION_REVOKED", "private-session-error"),
            sha,
          );
        return wire(
          200,
          toApiSuccessEnvelope({ active: scenario.active ?? true, identity }),
          sha,
        );
      }
      if (/^\/api\/reports\/[^/]+(\/artifact)?$/.test(url.pathname)) {
        scenario.onReport?.(url.pathname);
        const sha = scenario.reportSha ?? RUNTIME_SHA;
        if (scenario.report) {
          const forced = scenario.report(url.pathname);
          return wire(forced.status, forced.body, sha, forced.headers);
        }
        if (!authorized)
          return wire(
            401,
            toApiErrorEnvelope("AUTHENTICATION_REQUIRED", "private-auth"),
            sha,
          );
        const policy = resolveRouteAuthPolicy("GET", url.pathname);
        if (!policy) throw new TypeError("report route policy missing");
        if (!policy.allowedRealms.includes(identity.realm as never))
          return wire(
            403,
            toApiErrorEnvelope("AUTH_REALM_DENIED", "private-denial", {
              route: url.toString(),
              realm: identity.realm,
            }),
            sha,
          );
        if (
          !policy.requiredScopes.every((scope) =>
            (identity.scopes as readonly string[]).includes(scope),
          )
        )
          return wire(
            403,
            toApiErrorEnvelope("AUTH_SCOPE_DENIED", "private-denial"),
            sha,
          );
        return wire(
          200,
          toApiSuccessEnvelope({ rows: [{ orderId: "private-other-row" }] }),
          sha,
        );
      }
      throw new TypeError("socket-free harness: unexpected API path");
    },
  );
  vi.stubEnv("DRTS_OPERATIONAL_API_URL", `${NONREPORT_API_ORIGIN}/`);
  vi.stubEnv("DRTS_OPERATIONAL_API_ID_TOKEN", "");
  vi.stubEnv("DRTS_DEV_API_ID_TOKEN", "");
  vi.stubEnv(
    "DRTS_OPERATIONAL_FLEET_SESSION_TOKEN",
    NONREPORT_FLEET_SESSION_TOKEN,
  );
  vi.stubEnv("DRTS_CANDIDATE_SHA", RUNTIME_SHA);
  vi.stubGlobal("fetch", fetchImpl);
  return {
    calls,
    reportCalls: () =>
      calls.filter((call) => call.pathname.startsWith("/api/reports/")),
    restore: () => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    },
  };
}

describe("BUREAU-R12-EXISTING-OWNED-REPORT-DOWNLOAD-COVERAGE-20261025 unit contract", () => {
  it("actual inner selectors isolate concurrent same-path queries and methods, and remove timed-out waiters", async () => {
    // Supplement the complete runOwnedDailyReportDownloads fake-port runs below
    // with overlapping selectors. Execute the original inner source verbatim;
    // only Route ports/clock are controlled, no copied selector/handler logic.
    const source = await readFile(
      new URL(
        "../../e2e/owned-referral-business-journey/daily-report-downloads.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const routes = source.slice(
      source.indexOf("const REPORT_HTTP_ROUTES ="),
      source.indexOf("const SAFE_REPORT_ERROR_CODES"),
    );
    const inner = source.slice(
      source.indexOf("  type PendingWaiter ="),
      source.indexOf("  await context.route("),
    );
    const code = ts.transpileModule(
      `${routes}
${inner}
({ waitForOpsExchange, routeHandler, pending: () => waiters.length });`,
      {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.None,
        },
      },
    ).outputText;
    const evidence = new Evidence();
    vi.useFakeTimers();
    try {
      const actual = runInNewContext(code, {
        JourneyFailure,
        requireFact,
        URL,
        opsOrigin: OPS_ORIGIN,
        opsHeaders: () => ({}),
        runtimeSha: RUNTIME_SHA,
        evidence,
        performance,
        setTimeout,
        clearTimeout,
      }) as {
        waitForOpsExchange: (
          predicate: (request: {
            method: string;
            pathname: string;
            searchParams: URLSearchParams;
          }) => boolean,
          stage: string,
          timeout?: number,
        ) => Promise<unknown>;
        routeHandler: (route: Route) => Promise<void>;
        pending: () => number;
      };
      const settled = ["pending", "pending", "pending"];
      const requests = ["one", "two", "post"].map((query, index) =>
        actual
          .waitForOpsExchange(
            (request) =>
              request.method === (query === "post" ? "POST" : "GET") &&
              request.pathname === "/control-plane-proxy/reports/jobs" &&
              request.searchParams.get("q") === query,
            "query-control",
          )
          .then(
            () => {
              settled[index] = "resolved";
            },
            () => {
              settled[index] = "rejected";
            },
          ),
      );
      let aborts = 0;
      const dispatch = (method: string, query: string, fail: boolean) =>
        actual.routeHandler({
          request: () => ({
            method: () => method,
            url: () =>
              `${OPS_ORIGIN}/control-plane-proxy/reports/jobs?q=${query}`,
            postData: () => null,
            headers: () => ({}),
          }),
          fetch: async () => {
            if (fail) throw new TypeError("private-error");
            return {
              body: async () => Buffer.from("ok"),
              status: () => 200,
              url: () => OPS_ORIGIN,
              headers: () => ({ "x-drts-candidate-sha": RUNTIME_SHA }),
            };
          },
          fulfill: async () => undefined,
          abort: async () => {
            aborts += 1;
          },
        } as unknown as Route);
      await dispatch("GET", "other", true);
      expect(settled).toEqual(["pending", "pending", "pending"]);
      await dispatch("GET", "one", true);
      expect(settled).toEqual(["rejected", "pending", "pending"]);
      await dispatch("GET", "two", false);
      expect(settled).toEqual(["rejected", "resolved", "pending"]);
      await dispatch("POST", "post", false);
      await Promise.all(requests);
      expect(settled).toEqual(["rejected", "resolved", "resolved"]);
      expect(aborts).toBe(2);
      expect(actual.pending()).toBe(0);
      const timeout = actual.waitForOpsExchange(
        () => false,
        "query-timeout-control",
      );
      const rejection = expect(timeout).rejects.toMatchObject({
        stage: "query-timeout-control:timeout",
      });
      await vi.advanceTimersByTimeAsync(15_000);
      await rejection;
      expect(actual.pending()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("F6: captures only typed safe non-200 preview status/known route/code/trace before rejecting, never raw body or headers", () => {
    const evidence = new Evidence();
    const secret = "sensitive-customer-and-auth-material";
    const traceId = "b7e78ce8-82c1-46fb-a457-1f90ee7cdf55";
    const exchange = {
      status: 503,
      method: "GET",
      pathname: "/control-plane-proxy/reports/daily-dispatch-records",
      runtimeSha: RUNTIME_SHA,
      bytes: Buffer.from(
        JSON.stringify({
          error: {
            code: "REPORT_READ_FAILED",
            trace_id: traceId,
            message: secret,
            details: { authorization: secret },
          },
        }),
      ),
    };
    expect(() =>
      assertDailyReportHttpStatus(
        exchange,
        "preview",
        [200],
        RUNTIME_SHA,
        evidence,
      ),
    ).toThrow("daily-report-preview-status-200: HTTP 503 REPORT_READ_FAILED");
    expect(evidence.events).toEqual([
      {
        stage: "daily-report-http-preview-get-daily-dispatch-records",
        status: 503,
        code: "REPORT_READ_FAILED",
        objectKey: traceId,
        result: "failed",
      },
    ]);
    expect(JSON.stringify(evidence.events)).not.toContain(secret);

    for (const unsafe of [
      { error: { code: secret, traceId, message: secret } },
      {
        error: { code: "REPORT_READ_FAILED", traceId: secret, message: secret },
      },
      { error: { code: "REPORT_READ_FAILED", traceId, message: secret } },
    ]) {
      const bounded = new Evidence();
      const candidate = {
        ...exchange,
        bytes: Buffer.from(JSON.stringify(unsafe)),
      };
      expect(() =>
        assertDailyReportHttpStatus(
          candidate,
          "preview",
          [200],
          RUNTIME_SHA,
          bounded,
        ),
      ).toThrow(JourneyFailure);
      expect(JSON.stringify(bounded.events)).not.toContain(secret);
    }
    const malformed = new Evidence();
    expect(() =>
      assertDailyReportHttpStatus(
        { ...exchange, bytes: Buffer.from("<html>"), status: 502 },
        "preview",
        [200],
        RUNTIME_SHA,
        malformed,
      ),
    ).toThrow("HTTP 502");
    expect(malformed.events).toEqual([
      {
        stage: "daily-report-http-preview-get-daily-dispatch-records",
        status: 502,
        result: "failed",
      },
    ]);
  });

  it.each([
    ["initial-reports-page", "GET", "/reports", [200]],
    ["initial-jobs", "GET", "/control-plane-proxy/reports/jobs", [200]],
    [
      "rebuild",
      "POST",
      "/control-plane-proxy/reports/daily-dispatch-records/rebuild",
      [200, 201],
    ],
    [
      "rebuilt-preview",
      "GET",
      "/control-plane-proxy/reports/daily-dispatch-records",
      [200],
    ],
    ["create-job-csv", "POST", "/control-plane-proxy/reports/jobs", [200, 201]],
    [
      "create-job-xlsx",
      "POST",
      "/control-plane-proxy/reports/jobs",
      [200, 201],
    ],
    ["create-job-pdf", "POST", "/control-plane-proxy/reports/jobs", [200, 201]],
    ["reload-jobs", "GET", "/control-plane-proxy/reports/jobs", [200]],
    [
      "job-detail-csv",
      "GET",
      "/control-plane-proxy/reports/job_r12_csv",
      [200],
    ],
    [
      "job-detail-xlsx",
      "GET",
      "/control-plane-proxy/reports/job_r12_xlsx",
      [200],
    ],
    [
      "job-detail-pdf",
      "GET",
      "/control-plane-proxy/reports/job_r12_pdf",
      [200],
    ],
    [
      "artifact-download-csv",
      "GET",
      "/control-plane-proxy/reports/job_r12_csv/artifact",
      [200],
    ],
    [
      "artifact-download-xlsx",
      "GET",
      "/control-plane-proxy/reports/job_r12_xlsx/artifact",
      [200],
    ],
    [
      "artifact-download-pdf",
      "GET",
      "/control-plane-proxy/reports/job_r12_pdf/artifact",
      [200],
    ],
  ] as const)(
    "F6: %s non-200 is safely attributed and stops before body parse",
    (phase, method, pathname, accepted) => {
      const evidence = new Evidence();
      const exchange = {
        method,
        pathname,
        status: 403,
        runtimeSha: RUNTIME_SHA,
        bytes: Buffer.from(
          JSON.stringify({
            error: { code: "IAP_SUBJECT_FORBIDDEN", message: "private-value" },
          }),
        ),
      };
      expect(() =>
        assertDailyReportHttpStatus(
          exchange,
          phase,
          accepted,
          RUNTIME_SHA,
          evidence,
        ),
      ).toThrow(DailyReportHttpFailure);
      expect(evidence.events).toMatchObject([
        { status: 403, code: "IAP_SUBJECT_FORBIDDEN", result: "failed" },
      ]);
      expect(JSON.stringify(evidence.events)).not.toContain("private-value");
      const passed = new Evidence();
      assertDailyReportHttpStatus(
        { ...exchange, status: accepted[0]! },
        phase,
        accepted,
        RUNTIME_SHA,
        passed,
      );
      expect(passed.events).toHaveLength(0);
      expect(() =>
        assertDailyReportHttpStatus(
          {
            ...exchange,
            pathname:
              "/control-plane-proxy/reports/other/artifact?token=secret",
          },
          phase,
          accepted,
          RUNTIME_SHA,
          new Evidence(),
        ),
      ).toThrow("daily-report-http-known-route-and-runtime-required");
    },
  );
  it("F1 regression: resolves TripScreen rendered displayOrderNo instead of raw UUID while binding active trip and URL orderId", () => {
    const activeData: ObjectData = {
      trip: {
        orderId: ORDER_ID,
        orderNo: `O-${ORDER_ID}`,
        status: "created",
      },
    };
    const pageUrl = `https://referral.example.test/embed/${ENTRY_SLUG}?state=handoff&screen=trip&orderId=${encodeURIComponent(ORDER_ID)}`;
    const resolved = resolveActiveTripScreenOrder(
      activeData,
      ORDER_ID,
      pageUrl,
      "current UI cancellation",
    );
    expect(resolved.orderId).toBe(ORDER_ID);
    expect(resolved.orderNo).toBe(`O-${ORDER_ID}`);
    expect(resolved.displayOrderNo).toBe("O-F84F8629");
    expect(resolved.displayOrderNo).not.toBe(ORDER_ID);

    const resolvedCanonicalOrderNo = resolveActiveTripScreenOrder(
      {
        trip: {
          orderId: ORDER_ID,
          orderNo: ORDER_NO,
          status: "created",
        },
      },
      ORDER_ID,
      pageUrl,
      "current UI cancellation",
    );
    expect(resolvedCanonicalOrderNo.displayOrderNo).toBe(ORDER_NO);
    expect(resolvedCanonicalOrderNo.displayOrderNo).not.toBe(ORDER_ID);

    // Rejects mismatched active trip orderId
    expect(() =>
      resolveActiveTripScreenOrder(
        {
          trip: {
            orderId: CONTROLLED_SIBLING_ORDER_ID,
            orderNo: CONTROLLED_SIBLING_ORDER_ID,
          },
        },
        ORDER_ID,
        pageUrl,
        "current UI cancellation",
      ),
    ).toThrow("current UI cancellation");

    // Rejects mismatched URL query param orderId
    expect(() =>
      resolveActiveTripScreenOrder(
        activeData,
        ORDER_ID,
        `https://referral.example.test/embed/${ENTRY_SLUG}?state=handoff&screen=trip&orderId=${encodeURIComponent(CONTROLLED_SIBLING_ORDER_ID)}`,
        "current UI cancellation",
      ),
    ).toThrow("current UI cancellation");
  });

  it("F2 regression: derives report tenantId from canonical Referral order even when Fleet supply tenantId differs", () => {
    expect(toTaipeiServiceDate("2026-10-25T18:10:00.000Z")).toBe("2026-10-26");
    expect(REFERRAL_TENANT_ID).not.toBe(FLEET_SUPPLY_TENANT_ID);
    const expected = resolveExpectedDailyDispatchRecord(
      buildOrderFixture(),
      buildTaskFixture(),
      buildOwnContext(),
    );
    expect(expected).toMatchObject({
      orderId: ORDER_ID,
      orderNo: ORDER_NO,
      serviceDate: "2026-10-26",
      orderSource: "tenant_portal",
      tenantId: REFERRAL_TENANT_ID,
      partnerId: PARTNER_ID,
      serviceProductCode: "enterprise_dispatch",
      pickupAddressSnapshot: PICKUP_ADDRESS,
      dropoffAddressSnapshot: DROPOFF_ADDRESS,
      finalDriverId: DRIVER_ID,
      finalVehicleId: VEHICLE_ID,
      finalPlateNo: PLATE_NO,
      arrivedPickupAt: "2026-10-25T18:18:00.000Z",
      tripStartedAt: "2026-10-25T18:20:00.000Z",
      tripCompletedAt: "2026-10-25T18:30:00.000Z",
      finalStatus: "completed",
    });
    expect(buildDailyReportFilters(expected)).toEqual({
      serviceDateFrom: "2026-10-26",
      serviceDateTo: "2026-10-26",
      orderSource: "tenant_portal",
      tenantId: REFERRAL_TENANT_ID,
      partnerId: PARTNER_ID,
      serviceProductCode: "enterprise_dispatch",
      finalStatus: "completed",
    });

    // Missing order.tenantId must never silently fall back to Fleet supply tenantId
    expect(() =>
      resolveExpectedDailyDispatchRecord(
        buildOrderFixture({ tenantId: null }),
        buildTaskFixture(),
        buildOwnContext(),
      ),
    ).toThrow("daily-report-synthetic-tenant-id-required");

    // Mismatched partnerEntrySlug must fail
    expect(() =>
      resolveExpectedDailyDispatchRecord(
        buildOrderFixture({ partnerEntrySlug: "other-entry" }),
        buildTaskFixture(),
        buildOwnContext(),
      ),
    ).toThrow("daily-report-referral-entry-binding");
  });

  it("F3 regression: binds Ops report job detail route to /control-plane-proxy/reports/{jobId} matching ApiClient.getReportJob", () => {
    expect(opsReportJobDetailPathname("job_r12_001")).toBe(
      "/control-plane-proxy/reports/job_r12_001",
    );
    expect(opsReportJobDetailPathname("job_r12_001")).not.toContain(
      "/reports/jobs/",
    );
    expect(opsReportJobArtifactPathname("job_r12_001")).toBe(
      "/control-plane-proxy/reports/job_r12_001/artifact",
    );
  });

  it("rejects incomplete order/task or mismatched own supply when resolving expected record", () => {
    expect(() =>
      resolveExpectedDailyDispatchRecord(
        buildOrderFixture({ status: "on_trip" }),
        buildTaskFixture(),
        buildOwnContext(),
      ),
    ).toThrow(JourneyFailure);
    expect(() =>
      resolveExpectedDailyDispatchRecord(
        buildOrderFixture(),
        buildTaskFixture({ arrivedPickupAt: null }),
        buildOwnContext(),
      ),
    ).toThrow(JourneyFailure);
    expect(() =>
      resolveExpectedDailyDispatchRecord(
        buildOrderFixture({ assignedVehicleId: "veh_foreign" }),
        buildTaskFixture(),
        buildOwnContext(),
      ),
    ).toThrow(JourneyFailure);
  });

  it("F5 regression: validates preview rows and distinguishes controlled owned sibling rows from unverified sibling rows", () => {
    const expected = resolveExpectedDailyDispatchRecord(
      buildOrderFixture(),
      buildTaskFixture(),
      buildOwnContext(),
    );
    const ownRow = buildDailyDispatchRow();
    const controlledSiblingRow = buildDailyDispatchRow({
      orderId: CONTROLLED_SIBLING_ORDER_ID,
      orderNo: "DRT-20261026-0002",
    });
    const unverifiedSiblingRow = buildDailyDispatchRow({
      orderId: "ord_unverified_sibling",
      orderNo: "DRT-20261026-0003",
    });

    // When all rows belong to controlledOrderIds, syntheticProvenanceVerified is true
    const verifiedControlled = validateDailyPreviewRows(
      [controlledSiblingRow, ownRow],
      expected,
      RUNTIME_SHA,
      RUNTIME_SHA,
      [ORDER_ID, CONTROLLED_SIBLING_ORDER_ID],
    );
    expect(verifiedControlled.rowCount).toBe(2);
    expect(verifiedControlled.controlledRowCount).toBe(2);
    expect(verifiedControlled.unverifiedSiblingRowCount).toBe(0);
    expect(verifiedControlled.syntheticProvenanceVerified).toBe(true);
    expect(verifiedControlled.provenanceQualification).toBe(
      "all-rows-controlled-synthetic",
    );
    expect(verifiedControlled.ownRow).toEqual(ownRow);
    expect(verifiedControlled.complaintCount).toBe(1);

    // When an unverified sibling row exists on the same filter scope, own order is verified
    // but syntheticProvenanceVerified is false so raw multi-row files are not retained
    const withUnverifiedSibling = validateDailyPreviewRows(
      [unverifiedSiblingRow, ownRow],
      expected,
      RUNTIME_SHA,
      RUNTIME_SHA,
      [ORDER_ID, CONTROLLED_SIBLING_ORDER_ID],
    );
    expect(withUnverifiedSibling.rowCount).toBe(2);
    expect(withUnverifiedSibling.controlledRowCount).toBe(1);
    expect(withUnverifiedSibling.unverifiedSiblingRowCount).toBe(1);
    expect(withUnverifiedSibling.syntheticProvenanceVerified).toBe(false);
    expect(withUnverifiedSibling.provenanceQualification).toBe(
      "own-row-verified-unowned-siblings-present-raw-retention-skipped",
    );

    // Missing own order must fail
    expect(() =>
      validateDailyPreviewRows(
        [controlledSiblingRow],
        expected,
        RUNTIME_SHA,
        RUNTIME_SHA,
        [ORDER_ID, CONTROLLED_SIBLING_ORDER_ID],
      ),
    ).toThrow("daily-report-preview-missing-own-order");

    // Runtime SHA mismatch must fail
    expect(() =>
      validateDailyPreviewRows([ownRow], expected, RUNTIME_SHA, "c".repeat(40)),
    ).toThrow("daily-report-preview-runtime-sha-mismatch");

    // Unqualified foreign tenant/partner row in preview must fail
    expect(() =>
      validateDailyPreviewRows(
        [
          ownRow,
          buildDailyDispatchRow({
            orderId: "ord_foreign_tenant",
            tenantId: "foreign-tenant-999",
          }),
        ],
        expected,
        RUNTIME_SHA,
        RUNTIME_SHA,
      ),
    ).toThrow("daily-report-preview-unqualified-or-foreign-fixture-row");

    // Plate or arrival timestamp mismatch on own row must fail
    expect(() =>
      validateDailyPreviewRows(
        [buildDailyDispatchRow({ finalPlateNo: "SIM-WRONG99" })],
        expected,
        RUNTIME_SHA,
        RUNTIME_SHA,
      ),
    ).toThrow("daily-report-preview-own-order-field-mismatch");
  });

  it.each([
    ["firstDispatchAt", {}, "absent", "undefined", false],
    ["firstDispatchAt", { firstDispatchAt: null }, "present", "null", false],
    ["firstDispatchAt", { firstDispatchAt: 123 }, "present", "number", false],
    [
      "firstDispatchAt",
      { firstDispatchAt: "secret-invalid-dispatch" },
      "present",
      "string",
      false,
    ],
    ["firstAssignedAt", {}, "absent", "undefined", false],
    ["firstAssignedAt", { firstAssignedAt: null }, "present", "null", false],
    ["firstAssignedAt", { firstAssignedAt: 123 }, "present", "number", false],
    [
      "firstAssignedAt",
      { firstAssignedAt: "secret-invalid-assignment" },
      "present",
      "string",
      false,
    ],
    ["etaSecondsAtAssignment", {}, "absent", "undefined", false],
    [
      "etaSecondsAtAssignment",
      { etaSecondsAtAssignment: null },
      "present",
      "null",
      false,
    ],
    [
      "etaSecondsAtAssignment",
      { etaSecondsAtAssignment: "secret-invalid-eta" },
      "present",
      "string",
      false,
    ],
    [
      "etaSecondsAtAssignment",
      { etaSecondsAtAssignment: NaN },
      "present",
      "number",
      false,
    ],
    [
      "etaSecondsAtAssignment",
      { etaSecondsAtAssignment: Infinity },
      "present",
      "number",
      false,
    ],
    [
      "etaSecondsAtAssignment",
      { etaSecondsAtAssignment: -1 },
      "present",
      "number",
      true,
    ],
  ] as const)(
    "classifies invalid own row %s at real preview validator boundary (%s)",
    (field, overrides, presence, kind, finite) => {
      const expected = resolveExpectedDailyDispatchRecord(
        buildOrderFixture(),
        buildTaskFixture(),
        buildOwnContext(),
      );
      const row = buildDailyDispatchRow(overrides);
      if (presence === "absent") delete row[field];
      const evidence = new Evidence();
      expect(() =>
        validateDailyPreviewRows(
          [row],
          expected,
          RUNTIME_SHA,
          RUNTIME_SHA,
          [ORDER_ID],
          evidence,
        ),
      ).toThrow("daily-report-preview-dispatch-assignment-fields-required");
      const diagnostic = JSON.stringify(evidence.events);
      expect(evidence.events).toHaveLength(7);
      expect(diagnostic).toContain(
        `daily-report-preview-field-${field}-${presence}-type-${kind}`,
      );
      if (field === "etaSecondsAtAssignment") {
        expect(diagnostic).toContain(
          `daily-report-preview-field-${field}-finite-${finite}`,
        );
        const etaValue = row[field];
        expect(diagnostic).toContain(
          `daily-report-preview-field-${field}-nonnegative-${finite && typeof etaValue === "number" && etaValue >= 0}`,
        );
      } else {
        expect(diagnostic).toContain(
          `daily-report-preview-field-${field}-parseable-false`,
        );
      }
      // All three fixed fields must be classified; no raw value or identifier is logged.
      for (const key of [
        "firstDispatchAt",
        "firstAssignedAt",
        "etaSecondsAtAssignment",
      ]) {
        expect(diagnostic).toContain(`daily-report-preview-field-${key}-`);
      }
      for (const privateValue of [
        "secret-invalid",
        ORDER_ID,
        PICKUP_ADDRESS,
        "2026-10-25T18:11:00.000Z",
      ]) {
        expect(diagnostic).not.toContain(privateValue);
      }
    },
  );

  it.each([0, 180])(
    "accepts valid ETA %i with parseable timestamps without diagnostic events",
    (eta) => {
      const expected = resolveExpectedDailyDispatchRecord(
        buildOrderFixture(),
        buildTaskFixture(),
        buildOwnContext(),
      );
      const evidence = new Evidence();
      expect(
        validateDailyPreviewRows(
          [buildDailyDispatchRow({ etaSecondsAtAssignment: eta })],
          expected,
          RUNTIME_SHA,
          RUNTIME_SHA,
          [ORDER_ID],
          evidence,
        ).ownRow.etaSecondsAtAssignment,
      ).toBe(eta);
      expect(evidence.events).toEqual([]);
    },
  );

  it.each(DAILY_REPORT_FORMATS)(
    "F4 regression: validates genuine %s artifact download against actual ReportArtifactRecord contract and owned order content",
    async (format) => {
      const expected = resolveExpectedDailyDispatchRecord(
        buildOrderFixture(),
        buildTaskFixture(),
        buildOwnContext(),
      );
      const ownRow = buildDailyDispatchRow();
      const jobId = `job_r12_${format}_001`;
      const jobDetail = buildJobDetailFixture(format, jobId, [ownRow]);
      expect(jobDetail.artifact).not.toHaveProperty("format");
      expect(jobDetail.artifact).not.toHaveProperty("fileName");
      const bytes = await renderFormatBytes(format, jobId, [ownRow]);
      const fileName = `daily_dispatch_record-${jobId}.${format}`;

      const summary = await validateDailyReportArtifactDownload({
        format,
        jobId,
        jobDetail,
        detailStatus: 200,
        detailResponseSha: RUNTIME_SHA,
        artifactStatus: 200,
        artifactResponseSha: RUNTIME_SHA,
        contentType: `${DAILY_REPORT_MIME_TYPES[format]}; charset=utf-8`,
        contentDisposition: `attachment; filename="${fileName}"`,
        bytes,
        expected,
        previewOwnRow: ownRow,
        runtimeSha: RUNTIME_SHA,
        artifactPath: `.artifacts/owned-referral-business-journey/daily-reports/daily-dispatch-${jobId}.${format}`,
        controlledOrderIds: [ORDER_ID],
        nowMs: Date.parse("2026-10-25T19:00:00.000Z"),
      });

      expect(summary).toMatchObject({
        format,
        jobId,
        jobType: "daily_dispatch_record",
        jobStatus: "completed",
        contentType: DAILY_REPORT_MIME_TYPES[format],
        fileName,
        bytes: bytes.length,
        sha256: hash(bytes),
        rowCount: 1,
        controlledRowCount: 1,
        unverifiedSiblingRowCount: 0,
        ownOrderPresent: true,
        syntheticProvenanceVerified: true,
        rawArtifactRetained: true,
        provenanceQualification: "all-rows-controlled-synthetic",
        runtimeSha: RUNTIME_SHA,
      });
      expect(summary.contentSignature.matchedExpectedRender).toBe(true);
      if (format === "xlsx") {
        expect(summary.contentSignature.worksheetName).toBe(
          "daily_dispatch_record",
        );
      }
      if (format === "pdf") {
        expect(summary.contentSignature.pageCount).toBeGreaterThanOrEqual(1);
      }
    },
  );

  it.each(DAILY_REPORT_FORMATS)(
    "rejects 200 HTML error bodies, JSON error bodies, wrong MIME, invalid ReportArtifactRecord metadata, and tampered content for %s",
    async (format) => {
      const expected = resolveExpectedDailyDispatchRecord(
        buildOrderFixture(),
        buildTaskFixture(),
        buildOwnContext(),
      );
      const ownRow = buildDailyDispatchRow();
      const jobId = `job_r12_${format}_neg`;
      const jobDetail = buildJobDetailFixture(format, jobId, [ownRow]);
      const validBytes = await renderFormatBytes(format, jobId, [ownRow]);
      const fileName = `daily_dispatch_record-${jobId}.${format}`;
      const baseInput = {
        format,
        jobId,
        jobDetail,
        detailStatus: 200,
        detailResponseSha: RUNTIME_SHA,
        artifactStatus: 200,
        artifactResponseSha: RUNTIME_SHA,
        contentType: DAILY_REPORT_MIME_TYPES[format],
        contentDisposition: `attachment; filename="${fileName}"`,
        bytes: validBytes,
        expected,
        previewOwnRow: ownRow,
        runtimeSha: RUNTIME_SHA,
        artifactPath: `.artifacts/owned-referral-business-journey/daily-reports/daily-dispatch-${jobId}.${format}`,
        controlledOrderIds: [ORDER_ID],
        nowMs: Date.parse("2026-10-25T19:00:00.000Z"),
      };

      // 1. 200 HTML body must be rejected
      await expect(
        validateDailyReportArtifactDownload({
          ...baseInput,
          bytes: Buffer.from(
            "<!DOCTYPE html><html><body>502 Bad Gateway</body></html>",
            "utf8",
          ),
        }),
      ).rejects.toThrow(`daily-report-${format}-html-body-rejected`);

      // 2. 200 JSON error body must be rejected
      await expect(
        validateDailyReportArtifactDownload({
          ...baseInput,
          bytes: Buffer.from(
            JSON.stringify({ ok: false, error: { code: "NOT_FOUND" } }),
            "utf8",
          ),
        }),
      ).rejects.toThrow(`daily-report-${format}-json-error-body-rejected`);

      // 3. Wrong MIME type must be rejected
      await expect(
        validateDailyReportArtifactDownload({
          ...baseInput,
          contentType: "text/html",
        }),
      ).rejects.toThrow(`daily-report-${format}-content-type-mismatch`);

      // 4. Incomplete job status must be rejected
      await expect(
        validateDailyReportArtifactDownload({
          ...baseInput,
          jobDetail: buildJobDetailFixture(format, jobId, [ownRow], {
            status: "running",
          }),
        }),
      ).rejects.toThrow(`daily-report-${format}-completed-job-detail-binding`);

      // 5. Expired artifact must be rejected
      await expect(
        validateDailyReportArtifactDownload({
          ...baseInput,
          nowMs: Date.parse("2026-10-27T00:00:00.000Z"),
        }),
      ).rejects.toThrow(
        `daily-report-${format}-artifact-unexpired-metadata-binding`,
      );

      // 6. Wrong ReportArtifactRecord downloadUrl or immutable=false must be rejected
      await expect(
        validateDailyReportArtifactDownload({
          ...baseInput,
          jobDetail: buildJobDetailFixture(format, jobId, [ownRow], {
            artifact: {
              artifactId: `art_${jobId}`,
              artifactType: "report",
              downloadUrl: `/api/downloads/report_job/${jobId}`,
              expiresAt: "2026-10-26T18:32:00.000Z",
              manifestHash: "c".repeat(64),
              immutable: true,
            },
          }),
        }),
      ).rejects.toThrow(
        `daily-report-${format}-artifact-unexpired-metadata-binding`,
      );

      // 7. Candidate runtimeSha mismatch on artifact response must be rejected
      await expect(
        validateDailyReportArtifactDownload({
          ...baseInput,
          artifactResponseSha: "f".repeat(40),
        }),
      ).rejects.toThrow(`daily-report-${format}-runtime-sha-mismatch`);

      // 8. Downloaded file rendered from a foreign order (missing own orderId) must be rejected
      const foreignRow = buildDailyDispatchRow({
        orderId: "ord_other_synthetic",
        orderNo: "DRT-20261026-9999",
      });
      const foreignBytes = await renderFormatBytes(format, jobId, [foreignRow]);
      await expect(
        validateDailyReportArtifactDownload({
          ...baseInput,
          bytes: foreignBytes,
        }),
      ).rejects.toThrow(JourneyFailure);
    },
  );

  it("parses quoted CSV fields with commas and escaped quotes accurately", () => {
    const csv = recordsToCsv([
      {
        orderId: ORDER_ID,
        pickupAddressSnapshot: '新北市, "板橋區" 縣民大道',
      },
    ]);
    const parsed = parseCsvRecords(csv);
    expect(parsed).toEqual([
      {
        orderId: ORDER_ID,
        pickupAddressSnapshot: '新北市, "板橋區" 縣民大道',
      },
    ]);
  });

  it("TEN02: selects only a genuinely empty adjacent day from complete canonical owned orders with exact Taipei/source/product/status filters", () => {
    const positive = buildDailyReportFilters(
      resolveExpectedDailyDispatchRecord(
        buildOrderFixture(),
        buildTaskFixture(),
        buildOwnContext(),
      ),
    );
    const source = {
      items: [
        buildOrderFixture(),
        buildOrderFixture({
          orderId: "unrelated-product",
          serviceProductCode: "other",
          businessDispatchSubtype: "other",
          createdAt: "2026-10-24T18:10:00.000Z",
        }),
        buildOrderFixture({
          orderId: "unrelated-status",
          status: "cancelled",
          createdAt: "2026-10-24T18:10:00.000Z",
        }),
        buildOrderFixture({
          orderId: "unrelated-tenant",
          tenantId: "other",
          createdAt: "2026-10-24T18:10:00.000Z",
        }),
      ],
    };
    expect(countCanonicalDailySource(source, positive, ORDER_ID)).toEqual({
      count: 1,
      ownPresent: true,
    });
    expect(adjacentEmptyDayFromSource(source, positive, ORDER_ID)).toBe(
      "2026-10-25",
    );
    const occupied = {
      ...source,
      items: [
        ...source.items,
        buildOrderFixture({
          orderId: "occupied-prior",
          createdAt: "2026-10-24T18:10:00.000Z",
        }),
        buildOrderFixture({
          orderId: "occupied-next",
          createdAt: "2026-10-26T18:10:00.000Z",
        }),
      ],
    };
    expect(
      countCanonicalDailySource(
        occupied,
        {
          ...positive,
          serviceDateFrom: "2026-10-25",
          serviceDateTo: "2026-10-25",
        },
        ORDER_ID,
      ).count,
    ).toBe(1);
    // Both adjacent days occupied: the bounded nearest-first search continues
    // to D-2 (2026-10-24), which is genuinely empty, instead of failing.
    expect(adjacentEmptyDayFromSource(occupied, positive, ORDER_ID)).toBe(
      "2026-10-24",
    );
    expect(() =>
      adjacentEmptyDayFromSource({ items: [] }, positive, ORDER_ID),
    ).toThrow("daily-report-authoritative-own-positive-source-required");
    expect(() =>
      adjacentEmptyDayFromSource({ rows: [] }, positive, ORDER_ID),
    ).toThrow(JourneyFailure);
  });

  // Hosted run 40948572369 shape: C1 (finalStatus=cancelled) whose D-1 and D+1
  // both hold matching rows. The pre-fix adjacent-only helper threw
  // daily-report-no-authoritatively-empty-adjacent-day; D-2 is genuinely empty.
  it("TEN02: both adjacent days occupied under cancelled positive filters selects the nearest genuinely empty D-2", () => {
    const c1 = cancelledCase();
    const positive = buildDailyReportFilters(c1.expected);
    expect(positive.finalStatus).toBe("cancelled");
    expect(positive.serviceDateFrom).toBe("2026-10-26");
    const source = {
      items: [
        c1.order,
        occupantOn(c1.order, "occupied-prior", "2026-10-25"),
        occupantOn(c1.order, "occupied-next", "2026-10-27"),
        // Completed rows on D-2 do not occupy the cancelled query.
        occupantOn(buildOrderFixture(), "completed-on-d-2", "2026-10-24"),
      ],
    };
    const countOn = (day: string) =>
      countCanonicalDailySource(
        source,
        { ...positive, serviceDateFrom: day, serviceDateTo: day },
        ORDER_ID,
      ).count;
    expect(countOn("2026-10-25")).toBe(1);
    expect(countOn("2026-10-27")).toBe(1);
    expect(countOn("2026-10-24")).toBe(0);
    expect(adjacentEmptyDayFromSource(source, positive, ORDER_ID)).toBe(
      "2026-10-24",
    );
    // Deterministic: the same snapshot always yields the same first zero.
    expect(adjacentEmptyDayFromSource(source, positive, ORDER_ID)).toBe(
      "2026-10-24",
    );
  });

  it("TEN02: empty-day candidates are exactly -1,+1,-2,+2,...,-31,+31", () => {
    expect(EMPTY_DAY_MAX_DISTANCE).toBe(31);
    expect(EMPTY_DAY_CANDIDATE_OFFSETS).toHaveLength(62);
    expect([...EMPTY_DAY_CANDIDATE_OFFSETS]).toEqual(NEAREST_FIRST_OFFSETS);
    expect(EMPTY_DAY_CANDIDATE_OFFSETS.slice(0, 2)).toEqual([-1, 1]);
    expect(Object.isFrozen(EMPTY_DAY_CANDIDATE_OFFSETS)).toBe(true);
  });

  it("TEN02: keeps the original -1 then +1 precedence and walks nearest-first to the first zero", () => {
    const positive = buildDailyReportFilters(
      resolveExpectedDailyDispatchRecord(
        buildOrderFixture(),
        buildTaskFixture(),
        buildOwnContext(),
      ),
    );
    const own = buildOrderFixture();
    // Every other candidate day is empty unless occupied below.
    expect(
      adjacentEmptyDayFromSource({ items: [own] }, positive, ORDER_ID),
    ).toBe("2026-10-25");
    expect(
      adjacentEmptyDayFromSource(
        {
          items: [own, occupantOn(own, "occupied-prior", "2026-10-25")],
        },
        positive,
        ORDER_ID,
      ),
    ).toBe("2026-10-27");
    // Occupy the first k candidates; the (k+1)th is selected. k covers the
    // original pair, the first rings, the +/-15 middle and the +/-31 edge
    // (the exhaustive list is pinned by the candidate-order test above).
    for (const k of [0, 1, 2, 3, 4, 5, 28, 29, 30, 31, 59, 60, 61]) {
      const items = [
        own,
        ...NEAREST_FIRST_OFFSETS.slice(0, k).map((offset) =>
          occupantOn(own, `occupied-${offset}`, shiftDay("2026-10-26", offset)),
        ),
      ];
      expect(adjacentEmptyDayFromSource({ items }, positive, ORDER_ID)).toBe(
        shiftDay("2026-10-26", NEAREST_FIRST_OFFSETS[k]!),
      );
    }
    // -2 is tried before +2, +2 before -3.
    const ring1 = [
      own,
      occupantOn(own, "p1", "2026-10-25"),
      occupantOn(own, "n1", "2026-10-27"),
    ];
    expect(
      adjacentEmptyDayFromSource({ items: ring1 }, positive, ORDER_ID),
    ).toBe("2026-10-24");
    expect(
      adjacentEmptyDayFromSource(
        { items: [...ring1, occupantOn(own, "p2", "2026-10-24")] },
        positive,
        ORDER_ID,
      ),
    ).toBe("2026-10-28");
  });

  it("TEN02: all 62 bounded candidates occupied fails closed without searching beyond +/-31", () => {
    const positive = buildDailyReportFilters(
      resolveExpectedDailyDispatchRecord(
        buildOrderFixture(),
        buildTaskFixture(),
        buildOwnContext(),
      ),
    );
    const own = buildOrderFixture();
    const items = [
      own,
      ...NEAREST_FIRST_OFFSETS.map((offset) =>
        occupantOn(own, `occupied-${offset}`, shiftDay("2026-10-26", offset)),
      ),
    ];
    // D-32 (2026-09-24) and D+32 (2026-11-27) are genuinely empty but outside
    // the bound: they must never be selected.
    for (const day of ["2026-09-24", "2026-11-27"])
      expect(
        countCanonicalDailySource(
          { items },
          { ...positive, serviceDateFrom: day, serviceDateTo: day },
          ORDER_ID,
        ).count,
      ).toBe(0);
    const failure = (() => {
      try {
        adjacentEmptyDayFromSource({ items }, positive, ORDER_ID);
      } catch (error) {
        return error;
      }
      return undefined;
    })();
    expect(failure).toBeInstanceOf(JourneyFailure);
    expect(failure).toMatchObject({
      stage:
        "daily-report-no-authoritatively-empty-adjacent-day:nearest-first-31-occupied",
    });
    // Freeing only D+31 (the last candidate) selects it.
    expect(
      adjacentEmptyDayFromSource(
        { items: items.filter((item) => item.orderId !== "occupied-31") },
        positive,
        ORDER_ID,
      ),
    ).toBe("2026-11-26");
  });

  it("TEN02: rows outside the exact positive filters never occupy a candidate; reservationWindowStart and Taipei midnight decide the date", () => {
    const positive = buildDailyReportFilters(
      resolveExpectedDailyDispatchRecord(
        buildOrderFixture(),
        buildTaskFixture(),
        buildOwnContext(),
      ),
    );
    const own = buildOrderFixture();
    const foreign = NEAREST_FIRST_OFFSETS.flatMap((offset) => {
      const day = shiftDay("2026-10-26", offset);
      return [
        occupantOn(own, `tenant-${offset}`, day, { tenantId: "other" }),
        occupantOn(own, `partner-${offset}`, day, { partnerId: "other" }),
        occupantOn(own, `status-${offset}`, day, { status: "cancelled" }),
        occupantOn(own, `product-${offset}`, day, {
          businessDispatchSubtype: "other",
        }),
        occupantOn(own, `source-${offset}`, day, { orderSource: "concierge" }),
      ];
    });
    expect(
      adjacentEmptyDayFromSource(
        { items: [own, ...foreign] },
        positive,
        ORDER_ID,
      ),
    ).toBe("2026-10-25");
    // Canonical tenant_portal and legacy portal normalize to the same source:
    // a tenant_portal row does occupy D-1 for the portal positive order.
    expect(
      adjacentEmptyDayFromSource(
        {
          items: [
            own,
            occupantOn(own, "canonical-tenant-portal", "2026-10-25", {
              orderSource: "tenant_portal",
            }),
          ],
        },
        positive,
        ORDER_ID,
      ),
    ).toBe("2026-10-27");
    // reservationWindowStart wins over createdAt.
    expect(
      adjacentEmptyDayFromSource(
        {
          items: [
            own,
            occupantOn(own, "reserved-elsewhere", "2026-10-25", {
              reservationWindowStart: taipeiCreatedAt("2026-12-31"),
            }),
          ],
        },
        positive,
        ORDER_ID,
      ),
    ).toBe("2026-10-25");
    expect(
      adjacentEmptyDayFromSource(
        {
          items: [
            own,
            occupantOn(own, "reserved-on-d-1", "2026-12-31", {
              reservationWindowStart: taipeiCreatedAt("2026-10-25"),
            }),
          ],
        },
        positive,
        ORDER_ID,
      ),
    ).toBe("2026-10-27");
    // Taipei midnight: 2026-10-24T16:00Z is 2026-10-25 00:00 Asia/Taipei.
    const midnight = (orderId: string, createdAt: string) => ({
      ...own,
      orderId,
      createdAt,
    });
    expect(
      adjacentEmptyDayFromSource(
        {
          items: [
            own,
            midnight("before-d-1", "2026-10-24T15:59:59.999Z"),
            midnight("late-d", "2026-10-26T15:59:59.999Z"),
          ],
        },
        positive,
        ORDER_ID,
      ),
    ).toBe("2026-10-25");
    expect(
      adjacentEmptyDayFromSource(
        {
          items: [
            own,
            midnight("start-d-1", "2026-10-24T16:00:00.000Z"),
            midnight("late-d", "2026-10-26T15:59:59.999Z"),
          ],
        },
        positive,
        ORDER_ID,
      ),
    ).toBe("2026-10-27");
    expect(
      adjacentEmptyDayFromSource(
        {
          items: [
            own,
            midnight("start-d-1", "2026-10-24T16:00:00.000Z"),
            midnight("start-d+1", "2026-10-26T16:00:00.000Z"),
          ],
        },
        positive,
        ORDER_ID,
      ),
    ).toBe("2026-10-24");
  });

  it.each([
    // [positive Taipei day, occupied days, expected selection]
    ["2028-03-01", ["2028-02-29", "2028-03-02"], "2028-02-28"],
    ["2028-03-01", [], "2028-02-29"],
    ["2027-03-01", [], "2027-02-28"],
    ["2027-01-01", [], "2026-12-31"],
    ["2027-01-01", ["2026-12-31", "2027-01-02"], "2026-12-30"],
    ["2026-12-31", ["2026-12-30"], "2027-01-01"],
    ["2026-10-31", ["2026-10-30", "2026-11-01"], "2026-10-29"],
  ] as const)(
    "TEN02: month/year/leap boundary from %s with %j occupied selects %s",
    (positiveDay, occupiedDays, selected) => {
      const positive = {
        ...buildDailyReportFilters(
          resolveExpectedDailyDispatchRecord(
            buildOrderFixture(),
            buildTaskFixture(),
            buildOwnContext(),
          ),
        ),
        serviceDateFrom: positiveDay,
        serviceDateTo: positiveDay,
      };
      const own = buildOrderFixture({
        createdAt: taipeiCreatedAt(positiveDay),
      });
      const items = [
        own,
        ...occupiedDays.map((day) => occupantOn(own, `occupied-${day}`, day)),
      ];
      expect(adjacentEmptyDayFromSource({ items }, positive, ORDER_ID)).toBe(
        selected,
      );
    },
  );

  it("TEN02: missing, malformed or own-positive-less sources are rejected, never treated as an empty day", () => {
    const positive = buildDailyReportFilters(
      resolveExpectedDailyDispatchRecord(
        buildOrderFixture(),
        buildTaskFixture(),
        buildOwnContext(),
      ),
    );
    const own = buildOrderFixture();
    const sources: unknown[] = [
      null,
      undefined,
      {},
      { items: null },
      { items: "not-an-array" },
      { items: [] },
      // Own positive missing while other matching rows exist on D.
      { items: [occupantOn(own, "someone-else", "2026-10-26")] },
      // Own order moved off the positive date.
      { items: [occupantOn(own, ORDER_ID, "2026-10-25")] },
      // Own order present but under another status.
      { items: [{ ...own, status: "cancelled" }] },
      // A malformed matching row on a candidate day cannot be counted as zero.
      {
        items: [
          own,
          occupantOn(own, "malformed-source", "2026-10-25", {
            orderSource: null,
          }),
        ],
      },
      {
        items: [
          own,
          occupantOn(own, "malformed-time", "2026-10-25", {
            createdAt: null,
          }),
        ],
      },
    ];
    for (const source of sources)
      expect(() =>
        adjacentEmptyDayFromSource(source, positive, ORDER_ID),
      ).toThrow(JourneyFailure);
    expect(() =>
      adjacentEmptyDayFromSource({ items: [] }, positive, ORDER_ID),
    ).toThrow("daily-report-authoritative-own-positive-source-required");
  });

  it("TEN02: empty preview requires zero items and an explicit pageInfo.totalItems === 0", () => {
    const stage = "daily-report-empty-preview";
    expect(() =>
      requireEmptyDailyReportList(successWireBytes(toApiListData([])), stage),
    ).not.toThrow();
    expect(() =>
      requireEmptyDailyReportList(
        Buffer.from(JSON.stringify({ ok: true, data: toApiListData([]) })),
        stage,
      ),
    ).not.toThrow();
    // totalItems > 0 with an empty first page is not an empty day.
    expect(() =>
      requireEmptyDailyReportList(
        successWireBytes(toApiListData([], { totalItems: 1, totalPages: 1 })),
        stage,
      ),
    ).toThrow(`${stage}-total-items-zero-required`);
    expect(() =>
      requireEmptyDailyReportList(
        successWireBytes(toApiListData([buildDailyDispatchRow()])),
        stage,
      ),
    ).toThrow(`${stage}-zero-rows-required`);
    // No pageInfo, or a bare legacy array, cannot prove totalItems === 0.
    expect(() =>
      requireEmptyDailyReportList(successWireBytes({ items: [] }), stage),
    ).toThrow(JourneyFailure);
    expect(() =>
      requireEmptyDailyReportList(
        Buffer.from(JSON.stringify({ ok: true, data: [] })),
        stage,
      ),
    ).toThrow(JourneyFailure);
    expect(() =>
      requireEmptyDailyReportList(
        successWireBytes({
          ...toApiListData([]),
          pageInfo: { ...toApiListData([]).pageInfo, totalItems: "0" },
        }),
        stage,
      ),
    ).toThrow(JourneyFailure);
  });

  it.each(DAILY_REPORT_FORMATS)(
    "TEN02: empty %s bytes require actual zero-row immutable job, no prior own order content",
    async (format) => {
      const expected = resolveExpectedDailyDispatchRecord(
        buildOrderFixture(),
        buildTaskFixture(),
        buildOwnContext(),
      );
      const filters = {
        ...buildDailyReportFilters(expected),
        serviceDateFrom: "2026-10-25",
        serviceDateTo: "2026-10-25",
      };
      const jobId = `job_empty_${format}`;
      const detail = buildJobDetailFixture(format, jobId, [], { filters });
      const bytes = await renderFormatBytes(format, jobId, []);
      const base = {
        format,
        jobId,
        jobDetail: detail,
        filters,
        ownOrderId: ORDER_ID,
        detailStatus: 200,
        detailResponseSha: RUNTIME_SHA,
        artifactStatus: 200,
        artifactResponseSha: RUNTIME_SHA,
        contentType: DAILY_REPORT_MIME_TYPES[format],
        contentDisposition: `attachment; filename="daily_dispatch_record-${jobId}.${format}"`,
        bytes,
        runtimeSha: RUNTIME_SHA,
        nowMs: Date.parse("2026-10-25T19:00:00.000Z"),
      };
      expect(
        await validateEmptyDailyReportArtifactDownload(base),
      ).toMatchObject({
        format,
        jobId,
        status: "completed",
        rowCount: 0,
        bytes: bytes.length,
        sha256: hash(bytes),
        runtimeSha: RUNTIME_SHA,
      });
      await expect(
        validateEmptyDailyReportArtifactDownload({
          ...base,
          jobDetail: { ...detail, rows: [buildDailyDispatchRow()] },
        }),
      ).rejects.toThrow(
        `daily-report-empty-${format}-completed-zero-row-job-binding`,
      );
      await expect(
        validateEmptyDailyReportArtifactDownload({
          ...base,
          artifactResponseSha: "f".repeat(40),
        }),
      ).rejects.toThrow(`daily-report-empty-${format}-status-runtime-binding`);
      await expect(
        validateEmptyDailyReportArtifactDownload({
          ...base,
          bytes: await renderFormatBytes(format, jobId, [
            buildDailyDispatchRow(),
          ]),
        }),
      ).rejects.toThrow();
    },
  );

  it("blocks RECOVERY_ONLY from running the full-journey daily report phase", async () => {
    const evidence = new Evidence();
    await expect(
      runOwnedDailyReportDownloads({
        context: {} as BrowserContext,
        page: {} as Page,
        opsOrigin: OPS_ORIGIN,
        opsHeaders: () => ({}),
        readCanonicalOrders: async () => {
          throw new Error("must not read source in recovery");
        },
        order: buildOrderFixture(),
        completedTask: buildTaskFixture(),
        entrySlug: ENTRY_SLUG,
        fleetSupplyTenantId: FLEET_SUPPLY_TENANT_ID,
        driverId: DRIVER_ID,
        vehicleId: VEHICLE_ID,
        plateNo: PLATE_NO,
        pickupAddress: PICKUP_ADDRESS,
        dropoffAddress: DROPOFF_ADDRESS,
        directory: ".artifacts/owned-referral-business-journey",
        definitionSha: DEFINITION_SHA,
        runtimeSha: RUNTIME_SHA,
        recoveryOnly: true,
        evidence,
      }),
    ).rejects.toThrow(
      "daily-report-recovery-only-must-not-run-full-journey-reports",
    );
    expect(evidence.events).toHaveLength(0);
  });

  it.each([
    ...(
      [
        "unrelated-fetch",
        "unrelated-body",
        "unrelated-proxy",
        "unrelated-runtime",
        "matching-fetch",
        "matching-body",
        "matching-runtime",
        "matching-typed",
        "matching-http",
        "matching-hostile",
        "matching-private-name",
        "matching-command-binding",
      ] as const
    ).map((routeFault) => ({
      caseName: `request isolation ${routeFault}`,
      routeFault,
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    })),
    // Fault only external ports after the actual canonical empty-day control.
    // The helper, exchange validation, renderers and Evidence.failure stay real.
    ...(
      [
        ["tab-click", "filters-tab"],
        ["report-type-selectOption", "filters-report-type"],
        ["date-from-fill", "filters-date-from"],
        ["date-to-fill", "filters-date-to"],
        ["source-selectOption", "filters-source"],
        ["status-selectOption", "filters-status"],
        ["tenant-fill", "filters-tenant"],
        ["partner-fill", "filters-partner"],
        ["product-fill", "filters-service-product"],
        ["preview-waitFor", "preview-ready"],
        ["preview-click", "preview-exchange"],
        ["own-row-waitFor", "preview-row-detached"],
        ["rebuild-waitFor", "rebuild-ready"],
        ["rebuild-click", "rebuild-submit"],
        ["rebuild-command-json", "rebuild-command"],
        ["format-selectOption", "export-csv-select"],
        ["export-click", "export-csv-submit"],
        ["notice-waitFor", "export-csv-notice"],
        ["reload-goto", "reload-page"],
        ["job-row-waitFor", "download-csv-row"],
        ["download-waitFor", "download-csv-ready"],
        ["download-click", "download-csv-submit"],
        ["artifact-body", "download-csv-artifact"],
      ] as const
    ).map(([faultPoint, expectedPhase]) => ({
      caseName: `empty native fault at ${faultPoint}`,
      faultPoint,
      expectedPhase,
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    })),
    ...(["journey", "http", "exchange-http"] as const).map((typedFault) => ({
      caseName: `empty typed ${typedFault} fault preserves identity`,
      faultPoint: "preview-click",
      typedFault,
      expectedPhase: "preview-exchange",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    })),
    {
      caseName:
        "actual Ops reports page returns 500 without mounting the jobs list",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: false,
      expectedRetained: false,
      previewFailure: "page",
    },
    {
      caseName:
        "second Ops reports navigation returns 500 after three accepted jobs without mounting reload jobs",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: false,
      previewFailure: "reload-page",
    },
    {
      caseName:
        "actual Ops job detail returns 404 without requesting the artifact",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
      previewFailure: "detail",
    },
    {
      caseName: "actual Ops preview returns non-200 with private error payload",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: false,
      expectedRetained: false,
      previewFailure: true,
    },
    {
      caseName:
        "actual Ops preview has invalid assignment field with no raw retention",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: false,
      previewFailure: "row-field",
    },
    {
      caseName:
        "valid preview then independently executed job has invalid assignment field",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: false,
      previewFailure: "job-row-field",
    },
    {
      caseName:
        "already materialized own row still executes normal rebuild POST and readback",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    },
    {
      caseName:
        "source changes to nonempty adjacent day after empty jobs must fail",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    },
    {
      caseName:
        "adjacent days occupied selects the nearest genuinely empty day for the full empty consumer",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    },
    {
      caseName:
        "adjacent days occupied then source changes on the selected day after empty jobs must fail",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    },
    {
      caseName:
        "adjacent days occupied then source changes positive count after empty jobs must fail",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    },
    {
      caseName:
        "empty preview nonzero totalItems with empty first page must fail",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    },
    {
      caseName:
        "cancelled null row with adjacent days occupied selects the nearest genuinely empty day",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    },
    {
      caseName:
        "cancelled null row uses normal UI filter rebuild and all immutable formats",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    },
    {
      caseName: "all sibling rows belong to controlled owned orders",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    },
    {
      caseName:
        "unverified sibling row exists on the same filter scope (skips raw file persistence)",
      previewSiblingOrderId: "ord_unverified_sibling_999",
      jobSiblingOrderId: "ord_unverified_sibling_999",
      expectedPreviewControlled: false,
      expectedRetained: false,
    },
    {
      caseName:
        "preview has unverified sibling but independently executed job has only controlled rows",
      previewSiblingOrderId: "ord_unverified_sibling_999",
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: false,
      expectedRetained: true,
    },
    {
      caseName:
        "preview is controlled but independently executed job has unverified sibling",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: "ord_unverified_sibling_999",
      expectedPreviewControlled: true,
      expectedRetained: false,
    },
    ...(
      [
        ["preview-error-envelope", "daily-report-preview:envelope-not-ok"],
        ["preview-invalid-json", "daily-report-preview:invalid-json"],
        ["preview-missing-meta", "object response required"],
        ["preview-invalid-meta", "daily-report-preview:invalid-success-meta"],
        ["preview-error-with-data", "daily-report-preview:envelope-not-ok"],
        ["preview-error-null", "daily-report-preview:envelope-not-ok"],
        ["preview-missing-data", "object response required"],
        ["preview-missing-page-info", "object response required"],
        ["preview-invalid-page-info", "daily-report-preview:invalid-page-info"],
        ["preview-wrong-items", "array response required"],
        ["rebuilt-preview-wrong-data", "object response required"],
        [
          "reload-jobs-error-envelope",
          "daily-report-reload-jobs:envelope-not-ok",
        ],
        [
          "create-job-error-envelope",
          "daily-report-create-job-csv:envelope-not-ok",
        ],
        ["create-job-invalid-json", "daily-report-create-job-csv:invalid-json"],
        ["create-job-wrong-data", "object response required"],
        ["create-job-missing-data", "object response required"],
        [
          "create-job-invalid-meta",
          "daily-report-create-job-csv:invalid-success-meta",
        ],
        [
          "job-detail-error-envelope",
          "daily-report-job-detail-csv:envelope-not-ok",
        ],
        ["job-detail-wrong-data", "object response required"],
      ] as const
    ).map(([caseName, expectedFailureStage]) => ({
      caseName,
      expectedFailureStage,
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: false,
    })),
    {
      caseName: "legacy ok:true list/object envelopes remain supported",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    },
    ...(["bypass-200", "manifest-changed"] as const).map((nonReportApi) => ({
      caseName: `R12-10 nonreport role ${nonReportApi}`,
      nonReportApi,
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    })),
    ...R12_08_FAULTS.map((r1208Fault) => ({
      caseName: `R12-08 explicit SIM/real retry ${r1208Fault}`,
      r1208Fault,
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    })),
  ])(
    "drives preview rebuild, 3-format job creation, /reports reload, and 3 artifact downloads in a socket-free harness ($caseName)",
    async ({
      previewSiblingOrderId,
      jobSiblingOrderId,
      expectedPreviewControlled,
      expectedRetained,
      caseName: failureCase,
      ...scenario
    }) => {
      const previewFailure =
        "previewFailure" in scenario ? scenario.previewFailure : undefined;
      const failureStage =
        "expectedFailureStage" in scenario
          ? scenario.expectedFailureStage
          : undefined;
      const faultPoint =
        "faultPoint" in scenario ? scenario.faultPoint : undefined;
      const typedFault =
        "typedFault" in scenario ? scenario.typedFault : undefined;
      const routeFault =
        "routeFault" in scenario ? scenario.routeFault : undefined;
      const nonReportApi =
        "nonReportApi" in scenario ? scenario.nonReportApi : undefined;
      const r1208Fault =
        "r1208Fault" in scenario ? scenario.r1208Fault : undefined;
      let api: ReturnType<typeof installNonReportRoleApi> | undefined;
      const routeNativeFailure: unknown =
        routeFault === "matching-hostile"
          ? Object.defineProperties(
              {},
              {
                name: {
                  get() {
                    throw new Error("private-name-accessor");
                  },
                },
                cause: {
                  get() {
                    throw new Error("private-cause-accessor");
                  },
                },
              },
            )
          : routeFault === "matching-private-name"
            ? { name: "private-name", cause: { code: "private-code" } }
            : new TypeError("private-native-token-url-order-actor-sql-body", {
                cause: { code: "ECONNRESET", secret: "private-cause" },
              });
      const routeTypedFailure =
        routeFault === "matching-http"
          ? new DailyReportHttpFailure("daily-report-test-http", {
              phase: "create-job-csv",
              method: "POST",
              route: "jobs",
              runtimeSha: RUNTIME_SHA,
              status: 503,
              code: "REPORT_READ_FAILED",
            })
          : new JourneyFailure(
              "daily-report-test-typed",
              503,
              "REPORT_READ_FAILED",
            );
      const privateMarker = "private-native-token-url-order-actor-sql-body";
      const injectedFailure =
        typedFault === "http" || typedFault === "exchange-http"
          ? new DailyReportHttpFailure("daily-report-preview-status-200", {
              phase: "preview",
              method: "GET",
              route: "daily-dispatch-records",
              runtimeSha: RUNTIME_SHA,
              status: 503,
              code: "REPORT_READ_FAILED",
            })
          : typedFault === "journey"
            ? new JourneyFailure(
                "daily-report-empty-preview-get:timeout",
                504,
                "REPORT_READ_FAILED",
              )
            : new Error(privateMarker);
      const legacy = failureCase.startsWith("legacy ok:true");
      const wireBytes = (data: unknown) =>
        legacy
          ? Buffer.from(JSON.stringify({ ok: true, data }))
          : successWireBytes(data);
      const errorWireBytes = () =>
        Buffer.from(
          JSON.stringify(
            deepToSnakeCase(
              toApiErrorEnvelope("REPORT_READ_FAILED", "private-report-error"),
            ),
          ),
        );
      const tempDir = await mkdtemp(
        path.join(tmpdir(), "owned-daily-reports-test-"),
      );
      const reportDirectory =
        ownedSupplementalArtifactPaths(tempDir).reportDirectories[
          "reservation-1"
        ];
      let restoreClock: (() => void) | undefined;
      try {
        if (!previewFailure && !failureStage) {
          // Only positive fake-port runs need an unexpired artifact. Keep the
          // original clock advancing so the helper's Date.now deadlines work;
          // never fake timers or relax the production expiry check.
          const realNow = Date.now.bind(Date);
          const startedAt = realNow();
          const shiftedStart = Date.parse("2026-10-25T19:00:00.000Z");
          const clock = vi
            .spyOn(Date, "now")
            .mockImplementation(() => shiftedStart + (realNow() - startedAt));
          restoreClock = () => clock.mockRestore();
        }
        const cancelled = failureCase.startsWith("cancelled null");
        // TEN02 nearest-first: matching rows on D-1 and D+1 move the genuinely
        // empty day to D-2; otherwise the original D-1 is the empty day.
        const adjacentOccupied = failureCase.includes("adjacent days occupied");
        const emptyDay = adjacentOccupied ? "2026-10-24" : "2026-10-25";
        const sourceChange = failureCase.includes("source changes positive")
          ? "positive"
          : failureCase.includes("source changes")
            ? "empty"
            : undefined;
        const cancelledSource = cancelledCase();
        const ownRow = cancelled
          ? cancelledSource.row
          : buildDailyDispatchRow(
              previewFailure === "row-field"
                ? { firstAssignedAt: "secret-invalid-assignment" }
                : {},
            );
        const siblingRow = (orderId: string) => ({
          ...ownRow,
          orderId,
          orderNo: "DRT-20261026-0000",
        });
        const previewSiblingRow = siblingRow(previewSiblingOrderId);
        const jobSiblingRow = siblingRow(jobSiblingOrderId);

        let routeHandler: ((route: Route) => Promise<void>) | undefined;
        let unrouteCalled = false;
        let abortedRoutes = 0;
        let artifactRequests = 0;
        let initialJobsRequests = 0;
        let pageVisits = 0;
        let rebuiltInBackend = false;
        let rebuildPosts = 0;
        let rebuiltPreviewGets = 0;
        // R12-08 browser port: page-level routes take precedence over the
        // helper's context route, as in Playwright. Ops page error/notice
        // state mirrors reports/page.tsx regenerate().
        type PageRouteMatcher = (url: URL) => boolean;
        let pageRoute:
          | {
              matcher: PageRouteMatcher;
              handler: (route: Route) => Promise<void>;
            }
          | undefined;
        let pageRouteCalls = 0;
        let pageUnrouteCalls = 0;
        let simulationAttempted = false;
        const simulatedResponses: Array<{
          status?: number;
          contentType?: string;
          body?: string;
        }> = [];
        const simulatedRequestBodies: string[] = [];
        let uiErrorText: string | null = null;
        let uiNoticeText: string | null = null;
        const alreadyMaterialized = failureCase.startsWith(
          "already materialized",
        );
        let sourceReads = 0;
        let selectedFormat: DailyReportFormat = "csv";
        let dateFromVal = "";
        let dateToVal = "";
        let orderSourceVal = "";
        let statusVal = "";
        let tenantVal = "";
        let partnerVal = "";
        let serviceProductVal = "";
        let lastAcceptedJobId = "";
        const createdJobs: Array<{
          format: DailyReportFormat;
          jobId: string;
          detail: ObjectData;
          bytes: Buffer;
        }> = [];

        const dispatchRoute = async (
          method: string,
          url: string,
          postData: string | null,
          responseStatus: number,
          responseHeaders: Record<string, string>,
          responseBytes: Buffer,
          nativeFault?: "fetch" | "body" | "typed",
        ) => {
          if (!routeHandler) throw new Error("routeHandler not registered");
          const route = {
            request: () => ({
              method: () => method,
              url: () => url,
              postData: () => postData,
              headers: () => ({ accept: "*/*" }),
            }),
            fetch: async (options?: { headers?: Record<string, string> }) => {
              expect(options?.headers?.["x-drts-authorization"]).toBe(
                "Bearer synthetic-ops-jwt",
              );
              expect(options?.headers?.["X-Serverless-Authorization"]).toBe(
                "Bearer synthetic-ops-cloud",
              );
              if (nativeFault === "fetch") throw routeNativeFailure;
              if (nativeFault === "typed") throw routeTypedFailure;
              return {
                status: () => responseStatus,
                url: () => url,
                headers: () => ({
                  "x-drts-candidate-sha": RUNTIME_SHA,
                  ...responseHeaders,
                }),
                body: async () => {
                  if (nativeFault === "body") throw routeNativeFailure;
                  if (url.includes("/artifact")) faultAt("artifact-body");
                  return responseBytes;
                },
              };
            },
            fulfill: async () => undefined,
            abort: async () => {
              abortedRoutes += 1;
            },
          } as unknown as Route;
          await routeHandler(route);
        };

        const faultAt = (point: string) => {
          if (
            typedFault !== "exchange-http" &&
            faultPoint === point &&
            evidence.events.some(
              (event) =>
                event.stage ===
                "daily-report-empty-source-before-zero-positive-own",
            )
          ) {
            throw injectedFailure;
          }
        };
        const makeLocator = (spec: {
          point?: string;
          count?: () => Promise<number>;
          innerText?: () => Promise<string>;
          click?: () => Promise<void>;
          fill?: (val: string) => Promise<void>;
          selectOption?: (val: string) => Promise<string[]>;
          getByRole?: Page["getByRole"];
        }): Locator => {
          const self: Record<string, unknown> = {
            first: () => self as unknown as Locator,
            nth: (idx: number) =>
              makeLocator({
                ...spec,
                point: idx === 0 ? "date-from" : "date-to",
                fill: async (val: string) => {
                  if (idx === 0) dateFromVal = val;
                  else dateToVal = val;
                },
              }),
            waitFor: async () => {
              faultAt(`${spec.point}-waitFor`);
            },
            isEnabled: async () => true,
            count: spec.count ?? (async () => 1),
            innerText: spec.innerText ?? (async () => ""),
            click: async () => {
              faultAt(`${spec.point}-click`);
              await spec.click?.();
            },
            fill: async (val: string) => {
              faultAt(`${spec.point}-fill`);
              await spec.fill?.(val);
            },
            selectOption: async (val: string) => {
              faultAt(`${spec.point}-selectOption`);
              return spec.selectOption ? spec.selectOption(val) : [val];
            },
            getByRole: spec.getByRole,
          };
          return self as unknown as Locator;
        };

        const fakePage: Partial<Page> = {
          goto: async (url: string) => {
            faultAt("reload-goto");
            pageVisits += 1;
            const failedPage =
              previewFailure === "page" ||
              (previewFailure === "reload-page" && pageVisits === 2);
            await dispatchRoute(
              "GET",
              url,
              null,
              failedPage ? 500 : 200,
              { "content-type": "text/html" },
              failedPage
                ? Buffer.from("<html>private-page-error</html>")
                : Buffer.from("<html></html>"),
            );
            // A failed document never mounts the real Ops page and therefore
            // cannot issue the dependent client-side jobs list request.
            if (failedPage) return null;
            initialJobsRequests += 1;
            await dispatchRoute(
              "GET",
              `${OPS_ORIGIN}/control-plane-proxy/reports/jobs`,
              null,
              200,
              { "content-type": "application/json" },
              failureCase === "reload-jobs-error-envelope" && pageVisits === 2
                ? errorWireBytes()
                : wireBytes(toApiListData(createdJobs.map((j) => j.detail))),
            );
            return null;
          },
          getByRole: (_role, options) => {
            const namePattern = options?.name;
            const matches = (textVal: string) =>
              namePattern instanceof RegExp
                ? namePattern.test(textVal)
                : namePattern === textVal;
            if (matches("營運報表")) return makeLocator({ point: "tab" });
            if (matches("載入預覽")) {
              return makeLocator({
                point: "preview",
                click: async () => {
                  const query = new URLSearchParams({
                    serviceDateFrom: dateFromVal,
                    serviceDateTo: dateToVal,
                    orderSource: orderSourceVal,
                    finalStatus: statusVal,
                    tenantId: tenantVal,
                    partnerId: partnerVal,
                    serviceProductCode: serviceProductVal,
                  });
                  const rows =
                    dateFromVal === emptyDay
                      ? []
                      : rebuiltInBackend || alreadyMaterialized
                        ? [previewSiblingRow, ownRow]
                        : [previewSiblingRow];
                  await dispatchRoute(
                    "GET",
                    `${OPS_ORIGIN}/control-plane-proxy/reports/daily-dispatch-records?${query.toString()}`,
                    null,
                    previewFailure === true ||
                      (typedFault === "exchange-http" &&
                        dateFromVal === emptyDay)
                      ? 503
                      : 200,
                    { "content-type": "application/json" },
                    typedFault === "exchange-http" && dateFromVal === emptyDay
                      ? errorWireBytes()
                      : failureCase === "preview-invalid-json"
                        ? Buffer.from("not-json")
                        : failureCase === "preview-error-envelope"
                          ? errorWireBytes()
                          : failureCase === "preview-missing-meta"
                            ? Buffer.from(
                                JSON.stringify({ data: toApiListData(rows) }),
                              )
                            : failureCase === "preview-invalid-meta"
                              ? Buffer.from(
                                  JSON.stringify({
                                    data: toApiListData(rows),
                                    meta: { request_id: "x", timestamp: "bad" },
                                  }),
                                )
                              : failureCase === "preview-error-with-data"
                                ? Buffer.from(
                                    JSON.stringify({
                                      ok: false,
                                      data: toApiListData(rows),
                                      error: {
                                        code: "REPORT_READ_FAILED",
                                        message: "private-report-error",
                                      },
                                    }),
                                  )
                                : failureCase === "preview-error-null"
                                  ? Buffer.from(
                                      JSON.stringify({
                                        ...toApiSuccessEnvelope(
                                          toApiListData(rows),
                                        ),
                                        error: null,
                                      }),
                                    )
                                  : failureCase === "preview-missing-data"
                                    ? Buffer.from(
                                        JSON.stringify({
                                          meta: {
                                            request_id: "x",
                                            timestamp: new Date().toISOString(),
                                          },
                                        }),
                                      )
                                    : failureCase ===
                                        "preview-missing-page-info"
                                      ? wireBytes({ items: rows })
                                      : failureCase ===
                                          "preview-invalid-page-info"
                                        ? wireBytes({
                                            ...toApiListData(rows),
                                            pageInfo: { page: 0 },
                                          })
                                        : failureCase === "preview-wrong-items"
                                          ? wireBytes({
                                              ...toApiListData(rows),
                                              items: "not-an-array",
                                            })
                                          : previewFailure === true
                                            ? Buffer.from(
                                                JSON.stringify({
                                                  error: {
                                                    code: "REPORT_READ_FAILED",
                                                    trace_id:
                                                      "b7e78ce8-82c1-46fb-a457-1f90ee7cdf55",
                                                    message:
                                                      "private-error-message",
                                                  },
                                                }),
                                              )
                                            : failureCase.startsWith(
                                                  "empty preview nonzero totalItems",
                                                ) && dateFromVal === emptyDay
                                              ? wireBytes(
                                                  toApiListData([], {
                                                    totalItems: 1,
                                                    totalPages: 1,
                                                  }),
                                                )
                                              : wireBytes(toApiListData(rows)),
                  );
                },
              });
            }
            if (matches("重算")) {
              return makeLocator({
                point: "rebuild",
                click: async () => {
                  const bodyObj = {
                    serviceDateFrom: dateFromVal,
                    serviceDateTo: dateToVal,
                    orderSource: orderSourceVal,
                    finalStatus: statusVal,
                    tenantId: tenantVal,
                    partnerId: partnerVal,
                    serviceProductCode: serviceProductVal,
                  };
                  const rebuildUrl = `${OPS_ORIGIN}/control-plane-proxy/reports/daily-dispatch-records/rebuild`;
                  const generatedAt = "2026-10-25T18:31:00.000Z";
                  uiErrorText = null;
                  uiNoticeText = null;
                  if (pageRoute) {
                    simulationAttempted = true;
                    if (r1208Fault === "click-throws")
                      throw new Error(privateMarker);
                    if (r1208Fault === "no-hit") return;
                    // Mirrors Playwright: a matching page route sees the
                    // request first; only fallback() reaches the context route.
                    const sendThroughPage = async (
                      method: string,
                      postData: string | null,
                    ) => {
                      const outcome = {
                        fulfilled: false,
                        fellBack: false,
                        aborted: false,
                      };
                      if (!pageRoute!.matcher(new URL(rebuildUrl)))
                        throw new Error("simulation route did not match");
                      await pageRoute!.handler({
                        request: () => ({
                          method: () => method,
                          url: () => rebuildUrl,
                          postData: () => postData,
                          headers: () => ({ accept: "*/*" }),
                        }),
                        fulfill: async (options: {
                          status?: number;
                          contentType?: string;
                          body?: string;
                        }) => {
                          outcome.fulfilled = true;
                          simulatedResponses.push(options);
                          if (postData !== null)
                            simulatedRequestBodies.push(postData);
                        },
                        fallback: async () => {
                          outcome.fellBack = true;
                          await dispatchRoute(
                            method,
                            rebuildUrl,
                            postData,
                            200,
                            { "content-type": "application/json" },
                            successWireBytes({ rebuiltCount: 2, generatedAt }),
                          );
                        },
                        abort: async () => {
                          outcome.aborted = true;
                        },
                      } as unknown as Route);
                      return outcome;
                    };
                    if (r1208Fault === "wrong-route")
                      await sendThroughPage("GET", null);
                    const simulated = await sendThroughPage(
                      "POST",
                      JSON.stringify(bodyObj),
                    );
                    if (r1208Fault === "double-hit")
                      await sendThroughPage("POST", JSON.stringify(bodyObj));
                    if (r1208Fault === "forwarded")
                      await dispatchRoute(
                        "POST",
                        rebuildUrl,
                        JSON.stringify(bodyObj),
                        200,
                        { "content-type": "application/json" },
                        successWireBytes({ rebuiltCount: 2, generatedAt }),
                      );
                    if (simulated.fulfilled) {
                      const response = simulatedResponses.at(-1)!;
                      // ApiClient throws ApiClientError for !ok; the page
                      // shows its message and skips the success notice/preview.
                      if (r1208Fault !== "no-error-ui")
                        uiErrorText = new ApiClientError({
                          statusCode: response.status ?? 200,
                          code: REBUILD_FAILED_CODE,
                          message: REBUILD_FAILED_MESSAGE,
                          retryable: false,
                          rawBody: String(response.body),
                        }).message;
                      if (r1208Fault === "success-notice")
                        uiNoticeText = translate(
                          "reports.ops.regenerate.done",
                          "zh",
                          { count: 2, time: "2026/10/26 02:31:00" },
                        );
                      return;
                    }
                  }
                  const realRetry = simulationAttempted;
                  rebuiltInBackend = true;
                  rebuildPosts += 1;
                  const retryBody =
                    realRetry && r1208Fault === "retry-changed-filter"
                      ? { ...bodyObj, serviceDateFrom: "2026-10-25" }
                      : bodyObj;
                  if (realRetry && r1208Fault === "retry-503") {
                    await dispatchRoute(
                      "POST",
                      rebuildUrl,
                      JSON.stringify(bodyObj),
                      503,
                      { "content-type": "application/json" },
                      Buffer.from(
                        JSON.stringify(
                          deepToSnakeCase(
                            toApiErrorEnvelope(
                              REBUILD_FAILED_CODE,
                              REBUILD_FAILED_MESSAGE,
                            ),
                          ),
                        ),
                      ),
                    );
                    uiErrorText = `API error 503: ${REBUILD_FAILED_MESSAGE}`;
                    return;
                  }
                  await dispatchRoute(
                    "POST",
                    rebuildUrl,
                    faultPoint === "rebuild-command-json" &&
                      dateFromVal === emptyDay
                      ? privateMarker
                      : JSON.stringify(retryBody),
                    200,
                    { "content-type": "application/json" },
                    realRetry && r1208Fault === "retry-missing-ack"
                      ? Buffer.from(
                          JSON.stringify({
                            meta: {
                              request_id: "x",
                              timestamp: new Date().toISOString(),
                            },
                          }),
                        )
                      : successWireBytes({
                          rebuiltCount: dateFromVal === emptyDay ? 0 : 2,
                          generatedAt,
                        }),
                  );
                  const query = new URLSearchParams(retryBody);
                  rebuiltPreviewGets += 1;
                  await dispatchRoute(
                    "GET",
                    `${OPS_ORIGIN}/control-plane-proxy/reports/daily-dispatch-records?${query.toString()}`,
                    null,
                    200,
                    { "content-type": "application/json" },
                    failureCase === "rebuilt-preview-wrong-data"
                      ? wireBytes("not-a-list")
                      : wireBytes(
                          toApiListData(
                            realRetry && r1208Fault === "retry-foreign-row"
                              ? [siblingRow("ord_foreign_unowned_998")]
                              : realRetry && r1208Fault === "retry-row-identity"
                                ? [
                                    previewSiblingRow,
                                    // Same orderId, another contract identity.
                                    { ...ownRow, orderNo: "DRT-20261026-0099" },
                                  ]
                                : dateFromVal === emptyDay
                                  ? []
                                  : [previewSiblingRow, ownRow],
                          ),
                        ),
                  );
                },
              });
            }
            if (matches("匯出工作")) {
              return makeLocator({
                point: "export",
                click: async () => {
                  const format = selectedFormat;
                  if (
                    routeFault &&
                    routeFault !== "matching-command-binding" &&
                    dateFromVal === emptyDay &&
                    format === "csv"
                  ) {
                    const unrelated = routeFault.startsWith("unrelated-");
                    const runtimeFault = routeFault.endsWith("runtime");
                    await dispatchRoute(
                      unrelated ? "GET" : "POST",
                      `${OPS_ORIGIN}${
                        unrelated
                          ? routeFault === "unrelated-proxy" || runtimeFault
                            ? "/control-plane-proxy/reports/jobs?private-query"
                            : "/_next/private-asset.js?private-query"
                          : "/control-plane-proxy/reports/jobs"
                      }`,
                      unrelated ? null : JSON.stringify({ privateMarker }),
                      200,
                      runtimeFault
                        ? { "x-drts-candidate-sha": "c".repeat(40) }
                        : {},
                      Buffer.from("private-response"),
                      runtimeFault
                        ? undefined
                        : routeFault.endsWith("typed") ||
                            routeFault.endsWith("http")
                          ? "typed"
                          : routeFault.endsWith("body")
                            ? "body"
                            : "fetch",
                    );
                    if (!unrelated) return;
                  }
                  const jobId = `job_harness_${dateFromVal === emptyDay ? "empty_" : ""}${format}`;
                  lastAcceptedJobId = jobId;
                  const rows =
                    dateFromVal === emptyDay
                      ? []
                      : [
                          jobSiblingRow,
                          previewFailure === "job-row-field" && format === "csv"
                            ? buildDailyDispatchRow({
                                firstAssignedAt:
                                  "secret-invalid-job-assignment",
                              })
                            : ownRow,
                        ];
                  const detail = buildJobDetailFixture(
                    format,
                    jobId,
                    rows,
                    dateFromVal === emptyDay || cancelled
                      ? {
                          filters: {
                            ...buildDailyReportFilters(
                              resolveExpectedDailyDispatchRecord(
                                buildOrderFixture(),
                                buildTaskFixture(),
                                buildOwnContext(),
                              ),
                            ),
                            finalStatus: statusVal,
                            serviceDateFrom: dateFromVal,
                            serviceDateTo: dateToVal,
                          },
                        }
                      : {},
                  );
                  const bytes = await renderFormatBytes(format, jobId, rows);
                  createdJobs.push({ format, jobId, detail, bytes });
                  const reqBody = {
                    jobType: "daily_dispatch_record",
                    format,
                    filters: {
                      serviceDateFrom: dateFromVal,
                      serviceDateTo: dateToVal,
                      orderSource: orderSourceVal,
                      finalStatus: statusVal,
                      tenantId: tenantVal,
                      partnerId: partnerVal,
                      serviceProductCode: serviceProductVal,
                    },
                  };
                  await dispatchRoute(
                    "POST",
                    `${OPS_ORIGIN}/control-plane-proxy/reports/jobs`,
                    JSON.stringify(
                      routeFault === "matching-command-binding" &&
                        dateFromVal === emptyDay
                        ? {
                            ...reqBody,
                            filters: {
                              ...reqBody.filters,
                              serviceDateFrom: "2026-10-26",
                            },
                          }
                        : reqBody,
                    ),
                    201,
                    { "content-type": "application/json" },
                    failureCase === "create-job-invalid-json" &&
                      format === "csv"
                      ? Buffer.from("not-json")
                      : failureCase === "create-job-error-envelope" &&
                          format === "csv"
                        ? errorWireBytes()
                        : failureCase === "create-job-wrong-data" &&
                            format === "csv"
                          ? wireBytes([jobId])
                          : failureCase === "create-job-missing-data" &&
                              format === "csv"
                            ? Buffer.from(
                                JSON.stringify({
                                  meta: {
                                    request_id: "x",
                                    timestamp: new Date().toISOString(),
                                  },
                                }),
                              )
                            : failureCase === "create-job-invalid-meta" &&
                                format === "csv"
                              ? Buffer.from(
                                  JSON.stringify({
                                    data: { job_id: jobId },
                                    meta: { request_id: "", timestamp: "bad" },
                                  }),
                                )
                              : wireBytes({
                                  jobId,
                                  status: "completed",
                                  acceptedAt: "2026-10-25T18:32:00.000Z",
                                }),
                  );
                },
              });
            }
            return makeLocator({});
          },
          getByText: (textVal) => {
            if (textVal instanceof RegExp)
              return makeLocator({
                point: "regenerate-notice",
                count: async () =>
                  uiNoticeText !== null && textVal.test(uiNoticeText) ? 1 : 0,
              });
            if (textVal === REBUILD_FAILED_MESSAGE) {
              const visible = () =>
                uiErrorText !== null && uiErrorText.includes(textVal);
              const errorLocator = {
                first: () => errorLocator,
                // Playwright times out when the state never arrives.
                waitFor: async (options?: { state?: string }) => {
                  if (visible() !== (options?.state !== "detached"))
                    throw new Error(`timeout ${privateMarker}`);
                },
                count: async () => (visible() ? 1 : 0),
                innerText: async () => uiErrorText ?? "",
              };
              return errorLocator as unknown as Locator;
            }
            return makeLocator({
              point: "notice",
              innerText: async () => String(textVal),
              count: async () =>
                String(textVal) === lastAcceptedJobId ? 1 : 0,
            });
          },
          route: (async (matcher: PageRouteMatcher, handler: unknown) => {
            pageRouteCalls += 1;
            expect(pageRoute).toBeUndefined();
            pageRoute = {
              matcher,
              handler: handler as (route: Route) => Promise<void>,
            };
          }) as unknown as Page["route"],
          unroute: (async (matcher: PageRouteMatcher, handler: unknown) => {
            pageUnrouteCalls += 1;
            if (r1208Fault === "unroute-throws") throw new Error(privateMarker);
            expect(matcher).toBe(pageRoute?.matcher);
            expect(handler).toBe(pageRoute?.handler);
            pageRoute = undefined;
          }) as unknown as Page["unroute"],
          locator: (selector: string) => {
            if (selector === 'input[type="date"]') {
              return makeLocator({ count: async () => 2 });
            }
            if (selector === 'input[placeholder="tenant_001"]') {
              return makeLocator({
                point: "tenant",
                fill: async (val) => {
                  tenantVal = val;
                },
              });
            }
            if (selector === 'input[placeholder="partner_001"]') {
              return makeLocator({
                point: "partner",
                fill: async (val) => {
                  partnerVal = val;
                },
              });
            }
            if (selector === 'input[placeholder="wheelchair_van"]') {
              return makeLocator({
                point: "product",
                fill: async (val) => {
                  serviceProductVal = val;
                },
              });
            }
            if (selector === "select") {
              return {
                filter: (opts: { has?: Locator }) => {
                  const tag = (opts.has as unknown as { _option?: string })
                    ?._option;
                  return makeLocator({
                    point:
                      tag === "tenant_portal"
                        ? "source"
                        : tag === "completed"
                          ? "status"
                          : tag === "xlsx"
                            ? "format"
                            : "report-type",
                    selectOption: async (val) => {
                      const str = String(val);
                      if (tag === "tenant_portal") orderSourceVal = str;
                      else if (tag === "completed") statusVal = str;
                      else if (tag === "xlsx")
                        selectedFormat = str as DailyReportFormat;
                      return [str];
                    },
                  });
                },
              } as unknown as Locator;
            }
            if (selector.startsWith("option[value=")) {
              const match = /option\[value="([^"]+)"\]/.exec(selector);
              return { _option: match?.[1] } as unknown as Locator;
            }
            if (selector === "tbody tr") {
              return {
                filter: (opts: { hasText?: string | RegExp }) => {
                  const target = String(opts.hasText ?? "");
                  if (target === ORDER_ID) {
                    return makeLocator({
                      point: "own-row",
                      count: async () => (dateFromVal === emptyDay ? 0 : 1),
                      innerText: async () =>
                        `${ORDER_ID} ${ORDER_NO} 2026-10-26 ${PICKUP_ADDRESS} ${DROPOFF_ADDRESS} ${DRIVER_ID} ${VEHICLE_ID} ${PLATE_NO}`,
                    });
                  }
                  const foundJob = createdJobs.find((j) => j.jobId === target);
                  return makeLocator({
                    point: "job-row",
                    count: async () => (foundJob ? 1 : 0),
                    innerText: async () =>
                      foundJob
                        ? `${foundJob.jobId} ${foundJob.format.toUpperCase()} 已完成`
                        : "",
                    getByRole: () =>
                      makeLocator({
                        point: "download",
                        click: async () => {
                          if (!foundJob) throw new Error("missing job");
                          await dispatchRoute(
                            "GET",
                            `${OPS_ORIGIN}${opsReportJobDetailPathname(foundJob.jobId)}`,
                            null,
                            previewFailure === "detail" ? 404 : 200,
                            { "content-type": "application/json" },
                            Buffer.from(
                              JSON.stringify(
                                previewFailure === "detail"
                                  ? {
                                      error: {
                                        code: "REPORT_JOB_NOT_FOUND",
                                        trace_id:
                                          "b7e78ce8-82c1-46fb-a457-1f90ee7cdf55",
                                        message: "private-detail-error",
                                      },
                                    }
                                  : failureCase === "job-detail-error-envelope"
                                    ? JSON.parse(
                                        errorWireBytes().toString("utf8"),
                                      )
                                    : failureCase === "job-detail-wrong-data"
                                      ? JSON.parse(
                                          wireBytes([foundJob.detail]).toString(
                                            "utf8",
                                          ),
                                        )
                                      : JSON.parse(
                                          wireBytes(foundJob.detail).toString(
                                            "utf8",
                                          ),
                                        ),
                              ),
                            ),
                          );
                          // ApiClient.getReportJob throws for 404; the Ops
                          // click handler never calls openDownload in this case.
                          if (previewFailure === "detail") return;
                          artifactRequests += 1;
                          const fileName = `daily_dispatch_record-${foundJob.jobId}.${foundJob.format}`;
                          await dispatchRoute(
                            "GET",
                            `${OPS_ORIGIN}${opsReportJobArtifactPathname(foundJob.jobId)}`,
                            null,
                            200,
                            {
                              "content-type":
                                DAILY_REPORT_MIME_TYPES[foundJob.format],
                              "content-disposition": `attachment; filename="${fileName}"`,
                            },
                            foundJob.bytes,
                          );
                        },
                      }),
                  });
                },
              } as unknown as Locator;
            }
            return makeLocator({});
          },
        };

        const fakeContext = {
          route: async (_pattern: unknown, handler: unknown) => {
            routeHandler = handler as (route: Route) => Promise<void>;
          },
          unroute: async () => {
            unrouteCalled = true;
            routeHandler = undefined;
          },
          pages: () => [fakePage as Page],
        } as unknown as BrowserContext;

        api = installNonReportRoleApi(
          nonReportApi === "bypass-200"
            ? {
                report: () => ({
                  status: 200,
                  body: toApiSuccessEnvelope({ jobId: "private-bypass" }),
                }),
              }
            : nonReportApi === "manifest-changed"
              ? {
                  // A denial must not mutate own custody; simulate a backend
                  // side effect to prove the post-denial Ops readback catches it.
                  onReport: (pathname) => {
                    if (pathname === "/api/reports/job_harness_pdf/artifact")
                      (
                        createdJobs.find(
                          (job) => job.jobId === "job_harness_csv",
                        )!.detail.artifact as ObjectData
                      ).manifestHash = "d".repeat(64);
                  },
                }
              : {},
        );
        const evidence = new Evidence();
        const run = runOwnedDailyReportDownloads({
          context: fakeContext,
          page: fakePage as Page,
          opsOrigin: OPS_ORIGIN,
          opsHeaders: () => ({
            "X-Serverless-Authorization": "Bearer synthetic-ops-cloud",
            "x-drts-authorization": "Bearer synthetic-ops-jwt",
          }),
          readCanonicalOrders: async () => {
            sourceReads += 1;
            const positiveOrder = cancelled
              ? cancelledSource.order
              : buildOrderFixture();
            return {
              items: [
                positiveOrder,
                ...(adjacentOccupied
                  ? [
                      occupantOn(positiveOrder, "occupied-prior", "2026-10-25"),
                      occupantOn(positiveOrder, "occupied-next", "2026-10-27"),
                    ]
                  : []),
                ...(sourceChange && sourceReads === 2
                  ? [
                      occupantOn(
                        positiveOrder,
                        "writer-created-order",
                        sourceChange === "positive" ? "2026-10-26" : emptyDay,
                      ),
                    ]
                  : []),
              ],
            };
          },
          order: cancelled ? cancelledSource.order : buildOrderFixture(),
          ...(cancelled
            ? { supplementalExpected: cancelledSource.expected }
            : {}),
          completedTask: buildTaskFixture(),
          entrySlug: ENTRY_SLUG,
          fleetSupplyTenantId: FLEET_SUPPLY_TENANT_ID,
          controlledOrderIds: [ORDER_ID, CONTROLLED_SIBLING_ORDER_ID],
          driverId: DRIVER_ID,
          vehicleId: VEHICLE_ID,
          plateNo: PLATE_NO,
          pickupAddress: PICKUP_ADDRESS,
          dropoffAddress: DROPOFF_ADDRESS,
          directory: reportDirectory,
          definitionSha: DEFINITION_SHA,
          runtimeSha: RUNTIME_SHA,
          recoveryOnly: false,
          evidence,
        });
        if (nonReportApi === "bypass-200") {
          // A 200 is never an expected R12-10 PASS: fail at the first probe,
          // after positive custody, before TEN02 or any further export.
          await expect(run).rejects.toMatchObject({
            stage: "daily-report-nonreport-role-csv-detail-403-required",
          });
          expect(api!.reportCalls()).toEqual([
            expect.objectContaining({
              pathname: "/api/reports/job_harness_csv",
              redirect: "manual",
            }),
          ]);
          expect(sourceReads).toBe(0);
          expect(createdJobs.map((job) => job.jobId)).toEqual(
            DAILY_REPORT_FORMATS.map((format) => `job_harness_${format}`),
          );
          for (const format of DAILY_REPORT_FORMATS)
            expect(
              evidence.events.some(
                (event) =>
                  event.stage === `daily-report-download-${format}-verified`,
              ),
            ).toBe(true);
          expect(
            evidence.events.some((event) =>
              /^daily-report-nonreport-role-.*-denied$/.test(event.stage),
            ),
          ).toBe(false);
          expect(unrouteCalled).toBe(true);
          expect(JSON.stringify(evidence.events)).not.toContain(
            "private-bypass",
          );
          return;
        }
        if (nonReportApi === "manifest-changed") {
          await expect(run).rejects.toMatchObject({
            stage:
              "daily-report-nonreport-role-csv-own-job-unchanged-after-denial",
          });
          expect(api!.reportCalls()).toHaveLength(6);
          expect(sourceReads).toBe(1);
          expect(unrouteCalled).toBe(true);
          expect(
            evidence.events.some(
              (event) =>
                event.stage ===
                "daily-report-nonreport-role-own-jobs-unchanged-after-denial",
            ),
          ).toBe(false);
          return;
        }
        if (routeFault?.startsWith("matching-")) {
          const failure = await run.catch((error: unknown) => error);
          // The empty-day CSV fault happens after the single main R12-10 run.
          expect(api!.reportCalls()).toHaveLength(6);
          if (routeFault === "matching-command-binding") {
            expect(failure).toMatchObject({
              stage: "daily-report-empty-csv-job-command-binding",
            });
            expect(abortedRoutes).toBe(0);
            expect(unrouteCalled).toBe(true);
            expect(sourceReads).toBe(1);
            return;
          }
          if (routeFault === "matching-typed" || routeFault === "matching-http")
            expect(failure).toBe(routeTypedFailure);
          else if (routeFault === "matching-runtime")
            expect(failure).toMatchObject({
              stage: "daily-report-ops-runtime-sha-mismatch",
            });
          else {
            expect(failure).toBeInstanceOf(JourneyFailure);
            expect((failure as Error).message).toContain(
              "daily-report-ops-post-jobs",
            );
          }
          const event = evidence.events.find((event) =>
            event.stage.startsWith("daily-report-ops-post-jobs-"),
          );
          expect(event).toMatchObject({
            requestMethod: "POST",
            requestDurationMs: expect.any(Number),
            result: "failed",
          });
          expect(event).not.toHaveProperty("requestAborted");
          if (routeFault === "matching-fetch" || routeFault === "matching-body")
            expect(event).toMatchObject({
              stage: `daily-report-ops-post-jobs-${routeFault === "matching-fetch" ? "fetch" : "body"}-native`,
              nativeFailureClass: "TypeError",
              nativeCauseCode: "ECONNRESET",
            });
          if (
            routeFault === "matching-hostile" ||
            routeFault === "matching-private-name"
          )
            expect(event).toMatchObject({
              nativeFailureClass: "UNKNOWN",
              nativeCauseCode: "UNKNOWN",
            });
          const diagnostic = JSON.stringify([failure, evidence.events]);
          expect(diagnostic).not.toContain(privateMarker);
          expect(diagnostic).not.toContain("private-cause");
          expect(diagnostic).not.toContain("private-response");
          expect(abortedRoutes).toBe(1);
          expect(unrouteCalled).toBe(true);
          expect(sourceReads).toBe(1);
          return;
        }
        if (faultPoint) {
          const failure = await run.then(
            () => undefined,
            (error: unknown) => error,
          );
          evidence.failure(failure);
          expect(api!.reportCalls()).toHaveLength(6);
          const expectedStage = typedFault
            ? (injectedFailure as JourneyFailure).stage
            : faultPoint === "artifact-body"
              ? "daily-report-ops-get-job-artifact-body-native"
              : `daily-report-empty-${"expectedPhase" in scenario ? scenario.expectedPhase : ""}`;
          expect(evidence.events.at(-1)).toEqual({
            stage: expectedStage,
            ...(typedFault
              ? {
                  status:
                    injectedFailure instanceof JourneyFailure
                      ? injectedFailure.status
                      : undefined,
                  code: "REPORT_READ_FAILED",
                }
              : {}),
            result: "failed",
          });
          expect(failure).toBeInstanceOf(JourneyFailure);
          if (typedFault === "exchange-http") {
            expect(failure).toBeInstanceOf(DailyReportHttpFailure);
            expect(failure).toMatchObject({
              context: (injectedFailure as DailyReportHttpFailure).context,
            });
            expect(JSON.stringify(evidence.events)).not.toContain(
              "private-report-error",
            );
          } else if (typedFault) expect(failure).toBe(injectedFailure);
          else {
            expect(JSON.parse(JSON.stringify(failure))).toEqual({
              stage: expectedStage,
            });
            expect((failure as Error).message).toBe(expectedStage);
            expect((failure as Error).cause).toBeUndefined();
          }
          expect(JSON.stringify(evidence.events)).not.toContain(privateMarker);
          expect((failure as Error).stack).not.toContain(privateMarker);
          expect(unrouteCalled).toBe(true);
          expect(sourceReads).toBe(1);
          expect(evidence.events).toContainEqual({
            stage: "daily-report-empty-source-before-zero-positive-own",
            orderId: ORDER_ID,
            result: "observed",
          });
          // The original positive report bytes were verified before any injection.
          for (const format of DAILY_REPORT_FORMATS)
            expect(
              evidence.events.some(
                (event) =>
                  event.stage === `daily-report-download-${format}-verified`,
              ),
            ).toBe(true);
          return;
        }
        if (
          previewFailure === "page" ||
          previewFailure === "reload-page" ||
          previewFailure === "detail"
        ) {
          const initialPage = previewFailure === "page";
          const reloadPage = previewFailure === "reload-page";
          await expect(run).rejects.toBeInstanceOf(DailyReportHttpFailure);
          await expect(run).rejects.toMatchObject({
            stage: initialPage
              ? "daily-report-ops-reports-initial-load-200"
              : reloadPage
                ? "daily-report-reload-reports-page-status-200"
                : "daily-report-job-detail-csv-http-status-200-required",
            status: initialPage || reloadPage ? 500 : 404,
            code:
              initialPage || reloadPage ? undefined : "REPORT_JOB_NOT_FOUND",
            context: {
              phase: initialPage
                ? "initial-reports-page"
                : reloadPage
                  ? "reload-reports-page"
                  : "job-detail-csv",
              method: "GET",
              route: initialPage || reloadPage ? "reports-page" : "job-detail",
              runtimeSha: RUNTIME_SHA,
              ...(initialPage || reloadPage
                ? {}
                : {
                    requestId: "b7e78ce8-82c1-46fb-a457-1f90ee7cdf55",
                  }),
            },
          });
          expect(evidence.events).toContainEqual(
            initialPage || reloadPage
              ? {
                  stage: `daily-report-http-${initialPage ? "initial" : "reload"}-reports-page-get-reports-page`,
                  status: 500,
                  result: "failed",
                }
              : {
                  stage: "daily-report-http-job-detail-csv-get-job-detail",
                  status: 404,
                  code: "REPORT_JOB_NOT_FOUND",
                  objectKey: "b7e78ce8-82c1-46fb-a457-1f90ee7cdf55",
                  result: "failed",
                },
          );
          expect(initialJobsRequests).toBe(
            initialPage ? 0 : reloadPage ? 1 : 2,
          );
          expect(pageVisits).toBe(initialPage ? 1 : 2);
          expect(createdJobs.map((job) => job.jobId)).toEqual(
            initialPage
              ? []
              : DAILY_REPORT_FORMATS.map((format) => `job_harness_${format}`),
          );
          expect(artifactRequests).toBe(0);
          // No completed, verified own main jobs: the denial never runs.
          expect(api!.calls).toHaveLength(0);
          expect(unrouteCalled).toBe(true);
          expect(JSON.stringify(evidence.events)).not.toContain(
            "private-detail-error",
          );
          expect(JSON.stringify(evidence.events)).not.toContain(
            "private-page-error",
          );
          await expect(
            stat(path.join(reportDirectory, "daily-reports")),
          ).rejects.toThrow();
          return;
        }
        if (previewFailure === "job-row-field") {
          await expect(run).rejects.toMatchObject({
            stage: "daily-report-preview-dispatch-assignment-fields-required",
          });
          const diagnostic = JSON.stringify(evidence.events);
          expect(diagnostic).toContain(
            "daily-report-preview-own-order-verified",
          );
          expect(diagnostic).toContain("daily-report-job-csv-accepted");
          expect(diagnostic).toContain(
            "daily-report-job-detail-field-firstAssignedAt-parseable-false",
          );
          expect(diagnostic).not.toContain("daily-report-preview-field-");
          expect(diagnostic).not.toContain("secret-invalid-job-assignment");
          const fieldEvents = evidence.events.filter((event) =>
            event.stage.startsWith("daily-report-job-detail-field-"),
          );
          expect(fieldEvents).toHaveLength(7);
          expect(JSON.stringify(fieldEvents)).not.toContain(ORDER_ID);
          expect(JSON.stringify(fieldEvents)).not.toContain(PICKUP_ADDRESS);
          expect(createdJobs.map((job) => job.jobId)).toEqual(
            DAILY_REPORT_FORMATS.map((format) => `job_harness_${format}`),
          );
          expect(artifactRequests).toBe(1);
          expect(api!.calls).toHaveLength(0);
          expect(unrouteCalled).toBe(true);
          await expect(
            stat(path.join(reportDirectory, "daily-reports")),
          ).rejects.toThrow();
          return;
        }
        if (previewFailure === "row-field") {
          await expect(run).rejects.toMatchObject({
            stage: "daily-report-preview-dispatch-assignment-fields-required",
          });
          const diagnostic = JSON.stringify(evidence.events);
          expect(diagnostic).toContain(
            "daily-report-preview-field-firstAssignedAt-parseable-false",
          );
          expect(diagnostic).not.toContain("secret-invalid-assignment");
          expect(diagnostic).not.toContain(ORDER_ID);
          expect(createdJobs).toHaveLength(0);
          expect(unrouteCalled).toBe(true);
          await expect(
            stat(path.join(reportDirectory, "daily-reports")),
          ).rejects.toThrow();
          return;
        }
        if (previewFailure === true) {
          await expect(run).rejects.toMatchObject({
            stage: "daily-report-preview-status-200",
            status: 503,
            code: "REPORT_READ_FAILED",
            context: {
              phase: "preview",
              method: "GET",
              route: "daily-dispatch-records",
              runtimeSha: RUNTIME_SHA,
              requestId: "b7e78ce8-82c1-46fb-a457-1f90ee7cdf55",
            },
          });
          expect(evidence.events).toContainEqual({
            stage: "daily-report-http-preview-get-daily-dispatch-records",
            status: 503,
            code: "REPORT_READ_FAILED",
            objectKey: "b7e78ce8-82c1-46fb-a457-1f90ee7cdf55",
            result: "failed",
          });
          expect(JSON.stringify(evidence.events)).not.toContain(
            "private-error-message",
          );
          expect(createdJobs).toHaveLength(0);
          await expect(
            stat(path.join(reportDirectory, "daily-reports")),
          ).rejects.toThrow();
          return;
        }
        if (failureCase.startsWith("empty preview nonzero totalItems")) {
          await expect(run).rejects.toMatchObject({
            stage: "daily-report-empty-preview-total-items-zero-required",
          });
          expect(sourceReads).toBe(1);
          expect(unrouteCalled).toBe(true);
          expect(
            createdJobs.filter((job) => job.jobId.includes("_empty_")),
          ).toHaveLength(0);
          return;
        }
        if (sourceChange) {
          await expect(run).rejects.toThrow(
            sourceChange === "positive"
              ? "daily-report-empty-positive-source-count-stable-required"
              : "daily-report-empty-day-authoritative-source-control-required",
          );
          expect(api!.reportCalls()).toHaveLength(6);
          expect(sourceReads).toBe(2);
          expect(unrouteCalled).toBe(true);
          expect(
            evidence.events.some(
              (event) =>
                event.stage ===
                "daily-report-empty-source-after-zero-positive-own",
            ),
          ).toBe(false);
          return;
        }
        if (failureStage) {
          await expect(run).rejects.toThrow(failureStage);
          expect(api!.calls).toHaveLength(0);
          expect(unrouteCalled).toBe(true);
          expect(JSON.stringify(evidence.events)).not.toContain(
            "private-report-error",
          );
          await expect(
            stat(path.join(reportDirectory, "daily-reports")),
          ).rejects.toThrow();
          return;
        }
        if (r1208Fault) {
          const failure = await run.then(
            () => undefined,
            (error: unknown) => error,
          );
          const expectedStage = {
            "click-throws": "daily-report-r12-08-sim-submit",
            "no-hit": "daily-report-r12-08-sim-error-ui",
            "no-error-ui": "daily-report-r12-08-sim-error-ui",
            "success-notice":
              "daily-report-r12-08-sim-no-success-notice-required",
            "wrong-route":
              "daily-report-r12-08-sim-exactly-one-rebuild-hit-required",
            "double-hit":
              "daily-report-r12-08-sim-exactly-one-rebuild-hit-required",
            forwarded: "daily-report-r12-08-sim-no-forward-required",
            "unroute-throws": "daily-report-r12-08-sim-unroute-required",
            "retry-503": "daily-report-rebuild-status-200",
            "retry-changed-filter":
              "daily-report-r12-08-retry-same-filters-required",
            "retry-missing-ack": "object response required",
            "retry-foreign-row": "daily-report-preview-missing-own-order",
            "retry-row-identity":
              "daily-report-preview-own-order-field-mismatch",
          }[r1208Fault];
          expect(failure).toBeInstanceOf(JourneyFailure);
          expect(failure).toMatchObject({ stage: expectedStage });
          if (r1208Fault === "retry-503")
            expect(failure).toMatchObject({
              status: 503,
              code: REBUILD_FAILED_CODE,
              context: {
                phase: "rebuild",
                method: "POST",
                route: "daily-dispatch-rebuild",
                runtimeSha: RUNTIME_SHA,
              },
            });
          // Every existing control ran before R12-08 and none was dropped.
          const stages = evidence.events.map((event) => event.stage);
          for (const format of DAILY_REPORT_FORMATS) {
            expect(stages).toContain(
              `daily-report-download-${format}-verified`,
            );
            expect(stages).toContain(`daily-report-empty-${format}-verified`);
          }
          expect(stages).toContain(
            "daily-report-nonreport-role-own-jobs-unchanged-after-denial",
          );
          expect(stages).toContain(
            "daily-report-positive-after-empty-restored",
          );
          expect(api!.reportCalls()).toHaveLength(6);
          expect(sourceReads).toBe(2);
          // The interception was registered once and its removal always ran.
          expect(pageRouteCalls).toBe(1);
          expect(pageUnrouteCalls).toBe(1);
          expect(pageRoute === undefined).toBe(r1208Fault !== "unroute-throws");
          expect(unrouteCalled).toBe(true);
          // A failed simulation or real retry never claims recovery.
          expect(stages).not.toContain(
            "daily-report-r12-08-real-retry-own-row-verified",
          );
          const retried = r1208Fault.startsWith("retry-");
          expect(
            stages.includes("daily-report-r12-08-sim-interception-removed"),
          ).toBe(retried);
          // Only an actual real retry adds a forwarded rebuild POST.
          expect(rebuildPosts).toBe(retried ? 3 : 2);
          expect(simulatedResponses).toHaveLength(
            ["click-throws", "no-hit"].includes(r1208Fault) ? 0 : 1,
          );
          const diagnostic = JSON.stringify([failure, evidence.events]);
          expect(diagnostic).not.toContain(privateMarker);
          expect(diagnostic).not.toContain("synthetic-ops-jwt");
          return;
        }
        const result = await run;
        if (routeFault?.startsWith("unrelated-")) {
          expect(abortedRoutes).toBe(1);
          const failures = evidence.events.filter(
            (event) =>
              event.stage.startsWith("daily-report-ops-") &&
              event.result === "failed",
          );
          expect(failures).toHaveLength(1);
          expect(failures[0]).toMatchObject({
            requestMethod: "GET",
            result: "failed",
          });
          expect(JSON.stringify(failures)).not.toContain(privateMarker);
          expect(JSON.stringify(failures)).not.toContain("private-query");
          expect(JSON.stringify(failures)).not.toContain("private-cause");
        }

        expect(result.orderId).toBe(ORDER_ID);
        expect(result.serviceDate).toBe("2026-10-26");
        expect(result.filters.tenantId).toBe(REFERRAL_TENANT_ID);
        expect(result.preview.rebuilt).toBe(true);
        expect(result.preview.rebuildCount).toBe(2);
        // Positive even when preexisting, then empty; main adds the R12-08
        // real retry (its simulated POST is never forwarded).
        expect(rebuildPosts).toBe(cancelled ? 2 : 3);
        expect(rebuiltPreviewGets).toBe(cancelled ? 2 : 3);
        expect(result.preview.rowCount).toBe(2);
        expect(result.preview.syntheticProvenanceVerified).toBe(
          expectedPreviewControlled,
        );
        expect(result.preview.controlledRowCount).toBe(
          expectedPreviewControlled ? 2 : 1,
        );
        expect(result.preview.unverifiedSiblingRowCount).toBe(
          expectedPreviewControlled ? 0 : 1,
        );
        expect(result.preview.finalPlateNo).toBe(cancelled ? null : PLATE_NO);
        expect(result.filters.finalStatus).toBe(
          cancelled ? "cancelled" : "completed",
        );
        expect(result.emptyDay.serviceDate).toBe(emptyDay);
        expect(result.emptyDay.sourceBefore.emptyCount).toBe(0);
        expect(result.emptyDay.sourceAfter.ownPositivePresent).toBe(true);
        expect(result.emptyDay.restoredPositiveRow).toBe(true);
        for (const format of DAILY_REPORT_FORMATS) {
          expect(result.emptyDay.downloads[format].rowCount).toBe(0);
          expect(result.emptyDay.downloads[format].jobId).toBe(
            `job_harness_empty_${format}`,
          );
        }

        for (const format of DAILY_REPORT_FORMATS) {
          const dl = result.downloads[format];
          expect(dl.jobId).toBe(`job_harness_${format}`);
          expect(dl.runtimeSha).toBe(RUNTIME_SHA);
          expect(dl.syntheticProvenanceVerified).toBe(expectedRetained);
          expect(dl.rawArtifactRetained).toBe(expectedRetained);
          expect(dl.controlledRowCount).toBe(expectedRetained ? 2 : 1);
          expect(dl.unverifiedSiblingRowCount).toBe(expectedRetained ? 0 : 1);
          expect(
            evidence.events.some(
              (event) =>
                event.stage ===
                `daily-report-download-${format}-raw-retention-skipped`,
            ),
          ).toBe(!expectedRetained);
          if (expectedRetained) {
            expect(dl.artifactPath).toBe(
              `${reportDirectory}/daily-reports/daily-dispatch-${dl.jobId}.${format}`,
            );
            const onDisk = await readFile(dl.artifactPath!);
            expect(hash(onDisk)).toBe(dl.sha256);
            expect(onDisk.length).toBe(dl.bytes);
          } else {
            expect(dl.artifactPath).toBeNull();
            await expect(
              stat(path.join(reportDirectory, "daily-reports")),
            ).rejects.toThrow();
          }
        }

        expect(JSON.stringify(result)).not.toContain("synthetic-ops-jwt");
        expect(JSON.stringify(evidence.events)).not.toContain(
          "synthetic-ops-jwt",
        );

        // Original R12-08: explicit browser SIM then real retry, main only.
        if (cancelled) {
          expect(result.rebuildFailureRecovery).toBeUndefined();
          expect(pageRouteCalls).toBe(0);
          expect(simulatedResponses).toHaveLength(0);
          expect(
            evidence.events.some((event) =>
              event.stage.startsWith("daily-report-r12-08-"),
            ),
          ).toBe(false);
        } else {
          const filters = buildDailyReportFilters(
            resolveExpectedDailyDispatchRecord(
              buildOrderFixture(),
              buildTaskFixture(),
              buildOwnContext(),
            ),
          );
          const sentBody = JSON.stringify({
            serviceDateFrom: filters.serviceDateFrom,
            serviceDateTo: filters.serviceDateTo,
            orderSource: filters.orderSource,
            finalStatus: filters.finalStatus,
            tenantId: filters.tenantId,
            partnerId: filters.partnerId,
            serviceProductCode: filters.serviceProductCode,
          });
          expect(pageRouteCalls).toBe(1);
          expect(pageUnrouteCalls).toBe(1);
          expect(pageRoute).toBeUndefined();
          expect(simulatedRequestBodies).toEqual([sentBody]);
          // The fulfilled body is the existing service failure as the real
          // API producer and wire interceptor serialize it.
          expect(simulatedResponses).toHaveLength(1);
          expect(simulatedResponses[0]).toMatchObject({
            status: 503,
            contentType: "application/json",
          });
          const simulatedEnvelope = JSON.parse(simulatedResponses[0]!.body!);
          const producedEnvelope = deepToSnakeCase(
            toApiErrorEnvelope(REBUILD_FAILED_CODE, REBUILD_FAILED_MESSAGE),
          ) as { error: Record<string, unknown> };
          expect(Object.keys(simulatedEnvelope.error).sort()).toEqual(
            Object.keys(
              JSON.parse(JSON.stringify(producedEnvelope)).error,
            ).sort(),
          );
          expect(simulatedEnvelope.error).toMatchObject({
            code: producedEnvelope.error.code,
            message: producedEnvelope.error.message,
            retryable: producedEnvelope.error.retryable,
            trace_id: expect.stringMatching(
              /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
            ),
          });
          const serviceSource = await readFile(
            new URL(
              "../../../apps/api/src/modules/reporting/reporting.service.ts",
              import.meta.url,
            ),
            "utf8",
          );
          expect(serviceSource).toMatch(
            /new ApiRequestError\(\s*503,\s*"REPORT_REBUILD_FAILED",\s*"Daily dispatch records could not be rebuilt\.",\s*\)/,
          );
          expect(result.rebuildFailureRecovery).toEqual({
            originalCase: "R12-08",
            simulation: true,
            faultLayer: "browser-network-interception",
            actualBackendFaultVerified: false,
            filters,
            simulatedFailure: {
              method: "POST",
              route: "daily-dispatch-rebuild",
              status: 503,
              code: REBUILD_FAILED_CODE,
              hitCount: 1,
              forwardCount: 0,
              requestPayloadSha256: hash(Buffer.from(sentBody)),
              interceptionRemoved: true,
            },
            errorUi: {
              errorBannerVisible: true,
              errorCodeVisible: true,
              successNoticeCount: 0,
              retryEnabled: true,
            },
            realRetry: {
              method: "POST",
              route: "daily-dispatch-rebuild",
              status: 200,
              rebuiltCount: 2,
              generatedAt: "2026-10-25T18:31:00.000Z",
              requestPayloadSha256: hash(Buffer.from(sentBody)),
              samePayloadAsSimulated: true,
              runtimeSha: RUNTIME_SHA,
            },
            readback: {
              method: "GET",
              route: "daily-dispatch-records",
              status: 200,
              rowCount: 2,
              ownRowVerified: true,
              orderId: ORDER_ID,
              orderNo: ORDER_NO,
              serviceDate: "2026-10-26",
              finalStatus: "completed",
              orderSource: "tenant_portal",
              generatedAt: "2026-10-25T18:31:00.000Z",
              syntheticProvenanceVerified: expectedPreviewControlled,
              provenanceQualification: expectedPreviewControlled
                ? "all-rows-controlled-synthetic"
                : "own-row-verified-unowned-siblings-present-raw-retention-skipped",
              runtimeSha: RUNTIME_SHA,
            },
          });
          const r1208Stages = evidence.events.map((event) => event.stage);
          const restoredAt = r1208Stages.indexOf(
            "daily-report-positive-after-empty-restored",
          );
          const simAt = r1208Stages.indexOf(
            "daily-report-r12-08-sim-rebuild-503-ui-error-observed",
          );
          const removedAt = r1208Stages.indexOf(
            "daily-report-r12-08-sim-interception-removed",
          );
          const recoveredAt = r1208Stages.indexOf(
            "daily-report-r12-08-real-retry-own-row-verified",
          );
          expect(restoredAt).toBeGreaterThan(-1);
          expect(simAt).toBeGreaterThan(restoredAt);
          expect(removedAt).toBeGreaterThan(simAt);
          expect(recoveredAt).toBeGreaterThan(removedAt);
          // The simulated 503 is never recorded as a real HTTP failure.
          expect(
            evidence.events.some(
              (event) =>
                event.stage.startsWith("daily-report-http-") &&
                event.result === "failed",
            ),
          ).toBe(false);
        }

        // Original R12-10: once, main path only, after positive custody.
        if (cancelled) {
          expect(result.nonReportRoleDenial).toBeUndefined();
          expect(api!.calls).toHaveLength(0);
        } else {
          const ownJobIds = DAILY_REPORT_FORMATS.map(
            (format) => `job_harness_${format}`,
          );
          expect(api!.calls.map((call) => call.pathname)).toEqual([
            "/api/auth/session",
            ...ownJobIds.flatMap((jobId) => [
              "/api/auth/session",
              `/api/reports/${jobId}`,
              "/api/auth/session",
              `/api/reports/${jobId}/artifact`,
            ]),
          ]);
          for (const call of api!.calls) {
            expect(call).toMatchObject({
              method: "GET",
              redirect: "manual",
              authorization: `Bearer ${NONREPORT_FLEET_SESSION_TOKEN}`,
            });
          }
          const denial = result.nonReportRoleDenial!;
          expect(denial).toMatchObject({
            originalCase: "R12-10",
            role: "own_fleet",
            runtimeSha: RUNTIME_SHA,
            ownJobsUnchangedAfterDenial: true,
            session: {
              status: 200,
              active: true,
              realm: "partner",
              authMode: "jwt_bearer",
              actorType: "partner_api_key",
              partnerId: "fleet-demo-001",
              tenantId: FLEET_SUPPLY_TENANT_ID,
              scopes: ["billing:read", "partner:read", "partner:write"],
              reportScopesGranted: false,
            },
          });
          for (const format of DAILY_REPORT_FORMATS) {
            expect(denial.jobs[format]).toEqual({
              jobId: result.downloads[format].jobId,
              artifactId: result.downloads[format].artifactId,
              manifestHash: result.downloads[format].manifestHash,
              detail: {
                method: "GET",
                route: "report-job-detail",
                status: 403,
                code: "AUTH_REALM_DENIED",
              },
              artifact: {
                method: "GET",
                route: "report-job-artifact",
                status: 403,
                code: "AUTH_REALM_DENIED",
              },
            });
          }
          const stages = evidence.events.map((event) => event.stage);
          const sessionAt = stages.indexOf(
            "daily-report-nonreport-role-session-verified",
          );
          expect(sessionAt).toBeGreaterThan(
            stages.indexOf("daily-report-download-pdf-verified"),
          );
          expect(sessionAt).toBeLessThan(
            stages.indexOf(
              "daily-report-empty-source-before-zero-positive-own",
            ),
          );
          expect(
            stages.indexOf(
              "daily-report-nonreport-role-own-jobs-unchanged-after-denial",
            ),
          ).toBeGreaterThan(stages.indexOf("daily-report-empty-pdf-verified"));
          expect(
            evidence.events.filter((event) =>
              /^daily-report-nonreport-role-.*-denied$/.test(event.stage),
            ),
          ).toHaveLength(6);
          // Denial adds no export: only 3 positive + 3 empty jobs exist.
          expect(createdJobs).toHaveLength(6);
          const persisted = JSON.stringify([result, evidence.events]);
          expect(persisted).not.toContain(NONREPORT_FLEET_SESSION_TOKEN);
          expect(persisted).not.toContain("private-");
          expect(persisted).not.toContain(NONREPORT_API_ORIGIN);
        }
      } finally {
        api?.restore();
        restoreClock?.();
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    22_000,
  );
});

describe("explicit supplemental rows preserve strict completed controls", () => {
  it("requires a real owned acknowledged journal and canonical cancelled source", () => {
    const { expected, row } = cancelledCase();
    expect(
      validateSupplementalDailyPreviewRows(
        [row],
        expected,
        RUNTIME_SHA,
        RUNTIME_SHA,
      ).ownRow,
    ).toEqual(row);
    expect(() =>
      validateDailyPreviewRows(
        [row],
        expected as never,
        RUNTIME_SHA,
        RUNTIME_SHA,
      ),
    ).toThrow("strict-completed");
    const main = resolveExpectedDailyDispatchRecord(
      buildOrderFixture(),
      buildTaskFixture(),
      buildOwnContext(),
    );
    expect(() =>
      validateDailyPreviewRows([row], main, RUNTIME_SHA, RUNTIME_SHA),
    ).toThrow();
  });
  it.each([
    "firstDispatchAt",
    "firstAssignedAt",
    "finalDriverId",
    "finalVehicleId",
    "finalPlateNo",
    "etaSecondsAtAssignment",
    "arrivedPickupAt",
    "tripStartedAt",
    "tripCompletedAt",
  ])("does not infer cancelled %s null from another missing event", (key) => {
    const { expected, row } = cancelledCase();
    for (const value of [undefined, "", "2026-10-25T18:20:00.000Z", DRIVER_ID])
      expect(() =>
        validateSupplementalDailyPreviewRows(
          [{ ...row, [key]: value }],
          expected,
          RUNTIME_SHA,
          RUNTIME_SHA,
        ),
      ).toThrow();
  });
  it("rejects completed leakage, duplicate/missing own row, wrong date and count", () => {
    const { expected, row } = cancelledCase();
    for (const rows of [
      [row, row],
      [],
      [row, buildDailyDispatchRow()],
      [{ ...row, serviceDate: "2026-10-27" }],
      [{ ...row, redispatchCount: 1 }],
    ])
      expect(() =>
        validateSupplementalDailyPreviewRows(
          rows,
          expected,
          RUNTIME_SHA,
          RUNTIME_SHA,
        ),
      ).toThrow();
  });
  it("requires redispatch count one, second pair and real arrival while allowing zero complaints", () => {
    const main = resolveExpectedDailyDispatchRecord(
      buildOrderFixture(),
      buildTaskFixture(),
      buildOwnContext(),
    );
    const expected = {
      ...main,
      caseKind: "redispatched" as const,
      redispatchCount: 1,
      cancellationReason: null,
    };
    const row = buildDailyDispatchRow({
      redispatchCount: 1,
      complaintCount: 0,
    });
    expect(
      validateSupplementalDailyPreviewRows(
        [row],
        expected,
        RUNTIME_SHA,
        RUNTIME_SHA,
      ).complaintCount,
    ).toBe(0);
    for (const patch of [
      { redispatchCount: 0 },
      { redispatchCount: 2 },
      { arrivedPickupAt: null },
      { finalDriverId: "first-driver" },
    ])
      expect(() =>
        validateSupplementalDailyPreviewRows(
          [{ ...row, ...patch }],
          expected,
          RUNTIME_SHA,
          RUNTIME_SHA,
        ),
      ).toThrow();
    expect(() =>
      validateDailyPreviewRows([row], main, RUNTIME_SHA, RUNTIME_SHA),
    ).toThrow("complaint-count");
  });
  it.each(DAILY_REPORT_FORMATS)(
    "checks actual cancelled %s bytes and rejects a nonempty arrival",
    async (format) => {
      const { expected, row } = cancelledCase();
      const jobId = `cancelled-${format}`;
      const detail = buildJobDetailFixture(format, jobId, [row], {
        filters: buildDailyReportFilters(expected),
      });
      const input = {
        format,
        jobId,
        jobDetail: detail,
        expected,
        previewOwnRow: row,
        runtimeSha: RUNTIME_SHA,
        detailStatus: 200,
        detailResponseSha: RUNTIME_SHA,
        artifactStatus: 200,
        artifactResponseSha: RUNTIME_SHA,
        contentType: DAILY_REPORT_MIME_TYPES[format],
        contentDisposition: `attachment; filename="daily_dispatch_record-${jobId}.${format}"`,
        bytes: await renderFormatBytes(format, jobId, [row]),
        artifactPath: "private/cancelled",
        nowMs: Date.parse("2026-10-25T19:00:00Z"),
      };
      expect(
        (await validateDailyReportArtifactDownload(input)).ownOrderPresent,
      ).toBe(true);
      await expect(
        validateDailyReportArtifactDownload({
          ...input,
          bytes: await renderFormatBytes(format, jobId, [
            { ...row, arrivedPickupAt: "2026-10-25T18:20:00.000Z" },
          ]),
        }),
      ).rejects.toThrow();
    },
  );
});

describe("two true Taipei reservation service days in all three formats", () => {
  for (const intended of [
    "2027-01-01T23:55:00+08:00",
    "2027-01-02T00:05:00+08:00",
  ]) {
    it.each(DAILY_REPORT_FORMATS)(
      `${intended} binds original schedule in %s`,
      async (format) => {
        const original = cancelledCase();
        const reservationWindowStart = new Date(intended).toISOString();
        const raw = JSON.stringify({
          entrySlug: ENTRY_SLUG,
          quoteId: "quote-scheduled",
          scheduledAt: reservationWindowStart,
        });
        const order = { ...original.order, reservationWindowStart };
        const expected = resolveExpectedCancelledDailyDispatchRecord(
          order,
          {
            state: "acknowledged",
            orderId: ORDER_ID,
            quoteId: "quote-scheduled",
            entrySlug: ENTRY_SLUG,
            body: raw,
            bodySha256: hash(Buffer.from(raw)),
          },
          buildOwnContext(),
        );
        expect(expected.serviceDate).toBe(intended.slice(0, 10));
        const row = {
          ...original.row,
          serviceDate: expected.serviceDate,
          reservationTime: reservationWindowStart,
        };
        validateSupplementalDailyPreviewRows(
          [row],
          expected,
          RUNTIME_SHA,
          RUNTIME_SHA,
        );
        expect(() =>
          validateSupplementalDailyPreviewRows(
            [
              {
                ...row,
                serviceDate: intended.startsWith("2027-01-01")
                  ? "2027-01-02"
                  : "2027-01-01",
              },
            ],
            expected,
            RUNTIME_SHA,
            RUNTIME_SHA,
          ),
        ).toThrow();
        const jobId = `scheduled-${intended.slice(8, 10)}-${format}`;
        const result = await validateDailyReportArtifactDownload({
          format,
          jobId,
          expected,
          previewOwnRow: row,
          jobDetail: buildJobDetailFixture(format, jobId, [row], {
            filters: buildDailyReportFilters(expected),
          }),
          detailStatus: 200,
          detailResponseSha: RUNTIME_SHA,
          artifactStatus: 200,
          artifactResponseSha: RUNTIME_SHA,
          contentType: DAILY_REPORT_MIME_TYPES[format],
          contentDisposition: `attachment; filename="daily_dispatch_record-${jobId}.${format}"`,
          bytes: await renderFormatBytes(format, jobId, [row]),
          artifactPath: "private/reservation",
          runtimeSha: RUNTIME_SHA,
          nowMs: Date.parse("2026-10-25T19:00:00Z"),
        });
        expect(result.rowCount).toBe(1);
      },
    );
  }
});

describe("BUREAU-R12-EXISTING-NONREPORT-ROLE-DOWNLOAD-DENIAL-COVERAGE-20261028 original R12-10", () => {
  const acceptedJobs = {
    csv: "job_main_csv",
    xlsx: "job_main_xlsx",
    pdf: "job_main_pdf",
  } as const;
  // The full-helper harness above binds real validated summaries; these only
  // carry the fields the denial binds to (format/job/status/runtime/custody).
  const summaries = (
    overrides: Partial<
      Record<DailyReportFormat, Partial<DailyReportDownloadArtifactSummary>>
    > = {},
  ) =>
    Object.fromEntries(
      DAILY_REPORT_FORMATS.map((format) => [
        format,
        {
          format,
          jobId: acceptedJobs[format],
          jobStatus: "completed",
          ownOrderPresent: true,
          runtimeSha: RUNTIME_SHA,
          artifactId: `art_${acceptedJobs[format]}`,
          manifestHash: "c".repeat(64),
          ...overrides[format],
        },
      ]),
    ) as unknown as Record<
      DailyReportFormat,
      DailyReportDownloadArtifactSummary
    >;
  const probe = (
    evidence: Evidence,
    input: Partial<
      Parameters<typeof probeOwnedReportJobsWithNonReportRole>[0]
    > = {},
  ) =>
    probeOwnedReportJobsWithNonReportRole({
      acceptedJobs,
      downloads: summaries(),
      fleetSupplyTenantId: FLEET_SUPPLY_TENANT_ID,
      runtimeSha: RUNTIME_SHA,
      evidence,
      ...input,
    });
  const expectNoLeak = (failure: unknown, evidence: Evidence) => {
    const diagnostic = JSON.stringify([failure, evidence.events]);
    for (const secret of [
      NONREPORT_FLEET_SESSION_TOKEN,
      NONREPORT_API_ORIGIN,
      "private-",
    ]) {
      expect(diagnostic).not.toContain(secret);
      expect((failure as Error).message).not.toContain(secret);
      expect((failure as Error).stack ?? "").not.toContain(secret);
    }
    expect((failure as Error).cause).toBeUndefined();
  };

  it("verifies the actual own-Fleet session (200, partner, no reports grant) then gets real 403 on every own main job detail and artifact", async () => {
    const api = installNonReportRoleApi();
    try {
      const evidence = new Evidence();
      const result = await probe(evidence);
      expect(api.calls.map((call) => call.pathname)).toEqual([
        "/api/auth/session",
        ...Object.values(acceptedJobs).flatMap((jobId) => [
          "/api/auth/session",
          `/api/reports/${jobId}`,
          "/api/auth/session",
          `/api/reports/${jobId}/artifact`,
        ]),
      ]);
      expect(result.session).toEqual({
        status: 200,
        active: true,
        realm: "partner",
        authMode: "jwt_bearer",
        actorType: "partner_api_key",
        partnerId: "fleet-demo-001",
        tenantId: FLEET_SUPPLY_TENANT_ID,
        scopes: ["billing:read", "partner:read", "partner:write"],
        reportScopesGranted: false,
      });
      for (const format of DAILY_REPORT_FORMATS) {
        expect(result.jobs[format]).toMatchObject({
          jobId: acceptedJobs[format],
          artifactId: `art_${acceptedJobs[format]}`,
          detail: { status: 403, code: "AUTH_REALM_DENIED" },
          artifact: { status: 403, code: "AUTH_REALM_DENIED" },
        });
        for (const kind of ["detail", "artifact"])
          expect(evidence.events).toContainEqual({
            stage: `daily-report-nonreport-role-${format}-${kind}-denied`,
            status: 403,
            code: "AUTH_REALM_DENIED",
            objectKey: acceptedJobs[format],
            realm: "partner",
            actorType: "partner_api_key",
            requestMethod: "GET",
            result: "observed",
          });
      }
      expect(evidence.events[0]).toEqual({
        stage: "daily-report-nonreport-role-session-verified",
        status: 200,
        realm: "partner",
        actorType: "partner_api_key",
        result: "observed",
      });
      const persisted = JSON.stringify([result, evidence.events]);
      expect(persisted).not.toContain(NONREPORT_FLEET_SESSION_TOKEN);
      expect(persisted).not.toContain("private-");
      expect(persisted).not.toContain(NONREPORT_API_ORIGIN);
      expect(Object.isFrozen(result)).toBe(true);
    } finally {
      api.restore();
    }
  });

  it("accepts the documented AUTH_SCOPE_DENIED denial with the same session qualification", async () => {
    const api = installNonReportRoleApi({
      report: () => ({
        status: 403,
        body: toApiErrorEnvelope("AUTH_SCOPE_DENIED", "private-denial"),
      }),
    });
    try {
      const result = await probe(new Evidence());
      for (const format of DAILY_REPORT_FORMATS) {
        expect(result.jobs[format].detail.code).toBe("AUTH_SCOPE_DENIED");
        expect(result.jobs[format].artifact.code).toBe("AUTH_SCOPE_DENIED");
      }
    } finally {
      api.restore();
    }
  });

  it.each([
    ["session 401", { sessionStatus: 401 }, "session-200-required"],
    ["session 500", { sessionStatus: 500 }, "session-200-required"],
    ["inactive session", { active: false }, "session-200-required"],
    [
      "platform realm",
      { identity: { realm: "platform" } },
      "session-200-required",
    ],
    [
      "foreign Fleet partner",
      { identity: { partnerId: "fleet-foreign-002" } },
      "session-200-required",
    ],
    [
      "wrong session SHA",
      { sessionSha: "c".repeat(40) },
      "session-200-required",
    ],
    [
      "wrong Fleet tenant",
      { identity: { tenantId: "10000000-0000-0000-0000-000000000999" } },
      "session-qualification-required",
    ],
    [
      "has reports:read grant",
      {
        identity: { scopes: ["billing:read", "partner:read", "reports:read"] },
      },
      "session-qualification-required",
    ],
    [
      "has reports:write grant",
      { identity: { scopes: ["partner:read", "reports:write"] } },
      "session-qualification-required",
    ],
    [
      "wildcard grant",
      { identity: { scopes: ["*"] } },
      "session-qualification-required",
    ],
    [
      "namespace wildcard grant",
      { identity: { scopes: ["partner:read", "billing:*"] } },
      "session-qualification-required",
    ],
    [
      "no scopes",
      { identity: { scopes: [] } },
      "session-qualification-required",
    ],
    [
      "malformed scopes",
      { identity: { scopes: "billing:read partner:read" } },
      "session-qualification-required",
    ],
    [
      "non-JWT auth mode",
      { identity: { authMode: "dev_header" } },
      "session-qualification-required",
    ],
    [
      "wrong actor type",
      { identity: { actorType: "platform_admin" } },
      "session-qualification-required",
    ],
  ] as const)(
    "never probes reports without a qualified active session: %s",
    async (_name, scenario, stage) => {
      const api = installNonReportRoleApi(scenario as NonReportApiScenario);
      try {
        const evidence = new Evidence();
        const failure = await probe(evidence).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(JourneyFailure);
        expect(failure).toMatchObject({
          stage: `daily-report-nonreport-role-${stage}`,
        });
        expect(api.reportCalls()).toHaveLength(0);
        expect(api.calls).toHaveLength(1);
        expect(evidence.events).toHaveLength(0);
        expectNoLeak(failure, evidence);
      } finally {
        api.restore();
      }
    },
  );

  it.each([
    [
      "401",
      { status: 401, body: toApiErrorEnvelope("UNAUTHORIZED", "private-x") },
      "403-required",
    ],
    [
      "404",
      {
        status: 404,
        body: toApiErrorEnvelope("REPORT_JOB_NOT_FOUND", "private-x"),
      },
      "403-required",
    ],
    [
      "500",
      { status: 500, body: toApiErrorEnvelope("INTERNAL", "private-x") },
      "403-required",
    ],
    [
      "redirect",
      {
        status: 302,
        headers: { location: "https://login.example.test/private-redirect" },
      },
      "403-required",
    ],
    [
      "authorization bypass 200",
      { status: 200, body: toApiSuccessEnvelope({ rows: ["private-row"] }) },
      "403-required",
    ],
    [
      "resource-level 403 instead of auth denial",
      {
        status: 403,
        body: toApiErrorEnvelope(
          "REPORT_JOB_TENANT_SCOPE_FORBIDDEN",
          "private-x",
        ),
      },
      "auth-denial-required",
    ],
    [
      "generic FORBIDDEN 403",
      { status: 403, body: toApiErrorEnvelope("FORBIDDEN", "private-x") },
      "auth-denial-required",
    ],
    ["403 without error body", { status: 403 }, "auth-denial-required"],
  ] as const)(
    "rejects a non-auth-denial report response: %s",
    async (_name, response, stage) => {
      const api = installNonReportRoleApi({ report: () => response });
      try {
        const evidence = new Evidence();
        const failure = await probe(evidence).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(JourneyFailure);
        expect(failure).toMatchObject({
          stage: `daily-report-nonreport-role-csv-detail-${stage}`,
        });
        expect(api.reportCalls()).toEqual([
          expect.objectContaining({
            pathname: "/api/reports/job_main_csv",
            redirect: "manual",
          }),
        ]);
        expect(
          evidence.events.some((event) => event.stage.endsWith("-denied")),
        ).toBe(false);
        expectNoLeak(failure, evidence);
      } finally {
        api.restore();
      }
    },
  );

  it("rejects a correct-looking 403 served by a different runtime SHA", async () => {
    const api = installNonReportRoleApi({ reportSha: "c".repeat(40) });
    try {
      const evidence = new Evidence();
      const failure = await probe(evidence).catch((error: unknown) => error);
      expect(failure).toMatchObject({
        stage: "daily-report-nonreport-role-csv-detail-403-required",
      });
      expect(api.reportCalls()).toHaveLength(1);
      expectNoLeak(failure, evidence);
    } finally {
      api.restore();
    }
  });

  it.each([
    [
      "candidate SHA not bound to runtime",
      (): unknown => vi.stubEnv("DRTS_CANDIDATE_SHA", "c".repeat(40)),
      {},
      "runtime-binding-required",
    ],
    [
      "candidate SHA unset",
      (): unknown => vi.stubEnv("DRTS_CANDIDATE_SHA", ""),
      {},
      "runtime-binding-required",
    ],
    [
      "unowned job ID not accepted by this run",
      (): unknown => undefined,
      { acceptedJobs: { ...acceptedJobs, csv: "job_foreign_csv" } },
      "own-completed-main-jobs-required",
    ],
    [
      "no prior ACK/verified download",
      (): unknown => undefined,
      {
        downloads: (({ csv, xlsx }) => ({ csv, xlsx }))(
          summaries(),
        ) as unknown as Record<
          DailyReportFormat,
          DailyReportDownloadArtifactSummary
        >,
      },
      "own-completed-main-jobs-required",
    ],
    [
      "job not completed",
      (): unknown => undefined,
      {
        downloads: summaries({
          xlsx: { jobStatus: "queued" as unknown as "completed" },
        }),
      },
      "own-completed-main-jobs-required",
    ],
    [
      "download from another runtime",
      (): unknown => undefined,
      { downloads: summaries({ pdf: { runtimeSha: "c".repeat(40) } }) },
      "own-completed-main-jobs-required",
    ],
    [
      "duplicate job IDs",
      (): unknown => undefined,
      {
        acceptedJobs: { csv: "job_x", xlsx: "job_x", pdf: "job_x" },
        downloads: summaries({
          csv: { jobId: "job_x" },
          xlsx: { jobId: "job_x" },
          pdf: { jobId: "job_x" },
        }),
      },
      "own-completed-main-jobs-required",
    ],
    [
      "plain-http API origin",
      (): unknown =>
        vi.stubEnv("DRTS_OPERATIONAL_API_URL", "http://api.example.test/"),
      {},
      "api-origin-required",
    ],
    [
      "API origin with path",
      (): unknown =>
        vi.stubEnv(
          "DRTS_OPERATIONAL_API_URL",
          `${NONREPORT_API_ORIGIN}/private-path`,
        ),
      {},
      "api-origin-required",
    ],
    [
      "missing Fleet tenant",
      (): unknown => undefined,
      { fleetSupplyTenantId: "" },
      "fleet-tenant-required",
    ],
  ] as const)(
    "binds only this run's own completed main jobs before any network: %s",
    async (_name, mutateEnv, input, stage) => {
      const api = installNonReportRoleApi();
      try {
        mutateEnv();
        const evidence = new Evidence();
        const failure = await probe(
          evidence,
          input as Partial<
            Parameters<typeof probeOwnedReportJobsWithNonReportRole>[0]
          >,
        ).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(JourneyFailure);
        expect(failure).toMatchObject({
          stage: `daily-report-nonreport-role-${stage}`,
        });
        expect(api.calls).toHaveLength(0);
        expect(evidence.events).toHaveLength(0);
        expectNoLeak(failure, evidence);
      } finally {
        api.restore();
      }
    },
  );
});
