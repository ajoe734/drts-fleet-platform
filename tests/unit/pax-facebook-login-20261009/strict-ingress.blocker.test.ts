import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { validateInternalKey } from "../../../apps/api/src/common/auth/internal-key.middleware";
import { FacebookDataDeletionController } from "../../../apps/api/src/modules/passenger-app/oauth/facebook-data-deletion.controller";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Guard-only expected-denial probes remain pending PR #2499 integration.
 * Middleware admission is fixed; this is NOT full ingress acceptance. */
describe("unresolved strict Facebook guard blocker (waiting for PR #2499)", () => {
  it.each(["staging", "production"])(
    "Meta cannot reach webhook or status without BFF credentials in %s",
    async (environment) => {
      vi.stubEnv("APP_ENV", environment);
      vi.stubEnv("DRTS_ENV", undefined);
      vi.stubEnv("DRTS_INTERNAL_KEY", "");
      vi.stubEnv("DRTS_INTERNAL_KEY_ENFORCED", "true");
      vi.stubEnv("JWT_SECRET", "unit-guard-key");
      vi.stubEnv("JWT_PRIVATE_KEY", "");
      vi.stubEnv("JWT_PUBLIC_KEY", "");
      vi.stubEnv("JWT_KEY_RING_JSON", "");
      vi.stubEnv("GOOGLE_WORKLOAD_IDENTITY_AUDIENCE", "");
      const apiRequire = createRequire(
        new URL("../../../apps/api/package.json", import.meta.url),
      );
      const { Reflector } = apiRequire("@nestjs/core");
      const guard = new BootstrapAuthGuard(
        new Reflector(),
        new JwtAuthService(),
      );
      for (const [method, path, handler] of [
        ["POST", "/api/passenger-app/auth/facebook/data-deletion", "delete"],
        [
          "GET",
          `/api/passenger-app/auth/facebook/data-deletion/status/${"a".repeat(112)}`,
          "status",
        ],
      ] as const) {
        const request = { method, originalUrl: path, url: path, headers: {} };
        await expect(
          validateInternalKey(request, undefined),
        ).resolves.toBeUndefined();
        const context = {
          switchToHttp: () => ({ getRequest: () => request }),
          getHandler: () => FacebookDataDeletionController.prototype[handler],
          getClass: () => FacebookDataDeletionController,
        } as never;
        await expect(guard.canActivate(context)).rejects.toThrow();
      }
    },
  );
});
