import { describe, expect, it } from "vitest";
import { CredentialStatus } from "@drts/contracts";
import {
  evaluateCredentialExpiry,
  DEFAULT_WARNING_THRESHOLD_DAYS,
} from "../../../../apps/platform-admin-web/app/adapter-registry/credential-expiry";

describe("SR-ADMIN-ADAPTER-001 — Credential Expiry Truth Evaluation", () => {
  const fixedTargetExpiry = "2026-09-30T00:00:00.000Z";

  describe("Four Credential Expiry States", () => {
    it("evaluates to 'valid' when expiry date is comfortably in the future beyond threshold", () => {
      // 90 days before expiry: 2026-07-02
      const referenceDate = new Date("2026-07-02T00:00:00.000Z");
      const result = evaluateCredentialExpiry(
        {
          id: "test-adapter",
          credentialStatus: CredentialStatus.VALID,
          credentialExpiresAt: fixedTargetExpiry,
        },
        referenceDate,
      );

      expect(result.state).toBe("valid");
      expect(result.daysRemaining).toBe(90);
      expect(result.formattedExpiryDate).toBe("2026-09-30");
      expect(result.statusLabel).toBe("未到期");
    });

    it("evaluates to 'expiring_soon' when expiry date is within the warning threshold (30 days)", () => {
      // 10 days before expiry: 2026-09-20
      const referenceDate = new Date("2026-09-20T00:00:00.000Z");
      const result = evaluateCredentialExpiry(
        {
          id: "test-adapter",
          credentialStatus: CredentialStatus.VALID,
          credentialExpiresAt: fixedTargetExpiry,
        },
        referenceDate,
      );

      expect(result.state).toBe("expiring_soon");
      expect(result.daysRemaining).toBe(10);
      expect(result.formattedExpiryDate).toBe("2026-09-30");
      expect(result.statusLabel).toBe("即將到期");
    });

    it("evaluates to 'expired' when expiry date is in the past (daysRemaining <= 0)", () => {
      // 1 day after expiry: 2026-10-01
      const referenceDate = new Date("2026-10-01T00:00:00.000Z");
      const result = evaluateCredentialExpiry(
        {
          id: "test-adapter",
          credentialStatus: CredentialStatus.VALID,
          credentialExpiresAt: fixedTargetExpiry,
        },
        referenceDate,
      );

      expect(result.state).toBe("expired");
      expect(result.daysRemaining).toBeLessThanOrEqual(0);
      expect(result.formattedExpiryDate).toBe("2026-09-30");
      expect(result.statusLabel).toBe("已到期");
    });

    it("evaluates to 'expired' immediately if credentialStatus is explicitly EXPIRED", () => {
      const referenceDate = new Date("2026-05-01T00:00:00.000Z"); // far before expiry
      const result = evaluateCredentialExpiry(
        {
          id: "test-adapter",
          credentialStatus: CredentialStatus.EXPIRED,
          credentialExpiresAt: fixedTargetExpiry,
        },
        referenceDate,
      );

      expect(result.state).toBe("expired");
      expect(result.daysRemaining).toBe(0);
      expect(result.statusLabel).toBe("已到期");
    });

    it("evaluates to 'unknown' when credential timestamp is null or missing", () => {
      const resultNull = evaluateCredentialExpiry({
        id: "test-adapter",
        credentialStatus: CredentialStatus.VALID,
        credentialExpiresAt: null,
      });

      expect(resultNull.state).toBe("unknown");
      expect(resultNull.daysRemaining).toBeNull();
      expect(resultNull.formattedExpiryDate).toBeNull();
      expect(resultNull.statusLabel).toBe("未知");

      const resultUndefined = evaluateCredentialExpiry(undefined);
      expect(resultUndefined.state).toBe("unknown");
      expect(resultUndefined.daysRemaining).toBeNull();
    });

    it("evaluates to 'unknown' when credential timestamp is an invalid string", () => {
      const result = evaluateCredentialExpiry({
        id: "test-adapter",
        credentialStatus: CredentialStatus.VALID,
        credentialExpiresAt: "not-a-valid-date",
      });

      expect(result.state).toBe("unknown");
      expect(result.daysRemaining).toBeNull();
      expect(result.statusLabel).toBe("未知");
    });
  });

  describe("Dynamic State Transition Across Moving Reference Dates", () => {
    it("transitions precisely from valid -> expiring_soon -> expired as time advances", () => {
      const expiry = "2026-08-31T00:00:00.000Z";
      const adapter = {
        credentialExpiresAt: expiry,
        credentialStatus: CredentialStatus.VALID,
      };

      // T-60 (July 2): 60 days remaining -> valid
      const tMinus60 = evaluateCredentialExpiry(
        adapter,
        new Date("2026-07-02T00:00:00.000Z"),
      );
      expect(tMinus60.state).toBe("valid");
      expect(tMinus60.daysRemaining).toBe(60);

      // T-31 (July 31): 31 days remaining -> valid (threshold is 30)
      const tMinus31 = evaluateCredentialExpiry(
        adapter,
        new Date("2026-07-31T00:00:00.000Z"),
      );
      expect(tMinus31.state).toBe("valid");
      expect(tMinus31.daysRemaining).toBe(31);

      // T-30 (August 1): 30 days remaining -> expiring_soon
      const tMinus30 = evaluateCredentialExpiry(
        adapter,
        new Date("2026-08-01T00:00:00.000Z"),
      );
      expect(tMinus30.state).toBe("expiring_soon");
      expect(tMinus30.daysRemaining).toBe(30);

      // T-5 (August 26): 5 days remaining -> expiring_soon
      const tMinus5 = evaluateCredentialExpiry(
        adapter,
        new Date("2026-08-26T00:00:00.000Z"),
      );
      expect(tMinus5.state).toBe("expiring_soon");
      expect(tMinus5.daysRemaining).toBe(5);

      // T+0 (August 31 00:00:00): 0 days remaining -> expired
      const tZero = evaluateCredentialExpiry(
        adapter,
        new Date("2026-08-31T00:00:00.000Z"),
      );
      expect(tZero.state).toBe("expired");
      expect(tZero.daysRemaining).toBeLessThanOrEqual(0);

      // T+1 (September 1): -1 days remaining -> expired
      const tPlus1 = evaluateCredentialExpiry(
        adapter,
        new Date("2026-09-01T00:00:00.000Z"),
      );
      expect(tPlus1.state).toBe("expired");
      expect(tPlus1.daysRemaining).toBe(-1);
    });

    it("respects custom warningThresholdDays", () => {
      const expiry = "2026-08-31T00:00:00.000Z";
      const referenceDate = new Date("2026-08-16T00:00:00.000Z"); // 15 days remaining
      const adapter = {
        credentialExpiresAt: expiry,
        credentialStatus: CredentialStatus.VALID,
      };

      // With default threshold (30 days) -> expiring_soon
      const resultDefault = evaluateCredentialExpiry(
        adapter,
        referenceDate,
        DEFAULT_WARNING_THRESHOLD_DAYS,
      );
      expect(resultDefault.state).toBe("expiring_soon");

      // With custom strict threshold (7 days) -> valid (15 days > 7 days)
      const resultCustom = evaluateCredentialExpiry(adapter, referenceDate, 7);
      expect(resultCustom.state).toBe("valid");
    });
  });

  describe("Input Flexibility", () => {
    it("accepts string timestamp directly", () => {
      const result = evaluateCredentialExpiry(
        "2026-12-31T00:00:00.000Z",
        new Date("2026-06-01T00:00:00.000Z"),
      );
      expect(result.state).toBe("valid");
      expect(result.formattedExpiryDate).toBe("2026-12-31");
    });

    it("accepts expiresAt alias property from record dictionaries", () => {
      const result = evaluateCredentialExpiry(
        { expiresAt: "2026-10-15T00:00:00.000Z" } as any,
        new Date("2026-10-10T00:00:00.000Z"),
      );
      expect(result.state).toBe("expiring_soon");
      expect(result.daysRemaining).toBe(5);
    });
  });
});
