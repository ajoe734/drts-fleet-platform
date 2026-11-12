import {
  expect,
  test,
  type Page,
  type BrowserContext,
  type Response,
  type Browser,
  type TestInfo,
} from "@playwright/test";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  normalisePlatformCurrency,
  type DriverLocationHeartbeatAck,
  type DriverLocationHeartbeatEnvelope,
  type OwnedOrderRecord,
  type PartnerBootstrapSession,
  type PartnerBookingDetails,
} from "@drts/contracts";
import { PARTNER_LOCALE_COOKIE } from "../../apps/partner-booking-web/lib/locale-config";
import { TENANT_SESSION_COOKIE_NAME } from "../../packages/tenant-auth/src/constants";
import { TENANT_LOCALE_COOKIE } from "../../apps/tenant-console-web/lib/locale-config";
import { createJourneyProgress } from "./pax-review-shared-order/progress";
import { createDispatchInOrdinaryWorkspace } from "./pax-review-shared-order/ordinary-ops-dispatch";
import { readAssignedTripAndAccept } from "./pax-review-shared-order/additional-journey";
import {
  NoncoreTravelFixture,
  PARTNER_ORIGIN,
  NONCORE_API,
  camel,
  required,
} from "./pax-review-shared-order/noncore-travel-fixture";

const OPS = "http://127.0.0.1:3202";
const DRIVER = "http://127.0.0.1:3101";
const TENANT = "http://localhost:3004";
const run = promisify(execFile);

