// Shared Cloud Run only. No seeds, invitation creation, mocks or local servers.
// Export creation is the sole controlled business write, scoped to one existing
// synthetic record. Artifacts contain identifiers/checks/hashes, never CSV/PII,
// credentials, signed URLs, screenshots, traces or browser storage.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const OUT = ".artifacts/agency-shared";
const PROJECT = "drts-dev-devcc-20260825";
const REGION = "us-central1";
// Existing fictional agency used by the authorized Nov 19 hosted probes.
const AGENCY = "agency_1f1710fc6d5041e785f9ed529d2fcdd0";
export const check = (condition, code) => {
  if (!condition) throw new Error(code);
};
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const save = (name, value) => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}.json`, `${JSON.stringify(value, null, 2)}\n`);
};

export function validateFixture(raw) {
  const fixture = JSON.parse(raw);
  const keys = ["agencyId", "recordId", "orderId", "tripId", "serviceDate"];
  check(Object.keys(fixture).sort().join() === keys.sort().join(), "fixture-fields");
  check(fixture.agencyId === AGENCY, "existing-fictional-agency-only");
  for (const key of ["recordId", "orderId", "tripId"])
    check(typeof fixture[key] === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(fixture[key]), "fixture-id");
  check(/^\d{4}-\d{2}-\d{2}$/.test(fixture.serviceDate) &&
    new Date(`${fixture.serviceDate}T00:00:00Z`).toISOString().slice(0, 10) === fixture.serviceDate, "fixture-date");
  return fixture;
}

export function config() {
  const env = process.env;
  check(env.GITHUB_ACTIONS === "true", "hosted-runner-required");
  check(/^[a-f0-9]{40}$/.test(env.EXPECTED_DEFINITION_SHA ?? "") &&
    /^[a-f0-9]{40}$/.test(env.EXPECTED_RUNTIME_SHA ?? ""), "immutable-shas-required");
  check(env.EXPECTED_DEFINITION_SHA === env.GITHUB_SHA &&
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() === env.GITHUB_SHA, "checkout-definition-mismatch");
  check(env.DEV_GCP_PROJECT_ID === PROJECT && env.DEV_GCP_REGION === REGION, "live-dev-target-mismatch");
  return { definitionSha: env.GITHUB_SHA, runtimeSha: env.EXPECTED_RUNTIME_SHA,
    fixture: validateFixture(env.AGENCY_SHARED_FIXTURE ?? "") };
}

export function serviceBinding(service, deployed, name, runtimeSha) {
  const status = service.status;
  const revision = status.latestReadyRevisionName;
  check(revision && revision === status.latestCreatedRevisionName, "runtime-not-ready");
  check(status.traffic?.length === 1 && status.traffic[0].percent === 100 &&
    status.traffic[0].revisionName === revision, "runtime-split-or-stale-traffic");
  check(new RegExp(`^https://${name}-[a-z0-9-]+\\.a\\.run\\.app$`).test(status.url), "runtime-origin");
  const env = deployed.spec.containers[0].env;
  check(env.some((item) => item.name === "DRTS_CANDIDATE_SHA" && item.value === runtimeSha), "runtime-sha-mismatch");
  return { origin: status.url, revision, runtimeSha };
}

function runtime(phase) {
  const cfg = config();
  const cloud = (kind, name) => JSON.parse(execFileSync("gcloud", ["run", kind, "describe", name,
    `--project=${PROJECT}`, `--region=${REGION}`, "--format=json"],
  { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] }));
  const services = {};
  for (const [role, name] of [["api", "drts-dev-api"], ["agency", "drts-dev-agency-portal-web"]]) {
    const service = cloud("services", name);
    services[role] = serviceBinding(service, cloud("revisions", service.status.latestReadyRevisionName), name, cfg.runtimeSha);
  }
  const snapshot = { ...cfg, phase, services, observedAt: new Date().toISOString() };
  save(`runtime-${phase}`, snapshot);
  if (phase === "after") {
    const before = JSON.parse(readFileSync(`${OUT}/runtime-before.json`, "utf8"));
    check(JSON.stringify(before.services) === JSON.stringify(services), "runtime-changed-during-probes");
  }
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `agency_origin=${services.agency.origin}\napi_origin=${services.api.origin}\n`);
}

export async function body(response, status = 200) {
  check(response.status() === status, `http-${status}-required`);
  const envelope = await response.json();
  if (status >= 400) return envelope;
  check(envelope.data != null && !envelope.error, "api-data-envelope");
  return envelope.data;
}

