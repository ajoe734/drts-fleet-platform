import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generate } from "otplib";

import { ApiRequestError } from "../../src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { TotpController } from "../../src/modules/auth/totp.controller";
import { TotpCredentialRepository } from "../../src/modules/auth/totp-credential.repository";
import {
  TotpCodeReplayedError,
  TotpInvalidCodeError,
  TotpRecoveryCodeInvalidError,
  TotpSecretNotConfirmedError,
  TotpService,
} from "../../src/modules/auth/totp.service";

const PRIOR_TOTP_KEYS_JSON = process.env.TOTP_ENCRYPTION_KEYS_JSON;
const KEY_V1 = randomBytes(32).toString("base64");

beforeAll(() => {
  process.env.TOTP_ENCRYPTION_KEYS_JSON = JSON.stringify({
    activeKeyId: "v1",
    keys: { v1: KEY_V1 },
  });
});

afterAll(() => {
  if (PRIOR_TOTP_KEYS_JSON === undefined) {
    delete process.env.TOTP_ENCRYPTION_KEYS_JSON;
  } else {
    process.env.TOTP_ENCRYPTION_KEYS_JSON = PRIOR_TOTP_KEYS_JSON;
  }
});

let principalCounter = 0;
function freshPrincipalId(): string {
  principalCounter += 1;
  return `login-principal-${principalCounter}`;
}

async function enrollAndConfirm(
  svc: TotpService,
  principalId: string,
): Promise<{ secret: string; recoveryCodes: string[] }> {
  const enrollment = await svc.enroll(principalId, "tenant:user@example.com");
  const validCode = await generate({ secret: enrollment.secret });
  const confirmation = await svc.confirm(principalId, validCode);
  return {
    secret: enrollment.secret,
    recoveryCodes: confirmation.recoveryCodes,
  };
}

function buildIdentity(
  principalId: string,
  overrides: Partial<BootstrapRequestIdentity> = {},
): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "tenant_admin",
    actorId: principalId,
    principalId,
    realm: "tenant",
    tenantId: "tenant-1",
    sessionId: `session-${principalId}`,
    authTime: new Date().toISOString(),
    amr: ["totp"],
    roleFamilies: [],
    roles: [],
    scopes: [],
    requestId: null,
    ...overrides,
  };
}

async function expectApiError(
  promise: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(ApiRequestError);
  try {
    await promise;
    throw new Error("expected the call to be rejected");
  } catch (error) {
    const apiError = error as ApiRequestError;
    expect(apiError.getStatus()).toBe(status);
    expect(apiError.code).toBe(code);
  }
}

describe("TotpService login verification", () => {
  it("rejects login when the principal has never enrolled TOTP", async () => {
    const svc = new TotpService(new TotpCredentialRepository());
    await expect(
      svc.verifyLoginCode(freshPrincipalId(), "123456"),
    ).rejects.toBeInstanceOf(TotpSecretNotConfirmedError);
  });

  it("rejects login against an unconfirmed (pending) secret", async () => {
    const repository = new TotpCredentialRepository();
    const svc = new TotpService(repository);
    const principalId = freshPrincipalId();
    const enrollment = await svc.enroll(principalId, "tenant:user@example.com");

    const code = await generate({ secret: enrollment.secret });
    await expect(svc.verifyLoginCode(principalId, code)).rejects.toBeInstanceOf(
      TotpSecretNotConfirmedError,
    );
  });

  it("accepts a valid code once the secret is confirmed", async () => {
    const repository = new TotpCredentialRepository();
    const svc = new TotpService(repository);
    const principalId = freshPrincipalId();
    const { secret } = await enrollAndConfirm(svc, principalId);

    // confirm() already consumed the current step; advance past it so the
    // next generated code lands on a fresh, unused step.
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(31_000);
      const code = await generate({ secret });
      await expect(
        svc.verifyLoginCode(principalId, code),
      ).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects an incorrect login code", async () => {
    const repository = new TotpCredentialRepository();
    const svc = new TotpService(repository);
    const principalId = freshPrincipalId();
    await enrollAndConfirm(svc, principalId);

    await expect(
      svc.verifyLoginCode(principalId, "000000"),
    ).rejects.toBeInstanceOf(TotpInvalidCodeError);
  });

  it("rejects replaying the exact same already-used code", async () => {
    const repository = new TotpCredentialRepository();
    const svc = new TotpService(repository);
    const principalId = freshPrincipalId();
    const { secret } = await enrollAndConfirm(svc, principalId);

    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(31_000);
      const code = await generate({ secret });

      await svc.verifyLoginCode(principalId, code);
      await expect(
        svc.verifyLoginCode(principalId, code),
      ).rejects.toBeInstanceOf(TotpCodeReplayedError);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects replaying the code that was just used to confirm enrollment", async () => {
    const repository = new TotpCredentialRepository();
    const svc = new TotpService(repository);
    const principalId = freshPrincipalId();
    const enrollment = await svc.enroll(principalId, "tenant:user@example.com");
    const confirmCode = await generate({ secret: enrollment.secret });
    await svc.confirm(principalId, confirmCode);

    await expect(
      svc.verifyLoginCode(principalId, confirmCode),
    ).rejects.toBeInstanceOf(TotpCodeReplayedError);
  });
});

