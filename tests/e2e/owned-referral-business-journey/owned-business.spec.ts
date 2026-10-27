import {
  PASSENGER_FEE_DISCLOSURE_VERSION,
  PASSENGER_FEE_CONTENT_HASH,
} from "@drts/contracts";
import {
  test,
  expect,
  type BrowserContext,
  type APIRequestContext,
  type Request as PlaywrightRequest,
  type Response as PlaywrightResponse,
  type Route,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { displayOrderNo } from "../../../apps/referral-embed-web/lib/order-display";
import { parsePdf } from "../../unit/billing-pdf-chinese-printable-content-20261016/pdf-parser";
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
  validateActualReceiptPdfBytes,
  consumeNativeReceiptPdfDownload,
  captureOriginalUiCancellation,
  object,
  text,
  integer,
  records,
  mask,
  hash,
  origin,
  assertBusinessOrderProduct,
  assertOwnPair,
  assertTask,
  assertRatingReplay,
  assertCompletedFare,
  simulationCompletion,
  assertNoForeignActive,
  terminalizeOwnOrder,
  BookingWriteJournal,
  observeOriginalBookingAck,
  settleRoutedOriginalBookingAck,
  originalBookingRouteFailure,
  type BookingAckResponse,
  clickAndSettleOriginalBookingAck,
  persistPrivateJson,
  readOwnedReferralCookies,
  adoptReferralSession,
  type ObjectData,
  type Role,
  type CallOptions,
  futureTaipeiReservationIntents,
  verifyOwnedReservationCancellation,
  runOwnedRedispatchToSecond,
} from "./protocol";
import {
  cancellationResults,
  runFourStageOwnedCancellations,
} from "./four-stage-cancellations";
import {
  runDisplayObservations,
  type DisplayObservations,
} from "./display-observations";
import {
  resolveActiveTripScreenOrder,
  runOwnedDailyReportDownloads,
  type DailyReportDownloadsEvidence,
  resolveExpectedCancelledDailyDispatchRecord,
  resolveExpectedDailyDispatchRecord,
  toTaipeiServiceDate,
} from "./daily-report-downloads";
import {
  RETAINED_REFERRAL_ORDER,
  recoverRetainedReferralOrder,
} from "./retained-order-recovery";

import {
  parseOriginalUnknownBookingJournal,
  recoverOriginalUnknownBookingAck,
} from "./original-journal-recovery";

const RECOVERY_ONLY = process.env.OWNED_REFERRAL_RECOVERY_ONLY === "true";
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

function closedPdfFailureFacts(error: unknown) {
  let nativeFailureClass = "UNKNOWN";
  let nativeCauseCode = "UNKNOWN";
  try {
    const name = (error as { name?: unknown } | null)?.name;
    if (
      typeof name === "string" &&
      [
        "Error",
        "ReferenceError",
        "TypeError",
        "RangeError",
        "SyntaxError",
        "TimeoutError",
        "AbortError",
      ].includes(name)
    )
      nativeFailureClass = name;
  } catch {
    // Accessor failures remain unknown; no message or stack is inspected.
  }
  try {
    const codes = [
      (error as { code?: unknown } | null)?.code,
      (error as { cause?: { code?: unknown } } | null)?.cause?.code,
    ];
    for (const code of codes) {
      if (
        typeof code === "string" &&
        [
          "ENOENT",
          "EACCES",
          "ECONNRESET",
          "ECONNREFUSED",
          "ETIMEDOUT",
          "ENOTFOUND",
          "EAI_AGAIN",
          "ERR_MODULE_NOT_FOUND",
          "MODULE_NOT_FOUND",
          "ERR_REQUIRE_ASYNC_MODULE",
          "ERR_REQUIRE_ESM",
          "ERR_UNKNOWN_FILE_EXTENSION",
          "ERR_INVALID_ARG_TYPE",
          "ERR_INVALID_ARG_VALUE",
          "ERR_OUT_OF_RANGE",
          "UND_ERR_CONNECT_TIMEOUT",
          "UND_ERR_HEADERS_TIMEOUT",
          "UND_ERR_BODY_TIMEOUT",
          "UND_ERR_SOCKET",
        ].includes(code)
      ) {
        nativeCauseCode = code;
        break;
      }
    }
  } catch {
    // Never serialize an unknown code or a nested cause.
  }
  return { nativeFailureClass, nativeCauseCode };
}

async function cookieHeader(
  context: BrowserContext,
  target: string,
): Promise<string> {
  return (await context.cookies(target))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

function readCancellationWindowSnapshot(value: unknown): ObjectData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as ObjectData;
  if (
    typeof snapshot.canCancel !== "boolean" ||
    typeof snapshot.asOf !== "string" ||
    !Number.isFinite(Date.parse(snapshot.asOf))
  )
    return null;
  if (
    snapshot.cancelableUntil !== null &&
    (typeof snapshot.cancelableUntil !== "string" ||
      !Number.isFinite(Date.parse(snapshot.cancelableUntil)))
  )
    return null;
  return snapshot;
}

const journeyName = RECOVERY_ONLY
  ? "recovery-only original retained Referral order; no full business journey completion claim"
  : "owned synthetic business ride uses the public Demo identity through completion, TXT and no-contact CRM";

