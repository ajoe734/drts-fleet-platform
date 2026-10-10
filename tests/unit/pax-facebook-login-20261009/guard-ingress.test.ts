import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { validateInternalKey } from "../../../apps/api/src/common/auth/internal-key.middleware";
import { FacebookDataDeletionController } from "../../../apps/api/src/modules/passenger-app/oauth/facebook-data-deletion.controller";
import { FacebookDataDeletionService } from "../../../apps/api/src/modules/passenger-app/oauth/facebook-data-deletion.service";
import { MemoryPassengerStore } from "../pax-account-session-20261009/memory-store";

const PATH = "/api/passenger-app/auth/facebook/data-deletion";
const CODE = "a".repeat(112);
const SECRET = "unit-only-deletion-secret";
const apiRequire = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { Reflector } = apiRequire("@nestjs/core");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function configure(environment: string) {
  vi.stubEnv("APP_ENV", environment);
  vi.stubEnv("DRTS_ENV", undefined);
  vi.stubEnv("DRTS_INTERNAL_KEY", "unit-only-internal-key");
  vi.stubEnv("DRTS_INTERNAL_KEY_ENFORCED", "true");
  vi.stubEnv("FACEBOOK_APP_ID", "123456");
  vi.stubEnv("FACEBOOK_APP_SECRET", SECRET);
  vi.stubEnv(
    "FACEBOOK_DATA_DELETION_STATUS_ORIGIN",
    "https://api.example.test",
  );
}

function context(
  method: string,
  path: string,
  handler: "delete" | "status" = "delete",
  headers: Record<string, string> = {},
) {
  const request = { method, originalUrl: path, url: path, headers };
  return {
    request,
    execution: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => FacebookDataDeletionController.prototype[handler],
      getClass: () => FacebookDataDeletionController,
    } as never,
  };
}

describe.each(["staging", "production", "development"])(
  "Facebook middleware + guard ingress in %s (internal key enforced)",
  (environment) => {
    it("admits the exact OpenRoute webhook and receipt paths without BFF credentials", async () => {
      configure(environment);
      const guard = new BootstrapAuthGuard(new Reflector());
      for (const [method, path, handler] of [
        ["POST", PATH, "delete"],
        ["POST", `${PATH}?source=meta`, "delete"],
        ["GET", `${PATH}/status/${CODE}`, "status"],
        ["GET", `${PATH}/status/${CODE}?source=meta`, "status"],
      ] as const) {
        const { request, execution } = context(method, path, handler);
        await validateInternalKey(request, process.env.DRTS_INTERNAL_KEY);
        await expect(guard.canActivate(execution)).resolves.toBe(true);
      }
    });

    it("requires OpenRoute metadata as well as the exact matcher", async () => {
      configure(environment);
      const guard = new BootstrapAuthGuard(new Reflector());
      const { request } = context("POST", PATH);
      const closed = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => function closedHandler() {},
        getClass: () => class ClosedController {},
      } as never;
      await expect(guard.canActivate(closed)).rejects.toThrow();
    });

    it("keeps wrong methods, adjacent routes and malformed receipts protected even with OpenRoute metadata", async () => {
      configure(environment);
      const guard = new BootstrapAuthGuard(new Reflector());
      for (const [method, path] of [
        ["GET", PATH],
        ["PUT", PATH],
        ["OPTIONS", PATH],
        ["POST", `${PATH}/status/${CODE}`],
        ["DELETE", `${PATH}/status/${CODE}`],
        ["POST", `${PATH}/child`],
        ["POST", `${PATH}/`],
        ["GET", `${PATH}/status/${CODE}/child`],
        ["GET", `${PATH}/status/${CODE}/`],
        ["GET", `${PATH}/status/${"a".repeat(111)}`],
        ["GET", `${PATH}/status/${"g".repeat(112)}`],
        ["POST", PATH.replace("/api/", "/")],
        ["POST", "/api/passenger-app/auth/oauth/facebook/start"],
        ["POST", "/api/passenger-app/auth/oauth/facebook/callback"],
        ["POST", "/api/passenger-app/auth/otp/start"],
        ["GET", "/api/passenger-app/me"],
      ]) {
        await expect(
          guard.canActivate(context(method!, path!).execution),
        ).rejects.toThrow();
      }
    });

    it("rejects spoofed Bearer on neighboring routes after middleware bypass", async () => {
      configure(environment);
      const guard = new BootstrapAuthGuard(new Reflector());
      for (const header of ["authorization", "x-drts-authorization"]) {
        for (const path of [
          `${PATH}/child`,
          "/api/passenger-app/auth/oauth/facebook/start",
          "/api/passenger-app/me",
        ]) {
          const { request, execution } = context("POST", path, "delete", {
            [header]: "Bearer forged",
          });
          await validateInternalKey(request, process.env.DRTS_INTERNAL_KEY);
          await expect(guard.canActivate(execution)).rejects.toThrow();
        }
      }
    });

    it("rejects bootstrap identity headers on the exact public endpoint", async () => {
      configure(environment);
      const guard = new BootstrapAuthGuard(new Reflector());
      const { execution } = context("POST", PATH, "delete", {
        "x-actor-id": "forged-passenger",
      });
      expect(() => guard.canActivate(execution)).toThrow();
    });

    it("reaches the controller signature and receipt checks without deriving identity from Bearer", async () => {
      configure(environment);
      const guard = new BootstrapAuthGuard(new Reflector());
      const store = new MemoryPassengerStore();
      const transactions = vi.spyOn(store, "transaction");
      const controller = new FacebookDataDeletionController(
        new FacebookDataDeletionService(store),
      );
      const { request, execution } = context("POST", PATH, "delete", {
        authorization: "Bearer forged",
      });
      Object.assign(request, { identity: { actorId: "stale-identity" } });
      await validateInternalKey(request, process.env.DRTS_INTERNAL_KEY);
      await expect(guard.canActivate(execution)).resolves.toBe(true);
      expect(request).not.toHaveProperty("identity");
      for (const body of [undefined, {}, { signed_request: "forged" }]) {
        await expect(controller.delete(body)).rejects.toMatchObject({
          code: "invalid_signed_request",
        });
      }
      expect(transactions).not.toHaveBeenCalled();
      const payload = Buffer.from(
        JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "998877" }),
      ).toString("base64url");
      const signed = `${createHmac("sha256", SECRET).update(payload).digest("base64url")}.${payload}`;
      const result = await controller.delete({ signed_request: signed });
      expect(Object.keys(result).sort()).toEqual(["confirmation_code", "url"]);
      const status = context("GET", new URL(result.url).pathname, "status");
      await validateInternalKey(status.request, process.env.DRTS_INTERNAL_KEY);
      await expect(guard.canActivate(status.execution)).resolves.toBe(true);
      expect(controller.status(result.confirmation_code)).toEqual({
        confirmation_code: result.confirmation_code,
        status: "completed",
      });
      await expect(
        guard.canActivate(
          context("GET", `${PATH}/status/${CODE}`, "status").execution,
        ),
      ).resolves.toBe(true);
      expect(() => controller.status(CODE)).toThrow();
      expect(transactions).toHaveBeenCalledOnce();
    });
  },
);
