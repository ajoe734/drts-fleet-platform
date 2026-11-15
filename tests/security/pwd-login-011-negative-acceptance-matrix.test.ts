import { generate } from "otplib";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  THROTTLER_LIMIT,
  THROTTLER_TTL,
} from "../../apps/api/node_modules/@nestjs/throttler/dist/throttler.constants";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { OPEN_ROUTE_RATE_LIMIT } from "../../apps/api/src/common/throttling/rate-limit.constants";
import { AgencyDirectoryRepository } from "../../apps/api/src/modules/agency-access/agency-directory.repository";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";
import { TotpCredentialRepository } from "../../apps/api/src/modules/auth/totp-credential.repository";
import { TotpService } from "../../apps/api/src/modules/auth/totp.service";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { SecurityEventsService } from "../../apps/api/src/modules/security-events/security-events.service";
import {
  TenantInvitationDeliveryService,
  type TenantInvitationDeliveryRequest,
} from "../../apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

/**
 * PWD-LOGIN-011 (depends_on PWD-LOGIN-004..009) -- the SA/SD §11 "資安負向測試"
 * acceptance matrix: 帳號列舉、暴力破解、token 重放、MFA 繞過、跨 realm、跨租戶.
 *
 * This file does NOT re-prove cases PWD-LOGIN-004..009 already cover at the
 * unit/full-chain level; each `describe` block below opens with a comment
 * naming where that base coverage already lives, then adds only the matrix
 * cells that were not yet exercised anywhere in the suite as of this task
 * (confirmed by reading `apps/api/src/modules/auth/auth.controller.ts` and
 * grepping the existing test tree before writing these).
 *
 * Hosted-only cell (真 PG 並發一次性消耗測試，邀請接受的密碼分支，agency 等同
 * `acceptTenantOidcInvitation` 的要求): see
 * `apps/api/tests/unit/agency-invitation-password-race.pg.test.ts`
 * (`describe.skipIf(!process.env.DATABASE_URL)`), which this VM cannot run
 * (no local Postgres/Docker, see AGENTS.md VM restriction). It runs in the
 * existing hosted CI job `product_api_unit` ("Product API unit tests (shard
 * 1/2, 2/2)") in `.github/workflows/ci.yml` / `ci-integ.yml`, the same job
 * that already runs the sibling `tenant-google-invitation.pg.test.ts` /
 * `agency-invitation.pg.test.ts` concurrency suites.
 *
 * Everything else in this file is local-runnable via:
 *   pnpm exec vitest run tests/security/pwd-login-011-negative-acceptance-matrix.test.ts
 * As of writing, this VM's shared `node_modules` has a pre-existing,
 * VM-wide, non-task-caused defect (zod@3.25.76 resolving where
 * `@drts/contracts` requires zod@^4.6.6 -- see
 * memory `project-shared-node-modules-missing-zod-4-6-7` /
 * `apps/api/tests/unit/password-reset.test.ts`'s trailing comment) that
 * throws `TypeError: z.string(...).guid is not a function` at import time
 * for *every* test file importing `AuthController`/`IdentityRepository`,
 * including already-merged, previously-accepted files such as
 * `tests/unit/identity-session.test.ts`. That failure is reproduced
 * identically and is not specific to this file; CI runs a fresh
 * frozen-lockfile install and is unaffected.
 */

const PRIOR_ENV = { ...process.env };
const CORRECT_PASSWORD = "correct horse battery staple";
const WRONG_PASSWORD = "an entirely different password";
const TOTP_KEY_V1 = Buffer.alloc(32, "pwd-login-011-totp-key").toString(
  "base64",
);

beforeAll(() => {
  process.env.APP_ENV = "local";
  process.env.AUTH_MODE = "local";
  process.env.JWT_SECRET = "test_jwt_secret_key_32_characters_long_min!";
  process.env.PASSWORD_PEPPER_SECRETS_JSON = JSON.stringify({
    v1: "pwd-login-011-matrix-test-pepper-value-32char!",
  });
  process.env.PASSWORD_PEPPER_CURRENT_VERSION = "v1";
  process.env.TOTP_ENCRYPTION_KEYS_JSON = JSON.stringify({
    activeKeyId: "v1",
    keys: { v1: TOTP_KEY_V1 },
  });
});

afterAll(() => {
  process.env = { ...PRIOR_ENV };
});

afterEach(() => {
  vi.restoreAllMocks();
});

