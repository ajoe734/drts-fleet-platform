// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { resolve } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CreateServiceAreaBoundaryCommand,
  CreateStopPolicyCommand,
  EvaluateServiceAreaCommand,
  PublishServiceAreaBoundaryCommand,
  PublishStopPolicyCommand,
  RetireServiceAreaBoundaryCommand,
  RetireStopPolicyCommand,
  UpdateServiceAreaBoundaryCommand,
  UpdateStopPolicyCommand,
} from "@drts/contracts";
import * as apiClientPkg from "../../../packages/api-client/src/index";
import * as canvasPkg from "../../../packages/ui-web/src/index";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import { SnakeCaseExceptionFilter } from "../../../apps/api/src/common/snake-case.exception-filter";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { MapGeofenceObservabilityService } from "../../../apps/api/src/modules/operational-observability/map-geofence-observability.service";
import { ServiceAreaController } from "../../../apps/api/src/modules/service-area/service-area.controller";
import { ServiceAreaService } from "../../../apps/api/src/modules/service-area/service-area.service";
import {
  t as translate,
  type Locale,
} from "../../../apps/platform-admin-web/lib/translations";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

function camelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function deepToCamelCase<T>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map((entry) => deepToCamelCase(entry)) as unknown as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        camelKey(k),
        deepToCamelCase(v),
      ]),
    ) as T;
  }
  return value as T;
}

function formatFilteredError(error: unknown) {
  const maybeHttp = error as {
    getStatus?: () => number;
    getResponse?: () => unknown;
  } | null;
  if (
    maybeHttp &&
    typeof maybeHttp.getStatus === "function" &&
    typeof maybeHttp.getResponse === "function"
  ) {
    return {
      status: maybeHttp.getStatus(),
      body: deepToSnakeCase(maybeHttp.getResponse()),
    };
  }
  let status = 500;
  let body: unknown;
  new SnakeCaseExceptionFilter().catch(error, {
    switchToHttp: () => ({
      getResponse: () => ({
        status: (code: number) => {
          status = code;
          return {
            json: (payload: unknown) => {
              body = payload;
            },
          };
        },
      }),
    }),
  } as Parameters<SnakeCaseExceptionFilter["catch"]>[1]);
  return { status, body };
}

const adminIdentity: BootstrapRequestIdentity = {
  actorId: "platform-admin-web-bootstrap",
  actorType: "platform_admin",
  realm: "platform",
  tenantId: null,
  fleetPartnerId: null,
  partnerId: null,
  scopes: ["foundation:read", "foundation:write"],
  sessionType: "bootstrap_header",
};

const defaultInitialGeometryDraft =
  canvasPkg.createEmptyGeometryDraft("polygon");

function StableGeometryEditor(props: canvasPkg.GeometryEditorProps) {
  return React.createElement(canvasPkg.GeometryEditor, {
    ...props,
    initialDraft: props.initialDraft ?? defaultInitialGeometryDraft,
  });
}

let activeBaseUrl = "http://platform-api.unit.test/h0";
let activeLocale: Locale = "en";
const translateCurrent = (
  key: string,
  params?: Record<string, string | number>,
) => translate(key, activeLocale, params);

const appRoot = resolve("apps/platform-admin-web");
const load = createUiModuleLoader(appRoot, {
  react: React,
  "react/jsx-runtime": jsxRuntime,
  "@drts/ui-web": {
    ...canvasPkg,
    GeometryEditor: StableGeometryEditor,
  },
  "@drts/api-client": apiClientPkg,
  "./runtime-config": {
    getRuntimeApiBaseUrl: () => activeBaseUrl,
  },
  "@/lib/i18n": {
    useTranslation: () => ({
      locale: activeLocale,
      setLocale: vi.fn(),
      t: translateCurrent,
    }),
  },
});

const { getPlatformAdminClient } = load<{
  getPlatformAdminClient: (url: string) => apiClientPkg.ApiClient;
}>(resolve(appRoot, "lib/platform-admin-client-factory.ts"));

const ServiceAreaGovernancePage = load<{ default: React.ComponentType }>(
  resolve(appRoot, "app/service-area-governance/page.tsx"),
).default;

let harnessCounter = 0;

