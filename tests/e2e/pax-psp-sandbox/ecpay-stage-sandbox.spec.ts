/**
 * PAX-PRODUCT-ORDER-ECPAY-STAGE-20261123 — end-to-end ECPay Stage acceptance
 * through the real product passenger session, binding controller/service,
 * same product order, trip completion outbox, electronic receipt, and payment
 * ledger on an isolated GitHub-hosted PostgreSQL database.
 *
 * Prior run 41964622331 (PAX-PSP-SANDBOX-EVIDENCE-20261101) verified the
 * EcpayPaymentProvider adapter directly. This suite reuses the same ECPay Stage
 * merchant and serial concurrency group (`pax-psp-ecpay-stage-sandbox`) while
 * driving the full product chain:
 *
 * 1. Passenger session (`PassengerAccountService`) -> browser calls
 *    `GET /api/passenger-app/payment-methods?binding_session=1` on the mounted
 *    `PaymentMethodController` (`GetTokenbyBindingCard`).
 * 2. Browser mounts ECPay Stage WEB JS SDK, types Stage test card
 *    `4311-9522-2222-2222` in ECPay's iframe, and clicks `#drts-bind-card-btn`
 *    (`綁定卡片`), which calls `getBindCardPayToken` and
 *    `POST /api/passenger-app/payment-methods` (`CreateBindCard`), persisting
 *    `operation='bind', outcome='action_required'` in
 *    `passenger.payment_idempotency_keys` and revealing
 *    `#drts-3ds-verify-link` (`前往付款商安全驗證`).
 * 3. Browser clicks `#drts-3ds-verify-link` (`前往付款商安全驗證`), completes
 *    Stage 3DS OTP `1234`, and submits ECPay's `OrderResultURL` form POST.
 *    Because the runner is not reachable from the public internet at
 *    `smarttransport.tw`, Playwright intercepts the browser's real encrypted
 *    `OrderResultURL` form POST and forwards the unmodified body to the mounted
 *    `POST /api/passenger-app/payment-methods/ecpay/order-result` controller
 *    (`runner_intercepted_browser_order_result_forwarded_to_mounted_controller`).
 * 4. `PaymentMethodController.verifyOrderResult` ->
 *    `PaymentMethodService.verifyNotification` verifies the envelope, calls
 *    `cancelBindingAuthorization` (`DoAction N`), seals `BindCardID` with
 *    `PaymentTokenCipher` (AES-256-GCM), and commits the bound card in
 *    `passenger.psp_tokens` (`last4='2222'`, `card_type='VISA'`,
 *    `is_default=true`, `status='active'`) and `outcome='completed'` in
 *    `passenger.payment_idempotency_keys`.
 * 5. Idempotency replay checks on `/ecpay/order-result`, `/ecpay/callback`
 *    (`1|OK`), and `/3ds-complete` confirm `passenger.psp_tokens` remains 1 row.
 * 6. Passenger quotes a fare (`PassengerFareService.quote`) and creates a ride
 *    via `POST /api/passenger-app/rides` (`PassengerBookingController.createRide`)
 *    referencing the bound `paymentMethodId` (verifying booking idempotency
 *    replay and unsettled card removal `409 pending_payment_block`).
 * 7. Driver task completion for that same `orderId` commits
 *    `ops.driver_completion_outbox` (`multi_taxi_certificate`) and triggers
 *    `CertificateSupportService.writeCompletedTrip` +
 *    `PaymentChargeService.onTripCompleted`, which decrypts `BindCardID` from
 *    `passenger.psp_tokens`, calls `/Merchant/CreatePaymentWithCardID`
 *    (`Need3D=0`, NT$85 / `amount_minor=8500`), and commits a single ledger
 *    entry in both `passenger.payment_charge_records` and
 *    `billing.multi_taxi_passenger_payments` (`payment_id='pax-payment:'+orderId`,
 *    `status='captured'`, `attempt_count=1`).
 * 8. Verifies `GET /api/passenger-app/rides/:orderId` payment projection,
 *    electronic receipt downloads/HTML (`VISA ••••2222`)/PDF (`%PDF-1.7`), and
 *    capture idempotency replay (`onTripCompleted` + `processOrder` make 0
 *    extra ECPay calls).
 * 9. Calls `POST /api/passenger-app/platform/rides/:orderId/refund` on
 *    `PaymentRefundController`, preserving Stage's actual `QueryTrade` /
 *    `DoAction` outcome and DB state while documenting simulated refund scope.
 * 10. In `finally`, calls `DELETE /api/passenger-app/payment-methods/:id` on
 *     `PaymentMethodController` (`/Merchant/DeleteMemberBindCard`), verifying
 *     `passenger.psp_tokens.status='removed'` and `token_envelope=null` while
 *     preserving order and ledger history (with direct `provider.unbind`
 *     fallback if needed).
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  ECPAY_STAGE_BASE_URL,
  EcpayPaymentProvider,
} from "../../../apps/api/src/modules/passenger-app/payment/ecpay-payment-provider";
import { paymentRuntimeFromEnv } from "../../../apps/api/src/modules/passenger-app/payment/payment-runtime.config";
import {
  completeStageThreeD,
  fillStageCard,
  pageShowsFullCardNumber,
} from "./ecpay-browser";
import {
  EVIDENCE_DIR,
  EVIDENCE_SCHEMA,
  Redactor,
  STAGE_TEST_CARD,
  createRecordingFetch,
  describeCallbackBodyShape,
  diagnoseEnvelopeVerification,
  digest12,
  extractCallbackBindCardIdAndRegister,
  maskInLog,
  writeEvidence,
  type EcpayCallRecord,
  type ProductFindingRecord,
  type SandboxEvidence,
  type StepRecord,
} from "./evidence";
import {
  acceptedPayToken,
  startHarness,
  type HarnessBindFlowResult,
  type HarnessSessionMountResult,
} from "./harness";
import {
  PLATFORM_BILLING_HEADERS,
  startProductOrderStageContext,
} from "./product-order-harness";

const CHARGE_AMOUNT_TWD = 85;
const CHARGE_AMOUNT_MINOR = CHARGE_AMOUNT_TWD * 100;
const SYNTHETIC_EMAIL = "pax-psp-sandbox@example.com";
const ORDER_RESULT_PATH =
  /\/api\/passenger-app\/payment-methods\/ecpay\/order-result(?:[?#]|$)/;

type Outcome = StepRecord["outcome"];

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_required_env:${name}`);
  return value;
}

test.describe.configure({ mode: "serial", retries: 0 });

test("ECPay Stage: product session, 3DS bind controller, same product order, capture ledger, receipt, refund & unbind", async ({
  page,
}) => {
  const candidateSha = requiredEnv("PAX_PSP_SANDBOX_CANDIDATE_SHA");
  expect(candidateSha).toMatch(/^[0-9a-f]{40}$/);
  if (process.env.PSP_SANDBOX !== "true") {
    throw new Error(
      "refusing_non_sandbox_psp: PSP_SANDBOX must be exactly true",
    );
  }
  const merchantId = requiredEnv("PSP_MERCHANT_ID");
  const hashKey = requiredEnv("PSP_HASH_KEY");
  const hashIv = requiredEnv("PSP_HASH_IV");
  const keyRing = requiredEnv("PSP_TOKEN_ENCRYPTION_KEY_NAME");

  const redactor = new Redactor([merchantId, hashKey, hashIv, keyRing]);
  for (const value of Object.values(safeKeyRingValues(keyRing)))
    redactor.add(value);
  mkdirSync(path.join(EVIDENCE_DIR, "screenshots"), { recursive: true });

  const runId = process.env.GITHUB_RUN_ID ?? `local${Date.now()}`;
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? "1";
  const runKey = `${runId}-${runAttempt}`;
  const runUrl =
    process.env.GITHUB_SERVER_URL &&
    process.env.GITHUB_REPOSITORY &&
    process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}/attempts/${runAttempt}`
      : null;
  const syntheticEmail = SYNTHETIC_EMAIL;

  const calls: EcpayCallRecord[] = [];
  const steps: StepRecord[] = [];
  const screenshots: string[] = [];
  const productFindings: ProductFindingRecord[] = [];
  let currentStep = "init";

  const runtime = paymentRuntimeFromEnv(
    {
      PSP_PROVIDER: "ecpay",
      PSP_MERCHANT_ID: merchantId,
      PSP_HASH_KEY: hashKey,
      PSP_HASH_IV: hashIv,
      PSP_SANDBOX: "true",
      PSP_TOKEN_ENCRYPTION_KEY_NAME: keyRing,
    },
    {
      fetchFn: createRecordingFetch({
        merchantId,
        hashKey,
        hashIv,
        redactor,
        records: calls,
        currentStep: () => currentStep,
      }),
    },
  );
  const provider = runtime.provider;
  if (!(provider instanceof EcpayPaymentProvider) || !runtime.cipher) {
    throw new Error("payment_runtime_did_not_select_ecpay");
  }
  const cipher = runtime.cipher;
  if (!provider.sandbox || provider.baseUrl !== ECPAY_STAGE_BASE_URL) {
    throw new Error("refusing_non_stage_ecpay_endpoint");
  }

  const ctx = await startProductOrderStageContext({
    runtime,
    passengerEmail: syntheticEmail,
  });
  redactor.add(ctx.accessToken);
  redactor.add(ctx.refreshToken);

  const merchantMemberId = provider.deriveMerchantMemberId(ctx.passengerId);
  redactor.add(merchantMemberId);

  const evidence: SandboxEvidence = {
    schema: EVIDENCE_SCHEMA,
    taskId: "PAX-PRODUCT-ORDER-ECPAY-STAGE-20261123",
    acceptanceKey: "hosted_same_product_order_stage_binding_capture_and_ledger",
    candidateSha,
    runUrl,
    runId: process.env.GITHUB_RUN_ID ?? null,
    runAttempt,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    environment: {
      provider: provider.name,
      serverType: provider.serverType,
      baseUrl: provider.baseUrl,
      paymentBaseUrl: provider.paymentBaseUrl,
      sdkScriptUrl: provider.sdkScriptUrl,
      runner: process.env.RUNNER_ENVIRONMENT ?? null,
      runnerOs: process.env.RUNNER_OS ?? null,
      passengerId: ctx.passengerId,
      merchantMemberId_sha12: digest12(merchantMemberId),
      testCard_last4: STAGE_TEST_CARD.last4,
      chargeAmountTwd: CHARGE_AMOUNT_TWD,
      chargeAmountMinor: CHARGE_AMOUNT_MINOR,
      isolatedPostgresDatabase: true,
      sharedDevDemoPreservedOnSim: true,
    },
    callbackDelivery: {},
    productOrder: {},
    productFindings,
    steps,
    calls,
    screenshots,
    refund: {},
    acceptance: {},
  };

  async function step<T>(
    name: string,
    body: (outcome: Outcome) => Promise<T>,
  ): Promise<T> {
    currentStep = name;
    const record: StepRecord = {
      name,
      status: "failed",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      outcome: {},
      error: null,
    };
    steps.push(record);
    try {
      const value = await test.step(name, () => body(record.outcome));
      record.status = "passed";
      return value;
    } catch (err) {
      record.error = redactor.text(err instanceof Error ? err.message : err);
      throw err;
    } finally {
      record.finishedAt = new Date().toISOString();
    }
  }

  function skipped(name: string, reason: string): void {
    const now = new Date().toISOString();
    steps.push({
      name,
      status: "skipped",
      startedAt: now,
      finishedAt: now,
      outcome: { reason },
      error: null,
    });
  }

  async function screenshot(target: Page, name: string): Promise<void> {
    const file = `screenshots/${name}.png`;
    if (await pageShowsFullCardNumber(target)) {
      screenshots.push(
        `${file} (withheld: full card number or unreadable frame)`,
      );
      return;
    }
    await target.screenshot({
      path: path.join(EVIDENCE_DIR, file),
      fullPage: true,
      mask: [
        target.locator("input"),
        target.locator("iframe"),
        target.locator("select"),
      ],
      maskColor: "#000000",
    });
    screenshots.push(file);
  }

  const harness = await startHarness(provider.serverType, {
    apiOrigin: ctx.apiOrigin,
  });

  let bindCardId: string | null = null;
  let paymentMethodId: string | null = null;
  let bindOperationKey: string | null = null;
  let threeDPerformed = false;
  let callbackVerifiedByController = false;
  let bindingIdempotencyVerified = false;
  let productOrderId: string | null = null;
  let productPaymentId: string | null = null;
  let bookingIdempotencyVerified = false;
  let unsettledDeleteBlocked409 = false;
  let captureCompleted = false;
  let captureIdempotencyVerified = false;
  let ledgerSingleEntryVerified = false;
  let receiptVerified = false;
  let refundRecorded = false;
  let refundControllerStatus: number | null = null;
  let refundRecordStatus: string | null = null;
  let unbound: boolean | null = null;
  let unboundViaController = false;

  // Never let the browser reach a real DRTS origin; the OrderResultURL
  // navigation is captured locally below and forwarded unmodified to the
  // mounted NestJS PaymentMethodController.
  await page.route(/^https:\/\/[^/]*smarttransport\.tw\//, (route) =>
    route.abort("blockedbyclient"),
  );

  try {
    const sessionMount: HarnessSessionMountResult = await step(
      "01_create_binding_session",
      async (outcome) => {
        await page.goto(harness.origin);
        await page.waitForFunction(
          () =>
            (
              window as unknown as {
                __drtsHarness?: { sdkLoaded(): boolean };
              }
            ).__drtsHarness?.sdkLoaded() === true,
          undefined,
          { timeout: 30_000 },
        );
        const mounted = await page.evaluate(
          (token) =>
            (
              window as unknown as {
                __drtsHarness: {
                  requestSessionAndMount(
                    accessToken: string,
                  ): Promise<HarnessSessionMountResult>;
                };
              }
            ).__drtsHarness.requestSessionAndMount(token),
          ctx.accessToken,
        );
        redactor.add(mounted.merchantToken);
        outcome.controllerEndpoint =
          "GET /api/passenger-app/payment-methods?binding_session=1";
        outcome.httpStatus = mounted.httpStatus;
        outcome.provider = mounted.provider;
        outcome.serverType = mounted.serverType;
        outcome.sandbox = mounted.sandbox;
        outcome.merchantToken_present =
          typeof mounted.merchantToken === "string" &&
          mounted.merchantToken.length > 0;
        outcome.tokenExpireDate = mounted.tokenExpireDate
          ? redactor.text(mounted.tokenExpireDate, 40)
          : null;
        outcome.rawSnakeCaseMerchantTokenPresent =
          mounted.rawSnakeCaseMerchantTokenPresent;
        outcome.rawCamelCaseMerchantTokenPresent =
          mounted.rawCamelCaseMerchantTokenPresent;

        if (
          mounted.rawSnakeCaseMerchantTokenPresent &&
          !mounted.rawCamelCaseMerchantTokenPresent
        ) {
          productFindings.push({
            id: "FINDING-PAX-PAYMENT-CLIENT-BINDING-SESSION-SNAKE-CASE",
            component:
              "packages/passenger-client/src/payment/client.ts :: PassengerPaymentClient.getBindingSession",
            normalUseCase:
              "Native passenger app or direct API consumer calling GET /api/passenger-app/payment-methods?binding_session=1 against NestJS SnakeCaseInterceptor",
            symptom:
              "PassengerPaymentClient.getBindingSession reads data.merchantToken / data.serverType directly without snake_case fallback and throws 502 invalid_payment_response when the API returns merchant_token / server_type",
            rootCause:
              "getBindingSession did not use the field(data, 'merchantToken', 'merchant_token') helper used by decodePassengerPaymentMethod and decodeMethodResponse in the same file",
            recommendedFixScope:
              "packages/passenger-client/src/payment/client.ts",
          });
        }

        expect(mounted.httpStatus).toBe(200);
        expect(mounted.merchantToken_present).toBe(true);
        return mounted;
      },
    );

    await step("02_mount_web_js_sdk", async (outcome) => {
      outcome.mount = sessionMount.mountResult;
      expect(sessionMount.mountResult).toBe("ready");
      await screenshot(page, "01-sdk-mounted-empty");
    });

    await step("03_enter_stage_card_in_ecpay_iframe", async (outcome) => {
      const filled = await fillStageCard(page, redactor);
      outcome.frameHost = filled.frameHost;
      outcome.layout = filled.layout;
      outcome.card_last4 = STAGE_TEST_CARD.last4;
      outcome.holderNameFilled = filled.holderNameFilled;
      await screenshot(page, "02-card-entered-masked");
    });

    let orderResultBody: string | null = null;
    let orderResultMethod: string | null = null;
    let orderResultUrlCaptured: string | null = null;
    await page.route(ORDER_RESULT_PATH, async (route) => {
      const request = route.request();
      orderResultMethod = request.method();
      orderResultUrlCaptured = request.url();
      orderResultBody =
        request.postData() ?? new URL(request.url()).search.replace(/^\?/, "");
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><title>order result captured</title><p id=done>OrderResultURL captured by the hosted-runner harness and forwarded to PaymentMethodController.</p>",
      });
    });

    const bindFlow: HarnessBindFlowResult = await step(
      "04_get_bind_card_pay_token",
      async (outcome) => {
        await page.locator("#drts-bind-card-btn").click();
        const flow = await expect
          .poll(
            () =>
              page.evaluate(() =>
                (
                  window as unknown as {
                    __drtsHarness: {
                      awaitLastBindFlow(): Promise<HarnessBindFlowResult | null>;
                    };
                  }
                ).__drtsHarness.awaitLastBindFlow(),
              ),
            { timeout: 60_000, intervals: [500] },
          )
          .toBeTruthy()
          .then(() =>
            page.evaluate(() =>
              (
                window as unknown as {
                  __drtsHarness: {
                    awaitLastBindFlow(): Promise<HarnessBindFlowResult>;
                  };
                }
              ).__drtsHarness.awaitLastBindFlow(),
            ),
          );

        const result = flow.payTokenResult;
        redactor.add(result.payToken);
        redactor.add(result.merchantTradeNo);
        outcome.triggeredByButton = "綁定卡片 (#drts-bind-card-btn)";
        outcome.rtnCode = result.rtnCode;
        outcome.rtnMsg = result.rtnMsg ? redactor.text(result.rtnMsg) : null;
        outcome.sdkError = result.errorMessage
          ? redactor.text(result.errorMessage)
          : null;
        outcome.payToken_length = result.payToken?.length ?? 0;
        if (result.merchantTradeNo)
          outcome.merchantTradeNo_sha12 = digest12(result.merchantTradeNo);
        const accepted = acceptedPayToken(result);
        outcome.accepted = accepted !== null;
        if (!accepted) throw new Error("ecpay_pay_token_not_accepted");
        return flow;
      },
    );

    await step("05_create_bind_card", async (outcome) => {
      outcome.controllerEndpoint = "POST /api/passenger-app/payment-methods";
      outcome.httpStatus = bindFlow.bindHttpStatus;
      const bindResp = bindFlow.bindResponse;
      const status = bindResp?.status ?? null;
      const actionUrl =
        bindResp?.next_action_url ?? bindResp?.nextActionUrl ?? null;
      const opKey = bindResp?.operation_key ?? bindResp?.operationKey ?? null;
      bindOperationKey = opKey;
      outcome.status = status;
      outcome.operationKey_present =
        typeof opKey === "string" && opKey.length > 0;

      if (actionUrl) {
        redactor.add(actionUrl);
        const threeDHost = new URL(actionUrl).host;
        const threeDOrigin = new URL(actionUrl).origin;
        outcome.threeDUrl_host = threeDHost;
        const originAllowedByDefault =
          sessionMount.approvedActionOrigins.includes(threeDOrigin);
        outcome.threeDOrigin_in_default_approvedActionOrigins =
          originAllowedByDefault;
        if (!originAllowedByDefault) {
          productFindings.push({
            id: "FINDING-ECPAY-3DS-CC-STAGE-ORIGIN-ALLOWLIST",
            component:
              "apps/api/src/modules/passenger-app/payment/ecpay-payment-provider.ts & apps/passenger-app-web/components/payment/ecpay-csp.js",
            normalUseCase:
              "Passenger clicking '綁定卡片' and '前往付款商安全驗證' on Web/Native when ECPay Stage CreateBindCard returns ThreeDURL on https://cc-stage.ecpay.com.tw",
            symptom:
              "approvedPaymentActionUrl rejects https://cc-stage.ecpay.com.tw/... unless NEXT_PUBLIC_PAYMENT_3DS_ORIGINS is explicitly configured to include https://cc-stage.ecpay.com.tw",
            rootCause:
              "approvedActionOrigins in EcpayPaymentProvider and ECPAY_ACTION_ORIGINS in ecpay-csp.js list ecpg-stage.ecpay.com.tw and payment-stage.ecpay.com.tw but omit cc-stage.ecpay.com.tw (and cc.ecpay.com.tw)",
            recommendedFixScope:
              "apps/api/src/modules/passenger-app/payment/ecpay-payment-provider.ts, apps/passenger-app-web/components/payment/ecpay-csp.js",
          });
        }
      }

      const dbAfterCreateBind = await ctx.inspectDatabaseState();
      const bindJournal = dbAfterCreateBind.idempotencyKeys.find(
        (row) => row.operation === "bind",
      );
      outcome.db_bind_journal_outcome = bindJournal?.outcome ?? null;
      outcome.db_psp_tokens_count_before_3ds =
        dbAfterCreateBind.pspTokens.length;

      expect(bindFlow.bindHttpStatus).toBe(201);
      expect(status).toBe("action_required");
      expect(bindJournal?.outcome).toBe("action_required");
      expect(dbAfterCreateBind.pspTokens).toHaveLength(0);
      if (!actionUrl) throw new Error("missing_three_d_action_url");
      return actionUrl;
    });

    await step("06_three_d_verification", async (outcome) => {
      const verifyLink = page.locator("#drts-3ds-verify-link");
      await expect(verifyLink).toBeVisible();
      outcome.triggeredByLink = "前往付款商安全驗證 (#drts-3ds-verify-link)";
      await verifyLink.click();
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      await page.waitForLoadState("load").catch(() => undefined);
      await screenshot(page, "03-three-d-page");

      const entered = await completeStageThreeD(page, redactor);
      outcome.otpFrameHost = entered.frameHost;
      outcome.sentOtpRequest = entered.sentOtpRequest;
      await expect
        .poll(() => orderResultBody !== null, {
          timeout: 120_000,
          intervals: [1_000],
        })
        .toBe(true);
      await screenshot(page, "04-order-result-captured");
      outcome.orderResultMethod = orderResultMethod;
      threeDPerformed = true;

      for (const [key, value] of Object.entries(
        describeCallbackBodyShape(orderResultBody!),
      ))
        outcome[key] = value;
      for (const [key, value] of Object.entries(
        diagnoseEnvelopeVerification({
          raw: orderResultBody!,
          merchantId,
          hashKey,
          hashIv,
        }),
      ))
        outcome[key] = value;

      const extracted = extractCallbackBindCardIdAndRegister({
        raw: orderResultBody!,
        merchantId,
        hashKey,
        hashIv,
        redactor,
      });
      if (extracted.bindCardId) {
        bindCardId = extracted.bindCardId;
      }
      if (extracted.merchantMemberId) {
        outcome.merchantMemberId_sha12 = digest12(extracted.merchantMemberId);
        outcome.merchantMemberId_matches =
          extracted.merchantMemberId === merchantMemberId;
      }
      if (extracted.tradeNo) {
        outcome.tradeNo_sha12 = digest12(extracted.tradeNo);
      }
      if (extracted.merchantTradeNo) {
        outcome.merchantTradeNo_sha12 = digest12(extracted.merchantTradeNo);
      }

      // Forward the unmodified OrderResultURL form POST from ECPay Stage's 3DS
      // page to the mounted NestJS PaymentMethodController.
      const controllerResp = await ctx.requestJson<{
        data?: {
          status?: string;
          operation_key?: string;
          method?: {
            payment_method_id?: string;
            psp_name?: string;
            last4?: string;
            card_type?: string;
            expiry_month?: number;
            expiry_year?: number;
            is_default?: boolean;
            status?: string;
          };
        };
      }>("/api/passenger-app/payment-methods/ecpay/order-result", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: orderResultBody!,
      });

      outcome.controllerEndpoint =
        "POST /api/passenger-app/payment-methods/ecpay/order-result";
      outcome.controllerHttpStatus = controllerResp.status;
      const bindData = controllerResp.body?.data;
      outcome.bindStatus = bindData?.status ?? null;
      paymentMethodId = bindData?.method?.payment_method_id ?? null;
      outcome.paymentMethodId = paymentMethodId;
      outcome.card_last4 = bindData?.method?.last4 ?? null;
      outcome.cardType = bindData?.method?.card_type ?? null;
      outcome.isDefault = bindData?.method?.is_default ?? null;

      expect(controllerResp.status).toBe(200);
      expect(bindData?.status).toBe("completed");
      expect(paymentMethodId).toBeTruthy();
      expect(bindData?.method?.last4).toBe(STAGE_TEST_CARD.last4);
      callbackVerifiedByController = true;

      evidence.callbackDelivery = {
        mode: "runner_intercepted_browser_order_result_forwarded_to_mounted_controller",
        explanation:
          "ECPay Stage 3DS page submitted a real form POST to OrderResultURL (/api/passenger-app/payment-methods/ecpay/order-result). Because the GitHub-hosted runner does not terminates public smarttransport.tw DNS, Playwright intercepted the browser navigation and forwarded the unmodified x-www-form-urlencoded body to the mounted NestJS PaymentMethodController.verifyOrderResult endpoint.",
        interceptedMethod: orderResultMethod,
        interceptedPath: orderResultUrlCaptured
          ? new URL(orderResultUrlCaptured).pathname
          : null,
        forwardedControllerEndpoint:
          "POST /api/passenger-app/payment-methods/ecpay/order-result",
        forwardedControllerHttpStatus: controllerResp.status,
        fabricatedCallbackUsed: false,
      };
    });

    await step("06b_cancel_binding_authorization", async (outcome) => {
      // PaymentMethodService.verifyNotification automatically invokes
      // provider.cancelBindingAuthorization (/Credit/DoAction Action=N) during
      // step 06_three_d_verification. Inspect the recorded call.
      const cancelCall = calls.find(
        (c) =>
          c.step === "06_three_d_verification" &&
          c.endpoint.endsWith("/Credit/DoAction"),
      );
      outcome.invokedBy = "PaymentMethodService.verifyNotification";
      outcome.attempted = cancelCall !== undefined;
      outcome.httpStatus = cancelCall?.httpStatus ?? null;
      outcome.transCode = cancelCall?.transCode ?? null;
      outcome.rtnCode = cancelCall?.rtnCode ?? null;
      outcome.rtnMsg = cancelCall?.rtnMsg ?? null;
      expect(cancelCall).toBeDefined();
    });

    await step("07_bound_card_masked", async (outcome) => {
      const listResp = await ctx.requestJson<{
        data?: {
          methods?: Array<{
            payment_method_id: string;
            psp_name: string;
            last4: string;
            card_type: string;
            expiry_month: number;
            expiry_year: number;
            is_default: boolean;
            status: string;
          }>;
        };
      }>("/api/passenger-app/payment-methods", {
        method: "GET",
        headers: {
          authorization: `Bearer ${ctx.accessToken}`,
          accept: "application/json",
        },
      });
      expect(listResp.status).toBe(200);
      const methods = listResp.body?.data?.methods ?? [];
      expect(methods).toHaveLength(1);
      const listed = methods[0]!;
      expect(listed.payment_method_id).toBe(paymentMethodId);
      expect(listed.last4).toBe(STAGE_TEST_CARD.last4);
      expect(listed.is_default).toBe(true);
      expect(listed.status).toBe("active");

      const dbState = await ctx.inspectDatabaseState(null, paymentMethodId);
      expect(dbState.pspTokens).toHaveLength(1);
      const tokenRow = dbState.pspTokens[0]!;
      expect(tokenRow.token_envelope).toBeTruthy();
      const serializedEnvelope =
        typeof tokenRow.token_envelope === "string"
          ? tokenRow.token_envelope
          : JSON.stringify(tokenRow.token_envelope);
      expect(serializedEnvelope).not.toContain(bindCardId ?? "MISSING");

      const parsedEnvelope =
        typeof tokenRow.token_envelope === "string"
          ? JSON.parse(tokenRow.token_envelope)
          : tokenRow.token_envelope!;
      const decryptedBindCardId = cipher.decrypt(
        parsedEnvelope,
        ctx.passengerId,
        paymentMethodId!,
      );
      redactor.add(decryptedBindCardId);
      if (!bindCardId) bindCardId = decryptedBindCardId;

      outcome.paymentMethodId = paymentMethodId;
      outcome.bindCardId_sha12 = digest12(decryptedBindCardId);
      outcome.card_last4 = listed.last4;
      outcome.cardType = listed.card_type;
      outcome.expiry = `${listed.expiry_month}/${listed.expiry_year}`;
      outcome.isDefault = listed.is_default;
      outcome.last4_matches_test_card = listed.last4 === STAGE_TEST_CARD.last4;
      outcome.cipher_roundtrip = decryptedBindCardId === bindCardId;
      expect(outcome.cipher_roundtrip).toBe(true);

      // Idempotency checks on binding callback / return endpoints:
      // 1) Replay POST /api/passenger-app/payment-methods/ecpay/order-result
      const replayOrderResult = await ctx.requestJson<{
        data?: {
          status?: string;
          method?: { payment_method_id?: string };
        };
      }>("/api/passenger-app/payment-methods/ecpay/order-result", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: orderResultBody!,
      });
      expect(replayOrderResult.status).toBe(200);
      expect(replayOrderResult.body?.data?.status).toBe("completed");
      expect(replayOrderResult.body?.data?.method?.payment_method_id).toBe(
        paymentMethodId,
      );

      // 2) Replay POST /api/passenger-app/payment-methods/ecpay/callback -> "1|OK"
      const replayServerCallback = await ctx.requestRaw(
        "/api/passenger-app/payment-methods/ecpay/callback",
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          body: orderResultBody!,
        },
      );
      expect(replayServerCallback.status).toBe(200);
      expect(replayServerCallback.text).toBe("1|OK");

      // 3) Replay POST /api/passenger-app/payment-methods/3ds-complete with passenger JWT
      const replay3dsComplete = await ctx.requestJson<{
        data?: {
          status?: string;
          method?: { payment_method_id?: string };
        };
      }>("/api/passenger-app/payment-methods/3ds-complete", {
        method: "POST",
        headers: {
          authorization: `Bearer ${ctx.accessToken}`,
          "content-type": "application/json",
          ...(bindOperationKey ? { "Idempotency-Key": bindOperationKey } : {}),
          accept: "application/json",
        },
        body: JSON.stringify({
          envelope: orderResultBody!,
          ...(bindOperationKey ? { idempotencyKey: bindOperationKey } : {}),
        }),
      });
      expect(replay3dsComplete.status).toBe(201);
      expect(replay3dsComplete.body?.data?.method?.payment_method_id).toBe(
        paymentMethodId,
      );

      const dbAfterReplay = await ctx.inspectDatabaseState();
      expect(dbAfterReplay.pspTokens).toHaveLength(1);
      bindingIdempotencyVerified = true;
      outcome.bindingCallbackReplayIdempotent = true;
      outcome.pspTokensRowCountAfterReplay = dbAfterReplay.pspTokens.length;
    });

    await step("08_capture_with_card_id", async (outcome) => {
      // 1. Create a real fare quote and book the product ride with the bound paymentMethodId
      const quote = await ctx.createQuote();
      const bookingRequestId = `stage-ride-book:${runKey}`;
      const bookingPayload = {
        origin: quote.origin,
        destination: quote.destination,
        scheduledAt: quote.scheduledAt,
        fareSnapshotId: quote.fareSnapshotId,
        paymentMethodId,
        passengerConfirmedAt: new Date(Date.now() - 1_000).toISOString(),
      };
      const createRideResp = await ctx.requestJson<{
        data?: {
          ride?: {
            order?: {
              order_id?: string;
            };
          };
        };
      }>("/api/passenger-app/rides", {
        method: "POST",
        headers: {
          authorization: `Bearer ${ctx.accessToken}`,
          "content-type": "application/json",
          "x-request-id": bookingRequestId,
          accept: "application/json",
        },
        body: JSON.stringify(bookingPayload),
      });
      expect(createRideResp.status).toBe(201);
      const orderId = createRideResp.body?.data?.ride?.order?.order_id ?? null;
      expect(orderId).toBeTruthy();
      productOrderId = orderId;
      outcome.orderId = orderId;

      // 2. Booking idempotency replay with the same x-request-id returns the exact same orderId
      const replayRideResp = await ctx.requestJson<{
        data?: {
          ride?: {
            order?: {
              order_id?: string;
            };
          };
        };
      }>("/api/passenger-app/rides", {
        method: "POST",
        headers: {
          authorization: `Bearer ${ctx.accessToken}`,
          "content-type": "application/json",
          "x-request-id": bookingRequestId,
          accept: "application/json",
        },
        body: JSON.stringify(bookingPayload),
      });
      expect(replayRideResp.status).toBe(201);
      expect(replayRideResp.body?.data?.ride?.order?.order_id).toBe(orderId);
      const dbAfterBookingReplay = await ctx.inspectDatabaseState(orderId);
      expect(dbAfterBookingReplay.bookingHistories).toHaveLength(1);
      expect(dbAfterBookingReplay.ownedOrders).toHaveLength(1);
      outcome.orderPaymentMethodId =
        dbAfterBookingReplay.ownedOrders[0]?.payment_method_token_ref ?? null;
      expect(outcome.orderPaymentMethodId).toBe(paymentMethodId);
      bookingIdempotencyVerified = true;
      outcome.bookingReplayIdempotent = true;

      // 3. Attempting to remove the bound card while the order is active/unsettled is blocked with 409 pending_payment_block
      const unsettledDeleteResp = await ctx.requestJson<{
        error?: { code?: string };
      }>(`/api/passenger-app/payment-methods/${paymentMethodId}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${ctx.accessToken}`,
          accept: "application/json",
        },
      });
      expect(unsettledDeleteResp.status).toBe(409);
      expect(unsettledDeleteResp.body?.error?.code).toBe(
        "pending_payment_block",
      );
      unsettledDeleteBlocked409 = true;
      outcome.unsettledCardDeleteBlocked409 = true;

      // 4. Complete the driver task for this product order (NT$85 / 8500 minor units).
      // This writes ops.driver_completion_outbox ('multi_taxi_certificate') and triggers:
      // - CertificateSupportService.writeCompletedTrip(event)
      // - PaymentChargeService.onTripCompleted(event) -> EcpayPaymentProvider.capture (/Merchant/CreatePaymentWithCardID)
      const callsBeforeCapture = calls.length;
      const completedTrip = await ctx.completeProductOrder(
        orderId!,
        CHARGE_AMOUNT_MINOR,
      );
      const callsAfterCapture = calls.length;
      outcome.outboxStatus = completedTrip.outboxStatus;
      outcome.outboxAttempts = completedTrip.outboxAttempts;
      expect(completedTrip.outboxStatus).toBe("delivered");
      expect(callsAfterCapture - callsBeforeCapture).toBe(1);

      // 5. Inspect dual ledger (passenger.payment_charge_records + billing.multi_taxi_passenger_payments)
      const dbAfterCapture = await ctx.inspectDatabaseState(
        orderId,
        paymentMethodId,
      );
      expect(dbAfterCapture.chargeRecords).toHaveLength(1);
      expect(dbAfterCapture.billingPayments).toHaveLength(1);
      const chargeRow = dbAfterCapture.chargeRecords[0]!;
      const billingRow = dbAfterCapture.billingPayments[0]!;
      productPaymentId = chargeRow.payment_id;

      expect(chargeRow.order_id).toBe(orderId);
      expect(chargeRow.payment_id).toBe(`pax-payment:${orderId}`);
      expect(chargeRow.drts_passenger_id).toBe(ctx.passengerId);
      expect(chargeRow.payment_method_id).toBe(paymentMethodId);
      expect(chargeRow.status).toBe("captured");
      expect(chargeRow.attempt_count).toBe(1);
      expect(chargeRow.amount_minor).toBe(CHARGE_AMOUNT_MINOR);
      expect(chargeRow.currency).toBe("TWD");
      expect(chargeRow.provider_capture_ref).toBeTruthy();

      expect(billingRow.order_id).toBe(orderId);
      expect(billingRow.payment_id).toBe(chargeRow.payment_id);
      expect(billingRow.status).toBe("captured");
      expect(billingRow.amount_minor).toBe(CHARGE_AMOUNT_MINOR);
      expect(billingRow.currency).toBe("TWD");
      expect(billingRow.provider_payment_ref).toBe(
        chargeRow.provider_capture_ref,
      );

      const [captureMtn, ...captureTradeRest] = (
        chargeRow.provider_capture_ref ?? ""
      ).split(":");
      const captureTradeNo = captureTradeRest.join(":");
      redactor.add(captureMtn);
      redactor.add(captureTradeNo);
      redactor.add(chargeRow.provider_capture_ref);

      const captureJournal = dbAfterCapture.idempotencyKeys.find(
        (row) =>
          row.operation === "capture" &&
          row.idempotency_key === `pax:capture:${orderId}`,
      );
      expect(captureJournal?.outcome).toBe("completed");

      // 6. Capture idempotency: re-running onTripCompleted and processOrder must make 0 extra ECPay calls and keep 1 ledger entry with attempt_count = 1
      const ecpayCallsBeforeReplay = calls.length;
      const outboxPayload = await ctx.pg.pool!.query<{
        payload: {
          event: Parameters<typeof ctx.pg.chargeService.onTripCompleted>[0];
        };
      }>(
        `SELECT payload FROM ops.driver_completion_outbox
         WHERE order_id = $1 AND effect_type = 'multi_taxi_certificate'`,
        [orderId],
      );
      await ctx.pg.chargeService.onTripCompleted(
        outboxPayload.rows[0]!.payload.event,
      );
      const replayProcessResult = await ctx.pg.chargeService.processOrder(
        orderId!,
      );
      expect(replayProcessResult?.status).toBe("captured");
      expect(calls.length).toBe(ecpayCallsBeforeReplay);

      const dbAfterCaptureReplay = await ctx.inspectDatabaseState(
        orderId,
        paymentMethodId,
      );
      expect(dbAfterCaptureReplay.chargeRecords).toHaveLength(1);
      expect(dbAfterCaptureReplay.billingPayments).toHaveLength(1);
      expect(dbAfterCaptureReplay.chargeRecords[0]!.attempt_count).toBe(1);
      captureIdempotencyVerified = true;
      ledgerSingleEntryVerified = true;
      captureCompleted = true;

      // 7. Verify passenger ride detail & electronic receipt via mounted controllers
      const getRideResp = await ctx.requestJson<{
        data?: {
          ride?: {
            order?: { order_id?: string; status?: string };
            payment?: {
              payment_id?: string;
              order_id?: string;
              status?: string;
              amount_minor?: number;
              currency?: string;
            };
          };
        };
      }>(`/api/passenger-app/rides/${orderId}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${ctx.accessToken}`,
          accept: "application/json",
        },
      });
      expect(getRideResp.status).toBe(200);
      expect(getRideResp.body?.data?.ride?.order?.order_id).toBe(orderId);
      expect(getRideResp.body?.data?.ride?.payment?.payment_id).toBe(
        productPaymentId,
      );
      expect(getRideResp.body?.data?.ride?.payment?.status).toBe("captured");
      expect(getRideResp.body?.data?.ride?.payment?.amount_minor).toBe(
        CHARGE_AMOUNT_MINOR,
      );

      const downloadsResp = await ctx.requestJson<{
        data?: {
          order_id?: string;
          html_download_url?: string;
          pdf_download_url?: string;
        };
      }>(`/api/passenger-app/rides/${orderId}/receipt/downloads`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${ctx.accessToken}`,
          accept: "application/json",
        },
      });
      expect(downloadsResp.status).toBe(200);
      expect(downloadsResp.body?.data?.order_id).toBe(orderId);

      const htmlArtifact = await ctx.requestRaw(
        `/api/passenger-app/rides/${orderId}/receipt/artifacts/html`,
        {
          method: "GET",
          headers: {
            authorization: `Bearer ${ctx.accessToken}`,
          },
        },
      );
      expect(htmlArtifact.status).toBe(200);
      expect(htmlArtifact.text).toContain("VISA ••••2222");
      expect(htmlArtifact.text).toContain("DRTS Stage 測試合作車隊（非正式）");

      const pdfArtifact = await ctx.requestRaw(
        `/api/passenger-app/rides/${orderId}/receipt/artifacts/pdf`,
        {
          method: "GET",
          headers: {
            authorization: `Bearer ${ctx.accessToken}`,
          },
        },
      );
      expect(pdfArtifact.status).toBe(200);
      expect(pdfArtifact.buffer.subarray(0, 8).toString("utf8")).toBe(
        "%PDF-1.7",
      );
      receiptVerified = true;

      outcome.paymentId = productPaymentId;
      outcome.status = chargeRow.status;
      outcome.amountTwd = CHARGE_AMOUNT_TWD;
      outcome.amountMinor = CHARGE_AMOUNT_MINOR;
      outcome.attemptCount = chargeRow.attempt_count;
      outcome.need3D = 0;
      outcome.merchantTradeNo_sha12 = digest12(captureMtn ?? "");
      outcome.tradeNo_sha12 = digest12(captureTradeNo);
      outcome.providerCaptureRef_sha12 = digest12(
        chargeRow.provider_capture_ref!,
      );
      outcome.billingLedgerMatchesChargeRecord = true;
      outcome.captureReplayZeroExtraEcpayCalls = true;
      outcome.receiptHtmlContainsMaskedCard = true;
      outcome.receiptPdfHeader = "%PDF-1.7";

      evidence.productOrder = {
        orderId,
        paymentId: productPaymentId,
        paymentMethodId,
        sameOrderAndPaymentLinked:
          chargeRow.order_id === orderId &&
          billingRow.order_id === orderId &&
          chargeRow.payment_id === `pax-payment:${orderId}` &&
          billingRow.payment_id === `pax-payment:${orderId}`,
        chargeRecordStatus: chargeRow.status,
        chargeRecordAttemptCount: chargeRow.attempt_count,
        chargeRecordAmountMinor: chargeRow.amount_minor,
        billingLedgerStatus: billingRow.status,
        billingLedgerAmountMinor: billingRow.amount_minor,
        chargeRecordsRowCount: dbAfterCaptureReplay.chargeRecords.length,
        billingPaymentsRowCount: dbAfterCaptureReplay.billingPayments.length,
        providerCaptureRef_sha12: digest12(chargeRow.provider_capture_ref!),
        providerCaptureRefMatchesBillingRef:
          chargeRow.provider_capture_ref === billingRow.provider_payment_ref,
        captureIdempotencyKey: `pax:capture:${orderId}`,
        captureIdempotencyOutcome: captureJournal?.outcome ?? null,
        captureReplayZeroExtraPspCalls: true,
        receiptDownloadsHttpStatus: downloadsResp.status,
        receiptHtmlHttpStatus: htmlArtifact.status,
        receiptHtmlPaymentMethodDisplay: "VISA ••••2222",
        receiptPdfHttpStatus: pdfArtifact.status,
        receiptPdfMagicHeader: "%PDF-1.7",
      };
    });

    await step("09_refund_attempt", async (outcome) => {
      const refundResp = await ctx.requestJson<{
        data?: {
          order_id?: string;
          payment_id?: string;
          status?: string;
          provider_refund_ref?: string;
        };
        error?: {
          code?: string;
          message?: string;
        };
      }>(`/api/passenger-app/platform/rides/${productOrderId}/refund`, {
        method: "POST",
        headers: {
          ...PLATFORM_BILLING_HEADERS,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          reason: "PAX-PRODUCT-ORDER-ECPAY-STAGE-20261123 stage refund check",
        }),
      });

      refundControllerStatus = refundResp.status;
      outcome.controllerEndpoint =
        "POST /api/passenger-app/platform/rides/:orderId/refund";
      outcome.controllerHttpStatus = refundResp.status;

      const dbAfterRefund = await ctx.inspectDatabaseState(
        productOrderId,
        paymentMethodId,
      );
      const chargeRow = dbAfterRefund.chargeRecords[0]!;
      const billingRow = dbAfterRefund.billingPayments[0]!;
      const refundJournal = dbAfterRefund.idempotencyKeys.find(
        (row) =>
          row.operation === "refund" &&
          row.idempotency_key === `pax:refund:${productOrderId}`,
      );
      refundRecordStatus = chargeRow.status;

      if (chargeRow.provider_refund_ref) {
        redactor.add(chargeRow.provider_refund_ref);
        outcome.providerRefundRef_sha12 = digest12(
          chargeRow.provider_refund_ref,
        );
      }

      if (refundResp.status === 201) {
        // If Stage completes the refund (e.g., via void/cancel on an unclosed trade),
        // also verify refund idempotency replay via the controller.
        const replayRefund = await ctx.requestJson<{
          data?: { status?: string };
        }>(`/api/passenger-app/platform/rides/${productOrderId}/refund`, {
          method: "POST",
          headers: {
            ...PLATFORM_BILLING_HEADERS,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            reason: "PAX-PRODUCT-ORDER-ECPAY-STAGE-20261123 stage refund check",
          }),
        });
        outcome.refundReplayHttpStatus = replayRefund.status;
      }

      outcome.dbChargeStatusAfterRefund = chargeRow.status;
      outcome.dbBillingStatusAfterRefund = billingRow.status;
      outcome.dbRefundJournalOutcome = refundJournal?.outcome ?? null;
      outcome.errorCode = refundResp.body?.error?.code ?? null;
      refundRecorded = true;
    });
  } finally {
    if (paymentMethodId || bindCardId) {
      try {
        await step("10_unbind_stage_card", async (outcome) => {
          if (paymentMethodId) {
            const deleteResp = await ctx.requestJson<{
              data?: { success?: boolean; removed?: boolean };
            }>(`/api/passenger-app/payment-methods/${paymentMethodId}`, {
              method: "DELETE",
              headers: {
                authorization: `Bearer ${ctx.accessToken}`,
                accept: "application/json",
              },
            });
            outcome.controllerEndpoint =
              "DELETE /api/passenger-app/payment-methods/:id";
            outcome.controllerHttpStatus = deleteResp.status;
            const deletedOk =
              deleteResp.body?.data?.success === true ||
              deleteResp.body?.data?.removed === true;
            outcome.controllerRemoved = deletedOk;

            if (deleteResp.status === 200 && deletedOk) {
              unbound = true;
              unboundViaController = true;
              const dbAfterDelete = await ctx.inspectDatabaseState(
                productOrderId,
                paymentMethodId,
              );
              const removedTokenRow = dbAfterDelete.pspTokens[0];
              outcome.dbTokenStatus = removedTokenRow?.status ?? null;
              outcome.dbTokenEnvelopeCleared =
                removedTokenRow?.token_envelope === null;
              outcome.orderHistoryPreserved =
                dbAfterDelete.bookingHistories.length === 1;
              outcome.ledgerHistoryPreserved =
                dbAfterDelete.chargeRecords.length === 1 &&
                dbAfterDelete.billingPayments.length === 1;
              expect(removedTokenRow?.status).toBe("removed");
              expect(removedTokenRow?.token_envelope).toBeNull();
            }
          }

          if (!unbound && bindCardId) {
            unbound = await provider.unbind(bindCardId, {
              passengerId: ctx.passengerId,
            });
            outcome.fallbackDirectUnbind = unbound;
          }
          outcome.unbound = unbound;
          if (bindCardId) outcome.bindCardId_sha12 = digest12(bindCardId);
          if (!unbound)
            throw new Error("delete_member_bind_card_not_confirmed");
        });
      } catch {
        // recorded in the step; final acceptance below fails the test
      }
    } else {
      skipped("10_unbind_stage_card", "no BindCardID was issued in this run");
    }

    await harness.close();
    await ctx.close();

    const refundCalls = calls.filter((c) => c.step === "09_refund_attempt");
    const doActionCalls = refundCalls.filter((c) =>
      c.endpoint.endsWith("/Credit/DoAction"),
    );
    const queryTradeCall = refundCalls.find((c) =>
      c.endpoint.endsWith("/CreditDetail/QueryTrade"),
    );
    evidence.refund = {
      controllerEndpoint:
        "POST /api/passenger-app/platform/rides/:orderId/refund",
      controllerHttpStatus: refundControllerStatus,
      postRefundDbStatus: refundRecordStatus,
      queryTradeHttp: queryTradeCall?.httpStatus ?? null,
      queryTradeRtnCode: queryTradeCall?.rtnCode ?? null,
      queryTradeCloseStatus:
        (queryTradeCall?.fields.closeStatus as string | null) ?? null,
      queryTradeTradeStatus:
        (queryTradeCall?.fields.tradeStatus as string | null) ?? null,
      doActionAttempted: doActionCalls.length > 0,
      doActionHttp: doActionCalls.at(-1)?.httpStatus ?? null,
      doActionRtnCode: doActionCalls.at(-1)?.rtnCode ?? null,
      classification: !refundRecorded
        ? "not_attempted"
        : refundRecordStatus === "refunded"
          ? "stage_refund_succeeded_via_product_controller"
          : "stage_refund_not_supported_or_unconfirmed_in_stage — actual Stage result preserved; full CloseStatus/DoAction refund branches covered in simulated unit/PG suites",
      simulatedCoverage:
        "tests/unit/pax-payment-core-20261009/ecpay-payment-provider.test.ts (QueryTrade CloseStatus -> DoAction R/N -> R+N fallback) & tests/unit/pax-payment-core-20261009/refund-workflow.test.ts + tests/unit/pax-qa-20261009/payment.postgres.test.ts (PaymentRefundService idempotency, unknown readback, and billing.multi_taxi_passenger_payments state transitions)",
    };

    const hostedSameProductOrderSatisfied =
      bindCardId !== null &&
      paymentMethodId !== null &&
      threeDPerformed &&
      callbackVerifiedByController &&
      bindingIdempotencyVerified &&
      productOrderId !== null &&
      productPaymentId === `pax-payment:${productOrderId}` &&
      bookingIdempotencyVerified &&
      unsettledDeleteBlocked409 &&
      captureCompleted &&
      captureIdempotencyVerified &&
      ledgerSingleEntryVerified &&
      receiptVerified &&
      refundRecorded &&
      unbound === true &&
      unboundViaController;

    evidence.acceptance = {
      bind_completed: bindCardId !== null && paymentMethodId !== null,
      three_d_performed: threeDPerformed,
      callback_verified_by_product_controller: callbackVerifiedByController,
      binding_idempotency_verified: bindingIdempotencyVerified,
      same_product_order_created: productOrderId !== null,
      booking_idempotency_verified: bookingIdempotencyVerified,
      unsettled_card_delete_blocked_409: unsettledDeleteBlocked409,
      capture_completed: captureCompleted,
      capture_idempotency_verified: captureIdempotencyVerified,
      dual_ledger_single_entry_verified: ledgerSingleEntryVerified,
      electronic_receipt_verified: receiptVerified,
      refund_recorded: refundRecorded,
      stage_card_unbound: unbound,
      stage_card_unbound_via_product_controller: unboundViaController,
      hosted_same_product_order_stage_binding_capture_and_ledger:
        hostedSameProductOrderSatisfied,
      satisfied: hostedSameProductOrderSatisfied,
    };
    evidence.finishedAt = new Date().toISOString();
    writeEvidence(redactor, evidence);
  }

  expect(
    evidence.acceptance
      .hosted_same_product_order_stage_binding_capture_and_ledger,
    "see evidence.json / summary.md",
  ).toBe(true);
  expect(evidence.acceptance.satisfied, "see evidence.json / summary.md").toBe(
    true,
  );
});

/** Values of the {activeKeyId, keys:{id: base64}} ring, for masking only. */
function safeKeyRingValues(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw) as { keys?: Record<string, unknown> };
    const out: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed.keys ?? {})) {
      if (typeof value === "string") out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

// Masks emitted early so even Playwright's own failure output stays clean.
maskInLog(STAGE_TEST_CARD.number);