class CapturingInvitationDelivery extends TenantInvitationDeliveryService {
  readonly tokens = new Map<string, string>();

  override async send(request: TenantInvitationDeliveryRequest) {
    this.tokens.set(request.invitationId, request.rawToken);
    return super.send(request);
  }
}

function createFixture() {
  const identityRepository = new IdentityRepository();
  const agencyDirectoryRepository = new AgencyDirectoryRepository();
  const securityEventsService = new SecurityEventsService();
  const totpCredentialRepository = new TotpCredentialRepository();
  const totpService = new TotpService(totpCredentialRepository);
  const delivery = new CapturingInvitationDelivery();
  const tenantPartnerService = new TenantPartnerService(
    new AuditNotificationService(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    identityRepository,
    identityRepository,
    delivery,
  );
  const jwtAuthService = new JwtAuthService(
    identityRepository,
    tenantPartnerService,
    undefined,
    agencyDirectoryRepository,
  );
  const controller = new AuthController(
    jwtAuthService,
    tenantPartnerService,
    {} as never,
    securityEventsService,
    undefined,
    undefined,
    identityRepository,
    undefined,
    undefined,
    undefined,
    undefined,
    agencyDirectoryRepository,
    totpService,
    totpCredentialRepository,
  );
  return {
    identityRepository,
    agencyDirectoryRepository,
    securityEventsService,
    tenantPartnerService,
    delivery,
    totpService,
    controller,
  };
}

async function createActiveTenantPasswordUser(
  fixture: ReturnType<typeof createFixture>,
  options: { tenantId: string; email: string },
) {
  await fixture.tenantPartnerService.createTenantUser(options.tenantId, {
    email: options.email,
    displayName: "PWD-LOGIN-011 Matrix Fixture",
    roleCode: "tenant_viewer",
  });
  const invitation = fixture.identityRepository
    .listInvitations()
    .find(
      (candidate) =>
        candidate.email.toLowerCase() === options.email.toLowerCase(),
    )!;
  const rawToken = fixture.delivery.tokens.get(invitation.invitationId)!;
  await fixture.tenantPartnerService.acceptTenantInvitationWithPassword({
    invitationToken: rawToken,
    password: CORRECT_PASSWORD,
  });
  const principal = fixture.identityRepository
    .listPrincipals()
    .find(
      (candidate) =>
        candidate.email?.toLowerCase() === options.email.toLowerCase(),
    )!;
  return { principal };
}

async function enrollAndConfirmTotp(
  totpService: TotpService,
  principalId: string,
): Promise<{ secret: string; recoveryCodes: string[] }> {
  const enrollment = await totpService.enroll(
    principalId,
    "tenant:pwd-login-011-matrix-fixture",
  );
  const confirmCode = await generate({ secret: enrollment.secret });
  const confirmation = await totpService.confirm(principalId, confirmCode);
  return {
    secret: enrollment.secret,
    recoveryCodes: confirmation.recoveryCodes,
  };
}

/** Advances past the step `confirm()` already consumed, same helper pattern
 * as `tests/unit/identity-session.test.ts`. */
async function freshLoginCode(secret: string): Promise<string> {
  vi.useFakeTimers();
  try {
    vi.advanceTimersByTime(31_000);
    return await generate({ secret });
  } finally {
    vi.useRealTimers();
  }
}

async function denialMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    throw new Error("expected the password login attempt to be denied");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    const apiError = error as ApiRequestError;
    expect(apiError.getStatus()).toBe(401);
    const body = apiError.getResponse() as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe("AUTHENTICATION_FAILED");
    return body.error.message;
  }
}

