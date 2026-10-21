import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PaymentMethodService } from "../../../apps/api/src/modules/passenger-app/payment/payment-method.service";
import type { PaymentMethodRepository as PaymentMethodRepositoryType } from "../../../apps/api/src/modules/passenger-app/payment/payment-method.repository";
const repositorySource = process.env.PAX_PAYMENT_METHOD_REPOSITORY_SOURCE;
const {
  PaymentMethodRepository,
}: typeof import("../../../apps/api/src/modules/passenger-app/payment/payment-method.repository") =
  repositorySource
    ? await import(repositorySource)
    : await import("../../../apps/api/src/modules/passenger-app/payment/payment-method.repository");
import { PaymentTokenCipher } from "../../../apps/api/src/modules/passenger-app/payment/payment-token-cipher";
import { FakePaymentProvider } from "../../../apps/api/src/modules/passenger-app/payment/fake-payment-provider";
import type { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";

const OWNER = "synthetic_owner";
const METHOD = "00000000-0000-4000-8000-000000000011";
const KEY = "synthetic_bind_key";
const metadata = {
  paymentMethodId: METHOD,
  last4: "0000",
  cardType: "synthetic",
  expiryMonth: "12",
  expiryYear: "2099",
  isDefault: true,
};
function fixture() {
  const repository = {
    claimBinding: vi.fn().mockResolvedValue({
      idempotencyKey: KEY,
      methodId: METHOD,
      completed: null,
    }),
    completeBinding: vi.fn().mockResolvedValue(metadata),
    bindingOutcome: vi.fn(),
    list: vi.fn().mockResolvedValue([metadata]),
    setDefault: vi.fn().mockResolvedValue(metadata),
    remove: vi.fn(),
  };
  const cipher = new PaymentTokenCipher(
    JSON.stringify({
      activeKeyId: "current",
      keys: { current: randomBytes(32).toString("base64") },
    }),
  );
  const provider = new FakePaymentProvider({ DRTS_ENV: "test" });
  const service = new PaymentMethodService(
    repository as unknown as PaymentMethodRepositoryType,
    { provider, cipher },
  );
  return { repository, provider, cipher, service };
}

describe("production binding service with mocked persistence boundary", () => {
  it("exchanges only the one-use credential, persists encrypted token and returns only display metadata", async () => {
    const f = fixture();
    const output = await f.service.bind(OWNER, {
      provider_token: "synthetic_credential_success",
    });
    expect(output).toEqual({ status: "completed", method: metadata });
    expect(f.repository.claimBinding).toHaveBeenCalledWith(
      OWNER,
      "fake",
      "synthetic_credential_success",
    );
    const stored = f.repository.completeBinding.mock.calls[0]![2];
    expect(stored).not.toHaveProperty("token");
    expect(JSON.stringify(output)).not.toContain("synthetic_token_");
    expect(JSON.stringify(stored)).not.toContain("synthetic_token_");
    expect(f.cipher.decrypt(stored.tokenEnvelope, OWNER, METHOD)).toMatch(
      /^synthetic_token_/,
    );
    expect(() =>
      f.cipher.decrypt(stored.tokenEnvelope, "synthetic_other_owner", METHOD),
    ).toThrow();
  });
  it("does not exchange a completed/removed binding a second time", async () => {
    const f = fixture();
    f.repository.claimBinding.mockResolvedValue({
      idempotencyKey: KEY,
      methodId: METHOD,
      completed: metadata,
    });
    const exchange = vi.spyOn(f.provider, "bind");
    expect(
      await f.service.bind(OWNER, {
        providerToken: "synthetic_credential_replay",
      }),
    ).toEqual({ status: "completed", method: metadata });
    expect(exchange).not.toHaveBeenCalled();
    expect(f.repository.completeBinding).not.toHaveBeenCalled();
  });
  it.each([
    null,
    [],
    {},
    {
      providerToken: "synthetic_credential_success",
      cardNumber: "synthetic_forbidden_field",
    },
    {
      providerToken: "synthetic_credential_success",
      provider_token: "synthetic_credential_success",
    },
    { providerToken: 123 },
    { providerToken: "synthetic has spaces" },
  ])(
    "rejects unsupported body without calling provider or storage",
    async (body) => {
      const f = fixture();
      const exchange = vi.spyOn(f.provider, "bind");
      await expect(f.service.bind(OWNER, body)).rejects.toMatchObject({
        code: "validation_error",
      });
      expect(exchange).not.toHaveBeenCalled();
      expect(f.repository.claimBinding).not.toHaveBeenCalled();
    },
  );
  it.each(["action_required", "pending", "declined"])(
    "persists %s without constructing a card",
    async (kind) => {
      const f = fixture();
      const operation = f.service.bind(OWNER, {
        providerToken: `synthetic_credential_${kind}`,
      });
      if (kind === "declined")
        await expect(operation).rejects.toMatchObject({
          code: "card_declined",
        });
      else expect((await operation).status).toBe(kind);
      expect(f.repository.bindingOutcome).toHaveBeenCalled();
      expect(f.repository.completeBinding).not.toHaveBeenCalled();
    },
  );
  it("keeps unknown-acknowledgement claim and sanitizes the provider exception", async () => {
    const f = fixture();
    vi.spyOn(f.provider, "bind").mockRejectedValue(
      new Error("synthetic_private_token_exception"),
    );
    await expect(
      f.service.bind(OWNER, { providerToken: "synthetic_credential_unknown" }),
    ).rejects.toMatchObject({ code: "payment_unavailable" });
    expect(f.repository.claimBinding).toHaveBeenCalledOnce();
    expect(f.repository.bindingOutcome).not.toHaveBeenCalled();
    expect(f.repository.completeBinding).not.toHaveBeenCalled();
  });
  it("projects pending/3DS results and rejects unclassified provider errors without leaking extra fields", async () => {
    const f = fixture();
    vi.spyOn(f.provider, "bind").mockResolvedValue({
      status: "pending",
      token: "synthetic_private_extra",
    } as never);
    expect(
      await f.service.bind(OWNER, {
        providerToken: "synthetic_credential_pending_extra",
      }),
    ).toEqual({ status: "pending" });
    vi.spyOn(f.provider, "bind").mockResolvedValue({
      status: "failed",
      error: "synthetic_private_error",
    } as never);
    await expect(
      f.service.bind(OWNER, {
        providerToken: "synthetic_credential_failed_extra",
      }),
    ).rejects.toMatchObject({ code: "payment_provider_invalid" });
  });
  it("refuses an unconfigured provider before creating claims", async () => {
    const f = fixture();
    const service = new PaymentMethodService(
      f.repository as unknown as PaymentMethodRepositoryType,
      { provider: { ...f.provider, available: false } as never, cipher: null },
    );
    await expect(
      service.bind(OWNER, { providerToken: "synthetic_credential_disabled" }),
    ).rejects.toMatchObject({ code: "payment_unavailable" });
    expect(f.repository.claimBinding).not.toHaveBeenCalled();
  });
  it("delegates owned list/default/remove and rejects malformed method ids", async () => {
    const f = fixture();
    expect(await f.service.list(OWNER)).toEqual({ methods: [metadata] });
    expect(await f.service.setDefault(OWNER, METHOD)).toEqual({
      status: "completed",
      method: metadata,
    });
    expect(await f.service.remove(OWNER, METHOD)).toEqual({ success: true });
    await expect(
      f.service.remove(OWNER, "synthetic_not_uuid"),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(f.repository.remove).toHaveBeenCalledOnce();
  });
  it("normalizes case-equivalent UUIDs before default/removal so references use the stored canonical id", async () => {
    const f = fixture();
    const mixed = "ABCDEFAB-ABCD-4ABC-8DEF-ABCDEFABCDEF";
    await f.service.setDefault(OWNER, mixed);
    await f.service.remove(OWNER, mixed);
    expect(f.repository.setDefault).toHaveBeenCalledWith(
      OWNER,
      mixed.toLowerCase(),
    );
    expect(f.repository.remove).toHaveBeenCalledWith(
      OWNER,
      mixed.toLowerCase(),
    );
  });
});

type Call = { sql: string; params: readonly unknown[] | undefined };
function dbFixture(
  reply: (
    sql: string,
    params?: readonly unknown[],
  ) => Record<string, unknown>[] = () => [],
) {
  const calls: Call[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      calls.push({ sql, params });
      if (sql.startsWith("SELECT status FROM passenger.accounts"))
        return { rows: [{ status: "active" }] };
      return { rows: reply(sql, params), rowCount: 1 };
    }),
    release: vi.fn(),
  };
  const repository = new PaymentMethodRepository({
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as DatabaseService);
  return { repository, client, calls };
}
const methodRow = () => ({
  payment_method_id: METHOD,
  last4: "0000",
  card_type: "synthetic",
  expiry_month: "12",
  expiry_year: "2099",
  is_default: true,
  token_envelope: "synthetic_must_not_escape",
  provider: "synthetic_must_not_escape",
});

describe("production repository SQL/transaction orchestration (PG is not mocked as an acceptance engine)", () => {
  it.each(["committed", "rejected", "rollback_failed"])(
    "sanitizes connection release errors after %s without retaining private details",
    async (state) => {
      const f = dbFixture((sql) =>
        sql.includes("SELECT drts_passenger_id,entity_id,outcome")
          ? [
              {
                drts_passenger_id: OWNER,
                entity_id: METHOD,
                outcome: "pending",
              },
            ]
          : [],
      );
      const privateDetail = "synthetic_private_release_token";
      f.client.release.mockImplementation(() => {
        throw new Error(privateDetail);
      });
      if (state !== "committed") {
        const query = f.client.query.getMockImplementation()!;
        f.client.query.mockImplementation(async (sql, params) => {
          const result = await query(sql, params);
          if (
            sql === "COMMIT" ||
            (state === "rollback_failed" && sql === "ROLLBACK")
          )
            throw new Error("synthetic_private_transaction_token");
          return result;
        });
      }
      const error = await f.repository
        .claimBinding(OWNER, "fake", "synthetic_private_credential")
        .catch((value: unknown) => value);
      expect(error).toMatchObject({
        code: "payment_persistence_unavailable",
      });
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "payment_persistence_unavailable",
          message: "Payment persistence is unavailable.",
        },
      });
      expect((error as Error).message).not.toContain(privateDetail);
      expect((error as Error).stack).not.toContain(privateDetail);
      expect(error).not.toHaveProperty("cause");
      expect(f.calls.filter((call) => call.sql === "COMMIT")).toHaveLength(1);
      expect(f.calls.some((call) => call.sql === "ROLLBACK")).toBe(
        state !== "committed",
      );
      expect(f.client.release).toHaveBeenCalledOnce();
      if (state === "committed")
        expect(f.client.release).toHaveBeenCalledWith();
      else expect(f.client.release).toHaveBeenCalledWith(true);
    },
  );
  it("commits owner claim before returning a key for external exchange, retaining no raw credential", async () => {
    const f = dbFixture((sql) =>
      sql.includes("SELECT drts_passenger_id,entity_id,outcome")
        ? [{ drts_passenger_id: OWNER, entity_id: METHOD, outcome: "pending" }]
        : [],
    );
    const claim = await f.repository.claimBinding(
      OWNER,
      "fake",
      "synthetic_credential_private",
    );
    expect(claim.methodId).toBe(METHOD);
    expect(claim.completed).toBeNull();
    expect(f.calls.at(-1)?.sql).toBe("COMMIT");
    expect(JSON.stringify(f.calls)).not.toContain(
      "synthetic_credential_private",
    );
    expect(f.calls.find((c) => c.sql.includes("FOR UPDATE"))?.params).toEqual([
      OWNER,
    ]);
    expect(f.client.release).toHaveBeenCalledWith();
  });
  it("refuses another account's credential without updating its method or outcome", async () => {
    const f = dbFixture((sql) =>
      sql.includes("SELECT drts_passenger_id,entity_id,outcome")
        ? [
            {
              drts_passenger_id: "synthetic_other_owner",
              entity_id: METHOD,
              outcome: "pending",
            },
          ]
        : [],
    );
    await expect(
      f.repository.claimBinding(OWNER, "fake", "synthetic_credential_shared"),
    ).rejects.toMatchObject({ code: "invalid_credential" });
    expect(f.calls.at(-1)?.sql).toBe("ROLLBACK");
    expect(f.calls.some((c) => c.sql.startsWith("UPDATE"))).toBe(false);
    expect(f.client.release).toHaveBeenCalledWith(true);
  });
  it("projects metadata on completed replay and list without returning ciphertext or provider fields", async () => {
    const f = dbFixture((sql) =>
      sql.includes("SELECT drts_passenger_id,entity_id,outcome")
        ? [
            {
              drts_passenger_id: OWNER,
              entity_id: METHOD,
              outcome: "completed",
            },
          ]
        : sql.includes("FROM passenger.psp_tokens")
          ? [methodRow()]
          : [],
    );
    expect(
      (
        await f.repository.claimBinding(
          OWNER,
          "fake",
          "synthetic_credential_repeat",
        )
      ).completed,
    ).toEqual(metadata);
    expect(await f.repository.list(OWNER)).toEqual([metadata]);
  });
  it("atomically writes encrypted method and completed outcome, scoped to the claim owner", async () => {
    const f = dbFixture((sql) =>
      sql.includes("SELECT entity_id,outcome")
        ? [{ entity_id: METHOD, outcome: "pending" }]
        : sql.includes("FROM passenger.psp_tokens")
          ? [methodRow()]
          : [],
    );
    const cipher = fixture().cipher;
    const tokenEnvelope = cipher.encrypt(
      "synthetic_private_token",
      OWNER,
      METHOD,
    );
    expect(
      await f.repository.completeBinding(OWNER, KEY, {
        ...metadata,
        drtsPassengerId: OWNER,
        provider: "fake",
        tokenEnvelope,
      }),
    ).toEqual(metadata);
    const insert = f.calls.find((c) =>
      c.sql.includes("INSERT INTO passenger.psp_tokens"),
    )!;
    expect(insert.params?.slice(0, 4)).toEqual([
      METHOD,
      OWNER,
      "fake",
      JSON.stringify(tokenEnvelope),
    ]);
    expect(JSON.stringify(f.calls)).not.toContain("synthetic_private_token");
    expect(f.calls.at(-1)?.sql).toBe("COMMIT");
  });
  it("rolls back failed COMMIT and evicts the connection even when rollback fails, without leaking DB detail", async () => {
    const f = dbFixture();
    f.client.query.mockImplementation(async (sql: string) => {
      if (["COMMIT", "ROLLBACK"].includes(sql))
        throw new Error("synthetic_private_db_detail");
      return {
        rows: sql.startsWith("SELECT status") ? [{ status: "active" }] : [],
        rowCount: 1,
      };
    });
    await expect(f.repository.list(OWNER)).rejects.toMatchObject({
      code: "payment_persistence_unavailable",
    });
    expect(f.client.release).toHaveBeenCalledWith(true);
  });
  it("checks ownership before default mutations and removal, permits expiry-only removal, blocks financial obligations", async () => {
    const f = dbFixture((sql) =>
      sql.includes("SELECT payment_method_id FROM")
        ? [{ payment_method_id: METHOD }]
        : sql.startsWith("UPDATE passenger.psp_tokens SET is_default=true")
          ? [methodRow()]
          : [],
    );
    await f.repository.setDefault(OWNER, METHOD);
    await f.repository.remove(OWNER, METHOD);
    const validations = f.calls.filter((c) =>
      c.sql.includes("SELECT payment_method_id FROM"),
    );
    expect(validations[0]?.params).toEqual([METHOD, OWNER, false]);
    expect(validations[1]?.params).toEqual([METHOD, OWNER, true]);
    const blocked = dbFixture((sql) =>
      sql.includes("SELECT payment_method_id FROM")
        ? [{ payment_method_id: METHOD }]
        : sql.includes("SELECT 1 FROM passenger.booking_histories")
          ? [{ exists: true }]
          : [],
    );
    await expect(
      blocked.repository.remove(OWNER, METHOD),
    ).rejects.toMatchObject({ code: "pending_payment_block" });
    expect(
      blocked.calls.some((c) => c.sql.includes("SET status='removed'")),
    ).toBe(false);
  });
});
