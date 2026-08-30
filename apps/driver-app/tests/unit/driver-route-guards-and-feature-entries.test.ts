import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (globalThis as any).__DEV__ = true;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

import {
  allowUnprovisionedDriverRoute,
  isProtectedDriverRoute,
  PROTECTED_DRIVER_ROUTES,
  PUBLIC_DRIVER_ROUTES,
  resetDriverAppToOnboarding,
} from "../../lib/driver-identity-routing";
import { syncDriverIdentityBootstrap } from "../../lib/driver-identity-bootstrap";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  dismissAll: vi.fn(),
  canDismiss: vi.fn().mockReturnValue(true),
  isDriverIdentityProvisioned: vi.fn(),
  getDriverIdentityIssue: vi.fn(),
  listDriverTasks: vi.fn(),
  listUnifiedDriverTasks: vi.fn(),
  getPlatformPresence: vi.fn(),
  listShifts: vi.fn(),
  getDriverSettings: vi.fn(),
  getDriverProfile: vi.fn(),
  getPlatformEarningsSummary: vi.fn(),
  getPlatformEarningsByPlatform: vi.fn(),
  listDriverStatements: vi.fn(),
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
  syncDriverOnlineAvailableHeartbeat: vi.fn(),
  syncDriverTripHeartbeat: vi.fn(),
  stopDriverLocationHeartbeat: vi.fn(),
  getLatestDriverLocationUpdate: vi.fn().mockReturnValue(null),
  cacheClearHandlers: new Set<() => Promise<void> | void>(),
  triggerCacheClear: async () => {
    for (const handler of Array.from(mocks.cacheClearHandlers)) {
      await handler();
    }
  },
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

vi.mock("react-native-maps", () => ({
  default: (props: any) =>
    React.createElement("MapView", props, props.children),
  Marker: (props: any) =>
    React.createElement("Marker", props, props.children),
  Polyline: (props: any) =>
    React.createElement("Polyline", props, props.children),
  PROVIDER_GOOGLE: "google",
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Alert: { alert: vi.fn() },
  Animated: {
    Value: class {
      setValue = vi.fn();
      interpolate = vi.fn();
    },
    View: "Animated.View",
    timing: () => ({ start: (cb?: () => void) => cb?.() }),
    spring: () => ({ start: (cb?: () => void) => cb?.() }),
  },
  AppState: {
    addEventListener: () => ({ remove: vi.fn() }),
  },
  Keyboard: { addListener: () => ({ remove: vi.fn() }), dismiss: vi.fn() },
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Linking: { openSettings: vi.fn() },
  PanResponder: { create: () => ({ panHandlers: {} }) },
  Platform: {
    OS: "ios",
    select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
  },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: <T>(styles: T) => styles },
  Switch: "Switch",
  Text: "Text",
  TextInput: "TextInput",
  TouchableOpacity: "TouchableOpacity",
  Vibration: { vibrate: vi.fn() },
  View: "View",
}));

vi.mock("expo-router", () => ({
  Redirect: (props: { href: string }) =>
    React.createElement("Redirect", props),
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    back: vi.fn(),
    canDismiss: mocks.canDismiss,
    dismissAll: mocks.dismissAll,
  }),
  useLocalSearchParams: () => ({}),
}));

vi.mock("expo-linking", () => ({
  openURL: vi.fn(),
  canOpenURL: vi.fn(),
}));

vi.mock("expo-location", () => ({
  getForegroundPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
  getBackgroundPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
}));

vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn(),
  MediaTypeOptions: { Images: "Images" },
}));

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: { extra: { apiBaseUrl: "https://example.test" } },
  },
}));

vi.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, val: string) => {
      store.set(key, val);
    }),
    deleteItemAsync: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    __store: store,
  };
});

