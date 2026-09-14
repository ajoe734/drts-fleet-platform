import { describe, it, expect, beforeEach } from "vitest";
import {
  DRIVER_LEAVE_ERROR_CODES,
  MAX_PAST_APPLICATION_GRACE_MS,
  DriverLeaveService,
  DriverLeaveRepository,
  DriverLeaveController,
} from "../../../../apps/api/src/modules/driver-leave";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";
import {
  IdempotencyRepository,
  IdempotencyService,
} from "../../../../apps/api/src/common/idempotency";
import type { PassthroughResponseLike } from "../../../../apps/api/src/common/idempotency-http";

describe("SR-QA-NEWFEATURES-001 / C052: 司機請假申請、審核與班表／可派狀態連動端到端驗收", () => {
  let repository: DriverLeaveRepository;
  let service: DriverLeaveService;
  let controller: DriverLeaveController;
  let idempotencyService: IdempotencyService;

  const DRIVER_A = "drv_test_leave_001";
  const DRIVER_B = "drv_test_leave_002";
  const SUPERVISOR_1 = "usr_supervisor_ops_001";

  const mockDriverIdentity: BootstrapRequestIdentity = {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId: DRIVER_A,
    tenantId: null,
    realm: "driver",
    roleFamilies: ["driver"],
    roles: ["driver_standard"],
    scopes: ["driver:write", "driver:read"],
    requestId: "req_leave_drv_001",
  };

  const mockResponse: PassthroughResponseLike = {
    setHeader: () => {},
    status(code: number) {
      void code;
      return this;
    },
  };

  beforeEach(() => {
    repository = new DriverLeaveRepository();
    service = new DriverLeaveService(repository);
    idempotencyService = new IdempotencyService(new IdempotencyRepository());
    controller = new DriverLeaveController(service, idempotencyService);
  });

  describe("1. 司機請假申請生命週期與正式入口 (Normal Flows)", () => {
    it("1.1 司機透過正式入口成功提交病假申請，生成唯一 leaveId 與 pending 狀態", async () => {
      const startTime = new Date(Date.now() + 3600 * 1000).toISOString();
      const endTime = new Date(Date.now() + 7200 * 1000).toISOString();

      const result = await controller.createDriverLeave(
        {
          leaveType: "sick",
          startTime,
          endTime,
          reason: "突發流感需就醫休養",
        },
        mockResponse,
        mockDriverIdentity,
        "idem_key_create_001",
      );

      expect(result.data).toBeDefined();
      expect(result.data.leaveId).toMatch(/^lv_/);
      expect(result.data.driverId).toBe(DRIVER_A);
      expect(result.data.leaveType).toBe("sick");
      expect(result.data.status).toBe("pending");
      expect(result.data.reason).toBe("突發流感需就醫休養");
      expect(result.data.reviewedByPrincipalId).toBeNull();
      expect(result.data.reviewedAt).toBeNull();
    });

    it("1.2 司機與管理端可跨端查詢單筆假單明細與篩選列表，回讀一致", async () => {
      const now = new Date();
      const created = await service.createLeave(
        DRIVER_A,
        {
          leaveType: "annual",
          startTime: new Date(now.getTime() + 86400000).toISOString(),
          endTime: new Date(now.getTime() + 172800000).toISOString(),
          reason: "年度特休返鄉",
        },
        now,
      );

      const fetched = await service.getLeaveById(created.leaveId);
      expect(fetched).toEqual(created);

      const listResult = await service.listLeaves({
        driverId: DRIVER_A,
        status: "pending",
      });
      expect(listResult.items.length).toBeGreaterThanOrEqual(1);
      expect(listResult.items.some((i) => i.leaveId === created.leaveId)).toBe(
        true,
      );
    });

    it("1.3 主管審核核准假單，狀態轉為 approved 並記錄審核者 ID、時間與備註", async () => {
      const now = new Date();
      const leave = await service.createLeave(
        DRIVER_A,
        {
          leaveType: "personal",
          startTime: new Date(now.getTime() + 10000).toISOString(),
          endTime: new Date(now.getTime() + 50000).toISOString(),
          reason: "家中有事請事假",
        },
        now,
      );

      const reviewed = await service.reviewLeave(
        leave.leaveId,
        SUPERVISOR_1,
        {
          decision: "approve",
          reviewNotes: "准予事假",
        },
        now,
      );

      expect(reviewed.status).toBe("approved");
      expect(reviewed.reviewedByPrincipalId).toBe(SUPERVISOR_1);
      expect(reviewed.reviewNotes).toBe("准予事假");
      expect(reviewed.reviewedAt).toBeTruthy();

      const readBack = await service.getLeaveById(leave.leaveId);
      expect(readBack.status).toBe("approved");
    });

    it("1.4 核准請假期間與班表／派單狀態連動：司機標記為休假中，禁止打卡與上線", async () => {
      const now = new Date("2026-10-01T10:00:00.000Z");
      const leave = await service.createLeave(
        DRIVER_A,
        {
          leaveType: "sick",
          startTime: "2026-10-01T08:00:00.000Z",
          endTime: "2026-10-01T18:00:00.000Z",
          reason: "病假休養",
        },
        new Date("2026-10-01T07:50:00.000Z"),
      );

      await service.reviewLeave(
        leave.leaveId,
        SUPERVISOR_1,
        { decision: "approve" },
        new Date("2026-10-01T07:55:00.000Z"),
      );

      // 驗證休假判定
      const onLeave = await service.isDriverOnLeave(DRIVER_A, now);
      expect(onLeave).toBe(true);

      const activeLeave = await service.getActiveLeaveForDriver(DRIVER_A, now);
      expect(activeLeave?.leaveId).toBe(leave.leaveId);

      // 驗證服務可派性與出勤阻擋
      const eligibility = await service.getDriverPresenceEligibility(
        DRIVER_A,
        now,
      );
      expect(eligibility.eligibility).toBe("ineligible");
      expect(eligibility.onLeave).toBe(true);

      await expect(
        service.assertDriverCanClockIn(DRIVER_A, now),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 409,
          code: DRIVER_LEAVE_ERROR_CODES.DRIVER_ON_LEAVE,
        }),
      );

      await expect(
        service.assertDriverCanGoOnline(DRIVER_A, now),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 409,
          code: DRIVER_LEAVE_ERROR_CODES.DRIVER_ON_LEAVE,
        }),
      );
    });

    it("1.5 司機於生效前自行撤回假單，狀態轉為 withdrawn 並立即恢復出勤／上線可派資格", async () => {
      const now = new Date("2026-10-02T10:00:00.000Z");
      const leave = await service.createLeave(
        DRIVER_A,
        {
          leaveType: "personal",
          startTime: "2026-10-02T12:00:00.000Z",
          endTime: "2026-10-02T16:00:00.000Z",
          reason: "家事已提早解決，申請撤回",
        },
        now,
      );

      const withdrawn = await service.withdrawLeave(
        leave.leaveId,
        DRIVER_A,
        { reason: "已無休假需求" },
        now,
      );

      expect(withdrawn.status).toBe("withdrawn");

      // 檢查撤回後休假不再阻擋出勤
      const testTime = new Date("2026-10-02T14:00:00.000Z");
      const onLeave = await service.isDriverOnLeave(DRIVER_A, testTime);
      expect(onLeave).toBe(false);

      const eligibility = await service.getDriverPresenceEligibility(
        DRIVER_A,
        testTime,
      );
      expect(eligibility.eligibility).toBe("eligible");
      expect(eligibility.onLeave).toBe(false);

      await expect(
        service.assertDriverCanClockIn(DRIVER_A, testTime),
      ).resolves.not.toThrow();
    });

    it("1.6 主管審核駁回假單，狀態轉為 rejected 且司機不進入休假抑制", async () => {
      const now = new Date("2026-10-03T09:00:00.000Z");
      const leave = await service.createLeave(
        DRIVER_A,
        {
          leaveType: "annual",
          startTime: "2026-10-03T10:00:00.000Z",
          endTime: "2026-10-03T18:00:00.000Z",
          reason: "高峰時段請假",
        },
        now,
      );

      const rejected = await service.reviewLeave(
        leave.leaveId,
        SUPERVISOR_1,
        {
          decision: "reject",
          reviewNotes: "重大營運高峰時段，暫不開放排休特休",
        },
        now,
      );

      expect(rejected.status).toBe("rejected");
      expect(rejected.reviewNotes).toContain("重大營運高峰時段");

      const onLeave = await service.isDriverOnLeave(
        DRIVER_A,
        "2026-10-03T12:00:00.000Z",
      );
      expect(onLeave).toBe(false);
    });
  });

  describe("2. 關鍵負向案例與契約邊界防護 (Critical Negative Cases)", () => {
    it("2.1 重疊請假區間嚴格阻擋（409 LEAVE_OVERLAPPING_REQUEST）", async () => {
      const baseStart = "2026-11-01T10:00:00.000Z";
      const baseEnd = "2026-11-01T18:00:00.000Z";

      await service.createLeave(
        DRIVER_A,
        {
          leaveType: "annual",
          startTime: baseStart,
          endTime: baseEnd,
          reason: "既有特休假單",
        },
        new Date("2026-10-31T10:00:00.000Z"),
      );

      // (a) 完全重疊
      await expect(
        service.createLeave(
          DRIVER_A,
          {
            leaveType: "sick",
            startTime: baseStart,
            endTime: baseEnd,
            reason: "完全重疊",
          },
          new Date("2026-10-31T10:00:00.000Z"),
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 409,
          code: DRIVER_LEAVE_ERROR_CODES.LEAVE_OVERLAPPING_REQUEST,
        }),
      );

      // (b) 前段重疊
      await expect(
        service.createLeave(
          DRIVER_A,
          {
            leaveType: "personal",
            startTime: "2026-11-01T08:00:00.000Z",
            endTime: "2026-11-01T12:00:00.000Z",
            reason: "前段重疊",
          },
          new Date("2026-10-31T10:00:00.000Z"),
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 409,
          code: DRIVER_LEAVE_ERROR_CODES.LEAVE_OVERLAPPING_REQUEST,
        }),
      );

      // (c) 後段重疊
      await expect(
        service.createLeave(
          DRIVER_A,
          {
            leaveType: "personal",
            startTime: "2026-11-01T16:00:00.000Z",
            endTime: "2026-11-01T20:00:00.000Z",
            reason: "後段重疊",
          },
          new Date("2026-10-31T10:00:00.000Z"),
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 409,
          code: DRIVER_LEAVE_ERROR_CODES.LEAVE_OVERLAPPING_REQUEST,
        }),
      );

      // (d) 另一個司機 DRIVER_B 申請同一時間區間則不應衝突
      const otherDriverLeave = await service.createLeave(
        DRIVER_B,
        {
          leaveType: "annual",
          startTime: baseStart,
          endTime: baseEnd,
          reason: "不同司機不衝突",
        },
        new Date("2026-10-31T10:00:00.000Z"),
      );
      expect(otherDriverLeave.driverId).toBe(DRIVER_B);
    });

    it("2.2 結束時間早於或等於開始時間，拒絕受理（400 LEAVE_INVALID_TIME_RANGE）", async () => {
      const now = new Date();
      await expect(
        service.createLeave(
          DRIVER_A,
          {
            leaveType: "sick",
            startTime: new Date(now.getTime() + 10000).toISOString(),
            endTime: new Date(now.getTime() + 5000).toISOString(),
            reason: "結束早於開始",
          },
          now,
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 400,
          code: DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_TIME_RANGE,
        }),
      );

      await expect(
        service.createLeave(
          DRIVER_A,
          {
            leaveType: "sick",
            startTime: new Date(now.getTime() + 10000).toISOString(),
            endTime: new Date(now.getTime() + 10000).toISOString(),
            reason: "結束等於開始",
          },
          now,
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 400,
          code: DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_TIME_RANGE,
        }),
      );
    });

    it("2.3 開始時間倒退超過 15 分鐘寬限期，拒絕受理（400 LEAVE_INVALID_TIME_RANGE）", async () => {
      const now = new Date("2026-11-05T12:00:00.000Z");
      const pastStartTime = new Date(
        now.getTime() - (MAX_PAST_APPLICATION_GRACE_MS + 5 * 60 * 1000),
      ).toISOString();

      await expect(
        service.createLeave(
          DRIVER_A,
          {
            leaveType: "sick",
            startTime: pastStartTime,
            endTime: "2026-11-05T18:00:00.000Z",
            reason: "補請過久以前的假",
          },
          now,
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 400,
          code: DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_TIME_RANGE,
        }),
      );
    });

    it("2.4 缺少必填欄位或假別無效，拒絕受理（400 LEAVE_MISSING_REQUIRED_FIELDS）", async () => {
      const now = new Date();
      await expect(
        service.createLeave(
          DRIVER_A,
          {
            leaveType: "invalid_type" as any,
            startTime: new Date(now.getTime() + 10000).toISOString(),
            endTime: new Date(now.getTime() + 20000).toISOString(),
            reason: "無效假別",
          },
          now,
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 400,
          code: DRIVER_LEAVE_ERROR_CODES.LEAVE_MISSING_REQUIRED_FIELDS,
        }),
      );

      await expect(
        service.createLeave(
          DRIVER_A,
          {
            leaveType: "annual",
            startTime: new Date(now.getTime() + 10000).toISOString(),
            endTime: new Date(now.getTime() + 20000).toISOString(),
            reason: "   ",
          },
          now,
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 400,
          code: DRIVER_LEAVE_ERROR_CODES.LEAVE_MISSING_REQUIRED_FIELDS,
        }),
      );
    });

    it("2.5 司機嘗試代他人請假，身分不符嚴格攔截（403 LEAVE_FORBIDDEN_ACCESS）", async () => {
      const startTime = new Date(Date.now() + 3600 * 1000).toISOString();
      const endTime = new Date(Date.now() + 7200 * 1000).toISOString();

      await expect(
        controller.createDriverLeave(
          {
            driverId: DRIVER_B,
            leaveType: "annual",
            startTime,
            endTime,
            reason: "嘗試跨司機代申請",
          },
          mockResponse,
          mockDriverIdentity,
          "idem_key_cross_001",
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 403,
          code: DRIVER_LEAVE_ERROR_CODES.LEAVE_FORBIDDEN_ACCESS,
        }),
      );
    });

    it("2.6 已撤回之假單禁止重複撤回或再次審核（409 LEAVE_INVALID_STATE_TRANSITION）", async () => {
      const now = new Date();
      const leave = await service.createLeave(
        DRIVER_A,
        {
          leaveType: "personal",
          startTime: new Date(now.getTime() + 10000).toISOString(),
          endTime: new Date(now.getTime() + 20000).toISOString(),
          reason: "測試終態防護",
        },
        now,
      );

      await service.withdrawLeave(leave.leaveId, DRIVER_A, undefined, now);

      // 重複撤回
      await expect(
        service.withdrawLeave(leave.leaveId, DRIVER_A, undefined, now),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 409,
          code: DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_STATE_TRANSITION,
        }),
      );

      // 審核已撤回的假單
      await expect(
        service.reviewLeave(
          leave.leaveId,
          SUPERVISOR_1,
          { decision: "approve" },
          now,
        ),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 409,
          code: DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_STATE_TRANSITION,
        }),
      );
    });

    it("2.7 查詢不存在之假單回傳 404（LEAVE_NOT_FOUND）", async () => {
      await expect(
        service.getLeaveById("lv_nonexistent_999"),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 404,
          code: DRIVER_LEAVE_ERROR_CODES.LEAVE_NOT_FOUND,
        }),
      );
    });
  });
});
