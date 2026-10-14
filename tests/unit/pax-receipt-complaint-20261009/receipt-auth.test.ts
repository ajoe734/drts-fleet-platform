import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import type { AuthenticatedRequestLike } from "../../../apps/api/src/common/auth/auth.types";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PassengerReceiptController } from "../../../apps/api/src/modules/passenger-app/receipt/passenger-receipt.controller";
import { MemoryPassengerStore } from "../pax-account-session-20261009/memory-store";

const requireApi = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { Reflector } = requireApi("@nestjs/core");
const routes = [
  ["html", "/api/passenger-app/rides/id/receipt/artifacts/html"],
  ["pdf", "/api/passenger-app/rides/id/receipt/artifacts/pdf"],
  ["downloads", "/api/passenger-app/rides/id/receipt/downloads"],
] as const;

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "unit-only-receipt-session-key");
  for (const key of [
    "JWT_PRIVATE_KEY",
    "JWT_PUBLIC_KEY",
    "JWT_KEY_RING_JSON",
    "DRTS_INTERNAL_KEY",
  ])
    vi.stubEnv(key, "");
  vi.stubEnv("JWT_ALGORITHM", "HS256");
  vi.stubEnv("JWT_ALGORITHMS", "HS256");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DRTS_ENV", undefined);
});
afterEach(() => vi.unstubAllEnvs());

async function session() {
  // Only account/session persistence is in memory. Real signing, live family
  // revocation, production guard and new receipt controller metadata run.
  const accounts = new PassengerAccountService(
    new MemoryPassengerStore(),
    new PassengerJwtService(),
  );
  const account = await accounts.findOrCreateByIdentity(
    "google",
    "unit-receipt-account",
  );
  const tokens = await accounts.issueSession(account.drtsPassengerId);
  const legacy = new JwtAuthService();
  const guard = new BootstrapAuthGuard(
    new Reflector(),
    legacy,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    accounts,
  );
  return { accounts, account, tokens, guard, legacy };
}
function context(
  request: AuthenticatedRequestLike,
  handler: (typeof routes)[number][0],
) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getClass: () => PassengerReceiptController,
    getHandler: () => PassengerReceiptController.prototype[handler],
  } as never;
}

describe.each(["development", "staging", "production"])(
  "receipt identity guard in %s",
  (environment) => {
    it.each(routes)(
      "accepts an active passenger on %s and denies the same token after logout",
      async (handler, url) => {
        const f = await session();
        vi.stubEnv("APP_ENV", environment);
        const request: AuthenticatedRequestLike = {
          method: "GET",
          url,
          headers: { authorization: `Bearer ${f.tokens.accessToken}` },
        };
        expect(await f.guard.canActivate(context(request, handler))).toBe(true);
        expect(request.identity).toMatchObject({
          realm: "passenger",
          drtsPassengerId: f.account.drtsPassengerId,
        });
        await f.accounts.logout(f.tokens.refreshToken);
        await expect(
          f.guard.canActivate(context(request, handler)),
        ).rejects.toMatchObject({ code: "unauthorized" });
        expect(request.identity).toBeUndefined();
      },
    );
    it("denies a valid platform token and missing credentials on every new download route", async () => {
      const f = await session();
      const token = f.legacy.sign({
        authMode: "jwt_bearer",
        actorType: "platform_admin",
        realm: "platform",
        actorId: f.account.drtsPassengerId,
        tenantId: null,
        roleFamilies: [],
        roles: [],
        scopes: [],
      });
      vi.stubEnv("APP_ENV", environment);
      for (const [handler, url] of routes) {
        for (const headers of [{}, { authorization: `Bearer ${token}` }]) {
          const request: AuthenticatedRequestLike = {
            method: "GET",
            url,
            headers,
          };
          await expect(
            f.guard.canActivate(context(request, handler)),
          ).rejects.toMatchObject({ code: "unauthorized" });
          expect(request.identity).toBeUndefined();
        }
      }
    });
  },
);
