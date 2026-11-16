// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DriverRegistryRecord,
  DriverSosAlertLatencySummary,
  DriverSosEventRecord,
  IdentityContext,
  IncidentRecord,
  IncidentTimelineEntry,
  VehicleRegistryRecord,
} from "@drts/contracts";
import { LanguageProvider, useTranslation } from "../../lib/i18n";
import { OpsShell } from "../../components/ops-shell";
import SosQueuePage from "../../app/sos/page";
import SosDetailPage from "../../app/sos/[incidentId]/page";
import SosBoardPage from "../../app/sos/board/page";
import SosTripsPage from "../../app/sos/trips/page";
import SosRecordsPage from "../../app/sos/records/page";

const state = vi.hoisted(() => ({
  pathname: "/sos",
  incidentId: "inc-sos-001",
  client: null as any,
  sseCount: 0,
  refreshCalls: 0,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useParams: () => ({ incidentId: state.incidentId }),
  useRouter: () => ({
    push: vi.fn(),
    refresh: () => {
      state.refreshCalls += 1;
    },
  }),
}));

vi.mock("../../components/ops-health-footer", () => ({
  OpsHealthFooter: () => <div data-testid="ops-health-footer" />,
}));

vi.mock("../../lib/api-client", () => ({
  getOpsClient: () => state.client,
  DEFAULT_OPS_ACTOR_ID: "ops-mounted",
  createOpsDispatchEventSource: () => {
    state.sseCount += 1;
    return {
      addEventListener() {},
      close() {},
    };
  },
}));

vi.mock("@/lib/api-client", () => ({
  getOpsClient: () => state.client,
  DEFAULT_OPS_ACTOR_ID: "ops-mounted",
  createOpsDispatchEventSource: () => {
    state.sseCount += 1;
    return {
      addEventListener() {},
      close() {},
    };
  },
}));

vi.mock("@/lib/i18n", async () => {
  return await import("../../lib/i18n");
});

function LocaleHarness({
  defaultLocale = "en",
  children,
}: {
  defaultLocale?: "en" | "zh";
  children: React.ReactNode;
}) {
  return (
    <LanguageProvider defaultLocale={defaultLocale}>
      <LocaleSwitcher />
      {children}
    </LanguageProvider>
  );
}

function LocaleSwitcher() {
  const { locale, setLocale } = useTranslation();
  return (
    <div>
      <span data-testid="active-locale">{locale}</span>
      <button
        type="button"
        onClick={() => setLocale("en")}
        data-testid="switch-locale-en"
      >
        switch-en
      </button>
      <button
        type="button"
        onClick={() => setLocale("zh")}
        data-testid="switch-locale-zh"
      >
        switch-zh
      </button>
    </div>
  );
}

