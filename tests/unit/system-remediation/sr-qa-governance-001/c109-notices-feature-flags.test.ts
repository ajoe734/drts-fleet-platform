import { describe, expect, it } from "vitest";

import type {
  CreatePlatformNoticeCommand,
  SetPlatformMaintenanceModeCommand,
} from "@drts/contracts";
import { PlatformAdminService } from "../../../../apps/api/src/modules/platform-admin/platform-admin.service";
import { PlatformAdminController } from "../../../../apps/api/src/modules/platform-admin/platform-admin.controller";
import { FeatureFlagsService } from "../../../../apps/api/src/modules/feature-flags/feature-flags.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";

describe("C109: 公告／維護通知與分租戶功能旗標驗收", () => {
  function setupPlatformAdmin() {
    const auditNotificationService = new AuditNotificationService();
    const service = new PlatformAdminService(auditNotificationService);
    const controller = new PlatformAdminController(service);
    return { service, controller, auditNotificationService };
  }

  function setupFeatureFlags(
    auditNotificationService = new AuditNotificationService(),
  ) {
    const service = new FeatureFlagsService(
      undefined,
      auditNotificationService,
    );
    return { service, auditNotificationService };
  }

  describe("1. 平台公告與通知管理 (Platform Notices)", () => {
    it("1.1 建立平台公告草稿與排程，包含受眾、嚴重度，並寫入審計日誌", () => {
      const { service, auditNotificationService } = setupPlatformAdmin();

      const command: CreatePlatformNoticeCommand = {
        title: "2026 Q4 國道計程費率系統升級公告",
        body: "配合交通部高公局新式費率規程，系統將於 10/01 凌晨 02:00-04:00 進行維護。",
        severity: "warning",
        targetAudience: "all",
        scheduledAt: "2026-10-01T02:00:00.000Z",
      };

      const notice = service.createPlatformNotice(
        command,
        "req-c109-create-notice",
      );

      expect(notice.noticeId).toBeDefined();
      expect(notice.title).toBe(command.title);
      expect(notice.body).toBe(command.body);
      expect(notice.severity).toBe("warning");
      expect(notice.status).toBe("scheduled");
      expect(notice.targetAudience).toBe("all");
      expect(notice.scheduledAt).toBe("2026-10-01T02:00:00.000Z");
      expect(notice.resolvedAt).toBeNull();

      // 驗證審計紀錄
      const audit = auditNotificationService
        .listAuditLogs()
        .find(
          (log) =>
            log.actionName === "create_platform_notice" &&
            log.resourceId === notice.noticeId,
        );
      expect(audit).toBeDefined();
      expect(audit?.actorType).toBe("platform_admin");
      expect(audit?.newValuesSummary).toMatchObject({
        title: command.title,
        severity: "warning",
      });
    });

    it("1.2 公告建立之非空欄位校驗 (title / body 缺失拋出 400)", () => {
      const { service } = setupPlatformAdmin();

      expect(() =>
        service.createPlatformNotice({
          title: "   ",
          body: "內容正常",
          severity: "info",
          targetAudience: "tenants",
        }),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: "FIELD_REQUIRED" }),
          }),
        }),
      );

      expect(() =>
        service.createPlatformNotice({
          title: "正常標題",
          body: "",
          severity: "info",
          targetAudience: "tenants",
        }),
      ).toThrow(
        expect.objectContaining({
          status: 400,
          code: "FIELD_REQUIRED",
        }),
      );
    });

    it("1.3 公告完成/到期下架 (resolveNotice)：更新 resolvedAt 並記錄審計", () => {
      const { service, auditNotificationService } = setupPlatformAdmin();

      const created = service.createPlatformNotice({
        title: "突發路況應變提醒",
        body: "連假蘇花路段預防性落石封閉提醒",
        severity: "info",
        targetAudience: "drivers",
      });
      expect(created.status).toBe("active");

      const resolved = service.resolveNotice(
        created.noticeId,
        "req-c109-resolve-notice",
      );
      expect(resolved.noticeId).toBe(created.noticeId);
      expect(resolved.status).toBe("resolved");
      expect(resolved.resolvedAt).toBeDefined();

      // 再次取得列表驗證狀態
      const inList = service
        .listPlatformNotices()
        .find((n) => n.noticeId === created.noticeId);
      expect(inList?.status).toBe("resolved");

      // 驗證審計紀錄
      const audit = auditNotificationService
        .listAuditLogs()
        .find(
          (log) =>
            log.actionName === "resolve_platform_notice" &&
            log.resourceId === created.noticeId,
        );
      expect(audit).toBeDefined();
      expect(audit?.newValuesSummary).toEqual({ status: "resolved" });

      // 不存在的 noticeId 拋出 404
      expect(() => service.resolveNotice("non-existent-notice-id")).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: "NOTICE_NOT_FOUND" }),
          }),
        }),
      );
    });
  });

  describe("2. 全平臺維護模式 (Platform Maintenance Mode)", () => {
    it("2.1 啟用與停用維護模式，包含維護時間區間與原因，並完整記錄審計日誌", () => {
      const { service, auditNotificationService } = setupPlatformAdmin();

      const enableCommand: SetPlatformMaintenanceModeCommand = {
        enabled: true,
        reason: "資料庫分片遷移升級作業",
        scheduledStart: "2026-11-15T16:00:00.000Z",
        scheduledEnd: "2026-11-15T20:00:00.000Z",
      };

      const enabledState = service.setMaintenanceMode(
        enableCommand,
        "req-c109-enable-maint",
      );
      expect(enabledState.enabled).toBe(true);
      expect(enabledState.reason).toBe("資料庫分片遷移升級作業");
      expect(enabledState.scheduledStart).toBe("2026-11-15T16:00:00.000Z");
      expect(enabledState.scheduledEnd).toBe("2026-11-15T20:00:00.000Z");

      let audit = auditNotificationService
        .listAuditLogs()
        .find((l) => l.actionName === "enable_maintenance_mode");
      expect(audit).toBeDefined();
      expect(audit?.resourceType).toBe("platform_maintenance_mode");

      // 停用維護模式
      const disableCommand: SetPlatformMaintenanceModeCommand = {
        enabled: false,
        reason: "遷移作業提前完成",
      };
      const disabledState = service.setMaintenanceMode(
        disableCommand,
        "req-c109-disable-maint",
      );
      expect(disabledState.enabled).toBe(false);
      expect(disabledState.reason).toBe("遷移作業提前完成");

      audit = auditNotificationService
        .listAuditLogs()
        .find((l) => l.actionName === "disable_maintenance_mode");
      expect(audit).toBeDefined();
    });
  });

  describe("3. 功能旗標分租戶啟停與隔離 (Tenant Feature Flags)", () => {
    it("3.1 預設全域旗標讀取與分租戶獨立覆寫 (Tenant Override)", async () => {
      const auditService = new AuditNotificationService();
      const { service } = setupFeatureFlags(auditService);

      // 預設全域 flags 中包含 phase1.read-models (預設 enabled: true) 與 driver-app.shift (預設 false)
      const globalShiftFlag = await service.getByKey("driver-app.shift");
      expect(globalShiftFlag?.enabled).toBe(false);

      // 租戶 A 申請啟用 driver-app.shift 專屬功能
      await service.upsertTenantOverride(
        "driver-app.shift",
        "tenant-corp-alpha",
        true,
        "Beta test for Tenant Alpha shift tracking",
      );

      // 租戶 A 應取得已啟用狀態
      const tenantAFlag = await service.getByKey(
        "driver-app.shift",
        "tenant-corp-alpha",
      );
      expect(tenantAFlag?.enabled).toBe(true);
      expect(tenantAFlag?.tenantId).toBe("tenant-corp-alpha");

      // 租戶 B 與 全域應維持原樣 (false)
      const tenantBFlag = await service.getByKey(
        "driver-app.shift",
        "tenant-corp-beta",
      );
      expect(tenantBFlag?.enabled).toBe(false);
      expect(tenantBFlag?.tenantId).toBeUndefined();

      const globalAfter = await service.getByKey("driver-app.shift");
      expect(globalAfter?.enabled).toBe(false);

      // isEnabled 輔助方法
      expect(await service.isEnabled("driver-app.shift", "tenant-corp-alpha")).toBe(
        true,
      );
      expect(await service.isEnabled("driver-app.shift", "tenant-corp-beta")).toBe(
        false,
      );
      expect(await service.isEnabled("driver-app.shift")).toBe(false);
    });

    it("3.2 分租戶旗標合併查詢 (getAll with tenantId)", async () => {
      const { service } = setupFeatureFlags();

      // 為租戶 X 停用 booking 旗標 (全域預設為 true)
      await service.upsertTenantOverride(
        "tenant-portal.booking",
        "tenant-restricted-001",
        false,
        "Account suspended from booking",
      );

      const tenantFlags = await service.getAll("tenant-restricted-001");
      const bookingFlag = tenantFlags.find(
        (f) => f.key === "tenant-portal.booking",
      );
      expect(bookingFlag).toBeDefined();
      expect(bookingFlag?.enabled).toBe(false);
      expect(bookingFlag?.tenantId).toBe("tenant-restricted-001");

      // 其他未覆寫旗標仍包含在清單中（繼承全域）
      const billingFlag = tenantFlags.find(
        (f) => f.key === "tenant-portal.billing",
      );
      expect(billingFlag).toBeDefined();
      expect(billingFlag?.enabled).toBe(true);

      // 全域 getAll 保持未覆寫狀態
      const allGlobalFlags = await service.getAll();
      const globalBookingFlag = allGlobalFlags.find(
        (f) => f.key === "tenant-portal.booking",
      );
      expect(globalBookingFlag?.enabled).toBe(true);
      expect(globalBookingFlag?.tenantId).toBeUndefined();
    });

    it("3.3 分租戶旗標變更記錄審計日誌 (upsert_tenant_feature_flag)", async () => {
      const auditNotificationService = new AuditNotificationService();
      const { service } = setupFeatureFlags(auditNotificationService);

      await service.upsertTenantOverride(
        "opsRealMapEnabled",
        "tenant-enterprise-ops",
        true,
        "Pilot live map enablement",
      );

      const audit = auditNotificationService
        .listAuditLogs()
        .find(
          (log) =>
            log.actionName === "upsert_tenant_feature_flag" &&
            log.resourceId === "opsRealMapEnabled:tenant-enterprise-ops",
        );

      expect(audit).toBeDefined();
      expect(audit?.tenantId).toBe("tenant-enterprise-ops");
      expect(audit?.moduleName).toBe("feature-flags");
      expect(audit?.newValuesSummary).toMatchObject({
        key: "opsRealMapEnabled",
        tenantId: "tenant-enterprise-ops",
        enabled: true,
      });
    });
  });

  describe("4. 控制器標準 Envelope 契約整合 (Controller Contract Envelope)", () => {
    it("4.1 PlatformAdminController notices 與 maintenance-mode 端點回傳標準 API Success Envelope", () => {
      const { controller } = setupPlatformAdmin();

      // 4.1.1 listPlatformNotices
      const listRes = controller.listPlatformNotices("req-notices-list");
      expect(listRes.meta.requestId).toBe("req-notices-list");
      expect(Array.isArray(listRes.data.items)).toBe(true);

      // 4.1.2 createPlatformNotice
      const createRes = controller.createPlatformNotice(
        {
          title: "API 端點驗證通知",
          body: "測試經由控制器標準 Envelope 產生的公告",
          severity: "info",
          targetAudience: "ops",
        },
        "req-notice-create",
      );
      expect(createRes.meta.requestId).toBe("req-notice-create");
      expect(createRes.data.noticeId).toBeDefined();
      expect(createRes.data.title).toBe("API 端點驗證通知");

      // 4.1.3 resolveNotice
      const resolveRes = controller.resolveNotice(
        createRes.data.noticeId,
        "req-notice-resolve",
      );
      expect(resolveRes.meta.requestId).toBe("req-notice-resolve");
      expect(resolveRes.data.status).toBe("resolved");

      // 4.1.4 getMaintenanceMode & setMaintenanceMode
      const maintSetRes = controller.setMaintenanceMode(
        {
          enabled: true,
          reason: "控制器層級維護排程驗證",
        },
        "req-maint-set",
      );
      expect(maintSetRes.meta.requestId).toBe("req-maint-set");
      expect(maintSetRes.data.enabled).toBe(true);

      const maintGetRes = controller.getMaintenanceMode("req-maint-get");
      expect(maintGetRes.meta.requestId).toBe("req-maint-get");
      expect(maintGetRes.data.enabled).toBe(true);
      expect(maintGetRes.data.reason).toBe("控制器層級維護排程驗證");
    });
  });
});
