import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import { resolveRouteAuthPolicy } from "../../../apps/api/src/common/auth/auth.policy";
import type { AuthenticatedRequestLike } from "../../../apps/api/src/common/auth/auth.types";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PassengerOtpController } from "../../../apps/api/src/modules/passenger-app/otp/passenger-otp.controller";
import { MemoryPassengerStore } from "../pax-account-session-20261009/memory-store";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";

const { Reflector } = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
)("@nestjs/core");
beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "unit-guard-secret");
  vi.stubEnv("JWT_KEY_RING_JSON", "");
  vi.stubEnv("JWT_PRIVATE_KEY", "");
  vi.stubEnv("JWT_PUBLIC_KEY", "");
  vi.stubEnv("JWT_ALGORITHM", "HS256");
  vi.stubEnv("JWT_ALGORITHMS", "HS256");
  vi.stubEnv("DRTS_ENV", undefined);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DRTS_INTERNAL_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const routes = [
  ["POST", "/api/passenger-app/auth/otp/request", "request"],
  ["POST", "/api/passenger-app/auth/otp/verify", "verify"],
  ["GET", "/api/passenger-app/auth/providers", "providers"],
] as const;
function context(
  request: AuthenticatedRequestLike,
  handler: "request" | "verify" | "providers",
) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => PassengerOtpController.prototype[handler],
    getClass: () => PassengerOtpController,
  } as never;
}
async function fixture(google: any) {
  const accounts = new PassengerAccountService(
    new MemoryPassengerStore(),
    new PassengerJwtService(),
  );
  const account = await accounts.findOrCreateByIdentity(
    "google",
    "unit-subject",
  );
  const session = await accounts.issueSession(account.drtsPassengerId);
  const guard = new BootstrapAuthGuard(
    new Reflector(),
    new JwtAuthService(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    google,
    accounts,
  );
  return { guard, accounts, account, session };
}
describe.each(["development", "staging", "production"])(
  "actual OTP controller metadata and auth guard in %s",
  (environment) => {
    it.each(routes)(
      "accepts BFF metadata for %s %s without granting passenger identity",
      async (method, url, handler) => {
        vi.stubEnv("APP_ENV", environment);
        const google = {
          verifyServicePrincipal: vi
            .fn()
            .mockResolvedValue({ principalId: "unit-bff" }),
        };
        const f = await fixture(google);
        const request: AuthenticatedRequestLike = {
          method,
          url,
          headers: { authorization: "Bearer metadata-stub" },
        };
        expect(await f.guard.canActivate(context(request, handler))).toBe(true);
        expect(request.identity).toBeUndefined();
        expect(resolveRouteAuthPolicy(method, url)?.routeKey).toBe(
          "passenger-app:otp",
        );
        if (environment !== "development")
          expect(google.verifyServicePrincipal).toHaveBeenCalled();
      },
    );
    it.each(routes)(
      "preserves active passenger authority for %s %s and removes it after logout",
      async (method, url, handler) => {
        vi.stubEnv("APP_ENV", environment);
        const google = {
          verifyServicePrincipal: vi
            .fn()
            .mockRejectedValue(
              new ApiRequestError(401, "unauthorized", "Invalid BFF proof."),
            ),
        };
        const f = await fixture(google);
        const request: AuthenticatedRequestLike = {
          method,
          url,
          headers: { authorization: `Bearer ${f.session.accessToken}` },
        };
        expect(await f.guard.canActivate(context(request, handler))).toBe(true);
        expect(request.identity).toMatchObject({
          drtsPassengerId: f.account.drtsPassengerId,
          realm: "passenger",
        });
        await f.accounts.logout(f.session.refreshToken);
        await expect(
          f.guard.canActivate(context(request, handler)),
        ).rejects.toMatchObject({ code: "unauthorized" });
        expect(request.identity).toBeUndefined();
      },
    );
    it("rejects forged passenger identity headers on open OTP paths", async () => {
      vi.stubEnv("APP_ENV", environment);
      const f = await fixture({
        verifyServicePrincipal: vi
          .fn()
          .mockResolvedValue({ principalId: "unit-bff" }),
      });
      const request: AuthenticatedRequestLike = {
        method: "POST",
        url: routes[0][1],
        headers: {
          "x-actor-type": "first_party_passenger",
          "x-actor-id": f.account.drtsPassengerId,
          "x-realm": "passenger",
        },
      };
      await expect(async () =>
        f.guard.canActivate(context(request, "request")),
      ).rejects.toMatchObject({
        code:
          environment === "development"
            ? "unauthorized"
            : "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN",
      });
      expect(request.identity).toBeUndefined();
    });
  },
);