function createFixture() {
  let incident: IncidentRecord = {
    incidentId: "inc-sos-001",
    title: "Traffic accident SOS-20260720-0012",
    description: "Driver SOS SOS-20260720-0012 submitted from the driver app.",
    category: "traffic",
    severity: "critical",
    status: "open",
    relatedOrderId: "ZX-240720-0186",
    relatedVehicleId: "veh-1",
    relatedDriverId: "drv-1",
    relatedComplaintCaseNo: "CMP-2026-009",
    reportedBy: "drv-1",
    assignedTo: null,
    escalationTarget: null,
    sourceDispatchExceptionOrderId: null,
    occurredAt: "2026-07-20T10:00:00.000Z",
    location: "信義區松仁路 100 號附近",
    resolutionNote: null,
    serviceRecoveryActions: [
      {
        actionId: "sra-1",
        incidentId: "inc-sos-001",
        actionType: "replacement_dispatch",
        note: "Replacement arranged",
        actor: "ops-mounted",
        createdAt: "2026-07-20T10:02:00.000Z",
      },
    ],
    createdAt: "2026-07-20T10:00:02.000Z",
    updatedAt: "2026-07-20T10:00:02.000Z",
  };

  let sosEvent: DriverSosEventRecord = {
    sosEventId: "sos_001",
    clientEventId: "ab999999-9999-4999-8999-999999999999",
    eventNo: "SOS-20260720-0012",
    incidentId: "inc-sos-001",
    driverId: "drv-1",
    vehicleId: "veh-1",
    plateNo: "BKR-2208",
    orderId: "ZX-240720-0186",
    taskId: "job-701",
    status: "submitted",
    eventType: "traffic_accident",
    severity: "major",
    description: null,
    location: {
      lat: 25.033,
      lng: 121.5654,
      accuracyM: 8,
      recordedAt: "2026-07-20T10:00:00.000Z",
      reverseGeocodedAddress: "信義區松仁路 100 號附近",
      geocodeProvider: null,
    },
    originalTriggeredAt: "2026-07-20T10:00:00.000Z",
    serverReceivedAt: "2026-07-20T10:00:01.000Z",
    fleetReportConfirmedAt: "2026-07-20T10:00:01.000Z",
    offlineAtTrigger: false,
    falseAlarm: {
      dismissed: false,
      dismissedAt: null,
      dismissedByDriverId: null,
      note: null,
    },
    dutyAcknowledgement: {
      acknowledgedAt: null,
      acknowledgedByActorId: null,
    },
    createdAt: "2026-07-20T10:00:01.000Z",
    updatedAt: "2026-07-20T10:00:01.000Z",
  };

  const timeline: IncidentTimelineEntry[] = [
    {
      entryId: "tl-1",
      incidentId: "inc-sos-001",
      action: "incident_created",
      actor: "drv-1",
      note: "Driver SOS note preserved",
      createdAt: "2026-07-20T10:00:02.000Z",
    },
    {
      entryId: "tl-2",
      incidentId: "inc-sos-001",
      action: "provider_raw_webhook_code",
      actor: "system.webhook",
      note: "Raw upstream provider text",
      createdAt: "2026-07-20T10:00:05.000Z",
    },
  ];

  const drivers: DriverRegistryRecord[] = [
    {
      driverId: "drv-1",
      name: "吳明翰",
      supportedServiceBuckets: ["standard_taxi"],
      workState: "available",
      licensesValid: true,
      lifecycleStatus: "active",
      eligibilityBlockedReasons: [],
      dispatchEligible: true,
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
      activatedAt: "2026-07-20T00:00:00.000Z",
      suspendedAt: null,
      retiredAt: null,
      profileUpdatedAt: null,
      deviceBindings: [],
    },
  ];

  const vehicles: VehicleRegistryRecord[] = [
    {
      vehicleId: "veh-1",
      plateNo: "BKR-2208",
      createdAt: "2026-07-01T00:00:00.000Z",
      operatingArea: "Taipei",
      supportedServiceBuckets: ["standard_taxi"],
      dispatchableFlag: true,
      exclusivityApproved: true,
      insuranceStatus: "valid",
      updatedAt: "2026-07-20T00:00:00.000Z",
      supplyLifecycle: {
        contract: {
          contractId: null,
          lifecycleStatus: "active",
          startAt: null,
          endAt: null,
          updatedAt: null,
        },
        insurance: {
          policyId: null,
          lifecycleStatus: "active",
          startAt: null,
          endAt: null,
          updatedAt: null,
        },
        exclusivity: {
          lifecycleStatus: "active",
          declarationStatus: "submitted",
          declarationFileId: null,
          reviewStatus: "approved",
          providerName: null,
          effectiveStart: null,
          effectiveEnd: null,
          reviewedAt: null,
          updatedAt: null,
        },
        dispatch: {
          eligible: true,
          blockedReasons: [],
          evaluatedAt: "2026-07-20T00:00:00.000Z",
        },
        offboarding: {
          status: "none",
          reason: null,
          requestedAt: null,
          effectiveAt: null,
          completedAt: null,
          requestedBy: null,
          debrandingRequired: false,
          debrandingStatus: "not_required",
          debrandingDueAt: null,
          debrandingCompletedAt: null,
          debrandingTicketId: null,
          notes: null,
        },
        lastTrace: null,
      },
    },
  ];

  const identity: IdentityContext = {
    actorId: "ops-mounted",
    realm: "ops",
    actorType: "ops_user",
    tenantId: null,
    roleFamilies: ["ops"],
    roles: ["ops_dispatcher"],
    scopes: ["incident:read", "incident:write"],
    authMode: "bootstrap_headers",
    supportedExecutionModes: [],
  };

  const latencySummary: DriverSosAlertLatencySummary = {
    from: null,
    to: null,
    targetLatencyMs: 5000,
    sampleCount: 4,
    withinTargetCount: 4,
    withinTargetRate: 1,
    p50LatencyMs: 820,
    p95LatencyMs: 1450,
    maxLatencyMs: 1600,
  };

  let holdAckPromise: Promise<void> | null = null;
  let resolveAckHold: (() => void) | null = null;

  const holdNextAck = () => {
    holdAckPromise = new Promise<void>((resolve) => {
      resolveAckHold = resolve;
    });
  };

  const releaseAck = () => {
    resolveAckHold?.();
  };

  const get = vi.fn(async (path: string) => {
    if (path === "/api/incidents") {
      return { items: [incident] };
    }
    if (path === `/api/incidents/${incident.incidentId}`) {
      return incident;
    }
    if (path === `/api/incidents/${incident.incidentId}/timeline`) {
      return { items: timeline };
    }
    if (
      path ===
      `/api/ops/driver-sos/by-incident/${encodeURIComponent(incident.incidentId)}`
    ) {
      return { event: sosEvent };
    }
    if (path === "/api/regulatory-registry/drivers") {
      return { items: drivers };
    }
    if (path === "/api/regulatory-registry/vehicles") {
      return { items: vehicles };
    }
    if (path === "/api/identity/context") {
      return identity;
    }
    if (path === "/api/ops/driver-sos/metrics/alert-latency") {
      return latencySummary;
    }
    if (path === "/api/dispatch/tasks") {
      return {
        items: [
          {
            dispatchJobId: "job-701",
            orderId: "ZX-240720-0186",
            status: "dispatched",
            latestEtaMinutes: 6,
            createdAt: "2026-07-20T10:00:00.000Z",
          },
        ],
      };
    }
    if (path === "/api/driver/tasks") {
      return {
        items: [
          {
            dispatchJobId: "job-701",
            driverId: "drv-1",
            vehicleId: "BKR-2208",
          },
        ],
      };
    }
    if (path === "/api/orders") {
      return {
        items: [
          {
            orderId: "ZX-240720-0186",
            status: "in_service",
            pickup: { address: "松仁路 100 號" },
            dropoff: { address: "臺北車站東三門" },
            createdAt: "2026-07-20T10:00:00.000Z",
          },
        ],
      };
    }
    if (path === "/api/audit") {
      return {
        items: [
          {
            auditId: "aud-501",
            actorId: null,
            actionName: "incident.acknowledged",
            resourceId: "inc-sos-001",
            createdAt: "2026-07-20T10:01:00.000Z",
          },
          {
            auditId: "aud-502",
            actorId: "ops-mounted",
            actionName: "incident.investigating",
            resourceId: "inc-sos-001",
            createdAt: "2026-07-20T10:02:00.000Z",
          },
        ],
      };
    }
    return { items: [] };
  });

  const post = vi.fn(async (path: string, options?: { body?: unknown }) => {
    if (path === `/api/ops/driver-sos/${sosEvent.sosEventId}/duty-ack`) {
      if (holdAckPromise) {
        await holdAckPromise;
      }
      const acknowledgedAt = "2026-07-20T10:01:00.000Z";
      sosEvent = {
        ...sosEvent,
        dutyAcknowledgement: {
          acknowledgedAt,
          acknowledgedByActorId: identity.actorId,
        },
      };
      incident = {
        ...incident,
        assignedTo: identity.actorId,
        updatedAt: acknowledgedAt,
      };
      return {
        dutyAcknowledgement: sosEvent.dutyAcknowledgement,
        wonAcknowledgement: true,
      };
    }
    if (path === "/api/ops/driver-sos/alerts/rendered") {
      return { updatedCount: 1, recordedAt: "2026-07-20T10:00:03.000Z" };
    }
    throw new Error(`Unexpected POST ${path}: ${JSON.stringify(options)}`);
  });

  const patch = vi.fn(
    async (path: string, options?: { body?: { status?: string } }) => {
      if (path === `/api/incidents/${incident.incidentId}`) {
        const nextStatus = options?.body?.status as IncidentRecord["status"];
        incident = {
          ...incident,
          status: nextStatus,
          updatedAt: "2026-07-20T10:03:00.000Z",
        };
        if (nextStatus === "investigating" || nextStatus === "closed") {
          sosEvent = {
            ...sosEvent,
            status: nextStatus,
          };
        }
        return incident;
      }
      throw new Error(`Unexpected PATCH ${path}`);
    },
  );

  state.client = { get, post, patch };

  return {
    get,
    post,
    patch,
    holdNextAck,
    releaseAck,
    getIncident: () => incident,
    getSosEvent: () => sosEvent,
  };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("drts-sos-sound-off", "true");
  state.pathname = "/sos";
  state.incidentId = "inc-sos-001";
  state.sseCount = 0;
  state.refreshCalls = 0;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Ops SOS complete bilingual journey across all 5 routes and subnavigation", () => {
  it("localizes OpsShell SOS subnavigation in English and Traditional Chinese without re-creating SSE or refetching on locale switch", async () => {
    const fx = createFixture();
    render(
      <LocaleHarness defaultLocale="en">
        <OpsShell nav={[]} brandLabel="DRTS Fleet" brandSubLabel="Ops Console">
          <div>sos-child</div>
        </OpsShell>
      </LocaleHarness>,
    );

    await screen.findByText("DRTS Fleet · Duty");
    expect(screen.getByText("Dispatch board")).toBeTruthy();
    expect(screen.getAllByText("SOS emergencies").length).toBeGreaterThan(0);
    expect(screen.getByText("Trips")).toBeTruthy();
    expect(screen.getByText("Operations records")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(state.sseCount).toBe(1);
    const initialGetCalls = fx.get.mock.calls.length;

    fireEvent.click(screen.getByTestId("switch-locale-zh"));

    await screen.findByText("DRTS 車隊 · 值班");
    expect(screen.getByText("派車看板 · Board")).toBeTruthy();
    expect(screen.getAllByText("SOS 緊急事件").length).toBeGreaterThan(0);
    expect(screen.getByText("行程 · Trips")).toBeTruthy();
    expect(screen.getByText("營運紀錄 · Records")).toBeTruthy();
    expect(state.sseCount).toBe(1);
    expect(fx.get.mock.calls.length).toBe(initialGetCalls);
  });

  it("localizes SosQueuePage controls, statuses, sound banner, and translates in-flight and visible notices across locale switches without duplicate actions", async () => {
    const fx = createFixture();
    fx.holdNextAck();

    render(
      <LocaleHarness defaultLocale="en">
        <SosQueuePage />
      </LocaleHarness>,
    );

    await screen.findByText("SOS queue");
    expect(screen.getByText("SOS Emergencies")).toBeTruthy();
    expect(screen.getByText("1 pending")).toBeTruthy();
    expect(
      screen.getByText(
        "Online reports reach the duty console within p95 ≤ 5 seconds · Critical events remain visible · The first acknowledgement determines the duty owner",
      ),
    ).toBeTruthy();
    expect(screen.getByText("SOS alert sound is off")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Enable alert sound" }),
    ).toBeTruthy();
    expect(screen.getByText("Event number")).toBeTruthy();
    expect(screen.getByText("Waiting")).toBeTruthy();
    expect(screen.getByText("Event type")).toBeTruthy();
    expect(screen.getByText("Acknowledged by")).toBeTruthy();
    expect(screen.getByText("Awaiting acknowledgement")).toBeTruthy();
    expect(screen.getByText("Traffic accident")).toBeTruthy();
    expect(screen.getAllByText("Critical").length).toBeGreaterThan(0);
    expect(screen.getAllByText("吳明翰").length).toBeGreaterThan(0);
    expect(screen.getAllByText("BKR-2208").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ZX-240720-0186").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("信義區松仁路 100 號附近").length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));

    await waitFor(() =>
      expect(
        fx.post.mock.calls.filter(([path]) => path.endsWith("/duty-ack")),
      ).toHaveLength(1),
    );
    expect(
      fx.post.mock.calls.find(([path]) => path.endsWith("/duty-ack")),
    ).toEqual(["/api/ops/driver-sos/sos_001/duty-ack", { body: {} }]);

    // Switch locale while the acknowledgement request is still pending
    fireEvent.click(screen.getByTestId("switch-locale-zh"));
    expect(
      fx.post.mock.calls.filter(([path]) => path.endsWith("/duty-ack")),
    ).toHaveLength(1);
    expect(state.sseCount).toBe(1);

    fx.releaseAck();

    await screen.findByText("已確認接手");
    expect(
      screen.getByText("ops-mounted 已取得此 SOS 事件的處理權。"),
    ).toBeTruthy();
    expect(screen.getByText("已確認")).toBeTruthy();

    // Switch back to English while the notice is visible; it translates in place without re-posting
    fireEvent.click(screen.getByTestId("switch-locale-en"));

    await screen.findByText("Duty acknowledged");
    expect(
      screen.getByText(
        "ops-mounted has acknowledged duty for this SOS incident.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Acknowledged")).toBeTruthy();
    expect(
      fx.post.mock.calls.filter(([path]) => path.endsWith("/duty-ack")),
    ).toHaveLength(1);
    expect(state.sseCount).toBe(1);
  });

  it("completes the normal SosDetailPage acknowledge -> investigate -> close journey across English and Traditional Chinese while preserving UUIDs and raw data", async () => {
    const fx = createFixture();

    render(
      <LocaleHarness defaultLocale="en">
        <SosDetailPage />
      </LocaleHarness>,
    );

    await screen.findAllByText("SOS-20260720-0012");
    expect(
      screen.getAllByText("Awaiting acknowledgement").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Live SSE updates retain the incident, duty ownership and status changes on the same record.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Report received")).toBeTruthy();
    expect(screen.getByText("Driver SOS note preserved")).toBeTruthy();
    expect(screen.getByText("provider_raw_webhook_code")).toBeTruthy();
    expect(screen.getByText("Raw upstream provider text")).toBeTruthy();
    expect(screen.getByText("Event number")).toBeTruthy();
    expect(screen.getByText("Elapsed")).toBeTruthy();
    expect(screen.getByText("Reported by")).toBeTruthy();
    expect(screen.getByText("Reported at")).toBeTruthy();
    expect(screen.getByText("Incident ID")).toBeTruthy();
    expect(screen.getByText("Incident case")).toBeTruthy();
    expect(screen.getByText("Complaint case")).toBeTruthy();
    expect(screen.getByText("Service recovery")).toBeTruthy();
    expect(screen.getByText("1 action(s)")).toBeTruthy();
    expect(screen.getAllByText("inc-sos-001").length).toBeGreaterThan(0);

    // 1. Acknowledge in English
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    await screen.findByText("Duty acknowledged");
    expect(
      screen.getByText(
        "ops-mounted has acknowledged duty for this SOS incident.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Acknowledged by ops-mounted")).toBeTruthy();
    expect(fx.post).toHaveBeenCalledWith(
      "/api/ops/driver-sos/sos_001/duty-ack",
      { body: {} },
    );

    // 2. Start investigation in English
    fireEvent.click(
      screen.getByRole("button", { name: "Start investigation" }),
    );
    await screen.findByText("Investigation started");
    expect(
      screen.getByText("The incident status is now investigating."),
    ).toBeTruthy();
    expect(screen.getAllByText("Investigating").length).toBeGreaterThan(0);
    expect(fx.patch).toHaveBeenCalledWith("/api/incidents/inc-sos-001", {
      body: { status: "investigating" },
    });

    // Switch to Traditional Chinese mid-journey; notice and controls update without extra PATCH/POST
    fireEvent.click(screen.getByTestId("switch-locale-zh"));
    await screen.findByText("已開始調查");
    expect(screen.getByText("事件狀態已切換為調查中。")).toBeTruthy();
    expect(screen.getAllByText("調查中").length).toBeGreaterThan(0);
    expect(screen.getByText("1 筆")).toBeTruthy();
    expect(fx.patch).toHaveBeenCalledTimes(1);

    // 3. Close case in Traditional Chinese
    fireEvent.click(screen.getByRole("button", { name: "結案" }));
    await screen.findByText("SOS 事件已完成 closeout。");
    expect(fx.patch).toHaveBeenCalledWith("/api/incidents/inc-sos-001", {
      body: { status: "closed" },
    });

    // Switch back to English and verify closed notice and status translate in place
    fireEvent.click(screen.getByTestId("switch-locale-en"));
    await screen.findByText("The SOS incident has been closed.");
    expect(screen.getAllByText("Closed").length).toBeGreaterThan(0);
    expect(fx.patch).toHaveBeenCalledTimes(2);
    expect(state.sseCount).toBe(1);
  });

  it("localizes SosBoardPage, SosTripsPage, and SosRecordsPage in English and Traditional Chinese while preserving raw API fields", async () => {
    createFixture();

    const boardView = render(
      <LocaleHarness defaultLocale="en">
        <SosBoardPage />
      </LocaleHarness>,
    );
    await screen.findByText("Live dispatch status");
    expect(screen.getByText("DRTS Fleet · Live dispatch board")).toBeTruthy();
    expect(screen.getByText("Task ID")).toBeTruthy();
    expect(screen.getByText("Trip ID")).toBeTruthy();
    expect(screen.getByText("Estimated arrival")).toBeTruthy();
    expect(screen.getByText("job-701")).toBeTruthy();
    expect(screen.getByText("dispatched")).toBeTruthy();
    fireEvent.click(screen.getByTestId("switch-locale-zh"));
    await screen.findByText("即時派遣狀態");
    expect(screen.getByText("DRTS 車隊 · 即時派車調度看板")).toBeTruthy();
    expect(screen.getByText("任務編號")).toBeTruthy();
    expect(screen.getByText("預估到達")).toBeTruthy();
    boardView.unmount();
    localStorage.clear();

    const tripsView = render(
      <LocaleHarness defaultLocale="en">
        <SosTripsPage />
      </LocaleHarness>,
    );
    await screen.findByText("Multi-taxi trips");
    expect(
      screen.getByText("DRTS Fleet · Reserved multi-taxi trip history"),
    ).toBeTruthy();
    expect(screen.getByText("Original order")).toBeTruthy();
    expect(screen.getByText("Pickup")).toBeTruthy();
    expect(screen.getByText("Drop-off")).toBeTruthy();
    expect(screen.getByText("Triggered at")).toBeTruthy();
    expect(screen.getByText("TRP-ZX-240720-0186")).toBeTruthy();
    expect(screen.getByText("松仁路 100 號")).toBeTruthy();
    fireEvent.click(screen.getByTestId("switch-locale-zh"));
    await screen.findByText("多元計程車行程清單");
    expect(
      screen.getByText("DRTS 車隊 · 預約制多元計程車歷史行程"),
    ).toBeTruthy();
    expect(screen.getByText("原始訂單")).toBeTruthy();
    expect(screen.getByText("起點")).toBeTruthy();
    expect(screen.getByText("終點")).toBeTruthy();
    tripsView.unmount();
    localStorage.clear();

    const recordsView = render(
      <LocaleHarness defaultLocale="en">
        <SosRecordsPage />
      </LocaleHarness>,
    );
    await screen.findByText("Duty operation log");
    expect(
      screen.getByText("Duty personnel and system operation audit records"),
    ).toBeTruthy();
    expect(screen.getByText("Audit ID")).toBeTruthy();
    expect(screen.getByText("Duty operator")).toBeTruthy();
    expect(screen.getByText("Action")).toBeTruthy();
    expect(screen.getByText("Target event")).toBeTruthy();
    expect(screen.getByText("System")).toBeTruthy();
    expect(screen.getByText("incident.acknowledged")).toBeTruthy();
    fireEvent.click(screen.getByTestId("switch-locale-zh"));
    await screen.findByText("值班室操作日誌");
    expect(screen.getByText("值班安全人員與系統操作稽核紀錄")).toBeTruthy();
    expect(screen.getByText("日誌編號")).toBeTruthy();
    expect(screen.getByText("操作值班員")).toBeTruthy();
    expect(screen.getByText("系統")).toBeTruthy();
    recordsView.unmount();
  });

  it("preserves active critical SOS alert audio cadence across mid-interval locale switches without extra beep or interval reset", async () => {
    localStorage.removeItem("drts-sos-sound-off");
    createFixture();
    vi.useFakeTimers();

    let beepCount = 0;
    const originalAudioContext = window.AudioContext;
    class FakeAudioContext {
      state = "running";
      currentTime = 0;
      destination = {};
      resume = vi.fn(async () => undefined);
      close = vi.fn(async () => undefined);
      createGain = vi.fn(() => ({
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn() },
      }));
      createOscillator = vi.fn(() => {
        const osc: {
          type: string;
          frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
          connect: ReturnType<typeof vi.fn>;
          onended: (() => void) | null;
          start: ReturnType<typeof vi.fn>;
          stop: ReturnType<typeof vi.fn>;
        } = {
          type: "sine",
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          onended: null,
          start: vi.fn(() => {
            beepCount += 1;
          }),
          stop: vi.fn(() => {
            osc.onended?.();
          }),
        };
        return osc;
      });
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: FakeAudioContext,
    });

    try {
      const view = render(
        <LocaleHarness defaultLocale="en">
          <SosQueuePage />
        </LocaleHarness>,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(screen.getAllByText("Alert sound on").length).toBeGreaterThan(0);
      expect(beepCount).toBe(1);

      // Advance 2500ms into the 4000ms alert cadence
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      expect(beepCount).toBe(1);

      // Switch locale mid-interval: must not emit an extra immediate beep or reset the 4000ms timer
      await act(async () => {
        fireEvent.click(screen.getByTestId("switch-locale-zh"));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getAllByText("提示音已啟用").length).toBeGreaterThan(0);
      expect(beepCount).toBe(1);

      // Remaining 1500ms of the original 4000ms interval triggers the scheduled second beep
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(beepCount).toBe(2);

      // Toggling sound off stops the cadence; re-enabling sound emits one beep
      await act(async () => {
        fireEvent.click(screen.getAllByText("提示音已啟用")[0]!);
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getAllByText("提示音未啟用").length).toBeGreaterThan(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      expect(beepCount).toBe(2);

      await act(async () => {
        fireEvent.click(screen.getAllByText("提示音未啟用")[0]!);
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getAllByText("提示音已啟用").length).toBeGreaterThan(0);
      expect(beepCount).toBe(4); // toggleSound immediate beep + effect start beep

      // Acknowledging canonical event clears critical alert state and stops cadence
      await act(async () => {
        fireEvent.click(
          screen.getAllByRole("button", { name: "確認接手" })[0]!,
        );
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      expect(beepCount).toBe(4);

      view.unmount();
    } finally {
      vi.useRealTimers();
      Object.defineProperty(window, "AudioContext", {
        configurable: true,
        writable: true,
        value: originalAudioContext,
      });
    }
  });

  it("operates the /sos Filter panel with Apply, form submit, Reset, filtered/total counts, filtered-empty state, and bilingual state preservation without extra API or SSE calls", async () => {
    const fx = createFixture();
    const incidents: IncidentRecord[] = [
      {
        ...fx.getIncident(),
        incidentId: "inc-sos-001",
        title: "Traffic accident SOS-20260720-0012",
        description:
          "Driver SOS SOS-20260720-0012 submitted from the driver app.",
        category: "traffic",
        severity: "high",
        status: "open",
        assignedTo: "ops-duty-1",
        relatedOrderId: "ZX-240720-0186",
        relatedVehicleId: "veh-1",
        relatedDriverId: "drv-1",
        location: "信義區松仁路 100 號附近",
        occurredAt: "2026-07-20T10:00:00.000Z",
      },
      {
        ...fx.getIncident(),
        incidentId: "inc-sos-002",
        title: "Driver injury SOS-20260720-0015",
        description:
          "Driver SOS SOS-20260720-0015 submitted from the driver app.",
        category: "driver_injury",
        severity: "medium",
        status: "investigating",
        assignedTo: "ops-duty-2",
        relatedOrderId: "ZX-240720-0299",
        relatedVehicleId: "veh-2",
        relatedDriverId: "drv-2",
        location: "大安區忠孝東路四段 45 號",
        occurredAt: "2026-07-20T09:55:00.000Z",
      },
      {
        ...fx.getIncident(),
        incidentId: "inc-sos-003",
        title: "Vehicle damage SOS-20260720-0019",
        description:
          "Driver SOS SOS-20260720-0019 submitted from the driver app.",
        category: "vehicle_damage",
        severity: "low",
        status: "resolved",
        assignedTo: "ops-duty-3",
        resolutionNote: "Driver confirmed false alarm",
        relatedOrderId: "ZX-240720-0310",
        relatedVehicleId: "veh-3",
        relatedDriverId: "drv-3",
        location: "中山區南京東路三段 12 號",
        occurredAt: "2026-07-20T09:50:00.000Z",
      },
    ];
    const eventsByIncidentId: Record<string, DriverSosEventRecord> = {
      "inc-sos-001": {
        ...fx.getSosEvent(),
        sosEventId: "sos_001",
        eventNo: "SOS-20260720-0012",
        incidentId: "inc-sos-001",
        status: "submitted",
        dutyAcknowledgement: {
          acknowledgedAt: "2026-07-20T10:00:10.000Z",
          acknowledgedByActorId: "ops-duty-1",
        },
      },
      "inc-sos-002": {
        ...fx.getSosEvent(),
        sosEventId: "sos_002",
        eventNo: "SOS-20260720-0015",
        incidentId: "inc-sos-002",
        driverId: "drv-2",
        vehicleId: "veh-2",
        plateNo: "TPE-9981",
        orderId: "ZX-240720-0299",
        status: "investigating",
        dutyAcknowledgement: {
          acknowledgedAt: "2026-07-20T09:56:00.000Z",
          acknowledgedByActorId: "ops-duty-2",
        },
      },
      "inc-sos-003": {
        ...fx.getSosEvent(),
        sosEventId: "sos_003",
        eventNo: "SOS-20260720-0019",
        incidentId: "inc-sos-003",
        driverId: "drv-3",
        vehicleId: "veh-3",
        plateNo: "KLM-5512",
        orderId: "ZX-240720-0310",
        status: "resolved",
        dutyAcknowledgement: {
          acknowledgedAt: "2026-07-20T09:51:00.000Z",
          acknowledgedByActorId: "ops-duty-3",
        },
      },
    };

    const baseDriver = {
      supportedServiceBuckets: ["standard_taxi" as const],
      workState: "available" as const,
      licensesValid: true,
      lifecycleStatus: "active" as const,
      eligibilityBlockedReasons: [],
      dispatchEligible: true,
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
      activatedAt: "2026-07-20T00:00:00.000Z",
      suspendedAt: null,
      retiredAt: null,
      profileUpdatedAt: null,
      deviceBindings: [],
    };

    fx.get.mockImplementation(async (path: string): Promise<any> => {
      if (path === "/api/incidents") {
        return { items: incidents };
      }
      if (path.startsWith("/api/ops/driver-sos/by-incident/")) {
        const id = decodeURIComponent(
          path.replace("/api/ops/driver-sos/by-incident/", ""),
        );
        return { event: eventsByIncidentId[id] ?? fx.getSosEvent() };
      }
      if (path === "/api/regulatory-registry/drivers") {
        return {
          items: [
            { ...baseDriver, driverId: "drv-1", name: "吳明翰" },
            { ...baseDriver, driverId: "drv-2", name: "林佳穎" },
            { ...baseDriver, driverId: "drv-3", name: "陳建宏" },
          ],
        };
      }
      if (path === "/api/regulatory-registry/vehicles") {
        return {
          items: [
            { vehicleId: "veh-1", plateNo: "BKR-2208" },
            { vehicleId: "veh-2", plateNo: "TPE-9981" },
            { vehicleId: "veh-3", plateNo: "KLM-5512" },
          ],
        };
      }
      return { items: [] };
    });

    render(
      <LocaleHarness defaultLocale="en">
        <SosQueuePage />
      </LocaleHarness>,
    );

    await screen.findByText("SOS queue");
    expect(screen.getByText("0 pending")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "SOS-20260720-0012" })
        .getAttribute("href"),
    ).toBe("/sos/inc-sos-001");
    expect(
      screen
        .getByRole("link", { name: "SOS-20260720-0015" })
        .getAttribute("href"),
    ).toBe("/sos/inc-sos-002");
    expect(
      screen
        .getByRole("link", { name: "SOS-20260720-0019" })
        .getAttribute("href"),
    ).toBe("/sos/inc-sos-003");

    const initialGetCalls = fx.get.mock.calls.length;

    // Open the Filter panel
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));

    const statusSelect = screen.getByLabelText("Status") as HTMLSelectElement;
    const severitySelect = screen.getByLabelText(
      "Severity",
    ) as HTMLSelectElement;
    const keywordInput = screen.getByLabelText("Keyword") as HTMLInputElement;
    expect(statusSelect.value).toBe("all");
    expect(severitySelect.value).toBe("all");
    expect(keywordInput.value).toBe("");
    expect(screen.getByText("Showing 3 / 3")).toBeTruthy();

    // Draft change alone does not filter rows; closing and reopening panel preserves draft
    fireEvent.change(statusSelect, { target: { value: "investigating" } });
    expect(screen.getByText("Showing 3 / 3")).toBeTruthy();
    expect(screen.getByText("SOS-20260720-0012")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    expect(screen.queryByLabelText("Status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(
      "investigating",
    );

    // Clicking Apply applies the draft filter to the table
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByText("Showing 1 / 3")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "SOS-20260720-0015" })
        .getAttribute("href"),
    ).toBe("/sos/inc-sos-002");
    expect(screen.queryByText("SOS-20260720-0012")).toBeNull();
    expect(screen.queryByText("SOS-20260720-0019")).toBeNull();

    // Form submission applies combined status + severity + trimmed case-insensitive keyword
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "falseAlarm" },
    });
    fireEvent.change(screen.getByLabelText("Severity"), {
      target: { value: "low" },
    });
    fireEvent.change(screen.getByLabelText("Keyword"), {
      target: { value: "  klm-5512  " },
    });
    fireEvent.submit(screen.getByLabelText("Keyword").closest("form")!);

    expect(screen.getByText("Showing 1 / 3")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "SOS-20260720-0019" })
        .getAttribute("href"),
    ).toBe("/sos/inc-sos-003");
    expect(screen.queryByText("SOS-20260720-0015")).toBeNull();

    // Edit draft keyword before switching locale; both draft and applied filters survive locale switch
    fireEvent.change(screen.getByLabelText("Keyword"), {
      target: { value: "no-such-incident-999" },
    });
    fireEvent.click(screen.getByTestId("switch-locale-zh"));

    await screen.findByText("顯示 1 / 3 筆");
    expect((screen.getByLabelText("狀態") as HTMLSelectElement).value).toBe(
      "falseAlarm",
    );
    expect((screen.getByLabelText("嚴重度") as HTMLSelectElement).value).toBe(
      "low",
    );
    expect((screen.getByLabelText("關鍵字") as HTMLInputElement).value).toBe(
      "no-such-incident-999",
    );
    expect(screen.getByText("SOS-20260720-0019")).toBeTruthy();
    expect(state.sseCount).toBe(1);
    expect(fx.get.mock.calls.length).toBe(initialGetCalls);

    // Apply the zero-match draft in Traditional Chinese -> localized filtered-empty state
    fireEvent.click(screen.getByRole("button", { name: "套用" }));
    expect(screen.getByText("顯示 0 / 3 筆")).toBeTruthy();
    expect(screen.getByText("沒有符合篩選條件的 SOS 事件")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重設篩選" })).toBeTruthy();

    // Switch back to English -> filtered-empty state translates in place
    fireEvent.click(screen.getByTestId("switch-locale-en"));
    await screen.findByText("No matching SOS events");
    expect(screen.getByText("Showing 0 / 3")).toBeTruthy();

    // Filtered-empty state Reset button clears both draft and applied values and restores all rows
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByText("Showing 3 / 3")).toBeTruthy();
    expect(screen.queryByText("No matching SOS events")).toBeNull();
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(
      "all",
    );
    expect((screen.getByLabelText("Severity") as HTMLSelectElement).value).toBe(
      "all",
    );
    expect((screen.getByLabelText("Keyword") as HTMLInputElement).value).toBe(
      "",
    );

    // Panel Reset button also resets applied and draft values to all/all/empty and restores original order
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "acknowledged" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByText("Showing 1 / 3")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Keyword"), {
      target: { value: "draft-edit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("Showing 3 / 3")).toBeTruthy();
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(
      "all",
    );
    expect((screen.getByLabelText("Severity") as HTMLSelectElement).value).toBe(
      "all",
    );
    expect((screen.getByLabelText("Keyword") as HTMLInputElement).value).toBe(
      "",
    );
    const links = screen
      .getAllByRole("link")
      .map((el) => el.getAttribute("href"));
    expect(links).toEqual([
      "/sos/inc-sos-001",
      "/sos/inc-sos-002",
      "/sos/inc-sos-003",
    ]);
    expect(state.sseCount).toBe(1);
    expect(fx.get.mock.calls.length).toBe(initialGetCalls);
  });

  it("preserves global pendingCount, critical alert modal, audio cadence, render receipts, and applied filters across canonical ACK refresh when a critical incident is filtered out of the table", async () => {
    localStorage.removeItem("drts-sos-sound-off");
    const fx = createFixture();
    let critIncident: IncidentRecord = {
      ...fx.getIncident(),
      incidentId: "inc-sos-001",
      title: "Traffic accident SOS-20260720-0012",
      description:
        "Driver SOS SOS-20260720-0012 submitted from the driver app.",
      severity: "critical",
      status: "open",
      assignedTo: null,
    };
    const closedIncident: IncidentRecord = {
      ...fx.getIncident(),
      incidentId: "inc-sos-002",
      title: "Safety incident SOS-20260720-0007",
      description:
        "Driver SOS SOS-20260720-0007 submitted from the driver app.",
      category: "safety",
      severity: "low",
      status: "closed",
      assignedTo: "ops-duty-2",
      relatedDriverId: "drv-2",
      relatedVehicleId: "veh-2",
      relatedOrderId: "ZX-240720-0007",
      occurredAt: "2026-07-20T09:30:00.000Z",
    };
    let critEvent: DriverSosEventRecord = {
      ...fx.getSosEvent(),
      sosEventId: "sos_001",
      eventNo: "SOS-20260720-0012",
      incidentId: "inc-sos-001",
      status: "submitted",
      dutyAcknowledgement: {
        acknowledgedAt: null,
        acknowledgedByActorId: null,
      },
    };
    const closedEvent: DriverSosEventRecord = {
      ...fx.getSosEvent(),
      sosEventId: "sos_002",
      eventNo: "SOS-20260720-0007",
      incidentId: "inc-sos-002",
      status: "closed",
      dutyAcknowledgement: {
        acknowledgedAt: "2026-07-20T09:31:00.000Z",
        acknowledgedByActorId: "ops-duty-2",
      },
    };

    fx.get.mockImplementation(async (path: string): Promise<any> => {
      if (path === "/api/incidents") {
        return { items: [critIncident, closedIncident] };
      }
      if (path === "/api/ops/driver-sos/by-incident/inc-sos-001") {
        return { event: critEvent };
      }
      if (path === "/api/ops/driver-sos/by-incident/inc-sos-002") {
        return { event: closedEvent };
      }
      return { items: [] };
    });

    fx.post.mockImplementation(
      async (path: string, options?: { body?: unknown }) => {
        if (path === "/api/ops/driver-sos/sos_001/duty-ack") {
          critEvent = {
            ...critEvent,
            dutyAcknowledgement: {
              acknowledgedAt: "2026-07-20T10:01:00.000Z",
              acknowledgedByActorId: "ops-mounted",
            },
          };
          critIncident = {
            ...critIncident,
            assignedTo: "ops-mounted",
          };
          return {
            dutyAcknowledgement: critEvent.dutyAcknowledgement,
            wonAcknowledgement: true,
          };
        }
        if (path === "/api/ops/driver-sos/alerts/rendered") {
          return { updatedCount: 2, recordedAt: "2026-07-20T10:00:03.000Z" };
        }
        throw new Error(`Unexpected POST ${path}: ${JSON.stringify(options)}`);
      },
    );

    vi.useFakeTimers();
    let beepCount = 0;
    const originalAudioContext = window.AudioContext;
    class FakeAudioContext {
      state = "running";
      currentTime = 0;
      destination = {};
      resume = vi.fn(async () => undefined);
      close = vi.fn(async () => undefined);
      createGain = vi.fn(() => ({
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn() },
      }));
      createOscillator = vi.fn(() => {
        const osc: {
          type: string;
          frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
          connect: ReturnType<typeof vi.fn>;
          onended: (() => void) | null;
          start: ReturnType<typeof vi.fn>;
          stop: ReturnType<typeof vi.fn>;
        } = {
          type: "sine",
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          onended: null,
          start: vi.fn(() => {
            beepCount += 1;
          }),
          stop: vi.fn(() => {
            osc.onended?.();
          }),
        };
        return osc;
      });
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: FakeAudioContext,
    });

    try {
      const view = render(
        <LocaleHarness defaultLocale="en">
          <SosQueuePage />
        </LocaleHarness>,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20);
      });

      expect(screen.getByText("1 pending")).toBeTruthy();
      expect(screen.getByText("Showing 2 / 2")).toBeTruthy();
      expect(beepCount).toBe(1);
      const renderedCalls = fx.post.mock.calls.filter(
        ([path]) => path === "/api/ops/driver-sos/alerts/rendered",
      );
      expect(renderedCalls).toHaveLength(1);
      expect(renderedCalls[0]?.[1]).toEqual({
        body: {
          incidentIds: ["inc-sos-001", "inc-sos-002"],
          renderedAt: expect.any(String),
        },
      });

      // Advance 1980ms into the 4000ms audio cadence (total 2000ms elapsed), then filter out the critical row
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1980);
      });
      expect(beepCount).toBe(1);

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Filter" }));
      });
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Status"), {
          target: { value: "closed" },
        });
        fireEvent.change(screen.getByLabelText("Severity"), {
          target: { value: "low" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Apply" }));
        await vi.advanceTimersByTimeAsync(0);
      });

      // Table is filtered to 1/2 (only closed incident in table), but global pendingCount and critical modal stay active
      expect(screen.getByText("Showing 1 / 2")).toBeTruthy();
      expect(screen.getByText("1 pending")).toBeTruthy();
      expect(
        screen.queryByRole("link", { name: "SOS-20260720-0012" }),
      ).toBeNull();
      expect(
        screen.getByRole("link", { name: "SOS-20260720-0007" }),
      ).toBeTruthy();
      expect(screen.getByText("SOS-20260720-0012")).toBeTruthy(); // still in critical alert modal
      expect(beepCount).toBe(1); // no extra beep on filter apply

      // Remaining 2000ms of the original 4000ms cadence triggers the second beep on schedule
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(beepCount).toBe(2);
      expect(
        fx.post.mock.calls.filter(
          ([path]) => path === "/api/ops/driver-sos/alerts/rendered",
        ),
      ).toHaveLength(1);

      // Acknowledge the critical incident from the modal; canonical refresh keeps the applied filter
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
        await vi.advanceTimersByTimeAsync(20);
      });

      expect(screen.getByText("0 pending")).toBeTruthy();
      expect(screen.getByText("Showing 1 / 2")).toBeTruthy();
      expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(
        "closed",
      );
      expect(
        screen.getByRole("link", { name: "SOS-20260720-0007" }),
      ).toBeTruthy();

      view.unmount();
    } finally {
      vi.useRealTimers();
      Object.defineProperty(window, "AudioContext", {
        configurable: true,
        writable: true,
        value: originalAudioContext,
      });
    }
  });

  it("preserves distinct normal no-data and load-error states without turning them into filtered-empty", async () => {
    const fx = createFixture();
    fx.get.mockImplementation(async (path: string): Promise<any> => {
      if (path === "/api/incidents") {
        return { items: [] };
      }
      return { items: [] };
    });

    const emptyView = render(
      <LocaleHarness defaultLocale="en">
        <SosQueuePage />
      </LocaleHarness>,
    );

    await screen.findByText("SOS queue");
    expect(screen.getByText("Showing 0 / 0")).toBeTruthy();
    expect(screen.queryByText("No matching SOS events")).toBeNull();
    emptyView.unmount();

    fx.get.mockImplementation(async (path: string): Promise<any> => {
      if (path === "/api/incidents") {
        throw new Error("Simulated backend outage");
      }
      return { items: [] };
    });

    const errorView = render(
      <LocaleHarness defaultLocale="en">
        <SosQueuePage />
      </LocaleHarness>,
    );

    await screen.findByText("System error");
    expect(
      screen.getByText(
        "The SOS queue could not be loaded. Check the backend connection.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("No matching SOS events")).toBeNull();
    errorView.unmount();
  });
});
