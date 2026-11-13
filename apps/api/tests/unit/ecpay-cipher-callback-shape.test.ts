import { describe, expect, it } from "vitest";
import {
  buildEcpayEnvelope,
  encryptEcpayData,
  verifyAndUnwrapEcpayEnvelope,
} from "../../src/modules/passenger-app/payment/ecpay-cipher";

const SYNTHETIC_MERCHANT_ID = "SYNTHETIC_MID_01";
const SYNTHETIC_HASH_KEY = "SYNTHETIC_KEY_16";
const SYNTHETIC_HASH_IV = "SYNTHETIC_IV__16";
const SYNTHETIC_CREDENTIALS = {
  merchantId: SYNTHETIC_MERCHANT_ID,
  hashKey: SYNTHETIC_HASH_KEY,
  hashIv: SYNTHETIC_HASH_IV,
};

/**
 * ECPay's OrderResultURL / 站內付 2.0 Stage callback posts a flat form body:
 * MerchantID, RpHeader, TransCode, TransMsg, Data are all separate top-level
 * fields, and RpHeader arrives as its own JSON-encoded string (not a nested
 * object), unlike the `ResultData=<JSON(whole envelope)>` shape.
 */
function buildFlatFormCallback(params: {
  nowSeconds: number;
  data: Record<string, unknown>;
  merchantId?: string;
  rpHeader?: unknown;
}): Record<string, unknown> {
  const cipherText = encryptEcpayData(
    params.data,
    SYNTHETIC_HASH_KEY,
    SYNTHETIC_HASH_IV,
  );
  const rpHeader =
    params.rpHeader !== undefined
      ? params.rpHeader
      : JSON.stringify({ Timestamp: params.nowSeconds });
  return {
    MerchantID: params.merchantId ?? SYNTHETIC_MERCHANT_ID,
    RpHeader: rpHeader,
    TransCode: "1",
    TransMsg: "Success",
    Data: cipherText,
  };
}

describe("ECPay flat form callback (RpHeader as JSON string)", () => {
  const now = new Date("2026-11-04T02:00:00Z");
  const nowSeconds = Math.floor(now.getTime() / 1000);

  it("accepts a flat form body whose RpHeader is a JSON-encoded string", () => {
    const flatCallback = buildFlatFormCallback({
      nowSeconds,
      data: { RtnCode: 1, RtnMsg: "OK" },
    });
    const verified = verifyAndUnwrapEcpayEnvelope({
      envelope: flatCallback,
      ...SYNTHETIC_CREDENTIALS,
      nowSeconds,
    });
    expect(verified).toEqual({
      timestamp: nowSeconds,
      transCode: 1,
      transMsg: "Success",
      data: { RtnCode: 1, RtnMsg: "OK" },
    });
  });

  it("still accepts the existing ResultData=<JSON(whole envelope)> shape", () => {
    const envelope = buildEcpayEnvelope({
      ...SYNTHETIC_CREDENTIALS,
      data: { RtnCode: 1, RtnMsg: "OK" },
      timestamp: nowSeconds,
    });
    const verified = verifyAndUnwrapEcpayEnvelope({
      envelope: { ResultData: JSON.stringify(envelope) },
      ...SYNTHETIC_CREDENTIALS,
      nowSeconds,
    });
    expect(verified).toEqual({
      timestamp: nowSeconds,
      transCode: 1,
      transMsg: "",
      data: { RtnCode: 1, RtnMsg: "OK" },
    });
  });

  it("rejects a flat form body with tampered Data ciphertext", () => {
    const flatCallback = buildFlatFormCallback({
      nowSeconds,
      data: { RtnCode: 1, RtnMsg: "OK" },
    });
    const tampered = {
      ...flatCallback,
      Data: "AAAA" + String(flatCallback.Data).slice(4),
    };
    expect(() =>
      verifyAndUnwrapEcpayEnvelope({
        envelope: tampered,
        ...SYNTHETIC_CREDENTIALS,
        nowSeconds,
      }),
    ).toThrow();
  });

  it("rejects a flat form body with an expired timestamp", () => {
    const flatCallback = buildFlatFormCallback({
      nowSeconds,
      data: { RtnCode: 1, RtnMsg: "OK" },
    });
    const staleSeconds = nowSeconds + 15 * 60;
    expect(() =>
      verifyAndUnwrapEcpayEnvelope({
        envelope: flatCallback,
        ...SYNTHETIC_CREDENTIALS,
        nowSeconds: staleSeconds,
      }),
    ).toThrow();
  });

  it("rejects a flat form body with the wrong MerchantID", () => {
    const flatCallback = buildFlatFormCallback({
      nowSeconds,
      data: { RtnCode: 1, RtnMsg: "OK" },
      merchantId: "OTHER_MERCHANT",
    });
    expect(() =>
      verifyAndUnwrapEcpayEnvelope({
        envelope: flatCallback,
        ...SYNTHETIC_CREDENTIALS,
        nowSeconds,
      }),
    ).toThrow();
  });

  it("rejects a flat form body whose RpHeader string is malformed JSON", () => {
    const flatCallback = buildFlatFormCallback({
      nowSeconds,
      data: { RtnCode: 1, RtnMsg: "OK" },
      rpHeader: "{not-valid-json",
    });
    expect(() =>
      verifyAndUnwrapEcpayEnvelope({
        envelope: flatCallback,
        ...SYNTHETIC_CREDENTIALS,
        nowSeconds,
      }),
    ).toThrow();
  });

  it("rejects a flat form body whose RpHeader string parses to a non-object", () => {
    const flatCallback = buildFlatFormCallback({
      nowSeconds,
      data: { RtnCode: 1, RtnMsg: "OK" },
      rpHeader: "42",
    });
    expect(() =>
      verifyAndUnwrapEcpayEnvelope({
        envelope: flatCallback,
        ...SYNTHETIC_CREDENTIALS,
        nowSeconds,
      }),
    ).toThrow();
  });
});

