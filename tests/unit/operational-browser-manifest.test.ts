import { createHash } from "node:crypto";
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
  prepareOperationalReferralHandoff,
  observeOperationalReferralZeroOrders,
  OperationalReferralEvidenceError,
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
      manifest.journeys.filter(
        (j: { firstVisitConsentEvidence?: string }) =>
          j.firstVisitConsentEvidence,
      ),
    ).toEqual([referralJourney]);
    expect(referralJourney.firstVisitConsentEvidence).toBe(
      "privacy-fee-return-same-owner",
    );
    expect(referralJourney.firstVisitRefusalEvidence).toBe(
      "fallback-inactive-same-subject-zero-orders",
    );
    expect(referralJourney.setup).toEqual([
      expect.objectContaining({
        path: "/api/referral/session",
        method: "POST",
        body: {
          action: "demo-bootstrap",
          entrySlug: "yuhe-residence",
          entryHost: "{{referralEntryHost}}",
        },
      }),
    ]);
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
  status(): number;
  headers(): Record<string, string>;
  json(): Promise<unknown>;
};
type FeeStep = { kind: "referral-fees"; control: string };
type FeePage = {
  request: {
    get(url: string, options: { maxRedirects: number }): Promise<FeeResponse>;
  };
  waitForResponse(
    match: (response: FeeResponse) => boolean,
  ): Promise<FeeResponse>;
  locator(control: string): { click(): Promise<void> };
};