function createProductionHarness(
  options: {
    locale?: Locale;
    definitionsFailure?: string;
  } = {},
) {
  harnessCounter += 1;
  activeLocale = options.locale ?? "en";
  activeBaseUrl = `http://platform-api.unit.test/h${harnessCounter}`;

  const auditService = new AuditNotificationService();
  const observabilityService = new MapGeofenceObservabilityService();
  const serviceAreaService = new ServiceAreaService(
    undefined,
    auditService,
    observabilityService,
  );
  const controller = new ServiceAreaController(serviceAreaService);

  const wireRequests: Array<{
    method: string;
    path: string;
    rawBody: Record<string, unknown> | undefined;
    camelBody: unknown;
  }> = [];

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      const path = url.pathname.replace(/^\/h\d+/, "");
      const method = (init?.method ?? "GET").toUpperCase();
      const rawBody = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined;
      const camelBody = rawBody ? deepToCamelCase(rawBody) : undefined;
      wireRequests.push({ method, path, rawBody, camelBody });

      try {
        if (
          path === "/api/service-area/definitions" &&
          method === "GET" &&
          options.definitionsFailure
        ) {
          return new Response(
            JSON.stringify({
              error: {
                code: "DEFINITIONS_UNAVAILABLE",
                message: options.definitionsFailure,
              },
            }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        }

        let envelope: unknown;
        const reqId = "req-service-area-preview-test";

        if (path === "/api/service-area/definitions" && method === "GET") {
          envelope = controller.listDefinitions(reqId);
        } else if (path === "/api/service-area/evaluate" && method === "POST") {
          envelope = controller.evaluateServiceArea(
            camelBody as EvaluateServiceAreaCommand,
            reqId,
          );
        } else if (
          path === "/api/service-area/admin/service-areas" &&
          method === "POST"
        ) {
          envelope = await controller.createServiceArea(
            camelBody as CreateServiceAreaBoundaryCommand,
            adminIdentity,
            reqId,
          );
        } else if (
          /^\/api\/service-area\/admin\/service-areas\/[^/]+\/update$/.test(
            path,
          ) &&
          method === "POST"
        ) {
          const id = decodeURIComponent(path.split("/")[5]!);
          envelope = await controller.updateServiceArea(
            id,
            camelBody as UpdateServiceAreaBoundaryCommand,
            adminIdentity,
            reqId,
          );
        } else if (
          /^\/api\/service-area\/admin\/service-areas\/[^/]+\/submit-review$/.test(
            path,
          ) &&
          method === "POST"
        ) {
          const id = decodeURIComponent(path.split("/")[5]!);
          envelope = await controller.submitServiceAreaForReview(
            id,
            adminIdentity,
            reqId,
          );
        } else if (
          /^\/api\/service-area\/admin\/service-areas\/[^/]+\/publish$/.test(
            path,
          ) &&
          method === "POST"
        ) {
          const id = decodeURIComponent(path.split("/")[5]!);
          envelope = await controller.publishServiceArea(
            id,
            (camelBody ?? {}) as PublishServiceAreaBoundaryCommand,
            adminIdentity,
            reqId,
          );
        } else if (
          /^\/api\/service-area\/admin\/service-areas\/[^/]+\/retire$/.test(
            path,
          ) &&
          method === "POST"
        ) {
          const id = decodeURIComponent(path.split("/")[5]!);
          envelope = await controller.retireServiceArea(
            id,
            (camelBody ?? {}) as RetireServiceAreaBoundaryCommand,
            adminIdentity,
            reqId,
          );
        } else if (
          path === "/api/service-area/admin/stop-policies" &&
          method === "POST"
        ) {
          envelope = await controller.createStopPolicy(
            camelBody as CreateStopPolicyCommand,
            adminIdentity,
            reqId,
          );
        } else if (
          /^\/api\/service-area\/admin\/stop-policies\/[^/]+\/update$/.test(
            path,
          ) &&
          method === "POST"
        ) {
          const id = decodeURIComponent(path.split("/")[5]!);
          envelope = await controller.updateStopPolicy(
            id,
            camelBody as UpdateStopPolicyCommand,
            adminIdentity,
            reqId,
          );
        } else if (
          /^\/api\/service-area\/admin\/stop-policies\/[^/]+\/submit-review$/.test(
            path,
          ) &&
          method === "POST"
        ) {
          const id = decodeURIComponent(path.split("/")[5]!);
          envelope = await controller.submitStopPolicyForReview(
            id,
            adminIdentity,
            reqId,
          );
        } else if (
          /^\/api\/service-area\/admin\/stop-policies\/[^/]+\/publish$/.test(
            path,
          ) &&
          method === "POST"
        ) {
          const id = decodeURIComponent(path.split("/")[5]!);
          envelope = await controller.publishStopPolicy(
            id,
            (camelBody ?? {}) as PublishStopPolicyCommand,
            adminIdentity,
            reqId,
          );
        } else if (
          /^\/api\/service-area\/admin\/stop-policies\/[^/]+\/retire$/.test(
            path,
          ) &&
          method === "POST"
        ) {
          const id = decodeURIComponent(path.split("/")[5]!);
          envelope = await controller.retireStopPolicy(
            id,
            (camelBody ?? {}) as RetireStopPolicyCommand,
            adminIdentity,
            reqId,
          );
        } else {
          throw new Error(`Unhandled route in harness: ${method} ${path}`);
        }

        const serialized = deepToSnakeCase(envelope);
        return new Response(JSON.stringify(serialized), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      } catch (err) {
        const filtered = formatFilteredError(err);
        return new Response(JSON.stringify(filtered.body), {
          status: filtered.status,
          headers: { "content-type": "application/json" },
        });
      }
    },
  );

  vi.stubGlobal("fetch", fetchMock);

  const client = getPlatformAdminClient(activeBaseUrl);
  const evaluateSpy = vi.spyOn(client, "evaluateServiceArea");

  const t = (key: string, params?: Record<string, string | number>) =>
    translate(key, activeLocale, params);

  const renderPage = () =>
    render(React.createElement(ServiceAreaGovernancePage));

  return {
    locale: activeLocale,
    t,
    client,
    evaluateSpy,
    serviceAreaService,
    controller,
    auditService,
    observabilityService,
    wireRequests,
    renderPage,
  };
}

function getFieldControl(
  labelText: string,
): HTMLInputElement | HTMLSelectElement {
  const labels = screen.getAllByText(labelText);
  for (const label of labels) {
    const control = label.parentElement?.querySelector("input, select");
    if (control) {
      return control as HTMLInputElement | HTMLSelectElement;
    }
  }
  throw new Error(`Control not found for label: ${labelText}`);
}

function setField(labelText: string, value: string) {
  const control = getFieldControl(labelText);
  fireEvent.change(control, { target: { value } });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SERVICE-AREA-PREVIEW-OPTIONAL-DESTINATION-20261015: ServiceAreaGovernancePage preview input & authority boundaries", () => {
  describe("1. service-area-preview_actual-blank-destination-null-transport", () => {
    it("sends dropoff: null (never invented (0,0)) and evaluates pickup-only as serviceable when both destination fields are left blank", async () => {
      const h = createProductionHarness({ locale: "en" });
      h.renderPage();

      await screen.findByText("Taipei core operating area");

      setField(h.t("serviceAreaGov.preview.pickupLat"), "25.05");
      setField(h.t("serviceAreaGov.preview.pickupLng"), "121.55");
      // Leave dropoffLat and dropoffLng at their initial "" blank state

      fireEvent.click(
        screen.getByRole("button", { name: h.t("serviceAreaGov.preview.run") }),
      );

      await waitFor(() => {
        expect(h.evaluateSpy).toHaveBeenCalledTimes(1);
      });

      expect(h.evaluateSpy).toHaveBeenCalledWith({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 25.05, lng: 121.55 },
        dropoff: null,
      });

      const evalWire = h.wireRequests.filter(
        (req) => req.path === "/api/service-area/evaluate",
      );
      expect(evalWire).toHaveLength(1);
      expect(evalWire[0]!.camelBody).toEqual({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 25.05, lng: 121.55 },
        dropoff: null,
      });

      await screen.findByText(h.t("serviceAreaGov.decision.serviceable"));
      expect(
        screen.queryByText(h.t("serviceAreaGov.decision.not_serviceable")),
      ).toBeNull();
      expect(screen.queryByText(/DROPOFF_AREA_NOT_SERVICEABLE/)).toBeNull();
    });

    it("treats whitespace-only or cleared optional destination fields as omitted (dropoff: null) across polygon and circle service areas", async () => {
      const h = createProductionHarness({ locale: "zh" });
      h.renderPage();

      await screen.findByText("Taipei core operating area");

      setField(
        h.t("serviceAreaGov.field.product"),
        "credit_card_airport_transfer",
      );
      setField(h.t("serviceAreaGov.preview.pickupLat"), " 25.0797 ");
      setField(h.t("serviceAreaGov.preview.pickupLng"), " 121.2342 ");
      setField(h.t("serviceAreaGov.preview.dropoffLat"), "25.05");
      setField(h.t("serviceAreaGov.preview.dropoffLng"), "121.55");
      // Operator clears dropoff to whitespace
      setField(h.t("serviceAreaGov.preview.dropoffLat"), "   ");
      setField(h.t("serviceAreaGov.preview.dropoffLng"), " \t ");

      fireEvent.click(
        screen.getByRole("button", { name: h.t("serviceAreaGov.preview.run") }),
      );

      await waitFor(() => {
        expect(h.evaluateSpy).toHaveBeenCalledTimes(1);
      });

      expect(h.evaluateSpy).toHaveBeenCalledWith({
        serviceProductType: "credit_card_airport_transfer",
        pickup: { lat: 25.0797, lng: 121.2342 },
        dropoff: null,
      });

      await screen.findByText(h.t("serviceAreaGov.decision.serviceable"));
      expect(
        screen.queryByText(h.t("serviceAreaGov.preview.invalid")),
      ).toBeNull();
    });
  });

  describe("2. service-area-preview_filled-partial-and-zero-input-regressions", () => {
    it("preserves valid filled pickup and dropoff coordinates for both inside and outside destination decisions", async () => {
      const h = createProductionHarness({ locale: "en" });
      h.renderPage();

      await screen.findByText("Taipei core operating area");

      // Both pickup and dropoff inside TAIPEI_CORE
      setField(h.t("serviceAreaGov.preview.pickupLat"), "25.04");
      setField(h.t("serviceAreaGov.preview.pickupLng"), "121.55");
      setField(h.t("serviceAreaGov.preview.dropoffLat"), "25.06");
      setField(h.t("serviceAreaGov.preview.dropoffLng"), "121.56");

      fireEvent.click(
        screen.getByRole("button", { name: h.t("serviceAreaGov.preview.run") }),
      );

      await waitFor(() => {
        expect(h.evaluateSpy).toHaveBeenCalledWith({
          serviceProductType: "taxi_realtime",
          pickup: { lat: 25.04, lng: 121.55 },
          dropoff: { lat: 25.06, lng: 121.56 },
        });
      });
      await screen.findByText(h.t("serviceAreaGov.decision.serviceable"));

      // Filled dropoff outside TAIPEI_CORE (Taichung) -> not_serviceable
      setField(h.t("serviceAreaGov.preview.dropoffLat"), "24.1477");
      setField(h.t("serviceAreaGov.preview.dropoffLng"), "120.6736");

      fireEvent.click(
        screen.getByRole("button", { name: h.t("serviceAreaGov.preview.run") }),
      );

      await waitFor(() => {
        expect(h.evaluateSpy).toHaveBeenLastCalledWith({
          serviceProductType: "taxi_realtime",
          pickup: { lat: 25.04, lng: 121.55 },
          dropoff: { lat: 24.1477, lng: 120.6736 },
        });
      });
      await screen.findByText(h.t("serviceAreaGov.decision.not_serviceable"));
      await screen.findByText(/DROPOFF_AREA_NOT_SERVICEABLE/);
    });

    it("preserves explicitly entered numeric zero (0, 0.0, -0) as a real coordinate for both pickup and dropoff without inventing geographic restrictions", async () => {
      const h = createProductionHarness({ locale: "en" });
      h.renderPage();

      await screen.findByText("Taipei core operating area");

      // 1. Explicit 0,0 dropoff with Taipei pickup: sent as real {lat:0,lng:0} and evaluated by backend (outside Taipei -> DROPOFF_AREA_NOT_SERVICEABLE)
      setField(h.t("serviceAreaGov.preview.pickupLat"), "25.05");
      setField(h.t("serviceAreaGov.preview.pickupLng"), "121.55");
      setField(h.t("serviceAreaGov.preview.dropoffLat"), "0");
      setField(h.t("serviceAreaGov.preview.dropoffLng"), "-0");

      fireEvent.click(
        screen.getByRole("button", { name: h.t("serviceAreaGov.preview.run") }),
      );

      await waitFor(() => {
        expect(h.evaluateSpy).toHaveBeenCalledWith({
          serviceProductType: "taxi_realtime",
          pickup: { lat: 25.05, lng: 121.55 },
          dropoff: { lat: 0, lng: 0 },
        });
      });
      await screen.findByText(h.t("serviceAreaGov.decision.not_serviceable"));
      await screen.findByText(/DROPOFF_AREA_NOT_SERVICEABLE/);

      // 2. Publish an active boundary covering (0,0) and verify explicit 0 pickup and 0.0 dropoff evaluate as serviceable
      const { record: zeroArea } = await h.serviceAreaService.createServiceArea(
        {
          areaCode: "zero_origin_test",
          displayName: "Zero Origin Test Zone",
          geometry: {
            type: "circle",
            center: { lat: 0, lng: 0 },
            radiusMeters: 5000,
          },
          serviceProductTypes: ["taxi_realtime"],
        },
        { actorId: "admin", actorType: "platform_admin" },
      );
      await h.serviceAreaService.publishServiceArea(
        zeroArea.serviceAreaId,
        { reason: "Enable explicit zero coordinate test" },
        { actorId: "admin", actorType: "platform_admin" },
      );

      setField(h.t("serviceAreaGov.preview.pickupLat"), "0.0");
      setField(h.t("serviceAreaGov.preview.pickupLng"), "0");
      setField(h.t("serviceAreaGov.preview.dropoffLat"), " 0 ");
      setField(h.t("serviceAreaGov.preview.dropoffLng"), " 0.0 ");

      fireEvent.click(
        screen.getByRole("button", { name: h.t("serviceAreaGov.preview.run") }),
      );

      await waitFor(() => {
        expect(h.evaluateSpy).toHaveBeenLastCalledWith({
          serviceProductType: "taxi_realtime",
          pickup: { lat: 0, lng: 0 },
          dropoff: { lat: 0, lng: 0 },
        });
      });
      await screen.findByText(h.t("serviceAreaGov.decision.serviceable"));
    });

    it("rejects blank or partially entered required pickup before conversion and never sends an invented 0 point", async () => {
      const h = createProductionHarness({ locale: "en" });
      h.renderPage();

      await screen.findByText("Taipei core operating area");

      for (const [pLat, pLng] of [
        ["", ""],
        ["   ", "   "],
        ["25.05", ""],
        ["25.05", "   "],
        ["", "121.55"],
        ["   ", "121.55"],
      ] as const) {
        setField(h.t("serviceAreaGov.preview.pickupLat"), pLat);
        setField(h.t("serviceAreaGov.preview.pickupLng"), pLng);
        setField(h.t("serviceAreaGov.preview.dropoffLat"), "");
        setField(h.t("serviceAreaGov.preview.dropoffLng"), "");

        fireEvent.click(
          screen.getByRole("button", {
            name: h.t("serviceAreaGov.preview.run"),
          }),
        );

        await screen.findByText(h.t("serviceAreaGov.preview.invalid"));
        expect(h.evaluateSpy).not.toHaveBeenCalled();
        expect(
          screen.queryByText(h.t("serviceAreaGov.decision.serviceable")),
        ).toBeNull();
        expect(
          screen.queryByText(h.t("serviceAreaGov.decision.not_serviceable")),
        ).toBeNull();
      }
    });

    it("rejects partially entered optional dropoff and malformed/nonfinite coordinates without silently dropping or zeroing them", async () => {
      const h = createProductionHarness({ locale: "en" });
      h.renderPage();

      await screen.findByText("Taipei core operating area");

      for (const [pLat, pLng, dLat, dLng] of [
        // Partial dropoff pairs
        ["25.05", "121.55", "25.06", ""],
        ["25.05", "121.55", "25.06", "   "],
        ["25.05", "121.55", "", "121.56"],
        ["25.05", "121.55", "   ", "121.56"],
        // Malformed / non-finite dropoff pairs
        ["25.05", "121.55", "abc", "121.56"],
        ["25.05", "121.55", "25.06", "not-a-number"],
        ["25.05", "121.55", "NaN", "121.56"],
        ["25.05", "121.55", "25.06", "Infinity"],
        ["25.05", "121.55", "-Infinity", "121.56"],
        ["25.05", "121.55", "0x10", "121.56"],
        ["25.05", "121.55", "abc", ""],
        // Malformed / non-finite pickup pairs
        ["abc", "121.55", "", ""],
        ["25.05", "Infinity", "", ""],
        ["0x19", "121.55", "", ""],
      ] as const) {
        setField(h.t("serviceAreaGov.preview.pickupLat"), pLat);
        setField(h.t("serviceAreaGov.preview.pickupLng"), pLng);
        setField(h.t("serviceAreaGov.preview.dropoffLat"), dLat);
        setField(h.t("serviceAreaGov.preview.dropoffLng"), dLng);

        fireEvent.click(
          screen.getByRole("button", {
            name: h.t("serviceAreaGov.preview.run"),
          }),
        );

        await screen.findByText(h.t("serviceAreaGov.preview.invalid"));
        expect(h.evaluateSpy).not.toHaveBeenCalled();
        expect(
          screen.queryByText(h.t("serviceAreaGov.decision.serviceable")),
        ).toBeNull();
      }
    });

    it("surfaces honest backend INVALID_COORDINATE range errors for out-of-range finite pickup or dropoff coordinates with no fake serviceability result", async () => {
      const h = createProductionHarness({ locale: "en" });
      h.renderPage();

      await screen.findByText("Taipei core operating area");

      // Out-of-range pickup lat (95 > 90)
      setField(h.t("serviceAreaGov.preview.pickupLat"), "95");
      setField(h.t("serviceAreaGov.preview.pickupLng"), "121.55");
      setField(h.t("serviceAreaGov.preview.dropoffLat"), "");
      setField(h.t("serviceAreaGov.preview.dropoffLng"), "");

      fireEvent.click(
        screen.getByRole("button", { name: h.t("serviceAreaGov.preview.run") }),
      );

      await screen.findByText(/pickup\.lat must be between -90 and 90\./);
      expect(
        screen.queryByText(h.t("serviceAreaGov.decision.serviceable")),
      ).toBeNull();

      // Out-of-range dropoff lng (185 > 180)
      setField(h.t("serviceAreaGov.preview.pickupLat"), "25.05");
      setField(h.t("serviceAreaGov.preview.pickupLng"), "121.55");
      setField(h.t("serviceAreaGov.preview.dropoffLat"), "25.06");
      setField(h.t("serviceAreaGov.preview.dropoffLng"), "185");

      fireEvent.click(
        screen.getByRole("button", { name: h.t("serviceAreaGov.preview.run") }),
      );

      await screen.findByText(/dropoff\.lng must be between -180 and 180\./);
      expect(
        screen.queryByText(h.t("serviceAreaGov.decision.serviceable")),
      ).toBeNull();
    });
  });

  describe("3. service-area-preview_original-geometry-time-stop-authority-boundaries", () => {
    it("preserves UI create -> submitReview -> publish -> retire lifecycle, audit receipt, and polygon/circle/stop-policy evaluation boundaries", async () => {
      const h = createProductionHarness({ locale: "en" });
      h.renderPage();

      await screen.findByText("Taipei core operating area");

      // Import a valid polygon into GeometryEditor for Kaohsiung harbor test zone
      const importTextarea = screen.getByPlaceholderText(
        /Paste GeoJSON Feature \/ FeatureCollection \/ Geometry here\./i,
      );
      fireEvent.change(importTextarea, {
        target: {
          value: JSON.stringify({
            type: "Polygon",
            coordinates: [
              [
                [120.28, 22.61],
                [120.32, 22.61],
                [120.32, 22.65],
                [120.28, 22.65],
                [120.28, 22.61],
              ],
            ],
          }),
        },
      });
      fireEvent.click(screen.getByRole("button", { name: /Apply import/i }));

      setField(h.t("serviceAreaGov.field.code"), "kaohsiung_harbor");
      setField(h.t("serviceAreaGov.field.name"), "Kaohsiung Harbor Area");
      setField(
        h.t("serviceAreaGov.field.publishReason"),
        "Southern port rollout",
      );

      const createBtn = screen.getByRole("button", {
        name: h.t("serviceAreaGov.action.createDraft"),
      });
      await waitFor(() => {
        expect((createBtn as HTMLButtonElement).disabled).toBe(false);
      });
      fireEvent.click(createBtn);

      await screen.findByText("Kaohsiung Harbor Area");
      await screen.findByText(/serviceArea v1 · draft/);

      // Submit review -> Publish
      const row = screen
        .getByText("Kaohsiung Harbor Area")
        .closest("tr") as HTMLTableRowElement;
      fireEvent.click(
        within(row).getByRole("button", {
          name: h.t("serviceAreaGov.action.submitReview"),
        }),
      );
      await screen.findByText(/serviceArea v1 · review/);

      const reviewRow = screen
        .getByText("Kaohsiung Harbor Area")
        .closest("tr") as HTMLTableRowElement;
      fireEvent.click(
        within(reviewRow).getByRole("button", {
          name: h.t("serviceAreaGov.action.publish"),
        }),
      );
      await screen.findByText(/serviceArea v1 · active/);

      // Switch to Stop policy mode and verify stop policy evaluation & direction sensitivity
      fireEvent.click(
        screen.getByRole("button", {
          name: h.t("serviceAreaGov.mode.stopPolicy"),
        }),
      );
      await screen.findByText("Taipei station pickup curb restriction");

      // Pickup inside TPE_STATION_PICKUP_BLOCK (25.0478, 121.517) with filled dropoff inside Taipei -> not_serviceable (PICKUP_NOT_ALLOWED)
      setField(h.t("serviceAreaGov.preview.pickupLat"), "25.0478");
      setField(h.t("serviceAreaGov.preview.pickupLng"), "121.517");
      setField(h.t("serviceAreaGov.preview.dropoffLat"), "25.05");
      setField(h.t("serviceAreaGov.preview.dropoffLng"), "121.55");
      fireEvent.click(
        screen.getByRole("button", { name: h.t("serviceAreaGov.preview.run") }),
      );
      await screen.findByText(h.t("serviceAreaGov.decision.not_serviceable"));
      await screen.findByText(/PICKUP_NOT_ALLOWED/);

      // Pickup inside XINYI_HOSPITAL_MANUAL_REVIEW (25.0338, 121.5645) -> manual_review (STOP_REQUIRES_MANUAL_REVIEW)
      setField(h.t("serviceAreaGov.preview.pickupLat"), "25.0338");
      setField(h.t("serviceAreaGov.preview.pickupLng"), "121.5645");
      fireEvent.click(
        screen.getByRole("button", { name: h.t("serviceAreaGov.preview.run") }),
      );
      await screen.findByText(/STOP_REQUIRES_MANUAL_REVIEW/);

      // Switch back to boundary mode and retire Kaohsiung Harbor Area
      fireEvent.click(
        screen.getByRole("button", {
          name: h.t("serviceAreaGov.mode.boundary"),
        }),
      );
      const activeRow = (
        await screen.findByText("Kaohsiung Harbor Area")
      ).closest("tr") as HTMLTableRowElement;
      fireEvent.click(
        within(activeRow).getByRole("button", {
          name: h.t("serviceAreaGov.action.retire"),
        }),
      );
      await screen.findByText(/serviceArea v1 · retired/);
    });

    it("surfaces top-level definitions load error honestly without crashing", async () => {
      const h = createProductionHarness({
        locale: "en",
        definitionsFailure: "Service-area authority temporarily unavailable",
      });
      h.renderPage();

      await screen.findByText(/Service-area authority temporarily unavailable/);
    });
  });
});
