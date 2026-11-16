// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import React, { act } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "@drts/api-client";
import * as contracts from "@drts/contracts";
import type {
  ApiSuccessEnvelope,
  IncidentRecord,
  ResourceActionDescriptor,
  UpdateIncidentCommand,
} from "@drts/contracts";
import * as uiWeb from "@drts/ui-web";
import type { IncidentDetailActionPanel as IncidentDetailActionPanelType } from "../../app/incidents/[incidentId]/incident-detail-action-panel";
import * as apiClientLib from "../../lib/api-client";
import * as localizedLabelsLib from "../../lib/localized-labels";
import * as translationsLib from "../../lib/translations";

const { t: translate } = translationsLib;

const navState = {
  searchParams: new URLSearchParams(),
  replace: vi.fn(),
  refresh: vi.fn(),
};

vi.mock("../../../../packages/contracts/src/unattended-voice", () => ({}));
vi.mock(
  "../../../../packages/contracts/src/voice-callback-operations",
  () => ({}),
);

vi.mock("next/navigation", () => ({
  useSearchParams: () => navState.searchParams,
  useRouter: () => ({
    replace: navState.replace,
    refresh: navState.refresh,
  }),
}));

function loadActualActionPanel(): typeof IncidentDetailActionPanelType {
  const here = dirname(fileURLToPath(import.meta.url));
  const panelPath = resolve(
    here,
    "../../app/incidents/[incidentId]/incident-detail-action-panel.tsx",
  );
  const source = readFileSync(panelPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    fileName: panelPath,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;

  const moduleTable: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "next/navigation": {
      useSearchParams: () => navState.searchParams,
      useRouter: () => ({
        replace: navState.replace,
        refresh: navState.refresh,
      }),
    },
    "@drts/contracts": contracts,
    "@drts/ui-web": uiWeb,
    "@/components/ops-assistant": {
      // The action bridge is a no-op outside its provider; the panel's
      // confirm/cancel buttons and ApiClient call are what this suite
      // exercises, not the assistant deep-link wiring.
      useAssistantActionBridgeRegistration: () => {},
    },
    "@/lib/api-client": apiClientLib,
    "@/lib/localized-labels": localizedLabelsLib,
    "@/lib/translations": translationsLib,
  };

  const mod = {
    exports: {} as {
      IncidentDetailActionPanel: typeof IncidentDetailActionPanelType;
    },
  };
  const customRequire = (id: string): unknown => {
    if (id in moduleTable) {
      return moduleTable[id];
    }
    throw new Error(
      `Unexpected module import in IncidentDetailActionPanel: ${id}`,
    );
  };
  new Function("require", "module", "exports", transpiled)(
    customRequire,
    mod,
    mod.exports,
  );
  return mod.exports.IncidentDetailActionPanel;
}

type RecordedCall = {
  method: string;
  path: string;
  body: unknown;
};

function makeSuccessEnvelope<T>(
  data: T,
  requestId: string,
): ApiSuccessEnvelope<T> {
  return {
    data,
    meta: {
      requestId,
      timestamp: "2026-11-14T10:00:00.000Z",
    },
  };
}

function makeIncident(overrides: Partial<IncidentRecord> = {}): IncidentRecord {
  return {
    incidentId: "INC-000601",
    title: "Vehicle collision at intersection",
    description: "Minor collision during passenger drop-off",
    category: "vehicle_damage",
    severity: "medium",
    status: "open",
    relatedOrderId: null,
    relatedVehicleId: null,
    relatedDriverId: null,
    relatedComplaintCaseNo: null,
    reportedBy: "driver-601",
    assignedTo: null,
    escalationTarget: null,
    sourceDispatchExceptionOrderId: null,
    occurredAt: null,
    location: null,
    resolutionNote: null,
    createdAt: "2026-11-14T09:00:00.000Z",
    updatedAt: "2026-11-14T09:00:00.000Z",
    ...overrides,
  } as IncidentRecord;
}

const UPDATE_ACTION: ResourceActionDescriptor = {
  action: "update_incident",
  enabled: true,
  requiresReason: false,
  riskLevel: "low",
};

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function flushAsync(cycles = 6) {
  for (let i = 0; i < cycles; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mountPanel(
  props: Omit<
    React.ComponentProps<typeof IncidentDetailActionPanelType>,
    never
  >,
) {
  const Panel = loadActualActionPanel();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    flushSync(() => {
      root!.render(React.createElement(Panel, props));
    });
  });
  await flushAsync(8);
  return host;
}

function findButtonByText(
  container: HTMLElement,
  label: string,
): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll("button"));
  const exact = buttons.find((btn) => btn.textContent?.trim() === label.trim());
  if (exact) return exact;
  const partial = buttons.find((btn) =>
    btn.textContent?.includes(label.trim()),
  );
  if (!partial) {
    throw new Error(
      `Button "${label}" not found. Available buttons: ${buttons
        .map((b) => JSON.stringify(b.textContent?.trim()))
        .join(", ")}`,
    );
  }
  return partial;
}