function actualBrowserFunction(
  name: string,
  dependencies: Record<string, unknown>,
) {
  const filename =
    process.env.DRTS_OPERATIONAL_BROWSER_UNIT_SOURCE_FILE ??
    path.join(
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
      ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  if (!declaration) throw new Error(`Actual operational ${name} is missing`);
  const { outputText } = ts.transpileModule(declaration.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  return new Function(
    ...Object.keys(dependencies),
    `${outputText}\nreturn ${name};`,
  )(...Object.values(dependencies)) as (...args: any[]) => any;
}

function actualOperationalFeeSteps() {
  // Execute the actual runner body without registering Playwright tests or
  // starting a browser. Only its Page transport is controlled below.
  const candidateSha = "a".repeat(40);
  const records: Array<Record<string, unknown>> = [];
  const revision = (headers: Record<string, string>) =>
    expect(headers["x-drts-candidate-sha"]).toBe(candidateSha);
  const referralFee = process.env.DRTS_OPERATIONAL_BROWSER_UNIT_SOURCE_FILE
    ? () => {
        throw new Error("The old runner did not have fee projection");
      }
    : actualBrowserFunction("referralFee", {
        expect,
        PASSENGER_FEE_DISCLOSURE_VERSION,
        PASSENGER_FEE_CONTENT_HASH,
      });
  const run = actualBrowserFunction("runSteps", {
    expect: (value: unknown) =>
      value && typeof value === "object" && "click" in value
        ? { toBeVisible: async () => expect(value).toHaveProperty("click") }
        : expect(value),
    referralFee,
    PASSENGER_FEE_DISCLOSURE_VERSION,
    PASSENGER_FEE_CONTENT_HASH,
    expectCandidateRevision: revision,
    record: (entry: Record<string, unknown>) => records.push(entry),
  }) as (
    page: FeePage,
    origin: string,
    steps: FeeStep[],
    lastResultId: null,
    variables: Record<string, string>,
    visit: Record<string, unknown>,
  ) => Promise<void>;
  return { run, records, candidateSha };
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
      const { run, records, candidateSha } = actualOperationalFeeSteps();
      let acknowledgedAt: string | null = null;
      let matches: ((response: FeeResponse) => boolean) | undefined;
      let resolveResponse: ((response: FeeResponse) => void) | undefined;
      const response = (
        url: string,
        method: string,
        status: number,
        time: string | null,
      ): FeeResponse => ({
        url: () => url,
        request: () => ({ method: () => method }),
        status: () => status,
        headers: () => ({ "x-drts-candidate-sha": candidateSha }),
        json: async () => ({
          ok: true,
          data: {
            disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
            contentHash: PASSENGER_FEE_CONTENT_HASH,
            acknowledgedAt: time,
            unsafeNewField: "must-not-journal",
          },
        }),
      });
      const get = vi.fn(
        async (url: string, options: { maxRedirects: number }) => {
          expect(url).toBe(browserUrl);
          expect(options.maxRedirects).toBe(0);
          return response(url, "GET", 200, acknowledgedAt);
        },
      );
      const waitForResponse = vi.fn(
        (match: (response: FeeResponse) => boolean) => {
          matches = match;
          return new Promise<FeeResponse>((resolve) => {
            resolveResponse = resolve;
          });
        },
      );
      const click = vi.fn(async () => {
        if (!matches || !resolveResponse)
          throw new Error("Response observer must be installed before consent");
        expect(matches(response(browserUrl, "GET", 200, null))).toBe(false);
        expect(
          matches(response(`${browserUrl}/other`, "POST", 200, null)),
        ).toBe(false);
        const post = response(browserUrl, "POST", 200, serverTime);
        acknowledgedAt = serverTime;
        if (!matches(post))
          throw new Error("Actual fee observer did not match canonical POST");
        resolveResponse(post);
      });
      const locator = vi.fn(() => ({ click }));
      const visit = {
        visitKey: "safe-hash",
        recoveryScope: "ram-only",
        handoffId: "ram-only",
      };
      await run(
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
        visit,
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
      expect(visit).toMatchObject({
        fee: {
          disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
          contentHash: PASSENGER_FEE_CONTENT_HASH,
          acknowledgedAt: serverTime,
        },
      });
      expect(records.map(({ kind }) => kind)).toEqual([
        "referral-first-fee-initial",
        "referral-first-fee-post",
        "referral-first-fee-readback",
      ]);
      expect(JSON.stringify(records)).not.toMatch(
        /ram-only|unsafeNewField|cookie|token/i,
      );
    },
  );

  it.each([
    {
      label: "non-2xx POST",
      postStatus: 403,
      postSha: "a".repeat(40),
      postTime: "2026-10-26T00:00:00Z",
      readTime: "2026-10-26T00:00:00Z",
    },
    {
      label: "redirect POST",
      postStatus: 307,
      postSha: "a".repeat(40),
      postTime: "2026-10-26T00:00:00Z",
      readTime: "2026-10-26T00:00:00Z",
    },
    {
      label: "wrong POST SHA",
      postStatus: 200,
      postSha: "b".repeat(40),
      postTime: "2026-10-26T00:00:00Z",
      readTime: "2026-10-26T00:00:00Z",
    },
    {
      label: "bad POST time",
      postStatus: 200,
      postSha: "a".repeat(40),
      postTime: "invalid",
      readTime: "invalid",
    },
    {
      label: "readback time mismatch",
      postStatus: 200,
      postSha: "a".repeat(40),
      postTime: "2026-10-26T00:00:00Z",
      readTime: "2026-10-26T00:00:01Z",
    },
  ])(
    "rejects $label in the actual first fee UI chain",
    async ({ postStatus, postSha, postTime, readTime }) => {
      const { run, candidateSha, records } = actualOperationalFeeSteps();
      const url = "https://referral.example.invalid/api/referral/fees";
      let respond: ((response: FeeResponse) => void) | undefined;
      const packet = (
        method: string,
        status: number,
        sha: string,
        time: string | null,
      ): FeeResponse => ({
        url: () => url,
        request: () => ({ method: () => method }),
        status: () => status,
        headers: () => ({ "x-drts-candidate-sha": sha }),
        json: async () => ({
          ok: true,
          data: {
            disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
            contentHash: PASSENGER_FEE_CONTENT_HASH,
            acknowledgedAt: time,
          },
        }),
      });
      let reads = 0;
      const get = vi.fn(async () =>
        packet("GET", 200, candidateSha, reads++ === 0 ? null : readTime),
      );
      const page: FeePage = {
        request: { get },
        waitForResponse: () =>
          new Promise((resolve) => {
            respond = resolve;
          }),
        locator: () => ({
          click: async () => {
            if (!respond) throw new Error("POST observer missing");
            respond(packet("POST", postStatus, postSha, postTime));
          },
        }),
      };
      const visit = {
        visitKey: "safe-hash",
        recoveryScope: "RAM",
        handoffId: "RAM",
      };
      await expect(
        run(
          page,
          "https://referral.example.invalid",
          [{ kind: "referral-fees", control: "agree" }],
          null,
          {},
          visit,
        ),
      ).rejects.toThrow();
      expect(
        records.some(({ kind }) => kind === "referral-first-fee-readback"),
      ).toBe(false);
      expect(visit).not.toHaveProperty("fee");
    },
  );

  it.each([
    "https://referral.example.invalid",
    "https://referral.example.invalid/",
  ])(
    "rejects an existing ACK as returning-only, never labels it first for %s",
    async (configuredOrigin) => {
      vi.stubEnv("DRTS_DEV_REFERRAL_EMBED_BASE_URL", configuredOrigin);
      const browserUrl = new URL(
        "/api/referral/fees",
        configuredOrigin,
      ).toString();
      const { run, candidateSha, records } = actualOperationalFeeSteps();
      const get = vi.fn(
        async (url: string, options: { maxRedirects: number }) => ({
          url: () => {
            expect(options.maxRedirects).toBe(0);
            return url;
          },
          request: () => ({ method: () => "GET" }),
          status: () => 200,
          ok: () => true,
          headers: () => ({ "x-drts-candidate-sha": candidateSha }),
          json: async () => ({
            ok: true,
            data: {
              disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
              contentHash: PASSENGER_FEE_CONTENT_HASH,
              acknowledgedAt: "2026-10-21T00:27:12.118Z",
            },
          }),
        }),
      );
      const waitForResponse = vi.fn<FeePage["waitForResponse"]>();
      const locator = vi.fn<FeePage["locator"]>();
      await expect(
        run(
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
          { visitKey: "safe" },
        ),
      ).rejects.toThrow();
      expect(get.mock.calls).toHaveLength(1);
      expect(get.mock.calls[0]?.[0]).toBe(browserUrl);
      expect(waitForResponse).not.toHaveBeenCalled();
      expect(locator).not.toHaveBeenCalled();
      expect(records).toEqual([]);
    },
  );

  it.each([
    {
      label: "non-2xx",
      status: 403,
      sha: "a".repeat(40),
      body: {
        ok: true,
        data: {
          disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
          contentHash: PASSENGER_FEE_CONTENT_HASH,
          acknowledgedAt: null,
        },
      },
    },
    {
      label: "redirect",
      status: 307,
      sha: "a".repeat(40),
      body: {
        ok: true,
        data: {
          disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
          contentHash: PASSENGER_FEE_CONTENT_HASH,
          acknowledgedAt: null,
        },
      },
    },
    {
      label: "wrong SHA",
      status: 200,
      sha: "b".repeat(40),
      body: {
        ok: true,
        data: {
          disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
          contentHash: PASSENGER_FEE_CONTENT_HASH,
          acknowledgedAt: null,
        },
      },
    },
    { label: "invalid body", status: 200, sha: "a".repeat(40), body: null },
    {
      label: "wrong version",
      status: 200,
      sha: "a".repeat(40),
      body: {
        ok: true,
        data: {
          disclosureVersion: "outdated",
          contentHash: PASSENGER_FEE_CONTENT_HASH,
          acknowledgedAt: null,
        },
      },
    },
    {
      label: "wrong hash",
      status: 200,
      sha: "a".repeat(40),
      body: {
        ok: true,
        data: {
          disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
          contentHash: "0".repeat(64),
          acknowledgedAt: null,
        },
      },
    },
    {
      label: "wrong time",
      status: 200,
      sha: "a".repeat(40),
      body: {
        ok: true,
        data: {
          disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
          contentHash: PASSENGER_FEE_CONTENT_HASH,
          acknowledgedAt: "invalid",
        },
      },
    },
  ])("fails closed on fee initial $label", async ({ status, sha, body }) => {
    const { run, records } = actualOperationalFeeSteps();
    const get = vi.fn(
      async (url: string, options: { maxRedirects: number }) => ({
        url: () => {
          expect(options.maxRedirects).toBe(0);
          return url;
        },
        request: () => ({ method: () => "GET" }),
        status: () => status,
        headers: () => ({ "x-drts-candidate-sha": sha }),
        json: async () => body,
      }),
    );
    const waitForResponse = vi.fn<FeePage["waitForResponse"]>();
    await expect(
      run(
        { request: { get }, waitForResponse, locator: vi.fn() },
        "https://referral.example.invalid",
        [{ kind: "referral-fees", control: "agree" }],
        null,
        {},
        { visitKey: "safe" },
      ),
    ).rejects.toThrow();
    expect(waitForResponse).not.toHaveBeenCalled();
    expect(records).toEqual([]);
  });
});