describe("TotpService recovery codes", () => {
  it("rejects an unknown recovery code", async () => {
    const svc = new TotpService(new TotpCredentialRepository());
    await expect(
      svc.verifyRecoveryCode(freshPrincipalId(), "NOPE-NOPE-NOPE-NOPE"),
    ).rejects.toBeInstanceOf(TotpRecoveryCodeInvalidError);
  });

  it("consumes a recovery code exactly once and forces re-enrollment", async () => {
    const repository = new TotpCredentialRepository();
    const svc = new TotpService(repository);
    const principalId = freshPrincipalId();
    const { recoveryCodes } = await enrollAndConfirm(svc, principalId);
    const [usedCode] = recoveryCodes;

    await expect(
      svc.verifyRecoveryCode(principalId, usedCode),
    ).resolves.toBeUndefined();

    // Second use of the same code must fail (single use).
    await expect(
      svc.verifyRecoveryCode(principalId, usedCode),
    ).rejects.toBeInstanceOf(TotpRecoveryCodeInvalidError);

    // The old TOTP secret is invalidated: a previously-valid code can no
    // longer log in, and the principal must enroll fresh.
    const stored = await repository.findCredential(principalId);
    expect(stored).toBeNull();
    await expect(
      svc.verifyLoginCode(principalId, "123456"),
    ).rejects.toBeInstanceOf(TotpSecretNotConfirmedError);

    // Every other still-unused recovery code from the invalidated batch is
    // gone too, not just the one that was consumed.
    const [, otherUnusedCode] = recoveryCodes;
    await expect(
      svc.verifyRecoveryCode(principalId, otherUnusedCode),
    ).rejects.toBeInstanceOf(TotpRecoveryCodeInvalidError);
  });
});

describe("POST /api/auth/:realm/mfa/totp/enroll", () => {
  const realms = ["tenant", "agency", "partner"] as const;

  it.each(realms)(
    "allows first-time setup and restart of an unfinished setup with a password-only %s session",
    async (realm) => {
      const controller = new TotpController(
        new TotpService(new TotpCredentialRepository()),
      );
      const identity = buildIdentity(freshPrincipalId(), {
        realm,
        amr: ["pwd"],
      });

      const first = await controller.enroll(realm, identity, {});
      const restarted = await controller.enroll(realm, identity, {});
      expect(first.data.secret).not.toBe(restarted.data.secret);
    },
  );

  it.each(realms)(
    "keeps the confirmed second factor when a password-only or stale %s session tries to replace it",
    async (realm) => {
      const repository = new TotpCredentialRepository();
      const svc = new TotpService(repository);
      const controller = new TotpController(svc);
      const principalId = freshPrincipalId();
      const { recoveryCodes } = await enrollAndConfirm(svc, principalId);
      const before = await repository.findCredential(principalId);

      await expectApiError(
        controller.enroll(
          realm,
          buildIdentity(principalId, { realm, amr: ["pwd"] }),
          {},
        ),
        403,
        "MFA_REQUIRED",
      );
      await expectApiError(
        controller.enroll(
          realm,
          buildIdentity(principalId, {
            realm,
            authTime: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
          }),
          {},
        ),
        403,
        "STEP_UP_REQUIRED",
      );

      expect(await repository.findCredential(principalId)).toEqual(before);
      await expect(
        svc.verifyRecoveryCode(principalId, recoveryCodes[0]!),
      ).resolves.toBeUndefined();
    },
  );

  it("replaces the confirmed second factor from a fresh trusted-MFA session", async () => {
    const svc = new TotpService(new TotpCredentialRepository());
    const controller = new TotpController(svc);
    const principalId = freshPrincipalId();
    const { secret } = await enrollAndConfirm(svc, principalId);

    const replaced = await controller.enroll(
      "tenant",
      buildIdentity(principalId),
      {},
    );
    expect(replaced.data.secret).not.toBe(secret);
  });

  it("lets a lost-device user set up again after a recovery-code login", async () => {
    const svc = new TotpService(new TotpCredentialRepository());
    const controller = new TotpController(svc);
    const principalId = freshPrincipalId();
    const { recoveryCodes } = await enrollAndConfirm(svc, principalId);
    await svc.verifyRecoveryCode(principalId, recoveryCodes[0]!);

    const enrolled = await controller.enroll(
      "tenant",
      buildIdentity(principalId, { amr: ["pwd"] }),
      {},
    );
    expect(enrolled.data.secret.length).toBeGreaterThan(0);
  });
});

