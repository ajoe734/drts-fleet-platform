import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type {
  BookingRecord,
  OwnedOrderRecord,
  PartnerBookingDetails,
  PartnerChannelEntryRecord,
  PartnerEligibilityVerificationRecord,
  PartnerIngressCredentialIssued,
  PartnerIngressHandoffSession,
} from "@drts/contracts";
import type { ServiceProductRecord } from "../../apps/api/src/modules/service-product/service-product.types";
import { PARTNER_LOCALE_COOKIE } from "../../apps/partner-booking-web/lib/locale-config";
import { PartnerFixture } from "./system-remediation/sr-partner-notify-qa-20260917/partner-fixture";

type Subtype = "travel_agency_transfer" | "insurance_replacement_vehicle";
type Scope = {
  entry: PartnerChannelEntryRecord;
  keyId: string | null;
  apiKey: string | null;
};
const execute = promisify(execFile);
const scopes: Scope[] = [];
const createdIds = new Set<string>();
const origin = "http://127.0.0.1:3007";
let fixture: PartnerFixture;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing existing hosted fixture: " + name);
  return value;
}

test.beforeAll(async () => {
  expect(process.env.GITHUB_ACTIONS).toBe("true");
  expect(process.env.DRTS_UAT_ENV).toBe("sandbox");
  expect(required("DRTS_UAT_API_URL")).toBe("http://127.0.0.1:4102");
  expect(required("CANDIDATE_SHA")).toMatch(/^[a-f0-9]{40}$/);
  // Reuse existing authoritative renewal: verifies old durable authority,
  // then actual JwtAuthService issues sessions. Never signs a fake JWT.
  const directory = await mkdtemp(path.join(tmpdir(), "c032-sessions-"));
  try {
    const file = path.join(directory, "sessions.json");
    await execute("./apps/api/node_modules/.bin/tsx", [
      "tests/e2e/system-remediation/sr-partner-notify-qa-20260917/fixture-sessions.ts",
      file,
    ]);
    const sessions = JSON.parse(await readFile(file, "utf8")) as Record<
      string,
      string
    >;
    for (const name of [
      "DRTS_UAT_TOKEN_PLATFORM",
      "DRTS_UAT_TOKEN_A",
      "DRTS_UAT_TOKEN_B",
    ]) {
      const token = sessions[name];
      if (!token)
        throw new Error("Authoritative hosted session renewal did not finish");
      process.env[name] = token;
    }
  } finally {
    // Private sessions never enter uploaded artifact paths, including on error.
    await rm(directory, { recursive: true, force: true });
  }
  fixture = new PartnerFixture(); // Do not start unrelated notification fixtures.
});

test.afterAll(async () => {
  if (!fixture) return;
  const errors: string[] = [];
  try {
    for (const scope of [...scopes].reverse()) {
      const slug = encodeURIComponent(scope.entry.entrySlug);
      try {
        if (scope.keyId)
          await fixture.call(
            "platform-admin/partner-entries/" +
              slug +
              "/credentials/" +
              encodeURIComponent(scope.keyId) +
              "/revoke",
            required("DRTS_UAT_TOKEN_PLATFORM"),
            "POST",
            { revokeReason: "Disposable C032 hosted acceptance complete" },
          );
      } catch {
        errors.push("credential cleanup: " + scope.entry.entrySlug);
      }
      try {
        await fixture.call(
          "platform-admin/partner-entries/" + slug + "/deactivate",
          required("DRTS_UAT_TOKEN_PLATFORM"),
          "POST",
          {},
        );
      } catch {
        errors.push("entry cleanup: " + scope.entry.entrySlug);
      }
      scope.apiKey = null;
    }
  } finally {
    await fixture.db.end();
  }
  // Keep booking evidence in disposable PG. Never delete/reset shared data.
  expect(errors, "normal credential/entry cleanup").toEqual([]);
});