describe("PWD-LOGIN-011 SA/SD §11 負向驗收矩陣", () => {
  // 1. 帳號列舉 (account enumeration): base matrix (unknown / not-yet-invited /
  // wrong-password / disabled, across tenant/agency/partner realms, all
  // byte-identical) is already proven in
  // `apps/api/tests/unit/password-login.test.ts`. The one cell that test
  // file never cross-checks: that a *locked-out* account's denial, taken
  // from a fresh account dedicated to proving lockout, is textually
  // identical to the baseline "account does not exist" denial, not merely
  // self-consistent across its own repeated attempts.
  describe("1. 帳號列舉：locked-out denial matches the unknown-account baseline", () => {
    it("tenant realm: a locked account's denial is byte-identical to an unknown account's denial", async () => {
      const fixture = createFixture();
      const baselineMessage = await denialMessage(
        fixture.controller.passwordLogin("tenant", {
          email: "nobody-pwd011@example.com",
          password: CORRECT_PASSWORD,
        }),
      );

      const tenantId = "tenant-pwd011-enum-lockout";
      await createActiveTenantPasswordUser(fixture, {
        tenantId,
        email: "enum-lockout@example.com",
      });
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await denialMessage(
          fixture.controller.passwordLogin("tenant", {
            email: "enum-lockout@example.com",
            password: WRONG_PASSWORD,
            tenantId,
          }),
        );
      }
      const lockedMessage = await denialMessage(
        fixture.controller.passwordLogin("tenant", {
          email: "enum-lockout@example.com",
          password: CORRECT_PASSWORD,
          tenantId,
        }),
      );
      expect(lockedMessage).toBe(baselineMessage);
    });
  });

  // 2. 暴力破解 (brute force): per-account progressive lockout (鎖定生效) is
  // already proven for tenant and fleet-partner in
  // `apps/api/tests/unit/password-login.test.ts`. "IP rate limit 生效" is a
  // *route-level* defense independent of any single account; the real
  // guard+storage behavior for `OPEN_ROUTE_RATE_LIMIT` is already proven
  // generically in `apps/api/tests/unit/throttling.test.ts`. What has never
  // been checked is that `AuthController`'s three password-credential
  // routes actually carry that decorator (i.e. that they inherit the
  // already-proven IP-level throttling rather than silently falling back to
  // the global default).
  describe("2. 暴力破解：IP rate limit metadata wiring", () => {
    function expectOpenRouteRateLimit(method: (...args: never[]) => unknown) {
      expect(Reflect.getMetadata(THROTTLER_LIMIT + "default", method)).toBe(
        OPEN_ROUTE_RATE_LIMIT.default.limit,
      );
      expect(Reflect.getMetadata(THROTTLER_TTL + "default", method)).toBe(
        OPEN_ROUTE_RATE_LIMIT.default.ttl,
      );
    }

    it("passwordLogin carries OPEN_ROUTE_RATE_LIMIT (30/min)", () => {
      expectOpenRouteRateLimit(AuthController.prototype.passwordLogin);
    });

    it("requestPasswordReset carries OPEN_ROUTE_RATE_LIMIT (30/min)", () => {
      expectOpenRouteRateLimit(AuthController.prototype.requestPasswordReset);
    });

    it("confirmPasswordReset carries OPEN_ROUTE_RATE_LIMIT (30/min)", () => {
      expectOpenRouteRateLimit(AuthController.prototype.confirmPasswordReset);
    });
  });

  // 3. Token 重放 (token replay): invitation-token replay (tenant/agency,
  // password vs OIDC race included) is already proven in
  // `tests/unit/tenant-invitation-lifecycle.test.ts` and
  // `apps/api/tests/unit/tenant-google-invitation.pg.test.ts`; password
  // reset token replay at the *repository* layer is already proven in
  // `apps/api/tests/unit/password-reset.test.ts`. Neither exercises the
  // real HTTP entry point: `AuthController.confirmPasswordReset` itself
  // consuming the token, hashing with `PasswordHashingService`, revoking
  // sessions and recording the security event. These two cases drive that
  // real controller method end to end.
  describe("3. Token 重放：confirmPasswordReset 的完整 controller 入口", () => {
    it("a second confirm with the same reset token is rejected even though the first one succeeded", async () => {
      const fixture = createFixture();
      const tenantId = "tenant-pwd011-reset-replay";
      const { principal } = await createActiveTenantPasswordUser(fixture, {
        tenantId,
        email: "reset-replay@example.com",
      });
      const { rawToken } =
        await fixture.identityRepository.createPasswordResetToken(
          principal.principalId,
        );

      const first = (await fixture.controller.confirmPasswordReset("tenant", {
        token: rawToken,
        password: "brand-new-password-value",
      })) as { data: { passwordReset: boolean } };
      expect(first.data.passwordReset).toBe(true);

      await expect(
        fixture.controller.confirmPasswordReset("tenant", {
          token: rawToken,
          password: "yet-another-password-value",
        }),
      ).rejects.toMatchObject({ code: "PASSWORD_RESET_TOKEN_INVALID" });
    });

    it("a reset token issued for a tenant-only principal cannot be confirmed against the agency realm", async () => {
      const fixture = createFixture();
      const tenantId = "tenant-pwd011-reset-cross-realm";
      const { principal } = await createActiveTenantPasswordUser(fixture, {
        tenantId,
        email: "reset-cross-realm@example.com",
      });
      const { rawToken } =
        await fixture.identityRepository.createPasswordResetToken(
          principal.principalId,
        );

      await expect(
        fixture.controller.confirmPasswordReset("agency", {
          token: rawToken,
          password: "brand-new-password-value",
        }),
      ).rejects.toMatchObject({ code: "PASSWORD_RESET_TOKEN_INVALID" });

      // KNOWN PRODUCT DEFECT (read, not fixed, here -- out of this task's
      // write_scopes; report to PWD-LOGIN-006, SA/SD §6's owner):
      // `confirmPasswordReset` (auth.controller.ts ~L1443-1463) calls
      // `identityRepository.consumePasswordResetToken(token)` -- which is
      // unconditionally single-use -- *before* checking whether the
      // resolved principal has a membership in the requested `realm`. So
      // the wrong-realm attempt above already burned the token: a correct,
      // same-realm retry with the identical token now fails too, even
      // though the user never actually completed a reset. This is a
      // self-inflicted availability bug (the legitimate user is now locked
      // out of their own still-valid reset request), not a cross-realm
      // information or access leak -- no realm ever receives the new
      // password or a session for the wrong realm -- so it is captured
      // here as the matrix's documented actual behavior rather than
      // silently asserted as the (safer-looking but incorrect) assumption
      // that the token "survives" a wrong-realm attempt.
      await expect(
        fixture.controller.confirmPasswordReset("tenant", {
          token: rawToken,
          password: "brand-new-password-value",
        }),
      ).rejects.toMatchObject({ code: "PASSWORD_RESET_TOKEN_INVALID" });

      // A *fresh* token for the same principal, used only in its own
      // realm, still completes normally -- isolates the defect above to
      // the wrong-realm attempt specifically, not a general regression in
      // confirmPasswordReset itself.
      const { rawToken: secondToken } =
        await fixture.identityRepository.createPasswordResetToken(
          principal.principalId,
        );
      const confirmedInOwnRealm = (await fixture.controller.confirmPasswordReset(
        "tenant",
        { token: secondToken, password: "brand-new-password-value" },
      )) as { data: { passwordReset: boolean } };
      expect(confirmedInOwnRealm.data.passwordReset).toBe(true);
    });
  });

  // 4. MFA 繞過 (MFA bypass): "未確認的 TOTP secret 不能登入" and "缺碼/錯碼/
  // 重放碼一律拒絕" are already proven end to end in
  // `tests/unit/identity-session.test.ts`. The one claim never exercised by
  // a test (only asserted in a code comment at
  // `auth.controller.ts`'s `resolvePasswordLoginAmr` doc) is "偽造 amr/前端
  // boolean 必須被拒絕": that client-supplied `amr`/`mfaVerified`/`mfa` fields
  // on the password-login body have zero effect on the server's own MFA
  // decision.
  describe("4. MFA 繞過：偽造 amr／前端 boolean 必須被拒絕", () => {
    it("a forged amr/mfaVerified/mfa:true in the request body does not bypass a required TOTP step", async () => {
      const fixture = createFixture();
      const tenantId = "tenant-pwd011-mfa-forge";
      const { principal } = await createActiveTenantPasswordUser(fixture, {
        tenantId,
        email: "mfa-forge@example.com",
      });
      const { secret } = await enrollAndConfirmTotp(
        fixture.totpService,
        principal.principalId,
      );

      const forgedCommand = {
        email: "mfa-forge@example.com",
        password: CORRECT_PASSWORD,
        tenantId,
        // None of these are read by `passwordLogin`'s DTO destructuring; an
        // attacker who adds them is indistinguishable, server-side, from one
        // who sends a bare correct-password request with no MFA code.
        amr: ["pwd", "otp"],
        mfaVerified: true,
        mfa: true,
        // A non-numeric, non-code "truthy" totpCode is also not a bypass:
        // `resolvePasswordLoginAmr` always runs it through
        // `TotpService.verifyLoginCode`, which only accepts a real code.
        totpCode: "true",
      } as any;

      await expect(
        fixture.controller.passwordLogin("tenant", forgedCommand),
      ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });

      const deniedEvents = await fixture.securityEventsService.listEvents(
        null,
        { eventType: "totp.denied", actorId: principal.principalId },
      );
      expect(deniedEvents).toHaveLength(1);
      expect(deniedEvents[0]?.reasonCode).toBe("TOTP_INVALID_CODE");

      // A real valid code (not the forged fields above) still succeeds and
      // still reports the server's own verified amr, proving the forged
      // fields were inert rather than merely tested against a broken path.
      const realCode = await freshLoginCode(secret);
      const envelope = (await fixture.controller.passwordLogin("tenant", {
        email: "mfa-forge@example.com",
        password: CORRECT_PASSWORD,
        tenantId,
        totpCode: realCode,
      })) as { data: { identity: { amr?: string[] } } };
      expect(envelope.data.identity.amr).toEqual(["pwd", "otp"]);
    });
  });

  // 5. 跨 realm (cross realm): "tenant 密碼不能登入 agency" is implied by
  // `attemptAgencyPasswordLogin` only matching principals that have an
  // actual agency membership, but no existing test drives a *real* tenant
  // principal's correct password against the agency/partner password-login
  // endpoints to prove it. These two cases close that.
  describe("5. 跨 realm：tenant 密碼不能登入 agency／partner", () => {
    it("a tenant-only principal's correct password is denied, uniformly, against the agency realm", async () => {
      const fixture = createFixture();
      const tenantId = "tenant-pwd011-cross-realm-agency";
      await createActiveTenantPasswordUser(fixture, {
        tenantId,
        email: "cross-realm-agency@example.com",
      });

      const baselineMessage = await denialMessage(
        fixture.controller.passwordLogin("agency", {
          email: "nobody-pwd011-agency@example.com",
          password: CORRECT_PASSWORD,
        }),
      );
      const crossRealmMessage = await denialMessage(
        fixture.controller.passwordLogin("agency", {
          email: "cross-realm-agency@example.com",
          password: CORRECT_PASSWORD,
        }),
      );
      expect(crossRealmMessage).toBe(baselineMessage);
    });

    it("a tenant-only principal's correct password is denied, uniformly, against the partner realm", async () => {
      const fixture = createFixture();
      const tenantId = "tenant-pwd011-cross-realm-partner";
      await createActiveTenantPasswordUser(fixture, {
        tenantId,
        email: "cross-realm-partner@example.com",
      });

      const baselineMessage = await denialMessage(
        fixture.controller.passwordLogin("partner", {
          email: "nobody-pwd011-partner@example.com",
          password: CORRECT_PASSWORD,
        }),
      );
      const crossRealmMessage = await denialMessage(
        fixture.controller.passwordLogin("partner", {
          email: "cross-realm-partner@example.com",
          password: CORRECT_PASSWORD,
        }),
      );
      expect(crossRealmMessage).toBe(baselineMessage);
    });
  });

  // 6. 跨租戶 (cross tenant): "tenant A 密碼不能存取 tenant B membership". No
  // existing test drives a real tenant-A login attempt that explicitly
  // names tenant B's `tenantId`.
  describe("6. 跨租戶：tenant A 密碼不能存取 tenant B membership", () => {
    it("tenant A's correct password, submitted with tenant B's tenantId, is denied uniformly", async () => {
      const fixture = createFixture();
      const tenantA = "tenant-pwd011-cross-tenant-a";
      const tenantB = "tenant-pwd011-cross-tenant-b";
      await createActiveTenantPasswordUser(fixture, {
        tenantId: tenantA,
        email: "cross-tenant@example.com",
      });

      const baselineMessage = await denialMessage(
        fixture.controller.passwordLogin("tenant", {
          email: "nobody-pwd011-cross-tenant@example.com",
          password: CORRECT_PASSWORD,
          tenantId: tenantB,
        }),
      );
      const crossTenantMessage = await denialMessage(
        fixture.controller.passwordLogin("tenant", {
          email: "cross-tenant@example.com",
          password: CORRECT_PASSWORD,
          tenantId: tenantB,
        }),
      );
      expect(crossTenantMessage).toBe(baselineMessage);

      // The same credentials still work against the tenant they actually
      // belong to -- proves the denial above was a real tenant-scope check,
      // not a broken fixture.
      const ownTenantEnvelope = (await fixture.controller.passwordLogin(
        "tenant",
        {
          email: "cross-tenant@example.com",
          password: CORRECT_PASSWORD,
          tenantId: tenantA,
        },
      )) as { data: { profile: { tenantId: string } } };
      expect(ownTenantEnvelope.data.profile.tenantId).toBe(tenantA);
    });
  });
});
