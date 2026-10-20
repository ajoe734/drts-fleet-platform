import { createRequire } from "node:module";
import type { ExecutionContext } from "../../../apps/api/node_modules/@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateInternalKey,
  verifyGoogleAssertionOrInternalKey,
} from "../../../apps/api/src/common/auth/internal-key.middleware";
import { BootstrapThrottlerGuard } from "../../../apps/api/src/common/throttling/bootstrap-throttler.guard";
import { KeyScopedThrottlerStorage } from "../../../apps/api/src/common/throttling/key-scoped-throttler.storage";
import { GLOBAL_RATE_LIMIT } from "../../../apps/api/src/common/throttling/rate-limit.constants";
import { PassengerOtpController } from "../../../apps/api/src/modules/passenger-app/otp/passenger-otp.controller";
import { PassengerOAuthController } from "../../../apps/api/src/modules/passenger-app/oauth/passenger-oauth.controller";
import { PassengerAccountController } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.controller";
import { PassengerOtpService } from "../../../apps/api/src/modules/passenger-app/otp/passenger-otp.service";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import { NotificationDeliveryService } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import { UnconfiguredSmsPort } from "../../../apps/api/src/modules/passenger-app/otp/sms.port";
import { MemoryOtpStore } from "../pax-otp-20261009/memory-store";
import { MemoryPassengerStore } from "../pax-account-session-20261009/memory-store";

const apiRequire = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { Reflector } = apiRequire(
  "@nestjs/core",
) as typeof import("../../../apps/api/node_modules/@nestjs/core");
const stores: KeyScopedThrottlerStorage[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T18:00:00Z"));
  vi.stubEnv("APP_ENV", "production");
});
afterEach(() => {
  stores.splice(0).forEach((s) => s.onApplicationShutdown());
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
type NativeAuthEntry = [string, string, object, object];
const endpoints: NativeAuthEntry[] = [
  [
    "GET",
    "/api/passenger-app/auth/providers",
    PassengerOAuthController,
    PassengerOAuthController.prototype.providers,
  ],
  [
    "POST",
    "/api/passenger-app/auth/otp/request",
    PassengerOtpController,
    PassengerOtpController.prototype.request,
  ],
  [
    "POST",
    "/api/passenger-app/auth/otp/verify",
    PassengerOtpController,
    PassengerOtpController.prototype.verify,
  ],
  ...["google", "facebook", "line"].flatMap<NativeAuthEntry>((provider) => [
    [
      "POST",
      `/api/passenger-app/auth/oauth/${provider}/start`,
      PassengerOAuthController,
      PassengerOAuthController.prototype.start,
    ],
    [
      "POST",
      `/api/passenger-app/auth/oauth/${provider}/callback`,
      PassengerOAuthController,
      PassengerOAuthController.prototype.callback,
    ],
  ]),
  [
    "POST",
    "/api/passenger-app/auth/refresh",
    PassengerAccountController,
    PassengerAccountController.prototype.refreshSession,
  ],
  [
    "POST",
    "/api/passenger-app/auth/logout",
    PassengerAccountController,
    PassengerAccountController.prototype.logout,
  ],
];

describe("Native anonymous transport keeps the actual existing API limits", () => {
  it.each(endpoints)(
    "%s %s reaches the existing global guard and returns429 after its actual limit",
    async (method, url, controller, handler) => {
      const storage = new KeyScopedThrottlerStorage();
      stores.push(storage);
      const guard = new BootstrapThrottlerGuard(
        [...GLOBAL_RATE_LIMIT],
        storage,
        new Reflector(),
      );
      await guard.onModuleInit();
      const request = {
        method: String(method),
        originalUrl: String(url),
        headers: {},
        ip: "192.0.2.10",
      };
      await validateInternalKey(request, undefined);
      await verifyGoogleAssertionOrInternalKey(request, undefined);
      const context = {
        getClass: () => controller,
        getHandler: () => handler,
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => ({ header: vi.fn() }),
        }),
      } as unknown as ExecutionContext;
      for (let i = 0; i < GLOBAL_RATE_LIMIT[0].limit; i++)
        expect(await guard.canActivate(context)).toBe(true);
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        status: 429,
      });
      // Another native client IP retains its own positive allowance.
      request.ip = "192.0.2.11";
      expect(await guard.canActivate(context)).toBe(true);
    },
  );
  it("raw OTP requests still enforce target cooldown and the shared hourly IP quota in the production service", async () => {
    // Database and outbound mail are the only simulated boundaries; no SQL/limit logic is copied.
    const messages: unknown[] = [];
    const delivery = new NotificationDeliveryService(
      { transaction: vi.fn() } as never,
      {
        provider: "unit-mail",
        send: vi.fn(),
        sendPlatform: async (message) => {
          messages.push(message);
          return {
            provider: "unit-mail",
            response: "accepted",
            providerMessageId: null,
            acceptedAt: new Date().toISOString(),
          };
        },
      },
    );
    const options = {
      pepper: "unit-only-pepper-with-at-least-32-characters",
      fromEmail: "sender@example.invalid",
      ipHourlyLimit: 2,
      trustedProxyHops: 0,
    };
    const accounts = new PassengerAccountService(
      new MemoryPassengerStore(),
      new PassengerJwtService(),
    );
    const service = new PassengerOtpService(
      new MemoryOtpStore(),
      accounts,
      delivery,
      new UnconfiguredSmsPort(),
      options,
    );
    const controller = new PassengerOtpController(service, options);
    const request = { headers: {}, socket: { remoteAddress: "192.0.2.10" } };
    const command = {
      provider: "email",
      target: "one@example.invalid",
      purpose: "login",
    };
    await validateInternalKey(
      {
        method: "POST",
        originalUrl: "/api/passenger-app/auth/otp/request",
        headers: {},
      },
      undefined,
    );
    await controller.request(command, null, request);
    await expect(
      controller.request(command, null, request),
    ).rejects.toMatchObject({ code: "too_many_requests" });
    await controller.request(
      { ...command, target: "two@example.invalid" },
      null,
      request,
    );
    await expect(
      controller.request(
        { ...command, target: "three@example.invalid" },
        null,
        request,
      ),
    ).rejects.toMatchObject({ code: "too_many_requests" });
    expect(messages).toHaveLength(2);
  });
});