describe("POST /api/auth/:realm/mfa/totp/recovery-codes/regenerate", () => {
  it("returns a fresh set of 10 codes for a confirmed, freshly-MFA'd session and invalidates the old set", async () => {
    const repository = new TotpCredentialRepository();
    const svc = new TotpService(repository);
    const controller = new TotpController(svc);
    const principalId = freshPrincipalId();
    const { recoveryCodes: oldCodes } = await enrollAndConfirm(
      svc,
      principalId,
    );

    const identity = buildIdentity(principalId);
    const response = await controller.regenerateRecoveryCodes(
      "tenant",
      identity,
      {},
    );

    expect(response.data.recoveryCodes).toHaveLength(10);
    expect(
      response.data.recoveryCodes.some((code) => oldCodes.includes(code)),
    ).toBe(false);

    await expect(
      svc.verifyRecoveryCode(principalId, oldCodes[0]),
    ).rejects.toBeInstanceOf(TotpRecoveryCodeInvalidError);
  });

  it("rejects when there is no active session identity at all", async () => {
    const svc = new TotpService(new TotpCredentialRepository());
    const controller = new TotpController(svc);

    await expectApiError(
      controller.regenerateRecoveryCodes("tenant", null, {}),
      401,
      "AUTHENTICATION_REQUIRED",
    );
  });

  it("rejects a session bound to a different realm than the route", async () => {
    const svc = new TotpService(new TotpCredentialRepository());
    const controller = new TotpController(svc);
    const principalId = freshPrincipalId();
    const identity = buildIdentity(principalId, { realm: "agency" });

    await expectApiError(
      controller.regenerateRecoveryCodes("tenant", identity, {}),
      401,
      "AUTHENTICATION_REQUIRED",
    );
  });

  it("rejects a session without a trusted MFA assertion, never trusting a body claim instead", async () => {
    const repository = new TotpCredentialRepository();
    const svc = new TotpService(repository);
    const controller = new TotpController(svc);
    const principalId = freshPrincipalId();
    await enrollAndConfirm(svc, principalId);
    const identity = buildIdentity(principalId, { amr: [] });

    await expectApiError(
      controller.regenerateRecoveryCodes("tenant", identity, {}),
      403,
      "MFA_REQUIRED",
    );
  });

  it("rejects a trusted-MFA session whose auth_time is stale", async () => {
    const repository = new TotpCredentialRepository();
    const svc = new TotpService(repository);
    const controller = new TotpController(svc);
    const principalId = freshPrincipalId();
    await enrollAndConfirm(svc, principalId);
    const staleAuthTime = new Date(
      Date.now() - 20 * 60 * 1000,
    ).toISOString();
    const identity = buildIdentity(principalId, { authTime: staleAuthTime });

    await expectApiError(
      controller.regenerateRecoveryCodes("tenant", identity, {}),
      403,
      "STEP_UP_REQUIRED",
    );
  });

  it("rejects an unconfirmed (pending) credential even with a fresh trusted-MFA session", async () => {
    const repository = new TotpCredentialRepository();
    const svc = new TotpService(repository);
    const controller = new TotpController(svc);
    const principalId = freshPrincipalId();
    await svc.enroll(principalId, "tenant:user@example.com");
    const identity = buildIdentity(principalId);

    await expectApiError(
      controller.regenerateRecoveryCodes("tenant", identity, {}),
      400,
      "TOTP_NOT_CONFIRMED",
    );
  });

  it("never discloses the secret or the old codes in the regenerated response", async () => {
    const repository = new TotpCredentialRepository();
    const svc = new TotpService(repository);
    const controller = new TotpController(svc);
    const principalId = freshPrincipalId();
    const { secret, recoveryCodes: oldCodes } = await enrollAndConfirm(
      svc,
      principalId,
    );
    const identity = buildIdentity(principalId);

    const response = await controller.regenerateRecoveryCodes(
      "tenant",
      identity,
      {},
    );

    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain(secret);
    for (const oldCode of oldCodes) {
      expect(serialized).not.toContain(oldCode);
    }
  });
});
