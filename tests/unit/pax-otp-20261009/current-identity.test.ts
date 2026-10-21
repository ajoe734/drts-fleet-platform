import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { NotificationDeliveryService } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import type { OutgoingMailMessage } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.types";
import { PassengerOtpController } from "../../../apps/api/src/modules/passenger-app/otp/passenger-otp.controller";
import { PassengerOtpService } from "../../../apps/api/src/modules/passenger-app/otp/passenger-otp.service";
import { UnconfiguredSmsPort } from "../../../apps/api/src/modules/passenger-app/otp/sms.port";
import { MemoryPassengerStore } from "../pax-account-session-20261009/memory-store";
import { MemoryOtpStore } from "./memory-store";

const { ROUTE_ARGS_METADATA } = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
)("@nestjs/common/constants");
afterEach(() => vi.unstubAllEnvs());
function actualIdentity(
  handler: "request" | "verify",
  identity?: RequestIdentity,
) {
  const metadata = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    PassengerOtpController,
    handler,
  ) as Record<
    string,
    {
      index: number;
      factory?: (data: unknown, context: unknown) => RequestIdentity;
    }
  >;
  const parameter = Object.values(metadata).find(
    (entry) => entry.index === 1 && entry.factory,
  )!;
  return parameter.factory!(undefined, {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { "x-drts-google-id-token": "unit-bff-metadata" },
        ...(identity ? { identity } : {}),
      }),
    }),
  });
}
describe("actual CurrentIdentity decorator on BFF OTP login", () => {
  it("permits an anonymous BFF login proof but never grants its bootstrap identity link authority", async () => {
    vi.stubEnv("JWT_SECRET", "unit-current-identity-key");
    vi.stubEnv("JWT_KEY_RING_JSON", "");
    vi.stubEnv("JWT_PRIVATE_KEY", "");
    vi.stubEnv("JWT_PUBLIC_KEY", "");
    vi.stubEnv("JWT_ALGORITHM", "HS256");
    vi.stubEnv("JWT_ALGORITHMS", "HS256");
    const accounts = new PassengerAccountService(
      new MemoryPassengerStore(),
      new PassengerJwtService(),
    );
    let code = "";
    const send = vi.fn(async (message: OutgoingMailMessage) => {
      code = message.body.match(/驗證碼：([0-9]{6})/)![1]!;
      return {
        provider: "unit",
        response: "250 accepted",
        providerMessageId: null,
        acceptedAt: new Date().toISOString(),
      };
    });
    const delivery = new NotificationDeliveryService(
      {
        transaction: async () => {
          throw new Error("no platform outbox");
        },
      },
      { provider: "unit", send, sendPlatform: send },
    );
    const options = {
      pepper: "unit-pepper-at-least-32-characters-long",
      fromEmail: "sender@example.test",
      ipHourlyLimit: 20,
      trustedProxyHops: 0,
    };
    const controller = new PassengerOtpController(
      new PassengerOtpService(
        new MemoryOtpStore(),
        accounts,
        delivery,
        new UnconfiguredSmsPort(),
        options,
      ),
      options,
    );
    const request = { headers: {}, socket: { remoteAddress: "192.0.2.10" } };
    const anonymous = actualIdentity("verify");
    expect(anonymous).toMatchObject({
      authMode: "bootstrap_headers",
      actorType: "system",
      actorId: null,
    });
    const challenge = await controller.request(
      { provider: "email", target: "passenger@example.test", purpose: "login" },
      actualIdentity("request"),
      request,
    );
    const response = await controller.verify(
      {
        provider: "email",
        target: "passenger@example.test",
        challenge: challenge.data.challenge,
        code,
      },
      anonymous,
      request,
    );
    expect(response.data.result).toBe("logged_in");
    await expect(
      controller.request(
        { provider: "email", target: "link@example.test", purpose: "link" },
        actualIdentity("request"),
        request,
      ),
    ).rejects.toMatchObject({ code: "unauthorized" });
    if (response.data.result !== "logged_in")
      throw new Error("Expected passenger login.");
    const passenger = (await accounts.authenticateAccessToken(
      response.data.accessToken,
    ))!;
    const linked = await controller.request(
      { provider: "email", target: "linked@example.test", purpose: "link" },
      actualIdentity("request", passenger),
      request,
    );
    const linkedCommand = {
      provider: "email",
      target: "linked@example.test",
      challenge: linked.data.challenge,
      code,
    };
    await expect(
      controller.verify(linkedCommand, actualIdentity("verify"), request),
    ).rejects.toMatchObject({ code: "invalid_code" });
    expect(
      (
        await controller.verify(
          linkedCommand,
          actualIdentity("verify", passenger),
          request,
        )
      ).data,
    ).toEqual({ result: "linked" });
  });
});
