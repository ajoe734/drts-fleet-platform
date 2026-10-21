import { readFileSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import {
  PASSENGER_FEE_DISCLOSURE_VERSION,
  PASSENGER_FEE_CONTENT_HASH,
} from "@drts/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  operationalRequestHeaders,
  requiredOrigin,
} from "../e2e/operational-document-upload";

describe("operational browser journeys manifest guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses Fleet proof for both original setup arrays while retaining Admin review authority", () => {
    const manifest = JSON.parse(
      readFileSync(
        path.join(
          process.cwd(),
          "tests/e2e/fixtures/operational-browser-journeys.json",
        ),
        "utf8",
      ),
    );
    expect(manifest.fleetApplicationSetup.fleetPartnerId).toBe(
      "fleet-demo-001",
    );
    const tenant = manifest.journeys.find(
      (item: { id: string }) => item.id === "tenant-ops-dispatch-intent",
    );
    expect(manifest.fleetApplicationSetup.tenantId).toBe(
      tenant.setup[0].headers["x-tenant-id"],
    );
    vi.stubEnv(
      "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
      "https://fleet.example.invalid",
    );
    vi.stubEnv(
      "DRTS_DEV_FLEET_PARTNER_PORTAL_ID_TOKEN",
      "fleet-invocation-dummy",
    );
    vi.stubEnv(
      "DRTS_OPERATIONAL_FLEET_SESSION_TOKEN",
      "existing-partner-session-dummy",
    );
    vi.stubEnv(
      "DRTS_DEV_PLATFORM_ADMIN_BASE_URL",
      "https://admin.example.invalid",
    );
    vi.stubEnv("DRTS_DEV_PLATFORM_ADMIN_ID_TOKEN", "admin-invocation-dummy");
    for (const id of [
      "fleet-submit-read-withdraw-resubmit",
      "admin-review-approve-readback",
    ]) {
      const journey = manifest.journeys.find(
        (item: { id: string }) => item.id === id,
      );
      expect(journey).toBeDefined();
      expect(journey.setup).toHaveLength(
        id === "fleet-submit-read-withdraw-resubmit" ? 4 : 6,
      );
      for (const step of journey.setup) {
        const baseUrlEnv = step.baseUrlEnv ?? journey.baseUrlEnv;
        expect(baseUrlEnv).toBe("DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL");
        const headers = operationalRequestHeaders(
          baseUrlEnv,
          "https://fleet.example.invalid",
        );
        expect(headers.Authorization).toBe("Bearer fleet-invocation-dummy");
        expect(headers["x-drts-authorization"]).toBe(
          "Bearer existing-partner-session-dummy",
        );
      }
    }
    const admin = manifest.journeys.find(
      (item: { id: string }) => item.id === "admin-review-approve-readback",
    );
    expect(
      operationalRequestHeaders(
        admin.baseUrlEnv,
        "https://admin.example.invalid/supply-review",
      ),
    ).toEqual({
      Authorization: "Bearer admin-invocation-dummy",
    });
  });

  it("keeps the source evidence document independent of a candidate SHA", () => {
    const evidencePath = path.join(
      process.cwd(),
      "docs/04-uat/s1f-uix-001-cross-surface-acceptance-evidence.md",
    );
    const evidence = readFileSync(evidencePath, "utf8");

    expect(evidence).toContain(
      "Candidate SHA: recorded only by the post-deploy workflow artifact",
    );
    expect(evidence).not.toMatch(/Candidate SHA: `?[0-9a-f]{40}/);
    expect(evidence).not.toMatch(/operational-browser-evidence-[0-9a-f]{40}/);
  });

  it("conforms to the declared operation contract", () => {
    const manifestPath = path.join(
      process.cwd(),
      "tests/e2e/fixtures/operational-browser-journeys.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    const fleetJourney = manifest.journeys.find(
      (j: { id: string }) => j.id === "fleet-submit-read-withdraw-resubmit",
    );
    expect(fleetJourney).toBeDefined();
    expect(fleetJourney.route).toBe(
      "/supply/submissions/{{fleetSubmissionId}}",
    );
    expect(fleetJourney.setup).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/control-plane-proxy/fleet-partner/supply-submissions/drivers",
          body: expect.objectContaining({
            supportedServiceProductCodes: ["business_dispatch"],
          }),
          capture: expect.objectContaining({
            fleetSubmissionId: "data.submission.submission_id",
          }),
        }),
        expect.objectContaining({
          kind: "document-upload",
          intentPath:
            "/control-plane-proxy/fleet-partner/supply-submissions/{{fleetSubmissionId}}/documents/upload-url",
          intentBody: expect.objectContaining({
            documentType: "professional_driver_license",
          }),
          confirmPath:
            "/control-plane-proxy/fleet-partner/supply-submissions/{{fleetSubmissionId}}/documents/confirm",
        }),
        expect.objectContaining({
          kind: "document-upload",
          intentPath:
            "/control-plane-proxy/fleet-partner/supply-submissions/{{fleetSubmissionId}}/documents/upload-url",
          intentBody: expect.objectContaining({
            documentType: "taxi_driver_registration",
          }),
          confirmPath:
            "/control-plane-proxy/fleet-partner/supply-submissions/{{fleetSubmissionId}}/documents/confirm",
        }),
      ]),
    );

    for (const op of fleetJourney.operations) {
      expect(op.kind).toBe("request");
      expect(op.responseKind).toBe("json");
      expect(op.resultIdPath).toBe("data.submission.submission_id");
      expect(op.readback.url).toBe(
        "/control-plane-proxy/fleet-partner/supply-submissions/{resultId}",
      );
      expect(op.readback.idPath).toBe("data.submission.submission_id");
      expect(op.readback.statePath).toBe("data.submission.status");
      expect(["submitted", "withdrawn"]).toContain(op.readback.expectedState);
    }

    const adminJourney = manifest.journeys.find(
      (j: { id: string }) => j.id === "admin-review-approve-readback",
    );
    expect(adminJourney).toBeDefined();
    expect(adminJourney.route).toBe("/supply-review/{{adminSubmissionId}}");
    expect(adminJourney.setup[0].body.supportedServiceProductCodes).toEqual([
      "business_dispatch",
    ]);
    expect(adminJourney.setup).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          baseUrlEnv: "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
          kind: "document-upload",
          intentPath:
            "/control-plane-proxy/fleet-partner/supply-submissions/{{adminSubmissionId}}/documents/upload-url",
          intentBody: expect.objectContaining({
            documentType: "professional_driver_license",
          }),
          confirmPath:
            "/control-plane-proxy/fleet-partner/supply-submissions/{{adminSubmissionId}}/documents/confirm",
        }),
        expect.objectContaining({
          baseUrlEnv: "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
          kind: "document-upload",
          intentPath:
            "/control-plane-proxy/fleet-partner/supply-submissions/{{adminSubmissionId}}/documents/upload-url",
          intentBody: expect.objectContaining({
            documentType: "taxi_driver_registration",
          }),
          confirmPath:
            "/control-plane-proxy/fleet-partner/supply-submissions/{{adminSubmissionId}}/documents/confirm",
        }),
      ]),
    );
    const approveOp = adminJourney.operations[0];
    expect(approveOp.kind).toBe("request");
    expect(approveOp.responseKind).toBe("json");
    expect(approveOp.resultIdPath).toBe("data.submission_id");
    expect(approveOp.before).toEqual([
      {
        kind: "click",
        control: "[data-drt-operation='admin-start-review']",
      },
      { kind: "click", control: "[data-drt-operation='admin-approve']" },
    ]);
    expect(approveOp.control).toBe(
      'button:has-text("確認核可"), button:has-text("Confirm approval")',
    );
    expect(approveOp.requestUrlIncludes).toBe(
      "/control-plane-proxy/admin/supply-review/submissions/{{adminSubmissionId}}/approve",
    );
    expect(approveOp.readback.url).toBe(
      "/control-plane-proxy/admin/supply-review/submissions/{resultId}",
    );
    expect(approveOp.readback.idPath).toBe("data.submission.submission_id");
    expect(approveOp.readback.statePath).toBe("data.submission.status");
    expect(approveOp.readback.expectedState).toBe("approved");

    const tenantJourney = manifest.journeys.find(
      (j: { id: string }) => j.id === "tenant-ops-dispatch-intent",
    );
    expect(tenantJourney?.route).toBe("/bookings?q={{tenantBookingId}}");
    expect(tenantJourney?.environmentVariables).toEqual({
      dispatchSessionToken: "DRTS_OPERATIONAL_DISPATCH_SESSION_TOKEN",
    });
    expect(tenantJourney?.browserSession).toEqual({
      cookieName: "drts_tenant_session",
      tokenEnv: "DRTS_OPERATIONAL_TENANT_SESSION_TOKEN",
      templateVariable: "tenantSessionToken",
    });
    expect(tenantJourney?.setup).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          baseUrlEnv: "DRTS_DEV_API_BASE_URL",
          path: "/api/tenant/bookings",
          headers: expect.objectContaining({
            authorization: "Bearer {{tenantSessionToken}}",
            "x-tenant-id": "10000000-0000-0000-0000-000000000201",
            "idempotency-key": "operational-create-{{runId}}",
          }),
          capture: { tenantBookingId: "data.booking_id" },
        }),
        expect.objectContaining({
          baseUrlEnv: "DRTS_DEV_API_BASE_URL",
          path: expect.stringContaining("dispatch-timeout"),
          headers: expect.objectContaining({
            authorization: "Bearer {{dispatchSessionToken}}",
            "x-tenant-id": "10000000-0000-0000-0000-000000000201",
            "idempotency-key": "operational-dispatch-timeout-{{runId}}",
          }),
          body: {
            timeoutReasonCode: "matching_timeout",
          },
        }),
      ]),
    );
    expect(tenantJourney?.operations).toEqual([
      expect.objectContaining({
        kind: "intent",
        control: "[data-drt-intent='tenant-open-dispatch']",
        targetBaseUrlEnv: "DRTS_DEV_OPS_CONSOLE_BASE_URL",
        expectedPathPattern: "^/dispatch/[^/?#]+$",
      }),
    ]);

    const enterpriseJourney = manifest.journeys.find(
      (j: { id: string }) => j.id === "enterprise-create-read-update-cancel",
    );
    expect(enterpriseJourney).toBeDefined();
    expect(enterpriseJourney?.browserSession).toEqual({
      cookieName: "drts_tenant_session",
      tokenEnv: "DRTS_OPERATIONAL_TENANT_SESSION_TOKEN",
      templateVariable: "tenantSessionToken",
    });

    const referralJourney = manifest.journeys.find(
      (journey: { id: string }) =>
        journey.id === "referral-create-read-cancel-receipt",
    );
    expect(referralJourney).toBeDefined();
    expect(
      referralJourney.operations.flatMap(
        (operation: { readback?: { expectedState: string } }) =>
          operation.readback ? [operation.readback.expectedState] : [],
      ),
    ).toEqual(["created", "cancelled"]);
    expect(referralJourney.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "request",
          name: "create",
          resultIdQueryParam: "orderId",
        }),
        expect.objectContaining({
          kind: "absence",
          name: "cancelled-trip-rating",
          control: "[data-drt-operation='referral-rate']",
        }),
        expect.objectContaining({
          kind: "absence",
          name: "receipt",
          control: "[data-drt-operation='referral-receipt']",
        }),
      ]),
    );

    for (const id of [
      "bank-statement-download",
      "channel-statement-download",
    ]) {
      const operation = manifest.journeys.find(
        (journey: { id: string }) => journey.id === id,
      )?.operations[0];
      expect(operation).toEqual(
        expect.objectContaining({ kind: "request", responseKind: "download" }),
      );
      expect(operation.expectedContentTypeIncludes).toBeTruthy();
    }
  });

  it("does not force statement download anchors through the native download attribute, which drops the per-origin identity-token header on a now-private Cloud Run service", () => {
    // Regression for channel-statement-download: Chromium's <a download> request
    // is issued outside the page navigation that carries
    // page.context().setExtraHTTPHeaders()'s Authorization bearer token, so the
    // now-IAM-gated channel-partner-portal-web origin rejects it and the
    // Playwright download event resolves as "canceled". The server already sets
    // Content-Disposition: attachment with a filename, so the attribute is not
    // needed; bank-console-web's working anchor (tested by
    // bank-statement-download) never carried one.
    const anchorAttributesFor = (filePath: string, marker: string) => {
      const source = readFileSync(path.join(process.cwd(), filePath), "utf8");
      const markerIndex = source.indexOf(marker);
      expect(
        markerIndex,
        `${marker} must exist in ${filePath}`,
      ).toBeGreaterThan(-1);
      const tagStart = source.lastIndexOf("<a", markerIndex);
      const tagEnd = source.indexOf(">", markerIndex);
      expect(tagStart).toBeGreaterThan(-1);
      expect(tagEnd).toBeGreaterThan(tagStart);
      return source.slice(tagStart, tagEnd);
    };

    expect(
      anchorAttributesFor(
        "apps/channel-partner-portal-web/app/statements/[period]/page.tsx",
        'data-drt-operation="channel-statement-download"',
      ),
    ).not.toMatch(/\bdownload=/);
    expect(
      anchorAttributesFor(
        "apps/channel-partner-portal-web/app/dashboard/page.tsx",
        'data-drt-operation="channel-overview-export"',
      ),
    ).not.toMatch(/\bdownload=/);
    expect(
      anchorAttributesFor(
        "apps/bank-console-web/app/statements/page.tsx",
        'data-drt-operation="bank-statement-download"',
      ),
    ).not.toMatch(/\bdownload=/);
  });
});

it("keeps both original Referral cases on real first-version and per-order fee controls", () => {
  const manifest = JSON.parse(
    readFileSync(
      path.join(
        process.cwd(),
        "tests/e2e/fixtures/operational-browser-journeys.json",
      ),
      "utf8",
    ),
  );
  const referrals = manifest.journeys.filter(
    (item: { surface: string }) => item.surface === "referral",
  );
  expect(referrals).toHaveLength(1);
  const create = referrals[0].operations.find(
    (op: { name: string }) => op.name === "create",
  );
  expect(create.before[0]).toEqual({
    kind: "referral-fees",
    control: "[data-drt-operation='referral-fee-agree']",
  });
  expect(create.before.at(-1)).toEqual({
    kind: "click",
    control: "[data-drt-operation='referral-fee-confirm']",
  });
  expect(create.requestUrlIncludes).toBe("/api/referral/booking");
  expect(create.readback.expectedState).toBe("created");
});

type FeeResponse = {
  url(): string;
  request(): { method(): string };
  ok(): boolean;
};
type FeeStep = { kind: "referral-fees"; control: string };
type FeePage = {
  request: {
    get(url: string): Promise<{
      ok(): boolean;
      json(): Promise<{
        data: {
          disclosureVersion: string;
          contentHash: string;
          acknowledgedAt: string | null;
        };
      }>;
    }>;
  };
  waitForResponse(
    match: (response: FeeResponse) => boolean,
  ): Promise<FeeResponse>;
  locator(control: string): { click(): Promise<void> };
};

function actualOperationalFeeSteps() {
  // Execute the actual runner body without registering Playwright tests or
  // starting a browser. Only its Page transport is controlled below.
  const filename = path.join(
    process.cwd(),
    "tests/e2e/operational-browser-acceptance.spec.ts",
  );
  const source = ts.createSourceFile(
    filename,
    readFileSync(filename, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const declaration = source.statements.find(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === "runSteps",
  );
  if (!declaration) throw new Error("Actual operational runSteps is missing");
  const { outputText } = ts.transpileModule(declaration.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  const instantiate = new Function(
    "expect",
    "PASSENGER_FEE_DISCLOSURE_VERSION",
    "PASSENGER_FEE_CONTENT_HASH",
    `${outputText}\nreturn runSteps;`,
  );
  const run: (
    page: FeePage,
    origin: string,
    steps: FeeStep[],
    lastResultId: null,
    variables: Record<string, string>,
  ) => Promise<void> = instantiate(
    expect,
    PASSENGER_FEE_DISCLOSURE_VERSION,
    PASSENGER_FEE_CONTENT_HASH,
  );
  return run;
}

describe("actual operational first-fee browser response URL", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    "https://referral.example.invalid",
    "https://referral.example.invalid/",
  ])(
    "matches the real browser POST and retains fee ACK readback for %s",
    async (configuredOrigin) => {
      vi.stubEnv("DRTS_DEV_REFERRAL_EMBED_BASE_URL", configuredOrigin);
      const origin = requiredOrigin("DRTS_DEV_REFERRAL_EMBED_BASE_URL");
      const browserUrl = new URL(
        "/api/referral/fees",
        configuredOrigin,
      ).toString();
      const serverTime = "2026-10-21T00:27:12.118Z";
      let acknowledgedAt: string | null = null;
      let matches: ((response: FeeResponse) => boolean) | undefined;
      let resolveResponse: ((response: FeeResponse) => void) | undefined;
      let rejectResponse: ((error: Error) => void) | undefined;
      const get = vi.fn(async (url: string) => ({
        ok: () => new URL(url).origin === new URL(browserUrl).origin,
        json: async () => ({
          data: {
            disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
            contentHash: PASSENGER_FEE_CONTENT_HASH,
            acknowledgedAt,
          },
        }),
      }));
      const waitForResponse = vi.fn(
        (match: (response: FeeResponse) => boolean) => {
          matches = match;
          return new Promise<FeeResponse>((resolve, reject) => {
            resolveResponse = resolve;
            rejectResponse = reject;
          });
        },
      );
      const click = vi.fn(async () => {
        if (!matches || !resolveResponse || !rejectResponse)
          throw new Error("Response observer must be installed before consent");
        const response = (url: string, method: string): FeeResponse => ({
          url: () => url,
          request: () => ({ method: () => method }),
          ok: () => true,
        });
        expect(matches(response(browserUrl, "GET"))).toBe(false);
        expect(matches(response(`${browserUrl}/other`, "POST"))).toBe(false);
        const post = response(browserUrl, "POST");
        acknowledgedAt = serverTime;
        if (!matches(post)) {
          rejectResponse(
            new Error(
              "Actual fee observer did not match the canonical browser POST",
            ),
          );
          return;
        }
        resolveResponse(post);
      });
      const locator = vi.fn(() => ({ click }));
      await actualOperationalFeeSteps()(
        { request: { get }, waitForResponse, locator },
        origin,
        [
          {
            kind: "referral-fees",
            control: "[data-drt-operation='referral-fee-agree']",
          },
        ],
        null,
        {},
      );
      expect(get.mock.calls.map(([url]) => url)).toEqual([
        browserUrl,
        browserUrl,
      ]);
      expect(locator).toHaveBeenCalledWith(
        "[data-drt-operation='referral-fee-agree']",
      );
      expect(click).toHaveBeenCalledOnce();
      expect(waitForResponse).toHaveBeenCalledOnce();
      expect(acknowledgedAt).toBe(serverTime);
    },
  );

  it.each([
    "https://referral.example.invalid",
    "https://referral.example.invalid/",
  ])(
    "reads an existing canonical fee ACK without resubmitting consent for %s",
    async (configuredOrigin) => {
      vi.stubEnv("DRTS_DEV_REFERRAL_EMBED_BASE_URL", configuredOrigin);
      const browserUrl = new URL(
        "/api/referral/fees",
        configuredOrigin,
      ).toString();
      const get = vi.fn(async (url: string) => ({
        ok: () => new URL(url).origin === new URL(browserUrl).origin,
        json: async () => ({
          data: {
            disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
            contentHash: PASSENGER_FEE_CONTENT_HASH,
            acknowledgedAt: "2026-10-21T00:27:12.118Z",
          },
        }),
      }));
      const waitForResponse = vi.fn<FeePage["waitForResponse"]>();
      const locator = vi.fn<FeePage["locator"]>();
      await actualOperationalFeeSteps()(
        { request: { get }, waitForResponse, locator },
        requiredOrigin("DRTS_DEV_REFERRAL_EMBED_BASE_URL"),
        [
          {
            kind: "referral-fees",
            control: "[data-drt-operation='referral-fee-agree']",
          },
        ],
        null,
        {},
      );
      expect(get.mock.calls.map(([url]) => url)).toEqual([
        browserUrl,
        browserUrl,
      ]);
      expect(waitForResponse).not.toHaveBeenCalled();
      expect(locator).not.toHaveBeenCalled();
    },
  );
});

function actualClosedPdfFailureFacts() {
  const filename = path.join(
    process.cwd(),
    "tests/e2e/owned-referral-business-journey/owned-business.spec.ts",
  );
  const source = ts.createSourceFile(
    filename,
    readFileSync(filename, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const declaration = source.statements.find(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "closedPdfFailureFacts",
  );
  if (!declaration) throw new Error("Actual PDF failure classifier is missing");
  const { outputText } = ts.transpileModule(declaration.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  const classify: (error: unknown) => {
    nativeFailureClass: string;
    nativeCauseCode: string;
  } = new Function(`${outputText}\nreturn closedPdfFailureFacts;`)();
  return classify;
}

describe("actual hosted PDF closed failure facts", () => {
  it("retains standard classes and known codes without reading message or stack", () => {
    const classify = actualClosedPdfFailureFacts();
    const sensitive = vi.fn(() => {
      throw new Error("must not inspect");
    });
    for (const name of [
      "Error",
      "ReferenceError",
      "TypeError",
      "RangeError",
      "SyntaxError",
      "TimeoutError",
      "AbortError",
    ]) {
      const error = Object.defineProperties(
        { name, cause: { code: "ERR_REQUIRE_ASYNC_MODULE" } },
        {
          message: { get: sensitive },
          stack: { get: sensitive },
        },
      );
      expect(classify(error)).toEqual({
        nativeFailureClass: name,
        nativeCauseCode: "ERR_REQUIRE_ASYNC_MODULE",
      });
    }
    expect(sensitive).not.toHaveBeenCalled();
    expect(classify({ name: "Error", code: "ENOENT" })).toEqual({
      nativeFailureClass: "Error",
      nativeCauseCode: "ENOENT",
    });
  });

  it("does not serialize unknown names, codes, messages or nested causes", () => {
    expect(
      actualClosedPdfFailureFacts()({
        name: "nonstandard private name",
        code: "nonstandard private code",
        message: "private message",
        stack: "private stack",
        cause: {
          code: "nonstandard private cause",
          message: "private cause message",
        },
      }),
    ).toEqual({ nativeFailureClass: "UNKNOWN", nativeCauseCode: "UNKNOWN" });
  });

  it("keeps throwing metadata accessors unknown without replacing the error", () => {
    const accessor = () => {
      throw new Error("private accessor failure");
    };
    const error = Object.defineProperties(
      {},
      {
        name: { get: accessor },
        code: { get: accessor },
        cause: { get: accessor },
      },
    );
    expect(actualClosedPdfFailureFacts()(error)).toEqual({
      nativeFailureClass: "UNKNOWN",
      nativeCauseCode: "UNKNOWN",
    });
  });
});

describe("C125 full document family, Case attachment, and cross-role manifest contract", () => {
  it("declares driver/vehicle supply families, contracts, PNG/JPEG photos via other, canonical Case resolution, and cross-role denial probes", () => {
    const manifestPath = path.join(
      process.cwd(),
      "tests/e2e/fixtures/operational-browser-journeys.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const acceptance = manifest.documentAcceptance;
    expect(acceptance).toBeDefined();
    expect(acceptance.id).toBe(
      "c125-document-storage-scan-readback-role-matrix",
    );
    expect(acceptance.baseUrlEnv).toBe(
      "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
    );

    const setup = acceptance.setup as Array<Record<string, any>>;
    const docUploads = setup.filter((item) => item.kind === "document-upload");
    expect(docUploads.length).toBe(15);

    for (const upload of docUploads) {
      expect(upload.reviewerBaseUrlEnv).toBe(
        "DRTS_DEV_PLATFORM_ADMIN_BASE_URL",
      );
      expect(upload.intentBody?.documentType).not.toBe("photo");
      expect(upload.confirmBody?.documentType).not.toBe("photo");
    }

    const driverUploads = docUploads.filter((item) =>
      String(item.intentPath).includes("{{c125DriverSubmissionId}}"),
    );
    expect(driverUploads.map((item) => item.intentBody.documentType)).toEqual([
      "professional_driver_license",
      "taxi_driver_registration",
      "fleet_participation_contract",
      "driver_management_contract",
      "other",
      "other",
    ]);
    expect(driverUploads.map((item) => item.intentBody.contentType)).toEqual([
      "application/pdf",
      "application/pdf",
      "application/pdf",
      "application/pdf",
      "image/png",
      "image/jpeg",
    ]);

    const vehicleUploads = docUploads.filter((item) =>
      String(item.intentPath).includes("{{c125VehicleSubmissionId}}"),
    );
    expect(vehicleUploads.map((item) => item.intentBody.documentType)).toEqual([
      "vehicle_registration",
      "insurance_policy",
      "fleet_participation_contract",
      "vehicle_management_contract",
      "other",
      "other",
    ]);
    expect(vehicleUploads.map((item) => item.intentBody.contentType)).toEqual([
      "application/pdf",
      "application/pdf",
      "application/pdf",
      "application/pdf",
      "image/png",
      "image/jpeg",
    ]);

    const caseResolution = setup.find(
      (item) => item.kind === "fleet-editable-case",
    );
    expect(caseResolution).toEqual({
      kind: "fleet-editable-case",
      expectedFleetPartnerId: "fleet-demo-001",
      periodMonths: ["2026-03", "2026-06"],
      capture: {
        c125CaseId: "caseId",
        c125CaseFleetId: "fleetPartnerId",
      },
    });
    expect(JSON.stringify(acceptance)).not.toContain("CASE-CP-20260301-001");
    expect(JSON.stringify(acceptance)).not.toContain("METRO_FLEET");

    const caseUploads = docUploads.filter((item) =>
      String(item.intentPath).includes("/cases/{{c125CaseId}}/attachments/"),
    );
    expect(caseUploads.map((item) => item.intentBody.contentType)).toEqual([
      "application/pdf",
      "image/png",
      "image/jpeg",
    ]);

    const roleProbes = setup.filter(
      (item) => item.kind === "role-access-probe",
    );
    const probedRoles = new Set(roleProbes.map((item) => item.role));
    expect(probedRoles).toEqual(
      new Set([
        "own_fleet",
        "foreign_fleet",
        "tenant_admin",
        "tenant_ops",
        "driver",
        "ops_non_reviewer",
        "unauthenticated",
        "invalid_session",
      ]),
    );
  });
});
