import {
  test,
  expect,
  type BrowserContext,
  type APIRequestContext,
  type Request as PlaywrightRequest,
  type Response as PlaywrightResponse,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  prepareOperationalFleetSession,
  operationalRequestHeaders,
  uploadOperationalDocument,
  type PreparedOperationalFleetSession,
} from "../operational-document-upload";
import {
  Evidence,
  NativeTransport,
  JourneyFailure,
  requireFact,
  object,
  text,
  integer,
  records,
  mask,
  hash,
  origin,
  assertOwnPair,
  assertTask,
  assertRatingReplay,
  assertCompletedFare,
  simulationCompletion,
  assertNoForeignActive,
  terminalizeOwnOrder,
  BookingWriteJournal,
  persistPrivateJson,
  readOwnedReferralCookies,
  adoptReferralSession,
  type ObjectData,
  type Role,
  type CallOptions,
} from "./protocol";

const ENTRY = "yuhe-residence";
const SUBJECT = "referral-demo-yuhe-residence";
const FLEET = "fleet-demo-001";
const TENANT = "10000000-0000-0000-0000-000000000201";
const DIRECTORY = ".artifacts/owned-referral-business-journey";
const PHOTO =
  "apps/driver-app/android/app/src/main/res/drawable-mdpi/splashscreen_logo.png";
const env = (key: string) => text(process.env[key], `configuration:${key}`);
const now = () => new Date().toISOString();
const future = () =>
  new Date(Date.now() + 366 * 86_400_000).toISOString().slice(0, 10);
const start = () =>
  new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