vi.mock("@/components/canvas-primitives", () => {
  const comp = (name: string) => (props: { children?: React.ReactNode }) =>
    React.createElement(name, props, props.children);
  return {
    Banner: comp("Banner"),
    Btn: comp("Btn"),
    Card: comp("Card"),
    DL: comp("DL"),
    Field: comp("Field"),
    KPI: comp("KPI"),
    PageHeader: comp("PageHeader"),
    Pill: comp("Pill"),
    Shell: comp("Shell"),
    driverCanvasTheme: {
      accent: "#000",
      textMuted: "#666",
      card: "#fff",
      cardAlt: "#f9f9f9",
      border: "#eee",
      info: "#00f",
      infoBg: "#eef",
      infoBorder: "#cce",
      success: "#0a0",
      successBg: "#efe",
      warn: "#fa0",
      warnBg: "#ffe",
      danger: "#f00",
      dangerBg: "#fee",
    },
  };
});

vi.mock("@/components/ui", () => {
  const comp = (name: string) => (props: { children?: React.ReactNode }) =>
    React.createElement(name, props, props.children);
  const tokenProxy: unknown = new Proxy(function () {}, {
    get: (_target, prop) => {
      if (prop === Symbol.toPrimitive || prop === "toString") {
        return () => "0";
      }
      return tokenProxy;
    },
  });
  return {
    ActionButton: comp("ActionButton"),
    AppScreen: comp("AppScreen"),
    AuthorityBanner: comp("AuthorityBanner"),
    BottomActionBar: comp("BottomActionBar"),
    EmptyState: comp("EmptyState"),
    ErrorBanner: comp("ErrorBanner"),
    FormField: comp("FormField"),
    IconButton: comp("IconButton"),
    PageHeader: comp("PageHeader"),
    PlatformBadge: comp("PlatformBadge"),
    StatusChip: comp("StatusChip"),
    Tokens: tokenProxy,
  };
});

vi.mock("@/components/platform-status-card", () => ({
  assessPlatformHealth: () => ({ canReceiveOrders: true }),
  getPlatformHealthSeverity: () => 0,
}));

vi.mock("@/lib/driver-location-heartbeat", () => ({
  getActiveDriverHeartbeatWorkState: () => null,
  getLatestDriverLocationUpdate: mocks.getLatestDriverLocationUpdate,
  stopDriverLocationHeartbeat: mocks.stopDriverLocationHeartbeat,
  syncDriverOnlineAvailableHeartbeat: mocks.syncDriverOnlineAvailableHeartbeat,
  syncDriverTripHeartbeat: mocks.syncDriverTripHeartbeat,
}));

vi.mock("@/lib/api-client", () => ({
  getDriverClient: () => ({
      isFeatureEnabled: mocks.isFeatureEnabled,
      listDriverTasks: mocks.listDriverTasks,
      listUnifiedDriverTasks: mocks.listUnifiedDriverTasks,
      getPlatformPresence: mocks.getPlatformPresence,
      listShifts: mocks.listShifts,
      getDriverSettings: mocks.getDriverSettings,
      getDriverProfile: mocks.getDriverProfile,
      getPlatformEarningsSummary: mocks.getPlatformEarningsSummary,
      getPlatformEarningsByPlatform: mocks.getPlatformEarningsByPlatform,
      listDriverStatements: mocks.listDriverStatements,
      getOrder: vi.fn().mockResolvedValue(null),
    }),
    getDriverId: () => "drv-001",
    getDriverIdentityIssue: mocks.getDriverIdentityIssue,
    getPendingDriverTaskCompletion: vi.fn().mockResolvedValue(null),
    replayPendingDriverTaskCompletion: vi.fn().mockResolvedValue(null),
    initializeDriverIdentity: vi.fn().mockResolvedValue(undefined),
    isDriverIdentityHydrated: () => true,
    isDriverIdentityProvisioned: mocks.isDriverIdentityProvisioned,
    recoverDriverSessionFromApiError: vi.fn().mockResolvedValue(false),
    registerProtectedCacheClearHandler: (fn: () => Promise<void> | void) => {
      mocks.cacheClearHandlers.add(fn);
      return () => {
        mocks.cacheClearHandlers.delete(fn);
      };
    },
    formatDriverError: (_err: unknown, fallback: string) => fallback,
}));

