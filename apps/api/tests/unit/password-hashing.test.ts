import { createHmac } from "node:crypto";
import * as argon2 from "argon2";
import { describe, expect, it } from "vitest";
import {
  PasswordHashingService,
  PasswordPepperNotConfiguredError,
} from "../../src/common/auth/password-hashing.service";

const PEPPER_V1 = "pepper-version-one-secret-value-32chars!!";
const PEPPER_V2 = "pepper-version-two-secret-value-32chars!!";

function serviceWithPeppers(
  secrets: Record<string, string>,
  currentVersion: string,
): PasswordHashingService {
  return new PasswordHashingService({
    PASSWORD_PEPPER_SECRETS_JSON: JSON.stringify(secrets),
    PASSWORD_PEPPER_CURRENT_VERSION: currentVersion,
  });
}

describe("PasswordHashingService", () => {
  it("fails closed at construction when no pepper secret is configured", () => {
    expect(() => new PasswordHashingService({})).toThrow(
      PasswordPepperNotConfiguredError,
    );
  });

  it("fails closed when only one of the two required pepper controls is set", () => {
    expect(
      () =>
        new PasswordHashingService({
          PASSWORD_PEPPER_SECRETS_JSON: JSON.stringify({ v1: PEPPER_V1 }),
        }),
    ).toThrow(PasswordPepperNotConfiguredError);

    expect(
      () =>
        new PasswordHashingService({
          PASSWORD_PEPPER_CURRENT_VERSION: "v1",
        }),
    ).toThrow(PasswordPepperNotConfiguredError);
  });

  it("fails closed when PASSWORD_PEPPER_SECRETS_JSON is not valid JSON", () => {
    expect(
      () =>
        new PasswordHashingService({
          PASSWORD_PEPPER_SECRETS_JSON: "{not json",
          PASSWORD_PEPPER_CURRENT_VERSION: "v1",
        }),
    ).toThrow(PasswordPepperNotConfiguredError);
  });

  it("fails closed when the current pepper version has no matching secret entry", () => {
    expect(() => serviceWithPeppers({ v1: PEPPER_V1 }, "v2")).toThrow(
      PasswordPepperNotConfiguredError,
    );
  });

  it("produces a different hash each time for the same password (random salt)", async () => {
    const service = serviceWithPeppers({ v1: PEPPER_V1 }, "v1");

    const first = await service.hash("correct horse battery staple");
    const second = await service.hash("correct horse battery staple");

    expect(first.hash).not.toBe(second.hash);
    expect(first.pepperVersion).toBe("v1");
    expect(first.algo).toBe("argon2id");
  });

  it("verifies the correct password and rejects an incorrect one", async () => {
    const service = serviceWithPeppers({ v1: PEPPER_V1 }, "v1");
    const { hash, pepperVersion } = await service.hash("s3cret-password!");

    const correct = await service.verify("s3cret-password!", {
      hash,
      pepperVersion,
    });
    expect(correct.valid).toBe(true);
    expect(correct.needsRehash).toBe(false);

    const incorrect = await service.verify("wrong-password", {
      hash,
      pepperVersion,
    });
    expect(incorrect.valid).toBe(false);
  });

  it("rejects a hash whose pepper_version is unknown (retired/never configured)", async () => {
    const issuer = serviceWithPeppers({ v1: PEPPER_V1 }, "v1");
    const { hash } = await issuer.hash("s3cret-password!");

    const verifier = serviceWithPeppers({ v2: PEPPER_V2 }, "v2");
    const result = await verifier.verify("s3cret-password!", {
      hash,
      pepperVersion: "v1",
    });

    expect(result.valid).toBe(false);
    expect(result.needsRehash).toBe(false);
  });

  it("still verifies an old pepper-version hash after rotation, flagging it for rehash", async () => {
    const before = serviceWithPeppers({ v1: PEPPER_V1 }, "v1");
    const stored = await before.hash("rotate-me-please");

    // Pepper rotated: v2 is now current, but v1 is kept so existing credentials
    // keep working until each principal next logs in successfully.
    const after = serviceWithPeppers({ v1: PEPPER_V1, v2: PEPPER_V2 }, "v2");

    const result = await after.verify("rotate-me-please", stored);
    expect(result.valid).toBe(true);
    expect(result.needsRehash).toBe(true);

    const rehashed = await after.hash("rotate-me-please");
    expect(rehashed.pepperVersion).toBe("v2");

    const reverified = await after.verify("rotate-me-please", rehashed);
    expect(reverified.valid).toBe(true);
    expect(reverified.needsRehash).toBe(false);
  });

  it("flags needsRehash when argon2 cost parameters have drifted from current config", async () => {
    const service = serviceWithPeppers({ v1: PEPPER_V1 }, "v1");
    const weakerHash = await argon2.hash(
      createHmac("sha256", PEPPER_V1)
        .update("legacy-params-password", "utf8")
        .digest(),
      { type: argon2.argon2id, memoryCost: 1024, timeCost: 1, parallelism: 1 },
    );

    const result = await service.verify("legacy-params-password", {
      hash: weakerHash,
      pepperVersion: "v1",
    });

    expect(result.valid).toBe(true);
    expect(result.needsRehash).toBe(true);
  });
});