export async function visit(page, path, cfg) {
  const response = await page.goto(`${cfg.origin}${path}`, { waitUntil: "domcontentloaded" });
  check(response?.status() === 200, "ui-http-200-required");
  check(response.headers()["x-drts-candidate-sha"] === cfg.runtimeSha, "served-ui-sha-mismatch");
  check(new URL(page.url()).pathname === new URL(path, cfg.origin).pathname, "unexpected-ui-redirect");
  return response;
}

export async function clickResponse(page, path, method, click) {
  const [response] = await Promise.all([
    page.waitForResponse((res) => new URL(res.url()).pathname === `/api/agency/${path}` && res.request().method() === method), click(),
  ]);
  return response;
}

export async function openRole(browser, role, cfg) {
  const baseEmail = process.env.OPS_DEV_TEST_INVITEE_EMAIL?.trim();
  const password = process.env[role === "viewer" ? "OPS_DEV_AGENCY_VIEWER_PASSWORD" : "OPS_DEV_AGENCY_EXPORTER_PASSWORD"];
  check(baseEmail && password, "existing-role-credentials-missing");
  const email = role === "exporter" ? baseEmail.replace("@", "+exporter@") : baseEmail;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 },
    locale: "en-US", timezoneId: "UTC", acceptDownloads: true });
  // Attach the service-specific WIF token only to the exact Cloud Run origin;
  // never forward it to a signed artifact URL or any other origin.
  if (process.env.AGENCY_ID_TOKEN) await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin !== cfg.origin) return route.continue();
    await route.continue({ headers: { ...route.request().headers(),
      "X-Serverless-Authorization": `Bearer ${process.env.AGENCY_ID_TOKEN}` } });
  });
  context.setDefaultTimeout(30000);
  context.setDefaultNavigationTimeout(60000);
  try {
    const page = await context.newPage();
    await visit(page, "/login", cfg);
    if (await page.locator("html").getAttribute("lang") !== "en") {
      await page.getByRole("button", { name: "切換語言至 English", exact: true }).click();
      await page.getByRole("heading", { name: "Regulatory Agency Read-Only Portal", exact: true }).waitFor();
    }
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    const [login] = await Promise.all([
      page.waitForResponse((res) => new URL(res.url()).pathname === "/api/auth/agency/password-login" && res.request().method() === "POST"),
      page.locator('button[type="submit"]').click(),
    ]);
    check(login.status() === 200, "normal-password-login-failed");
    await page.waitForURL(`${cfg.origin}/`);
    const session = await body(await context.request.get(`${cfg.origin}/api/auth/session`, { headers: cloudHeaders() }));
    check(session.active === true && session.identity?.realm === "agency" &&
      session.identity?.actor_type === "agency_user" && session.identity?.agency_id === cfg.fixture.agencyId, "role-session-agency-binding");
    check(session.identity.roles?.includes(`agency_${role}`) &&
      (role !== "viewer" || !session.identity.roles.includes("agency_exporter")), "role-session-permissions");
    return { context, page };
  } catch (error) { await context.close(); throw error; }
}

export const cloudHeaders = () => process.env.AGENCY_ID_TOKEN
  ? { "X-Serverless-Authorization": `Bearer ${process.env.AGENCY_ID_TOKEN}` } : {};

export async function api(page, path) {
  return body(await page.request.get(`${new URL(page.url()).origin}/api/agency/${path}`, { headers: cloudHeaders() }));
}

export function assertRecord(row, fixture) {
  for (const [wire, key] of [["record_id", "recordId"], ["order_id", "orderId"], ["trip_id", "tripId"]])
    check(row[wire] === fixture[key], `same-${key}-required`);
  check(row.route && typeof row.route.source === "string" && typeof row.payment_status === "string" &&
    Number.isFinite(Date.parse(row.retain_until)), "record-provenance-payment-retention-required");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(row.reserved_at));
  check(["year", "month", "day"].map((key) => parts.find((part) => part.type === key).value).join("-") === fixture.serviceDate, "fixture-taipei-service-date");
}

