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
  type DriverTaskRecord,
  type OwnedOrderRecord,
  type PartnerBootstrapSession,
  type PartnerBookingDetails,
} from "@drts/contracts";
import { PARTNER_LOCALE_COOKIE } from "../../apps/partner-booking-web/lib/locale-config";
import { TENANT_SESSION_COOKIE_NAME } from "../../packages/tenant-auth/src/constants";
import { TENANT_LOCALE_COOKIE } from "../../apps/tenant-console-web/lib/locale-config";
import type { PartnerTravelPlan } from "../../apps/partner-booking-web/lib/partner-booking-form";
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

type NormalPartnerJourneyResult = {
  bookingId: string;
  orderId: string;
  dispatchJobId: string;
  assignmentId: string;
  taskId: string;
  driverId: string;
  vehicleId: string;
  completedAt: string;
  invoiceId: string;
  actualFare: { currency: string; amountMinor: number };
  details: PartnerBookingDetails | undefined;
};

type TravelGroupJourneyContext = {
  fixture: NoncoreTravelFixture;
  scope: Awaited<ReturnType<NoncoreTravelFixture["entry"]>>;
  partnerUserRef: string;
  referenceToken: string;
  plan: PartnerTravelPlan;
  legId: string;
  batchId: string;
  vehicleId: string;
  slotNumber: number;
  invoicePeriodStart: string;
  onBooked: (
    booking: Pick<
      NormalPartnerJourneyResult,
      "bookingId" | "orderId" | "details"
    >,
  ) => Promise<void>;
  beforeComplete: () => Promise<void>;
  onCompleted: (result: NormalPartnerJourneyResult) => Promise<void>;
};

function selectedGroupAllocation(group: TravelGroupJourneyContext) {
  const leg = group.plan.legs.find((item) => item.id === group.legId);
  const batch = leg?.batches.find((item) => item.id === group.batchId);
  const vehicle = batch?.vehicles.find((item) => item.id === group.vehicleId);
  if (!leg || !batch || !vehicle)
    throw new Error("Missing declared group allocation");
  return { leg, batch, vehicle };
}

/** Both wrappers run this same normal booking/lifecycle/invoice journey.
 * Only external program facts and the corresponding normal product vary. */
