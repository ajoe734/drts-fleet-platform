import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  buildEcpayEnvelope,
  decryptEcpayData,
  deriveEcpayMerchantMemberId,
  deriveEcpayMerchantTradeNo,
  encryptEcpayData,
  normalizeEcpayPhone,
  verifyAndUnwrapEcpayEnvelope,
} from "../../src/modules/passenger-app/payment/ecpay-cipher";
import { EcpayPaymentProvider } from "../../src/modules/passenger-app/payment/ecpay-payment-provider";
import { paymentCapturePolicyFromEnv } from "../../src/modules/passenger-app/payment/payment-capture.config";
import type { PaymentChargeRepository } from "../../src/modules/passenger-app/payment/payment-charge.repository";
import { PaymentChargeService } from "../../src/modules/passenger-app/payment/payment-charge.service";
import { PaymentMethodController } from "../../src/modules/passenger-app/payment/payment-method.controller";
import {
  PAYMENT_IDEMPOTENCY_ERROR_CODES,
  PaymentMethodRepository,
} from "../../src/modules/passenger-app/payment/payment-method.repository";
import { PaymentMethodService } from "../../src/modules/passenger-app/payment/payment-method.service";
import {
  ECPAY_PAYMENT_REQUIRED_SECRETS,
  paymentRuntimeFromEnv,
} from "../../src/modules/passenger-app/payment/payment-runtime.config";
import { PaymentTokenCipher } from "../../src/modules/passenger-app/payment/payment-token-cipher";
import type { DatabaseService } from "../../src/common/db/database.service";

const SYNTHETIC_MERCHANT_ID = "SYNTHETIC_MID_01";
const SYNTHETIC_HASH_KEY = "SYNTHETIC_KEY_16";
const SYNTHETIC_HASH_IV = "SYNTHETIC_IV__16";
const SYNTHETIC_CREDENTIALS = {
  merchantId: SYNTHETIC_MERCHANT_ID,
  hashKey: SYNTHETIC_HASH_KEY,
  hashIv: SYNTHETIC_HASH_IV,
};

function syntheticEncryptionKeysJson(): string {
  return JSON.stringify({
    activeKeyId: "k1",
    keys: { k1: randomBytes(32).toString("base64") },
  });
}

