import { createRequire } from "node:module";
import type { INestApplication } from "../../../apps/api/node_modules/@nestjs/common";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { SnakeCaseExceptionFilter } from "../../../apps/api/src/common/snake-case.exception-filter";
import { SnakeCaseInterceptor } from "../../../apps/api/src/common/snake-case.interceptor";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PaymentMethodController } from "../../../apps/api/src/modules/passenger-app/payment/payment-method.controller";
import { PaymentMethodService } from "../../../apps/api/src/modules/passenger-app/payment/payment-method.service";
import { PaymentRefundController } from "../../../apps/api/src/modules/passenger-app/payment/payment-refund.controller";
import { PaymentRefundService } from "../../../apps/api/src/modules/passenger-app/payment/payment-refund.service";
import {
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "./payment-postgres-harness";

const requireApi = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
requireApi("reflect-metadata");
const { Module } = requireApi(
  "@nestjs/common",
) as typeof import("../../../apps/api/node_modules/@nestjs/common");
const { NestFactory, Reflector } = requireApi(
  "@nestjs/core",
) as typeof import("../../../apps/api/node_modules/@nestjs/core");

const opsHeaders = {
  "x-realm": "platform",
  "x-actor-type": "platform_admin",
  "x-actor-id": "qa-ops",
  "x-scopes": "billing:write",
  "x-role-families": "platform",
};

describe.skipIf(!hostedPaymentEnabled)(
  "PAX QA Payment mounted HTTP PostgreSQL",
  () => {
    const h = new PaymentPostgresHarness();
    let app: INestApplication | undefined;
    let origin: string;
    let owner: string;
    let foreign: string;
    let token: string;
    let foreignToken: string;
    let refresh: string;

    beforeAll(() => h.open(), 240000);
    beforeEach(async () => {
      vi.stubEnv("APP_ENV", "test");
      vi.stubEnv(
        "JWT_KEY_RING_JSON",
        JSON.stringify([
          {
            kid: "qa-payment-only",
            status: "active",
            algorithm: "HS256",
            publicKey: "qa-public-synthetic-jwt-key-never-for-deployment",
            privateKey: "qa-public-synthetic-jwt-key-never-for-deployment",
          },
        ]),
      );
      vi.stubEnv("JWT_RETIRED_KIDS", "");
      await h.reset();
      owner = await h.account();
      foreign = await h.account();
      const session = await h.accounts.issueSession(owner, "synthetic-http-qa");
      token = session.accessToken;
      refresh = session.refreshToken;
      foreignToken = (
        await h.accounts.issueSession(foreign, "synthetic-http-qa")
      ).accessToken;
      // Root Vitest's esbuild does not emit constructor metadata. These are the
      // actual production constructor types, not alternate controller methods.
      Reflect.defineMetadata(
        "design:paramtypes",
        [PaymentMethodService, PassengerAccountService],
        PaymentMethodController,
      );
      Reflect.defineMetadata(
        "design:paramtypes",
        [PaymentRefundService],
        PaymentRefundController,
      );
      @Module({
        controllers: [PaymentMethodController, PaymentRefundController],
        providers: [
          { provide: PaymentMethodService, useValue: h.methodService },
          { provide: PassengerAccountService, useValue: h.accounts },
          { provide: PaymentRefundService, useValue: h.refundService },
        ],
      })
      class PaymentHttpModule {}
      // All startup is under the hosted suite guard; no socket on the worker VM.
      app = await NestFactory.create(PaymentHttpModule, {
        logger: false,
        abortOnError: false,
      });
      app.setGlobalPrefix("api");
      app.useGlobalGuards(
        new BootstrapAuthGuard(
          new Reflector(),
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          h.accounts,
        ),
      );
      app.useGlobalInterceptors(new SnakeCaseInterceptor());
      app.useGlobalFilters(new SnakeCaseExceptionFilter());
      await app.listen(0, "127.0.0.1");
      origin = await app.getUrl();
    }, 30000);
    afterEach(async () => {
      try {
        await app?.close();
        app = undefined;
      } finally {
        vi.unstubAllEnvs();
      }
    }, 30000);
    afterAll(() => h.close(), 30000);

    async function request(
      method: string,
      path: string,
      bearer?: string,
      body?: unknown,
      extra: Record<string, string> = {},
    ) {
      const response = await fetch(`${origin}/api/passenger-app/${path}`, {
        method,
        headers: {
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
          ...(body ? { "content-type": "application/json" } : {}),
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10000),
      });
      const text = await response.text();
      return { status: response.status, text, json: JSON.parse(text) };
    }

    it("bind list default and remove use mounted routes and canonical success envelopes", async () => {
      const first = await request("POST", "payment-methods", token, {
        provider_token: "qa.http.opaque.credential.first",
      });
      expect(first.status).toBe(201);
      expect(first.json.data).toMatchObject({
        status: "completed",
        method: { last4: "0042", is_default: true },
      });
      expect(first.json.meta.request_id).toEqual(expect.any(String));
      expect(first.json.meta.timestamp).toEqual(expect.any(String));
      const id = first.json.data.method.payment_method_id;
      const second = await request("POST", "payment-methods", token, {
        provider_token: "qa.http.opaque.credential.second",
      });
      expect(second.status).toBe(201);
      const nextId = second.json.data.method.payment_method_id;
      const changed = await request(
        "PUT",
        `payment-methods/${nextId}/default`,
        token,
      );
      expect(changed.status).toBe(200);
      expect(changed.json.data.method.is_default).toBe(true);
      const list = await request("GET", "payment-methods", token);
      expect(list.status).toBe(200);
      expect(
        list.json.data.methods.map(
          (m: { payment_method_id: string }) => m.payment_method_id,
        ),
      ).toEqual([nextId, id]);
      expect(list.text).not.toMatch(
        /token_envelope|ciphertext|qa\.stored|provider_token/,
      );
      expect(
        (await request("DELETE", `payment-methods/${id}`, token)).json.data,
      ).toEqual({ success: true });
      expect(
        (await request("GET", "payment-methods", token)).json.data.methods,
      ).toHaveLength(1);
    });

    it("anonymous forged bootstrap and revoked passenger sessions receive denial envelopes", async () => {
      const anonymous = await request("GET", "payment-methods");
      expect(anonymous.status).toBe(401);
      expect(anonymous.json.error.code).toBe("unauthorized");
      const forged = await request("GET", "payment-methods", token, undefined, {
        "x-realm": "passenger",
        "x-actor-id": owner,
      });
      expect(forged.status).toBe(401);
      await h.accounts.logout(refresh);
      const revoked = await request("GET", "payment-methods", token);
      expect(revoked.status).toBe(401);
      expect(revoked.json.error.trace_id).toEqual(expect.any(String));
      expect(revoked.text).not.toContain(token);
    });

    it("foreign card IDs and nonexistent IDs return the same rejection without mutation", async () => {
      const card = await h.method(owner);
      for (const method of ["PUT", "DELETE"]) {
        const suffix = method === "PUT" ? "/default" : "";
        const stolen = await request(
          method,
          `payment-methods/${card.paymentMethodId}${suffix}`,
          foreignToken,
        );
        const missing = await request(
          method,
          `payment-methods/00000000-0000-4000-8000-000000000042${suffix}`,
          foreignToken,
        );
        expect(stolen.status).toBe(404);
        expect(missing.status).toBe(404);
        expect(stolen.json.error.code).toBe("not_found");
        expect(stolen.json.error.message).toBe(missing.json.error.message);
      }
      expect(
        (await request("GET", "payment-methods", foreignToken)).json.data
          .methods,
      ).toEqual([]);
      expect(await h.methods.list(owner)).toEqual([card]);
    });

    it("card-shaped and extra-field commands are refused before PSP or persistence", async () => {
      for (const command of [
        { provider_token: "0000000000000000" },
        {
          provider_token: "qa.http.opaque.credential.invalid",
          card_number: "0000000000000000",
        },
        {
          provider_token: "qa.http.opaque.credential.invalid",
          drts_passenger_id: foreign,
        },
      ]) {
        const response = await request(
          "POST",
          "payment-methods",
          token,
          command,
        );
        expect(response.status).toBe(400);
        expect(response.json.error.code).toBe("validation_error");
        expect(response.text).not.toContain("0000000000000000");
      }
      expect(h.provider.bind).not.toHaveBeenCalled();
      expect(
        (
          await h.pool!.query(
            "SELECT * FROM passenger.payment_idempotency_keys",
          )
        ).rows,
      ).toHaveLength(0);
    });

    it("provider failure keeps the bind claim and sanitizes the HTTP error", async () => {
      const credential = "qa.http.opaque.credential.secret-canary";
      h.provider.bind.mockRejectedValueOnce(
        new Error(`qa.raw.psp.error.${credential}`),
      );
      const response = await request("POST", "payment-methods", token, {
        provider_token: credential,
      });
      expect(response.status).toBe(503);
      expect(response.json.error.code).toBe("payment_unavailable");
      expect(response.text).not.toContain(credential);
      expect(response.text).not.toContain("qa.raw.psp.error");
      const foreignReplay = await request(
        "POST",
        "payment-methods",
        foreignToken,
        { provider_token: credential },
      );
      expect(foreignReplay.status).toBe(400);
      expect(foreignReplay.json.error.code).toBe("invalid_credential");
      expect(h.provider.bind).toHaveBeenCalledTimes(1);
      const retry = await request("POST", "payment-methods", token, {
        provider_token: credential,
      });
      expect(retry.status).toBe(201);
      expect(retry.json.data.status).toBe("completed");
    });

    it("refund HTTP rejects passenger authority and missing billing scope before PSP", async () => {
      const card = await h.method(owner);
      const event = await h.ride(owner, card.paymentMethodId);
      await h.chargeService.onTripCompleted(event);
      const path = `platform/rides/${event.orderId}/refund`;
      const passenger = await request("POST", path, token, {
        reason: "synthetic",
      });
      expect(passenger.status).toBe(401);
      expect(passenger.json.error.code).toBe("AUTH_REQUIRED");
      const noScope = await request(
        "POST",
        path,
        undefined,
        { reason: "synthetic" },
        { ...opsHeaders, "x-scopes": "billing:read" },
      );
      expect(noScope.status).toBe(403);
      expect(noScope.json.error.code).toBe("AUTH_SCOPE_DENIED");
      expect(h.provider.refund).not.toHaveBeenCalled();
      expect((await h.state(event.orderId)).charge?.status).toBe("captured");
    });

    it("full refund HTTP uses the production amount and exposes a replayable receipt", async () => {
      const card = await h.method(owner);
      const event = await h.ride(owner, card.paymentMethodId);
      await h.chargeService.onTripCompleted(event);
      const path = `platform/rides/${event.orderId}/refund`;
      const invalid = await request(
        "POST",
        path,
        undefined,
        { reason: "synthetic", amount_minor: 1 },
        opsHeaders,
      );
      expect(invalid.status).toBe(400);
      expect(invalid.json.error.code).toBe("invalid_request");
      const result = await request(
        "POST",
        path,
        undefined,
        { reason: "synthetic" },
        opsHeaders,
      );
      expect(result.status).toBe(201);
      expect(result.json.data).toEqual({
        success: true,
        refund_id: `pax:refund:${event.orderId}`,
      });
      expect(
        (
          await request(
            "POST",
            path,
            undefined,
            { reason: "synthetic" },
            opsHeaders,
          )
        ).json.data,
      ).toEqual(result.json.data);
      expect(h.provider.refund).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ amountMinor: event.fareMinor }),
      );
      expect((await h.state(event.orderId)).billing.status).toBe("refunded");
    });

    it("uncertain refund HTTP returns pending then reads the original refund key", async () => {
      const card = await h.method(owner);
      const event = await h.ride(owner, card.paymentMethodId);
      await h.chargeService.onTripCompleted(event);
      h.provider.refund.mockRejectedValueOnce(
        new Error("qa.raw.refund.secret-canary"),
      );
      const path = `platform/rides/${event.orderId}/refund`;
      const pending = await request(
        "POST",
        path,
        undefined,
        { reason: "synthetic" },
        opsHeaders,
      );
      expect(pending.status).toBe(503);
      expect(pending.json.error.code).toBe("payment_processing_pending");
      expect(pending.text).not.toContain("qa.raw.refund");
      expect((await h.state(event.orderId)).billing.status).toBe("captured");
      const readback = await request(
        "POST",
        path,
        undefined,
        { reason: "synthetic" },
        opsHeaders,
      );
      expect(readback.status).toBe(201);
      expect(readback.json.data.success).toBe(true);
      expect(h.provider.refund).toHaveBeenCalledTimes(1);
      expect(h.provider.readRefund).toHaveBeenCalledExactlyOnceWith(
        `pax:refund:${event.orderId}`,
      );
    });
  },
);