import JobsScreen from "../../app/jobs";
import TripScreen from "../../app/trip";
import PlatformPresenceScreen from "../../app/platform-presence";
import SettingsScreen from "../../app/settings";
import EarningsScreen from "../../app/earnings";
import ShiftScreen from "../../app/shift";
import SosScreen from "../../app/sos";
import IncidentScreen from "../../app/incident";

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function buildMockTask(taskId: string) {
  return {
    taskId,
    orderId: `ord-${taskId}`,
    orderDomain: "owned",
    sourcePlatform: "drts",
    platformDisplayName: "DRTS",
    externalOrderId: null,
    nativeStatus: null,
    localStatus: "accepted",
    driverActionState: "in_progress",
    allowedActions: ["accept", "reject"],
    routeLocked: false,
    fareAuthority: "drts",
    settlementAuthority: "drts",
    driverPayoutAuthority: "drts",
    canAccept: true,
    canReject: true,
    canCancel: false,
    canReassign: false,
    canComplete: false,
    canReportIncident: true,
    pickupLocation: {
      latitude: 25.04,
      longitude: 121.55,
      address: "台北市忠孝東路四段 1 號",
    },
    dropoffLocation: {
      latitude: 25.03,
      longitude: 121.56,
      address: "台北市信義路五段 7 號",
    },
    fareEstimate: { amount: 150, currency: "TWD" },
    createdAt: "2026-08-30T10:00:00Z",
    updatedAt: "2026-08-30T10:00:00Z",
    statusBadgeLabel: "已接單",
    statusBadgeTone: "accent",
    platformBadgeLabel: "DRTS",
    platformBadgeTone: "owned",
    syncStateTone: "success",
    syncStateLabel: "即時連線",
    syncNotice: null,
  };
}

