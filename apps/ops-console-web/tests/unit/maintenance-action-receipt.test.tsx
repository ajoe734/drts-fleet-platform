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
  ActionReceipt,
  ApiSuccessEnvelope,
  CreateMaintenanceRecordCommand,
  MaintenanceRecord,
  UpdateMaintenanceRecordCommand,
} from "@drts/contracts";
import * as uiWeb from "@drts/ui-web";
import type MaintenancePageType from "../../app/maintenance/page";
import * as apiClientLib from "../../lib/api-client";
import * as i18nLib from "../../lib/i18n";
import * as localizedLabelsLib from "../../lib/localized-labels";
import * as opsAnalyticsLib from "../../lib/ops-analytics";
import * as translationsLib from "../../lib/translations";

const { LanguageProvider } = i18nLib;
const { t: translate } = translationsLib;
type Locale = translationsLib.Locale;

const navState = {
  searchParams: new URLSearchParams(),
  refresh: vi.fn(),
  push: vi.fn(),
};

vi.mock("../../../../packages/contracts/src/unattended-voice", () => ({}));
vi.mock(
  "../../../../packages/contracts/src/voice-callback-operations",
  () => ({}),
);

vi.mock("next/navigation", () => ({
  useSearchParams: () => navState.searchParams,
  useRouter: () => ({
    refresh: navState.refresh,
    push: navState.push,
  }),
}));