test(journeyName, async ({ browser, request }) => {
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
  let opsSessionId: string | undefined;
  let driverId: string | undefined;
  let vehicleId: string | undefined;
  let deviceId: string | undefined;
  let bindingId: string | undefined;
  let invitation: string | undefined;
  let orderId: string | undefined;
  let passengerId: string | undefined;
  let referralSessionId: string | undefined;
  let completed = false;
  let recoveryResolved = false;
  let displayObservations: DisplayObservations | undefined;
  let dailyReportDownloads: DailyReportDownloadsEvidence | undefined;
  let retainedRecovery: Readonly<{
    originalRun: number;
    orderId: string;
    quoteId: string;
    bodySha256: string;
    entrySlug: string;
  }> = RETAINED_REFERRAL_ORDER;
  let recoveryResult:
    | Awaited<ReturnType<typeof recoverRetainedReferralOrder>>
    | undefined;
  const browserRatingState: {
    current:
      | {
          state: "ack_unknown" | "acknowledged";
          orderId: string;
          body: Readonly<ObjectData>;
          bodySha256: string;
          idempotencyKey: string;
          responseStatus?: number;
          caseNo?: string;
          recovery: string;
        }
      | undefined;
  } = { current: undefined };
  let opsControlRole: "opsApi" | "ops" = "opsApi";
  let mainError: unknown;
  const bookingState: {
    journal: BookingWriteJournal | undefined;
    routeError: unknown;
    quote: ObjectData | undefined;
  } = { journal: undefined, routeError: undefined, quote: undefined };
  type ExtraSupply = {
    transport: NativeTransport;
    driverId?: string;
    vehicleId?: string;
    deviceId?: string;
    bindingId?: string;
    invitation?: string;
    plateNo?: string;
    driverSubmissionId?: string;
    vehicleSubmissionId?: string;
  };
  const extraSupply: ExtraSupply = {
    transport: new NativeTransport(origins, runtime, invocation),
  };
  const extraBookings: {
    name: string;
    journal?: BookingWriteJournal;
    quote?: ObjectData;
    orderId?: string;
    terminal?: boolean;
    actions: string[];
  }[] = [];
  const supplementalReports: DailyReportDownloadsEvidence[] = [];
  const cleanupErrors: string[] = [];
  const cancellations = cancellationResults();

  const call = async (role: Role, path: string, options: CallOptions = {}) =>
    object((await tx.call(role, path, options)).data);
  const adminControl = (path: string, options: CallOptions = {}) =>
    call("api", `/api${path}`, options);
  const opsControl = (path: string, options: CallOptions = {}) =>
    call(
      opsControlRole,
      `${opsControlRole === "ops" ? "/control-plane-proxy" : "/api"}${path}`,
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
  const cancelReferralOrder = async (ownOrderId: string, reason: string) =>
    object(
      (
        await referral(
          `/api/referral/cancel/${encodeURIComponent(ownOrderId)}`,
          {
            method: "POST",
            body: { orderId: ownOrderId, reason },
          },
        )
      ).data,
    );
  const getOrder = async () => {
    requireFact(
      orderId && passengerId,
      "own order ACK required before order access",
    );
    const order = await opsControl(`/orders/${encodeURIComponent(orderId)}`);
    requireFact(
      order.orderId === orderId &&
        order.partnerEntrySlug === ENTRY &&
        object(order.passenger).passengerId === passengerId,
      "own canonical order subject binding",
    );
    return order;
  };
  const bindReferralSession = async () => {
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
    return ownReferral.passengerId;
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
    // Verify served headers separately from the gcloud metadata revision fence.
    for (const [role, path] of [
      ["api", "/health"],
      ["admin", "/"],
      ["ops", "/dashboard"],
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
    evidence.record({
      stage: "canonical-platform-authority-verified",
      principalId,
      membershipId: text(identity.membershipId),
      realm: "platform",
      actorType: "platform_admin",
      result: "observed",
    });

    // With no supplied inner JWT, the existing Ops BFF issues its own signed
    // proxy proof. The API exchanges it only for an existing active canonical
    // Ops principal, membership and binding; no Admin authority is reused.
    const opsAck = await call("ops", "/control-plane-proxy/auth/token", {
      method: "POST",
      body: {},
    });
    const opsToken = text(opsAck.token);
    mask(opsToken);
    opsSessionId = text(opsAck.sessionId);
    mask(opsSessionId);
    tx.setSession("ops", opsToken);
    tx.setSession("opsApi", opsToken);
    const opsPrincipalId = text(opsAck.principalId);
    requireFact(
      opsAck.realm === "ops" && opsAck.actorType === "ops_user",
      "normal Ops issuance ACK realm and actor",
    );
    const verifiedOps = await call("opsApi", "/api/auth/session");
    const opsIdentity = object(verifiedOps.identity);
    const opsMembershipId = text(opsIdentity.membershipId);
    const requiredOpsScopes = [
      "owned:read",
      "owned:write",
      "dispatch:read",
      "dispatch:write",
      "complaints:read",
    ];
    const opsScopes = opsIdentity.scopes;
    requireFact(
      verifiedOps.active === true &&
        opsIdentity.realm === "ops" &&
        opsIdentity.actorType === "ops_user" &&
        opsIdentity.authMode === "jwt_bearer" &&
        opsIdentity.sessionId === opsSessionId &&
        opsIdentity.principalId === opsPrincipalId &&
        opsIdentity.actorId === opsPrincipalId &&
        Array.isArray(opsScopes) &&
        requiredOpsScopes.every((scope) => opsScopes.includes(scope)),
      "canonical Ops session and existing business scopes readback",
    );
    // Probe the BFF with that same Ops JWT before any business command. A
    // denied read can select direct API transport with the same Ops session;
    // it cannot authorize an Admin fallback or replay an unknown mutation.
    try {
      const opsSession = await call("ops", "/control-plane-proxy/auth/session");
      const proxyIdentity = object(opsSession.identity);
      requireFact(
        opsSession.active === true &&
          proxyIdentity.sessionId === opsSessionId &&
          proxyIdentity.principalId === opsPrincipalId &&
          proxyIdentity.membershipId === opsMembershipId &&
          proxyIdentity.realm === "ops" &&
          proxyIdentity.actorType === "ops_user" &&
          proxyIdentity.authMode === "jwt_bearer",
        "Ops BFF preserves genuine canonical Ops session",
      );
      opsControlRole = "ops";
    } catch (error) {
      if (!(error instanceof JourneyFailure) || error.status !== 403)
        throw error;
      evidence.failure(error);
      opsControlRole = "opsApi";
      evidence.record({
        stage: "normal-direct-api-ops-transport-selected",
        result: "observed",
      });
    }
    evidence.record({
      stage: "canonical-ops-authority-verified",
      principalId: opsPrincipalId,
      membershipId: opsMembershipId,
      realm: "ops",
      actorType: "ops_user",
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
      body: {
        action: "exchange",
        artifact,
        entrySlug: ENTRY,
        entryHost: host,
      },
      expected: [200],
    });
    await adoptReferralSession(context, exchange.headers, origins.referral);
    const publicSession = object(object(exchange.data).session);
    requireFact(
      publicSession.partnerEntrySlug === ENTRY,
      "Referral entry session binding",
    );
    if (RECOVERY_ONLY) {
      // Existing consent and the same canonical subject are required. Do not
      // visit BookScreen: its quote effects and all new supply/key/order work
      // belong exclusively to the normal full-journey branch below.
      requireFact(
        publicSession.identityActive === true,
        "recovery requires existing active Referral consent",
      );
      const boundPassengerId = await bindReferralSession();
      if (process.env.OWNED_REFERRAL_RECOVER_ORIGINAL_JOURNAL === "true") {
        const bytes = await readFile(
          `${DIRECTORY}/retained-original-journal.json`,
        );
        requireFact(
          bytes.length <= 16384,
          "bounded private original journal required",
        );
        const original = parseOriginalUnknownBookingJournal(
          JSON.parse(bytes.toString("utf8")),
          runtime,
        );
        retainedRecovery = await recoverOriginalUnknownBookingAck(
          original,
          async (command, key) =>
            (
              await referral("/api/referral/booking", {
                method: "POST",
                body: command,
                headers: { "Idempotency-Key": key },
              })
            ).data,
        );
        await persistPrivateJson(`${DIRECTORY}/booking-write-journal.json`, {
          ...original.journal,
          state: "acknowledged",
          orderId: retainedRecovery.orderId,
        });
        evidence.record({
          stage: "original-journal-replay-ACK-recovered",
          orderId: retainedRecovery.orderId,
          quoteId: retainedRecovery.quoteId,
          sha256: retainedRecovery.bodySha256,
          result: "observed",
        });
      }
      recoveryResult = await recoverRetainedReferralOrder({
        retained: retainedRecovery,
        passengerId: boundPassengerId,
        readHistory: async () =>
          (
            await referral(
              `/api/referral/history/${encodeURIComponent(retainedRecovery.orderId)}`,
            )
          ).data,
        readActive: async () => (await referral("/api/referral/active")).data,
        readOwn: () =>
          opsControl(`/orders/${encodeURIComponent(retainedRecovery.orderId)}`),
        cancel: () =>
          cancelReferralOrder(
            retainedRecovery.orderId,
            "Own retained synthetic Referral order normal recovery",
          ),
        dispatch: () =>
          opsControl(
            `/orders/${encodeURIComponent(retainedRecovery.orderId)}/dispatch`,
            {
              method: "POST",
              body: { mode: "auto" },
              headers: {
                "Idempotency-Key": `owned-referral-recovery:${retainedRecovery.originalRun}:${retainedRecovery.orderId}:dispatch`,
              },
            },
          ),
        resolve: () =>
          opsControl(
            `/orders/${encodeURIComponent(retainedRecovery.orderId)}/resolve-exception-hold`,
            {
              method: "POST",
              body: {
                resolution: "cancel_order",
                reason:
                  "Own retained synthetic Referral order genuine exception-hold recovery",
                traceId: `owned-referral-recovery:${retainedRecovery.originalRun}:${retainedRecovery.orderId}:cancel`,
              },
            },
          ),
        claim: (id) => {
          requireFact(
            id === retainedRecovery.orderId,
            "exact retained recovery order only",
          );
          orderId = id;
        },
        evidence,
      });
      recoveryResolved = true;
      evidence.record({
        stage: "recovery-only-original-order-terminal-not-full-journey",
        orderId: recoveryResult.orderId,
        result: "observed",
      });
    } else {
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
      await bindReferralSession();
      const active = (await referral("/api/referral/active")).data;
      assertNoForeignActive(active);

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

      fleet = await prepareOperationalFleetSession({
        fleetPartnerId: FLEET,
        tenantId: TENANT,
      });
      await tx.call("fleet", "/", { raw: true, expected: [200] });
      evidence.record({
        stage: "normal-own-first-key-Fleet-session",
        result: "observed",
      });
      const provisionSupply = async (
        supply: ExtraSupply,
        nonce: string,
        phone: string,
      ) => {
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
        supply.driverSubmissionId = driverSubmissionId;
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
                  expectedRevisionNo: integer(
                    object(detail.submission).revisionNo,
                  ),
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
        supply.driverId = text(approvedDriver.canonicalDriverId);
        const driverId = supply.driverId;
        const ownPlateNo =
          (supply.plateNo = `SIM-${randomUUID().slice(0, 8).toUpperCase()}`);
        const vehicleDraft = await call(
          "fleet",
          "/control-plane-proxy/fleet-partner/supply-submissions/vehicles",
          {
            method: "POST",
            body: {
              plateNo: ownPlateNo,
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
        supply.vehicleSubmissionId = vehicleSubmissionId;
        const approvedVehicle = await approve(vehicleSubmissionId, [
          "vehicle_registration",
          "insurance_policy",
          "fleet_participation_contract",
        ]);
        supply.vehicleId = text(approvedVehicle.canonicalVehicleId);
        const vehicleId = supply.vehicleId;
        text(approvedVehicle.canonicalContractId);
        text(approvedVehicle.canonicalPolicyId);
        const exclusion = `/regulatory-registry/exclusivities/${encodeURIComponent(vehicleId)}`;
        await adminControl(`${exclusion}/submit-review`, {
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
        await adminControl(`${exclusion}/approve`, {
          method: "POST",
          body: {},
          headers: { "x-drts-step-up-reference": proof },
        });
        await adminControl(
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
        const invitation = (supply.invitation = text(invite.registrationCode));
        mask(invitation);
        const deviceId = (supply.deviceId = `${nonce}-device`);
        const driver = await call(
          "publicApi",
          "/api/auth/driver/device/register",
          {
            method: "POST",
            body: {
              registrationCode: invitation,
              deviceId,
              deviceLabel: "明示合成示範裝置",
            },
          },
        );
        const driverToken = text(driver.accessToken);
        mask(driverToken);
        mask(text(driver.refreshToken));
        requireFact(
          driver.driverId === driverId && driver.deviceId === deviceId,
          "actual bound Driver registration",
        );
        supply.bindingId = text(driver.bindingId);
        supply.transport.setSession("driver", driverToken);
        const driverSession = object(
          (await supply.transport.call("driver", "/api/auth/session")).data,
        );
        requireFact(
          driverSession.active === true &&
            object(driverSession.identity).realm === "driver" &&
            object(driverSession.identity).actorId === driverId,
          "actual Driver session identity",
        );
      };
      const firstSupply: ExtraSupply = { transport: tx };
      try {
        await provisionSupply(firstSupply, nonce, phone);
      } finally {
        driverId = firstSupply.driverId;
        vehicleId = firstSupply.vehicleId;
        deviceId = firstSupply.deviceId;
        bindingId = firstSupply.bindingId;
        invitation = firstSupply.invitation;
      }
      requireFact(driverId && vehicleId, "first approved own supply required");
      const ownPlateNo = text(firstSupply.plateNo);

      const currentFees = object((await referral("/api/referral/fees")).data);
      requireFact(
        currentFees.disclosureVersion === PASSENGER_FEE_DISCLOSURE_VERSION &&
          currentFees.contentHash === PASSENGER_FEE_CONTENT_HASH,
        "runtime exact fee copy version",
      );
      if (!currentFees.acknowledgedAt) {
        const response = page.waitForResponse(
          (item) =>
            item.url() === origins.referral + "/api/referral/fees" &&
            item.request().method() === "POST",
        );
        await page.locator('[data-drt-operation="referral-fee-agree"]').click();
        requireFact(
          (await response).ok(),
          "actual browser first fee acknowledgement",
        );
      }
      const feesReadback = object((await referral("/api/referral/fees")).data);
      requireFact(
        feesReadback.disclosureVersion === currentFees.disclosureVersion &&
          feesReadback.contentHash === currentFees.contentHash &&
          typeof feesReadback.acknowledgedAt === "string" &&
          Number.isFinite(Date.parse(feesReadback.acknowledgedAt)),
        "canonical first fee acknowledgement readback",
      );
      evidence.record({
        stage: currentFees.acknowledgedAt
          ? "canonical-existing-fee-acknowledgement-readback"
          : "browser-first-fee-acknowledgement",
        result: "observed",
      });

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
      let resolveOriginalResponse!: (response: BookingAckResponse) => void;
      let rejectOriginalResponse!: (error: unknown) => void;
      const originalResponse = new Promise<BookingAckResponse>(
        (resolve, reject) => {
          resolveOriginalResponse = resolve;
          rejectOriginalResponse = reject;
        },
      );
      let routeStarted = false;
      let finishOriginalRoute!: () => void;
      const originalRouteFinished = new Promise<void>((resolve) => {
        finishOriginalRoute = resolve;
      });
      // Retain the original native response wait's deadline/error semantics;
      // its browser body is never read after the real UI navigates.
      const browserResponseDeadline = page
        .waitForResponse(
          (response) =>
            response.url() === `${origins.referral}/api/referral/booking` &&
            response.request().method() === "POST",
        )
        .then(() => originalResponse);
      const bookingAck = observeOriginalBookingAck(
        Promise.race([originalResponse, browserResponseDeadline]),
        () => ({
          url: `${origins.referral}/api/referral/booking`,
          runtimeSha: runtime,
          journal: bookingState.journal,
          quote: bookingState.quote,
        }),
        (id) => {
          orderId = id;
        },
        evidence,
      );
      // Attach before clicking, including if the original fetch itself fails.
      void bookingAck.catch(() => undefined);
      await page.route(
        `${origins.referral}/api/referral/booking`,
        async (route) => {
          if (route.request().method() !== "POST") {
            await route.continue();
            return;
          }
          routeStarted = true;
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
                feeDisclosureVersion: text(selected.feeDisclosureVersion),
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
              async () => {
                const original = await route.fetch({
                  maxRedirects: 0,
                  maxRetries: 0,
                });
                try {
                  await settleRoutedOriginalBookingAck(
                    original,
                    route.request(),
                    (response) => {
                      resolveOriginalResponse(response);
                      return bookingAck;
                    },
                    (bytes) =>
                      route.fulfill({ response: original, body: bytes }),
                  );
                } finally {
                  await original.dispose();
                }
              },
            );
          } catch (error) {
            bookingState.routeError = originalBookingRouteFailure(error);
            rejectOriginalResponse(bookingState.routeError);
            evidence.record({
              stage: bookingState.journal?.current
                ? "booking:send-ACK-unknown"
                : "booking:command-or-journal-rejected-before-send",
              result: "failed",
            });
            await route.abort("blockedbyclient").catch(() => undefined);
          } finally {
            finishOriginalRoute();
          }
        },
      );
      const feeCheckbox = page.getByRole("checkbox", {
        name: "我已確認費用與優惠說明",
        exact: true,
      });
      await expect(feeCheckbox).not.toBeChecked();
      await expect(
        page.locator('[data-drt-operation="referral-create"]'),
      ).toBeDisabled();
      await feeCheckbox.check();
      await expect(feeCheckbox).toBeChecked();
      try {
        await clickAndSettleOriginalBookingAck(
          () => page.locator('[data-drt-operation="referral-create"]').click(),
          bookingAck,
        );
      } finally {
        if (routeStarted) await originalRouteFinished;
      }
      await page.unroute(`${origins.referral}/api/referral/booking`);
      if (bookingState.routeError) throw bookingState.routeError;
      requireFact(
        orderId && bookingState.quote,
        "frozen same-order booking ACK required before progression",
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
      assertBusinessOrderProduct(order, text(bookingState.quote.quoteId));
      const dispatched = await opsControl(
        `/orders/${encodeURIComponent(orderId)}/dispatch`,
        {
          method: "POST",
          body: { mode: "auto" },
          headers: { "Idempotency-Key": `${nonce}-dispatch` },
        },
      );
      const dispatchJobId = text(dispatched.dispatchJobId);
      const candidates = await opsControl(
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
      await opsControl("/dispatch/assign", {
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
      const completedOrderId = text(orderId);
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
      evidence.record({
        stage: "api-same-order-nonformal-TXT",
        orderId,
        bytes: download.bytes.length,
        sha256: hash(download.bytes),
      });

      const completedUrl = `${origins.referral}/embed/${ENTRY}?state=handoff&screen=completed&entryHost=${encodeURIComponent(host)}&orderId=${encodeURIComponent(completedOrderId)}`;
      const ratingUrl = `${origins.referral}/api/referral/rating/${encodeURIComponent(completedOrderId)}`;
      const isOwnRatingPost = (request: PlaywrightRequest) =>
        request.url() === ratingUrl && request.method() === "POST";
      const browserRatingRequests: PlaywrightRequest[] = [];
      page.on("request", (request) => {
        if (isOwnRatingPost(request)) browserRatingRequests.push(request);
      });
      const assertCompletedBrowserUrl = (value: URL) =>
        value.origin === origins.referral &&
        value.pathname === `/embed/${ENTRY}` &&
        value.searchParams.get("screen") === "completed" &&
        value.searchParams.get("orderId") === completedOrderId;
      // OutcomeScreen renders its selected score through the five star colors;
      // the buttons have stable accessible names, but no invented aria-pressed.
      const assertBrowserTwoStarSelection = async () => {
        const stars = page.getByRole("button", { name: /^評分 [1-5] 星$/ });
        await expect(stars).toHaveCount(5);
        const colors = await stars.evaluateAll((buttons) =>
          buttons.map((button) => window.getComputedStyle(button).color),
        );
        const [one, two, three, four, five] = colors;
        requireFact(
          one &&
            two &&
            three &&
            four &&
            five &&
            one === two &&
            two !== three &&
            three === four &&
            four === five,
          "browser shows exactly the original two selected stars",
        );
        return colors;
      };
      await page.goto(completedUrl);
      await expect(page).toHaveURL(assertCompletedBrowserUrl);
      await expect(page.getByText("行程已完成", { exact: true })).toBeVisible();
      const submitRating = page.getByRole("button", {
        name: "送出評分",
        exact: true,
      });
      await expect(submitRating).toBeDisabled();
      await expect(
        page.getByRole("switch", { name: "需要客服聯絡", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "評分 2 星", exact: true })
        .click();
      const contactSwitch = page.getByRole("switch", {
        name: "需要客服聯絡",
        exact: true,
      });
      await expect(contactSwitch).toBeChecked();
      await expect(submitRating).toBeEnabled();
      const originalTwoStarColors = await assertBrowserTwoStarSelection();
      await expect(
        browserRatingRequests,
        "selecting stars must not submit a rating",
      ).toHaveLength(0);
      evidence.record({
        stage: "browser-two-star-selection-without-submission",
        orderId: completedOrderId,
        result: "observed",
      });
      await contactSwitch.click();
      await expect(contactSwitch).not.toBeChecked();
      await expect(
        browserRatingRequests,
        "contact switch must not submit a rating",
      ).toHaveLength(0);
      evidence.record({
        stage: "browser-contact-default-on-then-explicit-off",
        orderId: completedOrderId,
        result: "observed",
      });

      // Capture only the real UI's four business fields, before awaiting its ACK.
      // A missing response retains this command/key; no replacement is created.
      const capturedRatingRequest = page
        .waitForRequest(isOwnRatingPost)
        .then((request) => {
          const rawBody = text(
            request.postData(),
            "actual browser rating body required",
          );
          const body = Object.freeze(object(request.postDataJSON()));
          requireFact(
            Object.keys(body).sort().join(",") ===
              "contactRequested,idempotencyKey,orderId,score" &&
              body.orderId === completedOrderId &&
              body.score === 2 &&
              body.contactRequested === false,
            "actual UI same-order score2 contactfalse command",
          );
          const key = text(
            body.idempotencyKey,
            "original browser rating key required",
          );
          requireFact(
            JSON.stringify(body) === rawBody,
            "exact browser rating JSON retained for API replay",
          );
          browserRatingState.current = {
            state: "ack_unknown",
            orderId: completedOrderId,
            body,
            bodySha256: hash(Buffer.from(rawBody, "utf8")),
            idempotencyKey: key,
            recovery:
              "Preserve this original UI body/key. Read the same order and replay only this command after normal same-subject authentication; do not create another rating key or order.",
          };
          return { request, body };
        });
      const ratingResponsePromise = page.waitForResponse((response) =>
        isOwnRatingPost(response.request()),
      );
      // These still reject when awaited; avoid an unhandled rejection if the
      // click itself fails and the normal finally closes the browser context.
      void capturedRatingRequest.catch(() => undefined);
      void ratingResponsePromise.catch(() => undefined);
      await submitRating.click();
      const capturedRating = await capturedRatingRequest;
      const ratingBody = capturedRating.body;
      const ratingResponse = await ratingResponsePromise;
      requireFact(
        browserRatingState.current,
        "captured browser rating command required",
      );
      browserRatingState.current = {
        ...browserRatingState.current,
        responseStatus: ratingResponse.status(),
      };
      requireFact(
        browserRatingRequests.length === 1 &&
          browserRatingRequests[0] === capturedRating.request &&
          ratingResponse.request() === capturedRating.request,
        "one explicit browser rating POST and its original response",
      );
      if (!ratingResponse.ok())
        throw new JourneyFailure(
          "browser-rating:request",
          ratingResponse.status(),
        );
      requireFact(
        ratingResponse.headers()["x-drts-candidate-sha"] === runtime,
        "browser rating runtime SHA",
      );
      const ratingPayload = object(await ratingResponse.json());
      requireFact(
        ratingPayload.ok === true,
        "browser rating successful envelope",
      );
      const first = object(ratingPayload.data);
      requireFact(first.score === 2, "browser rating original score ACK");
      assertRatingReplay(first, first, completedOrderId);
      const caseNo = text(first.complaintCaseNo);
      browserRatingState.current = {
        ...browserRatingState.current,
        state: "acknowledged",
        caseNo,
      };
      await expect(
        page.getByRole("button", { name: "評分已送出", exact: true }),
      ).toBeDisabled();
      const firstCaseStatus = page
        .getByRole("status")
        .filter({ hasText: caseNo });
      await expect(firstCaseStatus).toContainText("不需客服聯絡，僅供內部檢視");
      evidence.record({
        stage: "browser-two-contactfalse-rating-acknowledged",
        orderId: completedOrderId,
        caseNo,
        status: ratingResponse.status(),
        sha256: browserRatingState.current.bodySha256,
        result: "observed",
      });

      // The following original API checks replay the captured browser body/key.
      // No comment/tags or new rating command are manufactured for the fixture.
      const replay = object(
        (
          await referral(
            `/api/referral/rating/${encodeURIComponent(orderId)}`,
            {
              method: "POST",
              body: ratingBody,
            },
          )
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
          await referral(
            `/api/referral/rating/${encodeURIComponent(orderId)}`,
            {
              method: "POST",
              body: ratingBody,
            },
          )
        ).data,
      );
      assertRatingReplay(first, after, orderId);
      const persistedHistory = object(
        (await referral(`/api/referral/history/${encodeURIComponent(orderId)}`))
          .data,
      );
      assertRatingReplay(
        first,
        {
          ...object(persistedHistory.rating),
          orderId: persistedHistory.orderId,
        },
        orderId,
      );
      requireFact(
        object(persistedHistory.rating).score === 2,
        "canonical history retains original browser score2",
      );
      const complaint = await opsControl(
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
      const timeline = await opsControl(
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
        stage: "api-low-two-contactfalse-same-case-replay-and-conflict409",
        orderId,
        caseNo,
        result: "retained",
      });

      // Re-enter through the actual history card, not an API read standing in
      // for UI navigation. TripsScreen links show the shortened displayOrderNo,
      // not the raw canonical order number (see TripsScreen in passenger-embed.tsx).
      // A native Playwright assertion/timeout anywhere in this window is not a
      // JourneyFailure, so each named step records the fixed safe phase reached
      // before it, plus its closed class/code (same allowlisted facts as
      // closedPdfFailureFacts below), instead of losing this window to one bare
      // generic placeholder that cannot tell goto/count/href/click/assert apart.
      type HistoryRestorePhase =
        | "browser-history-restore-goto"
        | "browser-history-restore-card-count"
        | "browser-history-restore-href"
        | "browser-history-restore-click"
        | "browser-history-restore-assert";
      const historyPhase = async <T>(
        stage: HistoryRestorePhase,
        action: () => Promise<T>,
      ): Promise<T> => {
        evidence.record({
          stage,
          orderId: completedOrderId,
          caseNo,
          result: "observed",
        });
        try {
          return await action();
        } catch (error) {
          evidence.record({
            stage,
            orderId: completedOrderId,
            caseNo,
            ...closedPdfFailureFacts(error),
            result: "failed",
          });
          throw error;
        }
      };
      await historyPhase("browser-history-restore-goto", async () => {
        await page.goto(
          `${origins.referral}/embed/${ENTRY}?state=handoff&screen=trips&entryHost=${encodeURIComponent(host)}`,
        );
        await expect(page.getByText("我的行程", { exact: true })).toBeVisible();
      });
      const ownHistoryCard = await historyPhase(
        "browser-history-restore-card-count",
        async () => {
          const card = page.getByRole("link").filter({
            hasText: displayOrderNo(
              text(history.orderNo, "canonical history order number required"),
            ),
          });
          await expect(card).toHaveCount(1);
          return card;
        },
      );
      await historyPhase("browser-history-restore-href", async () => {
        const historyHref = new URL(
          text(await ownHistoryCard.getAttribute("href")),
          origins.referral,
        );
        requireFact(
          assertCompletedBrowserUrl(historyHref),
          "history card retains exact completed orderId",
        );
      });
      await historyPhase("browser-history-restore-click", async () => {
        await ownHistoryCard.click();
        await expect(page).toHaveURL(assertCompletedBrowserUrl);
      });
      await historyPhase("browser-history-restore-assert", async () => {
        await expect(
          page.getByText("行程已完成", { exact: true }),
        ).toBeVisible();
        for (const n of [1, 2, 3, 4, 5])
          await expect(
            page.getByRole("button", { name: `評分 ${n} 星`, exact: true }),
          ).toBeDisabled();
        const restoredTwoStarColors = await assertBrowserTwoStarSelection();
        requireFact(
          restoredTwoStarColors.every(
            (color, index) => color === originalTwoStarColors[index],
          ),
          "history restores the original selected-two browser color distribution",
        );
        const restoredContact = page.getByRole("switch", {
          name: "需要客服聯絡",
          exact: true,
        });
        await expect(restoredContact).not.toBeChecked();
        await expect(restoredContact).toBeDisabled();
        await expect(
          page.getByRole("button", { name: "評分已送出", exact: true }),
        ).toBeDisabled();
        await expect(
          page.getByRole("status").filter({ hasText: caseNo }),
        ).toContainText("不需客服聯絡，僅供內部檢視");
        requireFact(
          browserRatingRequests.length === 1,
          "history return must not resubmit rating",
        );
      });
      evidence.record({
        stage: "browser-history-card-restores-locked-two-contactfalse-case",
        orderId: completedOrderId,
        caseNo,
        result: "observed",
      });

      const receiptLink = page.getByRole("link", {
        name: "查看收據",
        exact: true,
      });
      const receiptHref = new URL(
        text(await receiptLink.getAttribute("href")),
        origins.referral,
      );
      requireFact(
        receiptHref.origin === origins.referral &&
          receiptHref.pathname === `/embed/${ENTRY}` &&
          receiptHref.searchParams.get("screen") === "receipt" &&
          receiptHref.searchParams.get("orderId") === completedOrderId,
        "browser receipt link retains original completed order",
      );
      await receiptLink.click();
      await expect(page).toHaveURL((url) => url.href === receiptHref.href);
      // The receipt header shows the original order's short order number; the
      // full number is on the receipt download and PDF.
      await expect(
        page.getByText(`訂單 ${displayOrderNo(text(receipt.orderNo))}`, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "本頁為乘車紀錄，非正式稅務憑證；付款及結算狀態以實際通知為準。",
          { exact: true },
        ),
      ).toBeVisible();
      const assertReceiptRow = async (label: string, value: string) => {
        // Actual DetailRow is one div containing label/value sibling spans.
        const spans = page
          .getByText(label, { exact: true })
          .locator("..")
          .locator(":scope > span");
        await expect(spans).toHaveCount(2);
        await expect(spans.nth(1)).toHaveText(value);
      };
      const fareRows: ReadonlyArray<readonly [string, number]> = [
        ["起步價", completion.actualFareBreakdown.startMinor],
        ["里程", completion.actualFareBreakdown.distanceMinor],
        ["時間", completion.actualFareBreakdown.delayMinor],
        ["夜間費", completion.actualFareBreakdown.nightMinor],
        ["合計", completion.fare.amountMinor],
      ];
      for (const [label, amountMinor] of fareRows)
        await assertReceiptRow(label, `NT$ ${amountMinor / 100}`);
      await assertReceiptRow("客服", "02-2944-0985");
      await assertReceiptRow("主管機關", "1999");
      await expect(
        page.getByText("付款及結算狀態未提供 · 經", { exact: false }),
      ).toBeVisible();
      evidence.record({
        stage: "browser-receipt-actualfare-nonformal-paymentunknown",
        orderId: completedOrderId,
        result: "observed",
      });
      const downloadLink = page.getByRole("link", {
        name: "下載收據",
        exact: true,
      });
      const downloadHref = new URL(
        text(await downloadLink.getAttribute("href")),
        origins.referral,
      );
      requireFact(
        downloadHref.origin === origins.referral &&
          downloadHref.pathname ===
            `/api/referral/receipt/${encodeURIComponent(completedOrderId)}/download`,
        "browser download link has exact same-order receipt endpoint",
      );
      const browserDownloadPromise = page.waitForEvent("download");
      void browserDownloadPromise.catch(() => undefined);
      await downloadLink.click();
      const browserDownload = await browserDownloadPromise;
      requireFact(
        browserDownload.url() === downloadHref.href &&
          browserDownload.suggestedFilename() ===
            `receipt-${completedOrderId}.txt` &&
          (await browserDownload.failure()) === null,
        "actual browser same-order TXT download",
      );
      const browserDownloadPath = text(
        await browserDownload.path(),
        "browser download file required",
      );
      const browserBytes = await readFile(browserDownloadPath);
      const browserTxt = browserBytes.toString("utf8");
      requireFact(
        browserTxt.includes(completedOrderId) &&
          browserTxt.includes("非正式稅務憑證"),
        "browser TXT same-order nonformal bytes",
      );
      assertCompletedFare(
        completion,
        completedTask,
        history,
        receipt,
        browserTxt,
      );
      await mkdir(DIRECTORY, { recursive: true });
      await writeFile(`${DIRECTORY}/own-receipt.txt`, browserBytes, {
        mode: 0o600,
      });
      evidence.record({
        stage: "browser-same-order-nonformal-TXT",
        orderId: completedOrderId,
        bytes: browserBytes.length,
        sha256: hash(browserBytes),
        result: "observed",
      });

      type PdfPhase =
        | "browser-pdf-consumer"
        | "browser-pdf-region"
        | "browser-pdf-response-fetch"
        | "browser-pdf-response-body"
        | "browser-pdf-content-parse"
        | "browser-pdf-download-action"
        | "browser-pdf-download-event"
        | "browser-pdf-download-file"
        | "browser-pdf-prepare-action"
        | "browser-pdf-share-capability"
        | "browser-pdf-share-action";
      const pdfPhase = async <T>(stage: PdfPhase, action: () => Promise<T>) => {
        evidence.record({
          stage,
          orderId: completedOrderId,
          result: "observed",
        });
        try {
          return await action();
        } catch (error) {
          evidence.record({
            stage,
            orderId: completedOrderId,
            ...closedPdfFailureFacts(error),
            result: "failed",
          });
          throw error;
        }
      };
      await pdfPhase("browser-pdf-consumer", async () => {
        const pdfRegion = page.getByRole("region", {
          name: "PDF乘車明細與分享",
          exact: true,
        });
        await pdfPhase("browser-pdf-region", () =>
          expect(pdfRegion).toBeVisible(),
        );
        const pdfUrl = `${origins.referral}/api/referral/receipt/${encodeURIComponent(completedOrderId)}/pdf`;
        const pdfFilename = `receipt-${completedOrderId}.pdf`;
        const expectedPdfText = [
          "乘車明細（非正式稅務憑證）",
          `行程 ID：${completedOrderId}`,
          `訂單編號：${text(receipt.orderNo)}`,
          pickupAddress,
          dropoffAddress,
          `實際車資合計：${text(receipt.formattedTotal)}`,
          `起步價：NT$ ${completion.actualFareBreakdown.startMinor / 100}`,
          `里程費：NT$ ${completion.actualFareBreakdown.distanceMinor / 100}`,
          `時間費：NT$ ${completion.actualFareBreakdown.delayMinor / 100}`,
          `夜間費：NT$ ${completion.actualFareBreakdown.nightMinor / 100}`,
          "付款及結算狀態未提供",
          "02-2944-0985",
          "1999",
        ];
        const validatePdfBytes = (bytes: Buffer) =>
          validateActualReceiptPdfBytes(bytes, expectedPdfText, (actual) =>
            pdfPhase("browser-pdf-content-parse", () => parsePdf(actual)),
          );
        const observePreparedPdfAction = async (
          action: () => Promise<void>,
        ) => {
          let resolveResponse!: (bytes: Buffer) => void;
          let rejectResponse!: (error: unknown) => void;
          const responseObserved = new Promise<Buffer>((resolve, reject) => {
            resolveResponse = resolve;
            rejectResponse = reject;
          });
          void responseObserved.catch(() => undefined);
          const observe = async (route: Route) => {
            try {
              // Fetch this browser request once and release the original server
              // bytes unchanged. Attachment downloads do not reliably expose a
              // readable Playwright Response after the browser consumes them.
              const response = await pdfPhase(
                "browser-pdf-response-fetch",
                () => route.fetch({ maxRedirects: 0 }),
              );
              const bytes = await pdfPhase("browser-pdf-response-body", () =>
                response.body(),
              );
              const headers = response.headers();
              await route.fulfill({ response, body: bytes });
              requireFact(
                route.request().method() === "GET" &&
                  route.request().url() === pdfUrl &&
                  response.url() === pdfUrl &&
                  response.status() === 200 &&
                  headers["x-drts-candidate-sha"] === runtime,
                "browser same-order PDF response and runtime",
              );
              requireFact(
                headers["content-type"]?.split(";")[0]?.trim() ===
                  "application/pdf" &&
                  headers["content-disposition"] ===
                    `attachment; filename="${pdfFilename}"` &&
                  /(?:^|,)\s*no-store\s*(?:,|$)/i.test(
                    headers["cache-control"] ?? "",
                  ) &&
                  bytes.length > 0,
                "actual nonformal PDF headers and bytes",
              );
              const declaredLength = headers["content-length"];
              if (declaredLength !== undefined)
                requireFact(
                  /^[0-9]+$/.test(declaredLength) &&
                    Number(declaredLength) === bytes.length,
                  "actual PDF declared byte length",
                );
              await validatePdfBytes(bytes);
              resolveResponse(bytes);
            } catch (error) {
              rejectResponse(error);
              await route.abort("failed").catch(() => undefined);
            }
          };
          await page.route(pdfUrl, observe, { times: 1 });
          let responseDeadline: ReturnType<typeof setTimeout> | undefined;
          try {
            await action();
            // Match the hosted action timeout; a successful click without its GET
            // must reach owned cleanup instead of waiting for the whole journey.
            responseDeadline = setTimeout(
              () =>
                rejectResponse(
                  new JourneyFailure("browser-pdf-response-timeout"),
                ),
              15_000,
            );
            return await responseObserved;
          } finally {
            clearTimeout(responseDeadline);
            await page.unroute(pdfUrl, observe);
          }
        };
        const pdfLink = pdfRegion.getByRole("link", {
          name: "下載 PDF 明細",
          exact: true,
        });
        requireFact(
          new URL(text(await pdfLink.getAttribute("href")), origins.referral)
            .href === pdfUrl &&
            (await pdfLink.getAttribute("download")) === pdfFilename,
          "mounted PDF link retains the exact completed order",
        );
        const pdfDownloadBytes = await consumeNativeReceiptPdfDownload(
          {
            waitForDownload: () =>
              pdfPhase("browser-pdf-download-event", () =>
                page.waitForEvent("download", { timeout: 15_000 }),
              ),
            click: () =>
              pdfPhase("browser-pdf-download-action", () =>
                pdfLink.click({ timeout: 15_000 }),
              ),
            readFile: (path) =>
              pdfPhase("browser-pdf-download-file", () => readFile(path)),
          },
          { url: pdfUrl, filename: pdfFilename },
          validatePdfBytes,
        );
        evidence.record({
          stage: "browser-same-order-nonformal-PDF-download",
          orderId: completedOrderId,
          bytes: pdfDownloadBytes.length,
          sha256: hash(pdfDownloadBytes),
          result: "observed",
        });

        const preparedResponse = await pdfPhase(
          "browser-pdf-prepare-action",
          () =>
            observePreparedPdfAction(() =>
              pdfRegion
                .getByRole("button", { name: "準備分享 PDF", exact: true })
                .click(),
            ),
        );
        // Capability uses the actual prepared response bytes and browser APIs,
        // without replacing navigator.share/canShare or creating a fake success.
        const canSharePdf = await pdfPhase("browser-pdf-share-capability", () =>
          page.evaluate(
            ({ bytes, filename }) => {
              const file = new File([Uint8Array.from(bytes)], filename, {
                type: "application/pdf",
              });
              return (
                typeof navigator.share === "function" &&
                typeof navigator.canShare === "function" &&
                navigator.canShare({ files: [file] })
              );
            },
            { bytes: Array.from(preparedResponse), filename: pdfFilename },
          ),
        );
        const pdfStatus = pdfRegion.getByRole("status");
        if (canSharePdf) {
          await expect(pdfStatus).toHaveText("PDF 已準備完成，請按分享。");
          await pdfPhase("browser-pdf-share-action", () =>
            pdfRegion
              .getByRole("button", { name: "分享 PDF 明細", exact: true })
              .click(),
          );
          await expect(pdfStatus).toHaveText(
            /^(已完成分享操作。|已取消分享，可重新準備。|尚未完成分享，請重試或下載 PDF。)$/,
          );
          const status = await pdfStatus.textContent();
          evidence.record({
            stage:
              status === "已完成分享操作。"
                ? "browser-pdf-native-share-resolved"
                : status === "已取消分享，可重新準備。"
                  ? "browser-pdf-native-share-cancelled"
                  : "browser-pdf-native-share-refused",
            orderId: completedOrderId,
            result: "observed",
          });
        } else {
          await expect(pdfStatus).toHaveText(
            "此瀏覽器不支援檔案分享；您可以下載 PDF 後再分享。",
          );
          await expect(pdfLink).toBeVisible();
          await expect(
            pdfRegion.getByRole("button", {
              name: "分享 PDF 明細",
              exact: true,
            }),
          ).toHaveCount(0);
          evidence.record({
            stage: "browser-pdf-native-share-unsupported",
            orderId: completedOrderId,
            result: "observed",
          });
        }
        evidence.record({
          stage: "browser-same-order-nonformal-PDF-prepared-response",
          orderId: completedOrderId,
          bytes: preparedResponse.length,
          sha256: hash(preparedResponse),
          result: "observed",
        });
        evidence.record({
          stage: "physical-OS-PDF-delivery-unverified",
          orderId: completedOrderId,
          result: "unexecuted",
        });
      });
      // Preserve the minimum main journey above, then observe four independent
      // owned orders. Immediate quote timing still creates reservation semantics.
      let cancellationSequence = 5; // Same real bound device, after main heartbeat 5.
      await runFourStageOwnedCancellations(
        {
          definitionSha: definition,
          runtimeSha: runtime,
          directory: DIRECTORY,
          nonce,
          entrySlug: ENTRY,
          partnerUserRef: SUBJECT,
          passengerId: text(
            passengerId,
            "canonical completed main passenger required",
          ),
          completedMainOrderId: orderId,
          driverId,
          vehicleId,
          pickupAddress,
          dropoffAddress,
          pickup,
          passengerName,
          passengerPhone: phone,
          photoDataUrl: `data:image/png;base64,${png.toString("base64")}`,
          evidence,
          referral,
          opsControl,
          adminControl,
          driver: (path, options) => call("driver", path, options),
          heartbeat: (id, state) =>
            heartbeat(id, state, ++cancellationSequence),
          cancelFromActualUI: async (id, expectedRefusal) => {
            // Observe the actual cancellation-window UI. A disabled button is
            // not an attempted UI cancellation; API refusal keeps separate provenance.
            const button = page.locator(
              '[data-drt-operation="referral-cancel"]',
            );
            const active = object(
              (await referral("/api/referral/active")).data,
            );
            const resolvedTrip = resolveActiveTripScreenOrder(
              active,
              id,
              page.url(),
              "current UI cancellation",
            );
            await expect(
              page
                .getByText(resolvedTrip.displayOrderNo, { exact: false })
                .first(),
            ).toBeVisible();
            const current = resolvedTrip.trip;
            const window = readCancellationWindowSnapshot(
              current.cancellationWindow,
            );
            if (window?.canCancel === false) {
              requireFact(
                expectedRefusal,
                "fresh created-window cancellation unexpectedly closed",
              );
              await expect(button).toBeDisabled();
              // The real UI correctly prevents this action. Observe its actual
              // disabled state, then verify refusal through the same normal
              // passenger BFF/identity. This is NOT a successful/attempted UI cancel.
              const command = {
                idempotencyKey: `${nonce}-cancel-policy-probe-${id}`,
              };
              const probe = await referral(
                `/api/referral/cancel/${encodeURIComponent(id)}`,
                {
                  method: "POST",
                  body: command,
                  expected: [200, 409],
                },
              );
              await expect(button).toBeDisabled();
              requireFact(
                new URL(page.url()).searchParams.get("orderId") === id &&
                  new URL(page.url()).searchParams.get("screen") === "trip",
                "closed UI stays on the selected trip during normal API policy probe",
              );
              return {
                ...probe,
                command,
                requestSource: "passenger-api-policy-probe" as const,
                uiDisabled: true,
              };
            }
            const cancelPhase = async <T>(
              stage:
                | "browser-cancel-consumer"
                | "browser-cancel-response-capture"
                | "browser-cancel-route-fetch"
                | "browser-cancel-response-release"
                | "browser-cancel-action"
                | "browser-cancel-terminal-ui",
              action: () => Promise<T>,
            ) => {
              evidence.record({ stage, orderId: id, result: "observed" });
              try {
                return await action();
              } catch (error) {
                evidence.record({
                  stage,
                  orderId: id,
                  ...closedPdfFailureFacts(error),
                  result: "failed",
                });
                throw error;
              }
            };
            return cancelPhase("browser-cancel-consumer", async () => {
              // Unknown legacy metadata keeps the original enabled UI action.
              await expect(button).toBeEnabled();
              const cancelUrl = `${origins.referral}/api/referral/cancel/${encodeURIComponent(id)}`;
              type Captured = Awaited<
                ReturnType<typeof captureOriginalUiCancellation>
              >;
              let resolveResponse!: (value: Captured) => void;
              let rejectResponse!: (error: unknown) => void;
              const waiting = new Promise<Captured>((resolve, reject) => {
                resolveResponse = resolve;
                rejectResponse = reject;
              });
              void waiting.catch(() => undefined);
              const observe = async (route: Route) => {
                try {
                  const captured = await cancelPhase(
                    "browser-cancel-response-capture",
                    () =>
                      captureOriginalUiCancellation(
                        {
                          request: () => route.request(),
                          fetch: (options) =>
                            cancelPhase("browser-cancel-route-fetch", () =>
                              route.fetch(options),
                            ),
                          fulfill: (options) =>
                            cancelPhase("browser-cancel-response-release", () =>
                              route.fulfill(options),
                            ),
                        },
                        { url: cancelUrl, orderId: id, runtime },
                      ),
                  );
                  resolveResponse(captured);
                } catch (error) {
                  rejectResponse(error);
                  await route.abort("failed").catch(() => undefined);
                }
              };
              await page.route(cancelUrl, observe, { times: 1 });
              const deadline = setTimeout(
                () =>
                  rejectResponse(
                    new JourneyFailure("browser-cancel-response-timeout"),
                  ),
                15_000,
              );
              try {
                await cancelPhase("browser-cancel-action", () =>
                  button.click({ timeout: 15_000 }),
                );
                const captured = await waiting;
                const { payload } = captured;
                await cancelPhase("browser-cancel-terminal-ui", async () => {
                  if (captured.status === 200) {
                    await page.waitForURL(
                      (url) =>
                        url.searchParams.get("screen") === "cancelled" &&
                        url.searchParams.get("orderId") === id,
                    );
                  } else {
                    const afterDenial = object(
                      (await referral("/api/referral/active")).data,
                    );
                    const deniedTrip = object(afterDenial.trip);
                    requireFact(
                      deniedTrip.orderId === id,
                      "UI denial retains exact active order",
                    );
                    const deniedWindow = readCancellationWindowSnapshot(
                      deniedTrip.cancellationWindow,
                    );
                    const hasWindowUI =
                      (await page
                        .locator(
                          '[data-drt-operation="referral-cancellation-window"]',
                        )
                        .count()) === 1;
                    const rejectedByPolicy =
                      payload.error &&
                      object(payload.error).code === "ORDER_NOT_CANCELABLE";
                    // The window-aware UI closes this same snapshot after its real 409,
                    // including an originally unknown/rolling snapshot. Legacy UI keeps
                    // its original error Banner and enabled retry behavior.
                    if (
                      (hasWindowUI && rejectedByPolicy) ||
                      deniedWindow?.canCancel === false
                    )
                      await expect(button).toBeDisabled();
                    else await expect(button).toBeEnabled();
                    await expect(
                      page.getByText(text(object(payload.error).message), {
                        exact: true,
                      }),
                    ).toBeVisible();
                    requireFact(
                      new URL(page.url()).searchParams.get("orderId") === id &&
                        new URL(page.url()).searchParams.get("screen") ===
                          "trip",
                      "denial retains selected trip URL",
                    );
                  }
                });
                return {
                  status: captured.status,
                  data: captured.data,
                  headers: captured.headers,
                  bytes: captured.bytes,
                  command: captured.command,
                  requestSource: "actual-ui" as const,
                  uiDisabled:
                    captured.status === 200 ? false : await button.isDisabled(),
                };
              } finally {
                clearTimeout(deadline);
                await page.unroute(cancelUrl, observe);
              }
            });
          },
          capture: async (name, id, screen) => {
            // Keep the denied page intact: navigating would clear its real error Banner.
            if (!name.endsWith("-denied"))
              await page.goto(
                `${origins.referral}/embed/${ENTRY}?state=handoff&screen=${screen}&orderId=${encodeURIComponent(id)}`,
              );
            if (screen === "trip") {
              const active = object(
                (await referral("/api/referral/active")).data,
              );
              const resolvedTrip = resolveActiveTripScreenOrder(
                active,
                id,
                page.url(),
                "capture active trip",
              );
              await expect(
                page
                  .getByText(resolvedTrip.displayOrderNo, { exact: false })
                  .first(),
              ).toBeVisible();
              const current = resolvedTrip.trip;
              const window = readCancellationWindowSnapshot(
                current.cancellationWindow,
              );
              const button = page.locator(
                '[data-drt-operation="referral-cancel"]',
              );
              const hasWindowUI =
                (await page
                  .locator(
                    '[data-drt-operation="referral-cancellation-window"]',
                  )
                  .count()) === 1;
              if (
                window?.canCancel === false ||
                (name.endsWith("-denied") && hasWindowUI)
              )
                await expect(button).toBeDisabled();
              else await expect(button).toBeEnabled();
            } else {
              await expect(
                page
                  .getByText(
                    screen === "cancelled" ? "行程已取消" : "行程已完成",
                    { exact: false },
                  )
                  .first(),
              ).toBeVisible();
            }
            requireFact(
              new URL(page.url()).searchParams.get("orderId") === id,
              "actual selected-order screenshot binding",
            );
            await mkdir(`${DIRECTORY}/cancellations`, { recursive: true });
            const file = `${DIRECTORY}/cancellations/${name}.png`;
            const bytes = await page.screenshot({ path: file, fullPage: true });
            return { file, bytes: bytes.length, sha256: hash(bytes) };
          },
        },
        cancellations,
      );
      // Supplemental observations on the same completed order/session; see
      // REFERRAL-DEMO-HOSTED-DISPLAY-OBSERVATIONS-20261023. No extra booking.
      const unassignedCancellation = cancellations.find(
        (stage) => stage.stage === "unassigned",
      );
      displayObservations = await runDisplayObservations({
        page,
        referral,
        evidence,
        referralOrigin: origins.referral,
        entrySlug: ENTRY,
        entryHost: host,
        completedOrderId,
        unassignedCancelledOrderId: unassignedCancellation?.orderId,
        nonce,
        directory: DIRECTORY,
        definitionSha: definition,
        runtimeSha: runtime,
      });
      const completedOrderForReport = await getOrder();
      const controlledOrderIds = [
        completedOrderId,
        ...cancellations
          .map((stage) => stage.orderId)
          .filter(
            (candidate): candidate is string =>
              typeof candidate === "string" && candidate.trim().length > 0,
          ),
      ];
      // TEN03–06 extend this same managed FULL caller. The original main order,
      // journal and all C1–C4 observations above retain their own custody.
      const reportCase = async (
        name: string,
        source: ObjectData,
        expected: NonNullable<
          Parameters<
            typeof runOwnedDailyReportDownloads
          >[0]["supplementalExpected"]
        >,
        task = completedTask,
      ) => {
        const report = await runOwnedDailyReportDownloads({
          context,
          page,
          opsOrigin: origins.ops,
          opsHeaders: (url) => tx.headers("ops", url),
          readCanonicalOrders: () => opsControl("/orders"),
          order: source,
          completedTask: task,
          supplementalExpected: expected,
          entrySlug: ENTRY,
          controlledOrderIds,
          driverId: text(driverId),
          vehicleId: text(vehicleId),
          plateNo: ownPlateNo,
          pickupAddress,
          dropoffAddress,
          directory: `${DIRECTORY}/TEN03-06/${name}`,
          definitionSha: definition,
          runtimeSha: runtime,
          recoveryOnly: RECOVERY_ONLY,
          evidence,
        });
        supplementalReports.push(report);
      };
      const getExtraOrder = async (id: string) => {
        const source = await opsControl(`/orders/${encodeURIComponent(id)}`);
        requireFact(
          source.orderId === id &&
            source.partnerEntrySlug === ENTRY &&
            object(source.passenger).passengerId === passengerId,
          "supplemental canonical same-subject ownership",
        );
        return source;
      };
      const bookExtraFromUI = async (name: string, intendedInput?: string) => {
        const state: (typeof extraBookings)[number] = { name, actions: [] };
        extraBookings.push(state); // Custody exists even when response/storage fails.
        assertNoForeignActive((await referral("/api/referral/active")).data);
        const scheduled = intendedInput
          ? new Date(intendedInput).toISOString()
          : undefined;
        const proposals = new Map<string, ObjectData>();
        const quoteTasks: Promise<void>[] = [];
        const observeQuote = (response: PlaywrightResponse) => {
          if (
            response.url() !== `${origins.referral}/api/referral/quote` ||
            response.request().method() !== "POST"
          )
            return;
          const requested = object(response.request().postDataJSON());
          if (
            requested.entrySlug !== ENTRY ||
            requested.pickupAddress !== pickupAddress ||
            requested.dropoffAddress !== dropoffAddress ||
            requested.vehicleType !== "standard" ||
            requested.scheduledAt !== scheduled
          )
            return;
          const pending = (async () => {
            requireFact(
              response.status() === 200 &&
                response.headers()["x-drts-candidate-sha"] === runtime,
              "supplemental actual UI quote runtime",
            );
            const proposal = object(object(await response.json()).data);
            requireFact(
              proposal.requestedScheduledAt === (scheduled ?? null) &&
                proposal.timingMode ===
                  (scheduled ? "scheduled" : "immediate") &&
                proposal.pickupAddress === pickupAddress &&
                proposal.dropoffAddress === dropoffAddress &&
                proposal.fixedPrice === false &&
                proposal.isGuaranteed === false &&
                proposal.feeDisclosureVersion ===
                  feesReadback.disclosureVersion &&
                proposal.feeContentHash === feesReadback.contentHash,
              "supplemental actual UI quote intent",
            );
            proposals.set(text(proposal.quoteId), proposal);
          })();
          quoteTasks.push(pending);
          void pending.catch(() => undefined);
        };
        page.on("response", observeQuote);
        let finish!: () => void, fail!: (e: unknown) => void;
        const settled = new Promise<void>((resolve, reject) => {
          finish = resolve;
          fail = reject;
        });
        void settled.catch(() => undefined);
        const deadline = setTimeout(
          () =>
            fail(new JourneyFailure("supplemental-original-booking-timeout")),
          25_000,
        );
        const url = `${origins.referral}/api/referral/booking`;
        const handle = async (route: Route) => {
          try {
            requireFact(
              route.request().method() === "POST" &&
                route.request().url() === url,
              "supplemental original UI POST route binding",
            );
            requireFact(
              !state.journal,
              "one supplemental original UI booking only",
            );
            const raw = text(route.request().postData());
            const command = object(JSON.parse(raw));
            await Promise.all([...quoteTasks]);
            const quote = proposals.get(text(command.quoteId));
            requireFact(
              quote,
              "supplemental UI consumes actual observed quote",
            );
            state.quote = quote;
            state.journal = new BookingWriteJournal(
              {
                definitionSha: definition,
                runtimeSha: runtime,
                nonce: `${nonce}-${name}`,
                entrySlug: ENTRY,
                partnerUserRef: SUBJECT,
                quoteId: text(quote.quoteId),
                feeDisclosureVersion: text(quote.feeDisclosureVersion),
                ...(scheduled === undefined
                  ? {}
                  : { expectedScheduledAt: scheduled }),
                pickupAddress,
                dropoffAddress,
                passengerName,
                passengerPhone: phone,
                vehicleType: "standard",
              },
              (snapshot) =>
                persistPrivateJson(
                  `${DIRECTORY}/TEN03-06/${name}/booking-write-journal.json`,
                  snapshot,
                ),
            );
            await persistPrivateJson(
              `${DIRECTORY}/TEN03-06/${name}/quote.json`,
              {
                definitionSha: definition,
                runtimeSha: runtime,
                intendedInput: intendedInput ?? null,
                quote,
              },
            );
            await state.journal.beforeSend(
              raw,
              text(route.request().headers()["idempotency-key"]),
              async () => {
                state.actions.push("booking");
                const original = await route.fetch({
                  maxRedirects: 0,
                  maxRetries: 0,
                  timeout: 15000,
                });
                try {
                  await settleRoutedOriginalBookingAck(
                    original,
                    route.request(),
                    (response) =>
                      observeOriginalBookingAck(
                        Promise.resolve(response),
                        () => ({
                          url,
                          runtimeSha: runtime,
                          journal: state.journal,
                          quote: state.quote,
                        }),
                        (id) => {
                          state.orderId = id;
                        },
                        evidence,
                      ),
                    (bytes) =>
                      route.fulfill({ response: original, body: bytes }),
                  );
                } finally {
                  await original.dispose();
                }
              },
            );
            finish();
          } catch (error) {
            fail(originalBookingRouteFailure(error));
            await route.abort().catch(() => undefined);
          }
        };
        try {
          await page.goto(
            `${origins.referral}/embed/${ENTRY}?state=handoff&screen=book`,
          );
          await page.locator('input[name="passengerName"]').fill(passengerName);
          await page.locator('input[name="passengerPhone"]').fill(phone);
          await page
            .getByRole("radio", { name: "標準車", exact: true })
            .check();
          await page
            .locator('input[name="scheduledAt"]')
            .fill(intendedInput ?? "現在出發");
          await page.locator('input[name="pickupAddress"]').fill(pickupAddress);
          await page
            .locator('input[name="dropoffAddress"]')
            .fill(dropoffAddress);
          const agree = page.getByRole("checkbox", {
            name: "我已確認費用與優惠說明",
            exact: true,
          });
          await expect(agree).not.toBeChecked();
          await agree.check();
          const create = page.locator('[data-drt-operation="referral-create"]');
          await expect(create).toBeEnabled();
          await page.route(url, handle);
          deadline = setTimeout(
            () =>
              fail(new JourneyFailure("supplemental-original-booking-timeout")),
            25_000,
          );
          await clickAndSettleOriginalBookingAck(() => create.click(), settled);
          requireFact(
            state.orderId && state.journal && state.quote,
            "supplemental original booking ACK custody",
          );
          requireFact(
            state.orderId !== completedOrderId &&
              extraBookings.filter((b) => b.orderId === state.orderId)
                .length === 1,
            "supplemental independent exact order ID set",
          );
          controlledOrderIds.push(state.orderId);
          return state as typeof state & {
            orderId: string;
            journal: BookingWriteJournal;
            quote: ObjectData;
          };
        } finally {
          clearTimeout(deadline);
          page.off("response", observeQuote);
          await page.unroute(url, handle);
          await Promise.all(quoteTasks);
        }
      };
      // Original C1 is the legal real null-final-driver/no-arrival source. Read
      // its original private journal; neither a one-driver list nor memory trace
      // is authority for durable global absence.
      requireFact(
        unassignedCancellation?.orderId &&
          unassignedCancellation.result === "observed" &&
          !unassignedCancellation.taskId &&
          !unassignedCancellation.assignmentId &&
          !unassignedCancellation.dispatchJobId,
        "original same-run C1 unassigned cancellation required",
      );
      const c1 = await getExtraOrder(unassignedCancellation.orderId);
      const c1Journal = JSON.parse(
        await readFile(
          `${DIRECTORY}/cancellations/unassigned-booking-write-journal.json`,
          "utf8",
        ),
      );
      await persistPrivateJson(
        `${DIRECTORY}/TEN03-06/C1-no-dispatch-source.json`,
        {
          definitionSha: definition,
          runtimeSha: runtime,
          orderId: c1.orderId,
          originalCaseFactsFile: unassignedCancellation.factsFile,
          originalBookingBodySha256: c1Journal.bodySha256,
          observedSameRunActions: ["booking", "cancel"],
          provenance:
            "original runFourStageOwnedCancellations unassigned branch; no dispatch action in this caller",
          canonical: {
            status: c1.status,
            cancelledAt: c1.cancelledAt,
            reservationWindowStart: c1.reservationWindowStart,
          },
          absenceQualification:
            "bounded caller sequence plus canonical/report facts; global task/trace absence pending complete authorized source",
        },
      );
      await reportCase(
        "C1-cancelled-null",
        c1,
        resolveExpectedCancelledDailyDispatchRecord(c1, c1Journal, {
          entrySlug: ENTRY,
          pickupAddress,
          dropoffAddress,
        }),
      );

      // Read actual approved/available owned supply separately from quotes.
      await adminControl(
        `/regulatory-registry/drivers/${encodeURIComponent(driverId)}/work-state`,
        {
          method: "POST",
          body: { workState: "available" },
        },
      );
      await heartbeat(null, "available", ++cancellationSequence);
      const actualOwnDriver = records(
        (await adminControl("/regulatory-registry/drivers")).items,
      ).find((d) => d.driverId === driverId);
      const actualOwnVehicle = records(
        (await adminControl("/regulatory-registry/vehicles")).items,
      ).find((v) => v.vehicleId === vehicleId);
      requireFact(
        actualOwnDriver?.workState === "available" &&
          actualOwnVehicle?.plateNo === ownPlateNo,
        "scheduled separate approved own available registry supply readback",
      );
      for (const [
        index,
        intendedInput,
      ] of futureTaipeiReservationIntents().entries()) {
        const name = `reservation-${index + 1}`;
        const booking = await bookExtraFromUI(name, intendedInput);
        const after = await verifyOwnedReservationCancellation({
          intendedInput,
          journal: booking.journal,
          quote: booking.quote,
          orderId: booking.orderId,
          readOrder: () => getExtraOrder(booking.orderId),
          readWindow: async () => {
            const active = object(
              (await referral("/api/referral/active")).data,
            );
            const trip = object(active.trip);
            requireFact(
              trip.orderId === booking.orderId,
              "scheduled current own trip window",
            );
            return object(trip.cancellationWindow);
          },
          cancel: async () => {
            const url = `${origins.referral}/api/referral/cancel/${encodeURIComponent(booking.orderId)}`;
            let resolve!: (v: ObjectData) => void,
              reject!: (e: unknown) => void;
            const ack = new Promise<ObjectData>((yes, no) => {
              resolve = yes;
              reject = no;
            });
            void ack.catch(() => undefined);
            const timer = setTimeout(
              () =>
                reject(new JourneyFailure("scheduled-original-cancel-timeout")),
              20_000,
            );
            const handle = async (route: Route) => {
              try {
                booking.actions.push("cancel");
                const result = await captureOriginalUiCancellation(route, {
                  url,
                  orderId: booking.orderId,
                  runtime,
                });
                requireFact(
                  result.status === 200,
                  "scheduled original UI cancellation success",
                );
                resolve(object(result.data));
              } catch (error) {
                reject(error);
                await route.abort().catch(() => undefined);
              }
            };
            try {
              await page.goto(
                `${origins.referral}/embed/${ENTRY}?state=handoff&screen=trip&orderId=${encodeURIComponent(booking.orderId)}`,
              );
              await page.route(url, handle);
              return await clickAndSettleOriginalBookingAck(
                () =>
                  page
                    .locator('[data-drt-operation="referral-cancel"]')
                    .click(),
                ack,
              );
            } finally {
              clearTimeout(timer);
              await page.unroute(url, handle);
            }
          },
          persist: (facts) =>
            persistPrivateJson(
              `${DIRECTORY}/TEN03-06/${name}/cancellation.json`,
              facts,
            ),
        });
        booking.terminal = true;
        requireFact(
          toTaipeiServiceDate(text(after.reservationWindowStart)) ===
            intendedInput.slice(0, 10),
          "true Taipei scheduled report service day",
        );
        await reportCase(
          name,
          after,
          resolveExpectedCancelledDailyDispatchRecord(
            after,
            booking.journal.current!,
            { entrySlug: ENTRY, pickupAddress, dropoffAddress },
          ),
        );
      }
      const firstReservation = extraBookings.find(
        (b) => b.name === "reservation-1",
      );
      requireFact(
        firstReservation?.orderId && firstReservation.journal?.current,
        "first reservation original custody retained",
      );
      const firstReservationAfterBoth = await getExtraOrder(
        firstReservation.orderId,
      );
      await reportCase(
        "reservation-1-after-both",
        firstReservationAfterBoth,
        resolveExpectedCancelledDailyDispatchRecord(
          firstReservationAfterBoth,
          firstReservation.journal.current,
          { entrySlug: ENTRY, pickupAddress, dropoffAddress },
        ),
      );
      // Provision SECOND real supply through the original upload/review flow.
      const secondPhone = `${phone.slice(0, -1)}${(Number(phone.slice(-1)) + 1) % 10}`;
      await provisionSupply(extraSupply, `${nonce}-second`, secondPhone);
      const second = {
        driverId: text(extraSupply.driverId),
        vehicleId: text(extraSupply.vehicleId),
      };
      const driver2 = async (path: string, options: CallOptions = {}) =>
        object(
          (await extraSupply.transport.call("driver", path, options)).data,
        );
      let secondSequence = 0;
      const heartbeatSecond = async (
        taskId: string | null,
        workState: string,
      ) => {
        const accepted = await driver2(
          "/api/driver/location-heartbeats/batch",
          {
            method: "POST",
            body: {
              items: [
                {
                  eventId: randomUUID(),
                  deviceId: extraSupply.deviceId,
                  ...second,
                  taskId,
                  sequenceNo: ++secondSequence,
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
        const item = object(records(accepted.items)[0]);
        requireFact(
          item.accepted === true && item.currentLocationUpdated === true,
          "second own actor bound heartbeat accepted",
        );
      };
      await heartbeatSecond(null, "available");
      await heartbeat(null, "available", ++cancellationSequence);
      const redispatchBooking = await bookExtraFromUI("redispatched");
      const redispatchResult = await runOwnedRedispatchToSecond({
        orderId: redispatchBooking.orderId,
        nonce: `${nonce}-redispatched`,
        first: { driverId, vehicleId },
        second,
        ops: async (path, options) => {
          if (options?.method === "POST") {
            redispatchBooking.actions.push(path);
            await persistPrivateJson(
              `${DIRECTORY}/TEN03-06/redispatched/actions.json`,
              {
                orderId: redispatchBooking.orderId,
                actions: redispatchBooking.actions,
                nextOriginalCommand: {
                  path,
                  body: options.body,
                  idempotencyKey: options.headers?.["Idempotency-Key"],
                },
              },
            );
          }
          return opsControl(path, options);
        },
        firstDriver: (path, options) => call("driver", path, options),
        secondDriver: driver2,
        persist: (facts) =>
          persistPrivateJson(
            `${DIRECTORY}/TEN03-06/redispatched/assignment-trace.json`,
            facts,
          ),
        completeSecond: async (task) => {
          const id = text(task.taskId);
          for (const [action, key, state] of [
            ["accept", "acceptedAt", "assigned"],
            ["depart", "departedAt", "enroute"],
            ["arrived_pickup", "arrivedAt", "arrived"],
            ["start", "startedAt", "on_trip"],
          ] as const) {
            await driver2(
              `/api/driver/tasks/${encodeURIComponent(id)}/${action}`,
              {
                method: "POST",
                body: {
                  [key]: now(),
                  ...(action === "depart" ? { currentLocation: pickup } : {}),
                },
              },
            );
            const current = await driver2(
              `/api/driver/tasks/${encodeURIComponent(id)}`,
            );
            requireFact(
              current.orderId === redispatchBooking.orderId &&
                current.driverId === second.driverId &&
                current.assignmentId === task.assignmentId,
              "second progression same owned task assignment",
            );
            await heartbeatSecond(id, state);
          }
          await driver2(
            `/api/driver/tasks/${encodeURIComponent(id)}/complete`,
            {
              method: "POST",
              body: simulationCompletion(
                await getExtraOrder(redispatchBooking.orderId),
                `data:image/png;base64,${png.toString("base64")}`,
              ),
            },
          );
          const completed = await driver2(
            `/api/driver/tasks/${encodeURIComponent(id)}`,
          );
          redispatchBooking.terminal = completed.status === "completed";
          return completed;
        },
      });
      const finalRedispatched = await getExtraOrder(redispatchBooking.orderId);
      const expectedRedispatched = resolveExpectedDailyDispatchRecord(
        finalRedispatched,
        redispatchResult.completedTask,
        {
          entrySlug: ENTRY,
          ...second,
          plateNo: text(extraSupply.plateNo),
          pickupAddress,
          dropoffAddress,
        },
      );
      await reportCase(
        "redispatched",
        finalRedispatched,
        {
          ...expectedRedispatched,
          caseKind: "redispatched",
          redispatchCount: 1,
          cancellationReason: null,
        },
        redispatchResult.completedTask,
      );
      // Restore the original completed positive filter/page/readback last.
      dailyReportDownloads = await runOwnedDailyReportDownloads({
        context,
        page,
        opsOrigin: origins.ops,
        opsHeaders: (url) => tx.headers("ops", url),
        readCanonicalOrders: () => opsControl("/orders"),
        order: completedOrderForReport,
        completedTask,
        entrySlug: ENTRY,
        fleetSupplyTenantId: TENANT,
        controlledOrderIds,
        driverId,
        vehicleId,
        plateNo: ownPlateNo,
        pickupAddress,
        dropoffAddress,
        directory: DIRECTORY,
        definitionSha: definition,
        runtimeSha: runtime,
        recoveryOnly: RECOVERY_ONLY,
        evidence,
      });
    }
  } catch (error) {
    mainError = bookingState.routeError ?? error;
    evidence.failure(mainError);
  } finally {
    if (RECOVERY_ONLY && orderId && !recoveryResolved) {
      cleanupErrors.push("recovery-only-original-order-not-terminal");
      evidence.record({
        stage: "recovery-only-original-order-not-terminal",
        orderId,
        result: "retained",
      });
    }
    if (browserRatingState.current?.state === "ack_unknown") {
      cleanupErrors.push(
        "browser-rating-ACK-unknown-original-command-retained",
      );
      evidence.record({
        stage: "browser-rating-ACK-unknown-original-command-retained",
        orderId: browserRatingState.current.orderId,
        sha256: browserRatingState.current.bodySha256,
        result: "retained",
      });
    }
    if (bookingState.journal?.current?.state === "ack_unknown") {
      cleanupErrors.push("booking-ACK-unknown-possible-write");
      evidence.record({
        stage: "booking-ACK-unknown-possible-write",
        sha256: bookingState.journal.current.bodySha256,
        result: "retained",
      });
    }
    // No broad DB/GCS cleanup. Never cancel a pre-existing fixed-subject order.
    if (!RECOVERY_ONLY && orderId && !completed)
      await cleanup("own-order-normal-terminalization", async () => {
        await terminalizeOwnOrder(orderId!, getOrder, async (action) => {
          if (action === "resolve-exception-hold")
            return opsControl(
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
          return cancelReferralOrder(
            orderId!,
            "Own synthetic consumer cleanup",
          );
        });
      });
    if (!RECOVERY_ONLY) {
      for (const booking of extraBookings) {
        // Resolve known owned orders only through the ordinary passenger cancel
        // policy. Closed windows or a lost ACK stay retained; never complete a
        // future reservation early or issue a replacement booking.
        if (booking.orderId && !booking.terminal) {
          const ownId = booking.orderId;
          await cleanup(
            `supplemental-${booking.name}-normal-terminalization`,
            async () => {
              const read = async () => {
                const source = await opsControl(
                  `/orders/${encodeURIComponent(ownId)}`,
                );
                requireFact(
                  source.orderId === ownId &&
                    source.partnerEntrySlug === ENTRY &&
                    object(source.passenger).passengerId === passengerId,
                  "supplemental cleanup exact owned subject",
                );
                return source;
              };
              await terminalizeOwnOrder(ownId, read, async (action) => {
                if (action === "resolve-exception-hold")
                  return opsControl(
                    `/orders/${encodeURIComponent(ownId)}/resolve-exception-hold`,
                    {
                      method: "POST",
                      body: {
                        resolution: "cancel_order",
                        reason: "Own supplemental synthetic cleanup",
                        traceId: `${nonce}-${booking.name}-cleanup`,
                      },
                    },
                  );
                return cancelReferralOrder(
                  ownId,
                  "Own supplemental synthetic normal cleanup",
                );
              });
              booking.terminal = true;
            },
          );
        }
        if (
          booking.journal?.current?.state === "ack_unknown" ||
          (booking.orderId && !booking.terminal)
        ) {
          cleanupErrors.push(
            `supplemental-${booking.name}-retained-unresolved`,
          );
          evidence.record({
            stage: `supplemental-${booking.name}-retained-unresolved`,
            result: "retained",
          });
        }
      }
      if (extraSupply.driverId)
        await cleanup("second-own-driver-offline", () =>
          adminControl(
            `/regulatory-registry/drivers/${encodeURIComponent(text(extraSupply.driverId))}/work-state`,
            { method: "POST", body: { workState: "offline" } },
          ),
        );
      if (extraSupply.bindingId && extraSupply.deviceId)
        await cleanup("second-own-binding-revoked-by-second-driver", () =>
          extraSupply.transport.call(
            "driver",
            "/api/auth/driver/device/revoke",
            {
              method: "POST",
              body: {
                bindingId: extraSupply.bindingId,
                deviceId: extraSupply.deviceId,
              },
            },
          ),
        );
      else if (extraSupply.invitation)
        await cleanup("second-unused-invitation-revoked", () =>
          call("api", "/api/auth/driver/device/invite/revoke", {
            method: "POST",
            body: { registrationCode: extraSupply.invitation },
            headers: { "x-idempotency-key": `${nonce}-second-invite-revoke` },
          }),
        );
      await persistPrivateJson(`${DIRECTORY}/TEN03-06-custody.json`, {
        definitionSha: definition,
        runtimeSha: runtime,
        bookings: extraBookings.map((b) => ({
          name: b.name,
          orderId: b.orderId,
          terminal: b.terminal ?? false,
          journalState: b.journal?.current?.state,
          bodySha256: b.journal?.current?.bodySha256,
          actions: b.actions,
          recovery: b.journal?.current?.recovery,
        })),
        exactOwnedOrderIds: extraBookings.map((b) => b.orderId).filter(Boolean),
        secondSupply: {
          driverId: extraSupply.driverId,
          vehicleId: extraSupply.vehicleId,
          deviceId: extraSupply.deviceId,
          bindingId: extraSupply.bindingId,
          plateNo: extraSupply.plateNo,
          driverSubmissionId: extraSupply.driverSubmissionId,
          vehicleSubmissionId: extraSupply.vehicleSubmissionId,
          retainedApprovedSupplyAndDocuments: Boolean(
            extraSupply.driverId || extraSupply.vehicleId,
          ),
        },
        reports: supplementalReports,
        sourceAuthority: {
          canonicalReads:
            "normal same-runtime GET /orders/:id and report repository path when enabled",
          pgEnabledDeploymentProof:
            "pending external same-release operator evidence",
          dispatchTrace: "instance-local-memory; not durable global proof",
          noAssignment:
            "own journaled no-dispatch sequence and report null facts only; global absence pending complete authority",
        },
      });
    }
    const ownDriverForCleanup = driverId;
    if (ownDriverForCleanup)
      await cleanup("own-synthetic-driver-offline", () =>
        adminControl(
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
    const ownOpsSessionForCleanup = opsSessionId;
    if (ownOpsSessionForCleanup)
      await cleanup("own-Ops-session-self-revoked", async () => {
        await call("opsApi", "/api/auth/sessions/revoke", {
          method: "POST",
          body: { sessionId: ownOpsSessionForCleanup },
        });
        const inactive = await tx.call("opsApi", "/api/auth/session", {
          expected: [200, 401],
        });
        requireFact(
          inactive.status === 401 || object(inactive.data).active === false,
          "own Ops session inactive after self-revocation",
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
          mode: RECOVERY_ONLY ? "recovery-only" : "full-journey",
          recovery: RECOVERY_ONLY
            ? {
                originalRun: retainedRecovery.originalRun,
                orderId: retainedRecovery.orderId,
                quoteId: retainedRecovery.quoteId,
                bodySha256: retainedRecovery.bodySha256,
                claimedOrderId: orderId ?? null,
                resolved: recoveryResolved,
                terminalStatus: recoveryResult?.status ?? null,
              }
            : null,
          completed: RECOVERY_ONLY ? false : completed,
          cleanupErrors,
          bookingWrite: bookingState.journal?.current
            ? {
                state: bookingState.journal.current.state,
                bodySha256: bookingState.journal.current.bodySha256,
                journal: "booking-write-journal.json",
                recovery: bookingState.journal.current.recovery,
              }
            : null,
          browserRatingWrite: browserRatingState.current ?? null,
          events: evidence.events,
          simulation: RECOVERY_ONLY
            ? "Recovery of the exact pre-existing synthetic Referral order only; no new supply/documents/quote/booking, Driver progression, trip completion, rating/CRM or receipt/TXT execution."
            : "Synthetic dev driver/vehicle/documents/GPS/project PNG and Driver-declared fare; no physical ride, legal approval, PSP debit, E04 or formal PDF claim.",
          declaredActualFare:
            !RECOVERY_ONLY && completed
              ? {
                  currency: "TWD",
                  amountMinor: 12000,
                  source: "synthetic_driver_report",
                  notEstimateOrPayment: true,
                }
              : null,
          retained: RECOVERY_ONLY
            ? "Only this run's own new Admin/Referral sessions are revoked. Original approved supply/documents and fixed Demo identity remain; unresolved own order is preserved, never broad-cleaned. No H3 or full-journey claim."
            : "Approved own supply/documents, completed order/CRM and fixed Demo identity remain. No inherited H3 cleanup claim.",
          cancellations: RECOVERY_ONLY
            ? [
                "unassigned",
                "assigned-not-arrived",
                "arrived-not-started",
                "on-trip",
              ].map((stage) => ({
                stage,
                result: "unexecuted",
                reason: RECOVERY_ONLY
                  ? "Retained-order cleanup only; no staged passenger-cancellation scenario PASS."
                  : "Minimum same-order completion scenario; no cancellation pass borrowed.",
              }))
            : cancellations,
          displayObservations: displayObservations ?? null,
          dailyReportDownloads: dailyReportDownloads ?? null,
          ...(!RECOVERY_ONLY
            ? {
                supplementalDailyReportCustody: {
                  file: "TEN03-06-custody.json",
                  reportsObserved: supplementalReports.length,
                  runtimeAcceptance:
                    "pending same-release PG-enabled durable-source/deployment proof and operator cleanup verification",
                },
              }
            : {}),
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