it("rejects wrong owner, inactive returning session and unverified readback using actual projection", () => {
  const project = actualBrowserFunction("referralSession", { expect });
  const visit = {
    visitKey: "safe",
    handoffId: "ref_handoff_ram",
    recoveryScope: "owner-bound",
    entryHost: "host.example.invalid",
  };
  const body = {
    ok: true,
    session: {
      handoffId: visit.handoffId,
      recoveryScope: visit.recoveryScope,
      partnerEntrySlug: "yuhe-residence",
      entryHost: visit.entryHost,
      identityActive: true,
      consent: { grantedAt: "2026-10-26T01:02:03Z", bundleVersion: "v1" },
    },
    data: {
      active: true,
      session: { recoveryScope: visit.recoveryScope },
      identity: {
        recovery_scope: visit.recoveryScope,
        handoff_id: visit.handoffId,
        partner_entry_slug: "yuhe-residence",
        entry_host: visit.entryHost,
        identity_active: true,
      },
    },
  };
  expect(project(body, visit, true)).toMatchObject({
    identityActive: true,
    privacyGranted: true,
  });
  const initial = {
    ok: true,
    session: {
      ...body.session,
      identityActive: false,
      consent: { grantedAt: null, bundleVersion: null },
    },
  };
  expect(project(initial, visit, false)).toMatchObject({
    identityActive: false,
    privacyGranted: false,
  });
  expect(() => project(body, visit, false)).toThrow();
  expect(() =>
    project(
      { ...body, session: { ...body.session, entryHost: "wrong-host" } },
      visit,
      true,
    ),
  ).toThrow();
  expect(() =>
    project(
      { ...body, session: { ...body.session, recoveryScope: "other" } },
      visit,
      true,
    ),
  ).toThrow();
  expect(() =>
    project(
      {
        ...body,
        data: {
          ...body.data,
          identity: { ...body.data.identity, recovery_scope: "other" },
        },
      },
      visit,
      true,
    ),
  ).toThrow();
  expect(() =>
    project(
      { ...body, session: { ...body.session, identityActive: false } },
      visit,
      true,
    ),
  ).toThrow();
  expect(() =>
    project(
      {
        ...body,
        session: {
          ...body.session,
          consent: { ...body.session.consent, grantedAt: null },
        },
      },
      visit,
      true,
    ),
  ).toThrow();
});