export async function readDetail(page, cfg) {
  await visit(page, "/trip-records", cfg);
  await page.locator('input[name="recordId"]').fill(cfg.fixture.recordId);
  await Promise.all([page.waitForURL((url) => url.searchParams.get("recordId") === cfg.fixture.recordId),
    page.locator('button[type="submit"]').click()]);
  const query = new URLSearchParams({ recordId: cfg.fixture.recordId, orderId: cfg.fixture.orderId, tripId: cfg.fixture.tripId });
  const rows = await api(page, `trip-records?${query}`);
  check(rows.total === 1 && rows.items.length === 1, "exact-same-record-list");
  assertRecord(rows.items[0], cfg.fixture);
  const path = `/trip-records/${encodeURIComponent(cfg.fixture.recordId)}`;
  await page.locator(`main a[href="${path}"]`).click();
  await page.waitForURL(`${cfg.origin}${path}`);
  const row = await api(page, `trip-records/${encodeURIComponent(cfg.fixture.recordId)}`);
  assertRecord(row, cfg.fixture);
  await assertEnglishDetail(page, row);
  const response = await page.reload({ waitUntil: "domcontentloaded" });
  check(response.status() === 200 && response.headers()["x-drts-candidate-sha"] === cfg.runtimeSha, "detail-refresh-sha");
  await assertEnglishDetail(page, row);
  return row;
}