function buildMockResponse(
  payload: Record<string, unknown>,
  now = new Date("2026-10-24T10:00:00Z"),
): Response {
  const timestamp = Math.floor(now.getTime() / 1000);
  const data = encryptEcpayData(payload, SYNTHETIC_HASH_KEY, SYNTHETIC_HASH_IV);
  return new Response(
    JSON.stringify({
      PlatformID: "",
      MerchantID: SYNTHETIC_MERCHANT_ID,
      RpHeader: { Timestamp: timestamp },
      TransCode: 1,
      TransMsg: "Success",
      Data: data,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("ECPay 站內付 2.0 cipher & envelope verification", () => {
  it("roundtrips AES-128-CBC + URL-encoded JSON payloads including Traditional Chinese and symbols", () => {
    const original = {
      RtnCode: 1,
      RtnMsg: "綁定成功 (智行叫車 + 測試%)",
      MerchantMemberID: "mbr_synthetic_member_01",
    };
    const encrypted = encryptEcpayData(
      original,
      SYNTHETIC_HASH_KEY,
      SYNTHETIC_HASH_IV,
    );
    expect(encrypted).not.toContain("綁定成功");
    expect(encrypted).not.toContain("mbr_synthetic_member_01");

    const decrypted = decryptEcpayData(
      encrypted,
      SYNTHETIC_HASH_KEY,
      SYNTHETIC_HASH_IV,
    );
    expect(decrypted).toEqual(original);
  });

  it("rejects non-16-byte or non-ASCII HashKey/HashIV", () => {
    expect(() =>
      encryptEcpayData({ ok: true }, "TOO_SHORT", SYNTHETIC_HASH_IV),
    ).toThrow(/HashKey/);
    expect(() =>
      encryptEcpayData(
        { ok: true },
        SYNTHETIC_HASH_KEY,
        "非ASCII十六位元組字串",
      ),
    ).toThrow(/HashIV/);
  });

  it("verifies valid envelope and rejects tampered Data, wrong MerchantID, or expired Timestamp", () => {
    const now = new Date("2026-10-24T10:00:00Z");
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const envelope = buildEcpayEnvelope({
      ...SYNTHETIC_CREDENTIALS,
      data: { RtnCode: 1, RtnMsg: "OK" },
      timestamp: nowSeconds,
    });
    const verified = verifyAndUnwrapEcpayEnvelope({
      envelope,
      ...SYNTHETIC_CREDENTIALS,
      nowSeconds,
    });
    expect(verified).toEqual({
      timestamp: nowSeconds,
      transCode: 1,
      transMsg: "",
      data: { RtnCode: 1, RtnMsg: "OK" },
    });

    const formEncoded = `ResultData=${encodeURIComponent(JSON.stringify(envelope))}`;
    expect(
      verifyAndUnwrapEcpayEnvelope({
        envelope: formEncoded,
        ...SYNTHETIC_CREDENTIALS,
        nowSeconds,
      }),
    ).toEqual(verified);

    const objectResultData = { ResultData: JSON.stringify(envelope) };
    expect(
      verifyAndUnwrapEcpayEnvelope({
        envelope: objectResultData,
        ...SYNTHETIC_CREDENTIALS,
        nowSeconds,
      }),
    ).toEqual(verified);

    const tampered = { ...envelope, Data: "AAAA" + envelope.Data.slice(4) };
    expect(() =>
      verifyAndUnwrapEcpayEnvelope({
        envelope: tampered,
        ...SYNTHETIC_CREDENTIALS,
        nowSeconds,
      }),
    ).toThrow();

    const wrongMerchant = { ...envelope, MerchantID: "OTHER_MERCHANT" };
    expect(() =>
      verifyAndUnwrapEcpayEnvelope({
        envelope: wrongMerchant,
        ...SYNTHETIC_CREDENTIALS,
        nowSeconds,
      }),
    ).toThrow();

    const staleSeconds = nowSeconds + 15 * 60;
    expect(() =>
      verifyAndUnwrapEcpayEnvelope({
        envelope,
        ...SYNTHETIC_CREDENTIALS,
        nowSeconds: staleSeconds,
      }),
    ).toThrow();
  });

  it("derives irreversible alphanumeric MerchantMemberID and rejects phone/email inputs", () => {
    const memberId = deriveEcpayMerchantMemberId(
      "pax_9f8e7d6c-1234-4abc-8def",
      SYNTHETIC_MERCHANT_ID,
    );
    expect(memberId).toMatch(/^mbr_[a-f0-9]{32}$/);
    expect(
      deriveEcpayMerchantMemberId(
        "pax_9f8e7d6c-1234-4abc-8def",
        SYNTHETIC_MERCHANT_ID,
      ),
    ).toBe(memberId);

    expect(() =>
      deriveEcpayMerchantMemberId("user@example.com", SYNTHETIC_MERCHANT_ID),
    ).toThrow();
    expect(() =>
      deriveEcpayMerchantMemberId("0912345678", SYNTHETIC_MERCHANT_ID),
    ).toThrow();
    expect(() =>
      deriveEcpayMerchantMemberId("+886-912-345-678", SYNTHETIC_MERCHANT_ID),
    ).toThrow();
    expect(() =>
      deriveEcpayMerchantMemberId(
        "pax:bind:deadbeef1234",
        SYNTHETIC_MERCHANT_ID,
      ),
    ).toThrow(/never phone, email, or an operation idempotency key/);
  });

  it("derives deterministic 20-char alphanumeric MerchantTradeNo per idempotencyKey", () => {
    const tradeNo = deriveEcpayMerchantTradeNo("pax:capture:order-123");
    expect(tradeNo).toMatch(/^DR[A-F0-9]{18}$/);
    expect(tradeNo).toHaveLength(20);
    expect(deriveEcpayMerchantTradeNo("pax:capture:order-123")).toBe(tradeNo);
  });
});

describe("EcpayPaymentProvider adapter operations", () => {
  const now = new Date("2026-10-24T10:00:00Z");
  const nowSeconds = Math.floor(now.getTime() / 1000);

  it("requests GetTokenbyBindingCard with ConsumerInfo.Email/Phone, top-level OrderResultURL, and optional bindingAuthAmountTwd", async () => {
    const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe(
        "https://ecpg-stage.ecpay.com.tw/Merchant/GetTokenbyBindingCard",
      );
      const body = JSON.parse(String(init?.body ?? "{}"));
      const unwrapped = verifyAndUnwrapEcpayEnvelope({
        envelope: body,
        ...SYNTHETIC_CREDENTIALS,
        nowSeconds,
      });
      const consumerInfo = unwrapped.data.ConsumerInfo as Record<
        string,
        unknown
      >;
      const orderInfo = unwrapped.data.OrderInfo as Record<string, unknown>;
      expect(consumerInfo.MerchantMemberID).toMatch(/^mbr_[a-f0-9]{32}$/);
      expect(consumerInfo.Email).toBe("pax@example.com");
      expect(consumerInfo.Phone).toBe("0912345678");
      expect(unwrapped.data.OrderResultURL).toBe(
        "https://ride.smarttransport.tw/api/passenger-app/payment-methods/ecpay/order-result",
      );
      expect(orderInfo.OrderResultURL).toBeUndefined();
      expect(orderInfo.TotalAmount).toBe(5);
      return buildMockResponse(
        {
          RtnCode: 1,
          RtnMsg: "Success",
          Token: "synthetic_ecpay_sdk_token_abcdef123456",
          TokenExpireDate: "2026/10/24 10:30:00",
        },
        now,
      );
    });

    const provider = new EcpayPaymentProvider({
      ...SYNTHETIC_CREDENTIALS,
      sandbox: true,
      fetchFn: fetchFn as unknown as typeof fetch,
      now: () => now,
      bindingAuthAmountTwd: 5,
    });

    await expect(
      provider.createBindingSession("pax_uuid_0001_safe"),
    ).rejects.toThrow(/ConsumerInfo\.Email or ConsumerInfo\.Phone/);

    const session = await provider.createBindingSession("pax_uuid_0001_safe", {
      email: "pax@example.com",
      phone: "0912345678",
    });
    expect(session.merchantToken).toBe(
      "synthetic_ecpay_sdk_token_abcdef123456",
    );
    expect(session.serverType).toBe("Stage");
    expect(session.provider).toBe("ecpay");
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("completes CreateBindCard with top-level BindCardID + split CardValidYY/CardValidMM, supports 3DS ThreeDURL, and never fabricates 12/2099 when expiry is missing", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        buildMockResponse(
          {
            RtnCode: 1,
            RtnMsg: "Success",
            BindCardID: "ECPAY_BIND_CARD_ID_TOPLEVEL_001",
            CardInfo: {
              Card6No: "431195",
              Card4No: "2222",
              CardValidYY: "29",
              CardValidMM: "08",
              IssuingBank: "SYNTHETIC_BANK",
            },
          },
          now,
        ),
      )
      .mockResolvedValueOnce(
        buildMockResponse(
          {
            RtnCode: 1,
            RtnMsg: "ThreeDVerify",
            ThreeDInfo: {
              ThreeDURL:
                "https://ecpg-stage.ecpay.com.tw/Merchant/ThreeDVerify?token=syn123",
            },
          },
          now,
        ),
      )
      .mockResolvedValueOnce(
        buildMockResponse(
          {
            RtnCode: 1,
            RtnMsg: "SuccessWithoutExpiry",
            BindCardID: "ECPAY_BIND_CARD_ID_NO_EXPIRY",
            CardInfo: {
              Card6No: "431195",
              Card4No: "2222",
            },
          },
          now,
        ),
      );

    const provider = new EcpayPaymentProvider({
      ...SYNTHETIC_CREDENTIALS,
      sandbox: true,
      fetchFn: fetchFn as unknown as typeof fetch,
      now: () => now,
    });

    const completed = await provider.bind(
      "synthetic_bind_card_pay_token_0001",
      "pax:bind:key1",
      { passengerId: "pax_uuid_0001_safe" },
    );
    expect(completed).toEqual({
      status: "completed",
      card: {
        token: "ECPAY_BIND_CARD_ID_TOPLEVEL_001",
        last4: "2222",
        cardType: "VISA",
        expiryMonth: "08",
        expiryYear: "2029",
      },
    });

    const threeD = await provider.bind(
      "synthetic_bind_card_pay_token_0002",
      "pax:bind:key2",
      { passengerId: "pax_uuid_0001_safe" },
    );
    expect(threeD).toEqual({
      status: "action_required",
      nextActionUrl:
        "https://ecpg-stage.ecpay.com.tw/Merchant/ThreeDVerify?token=syn123",
    });

    await expect(
      provider.bind("synthetic_bind_card_pay_token_0003", "pax:bind:key3", {
        passengerId: "pax_uuid_0002_safe",
      }),
    ).rejects.toThrow(/lacked valid CardInfo/);
  });

  it("verifies callback notifications (including top-level BindCardID, split CardValidYY/MM, and ResultData form payloads) and rejects tampered callback envelopes", () => {
    const provider = new EcpayPaymentProvider({
      ...SYNTHETIC_CREDENTIALS,
      sandbox: true,
      now: () => now,
    });
    const validCallback = buildEcpayEnvelope({
      ...SYNTHETIC_CREDENTIALS,
      timestamp: nowSeconds,
      data: {
        RtnCode: 1,
        RtnMsg: "Succeeded",
        BindCardID: "ECPAY_BIND_CARD_ID_CALLBACK_001",
        CardInfo: {
          Card6No: "541234",
          Card4No: "8899",
          CardValidYY: "30",
          CardValidMM: "11",
        },
        OrderInfo: {
          MerchantTradeNo: "DR3DSBIND00000000005",
          TradeNo: "26102400000055",
          TotalAmount: 5,
        },
      },
    });

    const expectedNotification = {
      kind: "bind",
      rtnCode: 1,
      rtnMsg: "Succeeded",
      merchantTradeNo: "DR3DSBIND00000000005",
      tradeNo: "26102400000055",
      authorizedAmountMinor: 500,
      bindResult: {
        status: "completed",
        card: {
          token: "ECPAY_BIND_CARD_ID_CALLBACK_001",
          last4: "8899",
          cardType: "MASTERCARD",
          expiryMonth: "11",
          expiryYear: "2030",
        },
      },
    };
    expect(provider.verifyNotification(validCallback)).toEqual(
      expectedNotification,
    );
    expect(
      provider.verifyNotification(
        `ResultData=${encodeURIComponent(JSON.stringify(validCallback))}`,
      ),
    ).toEqual(expectedNotification);

    const tamperedCallback = {
      ...validCallback,
      Data: "ZZZZ" + validCallback.Data.slice(4),
    };
    expect(() => provider.verifyNotification(tamperedCallback)).toThrow();
  });

  it("executes CreatePaymentWithCardID with Need3D=0 and ConsumerInfo.MerchantMemberID (including via PaymentChargeService), enforces amount bounds, and blocks re-authorization of a declined BindCardID", async () => {
    const owner = "pax_uuid_0001_safe";
    const expectedMemberId = deriveEcpayMerchantMemberId(
      owner,
      SYNTHETIC_MERCHANT_ID,
    );
    const expectedTradeNo = deriveEcpayMerchantTradeNo("pax:capture:order-001");
    const fetchFn = vi
      .fn()
      .mockImplementationOnce(async (url: string | URL, init?: RequestInit) => {
        expect(String(url)).toBe(
          "https://ecpg-stage.ecpay.com.tw/Merchant/CreatePaymentWithCardID",
        );
        const unwrapped = verifyAndUnwrapEcpayEnvelope({
          envelope: JSON.parse(String(init?.body ?? "{}")),
          ...SYNTHETIC_CREDENTIALS,
          nowSeconds,
        });
        expect(unwrapped.data.Need3D).toBe(0);
        expect(unwrapped.data.BindCardID).toBe(
          "ECPAY_BIND_CARD_ID_SYNTHETIC_OK",
        );
        expect(unwrapped.data.ConsumerInfo).toEqual({
          MerchantMemberID: expectedMemberId,
        });
        expect(
          (unwrapped.data.OrderInfo as Record<string, unknown>).TotalAmount,
        ).toBe(350);
        return buildMockResponse(
          {
            RtnCode: 1,
            RtnMsg: "Succeeded",
            OrderInfo: {
              TradeNo: "2610241000001234",
              MerchantTradeNo: expectedTradeNo,
              TotalAmount: 350,
            },
          },
          now,
        );
      })
      .mockResolvedValueOnce(
        buildMockResponse(
          {
            RtnCode: 10100255,
            RtnMsg: "Card authorization declined",
          },
          now,
        ),
      );

    const provider = new EcpayPaymentProvider({
      ...SYNTHETIC_CREDENTIALS,
      sandbox: true,
      fetchFn: fetchFn as unknown as typeof fetch,
      now: () => now,
      timeoutMs: 35_000,
    });

    await expect(
      provider.capture({
        idempotencyKey: "pax:capture:missing-pax",
        token: "ECPAY_BIND_CARD_ID_SYNTHETIC_OK",
        amountMinor: 35_000,
        currency: "TWD",
      }),
    ).resolves.toEqual({
      status: "failed",
      error: "invalid_method",
      retryable: false,
    });

    // Verify PaymentChargeService passes claim.passengerId into EcpayPaymentProvider.capture
    // and converts 35,000 minor units -> TotalAmount: 350 TWD
    const cipher = new PaymentTokenCipher(syntheticEncryptionKeysJson());
    const finishSpy = vi.fn().mockResolvedValue(undefined);
    const sessionMock = {
      load: vi.fn().mockResolvedValue({
        paymentId: "00000000-0000-4000-8000-000000000777",
        orderId: "00000000-0000-4000-8000-000000000111",
        passengerId: owner,
        methodId: "00000000-0000-4000-8000-000000000888",
        amountMinor: 35_000,
        status: "not_selected",
        attemptCount: 0,
        readbackCount: 0,
        nextOperation: "capture",
        retryAt: null,
        lastError: null,
      }),
      begin: vi.fn().mockResolvedValue({
        paymentId: "00000000-0000-4000-8000-000000000777",
        orderId: "00000000-0000-4000-8000-000000000111",
        passengerId: owner,
        methodId: "00000000-0000-4000-8000-000000000888",
        provider: "ecpay",
        methodActive: true,
        tokenEnvelope: cipher.encrypt(
          "ECPAY_BIND_CARD_ID_SYNTHETIC_OK",
          owner,
          "00000000-0000-4000-8000-000000000888",
        ),
        amountMinor: 35_000,
        attemptCount: 1,
        readbackCount: 0,
        key: "pax:capture:order-001",
      }),
      finish: finishSpy,
    };
    const chargeRepo = {
      withOrder: vi
        .fn()
        .mockImplementation(async (_orderId, cb) => cb(sessionMock)),
    };
    const chargeService = new PaymentChargeService(
      chargeRepo as unknown as PaymentChargeRepository,
      { provider, cipher },
      {
        retryDelaysMs: [60_000],
        retryDefinitiveDeclines: false,
        unknownReadbackDelaysMs: [1000],
      },
    );
    await chargeService.processOrder(
      "00000000-0000-4000-8000-000000000111",
      now,
    );
    expect(finishSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "captured",
        providerRef: `${expectedTradeNo}:2610241000001234`,
      }),
    );

    // Non-whole-TWD minor units (350.50 TWD) and out-of-bounds (> 200,000 TWD = 20,000,000 minor units) fail closed without network I/O
    const fractional = await provider.capture({
      idempotencyKey: "pax:capture:order-fractional",
      token: "ECPAY_BIND_CARD_ID_SYNTHETIC_OK",
      amountMinor: 35_050,
      currency: "TWD",
      passengerId: owner,
    });
    expect(fractional).toEqual({
      status: "failed",
      error: "card_declined",
      retryable: false,
    });

    const overLimit = await provider.capture({
      idempotencyKey: "pax:capture:order-over",
      token: "ECPAY_BIND_CARD_ID_SYNTHETIC_OK",
      amountMinor: 20_000_100,
      currency: "TWD",
      passengerId: owner,
    });
    expect(overLimit).toEqual({
      status: "failed",
      error: "card_declined",
      retryable: false,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Definitive decline marks the BindCardID as non-reauthorizable across instances
    const declined = await provider.capture({
      idempotencyKey: "pax:capture:order-002",
      token: "ECPAY_BIND_CARD_ID_DECLINED",
      amountMinor: 25_000,
      currency: "TWD",
      passengerId: owner,
    });
    expect(declined).toEqual({
      status: "failed",
      error: "card_declined",
      retryable: false,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);

    // Attempting to re-authorize the same declined BindCardID on the same or a new provider instance is blocked before network I/O
    const reattempt = await provider.capture({
      idempotencyKey: "pax:capture:order-003",
      token: "ECPAY_BIND_CARD_ID_DECLINED",
      amountMinor: 25_000,
      currency: "TWD",
      passengerId: owner,
    });
    expect(reattempt).toEqual({
      status: "failed",
      error: "card_declined",
      retryable: false,
    });
    const secondInstance = new EcpayPaymentProvider({
      ...SYNTHETIC_CREDENTIALS,
      sandbox: true,
      fetchFn: fetchFn as unknown as typeof fetch,
      now: () => now,
    });
    const crossInstanceReattempt = await secondInstance.capture({
      idempotencyKey: "pax:capture:order-004",
      token: "ECPAY_BIND_CARD_ID_DECLINED",
      amountMinor: 25_000,
      currency: "TWD",
      passengerId: owner,
    });
    expect(crossInstanceReattempt).toEqual({
      status: "failed",
      error: "card_declined",
      retryable: false,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("queries Cashier/QueryTrade for readCapture (requiring explicit TradeStatus), executes state-dependent Credit/DoAction (R, N, E+N) from CreditDetail/QueryTrade, and reconciles lost-ACK readRefund via CreditDetail/QueryTrade across instances", async () => {
    const expectedTradeNo = deriveEcpayMerchantTradeNo("pax:capture:order-999");
    const fetchFn = vi
      .fn()
      // 1. readCapture -> Cashier/QueryTrade
      .mockImplementationOnce(async (url: string | URL) => {
        expect(String(url)).toBe(
          "https://ecpayment-stage.ecpay.com.tw/1.0.0/Cashier/QueryTrade",
        );
        return buildMockResponse(
          {
            RtnCode: 1,
            RtnMsg: "Success",
            OrderInfo: {
              TradeNo: "2610241000009999",
              TradeStatus: 1,
            },
          },
          now,
        );
      })
      // 2. refund (closed trade: RtnValue.Status="Closed") -> CreditDetail/QueryTrade
      .mockImplementationOnce(async (url: string | URL) => {
        expect(String(url)).toBe(
          "https://ecpayment-stage.ecpay.com.tw/1.0.0/CreditDetail/QueryTrade",
        );
        return buildMockResponse(
          {
            RtnMsg: "",
            RtnValue: {
              credit_id: "2610241000009999",
              amount: 350,
              status: "Closed",
              close_data: [{ status: "Closed", amount: 350 }],
            },
          },
          now,
        );
      })
      // 3. refund (closed trade) -> Credit/DoAction R
      .mockImplementationOnce(async (url: string | URL, init?: RequestInit) => {
        expect(String(url)).toBe(
          "https://ecpayment-stage.ecpay.com.tw/1.0.0/Credit/DoAction",
        );
        const unwrapped = verifyAndUnwrapEcpayEnvelope({
          envelope: JSON.parse(String(init?.body ?? "{}")),
          ...SYNTHETIC_CREDENTIALS,
          nowSeconds,
        });
        expect(unwrapped.data.Action).toBe("R");
        expect(unwrapped.data.TradeNo).toBe("2610241000009999");
        expect(unwrapped.data.TotalAmount).toBe(350);
        return buildMockResponse(
          {
            RtnCode: 1,
            RtnMsg: "Refund Succeeded",
            TradeNo: "2610241000009999",
          },
          now,
        );
      })
      // 4. refund (authorized/unclosed: RtnValue.Status="Authorized") -> CreditDetail/QueryTrade
      .mockResolvedValueOnce(
        buildMockResponse(
          {
            RtnMsg: "",
            RtnValue: {
              credit_id: "2610241000008888",
              amount: 220,
              status: "Authorized",
              close_data: [],
            },
          },
          now,
        ),
      )
      // 5. refund (authorized/unclosed) -> Credit/DoAction N
      .mockImplementationOnce(
        async (_url: string | URL, init?: RequestInit) => {
          const unwrapped = verifyAndUnwrapEcpayEnvelope({
            envelope: JSON.parse(String(init?.body ?? "{}")),
            ...SYNTHETIC_CREDENTIALS,
            nowSeconds,
          });
          expect(unwrapped.data.Action).toBe("N");
          expect(unwrapped.data.TradeNo).toBe("2610241000008888");
          expect(unwrapped.data.TotalAmount).toBe(220);
          return buildMockResponse(
            {
              RtnCode: 1,
              RtnMsg: "Cancel Succeeded",
              TradeNo: "2610241000008888",
            },
            now,
          );
        },
      )
      // 6. refund (pending close: close_data status="ToBeClosed") -> CreditDetail/QueryTrade
      .mockResolvedValueOnce(
        buildMockResponse(
          {
            RtnMsg: "",
            RtnValue: {
              credit_id: "2610241000007777",
              amount: 180,
              status: "Authorized",
              close_data: [{ status: "ToBeClosed", amount: 180 }],
            },
          },
          now,
        ),
      )
      // 7. refund (pending close) -> Credit/DoAction E
      .mockImplementationOnce(
        async (_url: string | URL, init?: RequestInit) => {
          const unwrapped = verifyAndUnwrapEcpayEnvelope({
            envelope: JSON.parse(String(init?.body ?? "{}")),
            ...SYNTHETIC_CREDENTIALS,
            nowSeconds,
          });
          expect(unwrapped.data.Action).toBe("E");
          expect(unwrapped.data.TotalAmount).toBe(180);
          return buildMockResponse(
            { RtnCode: 1, RtnMsg: "Abandon Close OK" },
            now,
          );
        },
      )
      // 8. refund (pending close) -> Credit/DoAction N
      .mockImplementationOnce(
        async (_url: string | URL, init?: RequestInit) => {
          const unwrapped = verifyAndUnwrapEcpayEnvelope({
            envelope: JSON.parse(String(init?.body ?? "{}")),
            ...SYNTHETIC_CREDENTIALS,
            nowSeconds,
          });
          expect(unwrapped.data.Action).toBe("N");
          expect(unwrapped.data.TotalAmount).toBe(180);
          return buildMockResponse({ RtnCode: 1, RtnMsg: "Cancel OK" }, now);
        },
      )
      // 9. cross-instance readRefund -> CreditDetail/QueryTrade using original capture idempotencyKey
      .mockImplementationOnce(async (url: string | URL, init?: RequestInit) => {
        expect(String(url)).toBe(
          "https://ecpayment-stage.ecpay.com.tw/1.0.0/CreditDetail/QueryTrade",
        );
        const unwrapped = verifyAndUnwrapEcpayEnvelope({
          envelope: JSON.parse(String(init?.body ?? "{}")),
          ...SYNTHETIC_CREDENTIALS,
          nowSeconds,
        });
        expect(unwrapped.data.MerchantTradeNo).toBe(expectedTradeNo);
        return buildMockResponse(
          {
            RtnMsg: "",
            RtnValue: {
              credit_id: "2610241000009999",
              amount: 350,
              status: "Cancelled",
              close_data: [{ status: "Cancelled", amount: 350 }],
            },
          },
          now,
        );
      });

    const provider = new EcpayPaymentProvider({
      ...SYNTHETIC_CREDENTIALS,
      sandbox: true,
      fetchFn: fetchFn as unknown as typeof fetch,
      now: () => now,
    });

    const readback = await provider.readCapture("pax:capture:order-999");
    expect(readback).toEqual({
      status: "completed",
      providerRef: `${expectedTradeNo}:2610241000009999`,
    });

    const refundedClosed = await provider.refund({
      idempotencyKey: "pax:refund:order-999",
      captureRef: `${expectedTradeNo}:2610241000009999`,
      amountMinor: 35_000,
      currency: "TWD",
    });
    expect(refundedClosed).toEqual({
      status: "completed",
      providerRef: `ecpay_refund:${expectedTradeNo}:2610241000009999`,
    });

    const unclosedTradeNo = deriveEcpayMerchantTradeNo("pax:capture:order-888");
    const refundedUnclosed = await provider.refund({
      idempotencyKey: "pax:refund:order-888",
      captureRef: `${unclosedTradeNo}:2610241000008888`,
      amountMinor: 22_000,
      currency: "TWD",
    });
    expect(refundedUnclosed).toEqual({
      status: "completed",
      providerRef: `ecpay_refund:${unclosedTradeNo}:2610241000008888`,
    });

    const pendingCloseTradeNo = deriveEcpayMerchantTradeNo(
      "pax:capture:order-777",
    );
    const refundedPendingClose = await provider.refund({
      idempotencyKey: "pax:refund:order-777",
      captureRef: `${pendingCloseTradeNo}:2610241000007777`,
      amountMinor: 18_000,
      currency: "TWD",
    });
    expect(refundedPendingClose).toEqual({
      status: "completed",
      providerRef: `ecpay_refund:${pendingCloseTradeNo}:2610241000007777`,
    });

    // Cross-instance readRefund on a new provider instance resolves via CreditDetail/QueryTrade without DoAction
    const freshInstance = new EcpayPaymentProvider({
      ...SYNTHETIC_CREDENTIALS,
      sandbox: true,
      fetchFn: fetchFn as unknown as typeof fetch,
      now: () => now,
    });
    const lostAckReadback = await freshInstance.readRefund(
      "pax:capture:order-999",
    );
    expect(lostAckReadback).toEqual({
      status: "completed",
      providerRef: `ecpay_refund:${expectedTradeNo}:2610241000009999`,
    });
  });

  it("handles 10300066 pending capture without declining card, requires TradeStatus on readCapture, never defaults missing CloseStatus to DoAction R, and classifies payment callbacks with CardInfo", async () => {
    const owner = "pax_uuid_0009_safe";
    const fetchFn = vi
      .fn()
      // 1. capture returns 10300066 (交易結果待確認)
      .mockResolvedValueOnce(
        buildMockResponse(
          {
            RtnCode: 10300066,
            RtnMsg: "交易結果待確認",
          },
          now,
        ),
      )
      // 2. readCapture queries QueryTrade when TradeStatus is omitted -> returns unknown
      .mockResolvedValueOnce(
        buildMockResponse(
          {
            RtnCode: 1,
            RtnMsg: "SuccessWithoutTradeStatus",
            OrderInfo: {
              TradeNo: "2610241000005555",
            },
          },
          now,
        ),
      )
      // 3. refund when QueryTrade response omits RtnValue/CloseStatus -> returns unknown without calling DoAction
      .mockResolvedValueOnce(
        buildMockResponse(
          {
            RtnCode: 1,
            RtnMsg: "SuccessWithoutCloseStatus",
            OrderInfo: {
              TradeNo: "2610241000005555",
              TradeStatus: 1,
              TotalAmount: 350,
            },
          },
          now,
        ),
      );

    const provider = new EcpayPaymentProvider({
      ...SYNTHETIC_CREDENTIALS,
      sandbox: true,
      fetchFn: fetchFn as unknown as typeof fetch,
      now: () => now,
    });
    expect(provider.bindingAuthAmountTwd).toBe(5);

    const pendingCapture = await provider.capture({
      idempotencyKey: "pax:capture:order-pending-10300066",
      token: "ECPAY_BIND_CARD_ID_PENDING_OK",
      amountMinor: 35_000,
      currency: "TWD",
      passengerId: owner,
    });
    expect(pendingCapture).toEqual({ status: "pending" });
    expect(provider.isBindCardIdDeclined("ECPAY_BIND_CARD_ID_PENDING_OK")).toBe(
      false,
    );

    const readWithoutStatus = await provider.readCapture(
      "pax:capture:order-pending-10300066",
    );
    expect(readWithoutStatus).toEqual({ status: "unknown" });

    const refundWithoutCloseState = await provider.refund({
      idempotencyKey: "pax:refund:order-no-close",
      captureRef: "DR1234567890ABCDEF12:2610241000005555",
      amountMinor: 35_000,
      currency: "TWD",
    });
    expect(refundWithoutCloseState).toEqual({ status: "unknown" });
    expect(fetchFn).toHaveBeenCalledTimes(3);

    // Payment ReturnURL callback with CardInfo (no BindCardID) is classified as kind: "payment"
    const paymentCallback = buildEcpayEnvelope({
      ...SYNTHETIC_CREDENTIALS,
      timestamp: nowSeconds,
      data: {
        RtnCode: 1,
        RtnMsg: "Succeeded",
        OrderInfo: {
          MerchantTradeNo: "DRPAY000000000000001",
          TradeNo: "26102400000888",
          TradeStatus: 1,
          TotalAmount: 350,
        },
        CardInfo: {
          Card6No: "431195",
          Card4No: "2222",
          AuthCode: "777777",
        },
      },
    });
    expect(provider.verifyNotification(paymentCallback)).toEqual({
      kind: "payment",
      rtnCode: 1,
      rtnMsg: "Succeeded",
      merchantTradeNo: "DRPAY000000000000001",
      tradeNo: "26102400000888",
      authorizedAmountMinor: 35_000,
      paymentResult: {
        status: "completed",
        providerRef: "DRPAY000000000000001:26102400000888",
      },
    });
  });
});

describe("All-or-nothing ECPay secret loading & capture policy guardrails", () => {
  const fullEnv = {
    PSP_PROVIDER: "ecpay",
    PSP_MERCHANT_ID: SYNTHETIC_MERCHANT_ID,
    PSP_HASH_KEY: SYNTHETIC_HASH_KEY,
    PSP_HASH_IV: SYNTHETIC_HASH_IV,
    PSP_SANDBOX: "true",
    PSP_TOKEN_ENCRYPTION_KEY_NAME: syntheticEncryptionKeysJson(),
  };

  it("activates EcpayPaymentProvider only when all 5 required secrets and token cipher keys are present", () => {
    const runtime = paymentRuntimeFromEnv(fullEnv);
    expect(runtime.provider.available).toBe(true);
    expect(runtime.provider.name).toBe("ecpay");
    expect(runtime.cipher).not.toBeNull();
  });

  it.each(ECPAY_PAYMENT_REQUIRED_SECRETS)(
    "fails closed when required secret %s is missing",
    (missingKey) => {
      const partialEnv = { ...fullEnv, [missingKey]: "" };
      const runtime = paymentRuntimeFromEnv(partialEnv);
      expect(runtime.provider.available).toBe(false);
      expect(runtime.provider.name).toBe("unconfigured");
      expect(runtime.cipher).toBeNull();
    },
  );

  it("forbids retryDefinitiveDeclines=true when provider is ecpay", () => {
    const runtime = paymentRuntimeFromEnv(fullEnv);
    expect(() =>
      paymentCapturePolicyFromEnv(
        {
          PAX_PAYMENT_CAPTURE_ENABLED: "true",
          PAX_PAYMENT_CAPTURE_POLICY: JSON.stringify({
            retryDelaysMs: [60000],
            retryDefinitiveDeclines: true,
            unknownReadbackDelaysMs: [1000, 3000],
          }),
        },
        runtime,
      ),
    ).toThrow(/payment_capture_configuration_invalid/);

    const validPolicy = paymentCapturePolicyFromEnv(
      {
        PAX_PAYMENT_CAPTURE_ENABLED: "true",
        PAX_PAYMENT_CAPTURE_POLICY: JSON.stringify({
          retryDelaysMs: [60000],
          retryDefinitiveDeclines: false,
          unknownReadbackDelaysMs: [1000, 3000],
        }),
      },
      runtime,
    );
    expect(validPolicy).not.toBeNull();
    expect(validPolicy?.retryDefinitiveDeclines).toBe(false);
  });
});

describe("5-card per member limit in PaymentMethodService & PaymentMethodRepository", () => {
  it("rejects the 6th card in PaymentMethodService.bind and createBindingSession with 409 card_limit_exceeded", async () => {
    const fiveCards = Array.from({ length: 5 }, (_, idx) => ({
      paymentMethodId: `00000000-0000-4000-8000-00000000000${idx + 1}`,
      last4: `000${idx + 1}`,
      cardType: "VISA",
      expiryMonth: "12",
      expiryYear: "2099",
      isDefault: idx === 0,
    }));
    const repository = {
      claimBinding: vi.fn().mockResolvedValue({
        idempotencyKey: "pax:bind:sixth",
        methodId: "00000000-0000-4000-8000-000000000006",
        completed: null,
      }),
      completeBinding: vi.fn(),
      bindingOutcome: vi.fn(),
      list: vi.fn().mockResolvedValue(fiveCards),
      setDefault: vi.fn(),
      remove: vi.fn(),
    };
    const runtime = paymentRuntimeFromEnv({
      PSP_PROVIDER: "ecpay",
      PSP_MERCHANT_ID: SYNTHETIC_MERCHANT_ID,
      PSP_HASH_KEY: SYNTHETIC_HASH_KEY,
      PSP_HASH_IV: SYNTHETIC_HASH_IV,
      PSP_SANDBOX: "true",
      PSP_TOKEN_ENCRYPTION_KEY_NAME: syntheticEncryptionKeysJson(),
    });
    const bindSpy = vi.spyOn(runtime.provider, "bind");
    const service = new PaymentMethodService(
      repository as unknown as PaymentMethodRepository,
      runtime,
    );

    await expect(
      service.bind("pax_owner_five_cards", {
        providerToken: "synthetic_credential_sixth_card",
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "card_limit_exceeded",
    });
    expect(bindSpy).not.toHaveBeenCalled();
    expect(repository.bindingOutcome).toHaveBeenCalledWith(
      "pax_owner_five_cards",
      "pax:bind:sixth",
      "failed",
    );

    await expect(
      service.createBindingSession("pax_owner_five_cards", {
        email: "owner@example.com",
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "card_limit_exceeded",
    });
  });

  it("enforces the 5-card limit inside PaymentMethodRepository.completeBinding transaction", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.startsWith("SELECT status FROM passenger.accounts")) {
          return { rows: [{ status: "active" }] };
        }
        if (sql.includes("SELECT entity_id,outcome")) {
          return {
            rows: [
              {
                entity_id: "00000000-0000-4000-8000-000000000006",
                outcome: "pending",
              },
            ],
          };
        }
        if (sql.includes("SELECT COUNT(*)::int AS count")) {
          return { rows: [{ count: 5 }] };
        }
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn(),
    };
    const repository = new PaymentMethodRepository({
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as DatabaseService);
    const cipher = new PaymentTokenCipher(syntheticEncryptionKeysJson());

    await expect(
      repository.completeBinding("pax_owner_five_cards", "pax:bind:sixth", {
        paymentMethodId: "00000000-0000-4000-8000-000000000006",
        drtsPassengerId: "pax_owner_five_cards",
        provider: "ecpay",
        tokenEnvelope: cipher.encrypt(
          "ECPAY_BIND_CARD_ID_006",
          "pax_owner_five_cards",
          "00000000-0000-4000-8000-000000000006",
        ),
        last4: "0006",
        cardType: "VISA",
        expiryMonth: "12",
        expiryYear: "2099",
        isDefault: false,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "card_limit_exceeded",
    });
  });

  it("requires formally validated passengerId on EcpayPaymentProvider.bind, passes authenticated email/phone via PaymentMethodController, reconciles unauthenticated ReturnURL 3DS callback into encrypted completeBinding, cancels binding auth, and replays idempotently", async () => {
    const now = new Date("2026-10-24T10:00:00Z");
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const owner = "pax_3ds_verified_owner_001";
    const expectedMemberId = deriveEcpayMerchantMemberId(
      owner,
      SYNTHETIC_MERCHANT_ID,
    );

    const fetchFn = vi
      .fn()
      // 1. GetTokenbyBindingCard via controller.createBindingSession
      .mockImplementationOnce(async (url: string | URL, init?: RequestInit) => {
        expect(String(url)).toBe(
          "https://ecpg-stage.ecpay.com.tw/Merchant/GetTokenbyBindingCard",
        );
        const unwrapped = verifyAndUnwrapEcpayEnvelope({
          envelope: JSON.parse(String(init?.body ?? "{}")),
          ...SYNTHETIC_CREDENTIALS,
          nowSeconds,
        });
        expect(unwrapped.data.ConsumerInfo).toEqual({
          MerchantMemberID: expectedMemberId,
          Email: "pax.owner@example.com",
          Phone: "0911222333",
        });
        expect(unwrapped.data.OrderResultURL).toBe(
          "https://ride.smarttransport.tw/api/passenger-app/payment-methods/ecpay/order-result",
        );
        return buildMockResponse(
          {
            RtnCode: 1,
            RtnMsg: "Success",
            Token: "ecpay_binding_session_token_001",
            TokenExpireDate: "2026/10/24 10:30:00",
          },
          now,
        );
      })
      // 2. CreateBindCard returning ThreeDURL
      .mockResolvedValueOnce(
        buildMockResponse(
          {
            RtnCode: 1,
            RtnMsg: "Need 3DS",
            ThreeDInfo: {
              ThreeDURL:
                "https://payment-stage.ecpay.com.tw/3ds/verify-bind-001",
            },
          },
          now,
        ),
      )
      // 3. DoAction N (cancel binding verification authorization of 5 TWD)
      .mockImplementationOnce(async (url: string | URL, init?: RequestInit) => {
        expect(String(url)).toBe(
          "https://ecpayment-stage.ecpay.com.tw/1.0.0/Credit/DoAction",
        );
        const unwrapped = verifyAndUnwrapEcpayEnvelope({
          envelope: JSON.parse(String(init?.body ?? "{}")),
          ...SYNTHETIC_CREDENTIALS,
          nowSeconds,
        });
        expect(unwrapped.data.Action).toBe("N");
        expect(unwrapped.data.MerchantTradeNo).toBe("DR3DSBIND00000000001");
        expect(unwrapped.data.TradeNo).toBe("26102400000099");
        expect(unwrapped.data.TotalAmount).toBe(5);
        return buildMockResponse(
          { RtnCode: 1, RtnMsg: "Binding Auth Cancelled" },
          now,
        );
      });

    const provider = new EcpayPaymentProvider({
      ...SYNTHETIC_CREDENTIALS,
      sandbox: true,
      now: () => now,
      bindingAuthAmountTwd: 5,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(
      provider.bind("pay_token_missing_subject", "pax:bind:missing_subject"),
    ).rejects.toThrow(/formally validated passengerId/);
    await expect(
      provider.bind("pay_token_pseudo_subject", "pax:bind:pseudo_subject", {
        passengerId: "pax:bind:pseudo_subject",
      }),
    ).rejects.toThrow(/formally validated passengerId/);

    const methodId = "00000000-0000-4000-8000-000000000099";
    const idempotencyKey = "pax:bind:3ds_flow_001";
    const cipher = new PaymentTokenCipher(syntheticEncryptionKeysJson());
    let persistedCard: {
      paymentMethodId: string;
      last4: string;
      cardType: string;
      expiryMonth: string;
      expiryYear: string;
      isDefault: boolean;
    } | null = null;

    const repository = {
      claimBinding: vi.fn().mockImplementation(async () => ({
        idempotencyKey,
        methodId,
        completed: persistedCard,
      })),
      bindingOutcome: vi.fn().mockResolvedValue(undefined),
      findActionRequiredBinding: vi.fn().mockResolvedValue({
        idempotencyKey,
        methodId,
      }),
      findBindingByMerchantMember: vi
        .fn()
        .mockImplementation(
          async (matchesMemberId: (pid: string) => boolean) => {
            if (matchesMemberId(owner)) {
              return {
                passengerId: owner,
                idempotencyKey,
                methodId,
              };
            }
            return null;
          },
        ),
      completeBinding: vi
        .fn()
        .mockImplementation(async (_pax, _key, stored) => {
          persistedCard = {
            paymentMethodId: stored.paymentMethodId,
            last4: stored.last4,
            cardType: stored.cardType,
            expiryMonth: stored.expiryMonth,
            expiryYear: stored.expiryYear,
            isDefault: true,
          };
          return persistedCard;
        }),
      list: vi
        .fn()
        .mockImplementation(async () => (persistedCard ? [persistedCard] : [])),
      setDefault: vi.fn(),
      remove: vi.fn(),
    };
    const service = new PaymentMethodService(
      repository as unknown as PaymentMethodRepository,
      { provider, cipher },
    );
    const accounts = {
      getMe: vi.fn().mockResolvedValue({
        account: {
          drtsPassengerId: owner,
          status: "active",
          displayName: "測試乘客",
          phone: "0911222333",
          email: "pax.owner@example.com",
          termsAcceptedAt: "2026-10-24T00:00:00.000Z",
        },
      }),
    };
    const controller = new PaymentMethodController(
      service,
      accounts as unknown as ConstructorParameters<
        typeof PaymentMethodController
      >[1],
    );

    // Controller passes authenticated email + phone to createBindingSession
    const sessionResp = await controller.createBindingSession({
      authMode: "jwt_bearer",
      actorType: "first_party_passenger",
      actorId: owner,
      subject: owner,
      realm: "passenger",
      tenantId: null,
      drtsPassengerId: owner,
      sessionId: "sess-1",
      roleFamilies: [],
      roles: [],
      scopes: [],
      requestId: "req-1",
    });
    expect(sessionResp.data.merchantToken).toBe(
      "ecpay_binding_session_token_001",
    );

    const initial = await service.bind(owner, {
      providerToken: "ecpay_pay_token_3ds_challenge_001",
    });
    expect(initial).toEqual({
      status: "action_required",
      nextActionUrl: "https://payment-stage.ecpay.com.tw/3ds/verify-bind-001",
    });
    expect(repository.bindingOutcome).toHaveBeenCalledWith(
      owner,
      idempotencyKey,
      "action_required",
    );

    const callbackEnvelope = {
      ...buildEcpayEnvelope({
        ...SYNTHETIC_CREDENTIALS,
        timestamp: nowSeconds,
        data: {
          MerchantID: SYNTHETIC_MERCHANT_ID,
          MerchantMemberID: expectedMemberId,
          RtnCode: 1,
          RtnMsg: "3DS Bind Success",
          BindCardID: "ECPAY_3DS_COMPLETED_CARD_ID_99",
          CardInfo: {
            Card6No: "431195",
            Card4No: "2222",
            CardValidYY: "31",
            CardValidMM: "12",
          },
          OrderInfo: {
            MerchantTradeNo: "DR3DSBIND00000000001",
            TradeNo: "26102400000099",
            TotalAmount: 5,
          },
        },
      }),
      RpHeader: { Timestamp: nowSeconds },
      TransCode: 1,
      TransMsg: "Success",
    };

    await expect(
      service.verifyNotification(callbackEnvelope, {
        passengerId: "pax_foreign_attacker_999",
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "invalid_credential",
    });
    expect(repository.completeBinding).not.toHaveBeenCalled();

    // Unauthenticated ReturnURL callback on a separate Cloud Run instance (cross-instance correlation via findBindingByMerchantMember)
    const crossInstanceProvider = new EcpayPaymentProvider({
      ...SYNTHETIC_CREDENTIALS,
      sandbox: true,
      now: () => now,
      bindingAuthAmountTwd: 5,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const crossInstanceController = new PaymentMethodController(
      new PaymentMethodService(
        repository as unknown as PaymentMethodRepository,
        { provider: crossInstanceProvider, cipher },
      ),
      accounts as unknown as ConstructorParameters<
        typeof PaymentMethodController
      >[1],
    );
    const ack = await crossInstanceController.verifyNotification({
      ResultData: JSON.stringify(callbackEnvelope),
    });
    expect(ack).toBe("1|OK");
    expect(repository.findBindingByMerchantMember).toHaveBeenCalledTimes(1);
    expect(repository.completeBinding).toHaveBeenCalledTimes(1);
    const storedArg = repository.completeBinding.mock.calls[0]![2];
    expect(cipher.decrypt(storedArg.tokenEnvelope, owner, methodId)).toBe(
      "ECPAY_3DS_COMPLETED_CARD_ID_99",
    );

    // Subsequent list() returns the newly bound card
    const listed = await service.list(owner);
    expect(listed.methods).toEqual([
      {
        paymentMethodId: methodId,
        last4: "2222",
        cardType: "VISA",
        expiryMonth: "12",
        expiryYear: "2031",
        isDefault: true,
      },
    ]);

    // Browser OrderResultURL return or callback replay is idempotent
    const orderResultResp =
      await crossInstanceController.verifyOrderResult(callbackEnvelope);
    expect(orderResultResp.data).toMatchObject({
      status: "completed",
      method: {
        paymentMethodId: methodId,
        last4: "2222",
        cardType: "VISA",
        expiryMonth: "12",
        expiryYear: "2031",
        isDefault: true,
      },
    });

    // Repeated bind() call returns completed card rather than stale action_required
    const repeatedBind = await service.bind(owner, {
      providerToken: "ecpay_pay_token_3ds_challenge_001",
    });
    expect(repeatedBind).toEqual({
      status: "completed",
      method: {
        paymentMethodId: methodId,
        last4: "2222",
        cardType: "VISA",
        expiryMonth: "12",
        expiryYear: "2031",
        isDefault: true,
      },
    });
  });

  it("normalizes +886 phone numbers, rejects null/empty TransCode and production SimulatePaid=1, disambiguates multi-claim 3DS bindings by MerchantTradeNo, forwards Idempotency-Key on complete3dsBinding, and blocks cross-instance retry of durably declined cards", async () => {
    const now = new Date("2026-10-24T10:00:00Z");
    const nowSeconds = Math.floor(now.getTime() / 1000);

    expect(normalizeEcpayPhone("+886-912-345-678")).toBe("0912345678");
    expect(normalizeEcpayPhone("886987654321")).toBe("0987654321");

    const baseEnvelope = buildEcpayEnvelope({
      ...SYNTHETIC_CREDENTIALS,
      timestamp: nowSeconds,
      data: { RtnCode: 1, RtnMsg: "OK" },
    });
    expect(() =>
      verifyAndUnwrapEcpayEnvelope({
        envelope: { ...baseEnvelope, TransCode: null },
        ...SYNTHETIC_CREDENTIALS,
        nowSeconds,
      }),
    ).toThrow(/envelope verification failed/);
    expect(() =>
      verifyAndUnwrapEcpayEnvelope({
        envelope: { ...baseEnvelope, TransCode: "" },
        ...SYNTHETIC_CREDENTIALS,
        nowSeconds,
      }),
    ).toThrow(/envelope verification failed/);

    const prodProvider = new EcpayPaymentProvider({
      ...SYNTHETIC_CREDENTIALS,
      sandbox: false,
      now: () => now,
      fetchFn: vi.fn() as unknown as typeof fetch,
    });
    const simulatePaidCallback = {
      ...buildEcpayEnvelope({
        ...SYNTHETIC_CREDENTIALS,
        timestamp: nowSeconds,
        data: {
          RtnCode: 1,
          RtnMsg: "Simulated",
          SimulatePaid: 1,
          OrderInfo: {
            MerchantTradeNo: "DRSIM000000000000001",
            TradeNo: "26102400000123",
            TradeStatus: 1,
            TotalAmount: 100,
          },
        },
      }),
      RpHeader: { Timestamp: nowSeconds },
      TransCode: 1,
    };
    expect(prodProvider.verifyNotification(simulatePaidCallback)).toMatchObject(
      {
        kind: "payment",
        paymentResult: {
          status: "failed",
          error: "invalid_method",
          retryable: false,
        },
      },
    );

    // Multi-claim disambiguation in PaymentMethodRepository
    const claimKeyA = "pax:bind:claim_A";
    const claimKeyB = "pax:bind:claim_B";
    const tradeNoB = deriveEcpayMerchantTradeNo(claimKeyB);
    const mockClient = {
      query: vi.fn(async (sql: string) => {
        if (sql.startsWith("SELECT status FROM passenger.accounts")) {
          return { rows: [{ status: "active" }] };
        }
        if (sql.includes("FROM passenger.payment_idempotency")) {
          return {
            rows: [
              {
                drts_passenger_id: "pax_multi_claim_owner",
                idempotency_key: claimKeyA,
                entity_id: "00000000-0000-4000-8000-000000000011",
              },
              {
                drts_passenger_id: "pax_multi_claim_owner",
                idempotency_key: claimKeyB,
                entity_id: "00000000-0000-4000-8000-000000000022",
              },
            ],
          };
        }
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn(),
    };
    const dbRepo = new PaymentMethodRepository({
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as DatabaseService);

    // Ambiguous without matching MerchantTradeNo -> returns null (fails closed)
    const ambiguous = await dbRepo.findActionRequiredBinding(
      "pax_multi_claim_owner",
      undefined,
      "DRUNRELATED000000001",
    );
    expect(ambiguous).toBeNull();

    // Disambiguated by deterministic MerchantTradeNo -> returns exact claim B
    const matchedB = await dbRepo.findActionRequiredBinding(
      "pax_multi_claim_owner",
      undefined,
      tradeNoB,
    );
    expect(matchedB).toEqual({
      idempotencyKey: claimKeyB,
      methodId: "00000000-0000-4000-8000-000000000022",
    });

    // complete3dsBinding controller forwards @Headers("Idempotency-Key")
    const verifyNotificationSpy = vi.fn().mockResolvedValue({
      status: "completed",
      method: {
        paymentMethodId: "00000000-0000-4000-8000-000000000022",
        last4: "2222",
        cardType: "VISA",
        expiryMonth: "12",
        expiryYear: "2031",
        isDefault: true,
      },
    });
    const controller = new PaymentMethodController(
      {
        verifyNotification: verifyNotificationSpy,
      } as unknown as PaymentMethodService,
      {
        getMe: vi.fn().mockResolvedValue({
          account: { drtsPassengerId: "pax_multi_claim_owner" },
        }),
      } as unknown as ConstructorParameters<typeof PaymentMethodController>[1],
    );
    await controller.complete3dsBinding(
      {
        authMode: "jwt_bearer",
        actorType: "first_party_passenger",
        actorId: "pax_multi_claim_owner",
        subject: "pax_multi_claim_owner",
        realm: "passenger",
        tenantId: null,
        drtsPassengerId: "pax_multi_claim_owner",
        sessionId: "sess-2",
        roleFamilies: [],
        roles: [],
        scopes: [],
        requestId: "req-2",
      },
      { ResultData: "{}" },
      claimKeyB,
    );
    expect(verifyNotificationSpy).toHaveBeenCalledWith(
      { ResultData: "{}" },
      { passengerId: "pax_multi_claim_owner", idempotencyKey: claimKeyB },
    );

    // Durable cross-instance declined-card prohibition in PaymentChargeService
    const cipher = new PaymentTokenCipher(syntheticEncryptionKeysJson());
    const freshProviderFetch = vi.fn();
    const freshProvider = new EcpayPaymentProvider({
      ...SYNTHETIC_CREDENTIALS,
      sandbox: true,
      now: () => now,
      fetchFn: freshProviderFetch as unknown as typeof fetch,
    });
    const finishSpy = vi.fn().mockResolvedValue(undefined);
    const sessionMock = {
      load: vi.fn().mockResolvedValue({
        paymentId: "00000000-0000-4000-8000-000000000088",
        orderId: "00000000-0000-4000-8000-000000000099",
        passengerId: "pax_declined_owner",
        methodId: "00000000-0000-4000-8000-000000000077",
        amountMinor: 35_000,
        status: "not_selected",
        attemptCount: 0,
        readbackCount: 0,
        nextOperation: "capture",
        retryAt: null,
        lastError: null,
      }),
      begin: vi.fn().mockResolvedValue({
        paymentId: "00000000-0000-4000-8000-000000000088",
        orderId: "00000000-0000-4000-8000-000000000099",
        passengerId: "pax_declined_owner",
        methodId: "00000000-0000-4000-8000-000000000077",
        provider: "ecpay",
        methodActive: true,
        tokenEnvelope: cipher.encrypt(
          "ECPAY_DURABLY_DECLINED_CARD",
          "pax_declined_owner",
          "00000000-0000-4000-8000-000000000077",
        ),
        amountMinor: 35_000,
        attemptCount: 1,
        readbackCount: 0,
        key: "pax:capture:new_order_with_declined_card",
      }),
      hasPriorDeclineForMethod: vi.fn().mockResolvedValue(true),
      finish: finishSpy,
    };
    const chargeRepo = {
      withOrder: vi
        .fn()
        .mockImplementation(async (_orderId, cb) => cb(sessionMock)),
    };
    const chargeService = new PaymentChargeService(
      chargeRepo as unknown as PaymentChargeRepository,
      { provider: freshProvider, cipher },
      {
        retryDelaysMs: [],
        retryDefinitiveDeclines: false,
        unknownReadbackDelaysMs: [],
      },
    );
    await chargeService.processOrder(
      "00000000-0000-4000-8000-000000000099",
      now,
    );
    expect(sessionMock.hasPriorDeclineForMethod).toHaveBeenCalledWith(
      "pax_declined_owner",
      "00000000-0000-4000-8000-000000000077",
    );
    expect(finishSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "manual_recovery",
        error: "card_declined",
        retryAt: null,
      }),
    );
    expect(freshProviderFetch).not.toHaveBeenCalled();
  });

  it("enforces F2 Stage vs Production cancelBindingAuthorization boundary: Stage completes binding when DoAction is unavailable, while Production requires confirmed DoAction(N)", async () => {
    const now = new Date("2026-10-24T10:00:00Z");
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const owner = "pax_f2_boundary_owner";
    const cipher = new PaymentTokenCipher(syntheticEncryptionKeysJson());

    // 1. Stage (sandbox=true): CreateBindCard returns RtnCode=1 with TradeNo, then Stage Credit/DoAction returns 404/failure
    const stageFetch = vi
      .fn()
      .mockResolvedValueOnce(
        buildMockResponse(
          {
            RtnCode: 1,
            RtnMsg: "Stage Bind Success",
            BindCardID: "ECPAY_STAGE_BIND_CARD_001",
            CardInfo: {
              Card6No: "431195",
              Card4No: "2222",
              CardValidYY: "30",
              CardValidMM: "06",
            },
            OrderInfo: {
              MerchantTradeNo: "DRSTAGEBIND000000001",
              TradeNo: "26102400000888",
              TotalAmount: 5,
            },
          },
          now,
        ),
      )
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        async json() {
          return {};
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        async json() {
          return {};
        },
      });

    const stageProvider = new EcpayPaymentProvider({
      ...SYNTHETIC_CREDENTIALS,
      sandbox: true,
      now: () => now,
      fetchFn: stageFetch as unknown as typeof fetch,
    });

    const stageBound = await stageProvider.bind(
      "ecpay_stage_pay_token_0001",
      "pax:bind:stage_doaction_unavailable",
      { passengerId: owner },
    );
    expect(stageBound).toEqual({
      status: "completed",
      card: {
        token: "ECPAY_STAGE_BIND_CARD_001",
        last4: "2222",
        cardType: "VISA",
        expiryMonth: "06",
        expiryYear: "2030",
      },
    });

    // Stage 3DS verifyNotification also completes when Stage Credit/DoAction is unavailable
    const stage3dsClaimId = "00000000-0000-4000-8000-000000000188";
    const stageRepo = {
      findBindingByMerchantMember: vi.fn().mockResolvedValue({
        passengerId: owner,
        idempotencyKey: "pax:bind:stage_3ds_001",
        methodId: stage3dsClaimId,
      }),
      completeBinding: vi.fn(async (_pid, _key, stored) => ({
        paymentMethodId: stored.paymentMethodId,
        last4: stored.last4,
        cardType: stored.cardType,
        expiryMonth: stored.expiryMonth,
        expiryYear: stored.expiryYear,
        isDefault: true,
      })),
      bindingOutcome: vi.fn(),
    };
    const stageService = new PaymentMethodService(
      stageRepo as unknown as PaymentMethodRepository,
      { provider: stageProvider, cipher },
    );
    const stageCallbackEnvelope = {
      ...buildEcpayEnvelope({
        ...SYNTHETIC_CREDENTIALS,
        timestamp: nowSeconds,
        data: {
          RtnCode: 1,
          RtnMsg: "Stage 3DS Bind Success",
          MerchantMemberID: stageProvider.deriveMerchantMemberId(owner),
          BindCardID: "ECPAY_STAGE_3DS_CARD_002",
          CardInfo: {
            Card6No: "431195",
            Card4No: "2222",
            CardValidYY: "31",
            CardValidMM: "09",
          },
          OrderInfo: {
            MerchantTradeNo: "DRSTAGE3DS0000000002",
            TradeNo: "26102400000889",
            TotalAmount: 5,
          },
        },
      }),
      RpHeader: { Timestamp: nowSeconds },
      TransCode: 1,
    };
    const stageNotifRes = await stageService.verifyNotification(
      stageCallbackEnvelope,
    );
    expect(stageNotifRes.status).toBe("completed");
    expect(stageRepo.completeBinding).toHaveBeenCalledOnce();

    // 2. Production (sandbox=false): unconfirmed DoAction(N) must fail closed in both bind() and verifyNotification()
    const prodFetch = vi
      .fn()
      // bind() -> CreateBindCard succeeds
      .mockResolvedValueOnce(
        buildMockResponse(
          {
            RtnCode: 1,
            RtnMsg: "Prod Bind Success",
            BindCardID: "ECPAY_PROD_BIND_CARD_001",
            CardInfo: {
              Card6No: "431195",
              Card4No: "2222",
              CardValidYY: "30",
              CardValidMM: "06",
            },
            OrderInfo: {
              MerchantTradeNo: "DRPRODBIND0000000001",
              TradeNo: "26102400000777",
              TotalAmount: 5,
            },
          },
          now,
        ),
      )
      // bind() -> Credit/DoAction fails
      .mockResolvedValueOnce(
        buildMockResponse({ RtnCode: 10100001, RtnMsg: "Busy" }, now),
      )
      // bind() -> CreditDetail/QueryTrade still shows Authorized (not Cancelled)
      .mockResolvedValueOnce(
        buildMockResponse(
          {
            RtnMsg: "",
            RtnValue: { status: "Authorized", amount: 5, close_data: [] },
          },
          now,
        ),
      )
      // bind() -> DeleteMemberBindCard rollback for ECPAY_PROD_BIND_CARD_001
      .mockImplementationOnce(async (url: string | URL, init?: RequestInit) => {
        expect(String(url)).toBe(
          "https://ecpg.ecpay.com.tw/Merchant/DeleteMemberBindCard",
        );
        const unwrapped = verifyAndUnwrapEcpayEnvelope({
          envelope: JSON.parse(String(init?.body ?? "{}")),
          ...SYNTHETIC_CREDENTIALS,
          nowSeconds,
        });
        expect(unwrapped.data.BindCardID).toBe("ECPAY_PROD_BIND_CARD_001");
        return buildMockResponse({ RtnCode: 1, RtnMsg: "Unbound" }, now);
      })
      // verifyNotification() -> Credit/DoAction fails
      .mockResolvedValueOnce(
        buildMockResponse({ RtnCode: 10100001, RtnMsg: "Busy" }, now),
      )
      // verifyNotification() -> CreditDetail/QueryTrade still shows Authorized
      .mockResolvedValueOnce(
        buildMockResponse(
          {
            RtnMsg: "",
            RtnValue: { status: "Authorized", amount: 5, close_data: [] },
          },
          now,
        ),
      )
      // verifyNotification() -> DeleteMemberBindCard rollback for ECPAY_STAGE_3DS_CARD_002
      .mockImplementationOnce(async (url: string | URL, init?: RequestInit) => {
        expect(String(url)).toBe(
          "https://ecpg.ecpay.com.tw/Merchant/DeleteMemberBindCard",
        );
        const unwrapped = verifyAndUnwrapEcpayEnvelope({
          envelope: JSON.parse(String(init?.body ?? "{}")),
          ...SYNTHETIC_CREDENTIALS,
          nowSeconds,
        });
        expect(unwrapped.data.BindCardID).toBe("ECPAY_STAGE_3DS_CARD_002");
        return buildMockResponse({ RtnCode: 1, RtnMsg: "Unbound" }, now);
      });

    const prodProvider = new EcpayPaymentProvider({
      ...SYNTHETIC_CREDENTIALS,
      sandbox: false,
      now: () => now,
      fetchFn: prodFetch as unknown as typeof fetch,
    });

    await expect(
      prodProvider.bind(
        "ecpay_prod_pay_token_0001",
        "pax:bind:prod_doaction_failed",
        { passengerId: owner },
      ),
    ).rejects.toThrow(/cancellation was not confirmed/);

    const prodRepo = {
      findBindingByMerchantMember: vi.fn().mockResolvedValue({
        passengerId: owner,
        idempotencyKey: "pax:bind:prod_3ds_001",
        methodId: stage3dsClaimId,
      }),
      completeBinding: vi.fn(),
      bindingOutcome: vi.fn().mockResolvedValue(undefined),
    };
    const prodService = new PaymentMethodService(
      prodRepo as unknown as PaymentMethodRepository,
      { provider: prodProvider, cipher },
    );
    await expect(
      prodService.verifyNotification(stageCallbackEnvelope),
    ).rejects.toMatchObject({
      status: 503,
      code: "payment_unavailable",
    });
    expect(prodRepo.bindingOutcome).toHaveBeenCalledWith(
      owner,
      "pax:bind:prod_3ds_001",
      "failed",
      "card_declined",
    );
    expect(prodRepo.completeBinding).not.toHaveBeenCalled();
    expect(prodFetch).toHaveBeenCalledTimes(7);
    expect(prodProvider.getOrphanedBindCardRollbacks()).toHaveLength(0);

    // 3. Production (sandbox=false): missing TradeNo/MerchantTradeNo fails closed (does NOT skip cancelBindingAuthorization)
    // and when rollback DeleteMemberBindCard fails, emits structured error log + records OrphanedBindCardRollbackRecord
    const loggerErrorSpy = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);

    // 3a. bind() with missing TradeNo -> fails closed and when DeleteMemberBindCard fails, records orphan rollback alert
    prodFetch
      .mockResolvedValueOnce(
        buildMockResponse(
          {
            RtnCode: 1,
            RtnMsg: "Prod Bind Missing TradeNo",
            BindCardID: "ECPAY_PROD_ORPHAN_CARD_003",
            CardInfo: {
              Card6No: "431195",
              Card4No: "2222",
              CardValidYY: "30",
              CardValidMM: "06",
            },
            OrderInfo: {
              MerchantTradeNo: "DRPRODMISSINGTRADENO",
              // TradeNo intentionally omitted
              TotalAmount: 5,
            },
          },
          now,
        ),
      )
      // DeleteMemberBindCard rollback fails (RtnCode=10100001)
      .mockResolvedValueOnce(
        buildMockResponse(
          { RtnCode: 10100001, RtnMsg: "Unbind upstream outage" },
          now,
        ),
      )
      // 3b. verifyNotification() with missing TradeNo -> fails closed and triggers DeleteMemberBindCard rollback
      .mockResolvedValueOnce(
        buildMockResponse(
          { RtnCode: 10100001, RtnMsg: "Unbind 3DS outage" },
          now,
        ),
      );

    await expect(
      prodProvider.bind(
        "ecpay_prod_pay_token_missing_tradeno",
        "pax:bind:prod_missing_tradeno",
        { passengerId: owner },
      ),
    ).rejects.toThrow(/requires MerchantTradeNo and TradeNo in production/);

    const missingTradeNoCallbackEnvelope = {
      ...buildEcpayEnvelope({
        ...SYNTHETIC_CREDENTIALS,
        timestamp: nowSeconds,
        data: {
          RtnCode: 1,
          RtnMsg: "Prod 3DS Missing TradeNo",
          MerchantMemberID: prodProvider.deriveMerchantMemberId(owner),
          BindCardID: "ECPAY_PROD_3DS_ORPHAN_CARD_004",
          CardInfo: {
            Card6No: "431195",
            Card4No: "2222",
            CardValidYY: "31",
            CardValidMM: "09",
          },
          OrderInfo: {
            MerchantTradeNo: "DRPROD3DSNOTRADENO01",
            // TradeNo intentionally omitted
            TotalAmount: 5,
          },
        },
      }),
      RpHeader: { Timestamp: nowSeconds },
      TransCode: 1,
    };

    await expect(
      prodService.verifyNotification(missingTradeNoCallbackEnvelope),
    ).rejects.toMatchObject({
      status: 503,
      code: "payment_unavailable",
    });
    expect(prodRepo.completeBinding).not.toHaveBeenCalled();

    const orphanRollbacks = prodProvider.getOrphanedBindCardRollbacks();
    expect(orphanRollbacks).toHaveLength(2);
    expect(orphanRollbacks[0]).toMatchObject({
      passengerId: owner,
      memberId: prodProvider.deriveMerchantMemberId(owner),
      merchantTradeNo: "DRPRODMISSINGTRADENO",
      tradeNo: null,
      reason: "missing_trade_identifiers_for_cancel",
      occurredAt: now.toISOString(),
    });
    expect(orphanRollbacks[0]!.bindCardIdDigest).toMatch(/^[0-9a-f]{16}$/);
    // Raw BindCardID must never appear in the rollback record or error logs
    expect(JSON.stringify(orphanRollbacks)).not.toContain(
      "ECPAY_PROD_ORPHAN_CARD_003",
    );
    expect(JSON.stringify(orphanRollbacks)).not.toContain(
      "ECPAY_PROD_3DS_ORPHAN_CARD_004",
    );
    expect(loggerErrorSpy).toHaveBeenCalledTimes(2);
    expect(String(loggerErrorSpy.mock.calls[0]?.[0])).toContain(
      "ecpay_orphan_bind_card_rollback_failed",
    );
    expect(String(loggerErrorSpy.mock.calls[0]?.[0])).not.toContain(
      "ECPAY_PROD_ORPHAN_CARD_003",
    );
    loggerErrorSpy.mockRestore();
  });

  it("calls ECPay DeleteMemberBindCard on PaymentMethodService.remove (F3) inside a single atomic DB transaction with unsettled-ride checks, blocks removal on unsettled ride or unbind failure, and frees the 5-card slot for re-binding", async () => {
    const now = new Date("2026-10-24T10:00:00Z");
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const owner = "pax_f3_unbind_owner";
    const methodId5 = "00000000-0000-4000-8000-000000000005";
    const cipher = new PaymentTokenCipher(syntheticEncryptionKeysJson());
    const encryptedCard5 = cipher.encrypt(
      "ECPAY_BIND_CARD_SLOT_5",
      owner,
      methodId5,
    );

    const fetchFn = vi
      .fn()
      // 1. First remove attempt: DeleteMemberBindCard fails -> transaction rolls back, local card NOT removed
      .mockImplementationOnce(async (url: string | URL, init?: RequestInit) => {
        expect(String(url)).toBe(
          "https://ecpg-stage.ecpay.com.tw/Merchant/DeleteMemberBindCard",
        );
        const unwrapped = verifyAndUnwrapEcpayEnvelope({
          envelope: JSON.parse(String(init?.body ?? "{}")),
          ...SYNTHETIC_CREDENTIALS,
          nowSeconds,
        });
        expect(unwrapped.data).toEqual({
          PlatformID: "",
          MerchantID: SYNTHETIC_MERCHANT_ID,
          BindCardID: "ECPAY_BIND_CARD_SLOT_5",
        });
        return buildMockResponse(
          { RtnCode: 10100001, RtnMsg: "System busy" },
          now,
        );
      })
      // 2. Second remove attempt: DeleteMemberBindCard succeeds, but a concurrent unsettled ride appears before UPDATE -> rolls back with 409 pending_payment_block
      .mockResolvedValueOnce(
        buildMockResponse({ RtnCode: 1, RtnMsg: "Success" }, now),
      )
      // 3. Third remove attempt: DeleteMemberBindCard succeeds (RtnCode=1) and no unsettled ride -> single transaction commits removal
      .mockImplementationOnce(async (url: string | URL, init?: RequestInit) => {
        expect(String(url)).toBe(
          "https://ecpg-stage.ecpay.com.tw/Merchant/DeleteMemberBindCard",
        );
        const unwrapped = verifyAndUnwrapEcpayEnvelope({
          envelope: JSON.parse(String(init?.body ?? "{}")),
          ...SYNTHETIC_CREDENTIALS,
          nowSeconds,
        });
        expect(unwrapped.data.BindCardID).toBe("ECPAY_BIND_CARD_SLOT_5");
        return buildMockResponse({ RtnCode: 1, RtnMsg: "Success" }, now);
      });

    const provider = new EcpayPaymentProvider({
      ...SYNTHETIC_CREDENTIALS,
      sandbox: true,
      now: () => now,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const activeCards = [1, 2, 3, 4, 5].map((i) => ({
      payment_method_id: `00000000-0000-4000-8000-00000000000${i}`,
      last4: `111${i}`,
      card_type: "VISA",
      expiry_month: "12",
      expiry_year: "2030",
      is_default: i === 1,
    }));

    let simulatePostUnbindConcurrentRide = false;
    let bookingHistoryQueryCountInTx = 0;
    const txQueries: string[] = [];
    const mockClient = {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        txQueries.push(sql);
        if (sql === "BEGIN") {
          bookingHistoryQueryCountInTx = 0;
          return { rows: [], rowCount: 0 };
        }
        if (sql.startsWith("SELECT status FROM passenger.accounts")) {
          return { rows: [{ status: "active" }], rowCount: 1 };
        }
        if (
          sql.startsWith("SELECT payment_method_id FROM passenger.psp_tokens")
        ) {
          const id = String(params?.[0] ?? "");
          const found = activeCards.find((c) => c.payment_method_id === id);
          return {
            rows: found ? [{ payment_method_id: found.payment_method_id }] : [],
            rowCount: found ? 1 : 0,
          };
        }
        if (sql.includes("FROM passenger.booking_histories")) {
          bookingHistoryQueryCountInTx += 1;
          if (
            simulatePostUnbindConcurrentRide &&
            bookingHistoryQueryCountInTx >= 2
          ) {
            return { rows: [{ "?column?": 1 }], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }
        if (
          sql.startsWith(
            "SELECT provider,token_envelope FROM passenger.psp_tokens",
          )
        ) {
          return {
            rows: [
              {
                provider: "ecpay",
                token_envelope: encryptedCard5,
              },
            ],
            rowCount: 1,
          };
        }
        if (
          sql.startsWith("UPDATE passenger.psp_tokens SET status='removed'")
        ) {
          const id = String(params?.[0] ?? "");
          const idx = activeCards.findIndex((c) => c.payment_method_id === id);
          if (idx >= 0) activeCards.splice(idx, 1);
          return { rows: [], rowCount: 1 };
        }
        if (
          sql.startsWith(
            "SELECT payment_method_id,last4,card_type,expiry_month,expiry_year,is_default",
          )
        ) {
          return { rows: [...activeCards], rowCount: activeCards.length };
        }
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn(),
    };

    const realRepo = new PaymentMethodRepository({
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as DatabaseService);

    const service = new PaymentMethodService(realRepo, { provider, cipher });

    // 1. When DeleteMemberBindCard fails, remove() throws 503 payment_unavailable and rolls back without UPDATE
    txQueries.length = 0;
    await expect(service.remove(owner, methodId5)).rejects.toMatchObject({
      status: 503,
      code: "payment_unavailable",
    });
    expect(txQueries.filter((q) => q === "BEGIN")).toHaveLength(1);
    expect(txQueries.filter((q) => q === "ROLLBACK")).toHaveLength(1);
    expect(txQueries.some((q) => q.includes("SET status='removed'"))).toBe(
      false,
    );
    expect(activeCards).toHaveLength(5);

    // 2. When a concurrent ride is inserted during unbind(), post-unbind check in the same transaction blocks with 409 and rolls back
    txQueries.length = 0;
    simulatePostUnbindConcurrentRide = true;
    await expect(service.remove(owner, methodId5)).rejects.toMatchObject({
      status: 409,
      code: "pending_payment_block",
    });
    expect(txQueries.filter((q) => q === "BEGIN")).toHaveLength(1);
    expect(txQueries.filter((q) => q === "ROLLBACK")).toHaveLength(1);
    expect(txQueries.some((q) => q.includes("SET status='removed'"))).toBe(
      false,
    );
    expect(activeCards).toHaveLength(5);

    // 3. When DeleteMemberBindCard succeeds and no unsettled ride exists, remove() runs in a single transaction (1 BEGIN, 1 COMMIT) and frees the 5th slot
    txQueries.length = 0;
    simulatePostUnbindConcurrentRide = false;
    await expect(service.remove(owner, methodId5)).resolves.toEqual({
      success: true,
    });
    expect(txQueries.filter((q) => q === "BEGIN")).toHaveLength(1);
    expect(txQueries.filter((q) => q === "COMMIT")).toHaveLength(1);
    expect(
      txQueries.some((q) =>
        q.includes(
          "SELECT provider,token_envelope FROM passenger.psp_tokens\n           WHERE payment_method_id=$1 AND drts_passenger_id=$2 AND status='active' FOR UPDATE",
        ),
      ),
    ).toBe(true);
    expect(activeCards).toHaveLength(4);
    expect(fetchFn).toHaveBeenCalledTimes(3);

    // 4. If ECPay upstream still reports member bound-card limit exceeded on CreateBindCard,
    // provider maps it to card_limit_exceeded and service surfaces 409 card_limit_exceeded (not 400 card_declined)
    fetchFn.mockResolvedValueOnce(
      buildMockResponse(
        {
          RtnCode: 10100255,
          RtnMsg: "綁定卡片數量已達上限(最多5張)",
        },
        now,
      ),
    );
    const repoWithClaim = {
      list: vi.fn(async () => []),
      claimBinding: vi.fn(async () => ({
        idempotencyKey: "pax:bind:f3_limit_001",
        methodId: "00000000-0000-4000-8000-000000000006",
        completed: null,
      })),
      bindingOutcome: vi.fn(async () => undefined),
    };
    const serviceWithClaim = new PaymentMethodService(
      repoWithClaim as unknown as PaymentMethodRepository,
      { provider, cipher },
    );
    await expect(
      serviceWithClaim.bind(owner, {
        providerToken: "ecpay_pay_token_limit_exceeded_0001",
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "card_limit_exceeded",
    });
    expect(repoWithClaim.bindingOutcome).toHaveBeenCalledWith(
      owner,
      "pax:bind:f3_limit_001",
      "failed",
    );
  });

  it("enforces V0115 payment_idempotency_keys.error_code CHECK constraint on real PaymentMethodRepository when ECPay returns card_limit_exceeded", async () => {
    const migrationPath = resolve(
      __dirname,
      "../../../../infra/migrations/V0115__passenger_payment_core.sql",
    );
    const migrationSql = readFileSync(migrationPath, "utf8");
    const tableBlockMatch = migrationSql.match(
      /CREATE TABLE passenger\.payment_idempotency_keys\s*\(([\s\S]*?)\);/,
    );
    expect(tableBlockMatch).not.toBeNull();
    const errorCodeCheckMatch = tableBlockMatch![1]!.match(
      /error_code\s+text\s+CHECK\s*\(\s*error_code\s+IN\s*\(([^)]+)\)\s*\)/,
    );
    expect(errorCodeCheckMatch).not.toBeNull();
    const v0115AllowedErrorCodes = errorCodeCheckMatch![1]!
      .split(",")
      .map((token) => token.trim().replace(/^'|'$/g, ""))
      .filter(Boolean);
    expect(v0115AllowedErrorCodes).toEqual([
      "card_declined",
      "invalid_credential",
      "unavailable",
      "invalid_method",
    ]);
    expect([...PAYMENT_IDEMPOTENCY_ERROR_CODES]).toEqual(
      v0115AllowedErrorCodes,
    );
    expect(v0115AllowedErrorCodes).not.toContain("card_limit_exceeded");

    const now = new Date("2026-10-25T07:50:00Z");
    const owner = "pax_v0115_check_owner_001";
    const fetchFn = vi.fn().mockResolvedValueOnce(
      buildMockResponse(
        {
          RtnCode: 10100255,
          RtnMsg: "綁定卡片數量已達上限(最多5張)",
        },
        now,
      ),
    );
    const provider = new EcpayPaymentProvider({
      ...SYNTHETIC_CREDENTIALS,
      sandbox: true,
      now: () => now,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const cipher = new PaymentTokenCipher(syntheticEncryptionKeysJson());

    const journalState: {
      idempotencyKey: string;
      outcome: string;
      errorCode: string | null;
    } = {
      idempotencyKey: "",
      outcome: "pending",
      errorCode: null,
    };

    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (
          sql === "BEGIN" ||
          sql === "COMMIT" ||
          sql === "ROLLBACK" ||
          sql.startsWith("SET LOCAL lock_timeout")
        ) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes("SELECT status FROM passenger.accounts")) {
          return { rows: [{ status: "active" }], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO passenger.payment_idempotency_keys")) {
          journalState.idempotencyKey = String(params[0]);
          journalState.outcome = "pending";
          journalState.errorCode = null;
          return { rows: [], rowCount: 1 };
        }
        if (
          sql.includes(
            "SELECT drts_passenger_id,entity_id,outcome FROM passenger.payment_idempotency_keys",
          )
        ) {
          return {
            rows: [
              {
                drts_passenger_id: owner,
                entity_id: "00000000-0000-4000-8000-000000000077",
                outcome: journalState.outcome,
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes("FROM passenger.psp_tokens WHERE drts_passenger_id=$1")) {
          return { rows: [], rowCount: 0 };
        }
        if (
          sql.includes(
            "UPDATE passenger.payment_idempotency_keys SET outcome=$3,error_code=$4",
          )
        ) {
          const nextOutcome = String(params[2]);
          const nextErrorCode =
            params[3] === null || params[3] === undefined
              ? null
              : String(params[3]);
          if (
            nextErrorCode !== null &&
            !v0115AllowedErrorCodes.includes(nextErrorCode)
          ) {
            throw new Error(
              `new row for relation "payment_idempotency_keys" violates check constraint "payment_idempotency_keys_error_code_check" (error_code=${nextErrorCode})`,
            );
          }
          journalState.outcome = nextOutcome;
          journalState.errorCode = nextErrorCode;
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const realRepository = new PaymentMethodRepository({
      connect: vi.fn().mockResolvedValue(client),
      query: client.query,
    } as unknown as DatabaseService);
    const service = new PaymentMethodService(realRepository, {
      provider,
      cipher,
    });

    await expect(
      service.bind(owner, {
        providerToken: "ecpay_pay_token_v0115_limit_0001",
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "card_limit_exceeded",
    });
    expect(journalState.outcome).toBe("failed");
    expect(journalState.errorCode).toBeNull();

    // Direct repository guard: even if a caller passes a non-V0115 error string,
    // bindingOutcome never writes an invalid error_code into payment_idempotency_keys.
    journalState.outcome = "action_required";
    await expect(
      realRepository.bindingOutcome(
        owner,
        journalState.idempotencyKey,
        "failed",
        "card_limit_exceeded",
      ),
    ).resolves.toBeUndefined();
    expect(journalState.outcome).toBe("failed");
    expect(journalState.errorCode).toBeNull();

    // Valid V0115 error codes are still persisted as-is.
    journalState.outcome = "pending";
    await expect(
      realRepository.bindingOutcome(
        owner,
        journalState.idempotencyKey,
        "failed",
        "card_declined",
      ),
    ).resolves.toBeUndefined();
    expect(journalState.outcome).toBe("failed");
    expect(journalState.errorCode).toBe("card_declined");
  });
});