describe("actual native privacy form and canonical session readback", () => {
  const origin = "https://referral.example.invalid";
  const visit = {
    visitKey: "safe-hash",
    recoveryScope: "RAM-scope",
    handoffId: "ref_handoff_RAM",
    entryHost: "host.example.invalid",
  };
  async function probe(
    change: {
      status?: number;
      sha?: string;
      readStatus?: number;
      owner?: string;
      active?: boolean;
      body?: unknown;
    } = {},
  ) {
    const records: Array<Record<string, unknown>> = [];
    const revision = (headers: Record<string, string>) =>
      expect(headers["x-drts-candidate-sha"]).toBe("a".repeat(40));
    const run = actualBrowserFunction("observeReferralPrivacyConsent", {
      expect,
      expectCandidateRevision: revision,
      referralSession: actualBrowserFunction("referralSession", { expect }),
      record: (entry: Record<string, unknown>) => records.push(entry),
    });
    const url = origin + "/api/referral/session";
    const read = vi.fn(
      async (path: string, options: { maxRedirects: number }) => {
        expect(path).toBe(url);
        expect(options.maxRedirects).toBe(0);
        return {
          status: () => change.readStatus ?? 200,
          headers: () => ({
            "x-drts-candidate-sha": change.sha ?? "a".repeat(40),
          }),
          json: async () =>
            change.body ?? {
              ok: true,
              session: {
                recoveryScope: change.owner ?? visit.recoveryScope,
                handoffId: visit.handoffId,
                entryHost: visit.entryHost,
                partnerEntrySlug: "yuhe-residence",
                identityActive: change.active ?? true,
                consent: {
                  grantedAt: "2026-10-26T01:02:03Z",
                  bundleVersion: "v1",
                },
              },
              data: {
                active: true,
                session: { recoveryScope: visit.recoveryScope },
                identity: {
                  recovery_scope: visit.recoveryScope,
                  handoff_id: visit.handoffId,
                  entry_host: visit.entryHost,
                  partner_entry_slug: "yuhe-residence",
                  identity_active: true,
                },
              },
            },
        };
      },
    );
    let observed: ((response: FeeResponse) => boolean) | undefined;
    let resolvePost: ((response: FeeResponse) => void) | undefined;
    const page = {
      request: { get: read },
      waitForResponse: (predicate: typeof observed) => {
        observed = predicate;
        return new Promise((resolve) => {
          resolvePost = resolve;
        });
      },
    };
    const control = {
      click: vi.fn(async () => {
        if (!observed || !resolvePost)
          throw new Error("form POST observer not installed");
        const response: FeeResponse = {
          url: () => url,
          request: () => ({ method: () => "POST" }),
          status: () => change.status ?? 307,
          headers: () => ({
            "x-drts-candidate-sha": change.sha ?? "a".repeat(40),
          }),
          json: async () => {
            throw new Error("native redirect is not JSON");
          },
        };
        expect(
          observed({ ...response, request: () => ({ method: () => "GET" }) }),
        ).toBe(false);
        expect(observed(response)).toBe(true);
        resolvePost(response);
      }),
    };
    return {
      result: run(
        page,
        origin,
        visit,
        control,
        Promise.resolve(),
      ) as Promise<void>,
      records,
      read,
      control,
    };
  }
  it("preserves only redirect status then authenticated owner-bound active readback", async () => {
    const { result, records, read, control } = await probe();
    await result;
    expect(control.click).toHaveBeenCalledWith({ noWaitAfter: true });
    expect(read).toHaveBeenCalledOnce();
    expect(records.map(({ kind }) => kind)).toEqual([
      "referral-first-privacy-post",
      "referral-first-privacy-readback",
    ]);
    expect(JSON.stringify(records)).not.toMatch(
      /RAM-|ref_handoff|cookie|token|body/i,
    );
  });
  it.each([
    { label: "non-redirect POST", status: 200 },
    { label: "POST failure", status: 403 },
    { label: "wrong SHA", sha: "b".repeat(40) },
    { label: "GET redirect", readStatus: 307 },
    { label: "wrong owner", owner: "other" },
    { label: "inactive readback", active: false },
    { label: "invalid GET body", body: { ok: true } },
  ])("rejects $label without recording privacy readback", async (change) => {
    const { result, records } = await probe(change);
    await expect(result).rejects.toThrow();
    expect(
      records.some(({ kind }) => kind === "referral-first-privacy-readback"),
    ).toBe(false);
  });
});