export async function runNormalPartnerJourney(
  browser: Browser,
  info: TestInfo,
  scenario:
    | "travel_agency_transfer"
    | "insurance_replacement_vehicle"
    | "airport_pickup"
    | "airport_dropoff",
  group?: TravelGroupJourneyContext,
) {
  if (group && scenario !== "travel_agency_transfer")
    throw new Error("Group context is travel-only");
  const subtype =
    scenario === "airport_pickup" || scenario === "airport_dropoff"
      ? "credit_card_airport_transfer"
      : scenario;
  const airportDirection =
    scenario === "airport_pickup"
      ? "pickup"
      : scenario === "airport_dropoff"
        ? "dropoff"
        : null;
  const airport = airportDirection !== null;
  const insurance = subtype === "insurance_replacement_vehicle";
  expect(process.env.GITHUB_ACTIONS).toBe("true");
  expect(required("DRTS_UAT_ENV")).toBe("sandbox");
  expect(required("DRTS_UAT_API_URL")).toBe(NONCORE_API);
  expect(required("CANDIDATE_SHA")).toMatch(/^[a-f0-9]{40}$/);
  // The parent's system setup token has a normal fifteen-minute TTL. Exchange
  // normal live workforce authority first; do not feed an expired parent setup
  // token into renewal or weaken the existing durable verification step.
  if (!group) {
    await establishNormalPlatformSession();
    await renewActualFixtureSessions();
  }
  const fixture = group?.fixture ?? new NoncoreTravelFixture();
  const contexts: BrowserContext[] = [];
  const progress = createJourneyProgress(
    info.outputPath(
      group
        ? `group-slot-${group.slotNumber}-noncore-safe-progress.json`
        : "noncore-safe-progress.json",
    ),
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
    if (!group)
      await step(
        airport
          ? "Activate normal airport product"
          : insurance
            ? "Activate normal insurance product"
            : "Activate normal travel product",
        () =>
          airport
            ? fixture.activateAirport()
            : insurance
              ? fixture.activateInsurance()
              : fixture.activateTravel(),
      );
    const airportAreas = airport
      ? await step(
          "Publish same-service SIM city and airport boundaries through normal governance",
          () => fixture.configureAirportAreas(),
        )
      : [];
    const supply = await step(
      "Approve durable normal SIM business supply through Fleet and Admin",
      () =>
        airport
          ? fixture.fleetSupply("credit_card_airport_transfer")
          : insurance
            ? fixture.fleetSupply("insurance_replacement_vehicle")
            : fixture.fleetSupply(),
    );
    const scope =
      group?.scope ??
      (await step(
        airport
          ? "Create own normal bank airport entry and credential"
          : insurance
            ? "Create own normal insurance entry and credential"
            : "Create own normal travel entry and credential",
        () =>
          fixture.entry(
            airport
              ? "bank_partner"
              : insurance
                ? "insurance_company"
                : "travel_agency",
          ),
      ));
    const partnerUserRef =
      group?.partnerUserRef ??
      (airport
        ? `SIM-airport-rider-${randomUUID()}`
        : insurance
          ? `SIM-insurance-rider-${randomUUID()}`
          : `SIM-travel-rider-${randomUUID()}`);
    const referenceToken =
      group?.referenceToken ??
      (insurance
        ? `SIM-claim-reference-${randomUUID()}`
        : `SIM-roster-reference-${randomUUID()}`);

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
              airport
                ? "SIM hosted airport driver"
                : insurance
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
            airport
              ? `normal-airport-${airportDirection}-settings-save-availability`
              : insurance
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
    const home = {
      query: "taipei city hall",
      label: "Taipei City Hall",
      address: "台北市信義區市府路1號",
      lat: 25.0375,
      lng: 121.5637,
    };
    const terminalOne = {
      query: "taoyuan airport",
      label: "Taoyuan Airport Terminal 1",
      address: "桃園市大園區航站南路9號",
      lat: 25.0797,
      lng: 121.2342,
    };
    const airportFacts = airportDirection
      ? {
          direction: airportDirection,
          flightNo: `SIM-${airportDirection.toUpperCase()}-101`,
          terminal: "SIM Terminal One",
          cardTier: "SIM benefit program",
          luggageCount: 2,
          benefitReference: `SIM-airport-benefit-${fixture.marker}`,
          pickup: airportDirection === "pickup" ? terminalOne : home,
          dropoff: airportDirection === "pickup" ? home : terminalOne,
        }
      : null;
    const airportEligibility = airportFacts
      ? await step(
          "Verify normal bank eligibility and follow Continue to booking",
          async () => {
            const opened = await partner.goto(
              `${PARTNER_ORIGIN}/${scope.entry.entrySlug}/eligibility?${new URLSearchParams({ partnerUserRef })}`,
            );
            expect(opened?.status()).toBe(200);
            await partner
              .getByLabel("Last four card digits", { exact: true })
              .fill("1234");
            await partner
              .getByLabel("Cardholder name", { exact: true })
              .fill("SIM Airport Benefit Passenger");
            await partner
              .getByLabel("Benefit reference (if provided)", { exact: true })
              .fill(airportFacts.benefitReference);
            await partner
              .getByLabel("Flight number", { exact: true })
              .fill(airportFacts.flightNo);
            await partner
              .getByRole("button", { name: "Verify eligibility", exact: true })
              .click();
            const continuation = partner.getByRole("link", {
              name: "Continue to booking",
              exact: true,
            });
            await expect(continuation).toBeVisible();
            const verificationId = (
              await partner
                .getByTestId("partner-eligibility-verification-id")
                .innerText()
            ).trim();
            expect(verificationId).toMatch(/^elig_[a-f0-9-]{36}$/);
            const href = new URL(
              (await continuation.getAttribute("href"))!,
              PARTNER_ORIGIN,
            );
            expect(href.pathname).toBe(`/${scope.entry.entrySlug}/book`);
            expect(href.searchParams.get("eligibilityVerificationId")).toBe(
              verificationId,
            );
            expect(href.searchParams.get("partnerUserRef")).toBe(
              partnerUserRef,
            );
            expect(href.searchParams.has("apiKey")).toBe(false);
            expect(href.searchParams.has("accessToken")).toBe(false);
            const [bookingNavigation] = await Promise.all([
              partner.waitForResponse(
                (response) =>
                  response.request().method() === "GET" &&
                  new URL(response.url()).origin === PARTNER_ORIGIN &&
                  new URL(response.url()).pathname === href.pathname,
              ),
              continuation.click(),
            ]);
            await expect(
              partner.getByLabel("Passenger name", { exact: true }),
            ).toBeVisible();
            expect(
              new URL(partner.url()).searchParams.get(
                "eligibilityVerificationId",
              ),
            ).toBe(verificationId);
            return { verificationId, opened: bookingNavigation };
          },
        )
      : null;
    const details: PartnerBookingDetails | undefined = airport
      ? undefined
      : insurance
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
            guideName: "SIM Separate Tour Guide",
            guidePhone: "0900000077",
            viaStops: ["SIM planned museum stop", "SIM planned hotel stop"],
            signage: "SIM tour group welcome sign",
          };
    const dates = await step(
      airport
        ? `Submit normal airport ${airportDirection} form through the real ServerAction`
        : insurance
          ? "Submit normal insurance form through the real ServerAction"
          : "Submit normal travel form through the real ServerAction",
      async () => {
        const opened = airportEligibility
          ? airportEligibility.opened
          : await partner.goto(
              `${PARTNER_ORIGIN}/${scope.entry.entrySlug}/book?${new URLSearchParams({ partnerUserRef, referenceToken })}`,
            );
        expect(opened?.status()).toBe(200);
        await partner
          .getByLabel("Passenger name", { exact: true })
          .fill(
            airport
              ? "SIM Airport Benefit Passenger"
              : insurance
                ? "SIM Hosted Insurance Passenger"
                : "SIM Hosted Travel Passenger",
          );
        await partner
          .getByLabel("Passenger phone", { exact: true })
          .fill("0900000036");
        if (airportFacts) {
          await partner
            .getByLabel("Card tier", { exact: true })
            .fill(airportFacts.cardTier);
          await partner
            .getByLabel("Flight number", { exact: true })
            .fill(airportFacts.flightNo);
          await partner
            .getByLabel("Terminal", { exact: true })
            .fill(airportFacts.terminal);
          await partner
            .getByLabel("Luggage count", { exact: true })
            .fill(String(airportFacts.luggageCount));
          await partner
            .getByLabel("Pickup / drop-off", { exact: true })
            .selectOption(airportFacts.direction);
        } else if (details?.subtype === "travel_agency_transfer") {
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
          if (
            !details.guideName ||
            !details.guidePhone ||
            !details.viaStops ||
            !details.signage
          )
            throw new Error(
              "Expected declared SIM guide and tour instructions",
            );
          await partner
            .getByLabel("Tour guide contact name", { exact: true })
            .fill(details.guideName);
          await partner
            .getByLabel("Tour guide contact phone", { exact: true })
            .fill(details.guidePhone);
          await partner
            .getByLabel("Planned intermediate stops", { exact: true })
            .fill(details.viaStops.join("\n"));
          await partner
            .getByLabel("Pickup signage", { exact: true })
            .fill(details.signage);
          if (group) {
            const { leg, batch, vehicle } = selectedGroupAllocation(group);
            await partner
              .locator("summary")
              .filter({
                hasText:
                  "Import a tour plan supplied by your operator (optional)",
              })
              .click();
            await partner
              .getByLabel("Tour-plan document (JSON)", { exact: true })
              .fill(JSON.stringify(group.plan));
            await partner
              .getByRole("button", { name: "Use tour plan", exact: true })
              .click();
            await partner
              .getByLabel("Selected transfer leg", { exact: true })
              .selectOption(leg.id);
            await partner
              .getByLabel("Selected departure batch", { exact: true })
              .selectOption(batch.id);
            await partner
              .getByLabel("Selected planned vehicle allocation", {
                exact: true,
              })
              .selectOption(vehicle.id);
            await expect(
              partner.getByLabel("Selected transfer leg", { exact: true }),
            ).toHaveValue(leg.id);
            await expect(
              partner.getByLabel("Selected departure batch", { exact: true }),
            ).toHaveValue(batch.id);
            await expect(
              partner.getByLabel("Selected planned vehicle allocation", {
                exact: true,
              }),
            ).toHaveValue(vehicle.id);
            await expect(
              partner.getByLabel("Group seats", { exact: true }),
            ).toHaveValue(String(vehicle.rosterPassengers.length));
            Object.assign(details, {
              groupCode: group.plan.groupCode,
              groupSize: vehicle.rosterPassengers.length,
              itineraryLink: group.plan.itineraryLink,
              rosterPassengers: [...vehicle.rosterPassengers],
              meetingPoint: batch.meetingPoint,
              guideName: group.plan.guideName,
              guidePhone: group.plan.guidePhone,
              viaStops: [...leg.viaStops],
              signage: leg.signage,
              planSourceKind: group.plan.source.kind,
              planSourceId: group.plan.source.id,
              planSourceRevision: group.plan.source.revision,
              planSourceLabel: group.plan.source.label,
              planGroupSize: group.plan.groupSize,
              planLegId: leg.id,
              planLegLabel: leg.label,
              planLegIndex: group.plan.legs.indexOf(leg) + 1,
              planLegCount: group.plan.legs.length,
              planPickupAddress: leg.pickupAddress,
              planDropoffAddress: leg.dropoffAddress,
              planBatchId: batch.id,
              planBatchLabel: batch.label,
              planBatchIndex: leg.batches.indexOf(batch) + 1,
              planBatchCount: leg.batches.length,
              planWindowStart: batch.windowStart,
              planWindowEnd: batch.windowEnd,
              planVehicleId: vehicle.id,
              planVehicleLabel: vehicle.label,
              planVehicleSeats: vehicle.seats,
              planVehicleCount: batch.vehicles.length,
              planVehicleLabels: batch.vehicles.map((item) => item.label),
              planFareBasis: group.plan.fareBasis,
            });
          } else {
            const sourceWindow = {
              start: await partner
                .getByLabel("Reservation window start", { exact: true })
                .inputValue(),
              end: await partner
                .getByLabel("Reservation window end", { exact: true })
                .inputValue(),
            };
            // This browser has an explicit Asia/Taipei context. Read, never inject, its input.
            const sourceISO = (value: string) =>
              new Date(value + "+08:00").toISOString();
            await partner
              .getByRole("button", {
                name: "Load simulated tour plan",
                exact: true,
              })
              .click();
            await expect(
              partner.getByLabel("Selected transfer leg", { exact: true }),
            ).toHaveValue("SIM-leg-out");
            await expect(
              partner.getByLabel("Selected departure batch", { exact: true }),
            ).toHaveValue("SIM-batch-A");
            await expect(
              partner.getByLabel("Selected planned vehicle allocation", {
                exact: true,
              }),
            ).toHaveValue("SIM-slot-A");
            await expect(
              partner.getByText("SIM external tour plan", { exact: true }),
            ).toBeVisible();
            Object.assign(details, {
              planSourceKind: "sim",
              planSourceId: "SIM-tour-plan",
              planSourceRevision: "1",
              planSourceLabel: "SIM tour-plan example",
              planGroupSize: 4,
              planLegId: "SIM-leg-out",
              planLegLabel: "SIM outbound transfer",
              planLegIndex: 1,
              planLegCount: 2,
              planPickupAddress: "SIM meeting point",
              planDropoffAddress: "SIM tour destination",
              planBatchId: "SIM-batch-A",
              planBatchLabel: "SIM first departure",
              planBatchIndex: 1,
              planBatchCount: 1,
              planWindowStart: sourceISO(sourceWindow.start),
              planWindowEnd: sourceISO(sourceWindow.end),
              planVehicleId: "SIM-slot-A",
              planVehicleLabel: "SIM planned minibus A",
              planVehicleSeats: 8,
              planVehicleCount: 2,
              planVehicleLabels: [
                "SIM planned minibus A",
                "SIM planned minibus B",
              ],
              planFareBasis: "included_in_tour",
            });
          }
        } else if (details?.subtype === "insurance_replacement_vehicle") {
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
            airport
              ? "SIM issuer/card-benefit, map, qualifications and GPS; normal internal airport lifecycle/invoice"
              : insurance
                ? "SIM external policy, claim facts, qualifications and GPS; normal internal lifecycle/invoice"
                : "SIM external roster, qualifications and GPS; normal internal lifecycle/invoice",
          );
        if (airportFacts) {
          await expect(
            partner.getByText(
              "Map and address results are simulated. Service-area rules are evaluated by the booking API.",
              { exact: true },
            ),
          ).toBeVisible();
          await address(
            partner,
            0,
            airportFacts.pickup.query,
            airportFacts.pickup.label,
          );
          await address(
            partner,
            1,
            airportFacts.dropoff.query,
            airportFacts.dropoff.label,
          );
        } else {
          await address(partner, 0, "taipei 101", "Taipei 101");
          await address(partner, 1, "taipei main", "Taipei Main Station");
        }
        if (details?.subtype === "travel_agency_transfer") {
          // Normal selected place controls; planned prose is never geocoded by the test.
          const stops = [
            {
              query: "banqiao",
              name: "Banqiao District Office",
              address:
                "No. 161, Section 1, Zhongshan Road, Banqiao District, New Taipei",
              lat: 25.011,
              lng: 121.4636,
            },
            {
              query: "taipei 101",
              name: "Taipei 101",
              address: "No. 7, Section 5, Xinyi Road, Xinyi District, Taipei",
              lat: 25.033964,
              lng: 121.564468,
            },
          ];
          for (const [index, stop] of stops.entries()) {
            await partner
              .getByRole("button", { name: "Add stop", exact: true })
              .click();
            await address(partner, index + 2, stop.query, stop.name);
          }
          details.routeStops = stops.map(({ address, lat, lng }) => ({
            address,
            lat,
            lng,
          }));
        }
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
        if (details?.subtype === "insurance_replacement_vehicle") {
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
        if (details?.subtype === "insurance_replacement_vehicle")
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
    if (details) {
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
    }
    if (details?.subtype === "travel_agency_transfer") {
      const contact = { name: details.guideName, phone: details.guidePhone };
      expect(contact.name).toBeTruthy();
      expect(contact.phone).toBeTruthy();
      expect(before.booking.onsiteContact).toEqual(contact);
      expect(before.order.onsiteContact).toEqual(contact);
    }
    if (airportFacts && airportEligibility) {
      const expectedAirport = {
        orderId: exactOrderId,
        bookingId,
        tenantId: fixture.tenantId,
        businessDispatchSubtype: subtype,
        partnerId: scope.entry.partnerId,
        partnerProgramId: scope.entry.programId,
        partnerEntrySlug: scope.entry.entrySlug,
        eligibilityVerificationId: airportEligibility.verificationId,
        direction: airportFacts.direction,
        flightNo: airportFacts.flightNo,
        terminal: airportFacts.terminal,
        luggageCount: airportFacts.luggageCount,
        benefitReference: airportFacts.benefitReference,
        reservationWindowStart: dates.startISO,
        reservationWindowEnd: dates.endISO,
        pickup: {
          address: airportFacts.pickup.address,
          lat: airportFacts.pickup.lat,
          lng: airportFacts.pickup.lng,
        },
        dropoff: {
          address: airportFacts.dropoff.address,
          lat: airportFacts.dropoff.lat,
          lng: airportFacts.dropoff.lng,
        },
      };
      const stored = await fixture.fixture.db.query(
        "SELECT record FROM ops.phase1_owned_orders WHERE order_id=$1",
        [exactOrderId],
      );
      expect(stored.rows).toHaveLength(1);
      for (const record of [
        before.booking,
        before.order,
        stored.rows[0]!.record,
      ]) {
        expect(record).toMatchObject(expectedAirport);
        expect(record.partnerBookingDetails).toBeUndefined();
        expect(record.issuerAuthorizationRef).toBeTruthy();
        expect(record.issuerAuthorizationRef).toBe(
          before.order.issuerAuthorizationRef,
        );
      }
      const spatial = stored.rows[0]!.record.spatialAudit;
      expect(spatial.serviceAreaEvaluation).toMatchObject({
        decision: "serviceable",
        serviceProductType: "credit_card_airport_transfer",
      });
      expect(spatial.serviceAreaEvaluation.geometryVersionRefs).toEqual(
        expect.arrayContaining(
          airportAreas.map(
            (area) => `service_area:${area.areaCode}@${area.version}`,
          ),
        ),
      );
    }
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

    if (airportFacts && airportEligibility) {
      expect(verification).toMatchObject({
        eligibilityVerificationId: airportEligibility.verificationId,
        tenantId: fixture.tenantId,
        partnerId: scope.entry.partnerId,
        decisionSource: "issuer_realtime",
        adapterCode: "issuer_bank_card_inline_v1",
        benefitReference: airportFacts.benefitReference,
        issuerAuthorizationRef: before.order.issuerAuthorizationRef,
        requestMetadata: { cardLast4: "1234", flightNo: airportFacts.flightNo },
      });
      const persisted = await fixture.fixture.db.query(
        "SELECT record FROM admin.phase1_partner_eligibility_verifications WHERE eligibility_verification_id=$1",
        [airportEligibility.verificationId],
      );
      expect(persisted.rows).toHaveLength(1);
      expect(persisted.rows[0]!.record).toMatchObject({
        eligibilityVerificationId: airportEligibility.verificationId,
        tenantId: fixture.tenantId,
        partnerEntrySlug: scope.entry.entrySlug,
        verificationStatus: "eligible",
        adapterCode: "issuer_bank_card_inline_v1",
        benefitReference: airportFacts.benefitReference,
        issuerAuthorizationRef: before.order.issuerAuthorizationRef,
      });
    }

    if (group)
      await group.onBooked({ bookingId, orderId: exactOrderId, details });

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
    if (airportFacts) {
      const opsLocale = await ops.locator("html").getAttribute("lang");
      const directionLabel =
        opsLocale === "zh"
          ? airportFacts.direction === "pickup"
            ? "接機"
            : "送機"
          : airportFacts.direction === "pickup"
            ? "Airport pickup"
            : "Airport drop-off";
      for (const value of [
        directionLabel,
        airportFacts.flightNo,
        airportFacts.terminal,
      ])
        await expect(opsFulfillment).toContainText(value);
      await expect(
        opsFulfillment.getByText(String(airportFacts.luggageCount), {
          exact: true,
        }),
      ).toBeVisible();
    } else if (details?.subtype === "travel_agency_transfer") {
      for (const value of [
        details.groupCode,
        details.meetingPoint,
        ...details.rosterPassengers,
        details.guideName ?? "",
        details.guidePhone ?? "",
        ...(details.viaStops ?? []),
        details.signage ?? "",
      ])
        await expect(opsFulfillment).toContainText(value);
    } else if (details?.subtype === "insurance_replacement_vehicle") {
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
    const observedWaypointVisits = new Map<
      number,
      { arrivedAt: string | null; departedAt: string | null }
    >();
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
    if (airportFacts) {
      for (const value of [
        airportFacts.direction === "pickup" ? "接機" : "送機",
        airportFacts.flightNo,
        airportFacts.terminal,
      ])
        await expect(driverFulfillment).toContainText(value);
      await expect(
        driverFulfillment.getByText(String(airportFacts.luggageCount), {
          exact: true,
        }),
      ).toBeVisible();
    } else if (details?.subtype === "travel_agency_transfer") {
      for (const value of [
        details.groupCode,
        details.meetingPoint,
        ...details.rosterPassengers,
        details.guideName ?? "",
        details.guidePhone ?? "",
        ...(details.viaStops ?? []),
        details.signage ?? "",
      ])
        await expect(driverFulfillment).toContainText(value);
      for (const [index, stop] of (details.routeStops ?? []).entries()) {
        await expect(
          driver.getByRole("button", {
            name: `Google navigation to waypoint-${index + 1}`,
            exact: true,
          }),
        ).toBeEnabled();
        await expect(
          driver.getByText(stop.address, { exact: true }).first(),
        ).toBeVisible();
      }
    } else if (details?.subtype === "insurance_replacement_vehicle") {
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
        if (
          details?.subtype === "travel_agency_transfer" &&
          details.routeStops?.length
        ) {
          const request = response.request().postDataJSON();
          expect(request.waypointSequence).toBeUndefined();
          const changed = camel(await response.json()).data as DriverTaskRecord;
          const pickup = changed.waypoints.find(
            (waypoint) => waypoint.sequence === 0,
          );
          if (!pickup) throw new Error("Expected canonical pickup waypoint");
          if (action === "depart") {
            expect(pickup.arrivedAt).toBeNull();
            expect(pickup.departedAt).toBeNull();
          } else {
            if (action === "arrived_pickup") {
              expect(pickup.arrivedAt).toBe(request.arrivedAt);
              expect(pickup.departedAt).toBeNull();
            } else {
              expect(pickup.arrivedAt).toBe(
                observedWaypointVisits.get(0)?.arrivedAt,
              );
              expect(pickup.departedAt).toBe(request.startedAt);
            }
            observedWaypointVisits.set(0, {
              arrivedAt: pickup.arrivedAt,
              departedAt: pickup.departedAt,
            });
          }
        }
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
    if (
      details?.subtype === "travel_agency_transfer" &&
      details.routeStops?.length
    ) {
      const visitFacts: Array<Record<string, unknown>> = [];
      const places = [
        before.order.pickup,
        ...details.routeStops,
        before.order.dropoff,
      ];
      const readWaypointTask = async () => {
        const result = await fixture.fixture.db.query(
          `SELECT record FROM ops.phase1_driver_tasks WHERE task_id=$1 AND order_id=$2 AND assignment_id=$3`,
          [assigned.taskId, exactOrderId, assigned.assignmentId],
        );
        expect(result.rows).toHaveLength(1);
        const record = result.rows[0]!.record as DriverTaskRecord;
        expect(record).toMatchObject({
          taskId: assigned.taskId,
          orderId: exactOrderId,
          assignmentId: assigned.assignmentId,
          driverId: supply.driverId,
          vehicleId: supply.vehicleId,
          status: "on_trip",
        });
        return record;
      };
      const initial = await readWaypointTask();
      expect(initial.waypoints.map(({ sequence }) => sequence)).toEqual(
        places.map((_, sequence) => sequence),
      );
      expect(initial.waypoints[0]).toMatchObject(
        observedWaypointVisits.get(0)!,
      );
      for (const waypoint of initial.waypoints.slice(1)) {
        expect(waypoint.arrivedAt).toBeNull();
        expect(waypoint.departedAt).toBeNull();
      }
      // The second selected stop intentionally revisits pickup coordinates.
      // Sequence, not address/coordinate deduplication, identifies each visit.
      expect(places[2]).toMatchObject({
        lat: places[0]!.lat,
        lng: places[0]!.lng,
      });
      for (let sequence = 1; sequence < places.length; sequence += 1) {
        const last = sequence === places.length - 1;
        const stopLabel = last ? "下車點" : `停靠點 ${sequence}`;
        for (const phase of (last
          ? ["arrived"]
          : ["arrived", "depart"]) as Array<"arrived" | "depart">) {
          await step(
            `Normal Driver ${phase} canonical waypoint ${sequence}`,
            async () => {
              const pgBefore = await readWaypointTask();
              await expect(
                driver.getByRole("button", { name: "完成行程", exact: true }),
              ).toHaveCount(0);
              const endpoint =
                phase === "arrived" ? "arrived_pickup" : "depart";
              const [response] = await Promise.all([
                driver.waitForResponse(
                  (item) =>
                    new URL(item.url()).pathname.endsWith(
                      `/driver/tasks/${assigned.taskId}/${endpoint}`,
                    ) && item.request().method() === "POST",
                ),
                driver
                  .getByRole("button", {
                    name: (phase === "arrived" ? "抵達" : "離開") + stopLabel,
                    exact: true,
                  })
                  .click(),
              ]);
              expect(response.status()).toBe(201);
              const request = response.request().postDataJSON();
              expect(request.waypointSequence).toBe(sequence);
              const timestamp =
                phase === "arrived" ? request.arrivedAt : request.departedAt;
              expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
              expect(Number.isFinite(Date.parse(timestamp))).toBe(true);
              const reply = camel(await response.json())
                .data as DriverTaskRecord;
              expect(reply).toMatchObject({
                taskId: assigned.taskId,
                orderId: exactOrderId,
                assignmentId: assigned.assignmentId,
                driverId: supply.driverId,
                vehicleId: supply.vehicleId,
                status: "on_trip",
              });
              const expected = pgBefore.waypoints.map((waypoint) =>
                waypoint.sequence === sequence
                  ? {
                      ...waypoint,
                      [phase === "arrived" ? "arrivedAt" : "departedAt"]:
                        timestamp,
                    }
                  : waypoint,
              );
              expect(reply.waypoints).toEqual(expected);
              const pgAfter = await readWaypointTask();
              expect(pgAfter.waypoints).toEqual(reply.waypoints);
              const visited = pgAfter.waypoints[sequence]!;
              observedWaypointVisits.set(sequence, {
                arrivedAt: visited.arrivedAt,
                departedAt: visited.departedAt,
              });
              visitFacts.push({
                sequence,
                phase,
                requestTimestamp: timestamp,
                httpStatus: response.status(),
                pgBefore: pgBefore.waypoints,
                pgAfter: pgAfter.waypoints,
              });
            },
          );
        }
      }
      expect(observedWaypointVisits.size).toBe(places.length);
      expect(
        observedWaypointVisits.get(places.length - 1)?.departedAt,
      ).toBeNull();
      await info.attach(
        "normal-Driver-canonical-waypoint-visit-commands-and-PG-readback",
        {
          contentType: "application/json",
          body: JSON.stringify(
            {
              orderId: exactOrderId,
              taskId: assigned.taskId,
              assignmentId: assigned.assignmentId,
              driverId: supply.driverId,
              vehicleId: supply.vehicleId,
              external:
                "normal hosted Driver with explicit SIM places/track; not a physical arrival claim",
              visits: visitFacts,
            },
            null,
            2,
          ),
        },
      );
    }
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
      if (group) await group.beforeComplete();
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
    if (details?.subtype === "travel_agency_transfer") {
      expect(row.order_record.onsiteContact).toEqual({
        name: details.guideName,
        phone: details.guidePhone,
      });
      const places = [
        before.order.pickup,
        ...(details.routeStops ?? []),
        before.order.dropoff,
      ];
      expect(task.routeProvided).toBe(true);
      expect(task.waypoints).toEqual(
        places.map((place, sequence) => ({
          sequence,
          label:
            sequence === 0
              ? "上車點"
              : sequence === places.length - 1
                ? "下車點"
                : `停靠點 ${sequence}`,
          address: place.address,
          lat: place.lat,
          lng: place.lng,
          arrivedAt: observedWaypointVisits.get(sequence)?.arrivedAt ?? null,
          departedAt: observedWaypointVisits.get(sequence)?.departedAt ?? null,
        })),
      );
      if (details.routeStops?.length) {
        expect(observedWaypointVisits.size).toBe(places.length);
        for (const waypoint of task.waypoints as DriverTaskRecord["waypoints"]) {
          expect(Number.isFinite(Date.parse(waypoint.arrivedAt!))).toBe(true);
          if (waypoint.sequence === places.length - 1)
            expect(waypoint.departedAt).toBeNull();
          else
            expect(Date.parse(waypoint.departedAt!)).toBeGreaterThanOrEqual(
              Date.parse(waypoint.arrivedAt!),
            );
        }
      }
    }
    if (details) {
      expect(row.order_record).toMatchObject({
        orderId: exactOrderId,
        bookingId,
        status: "completed",
        tenantId: fixture.tenantId,
        partnerEntrySlug: scope.entry.entrySlug,
        partnerBookingDetails: details,
      });
    } else if (airportFacts && airportEligibility) {
      expect(row.order_record).toMatchObject({
        orderId: exactOrderId,
        bookingId,
        status: "completed",
        tenantId: fixture.tenantId,
        partnerEntrySlug: scope.entry.entrySlug,
        businessDispatchSubtype: subtype,
        eligibilityVerificationId: airportEligibility.verificationId,
        direction: airportFacts.direction,
        flightNo: airportFacts.flightNo,
        terminal: airportFacts.terminal,
        luggageCount: airportFacts.luggageCount,
        issuerAuthorizationRef: before.order.issuerAuthorizationRef,
        benefitReference: airportFacts.benefitReference,
      });
      expect(row.order_record.partnerBookingDetails).toBeUndefined();
    }
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
      if (details?.subtype === "travel_agency_transfer") {
        const selectedPlan = partner.getByRole("region", {
          name: "Program details",
          exact: true,
        });
        await expect(selectedPlan).toContainText("SIM external tour plan");
        await expect(selectedPlan).toContainText("SIM Separate Tour Guide");
        if (group) {
          await expect(selectedPlan).toContainText(group.plan.source.label);
          await expect(selectedPlan).toContainText(
            selectedGroupAllocation(group).vehicle.label,
          );
        } else {
          await expect(selectedPlan).toContainText("SIM tour-plan example");
          await expect(selectedPlan).toContainText("SIM planned minibus A");
        }
        await expect(selectedPlan).toContainText(
          "This booking covers the selected vehicle service.",
        );
      }
      const receipt = partner.getByTestId("partner-payment-receipt");
      await expect(receipt).toHaveAttribute("data-order-id", exactOrderId);
      await expect(receipt).toHaveAttribute("data-booking-id", bookingId);
      await expect(receipt.getByTestId("partner-task-fare")).toHaveAttribute(
        "data-task-id",
        assigned.taskId,
      );
      if (
        completed.booking.businessDispatchSubtype === "travel_agency_transfer"
      ) {
        await expect(
          partner.getByTestId("partner-record-tour-fee"),
        ).toContainText("Included in the tour fee");
        await expect(
          partner.getByRole("heading", { name: "Quotation", exact: true }),
        ).toHaveCount(0);
        await expect(receipt.getByTestId("partner-actual-fare")).toHaveCount(0);
        await expect(
          receipt.getByRole("heading", { name: "Completed trip", exact: true }),
        ).toBeVisible();
        await expect(receipt.getByTestId("partner-task-fare")).toContainText(
          task.completedAt,
        );
        await expect(receipt.getByTestId("partner-task-fare")).toContainText(
          String(task.actualDistanceKm),
        );
        await expect(receipt.getByTestId("partner-task-fare")).toContainText(
          String(task.actualDurationSec),
        );
      } else {
        await expect(receipt.getByTestId("partner-actual-fare")).toHaveText(
          new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: normalisePlatformCurrency(task.fare.currency),
          }).format(task.fare.amountMinor / 100),
        );
      }
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

    if (
      completed.booking.businessDispatchSubtype === "travel_agency_transfer" ||
      completed.booking.businessDispatchSubtype ===
        "insurance_replacement_vehicle"
    ) {
      await step(
        "Keep the completed non-card order outside issuer settlement",
        async () => {
          // These reference-program facts were returned by ordinary booking, not
          // added to the statement request. References alone are not card proof.
          expect(completed.order.benefitReference).toBeTruthy();
          expect(completed.order.issuerAuthorizationRef).toBeTruthy();
          const period = new Date(task.completedAt).toISOString().slice(0, 7);
          const statement = await fixture.fixture.call<any>(
            `tenant/settlement-statements/${encodeURIComponent(period)}`,
            fixture.tenantToken,
            "GET",
            undefined,
            fixture.tenantId,
          );
          expect(statement.period).toBe(period);
          expect(statement.direction).toBe("issuer_pays_drts");
          expect(Array.isArray(statement.lines)).toBe(true);
          expect(
            statement.lines.map((line: { tripId: string }) => line.tripId),
          ).not.toContain(exactOrderId);
          // The normal list also reads repository periods. Other genuine card
          // trips/months may exist; do not declare the whole tenant statement empty.
          const periods = await fixture.fixture.call<any>(
            "tenant/settlement-statements",
            fixture.tenantToken,
            "GET",
            undefined,
            fixture.tenantId,
          );
          expect(Array.isArray(periods.items)).toBe(true);
          for (const listed of periods.items) {
            expect(Array.isArray(listed.lines)).toBe(true);
            expect(
              listed.lines.map((line: { tripId: string }) => line.tripId),
            ).not.toContain(exactOrderId);
          }
        },
      );
    }

    const invoice = await step(
      "Generate normal tenant invoice for the actual completed order",
      async () => {
        const start = new Date(group?.invoicePeriodStart ?? task.completedAt);
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
        const expectedAirportInvoice = airportFacts
          ? {
              issuerAuthorizationRef: before.order.issuerAuthorizationRef,
              benefitReference: airportFacts.benefitReference,
            }
          : null;
        for (const actual of [issued, read, stored.rows[0]!.record]) {
          const lines = actual.lines.filter(
            (line: any) => line.orderId === exactOrderId,
          );
          expect(lines).toHaveLength(1);
          expect(lines[0]).toMatchObject(expected);
          if (expectedAirportInvoice)
            expect(lines[0]).toMatchObject(expectedAirportInvoice);
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
      airport
        ? `normal-airport-${airportDirection}-completion-same-order-facts`
        : insurance
          ? "normal-insurance-completion-same-order-facts"
          : "normal-travel-completion-same-order-facts",
      {
        contentType: "application/json",
        body: JSON.stringify(
          {
            candidate_sha: required("CANDIDATE_SHA"),
            businessDispatchSubtype: subtype,
            partnerBookingDetails: details,
            ...(airportFacts
              ? {
                  airport: airportFacts,
                  publishedAirportAreaIds: airportAreas.map(
                    (area) => area.serviceAreaId,
                  ),
                }
              : {}),
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
              airport
                ? "bank-card-issuer-benefit-decision"
                : insurance
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
              airport
                ? "real-bank-benefit-funded-settlement-or-physical-airport-distance"
                : insurance
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
    const result: NormalPartnerJourneyResult = {
      bookingId,
      orderId: exactOrderId,
      dispatchJobId: created.dispatchJobId,
      assignmentId: assigned.assignmentId,
      taskId: assigned.taskId,
      driverId: supply.driverId,
      vehicleId: supply.vehicleId,
      completedAt: task.completedAt,
      details,
      invoiceId: invoice.invoiceId,
      actualFare: task.fare,
    };
    if (group) await group.onCompleted(result);
    return result;
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
        airport
          ? `normal-airport-${airportDirection}-terminal-page-routes`
          : insurance
            ? "normal-insurance-terminal-page-routes"
            : "normal-travel-terminal-page-routes",
        {
          contentType: "application/json",
          body: JSON.stringify({ pages: pagesBeforeClose }),
        },
      )
      .catch(() => undefined);
    await info.attach(
      airport
        ? `normal-airport-${airportDirection}-terminal-owned-ID`
        : insurance
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
    if (!group) await fixture.close();
  }
}

/** The original hosted lifecycle is reused for every declared allocation. */
export async function runNormalPartnerTravelGroupJourney(
  browser: Browser,
  info: TestInfo,
) {
  const startedAt = Date.now();
  expect(process.env.GITHUB_ACTIONS).toBe("true");
  expect(required("DRTS_UAT_ENV")).toBe("sandbox");
  expect(required("DRTS_UAT_API_URL")).toBe(NONCORE_API);
  await establishNormalPlatformSession();
  await renewActualFixtureSessions();
  const fixture = new NoncoreTravelFixture();
  let historyContext: BrowserContext | null = null;
  try {
    historyContext = await browser.newContext({ timezoneId: "Asia/Taipei" });
    const historyPage = await historyContext.newPage();
    await historyContext.addCookies([
      { name: PARTNER_LOCALE_COOKIE, value: "en", url: PARTNER_ORIGIN },
    ]);
    await fixture.activateTravel();
    const scope = await fixture.entry("travel_agency");
    const partnerUserRef = `SIM-group-rider-${fixture.marker}`;
    const referenceToken = `SIM-group-roster-${fixture.marker}`;
    const invoicePeriodStart = new Date(startedAt);
    invoicePeriodStart.setUTCHours(0, 0, 0, 0);
    // These are declared external SIM facts, not actual fleet IDs or completion
    // records. The ordinary form/parser must accept every real allocation.
    const windowStart = new Date(Date.now() + 60 * 60_000).toISOString();
    const windowEnd = new Date(Date.now() + 120 * 60_000).toISOString();
    const vehicle = (
      id: string,
      label: string,
      rosterPassengers: string[],
    ) => ({
      id,
      label,
      seats: 5,
      luggageCount: 2,
      rosterPassengers,
    });
    const first = ["SIM Traveller One", "SIM Traveller Two"];
    const second = ["SIM Traveller Three", "SIM Traveller Four"];
    const plan: PartnerTravelPlan = {
      source: {
        kind: "sim",
        id: `SIM-complete-group-${fixture.marker}`,
        revision: "1",
        label: "SIM whole-group allocation plan",
      },
      groupCode: `SIM-GROUP-${fixture.marker}`,
      groupSize: 4,
      itineraryLink: `https://travel.example.test/${fixture.marker}`,
      guideName: "SIM Separate Tour Guide",
      guidePhone: "0900000099",
      fareBasis: "included_in_tour",
      legs: [
        {
          id: "SIM-leg-out",
          label: "SIM outbound transfer",
          pickupAddress: "SIM group meeting point",
          dropoffAddress: "SIM group destination",
          viaStops: ["SIM outbound planned stop"],
          signage: "SIM outbound group sign",
          batches: [
            {
              id: "SIM-batch-A",
              label: "SIM first departure",
              windowStart,
              windowEnd,
              meetingPoint: "SIM first group meeting",
              vehicles: [
                vehicle("SIM-slot-A", "SIM outbound vehicle A", first),
                vehicle("SIM-slot-B", "SIM outbound vehicle B", second),
              ],
            },
            {
              id: "SIM-batch-C",
              label: "SIM later departure",
              windowStart,
              windowEnd,
              meetingPoint: "SIM later group meeting",
              vehicles: [
                vehicle("SIM-slot-C", "SIM later vehicle C", first),
                vehicle("SIM-slot-D", "SIM later vehicle D", second),
              ],
            },
          ],
        },
        {
          id: "SIM-leg-return",
          label: "SIM return transfer",
          pickupAddress: "SIM group destination",
          dropoffAddress: "SIM group meeting point",
          viaStops: ["SIM return planned stop"],
          signage: "SIM return group sign",
          batches: [
            {
              id: "SIM-batch-B",
              label: "SIM return departure",
              windowStart,
              windowEnd,
              meetingPoint: "SIM return group meeting",
              vehicles: [
                vehicle("SIM-slot-A", "SIM return vehicle A", first),
                vehicle("SIM-slot-B", "SIM return vehicle B", second),
              ],
            },
          ],
        },
      ],
    };
    const selections = plan.legs.flatMap((leg) =>
      leg.batches.flatMap((batch) =>
        batch.vehicles.map((slot) => ({
          legId: leg.id,
          batchId: batch.id,
          vehicleId: slot.id,
        })),
      ),
    );
    const slotKey = (selection: (typeof selections)[number]) =>
      JSON.stringify([selection.legId, selection.batchId, selection.vehicleId]);
    expect(selections).toHaveLength(6);
    expect(new Set(selections.map(slotKey)).size).toBe(selections.length);
    const booked = new Map<
      string,
      Pick<NormalPartnerJourneyResult, "bookingId" | "orderId" | "details">
    >();
    const completed = new Map<string, NormalPartnerJourneyResult>();
    const deferred = () => {
      let resolve!: () => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<void>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      // Release peers on failure within the existing test deadline, leaving
      // cleanup time. This never raises the original test timeout or retries.
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              "Group barrier exceeded the existing hosted test cleanup budget",
            ),
          ),
        Math.max(1, info.timeout - (Date.now() - startedAt) - 30_000),
      );
      // Observe rejection even if setup fails before another allocation awaits.
      void promise.catch(() => undefined);
      return {
        promise,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (reason: unknown) => {
          clearTimeout(timer);
          reject(reason);
        },
      };
    };
    const allBooked = deferred();
    const otherVehiclesCompleted = deferred();
    let historyQueue = Promise.resolve();
    const readGroup = (expectCompleted: boolean, stage: string) => {
      const current = historyQueue.then(async () => {
        await test.step(stage, async () => {
          const history = await fixture.history(scope, partnerUserRef);
          expect(history.items).toHaveLength(selections.length);
          expect(booked.size).toBe(selections.length);
          for (const selection of selections) {
            const owned = booked.get(slotKey(selection));
            if (!owned)
              throw new Error(
                "A required allocation has no actual booking response",
              );
            const matches = history.items.filter(
              (booking) =>
                booking.bookingId === owned.bookingId &&
                booking.orderId === owned.orderId,
            );
            expect(matches).toHaveLength(1);
            const booking = matches[0]!;
            expect(booking.partnerBookingDetails).toMatchObject({
              subtype: "travel_agency_transfer",
              planSourceKind: plan.source.kind,
              planSourceId: plan.source.id,
              planSourceRevision: plan.source.revision,
              planLegId: selection.legId,
              planBatchId: selection.batchId,
              planVehicleId: selection.vehicleId,
            });
            if (expectCompleted || completed.has(slotKey(selection)))
              expect(booking.orderStatus).toBe("completed");
          }
          expect(
            history.items.every(
              (booking) => booking.orderStatus === "completed",
            ),
          ).toBe(expectCompleted);
          const url = `${PARTNER_ORIGIN}/${scope.entry.entrySlug}/trips?${new URLSearchParams({ partnerUserRef })}`;
          const opened = await historyPage.goto(url);
          expect(opened?.status()).toBe(200);
          const summary = historyPage.getByTestId(
            "partner-tour-booking-groups",
          );
          const group = summary.locator(
            `article[data-plan-source-id="${plan.source.id}"][data-plan-source-revision="${plan.source.revision}"]`,
          );
          await expect(group).toHaveCount(1);
          await expect(group).toContainText(plan.groupCode);
          await expect(group).toContainText(
            expectCompleted
              ? "All declared slots completed"
              : "Tour has outstanding or conflicting slots",
          );
          await expect(group).not.toContainText(
            expectCompleted
              ? "Tour has outstanding or conflicting slots"
              : "All declared slots completed",
          );
          await expect(group.locator("li[data-plan-vehicle-id]")).toHaveCount(
            selections.length,
          );
          for (const selection of selections) {
            const owned = booked.get(slotKey(selection))!;
            const row = group.locator(
              `li[data-plan-leg-id="${selection.legId}"][data-plan-batch-id="${selection.batchId}"][data-plan-vehicle-id="${selection.vehicleId}"]`,
            );
            await expect(row).toHaveCount(1);
            const link = row.getByRole("link", {
              name: `${owned.bookingId} / ${owned.orderId}`,
              exact: true,
            });
            await expect(link).toHaveCount(1);
            const target = new URL(
              (await link.getAttribute("href")) ?? "",
              PARTNER_ORIGIN,
            );
            expect(target.pathname).toBe(`/${scope.entry.entrySlug}/confirmed`);
            expect(target.searchParams.get("bookingId")).toBe(owned.bookingId);
            expect(target.searchParams.get("orderId")).toBe(owned.orderId);
            expect(target.searchParams.get("partnerUserRef")).toBe(
              partnerUserRef,
            );
          }
          await info.attach(`normal-travel-group-${stage}`, {
            contentType: "application/json",
            body: JSON.stringify({
              candidate_sha: required("CANDIDATE_SHA"),
              source: plan.source,
              tenantId: fixture.tenantId,
              partnerId: scope.entry.partnerId,
              programId: scope.entry.programId,
              entrySlug: scope.entry.entrySlug,
              allPagesRead: history.pagesRead,
              actualBookings: history.items.map(
                ({
                  bookingId,
                  orderId,
                  orderStatus,
                  partnerBookingDetails,
                }) => ({
                  bookingId,
                  orderId,
                  orderStatus,
                  partnerBookingDetails,
                }),
              ),
              wholeGroupCompleted: expectCompleted,
              noSyntheticBookingOrCompletedStatus: true,
            }),
          });
        });
      });
      historyQueue = current.catch(() => undefined);
      return current;
    };
    // Distinct real supply and browser sessions permit ordinary allocations to
    // run together under the existing 720-second hosted test budget. A final
    // real Driver task is deliberately held before its normal completion click.
    const lastSlot = selections.length - 1;
    const runs = selections.map((selection, index) =>
      runNormalPartnerJourney(browser, info, "travel_agency_transfer", {
        fixture,
        scope,
        partnerUserRef,
        referenceToken,
        plan,
        ...selection,
        slotNumber: index + 1,
        invoicePeriodStart: invoicePeriodStart.toISOString(),
        onBooked: async (booking) => {
          const key = slotKey(selection);
          expect(booked.has(key)).toBe(false);
          expect(booking.details).toMatchObject({
            planSourceId: plan.source.id,
            planSourceRevision: plan.source.revision,
            planLegId: selection.legId,
            planBatchId: selection.batchId,
            planVehicleId: selection.vehicleId,
          });
          booked.set(key, booking);
          if (booked.size === selections.length) {
            await readGroup(
              false,
              "all-required-slots-normally-booked-before-dispatch",
            );
            allBooked.resolve();
          }
          await allBooked.promise;
        },
        beforeComplete: async () => {
          if (index === lastSlot) {
            await otherVehiclesCompleted.promise;
            await readGroup(
              false,
              "other-vehicles-completed-last-real-task-still-on-trip",
            );
          }
        },
        onCompleted: async (result) => {
          const key = slotKey(selection);
          expect(result.details).toMatchObject({
            planSourceId: plan.source.id,
            planSourceRevision: plan.source.revision,
            planLegId: selection.legId,
            planBatchId: selection.batchId,
            planVehicleId: selection.vehicleId,
          });
          completed.set(key, result);
          if (index === lastSlot)
            await readGroup(
              true,
              "every-required-vehicle-really-driver-completed",
            );
          else {
            await readGroup(
              false,
              `vehicle-${index + 1}-completed-whole-group-still-open`,
            );
            if (completed.size === selections.length - 1)
              otherVehiclesCompleted.resolve();
          }
        },
      }).catch((error: unknown) => {
        allBooked.reject(error);
        otherVehiclesCompleted.reject(error);
        throw error;
      }),
    );
    const outcomes = await Promise.allSettled(runs);
    const failed = outcomes.find((outcome) => outcome.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    const actual = outcomes.map((outcome) => {
      if (outcome.status !== "fulfilled")
        throw new Error("Unfinished normal group allocation");
      return outcome.value;
    });
    for (const field of [
      "bookingId",
      "orderId",
      "dispatchJobId",
      "assignmentId",
      "taskId",
      "driverId",
      "vehicleId",
    ] as const)
      expect(
        new Set(actual.map((result) => result[field])).size,
        `distinct actual ${field} per declared allocation`,
      ).toBe(selections.length);
    expect(completed.size).toBe(selections.length);
    await readGroup(true, "whole-group-fresh-final-readback");
    await test.step("The final ordinary invoice contains every actual group order and its exact line fare", async () => {
      const final = actual[lastSlot]!;
      const invoice = await fixture.fixture.call<any>(
        `tenant/invoices/${encodeURIComponent(final.invoiceId)}`,
        fixture.tenantToken,
        "GET",
        undefined,
        fixture.tenantId,
      );
      const persisted = await fixture.fixture.db.query(
        "SELECT record FROM billing.phase1_tenant_invoices WHERE tenant_id=$1 AND invoice_id=$2",
        [fixture.tenantId, final.invoiceId],
      );
      expect(persisted.rows).toHaveLength(1);
      for (const record of [invoice, persisted.rows[0]!.record]) {
        expect(record).toMatchObject({
          invoiceId: final.invoiceId,
          tenantId: fixture.tenantId,
          periodStart: invoicePeriodStart.toISOString(),
        });
        for (const result of actual) {
          const lines = record.lines.filter(
            (line: any) => line.orderId === result.orderId,
          );
          expect(lines).toHaveLength(1);
          expect(lines[0]).toMatchObject({
            orderId: result.orderId,
            businessDispatchSubtype: "travel_agency_transfer",
            partnerId: scope.entry.partnerId,
            partnerProgramId: scope.entry.programId,
            partnerEntrySlug: scope.entry.entrySlug,
            amount: result.actualFare,
          });
        }
        for (const line of record.lines)
          expect(normalisePlatformCurrency(line.amount.currency)).toBe(
            normalisePlatformCurrency(record.amount.currency),
          );
        expect(record.amount.amountMinor).toBe(
          record.lines.reduce(
            (sum: number, line: any) => sum + line.amount.amountMinor,
            0,
          ),
        );
      }
      await info.attach(
        "normal-travel-whole-group-final-invoice-six-exact-own-lines",
        {
          contentType: "application/json",
          body: JSON.stringify({
            invoiceId: invoice.invoiceId,
            amount: invoice.amount,
            groupLines: invoice.lines.filter((line: any) =>
              actual.some((result) => result.orderId === line.orderId),
            ),
            allInvoiceLinesSummed: true,
            noAssumedSingleOrderHeaderTotal: true,
          }),
        },
      );
    });
    await info.attach("normal-travel-whole-group-actual-lifecycle-identities", {
      contentType: "application/json",
      body: JSON.stringify({
        candidate_sha: required("CANDIDATE_SHA"),
        source: plan.source,
        requiredSlots: selections,
        actual: actual.map(({ details, ...result }) => ({
          ...result,
          planLegId:
            details?.subtype === "travel_agency_transfer"
              ? details.planLegId
              : null,
          planBatchId:
            details?.subtype === "travel_agency_transfer"
              ? details.planBatchId
              : null,
          planVehicleId:
            details?.subtype === "travel_agency_transfer"
              ? details.planVehicleId
              : null,
        })),
        noDirectSQLMutation: true,
        notClaimed: [
          "physical-rides",
          "real-external-tour-system",
          "real-PSP",
          "production",
          "full-R14-or-UC16",
        ],
      }),
    });
  } finally {
    await historyContext?.close();
    await fixture.close();
  }
}
