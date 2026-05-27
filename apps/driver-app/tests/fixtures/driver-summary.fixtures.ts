import type {
  DriverPlatformPresenceSummary,
  DriverWorkspaceSummary,
} from "@drts/contracts";

export const driverWorkspaceSummaryFixture: DriverWorkspaceSummary = {
  driverId: "driver-fixture-001",
  counts: {
    actionRequired: 1,
    awaitingPlatform: 0,
    inProgress: 1,
    blocked: 0,
    completed: 0,
    readOnly: 0,
    total: 2,
  },
  activeTrip: {
    taskId: "task-active-001",
    orderId: "order-active-001",
    orderDomain: "owned",
    sourcePlatform: "drts",
    platformDisplayName: "DRTS",
    localStatus: "on_trip",
    updatedAt: "2026-05-27T11:59:55.000Z",
  },
  outstandingInstructionCount: 0,
  refresh: {
    generatedAt: "2026-05-27T12:00:00.000Z",
    staleAfterMs: 15000,
    dataFreshness: "fresh",
    source: "live",
  },
};

export const driverPlatformPresenceSummaryFixture: DriverPlatformPresenceSummary =
  {
    driverId: "driver-fixture-001",
    bindings: [
      {
        platformCode: "grab_taiwan",
        platformDisplayName: "Grab Taiwan",
        bindingState: "bound_online",
        presence: {
          driverId: "driver-fixture-001",
          platformCode: "grab_taiwan",
          accountId: null,
          status: "online",
          eligibility: "eligible",
          tokenExpiresAt: "2026-06-01T00:00:00.000Z",
          reauthRequired: false,
          lastOnlineAt: "2026-05-27T11:58:00.000Z",
          lastOfflineAt: null,
          updatedAt: "2026-05-27T11:58:00.000Z",
        },
        adapterStatus: {
          platformCode: "grab_taiwan",
          status: "healthy",
          blockingReason: null,
          lastSyncAt: "2026-05-27T11:58:00.000Z",
        },
        outstandingInstructionCount: 0,
        eligibility: "eligible",
        updatedAt: "2026-05-27T11:58:00.000Z",
      },
    ],
    notes: [
      "平台狀態會優先使用資料庫同步；若目前環境未啟用資料庫，會改用目前執行個體的暫存資料。",
      "可使用 POST /api/platform-presence/online 或 /api/platform-presence/offline 更新單一平台的綁定、上下線與重新驗證狀態。",
    ],
    health: {
      status: "healthy",
      degradedServices: [],
      lastCheckedAt: "2026-05-27T11:58:00.000Z",
    },
    refresh: {
      generatedAt: "2026-05-27T11:58:00.000Z",
      staleAfterMs: 30000,
      dataFreshness: "stale",
      source: "live",
    },
  };
