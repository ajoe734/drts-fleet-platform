import { describe, it, expect, beforeEach } from "vitest";
import {
  HostViewRepository,
  HostViewService,
  HostViewController,
  HOST_ERROR_CODES,
} from "../../../../apps/api/src/modules/host-view";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";

describe("SR-QA-NEWFEATURES-001 / C012: 車主 Host 受限讀取模型、資料隔離與變更所有權端到端驗收", () => {
  let repository: HostViewRepository;
  let service: HostViewService;
  let controller: HostViewController;

  const HOST_A = "partner_host_alpha";
  const HOST_B = "partner_host_beta";

  const VEHICLE_A1 = "veh_host_a_001";
  const VEHICLE_A2 = "veh_host_a_002";
  const VEHICLE_B1 = "veh_host_b_001";

  const createHostIdentity = (
    partnerId: string,
    scopes: string[] = ["owned:read", "reports:read", "maintenance:read"],
  ): BootstrapRequestIdentity => ({
    authMode: "bootstrap_headers",
    actorType: "partner_user",
    actorId: `usr_${partnerId}`,
    partnerId,
    tenantId: null,
    realm: "partner",
    roleFamilies: ["partner"],
    roles: ["vehicle_owner"],
    scopes,
    requestId: `req_${partnerId}_001`,
  });

  beforeEach(() => {
    repository = new HostViewRepository();
    service = new HostViewService(repository);
    controller = new HostViewController(service);

    // Seed vehicles for Host A
    repository.seedVehicle({
      vehicleId: VEHICLE_A1,
      ownerPartnerId: HOST_A,
      plateNo: "TDC-1001",
      vin: "1HGCR2F83HA100101",
      vehicleForm: "sedan",
      licenseClass: "multi_taxi",
      energyType: "electric",
      currentStatus: "active",
      operatingFleetName: "大台北車行",
      contractPeriod: {
        startAt: "2026-01-01T00:00:00.000Z",
        endAt: "2026-12-31T23:59:59.000Z",
        status: "active",
      },
    });

    repository.seedVehicle({
      vehicleId: VEHICLE_A2,
      ownerPartnerId: HOST_A,
      plateNo: "TDC-1002",
      vin: "1HGCR2F83HA100102",
      vehicleForm: "mpv",
      licenseClass: "taxi",
      energyType: "hybrid",
      currentStatus: "maintenance",
      operatingFleetName: "台中客運",
      contractPeriod: null,
    });

    // Seed vehicle for Host B
    repository.seedVehicle({
      vehicleId: VEHICLE_B1,
      ownerPartnerId: HOST_B,
      plateNo: "TDC-2001",
      vin: "1HGCR2F83HA200201",
      vehicleForm: "suv",
      licenseClass: "multi_taxi",
      energyType: "gasoline",
      currentStatus: "active",
      operatingFleetName: "高雄車隊",
      contractPeriod: {
        startAt: "2026-03-01T00:00:00.000Z",
        endAt: "2027-02-28T23:59:59.000Z",
        status: "active",
      },
    });

    // Seed maintenance item for VEHICLE_A1
    repository.seedMaintenanceItem({
      maintenanceId: "maint_001",
      vehicleId: VEHICLE_A1,
      status: "completed",
      type: "regular",
      description: "五萬公里定期保養與更換煞車皮",
      scheduledAt: "2026-08-10",
      completedAt: "2026-08-10",
      cost: 4500,
      notesSummary: "各項安全項目檢測正常",
    });

    // Seed trip item for VEHICLE_A1
    repository.seedTripItem({
      tripId: "tsk_trip_001",
      vehicleId: VEHICLE_A1,
      status: "completed",
      startedAt: "2026-09-10T08:00:00.000Z",
      completedAt: "2026-09-10T08:35:00.000Z",
      distanceKm: 12.5,
      fareAmount: 420,
      areaSummary: "信義區 → 南港區",
    });

    // Seed complaint case for VEHICLE_A1
    repository.seedCaseItem({
      caseId: "case_001",
      vehicleId: VEHICLE_A1,
      status: "closed",
      category: "service_feedback",
      reportedAt: "2026-09-05T14:00:00.000Z",
      resolvedAt: "2026-09-06T10:00:00.000Z",
      resolutionSummary: "車內冷氣出風調整，案件已結案",
    });
  });

  describe("1. Host 受限讀取模型與資料隔離 (Normal Flows)", () => {
    it("1.1 Host 角色授權與車輛清單查詢：Host A 讀取自有車輛，VIN 脫敏隱私遮罩", async () => {
      const identityA = createHostIdentity(HOST_A);
      const res = await controller.listVehicles(identityA);

      expect(res.data.items.length).toBe(2);
      const plates = res.data.items.map((v) => v.plateNo);
      expect(plates).toContain("TDC-1001");
      expect(plates).toContain("TDC-1002");
      expect(plates).not.toContain("TDC-2001");

      // 檢查 VIN 遮罩格式（例如 "1HGCR******00101"）
      const vehicle1 = res.data.items.find((v) => v.vehicleId === VEHICLE_A1);
      expect(vehicle1!.vinMasked).toContain("******");
      expect(vehicle1!.vinMasked).not.toBe("1HGCR2F83HA100101");
    });

    it("1.2 Host A 讀取自有車輛之收益、維保、脫敏行程與案件，資料齊全且回讀一致", async () => {
      const identityA = createHostIdentity(HOST_A);

      // (a) 收益
      const earningsRes = await controller.getEarnings(
        VEHICLE_A1,
        identityA,
        "2026-09",
      );
      expect(earningsRes.data.vehicleId).toBe(VEHICLE_A1);
      expect(earningsRes.data.period).toBe("2026-09");
      expect(earningsRes.data.grossRevenue).toBe(420);
      expect(earningsRes.data.platformFee).toBe(63); // 420 * 0.15 = 63
      expect(earningsRes.data.tripsCount).toBe(1);

      // (b) 維保
      const maintRes = await controller.listMaintenance(VEHICLE_A1, identityA);
      expect(maintRes.data.items.length).toBe(1);
      expect(maintRes.data.items[0]!.maintenanceId).toBe("maint_001");
      expect(maintRes.data.items[0]!.description).toBe(
        "五萬公里定期保養與更換煞車皮",
      );

      // (c) 行程 (脫敏行程，僅顯示區域名稱，不洩漏乘客個資與起訖詳細地址)
      const tripsRes = await controller.listTrips(VEHICLE_A1, identityA);
      expect(tripsRes.data.items.length).toBe(1);
      expect(tripsRes.data.items[0]!.tripId).toBe("tsk_trip_001");
      expect(tripsRes.data.items[0]!.areaSummary).toBe("信義區 → 南港區");

      // (d) 案件 (脫敏投訴案件)
      const casesRes = await controller.listCases(VEHICLE_A1, identityA);
      expect(casesRes.data.items.length).toBe(1);
      expect(casesRes.data.items[0]!.caseId).toBe("case_001");
      expect(casesRes.data.items[0]!.status).toBe("closed");
    });

    it("1.3 兩位車主（Host A 與 Host B）資料嚴格隔離：雙方皆只能看見名下車輛", async () => {
      const identityA = createHostIdentity(HOST_A);
      const identityB = createHostIdentity(HOST_B);

      const resA = await controller.listVehicles(identityA);
      const resB = await controller.listVehicles(identityB);

      expect(resA.data.items.map((v) => v.vehicleId)).toEqual([
        VEHICLE_A1,
        VEHICLE_A2,
      ]);
      expect(resB.data.items.map((v) => v.vehicleId)).toEqual([VEHICLE_B1]);
    });

    it("1.4 車輛所有權動態變更：移轉後原車主立即 404，新車主立即能成功讀取完整資料", async () => {
      const identityA = createHostIdentity(HOST_A);
      const identityB = createHostIdentity(HOST_B);

      // 移轉前：Host A 可讀 VEHICLE_A1，Host B 存取回傳 404
      await expect(
        controller.getEarnings(VEHICLE_A1, identityA),
      ).resolves.toBeDefined();
      await expect(
        controller.getEarnings(VEHICLE_A1, identityB),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 404,
          code: HOST_ERROR_CODES.VEHICLE_NOT_FOUND,
        }),
      );

      // 執行所有權移轉：VEHICLE_A1 移轉給 HOST_B
      const transferSuccess = repository.transferVehicleOwnership(
        VEHICLE_A1,
        HOST_B,
      );
      expect(transferSuccess).toBe(true);

      // 移轉後驗證 1：原車主 Host A 再次讀取 VEHICLE_A1 立即回傳 404
      await expect(
        controller.getEarnings(VEHICLE_A1, identityA),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 404,
          code: HOST_ERROR_CODES.VEHICLE_NOT_FOUND,
        }),
      );
      await expect(
        controller.listMaintenance(VEHICLE_A1, identityA),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 404,
          code: HOST_ERROR_CODES.VEHICLE_NOT_FOUND,
        }),
      );
      await expect(
        controller.listTrips(VEHICLE_A1, identityA),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 404,
          code: HOST_ERROR_CODES.VEHICLE_NOT_FOUND,
        }),
      );
      await expect(
        controller.listCases(VEHICLE_A1, identityA),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 404,
          code: HOST_ERROR_CODES.VEHICLE_NOT_FOUND,
        }),
      );

      // 移轉後驗證 2：新車主 Host B 立即擁有 VEHICLE_A1，可成功讀取收益、維保、行程、案件
      const newOwnerEarnings = await controller.getEarnings(
        VEHICLE_A1,
        identityB,
      );
      expect(newOwnerEarnings.data.vehicleId).toBe(VEHICLE_A1);

      const newOwnerMaint = await controller.listMaintenance(
        VEHICLE_A1,
        identityB,
      );
      expect(newOwnerMaint.data.items.length).toBe(1);

      const newOwnerTrips = await controller.listTrips(VEHICLE_A1, identityB);
      expect(newOwnerTrips.data.items.length).toBe(1);

      const newOwnerCases = await controller.listCases(VEHICLE_A1, identityB);
      expect(newOwnerCases.data.items.length).toBe(1);

      // 移轉後車輛清單同步變更
      const listA = await controller.listVehicles(identityA);
      expect(listA.data.items.map((v) => v.vehicleId)).toEqual([VEHICLE_A2]);

      const listB = await controller.listVehicles(identityB);
      expect(listB.data.items.map((v) => v.vehicleId)).toContain(VEHICLE_A1);
      expect(listB.data.items.map((v) => v.vehicleId)).toContain(VEHICLE_B1);
    });

    it("1.5 車輛停用／合約終止（activeFlag: false）：停用後即便是名義車主存取亦回傳 404", async () => {
      const identityA = createHostIdentity(HOST_A);

      repository.setVehicleActive(VEHICLE_A1, false);

      await expect(
        controller.getEarnings(VEHICLE_A1, identityA),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 404,
          code: HOST_ERROR_CODES.VEHICLE_NOT_FOUND,
        }),
      );

      const listRes = await controller.listVehicles(identityA);
      expect(listRes.data.items.some((v) => v.vehicleId === VEHICLE_A1)).toBe(
        false,
      );
    });
  });

  describe("2. 關鍵負向案例與安全性防護 (Critical Negative & Security Cases)", () => {
    it("2.1 防枚舉安全不變量：Host B 讀取他人車輛一律嚴格回傳 404（非 403，防探測攻擊）", async () => {
      const identityB = createHostIdentity(HOST_B);

      // (a) 收益
      await expect(
        controller.getEarnings(VEHICLE_A1, identityB),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 404,
          code: HOST_ERROR_CODES.VEHICLE_NOT_FOUND,
        }),
      );

      // (b) 維保
      await expect(
        controller.listMaintenance(VEHICLE_A1, identityB),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 404,
          code: HOST_ERROR_CODES.VEHICLE_NOT_FOUND,
        }),
      );

      // (c) 行程
      await expect(
        controller.listTrips(VEHICLE_A1, identityB),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 404,
          code: HOST_ERROR_CODES.VEHICLE_NOT_FOUND,
        }),
      );

      // (d) 案件
      await expect(
        controller.listCases(VEHICLE_A1, identityB),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 404,
          code: HOST_ERROR_CODES.VEHICLE_NOT_FOUND,
        }),
      );
    });

    it("2.2 嚴格唯讀防護（AC-HOST-NEG-2）：Host 端點禁止任何變更請求（POST / PUT / PATCH / DELETE 拋出 405）", () => {
      expect(() => controller.rejectPost()).toThrowError(
        expect.objectContaining({
          status: 405,
          code: HOST_ERROR_CODES.MUTATION_NOT_SUPPORTED,
        }),
      );

      expect(() => controller.rejectPut()).toThrowError(
        expect.objectContaining({
          status: 405,
          code: HOST_ERROR_CODES.MUTATION_NOT_SUPPORTED,
        }),
      );

      expect(() => controller.rejectPatch()).toThrowError(
        expect.objectContaining({
          status: 405,
          code: HOST_ERROR_CODES.MUTATION_NOT_SUPPORTED,
        }),
      );

      expect(() => controller.rejectDelete()).toThrowError(
        expect.objectContaining({
          status: 405,
          code: HOST_ERROR_CODES.MUTATION_NOT_SUPPORTED,
        }),
      );
    });

    it("2.3 未認證存取（無 identity）：拒絕存取並回傳 401（UNAUTHORIZED）", async () => {
      await expect(controller.listVehicles(null)).rejects.toThrowError(
        expect.objectContaining({
          status: 401,
          code: HOST_ERROR_CODES.UNAUTHORIZED,
        }),
      );
    });

    it("2.4 跨 Realm 存取攔截：司機 realm 嘗試存取 Host 入口回傳 403（FORBIDDEN）", async () => {
      const driverIdentity: BootstrapRequestIdentity = {
        authMode: "bootstrap_headers",
        actorType: "driver_user",
        actorId: "drv_001",
        tenantId: null,
        realm: "driver",
        roleFamilies: ["driver"],
        roles: ["driver_standard"],
        scopes: ["driver:read"],
        requestId: "req_drv_cross_001",
      };

      await expect(
        controller.listVehicles(driverIdentity),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 403,
          code: HOST_ERROR_CODES.FORBIDDEN,
        }),
      );
    });

    it("2.5 缺少必要 scope：partner realm 缺少 owned:read 時被拒絕存取（403 FORBIDDEN）", async () => {
      const identityWithoutScope = createHostIdentity(HOST_A, [
        "unrelated:scope",
      ]);

      await expect(
        controller.listVehicles(identityWithoutScope),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 403,
          code: HOST_ERROR_CODES.FORBIDDEN,
        }),
      );
    });
  });
});