async function renewActualFixtureSessions() {
  const directory = await mkdtemp(
    path.join(tmpdir(), "noncore-travel-session-"),
  );
  try {
    const file = path.join(directory, "sessions.json");
    await run("./apps/api/node_modules/.bin/tsx", [
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
      if (!sessions[name]) throw new Error("Normal fixture renewal failed");
      process.env[name] = sessions[name];
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function establishNormalPlatformSession() {
  // Existing Admin BFF performs the configured canonical development workforce
  // exchange. The real API issues the JWT; this test never signs an identity.
  const response = await fetch(
    "http://127.0.0.1:3204/control-plane-proxy/auth/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    },
  );
  expect(response.status).toBe(201);
  const issued = camel(await response.json());
  expect(typeof issued.token).toBe("string");
  expect(issued.sessionId).toBeTruthy();
  const verification = await fetch(`${NONCORE_API}/api/auth/session`, {
    headers: { Authorization: `Bearer ${issued.token}` },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  expect(verification.status).toBe(200);
  const session = camel(await verification.json()).data;
  expect(session).toMatchObject({
    active: true,
    identity: {
      realm: "platform",
      actorType: "platform_admin",
      principalId: "principal_platform_admin_default",
    },
  });
  process.env.DRTS_UAT_TOKEN_PLATFORM = issued.token;
}

async function address(
  page: Page,
  index: number,
  query: string,
  label: string,
) {
  const pickers = page.locator("[data-address-map-picker]");
  await expect(pickers).toHaveCount(2);
  const picker = pickers.nth(index);
  await picker
    .getByRole("textbox", { name: "Search address", exact: true })
    .fill(query);
  await picker.getByRole("button", { name: "Search", exact: true }).click();
  await picker.getByRole("button", { name: new RegExp(label) }).click();
}

/** Both wrappers run this same normal booking/lifecycle/invoice journey.
 * Only external program facts and the corresponding normal product vary. */
async function runNormalPartnerJourney(
  browser: Browser,
  info: TestInfo,
  subtype: "travel_agency_transfer" | "insurance_replacement_vehicle",
) {
  const insurance = subtype === "insurance_replacement_vehicle";
  expect(process.env.GITHUB_ACTIONS).toBe("true");
  expect(required("DRTS_UAT_ENV")).toBe("sandbox");
  expect(required("DRTS_UAT_API_URL")).toBe(NONCORE_API);
  expect(required("CANDIDATE_SHA")).toMatch(/^[a-f0-9]{40}$/);
  // The parent's system setup token has a normal fifteen-minute TTL. Exchange
  // normal live workforce authority first; do not feed an expired parent setup
  // token into renewal or weaken the existing durable verification step.
  await establishNormalPlatformSession();
  await renewActualFixtureSessions();
  const fixture = new NoncoreTravelFixture();
  const contexts: BrowserContext[] = [];
  const progress = createJourneyProgress(
    info.outputPath("noncore-safe-progress.json"),
  );
  const step = progress.step;
  const newPage = async () => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "Asia/Taipei",
    });
    contexts.push(context);
    return context.newPage();
  };
  let orderId: string | null = null;
  let stopGpsObservation: (() => void) | null = null;
  let pendingGpsObservation = Promise.resolve();
  try {
    const partner = await newPage(),
      ops = await newPage(),
      driver = await newPage();
    await step(
      insurance
        ? "Activate normal insurance product"
        : "Activate normal travel product",
      () =>
        insurance ? fixture.activateInsurance() : fixture.activateTravel(),
    );
    const supply = await step(
      "Approve durable normal SIM business supply through Fleet and Admin",
      () =>
        insurance
          ? fixture.fleetSupply("insurance_replacement_vehicle")
          : fixture.fleetSupply(),
    );
    const scope = await step(
      insurance
        ? "Create own normal insurance entry and credential"
        : "Create own normal travel entry and credential",
      () => fixture.entry(insurance ? "insurance_company" : "travel_agency"),
    );
    const partnerUserRef = insurance
      ? `SIM-insurance-rider-${randomUUID()}`
      : `SIM-travel-rider-${randomUUID()}`;
    const referenceToken = insurance
      ? `SIM-claim-reference-${randomUUID()}`
      : `SIM-roster-reference-${randomUUID()}`;

    await step(
      "Issue real device invitation and register it in Driver UI",
      async () => {
        const invitation = await fixture.fixture.call<{
          registrationCode: string;
        }>("auth/driver/device/invite", fixture.platform, "POST", {
          driverId: supply.driverId,
        });
        expect(invitation.registrationCode).toBeTruthy();
        await driver.goto(`${DRIVER}/onboarding`);
        await driver
          .getByLabel("裝置註冊碼", { exact: true })
          .fill(invitation.registrationCode);
        const [registered] = await Promise.all([
          driver.waitForResponse(
            (response) =>
              new URL(response.url()).pathname.endsWith(
                "/auth/driver/device/register",
              ) && response.request().method() === "POST",
          ),
          driver
            .getByRole("button", { name: "註冊此裝置", exact: true })
            .click(),
        ]);
        expect(registered.status()).toBe(201);
        await expect(
          driver.getByLabel("裝置註冊碼", { exact: true }),
        ).toHaveCount(0);
        await driver.getByText("任務", { exact: true }).first().click();
        await expect(driver).toHaveURL(/\/jobs$/);
        // Normal device-bound foreground producer sends actual ingestion requests.
        // No registry location or task/tracking facts are written by this test.
        await expect
          .poll(
            async () => {
              const locations = await fixture.fixture.call<{ items: any[] }>(
                "regulatory-registry/driver-locations",
                fixture.platform,
              );
              return locations.items.some(
                (item) =>
                  item.driverId === supply.driverId &&
                  Date.now() - Date.parse(item.recordedAt) < 60_000,
              );
            },
            { timeout: 40_000, intervals: [1000] },
          )
          .toBe(true);
      },
    );

    const declaredFacts = await step(
      "Driver normally saves a declared surname, independently read from PG",
      async () => {
        await test.step("Driver Settings: open the saved-session Settings page", async () => {
          await driver.goto(`${DRIVER}/settings`);
        });
        const surname = driver.getByLabel("姓氏（自行提供）", { exact: true });
        await test.step("Driver Settings: surname field becomes enabled", async () => {
          await expect(surname).toBeEnabled();
        });
        await test.step("Driver Settings: fill the original profile name", async () => {
          await driver
            .getByPlaceholder("司機姓名", { exact: true })
            .fill(
              insurance
                ? "SIM hosted insurance driver"
                : "SIM hosted travel driver",
            );
        });
        await test.step("Driver Settings: fill the declared surname", async () => {
          await surname.fill("演練");
        });
        // Only boolean UI facts: no input values, text dumps, session data or
        // error messages. Diagnostic failure must not replace the real action.
        const saveAvailability = await driver
          .getByRole("button")
          .evaluateAll((buttons) =>
            buttons
              .filter((button) => button.textContent?.includes("儲存設定"))
              .slice(0, 4)
              .map((button) => ({
                explicitLabelMatches:
                  button.getAttribute("aria-label") === "儲存設定",
                visibleTextMatches: button.textContent?.trim() === "儲存設定",
                hasExtraVisibleText: Boolean(
                  button.textContent?.replace("儲存設定", "").trim(),
                ),
                disabled:
                  button.hasAttribute("disabled") ||
                  button.getAttribute("aria-disabled") === "true",
              })),
          )
          .catch(() => null);
        await info
          .attach(
            insurance
              ? "normal-insurance-settings-save-availability"
              : "normal-travel-settings-save-availability",
            {
              contentType: "application/json",
              body: JSON.stringify({ saveAvailability }),
            },
          )
          .catch(() => undefined);
        const [saved] =
          await test.step("Driver Settings: save through the original profile PATCH", async () =>
            Promise.all([
              // Keep the original response listener registered before click.
              driver.waitForResponse(
                (response) =>
                  new URL(response.url()).pathname.endsWith(
                    "/driver/profile",
                  ) && response.request().method() === "PATCH",
              ),
              test.step("Driver Settings: click the original Save settings button", async () => {
                await driver
                  .getByRole("button", { name: "儲存設定", exact: true })
                  .click();
              }),
            ]));
        expect(saved.status()).toBe(200);
        expect(saved.request().postDataJSON()).toMatchObject({
          driverSurname: "演練",
        });
        const profile = camel(await saved.json()).data;
        expect(profile).toMatchObject({
          driverId: supply.driverId,
          driverSurname: "演練",
        });
        const persisted =
          await test.step("Driver Settings: independently read the actual profile and vehicle from PG", async () =>
            fixture.fixture.db.query(
              `SELECT p.record AS profile_record, v.record AS vehicle_record
           FROM ops.phase1_driver_profiles p
           CROSS JOIN reg.phase1_registry_vehicles v
           WHERE p.driver_id=$1 AND v.vehicle_id=$2`,
              [supply.driverId, supply.vehicleId],
            ));
        expect(persisted.rows).toHaveLength(1);
        const row = persisted.rows[0]!;
        expect(row.profile_record).toMatchObject({
          driverId: supply.driverId,
          driverSurname: "演練",
          updatedAt: profile.updatedAt,
        });
        expect(row.vehicle_record).toMatchObject({
          vehicleId: supply.vehicleId,
        });
        expect(row.vehicle_record.plateNo).toBeTruthy();
        return {
          surname: row.profile_record.driverSurname as string,
          profileUpdatedAt: row.profile_record.updatedAt as string,
          plateNo: row.vehicle_record.plateNo as string,
        };
      },
    );
    await partner
      .context()
      .addCookies([
        { name: PARTNER_LOCALE_COOKIE, value: "en", url: PARTNER_ORIGIN },
      ]);
    const details: PartnerBookingDetails = insurance
      ? {
          subtype: "insurance_replacement_vehicle",
          claimNumber: `SIM-CLAIM-${fixture.marker}`,
          policyNumber: `SIM-POLICY-${fixture.marker}`,
          claimReference: `SIM-CASE-${fixture.marker}`,
          claimantName: "SIM Insured Person",
          // Set from the actual browser's reservation window below, before submit.
          replacementStart: "",
          replacementEnd: "",
          replacementVehicleClass: "SIM business replacement vehicle",
          caseHandler: "SIM Case Handler",
        }
      : {
          subtype: "travel_agency_transfer",
          groupCode: `SIM-GROUP-${fixture.marker}`,
          groupSize: 2,
          itineraryLink: `https://travel.example.test/${fixture.marker}`,
          rosterPassengers: ["SIM Traveller One", "SIM Traveller Two"],
          meetingPoint: "SIM Taipei 101 meeting point",
        };
    const dates = await step(
      insurance
        ? "Submit normal insurance form through the real ServerAction"
        : "Submit normal travel form through the real ServerAction",
      async () => {
        const opened = await partner.goto(
          `${PARTNER_ORIGIN}/${scope.entry.entrySlug}/book?${new URLSearchParams({ partnerUserRef, referenceToken })}`,
        );
        expect(opened?.status()).toBe(200);
        await partner
          .getByLabel("Passenger name", { exact: true })
          .fill(
            insurance
              ? "SIM Hosted Insurance Passenger"
              : "SIM Hosted Travel Passenger",
          );
        await partner
          .getByLabel("Passenger phone", { exact: true })
          .fill("0900000036");
        if (details.subtype === "travel_agency_transfer") {
          await partner
            .getByLabel("Group / order reference", { exact: true })
            .fill(details.groupCode);
          await partner.getByLabel("Group seats", { exact: true }).fill("2");
          await partner
            .getByLabel("Itinerary link", { exact: true })
            .fill(details.itineraryLink);
          await partner
            .getByLabel("Passenger roster", { exact: true })
            .fill(details.rosterPassengers.join("\n"));
          await partner
            .getByLabel("Meeting point", { exact: true })
            .fill(details.meetingPoint);
          await partner.getByLabel("Luggage count", { exact: true }).fill("2");
        } else {
          await partner
            .getByLabel("Claim number", { exact: true })
            .fill(details.claimNumber);
          await partner
            .getByLabel("Policy number", { exact: true })
            .fill(details.policyNumber);
          await partner
            .getByLabel("Claim reference", { exact: true })
            .fill(details.claimReference);
          await partner
            .getByLabel("Claimant", { exact: true })
            .fill(details.claimantName);
          await partner
            .getByLabel("Replacement-vehicle class", { exact: true })
            .fill(details.replacementVehicleClass);
          await partner
            .getByLabel("Case handler", { exact: true })
            .fill(details.caseHandler);
        }
        await partner
          .getByLabel("Notes", { exact: true })
          .fill(
            insurance
              ? "SIM external policy, claim facts, qualifications and GPS; normal internal lifecycle/invoice"
              : "SIM external roster, qualifications and GPS; normal internal lifecycle/invoice",
          );
        await address(partner, 0, "taipei 101", "Taipei 101");
        await address(partner, 1, "taipei main", "Taipei Main Station");
        await expect(
          partner.getByText("Inside the service area", { exact: true }),
        ).toBeVisible();
        // Existing API setting is one minute; keep it unchanged. Prepare a valid
        // short-lead new booking and then wait naturally before Driver start.
        const dates = await partner.evaluate(() => {
          const start = new Date(
            Math.ceil((Date.now() + 90_000) / 60_000) * 60_000,
          );
          const end = new Date(start.getTime() + 30 * 60_000);
          const local = (value: Date) => {
            const pad = (x: number) => String(x).padStart(2, "0");
            return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
          };
          return {
            start: local(start),
            end: local(end),
            startISO: start.toISOString(),
            endISO: end.toISOString(),
          };
        });
        if (details.subtype === "insurance_replacement_vehicle") {
          details.replacementStart = dates.startISO;
          details.replacementEnd = dates.endISO;
          await partner
            .getByLabel("Replacement period start", { exact: true })
            .fill(dates.start);
          await partner
            .getByLabel("Replacement period end", { exact: true })
            .fill(dates.end);
        }
        await partner
          .getByLabel("Reservation window start", { exact: true })
          .fill(dates.start);
        await partner
          .getByLabel("Reservation window end", { exact: true })
          .fill(dates.end);
        const submit = partner.getByRole("button", {
          name: "Create booking",
          exact: true,
        });
        await expect(submit).toBeEnabled();
        await submit.click();
        await expect(
          partner.getByTestId("partner-booking-confirmation"),
        ).toContainText("Booking created and read back");
        if (details.subtype === "insurance_replacement_vehicle")
          for (const [key, value] of Object.entries(details))
            if (key !== "subtype")
              await expect(
                partner.getByTestId("partner-booking-confirmation"),
              ).toContainText(value);
        return dates;
      },
    );
    const bookingId = (
      await partner.getByTestId("partner-booking-id").innerText()
    ).trim();
    orderId = (
      await partner.getByTestId("partner-order-id").innerText()
    ).trim();
    expect(bookingId).toMatch(/^booking-[a-f0-9-]{36}$/);
    expect(orderId).toMatch(/^[a-f0-9-]{36}$/);
    const exactOrderId = orderId;
    const before = await fixture.fresh(
      scope,
      partnerUserRef,
      bookingId,
      exactOrderId,
    );
    expect(before.order).toMatchObject({
      orderId: exactOrderId,
      bookingId,
      tenantId: fixture.tenantId,
      businessDispatchSubtype: subtype,
      partnerId: scope.entry.partnerId,
      partnerProgramId: scope.entry.programId,
      partnerEntrySlug: scope.entry.entrySlug,
      partnerBookingDetails: details,
      reservationWindowStart: dates.startISO,
    });
    expect(before.order.eligibilityVerificationId).toBeTruthy();
    expect(before.order.fixedPrice).toBe(true);
    expect(before.order.quotedFare).toBeTruthy();
    const verificationSession =
      await fixture.fixture.call<PartnerBootstrapSession>(
        "auth/partner/bootstrap-session",
        null,
        "POST",
        {
          entrySlug: scope.entry.entrySlug,
          apiKey: scope.apiKey,
        },
      );
    expect(verificationSession.tokenType).toBe("Bearer");
    expect(verificationSession.partnerEntry.entrySlug).toBe(
      scope.entry.entrySlug,
    );
    expect(verificationSession.identity).toMatchObject({
      actorType: "partner_api_key",
      realm: "partner",
      tenantId: fixture.tenantId,
      partnerId: scope.entry.partnerId,
      partnerProgramId: scope.entry.programId,
      partnerEntrySlug: scope.entry.entrySlug,
    });
    expect(verificationSession.identity.scopes).toContain(
      "partner:eligibility:read",
    );
    const verification = await fixture.fixture.call<any>(
      `partner/eligibility/${encodeURIComponent(before.order.eligibilityVerificationId)}`,
      verificationSession.accessToken,
      "GET",
      undefined,
      fixture.tenantId,
    );
    expect(verification).toMatchObject({
      verificationStatus: "eligible",
      partnerEntrySlug: scope.entry.entrySlug,
      partnerProgramId: scope.entry.programId,
      businessDispatchSubtype: subtype,
    });

    const confirmationPath = `/${encodeURIComponent(scope.entry.entrySlug)}/confirmed`;
    await step(
      "Partner opens the created booking's normal confirmation link",
      async () => {
        await partner
          .getByTestId("partner-booking-confirmation")
          .getByRole("link", { name: "Booking confirmation", exact: true })
          .click();
        await expect(partner).toHaveURL(
          (url) =>
            url.pathname === confirmationPath &&
            url.searchParams.get("bookingId") === bookingId &&
            url.searchParams.get("orderId") === exactOrderId &&
            url.searchParams.get("partnerUserRef") === partnerUserRef,
        );
      },
    );

    const created = await step(
      "Create dispatch from the ordinary Ops page for this exact order",
      () => createDispatchInOrdinaryWorkspace(ops, OPS, exactOrderId, info),
    );
    const opsFulfillment = ops.locator(
      `[data-ops-fulfillment-order-id="${exactOrderId}"]`,
    );
    await expect(opsFulfillment).toHaveAttribute(
      "data-ops-fulfillment-subtype",
      subtype,
    );
    if (details.subtype === "travel_agency_transfer") {
      for (const value of [
        details.groupCode,
        details.meetingPoint,
        ...details.rosterPassengers,
      ])
        await expect(opsFulfillment).toContainText(value);
    } else {
      for (const value of [
        details.claimNumber,
        details.claimantName,
        details.replacementVehicleClass,
        details.caseHandler,
      ])
        await expect(opsFulfillment).toContainText(value);
      // Ops deliberately renders this existing fulfillment window in UTC.
      const opsLocale = await ops.locator("html").getAttribute("lang");
      for (const value of [details.replacementStart, details.replacementEnd]) {
        const displayed = new Intl.DateTimeFormat(
          opsLocale === "zh" ? "zh-TW" : "en-US",
          {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "UTC",
          },
        )
          .format(new Date(value))
          .replace(",", "");
        await expect(
          opsFulfillment.getByText(displayed, { exact: true }),
        ).toBeVisible();
      }
    }
    const assigned = await step(
      "Ordinary Ops assigns an actually returned normal business candidate",
      async () => {
        const candidate = ops.locator("select[data-drt-dispatch-candidate]");
        const value = `${supply.driverId}:${supply.vehicleId}`;
        await expect(candidate.locator(`option[value="${value}"]`)).toHaveCount(
          1,
        );
        await candidate.selectOption(value);
        const [response] = await Promise.all([
          ops.waitForResponse(
            (item) =>
              new URL(item.url()).pathname ===
                "/control-plane-proxy/dispatch/assign" &&
              item.request().method() === "POST",
          ),
          ops.locator('[data-drt-operation="ops-dispatch-assign"]').click(),
        ]);
        expect(response.status()).toBe(201);
        expect(response.request().postDataJSON()).toMatchObject({
          driverId: supply.driverId,
          vehicleId: supply.vehicleId,
          dispatchJobId: created.dispatchJobId,
        });
        const result = camel(await response.json()).data;
        expect(result.assignmentId).toBeTruthy();
        expect(result.taskId).toBeTruthy();
        await expect(
          ops.locator(`[data-ops-task-id="${result.taskId}"]`),
        ).toBeVisible();
        return result as { taskId: string; assignmentId: string };
      },
    );
    // Observe the registered device's normal producer. This observer never sends
    // heartbeats, changes its clock, pauses the SIM track or writes tracking rows.
    const observedGps = new Map<
      string,
      {
        event: DriverLocationHeartbeatEnvelope;
        ack: DriverLocationHeartbeatAck;
        httpStatus: number;
      }
    >();
    const gpsObservationErrors: string[] = [];
    const observeGps = (response: Response) => {
      const url = new URL(response.url());
      if (
        url.origin !== NONCORE_API ||
        url.pathname !== "/api/driver/location-heartbeats/batch" ||
        response.request().method() !== "POST"
      )
        return;
      // Consume the returned chain, including rejection; do not create an
      // unobserved rejected finally() promise alongside the actual response.
      pendingGpsObservation = pendingGpsObservation
        .then(async () => {
          const request = camel(response.request().postDataJSON()) as {
            items: DriverLocationHeartbeatEnvelope[];
          };
          const reply = camel(await response.json()).data as {
            items: DriverLocationHeartbeatAck[];
          };
          for (const event of request.items) {
            if (
              event.driverId !== supply.driverId ||
              event.taskId !== assigned.taskId ||
              event.vehicleId !== supply.vehicleId ||
              event.workState !== "on_trip"
            )
              continue;
            const ack = reply.items.find(
              (item) => item.eventId === event.eventId,
            );
            const previous = observedGps.get(event.eventId);
            if (
              ack &&
              (!previous ||
                (!previous.ack.currentLocationUpdated &&
                  ack.currentLocationUpdated))
            )
              observedGps.set(event.eventId, {
                event,
                ack,
                httpStatus: response.status(),
              });
          }
        })
        .catch((error: unknown) => {
          // No response bodies, credentials, messages or stacks in diagnostics.
          gpsObservationErrors.push(
            error instanceof Error ? error.name : "unknown",
          );
        });
    };
    driver.on("response", observeGps);
    stopGpsObservation = () => driver.off("response", observeGps);
    const assertPartnerProgress = async (
      stage:
        | "accepted"
        | "enroute_pickup"
        | "arrived_pickup"
        | "on_trip"
        | "completed",
    ) => {
      await step(
        `Partner normally refreshes and reads same-order ${stage}`,
        async () => {
          const stageLabels = {
            accepted: "Driver accepted",
            enroute_pickup: "Driver travelling to pickup",
            arrived_pickup: "Driver arrived at pickup",
            on_trip: "Passenger on board",
            completed: "Trip completed",
          };
          const gpsLabels: Record<string, string> = {
            fresh: "A fresh sample matches this task and vehicle",
            missing: "No GPS sample is provided",
            stale: "The GPS sample is stale",
            low_accuracy: "The GPS sample has insufficient accuracy",
            context_mismatch: "No GPS sample matches this task and vehicle",
            not_live: "No active trip location is provided",
          };
          const read = async () => {
            const actual = await fixture.fresh(
              scope,
              partnerUserRef,
              bookingId,
              exactOrderId,
            );
            expect(actual.order.status).toBe(
              stage === "accepted" ? "driver_accepted" : stage,
            );
            const projected = actual.order.progress;
            expect(projected).toMatchObject({
              orderId: exactOrderId,
              orderStatus: actual.order.status,
              availability: "available",
              reason: null,
              currentTask: {
                taskId: assigned.taskId,
                assignmentId: assigned.assignmentId,
                dispatchJobId: created.dispatchJobId,
                driverId: supply.driverId,
                vehicleId: supply.vehicleId,
                status: stage,
              },
              driver: {
                driverId: supply.driverId,
                driverSurname: declaredFacts.surname,
                driverSurnameSource: "driver_profile_declared",
                driverSurnameProfileUpdatedAt: declaredFacts.profileUpdatedAt,
              },
              vehicle: {
                vehicleId: supply.vehicleId,
                plateNo: declaredFacts.plateNo,
              },
            });
            expect(
              stage === "completed"
                ? ["not_live"]
                : [
                    "fresh",
                    "missing",
                    "stale",
                    "low_accuracy",
                    "context_mismatch",
                  ],
            ).toContain(projected.location.status);
            if (projected.location.status === "fresh") {
              expect(Number.isFinite(projected.location.position?.lat)).toBe(
                true,
              );
              expect(Number.isFinite(projected.location.position?.lng)).toBe(
                true,
              );
              expect(
                Date.parse(projected.readAt) -
                  Date.parse(projected.location.updatedAt),
              ).toBeLessThanOrEqual(90_000);
              if (projected.location.accuracyM !== null)
                expect(projected.location.accuracyM).toBeLessThanOrEqual(100);
            } else expect(projected.location.position).toBeNull();
            return projected;
          };
          // Independent API/SSR reads can see a heartbeat between location/event
          // writes (including fresh -> mismatch -> fresh). Check each API read's
          // own semantics and explicit UI availability, never cross-read equality.
          const beforeRefresh = await read();
          const panel = partner.getByTestId("partner-trip-progress");
          const [navigation] = await Promise.all([
            partner.waitForResponse(
              (response) =>
                response.request().isNavigationRequest() &&
                new URL(response.url()).pathname === confirmationPath,
            ),
            panel
              .getByRole("link", { name: "Update trip", exact: true })
              .click(),
          ]);
          expect(navigation.status()).toBe(200);
          await partner.waitForLoadState("domcontentloaded");
          const afterRefresh = await read();
          await expect(
            partner.getByTestId("partner-persisted-booking"),
          ).toHaveAttribute("data-booking-id", bookingId);
          await expect(
            partner.getByTestId("partner-persisted-booking"),
          ).toHaveAttribute("data-order-id", exactOrderId);
          await expect(panel).toHaveAttribute("data-order-id", exactOrderId);
          await expect(panel).toHaveAttribute("data-task-id", assigned.taskId);
          await expect(panel).toHaveAttribute(
            "data-driver-id",
            supply.driverId,
          );
          await expect(panel).toHaveAttribute(
            "data-vehicle-id",
            supply.vehicleId,
          );
          const field = (label: string) =>
            panel
              .locator("dl > div")
              .filter({
                has: partner
                  .locator("dt")
                  .filter({ hasText: new RegExp(`^${label}$`) }),
              })
              .locator("dd");
          await expect(field("Current trip stage")).toHaveText(
            stageLabels[stage],
          );
          await expect(field("Declared driver surname")).toHaveText(
            declaredFacts.surname,
          );
          await expect(field("Vehicle plate")).toHaveText(
            declaredFacts.plateNo,
          );
          for (const [key, label] of [
            ["acceptedAt", "Driver accepted at"],
            ["departedAt", "Driver departed at"],
            ["arrivedPickupAt", "Driver arrived at pickup"],
            ["startedAt", "Passenger boarded at"],
            ["completedAt", "Trip completed at"],
          ] as const)
            await expect(field(label)).toHaveText(
              afterRefresh.currentTask[key] || "Not provided",
            );
          const renderedGps = (
            await field("GPS sample availability").innerText()
          ).trim();
          expect(
            stage === "completed"
              ? [gpsLabels.not_live]
              : Object.entries(gpsLabels)
                  .filter(([status]) => status !== "not_live")
                  .map(([, label]) => label),
          ).toContain(renderedGps);
          await expect(
            panel.getByText(
              "Use Update trip to read the current order again. This is not an automatic live map or an ETA.",
              { exact: true },
            ),
          ).toBeVisible();
          await expect(
            panel.getByText(
              "The surname is self-declared profile data, not verification of legal identity. Missing driver or vehicle facts are not inferred.",
              { exact: true },
            ),
          ).toBeVisible();
          await info.attach(`normal-partner-progress-${stage}`, {
            contentType: "application/json",
            body: JSON.stringify(
              {
                orderId: exactOrderId,
                bookingId,
                taskId: assigned.taskId,
                assignmentId: assigned.assignmentId,
                dispatchJobId: created.dispatchJobId,
                driverId: supply.driverId,
                vehicleId: supply.vehicleId,
                stage,
                declaredSurname: declaredFacts.surname,
                plateNo: declaredFacts.plateNo,
                apiGpsBefore: beforeRefresh.location.status,
                apiGpsAfter: afterRefresh.location.status,
                renderedGps,
                afterApiPositionProvided:
                  afterRefresh.location.position !== null,
                crossReadGpsConsistency:
                  "not asserted for independent API/SSR reads",
                externalPosition:
                  "existing explicit SIM track, not physical GPS",
                noEtaInferred: true,
              },
              null,
              2,
            ),
          });
        },
      );
    };
    await readAssignedTripAndAccept(
      driver,
      DRIVER,
      exactOrderId,
      step,
      assigned.taskId,
    );
    await assertPartnerProgress("accepted");
    const driverFulfillment = driver.getByTestId("driver-partner-fulfillment");
    if (details.subtype === "travel_agency_transfer") {
      for (const value of [
        details.groupCode,
        details.meetingPoint,
        ...details.rosterPassengers,
      ])
        await expect(driverFulfillment).toContainText(value);
    } else {
      for (const value of [
        details.claimNumber,
        details.claimantName,
        details.replacementVehicleClass,
        details.caseHandler,
      ])
        await expect(driverFulfillment).toContainText(value);
      for (const value of [details.replacementStart, details.replacementEnd])
        await expect(
          driverFulfillment.getByText(
            new Date(value).toISOString().replace("T", " ").slice(0, 16),
            { exact: true },
          ),
        ).toBeVisible();
    }
    for (const [label, action] of [
      ["前往接送點", "depart"],
      ["抵達上車點", "arrived_pickup"],
      ["開始行程", "start"],
    ] as const) {
      if (action === "start")
        await expect
          .poll(() => Date.now(), { timeout: 180_000, intervals: [1000] })
          .toBeGreaterThanOrEqual(Date.parse(dates.startISO));
      await step(`Normal Driver ${action}`, async () => {
        const [response] = await Promise.all([
          driver.waitForResponse(
            (item) =>
              new URL(item.url()).pathname.endsWith(
                `/driver/tasks/${assigned.taskId}/${action}`,
              ) && item.request().method() === "POST",
          ),
          driver.getByRole("button", { name: label, exact: true }).click(),
        ]);
        expect(response.status()).toBe(201);
      });
      await assertPartnerProgress(
        action === "depart"
          ? "enroute_pickup"
          : action === "arrived_pickup"
            ? "arrived_pickup"
            : "on_trip",
      );
    }
    await step(
      "Normal Driver batch persists precise same-task vehicle GPS and Partner reads a fresh sample",
      async () => {
        // API/SSR/current-row reads are independent and can advance normally.
        // The SQL current/event JOIN is exact at database precision in ONE read;
        // later API/SSR samples each match their own observed immutable event.
        const facts: Record<string, unknown> = {
          externalPosition: "existing explicit SIM track, not physical GPS",
          context: {
            orderId: exactOrderId,
            bookingId,
            taskId: assigned.taskId,
            driverId: supply.driverId,
            vehicleId: supply.vehicleId,
          },
          crossReadExactSampleEquality: false,
          noEtaInferred: true,
        };
        const acceptedObservation = (eventId: string) => {
          const observation = observedGps.get(eventId);
          return observation?.httpStatus === 201 &&
            observation.ack.accepted &&
            observation.ack.currentLocationUpdated &&
            !observation.ack.duplicate
            ? observation
            : null;
        };
        const readEvent = async (eventId: string) => {
          const result = await fixture.fixture.db.query(
            `SELECT event_id, device_id, driver_id, vehicle_id, task_id,
                    sequence_no::text, lat, lng, accuracy_m, work_state,
                    received_at <> date_trunc('milliseconds', received_at)
                      AS has_submillisecond_precision,
                    EXISTS (
                      SELECT 1 FROM ops.phase1_driver_locations l
                      WHERE l.driver_id = e.driver_id
                        AND l.recorded_at = e.recorded_at
                        AND l.updated_at = e.received_at
                        AND l.lat = e.lat AND l.lng = e.lng
                        AND l.accuracy_m IS NOT DISTINCT FROM e.accuracy_m
                    ) AS still_current_when_event_read,
                    to_char(recorded_at AT TIME ZONE 'UTC',
                            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS recorded_at,
                    to_char(received_at AT TIME ZONE 'UTC',
                            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS received_at
             FROM telemetry.driver_location_events e WHERE event_id = $1`,
            [eventId],
          );
          return result.rows[0];
        };
        const assertPersistedObservation = async (
          observation: NonNullable<ReturnType<typeof acceptedObservation>>,
        ) => {
          const row = await readEvent(observation.event.eventId);
          if (!row)
            throw new Error("Normal Driver GPS event is not persisted.");
          expect(row).toMatchObject({
            event_id: observation.event.eventId,
            device_id: observation.event.deviceId,
            driver_id: supply.driverId,
            task_id: assigned.taskId,
            vehicle_id: supply.vehicleId,
            sequence_no: String(observation.event.sequenceNo),
            work_state: "on_trip",
            lat: observation.event.lat,
            lng: observation.event.lng,
            accuracy_m: observation.event.accuracyM,
            recorded_at: observation.event.recordedAt,
            received_at: observation.ack.serverReceivedAt,
          });
          return row;
        };
        try {
          await expect
            .poll(
              async () => {
                await pendingGpsObservation;
                const result = await fixture.fixture.db.query(
                  `SELECT e.event_id, e.device_id, e.sequence_no::text,
                          e.received_at::text AS received_at_database,
                          l.updated_at::text AS updated_at_database,
                          e.received_at <> date_trunc('milliseconds', e.received_at)
                            AS has_submillisecond_precision,
                          e.received_at = l.updated_at AS exact_current_event_join
                   FROM ops.phase1_driver_locations l
                   JOIN telemetry.driver_location_events e
                     ON e.driver_id = l.driver_id
                    AND e.recorded_at = l.recorded_at
                    AND e.received_at = l.updated_at
                    AND e.lat = l.lat AND e.lng = l.lng
                    AND e.accuracy_m IS NOT DISTINCT FROM l.accuracy_m
                   WHERE e.driver_id = $1 AND e.task_id = $2 AND e.vehicle_id = $3
                     AND e.work_state = 'on_trip'
                     AND e.received_at <> date_trunc('milliseconds', e.received_at)
                   ORDER BY e.sequence_no DESC LIMIT 1`,
                  [supply.driverId, assigned.taskId, supply.vehicleId],
                );
                const current = result.rows[0];
                facts.currentDatabaseSample = current ?? null;
                const observation = current
                  ? acceptedObservation(current.event_id)
                  : null;
                if (!observation) return false;
                await assertPersistedObservation(observation);
                expect(current).toMatchObject({
                  device_id: observation.event.deviceId,
                  sequence_no: String(observation.event.sequenceNo),
                  has_submillisecond_precision: true,
                  exact_current_event_join: true,
                });
                facts.normalBatch = observation;
                return true;
              },
              { timeout: 40_000, intervals: [1000] },
            )
            .toBe(true);
          await expect
            .poll(
              async () => {
                const actual = await fixture.fresh(
                  scope,
                  partnerUserRef,
                  bookingId,
                  exactOrderId,
                );
                const projected = actual.order.progress;
                facts.apiLocation = projected.location;
                expect(projected).toMatchObject({
                  orderId: exactOrderId,
                  orderStatus: "on_trip",
                  availability: "available",
                  currentTask: {
                    taskId: assigned.taskId,
                    driverId: supply.driverId,
                    vehicleId: supply.vehicleId,
                    status: "on_trip",
                  },
                });
                if (projected.location.status !== "fresh") return false;
                await pendingGpsObservation;
                const observation = [...observedGps.values()].find(
                  (item) =>
                    acceptedObservation(item.event.eventId) &&
                    item.event.recordedAt === projected.location.recordedAt &&
                    item.ack.serverReceivedAt === projected.location.updatedAt,
                );
                if (!observation) return false;
                const apiEvent = await assertPersistedObservation(observation);
                expect(apiEvent.has_submillisecond_precision).toBe(true);
                facts.apiEvent = apiEvent;
                expect(projected.location.position).toEqual({
                  lat: observation.event.lat,
                  lng: observation.event.lng,
                });
                expect(projected.location.accuracyM).toBe(
                  observation.event.accuracyM,
                );
                expect(Number.isFinite(projected.location.position.lat)).toBe(
                  true,
                );
                expect(Number.isFinite(projected.location.position.lng)).toBe(
                  true,
                );
                expect(
                  Date.parse(projected.readAt) -
                    Date.parse(projected.location.updatedAt),
                ).toBeLessThanOrEqual(90_000);
                if (projected.location.accuracyM !== null)
                  expect(projected.location.accuracyM).toBeLessThanOrEqual(100);
                facts.apiEventId = observation.event.eventId;
                return true;
              },
              { timeout: 40_000, intervals: [1000] },
            )
            .toBe(true);
          await expect
            .poll(
              async () => {
                const panel = partner.getByTestId("partner-trip-progress");
                const [navigation] = await Promise.all([
                  partner.waitForResponse(
                    (response) =>
                      response.request().isNavigationRequest() &&
                      new URL(response.url()).pathname === confirmationPath,
                  ),
                  panel
                    .getByRole("link", { name: "Update trip", exact: true })
                    .click(),
                ]);
                expect(navigation.status()).toBe(200);
                await partner.waitForLoadState("domcontentloaded");
                await expect(panel).toHaveAttribute(
                  "data-order-id",
                  exactOrderId,
                );
                await expect(panel).toHaveAttribute(
                  "data-task-id",
                  assigned.taskId,
                );
                await expect(panel).toHaveAttribute(
                  "data-driver-id",
                  supply.driverId,
                );
                await expect(panel).toHaveAttribute(
                  "data-vehicle-id",
                  supply.vehicleId,
                );
                const field = (label: string) =>
                  panel
                    .locator("dl > div")
                    .filter({
                      has: partner
                        .locator("dt")
                        .filter({ hasText: new RegExp(`^${label}$`) }),
                    })
                    .locator("dd");
                await expect(field("Current trip stage")).toHaveText(
                  "Passenger on board",
                );
                const availability = (
                  await field("GPS sample availability").innerText()
                ).trim();
                const recordedAt = (
                  await field("GPS sample recorded at").innerText()
                ).trim();
                facts.ssrSample = { availability, recordedAt };
                if (
                  availability !==
                  "A fresh sample matches this task and vehicle"
                )
                  return false;
                await pendingGpsObservation;
                const observation = [...observedGps.values()].find(
                  (item) =>
                    acceptedObservation(item.event.eventId) &&
                    item.event.recordedAt === recordedAt,
                );
                if (!observation) return false;
                const ssrEvent = await assertPersistedObservation(observation);
                expect(ssrEvent.has_submillisecond_precision).toBe(true);
                const snapshot = panel.getByTestId("partner-position-snapshot");
                await expect(snapshot).toHaveAttribute(
                  "data-position-recorded-at",
                  recordedAt,
                );
                await expect(snapshot).toHaveAttribute(
                  "data-position-lat",
                  String(observation.event.lat),
                );
                await expect(snapshot).toHaveAttribute(
                  "data-position-lng",
                  String(observation.event.lng),
                );
                await expect(
                  snapshot.getByTestId("partner-driver-coordinate"),
                ).toHaveText(
                  `${observation.event.lat}, ${observation.event.lng}`,
                );
                await expect(
                  snapshot.getByRole("img", {
                    name: "Driver and trip point coordinate diagram",
                    exact: true,
                  }),
                ).toBeVisible();
                await expect(
                  snapshot.locator('g[aria-label="Driver sample position"]'),
                ).toHaveCount(1);
                await expect(
                  snapshot.getByText(
                    "Coordinate diagram only; not a road route or an ETA.",
                    { exact: true },
                  ),
                ).toBeVisible();
                facts.ssrPositionDiagram = {
                  recordedAt,
                  lat: observation.event.lat,
                  lng: observation.event.lng,
                  sourceEventId: observation.event.eventId,
                  externalGps: "SIM normal Driver producer",
                };
                facts.ssrEvent = ssrEvent;
                facts.ssrEventId = observation.event.eventId;
                return true;
              },
              { timeout: 40_000, intervals: [1000] },
            )
            .toBe(true);
        } finally {
          facts.observedSameContextEvents = observedGps.size;
          facts.safeObservationErrorNames = gpsObservationErrors;
          await info.attach(
            "normal-Driver-GPS-batch-PG-Partner-fresh-context",
            {
              contentType: "application/json",
              body: JSON.stringify(facts, null, 2),
            },
          );
        }
      },
    );
    await step(
      "Use actual tracked duration and normal required proof upload",
      async () => {
        await expect(driver.getByText(/0\.[2-9]\d km/).first()).toBeVisible({
          timeout: 40_000,
        });
        const duration = driver
          .getByText("時長", { exact: true })
          .locator("..")
          .getByText(/^\d{2}:\d{2}:\d{2}$/);
        await expect
          .poll(
            async () => {
              const [h, m, s] = (await duration.innerText())
                .split(":")
                .map(Number);
              return h! * 3600 + m! * 60 + s!;
            },
            { timeout: 30_000, intervals: [1000] },
          )
          .toBeGreaterThan(20);
        const proof = (before.order as OwnedOrderRecord).proofRequirements;
        expect(proof.minPhotoCount).toBeGreaterThan(0);
        expect(proof.minPhotoCount).toBeLessThanOrEqual(5);
        expect(proof.expenseProofRequired).toBe(false);
        const photo =
          "apps/driver-app/android/app/src/main/res/drawable-mdpi/splashscreen_logo.png";
        for (let index = 0; index < proof.minPhotoCount; index += 1) {
          const [chooser] = await Promise.all([
            driver.waitForEvent("filechooser"),
            driver
              .getByRole("button", { name: "從相簿選取", exact: true })
              .click(),
          ]);
          await chooser.setFiles(photo);
          await expect(
            driver.getByRole("button", { name: "移除", exact: true }),
          ).toHaveCount(index + 1);
        }
        if (proof.signoffRequired)
          await driver
            .getByPlaceholder("乘客簽收或簽收單號", { exact: true })
            .fill(`SIM-SIGNOFF-${fixture.marker}`);
      },
    );
    await step("Driver normally completes the exact task", async () => {
      const complete = driver.getByRole("button", {
        name: "完成行程",
        exact: true,
      });
      await expect(complete).toBeEnabled();
      const [response] = await Promise.all([
        driver.waitForResponse(
          (item) =>
            new URL(item.url()).pathname.endsWith(
              `/driver/tasks/${assigned.taskId}/complete`,
            ) && item.request().method() === "POST",
        ),
        complete.click(),
      ]);
      expect(response.status()).toBe(201);
    });
    await assertPartnerProgress("completed");
    const pg = await fixture.fixture.db.query(
      `
      SELECT o.record AS order_record, j.record AS job_record,
             a.record AS assignment_record, t.record AS task_record
      FROM ops.phase1_owned_orders o
      JOIN ops.phase1_dispatch_jobs j ON j.order_id=o.order_id
      JOIN ops.phase1_dispatch_assignments a ON a.order_id=o.order_id AND a.dispatch_job_id=j.dispatch_job_id
      JOIN ops.phase1_driver_tasks t ON t.order_id=o.order_id AND t.assignment_id=a.assignment_id
      WHERE o.order_id=$1 AND j.dispatch_job_id=$2 AND a.assignment_id=$3 AND t.task_id=$4`,
      [
        exactOrderId,
        created.dispatchJobId,
        assigned.assignmentId,
        assigned.taskId,
      ],
    );
    expect(pg.rows).toHaveLength(1);
    const row = pg.rows[0]!;
    const task = row.task_record;
    expect(row.order_record).toMatchObject({
      orderId: exactOrderId,
      bookingId,
      status: "completed",
      tenantId: fixture.tenantId,
      partnerEntrySlug: scope.entry.entrySlug,
      partnerBookingDetails: details,
    });
    expect(row.job_record).toMatchObject({
      orderId: exactOrderId,
      dispatchJobId: created.dispatchJobId,
    });
    expect(row.assignment_record).toMatchObject({
      assignmentId: assigned.assignmentId,
      orderId: exactOrderId,
      driverId: supply.driverId,
      vehicleId: supply.vehicleId,
      status: "completed",
    });
    expect(task).toMatchObject({
      taskId: assigned.taskId,
      assignmentId: assigned.assignmentId,
      orderId: exactOrderId,
      driverId: supply.driverId,
      vehicleId: supply.vehicleId,
      status: "completed",
    });
    expect(task.fare).not.toBeNull();
    expect(task.fare.amountMinor).toBeGreaterThanOrEqual(0);
    expect(task.actualDistanceKm).toBeGreaterThan(0);
    expect(task.actualDurationSec).toBeGreaterThan(20);
    expect(Date.parse(task.completedAt)).toBeGreaterThan(
      Date.parse(task.startedAt),
    );
    expect(task.proof.photos).toHaveLength(
      before.order.proofRequirements.minPhotoCount,
    );
    if (before.order.proofRequirements.signoffRequired)
      expect(task.proof.signatureId).toBe(`SIM-SIGNOFF-${fixture.marker}`);

    const completed = await fixture.fresh(
      scope,
      partnerUserRef,
      bookingId,
      exactOrderId,
    );
    expect(completed.receipt.completion).toMatchObject({
      taskId: assigned.taskId,
      assignmentId: assigned.assignmentId,
      dispatchJobId: created.dispatchJobId,
      actualFare: task.fare,
      completedAt: task.completedAt,
    });
    expect(completed.receipt.payment.availability).toBe("not_recorded");
    const receiptUrl = `${PARTNER_ORIGIN}/${scope.entry.entrySlug}/receipt?${new URLSearchParams({ partnerUserRef, bookingId, orderId: exactOrderId })}`;
    const assertReceiptUi = async () => {
      const receipt = partner.getByTestId("partner-payment-receipt");
      await expect(receipt).toHaveAttribute("data-order-id", exactOrderId);
      await expect(receipt).toHaveAttribute("data-booking-id", bookingId);
      await expect(receipt.getByTestId("partner-task-fare")).toHaveAttribute(
        "data-task-id",
        assigned.taskId,
      );
      await expect(receipt.getByTestId("partner-actual-fare")).toHaveText(
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: normalisePlatformCurrency(task.fare.currency),
        }).format(task.fare.amountMinor / 100),
      );
      await expect(
        receipt.getByTestId("partner-passenger-payment"),
      ).toHaveAttribute("data-payment-availability", "not_recorded");
    };
    await step(
      "Normal Partner reopens and reloads the actual completed receipt",
      async () => {
        const opened = await partner.goto(receiptUrl);
        expect(opened?.status()).toBe(200);
        await assertReceiptUi();
        const reloaded = await partner.reload();
        expect(reloaded?.status()).toBe(200);
        await assertReceiptUi();
      },
    );
    const fresh = await fixture.fresh(
      scope,
      partnerUserRef,
      bookingId,
      exactOrderId,
    );
    expect(fresh.receipt.completion).toEqual(completed.receipt.completion);

    const invoice = await step(
      "Generate normal tenant invoice for the actual completed order",
      async () => {
        const start = new Date(task.completedAt);
        start.setUTCHours(0, 0, 0, 0);
        const periodEnd = new Date(Date.now() - 1).toISOString();
        expect(Date.parse(periodEnd)).toBeGreaterThan(
          Date.parse(task.completedAt),
        );
        const tenant = await newPage();
        // Reuse this journey's normally issued and durably verified tenant
        // fixture session. This exercises the normal cookie/SSR/action path,
        // not the external Tenant OIDC login flow or a second invoice writer.
        await tenant.context().addCookies([
          {
            name: TENANT_SESSION_COOKIE_NAME,
            value: fixture.tenantToken,
            url: TENANT,
            httpOnly: true,
            sameSite: "Lax",
          },
          { name: TENANT_LOCALE_COOKIE, value: "en", url: TENANT },
        ]);
        const opened = await tenant.goto(`${TENANT}/billing`);
        expect(opened?.status()).toBe(200);
        await expect(tenant).toHaveURL(
          (url) => url.origin === TENANT && url.pathname === "/billing",
        );
        const generation = tenant.getByRole("form", {
          name: "Generate invoice",
          exact: true,
        });
        await expect(generation).toBeVisible();
        // These controls explicitly use Taipei wall-clock time. Preserve the
        // existing closed UTC window, including its millisecond end boundary.
        const taipeiLocal = (instant: string) => {
          const local = new Date(Date.parse(instant) + 8 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, -1);
          // Match datetime-local's shortest normalized value. Keep every
          // significant millisecond; Playwright rejects a value the input trims.
          return local
            .replace(/(\.\d*?)0+$/, "$1")
            .replace(/\.$/, "")
            .replace(/:00$/, "");
        };
        await generation
          .getByLabel("Period start (Taipei time)", { exact: true })
          .fill(taipeiLocal(start.toISOString()));
        await generation
          .getByLabel("Period end (Taipei time)", { exact: true })
          .fill(taipeiLocal(periodEnd));
        await Promise.all([
          tenant.waitForURL(
            (url) =>
              url.origin === TENANT &&
              url.pathname === "/invoices" &&
              Boolean(url.searchParams.get("invoiceId")),
          ),
          generation
            .getByRole("button", { name: "Generate invoice", exact: true })
            .click(),
        ]);
        const generatedInvoiceId = new URL(tenant.url()).searchParams.get(
          "invoiceId",
        );
        expect(generatedInvoiceId).toBeTruthy();
        if (!generatedInvoiceId)
          throw new Error("Normal Generate UI did not return an invoice ID");
        const invoicePage = await tenant.reload();
        expect(invoicePage?.status()).toBe(200);
        await expect(tenant).toHaveURL(
          (url) =>
            url.origin === TENANT &&
            url.pathname === "/invoices" &&
            url.searchParams.get("invoiceId") === generatedInvoiceId,
        );
        const selected = tenant
          .getByText("Selected invoice", { exact: true })
          .locator("xpath=ancestor::section[1]");
        await expect(selected).toHaveCount(1);
        await expect(selected).toBeVisible();
        // The picker Link also repeats this ID. Require the original detail
        // title div itself, so a different selected invoice cannot pass.
        const detailTitle = selected
          .getByText(generatedInvoiceId, { exact: true })
          .and(selected.locator("div"));
        await expect(detailTitle).toHaveCount(1);
        await expect(detailTitle).toBeVisible();
        const context = tenant
          .getByText("Cross-app context", { exact: true })
          .locator("xpath=ancestor::section[1]");
        await expect(context).toHaveCount(1);
        const tenantLine = context
          .getByText(`orderId: ${exactOrderId}`, { exact: true })
          .locator("xpath=../..");
        await expect(tenantLine).toHaveCount(1);
        await expect(tenantLine).toBeVisible();
        // Generate's ServerAction exposes only the real returned ID. Read its
        // full record through the existing tenant GET; this is not a fabricated
        // POST response, and no API Generate request is issued by the test.
        const issued = await fixture.fixture.call<any>(
          `tenant/invoices/${encodeURIComponent(generatedInvoiceId)}`,
          fixture.tenantToken,
          "GET",
          undefined,
          fixture.tenantId,
        );
        expect(issued.invoiceId).toBe(generatedInvoiceId);
        expect(issued.periodStart).toBe(start.toISOString());
        expect(issued.periodEnd).toBe(periodEnd);
        const tenantMoney = (amount: {
          currency: string;
          amountMinor: number;
        }) =>
          `${amount.currency === "TWD" ? "NT$" : amount.currency} ${new Intl.NumberFormat(
            "en-US",
            { maximumFractionDigits: 0 },
          ).format(amount.amountMinor / 100)}`;
        await expect(
          selected.locator("dl").getByText(tenantMoney(issued.amount), {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          tenantLine.getByText(tenantMoney(task.fare), { exact: true }),
        ).toBeVisible();
        const read = await fixture.fixture.call<any>(
          `tenant/invoices/${encodeURIComponent(issued.invoiceId)}`,
          fixture.tenantToken,
          "GET",
          undefined,
          fixture.tenantId,
        );
        expect(read.invoiceId).toBe(issued.invoiceId);
        const stored = await fixture.fixture.db.query(
          "SELECT record FROM billing.phase1_tenant_invoices WHERE tenant_id=$1 AND invoice_id=$2",
          [fixture.tenantId, issued.invoiceId],
        );
        expect(stored.rows).toHaveLength(1);
        expect(stored.rows[0]!.record).toMatchObject({
          invoiceId: issued.invoiceId,
          tenantId: fixture.tenantId,
        });
        const expected = {
          orderId: exactOrderId,
          businessDispatchSubtype: subtype,
          partnerId: scope.entry.partnerId,
          partnerProgramId: scope.entry.programId,
          partnerEntrySlug: scope.entry.entrySlug,
          eligibilityVerificationId: before.order.eligibilityVerificationId,
          amount: task.fare,
        };
        for (const actual of [issued, read, stored.rows[0]!.record]) {
          const lines = actual.lines.filter(
            (line: any) => line.orderId === exactOrderId,
          );
          expect(lines).toHaveLength(1);
          expect(lines[0]).toMatchObject(expected);
          // A later invoice may also contain earlier completed travel orders.
          // Check the full invoice independently from this order's unique line.
          expect(actual.lines.length).toBeGreaterThan(0);
          for (const line of actual.lines)
            expect(normalisePlatformCurrency(line.amount.currency)).toBe(
              normalisePlatformCurrency(actual.amount.currency),
            );
          expect(actual.amount.amountMinor).toBe(
            actual.lines.reduce(
              (sum: number, line: any) => sum + line.amount.amountMinor,
              0,
            ),
          );
        }
        return {
          invoiceId: read.invoiceId,
          amount: read.amount,
          line: read.lines.find((line: any) => line.orderId === exactOrderId),
        };
      },
    );
    await step(
      "Ordinary Ops reads the completed order's recorded invoice and returns to the same dispatch detail",
      async () => {
        const opened = await ops.goto(
          `${OPS}/billing?orderId=${encodeURIComponent(exactOrderId)}`,
        );
        expect(opened?.status()).toBe(200);
        await expect(ops).toHaveURL(
          (url) =>
            url.pathname === "/billing" &&
            url.searchParams.get("orderId") === exactOrderId,
        );
        const card = ops.locator(
          `details[data-invoice-id="${invoice.invoiceId}"]`,
        );
        await expect(card).toHaveCount(1);
        await expect(card).toBeVisible();
        await expect(card).toHaveAttribute("open", "");
        await expect(card.locator("summary")).toContainText(invoice.invoiceId);
        await expect(
          card.getByText(fixture.tenantId, { exact: true }),
        ).toBeVisible();
        const line = card.locator(`tbody tr[data-order-id="${exactOrderId}"]`);
        await expect(line).toHaveCount(1);
        await expect(line.locator("td").nth(0)).toHaveText(exactOrderId);
        const money = (amount: { currency: string; amountMinor: number }) =>
          `${amount.currency} ${new Intl.NumberFormat("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(amount.amountMinor / 100)}`;
        await expect(line.locator("td").nth(2)).toHaveText(
          money(invoice.line.amount),
        );
        await expect(card.locator("dl dd").last()).toHaveText(
          money(invoice.amount),
        );
        const originalOrder = line.getByRole("link");
        const dispatchPath = `/dispatch/${encodeURIComponent(exactOrderId)}`;
        await expect(originalOrder).toHaveAttribute("href", dispatchPath);
        const [returned] = await Promise.all([
          ops.waitForResponse(
            (response) =>
              response.request().isNavigationRequest() &&
              new URL(response.url()).origin === OPS &&
              new URL(response.url()).pathname === dispatchPath,
          ),
          originalOrder.click(),
        ]);
        expect(returned.status()).toBe(200);
        await expect(ops).toHaveURL((url) => url.pathname === dispatchPath);
        await expect(
          ops.locator(`[data-ops-order-id="${exactOrderId}"]`),
        ).toBeVisible();
      },
    );
    await info.attach(
      insurance
        ? "normal-insurance-completion-same-order-facts"
        : "normal-travel-completion-same-order-facts",
      {
        contentType: "application/json",
        body: JSON.stringify(
          {
            candidate_sha: required("CANDIDATE_SHA"),
            businessDispatchSubtype: subtype,
            partnerBookingDetails: details,
            proof: {
              requirements: before.order.proofRequirements,
              photoCount: task.proof.photos.length,
              signatureProvided: Boolean(task.proof.signatureId),
              signoffClaim: before.order.proofRequirements.signoffRequired
                ? "normal required signoff entered in Driver UI and persisted"
                : "signoff not required by this actual order; no signoff validation claim",
            },
            workflow_sha: required("WORKFLOW_SHA"),
            orderId: exactOrderId,
            bookingId,
            tenantId: fixture.tenantId,
            partnerId: scope.entry.partnerId,
            programId: scope.entry.programId,
            entrySlug: scope.entry.entrySlug,
            eligibilityVerificationId: before.order.eligibilityVerificationId,
            dispatchJobId: created.dispatchJobId,
            assignmentId: assigned.assignmentId,
            taskId: assigned.taskId,
            supply,
            status: task.status,
            fare: task.fare,
            completedAt: task.completedAt,
            actualDistanceKm: task.actualDistanceKm,
            actualDurationSec: task.actualDurationSec,
            invoice,
            simulated: [
              "external-Google-metadata-transport-with-genuine-WIF-token",
              insurance
                ? "policy-and-claim-reference-issuer"
                : "roster-reference-issuer",
              "map-provider",
              "existing-GPS-demo-track-not-route-geofence-or-physical-distance-verification",
              "vehicle-driver-qualification-documents",
              "external-document-scanner-HTTP-verdict",
              "project-PNG-proof-image",
            ],
            real: [
              "normal-eligibility-ServerAction-create",
              "Fleet-documents-approval-canonical-supply",
              "Ops-UI-assignment",
              "Driver-device-session-and-UI-lifecycle",
              "proof-processing",
              "PG-relational-completion",
              "normal-Partner-fresh-receipt",
              "tenant-admin-invoice-HTTP-PG",
              "normal-Tenant-billing-Generate-UI-and-exact-invoice-detail",
            ],
            notClaimed: [
              "physical-ride",
              "genuine-malware-engine",
              "PSP-collection",
              "Passenger-ledger-payment",
              insurance
                ? "negotiated-insurance-pricing"
                : "negotiated-travel-pricing",
              "tax-invoice",
              "mail-delivery",
              "CloudRun-production",
            ],
          },
          null,
          2,
        ),
      },
    );
  } finally {
    stopGpsObservation?.();
    // Snapshot route locations before closing contexts. No query/fragment,
    // DOM, input values, request headers or credentials are captured.
    const pagesBeforeClose = contexts.flatMap((context, index) =>
      context.pages().map((page) => {
        const url = new URL(page.url());
        return {
          role: ["partner", "ops", "driver", "tenant"][index] ?? "unknown",
          origin: url.origin,
          pathname: url.pathname,
          closed: page.isClosed(),
        };
      }),
    );
    await info
      .attach(
        insurance
          ? "normal-insurance-terminal-page-routes"
          : "normal-travel-terminal-page-routes",
        {
          contentType: "application/json",
          body: JSON.stringify({ pages: pagesBeforeClose }),
        },
      )
      .catch(() => undefined);
    await info.attach(
      insurance
        ? "normal-insurance-terminal-owned-ID"
        : "normal-travel-terminal-owned-ID",
      {
        contentType: "application/json",
        body: JSON.stringify({
          orderId,
          source: "actual-response-only",
          testStatus: info.status,
          noForcedCompletedOrFakePassengerHistory: true,
        }),
      },
    );
    await Promise.allSettled(contexts.map((context) => context.close()));
    await pendingGpsObservation;
    await fixture.close();
  }
}

/** Original travel case and every shared step remain in the same job. */
test("normal travel Partner booking is ordinarily assigned, genuinely Driver-completed and re-read with the same-order tenant invoice", async ({
  browser,
}, info) => {
  await runNormalPartnerJourney(browser, info, "travel_agency_transfer");
});

test("normal insurance Partner booking is ordinarily assigned, genuinely Driver-completed and re-read with the same-order tenant invoice", async ({
  browser,
}, info) => {
  await runNormalPartnerJourney(browser, info, "insurance_replacement_vehicle");
});