describe("actual same-owner referral return after first consent", () => {
  const origin = "https://referral.example.invalid";
  const now = "2026-10-26T01:02:03Z";
  const fee = {
    disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
    contentHash: PASSENGER_FEE_CONTENT_HASH,
    acknowledgedAt: now,
  };
  const visit = {
    visitKey: "safe-hash",
    recoveryScope: "RAM-only",
    handoffId: "ref_handoff_RAM-only",
    entryHost: "host.example.invalid",
    fee,
  };

  async function probe(
    change: {
      owner?: string;
      sha?: string;
      fee?: Partial<typeof fee>;
      sessionStatus?: number;
      feeStatus?: number;
      routeStatus?: number;
      returnPost?: string;
      inactive?: boolean;
    } = {},
  ) {
    const records: Array<Record<string, unknown>> = [];
    const revision = (headers: Record<string, string>) =>
      expect(headers["x-drts-candidate-sha"]).toBe("a".repeat(40));
    const run = actualBrowserFunction("observeReferralReturn", {
      expect,
      expectCandidateRevision: revision,
      referralSession: actualBrowserFunction("referralSession", { expect }),
      referralFee: actualBrowserFunction("referralFee", {
        expect,
        PASSENGER_FEE_DISCLOSURE_VERSION,
        PASSENGER_FEE_CONTENT_HASH,
      }),
      record: (entry: Record<string, unknown>) => records.push(entry),
      navigate: async (_page: unknown, _origin: string, route: string) => {
        expect(route).toContain("state=handoff");
        if (change.returnPost)
          handler?.({
            url: () => origin + change.returnPost,
            method: () => "POST",
          });
        return {
          status: () => change.routeStatus ?? 200,
          headers: () => ({
            "x-drts-candidate-sha": change.sha ?? "a".repeat(40),
          }),
        };
      },
    });
    let handler:
      | ((request: { url(): string; method(): string }) => void)
      | undefined;
    const off = vi.fn(() => {
      handler = undefined;
    });
    const get = vi.fn(
      async (url: string, options: { maxRedirects: number }) => {
        expect(options.maxRedirects).toBe(0);
        const session = url.endsWith("/session");
        return {
          status: () =>
            session ? (change.sessionStatus ?? 200) : (change.feeStatus ?? 200),
          headers: () => ({
            "x-drts-candidate-sha": change.sha ?? "a".repeat(40),
          }),
          json: async () =>
            session
              ? {
                  ok: true,
                  session: {
                    handoffId: visit.handoffId,
                    recoveryScope: change.owner ?? visit.recoveryScope,
                    partnerEntrySlug: "yuhe-residence",
                    entryHost: visit.entryHost,
                    identityActive: !change.inactive,
                    consent: { grantedAt: now, bundleVersion: "v1" },
                  },
                  data: {
                    active: true,
                    session: { recoveryScope: visit.recoveryScope },
                    identity: {
                      recovery_scope: visit.recoveryScope,
                      handoff_id: visit.handoffId,
                      partner_entry_slug: "yuhe-residence",
                      entry_host: visit.entryHost,
                      identity_active: true,
                    },
                  },
                }
              : { ok: true, data: { ...fee, ...change.fee } },
        };
      },
    );
    const page = {
      request: { get },
      on: vi.fn((_event: string, fn: typeof handler) => {
        handler = fn;
      }),
      off,
    };
    return {
      result: run(page, origin, visit) as Promise<void>,
      records,
      get,
      off,
    };
  }

  it("records exact returning GET only, without credentials", async () => {
    const { result, records, get, off } = await probe();
    await result;
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      origin + "/api/referral/session",
      origin + "/api/referral/fees",
    ]);
    expect(off).toHaveBeenCalledOnce();
    expect(records).toEqual([
      expect.objectContaining({
        kind: "referral-same-owner-return",
        visitKey: visit.visitKey,
        sessionStatus: 200,
        feeStatus: 200,
        ...fee,
      }),
    ]);
    expect(JSON.stringify(records)).not.toMatch(
      /RAM-only|ref_handoff|cookie|token/i,
    );
  });
  it.each([
    { label: "wrong owner", owner: "another" },
    { label: "missing active session", inactive: true },
    { label: "bad SHA", sha: "b".repeat(40) },
    { label: "route redirect", routeStatus: 307 },
    { label: "session redirect", sessionStatus: 307 },
    { label: "fee forbidden", feeStatus: 403 },
    { label: "version drift", fee: { disclosureVersion: "other" } },
    { label: "hash drift", fee: { contentHash: "0".repeat(64) } },
    { label: "time drift", fee: { acknowledgedAt: "2026-10-26T01:02:04Z" } },
    { label: "new fee POST", returnPost: "/api/referral/fees" },
    { label: "new bootstrap POST", returnPost: "/api/referral/session" },
  ])("refuses $label without a successful return record", async (change) => {
    const { result, records, off } = await probe(change);
    await expect(result).rejects.toThrow();
    expect(records).toEqual([]);
    expect(off).toHaveBeenCalledOnce();
  });
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
    expect(setup.length).toBe(69);
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
    expect(roleProbes.length).toBe(37);
    const ownFleetUploadUrlProbes = roleProbes.filter(
      (item) =>
        item.role === "own_fleet" &&
        String(item.path).endsWith("/documents/upload-url"),
    );
    expect(ownFleetUploadUrlProbes.length).toBe(2);
    for (const probe of ownFleetUploadUrlProbes) {
      expect(probe.expectedStatus).toEqual([400, 422]);
      expect(String(probe.body?.originalFileName ?? "").trim()).toBe("");
    }
    const probedRoles = new Set(roleProbes.map((item) => item.role));
    expect(probedRoles).toEqual(
      new Set([
        "own_fleet",
        "foreign_fleet",
        "tenant_admin",
        "tenant_ops",
        "driver",
        "ops_non_reviewer",
        "system",
        "unauthenticated",
        "invalid_session",
      ]),
    );
    const adminReviewerProbes = roleProbes.filter((item) =>
      String(item.path).startsWith(
        "/control-plane-proxy/admin/fleet-partners/",
      ),
    );
    expect(adminReviewerProbes.length).toBeGreaterThanOrEqual(14);
    expect(
      adminReviewerProbes.every(
        (item) => item.baseUrlEnv === "DRTS_DEV_PLATFORM_ADMIN_BASE_URL",
      ),
    ).toBe(true);
  });
});

