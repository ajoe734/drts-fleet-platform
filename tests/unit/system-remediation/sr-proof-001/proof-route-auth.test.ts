import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BootstrapAuthGuard } from "../../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";
import { BillingSettlementController } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.controller";

const apiRequire = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Reflector } = apiRequire("@nestjs/core") as {
  Reflector: new () => ConstructorParameters<typeof BootstrapAuthGuard>[0];
};

const driver: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "driver_user",
  actorId: "unit-driver",
  realm: "driver",
  tenantId: null,
  roles: [],
  roleFamilies: ["driver"],
  scopes: ["driver:read", "driver:write", "dispatch:read"],
  requestId: null,
};
afterEach(() => vi.unstubAllEnvs());

function authorize(
  url: string,
  handler: (...args: never[]) => unknown,
  identity: BootstrapRequestIdentity = driver,
  method = "POST",
) {
  vi.stubEnv("APP_ENV", "staging");
  vi.stubEnv("DRTS_ENV", "staging");
  vi.stubEnv("JWT_SECRET", "offline-proof-route-auth-secret");
  vi.stubEnv("JWT_ISSUER", "drts");
  vi.stubEnv("JWT_AUDIENCE", "drts-api");
  const jwt = new JwtAuthService();
  // Mock only credential verification/identity at the external boundary;
  // route policy, actual handler metadata, reflector and guard remain real.
  vi.spyOn(jwt, "verifyAccessToken").mockResolvedValue({} as never);
  vi.spyOn(jwt, "toRequestIdentity").mockReturnValue(identity);
  const request = {
    headers: { authorization: "Bearer offline-unit-token" },
    method,
    url,
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => BillingSettlementController,
  } as unknown as Parameters<BootstrapAuthGuard["canActivate"]>[0];
  return new BootstrapAuthGuard(new Reflector(), jwt).canActivate(context);
}

const controller = BillingSettlementController.prototype;
const creationRoutes = [
  [
    "/api/reimbursements/proofs/staged-content",
    controller.stageRemittanceProofContent,
  ],
  ["/api/reimbursements/proofs", controller.uploadRemittanceProof],
] as const;

describe("proof creation uses actual driver scopes through the real auth guard", () => {
  it.each(creationRoutes)(
    "admits a verified driver at %s without billing authority",
    async (url, handler) => {
      await expect(authorize(url, handler)).resolves.toBe(true);
    },
  );
  it.each(creationRoutes)(
    "rejects missing driver:write at %s",
    async (url, handler) => {
      await expect(
        authorize(url, handler, { ...driver, scopes: ["driver:read"] }),
      ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });
    },
  );
  it.each(creationRoutes)(
    "rejects a foreign realm even with driver:write at %s",
    async (url, handler) => {
      await expect(
        authorize(url, handler, { ...driver, realm: "tenant" }),
      ).rejects.toMatchObject({ code: "AUTH_REALM_DENIED" });
    },
  );
  it("does not grant a driver finance scan authority", async () => {
    await expect(
      authorize(
        "/api/reimbursements/proofs/unit-proof/scan",
        controller.scanRemittanceProof,
      ),
    ).rejects.toMatchObject({ code: "AUTH_REALM_DENIED" });
  });
  it("does not broaden the exception to other methods or nested routes", async () => {
    for (const [url, method] of [
      ["/api/reimbursements/proofs", "GET"],
      ["/api/reimbursements/proofs/staged-content/other", "POST"],
      ["/api/reimbursements/unit-batch/pay", "POST"],
      ["/api/reimbursements/unit-batch/pay-with-proof", "POST"],
    ] as const) {
      // Real creation-handler metadata also cannot escape the billing scope.
      await expect(
        authorize(url, controller.uploadRemittanceProof, driver, method),
      ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });
    }
  });
});
