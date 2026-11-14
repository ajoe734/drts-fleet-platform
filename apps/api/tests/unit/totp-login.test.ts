import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { authenticator } from "otplib";

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
  const validCode = authenticator.generate(enrollment.secret);
  const confirmation = await svc.confirm(principalId, validCode);
  return {
    secret: enrollment.secret,
    recoveryCodes: confirmation.recoveryCodes,
  };
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

    const code = authenticator.generate(enrollment.secret);
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
      const code = authenticator.generate(secret);
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
      const code = authenticator.generate(secret);

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
    const confirmCode = authenticator.generate(enrollment.secret);
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
