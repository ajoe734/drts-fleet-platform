import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH_SINGLE_FACTOR,
  PASSWORD_MIN_LENGTH_WITH_TOTP,
  PasswordPolicyService,
  PasswordPolicyViolationError,
} from "../../src/common/auth/password-policy.service";

const WITHOUT_TOTP = { totpEnabled: false };
const WITH_TOTP = { totpEnabled: true };

function serviceWithList(entries: readonly string[]): PasswordPolicyService {
  const dir = mkdtempSync(join(tmpdir(), "drts-password-policy-"));
  const listPath = join(dir, "common-passwords.txt");
  writeFileSync(listPath, entries.join("\n"), "utf8");
  return new PasswordPolicyService(listPath);
}

describe("PasswordPolicyService", () => {
  describe("length policy", () => {
    const service = serviceWithList([]);

    it(`rejects a password shorter than ${PASSWORD_MIN_LENGTH_SINGLE_FACTOR} chars when TOTP is not enabled`, () => {
      const candidate = "a".repeat(PASSWORD_MIN_LENGTH_SINGLE_FACTOR - 1);
      expect(service.evaluate(candidate, WITHOUT_TOTP)).toEqual({
        valid: false,
        reason: "TOO_SHORT",
      });
    });

    it(`accepts a password exactly ${PASSWORD_MIN_LENGTH_SINGLE_FACTOR} chars long when TOTP is not enabled`, () => {
      const candidate = "a".repeat(PASSWORD_MIN_LENGTH_SINGLE_FACTOR);
      expect(service.evaluate(candidate, WITHOUT_TOTP)).toEqual({
        valid: true,
      });
    });

    it(`rejects a password shorter than ${PASSWORD_MIN_LENGTH_WITH_TOTP} chars even when TOTP is enabled`, () => {
      const candidate = "a".repeat(PASSWORD_MIN_LENGTH_WITH_TOTP - 1);
      expect(service.evaluate(candidate, WITH_TOTP)).toEqual({
        valid: false,
        reason: "TOO_SHORT",
      });
    });

    it(`accepts a password exactly ${PASSWORD_MIN_LENGTH_WITH_TOTP} chars long when TOTP is enabled`, () => {
      const candidate = "a".repeat(PASSWORD_MIN_LENGTH_WITH_TOTP);
      expect(service.evaluate(candidate, WITH_TOTP)).toEqual({ valid: true });
    });

    it(`a ${PASSWORD_MIN_LENGTH_WITH_TOTP}-14 char password is only accepted once TOTP is enabled`, () => {
      const candidate = "a".repeat(PASSWORD_MIN_LENGTH_SINGLE_FACTOR - 1);
      expect(service.evaluate(candidate, WITHOUT_TOTP).valid).toBe(false);
      expect(service.evaluate(candidate, WITH_TOTP).valid).toBe(true);
    });

    it(`rejects a password longer than ${PASSWORD_MAX_LENGTH} chars regardless of TOTP`, () => {
      const candidate = "a".repeat(PASSWORD_MAX_LENGTH + 1);
      expect(service.evaluate(candidate, WITHOUT_TOTP)).toEqual({
        valid: false,
        reason: "TOO_LONG",
      });
      expect(service.evaluate(candidate, WITH_TOTP)).toEqual({
        valid: false,
        reason: "TOO_LONG",
      });
    });

    it(`accepts a password exactly ${PASSWORD_MAX_LENGTH} chars long`, () => {
      const candidate = "a".repeat(PASSWORD_MAX_LENGTH);
      expect(service.evaluate(candidate, WITH_TOTP)).toEqual({ valid: true });
    });
  });

  describe("offline common/breached list", () => {
    it("rejects a long, otherwise-valid password that is on the offline list (case-insensitive)", () => {
      const listed = "aVeryCommonLeakedPassphrase!!"; // 29 chars, satisfies length either way
      const service = serviceWithList([listed.toLowerCase()]);

      expect(service.evaluate(listed, WITHOUT_TOTP)).toEqual({
        valid: false,
        reason: "COMMON_OR_BREACHED",
      });
      expect(service.evaluate(listed.toUpperCase(), WITH_TOTP)).toEqual({
        valid: false,
        reason: "COMMON_OR_BREACHED",
      });
    });

    it("accepts a long password that is not on the list", () => {
      const service = serviceWithList(["aVeryCommonLeakedPassphrase!!"]);
      expect(
        service.evaluate("totally-unrelated-passphrase-xyz", WITHOUT_TOTP),
      ).toEqual({ valid: true });
    });

    it("ignores blank lines and comment lines in the list file", () => {
      const service = serviceWithList([
        "# comment line, not a password",
        "",
        "   ",
        "listed-weak-passphrase-entry",
      ]);
      expect(
        service.evaluate("listed-weak-passphrase-entry", WITH_TOTP),
      ).toEqual({ valid: false, reason: "COMMON_OR_BREACHED" });
      expect(
        service.evaluate("# comment line, not a password", WITH_TOTP).valid,
      ).toBe(true);
    });

    it("loads the real shipped common-passwords.txt and rejects well-known entries", () => {
      const service = new PasswordPolicyService();
      // Both satisfy the 8-char TOTP-enabled minimum, so a rejection here can
      // only come from the list check, not the length check.
      expect(service.evaluate("password", WITH_TOTP)).toEqual({
        valid: false,
        reason: "COMMON_OR_BREACHED",
      });
      expect(service.evaluate("qwertyuiop123", WITH_TOTP)).toEqual({
        valid: false,
        reason: "COMMON_OR_BREACHED",
      });
    });

    it("throws a clear error when the configured list file does not exist", () => {
      expect(
        () => new PasswordPolicyService("/nonexistent/path/does-not-exist.txt"),
      ).toThrow(/Failed to load the offline common\/breached password list/);
    });
  });

  describe("no network access", () => {
    it("the service source never references a network I/O API", () => {
      const source = readFileSync(
        join(__dirname, "../../src/common/auth/password-policy.service.ts"),
        "utf8",
      );
      for (const forbidden of [
        "fetch(",
        "node:http",
        "node:https",
        "node:dgram",
        "node:net",
        "node:dns",
        "axios",
        "undici",
        "XMLHttpRequest",
      ]) {
        expect(source).not.toContain(forbidden);
      }
    });

    it("evaluate() resolves synchronously (no Promise, so no awaited I/O of any kind)", () => {
      const service = serviceWithList(["a-known-listed-passphrase-value"]);
      const result = service.evaluate(
        "a-known-listed-passphrase-value",
        WITH_TOTP,
      );
      expect(result).not.toBeInstanceOf(Promise);
      expect(result).toEqual({ valid: false, reason: "COMMON_OR_BREACHED" });
    });
  });

  describe("assertValid / PasswordPolicyViolationError", () => {
    it("throws PasswordPolicyViolationError with the rejection reason and no password material", () => {
      const service = serviceWithList(["a-listed-weak-passphrase-value"]);
      const secret = "a-listed-weak-passphrase-value";

      let caught: unknown;
      try {
        service.assertValid(secret, WITH_TOTP);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(PasswordPolicyViolationError);
      const violation = caught as PasswordPolicyViolationError;
      expect(violation.reason).toBe("COMMON_OR_BREACHED");
      expect(violation.code).toBe("PASSWORD_POLICY_VIOLATION");
      expect(violation.message).not.toContain(secret);
      expect(JSON.stringify(violation)).not.toContain(secret);
    });

    it("does not throw for a valid password", () => {
      const service = serviceWithList([]);
      expect(() =>
        service.assertValid("a".repeat(PASSWORD_MIN_LENGTH_SINGLE_FACTOR), WITHOUT_TOTP),
      ).not.toThrow();
    });
  });
});