async function cookieHeader(
  context: BrowserContext,
  target: string,
): Promise<string> {
  return (await context.cookies(target))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

test("owned synthetic business ride uses the public Demo identity through completion, TXT and no-contact CRM", async ({
  browser,
  request,
}) => {
  requireFact(
    process.env.OWNED_REFERRAL_HOSTED_OPT_IN === "true" &&
      process.env.GITHUB_ACTIONS === "true",
    "hosted explicit opt-in required",
  );
  const definition = env("OWNED_TEST_CODE_SHA");
  requireFact(
    /^[a-f0-9]{40}$/.test(definition),
    "immutable test-code SHA required",
  );
  const runtime = env("EXPECTED_RUNTIME_SHA");
  const origins = {
    api: origin(env("DRTS_OPERATIONAL_API_URL")),
    admin: origin(env("DRTS_OPERATIONAL_PLATFORM_ADMIN_URL")),
    ops: origin(env("OWNED_OPS_ORIGIN")),
    fleet: origin(env("DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL")),
    referral: origin(env("OWNED_REFERRAL_ORIGIN")),
  };
  const apiInvocation = env("OWNED_API_ID_TOKEN");
  const invocation = {
    api: apiInvocation,
    admin: env("DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN"),
    ops: env("OWNED_OPS_ID_TOKEN"),
    fleet: env("DRTS_DEV_FLEET_PARTNER_PORTAL_ID_TOKEN"),
  };
  Object.values(invocation).forEach(mask);
  const evidence = new Evidence();
  const nonce = `owned-referral-${process.env.GITHUB_RUN_ID}-${randomUUID()}`;
  const phone = `090000${String(process.env.GITHUB_RUN_ID).slice(-4).padStart(4, "0")}`;
  const context = await browser.newContext();
  const page = await context.newPage();
  const tx = new NativeTransport(origins, runtime, invocation, fetch, (url) =>
    operationalRequestHeaders("DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL", url),
  );
  let fleet: PreparedOperationalFleetSession | undefined;
  let adminSessionId: string | undefined;
  let driverId: string | undefined;
  let vehicleId: string | undefined;
  let deviceId: string | undefined;
  let bindingId: string | undefined;
  let invitation: string | undefined;
  let orderId: string | undefined;
  let passengerId: string | undefined;
  let referralSessionId: string | undefined;
  let completed = false;
  let controlRole: "api" | "ops" = "api";
  let mainError: unknown;
  const bookingState: {
    journal: BookingWriteJournal | undefined;
    routeError: unknown;
    quote: ObjectData | undefined;
  } = { journal: undefined, routeError: undefined, quote: undefined };
  const cleanupErrors: string[] = [];

  const call = async (role: Role, path: string, options: CallOptions = {}) =>
    object((await tx.call(role, path, options)).data);
  const control = (path: string, options: CallOptions = {}) =>
    call(
      controlRole,
      `${controlRole === "ops" ? "/control-plane-proxy" : "/api"}${path}`,
      options,
    );
  const referral = async (path: string, options: CallOptions = {}) =>
    tx.call("referral", path, {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        Cookie: await cookieHeader(context, origins.referral),
      },
    });
  const getOrder = async () => {
    requireFact(
      orderId && passengerId,
      "own order ACK required before order access",
    );
    const order = await control(`/orders/${encodeURIComponent(orderId)}`);
    requireFact(
      order.orderId === orderId &&
        order.partnerEntrySlug === ENTRY &&
        object(order.passenger).passengerId === passengerId,
      "own canonical order subject binding",
    );
    return order;
  };
  const stepUp = async (path: string, actionId: string) => {
    const proof = await call(
      "admin",
      "/control-plane-proxy/identity/step-up-proofs",
      {
        method: "POST",
        body: { method: "POST", path },
      },
    );
    const reference = text(proof.stepUpReference);
    mask(reference);
    requireFact(
      proof.required === true && proof.actionId === actionId,
      "exact same-session action proof",
    );
    return reference;
  };
  const cleanup = async (stage: string, action: () => Promise<unknown>) => {
    try {
      await action();
      evidence.record({ stage, result: "cleaned" });
    } catch (error) {
      cleanupErrors.push(stage);
      evidence.failure(error);
    }
  };

  try {
    const png = await readFile(PHOTO);
    requireFact(
      png
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
        png.length < 1024 * 1024,
      "tracked PNG simulation bytes required",
    );
    evidence.record({
      stage: "synthetic-not-physical-trip-photo",
      sha256: hash(png),
      bytes: png.length,
      result: "observed",
    });
    // Verify served headers separately from the gcloud metadata revision fence.
    for (const [role, path] of [
      ["api", "/health"],
      ["admin", "/"],
      ["ops", "/"],
      ["referral", `/embed/${ENTRY}`],
    ] as const) {
      await tx.call(role, path, { raw: true, expected: [200] });
      evidence.record({ stage: `served-${role}-same-runtime`, status: 200 });
    }
    // A new canonical Admin session; neither an IAM token nor a signed proxy is
    // used as application authority. The exact issuance ACK is retained privately.
    const ack = await call("admin", "/control-plane-proxy/auth/token", {
      method: "POST",
      body: {},
    });
    const adminToken = text(ack.token);
    mask(adminToken);
    adminSessionId = text(ack.sessionId);
    mask(adminSessionId);
    const principalId = text(ack.principalId);
    tx.setSession("admin", adminToken);
    tx.setSession("api", adminToken);
    tx.setSession("ops", adminToken);
    const verified = await call("api", "/api/auth/session");
    const identity = object(verified.identity);
    requireFact(
      verified.active === true &&
        identity.realm === "platform" &&
        identity.actorType === "platform_admin" &&
        identity.authMode === "jwt_bearer" &&
        identity.sessionId === adminSessionId &&
        identity.principalId === principalId &&
        typeof identity.membershipId === "string",
      "canonical Admin session readback",
    );
    // The existing Ops proxy preserves a supplied canonical JWT in the dev
    // branch. Test that actual surface first; if it denies this platform realm,
    // keep its denial and select the original direct API transport, same JWT.
    try {
      const opsSession = await call("ops", "/control-plane-proxy/auth/session");
      requireFact(
        opsSession.active === true &&
          object(opsSession.identity).sessionId === adminSessionId &&
          object(opsSession.identity).realm === "platform",
        "Ops BFF preserves genuine platform session",
      );
      controlRole = "ops";
    } catch (error) {
      if (!(error instanceof JourneyFailure) || error.status !== 403)
        throw error;
      evidence.failure(error);
      controlRole = "api";
      evidence.record({
        stage: "normal-direct-api-platform-transport-selected",
        result: "observed",
      });
    }
    evidence.record({
      stage: "canonical-platform-authority-verified",
      principalId,
      membershipId: text(identity.membershipId),
      realm: "platform",
      actorType: "platform_admin",
      result: "observed",
    });

    const entry = await call("publicApi", `/api/partner/entries/${ENTRY}`);
    const host = text(entry.entryHost);
    const handoff = await call(
      "publicApi",
      "/api/partner/ingress/referral-embed-handoff",
      {
        method: "POST",
        headers: { "x-drts-google-id-token": apiInvocation },
        body: { entrySlug: ENTRY, entryHost: host, partnerUserRef: SUBJECT },
      },
    );
    const artifact = text(handoff.artifact);
    mask(artifact);
    const exchange = await tx.call("referral", "/api/referral/session", {
      method: "POST",
      body: { action: "exchange", artifact, entrySlug: ENTRY, entryHost: host },
      expected: [200],
    });
    await adoptReferralSession(context, exchange.headers, origins.referral);
    const publicSession = object(object(exchange.data).session);
    requireFact(
      publicSession.partnerEntrySlug === ENTRY,
      "Referral entry session binding",
    );
    await page.goto(
      `${origins.referral}/embed/${ENTRY}?state=handoff&screen=book&entryHost=${encodeURIComponent(host)}`,
    );
    if (publicSession.identityActive !== true) {
      await page
        .getByRole("button", { name: "同意並開始", exact: true })
        .click();
      evidence.record({
        stage: "actual-web-consent-submitted",
        result: "observed",
      });
    } else
      evidence.record({
        stage: "returning-existing-consent-not-first-consent",
        result: "observed",
      });
    await expect(page.locator('input[name="pickupAddress"]')).toBeVisible();
    const ownReferral = readOwnedReferralCookies(
      await context.cookies(origins.referral),
      ENTRY,
    );
    tx.setSession("referralApi", ownReferral.accessToken);
    referralSessionId = ownReferral.sessionId;
    const canonicalReferral = await call("referralApi", "/api/auth/session");
    const canonicalReferralIdentity = object(canonicalReferral.identity);
    requireFact(
      canonicalReferral.active === true &&
        canonicalReferralIdentity.realm === "partner" &&
        canonicalReferralIdentity.actorType === "referral_passenger" &&
        canonicalReferralIdentity.authMode === "jwt_bearer" &&
        canonicalReferralIdentity.actorId === ownReferral.passengerId &&
        canonicalReferralIdentity.sessionId === ownReferral.sessionId,
      "canonical own Referral subject and session readback",
    );
    passengerId = ownReferral.passengerId;
    const active = (await referral("/api/referral/active")).data;
    assertNoForeignActive(active);

    fleet = await prepareOperationalFleetSession({
      fleetPartnerId: FLEET,
      tenantId: TENANT,
    });
    await tx.call("fleet", "/", { raw: true, expected: [200] });
    evidence.record({
      stage: "normal-own-first-key-Fleet-session",
      result: "observed",
    });
    const driverDraft = await call(
      "fleet",
      "/control-plane-proxy/fleet-partner/supply-submissions/drivers",
      {
        method: "POST",
        body: {
          name: `合成測試司機 ${nonce.slice(-12)}`,
          mobile: phone,
          professionalDriverLicenseNo: `SIM-DL-${nonce}`,
          professionalDriverLicenseExpiry: future(),
          taxiDriverRegistrationNo: `SIM-REG-${nonce}`,
          taxiDriverRegistrationArea: "TPE",
          taxiDriverRegistrationExpiry: future(),
          supportedServiceProductCodes: ["enterprise_dispatch"],
          preferredVehicleSubmissionId: null,
        },
      },
    );
    const driverSubmissionId = text(
      object(driverDraft.submission).submissionId,
    );
    const approve = async (submissionId: string, types: string[]) => {
      const path = `/control-plane-proxy/fleet-partner/supply-submissions/${encodeURIComponent(submissionId)}`;
      for (const documentType of types) {
        const detail = await call("fleet", path);
        const submission = object(detail.submission);
        requireFact(
          submission.submissionId === submissionId &&
            submission.fleetPartnerId === FLEET,
          "exact own submission binding",
        );
        const revision = integer(submission.revisionNo);
        const proof = await uploadOperationalDocument(
          request as APIRequestContext,
          origins.fleet,
          `${path}/documents/upload-url`,
          { expectedRevisionNo: revision, documentType },
          `${path}/documents/confirm`,
          {
            expectedRevisionNo: revision,
            documentType,
            effectiveFrom: start(),
            effectiveUntil: future(),
          },
          operationalRequestHeaders(
            "DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL",
            `${origins.fleet}${path}`,
          ),
        );
        requireFact(
          proof.putScanState === "clean" &&
            proof.readbackSha256 === proof.sha256,
          "actual document clean byte-equal receipt",
        );
        evidence.record({
          stage: "synthetic-document-upload-confirm-download",
          submissionId,
          documentId: text(
            proof.documentId,
            "actual confirmed document ID required",
          ),
          objectKey: proof.objectKey,
          sha256: proof.sha256,
          bytes: proof.fileSize,
        });
      }
      let detail = await call("fleet", path);
      await call("fleet", `${path}/submit`, {
        method: "POST",
        body: {
          expectedRevisionNo: integer(object(detail.submission).revisionNo),
        },
      });
      for (const action of ["start", "approve"]) {
        detail = await call("fleet", path);
        await call(
          "admin",
          `/control-plane-proxy/admin/supply-review/submissions/${encodeURIComponent(submissionId)}/${action}`,
          {
            method: "POST",
            body: {
              expectedRevisionNo: integer(object(detail.submission).revisionNo),
              reasonCode: "synthetic_dev_demo",
              comment: "明示合成開發示範；非正式證照或真實營運資格聲明。",
            },
          },
        );
      }
      const result = object((await call("fleet", path)).submission);
      requireFact(
        result.status === "approved" && result.fleetPartnerId === FLEET,
        "normal same-Fleet review approval",
      );
      evidence.record({
        stage: "own-submission-approved-retained",
        submissionId,
        result: "retained",
      });
      return result;
    };
    const approvedDriver = await approve(driverSubmissionId, [
      "professional_driver_license",
      "taxi_driver_registration",
    ]);
    driverId = text(approvedDriver.canonicalDriverId);
    const vehicleDraft = await call(
      "fleet",
      "/control-plane-proxy/fleet-partner/supply-submissions/vehicles",
      {
        method: "POST",
        body: {
          plateNo: `SIM-${randomUUID().slice(0, 8).toUpperCase()}`,
          licenseType: "business_vehicle",
          brand: "合成示範",
          model: "非正式測試車",
          modelYear: new Date().getUTCFullYear(),
          seatCount: 5,
          luggageCapacity: 4,
          businessArea: "TPE",
          supportedServiceProductCodes: ["enterprise_dispatch"],
          airportTransferEligible: false,
          fixedFareAllowed: false,
          currentDriverSubmissionId: driverSubmissionId,
          doorCount: 4,
          color: "白色",
        },
      },
    );
    const vehicleSubmissionId = text(
      object(vehicleDraft.submission).submissionId,
    );
    const approvedVehicle = await approve(vehicleSubmissionId, [
      "vehicle_registration",
      "insurance_policy",
      "fleet_participation_contract",
    ]);
    vehicleId = text(approvedVehicle.canonicalVehicleId);
    text(approvedVehicle.canonicalContractId);
    text(approvedVehicle.canonicalPolicyId);
    const exclusion = `/regulatory-registry/exclusivities/${encodeURIComponent(vehicleId)}`;
    await control(`${exclusion}/submit-review`, {
      method: "POST",
      body: {
        exclusiveProviderName: "合成開發示範車隊（非正式營運聲明）",
        effectiveStart: `${start()}T00:00:00.000Z`,
        effectiveEnd: `${future()}T23:59:59.000Z`,
      },
    });
    const proof = await stepUp(
      `/api${exclusion}/approve`,
      "platform:regulatory-exclusivities:approve",
    );
    await control(`${exclusion}/approve`, {
      method: "POST",
      body: {},
      headers: { "x-drts-step-up-reference": proof },
    });
    await control(
      `/regulatory-registry/drivers/${encodeURIComponent(driverId)}/work-state`,
      { method: "POST", body: { workState: "available" } },
    );
    evidence.record({
      stage: "own-supply-exclusivity-approved",
      driverId,
      vehicleId,
      result: "retained",
    });

    const invite = await call("api", "/api/auth/driver/device/invite", {
      method: "POST",
      body: { driverId },
      headers: { "x-idempotency-key": `${nonce}-invite` },
    });
    invitation = text(invite.registrationCode);
    mask(invitation);
    deviceId = `${nonce}-device`;
    const driver = await call("publicApi", "/api/auth/driver/device/register", {
      method: "POST",
      body: {
        registrationCode: invitation,
        deviceId,
        deviceLabel: "明示合成示範裝置",
      },
    });
    const driverToken = text(driver.accessToken);
    mask(driverToken);
    mask(text(driver.refreshToken));
    requireFact(
      driver.driverId === driverId && driver.deviceId === deviceId,
      "actual bound Driver registration",
    );
    bindingId = text(driver.bindingId);
    tx.setSession("driver", driverToken);
    const driverSession = await call("driver", "/api/auth/session");
    requireFact(
      driverSession.active === true &&
        object(driverSession.identity).realm === "driver" &&
        object(driverSession.identity).actorId === driverId,
      "actual Driver session identity",
    );

    const pickupAddress = "新北市板橋區縣民大道二段7號";
    const dropoffAddress = "臺北市信義區市府路1號";
    const passengerName = `合成測試 ${nonce.slice(-10)}`;
    await page.locator('input[name="scheduledAt"]').fill("");
    await page.locator('input[name="passengerName"]').fill(passengerName);
    await page.locator('input[name="passengerPhone"]').fill(phone);
    // The existing form defaults to these addresses. Make a real edit before
    // waiting, so this waits for this intent's quote rather than an old response.
    await page.locator('input[name="pickupAddress"]').fill("");
    await page.getByRole("radio", { name: "標準車", exact: true }).check();
    const currentQuoteRequests = new Set<PlaywrightRequest>();
    const observedQuoteTasks: Promise<ObjectData>[] = [];
    const quotesById = new Map<string, ObjectData>();
    const matchesQuoteIntent = (request: PlaywrightRequest) => {
      if (
        request.url() !== `${origins.referral}/api/referral/quote` ||
        request.method() !== "POST"
      )
        return false;
      const body = object(request.postDataJSON());
      return (
        body.entrySlug === ENTRY &&
        body.pickupAddress === pickupAddress &&
        body.dropoffAddress === dropoffAddress &&
        body.vehicleType === "standard" &&
        !body.scheduledAt
      );
    };
    page.on("request", (request) => {
      if (matchesQuoteIntent(request)) currentQuoteRequests.add(request);
    });
    const readCurrentQuote = async (response: PlaywrightResponse) => {
      requireFact(
        response.status() === 200 &&
          response.headers()["x-drts-candidate-sha"] === runtime,
        "real Geo tariff quote response",
      );
      const proposal = object(object(await response.json()).data);
      const requested = object(response.request().postDataJSON());
      requireFact(
        proposal.pickupAddress === pickupAddress &&
          proposal.dropoffAddress === dropoffAddress &&
          proposal.vehicleType === requested.vehicleType &&
          proposal.timingMode === "immediate" &&
          proposal.requestedScheduledAt === null &&
          proposal.fixedPrice === false &&
          proposal.isGuaranteed === false &&
          proposal.quotedFareSource === "platform_pricing_rule",
        "current nonfixed Geo intent quote",
      );
      quotesById.set(text(proposal.quoteId), proposal);
      return proposal;
    };
    page.on("response", (response) => {
      if (!currentQuoteRequests.has(response.request())) return;
      const task = readCurrentQuote(response);
      observedQuoteTasks.push(task);
      void task.catch(() => undefined); // Rejected observations are awaited below.
    });
    const quoteResponse = page.waitForResponse((response) =>
      currentQuoteRequests.has(response.request()),
    );
    await page.locator('input[name="pickupAddress"]').fill(pickupAddress);
    await page.locator('input[name="dropoffAddress"]').fill(dropoffAddress);
    const response = await quoteResponse;
    const quote = await readCurrentQuote(response);
    text(quote.quoteId);
    const pickup = object(quote.pickup);
    evidence.record({
      stage: "actual-nonguaranteed-estimate-not-payment",
      quoteId: text(quote.quoteId),
      estimatedMinMinor: integer(quote.estimatedMinMinor),
      estimatedMaxMinor: integer(quote.estimatedMaxMinor),
    });
    requireFact(
      typeof pickup.lat === "number" && typeof pickup.lng === "number",
      "actual Geo quote coordinates",
    );
    const heartbeat = async (
      taskId: string | null,
      workState: string,
      sequenceNo: number,
    ) => {
      const result = await call(
        "driver",
        "/api/driver/location-heartbeats/batch",
        {
          method: "POST",
          body: {
            items: [
              {
                eventId: randomUUID(),
                deviceId,
                driverId,
                vehicleId,
                taskId,
                sequenceNo,
                recordedAt: now(),
                lat: pickup.lat,
                lng: pickup.lng,
                accuracyM: 5,
                workState,
                appState: "foreground",
                transportMode: "foreground",
                networkType: "wifi",
              },
            ],
          },
        },
      );
      const item = object(records(result.items)[0]);
      requireFact(
        item.accepted === true && item.currentLocationUpdated === true,
        "normal simulation GPS observation accepted",
      );
    };
    await heartbeat(null, "available", 1);
    await page.route(
      `${origins.referral}/api/referral/booking`,
      async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        try {
          const rawBody = text(
            route.request().postData(),
            "actual UI booking body required",
          );
          const actualCommand = object(JSON.parse(rawBody));
          // The UI may consume a later legitimate proposal for the same intent.
          // Select by its actual frozen command, never by response arrival order.
          await Promise.all([...observedQuoteTasks]);
          const selected = quotesById.get(text(actualCommand.quoteId));
          requireFact(
            selected,
            "UI must consume an observed current Geo proposal",
          );
          requireFact(
            !bookingState.journal,
            "one frozen UI booking command only",
          );
          bookingState.quote = selected;
          const journal = new BookingWriteJournal(
            {
              definitionSha: definition,
              runtimeSha: runtime,
              nonce,
              entrySlug: ENTRY,
              partnerUserRef: SUBJECT,
              quoteId: text(selected.quoteId),
              pickupAddress,
              dropoffAddress,
              passengerName,
              passengerPhone: phone,
              vehicleType:
                selected.vehicleType === null
                  ? null
                  : text(selected.vehicleType),
            },
            (snapshot) =>
              persistPrivateJson(
                `${DIRECTORY}/booking-write-journal.json`,
                snapshot,
              ),
          );
          bookingState.journal = journal;
          await journal.beforeSend(
            rawBody,
            text(
              route.request().headers()["idempotency-key"],
              "actual UI booking key header required",
            ),
            () => route.continue(),
          );
        } catch (error) {
          bookingState.routeError = error;
          evidence.record({
            stage: bookingState.journal?.current
              ? "booking:send-ACK-unknown"
              : "booking:command-or-journal-rejected-before-send",
            result: "failed",
          });
          await route.abort("blockedbyclient");
        }
      },
    );
    const bookingResponse = page.waitForResponse(
      (value) =>
        value.url() === `${origins.referral}/api/referral/booking` &&
        value.request().method() === "POST",
    );
    await page.locator('[data-drt-operation="referral-create"]').click();
    const booking = await bookingResponse;
    if (bookingState.routeError) throw bookingState.routeError;
    requireFact(
      bookingState.journal && bookingState.quote,
      "frozen current booking proposal required before ACK",
    );
    requireFact(
      booking.ok() && booking.headers()["x-drts-candidate-sha"] === runtime,
      "actual Referral create",
    );
    const bookingCommand = object(booking.request().postDataJSON());
    requireFact(
      bookingCommand.quoteId === bookingState.quote.quoteId &&
        typeof bookingCommand.idempotencyKey === "string",
      "one actual UI quote/idempotency binding",
    );
    const created = object(object(await booking.json()).data);
    orderId = text(created.orderId);
    requireFact(
      object(created.quote).quoteId === bookingState.quote.quoteId,
      "create consumed exact quote",
    );
    await bookingState.journal.acknowledge(
      orderId,
      text(object(created.quote).quoteId),
    );
    evidence.record({
      stage: "UI-consumed-Geo-proposal",
      orderId,
      quoteId: text(bookingState.quote.quoteId),
      estimatedMinMinor: integer(bookingState.quote.estimatedMinMinor),
      estimatedMaxMinor: integer(bookingState.quote.estimatedMaxMinor),
    });
    evidence.record({
      stage: "owned-public-Demo-order-created",
      orderId,
      driverId,
      vehicleId,
    });
    const order = await getOrder();
    requireFact(
      order.serviceBucket === "business_dispatch" &&
        order.serviceProductCode === "enterprise_dispatch",
      "actual business order qualification",
    );
    const dispatched = await control(
      `/orders/${encodeURIComponent(orderId)}/dispatch`,
      {
        method: "POST",
        body: { mode: "auto" },
        headers: { "Idempotency-Key": `${nonce}-dispatch` },
      },
    );
    const dispatchJobId = text(dispatched.dispatchJobId);
    const candidates = await control(
      `/dispatch/tasks/${encodeURIComponent(dispatchJobId)}/candidates?includeIneligible=true`,
    );
    const own = records(candidates.items).find(
      (candidate) =>
        candidate.driverId === driverId && candidate.vehicleId === vehicleId,
    );
    requireFact(
      own,
      "approved durable own pair missing from normal candidates",
    );
    assertOwnPair(own, { driverId, vehicleId });
    await control("/dispatch/assign", {
      method: "POST",
      body: { dispatchJobId, driverId, vehicleId },
      headers: { "Idempotency-Key": `${nonce}-assign` },
    });
    const taskList = await call("driver", "/api/driver/tasks");
    const tasks = records(taskList.items).filter(
      (item) => item.orderId === orderId,
    );
    requireFact(tasks.length === 1, "exactly one own Driver task");
    const soleTask = tasks[0];
    requireFact(soleTask, "own Driver task record required");
    const taskId = text(soleTask.taskId);
    const assignmentId = text(soleTask.assignmentId);
    const ownTask = { orderId, driverId, vehicleId, taskId };
    const assertCurrentTask = async () => {
      const task = await call(
        "driver",
        `/api/driver/tasks/${encodeURIComponent(taskId)}`,
      );
      assertTask(task, ownTask);
      requireFact(
        task.assignmentId === assignmentId &&
          task.dispatchJobId === dispatchJobId,
        "stable own dispatch assignment",
      );
      return task;
    };
    await assertCurrentTask();
    for (const [action, timeKey, state] of [
      ["accept", "acceptedAt", "assigned"],
      ["depart", "departedAt", "enroute"],
      ["arrived_pickup", "arrivedAt", "arrived"],
      ["start", "startedAt", "on_trip"],
    ] as const) {
      const body = {
        [timeKey]: now(),
        ...(action === "depart" ? { currentLocation: pickup } : {}),
      };
      await call(
        "driver",
        `/api/driver/tasks/${encodeURIComponent(taskId)}/${action}`,
        { method: "POST", body },
      );
      await assertCurrentTask();
      await heartbeat(
        taskId,
        state,
        ["accept", "depart", "arrived_pickup", "start"].indexOf(action) + 2,
      );
      evidence.record({
        stage: `bound-driver-${action}`,
        orderId,
        taskId,
        driverId,
        vehicleId,
      });
    }
    const completion = simulationCompletion(
      await getOrder(),
      `data:image/png;base64,${png.toString("base64")}`,
    );
    await call(
      "driver",
      `/api/driver/tasks/${encodeURIComponent(taskId)}/complete`,
      { method: "POST", body: completion },
    );
    const completedTask = await assertCurrentTask();
    requireFact(
      completedTask.status === "completed" &&
        (await getOrder()).status === "completed",
      "canonical same-order completed readback",
    );
    completed = true;
    const history = object(
      (await referral(`/api/referral/history/${encodeURIComponent(orderId)}`))
        .data,
    );
    requireFact(
      history.orderId === orderId &&
        history.status === "completed" &&
        typeof history.completedAt === "string",
      "same-subject Referral completed history",
    );
    const receipt = object(
      (await referral(`/api/referral/receipt/${encodeURIComponent(orderId)}`))
        .data,
    );
    requireFact(
      receipt.orderId === orderId && receipt.status === "completed",
      "same-order Referral receipt",
    );
    const download = await referral(
      `/api/referral/receipt/${encodeURIComponent(orderId)}/download`,
      { raw: true, expected: [200] },
    );
    const txt = Buffer.from(download.bytes).toString("utf8");
    requireFact(
      download.headers.get("content-type")?.startsWith("text/plain") &&
        txt.includes(orderId) &&
        txt.includes("非正式稅務憑證"),
      "actual nonformal TXT bytes",
    );
    assertCompletedFare(completion, completedTask, history, receipt, txt);
    await mkdir(DIRECTORY, { recursive: true });
    await writeFile(`${DIRECTORY}/own-receipt.txt`, download.bytes, {
      mode: 0o600,
    });
    evidence.record({
      stage: "same-order-nonformal-TXT",
      orderId,
      bytes: download.bytes.length,
      sha256: hash(download.bytes),
    });
    const ratingBody = {
      orderId,
      score: 2,
      contactRequested: false,
      comment: "明示合成開發測試，毋須聯絡",
      tags: [],
      idempotencyKey: `${nonce}-rating`,
    };
    const first = object(
      (
        await referral(`/api/referral/rating/${encodeURIComponent(orderId)}`, {
          method: "POST",
          body: ratingBody,
        })
      ).data,
    );
    const replay = object(
      (
        await referral(`/api/referral/rating/${encodeURIComponent(orderId)}`, {
          method: "POST",
          body: ratingBody,
        })
      ).data,
    );
    assertRatingReplay(first, replay, orderId);
    const changed = await referral(
      `/api/referral/rating/${encodeURIComponent(orderId)}`,
      { method: "POST", body: { ...ratingBody, score: 1 }, expected: [409] },
    );
    requireFact(changed.status === 409, "changed rating conflict409");
    const after = object(
      (
        await referral(`/api/referral/rating/${encodeURIComponent(orderId)}`, {
          method: "POST",
          body: ratingBody,
        })
      ).data,
    );
    assertRatingReplay(first, after, orderId);
    const persistedHistory = object(
      (await referral(`/api/referral/history/${encodeURIComponent(orderId)}`))
        .data,
    );
    assertRatingReplay(
      first,
      { ...object(persistedHistory.rating), orderId: persistedHistory.orderId },
      orderId,
    );
    const caseNo = text(first.complaintCaseNo);
    const complaint = await control(
      `/complaints/${encodeURIComponent(caseNo)}`,
    );
    requireFact(
      complaint.caseNo === caseNo && complaint.relatedOrderId === orderId,
      "canonical CRM same-order case",
    );
    requireFact(
      typeof complaint.description === "string" &&
        complaint.description.includes("同意客服聯繫：否"),
      "canonical CRM retains contactfalse",
    );
    const timeline = await control(
      `/complaints/${encodeURIComponent(caseNo)}/timeline`,
    );
    requireFact(
      records(timeline.items).some(
        (item) =>
          item.caseNo === caseNo &&
          item.action === "case_created" &&
          typeof item.note === "string" &&
          item.note.includes("同意客服聯繫：否"),
      ),
      "canonical CRM creation timeline",
    );
    evidence.record({
      stage: "low-two-contactfalse-same-case-replay-and-conflict409",
      orderId,
      caseNo,
      result: "retained",
    });
    await page.goto(
      `${origins.referral}/embed/${ENTRY}?state=handoff&screen=completed&orderId=${encodeURIComponent(orderId)}`,
    );
    await expect(
      page.getByText("行程已完成", { exact: false }).first(),
    ).toBeVisible();
  } catch (error) {
    mainError = bookingState.routeError ?? error;
    evidence.failure(mainError);
  } finally {
    if (bookingState.journal?.current?.state === "ack_unknown") {
      cleanupErrors.push("booking-ACK-unknown-possible-write");
      evidence.record({
        stage: "booking-ACK-unknown-possible-write",
        sha256: bookingState.journal.current.bodySha256,
        result: "retained",
      });
    }
    // No broad DB/GCS cleanup. Never cancel a pre-existing fixed-subject order.
    if (orderId && !completed)
      await cleanup("own-order-normal-terminalization", async () => {
        await terminalizeOwnOrder(orderId!, getOrder, async (action) => {
          if (action === "resolve-exception-hold")
            return control(
              `/orders/${encodeURIComponent(orderId!)}/resolve-exception-hold`,
              {
                method: "POST",
                body: {
                  resolution: "cancel_order",
                  reason:
                    "Own synthetic consumer failed; normal exception cleanup",
                  traceId: `${nonce}-cleanup`,
                },
              },
            );
          return control(
            `/passenger/orders/${encodeURIComponent(orderId!)}/cancel`,
            {
              method: "POST",
              body: { reason: "Own synthetic consumer cleanup" },
            },
          );
        });
      });
    const ownDriverForCleanup = driverId;
    if (ownDriverForCleanup)
      await cleanup("own-synthetic-driver-offline", () =>
        control(
          `/regulatory-registry/drivers/${encodeURIComponent(ownDriverForCleanup)}/work-state`,
          { method: "POST", body: { workState: "offline" } },
        ),
      );
    if (bindingId && deviceId)
      await cleanup("own-Driver-binding-revoked", () =>
        call("driver", "/api/auth/driver/device/revoke", {
          method: "POST",
          body: { bindingId, deviceId },
        }),
      );
    else if (invitation)
      await cleanup("own-unused-invitation-revoked", () =>
        call("api", "/api/auth/driver/device/invite/revoke", {
          method: "POST",
          body: { registrationCode: invitation },
          headers: { "x-idempotency-key": `${nonce}-invite-revoke` },
        }),
      );
    if (fleet)
      await cleanup("own-Fleet-session-key-entry-cleanup", fleet.cleanup);
    const ownReferralSessionForCleanup = referralSessionId;
    if (ownReferralSessionForCleanup)
      await cleanup("own-Referral-session-self-revoked", async () => {
        await call("referralApi", "/api/auth/sessions/revoke", {
          method: "POST",
          body: { sessionId: ownReferralSessionForCleanup },
        });
        const inactive = await tx.call("referralApi", "/api/auth/session", {
          expected: [200, 401],
        });
        requireFact(
          inactive.status === 401 || object(inactive.data).active === false,
          "own Referral session inactive after self-revocation",
        );
      });
    if (adminSessionId)
      await cleanup("own-Admin-session-revoked", () =>
        call("api", "/api/auth/sessions/revoke", {
          method: "POST",
          body: { sessionId: adminSessionId },
        }),
      );
    await cleanup("browser-context-closed", () => context.close());
    await mkdir(DIRECTORY, { recursive: true });
    await writeFile(
      `${DIRECTORY}/journey-evidence.json`,
      JSON.stringify(
        {
          definitionSha: definition,
          runtimeSha: runtime,
          nonce,
          entrySlug: ENTRY,
          subject: SUBJECT,
          completed,
          cleanupErrors,
          bookingWrite: bookingState.journal?.current
            ? {
                state: bookingState.journal.current.state,
                bodySha256: bookingState.journal.current.bodySha256,
                journal: "booking-write-journal.json",
                recovery: bookingState.journal.current.recovery,
              }
            : null,
          events: evidence.events,
          simulation:
            "Synthetic dev driver/vehicle/documents/GPS/project PNG and Driver-declared fare; no physical ride, legal approval, PSP debit, E04 or formal PDF claim.",
          declaredActualFare: completed
            ? {
                currency: "TWD",
                amountMinor: 12000,
                source: "synthetic_driver_report",
                notEstimateOrPayment: true,
              }
            : null,
          retained:
            "Approved own supply/documents, completed order/CRM and fixed Demo identity remain. No inherited H3 cleanup claim.",
          cancellations: [
            "unassigned",
            "assigned-not-arrived",
            "arrived-not-started",
            "on-trip",
          ].map((stage) => ({
            stage,
            result: "unexecuted",
            reason:
              "Minimum same-order completion scenario; no cancellation pass borrowed.",
          })),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
  if (mainError)
    throw mainError instanceof JourneyFailure
      ? mainError
      : new JourneyFailure("consumer-check-failed-see-allowlisted-evidence");
  requireFact(
    cleanupErrors.length === 0,
    "normal owned cleanup has unresolved failures",
  );
});