function findFieldControl<
  T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
>(container: HTMLElement, labelText: string): T {
  const labels = Array.from(container.querySelectorAll("label"));
  const matched = labels.find(
    (lbl) => lbl.textContent?.replace("*", "").trim() === labelText.trim(),
  );
  if (!matched || !matched.parentElement) {
    throw new Error(
      `Field label "${labelText}" not found. Available labels: ${labels
        .map((l) => JSON.stringify(l.textContent?.replace("*", "").trim()))
        .join(", ")}`,
    );
  }
  const control = matched.parentElement.querySelector<T>(
    "input, select, textarea",
  );
  if (!control) {
    throw new Error(`No control found under label "${labelText}"`);
  }
  return control;
}

async function setControlValue(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
) {
  await act(async () => {
    const proto =
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function clickElement(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
  await flushAsync(8);
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  navState.searchParams = new URLSearchParams();
  navState.replace.mockReset();
  navState.refresh.mockReset();
  window.__DRTS_RUNTIME_CONFIG__ = {
    apiBaseUrl: "http://incident-category-unit.invalid",
  };
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  if (host) {
    host.remove();
    host = null;
  }
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.each(["en", "zh"] as const)(
  "IncidentDetailActionPanel category update (%s)",
  (locale) => {
    it("serializes the selected category through the real ApiClient PATCH and reads it back on the same incident", async () => {
      let backing = makeIncident({ category: "vehicle_damage" });
      const calls: RecordedCall[] = [];

      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(
            String(input),
            "http://incident-category-unit.invalid",
          );
          const method = (init?.method ?? "GET").toUpperCase();
          const body = init?.body ? JSON.parse(String(init.body)) : undefined;
          calls.push({ method, path: url.pathname, body });

          if (
            method === "GET" &&
            url.pathname === `/api/incidents/${backing.incidentId}`
          ) {
            return Response.json(
              makeSuccessEnvelope(backing, "req-incident-get"),
            );
          }

          if (
            method === "PATCH" &&
            url.pathname === `/api/incidents/${backing.incidentId}`
          ) {
            const cmd = body as UpdateIncidentCommand;
            backing = {
              ...backing,
              status: cmd.status ?? backing.status,
              severity: cmd.severity ?? backing.severity,
              category: cmd.category ?? backing.category,
              escalationTarget:
                cmd.escalationTarget !== undefined
                  ? cmd.escalationTarget
                  : backing.escalationTarget,
              updatedAt: "2026-11-14T10:05:00.000Z",
            };
            return Response.json(
              makeSuccessEnvelope(backing, "req-incident-update"),
            );
          }

          throw new Error(`Unexpected ${method} ${url.pathname}`);
        },
      );
      vi.stubGlobal("fetch", fetchMock);

      const opsClient = apiClientLib.getOpsClient();
      expect(opsClient).toBeInstanceOf(ApiClient);
      const typeCheckUpdate: (
        incidentId: string,
        command: UpdateIncidentCommand,
      ) => ReturnType<typeof opsClient.updateIncident> =
        opsClient.updateIncident.bind(opsClient);
      expect(typeof typeCheckUpdate).toBe("function");

      const container = await mountPanel({
        incidentId: backing.incidentId,
        locale,
        availableActions: [UPDATE_ACTION],
        initialIntent: "update",
        initialStatus: backing.status,
        initialCategory: backing.category,
        initialSeverity: backing.severity,
        initialAssignedTo: null,
        initialEscalationTarget: null,
        initialResolutionNote: null,
        latestAuditHref: null,
      });

      await setControlValue(
        findFieldControl<HTMLSelectElement>(
          container,
          translate("incidents.form.category", locale),
        ),
        "property_damage",
      );

      await clickElement(
        findButtonByText(
          container,
          translate("incidents.detail.actionPanel.confirmAction", locale, {
            action: translate("incidents.detail.action.update", locale),
          }),
        ),
      );

      const patchCalls = calls.filter(
        (c) =>
          c.method === "PATCH" &&
          c.path === `/api/incidents/${backing.incidentId}`,
      );
      expect(patchCalls).toEqual([
        {
          method: "PATCH",
          path: `/api/incidents/${backing.incidentId}`,
          body: {
            status: "open",
            severity: "medium",
            category: "property_damage",
            escalationTarget: null,
          },
        },
      ]);

      expect(container.textContent).toContain(
        translate("incidents.detail.actionPanel.completedTitle", locale, {
          title: translate("incidents.detail.action.update", locale),
        }),
      );
      expect(container.textContent).not.toContain("undefined");

      expect(navState.refresh).toHaveBeenCalledTimes(1);
      expect(navState.replace).toHaveBeenCalledWith(
        `/incidents/${backing.incidentId}`,
      );

      // Same-ID readback: the backend's own record now carries the new
      // category, proving the mutation persisted rather than UI-only state.
      const readBack = await opsClient.getIncident(backing.incidentId);
      expect(readBack.incidentId).toBe(backing.incidentId);
      expect(readBack.category).toBe("property_damage");
    });

    it("preserves the current category when the operator submits without touching the category field", async () => {
      let backing = makeIncident({ category: "traffic", severity: "low" });
      const calls: RecordedCall[] = [];

      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(
            String(input),
            "http://incident-category-unit.invalid",
          );
          const method = (init?.method ?? "GET").toUpperCase();
          const body = init?.body ? JSON.parse(String(init.body)) : undefined;
          calls.push({ method, path: url.pathname, body });

          if (
            method === "PATCH" &&
            url.pathname === `/api/incidents/${backing.incidentId}`
          ) {
            const cmd = body as UpdateIncidentCommand;
            backing = {
              ...backing,
              status: cmd.status ?? backing.status,
              severity: cmd.severity ?? backing.severity,
              category: cmd.category ?? backing.category,
              updatedAt: "2026-11-14T10:06:00.000Z",
            };
            return Response.json(
              makeSuccessEnvelope(backing, "req-incident-update-preserve"),
            );
          }

          throw new Error(`Unexpected ${method} ${url.pathname}`);
        },
      );
      vi.stubGlobal("fetch", fetchMock);

      const container = await mountPanel({
        incidentId: backing.incidentId,
        locale,
        availableActions: [UPDATE_ACTION],
        initialIntent: "update",
        initialStatus: backing.status,
        initialCategory: backing.category,
        initialSeverity: backing.severity,
        initialAssignedTo: null,
        initialEscalationTarget: null,
        initialResolutionNote: null,
        latestAuditHref: null,
      });

      await setControlValue(
        findFieldControl<HTMLSelectElement>(
          container,
          translate("incidents.form.severity", locale),
        ),
        "high",
      );

      await clickElement(
        findButtonByText(
          container,
          translate("incidents.detail.actionPanel.confirmAction", locale, {
            action: translate("incidents.detail.action.update", locale),
          }),
        ),
      );

      const patchCalls = calls.filter(
        (c) =>
          c.method === "PATCH" &&
          c.path === `/api/incidents/${backing.incidentId}`,
      );
      expect(patchCalls).toHaveLength(1);
      expect(patchCalls[0]!.body).toMatchObject({
        severity: "high",
        category: "traffic",
      });
      expect(backing.category).toBe("traffic");
    });

    it("preserves existing error handling when the PATCH is rejected, without fabricating a receipt", async () => {
      const backing = makeIncident({ category: "safety" });
      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(
            String(input),
            "http://incident-category-unit.invalid",
          );
          const method = (init?.method ?? "GET").toUpperCase();

          if (
            method === "PATCH" &&
            url.pathname === `/api/incidents/${backing.incidentId}`
          ) {
            return Response.json(
              {
                error: {
                  code: "INCIDENT_ASSIGNMENT_CONFLICT",
                  message: `Incident ${backing.incidentId} is already assigned to ops-user-999.`,
                  retryable: false,
                  traceId: "trace-incident-update-reject",
                },
              },
              { status: 409 },
            );
          }

          throw new Error(`Unexpected ${method} ${url.pathname}`);
        },
      );
      vi.stubGlobal("fetch", fetchMock);

      const container = await mountPanel({
        incidentId: backing.incidentId,
        locale,
        availableActions: [UPDATE_ACTION],
        initialIntent: "update",
        initialStatus: backing.status,
        initialCategory: backing.category,
        initialSeverity: backing.severity,
        initialAssignedTo: null,
        initialEscalationTarget: null,
        initialResolutionNote: null,
        latestAuditHref: null,
      });

      await setControlValue(
        findFieldControl<HTMLSelectElement>(
          container,
          translate("incidents.form.category", locale),
        ),
        "operational",
      );

      await clickElement(
        findButtonByText(
          container,
          translate("incidents.detail.actionPanel.confirmAction", locale, {
            action: translate("incidents.detail.action.update", locale),
          }),
        ),
      );

      expect(container.textContent).toContain(
        `Incident ${backing.incidentId} is already assigned to ops-user-999.`,
      );
      expect(container.textContent).not.toContain(
        translate("incidents.detail.actionPanel.completedTitle", locale, {
          title: translate("incidents.detail.action.update", locale),
        }),
      );
      expect(navState.refresh).not.toHaveBeenCalled();
    });
  },
);
