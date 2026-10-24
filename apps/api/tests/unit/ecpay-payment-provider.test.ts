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

  it("requests GetTokenbyBindingCard for createBindingSession with irreversible MerchantMemberID", async () => {
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
      expect(consumerInfo.MerchantMemberID).toMatch(/^mbr_[a-f0-9]{32}$/);
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
      orderResultUrl: "https://ride.smarttransport.tw/account/payment-methods",
    });

    const session = await provider.createBindingSession("pax_uuid_0001_safe");
    expect(session.merchantToken).toBe(
      "synthetic_ecpay_sdk_token_abcdef123456",
    );
    expect(session.serverType).toBe("Stage");
    expect(session.provider).toBe("ecpay");
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("completes CreateBindCard when CardInfo.BindCardID is returned and supports 3DS ThreeDURL redirect", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        buildMockResponse(
          {
            RtnCode: 1,
            RtnMsg: "Success",
            CardInfo: {
              BindCardID: "ECPAY_BIND_CARD_ID_SYNTHETIC_001",
              Card6No: "431195",
              Card4No: "2222",
              ExpireDate: "08/29",
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
        token: "ECPAY_BIND_CARD_ID_SYNTHETIC_001",
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
  });

  it("verifies callback notifications and rejects tampered callback envelopes", () => {
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
        CardInfo: {
          BindCardID: "ECPAY_BIND_CARD_ID_CALLBACK_001",
          Card6No: "541234",
          Card4No: "8899",
          ExpireDate: "11/2030",
        },
      },
    });

    expect(provider.verifyNotification(validCallback)).toEqual({
      kind: "bind",
      rtnCode: 1,
      rtnMsg: "Succeeded",
      merchantTradeNo: null,
      tradeNo: null,
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
    });

    const tamperedCallback = {
      ...validCallback,
      Data: "ZZZZ" + validCallback.Data.slice(4),
    };
    expect(() => provider.verifyNotification(tamperedCallback)).toThrow();
  });

  it("executes CreatePaymentWithCardID with Need3D=0, enforces amount bounds, and blocks re-authorization of a declined BindCardID", async () => {
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

    const captured = await provider.capture({
      idempotencyKey: "pax:capture:order-001",
      token: "ECPAY_BIND_CARD_ID_SYNTHETIC_OK",
      amountMinor: 350,
      currency: "TWD",
    });
    expect(captured).toEqual({
      status: "completed",
      providerRef: `${expectedTradeNo}:2610241000001234`,
    });

    // Out-of-bounds amount (> 200,000 TWD) fails closed without network I/O
    const overLimit = await provider.capture({
      idempotencyKey: "pax:capture:order-over",
      token: "ECPAY_BIND_CARD_ID_SYNTHETIC_OK",
      amountMinor: 200_001,
      currency: "TWD",
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
    });
    expect(reattempt).toEqual({
      status: "failed",
      error: "card_declined",
      retryable: false,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("queries QueryTrade for readCapture and executes DoAction R for refund", async () => {
    const expectedTradeNo = deriveEcpayMerchantTradeNo("pax:capture:order-999");
    const fetchFn = vi
      .fn()
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

    const refunded = await provider.refund({
      idempotencyKey: "pax:refund:order-999",
      captureRef: `${expectedTradeNo}:2610241000009999`,
      amountMinor: 350,
      currency: "TWD",
    });
    expect(refunded).toEqual({
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
      "card_limit_exceeded",
    );

    await expect(
      service.createBindingSession("pax_owner_five_cards"),
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
});