function loadActualMaintenancePage(): typeof MaintenancePageType {
  const here = dirname(fileURLToPath(import.meta.url));
  const pagePath = resolve(here, "../../app/maintenance/page.tsx");
  const source = readFileSync(pagePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    fileName: pagePath,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;

  const NextLink = ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("a", { href: String(href), ...rest }, children);

  const moduleTable: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "next/link": { __esModule: true, default: NextLink },
    "next/navigation": {
      useSearchParams: () => navState.searchParams,
      useRouter: () => ({
        refresh: navState.refresh,
        push: navState.push,
      }),
    },
    "@drts/ui-web": uiWeb,
    "@drts/contracts": contracts,
    "@/lib/api-client": apiClientLib,
    "../../lib/api-client": apiClientLib,
    "@/lib/i18n": i18nLib,
    "../../lib/i18n": i18nLib,
    "@/lib/ops-analytics": opsAnalyticsLib,
    "../../lib/ops-analytics": opsAnalyticsLib,
    "@/lib/localized-labels": localizedLabelsLib,
    "../../lib/localized-labels": localizedLabelsLib,
    "@/lib/translations": translationsLib,
    "../../lib/translations": translationsLib,
  };

  const mod = { exports: {} as { default: typeof MaintenancePageType } };
  const customRequire = (id: string): unknown => {
    if (id in moduleTable) {
      return moduleTable[id];
    }
    throw new Error(`Unexpected module import in MaintenancePage: ${id}`);
  };
  new Function("require", "module", "exports", transpiled)(
    customRequire,
    mod,
    mod.exports,
  );
  return mod.exports.default;
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

function makeInitialRecords(): MaintenanceRecord[] {
  return [
    {
      maintenanceId: "MNT-000501",
      vehicleId: "VEH-501",
      type: "scheduled_service",
      description: "10,000 km scheduled check",
      status: "scheduled",
      scheduledAt: "2099-12-01T08:00:00.000Z",
      completedAt: null,
      technician: "Tech Wang",
      cost: 3200,
      notes: "Initial bay booking",
      createdAt: "2026-11-10T08:00:00.000Z",
      updatedAt: "2026-11-10T08:00:00.000Z",
    },
  ];
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function flushAsync(cycles = 6) {
  for (let i = 0; i < cycles; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mountPage(locale: Locale) {
  const MaintenancePage = loadActualMaintenancePage();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    flushSync(() => {
      root!.render(
        <LanguageProvider defaultLocale={locale}>
          <MaintenancePage />
        </LanguageProvider>,
      );
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
  localStorage.clear();
  navState.searchParams = new URLSearchParams();
  navState.refresh.mockReset();
  navState.push.mockReset();
  window.__DRTS_RUNTIME_CONFIG__ = {
    apiBaseUrl: "http://maintenance-unit.invalid",
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
  "MaintenancePage real ActionReceipt consumption (%s)",
  (locale) => {
    it("creates a work order using the real ActionReceipt resourceId/actionId/auditId, refreshes the list, and supports filtering", async () => {
      const records = makeInitialRecords();
      const calls: RecordedCall[] = [];
      const createdReceipt: ActionReceipt = {
        actionId: "req-maint-create-701",
        auditId: "70170170-1701-4701-8701-701701701701",
        resourceType: "maintenance_log",
        resourceId: "MNT-000701",
        status: "completed",
        message: "Maintenance log created.",
      };

      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(String(input), "http://maintenance-unit.invalid");
          const method = (init?.method ?? "GET").toUpperCase();
          const body = init?.body ? JSON.parse(String(init.body)) : undefined;
          calls.push({ method, path: url.pathname, body });

          if (method === "GET" && url.pathname === "/api/maintenance") {
            return Response.json(
              makeSuccessEnvelope(
                { items: records.map((r) => ({ ...r })) },
                "req-maint-list",
              ),
            );
          }

          if (method === "POST" && url.pathname === "/api/maintenance") {
            const cmd = body as CreateMaintenanceRecordCommand;
            records.unshift({
              maintenanceId: createdReceipt.resourceId,
              vehicleId: cmd.vehicleId,
              type: cmd.type,
              description: cmd.description,
              status: "scheduled",
              scheduledAt: cmd.scheduledAt ?? "2099-12-10T09:30:00.000Z",
              completedAt: null,
              technician: cmd.technician ?? null,
              cost: cmd.cost ?? null,
              notes: cmd.notes ?? null,
              createdAt: "2026-11-14T10:00:00.000Z",
              updatedAt: "2026-11-14T10:00:00.000Z",
            });
            return Response.json(
              makeSuccessEnvelope(createdReceipt, createdReceipt.actionId),
            );
          }

          throw new Error(`Unexpected ${method} ${url.pathname}`);
        },
      );
      vi.stubGlobal("fetch", fetchMock);

      const opsClient = apiClientLib.getOpsClient();
      expect(opsClient).toBeInstanceOf(ApiClient);
      const typeCheckCreate: (
        command: CreateMaintenanceRecordCommand,
      ) => Promise<ActionReceipt> = opsClient.createMaintenance.bind(opsClient);
      expect(typeof typeCheckCreate).toBe("function");

      const container = await mountPage(locale);
      expect(container.textContent).toContain("MNT-000501");

      await clickElement(
        findButtonByText(container, translate("maintenance.createBtn", locale)),
      );

      await setControlValue(
        findFieldControl<HTMLInputElement>(
          container,
          translate("maintenance.form.vehicle", locale),
        ),
        "VEH-701",
      );
      await setControlValue(
        findFieldControl<HTMLSelectElement>(
          container,
          translate("maintenance.form.type", locale),
        ),
        "repair",
      );
      await setControlValue(
        findFieldControl<HTMLInputElement>(
          container,
          translate("maintenance.form.scheduledAt", locale),
        ),
        "2099-12-10T09:30",
      );
      await setControlValue(
        findFieldControl<HTMLTextAreaElement>(
          container,
          translate("maintenance.form.description", locale),
        ),
        "Replace front brake pads",
      );
      await setControlValue(
        findFieldControl<HTMLInputElement>(
          container,
          translate("maintenance.form.technician", locale),
        ),
        "Master Lin",
      );
      await setControlValue(
        findFieldControl<HTMLInputElement>(
          container,
          translate("maintenance.form.costTwd", locale),
        ),
        "4500",
      );
      await setControlValue(
        findFieldControl<HTMLTextAreaElement>(
          container,
          translate("maintenance.form.notes", locale),
        ),
        "OEM parts",
      );

      await clickElement(
        findButtonByText(
          container,
          translate("maintenance.form.createRecord", locale),
        ),
      );

      expect(
        calls.filter(
          (c) => c.method === "POST" && c.path === "/api/maintenance",
        ),
      ).toEqual([
        {
          method: "POST",
          path: "/api/maintenance",
          body: {
            vehicleId: "VEH-701",
            type: "repair",
            description: "Replace front brake pads",
            scheduledAt: new Date("2099-12-10T09:30").toISOString(),
            technician: "Master Lin",
            cost: 4500,
            notes: "OEM parts",
          },
        },
      ]);

      expect(container.textContent).toContain(
        translate("maintenance.toast.created", locale, {
          id: "MNT-000701",
        }),
      );
      expect(container.textContent).toContain(
        translate("maintenance.toast.receipt", locale, {
          actionId: "req-maint-create-701",
          auditId: "70170170-1701-4701-8701-701701701701",
        }),
      );
      expect(container.textContent).not.toContain("undefined");
      expect(container.textContent).not.toContain("act_undefined");
      expect(container.textContent).not.toContain("audit_undefined");
      expect(container.textContent).not.toContain("act_MNT-000701");
      expect(container.textContent).not.toContain("audit_MNT-000701");

      expect(
        calls.filter((c) => c.method === "GET" && c.path === "/api/maintenance")
          .length,
      ).toBeGreaterThanOrEqual(2);
      expect(container.textContent).toContain("VEH-701");
      expect(container.textContent).toContain("Master Lin");

      // Verify filter toggle and search query on the refreshed list
      await clickElement(
        findButtonByText(
          container,
          translate("maintenance.filter.title", locale),
        ),
      );
      await setControlValue(
        findFieldControl<HTMLInputElement>(
          container,
          translate("common.search", locale),
        ),
        "VEH-701",
      );
      await flushAsync(4);
      expect(container.textContent).toContain("MNT-000701");
      expect(container.textContent).not.toContain("MNT-000501");
    });

    it("edits a work order using the real ActionReceipt actionId/auditId/resourceId, refreshes the list, and preserves 15s polling", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const records = makeInitialRecords();
      const calls: RecordedCall[] = [];
      const editReceipt: ActionReceipt = {
        actionId: "req-maint-edit-501",
        auditId: "50150150-1501-4501-8501-501501501501",
        resourceType: "maintenance_log",
        resourceId: "MNT-000501",
        status: "completed",
        message: "Maintenance log updated.",
      };

      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(String(input), "http://maintenance-unit.invalid");
          const method = (init?.method ?? "GET").toUpperCase();
          const body = init?.body ? JSON.parse(String(init.body)) : undefined;
          calls.push({ method, path: url.pathname, body });

          if (method === "GET" && url.pathname === "/api/maintenance") {
            return Response.json(
              makeSuccessEnvelope(
                { items: records.map((r) => ({ ...r })) },
                "req-maint-list",
              ),
            );
          }

          if (
            method === "PATCH" &&
            url.pathname === "/api/maintenance/MNT-000501"
          ) {
            const cmd = body as UpdateMaintenanceRecordCommand;
            records[0] = {
              ...records[0]!,
              status: cmd.status ?? records[0]!.status,
              technician: cmd.technician ?? records[0]!.technician,
              cost: cmd.cost ?? records[0]!.cost,
              notes: cmd.notes ?? records[0]!.notes,
              updatedAt: "2026-11-14T10:05:00.000Z",
            };
            return Response.json(
              makeSuccessEnvelope(editReceipt, editReceipt.actionId),
            );
          }

          throw new Error(`Unexpected ${method} ${url.pathname}`);
        },
      );
      vi.stubGlobal("fetch", fetchMock);

      const opsClient = apiClientLib.getOpsClient();
      const typeCheckUpdate: (
        maintenanceId: string,
        command: UpdateMaintenanceRecordCommand,
      ) => Promise<ActionReceipt> = opsClient.updateMaintenance.bind(opsClient);
      expect(typeof typeCheckUpdate).toBe("function");

      const container = await mountPage(locale);
      await clickElement(
        findButtonByText(
          container,
          translate("maintenance.action.edit", locale),
        ),
      );

      await setControlValue(
        findFieldControl<HTMLInputElement>(
          container,
          translate("maintenance.form.technician", locale),
        ),
        "Tech Chen",
      );
      await setControlValue(
        findFieldControl<HTMLInputElement>(
          container,
          translate("maintenance.form.costTwd", locale),
        ),
        "6200",
      );
      await setControlValue(
        findFieldControl<HTMLTextAreaElement>(
          container,
          translate("maintenance.form.notes", locale),
        ),
        "Updated inspection scope",
      );

      await clickElement(
        findButtonByText(
          container,
          translate("maintenance.form.saveChanges", locale),
        ),
      );

      expect(
        calls.filter(
          (c) =>
            c.method === "PATCH" && c.path === "/api/maintenance/MNT-000501",
        ),
      ).toEqual([
        {
          method: "PATCH",
          path: "/api/maintenance/MNT-000501",
          body: {
            status: "scheduled",
            technician: "Tech Chen",
            cost: 6200,
            notes: "Updated inspection scope",
          },
        },
      ]);

      expect(container.textContent).toContain(
        translate("maintenance.toast.updated", locale, {
          id: "MNT-000501",
        }),
      );
      expect(container.textContent).toContain(
        translate("maintenance.toast.receipt", locale, {
          actionId: "req-maint-edit-501",
          auditId: "50150150-1501-4501-8501-501501501501",
        }),
      );
      expect(container.textContent).not.toContain("act_MNT-000501");
      expect(container.textContent).not.toContain("audit_MNT-000501");
      expect(container.textContent).toContain("Tech Chen");

      const readsBeforePoll = calls.filter(
        (c) => c.method === "GET" && c.path === "/api/maintenance",
      ).length;
      await act(async () => {
        vi.advanceTimersByTime(15_000);
      });
      await flushAsync(4);
      const readsAfterPoll = calls.filter(
        (c) => c.method === "GET" && c.path === "/api/maintenance",
      ).length;
      expect(readsAfterPoll).toBeGreaterThan(readsBeforePoll);
    });

    it("completes a work order with confirmation reason, consumes the real ActionReceipt, and refreshes list", async () => {
      const records = makeInitialRecords();
      const calls: RecordedCall[] = [];
      const completeReceipt: ActionReceipt = {
        actionId: "req-maint-complete-501",
        auditId: "90190190-1901-4901-8901-901901901901",
        resourceType: "maintenance_log",
        resourceId: "MNT-000501",
        status: "completed",
        message: "Maintenance log updated.",
      };

      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(String(input), "http://maintenance-unit.invalid");
          const method = (init?.method ?? "GET").toUpperCase();
          const body = init?.body ? JSON.parse(String(init.body)) : undefined;
          calls.push({ method, path: url.pathname, body });

          if (method === "GET" && url.pathname === "/api/maintenance") {
            return Response.json(
              makeSuccessEnvelope(
                { items: records.map((r) => ({ ...r })) },
                "req-maint-list",
              ),
            );
          }

          if (
            method === "PATCH" &&
            url.pathname === "/api/maintenance/MNT-000501"
          ) {
            const cmd = body as UpdateMaintenanceRecordCommand;
            records[0] = {
              ...records[0]!,
              status: cmd.status ?? "completed",
              notes: cmd.notes ?? records[0]!.notes,
              completedAt: "2026-11-14T10:10:00.000Z",
              updatedAt: "2026-11-14T10:10:00.000Z",
            };
            return Response.json(
              makeSuccessEnvelope(completeReceipt, completeReceipt.actionId),
            );
          }

          throw new Error(`Unexpected ${method} ${url.pathname}`);
        },
      );
      vi.stubGlobal("fetch", fetchMock);

      const container = await mountPage(locale);
      await clickElement(
        findButtonByText(
          container,
          translate("maintenance.action.complete", locale),
        ),
      );

      expect(container.textContent).toContain(
        translate("maintenance.confirm.title", locale),
      );

      await setControlValue(
        findFieldControl<HTMLTextAreaElement>(
          container,
          translate("maintenance.confirm.note", locale),
        ),
        "Torque verified and road tested",
      );

      await clickElement(
        findButtonByText(
          container,
          translate("maintenance.confirm.action", locale),
        ),
      );

      expect(
        calls.filter(
          (c) =>
            c.method === "PATCH" && c.path === "/api/maintenance/MNT-000501",
        ),
      ).toEqual([
        {
          method: "PATCH",
          path: "/api/maintenance/MNT-000501",
          body: {
            status: "completed",
            notes: "Torque verified and road tested",
          },
        },
      ]);

      expect(container.textContent).toContain(
        translate("maintenance.toast.completed", locale, {
          id: "MNT-000501",
        }),
      );
      expect(container.textContent).toContain(
        translate("maintenance.toast.receipt", locale, {
          actionId: "req-maint-complete-501",
          auditId: "90190190-1901-4901-8901-901901901901",
        }),
      );
      expect(container.textContent).not.toContain("act_MNT-000501");
      expect(container.textContent).not.toContain("audit_MNT-000501");

      await clickElement(
        findButtonByText(
          container,
          translate("maintenance.tab.completed", locale),
        ),
      );
      expect(container.textContent).toContain("MNT-000501");
    });

    it("preserves failure handling on rejected POST and PATCH mutations without fabricating receipt IDs", async () => {
      const records = makeInitialRecords();
      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(String(input), "http://maintenance-unit.invalid");
          const method = (init?.method ?? "GET").toUpperCase();

          if (method === "GET" && url.pathname === "/api/maintenance") {
            return Response.json(
              makeSuccessEnvelope(
                { items: records.map((r) => ({ ...r })) },
                "req-maint-list",
              ),
            );
          }

          if (method === "POST" && url.pathname === "/api/maintenance") {
            return Response.json(
              {
                error: {
                  code: "VEHICLE_LOCKED",
                  message: "Vehicle VEH-999 is locked for safety hold",
                  retryable: false,
                  traceId: "trace-create-reject",
                },
              },
              { status: 400 },
            );
          }

          if (
            method === "PATCH" &&
            url.pathname === "/api/maintenance/MNT-000501"
          ) {
            return Response.json(
              {
                error: {
                  code: "BAY_LOCKED",
                  message:
                    "Work order MNT-000501 cannot transition while bay is locked",
                  retryable: false,
                  traceId: "trace-complete-reject",
                },
              },
              { status: 409 },
            );
          }

          throw new Error(`Unexpected ${method} ${url.pathname}`);
        },
      );
      vi.stubGlobal("fetch", fetchMock);

      const container = await mountPage(locale);

      // 1. Rejected create
      await clickElement(
        findButtonByText(container, translate("maintenance.createBtn", locale)),
      );
      await setControlValue(
        findFieldControl<HTMLInputElement>(
          container,
          translate("maintenance.form.vehicle", locale),
        ),
        "VEH-999",
      );
      await setControlValue(
        findFieldControl<HTMLTextAreaElement>(
          container,
          translate("maintenance.form.description", locale),
        ),
        "Blocked repair attempt",
      );
      await clickElement(
        findButtonByText(
          container,
          translate("maintenance.form.createRecord", locale),
        ),
      );

      const dash = translate("common.dash", locale);
      expect(container.textContent).toContain(
        "Vehicle VEH-999 is locked for safety hold",
      );
      expect(container.textContent).toContain(
        translate("maintenance.toast.receipt", locale, {
          actionId: dash,
          auditId: dash,
        }),
      );
      expect(container.textContent).not.toContain(
        translate("maintenance.toast.created", locale, { id: "MNT-000501" }),
      );
      expect(container.textContent).not.toContain("act_");
      expect(container.textContent).not.toContain("audit_");

      // Close create modal
      await clickElement(
        findButtonByText(container, translate("common.cancel", locale)),
      );

      // 2. Rejected edit
      await clickElement(
        findButtonByText(
          container,
          translate("maintenance.action.edit", locale),
        ),
      );
      await setControlValue(
        findFieldControl<HTMLInputElement>(
          container,
          translate("maintenance.form.technician", locale),
        ),
        "Rejected Tech",
      );
      await clickElement(
        findButtonByText(
          container,
          translate("maintenance.form.saveChanges", locale),
        ),
      );

      expect(container.textContent).toContain(
        "Work order MNT-000501 cannot transition while bay is locked",
      );
      expect(container.textContent).toContain(
        translate("maintenance.toast.receipt", locale, {
          actionId: dash,
          auditId: dash,
        }),
      );
      expect(container.textContent).not.toContain(
        translate("maintenance.toast.updated", locale, { id: "MNT-000501" }),
      );
      expect(container.textContent).not.toContain("act_MNT-000501");
      expect(container.textContent).not.toContain("audit_MNT-000501");

      // Close edit modal
      await clickElement(
        findButtonByText(container, translate("common.cancel", locale)),
      );

      // 3. Rejected complete
      await clickElement(
        findButtonByText(
          container,
          translate("maintenance.action.complete", locale),
        ),
      );
      await clickElement(
        findButtonByText(
          container,
          translate("maintenance.confirm.action", locale),
        ),
      );

      expect(container.textContent).toContain(
        "Work order MNT-000501 cannot transition while bay is locked",
      );
      expect(container.textContent).toContain(
        translate("maintenance.toast.receipt", locale, {
          actionId: dash,
          auditId: dash,
        }),
      );
      expect(container.textContent).not.toContain(
        translate("maintenance.toast.completed", locale, { id: "MNT-000501" }),
      );
      expect(container.textContent).not.toContain("act_MNT-000501");
      expect(container.textContent).not.toContain("audit_MNT-000501");
    });
  },
);