async function ensureProduct(subtype: Subtype) {
  const token = required("DRTS_UAT_TOKEN_PLATFORM");
  const before = await fixture.call<{ items: ServiceProductRecord[] }>(
    "admin/service-products",
    token,
  );
  const product = before.items.find(
    (row) => row.serviceProductType === subtype,
  );
  if (!product || product.serviceProductId.startsWith("seed-")) {
    await fixture.call("admin/service-products", token, "POST", {
      serviceProductType: subtype,
      displayName: "SIM C032 hosted " + subtype,
      timing: "reservation",
      active: true,
      defaultBillingMode: "partner_settlement",
      defaultProofRequirements: ["photo", "signoff"],
    });
  } else if (!product.active) {
    await fixture.call(
      "admin/service-products/" + encodeURIComponent(product.serviceProductId),
      token,
      "PUT",
      {
        active: true,
        timing: "reservation",
      },
    );
  }
  const after = await fixture.call<{ items: ServiceProductRecord[] }>(
    "admin/service-products",
    token,
  );
  expect(
    after.items.filter(
      (row) => row.serviceProductType === subtype && row.active,
    ),
  ).toHaveLength(1);
}

async function onboard(subtype: Subtype): Promise<Scope> {
  await ensureProduct(subtype);
  const suffix = randomUUID().replaceAll("-", "");
  const entrySlug = "c032-" + suffix;
  const entry = await fixture.call<PartnerChannelEntryRecord>(
    "platform-admin/partner-entries",
    required("DRTS_UAT_TOKEN_PLATFORM"),
    "POST",
    {
      tenantId: required("DRTS_UAT_TENANT_A"),
      partnerCode: "c032_" + suffix,
      partnerType:
        subtype === "travel_agency_transfer"
          ? "travel_agency"
          : "insurance_company",
      programId: "c032-program-" + suffix,
      programCode: "SIM-" + suffix,
      entrySlug,
      displayName: "SIM C032 " + subtype,
      businessDispatchSubtype: subtype,
      authMode: "partner_api_key",
      eligibilityMode: "reference_required",
      entryHost: new URL(origin).host,
      entryPath: "/" + entrySlug + "/book",
      status: "active",
      activeFlag: true,
    },
  );
  const scope: Scope = { entry, keyId: null, apiKey: null };
  scopes.push(scope); // A later credential failure still deactivates this entry.
  expect(entry.entrySlug).toBe(entrySlug);
  expect(entry.businessDispatchSubtype).toBe(subtype);
  expect(entry.tenantId).toBe(required("DRTS_UAT_TENANT_A"));
  const issued = await fixture.call<PartnerIngressCredentialIssued>(
    "platform-admin/partner-entries/" +
      encodeURIComponent(entry.entrySlug) +
      "/credentials/issue",
    required("DRTS_UAT_TOKEN_PLATFORM"),
    "POST",
    {
      purpose:
        "Disposable C032 normal browser booking; external facts explicitly SIM",
    },
  );
  expect(issued.plaintextKey).toBeTruthy();
  scope.keyId = issued.credential.keyId;
  scope.apiKey = issued.plaintextKey;
  const actual = await fixture.call<PartnerChannelEntryRecord>(
    "partner/entries/" + encodeURIComponent(entry.entrySlug),
    null,
  );
  expect(actual).toMatchObject({
    entrySlug,
    tenantId: entry.tenantId,
    partnerId: entry.partnerId,
    programId: entry.programId,
    businessDispatchSubtype: subtype,
    eligibilityMode: "reference_required",
    status: "active",
    activeFlag: true,
  });
  return scope;
}

async function selectAddress(
  page: Page,
  index: 0 | 1,
  query: string,
  label: string,
) {
  // Existing pair order is pickup then dropoff; both are explicitly SIM maps.
  const pickers = page.locator("[data-address-map-picker]");
  await expect(pickers).toHaveCount(2);
  const picker = pickers.nth(index);
  await picker
    .getByRole("textbox", { name: "Search address", exact: true })
    .fill(query);
  await picker.getByRole("button", { name: "Search", exact: true }).click();
  await picker.getByRole("button", { name: new RegExp(label) }).click();
}