/**
 * ECPay's real OrderResultURL asynchronous callback (confirmed via hosted
 * Stage run 41949723157) sends `RpHeader: null` and omits `RqHeader` entirely,
 * unlike synchronous API responses which always carry RpHeader: { Timestamp }.
 */
describe("ECPay OrderResultURL callback with RpHeader: null", () => {
  const now = new Date("2026-11-05T02:00:00Z");
  const nowSeconds = Math.floor(now.getTime() / 1000);

  it("accepts a ResultData=<JSON> envelope whose RpHeader is JSON null", () => {
    const cipherText = encryptEcpayData(
      { RtnCode: 1, RtnMsg: "OK" },
      SYNTHETIC_HASH_KEY,
      SYNTHETIC_HASH_IV,
    );
    const callback = {
      MerchantID: SYNTHETIC_MERCHANT_ID,
      RpHeader: null,
      TransCode: 1,
      TransMsg: "Success",
      Data: cipherText,
    };
    const verified = verifyAndUnwrapEcpayEnvelope({
      envelope: { ResultData: JSON.stringify(callback) },
      ...SYNTHETIC_CREDENTIALS,
      nowSeconds,
    });
    expect(verified).toEqual({
      timestamp: nowSeconds,
      transCode: 1,
      transMsg: "Success",
      data: { RtnCode: 1, RtnMsg: "OK" },
    });
  });

  it("accepts a flat form body whose RpHeader string parses to null", () => {
    const flatCallback = buildFlatFormCallback({
      nowSeconds,
      data: { RtnCode: 1, RtnMsg: "OK" },
      rpHeader: "null",
    });
    const verified = verifyAndUnwrapEcpayEnvelope({
      envelope: flatCallback,
      ...SYNTHETIC_CREDENTIALS,
      nowSeconds,
    });
    expect(verified).toEqual({
      timestamp: nowSeconds,
      transCode: 1,
      transMsg: "Success",
      data: { RtnCode: 1, RtnMsg: "OK" },
    });
  });

  it("rejects RpHeader: null with tampered Data ciphertext", () => {
    const flatCallback = buildFlatFormCallback({
      nowSeconds,
      data: { RtnCode: 1, RtnMsg: "OK" },
      rpHeader: null,
    });
    const tampered = {
      ...flatCallback,
      Data: "AAAA" + String(flatCallback.Data).slice(4),
    };
    expect(() =>
      verifyAndUnwrapEcpayEnvelope({
        envelope: tampered,
        ...SYNTHETIC_CREDENTIALS,
        nowSeconds,
      }),
    ).toThrow();
  });

  it("rejects RpHeader: null with the wrong outer MerchantID", () => {
    const flatCallback = buildFlatFormCallback({
      nowSeconds,
      data: { RtnCode: 1, RtnMsg: "OK" },
      rpHeader: null,
      merchantId: "OTHER_MERCHANT",
    });
    expect(() =>
      verifyAndUnwrapEcpayEnvelope({
        envelope: flatCallback,
        ...SYNTHETIC_CREDENTIALS,
        nowSeconds,
      }),
    ).toThrow();
  });

  it("rejects RpHeader: null when the decrypted inner data.MerchantID mismatches", () => {
    const cipherText = encryptEcpayData(
      { RtnCode: 1, RtnMsg: "OK", MerchantID: "OTHER_MERCHANT" },
      SYNTHETIC_HASH_KEY,
      SYNTHETIC_HASH_IV,
    );
    const callback = {
      MerchantID: SYNTHETIC_MERCHANT_ID,
      RpHeader: null,
      TransCode: 1,
      TransMsg: "Success",
      Data: cipherText,
    };
    expect(() =>
      verifyAndUnwrapEcpayEnvelope({
        envelope: callback,
        ...SYNTHETIC_CREDENTIALS,
        nowSeconds,
      }),
    ).toThrow();
  });

  it("still rejects a non-null RpHeader object with a missing Timestamp", () => {
    const flatCallback = buildFlatFormCallback({
      nowSeconds,
      data: { RtnCode: 1, RtnMsg: "OK" },
      rpHeader: JSON.stringify({}),
    });
    expect(() =>
      verifyAndUnwrapEcpayEnvelope({
        envelope: flatCallback,
        ...SYNTHETIC_CREDENTIALS,
        nowSeconds,
      }),
    ).toThrow();
  });

  it("still rejects a non-null RpHeader object with an expired Timestamp", () => {
    const flatCallback = buildFlatFormCallback({
      nowSeconds,
      data: { RtnCode: 1, RtnMsg: "OK" },
      rpHeader: JSON.stringify({ Timestamp: nowSeconds - 15 * 60 }),
    });
    expect(() =>
      verifyAndUnwrapEcpayEnvelope({
        envelope: flatCallback,
        ...SYNTHETIC_CREDENTIALS,
        nowSeconds,
      }),
    ).toThrow();
  });
});
