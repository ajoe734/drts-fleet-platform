import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generate } from "otplib";

import { TotpCredentialRepository } from "../../src/modules/auth/totp-credential.repository";
import {
  TotpEnrollmentNotFoundError,
  TotpInvalidCodeError,
  TotpSecretAlreadyConfirmedError,
  TotpService,
} from "../../src/modules/auth/totp.service";

// TotpSecretCipher fails closed (Stage 1.5 §15.2) unless a key ring is
// configured; TotpService constructs it fresh per call rather than via DI
// (see totp.service.ts), so tests set the env var directly, mirroring
// tests/unit/tenant-invitation-lifecycle.test.ts's PASSWORD_PEPPER setup.
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

function service(): TotpService {
  return new TotpService(new TotpCredentialRepository());
}

let principalCounter = 0;
function freshPrincipalId(): string {
  principalCounter += 1;
  return `principal-${principalCounter}`;
}

describe("TotpService enrollment", () => {
  it("enroll() returns an otpauth URI for the DRTS issuer and a base32 secret", async () => {
    const svc = service();
    const principalId = freshPrincipalId();
    const result = await svc.enroll(principalId, "tenant:user@example.com");

    expect(result.otpauthUri.startsWith("otpauth://totp/")).toBe(true);
    expect(result.otpauthUri).toContain("issuer=DRTS");
    expect(result.otpauthUri).toContain(`secret=${result.secret}`);
    expect(result.otpauthUri).toContain(
      encodeURIComponent("tenant:user@example.com"),
    );
    expect(result.secret.length).toBeGreaterThan(0);
  });

  it("does not persist the TOTP secret in plaintext", async () => {
    const repository = new TotpCredentialRepository();
    const svc = new TotpService(repository);
    const principalId = freshPrincipalId();
    const result = await svc.enroll(principalId, "tenant:user@example.com");

    const stored = await repository.findCredential(principalId);
    expect(stored).not.toBeNull();
    const serialized = JSON.stringify(stored);
    expect(serialized).not.toContain(result.secret);
    expect(stored!.secretCiphertext.ciphertext).not.toEqual(result.secret);
  });

  it("confirm() rejects when there is no pending enrollment", async () => {
    const svc = service();
    await expect(
      svc.confirm(freshPrincipalId(), "123456"),
    ).rejects.toBeInstanceOf(TotpEnrollmentNotFoundError);
  });

  it("confirm() rejects an incorrect code and leaves the secret unconfirmed", async () => {
    const repository = new TotpCredentialRepository();
    const svc = new TotpService(repository);
    const principalId = freshPrincipalId();
    await svc.enroll(principalId, "tenant:user@example.com");

    await expect(svc.confirm(principalId, "000000")).rejects.toBeInstanceOf(
      TotpInvalidCodeError,
    );

    const stored = await repository.findCredential(principalId);
    expect(stored!.confirmedAt).toBeNull();
  });

  it("confirm() with a valid code activates the secret and issues 10 one-time recovery codes", async () => {
    const repository = new TotpCredentialRepository();
    const svc = new TotpService(repository);
    const principalId = freshPrincipalId();
    const enrollment = await svc.enroll(principalId, "tenant:user@example.com");

    const validCode = await generate({ secret: enrollment.secret });
    const confirmation = await svc.confirm(principalId, validCode);

    expect(confirmation.recoveryCodes).toHaveLength(10);
    expect(new Set(confirmation.recoveryCodes).size).toBe(10);

    const stored = await repository.findCredential(principalId);
    expect(stored!.confirmedAt).not.toBeNull();
  });

  it("confirm() rejects a second confirmation of an already-confirmed secret", async () => {
    const repository = new TotpCredentialRepository();
    const svc = new TotpService(repository);
    const principalId = freshPrincipalId();
    const enrollment = await svc.enroll(principalId, "tenant:user@example.com");
    const validCode = await generate({ secret: enrollment.secret });
    await svc.confirm(principalId, validCode);

    await expect(svc.confirm(principalId, validCode)).rejects.toBeInstanceOf(
      TotpSecretAlreadyConfirmedError,
    );
  });

  it("re-enrolling resets confirmation so the previous secret can no longer be used to confirm", async () => {
    const repository = new TotpCredentialRepository();
    const svc = new TotpService(repository);
    const principalId = freshPrincipalId();
    const firstEnrollment = await svc.enroll(
      principalId,
      "tenant:user@example.com",
    );
    const firstValidCode = await generate({ secret: firstEnrollment.secret });
    await svc.confirm(principalId, firstValidCode);

    const secondEnrollment = await svc.enroll(
      principalId,
      "tenant:user@example.com",
    );
    expect(secondEnrollment.secret).not.toEqual(firstEnrollment.secret);

    const stored = await repository.findCredential(principalId);
    expect(stored!.confirmedAt).toBeNull();

    // The old secret's code can no longer confirm anything -- enroll()
    // overwrote the stored (encrypted) secret entirely.
    await expect(
      svc.confirm(principalId, firstValidCode),
    ).rejects.toBeInstanceOf(TotpInvalidCodeError);
  });
});
