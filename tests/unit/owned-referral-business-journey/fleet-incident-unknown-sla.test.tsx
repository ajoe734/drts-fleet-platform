// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import * as canvas from "../../../packages/ui-web/src/index";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";
import { actualOriginalFlow } from "./fleet-incident-test-fixture";

vi.mock("typescript", async (importOriginal) => {
  const original = await importOriginal<{
    default: typeof import("typescript");
  }>();
  const compiler = original.default;
  return {
    ...original,
    default: {
      ...compiler,
      transpileModule: (
        source: string,
        options?: import("typescript").TranspileOptions,
      ) =>
        compiler.transpileModule(source, {
          ...options,
          fileName:
            process.env.C067_FROZEN_COMPILE_FILE === "backend"
              ? "frozen.ts"
              : "frozen.tsx",
          compilerOptions: {
            ...options?.compilerOptions,
            experimentalDecorators: true,
            emitDecoratorMetadata: false,
          },
        }),
    },
  };
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});
async function actualUi() {
  const flow = await actualOriginalFlow();
  const appRoot = resolve("apps/fleet-partner-portal-web");
  const getList = vi.fn(async (path: string) =>
    path.endsWith("/timeline")
      ? flow.fleet.getCaseTimeline(
          "unit-original-fleet-C067",
          flow.created.incidentId,
        )
      : flow.fleet.listCases("unit-original-fleet-C067"),
  );
  const get = vi.fn(async () =>
    flow.fleet.getCaseDetail(
      "unit-original-fleet-C067",
      flow.created.incidentId,
    ),
  );
  const load = createUiModuleLoader(appRoot, {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/ui-web": canvas,
    "server-only": {},
    "@/app/statements/actions": { submitStatementDecision: vi.fn() },
    "./api-client.server": {
      getServerFleetPartnerClient: async () => ({
        client: { getList, get },
        fleetPartnerId: "unit-original-fleet-C067",
      }),
    },
    "@/lib/server-locale": { getServerLocale: async () => "en" },
    "next/navigation": {
      useRouter: () => ({ refresh: vi.fn() }),
      notFound: () => {
        throw new Error("not_found");
      },
    },
  });
  const { LanguageProvider } = load<{
    LanguageProvider: React.ComponentType<{
      children: React.ReactNode;
      defaultLocale: "en";
    }>;
  }>(resolve(appRoot, "lib/i18n.tsx"));
  const { CasesTable } = load<{
    CasesTable: React.ComponentType<{
      rows: Array<{ id: string; sla: string }>;
    }>;
  }>(resolve(appRoot, "components/portal-tables.tsx"));
  const data = load<{
    loadCases: () => Promise<{ rows: Array<{ id: string; sla: string }> }>;
  }>(resolve(appRoot, "lib/fleet-portal-data.server.ts"));
  const page = load<{
    default: (props: {
      params: Promise<{ caseId: string }>;
    }) => Promise<React.ReactElement>;
  }>(resolve(appRoot, "app/cases/[caseId]/page.tsx")).default;
  const wrap = (element: React.ReactElement) =>
    render(<LanguageProvider defaultLocale="en">{element}</LanguageProvider>);
  return { flow, get, getList, CasesTable, data, page, wrap };
}

describe("C067 original Incident actual Fleet UI readback", () => {
  it("maps the real source's absent SLA to Unknown in the mounted list and links the exact original Incident", async () => {
    const h = await actualUi();
    const result = await h.data.loadCases();
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: h.flow.created.incidentId,
          sla: "unknown",
        }),
      ]),
    );
    h.wrap(<h.CasesTable rows={result.rows} />);
    const link = screen.getByRole("link", {
      name: h.flow.created.incidentId,
    });
    expect(link.getAttribute("href")).toBe(
      `/cases/${h.flow.created.incidentId}`,
    );
    const row = within(link.closest("tr")!);
    expect(row.getByText("Unknown", { exact: true })).toBeTruthy();
    expect(row.queryByText("On track", { exact: true })).toBeNull();
    expect(
      row.getByRole("link", { name: "Respond" }).getAttribute("href"),
    ).toBe(`/cases/${h.flow.created.incidentId}#case-reply-content`);
  });
  it("reloads the same original Incident detail with real timeline and unknown SLA, keeping the normal reply entry", async () => {
    const h = await actualUi();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (let reload = 0; reload < 2; reload++) {
      h.wrap(
        await h.page({
          params: Promise.resolve({ caseId: h.flow.created.incidentId }),
        }),
      );
      expect(
        screen.getAllByText("Unknown", { exact: true }).length,
      ).toBeGreaterThan(0);
      expect(screen.queryByText("on_track", { exact: true })).toBeNull();
      expect(
        screen.getByText("STATUS · API-owned").nextElementSibling?.textContent,
      ).toContain("Open");
      expect(
        screen.getByText("SLA DUE AT").nextElementSibling?.textContent,
      ).toBe("—");
      expect(
        screen.getByText("RELATED INCIDENT").nextElementSibling?.textContent,
      ).toBe(h.flow.created.incidentId);
      expect(
        screen.getByText("incident_created", { exact: true }),
      ).toBeTruthy();
      expect(
        screen.getByRole("textbox", { name: "Reply content" }),
      ).toBeTruthy();
      expect(fetch).not.toHaveBeenCalled();
      cleanup();
    }
    expect(h.get).toHaveBeenCalledTimes(2);
    expect(
      h.getList.mock.calls.filter(([path]) => path.endsWith("/timeline")),
    ).toHaveLength(2);
    vi.unstubAllGlobals();
  });
  it.each([
    ["open", "Open"],
    ["investigating", "Under investigation"],
    ["resolved", "Resolved"],
    ["closed", "Closed"],
  ])(
    "keeps the canonical Incident %s status and its readable list/detail label",
    async (status, label) => {
      const h = await actualUi();
      await h.flow.ops.updateIncident(h.flow.created.incidentId, {
        status,
        assignedTo: "unit-existing-ops-owner",
      });
      const rows = await h.data.loadCases();
      h.wrap(<h.CasesTable rows={rows.rows} />);
      const row = within(
        screen
          .getByRole("link", { name: h.flow.created.incidentId })
          .closest("tr")!,
      );
      expect(row.getByText(label, { exact: true })).toBeTruthy();
      cleanup();
      h.wrap(
        await h.page({
          params: Promise.resolve({ caseId: h.flow.created.incidentId }),
        }),
      );
      expect(
        screen.getByText("STATUS · API-owned").nextElementSibling?.textContent,
      ).toContain(label);
      expect(
        (await h.flow.ops.getIncident(h.flow.created.incidentId)).data.item,
      ).toMatchObject({ status, assignedTo: "unit-existing-ops-owner" });
    },
  );
});
