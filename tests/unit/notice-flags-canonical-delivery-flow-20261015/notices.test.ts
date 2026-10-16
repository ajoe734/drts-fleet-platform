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
