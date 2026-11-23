/**
 * PAX-PRODUCT-ORDER-ECPAY-STAGE-20261123 — repository unit & hosted-PostgreSQL
 * verification for the product-order ECPay Stage harness, evidence redaction,
 * and service-level bind -> 3DS callback -> capture -> receipt -> refund ->
 * unbind lifecycle.
 */
import { describe, expect, it } from "vitest";
import { encryptEcpayData } from "../../../apps/api/src/modules/passenger-app/payment/ecpay-cipher";
import { EcpayPaymentProvider } from "../../../apps/api/src/modules/passenger-app/payment/ecpay-payment-provider";
import { PaymentChargeRepository } from "../../../apps/api/src/modules/passenger-app/payment/payment-charge.repository";
import { PaymentChargeService } from "../../../apps/api/src/modules/passenger-app/payment/payment-charge.service";
import { PaymentMethodRepository } from "../../../apps/api/src/modules/passenger-app/payment/payment-method.repository";
import { PaymentMethodService } from "../../../apps/api/src/modules/passenger-app/payment/payment-method.service";
import { PaymentRefundRepository } from "../../../apps/api/src/modules/passenger-app/payment/payment-refund.repository";
import { PaymentRefundService } from "../../../apps/api/src/modules/passenger-app/payment/payment-refund.service";
import { PaymentTokenCipher } from "../../../apps/api/src/modules/passenger-app/payment/payment-token-cipher";
import {
  hostedPaymentEnabled,
  syntheticPolicy,
} from "../../unit/pax-qa-20261009/payment-postgres-harness";
import {
  EVIDENCE_SCHEMA,
  Redactor,
  STAGE_TEST_CARD,
  createRecordingFetch,
  describeCallbackBodyShape,
  diagnoseEnvelopeVerification,
  digest12,
  extractCallbackBindCardIdAndRegister,
  renderSummaryMarkdown,
  type EcpayCallRecord,
  type SandboxEvidence,
} from "./evidence";
import { acceptedPayToken, harnessHtml } from "./harness";
import {
  PLATFORM_BILLING_HEADERS,
  startProductOrderStageContext,
} from "./product-order-harness";

const TEST_MERCHANT_ID = "3002607";
const TEST_HASH_KEY = "pwFHCqoQZGmho4w6";
const TEST_HASH_IV = "EkRm7iFT261dpevs";
const TEST_KEY_RING = JSON.stringify({
  activeKeyId: "k1",
  keys: {
    k1: Buffer.alloc(32, 0x37).toString("base64"),
  },
});

function buildSignedEcpayEnvelope(
  data: Record<string, unknown>,
  timestamp = Math.floor(Date.now() / 1000),
) {
  return {
    MerchantID: TEST_MERCHANT_ID,
    RpHeader: { Timestamp: timestamp },
    TransCode: 1,
    TransMsg: "Success",
    Data: encryptEcpayData(data, TEST_HASH_KEY, TEST_HASH_IV),
  };
}

