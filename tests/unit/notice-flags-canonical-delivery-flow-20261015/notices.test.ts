import { afterEach, describe, expect, it, vi } from "vitest";
import { PlatformAdminService } from "../../../apps/api/src/modules/platform-admin/platform-admin.service";
import { PlatformAdminController } from "../../../apps/api/src/modules/platform-admin/platform-admin.controller";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";

afterEach(() => vi.useRealTimers());
const command = {
  title: "Timed notice",
  body: "Actual command",
  severity: "warning" as const,
  targetAudience: "drivers" as const,
  scheduledAt: "2026-10-16T10:00:00Z",
  expiresAt: "2026-10-16T11:00:00Z",
};
describe("production notice clock and command boundaries", () => {
  it.each([
    ["2026-10-16T09:59:59.999Z", "scheduled"],
    ["2026-10-16T10:00:00.000Z", "active"],
    ["2026-10-16T10:00:00.001Z", "active"],
    ["2026-10-16T10:59:59.999Z", "active"],
    ["2026-10-16T11:00:00.000Z", "resolved"],
    ["2026-10-16T11:00:00.001Z", "resolved"],
  ])(
    "evaluates the actual canonical projection at %s as %s",
    (now, expected) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-16T09:00:00Z"));
      const service = new PlatformAdminService(new AuditNotificationService());
      const created = service.createPlatformNotice(command);
      vi.setSystemTime(new Date(now!));
      expect(
        service
          .listPlatformNotices()
          .find((n) => n.noticeId === created.noticeId)?.status,
      ).toBe(expected);
    },
  );
  it("retains explicit open-ended notices and manual resolve across clock changes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T09:00:00Z"));
    const service = new PlatformAdminService(new AuditNotificationService());
    const open = service.createPlatformNotice({
      ...command,
      scheduledAt: null,
      expiresAt: null,
    });
    expect(open.updatedAt).toBe("2026-10-16T09:00:00.000Z");
    const scheduled = service.createPlatformNotice(command);
    service.resolveNotice(scheduled.noticeId);
    vi.setSystemTime(new Date("2027-10-16T12:00:00Z"));
    expect(
      service.listPlatformNotices().find((n) => n.noticeId === open.noticeId),
    ).toMatchObject({ status: "active", expiresAt: null });
    expect(
      service
        .listPlatformNotices()
        .find((n) => n.noticeId === scheduled.noticeId),
    ).toMatchObject({ status: "resolved", downlistedReason: "manual" });
  });
  it("activates at schedule, downlists at explicit expiry, retains canonical history", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T09:00:00Z"));
    const service = new PlatformAdminService(new AuditNotificationService());
    const controller = new PlatformAdminController(service);
    const created = controller.createPlatformNotice(command).data;
    expect(created.status).toBe("scheduled");
    vi.setSystemTime(new Date("2026-10-16T10:00:00Z"));
    expect(
      controller
        .listPlatformNotices()
        .data.items.find((n) => n.noticeId === created.noticeId)?.status,
    ).toBe("active");
    vi.setSystemTime(new Date("2026-10-16T11:00:00Z"));
    expect(
      controller
        .listPlatformNotices()
        .data.items.find((n) => n.noticeId === created.noticeId),
    ).toMatchObject({
      status: "resolved",
      downlistedReason: "expired",
      expiresAt: "2026-10-16T11:00:00.000Z",
      storageMode: "process_memory",
    });
  });
  it("rejects invalid and empty dates and inverted explicit windows before a success audit", () => {
    const audit = new AuditNotificationService();
    const service = new PlatformAdminService(audit);
    for (const dates of [
      { scheduledAt: "garbage" },
      { scheduledAt: "" },
      { expiresAt: "" },
      { expiresAt: "invalid" },
      { expiresAt: "2026-10-16T09:00:00Z" },
    ]) {
      expect(() =>
        service.createPlatformNotice({ ...command, ...dates }),
      ).toThrow();
    }
    expect(
      audit
        .listAuditLogs()
        .filter((a) => a.actionName === "create_platform_notice"),
    ).toEqual([]);
  });
});
