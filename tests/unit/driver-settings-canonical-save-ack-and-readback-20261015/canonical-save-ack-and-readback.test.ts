import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverSettingsController } from "../../../apps/api/src/modules/driver-settings/driver-settings.controller";
import { DriverSettingsRepository } from "../../../apps/api/src/modules/driver-settings/driver-settings.repository";
import { DriverSettingsService } from "../../../apps/api/src/modules/driver-settings/driver-settings.service";
import {
  buildDriverIdentity,
  createSettingsFixture,
  flush,
  observe,
} from "./fixture";

const callerProbePath = path.resolve(
  __dirname,
  "settings-preferences-caller-probe.cjs",
);

describe("DRIVER-SETTINGS-CANONICAL-SAVE-ACK-AND-READBACK-20261015 (C060-F1)", () => {
  describe("c060_preferences_actual_canonical_save_ACK", () => {
    it("keeps PATCH controller and service updateSettings pending while enabled repository query is delayed, and publishes cache/audit only after authoritative ACK", async () => {
      const f = createSettingsFixture();
      const identity = buildDriverIdentity("drv-ack-001");

      const patch = observe(
        f.controller.updateSettings(
          "drv-ack-001",
          {
            language: "zh-TW",
            notificationsEnabled: false,
            autoAcceptEnabled: true,
            maxAcceptRadius: 15,
            preferredAreas: ["downtown", "airport"],
          },
          identity,
          "req-ack-001",
        ),
      );

      await flush();

      expect(f.writes).toHaveLength(1);
      expect(patch.state.status).toBe("pending");

      // Cache and audit must NOT be published before repository ACK
      expect(f.service.getSettings("drv-ack-001")).toMatchObject({
        driverId: "drv-ack-001",
        language: "en",
        notificationsEnabled: true,
        autoAcceptEnabled: false,
        maxAcceptRadius: null,
        preferredAreas: [],
      });
      expect(f.service.listAll()).toEqual([]);
      expect(f.auditWrites).not.toHaveBeenCalled();

      f.writes[0]!.commit();
      await patch.settled;

      expect(patch.state.status).toBe("fulfilled");
      expect(patch.state.value?.data).not.toBeInstanceOf(Promise);
      expect(patch.state.value).toMatchObject({
        data: {
          driverId: "drv-ack-001",
          language: "zh-TW",
          notificationsEnabled: false,
          autoAcceptEnabled: true,
          maxAcceptRadius: 15,
          preferredAreas: ["downtown", "airport"],
          updatedAt: f.writes[0]!.updatedAt,
        },
        meta: {
          requestId: "req-ack-001",
        },
      });

      expect(f.service.getSettings("drv-ack-001")).toEqual(
        patch.state.value?.data,
      );
      expect(
        f.controller.getSettings("drv-ack-001", identity, "req-read-001").data,
      ).toEqual(patch.state.value?.data);
      expect(f.controller.listAll(identity).data.items).toEqual([
        patch.state.value?.data,
      ]);
      expect(f.auditWrites).toHaveBeenCalledTimes(1);
      expect(f.audit.listAuditLogs()[0]).toMatchObject({
        actorId: "drv-ack-001",
        moduleName: "driver-settings",
        actionName: "update_driver_settings",
        resourceType: "driver_settings",
        resourceId: "drv-ack-001",
        requestId: "req-ack-001",
      });
    });

    it("rejects PATCH API and service when repository upsert rejects, without emitting 200 success, audit log, or mutating memory cache", async () => {
      const f = createSettingsFixture();
      const identity = buildDriverIdentity("drv-ack-reject");

      const patch = observe(
        f.controller.updateSettings(
          "drv-ack-reject",
          {
            language: "ja",
            notificationsEnabled: false,
            maxAcceptRadius: 20,
          },
          identity,
          "req-reject-001",
        ),
      );

      await flush();
      expect(f.writes).toHaveLength(1);
      expect(patch.state.status).toBe("pending");

      const dbError = new Error("Simulated PostgreSQL write failure");
      f.writes[0]!.rejectBeforeCommit(dbError);
      await patch.settled;

      expect(patch.state.status).toBe("rejected");
      expect(patch.state.error).toBe(dbError);
      expect(f.report).toHaveBeenCalledWith(dbError, "update_settings");
      expect(f.auditWrites).not.toHaveBeenCalled();
      expect(f.service.listAll()).toEqual([]);
      expect(f.service.getSettings("drv-ack-reject")).toMatchObject({
        driverId: "drv-ack-reject",
        language: "en",
        notificationsEnabled: true,
        autoAcceptEnabled: false,
        maxAcceptRadius: null,
        preferredAreas: [],
      });
    });

    it("retains honest rejection without pretending a throw rolled back SQL when a transport error leaves commit outcome uncertain, and converges on canonical reconstruction or retry", async () => {
      const f = createSettingsFixture();
      const identity = buildDriverIdentity("drv-uncertain-001");

      // Establish initial committed baseline
      f.autoCommit(true);
      const baseline = await f.controller.updateSettings(
        "drv-uncertain-001",
        {
          language: "en",
          notificationsEnabled: true,
          maxAcceptRadius: 10,
          preferredAreas: ["taipei"],
        },
        identity,
        "req-baseline",
      );
      expect(baseline.data.maxAcceptRadius).toBe(10);
      expect(f.auditWrites).toHaveBeenCalledTimes(1);

      // Next write suffers a transport error AFTER the database stored the row
      f.autoCommit(false);
      const uncertainPatch = observe(
        f.controller.updateSettings(
          "drv-uncertain-001",
          {
            language: "zh-TW",
            notificationsEnabled: false,
            maxAcceptRadius: 25,
          },
          identity,
          "req-uncertain",
        ),
      );

      await flush();
      expect(f.writes).toHaveLength(2);
      const transportError = new Error(
        "Connection terminated unexpectedly after server commit",
      );
      f.writes[1]!.rejectAfterCommitUncertain(transportError);
      await uncertainPatch.settled;

      // API must reject honestly and not emit a false success audit or unacknowledged cache mutation
      expect(uncertainPatch.state.status).toBe("rejected");
      expect(uncertainPatch.state.error).toBe(transportError);
      expect(f.report).toHaveBeenCalledWith(transportError, "update_settings");
      expect(f.auditWrites).toHaveBeenCalledTimes(1);
      expect(f.service.getSettings("drv-uncertain-001")).toEqual(baseline.data);

      // Do not pretend the JS throw rolled back SQL: canonical storage has the committed row,
      // which a reconstructed service reads honestly via loadAll()
      const reconstructed = await f.reload();
      expect(
        reconstructed.service.getSettings("drv-uncertain-001"),
      ).toMatchObject({
        driverId: "drv-uncertain-001",
        language: "zh-TW",
        notificationsEnabled: false,
        maxAcceptRadius: 25,
        preferredAreas: ["taipei"],
      });

      // Retrying the unacknowledged save on the active service succeeds and converges cache, audit, and DB
      f.autoCommit(true);
      const retried = await f.controller.updateSettings(
        "drv-uncertain-001",
        {
          language: "zh-TW",
          notificationsEnabled: false,
          maxAcceptRadius: 25,
        },
        identity,
        "req-retry-after-uncertain",
      );
      expect(retried.data).toMatchObject({
        driverId: "drv-uncertain-001",
        language: "zh-TW",
        notificationsEnabled: false,
        maxAcceptRadius: 25,
        preferredAreas: ["taipei"],
      });
      expect(f.service.getSettings("drv-uncertain-001")).toEqual(retried.data);
      expect(f.auditWrites).toHaveBeenCalledTimes(2);
    });
  });

  describe("c060_preferences_failure_retry_restore_and_notification_truth", () => {
    it("prevents pending or failed preference writes from poisoning notification filtering, then applies filtering after retry succeeds and across fresh service reconstruction", async () => {
      const f = createSettingsFixture();
      const driverId = "drv-notif-truth-001";
      const identity = buildDriverIdentity(driverId);

      // Attempt to disable notifications, but DB write is delayed then rejected
      const failedOptOut = observe(
        f.controller.updateSettings(
          driverId,
          { notificationsEnabled: false },
          identity,
          "req-optout-fail",
        ),
      );
      await flush();
      expect(failedOptOut.state.status).toBe("pending");

      // While pending, notificationsEnabled must still be true and notifications must be delivered
      expect(f.service.isNotificationEnabled(driverId)).toBe(true);
      expect(f.service.shouldDeliverNotification(driverId, "driver_task")).toBe(
        true,
      );
      const pendingNotif = f.audit.recordNotification({
        tenantId: null,
        channel: "driver_task",
        title: "Statement ready while write pending",
        message: `Statement DRV-202603-001 is ready for driver ${driverId}.`,
        status: "unread",
      });
      expect(
        f.audit
          .listNotifications()
          .some((n) => n.notificationId === pendingNotif.notificationId),
      ).toBe(true);

      // Reject the opt-out write
      f.writes[0]!.rejectBeforeCommit(new Error("opt-out write failed"));
      await failedOptOut.settled;
      expect(failedOptOut.state.status).toBe("rejected");

      // After failed opt-out, notification filtering must NOT trust the failed write
      expect(f.service.isNotificationEnabled(driverId)).toBe(true);
      expect(f.service.shouldDeliverNotification(driverId, "driver_task")).toBe(
        true,
      );
      const afterFailNotif = f.audit.recordNotification({
        tenantId: null,
        channel: "driver_task",
        title: "Statement ready after write failed",
        message: `Statement DRV-202603-002 is ready for driver ${driverId}.`,
        status: "unread",
      });
      expect(
        f.audit
          .listNotifications()
          .some((n) => n.notificationId === afterFailNotif.notificationId),
      ).toBe(true);

      // Retry opt-out and commit
      f.autoCommit(true);
      const committedOptOut = await f.controller.updateSettings(
        driverId,
        { notificationsEnabled: false },
        identity,
        "req-optout-retry",
      );
      expect(committedOptOut.data.notificationsEnabled).toBe(false);
      expect(f.service.isNotificationEnabled(driverId)).toBe(false);
      expect(f.service.shouldDeliverNotification(driverId, "driver_task")).toBe(
        false,
      );

      const countBeforeSuppressed = f.audit.listNotifications().length;
      const suppressedNotif = f.audit.recordNotification({
        tenantId: null,
        channel: "driver_task",
        title: "Suppressed statement notification",
        message: `Statement DRV-202603-003 is ready for driver ${driverId}.`,
        status: "unread",
      });
      expect(suppressedNotif.notificationId).toContain("notif-suppressed-");
      expect(f.audit.listNotifications()).toHaveLength(countBeforeSuppressed);

      // Reconstruct from canonical records and verify notification suppression persists
      const reconstructed = await f.reload();
      expect(reconstructed.service.isNotificationEnabled(driverId)).toBe(false);
      const reconstructedBeforeCount =
        reconstructed.audit.listNotifications().length;
      const reconstructedSuppressed = reconstructed.audit.recordNotification({
        tenantId: null,
        channel: "driver_task",
        title: "Suppressed after reconstruction",
        message: `Statement DRV-202603-004 is ready for driver ${driverId}.`,
        status: "unread",
      });
      expect(reconstructedSuppressed.notificationId).toContain(
        "notif-suppressed-",
      );
      expect(reconstructed.audit.listNotifications()).toHaveLength(
        reconstructedBeforeCount,
      );

      // Now test reverse: failed opt-in write cannot re-enable delivery
      f.autoCommit(false);
      const failedOptIn = observe(
        f.controller.updateSettings(
          driverId,
          { notificationsEnabled: true },
          identity,
          "req-optin-fail",
        ),
      );
      await flush();
      f.writes[2]!.rejectBeforeCommit(new Error("opt-in write failed"));
      await failedOptIn.settled;
      expect(failedOptIn.state.status).toBe("rejected");
      expect(f.service.isNotificationEnabled(driverId)).toBe(false);
      f.audit.recordNotification({
        tenantId: null,
        channel: "driver_task",
        title: "Still suppressed after failed opt-in",
        message: `Statement DRV-202603-005 is ready for driver ${driverId}.`,
        status: "unread",
      });
      expect(f.audit.listNotifications()).toHaveLength(countBeforeSuppressed);
    });

    it("preserves fields across two same-driver partial updates (overlapping and sequential) and recovers cleanly when an intermediate patch rejects", async () => {
      const f = createSettingsFixture();
      const driverId = "drv-partial-001";
      const identity = buildDriverIdentity(driverId);

      // Two overlapping same-driver partial updates + one concurrent different-driver update
      const patch1 = observe(
        f.controller.updateSettings(
          driverId,
          {
            language: "zh-TW",
            autoAcceptEnabled: true,
            maxAcceptRadius: 15,
            preferredAreas: ["zhongshan", "daan"],
          },
          identity,
          "req-partial-1",
        ),
      );
      const patch2 = observe(
        f.controller.updateSettings(
          driverId,
          {
            notificationsEnabled: false,
            maxAcceptRadius: 25,
          },
          identity,
          "req-partial-2",
        ),
      );
      const otherDriverPatch = observe(
        f.service.updateSettings("drv-other-001", {
          language: "ko",
        }),
      );

      await flush();
      // Only patch1 for drv-partial-001 and otherDriverPatch for drv-other-001 should have issued SQL so far
      expect(f.writes).toHaveLength(2);
      expect(f.writes[0]!.driverId).toBe(driverId);
      expect(f.writes[1]!.driverId).toBe("drv-other-001");

      // Other driver's write commits independently while drv-partial-001 is still pending
      f.writes[1]!.commit();
      await otherDriverPatch.settled;
      expect(otherDriverPatch.state.status).toBe("fulfilled");
      expect(patch1.state.status).toBe("pending");
      expect(patch2.state.status).toBe("pending");

      // Commit patch1 -> patch2 must stage on top of patch1's committed fields
      f.writes[0]!.commit();
      await patch1.settled;
      await flush();

      expect(f.writes).toHaveLength(3);
      expect(f.writes[2]!.record).toMatchObject({
        driverId,
        language: "zh-TW",
        notificationsEnabled: false,
        autoAcceptEnabled: true,
        maxAcceptRadius: 25,
        preferredAreas: ["zhongshan", "daan"],
      });

      f.writes[2]!.commit();
      await patch2.settled;
      expect(patch2.state.status).toBe("fulfilled");

      // Queue patch3 (which will reject) followed by patch4 (which must preserve patch2's committed state)
      const patch3 = observe(
        f.controller.updateSettings(
          driverId,
          {
            language: "fr",
            autoAcceptEnabled: false,
          },
          identity,
          "req-partial-3-fail",
        ),
      );
      const patch4 = observe(
        f.controller.updateSettings(
          driverId,
          {
            preferredAreas: ["xinyi"],
          },
          identity,
          "req-partial-4-ok",
        ),
      );

      await flush();
      expect(f.writes).toHaveLength(4);
      f.writes[3]!.rejectBeforeCommit(new Error("patch3 rejected"));
      await patch3.settled;
      expect(patch3.state.status).toBe("rejected");

      await flush();
      expect(f.writes).toHaveLength(5);
      expect(f.writes[4]!.record).toMatchObject({
        driverId,
        language: "zh-TW",
        notificationsEnabled: false,
        autoAcceptEnabled: true,
        maxAcceptRadius: 25,
        preferredAreas: ["xinyi"],
      });
      f.writes[4]!.commit();
      await patch4.settled;
      expect(patch4.state.status).toBe("fulfilled");

      const finalSettings = f.service.getSettings(driverId);
      expect(finalSettings).toMatchObject({
        driverId,
        language: "zh-TW",
        notificationsEnabled: false,
        autoAcceptEnabled: true,
        maxAcceptRadius: 25,
        preferredAreas: ["xinyi"],
      });

      const reconstructed = await f.reload();
      expect(reconstructed.service.getSettings(driverId)).toEqual(
        finalSettings,
      );
    });
  });

  describe("c060_preferences_existing_behavior_and_actual_callers", () => {
    it("preserves explicit no-DB defaults/updates, defensive preferredAreas cloning, own-driver realm/identity enforcement, cross-driver 404 denial, and non-driver channel delivery", async () => {
      const audit = new AuditNotificationService();
      const noDbRepo = new DriverSettingsRepository();
      const service = new DriverSettingsService(audit, noDbRepo);
      const controller = new DriverSettingsController(service);

      expect(noDbRepo.isEnabled()).toBe(false);

      const defaults = service.getSettings("drv-nodb-001");
      expect(defaults).toMatchObject({
        driverId: "drv-nodb-001",
        language: "en",
        notificationsEnabled: true,
        autoAcceptEnabled: false,
        maxAcceptRadius: null,
        preferredAreas: [],
      });

      const areas = ["area-1", "area-2"];
      const updated = await service.updateSettings("drv-nodb-001", {
        language: "zh-TW",
        notificationsEnabled: false,
        autoAcceptEnabled: true,
        maxAcceptRadius: 12,
        preferredAreas: areas,
      });

      expect(updated).toMatchObject({
        driverId: "drv-nodb-001",
        language: "zh-TW",
        notificationsEnabled: false,
        autoAcceptEnabled: true,
        maxAcceptRadius: 12,
        preferredAreas: ["area-1", "area-2"],
      });
      expect(service.getSettings("drv-nodb-001").preferredAreas).toEqual([
        "area-1",
        "area-2",
      ]);

      // Cross-driver denial on GET and PATCH
      const drv1Identity = buildDriverIdentity("e2e-driver-drv-nodb-001");
      expect(
        controller.getSettings("drv-nodb-001", drv1Identity).data.language,
      ).toBe("zh-TW");
      expect(controller.listAll(drv1Identity).data.items).toHaveLength(1);

      expect(() =>
        controller.getSettings("drv-other", drv1Identity),
      ).toThrowError(ApiRequestError);
      expect(() =>
        controller.updateSettings(
          "drv-other",
          { language: "ja" },
          drv1Identity,
        ),
      ).toThrowError(ApiRequestError);

      // Non-driver channels (e.g. safety/ops) are not suppressed when notificationsEnabled=false
      expect(
        service.shouldDeliverNotification("drv-nodb-001", "safety_alert"),
      ).toBe(true);
      expect(
        service.shouldDeliverNotification("drv-nodb-001", "ops_escalation"),
      ).toBe(true);
      const safetyNotif = audit.recordNotification({
        tenantId: null,
        channel: "ops_notice",
        recipientUserId: "drv-nodb-001",
        title: "Safety alert",
        message: "Emergency notice for driver drv-nodb-001",
        status: "unread",
      });
      expect(
        audit
          .listNotifications()
          .some((n) => n.notificationId === safetyNotif.notificationId),
      ).toBe(true);
    });

    it("drives the real mounted apps/driver-app/app/settings.tsx save and readback contract across delayed ACK, rejected save, partial save, retry, and remount reconstruction", () => {
      const output = execFileSync(process.execPath, [callerProbePath], {
        encoding: "utf8",
        timeout: 25000,
      });
      expect(output).toContain("PASS settings-preferences-caller-probe");
    }, 30000);
  });
});
