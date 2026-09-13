import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

describe("SR-CREDENTIAL-EXPIRY-20260913: Canonical Fingerprints & Date Evaluation Invariants", () => {
  const computeDriverFingerprint = (
    scope: string,
    driverId: string,
    sourceFieldName: string,
    expiryIso: string,
  ): string => {
    const tuple = [
      "credential-expiry/v1",
      scope,
      "driver",
      driverId,
      sourceFieldName,
      Date.parse(expiryIso),
    ];
    return createHash("sha256").update(JSON.stringify(tuple)).digest("hex");
  };

  const computePolicyFingerprint = (
    scope: string,
    policyId: string,
    vehicleId: string,
    policyNo: string,
    insuranceType: string,
    startAtIso: string,
    endAtIso: string,
    status: string,
  ): string => {
    const tuple = [
      "credential-expiry/v1",
      scope,
      "policy",
      policyId,
      vehicleId,
      policyNo,
      insuranceType,
      Date.parse(startAtIso),
      Date.parse(endAtIso),
      status,
    ];
    return createHash("sha256").update(JSON.stringify(tuple)).digest("hex");
  };

  const computeDeliveryIntentKey = (
    scope: string,
    eventId: string,
    recipientEmail: string,
  ): string => {
    const tuple = ["credential-alert/v1", scope, eventId, recipientEmail];
    return JSON.stringify(tuple);
  };

  describe("Canonical Driver Fingerprint Specification", () => {
    it("computes deterministic SHA-256 over exact canonical JSON tuple", () => {
      const scope = "default";
      const driverId = "drv-001";
      const field = "licenseExpiry";
      const expiry = "2026-05-01T00:00:00.000Z";

      const fp1 = computeDriverFingerprint(scope, driverId, field, expiry);
      const fp2 = computeDriverFingerprint(scope, driverId, field, expiry);
      expect(fp1).toBe(fp2);
      expect(fp1).toMatch(/^[a-f0-9]{64}$/);
    });

    it("changes fingerprint when expiry date changes (e.g. renewal)", () => {
      const scope = "default";
      const driverId = "drv-001";
      const field = "licenseExpiry";

      const fpOld = computeDriverFingerprint(scope, driverId, field, "2026-05-01T00:00:00.000Z");
      const fpNew = computeDriverFingerprint(scope, driverId, field, "2027-05-01T00:00:00.000Z");
      expect(fpOld).not.toBe(fpNew);
    });

    it("distinguishes different driver credential fields", () => {
      const scope = "default";
      const driverId = "drv-001";
      const expiry = "2026-05-01T00:00:00.000Z";

      const fp1 = computeDriverFingerprint(scope, driverId, "licenseExpiry", expiry);
      const fp2 = computeDriverFingerprint(scope, driverId, "professionalDriverLicenseExpiry", expiry);
      const fp3 = computeDriverFingerprint(scope, driverId, "taxiDriverRegistrationExpiry", expiry);
      expect(fp1).not.toBe(fp2);
      expect(fp2).not.toBe(fp3);
      expect(fp1).not.toBe(fp3);
    });
  });

  describe("Canonical Policy Fingerprint Specification", () => {
    it("computes deterministic SHA-256 over exact 10-element tuple", () => {
      const fp1 = computePolicyFingerprint(
        "default",
        "pol-100",
        "veh-200",
        "INS-9999",
        "commercial_liability",
        "2025-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
        "active",
      );
      const fp2 = computePolicyFingerprint(
        "default",
        "pol-100",
        "veh-200",
        "INS-9999",
        "commercial_liability",
        "2025-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
        "active",
      );
      expect(fp1).toBe(fp2);
      expect(fp1).toMatch(/^[a-f0-9]{64}$/);
    });

    it("changes when policy status or endAt changes", () => {
      const fpActive = computePolicyFingerprint(
        "default",
        "pol-100",
        "veh-200",
        "INS-9999",
        "commercial_liability",
        "2025-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
        "active",
      );
      const fpCancelled = computePolicyFingerprint(
        "default",
        "pol-100",
        "veh-200",
        "INS-9999",
        "commercial_liability",
        "2025-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
        "cancelled",
      );
      expect(fpActive).not.toBe(fpCancelled);
    });
  });

  describe("Delivery Intent Key Specification", () => {
    it("produces deterministic canonical key tuple ['credential-alert/v1', scope, eventId, recipientEmail]", () => {
      const key1 = computeDeliveryIntentKey("tenant-alpha", "evt-uuid-1", "alert@driver.local");
      const key2 = computeDeliveryIntentKey("tenant-alpha", "evt-uuid-1", "alert@driver.local");
      expect(key1).toBe(key2);
      expect(key1).toBe('["credential-alert/v1","tenant-alpha","evt-uuid-1","alert@driver.local"]');
    });

    it("distinguishes different events or scopes", () => {
      const key1 = computeDeliveryIntentKey("tenant-alpha", "evt-uuid-1", "alert@driver.local");
      const key2 = computeDeliveryIntentKey("tenant-beta", "evt-uuid-1", "alert@driver.local");
      const key3 = computeDeliveryIntentKey("tenant-alpha", "evt-uuid-2", "alert@driver.local");
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
    });
  });

  describe("Date Comparison Rules (§B4)", () => {
    it("driver evaluation: expiry <= asOf is expired, expiry > asOf is valid", () => {
      const asOfMs = Date.parse("2026-06-01T12:00:00.000Z");

      const expiredExact = Date.parse("2026-06-01T12:00:00.000Z");
      const expiredPast = Date.parse("2026-06-01T11:59:59.000Z");
      const validFuture = Date.parse("2026-06-01T12:00:01.000Z");

      expect(expiredExact <= asOfMs).toBe(true);
      expect(expiredPast <= asOfMs).toBe(true);
      expect(validFuture <= asOfMs).toBe(false);
    });

    it("policy evaluation: endAt < asOf is expired, endAt >= asOf is not expired", () => {
      const asOfMs = Date.parse("2026-06-01T12:00:00.000Z");

      const notExpiredExact = Date.parse("2026-06-01T12:00:00.000Z");
      const expiredPast = Date.parse("2026-06-01T11:59:59.999Z");
      const validFuture = Date.parse("2026-06-01T12:00:01.000Z");

      expect(expiredPast < asOfMs).toBe(true);
      expect(notExpiredExact < asOfMs).toBe(false);
      expect(validFuture < asOfMs).toBe(false);
    });

    it("policy precedence: cancelled policies take precedence over endAt < asOf", () => {
      const policy = {
        status: "cancelled",
        startAt: "2025-01-01T00:00:00.000Z",
        endAt: "2026-01-01T00:00:00.000Z",
      };
      const asOfMs = Date.parse("2026-06-01T12:00:00.000Z");

      // Even though endAt < asOf, cancelled status takes precedence
      const isExpired =
        policy.status !== "cancelled" &&
        Date.parse(policy.endAt) < asOfMs &&
        Date.parse(policy.startAt) <= asOfMs;

      expect(isExpired).toBe(false);
    });

    it("policy precedence: pending policy (startAt > asOf) is pending, not expired", () => {
      const policy = {
        status: "active",
        startAt: "2026-07-01T00:00:00.000Z",
        endAt: "2026-08-01T00:00:00.000Z",
      };
      const asOfMs = Date.parse("2026-06-01T12:00:00.000Z");

      const isExpired =
        policy.status !== "cancelled" &&
        Date.parse(policy.endAt) < asOfMs &&
        Date.parse(policy.startAt) <= asOfMs;

      expect(isExpired).toBe(false);
    });
  });
});