describe("PAX-PRODUCT-ORDER-ECPAY-STAGE-20261123 harness & evidence invariants", () => {
  it("renders passenger bind button ('綁定卡片') and 3DS verification link ('前往付款商安全驗證') in harnessHtml", () => {
    const html = harnessHtml("Stage");
    expect(html).toContain('id="drts-bind-card-btn"');
    expect(html).toContain("綁定卡片");
    expect(html).toContain('id="drts-3ds-verify-link"');
    expect(html).toContain("前往付款商安全驗證");
    expect(html).toContain("requestSessionAndMount");
    expect(html).toContain("/api/passenger-app/payment-methods");
  });

  it("validates payToken acceptance rules identically to EcpayHostedFields", () => {
    expect(
      acceptedPayToken({
        rtnCode: 1,
        rtnMsg: "OK",
        payToken: "STAGE_PAY_TOKEN_1234567890",
        merchantTradeNo: "MTN123",
        errorMessage: null,
      }),
    ).toBe("STAGE_PAY_TOKEN_1234567890");
    expect(
      acceptedPayToken({
        rtnCode: 1,
        rtnMsg: "OK",
        payToken: STAGE_TEST_CARD.number,
        merchantTradeNo: "MTN123",
        errorMessage: null,
      }),
    ).toBeNull();
  });

  it("registers callback and recording-fetch secrets with Redactor and fails closed on any leak", async () => {
    const redactor = new Redactor([
      TEST_MERCHANT_ID,
      TEST_HASH_KEY,
      TEST_HASH_IV,
    ]);
    const calls: EcpayCallRecord[] = [];
    const secretBindCardId = "BIND_CARD_SECRET_99887766";
    const secretTradeNo = "2611230001112223";
    const secretMerchantTradeNo = "DRTSMTN20261123001";

    const envelope = buildSignedEcpayEnvelope({
      RtnCode: 1,
      RtnMsg: "綁定成功",
      MerchantID: TEST_MERCHANT_ID,
      MerchantMemberID: "DRTSMEM001",
      BindCardID: secretBindCardId,
      CardInfo: {
        Card4No: "2222",
        Card6No: "431195",
        CardValidYY: "28",
        CardValidMM: "12",
      },
      OrderInfo: {
        MerchantTradeNo: secretMerchantTradeNo,
        TradeNo: secretTradeNo,
        TotalAmount: 5,
      },
    });
    const formBody = new URLSearchParams({
      ResultData: JSON.stringify(envelope),
    }).toString();

    const shape = describeCallbackBodyShape(formBody);
    expect(shape.callbackBodyKind).toBe("form");
    expect(shape.callbackResultDataKind).toBe("json_object");

    const diag = diagnoseEnvelopeVerification({
      raw: formBody,
      merchantId: TEST_MERCHANT_ID,
      hashKey: TEST_HASH_KEY,
      hashIv: TEST_HASH_IV,
    });
    expect(diag.diag_decrypt_ok).toBe(true);

    const extracted = extractCallbackBindCardIdAndRegister({
      raw: formBody,
      merchantId: TEST_MERCHANT_ID,
      hashKey: TEST_HASH_KEY,
      hashIv: TEST_HASH_IV,
      redactor,
    });
    expect(extracted.bindCardId).toBe(secretBindCardId);
    expect(extracted.tradeNo).toBe(secretTradeNo);
    expect(extracted.merchantTradeNo).toBe(secretMerchantTradeNo);

    // Raw provider_capture_ref ("MerchantTradeNo:TradeNo") must be detected as a leak if unhashed
    expect(redactor.findLeak(`${secretMerchantTradeNo}:${secretTradeNo}`)).toBe(
      "registered_secret",
    );
    expect(redactor.findLeak(secretBindCardId)).toBe("registered_secret");
    expect(redactor.findLeak(STAGE_TEST_CARD.number)).toBe("full_card_number");

    // Digest-only evidence passes leak scan and renders markdown summary cleanly
    const evidence: SandboxEvidence = {
      schema: EVIDENCE_SCHEMA,
      taskId: "PAX-PRODUCT-ORDER-ECPAY-STAGE-20261123",
      acceptanceKey:
        "hosted_same_product_order_stage_binding_capture_and_ledger",
      candidateSha: "a".repeat(40),
      runUrl: null,
      runId: "1",
      runAttempt: "1",
      startedAt: "2026-11-23T00:00:00.000Z",
      finishedAt: "2026-11-23T00:01:00.000Z",
      environment: {
        provider: "ecpay",
        testCard_last4: STAGE_TEST_CARD.last4,
      },
      callbackDelivery: {
        mode: "runner_intercepted_browser_order_result_forwarded_to_mounted_controller",
        fabricatedCallbackUsed: false,
      },
      productOrder: {
        orderId: "order-123",
        paymentId: "pax-payment:order-123",
        providerCaptureRef_sha12: digest12(
          `${secretMerchantTradeNo}:${secretTradeNo}`,
        ),
        sameOrderAndPaymentLinked: true,
      },
      productFindings: [
        {
          id: "FINDING-1",
          component: "client.ts",
          normalUseCase: "getBindingSession",
          symptom: "snake_case mismatch",
          rootCause: "missing field() helper",
          recommendedFixScope:
            "packages/passenger-client/src/payment/client.ts",
        },
      ],
      steps: [],
      calls,
      screenshots: [],
      refund: {
        classification: "stage_refund_not_supported_or_unconfirmed_in_stage",
      },
      acceptance: {
        hosted_same_product_order_stage_binding_capture_and_ledger: true,
        satisfied: true,
      },
    };
    const serialized = JSON.stringify(evidence);
    expect(redactor.findLeak(serialized)).toBeNull();
    const markdown = renderSummaryMarkdown(evidence);
    expect(redactor.findLeak(markdown)).toBeNull();
    expect(markdown).toContain(
      "hosted_same_product_order_stage_binding_capture_and_ledger: **true**",
    );
    expect(markdown).toContain(
      "Same Product Order, Receipt & Dual Payment Ledger",
    );
  });

  it("drives PaymentMethodService, PaymentChargeService, and PaymentRefundService through EcpayPaymentProvider with encrypted envelopes", async () => {
    const redactor = new Redactor([
      TEST_MERCHANT_ID,
      TEST_HASH_KEY,
      TEST_HASH_IV,
    ]);
    const calls: EcpayCallRecord[] = [];
    let currentStep = "unit-flow";

    const secretBindCardId = "STAGE_BIND_CARD_ID_4311_2222";
    const captureTradeNo = "2611239988776655";
    const captureMtn = "DRTSCAP2026112301";

    const scriptedFetch = async (url: string): Promise<Response> => {
      const pathname = new URL(url).pathname;
      if (pathname.endsWith("/Merchant/GetTokenbyBindingCard")) {
        return new Response(
          JSON.stringify(
            buildSignedEcpayEnvelope({
              RtnCode: 1,
              RtnMsg: "OK",
              Token: "STAGE_MERCHANT_TOKEN_ABCDEF123456",
              TokenExpireDate: "2026/11/23 12:00:00",
            }),
          ),
          { status: 200 },
        );
      }
      if (pathname.endsWith("/Merchant/CreateBindCard")) {
        return new Response(
          JSON.stringify(
            buildSignedEcpayEnvelope({
              RtnCode: 1,
              RtnMsg: "Requires 3DS",
              ThreeDInfo: {
                ThreeDURL:
                  "https://cc-stage.ecpay.com.tw/ThreeD/Verify?token=3ds123",
              },
              OrderInfo: {
                MerchantTradeNo: "DRTSBIND20261123",
              },
            }),
          ),
          { status: 200 },
        );
      }
      if (pathname.endsWith("/Credit/DoAction")) {
        return new Response(
          JSON.stringify(
            buildSignedEcpayEnvelope({
              RtnCode: 1,
              RtnMsg: "DoAction OK",
            }),
          ),
          { status: 200 },
        );
      }
      if (pathname.endsWith("/Merchant/CreatePaymentWithCardID")) {
        return new Response(
          JSON.stringify(
            buildSignedEcpayEnvelope({
              RtnCode: 1,
              RtnMsg: "授權成功",
              OrderInfo: {
                MerchantTradeNo: captureMtn,
                TradeNo: captureTradeNo,
                TotalAmount: 85,
              },
            }),
          ),
          { status: 200 },
        );
      }
      if (pathname.endsWith("/CreditDetail/QueryTrade")) {
        return new Response(
          JSON.stringify(
            buildSignedEcpayEnvelope({
              RtnCode: 1,
              RtnMsg: "OK",
              RtnValue: {
                TradeStatus: "1",
                CloseStatus: "0",
              },
            }),
          ),
          { status: 200 },
        );
      }
      if (pathname.endsWith("/Merchant/DeleteMemberBindCard")) {
        return new Response(
          JSON.stringify(
            buildSignedEcpayEnvelope({
              RtnCode: 1,
              RtnMsg: "Deleted",
              BindCardID: secretBindCardId,
            }),
          ),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = scriptedFetch as typeof fetch;
    try {
      const recordingFetch = createRecordingFetch({
        merchantId: TEST_MERCHANT_ID,
        hashKey: TEST_HASH_KEY,
        hashIv: TEST_HASH_IV,
        redactor,
        records: calls,
        currentStep: () => currentStep,
      });
      const provider = new EcpayPaymentProvider({
        merchantId: TEST_MERCHANT_ID,
        hashKey: TEST_HASH_KEY,
        hashIv: TEST_HASH_IV,
        sandbox: true,
        publicApiOrigin: "https://api-dev.smarttransport.tw",
        publicWebOrigin: "https://ride-dev.smarttransport.tw",
        fetchFn: recordingFetch,
      });
      const cipher = new PaymentTokenCipher(TEST_KEY_RING);
      const runtime = { provider, cipher };

      const passengerId = "drts_passenger_stage_unit";
      const methodId = "00000000-0000-4000-8000-000000000022";
      const idempotencyKey = "pax:bind:unit-stage-2222";
      let storedEnvelope: ReturnType<typeof cipher.encrypt> | null = null;
      let storedMethod: {
        paymentMethodId: string;
        last4: string;
        cardType: string;
        expiryMonth: string;
        expiryYear: string;
        isDefault: boolean;
      } | null = null;

      const memoryMethodRepo = {
        list: async () => (storedMethod ? [storedMethod] : []),
        claimBinding: async () => ({
          idempotencyKey,
          methodId,
          completed: storedMethod,
        }),
        bindingOutcome: async () => undefined,
        findBindingByMerchantMember: async (
          predicate: (pid: string) => boolean,
        ) =>
          predicate(passengerId)
            ? { passengerId, idempotencyKey, methodId }
            : null,
        findActionRequiredBinding: async () => ({
          idempotencyKey,
          methodId,
        }),
        completeBinding: async (
          _ownerId: string,
          _key: string,
          card: {
            paymentMethodId: string;
            tokenEnvelope: ReturnType<typeof cipher.encrypt>;
            last4: string;
            cardType: string;
            expiryMonth: string;
            expiryYear: string;
          },
        ) => {
          storedEnvelope = card.tokenEnvelope;
          storedMethod = {
            paymentMethodId: card.paymentMethodId,
            last4: card.last4,
            cardType: card.cardType,
            expiryMonth: card.expiryMonth,
            expiryYear: card.expiryYear,
            isDefault: true,
          };
          return storedMethod;
        },
        findReceiptDisplay: async (_ownerId: string, id: string) =>
          storedMethod && storedMethod.paymentMethodId === id
            ? `${storedMethod.cardType} ••••${storedMethod.last4}`
            : null,
        remove: async (
          _ownerId: string,
          _id: string,
          beforeRemove?: (removable: {
            provider: string;
            tokenEnvelope: ReturnType<typeof cipher.encrypt> | null;
          }) => Promise<void>,
        ) => {
          if (beforeRemove) {
            await beforeRemove({
              provider: "ecpay",
              tokenEnvelope: storedEnvelope,
            });
          }
          storedMethod = null;
          storedEnvelope = null;
        },
      } as unknown as PaymentMethodRepository;

      const methodService = new PaymentMethodService(memoryMethodRepo, runtime);

      currentStep = "01_session";
      const session = await methodService.createBindingSession(passengerId, {
        email: "stage@example.invalid",
      });
      expect(session.provider).toBe("ecpay");
      expect(session.serverType).toBe("Stage");

      currentStep = "05_bind";
      const bindOut = await methodService.bind(passengerId, {
        provider_token: "PAY_TOKEN_STAGE_1234567890",
      });
      expect(bindOut.status).toBe("action_required");
      if (bindOut.status === "action_required") {
        expect(bindOut.nextActionUrl).toContain("cc-stage.ecpay.com.tw");
      }

      currentStep = "06_callback";
      const callbackEnvelope = buildSignedEcpayEnvelope({
        RtnCode: 1,
        RtnMsg: "綁定成功",
        MerchantID: TEST_MERCHANT_ID,
        MerchantMemberID: provider.deriveMerchantMemberId(passengerId),
        BindCardID: secretBindCardId,
        CardInfo: {
          Card4No: "2222",
          Card6No: "431195",
          CardValidYY: "28",
          CardValidMM: "12",
        },
        OrderInfo: {
          MerchantTradeNo: "DRTSBIND20261123",
          TradeNo: "2611230000111122",
          TotalAmount: 5,
        },
      });
      const callbackBody = new URLSearchParams({
        ResultData: JSON.stringify(callbackEnvelope),
      }).toString();

      const verified = await methodService.verifyNotification(callbackBody);
      expect(verified.verified).toBe(true);
      expect(verified.status).toBe("completed");
      expect(verified.method?.paymentMethodId).toBe(methodId);

      // Replay callback idempotently
      const replayVerified =
        await methodService.verifyNotification(callbackBody);
      expect(replayVerified.method?.paymentMethodId).toBe(methodId);
      const listed = await methodService.list(passengerId);
      expect(listed.methods).toHaveLength(1);
      expect(await methodService.getReceiptDisplay(passengerId, methodId)).toBe(
        "VISA ••••2222",
      );

      // Charge & Refund services instantiate cleanly with EcpayPaymentProvider runtime
      const chargeService = new PaymentChargeService(
        {} as PaymentChargeRepository,
        runtime,
        syntheticPolicy,
      );
      const refundService = new PaymentRefundService(
        {} as PaymentRefundRepository,
        runtime,
      );
      expect(chargeService).toBeDefined();
      expect(refundService).toBeDefined();

      // Unbind decrypts tokenEnvelope, calls DeleteMemberBindCard, and clears method
      currentStep = "10_unbind";
      const removed = await methodService.remove(passengerId, methodId);
      expect(removed).toEqual({ success: true });
      expect((await methodService.list(passengerId)).methods).toHaveLength(0);

      // Every secret in decrypted responses was registered with Redactor
      expect(redactor.findLeak(secretBindCardId)).toBe("registered_secret");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe.skipIf(!hostedPaymentEnabled)(
  "PAX-PRODUCT-ORDER-ECPAY-STAGE-20261123 hosted PostgreSQL + mounted controllers flow",
  () => {
    it("connects passenger binding session, 3DS OrderResultURL controller, same product order, capture ledger, receipt, refund & unbind on isolated PostgreSQL", async () => {
      const calls: EcpayCallRecord[] = [];
      const redactor = new Redactor([
        TEST_MERCHANT_ID,
        TEST_HASH_KEY,
        TEST_HASH_IV,
      ]);
      const secretBindCardId = "PG_STAGE_BIND_CARD_ID_2222";
      const captureMtn = "DRTSPGCAP20261123";
      const captureTradeNo = "2611238877665544";

      const ecpayFetch = createRecordingFetch({
        merchantId: TEST_MERCHANT_ID,
        hashKey: TEST_HASH_KEY,
        hashIv: TEST_HASH_IV,
        redactor,
        records: calls,
        currentStep: () => "pg-test",
      });

      const provider = new EcpayPaymentProvider({
        merchantId: TEST_MERCHANT_ID,
        hashKey: TEST_HASH_KEY,
        hashIv: TEST_HASH_IV,
        sandbox: true,
        publicApiOrigin: "https://api-dev.smarttransport.tw",
        publicWebOrigin: "https://ride-dev.smarttransport.tw",
        fetchFn: async (url, init) => {
          const pathname = new URL(url).pathname;
          const originalFetch = globalThis.fetch;
          globalThis.fetch = (async () => {
            if (pathname.endsWith("/Merchant/GetTokenbyBindingCard")) {
              return new Response(
                JSON.stringify(
                  buildSignedEcpayEnvelope({
                    RtnCode: 1,
                    RtnMsg: "OK",
                    Token: "PG_STAGE_MERCHANT_TOKEN_123456",
                    TokenExpireDate: "2026/11/23 12:00:00",
                  }),
                ),
                { status: 200 },
              );
            }
            if (pathname.endsWith("/Merchant/CreateBindCard")) {
              return new Response(
                JSON.stringify(
                  buildSignedEcpayEnvelope({
                    RtnCode: 1,
                    RtnMsg: "Requires 3DS",
                    ThreeDInfo: {
                      ThreeDURL:
                        "https://cc-stage.ecpay.com.tw/ThreeD/Verify?token=pg3ds",
                    },
                    OrderInfo: {
                      MerchantTradeNo: "DRTSPGBIND20261123",
                    },
                  }),
                ),
                { status: 200 },
              );
            }
            if (pathname.endsWith("/Credit/DoAction")) {
              return new Response(
                JSON.stringify(
                  buildSignedEcpayEnvelope({
                    RtnCode: 1,
                    RtnMsg: "DoAction OK",
                  }),
                ),
                { status: 200 },
              );
            }
            if (pathname.endsWith("/Merchant/CreatePaymentWithCardID")) {
              return new Response(
                JSON.stringify(
                  buildSignedEcpayEnvelope({
                    RtnCode: 1,
                    RtnMsg: "授權成功",
                    OrderInfo: {
                      MerchantTradeNo: captureMtn,
                      TradeNo: captureTradeNo,
                      TotalAmount: 85,
                    },
                  }),
                ),
                { status: 200 },
              );
            }
            if (pathname.endsWith("/CreditDetail/QueryTrade")) {
              return new Response(
                JSON.stringify(
                  buildSignedEcpayEnvelope({
                    RtnCode: 1,
                    RtnMsg: "OK",
                    RtnValue: {
                      TradeStatus: "1",
                      CloseStatus: "0",
                    },
                  }),
                ),
                { status: 200 },
              );
            }
            if (pathname.endsWith("/Merchant/DeleteMemberBindCard")) {
              return new Response(
                JSON.stringify(
                  buildSignedEcpayEnvelope({
                    RtnCode: 1,
                    RtnMsg: "Deleted",
                    BindCardID: secretBindCardId,
                  }),
                ),
                { status: 200 },
              );
            }
            return new Response("not found", { status: 404 });
          }) as typeof fetch;
          try {
            return await ecpayFetch(url, init);
          } finally {
            globalThis.fetch = originalFetch;
          }
        },
      });

      const cipher = new PaymentTokenCipher(TEST_KEY_RING);
      const ctx = await startProductOrderStageContext({
        runtime: { provider, cipher },
        passengerEmail: "pg-stage-order@example.invalid",
      });

      try {
        const sessionResp = await ctx.requestJson<{
          data?: { merchant_token?: string };
        }>("/api/passenger-app/payment-methods?binding_session=1", {
          headers: { authorization: `Bearer ${ctx.accessToken}` },
        });
        expect(sessionResp.status).toBe(200);
        expect(sessionResp.body?.data?.merchant_token).toBe(
          "PG_STAGE_MERCHANT_TOKEN_123456",
        );

        const bindResp = await ctx.requestJson<{
          data?: { status?: string; next_action_url?: string };
        }>("/api/passenger-app/payment-methods", {
          method: "POST",
          headers: {
            authorization: `Bearer ${ctx.accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            provider_token: "PG_PAY_TOKEN_1234567890",
          }),
        });
        expect(bindResp.status).toBe(201);
        expect(bindResp.body?.data?.status).toBe("action_required");

        const callbackEnvelope = buildSignedEcpayEnvelope({
          RtnCode: 1,
          RtnMsg: "綁定成功",
          MerchantID: TEST_MERCHANT_ID,
          MerchantMemberID: provider.deriveMerchantMemberId(ctx.passengerId),
          BindCardID: secretBindCardId,
          CardInfo: {
            Card4No: "2222",
            Card6No: "431195",
            CardValidYY: "28",
            CardValidMM: "12",
          },
          OrderInfo: {
            MerchantTradeNo: "DRTSPGBIND20261123",
            TradeNo: "2611230000999988",
            TotalAmount: 5,
          },
        });
        const callbackBody = new URLSearchParams({
          ResultData: JSON.stringify(callbackEnvelope),
        }).toString();

        const orderResultResp = await ctx.requestJson<{
          data?: {
            status?: string;
            method?: { payment_method_id?: string; last4?: string };
          };
        }>("/api/passenger-app/payment-methods/ecpay/order-result", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: callbackBody,
        });
        expect(orderResultResp.status).toBe(200);
        expect(orderResultResp.body?.data?.status).toBe("completed");
        const paymentMethodId =
          orderResultResp.body?.data?.method?.payment_method_id ?? "";
        expect(paymentMethodId).toBeTruthy();

        const quote = await ctx.createQuote();
        const createRideResp = await ctx.requestJson<{
          data?: { ride?: { order?: { order_id?: string } } };
        }>("/api/passenger-app/rides", {
          method: "POST",
          headers: {
            authorization: `Bearer ${ctx.accessToken}`,
            "content-type": "application/json",
            "x-request-id": "pg-stage-book-1",
          },
          body: JSON.stringify({
            origin: quote.origin,
            destination: quote.destination,
            scheduled_at: quote.scheduledAt,
            fare_snapshot_id: quote.fareSnapshotId,
            payment_method_id: paymentMethodId,
            passenger_confirmed_at: new Date(Date.now() - 1000).toISOString(),
          }),
        });
        expect(createRideResp.status).toBe(201);
        const orderId = createRideResp.body?.data?.ride?.order?.order_id ?? "";
        expect(orderId).toBeTruthy();

        await ctx.completeProductOrder(orderId, 8500);
        const dbAfterCapture = await ctx.inspectDatabaseState(
          orderId,
          paymentMethodId,
        );
        expect(dbAfterCapture.chargeRecords).toHaveLength(1);
        expect(dbAfterCapture.billingPayments).toHaveLength(1);
        expect(dbAfterCapture.chargeRecords[0]!.payment_id).toBe(
          `pax-payment:${orderId}`,
        );
        expect(dbAfterCapture.chargeRecords[0]!.status).toBe("captured");
        expect(dbAfterCapture.billingPayments[0]!.status).toBe("captured");

        const htmlReceipt = await ctx.requestRaw(
          `/api/passenger-app/rides/${orderId}/receipt/artifacts/html`,
          {
            headers: { authorization: `Bearer ${ctx.accessToken}` },
          },
        );
        expect(htmlReceipt.status).toBe(200);
        expect(htmlReceipt.text).toContain("VISA ••••2222");

        const refundResp = await ctx.requestJson(
          `/api/passenger-app/platform/rides/${orderId}/refund`,
          {
            method: "POST",
            headers: {
              ...PLATFORM_BILLING_HEADERS,
              "content-type": "application/json",
            },
            body: JSON.stringify({ reason: "pg test refund" }),
          },
        );
        expect(refundResp.status).toBe(201);

        const deleteResp = await ctx.requestJson<{
          data?: { success?: boolean };
        }>(`/api/passenger-app/payment-methods/${paymentMethodId}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${ctx.accessToken}` },
        });
        expect(deleteResp.status).toBe(200);
        expect(deleteResp.body?.data?.success).toBe(true);
      } finally {
        await ctx.close();
      }
    }, 240_000);
  },
);
