import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ServiceProductController } from "../../../../apps/api/src/modules/service-product/service-product.controller";
import { ServiceProductRepository } from "../../../../apps/api/src/modules/service-product/service-product.repository";
import { ServiceProductService } from "../../../../apps/api/src/modules/service-product/service-product.service";

describe("C107: 服務產品型別、資格要求、預約/即時時間、結算模式與多端一致性驗收", () => {
  function createService() {
    const auditNotificationService = new AuditNotificationService();
    const repository = new ServiceProductRepository();
    const service = new ServiceProductService(
      auditNotificationService,
      repository,
    );
    const controller = new ServiceProductController(service);
    return { auditNotificationService, repository, service, controller };
  }

  it("初始狀態驗證：服務產品註冊表預設為 0 筆空清單，此乃冷啟動正常狀態而非後端 API 故障", () => {
    const { service, controller } = createService();

    const initialList = service.listServiceProducts();
    expect(initialList).toEqual([]);
    expect(initialList.length).toBe(0);

    const controllerEnvelope = controller.listServiceProducts("req-c107-init-list");
    expect(controllerEnvelope.data.items).toEqual([]);
    expect(controllerEnvelope.meta.requestId).toBe("req-c107-init-list");
  });

  it("建立合法服務產品主檔：支援 travel_agency_transfer，核對時間模式與預設結算模式", () => {
    const { service, auditNotificationService } = createService();

    const created = service.createServiceProduct(
      {
        serviceProductType: "travel_agency_transfer",
        serviceProductId: "SVP-TRAVEL-VIP-01",
        displayName: "旅行社特約機場包車接駁",
        description: "提供旅行社團體專用之九人座商務包車與接送服務",
        timing: "reservation",
        active: true,
        defaultBillingMode: "partner_settlement",
        defaultProofRequirements: ["guest_manifest", "agency_voucher", "guest_manifest"], // 含重複項
      },
      "req-c107-create-product",
      { captureAudit: true },
    );

    expect(created.data.serviceProductId).toBe("SVP-TRAVEL-VIP-01");
    expect(created.data.serviceProductType).toBe("travel_agency_transfer");
    expect(created.data.displayName).toBe("旅行社特約機場包車接駁");
    expect(created.data.timing).toBe("reservation");
    expect(created.data.defaultBillingMode).toBe("partner_settlement");
    expect(created.data.active).toBe(true);
    // 重複證明需求去重
    expect(created.data.defaultProofRequirements).toEqual([
      "guest_manifest",
      "agency_voucher",
    ]);

    // 審計記錄驗證
    const audit = auditNotificationService.listAuditLogs()[0];
    expect(audit).toBeDefined();
    expect(audit?.actionName).toBe("create_service_product");
    expect(audit?.resourceId).toBe("SVP-TRAVEL-VIP-01");
    expect(audit?.requestId).toBe("req-c107-create-product");
  });

  it("輸入邊界防禦：重複的 serviceProductId 或無效的結算模式即時拒絕，拋出 ApiRequestError", () => {
    const { service } = createService();

    service.createServiceProduct({
      serviceProductType: "enterprise_dispatch",
      serviceProductId: "SVP-CORP-01",
      displayName: "企業商務差旅",
      timing: "realtime",
      defaultBillingMode: "tenant_invoice",
    });

    // 重複 ID
    expect(() =>
      service.createServiceProduct({
        serviceProductType: "enterprise_dispatch",
        serviceProductId: "SVP-CORP-01",
        displayName: "企業商務差旅複本",
        timing: "realtime",
        defaultBillingMode: "tenant_invoice",
      }),
    ).toThrowError(ApiRequestError);

    // 非法結算模式
    expect(() =>
      service.createServiceProduct({
        serviceProductType: "enterprise_dispatch",
        serviceProductId: "SVP-CORP-02",
        displayName: "非法結算測試",
        timing: "realtime",
        defaultBillingMode: "invalid_crypto_token" as any,
      }),
    ).toThrowError(ApiRequestError);
  });

  it("更新服務產品屬性：修改 displayName、啟用狀態 (active) 與結算模式，並驗證審計留痕", () => {
    const { service, auditNotificationService } = createService();

    const created = service.createServiceProduct(
      {
        serviceProductType: "enterprise_dispatch",
        serviceProductId: "SVP-UPDATE-TEST-01",
        displayName: "初期企業接送",
        timing: "reservation",
        defaultBillingMode: "tenant_invoice",
        active: true,
      },
      "req-c107-init",
      { captureAudit: true },
    );

    const updated = service.updateServiceProduct(
      created.data.serviceProductId,
      {
        displayName: "旗艦級企業智慧接駁",
        active: false,
        defaultBillingMode: "partner_settlement",
        timing: "realtime",
      },
      "req-c107-update",
      { captureAudit: true },
    );

    expect(updated.data.displayName).toBe("旗艦級企業智慧接駁");
    expect(updated.data.active).toBe(false);
    expect(updated.data.defaultBillingMode).toBe("partner_settlement");
    expect(updated.data.timing).toBe("realtime");

    const auditLogs = auditNotificationService.listAuditLogs();
    const updateLog = auditLogs.find(
      (l) =>
        l.actionName === "update_service_product" &&
        l.resourceId === "SVP-UPDATE-TEST-01",
    );
    expect(updateLog).toBeDefined();
    expect(updateLog?.requestId).toBe("req-c107-update");
  });

  it("多端與控制器一致性：Controller 與 Service 底層 registry 查詢資料完全同構一致", () => {
    const { service, controller } = createService();

    const receipt = controller.createServiceProduct(
      {
        serviceProductType: "taxi_realtime",
        serviceProductId: "SVP-TAXI-001",
        displayName: "一般市區即時計程車",
        timing: "realtime",
        defaultBillingMode: "meter",
        active: true,
      },
      "req-ctrl-create",
    );

    expect(receipt.data.message).toBe("Service product created.");

    const fromService = service.getServiceProduct("SVP-TAXI-001");
    expect(fromService).toBeDefined();
    expect(fromService?.displayName).toBe("一般市區即時計程車");
    expect(fromService?.defaultBillingMode).toBe("meter");

    const listEnvelope = controller.listServiceProducts("req-ctrl-list");
    const item = listEnvelope.data.items.find(
      (p) => p.serviceProductId === "SVP-TAXI-001",
    );
    expect(item).toEqual(fromService);
  });
});
