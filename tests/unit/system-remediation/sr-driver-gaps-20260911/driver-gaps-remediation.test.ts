// SR-DRIVER-GAPS-20260911 -- Driver-side four product gaps remediation unit tests
// Covers:
// 1. C051: Shift attendance clockIn checks driver lifecycle suspension & certification validity
// 2. C057 & C058: Driver statements identity ownership enforcement & downloadable PDF artifact generation
// 3. C060: Driver notification preference (notificationsEnabled) genuinely suppresses notification delivery
// 4. C061: Driver license expiry date model (T-30 window evaluation, automatic dispatch & auth blocking)

import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { DriverProfileService } from "../../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { DriverSettingsService } from "../../../../apps/api/src/modules/driver-settings/driver-settings.service";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { ShiftAttendanceService } from "../../../../apps/api/src/modules/shift-attendance/shift-attendance.service";

function createRegistryContext() {
  const auditService = new AuditNotificationService();
  const profileService = new DriverProfileService(
    new AuditNotificationService(),
  );
  const registry = new RegulatoryRegistryService(
    {
      publishDriverLocationUpdated: () => undefined,
      publishSupplyLifecycleUpdated: () => undefined,
    } as never,
    auditService,
    profileService,
    undefined,
  );
  return { auditService, registry };
}

