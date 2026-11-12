import { createHash, randomUUID } from "node:crypto";
import {
  expect,
  test,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";

import { startAgencySmtpInbox } from "./smtp-inbox";
import { seedAgencyPlatformPersonnel } from "./platform-personnel-fixture";

// Only Google authorization and external SMTP delivery are simulated.
// The hosted job first completes its existing real Passenger journeys, then
// reuses that database: no extra trip seed, DB reset or internal API mock here.
const BASE = process.env.AGENCY_BUSINESS_BASE_URL ?? "http://localhost:3212";
const API = `http://127.0.0.1:${process.env.AGENCY_BUSINESS_API_PORT ?? "3141"}`;
const EMAIL = "admin@acme.example";
type WireRow = Record<string, unknown>;
type WirePage = { items: WireRow[]; total?: number };
type JsonResponse = {
  ok(): boolean;
  status(): number;
  json(): Promise<unknown>;
};

let inbox: Awaited<ReturnType<typeof startAgencySmtpInbox>> | undefined;
let agencyId: string;
let invitationUrl: string;

async function data<T>(response: JsonResponse, operation: string): Promise<T> {
  const envelope = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { code?: unknown };
  } | null;
  const errorCode = envelope?.error?.code;
  const diagnosticCode =
    typeof errorCode === "string" && /^[A-Z0-9_]{1,96}$/.test(errorCode)
      ? errorCode
      : "NO_ERROR_CODE";
  expect(
    response.ok(),
    `${operation}: HTTP ${response.status()}, code ${diagnosticCode}`,
  ).toBe(true);
  expect(envelope?.error, operation).toBeUndefined();
  expect(envelope?.data, operation).toBeDefined();
  return envelope?.data as T;
}

async function read(page: Page, path: string): Promise<WirePage> {
  const result = await data<WirePage>(
    await page.request.get(`${BASE}/api/agency/${path}`),
    path,
  );
  expect(Array.isArray(result.items), `${path}: real API items`).toBe(true);
  return result;
}

async function visit(page: Page, path: string, title: string) {
  await page.getByRole("navigation").locator(`a[href="${path}"]`).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
}

