import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateInternalKey } from "../../../apps/api/src/common/auth/internal-key.middleware";
import { FacebookDataDeletionController } from "../../../apps/api/src/modules/passenger-app/oauth/facebook-data-deletion.controller";
import { FacebookDataDeletionService } from "../../../apps/api/src/modules/passenger-app/oauth/facebook-data-deletion.service";
import { MemoryPassengerStore } from "../pax-account-session-20261009/memory-store";

const PATH = "/api/passenger-app/auth/facebook/data-deletion";
const SECRET = "unit-only-deletion-secret";
const CODE = "a".repeat(112);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function configure(environment: string) {
  vi.stubEnv("APP_ENV", environment);
  vi.stubEnv("DRTS_ENV", undefined);
  vi.stubEnv("DRTS_INTERNAL_KEY_ENFORCED", "true");
  vi.stubEnv("DRTS_INTERNAL_KEY", "unit-only-internal-key");
  vi.stubEnv("FACEBOOK_APP_ID", "123456");
  vi.stubEnv("FACEBOOK_APP_SECRET", SECRET);
  vi.stubEnv(
    "FACEBOOK_DATA_DELETION_STATUS_ORIGIN",
    "https://api.example.test",
  );
}

const request = (method: string, path: string) => ({
  method,
  originalUrl: path,
  url: path,
  headers: {},
});

describe.each(["staging", "production", "development"])(
  "Facebook middleware ingress in %s (internal key enforced)",
  (environment) => {
    it("admits only the exact Meta POST and GET receipt routes without BFF credentials", async () => {
      configure(environment);
      for (const [method, path] of [
        ["POST", PATH],
        ["POST", `${PATH}?source=meta`],
        ["GET", `${PATH}/status/${CODE}`],
        ["GET", `${PATH}/status/${CODE}?source=meta`],
      ]) {
        await expect(
          validateInternalKey(
            request(method!, path!),
            process.env.DRTS_INTERNAL_KEY,
          ),
        ).resolves.toBeUndefined();
      }
    });

    it("keeps wrong methods, child paths, malformed receipts and other passenger routes protected", async () => {
      configure(environment);
      for (const [method, path] of [
        ["GET", PATH],
        ["PUT", PATH],
        ["POST", `${PATH}/status/${CODE}`],
        ["DELETE", `${PATH}/status/${CODE}`],
        ["POST", `${PATH}/child`],
        ["POST", `${PATH}/`],
        ["GET", `${PATH}/status/${CODE}/child`],
        ["GET", `${PATH}/status/${CODE}/`],
        ["GET", `${PATH}/status/${"a".repeat(111)}`],
        ["GET", `${PATH}/status/${"g".repeat(112)}`],
        ["POST", PATH.replace("/api/", "/")],
        ["POST", `/api/${PATH}`],
        ["POST", "/api/passenger-app/auth/oauth/facebook/start"],
        ["POST", "/api/passenger-app/auth/oauth/facebook/callback"],
        ["POST", "/api/passenger-app/auth/otp/start"],
        ["GET", "/api/passenger-app/me"],
      ]) {
        await expect(
          validateInternalKey(
            request(method!, path!),
            process.env.DRTS_INTERNAL_KEY,
          ),
        ).rejects.toThrow();
      }
    });

    it("runs the real controller HMAC checks after middleware admission, before any account access", async () => {
      configure(environment);
      const store = new MemoryPassengerStore();
      const transactions = vi.spyOn(store, "transaction");
      const controller = new FacebookDataDeletionController(
        new FacebookDataDeletionService(store),
      );
      const encoded = Buffer.from(
        JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "998877" }),
      ).toString("base64url");
      const signed = `${createHmac("sha256", SECRET).update(encoded).digest("base64url")}.${encoded}`;
      await validateInternalKey(
        request("POST", PATH),
        process.env.DRTS_INTERNAL_KEY,
      );
      for (const body of [
        undefined,
        {},
        { signed_request: "forged" },
        { signed_request: `${signed}tampered` },
      ]) {
        await expect(controller.delete(body)).rejects.toMatchObject({
          code: "invalid_signed_request",
        });
      }
      expect(transactions).not.toHaveBeenCalled();
      const result = await controller.delete({ signed_request: signed });
      expect(transactions).toHaveBeenCalledOnce();
      expect(Object.keys(result).sort()).toEqual(["confirmation_code", "url"]);
      await validateInternalKey(
        request("GET", new URL(result.url).pathname),
        process.env.DRTS_INTERNAL_KEY,
      );
      expect(controller.status(result.confirmation_code)).toEqual({
        confirmation_code: result.confirmation_code,
        status: "completed",
      });
      // The route matcher admits the format, not the capability; the service verifies its HMAC.
      await validateInternalKey(
        request("GET", `${PATH}/status/${CODE}`),
        process.env.DRTS_INTERNAL_KEY,
      );
      expect(() => controller.status(CODE)).toThrow();
      expect(transactions).toHaveBeenCalledOnce();
    });
  },
);
