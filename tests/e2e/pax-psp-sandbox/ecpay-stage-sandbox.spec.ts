/**
 * PAX-PSP-SANDBOX-EVIDENCE-20261101 — real ECPay Stage evidence for the merged
 * EcpayPaymentProvider (PAX-PSP-ADAPTER-20261009, acceptance key
 * pax-psp_adapter_sandbox_verified).
 *
 * Runs only in .github/workflows/psp-sandbox-acceptance.yml on a GitHub-hosted
 * runner with the existing drts-dev-psp-* Secret Manager values. It refuses to
 * run without PSP_SANDBOX=true. All ECPay calls go through the merged adapter
 * built by the merged paymentRuntimeFromEnv; this file never builds an ECPay
 * request itself.
 *
 * Flow: createBindingSession (GetTokenbyBindingCard) → WEB JS SDK iframe card
 * entry (Stage test card) → getBindCardPayToken → bind (CreateBindCard) → 3D
 * page with Stage OTP → OrderResultURL ResultData → verifyNotification →
 * BindCardID → capture NT$85 (CreatePaymentWithCardID, Need3D=0) → refund()
 * (recorded as-is; Stage is documented not to provide Credit/DoAction) →
 * unbind (DeleteMemberBindCard) always, when a BindCardID was obtained.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  ECPAY_STAGE_BASE_URL,
  EcpayPaymentProvider,
  type VerifiedEcpayNotification,
} from "../../../apps/api/src/modules/passenger-app/payment/ecpay-payment-provider";
import type {
  BindResult,
  MoneyResult,
} from "../../../apps/api/src/modules/passenger-app/payment/payment-provider.port";
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
  digest12,
  maskInLog,
  writeEvidence,
  type EcpayCallRecord,
  type SandboxEvidence,
  type StepRecord,
} from "./evidence";
import {
  acceptedPayToken,
  startHarness,
  type HarnessPayTokenResult,
} from "./harness";

const CHARGE_AMOUNT_TWD = 85;
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

test("ECPay Stage: bind with 3D, charge NT$85, refund as observed, unbind", async ({
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
  // An account-style identifier (never phone/email/operation key), unique per run.
  const passengerId = `psp-sandbox-acct-${runKey}`;

  const calls: EcpayCallRecord[] = [];
  const steps: StepRecord[] = [];
  const screenshots: string[] = [];
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
  const merchantMemberId = provider.deriveMerchantMemberId(passengerId);
  redactor.add(merchantMemberId);

  const evidence: SandboxEvidence = {
    schema: EVIDENCE_SCHEMA,
    taskId: "PAX-PSP-SANDBOX-EVIDENCE-20261101",
    acceptanceKey: "pax-psp_sandbox_bind_and_charge_evidence",
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
      merchantMemberId_sha12: digest12(merchantMemberId),
      testCard_last4: STAGE_TEST_CARD.last4,
      chargeAmountTwd: CHARGE_AMOUNT_TWD,
    },
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
      // Every input and every iframe is blacked out: typed card data, CVV and
      // OTP never appear in an image even if a frame cannot be inspected.
      mask: [
        target.locator("input"),
        target.locator("iframe"),
        target.locator("select"),
      ],
      maskColor: "#000000",
    });
    screenshots.push(file);
  }

  const harness = await startHarness(provider.serverType);
  let bindCardId: string | null = null;
  let threeDPerformed = false;
  let capture: MoneyResult | null = null;
  let refund: MoneyResult | null = null;
  let unbound: boolean | null = null;

  // Never let the browser reach a real DRTS origin; the OrderResultURL
  // navigation is captured locally below and fulfilled by the test.
  await page.route(/^https:\/\/[^/]*smarttransport\.tw\//, (route) =>
    route.abort("blockedbyclient"),
  );

  try {
    const session = await step("01_create_binding_session", async (outcome) => {
      const created = await provider.createBindingSession(passengerId, {
        email: SYNTHETIC_EMAIL,
        idempotencyKey: `psp-sandbox:bind-session:${runKey}`,
      });
      redactor.add(created.merchantToken);
      outcome.provider = created.provider;
      outcome.serverType = created.serverType;
      outcome.sandbox = created.sandbox;
      outcome.merchantToken_present = created.merchantToken.length > 0;
      outcome.tokenExpireDate = redactor.text(created.tokenExpireDate, 40);
      return created;
    });

    await step("02_mount_web_js_sdk", async (outcome) => {
      await page.goto(harness.origin);
      await page.waitForFunction(
        () =>
          (
            window as unknown as { __drtsHarness?: { sdkLoaded(): boolean } }
          ).__drtsHarness?.sdkLoaded() === true,
        undefined,
        { timeout: 30_000 },
      );
      outcome.mount = await page.evaluate(
        ([token, serverType]) =>
          (
            window as unknown as {
              __drtsHarness: { mount(t: string, s: string): Promise<string> };
            }
          ).__drtsHarness.mount(token, serverType),
        [session.merchantToken, session.serverType] as const,
      );
      await screenshot(page, "01-sdk-mounted-empty");
    });

    await step("03_enter_stage_card_in_ecpay_iframe", async (outcome) => {
      const filled = await fillStageCard(page, redactor);
      outcome.frameHost = filled.frameHost;
      outcome.layout = filled.layout;
      outcome.card_last4 = STAGE_TEST_CARD.last4;
      await screenshot(page, "02-card-entered-masked");
    });

    const payToken = await step(
      "04_get_bind_card_pay_token",
      async (outcome) => {
        const result = await page.evaluate(() =>
          (
            window as unknown as {
              __drtsHarness: { getPayToken(): Promise<HarnessPayTokenResult> };
            }
          ).__drtsHarness.getPayToken(),
        );
        redactor.add(result.payToken);
        redactor.add(result.merchantTradeNo);
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
        return accepted;
      },
    );

    let orderResultBody: string | null = null;
    let orderResultMethod: string | null = null;
    await page.route(ORDER_RESULT_PATH, async (route) => {
      const request = route.request();
      orderResultMethod = request.method();
      orderResultBody =
        request.postData() ?? new URL(request.url()).search.replace(/^\?/, "");
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><title>order result captured</title><p id=done>OrderResultURL captured by the hosted-runner harness.</p>",
      });
    });

    const bindResult: BindResult = await step(
      "05_create_bind_card",
      async (outcome) => {
        const result = await provider.bind(
          payToken,
          `psp-sandbox:bind:${runKey}`,
          { passengerId },
        );
        outcome.status = result.status;
        if (result.status === "failed") outcome.error = result.error;
        if (result.status === "action_required") {
          redactor.add(result.nextActionUrl);
          outcome.threeDUrl_host = new URL(result.nextActionUrl).host;
        }
        if (result.status === "completed") redactor.add(result.card.token);
        if (result.status === "failed" || result.status === "pending")
          throw new Error(`create_bind_card_${result.status}`);
        return result;
      },
    );

    let completedBind: Extract<BindResult, { status: "completed" }>;
    let bindNotification: VerifiedEcpayNotification | null = null;
    if (bindResult.status === "action_required") {
      completedBind = await step("06_three_d_verification", async (outcome) => {
        await page.goto(bindResult.nextActionUrl, {
          waitUntil: "domcontentloaded",
        });
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

        const notification = provider.verifyNotification(orderResultBody!);
        outcome.verified = true;
        outcome.kind = notification.kind;
        outcome.rtnCode = notification.rtnCode;
        outcome.rtnMsg = redactor.text(notification.rtnMsg);
        if (notification.merchantMemberId)
          outcome.merchantMemberId_sha12 = digest12(
            notification.merchantMemberId,
          );
        outcome.merchantMemberId_matches =
          notification.merchantMemberId === merchantMemberId;
        if (notification.tradeNo)
          outcome.tradeNo_sha12 = digest12(notification.tradeNo);
        if (notification.merchantTradeNo)
          outcome.merchantTradeNo_sha12 = digest12(
            notification.merchantTradeNo,
          );
        const result = notification.bindResult;
        outcome.bindStatus = result?.status ?? null;
        if (notification.kind !== "bind" || result?.status !== "completed") {
          throw new Error(
            `three_d_bind_not_completed:${result?.status ?? "none"}`,
          );
        }
        redactor.add(result.card.token);
        redactor.add(notification.tradeNo);
        redactor.add(notification.merchantTradeNo);
        bindNotification = notification;
        return result;
      });
      // Mirrors PaymentMethodService.verifyNotification after a 3D binding:
      // void the binding verification authorization. Stage is documented not
      // to provide Credit/DoAction, so the outcome is recorded, not gated.
      // Assigned inside the step callback; TS cannot see that assignment.
      const notification = bindNotification as VerifiedEcpayNotification | null;
      if (notification) {
        await step("06b_cancel_binding_authorization", async (outcome) => {
          const amountMinor = notification.authorizedAmountMinor ?? 0;
          outcome.authorizedAmountTwd = amountMinor / 100;
          if (
            !notification.merchantTradeNo ||
            !notification.tradeNo ||
            amountMinor <= 0
          ) {
            outcome.attempted = false;
            outcome.reason = "missing_trade_identifiers_or_amount";
            return;
          }
          outcome.attempted = true;
          outcome.cancelled = await provider.cancelBindingAuthorization({
            merchantTradeNo: notification.merchantTradeNo,
            tradeNo: notification.tradeNo,
            amountMinor,
          });
        });
      }
    } else {
      skipped(
        "06_three_d_verification",
        "CreateBindCard completed without ThreeDURL",
      );
      completedBind = bindResult;
    }

    bindCardId = completedBind.card.token;
    redactor.add(bindCardId);
    await step("07_bound_card_masked", async (outcome) => {
      const card = completedBind.card;
      outcome.bindCardId_sha12 = digest12(card.token);
      outcome.card_last4 = card.last4;
      outcome.cardType = card.cardType;
      outcome.expiry = `${card.expiryMonth}/${card.expiryYear}`;
      outcome.last4_matches_test_card = card.last4 === STAGE_TEST_CARD.last4;
      // Same storage path as PaymentMethodService: AES-GCM via PaymentTokenCipher.
      const methodId = `psp-sandbox-method-${runKey}`;
      const sealed = cipher.encrypt(card.token, passengerId, methodId);
      outcome.cipher_roundtrip =
        cipher.decrypt(sealed, passengerId, methodId) === card.token;
      expect(outcome.cipher_roundtrip).toBe(true);
    });

    capture = await step("08_capture_with_card_id", async (outcome) => {
      const result = await provider.capture({
        idempotencyKey: `psp-sandbox:capture:${runKey}`,
        token: bindCardId!,
        amountMinor: CHARGE_AMOUNT_TWD * 100,
        currency: "TWD",
        passengerId,
      });
      outcome.status = result.status;
      outcome.amountTwd = CHARGE_AMOUNT_TWD;
      outcome.need3D = 0;
      if (result.status === "completed") {
        const [mtn, ...rest] = result.providerRef.split(":");
        const tradeNo = rest.join(":");
        redactor.add(mtn);
        redactor.add(tradeNo);
        outcome.merchantTradeNo_sha12 = digest12(mtn ?? "");
        outcome.tradeNo_sha12 = digest12(tradeNo);
      } else if (result.status === "failed") {
        outcome.error = result.error;
        outcome.retryable = result.retryable;
      }
      if (result.status !== "completed")
        throw new Error(`capture_${result.status}`);
      return result;
    });

    refund = await step("09_refund_attempt", async (outcome) => {
      const providerRef =
        capture?.status === "completed" ? capture.providerRef : "";
      const result = await provider.refund({
        idempotencyKey: `psp-sandbox:refund:${runKey}`,
        captureRef: providerRef,
        amountMinor: CHARGE_AMOUNT_TWD * 100,
        currency: "TWD",
      });
      outcome.status = result.status;
      if (result.status === "failed") {
        outcome.error = result.error;
        outcome.retryable = result.retryable;
      }
      // Recorded as observed; a non-completed refund is not a test failure.
      return result;
    });
  } finally {
    if (bindCardId) {
      try {
        await step("10_unbind_stage_card", async (outcome) => {
          unbound = await provider.unbind(bindCardId!, { passengerId });
          outcome.unbound = unbound;
          outcome.bindCardId_sha12 = digest12(bindCardId!);
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

    const refundCalls = calls.filter((c) => c.step === "09_refund_attempt");
    const doActionCalls = refundCalls.filter((c) =>
      c.endpoint.endsWith("/Credit/DoAction"),
    );
    evidence.refund = {
      adapterResult: refund?.status ?? null,
      queryTradeHttp:
        refundCalls.find((c) => c.endpoint.endsWith("/CreditDetail/QueryTrade"))
          ?.httpStatus ?? null,
      queryTradeRtnCode:
        refundCalls.find((c) => c.endpoint.endsWith("/CreditDetail/QueryTrade"))
          ?.rtnCode ?? null,
      doActionAttempted: doActionCalls.length > 0,
      doActionHttp: doActionCalls.at(-1)?.httpStatus ?? null,
      doActionRtnCode: doActionCalls.at(-1)?.rtnCode ?? null,
      classification:
        refund === null
          ? "not_attempted"
          : refund.status === "completed"
            ? "stage_refund_succeeded"
            : "stage_refund_not_supported_or_unconfirmed — refund evidence to be obtained on the production merchant",
    };
    const satisfied =
      bindCardId !== null &&
      threeDPerformed &&
      capture?.status === "completed" &&
      refund !== null &&
      unbound === true;
    evidence.acceptance = {
      bind_completed: bindCardId !== null,
      three_d_performed: threeDPerformed,
      capture_completed: capture?.status === "completed",
      refund_recorded: refund !== null,
      stage_card_unbound: unbound,
      satisfied,
    };
    evidence.finishedAt = new Date().toISOString();
    writeEvidence(redactor, evidence);
  }

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
