import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { StepUpProofService } from "../../apps/api/src/common/auth/step-up-proof.service";
import { BootstrapAuthGuard } from "../../apps/api/src/common/auth/bootstrap-auth.guard";
import { FleetPartnerController } from "../../apps/api/src/modules/fleet-partner/fleet-partner.controller";

const { Reflector } = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
)("@nestjs/core");

/**
 * FLEET-ONB-007 SA/SD §9 row "未帶 step-up fresh session 呼叫邀請核發/撤銷/
 * `human-roles`": `PUT .../human-roles` already has a guard-level 403 test
 * (tests/unit/fleet-partner-human-role-authority-20261026.test.ts's
 * "FLEET-ONB-005 step-up gate on manageFleetHumanRole's route" describe
 * block). The invitation issue (`POST admin/fleet-partners/:id/invitations`)
 * and revoke (`POST .../invitations/:id/revoke`) routes only have a
 * route->actionId mapping assertion in
 * tests/unit/step-up-policy-catalog.test.ts (via `resolveRouteStepUpPolicy`)
 * -- not a real `BootstrapAuthGuard.canActivate` denial/admission test. This
 * exercises the actual guard for both routes, mirroring the human-roles
 * test's construction exactly.
 */
beforeEach(() => {
  vi.stubEnv("APP_ENV", "local");
  vi.stubEnv("AUTH_MODE", "local");
  vi.stubEnv("JWT_SECRET", "test_jwt_secret_key_32_characters_long_min!");
});

async function issuePlatformAdminToken(jwtService: JwtAuthService) {
  return jwtService.issueSessionToken({
    authMode: "jwt_bearer",
    actorType: "platform_admin",
    actorId: "fleet-invitation-manager",
    principalId: "fleet-invitation-manager",
    realm: "platform",
    partnerId: null,
    tenantId: null,
    roleFamilies: ["platform"],
    roles: ["platform_admin"],
    scopes: ["foundation:write"],
    amr: ["totp"],
    acr: "aal2",
  });
}

describe("FLEET-ONB-007 SA/SD §9: step-up gate on the Fleet staff invitation issue/revoke routes", () => {
  it("denies POST admin/fleet-partners/:id/invitations without a fresh step-up proof, then admits it once one is issued", async () => {
    const jwtService = new JwtAuthService();
    const proofs = new StepUpProofService();
    const guard = new BootstrapAuthGuard(
      new Reflector(),
      jwtService,
      undefined,
      undefined,
      undefined,
      undefined,
      proofs,
    );
    const issued = await issuePlatformAdminToken(jwtService);
    const path = "/api/admin/fleet-partners/fleet-test-001/invitations";
    const activate = (headers: Record<string, string>) =>
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            method: "POST",
            url: path,
            headers,
          }),
        }),
        getHandler: () => FleetPartnerController.prototype.inviteFleetStaff,
        getClass: () => FleetPartnerController,
      } as never);

    await expect(
      activate({ authorization: `Bearer ${issued.token}` }),
    ).rejects.toMatchObject({ code: "STEP_UP_REQUIRED" });

    const identity = jwtService.toRequestIdentity(
      (await jwtService.verifyAccessToken(issued.token))!,
    );
    const proof = proofs.createProof(identity, {
      actionId: "platform:users:create",
    });
    expect(proof.stepUpReference).toBeTruthy();
    await expect(
      activate({
        authorization: `Bearer ${issued.token}`,
        "x-drts-step-up-reference": proof.stepUpReference!,
      }),
    ).resolves.toBe(true);
  });

  it("denies POST admin/fleet-partners/:id/invitations/:invitationId/revoke without a fresh step-up proof, then admits it once one is issued", async () => {
    const jwtService = new JwtAuthService();
    const proofs = new StepUpProofService();
    const guard = new BootstrapAuthGuard(
      new Reflector(),
      jwtService,
      undefined,
      undefined,
      undefined,
      undefined,
      proofs,
    );
    const issued = await issuePlatformAdminToken(jwtService);
    const path =
      "/api/admin/fleet-partners/fleet-test-001/invitations/invitation-001/revoke";
    const activate = (headers: Record<string, string>) =>
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            method: "POST",
            url: path,
            headers,
          }),
        }),
        getHandler: () =>
          FleetPartnerController.prototype.revokeFleetStaffInvitation,
        getClass: () => FleetPartnerController,
      } as never);

    await expect(
      activate({ authorization: `Bearer ${issued.token}` }),
    ).rejects.toMatchObject({ code: "STEP_UP_REQUIRED" });

    const identity = jwtService.toRequestIdentity(
      (await jwtService.verifyAccessToken(issued.token))!,
    );
    const proof = proofs.createProof(identity, {
      actionId: "platform:users:role:update",
    });
    expect(proof.stepUpReference).toBeTruthy();
    await expect(
      activate({
        authorization: `Bearer ${issued.token}`,
        "x-drts-step-up-reference": proof.stepUpReference!,
      }),
    ).resolves.toBe(true);
  });
});