// Execute the actual first-visit runner functions and actual API helpers. Only
// external Page/HTTP ports are controlled, with the canonical wire contracts.
describe("actual original first-visit refusal chain", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const origin = "https://referral.example.invalid";
  const host = "host.example.invalid";
  const api = "https://api.example.invalid";
  const sha = "a".repeat(40);
  const handoffId = "ref_handoff_00000000-0000-4000-8000-000000000001";
  const scope = "c".repeat(64);
  async function probe(change: Record<string, any> = {}) {
    vi.stubEnv("DRTS_CANDIDATE_SHA", sha);
    vi.stubEnv("DRTS_DEV_API_BASE_URL", api);
    vi.stubEnv("DRTS_OPERATIONAL_API_ID_TOKEN", "private-WIF");
    vi.stubEnv(
      "DRTS_OPERATIONAL_OPS_NON_REVIEWER_SESSION_TOKEN",
      "private-Ops",
    );
    const records: Array<Record<string, unknown>> = [];
    const sequence: string[] = [];
    let sessionEstablished = false;
    let requests:
      | ((r: { url(): string; method(): string }) => void)
      | undefined;
    let orderReads = 0;
    vi.stubGlobal(
      "fetch",
      async (input: string | URL, options: RequestInit) => {
        const url = new URL(input);
        expect(url.origin).toBe(api);
        const reply = (data: unknown, status = 200) =>
          new Response(JSON.stringify({ data }), {
            status,
            headers: { "x-drts-candidate-sha": sha },
          });
        if (url.pathname.endsWith("/entries/yuhe-residence"))
          return reply({
            entry_slug: "yuhe-residence",
            entry_host: host,
            tenant_id: "private-tenant",
            partner_id: "private-partner",
            program_id: "private-program",
          });
        if (url.pathname.endsWith("referral-embed-handoff")) {
          sequence.push("issue");
          expect(JSON.parse(String(options.body)).consentBundle).toBeNull();
          return reply(
            {
              handoff_id: handoffId,
              artifact: "x".repeat(32),
              token_type: "SingleUse",
              expires_in: "120s",
              expires_at: "2099-01-01T00:00:00Z",
              partner_entry_slug: "yuhe-residence",
              entry_host: host,
              drts_passenger_id: "private-passenger",
              consent_required: true,
              consent_bundle_version: null,
            },
            change.issueStatus ?? 201,
          );
        }
        if (url.pathname === "/api/auth/session") {
          sequence.push("ops-session");
          return reply({
            active: true,
            identity: {
              realm: "ops",
              actor_type: "ops_user",
              roles: ["ops_user"],
              scopes: ["owned:read"],
            },
          });
        }
        if (url.pathname === "/api/orders") {
          sequence.push("orders");
          orderReads++;
          return reply({
            items:
              change.afterOrder && orderReads === 2
                ? [
                    {
                      order_id: "private-order",
                      passenger: { passenger_id: "private-passenger" },
                      tenant_id: "private-tenant",
                      partner_id: "private-partner",
                      partner_program_id: "private-program",
                      partner_entry_slug: "yuhe-residence",
                    },
                  ]
                : [],
          });
        }
        throw new Error("unexpected external request");
      },
    );
    const body = (fields: Record<string, unknown> = {}) => ({
      ok: true,
      nextPath:
        "/embed/yuhe-residence?state=consent&entryHost=" +
        encodeURIComponent(host),
      session: {
        handoffId,
        recoveryScope: scope,
        partnerEntrySlug: "yuhe-residence",
        entryHost: host,
        identityActive: false,
        consent: { grantedAt: null, bundleVersion: null },
        ...fields,
      },
    });
    const response = (payload: unknown, status = 200, revision = sha) => ({
      status: () => status,
      headers: () => ({ "x-drts-candidate-sha": revision }),
      json: async () => payload,
    });
    const post = vi.fn(async (url: string, options: any) => {
      expect(url).toBe(origin + "/api/referral/session");
      expect(options.maxRedirects).toBe(0);
      expect(options.data.entrySlug).toBe("yuhe-residence");
      expect(options.data.entryHost).toBe(host);
      if (options.data.action === "exchange") {
        expect(sessionEstablished).toBe(false);
        expect(options.data.artifact).toBe("x".repeat(32));
        sequence.push("exchange");
        sessionEstablished = true;
        return response(
          body(change.exchangeFields),
          change.exchangeStatus,
          change.exchangeSha,
        );
      }
      expect(options.data).toEqual({
        action: "demo-bootstrap",
        entrySlug: "yuhe-residence",
        entryHost: host,
      });
      expect(sessionEstablished).toBe(true);
      expect(page.context()).toBe(context);
      sequence.push("same-context-readback");
      if (change.readPost)
        requests?.({
          url: () => origin + change.readPost,
          method: () => "POST",
        });
      return response(
        change.readBody ?? body(change.readFields),
        change.readStatus,
        change.readSha,
      );
    });
    const activeGet = vi.fn(async (url: string, options: any) => {
      expect(sessionEstablished).toBe(true);
      if (new URL(url).pathname === "/embed/yuhe-residence") {
        sequence.push("fallback-read");
        return response({}, change.fallbackStatus, change.fallbackSha);
      }
      expect(url).toBe(origin + "/api/referral/active");
      expect(options.maxRedirects).toBe(0);
      sequence.push("active-rejection");
      return response(
        {
          ok: false,
          error: { code: change.activeCode ?? "REFERRAL_SESSION_REQUIRED" },
        },
        change.activeStatus ?? 401,
        change.activeSha,
      );
    });
    const visible = { isControl: true };
    const control = {
      ...visible,
      click: vi.fn(async () => {
        expect(requests).toBeDefined();
        expect(sequence.slice(-2)).toEqual(["ops-session", "orders"]);
        sequence.push("click-refuse");
        if (change.clickPost)
          requests?.({
            url: () => origin + change.clickPost,
            method: () => "POST",
          });
      }),
    };
    const fallbackUrl = new URL(
      `/embed/yuhe-residence?state=${change.fallbackState ?? "fallback"}&entryHost=${host}`,
      origin,
    );
    const off = vi.fn(() => {
      requests = undefined;
    });
    const context: any = { request: { post } };
    const page = {
      context: () => context,
      url: () => fallbackUrl.toString(),
      request: { get: activeGet },
      on: (event: string, observer: typeof requests) => {
        expect(event).toBe("request");
        requests = observer;
      },
      off,
      getByRole: (role: string, options: any) => {
        expect(role).toBe("link");
        expect(options).toEqual({ name: "暫不使用", exact: true });
        return control;
      },
      locator: () => visible,
      waitForURL: async (matches: (url: URL) => boolean) => {
        expect(matches(fallbackUrl)).toBe(true);
      },
    };
    const browserExpect = (value: any, message?: string) =>
      value?.isControl
        ? { toBeVisible: async () => {} }
        : expect(value, message);
    const deps = {
      expect: browserExpect,
      createHash,
      interactionTimeoutMs: 10,
      prepareOperationalReferralHandoff,
      observeOperationalReferralZeroOrders,
      OperationalReferralEvidenceError,
      referralSession: actualBrowserFunction("referralSession", { expect }),
      record: (entry: Record<string, unknown>) => records.push(entry),
      expectCandidateRevision: (headers: Record<string, string>) =>
        expect(headers["x-drts-candidate-sha"]).toBe(sha),
      navigate: async (_page: unknown, _origin: string, route: string) => {
        expect(route).toContain("state=consent");
        sequence.push("return-consent");
        if (change.returnPost)
          requests?.({
            url: () => origin + change.returnPost,
            method: () => "POST",
          });
        return response({}, change.returnStatus, change.returnSha);
      },
    };
    const prepare = actualBrowserFunction("prepareFirstReferralVisit", deps);
    const refuse = actualBrowserFunction("observeReferralRefusal", deps);
    const result = (async () => {
      const visit = await prepare(page, origin, host);
      await refuse(page, origin, visit);
    })();
    return { result, records, sequence, post, activeGet, control, off };
  }
  it("executes one issuer/exchange, visible refusal, same-session inactive readback, before0/after0 then preserves consent continuation", async () => {
    const { result, records, sequence, post, off } = await probe();
    await result;
    expect(sequence).toEqual([
      "issue",
      "exchange",
      "ops-session",
      "orders",
      "click-refuse",
      "fallback-read",
      "active-rejection",
      "same-context-readback",
      "ops-session",
      "orders",
      "return-consent",
    ]);
    expect(post).toHaveBeenCalledTimes(2);
    expect(off).toHaveBeenCalledOnce();
    expect(
      records
        .filter((r) => r.kind === "referral-first-refusal-zero-orders")
        .map((r) => [r.phase, r.count]),
    ).toEqual([
      ["before-refusal", 0],
      ["after-refusal", 0],
    ]);
    expect(records.at(-1)).toMatchObject({
      state: "fallback",
      grantConsentPosts: 0,
      bookingPosts: 0,
      activeStatus: 401,
    });
    expect(new Set(records.map((r) => r.visitKey)).size).toBe(1);
    expect(JSON.stringify(records)).not.toMatch(
      /private-|ref_handoff_|xxxx|cccc|cookie|artifact/i,
    );
  });
  it("keeps route-scope 403 actionable without recording a refusal pass or leaking issuer payload", async () => {
    const { result, records } = await probe({ issueStatus: 403 });
    await expect(result).rejects.toThrow(
      /^Referral evidence POST \/api\/partner\/ingress\/referral-embed-handoff failed: HTTP 403$/,
    );
    expect(records).toEqual([]);
  });
  it.each([
    { label: "exchange non-200", exchangeStatus: 403 },
    { label: "exchange wrong SHA", exchangeSha: "b".repeat(40) },
    { label: "exchange wrong handoff", exchangeFields: { handoffId: "other" } },
    { label: "fallback mismatch", fallbackState: "consent" },
    { label: "fallback non-200", fallbackStatus: 503 },
    { label: "fallback wrong SHA", fallbackSha: "b".repeat(40) },
    { label: "grant consent on click", clickPost: "/api/referral/session" },
    { label: "booking during readback", readPost: "/api/referral/booking" },
    { label: "grant consent on return", returnPost: "/api/referral/session" },
    { label: "read non-200", readStatus: 401 },
    { label: "read wrong SHA", readSha: "b".repeat(40) },
    { label: "missing readback", readBody: { ok: true } },
    { label: "changed subject scope", readFields: { recoveryScope: "other" } },
    {
      label: "missing subject scope",
      readFields: { recoveryScope: undefined },
    },
    { label: "changed handoff", readFields: { handoffId: "other" } },
    { label: "changed entry", readFields: { partnerEntrySlug: "other" } },
    { label: "changed host", readFields: { entryHost: "other" } },
    { label: "active identity", readFields: { identityActive: true } },
    {
      label: "consent already granted",
      readFields: { consent: { grantedAt: "2026-10-27T01:00:00Z" } },
    },
    {
      label: "inactive bundle",
      readFields: {
        consent: { grantedAt: null, bundleVersion: "private-value" },
      },
    },
    { label: "after nonzero", afterOrder: true },
    { label: "active access accepted", activeStatus: 200 },
    { label: "wrong active rejection", activeCode: "UPSTREAM_UNAVAILABLE" },
    { label: "active wrong SHA", activeSha: "b".repeat(40) },
    { label: "return non-200", returnStatus: 503 },
    { label: "return wrong SHA", returnSha: "b".repeat(40) },
  ])("rejects $label without publishing successful refusal", async (change) => {
    const { result, records } = await probe(change);
    await expect(result).rejects.toThrow();
    expect(records.some((r) => r.kind === "referral-first-refusal")).toBe(
      false,
    );
  });
});
