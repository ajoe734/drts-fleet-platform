import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildEcpayEnvelope,
  decryptEcpayData,
  deriveEcpayMerchantMemberId,
  deriveEcpayMerchantTradeNo,
  encryptEcpayData,
  verifyAndUnwrapEcpayEnvelope,
} from "../../src/modules/passenger-app/payment/ecpay-cipher";
import { EcpayPaymentProvider } from "../../src/modules/passenger-app/payment/ecpay-payment-provider";
import { paymentCapturePolicyFromEnv } from "../../src/modules/passenger-app/payment/payment-capture.config";
import type { PaymentChargeRepository } from "../../src/modules/passenger-app/payment/payment-charge.repository";
import { PaymentChargeService } from "../../src/modules/passenger-app/payment/payment-charge.service";
import { PaymentMethodController } from "../../src/modules/passenger-app/payment/payment-method.controller";
import { PaymentMethodRepository } from "../../src/modules/passenger-app/payment/payment-method.repository";
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
      deriveEcpayMerchantMemberId("pax:bind:deadbeef1234", SYNTHETIC_MERCHANT_ID),
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
      authorizedAmountMinor: 5,
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
        amountMinor: 350,
        currency: "TWD",
      }),
    ).resolves.toEqual({
      status: "failed",
      error: "invalid_method",
      retryable: false,
    });

    // Verify PaymentChargeService passes claim.passengerId into EcpayPaymentProvider.capture
    const cipher = new PaymentTokenCipher(syntheticEncryptionKeysJson());
    const finishSpy = vi.fn().mockResolvedValue(undefined);
    const sessionMock = {
      load: vi.fn().mockResolvedValue({
        paymentId: "00000000-0000-4000-8000-000000000777",
        orderId: "00000000-0000-4000-8000-000000000111",
        passengerId: owner,
        methodId: "00000000-0000-4000-8000-000000000888",
        amountMinor: 350,
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
        amountMinor: 350,
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

    // Out-of-bounds amount (> 200,000 TWD) fails closed without network I/O
    const overLimit = await provider.capture({
      idempotencyKey: "pax:capture:order-over",
      token: "ECPAY_BIND_CARD_ID_SYNTHETIC_OK",
      amountMinor: 200_001,
      currency: "TWD",
      passengerId: owner,
    });
    expect(overLimit).toEqual({
      status: "failed",
      error: "card_declined",
      retryable: false,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Definitive decline marks the BindCardID as non-reauthorizable
    const declined = await provider.capture({
      idempotencyKey: "pax:capture:order-002",
      token: "ECPAY_BIND_CARD_ID_DECLINED",
      amountMinor: 250,
      currency: "TWD",
      passengerId: owner,
    });
    expect(declined).toEqual({
      status: "failed",
      error: "card_declined",
      retryable: false,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);

    // Attempting to re-authorize the same declined BindCardID is blocked before network I/O
    const reattempt = await provider.capture({
      idempotencyKey: "pax:capture:order-003",
      token: "ECPAY_BIND_CARD_ID_DECLINED",
      amountMinor: 250,
      currency: "TWD",
      passengerId: owner,
    });
    expect(reattempt).toEqual({
      status: "failed",
      error: "card_declined",
      retryable: false,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("queries QueryTrade for readCapture, executes state-dependent DoAction (R, N, E+N) for refund, and reconciles lost-ACK readRefund via QueryTrade across instances", async () => {
    const expectedTradeNo = deriveEcpayMerchantTradeNo("pax:capture:order-999");
    const fetchFn = vi
      .fn()
      // 1. readCapture -> QueryTrade
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
      // 2. refund (closed trade: CloseStatus=1) -> QueryTrade
      .mockResolvedValueOnce(
        buildMockResponse(
          {
            RtnCode: 1,
            RtnMsg: "Success",
            OrderInfo: {
              TradeNo: "2610241000009999",
              TradeStatus: 1,
              CloseStatus: 1,
              TotalAmount: 350,
            },
          },
          now,
        ),
      )
      // 3. refund (closed trade) -> DoAction R
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
      // 4. refund (authorized/unclosed: CloseStatus=0) -> QueryTrade
      .mockResolvedValueOnce(
        buildMockResponse(
          {
            RtnCode: 1,
            RtnMsg: "Success",
            OrderInfo: {
              TradeNo: "2610241000008888",
              TradeStatus: 1,
              CloseStatus: 0,
              TotalAmount: 220,
            },
          },
          now,
        ),
      )
      // 5. refund (authorized/unclosed) -> DoAction N
      .mockImplementationOnce(async (_url: string | URL, init?: RequestInit) => {
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
      })
      // 6. refund (pending close: CloseStatus=2) -> QueryTrade
      .mockResolvedValueOnce(
        buildMockResponse(
          {
            RtnCode: 1,
            RtnMsg: "Success",
            OrderInfo: {
              TradeNo: "2610241000007777",
              TradeStatus: 1,
              CloseStatus: 2,
              TotalAmount: 180,
            },
          },
          now,
        ),
      )
      // 7. refund (pending close) -> DoAction E
      .mockImplementationOnce(async (_url: string | URL, init?: RequestInit) => {
        const unwrapped = verifyAndUnwrapEcpayEnvelope({
          envelope: JSON.parse(String(init?.body ?? "{}")),
          ...SYNTHETIC_CREDENTIALS,
          nowSeconds,
        });
        expect(unwrapped.data.Action).toBe("E");
        return buildMockResponse({ RtnCode: 1, RtnMsg: "Abandon Close OK" }, now);
      })
      // 8. refund (pending close) -> DoAction N
      .mockImplementationOnce(async (_url: string | URL, init?: RequestInit) => {
        const unwrapped = verifyAndUnwrapEcpayEnvelope({
          envelope: JSON.parse(String(init?.body ?? "{}")),
          ...SYNTHETIC_CREDENTIALS,
          nowSeconds,
        });
        expect(unwrapped.data.Action).toBe("N");
        return buildMockResponse({ RtnCode: 1, RtnMsg: "Cancel OK" }, now);
      })
      // 9. cross-instance readRefund -> QueryTrade using original capture idempotencyKey
      .mockImplementationOnce(async (url: string | URL, init?: RequestInit) => {
        expect(String(url)).toBe(
          "https://ecpayment-stage.ecpay.com.tw/1.0.0/Cashier/QueryTrade",
        );
        const unwrapped = verifyAndUnwrapEcpayEnvelope({
          envelope: JSON.parse(String(init?.body ?? "{}")),
          ...SYNTHETIC_CREDENTIALS,
          nowSeconds,
        });
        expect(unwrapped.data.MerchantTradeNo).toBe(expectedTradeNo);
        return buildMockResponse(
          {
            RtnCode: 1,
            RtnMsg: "Success",
            OrderInfo: {
              TradeNo: "2610241000009999",
              TradeStatus: 1,
              CloseStatus: 0,
              CancelStatus: 1,
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
      amountMinor: 350,
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
      amountMinor: 220,
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
      amountMinor: 180,
      currency: "TWD",
    });
    expect(refundedPendingClose).toEqual({
      status: "completed",
      providerRef: `ecpay_refund:${pendingCloseTradeNo}:2610241000007777`,
    });

    // Cross-instance readRefund on a new provider instance resolves via QueryTrade without DoAction
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
              ThreeDURL: "https://payment-stage.ecpay.com.tw/3ds/verify-bind-001",
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
      completeBinding: vi.fn().mockImplementation(async (_pax, _key, stored) => {
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
      list: vi.fn().mockImplementation(async () =>
        persistedCard ? [persistedCard] : [],
      ),
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
      realm: "passenger",
      subject: owner,
      sessionId: "sess-1",
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
    expect(
      cipher.decrypt(storedArg.tokenEnvelope, owner, methodId),
    ).toBe("ECPAY_3DS_COMPLETED_CARD_ID_99");

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
    const orderResultResp = await crossInstanceController.verifyOrderResult(
      callbackEnvelope,
    );
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
});