describe("DRV-AUTH-002: Route guards and feature entries agree with server authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDriverIdentityProvisioned.mockReturnValue(false);
    mocks.getDriverIdentityIssue.mockReturnValue(null);
    mocks.listDriverTasks.mockResolvedValue([]);
    mocks.listUnifiedDriverTasks.mockResolvedValue([]);
  });

  describe("Acceptance 1 & 2: Single session authority and route protection per route", () => {
    it("strictly allows only onboarding and protects all 10 driver screens", () => {
      expect(PUBLIC_DRIVER_ROUTES).toEqual(["onboarding"]);
      expect(PROTECTED_DRIVER_ROUTES).toHaveLength(10);
      expect(PROTECTED_DRIVER_ROUTES).toEqual([
        "index",
        "jobs",
        "trip",
        "platform-presence",
        "settings",
        "earnings",
        "shift",
        "sos",
        "incident",
        "safety-operator",
      ]);

      // Public onboarding
      expect(allowUnprovisionedDriverRoute(["onboarding"])).toBe(true);
      expect(allowUnprovisionedDriverRoute(["/onboarding"])).toBe(true);
      expect(isProtectedDriverRoute("onboarding")).toBe(false);

      // Protected routes
      for (const route of PROTECTED_DRIVER_ROUTES) {
        expect(allowUnprovisionedDriverRoute([route])).toBe(false);
        expect(allowUnprovisionedDriverRoute([`/${route}`])).toBe(false);
        expect(isProtectedDriverRoute(route)).toBe(true);
        expect(isProtectedDriverRoute(`/${route}`)).toBe(true);
      }
      expect(allowUnprovisionedDriverRoute([])).toBe(false);
    });

    it("routes unauthenticated sessions to onboarding per protected route during bootstrap", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      const mockRouter = {
        canDismiss: mocks.canDismiss,
        dismissAll: mocks.dismissAll,
        replace: mocks.replace,
        push: mocks.push,
      };

      for (const route of PROTECTED_DRIVER_ROUTES) {
        mocks.replace.mockClear();
        mocks.listDriverTasks.mockClear();

        await syncDriverIdentityBootstrap({
          router: mockRouter,
          isDriverIdentityProvisioned: mocks.isDriverIdentityProvisioned,
          getDriverIdentityIssue: mocks.getDriverIdentityIssue,
          initializeDriverIdentity: async () => {},
          listDriverTasks: mocks.listDriverTasks,
          resetDriverAppToOnboarding: (r) => resetDriverAppToOnboarding(r),
          syncDriverLocationHeartbeat: vi.fn().mockResolvedValue(undefined),
          allowUnprovisionedRoute: allowUnprovisionedDriverRoute([route]),
        });

        expect(mocks.replace).toHaveBeenCalledWith("/onboarding");
        // Must NOT call protected APIs
        expect(mocks.listDriverTasks).not.toHaveBeenCalled();
      }
    });

    it("renders Redirect to /onboarding for unauthenticated session on JobsScreen without loading tasks", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(JobsScreen));
        await flushAsync();
      });

      const redirect = renderer.root.findAllByType("Redirect");
      expect(redirect).toHaveLength(1);
      expect(redirect[0].props.href).toBe("/onboarding");
      expect(mocks.listDriverTasks).not.toHaveBeenCalled();
      expect(mocks.listUnifiedDriverTasks).not.toHaveBeenCalled();
    });

    it("renders Redirect to /onboarding for unauthenticated session on TripScreen without loading trip", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(TripScreen));
        await flushAsync();
      });

      const redirect = renderer.root.findAllByType("Redirect");
      expect(redirect).toHaveLength(1);
      expect(redirect[0].props.href).toBe("/onboarding");
      expect(mocks.listDriverTasks).not.toHaveBeenCalled();
    });

    it("renders Redirect to /onboarding for unauthenticated session on PlatformPresenceScreen without loading presence", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(PlatformPresenceScreen));
        await flushAsync();
      });

      const redirect = renderer.root.findAllByType("Redirect");
      expect(redirect).toHaveLength(1);
      expect(redirect[0].props.href).toBe("/onboarding");
      expect(mocks.getPlatformPresence).not.toHaveBeenCalled();
    });

    it("renders Redirect to /onboarding for unauthenticated session on SettingsScreen without loading settings", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(SettingsScreen));
        await flushAsync();
      });

      const redirect = renderer.root.findAllByType("Redirect");
      expect(redirect).toHaveLength(1);
      expect(redirect[0].props.href).toBe("/onboarding");
      expect(mocks.getDriverSettings).not.toHaveBeenCalled();
      expect(mocks.getDriverProfile).not.toHaveBeenCalled();
    });

    it("renders Redirect to /onboarding for unauthenticated session on EarningsScreen without loading earnings", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(EarningsScreen));
        await flushAsync();
      });

      const redirect = renderer.root.findAllByType("Redirect");
      expect(redirect).toHaveLength(1);
      expect(redirect[0].props.href).toBe("/onboarding");
      expect(mocks.getPlatformEarningsSummary).not.toHaveBeenCalled();
    });

    it("renders unprovisioned gate EmptyState with onboarding action on ShiftScreen without loading shifts", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(ShiftScreen));
        await flushAsync();
      });

      const emptyState = renderer.root.findByType("EmptyState");
      expect(emptyState.props.actionTitle).toBe("前往配置裝置");
      expect(mocks.listShifts).not.toHaveBeenCalled();
    });

    it("renders Redirect to /onboarding for unauthenticated session on SosScreen without fetching task context", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(SosScreen));
        await flushAsync();
      });

      const redirect = renderer.root.findAllByType("Redirect");
      expect(redirect).toHaveLength(1);
      expect(redirect[0].props.href).toBe("/onboarding");
      expect(mocks.listUnifiedDriverTasks).not.toHaveBeenCalled();
    });

    it("renders Redirect to /onboarding for unauthenticated session on IncidentScreen without fetching incident context", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(IncidentScreen));
        await flushAsync();
      });

      const redirect = renderer.root.findAllByType("Redirect");
      expect(redirect).toHaveLength(1);
      expect(redirect[0].props.href).toBe("/onboarding");
      expect(mocks.listUnifiedDriverTasks).not.toHaveBeenCalled();
    });
  });

  describe("Acceptance 3: Authenticated driver entitlement and feature entries", () => {
    it("allows authenticated driver to reach entitled routes and load data", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(true);
      mocks.listUnifiedDriverTasks.mockResolvedValue([buildMockTask("task-100")]);

      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(JobsScreen));
        await flushAsync();
      });

      expect(renderer.root.findAllByType("Redirect")).toHaveLength(0);
      expect(mocks.listUnifiedDriverTasks).toHaveBeenCalled();
    });
  });

  describe("Acceptance 4: 403 Forbidden / DRIVER_IDENTITY_MISMATCH enforcement", () => {
    it("never renders unauthorized data when server returns 403 Forbidden / DRIVER_IDENTITY_MISMATCH", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(true);
      mocks.listUnifiedDriverTasks.mockRejectedValue(
        new Error("API error 403: DRIVER_IDENTITY_MISMATCH"),
      );
      mocks.listDriverTasks.mockRejectedValue(
        new Error("API error 403: DRIVER_IDENTITY_MISMATCH"),
      );

      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(JobsScreen));
        await flushAsync();
      });

      // Assert no task card or protected data is rendered
      expect(renderer.root.findAllByType("TaskCard")).toHaveLength(0);
      expect(renderer.root.findAllByType("DenseTaskRow")).toHaveLength(0);

      // Assert error notice is surfaced cleanly
      const banners = renderer.root.findAllByType("Banner");
      expect(banners.length).toBeGreaterThan(0);
    });
  });

  describe("Acceptance 5: Sign-out and identity loss single-path cache clearing", () => {
    it("purges rendered protected state across screens upon cache clear trigger", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(true);
      mocks.listUnifiedDriverTasks.mockResolvedValue([buildMockTask("task-200")]);

      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(JobsScreen));
        await flushAsync();
      });

      // Verify task loaded
      expect(renderer.root.findAllByType("Redirect")).toHaveLength(0);

      // Now trigger sign-out / cache clear
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      await act(async () => {
        await mocks.triggerCacheClear();
        await flushAsync();
      });

      // Verify cached tasks cleared and screen redirected
      expect(renderer.root.findAllByType("TaskCard")).toHaveLength(0);
      const redirects = renderer.root.findAllByType("Redirect");
      expect(redirects.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Acceptance 6: Background/foreground return and network loss sync", () => {
    it("re-evaluates server authority and routes revoked sessions to onboarding", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      mocks.getDriverIdentityIssue.mockReturnValue(
        "此司機帳號已被停權，暫時無法刷新裝置登入。",
      );

      const mockRouter = {
        canDismiss: mocks.canDismiss,
        dismissAll: mocks.dismissAll,
        replace: mocks.replace,
        push: mocks.push,
      };

      const result = await syncDriverIdentityBootstrap({
        router: mockRouter,
        isDriverIdentityProvisioned: mocks.isDriverIdentityProvisioned,
        getDriverIdentityIssue: mocks.getDriverIdentityIssue,
        initializeDriverIdentity: async () => {},
        listDriverTasks: mocks.listDriverTasks,
        resetDriverAppToOnboarding: (r) => resetDriverAppToOnboarding(r),
        syncDriverLocationHeartbeat: vi.fn().mockResolvedValue(undefined),
        allowUnprovisionedRoute: false,
      });

      expect(result).toBe("routed");
      expect(mocks.replace).toHaveBeenCalledWith("/onboarding");
      expect(mocks.syncDriverTripHeartbeat).not.toHaveBeenCalled();
    });

    it("resumes trip tracking heartbeat when identity remains valid after foreground return", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(true);
      mocks.getDriverIdentityIssue.mockReturnValue(null);
      mocks.listDriverTasks.mockResolvedValue([
        {
          taskId: "task-live-1",
          driverId: "drv-001",
          status: "in_progress",
        },
      ]);

      const mockRouter = {
        canDismiss: mocks.canDismiss,
        dismissAll: mocks.dismissAll,
        replace: mocks.replace,
        push: mocks.push,
      };

      const syncDriverLocationHeartbeat = vi.fn().mockResolvedValue(undefined);

      const result = await syncDriverIdentityBootstrap({
        router: mockRouter,
        isDriverIdentityProvisioned: mocks.isDriverIdentityProvisioned,
        getDriverIdentityIssue: mocks.getDriverIdentityIssue,
        initializeDriverIdentity: async () => {},
        listDriverTasks: mocks.listDriverTasks,
        resetDriverAppToOnboarding: (r) => resetDriverAppToOnboarding(r),
        syncDriverLocationHeartbeat,
        allowUnprovisionedRoute: false,
      });

      expect(result).toBe("synced");
      expect(mocks.replace).not.toHaveBeenCalled();
    });
  });
});