async function freshRead(
  scope: Scope,
  partnerUserRef: string,
  bookingId: string,
  orderId: string,
) {
  if (!scope.apiKey) throw new Error("Normal issued credential is missing");
  const session = await fixture.call<PartnerIngressHandoffSession>(
    "partner/ingress/handoff",
    null,
    "POST",
    { entrySlug: scope.entry.entrySlug, apiKey: scope.apiKey, partnerUserRef },
  );
  expect(session.identity).toMatchObject({
    actorType: "referral_passenger",
    realm: "partner",
    tenantId: scope.entry.tenantId,
    partnerId: scope.entry.partnerId,
    partnerProgramId: scope.entry.programId,
    partnerEntrySlug: scope.entry.entrySlug,
  });
  const booking = await fixture.call<BookingRecord>(
    "partner/bookings/" + encodeURIComponent(bookingId),
    session.accessToken,
    "GET",
    undefined,
    scope.entry.tenantId,
  );
  const order = await fixture.call<OwnedOrderRecord>(
    "partner/orders/" + encodeURIComponent(orderId),
    session.accessToken,
    "GET",
    undefined,
    scope.entry.tenantId,
  );
  const pg = await fixture.db.query(
    "SELECT order_id, record FROM ops.phase1_owned_orders WHERE order_id=$1",
    [orderId],
  );
  expect(pg.rows).toHaveLength(1);
  expect(pg.rows[0]!.order_id).toBe(orderId);
  const stored = pg.rows[0]!.record as OwnedOrderRecord;
  return { booking, order, stored, drtsPassengerId: session.drtsPassengerId };
}

function assertSnapshot(
  data: Awaited<ReturnType<typeof freshRead>>,
  scope: Scope,
  bookingId: string,
  orderId: string,
  details: PartnerBookingDetails,
  windowStart: string,
  windowEnd: string,
  notes: string,
) {
  const expected = {
    bookingId,
    orderId,
    tenantId: scope.entry.tenantId,
    partnerId: scope.entry.partnerId,
    partnerProgramId: scope.entry.programId,
    partnerEntrySlug: scope.entry.entrySlug,
    businessDispatchSubtype: details.subtype,
    reservationWindowStart: windowStart,
    reservationWindowEnd: windowEnd,
    partnerBookingDetails: details,
    notes,
  };
  expect(data.booking).toMatchObject(expected);
  expect(data.order).toMatchObject(expected);
  expect(data.stored).toMatchObject(expected);
  expect(data.booking.partnerBookingDetails).toEqual(details);
  expect(data.order.partnerBookingDetails).toEqual(details);
  expect(data.stored.partnerBookingDetails).toEqual(details);
  expect(data.booking.eligibilityVerificationId).toBeTruthy();
  expect(data.order.eligibilityVerificationId).toBe(
    data.booking.eligibilityVerificationId,
  );
  expect(data.stored.eligibilityVerificationId).toBe(
    data.booking.eligibilityVerificationId,
  );
  expect(data.order.pickup).toMatchObject({ lat: 25.033964, lng: 121.564468 });
  expect(data.order.dropoff).toMatchObject({ lat: 25.047762, lng: 121.517017 });
  expect(data.stored.pickup).toEqual(data.order.pickup);
  expect(data.stored.dropoff).toEqual(data.order.dropoff);
}