export const detailCell = (page, label) => page.locator("main dt").filter({ hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd[1]");
export async function assertEnglishDetail(page, row) {
  const { expect } = await import("@playwright/test");
  await expect(detailCell(page, "Record ID")).toHaveText(row.record_id);
  await expect(detailCell(page, "Order ID / Trip ID")).toHaveText(`${row.order_id} / ${row.trip_id}`);
  const sources = { driver_gps: "Driver GPS trajectory", mixed: "Mixed trajectory (partial GPS samples + pickup/dropoff summary)",
    pickup_dropoff_summary: "Pickup/dropoff & distance summary", provider_route: "Dispatch estimated route", unavailable: "Not provided" };
  const payments = { captured: "Captured (collected)", refunded: "Refunded (collected 0)", authorized: "Authorized (pending capture)",
    not_selected: "Payment not selected", failed: "Charge failed", manual_recovery: "Pending manual recovery", unknown: "Payment status not provided" };
  check(sources[row.route.source] && payments[row.payment_status], "known-record-semantics");
  await expect(detailCell(page, "Route Source \\(Provenance\\)")).toHaveText(sources[row.route.source]);
  const amount = row.collected_fare_minor === null ? "Not provided" : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(row.collected_fare_minor / 100)} ${row.currency}`.trim();
  await expect(detailCell(page, "Collected Fare")).toHaveText(`${amount} (${payments[row.payment_status]})`);
  await expect(detailCell(page, "Generated At / Retained Until")).toContainText(taipeiTime(row.retain_until, "en"));
  await expect(page.getByRole("alert")).toHaveCount(0);
}

export const taipeiTime = (value, locale) => new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
}).format(new Date(value));

// RFC4180, including embedded commas/newlines and escaped quotes.
export function csvRows(text) {
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\r" || char === "\n") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      rows.push([...row, cell]); row = []; cell = "";
    } else cell += char;
  }
  check(!quoted, "unbalanced-csv");
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

export function assertCsv(bytes, manifestHash, row) {
  check(/^[a-f0-9]{64}$/.test(manifestHash) && sha256(bytes) === manifestHash, "csv-bytes-manifest-mismatch");
  const rows = csvRows(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  check(rows.length === 2 && rows[0].length === rows[1].length && new Set(rows[0]).size === rows[0].length, "csv-exactly-one-record");
  const expected = { recordId: row.record_id, orderId: row.order_id, tripId: row.trip_id, routeSource: row.route.source,
    collectedFareMinor: row.collected_fare_minor, paymentStatus: row.payment_status, tollMinor: row.toll_minor, retainUntil: row.retain_until };
  for (const [key, value] of Object.entries(expected)) {
    check(rows[0].includes(key), "csv-required-column");
    check(rows[1][rows[0].indexOf(key)] === (value == null ? "" : String(value)), `csv-${key}-readback`);
  }
  return { csvBytes: bytes.length, csvSha256: sha256(bytes), manifestHash, csvRows: 1, verifiedColumns: Object.keys(expected) };
}

async function exportRecord(page, role, cfg, row) {
  const { expect } = await import("@playwright/test");
  await visit(page, `/trip-records/exports?${new URLSearchParams({ recordId: cfg.fixture.recordId, orderId: cfg.fixture.orderId, tripId: cfg.fixture.tripId })}`, cfg);
  const preview = await clickResponse(page, "trip-records/export-jobs/preview", "POST", () => page.getByRole("button", { name: "Preview Record Count", exact: true }).click());
  if (role === "viewer") {
    await body(preview, 403);
    await expect(page.getByRole("alert")).toHaveText("This account cannot preview or download controlled exports (access attempt logged).");
    await page.getByLabel("Export Purpose (Required)", { exact: true }).fill("Controlled synthetic same-trip acceptance: viewer refusal");
    const denied = await clickResponse(page, "trip-records/export-jobs", "POST", () => page.getByRole("button", { name: "Create Export Job", exact: true }).click());
    await body(denied, 403);
    await expect(page.locator("main code")).toHaveCount(0);
    return { previewStatus: 403, createStatus: 403, jobCreated: false };
  }
  check((await body(preview)).record_count === 1, "export-preview-one-record");
  await page.getByLabel("Export Purpose (Required)", { exact: true }).fill("Authorized shared-dev synthetic same-trip R11 acceptance; no customer data changes.");
  const created = await body(await clickResponse(page, "trip-records/export-jobs", "POST", () => page.getByRole("button", { name: "Create Export Job", exact: true }).click()), 201);
  check(typeof created.job_id === "string" && /^[A-Za-z0-9_-]+$/.test(created.job_id), "export-job-id");
  const path = `trip-records/export-jobs/${created.job_id}`;
  await expect.poll(async () => {
    const job = await body(await clickResponse(page, path, "GET", () => page.getByRole("button", { name: "Refresh Status", exact: true }).click()));
    check(job.agency_id === cfg.fixture.agencyId && job.record_count === 1, "export-job-owner-and-count");
    return job.status;
  }, { timeout: 60000 }).toBe("completed");
  const metadata = await body(await clickResponse(page, `${path}/download`, "GET", () => page.getByRole("button", { name: "Get Download Link", exact: true }).click()));
  check(metadata.record_count === 1 && metadata.job_id === created.job_id, "download-same-job");
  const link = page.getByRole("link", { name: "Download (while signed link is valid)", exact: true });
  await expect(link).toHaveAttribute("href", metadata.download.download_url);
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  check(await download.failure() === null, "csv-download-failed");
  const stream = await download.createReadStream();
  check(stream, "download-stream-required");
  const chunks = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return { jobId: created.job_id, ...assertCsv(Buffer.concat(chunks), metadata.manifest_hash, row) };
}

async function dailyDispatch(page, cfg) {
  const { expect } = await import("@playwright/test");
  await visit(page, "/reports/daily-dispatch", cfg);
  for (const field of ["serviceDateFrom", "serviceDateTo"])
    await page.locator(`input[name="${field}"]`).fill(cfg.fixture.serviceDate);
  await Promise.all([page.waitForURL((url) => url.searchParams.get("serviceDateFrom") === cfg.fixture.serviceDate && url.searchParams.get("serviceDateTo") === cfg.fixture.serviceDate),
    page.locator('button[type="submit"]').click()]);
  const query = new URLSearchParams({ serviceDateFrom: cfg.fixture.serviceDate, serviceDateTo: cfg.fixture.serviceDate });
  const result = await api(page, `reports/daily-dispatch-records?${query}`);
  check(result.items.length > 0 && result.items.every((item) => item.service_date === cfg.fixture.serviceDate), "dated-daily-dispatch-data-required");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator("main tbody tr")).toHaveCount(result.items.length);
  for (let i = 0; i < result.items.length; i++) {
    const cells = page.locator("main tbody tr").nth(i).locator("td");
    await expect(cells.nth(0)).toHaveText(cfg.fixture.serviceDate);
    await expect(cells.nth(1)).toHaveText(result.items[i].order_no_masked);
    await expect(cells.nth(3)).toHaveText(result.items[i].service_product_code);
  }
  return { serviceDate: cfg.fixture.serviceDate, apiStatus: 200, rows: result.items.length, uiMatchesApi: true };
}

export async function probe(name, operation) {
  const cfg = config();
  const binding = JSON.parse(readFileSync(`${OUT}/runtime-before.json`, "utf8"));
  check(binding.runtimeSha === cfg.runtimeSha && binding.definitionSha === cfg.definitionSha, "probe-runtime-binding");
  cfg.origin = binding.services.agency.origin;
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const result = { schemaVersion: 1, probe: name, ...cfg, runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT, checks: [], status: "running", startedAt: new Date().toISOString() };
  const record = async (label, action) => {
    try { const facts = await action(); result.checks.push({ check: label, status: "pass", ...facts }); return facts; }
    catch { result.checks.push({ check: label, status: "fail" }); return null; }
    finally { save(name, result); }
  };
  try { await operation(browser, cfg, record); }
  finally {
    await browser.close();
    result.status = result.checks.length > 0 && result.checks.every((item) => item.status === "pass") ? "pass" : "fail";
    result.finishedAt = new Date().toISOString(); save(name, result);
  }
  check(result.status === "pass", "probe-has-failed-checks");
}

async function main() {
  await probe("trip-record", async (browser, cfg, record) => {
    for (const role of ["viewer", "exporter"]) {
      let opened;
      await record(`${role}:normal-ui-login`, async () => { opened = await openRole(browser, role, cfg); return { role, sessionBound: true }; });
      if (!opened) continue;
      try {
        let row;
        await record(`${role}:R11-detail-refresh`, async () => { row = await readDetail(opened.page, cfg); return { sameRecord: true, refreshed: true }; });
        await record(`${role}:R13-dated-daily-dispatch`, () => dailyDispatch(opened.page, cfg));
        await record(`${role}:R11-controlled-export`, async () => { check(row, "detail-prerequisite"); return exportRecord(opened.page, role, cfg, row); });
      } finally { await opened.context.close(); }
    }
  });
}

export function selfTest() {
  const fixture = { agencyId: AGENCY, recordId: "mtr_fixture", orderId: "order_fixture", tripId: "trip_fixture", serviceDate: "2026-11-19" };
  assert.deepEqual(validateFixture(JSON.stringify(fixture)), fixture);
  for (const delta of [{ agencyId: "customer" }, { recordId: "../../escape" }, { serviceDate: "2026-02-30" }, { extra: "unexpected" }])
    assert.throws(() => validateFixture(JSON.stringify({ ...fixture, ...delta })));
  assert.deepEqual(csvRows('a,b\r\n"a,""b""","x\ny"\r\n'), [["a", "b"], ['a,"b"', "x\ny"]]);
  assert.throws(() => csvRows('a\n"unterminated'));
  const row = { record_id: "r", order_id: "o", trip_id: "t", route: { source: "driver_gps" }, collected_fare_minor: null,
    payment_status: "unknown", toll_minor: 0, retain_until: "2030-01-01T00:00:00Z" };
  const bytes = Buffer.from("recordId,orderId,tripId,routeSource,collectedFareMinor,paymentStatus,tollMinor,retainUntil\r\nr,o,t,driver_gps,,unknown,0,2030-01-01T00:00:00Z\r\n");
  assert.equal(assertCsv(bytes, sha256(bytes), row).csvRows, 1);
  assert.throws(() => assertCsv(bytes, "0".repeat(64), row));
  assert.throws(() => assertCsv(bytes, sha256(bytes), { ...row, order_id: "other-order" }));
  assert.throws(() => assertCsv(bytes, sha256(bytes), { ...row, collected_fare_minor: 0 }));
  assert.throws(() => assertCsv(bytes, sha256(bytes), { ...row, route: { source: "unavailable" } }));
  const service = { status: { latestReadyRevisionName: "ready", latestCreatedRevisionName: "ready", traffic: [{ percent: 100, revisionName: "ready" }], url: "https://drts-dev-api-example-uc.a.run.app" } };
  const deployed = { spec: { containers: [{ env: [{ name: "DRTS_CANDIDATE_SHA", value: "a".repeat(40) }] }] } };
  assert.equal(serviceBinding(service, deployed, "drts-dev-api", "a".repeat(40)).revision, "ready");
  assert.throws(() => serviceBinding(service, deployed, "drts-dev-api", "b".repeat(40)));
  assert.throws(() => serviceBinding({ status: { ...service.status, traffic: [] } }, deployed, "drts-dev-api", "a".repeat(40)));
  assert.throws(() => serviceBinding({ status: { ...service.status, url: "http://localhost:3012" } }, deployed, "drts-dev-api", "a".repeat(40)));
  console.log("PASS: socket-free fixture, runtime, RFC4180, CSV bytes/hash/readback and null/zero controls");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === "--self-test") selfTest();
    else if (["--runtime-before", "--runtime-after"].includes(process.argv[2])) runtime(process.argv[2].slice(10));
    else await main();
  } catch { console.error("Agency shared probe failed; inspect allowlisted result checkpoints (no raw errors retained)."); process.exitCode = 1; }
}