describe("SR-DRIVER-GAPS-20260911: Remediation Suite", () => {
  describe("Gap 1 (C051): Shift attendance clockIn driver lifecycle & license suspension check", () => {
    it("allows an active driver with valid licenses to clock in", async () => {
      const { auditService, registry } = createRegistryContext();
      const shiftService = new ShiftAttendanceService(
        auditService,
        undefined,
        registry,
      );

      const shift = shiftService.clockIn({
        driverId: "drv-demo-001",
        vehicleId: "veh-demo-001",
      });

      expect(shift.shiftId).toBeTruthy();
      expect(shift.driverId).toBe("drv-demo-001");
      expect(shift.status).toBe("active");
    });

    it("blocks a suspended driver from clocking in with DRIVER_AUTH_SUSPENDED (403)", async () => {
      const { auditService, registry } = createRegistryContext();
      const shiftService = new ShiftAttendanceService(
        auditService,
        undefined,
        registry,
      );

      registry.updateDriverLifecycle("drv-demo-001", {
        lifecycleStatus: "suspended",
        reason: "Disciplinary suspension",
      });

      expect(() =>
        shiftService.clockIn({
          driverId: "drv-demo-001",
          vehicleId: "veh-demo-001",
        }),
      ).toThrowError(
        expect.objectContaining({
          status: 403,
          code: "DRIVER_AUTH_SUSPENDED",
        }),
      );
    });

    it("blocks a driver with expired licenses from clocking in with DRIVER_CERT_INVALID (403)", async () => {
      const { auditService, registry } = createRegistryContext();
      const shiftService = new ShiftAttendanceService(
        auditService,
        undefined,
        registry,
      );

      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      registry.updateDriverLicenses("drv-demo-001", {
        professionalDriverLicenseExpiry: pastDate,
      });

      expect(() =>
        shiftService.clockIn({
          driverId: "drv-demo-001",
          vehicleId: "veh-demo-001",
        }),
      ).toThrowError(
        expect.objectContaining({
          status: 403,
          code: "DRIVER_CERT_INVALID",
        }),
      );
    });
  });

  describe("Gap 2 (C057 & C058): Driver statement ownership enforcement & downloadable PDF artifact", () => {
    it("allows a driver to read their own statement and filters listDriverStatements by driverId", async () => {
      const auditService = new AuditNotificationService();
      const billingService = new BillingSettlementService(auditService);

      await billingService.publishDriverFeePlan({
        planName: "Driver Remediation Fee Plan",
        version: "v-driver-rem-001",
        serviceFeeBps: 1000,
        reimbursementMode: "platform_funded",
      });

      const generated = await billingService.generateDriverStatements({
        periodMonth: "2026-03",
      });
      const statement = generated.items.find(
        (s) => s.driverId === "drv-demo-001",
      );
      expect(statement).toBeTruthy();

      // Read own statement
      const read = billingService.getDriverStatement(
        statement!.statementId,
        "drv-demo-001",
      );
      expect(read.statementId).toBe(statement!.statementId);
      expect(read.driverId).toBe("drv-demo-001");

      // Filter statements by driverId
      const list = billingService.listDriverStatements(
        "2026-03",
        "drv-demo-001",
      );
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((s) => s.driverId === "drv-demo-001")).toBe(true);
    });

    it("rejects another driver requesting someone else's statement with DRIVER_IDENTITY_MISMATCH (403)", async () => {
      const auditService = new AuditNotificationService();
      const billingService = new BillingSettlementService(auditService);

      await billingService.publishDriverFeePlan({
        planName: "Driver Remediation Fee Plan",
        version: "v-driver-rem-002",
        serviceFeeBps: 1000,
        reimbursementMode: "platform_funded",
      });

      const generated = await billingService.generateDriverStatements({
        periodMonth: "2026-03",
      });
      const statement = generated.items.find(
        (s) => s.driverId === "drv-demo-001",
      );
      expect(statement).toBeTruthy();

      expect(() =>
        billingService.getDriverStatement(
          statement!.statementId,
          "drv-demo-002",
        ),
      ).toThrowError(
        expect.objectContaining({
          status: 403,
          code: "DRIVER_IDENTITY_MISMATCH",
        }),
      );
    });

    it("generates downloadable PDF artifact and controlled download metadata for driver statements", async () => {
      const auditService = new AuditNotificationService();
      const billingService = new BillingSettlementService(auditService);

      await billingService.publishDriverFeePlan({
        planName: "Driver Remediation Fee Plan",
        version: "v-driver-rem-003",
        serviceFeeBps: 1000,
        reimbursementMode: "platform_funded",
      });

      const generated = await billingService.generateDriverStatements({
        periodMonth: "2026-03",
      });
      const statement = generated.items[0]!;

      expect(statement.artifactUrl).toBeTruthy();
      expect(statement.artifactDownloadMetadata).toBeTruthy();
      expect(statement.artifactDownloadMetadata?.kind).toBe("report");
      expect(statement.artifactDownloadMetadata?.subjectId).toBe(
        statement.statementId,
      );
      expect(statement.artifactDownloadMetadata?.downloadUrl).toBe(
        statement.artifactUrl,
      );
    });
  });

  describe("Gap 3 (C060): Driver notification preference genuinely affects delivery", () => {
    it("suppresses driver_task notifications when notificationsEnabled is false", async () => {
      const auditService = new AuditNotificationService();
      const settingsService = new DriverSettingsService(auditService);

      settingsService.updateSettings("drv-demo-optout-001", {
        notificationsEnabled: false,
      });

      expect(settingsService.isNotificationEnabled("drv-demo-optout-001")).toBe(
        false,
      );
      expect(
        settingsService.shouldDeliverNotification(
          "drv-demo-optout-001",
          "driver_task",
        ),
      ).toBe(false);

      const beforeCount = auditService.listNotifications().length;
      const notif = auditService.recordNotification({
        tenantId: null,
        channel: "driver_task",
        title: "Driver statement generated",
        message:
          "Statement DRV-202603-001 is ready for driver drv-demo-optout-001.",
        status: "unread",
      });

      expect(notif.notificationId).toBeTruthy();
      // Should NOT be added to stored notifications
      expect(auditService.listNotifications().length).toBe(beforeCount);
      expect(
        auditService
          .listNotifications()
          .some((n) => n.notificationId === notif.notificationId),
      ).toBe(false);
    });

    it("delivers notifications normally when notificationsEnabled is true", async () => {
      const auditService = new AuditNotificationService();
      const settingsService = new DriverSettingsService(auditService);

      settingsService.updateSettings("drv-demo-optin-001", {
        notificationsEnabled: true,
      });

      expect(settingsService.isNotificationEnabled("drv-demo-optin-001")).toBe(
        true,
      );
      expect(
        settingsService.shouldDeliverNotification(
          "drv-demo-optin-001",
          "driver_task",
        ),
      ).toBe(true);

      const beforeCount = auditService.listNotifications().length;
      const notif = auditService.recordNotification({
        tenantId: null,
        channel: "driver_task",
        title: "Driver statement generated",
        message:
          "Statement DRV-202603-001 is ready for driver drv-demo-optin-001.",
        status: "unread",
      });

      expect(notif.notificationId).toBeTruthy();
      expect(auditService.listNotifications().length).toBe(beforeCount + 1);
      expect(
        auditService
          .listNotifications()
          .some((n) => n.notificationId === notif.notificationId),
      ).toBe(true);
    });
  });

  describe("Gap 4 (C061): Driver license expiry date model & dispatch blocking", () => {
    it("ensures driver records have expiry date fields and past expiry revokes dispatch eligibility", async () => {
      const { registry } = createRegistryContext();

      const driver = registry
        .listDrivers()
        .find((d) => d.driverId === "drv-demo-001")!;
      expect(driver.licenseExpiry).toBeTruthy();
      expect(driver.professionalDriverLicenseExpiry).toBeTruthy();
      expect(driver.taxiDriverRegistrationExpiry).toBeTruthy();
      expect(driver.licensesValid).toBe(true);
      expect(driver.dispatchEligible).toBe(true);

      // Expire professional driver license
      const yesterday = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString();
      const updated = registry.updateDriverLicenses("drv-demo-001", {
        professionalDriverLicenseExpiry: yesterday,
      });

      expect(updated.licensesValid).toBe(false);
      expect(updated.dispatchEligible).toBe(false);
      expect(updated.eligibilityBlockedReasons).toContain("licenses_invalid");

      // Verify read-back via listDrivers()
      const readBack = registry
        .listDrivers()
        .find((d) => d.driverId === "drv-demo-001")!;
      expect(readBack.licensesValid).toBe(false);
      expect(readBack.dispatchEligible).toBe(false);
      expect(readBack.eligibilityBlockedReasons).toContain("licenses_invalid");

      // Verify assertDriverAuthEligible throws
      expect(() =>
        registry.assertDriverAuthEligible("drv-demo-001"),
      ).toThrowError(
        expect.objectContaining({
          status: 403,
          code: "DRIVER_CERT_INVALID",
        }),
      );
    });

    it("evaluates T-30 expiring license window correctly via listExpiringDriverLicenses", async () => {
      const { registry } = createRegistryContext();
      const now = Date.now();
      const in15Days = new Date(now + 15 * 24 * 60 * 60 * 1000).toISOString();
      const in60Days = new Date(now + 60 * 24 * 60 * 60 * 1000).toISOString();

      registry.updateDriverLicenses("drv-demo-001", {
        professionalDriverLicenseExpiry: in15Days,
      });
      registry.updateDriverLicenses("drv-demo-002", {
        professionalDriverLicenseExpiry: in60Days,
      });

      const expiring30 = registry.listExpiringDriverLicenses(30);
      const expiring30Ids = expiring30.map((d) => d.driverId);
      expect(expiring30Ids).toContain("drv-demo-001");
      expect(expiring30Ids).not.toContain("drv-demo-002");

      const expiring90 = registry.listExpiringDriverLicenses(90);
      const expiring90Ids = expiring90.map((d) => d.driverId);
      expect(expiring90Ids).toContain("drv-demo-001");
      expect(expiring90Ids).toContain("drv-demo-002");
    });
  });
});