/** Read the downloaded RFC4180 cells, including quotes and embedded newlines. */
function csvRows(text: string): string[][] {
  if (!text) return [];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\r" || char === "\n") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  expect(quoted, "downloaded CSV has balanced quoted fields").toBe(false);
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

test.beforeAll(async ({ playwright }) => {
  inbox = await startAgencySmtpInbox();
  const personnel = await seedAgencyPlatformPersonnel();
  const admin = await playwright.request.newContext({ baseURL: API });
  try {
    const issued = await admin.post("/api/auth/token", {
      headers: {
        "x-actor-type": "platform_admin",
        "x-actor-id": personnel.actorId,
        "x-realm": "platform",
      },
    });
    const issuedBody = (await issued.json().catch(() => null)) as {
      token?: unknown;
      error?: { code?: unknown };
    } | null;
    const errorCode = issuedBody?.error?.code;
    const diagnosticCode =
      typeof errorCode === "string" && /^[A-Z0-9_]{1,96}$/.test(errorCode)
        ? errorCode
        : "NO_ERROR_CODE";
    expect(
      issued.ok(),
      `normal platform test-session issuance: HTTP ${issued.status()}, code ${diagnosticCode}`,
    ).toBe(true);
    expect(typeof issuedBody?.token).toBe("string");
    const token = String(issuedBody?.token ?? "");
    expect(token.length).toBeGreaterThan(0);
    const headers = { Authorization: `Bearer ${token}` };
    const platformSession = await data<{
      active: boolean;
      identity: {
        actor_id: string;
        principal_id: string;
        membership_id: string;
        realm: string;
      };
    }>(
      await admin.get("/api/auth/session", { headers }),
      "verify the API-issued platform fixture session",
    );
    expect(platformSession).toMatchObject({
      active: true,
      identity: {
        actor_id: personnel.actorId,
        principal_id: personnel.actorId,
        membership_id: personnel.membershipId,
        realm: "platform",
      },
    });
    const displayName = `Hosted synthetic transport review agency ${randomUUID()}`;
    const agency = await data<{ agency_id: string }>(
      await admin.post("/api/platform-admin/agencies", {
        headers,
        data: {
          agencyCode: `agency-business-${randomUUID()}`,
          displayName,
        },
      }),
      "create agency through existing platform API",
    );
    agencyId = agency.agency_id;
    expect(typeof agencyId).toBe("string");
    const invitationPath = `/api/platform-admin/agencies/${agencyId}/invitations`;
    // Use the existing session/action-bound proof endpoint, as the ordinary
    // platform invitation flow does. The suite's configured dev waiver and
    // all product authentication/step-up rules stay unchanged.
    const proof = await data<{
      required: boolean;
      action_id: string;
      step_up_reference: string;
    }>(
      await admin.post("/api/identity/step-up-proofs", {
        headers,
        data: { method: "POST", path: invitationPath },
      }),
      "request the existing platform invitation proof",
    );
    expect(proof.required).toBe(true);
    expect(proof.action_id).toBe("platform:users:create");
    expect(typeof proof.step_up_reference).toBe("string");
    expect(proof.step_up_reference.trim().length).toBeGreaterThan(0);
    const invitation = await data<{
      invitation: { delivery_status: string };
      delivery_outcome: string;
    }>(
      await admin.post(invitationPath, {
        headers: {
          ...headers,
          "x-drts-step-up-reference": proof.step_up_reference,
        },
        data: {
          email: EMAIL,
          roleCode: "agency_exporter",
          accessValidTo: new Date(Date.now() + 30 * 86400000).toISOString(),
        },
      }),
      "send invitation with actual SMTP transport",
    );
    expect(invitation.delivery_outcome).toBe("sent");
    expect(invitation.invitation.delivery_status).toBe("delivered");
    // The API never returns rawToken. Read the actual SMTP-delivered MIME body.
    const mail = inbox.messages.find(
      (message) =>
        message.recipients.includes(EMAIL) &&
        message.body.includes(displayName),
    );
    expect(Boolean(mail), "SMTP SIM received the application's real mail").toBe(
      true,
    );
    const link = /^Accept your invitation: (\S+)$/m.exec(mail!.body)?.[1];
    expect(Boolean(link), "delivered message contains invitation URL").toBe(
      true,
    );
    const url = new URL(link!);
    expect(url.origin).toBe(new URL(BASE).origin);
    expect(url.pathname).toBe("/invite");
    expect(Boolean(url.searchParams.get("token"))).toBe(true);
    invitationUrl = url.href;
  } finally {
    await admin.dispose();
  }
});

test.afterAll(async () => {
  await inbox?.close();
});

test("an invited Agency exporter signs in through the real BFF, reads persisted trip and R09/R10/R12 data, and downloads its real same-record CSV", async ({
  page,
}, info) => {
  await page
    .context()
    .addCookies([{ name: "drts-locale-v2", value: "en", url: BASE }]);
  await page.route(
    (url) =>
      url.origin === new URL(BASE).origin &&
      url.pathname === "/api/auth/agency/login",
    async (route) => {
      // Chromium does not route a redirect's second URL. Fetch the real BFF
      // login without following its Google redirect, retaining its actual
      // status, body and all headers (including every state Set-Cookie).
      const login = await route.fetch({ maxRedirects: 0 });
      const headers = login.headers();
      const location = headers.location;
      if (login.status() !== 307 || !location) {
        await route.fulfill({ response: login });
        return;
      }
      const authorization = new URL(location, BASE);
      expect(authorization.origin).toBe("https://accounts.google.com");
      expect(authorization.pathname).toBe("/o/oauth2/v2/auth");
      const state = authorization.searchParams.get("state");
      const callback = new URL(authorization.searchParams.get("redirect_uri")!);
      expect(Boolean(state)).toBe(true);
      expect(callback.origin).toBe(new URL(BASE).origin);
      expect(callback.pathname).toBe("/api/auth/agency/callback");
      // Only the external Google leg is simulated. The real API-issued state,
      // nonce/PKCE and invitation still reach the unmodified normal callback.
      callback.searchParams.set("state", state!);
      callback.searchParams.set(
        "code",
        `agency_business_partner_${randomUUID()}`,
      );
      await route.fulfill({
        response: login,
        headers: { ...headers, location: callback.href },
      });
    },
  );

  await test.step("Delivered invitation and simulated external Google return create a real Agency session", async () => {
    await page.goto(invitationUrl);
    const loginResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.origin === new URL(BASE).origin &&
        url.pathname === "/api/auth/agency/login" &&
        response.request().method() === "GET"
      );
    });
    const callbackResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.origin === new URL(BASE).origin &&
        url.pathname === "/api/auth/agency/callback" &&
        response.request().method() === "GET"
      );
    });
    await page
      .getByRole("link", { name: "Accept invitation with Google", exact: true })
      .click();
    const login = await loginResponse;
    const loginError =
      login.status() >= 400
        ? ((await login.json().catch(() => null)) as { error?: unknown } | null)
            ?.error
        : null;
    expect(
      {
        status: login.status(),
        errorCode:
          loginError === null
            ? null
            : typeof loginError === "string" &&
                /^[A-Z0-9_]{1,96}$/.test(loginError)
              ? loginError
              : "NO_ALLOWLISTED_ERROR_CODE",
      },
      "real Agency BFF login start result",
    ).toEqual({ status: 307, errorCode: null });
    const callback = await callbackResponse;
    const location = await callback.headerValue("location");
    const redirect = location ? new URL(location, BASE) : null;
    const rawError = redirect?.searchParams.get("error") ?? null;
    // Only these public diagnostics may reach a failing native assertion.
    // Never report the callback URL, state, Google code, cookies or response body.
    const callbackDiagnostic = {
      status: callback.status(),
      redirectPath: redirect?.pathname ?? null,
      errorCode:
        rawError === null
          ? null
          : /^[A-Z0-9_]{1,96}$/.test(rawError)
            ? rawError
            : "NON_ALLOWLISTED_ERROR_CODE",
    };
    expect(callbackDiagnostic, "real Agency BFF callback result").toEqual({
      status: 307,
      redirectPath: "/",
      errorCode: null,
    });
    const session = await data<{ active: boolean; identity: WireRow }>(
      await page.request.get(`${BASE}/api/auth/session`),
      "real Agency BFF session verification",
    );
    expect(session).toMatchObject({
      active: true,
      identity: {
        realm: "agency",
        actor_type: "agency_user",
        agency_id: agencyId,
      },
    });
    expect(session.identity.roles).toEqual(
      expect.arrayContaining(["agency_exporter"]),
    );
    await expect(
      page.getByRole("heading", { name: "Home", exact: true }),
    ).toBeVisible();
    await expect(page.locator("main dd").first()).toHaveText(agencyId);
  });

  let selected: WireRow = {};
  await test.step("R11 list and detail read a real completed Passenger journey from the reused database", async () => {
    await visit(page, "/trip-records", "R11 Trip Records");
    const records = await read(page, "trip-records");
    expect(
      records.total,
      "existing bureau Passenger journeys must persist a retained trip; no empty-data acceptance",
    ).toBeGreaterThanOrEqual(1);
    expect(records.items.length).toBeGreaterThanOrEqual(1);
    await expect(page.locator("main tbody tr")).toHaveCount(
      records.items.length,
    );
    selected = records.items[0]!;
    for (const key of ["record_id", "order_id", "trip_id"])
      expect(typeof selected[key], key).toBe("string");
    const detailPath = `/trip-records/${encodeURIComponent(String(selected.record_id))}`;
    await page.locator(`main a[href="${detailPath}"]`).click();
    await expect(
      page.getByRole("heading", {
        name: "R11 Trip Record Detail",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    const detail = await data<WireRow>(
      await page.request.get(
        `${BASE}/api/agency/trip-records/${encodeURIComponent(String(selected.record_id))}`,
      ),
      "same persisted trip detail",
    );
    expect(detail).toMatchObject({
      record_id: selected.record_id,
      order_id: selected.order_id,
      trip_id: selected.trip_id,
    });
    await expect(
      page
        .locator("main")
        .getByText(String(selected.record_id), { exact: true }),
    ).toBeVisible();
    await expect(page.locator("main dd").nth(1)).toContainText(
      String(selected.order_id),
    );
    await expect(page.locator("main dd").nth(1)).toContainText(
      String(selected.trip_id),
    );
  });

  const reads: { page: string; returned: number }[] = [];
  for (const surface of [
    {
      page: "/qualifications/drivers",
      api: "qualifications/drivers",
      title: "R14 Driver Qualifications & Expiry",
      key: "driver_id_masked",
    },
    {
      page: "/qualifications/vehicles",
      api: "qualifications/vehicles",
      title: "R14 Vehicle Qualifications & Expiry",
      key: "plate_no_masked",
    },
    {
      page: "/reports/complaints",
      api: "reports/complaint-monthly-statistics",
      title: "R09 Monthly Complaint Statistics",
      key: "period_month",
    },
    {
      page: "/reports/operations",
      api: "reports/operations-summary",
      title: "R10 Six-Month Operations Summary",
      key: "from",
    },
    {
      page: "/reports/daily-dispatch",
      api: "reports/daily-dispatch-records",
      title: "R12 Daily Dispatch Report",
      key: "service_date",
    },
  ]) {
    await test.step(`${surface.title} renders the actual Agency API projection`, async () => {
      await visit(page, surface.page, surface.title);
      const query = new URLSearchParams();
      if (surface.page === "/reports/daily-dispatch") {
        for (const field of ["serviceDateFrom", "serviceDateTo"])
          query.set(
            field,
            await page.locator(`input[name="${field}"]`).inputValue(),
          );
      }
      const result = await read(
        page,
        `${surface.api}${query.size ? `?${query}` : ""}`,
      );
      await expect(
        page.locator("main table").first().locator("tbody tr"),
      ).toHaveCount(result.items.length);
      if (result.items.length) {
        const value = String(result.items[0]![surface.key]);
        await expect(
          page.locator("main table").first().locator("tbody tr").first(),
        ).toContainText(surface.key === "from" ? value.slice(0, 7) : value);
      } else
        await expect(
          page
            .locator("main")
            .getByText("No records found", { exact: true })
            .first(),
        ).toBeVisible();
      if (surface.page === "/reports/operations") {
        const monthly = result.items.flatMap((row) => {
          const rows = row.monthly_summaries ?? [];
          expect(Array.isArray(rows)).toBe(true);
          return rows as WireRow[];
        });
        await expect(
          page.locator("main table").nth(1).locator("tbody tr"),
        ).toHaveCount(monthly.length);
      }
      reads.push({ page: surface.page, returned: result.items.length });
    });
  }

  await test.step("UI preview, create, refresh and signed download deliver a nonempty CSV for that exact trip", async () => {
    // Diagnostic only: observe the existing UI flow, never replace or retry it.
    const started = Date.now();
    const elapsed = () => Date.now() - started;
    const diagnostic = {
      navigation: {
        startedMs: null as number | null,
        completedMs: null as number | null,
      },
      fill: {
        startedMs: null as number | null,
        completedMs: null as number | null,
      },
      click: {
        startedMs: null as number | null,
        completedMs: null as number | null,
      },
      documentReadyState: null as string | null,
      previewRequests: 0,
      previewResponses: 0,
      previewFailedRequests: 0,
      previewEvents: [] as {
        kind: "request" | "response" | "failed";
        atMs: number;
        status?: number;
      }[],
      pageErrorCount: 0,
      pageErrors: [] as {
        name: string;
        category: "hydration" | "chunk" | "runtime" | "other";
        atMs: number;
      }[],
    };
    const isPreview = (request: Request) => {
      const url = new URL(request.url());
      return (
        url.origin === new URL(BASE).origin &&
        url.pathname === "/api/agency/trip-records/export-jobs/preview" &&
        request.method() === "POST"
      );
    };
    const onRequest = (request: Request) => {
      if (!isPreview(request)) return;
      diagnostic.previewRequests++;
      if (diagnostic.previewEvents.length < 12)
        diagnostic.previewEvents.push({ kind: "request", atMs: elapsed() });
    };
    const onResponse = (response: Response) => {
      if (!isPreview(response.request())) return;
      diagnostic.previewResponses++;
      if (diagnostic.previewEvents.length < 12)
        diagnostic.previewEvents.push({
          kind: "response",
          atMs: elapsed(),
          status: response.status(),
        });
    };
    const onFailed = (request: Request) => {
      if (!isPreview(request)) return;
      diagnostic.previewFailedRequests++;
      if (diagnostic.previewEvents.length < 12)
        diagnostic.previewEvents.push({ kind: "failed", atMs: elapsed() });
    };
    const onPageError = (error: Error) => {
      diagnostic.pageErrorCount++;
      if (diagnostic.pageErrors.length >= 8) return;
      const name = [
        "Error",
        "TypeError",
        "ReferenceError",
        "SyntaxError",
        "RangeError",
        "URIError",
        "EvalError",
        "ChunkLoadError",
      ].includes(error.name)
        ? error.name
        : "OtherError";
      const category = /hydrat/i.test(error.message)
        ? "hydration"
        : /ChunkLoadError|loading (?:CSS )?chunk|dynamically imported module|module script/i.test(
              error.message,
            )
          ? "chunk"
          : name === "OtherError"
            ? "other"
            : "runtime";
      // No message/stack, URL query, headers, cookies, body, or token is retained.
      diagnostic.pageErrors.push({ name, category, atMs: elapsed() });
    };
    page.on("request", onRequest);
    page.on("response", onResponse);
    page.on("requestfailed", onFailed);
    page.on("pageerror", onPageError);
    try {
      await test.step("Navigate to the normal export page", async () => {
        diagnostic.navigation.startedMs = elapsed();
        await visit(page, "/trip-records/exports", "R11 Controlled Exports");
        diagnostic.navigation.completedMs = elapsed();
        // This is document load state only; it does not prove React hydration.
        diagnostic.documentReadyState = await page.evaluate(
          () => document.readyState,
        );
      });
      await test.step("Fill the exact retained record ID", async () => {
        diagnostic.fill.startedMs = elapsed();
        await page
          .getByLabel("Record ID (Exact)", { exact: true })
          .fill(String(selected.record_id));
        diagnostic.fill.completedMs = elapsed();
      });
      const [previewResponse] = await Promise.all([
        page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname ===
              "/api/agency/trip-records/export-jobs/preview" &&
            response.request().method() === "POST",
        ),
        test.step("Click the normal preview button", async () => {
          diagnostic.click.startedMs = elapsed();
          await page
            .getByRole("button", { name: "Preview Record Count", exact: true })
            .click();
          diagnostic.click.completedMs = elapsed();
        }),
      ]);
      const preview = await data<{
        record_count: number;
        format: string;
        purpose_required: boolean;
      }>(previewResponse, "real export preview");
      expect(preview).toMatchObject({
        record_count: 1,
        format: "csv",
        purpose_required: true,
      });
      await expect(
        page.getByText("Retained records matching scope: 1", { exact: true }),
      ).toBeVisible();
      await page
        .getByLabel("Export Purpose (Required)", { exact: true })
        .fill(
          "Hosted Agency review of one actually completed Passenger trip; external mail and Google are simulated.",
        );
      const [createResponse] = await Promise.all([
        page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname ===
              "/api/agency/trip-records/export-jobs" &&
            response.request().method() === "POST",
        ),
        page
          .getByRole("button", { name: "Create Export Job", exact: true })
          .click(),
      ]);
      const job = await data<{ job_id: string }>(
        createResponse,
        "real durable export job creation",
      );
      expect(typeof job.job_id).toBe("string");
      const statusPath = `/api/agency/trip-records/export-jobs/${encodeURIComponent(job.job_id)}`;
      await expect
        .poll(async () => {
          const [response] = await Promise.all([
            page.waitForResponse(
              (response) => new URL(response.url()).pathname === statusPath,
            ),
            page
              .getByRole("button", { name: "Refresh Status", exact: true })
              .click(),
          ]);
          const status = await data<{
            status: string;
            agency_id: string;
            record_count: number;
          }>(response, "UI refresh of real export status");
          expect(status).toMatchObject({
            agency_id: agencyId,
            record_count: 1,
          });
          return status.status;
        })
        .toBe("completed");
      const [metadataResponse] = await Promise.all([
        page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === `${statusPath}/download`,
        ),
        page
          .getByRole("button", { name: "Get Download Link", exact: true })
          .click(),
      ]);
      const metadata = await data<{
        record_count: number;
        manifest_hash: string;
        download: { download_url: string };
      }>(metadataResponse, "real signed download issuance");
      expect(metadata.record_count).toBe(1);
      expect(metadata.manifest_hash).toMatch(/^[a-f0-9]{64}$/);
      const link = page.getByRole("link", {
        name: "Download (while signed link is valid)",
        exact: true,
      });
      await expect(link).toHaveAttribute(
        "href",
        metadata.download.download_url,
      );
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        link.click(),
      ]);
      expect(await download.failure()).toBeNull();
      expect(download.suggestedFilename()).toMatch(/\.csv$/i);
      const stream = await download.createReadStream();
      expect(stream).not.toBeNull();
      const chunks: Buffer[] = [];
      for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      expect(bytes.length).toBeGreaterThan(0);
      const rows = csvRows(bytes.toString("utf8").replace(/^\uFEFF/, ""));
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual(
        expect.arrayContaining([
          "recordId",
          "orderId",
          "tripId",
          "plateNo",
          "reservedAt",
          "pickupAt",
          "dropoffAt",
          "routeSummary",
          "distanceMeters",
          "payableFareMinor",
          "collectedFareMinor",
          "tollMinor",
        ]),
      );
      for (const [column, value] of [
        ["recordId", selected.record_id],
        ["orderId", selected.order_id],
        ["tripId", selected.trip_id],
      ]) {
        expect(rows[1]![rows[0]!.indexOf(String(column))]).toBe(value);
      }
      await info.attach("agency-real-business-facts", {
        contentType: "application/json",
        body: JSON.stringify({
          agencyId,
          recordId: selected.record_id,
          orderId: selected.order_id,
          tripId: selected.trip_id,
          jobId: job.job_id,
          previewCount: preview.record_count,
          csvRows: rows.length - 1,
          csvBytes: bytes.length,
          csvSha256: createHash("sha256").update(bytes).digest("hex"),
          reads,
          externalSIM: [
            "SMTP inbox delivery",
            "Google authorization and OIDC provider claims",
          ],
          realPaths: [
            "platform invitation API",
            "Agency BFF callback and session",
            "committed trip list/detail",
            "qualifications and R09/R10/R12 projections",
            "durable export job",
            "signed CSV download",
          ],
          liveCloudOrRealGoogleClaimed: false,
        }),
      });
    } finally {
      page.off("request", onRequest);
      page.off("response", onResponse);
      page.off("requestfailed", onFailed);
      page.off("pageerror", onPageError);
      await info.attach("agency-export-preview-native-diagnostic", {
        contentType: "application/json",
        body: JSON.stringify({
          ...diagnostic,
          elapsedMs: elapsed(),
          documentReadyStateIsNotHydrationProof: true,
          diagnosticOnlyNotAProductFix: true,
        }),
      });
    }
  });
});
