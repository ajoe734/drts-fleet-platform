import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentMethodService } from "../../../apps/api/src/modules/passenger-app/payment/payment-method.service";
import type { PaymentMethodRepository } from "../../../apps/api/src/modules/passenger-app/payment/payment-method.repository";
import { FakePaymentProvider } from "../../../apps/api/src/modules/passenger-app/payment/fake-payment-provider";

const fault = vi.hoisted(() => ({ stage: "" }));
const PRIVATE = "synthetic_private_crypto_token_detail";
const GENERIC =
  "Payment token encryption configuration or envelope is invalid.";

// Only the external crypto operation may throw. The production encrypt/AAD/
// error handling and real AES-GCM still execute; no replacement cipher logic.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    randomBytes: (size: number) => {
      if (fault.stage === "nonce")
        throw new Error("synthetic_private_crypto_token_detail");
      return actual.randomBytes(size);
    },
    createCipheriv: (...args: Parameters<typeof actual.createCipheriv>) => {
      if (fault.stage === "create")
        throw new Error("synthetic_private_crypto_token_detail");
      // Production only requests aes-256-gcm; overload Parameters otherwise
      // selects the legacy Cipheriv return type without GCM methods.
      const cipher = actual.createCipheriv(
        ...args,
      ) as import("node:crypto").CipherGCM;
      if (["setAAD", "update", "final", "getAuthTag"].includes(fault.stage)) {
        const method = fault.stage as
          | "setAAD"
          | "update"
          | "final"
          | "getAuthTag";
        vi.spyOn(cipher, method).mockImplementation(() => {
          throw new Error("synthetic_private_crypto_token_detail");
        });
      }
      return cipher;
    },
  };
});

const cipherSource = process.env.PAX_PAYMENT_TOKEN_CIPHER_SOURCE;
const {
  PaymentTokenCipher,
}: typeof import("../../../apps/api/src/modules/passenger-app/payment/payment-token-cipher") =
  cipherSource
    ? await import(cipherSource)
    : await import("../../../apps/api/src/modules/passenger-app/payment/payment-token-cipher");

const secret = JSON.stringify({
  activeKeyId: "synthetic",
  keys: { synthetic: Buffer.alloc(32, 7).toString("base64") },
});

afterEach(() => {
  fault.stage = "";
  vi.restoreAllMocks();
});

describe("production token encryption with crypto boundary faults", () => {
  it.each(["nonce", "create", "setAAD", "update", "final", "getAuthTag"])(
    "sanitizes %s failure without retaining its cause or private stack",
    (stage) => {
      const cipher = new PaymentTokenCipher(secret);
      fault.stage = stage;
      let failure: unknown;
      try {
        cipher.encrypt(
          "synthetic_token",
          "synthetic_owner",
          "synthetic_method",
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe(GENERIC);
      expect((failure as Error).stack).not.toContain(PRIVATE);
      expect(failure).not.toHaveProperty("cause");
    },
  );

  it("keeps successful AES-GCM writes decryptable after a rejected encryption", () => {
    const cipher = new PaymentTokenCipher(secret);
    fault.stage = "nonce";
    expect(() =>
      cipher.encrypt("synthetic_token", "synthetic_owner", "synthetic_method"),
    ).toThrow(GENERIC);
    fault.stage = "";
    const envelope = cipher.encrypt(
      "synthetic_token",
      "synthetic_owner",
      "synthetic_method",
    );
    expect(
      cipher.decrypt(envelope, "synthetic_owner", "synthetic_method"),
    ).toBe("synthetic_token");
    expect(JSON.stringify(envelope)).not.toContain("synthetic_token");
    expect(() =>
      cipher.decrypt(envelope, "synthetic_other_owner", "synthetic_method"),
    ).toThrow(GENERIC);
  });

  it("binding retains the original claim without plaintext persistence and can replay after crypto recovery", async () => {
    const methodId = "00000000-0000-4000-8000-000000000011";
    const metadata = {
      paymentMethodId: methodId,
      last4: "0000",
      cardType: "synthetic",
      expiryMonth: "12",
      expiryYear: "2099",
      isDefault: true,
    };
    const repository = {
      claimBinding: vi.fn().mockResolvedValue({
        idempotencyKey: "synthetic_bind_claim",
        methodId,
        completed: null,
      }),
      completeBinding: vi.fn().mockResolvedValue(metadata),
      bindingOutcome: vi.fn(),
    };
    const cipher = new PaymentTokenCipher(secret);
    const provider = new FakePaymentProvider({ DRTS_ENV: "test" });
    const exchange = vi.spyOn(provider, "bind");
    const service = new PaymentMethodService(
      repository as unknown as PaymentMethodRepository,
      { provider, cipher },
    );
    const command = { providerToken: "synthetic_credential_crypto_failure" };
    fault.stage = "update";
    const failure: unknown = await service
      .bind("synthetic_owner", command)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(GENERIC);
    expect((failure as Error).stack).not.toContain(PRIVATE);
    expect(failure).not.toHaveProperty("cause");
    expect(repository.completeBinding).not.toHaveBeenCalled();
    expect(repository.bindingOutcome).not.toHaveBeenCalled();
    expect(exchange).toHaveBeenCalledOnce();
    fault.stage = "";
    await expect(service.bind("synthetic_owner", command)).resolves.toEqual({
      status: "completed",
      method: metadata,
    });
    expect(exchange.mock.calls).toEqual([
      [command.providerToken, "synthetic_bind_claim"],
      [command.providerToken, "synthetic_bind_claim"],
    ]);
    expect(repository.completeBinding).toHaveBeenCalledOnce();
    const stored = repository.completeBinding.mock.calls[0]![2];
    expect(stored).not.toHaveProperty("token");
    expect(JSON.stringify(stored)).not.toContain("synthetic_token_");
    expect(
      cipher.decrypt(stored.tokenEnvelope, "synthetic_owner", methodId),
    ).toMatch(/^synthetic_token_/);
  });
});