async function readPersistedPages(
  page: Page,
  scope: Scope,
  partnerUserRef: string,
  bookingId: string,
  orderId: string,
  details: PartnerBookingDetails,
) {
  const originalBookUrl = page.url();
  const notPaid =
    "This is a booking record and quotation, not confirmation of payment.";
  const assertRoute = (screen: "confirmed" | "receipt" | "trips") => {
    const url = new URL(page.url());
    expect(url.pathname).toBe("/" + scope.entry.entrySlug + "/" + screen);
    expect(url.searchParams.get("partnerUserRef")).toBe(partnerUserRef);
    expect(url.searchParams.has("apiKey")).toBe(false);
    expect(url.searchParams.has("accessToken")).toBe(false);
    if (screen !== "trips") {
      expect(url.searchParams.get("bookingId")).toBe(bookingId);
      expect(url.searchParams.get("orderId")).toBe(orderId);
    }
  };
  const assertRecord = async (heading: string) => {
    const record = page.getByTestId("partner-persisted-booking");
    await expect(record).toBeVisible();
    await expect(record).toHaveAttribute("data-booking-id", bookingId);
    await expect(record).toHaveAttribute("data-order-id", orderId);
    await expect(
      record.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(record).toContainText(notPaid);
    const fields = record.getByRole("region", {
      name: "Program details",
      exact: true,
    });
    await expect(fields).toBeVisible();
    for (const [key, value] of Object.entries(details)) {
      if (key === "subtype") continue;
      for (const text of Array.isArray(value) ? value : [String(value)]) {
        await expect(fields).toContainText(text);
      }
    }
  };
  // Use the real links from the successful normal booking. Every destination
  // creates the existing normal session then re-reads API booking + order.
  await page
    .getByTestId("partner-booking-confirmation")
    .getByRole("link", { name: "Booking confirmation", exact: true })
    .click();
  await assertRecord("Booking confirmation");
  assertRoute("confirmed");
  await page.reload();
  await assertRecord("Booking confirmation");
  assertRoute("confirmed");
  await page
    .getByTestId("partner-persisted-booking")
    .getByRole("link", { name: "Booking record", exact: true })
    .click();
  await assertRecord("Booking record");
  assertRoute("receipt");
  await page.reload();
  await assertRecord("Booking record");
  assertRoute("receipt");
  await page
    .getByTestId("partner-persisted-booking")
    .getByRole("link", { name: "Partner / program bookings", exact: true })
    .click();
  const history = page.getByTestId("partner-persisted-history");
  await expect(history).toBeVisible();
  assertRoute("trips");
  await expect(
    history.getByRole("heading", {
      name: "Partner / program bookings",
      exact: true,
    }),
  ).toBeVisible();
  await expect(history).toContainText(
    "Bookings available to this partner entry and program. This is not a personal-only trip history.",
  );
  const row = history.locator('li[data-booking-id="' + bookingId + '"]');
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute("data-booking-id", bookingId);
  await expect(row).toContainText("Taipei 101");
  await expect(row).toContainText("Taipei Main Station");
  await expect(history).toContainText("Page 1 of 1");
  await expect(
    history.getByRole("link", { name: "Previous page", exact: true }),
  ).toHaveCount(0);
  await expect(
    history.getByRole("link", { name: "Next page", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(history).toBeVisible();
  assertRoute("trips");
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute("data-booking-id", bookingId);
  await row.getByRole("link", { name: bookingId, exact: true }).click();
  await assertRecord("Booking confirmation");
  assertRoute("confirmed");
  // Preserve the original normal /book reload + fresh-session/PG assertions.
  expect((await page.goto(originalBookUrl))?.status()).toBe(200);
}

async function runNormalBooking(
  page: Page,
  testInfo: TestInfo,
  subtype: Subtype,
) {
  const scope = await onboard(subtype);
  const marker = randomUUID();
  const partnerUserRef = "SIM-c032-resident-" + marker;
  const referenceToken = "SIM-c032-reference-" + marker;
  await page
    .context()
    .addCookies([{ name: PARTNER_LOCALE_COOKIE, value: "en", url: origin }]);
  const response = await page.goto(
    "/" +
      scope.entry.entrySlug +
      "/book?" +
      new URLSearchParams({ partnerUserRef, referenceToken }),
  );
  expect(response?.status()).toBe(200);
  await expect(
    page.getByLabel("Passenger name", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Passenger name", { exact: true })
    .fill("SIM Partner Passenger");
  await page.getByLabel("Passenger phone", { exact: true }).fill("0900000032");
  const notes = "SIM external program facts; actual C032 booking " + marker;
  await page.getByLabel("Notes", { exact: true }).fill(notes);
  // Convert dates in actual browser timezone; never assume local input is UTC.
  const dates = await page.evaluate(() => {
    const start = new Date(Date.now() + 3 * 60 * 60 * 1000);
    start.setSeconds(0, 0);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const local = (date: Date) => {
      const pad = (value: number) => String(value).padStart(2, "0");
      return (
        date.getFullYear() +
        "-" +
        pad(date.getMonth() + 1) +
        "-" +
        pad(date.getDate()) +
        "T" +
        pad(date.getHours()) +
        ":" +
        pad(date.getMinutes())
      );
    };
    return {
      start: local(start),
      end: local(end),
      startISO: start.toISOString(),
      endISO: end.toISOString(),
    };
  });
  await page
    .getByLabel("Reservation window start", { exact: true })
    .fill(dates.start);
  await page
    .getByLabel("Reservation window end", { exact: true })
    .fill(dates.end);
  let details: PartnerBookingDetails;
  if (subtype === "travel_agency_transfer") {
    details = {
      subtype,
      groupCode: "SIM-GROUP-" + marker,
      groupSize: 2,
      itineraryLink: "https://travel.example.test/itinerary/" + marker,
      rosterPassengers: ["SIM Traveller One", "SIM Traveller Two"],
      meetingPoint: "SIM Taipei 101 entrance",
    };
    await page
      .getByLabel("Group / order reference", { exact: true })
      .fill(details.groupCode);
    await page.getByLabel("Group seats", { exact: true }).fill("2");
    await page
      .getByLabel("Itinerary link", { exact: true })
      .fill(details.itineraryLink);
    await page
      .getByLabel("Passenger roster", { exact: true })
      .fill(details.rosterPassengers.join("\n"));
    await page
      .getByLabel("Meeting point", { exact: true })
      .fill(details.meetingPoint);
    await page.getByLabel("Luggage count", { exact: true }).fill("2");
  } else {
    details = {
      subtype,
      claimNumber: "SIM-CLAIM-" + marker,
      policyNumber: "SIM-POLICY-" + marker,
      claimReference: "SIM-CASE-" + marker,
      claimantName: "SIM Insured Person",
      replacementStart: dates.startISO,
      replacementEnd: dates.endISO,
      replacementVehicleClass: "SIM business replacement vehicle",
      caseHandler: "SIM Case Handler",
    };
    await page
      .getByLabel("Claim number", { exact: true })
      .fill(details.claimNumber);
    await page
      .getByLabel("Policy number", { exact: true })
      .fill(details.policyNumber);
    await page
      .getByLabel("Claim reference", { exact: true })
      .fill(details.claimReference);
    await page
      .getByLabel("Claimant", { exact: true })
      .fill(details.claimantName);
    await page
      .getByLabel("Replacement period start", { exact: true })
      .fill(dates.start);
    await page
      .getByLabel("Replacement period end", { exact: true })
      .fill(dates.end);
    await page
      .getByLabel("Replacement-vehicle class", { exact: true })
      .fill(details.replacementVehicleClass);
    await page
      .getByLabel("Case handler", { exact: true })
      .fill(details.caseHandler);
  }
  await selectAddress(page, 0, "taipei 101", "Taipei 101");
  await selectAddress(page, 1, "taipei main", "Taipei Main Station");
  await expect(
    page.getByText("Inside the service area", { exact: true }),
  ).toBeVisible();
  const submit = page.getByRole("button", {
    name: "Create booking",
    exact: true,
  });
  await expect(submit).toBeEnabled();
  await submit.click(); // Actual inline Next ServerAction, no API stubs.
  const confirmation = page.getByTestId("partner-booking-confirmation");
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText("Booking created and read back");
  const bookingId = (
    await confirmation.getByTestId("partner-booking-id").innerText()
  ).trim();
  const orderId = (
    await confirmation.getByTestId("partner-order-id").innerText()
  ).trim();
  expect(bookingId).toMatch(/^booking-[a-f0-9-]{36}$/);
  expect(orderId).toMatch(/^[a-f0-9-]{36}$/);
  expect(createdIds.has(bookingId) || createdIds.has(orderId)).toBe(false);
  createdIds.add(bookingId);
  createdIds.add(orderId);
  for (const value of Object.values(details)) {
    if (Array.isArray(value)) {
      for (const name of value) await expect(confirmation).toContainText(name);
    } else if (value !== subtype)
      await expect(confirmation).toContainText(String(value));
  }
  const beforeReload = await freshRead(
    scope,
    partnerUserRef,
    bookingId,
    orderId,
  );
  assertSnapshot(
    beforeReload,
    scope,
    bookingId,
    orderId,
    details,
    dates.startISO,
    dates.endISO,
    notes,
  );
  if (subtype === "travel_agency_transfer") {
    expect(beforeReload.booking.luggageCount).toBe(2);
    expect(beforeReload.stored.luggageCount).toBe(2);
  }
  const verification = await fixture.call<PartnerEligibilityVerificationRecord>(
    "partner/eligibility/" +
      encodeURIComponent(beforeReload.booking.eligibilityVerificationId!),
    required("DRTS_UAT_TOKEN_PLATFORM"),
  );
  expect(verification).toMatchObject({
    verificationStatus: "eligible",
    adapterCode: "issuer_reference_lookup_v1",
    partnerEntrySlug: scope.entry.entrySlug,
    partnerId: scope.entry.partnerId,
    partnerProgramId: scope.entry.programId,
    businessDispatchSubtype: subtype,
  });
  expect(verification.referenceTokenHash).toMatch(/^sha256:/);
  await readPersistedPages(
    page,
    scope,
    partnerUserRef,
    bookingId,
    orderId,
    details,
  );
  // Preserve the original fresh normally issued session + PG SELECT checks.
  await page.reload();
  await expect(
    page.getByLabel("Passenger name", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("partner-booking-confirmation")).toHaveCount(0);
  const afterReload = await freshRead(
    scope,
    partnerUserRef,
    bookingId,
    orderId,
  );
  assertSnapshot(
    afterReload,
    scope,
    bookingId,
    orderId,
    details,
    dates.startISO,
    dates.endISO,
    notes,
  );
  expect(afterReload.drtsPassengerId).toBe(beforeReload.drtsPassengerId);
  const evidence = {
    candidate_sha: required("CANDIDATE_SHA"),
    workflow_sha: required("WORKFLOW_SHA"),
    case: testInfo.title,
    real: [
      "browser-form",
      "Next-ServerAction",
      "API-issued-session",
      "normal-eligibility-create-GET",
      "PG-JSONB",
      "fresh-session-reads-after-reload",
      "clicked-confirmation-record-channel-history",
      "persisted-pages-reload-same-IDs",
    ],
    simulated: [
      "Google-metadata-transport-only-genuine-WIF-token",
      "issuer-reference",
      "travel-insurance-external-facts",
      "existing-map-provider",
    ],
    entrySlug: scope.entry.entrySlug,
    tenantId: scope.entry.tenantId,
    bookingId,
    orderId,
    subtype,
    eligibilityVerificationId: verification.eligibilityVerificationId,
    reservationWindowStart: dates.startISO,
    reservationWindowEnd: dates.endISO,
    partnerBookingDetails: afterReload.stored.partnerBookingDetails,
    beforeReload: { sameIds: true, snapshotMatches: true },
    afterReload: {
      sameIds: true,
      snapshotMatches: true,
      canonicalPartnerIdentityStable: true,
    },
    limits: [
      "No CloudRun/prod",
      "No real issuer/map",
      "No driver-completion/payment",
      "History is the existing entry/program read relation, not personal-only",
      "No airport completion claim",
      "No UI pagination beyond this one-record page; separate real PG pagination case required",
    ],
  };
  const directory = path.resolve(
    ".artifacts/tenant-uat-acceptance/c032-booking",
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, subtype + ".json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  await testInfo.attach("C032 same-ID persisted booking evidence", {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: "application/json",
  });
}

test("C032 normal travel /book creates and reloads the same persisted booking snapshot", async ({
  page,
}, testInfo) => {
  await runNormalBooking(page, testInfo, "travel_agency_transfer");
});
test("C032 normal insurance /book creates and reloads the same persisted booking snapshot", async ({
  page,
}, testInfo) => {
  await runNormalBooking(page, testInfo, "insurance_replacement_vehicle");
});
